import { VercelRequest, VercelResponse } from '@vercel/node';
import { scanItems, queryItems, TABLES } from '../../lib/db';
import { allocateMonthlyCredits, getUser, updateUser } from '../../lib/userService';
import { recordCronRun } from '../../lib/cronRuns';

interface MonthlySummary {
  month: string; // YYYY-MM being summarized (the month that just ended)
  generatedAt: string;
  openingBalance: number;
  allocated: number;
  used: number;
  expired: number;
  closingBalance: number;
  subscriptionZar: number | null;
  nextChargeDate: string | null;
}

/**
 * Compute the previous calendar month's usage summary for a user from the
 * credit ledger. No email infra exists — the summary is stored on the user
 * record and surfaced honestly in the Billing UI.
 */
async function buildMonthlySummary(user: any): Promise<MonthlySummary> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const month = monthStart.toISOString().slice(0, 7);

  const txns = await queryItems<{ amount: number; createdAt: string; type: string }>(
    TABLES.CREDIT_TRANSACTIONS,
    { expression: 'userId = :uid', values: { ':uid': user.id } },
    { limit: 500, scanIndexForward: false }
  );

  let openingBalance = user.credits ?? 0;
  let allocated = 0;
  let used = 0;
  let expired = 0;

  const inMonth = txns.filter(t => {
    const ts = new Date(t.createdAt).getTime();
    return ts >= monthStart.getTime() && ts < monthEnd.getTime();
  });
  for (const t of inMonth) {
    if (t.amount > 0) allocated += t.amount;
    else if (t.type === 'expiration') expired += Math.abs(t.amount);
    else used += Math.abs(t.amount);
  }
  // Net the month's activity back from the closing balance to get the opening
  const closingBalance = user.credits ?? 0;
  openingBalance = closingBalance - allocated + used + expired;

  const sub = user.subscription;
  return {
    month,
    generatedAt: new Date().toISOString(),
    openingBalance,
    allocated,
    used,
    expired,
    closingBalance,
    subscriptionZar: sub?.status === 'ACTIVE' ? (sub.nextChargeAmount ?? null) : null,
    nextChargeDate: sub?.status === 'ACTIVE' ? (sub.currentPeriodEnd ?? null) : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow Vercel cron or manual trigger with secret
  // NOTE: Vercel Cron sends GET requests — accept GET or POST.
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authorization
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow Vercel cron (no auth header)
    if (!req.headers['x-vercel-cron']) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('Starting monthly credit allocation...');
  const started = Date.now();

  try {
    // Get all users with active subscriptions
    const users = await scanItems<any>(TABLES.USERS);
    let allocated = 0;
    let summariesWritten = 0;
    let errors: string[] = [];

    for (const user of users) {
      // ── Monthly usage summary — computed for every user with ledger
      // activity last month (not just subscribers) ──────────────────────
      try {
        const summary = await buildMonthlySummary(user);
        if (summary.allocated > 0 || summary.used > 0 || summary.expired > 0) {
          await updateUser(user.id, { monthlySummary: summary });
          summariesWritten++;
        }
      } catch (sumErr) {
        console.error(`Monthly summary failed for user ${user.id} (non-fatal):`, sumErr);
      }

      if (!user.subscription || user.subscription.status !== 'ACTIVE') {
        continue;
      }

      try {
        const result = await allocateMonthlyCredits(user.id);
        if (result) {
          allocated += result.allocated;
          console.log(`Allocated ${result.allocated} credits to user ${user.id} (${user.email})`);
        }
      } catch (err) {
        errors.push(`User ${user.id}: ${err}`);
        console.error(`Failed to allocate credits to user ${user.id}:`, err);
      }
    }

    console.log(`Monthly credit allocation complete: ${allocated} credits allocated, ${summariesWritten} summaries written`);

    await recordCronRun('allocate-monthly-credits', 'success', Date.now() - started, `allocated=${allocated} summaries=${summariesWritten} errors=${errors.length}`);

    return res.status(200).json({
      success: true,
      allocated,
      summaries_written: summariesWritten,
      users_processed: users.filter(u => u.subscription?.status === 'ACTIVE').length,
      errors_count: errors.length,
      errors: errors.slice(0, 10), // First 10 errors
    });
  } catch (error) {
    console.error('Monthly credit allocation error:', error);
    await recordCronRun('allocate-monthly-credits', 'error', Date.now() - started, String((error as any)?.message || error));
    return res.status(500).json({ error: 'Allocation failed' });
  }
}
