import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser } from '../../lib/userService';
import { initializePayment } from '../../lib/paystack';

/**
 * Initialize a Paystack credit purchase.
 * Looks the user up in DynamoDB (source of truth) and returns the
 * Paystack authorization_url for hosted checkout.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, credits, email, pool } = req.body;

    // Validate input
    if (!user_id || !credits || credits < 50 || !email) {
      return res.status(400).json({
        error: 'Invalid request. Minimum purchase is 50 credits (R50).'
      });
    }

    // Get user from DynamoDB (source of truth for accounts)
    const user = await getUser(user_id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify email matches
    if (user.email !== String(email).toLowerCase()) {
      return res.status(400).json({ error: 'Email does not match user account' });
    }

    // Initialize Paystack payment
    const paymentData = await initializePayment(email, credits, {
      user_id,
      credits,
      // 'agency_pool' purchases land in the shared agency pool on charge.success
      type: pool === 'agency' ? 'agency_pool_purchase' : 'credit_purchase',
      pool: pool === 'agency' ? 'agency' : 'personal',
    });

    return res.status(200).json({
      success: true,
      authorization_url: paymentData.data.authorization_url,
      access_code: paymentData.data.access_code,
      reference: paymentData.data.reference
    });

  } catch (error) {
    console.error('Payment initialization error:', error);
    return res.status(500).json({ error: 'Failed to initialize payment' });
  }
}
