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

    // Find user by email in our users table (webhook-style local lookup;
    // supabase-js v2 has no auth.admin.getUserByEmail on GoTrueAdminApi)
    let userId: string | undefined;
    {
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

    // Idempotency: the charge.success webhook also credits this reference —
    // credit exactly once per Paystack reference.
    const { getItem, putItem, TABLES } = await import('../../lib/db');
    const markerId = `pay_${reference}`;
    const already = await getItem<{ id: string; userId: string }>(TABLES.SETTINGS, { id: markerId });
    if (already) {
      const user = await getUser(userId);
      return res.status(200).json({
        success: true,
        already_processed: true,
        reference,
        credits_added: 0,
        new_balance: user?.credits || 0,
      });
    }
    await putItem(TABLES.SETTINGS, { id: markerId, userId, type: 'payment_processed', createdAt: new Date().toISOString() });

    // Add credits — eventId (Paystack's unique data.id) makes the ledger row
    // idempotent, mirroring the webhook path.
    const eventId = result.data.id != null ? `ps_${result.data.id}` : undefined;
    const { addCredits } = await import('../../lib/userService');
    const addResult = await addCredits(
      userId,
      amount,
      'purchase',
      `Credit purchase: R${amount}`,
      { paystackReference: reference, paystackTransactionCode: result.data.transaction_code, via: 'verify' },
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      eventId
    );
    if (addResult.duplicated) {
      const user = await getUser(userId);
      return res.status(200).json({
        success: true,
        already_processed: true,
        reference,
        credits_added: 0,
        new_balance: user?.credits || 0,
      });
    }

    // Capture the card authorization for auto-topup / dunning retries, and
    // clear any dunning state (payment recovered via hosted checkout).
    const authCode = result.data.authorization?.authorization_code;
    if (authCode) {
      try {
        const { updateUser } = await import('../../lib/userService');
        await updateUser(userId, {
          paystackAuthorizationCode: authCode,
          paymentFailure: undefined,
        } as any);
      } catch (authErr) {
        console.error('Auth code capture failed (non-fatal):', authErr);
      }
    }

    // SA tax invoice PDF → S3 (never blocks the response)
    try {
      const { generateInvoicePdf } = await import('../../lib/invoice');
      const payer = await getUser(userId!);
      await generateInvoicePdf({
        reference,
        userName: payer?.fullName || '',
        userEmail: payer?.email || email || '',
        amountZar: amount,
        credits: amount,
        description: `PropReel credit top-up (${amount} credits)`,
        paidAt: new Date().toISOString(),
        userId,
      });
    } catch (invErr) {
      console.error('Invoice generation failed (non-fatal):', invErr);
    }

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
