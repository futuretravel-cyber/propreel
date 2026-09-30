import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, deductCredits, addCredits } from '../../lib/userService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from_user_id, to_user_id, amount, reason } = req.body;

    if (!from_user_id || !to_user_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    if (from_user_id === to_user_id) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    // Get both users
    const fromUser = await getUser(from_user_id);
    const toUser = await getUser(to_user_id);

    if (!fromUser) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    if (!toUser) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Check sender has enough credits
    if (fromUser.credits < amount) {
      return res.status(400).json({
        error: 'Insufficient credits',
        current_balance: fromUser.credits,
        required: amount,
      });
    }

    // Deduct from sender
    const deductResult = await deductCredits(from_user_id, amount, reason || 'Credit transfer');
    if (!deductResult.success) {
      return res.status(400).json({ error: deductResult.error });
    }

    // Add to recipient
    await addCredits(to_user_id, amount, 'gift', reason || 'Credit transfer from ' + fromUser.email);

    return res.status(200).json({
      success: true,
      from_user: {
        id: from_user_id,
        new_balance: deductResult.newBalance,
      },
      to_user: {
        id: to_user_id,
        new_balance: toUser.credits + amount,
      },
      amount,
      reason,
    });
  } catch (error) {
    console.error('Credit transfer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
