import { VercelRequest, VercelResponse } from '@vercel/node';
import { processExpiredCredits } from '../../lib/userService';
import { recordCronRun } from '../../lib/cronRuns';
import { reapStaleProjects } from '../../lib/projectReaper';
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

  // Verify authorization
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (!req.headers['x-vercel-cron']) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('Starting expired credits processing...');
  const started = Date.now();

  try {
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

    await recordCronRun(
      'process-expired-credits',
      'success',
      Date.now() - started,
      `processed=${result.processed} expiredCredits=${result.expiredAmount} ${reapSummary} ${topupSummary} ${dunningSummary}`
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

    return res.status(200).json({
      success: true,
      processed: result.processed,
      expired_amount: result.expiredAmount,
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
    });
  } catch (error) {
    console.error('Expired credits processing error:', error);
    await recordCronRun('process-expired-credits', 'error', Date.now() - started, String((error as any)?.message || error));
    return res.status(500).json({ error: 'Processing failed' });
  }
}
