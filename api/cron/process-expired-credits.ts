import { VercelRequest, VercelResponse } from '@vercel/node';
import { processExpiredCredits } from '../../lib/userService';

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

  try {
    const result = await processExpiredCredits();

    console.log(`Expired credits processing complete: ${result.processed} users, ${result.expiredAmount} credits expired`);

    return res.status(200).json({
      success: true,
      processed: result.processed,
      expired_amount: result.expiredAmount,
    });
  } catch (error) {
    console.error('Expired credits processing error:', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
}
