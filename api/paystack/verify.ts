import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPayment } from '../../lib/paystack';
import { getUser } from '../../lib/userService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    // Verify with Paystack
    const result = await verifyPayment(reference);

    if (!result.data || result.data.status !== 'success') {
      return res.status(400).json({
        success: false,
        error: 'Payment not verified',
      });
    }

    // Extract credit amount from metadata
    const amount = Math.round((result.data.amount || 0) / 100); // Convert from kobo
    const email = result.data.customer_email;

    // Find user by email
    let userId: string | undefined;

    // Try Supabase auth first
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: authUser } = await supabase.auth.getUserByEmail(email);
      if (authUser?.id) {
        const { getUserBySupabaseId } = await import('../../lib/userService');
        const dbUser = await getUserBySupabaseId(authUser.id);
        userId = dbUser?.id;
      }
    } catch (e) {
      console.error('Supabase auth lookup failed:', e);
    }

    // Fallback: find by email in our users table
    if (!userId) {
      const { getUserByEmail } = await import('../../lib/userService');
      const user = await getUserByEmail(email);
      userId = user?.id;
    }

    if (!userId) {
      return res.status(200).json({
        success: false,
        error: 'User not found',
        reference,
      });
    }

    // Add credits
    const { addCredits } = await import('../../lib/userService');
    await addCredits(
      userId,
      amount,
      'purchase',
      `Credit purchase: R${amount}`,
      { paystackReference: reference, paystackTransactionCode: result.data.transaction_code },
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    );

    const user = await getUser(userId!);

    return res.status(200).json({
      success: true,
      reference,
      credits_added: amount,
      new_balance: user?.credits || 0,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
}
