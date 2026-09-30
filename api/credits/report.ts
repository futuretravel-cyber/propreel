import { VercelRequest, VercelResponse } from '@vercel/node';
import { getCreditReport } from '../../lib/userService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = req.query.user_id as string;
    const period = req.query.period as string || '30d';

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const days = parseInt(period) || 30;

    const report = await getCreditReport(userId, days);

    return res.status(200).json({
      success: true,
      period,
      current_balance: report.currentBalance,
      total_credits_used: report.totalUsed,
      total_credits_purchased: report.totalPurchased,
      transaction_count: report.transactions.length,
      transactions: report.transactions.slice(0, 20),
    });
  } catch (error) {
    console.error('Credit report error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
