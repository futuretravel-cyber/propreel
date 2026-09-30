import { VercelRequest, VercelResponse } from '@vercel/node';
import { scanItems, TABLES } from '../../lib/db';
import { allocateMonthlyCredits, getUser } from '../../lib/userService';

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

  try {
    // Get all users with active subscriptions
    const users = await scanItems<any>(TABLES.USERS);
    let allocated = 0;
    let errors: string[] = [];

    for (const user of users) {
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

    console.log(`Monthly credit allocation complete: ${allocated} credits allocated`);

    return res.status(200).json({
      success: true,
      allocated,
      users_processed: users.filter(u => u.subscription?.status === 'ACTIVE').length,
      errors_count: errors.length,
      errors: errors.slice(0, 10), // First 10 errors
    });
  } catch (error) {
    console.error('Monthly credit allocation error:', error);
    return res.status(500).json({ error: 'Allocation failed' });
  }
}
