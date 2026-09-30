import { VercelRequest, VercelResponse } from '@vercel/node';
import { addCredits } from '../../lib/userService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, amount, source, description, metadata, expires_at } = req.body;

    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    if (!source || !['purchase', 'bonus', 'gift', 'refund', 'subscription'].includes(source)) {
      return res.status(400).json({ error: 'Invalid source type' });
    }

    const result = await addCredits(
      user_id,
      amount,
      source,
      description || 'Credit addition',
      metadata,
      expires_at
    );

    return res.status(200).json({
      success: true,
      new_balance: result.newBalance,
      added: amount,
      source,
    });
  } catch (error) {
    console.error('Credit addition error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
