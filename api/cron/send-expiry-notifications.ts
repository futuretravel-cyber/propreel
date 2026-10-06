import { VercelRequest, VercelResponse } from '@vercel/node';
import { recordCronRun } from '../../lib/cronRuns';
import { TABLES } from '../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow Vercel cron or manual trigger with secret
  // NOTE: Vercel Cron sends GET requests — accept GET or POST.
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

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

  console.log('Expiry notifications job started...');
  const started = Date.now();

  // Run lock: one successful run per UTC day — a leaked or replicated
  // CRON_SECRET (it once sat in .env.example) can never re-trigger the
  // reminder sweep. Keyed on the date, so a stuck lock only skips the
  // remainder of today (the schedule is once daily anyway).
  const runLockId = `cronlock_notify_${new Date().toISOString().slice(0, 10)}`;
  const { putItemIfNotExists } = await import('../../lib/db');
  const claimedRun = await putItemIfNotExists(TABLES.SETTINGS, {
    id: runLockId,
    type: 'cron_lock',
    createdAt: new Date().toISOString(),
  });
  if (!claimedRun) {
    return res.status(200).json({ success: true, skipped: true, reason: 'already ran today' });
  }

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
