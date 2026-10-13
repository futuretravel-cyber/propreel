import { VercelRequest, VercelResponse } from '@vercel/node';
import { processExpiredCredits } from '../../lib/userService';
import { recordCronRun } from '../../lib/cronRuns';
import { reapStaleProjects } from '../../lib/projectReaper';
import { purgeExpiredMedia, RETENTION_DAYS } from '../../lib/mediaRetention';
import { runAutoTopupSweep, AutoTopupOutcome } from '../../lib/autoTopup';
import { runDunningSweep, DunningOutcome } from '../../lib/dunning';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow Vercel cron or manual trigger with secret
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  // Vercel Cron sends GET requests — accept GET or POST.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authorization. Vercel Cron sends `Authorization: Bearer
  // ${CRON_SECRET}` automatically when the env var is set. The old
  // `x-vercel-cron` header fallback was client-spoofable and the check was
  // skipped entirely when the secret was unset — fail closed now.
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET is not configured' });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Starting expired credits processing...');
  const started = Date.now();

  // Run lock: one successful sweep per UTC day — a leaked or replicated
  // CRON_SECRET (it once sat in .env.example) or a scheduler double-fire
  // can never re-run the destructive sweeps twice. Released on failure below.
  const runLockId = `cronlock_exp_${new Date().toISOString().slice(0, 10)}`;
  let claimedRun = false;

  try {
    const { putItemIfNotExists, TABLES } = await import('../../lib/db');
    claimedRun = await putItemIfNotExists(TABLES.SETTINGS, {
      id: runLockId,
      type: 'cron_lock',
      createdAt: new Date().toISOString(),
    });
    if (!claimedRun) {
      return res.status(200).json({ success: true, skipped: true, reason: 'already ran today' });
    }

    const result = await processExpiredCredits();

    // Same nightly slot: reconcile renders abandoned mid-flight (browser died
    // while a job was processing) — finalize completed jobs, refund failures.
    let reapSummary = 'reapError';
    let reap: Awaited<ReturnType<typeof reapStaleProjects>> | null = null;
    try {
      reap = await reapStaleProjects();
      reapSummary = `reaped=${reap.stale} refunded=${reap.refundedJobs} finalized=${reap.completedJobs} skipped=${reap.skipped}`;
    } catch (reapErr) {
      console.error('Project reaper failed (non-fatal):', reapErr);
      reapSummary = `reapError=${String((reapErr as any)?.message || reapErr).slice(0, 120)}`;
    }

    // Same nightly slot: auto-recharge users below their configured threshold.
    let topup: AutoTopupOutcome[] = [];
    let topupSummary = 'topupError';
    try {
      topup = await runAutoTopupSweep();
      topupSummary = `checked=${topup.length} charged=${topup.filter(o => o.action === 'charged').length} checkout=${topup.filter(o => o.action === 'checkout_required').length} failed=${topup.filter(o => o.action === 'failed').length}`;
    } catch (topupErr) {
      console.error('Auto-topup sweep failed (non-fatal):', topupErr);
      topupSummary = `topupError=${String((topupErr as any)?.message || topupErr).slice(0, 120)}`;
    }

    // Same nightly slot: dunning — retry saved cards day 1/3/7/14, log
    // reminder "emails", downgrade at day 21.
    let dunning: DunningOutcome[] = [];
    let dunningSummary = 'dunningError';
    try {
      dunning = await runDunningSweep();
      dunningSummary = `tracked=${dunning.length} recovered=${dunning.filter(o => o.action === 'recovered').length} downgraded=${dunning.filter(o => o.action === 'downgraded').length} failed=${dunning.filter(o => o.action === 'failed').length}`;
    } catch (dunningErr) {
      console.error('Dunning sweep failed (non-fatal):', dunningErr);
      dunningSummary = `dunningError=${String((dunningErr as any)?.message || dunningErr).slice(0, 120)}`;
    }

    // Same nightly slot: 30-day media retention — permanently delete every
    // user media object in S3 (videos, thumbnails, edited images, uploads)
    // that has outlived RETENTION_DAYS. The UI promises this (RETENTION_NOTICE).
    let mediaSummary = 'mediaError';
    let media: Awaited<ReturnType<typeof purgeExpiredMedia>> | null = null;
    try {
      media = await purgeExpiredMedia(RETENTION_DAYS);
      mediaSummary = `mediaScanned=${media.scanned} mediaDeleted=${media.deleted} mediaErrors=${media.errors}`;
    } catch (mediaErr) {
      console.error('Media retention purge failed (non-fatal):', mediaErr);
      mediaSummary = `mediaError=${String((mediaErr as any)?.message || mediaErr).slice(0, 120)}`;
    }

    // Same nightly slot: temporary (trial) accounts — soft-delete trials that
    // hit day 7 without subscribing, convert stray trial fields on subscribed
    // users, and purge rows whose trial expired >30 days ago (no subscription).
    let trialSummary = 'trialError';
    try {
      const { runTrialSweep } = await import('../../lib/trial');
      const trial = await runTrialSweep();
      trialSummary = `trialSoftDeleted=${trial.softDeleted} trialPurged=${trial.purged} trialEndedEmails=${trial.endedEmails} trialConverted=${trial.converted} trialErrors=${trial.errors}`;
    } catch (trialErr) {
      console.error('Trial sweep failed (non-fatal):', trialErr);
      trialSummary = `trialError=${String((trialErr as any)?.message || trialErr).slice(0, 120)}`;
    }

    // Same nightly slot: upcoming-billing notices — ACTIVE subscribers whose
    // next Paystack cycle charge is ≤3 days away are emailed once per cycle.
    let billingSummary = 'billingNoticeError';
    let billing: Awaited<ReturnType<typeof import('../../lib/billingNotice').runBillingNoticeSweep>> | null = null;
    try {
      const { runBillingNoticeSweep } = await import('../../lib/billingNotice');
      billing = await runBillingNoticeSweep();
      billingSummary = `billingEmailed=${billing.filter(o => o.action === 'emailed').length} billingSkipped=${billing.filter(o => o.action !== 'emailed').length}`;
    } catch (billingErr) {
      console.error('Billing-notice sweep failed (non-fatal):', billingErr);
      billingSummary = `billingNoticeError=${String((billingErr as any)?.message || billingErr).slice(0, 120)}`;
    }

    await recordCronRun(
      'process-expired-credits',
      'success',
      Date.now() - started,
      `processed=${result.processed} expiredCredits=${result.expiredAmount} ${reapSummary} ${topupSummary} ${dunningSummary} ${mediaSummary} ${trialSummary} ${billingSummary}`
    );

    console.log(`Expired credits processing complete: ${result.processed} users, ${result.expiredAmount} credits expired; reaper: ${reapSummary}; topup: ${topupSummary}; dunning: ${dunningSummary}`);
    if (reap && reap.details.length) {
      for (const d of reap.details) console.log(`  reaper: ${d}`);
    }
    for (const t of topup) {
      if (t.action !== 'skipped') console.log(`  topup: ${t.email} ${t.action}${t.detail ? ` — ${t.detail}` : ''}`);
    }
    for (const d of dunning) {
      if (d.action !== 'ok') console.log(`  dunning: ${d.email} ${d.action}${d.detail ? ` — ${d.detail}` : ''}`);
    }
    for (const b of billing ?? []) {
      if (b.action !== 'skipped_recent') console.log(`  billing-notice: ${b.email} ${b.action}${b.detail ? ` — ${b.detail}` : ''}`);
    }

    return res.status(200).json({
      success: true,
      processed: result.processed,
      expired_amount: result.expiredAmount,
      trial_sweep: trialSummary,
      reaper: reap ? {
        stale: reap.stale,
        refunded: reap.refundedJobs,
        finalized: reap.completedJobs,
        skipped: reap.skipped,
        details: reap.details,
      } : null,
      auto_topup: {
        checked: topup.length,
        charged: topup.filter(o => o.action === 'charged').length,
        checkout_required: topup.filter(o => o.action === 'checkout_required').length,
        failed: topup.filter(o => o.action === 'failed').length,
        outcomes: topup,
      },
      dunning: {
        tracked: dunning.length,
        recovered: dunning.filter(o => o.action === 'recovered').length,
        downgraded: dunning.filter(o => o.action === 'downgraded').length,
        failed: dunning.filter(o => o.action === 'failed').length,
        outcomes: dunning,
      },
      media_retention: media ? {
        retention_days: RETENTION_DAYS,
        scanned: media.scanned,
        deleted: media.deleted,
        errors: media.errors,
        cutoff: media.cutoff,
      } : null,
    });
  } catch (error) {
    console.error('Expired credits processing error:', error);
    // Release the run lock so the next attempt can retry a failed sweep.
    if (claimedRun) {
      try {
        const { deleteItem, TABLES } = await import('../../lib/db');
        await deleteItem(TABLES.SETTINGS, { id: runLockId });
      } catch { /* best effort */ }
    }
    await recordCronRun('process-expired-credits', 'error', Date.now() - started, String((error as any)?.message || error));
    return res.status(500).json({ error: 'Processing failed' });
  }
}
