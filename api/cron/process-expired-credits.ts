import { VercelRequest, VercelResponse } from '@vercel/node';
import { processExpiredCredits } from '../../lib/userService';
import { recordCronRun } from '../../lib/cronRuns';
import { reapStaleProjects } from '../../lib/projectReaper';

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

    await recordCronRun(
      'process-expired-credits',
      'success',
      Date.now() - started,
      `processed=${result.processed} expiredCredits=${result.expiredAmount} ${reapSummary}`
    );

    console.log(`Expired credits processing complete: ${result.processed} users, ${result.expiredAmount} credits expired; reaper: ${reapSummary}`);
    if (reap && reap.details.length) {
      for (const d of reap.details) console.log(`  reaper: ${d}`);
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
    });
  } catch (error) {
    console.error('Expired credits processing error:', error);
    await recordCronRun('process-expired-credits', 'error', Date.now() - started, String((error as any)?.message || error));
    return res.status(500).json({ error: 'Processing failed' });
  }
}
