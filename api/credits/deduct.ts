import { VercelRequest, VercelResponse } from '@vercel/node';
import { deductCredits } from '../../lib/userService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, amount, reason, metadata } = req.body;

    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const result = await deductCredits(user_id, amount, reason || 'Credit deduction', metadata);

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Failed to deduct credits',
        current_balance: result.newBalance,
      });
    }

    return res.status(200).json({
      success: true,
      new_balance: result.newBalance,
      deducted: amount,
      reason,
    });
  } catch (error) {
    console.error('Credit deduction error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
