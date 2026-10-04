import { VercelRequest, VercelResponse } from '@vercel/node';
import { recordCronRun } from '../../lib/cronRuns';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow Vercel cron or manual trigger with secret
  // NOTE: Vercel Cron sends GET requests — accept GET or POST.
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (!req.headers['x-vercel-cron']) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('Expiry notifications job started...');
  const started = Date.now();

  // Daily 9am: one "days left on your trial" email per temporary account per
  // UTC day (sendTrialReminders dedupes via trialLastReminderDate and skips
  // subscribed / opted-out / already-expired users).
  let summary = 'trialError';
  let sent = 0;
  try {
    const { sendTrialReminders } = await import('../../lib/trial');
    const r = await sendTrialReminders();
    sent = r.sent;
    summary = `scanned=${r.scanned} sent=${r.sent} skipped=${r.skipped} failed=${r.failed}`;
  } catch (e) {
    console.error('Trial reminders failed (non-fatal):', e);
    summary = `trialError=${String((e as any)?.message || e).slice(0, 120)}`;
  }

  await recordCronRun('send-expiry-notifications', 'success', Date.now() - started, summary);

  return res.status(200).json({
    success: true,
    message: 'Trial reminder emails processed',
    sent,
    detail: summary,
  });
}
