import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { initializePayment } from '../../lib/paystack';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, credits, email } = req.body;

    // Validate input
    if (!user_id || !credits || credits < 50 || !email) {
      return res.status(400).json({ 
        error: 'Invalid request. Minimum purchase is 50 credits (R50).' 
      });
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify email matches
    if (user.email !== email) {
      return res.status(400).json({ error: 'Email does not match user account' });
    }

    // Initialize Paystack payment
    const paymentData = await initializePayment(email, credits, {
      user_id,
      credits,
      type: 'credit_purchase'
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
