import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPaystackSignature } from '../../lib/paystack';
import { addCredits, createSubscription, getUser, allocateMonthlyCredits } from '../../lib/userService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    const signature = req.headers['x-paystack-signature'] as string;

    // Verify webhook signature
    if (!signature || !verifyPaystackSignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = payload.event;

    // Handle successful payment (credit purchase)
    if (event === 'charge.success') {
      const data = payload.data;
      const email = data.customer_email;
      const amount = Math.round(data.amount / 100); // Convert from kobo to Rand
      const reference = data.reference;

      console.log(`Processing charge.success for ${email}: ${amount} credits`);

      // Extract user_id from metadata if available, otherwise find by email
      let userId = payload.data.metadata?.user_id;
      if (!userId) {
        const user = await getUserByEmail(email);
        userId = user?.id;
      }

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true }); // Acknowledge to prevent retries
      }

      // Add credits
      await addCredits(
        userId,
        amount,
        'purchase',
        `Credit purchase: R${amount}`,
        { paystackReference: reference },
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year expiry
      );

      return res.status(200).json({
        success: true,
        credits_added: amount,
        reference,
      });
    }

    // Handle subscription creation
    if (event === 'subscription.create') {
      const data = payload.data;
      const email = data.customer.email;
      const planCode = data.plan.code;

      console.log(`Processing subscription.create for ${email}: ${planCode}`);

      // Map Paystack plan code to our plan ID. Real codes come from env
      // (PAYSTACK_PLAN_<PLAN>_<CYCLE>); legacy generated names kept as fallback.
      const planMapping: Record<string, { id: string; cycle: 'MONTHLY' | 'ANNUAL' }> = {};
      (['STARTER', 'PROFESSIONAL', 'PREMIUM', 'AGENCY'] as const).forEach(p => {
        (['MONTHLY', 'ANNUAL'] as const).forEach(c => {
          const code = process.env[`PAYSTACK_PLAN_${p}_${c}`];
          if (code) planMapping[code] = { id: p, cycle: c };
        });
      });
      planMapping['PLN_starter_monthly'] = { id: 'STARTER', cycle: 'MONTHLY' };
      planMapping['PLN_starter_annual'] = { id: 'STARTER', cycle: 'ANNUAL' };
      planMapping['PLN_professional_monthly'] = { id: 'PROFESSIONAL', cycle: 'MONTHLY' };
      planMapping['PLN_professional_annual'] = { id: 'PROFESSIONAL', cycle: 'ANNUAL' };
      planMapping['PLN_premium_monthly'] = { id: 'PREMIUM', cycle: 'MONTHLY' };
      planMapping['PLN_premium_annual'] = { id: 'PREMIUM', cycle: 'ANNUAL' };
      planMapping['PLN_agency_monthly'] = { id: 'AGENCY', cycle: 'MONTHLY' };
      planMapping['PLN_agency_annual'] = { id: 'AGENCY', cycle: 'ANNUAL' };

      const planInfo = planMapping[planCode];
      if (!planInfo) {
        console.error(`Unknown plan code: ${planCode}`);
        return res.status(200).json({ received: true });
      }

      // Find user by email in our users table
      let userId: string | undefined;

      const user = await getUserByEmail(email);
      userId = user?.id;

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true });
      }

      // Create subscription in DynamoDB
      await createSubscription(
        userId,
        planInfo.id,
        planInfo.cycle,
        data.subscription_code,
        data.customer_code
      );

      return res.status(200).json({
        success: true,
        event: 'subscription.create',
        plan: planInfo.id,
      });
    }

    // Handle subscription renewal
    if (event === 'subscription.renewal') {
      const data = payload.data;
      const email = data.customer.email;

      // Find user by email in our users table
      let userId: string | undefined;

      const user = await getUserByEmail(email);
      userId = user?.id;

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true });
      }

      // Allocate monthly credits (this also extends the period)
      const result = await allocateMonthlyCredits(userId);

      return res.status(200).json({
        success: true,
        event: 'subscription.renewal',
        credits_allocated: result?.allocated || 0,
      });
    }

    // Handle subscription cancellation
    if (event === 'subscription.disable') {
      const data = payload.data;
      const email = data.customer.email;

      // Find user by email in our users table
      let userId: string | undefined;

      const user = await getUserByEmail(email);
      userId = user?.id;

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true });
      }

      // Cancel subscription in DynamoDB
      await cancelSubscription(userId);

      return res.status(200).json({
        success: true,
        event: 'subscription.disable',
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// Helper functions (users table has no GSIs on email/supabaseUserId,
// so non-key lookups scan with a filter)
async function getUserByEmail(email: string) {
  const { scanItems, TABLES } = await import('../../lib/db');
  const users = await scanItems<any>(TABLES.USERS, {
    filter: {
      expression: 'email = :email',
      values: { ':email': (email || '').toLowerCase() },
    },
    limit: 1,
  });
  return users[0] || null;
}

async function cancelSubscription(userId: string) {
  const { getUser, updateUser } = await import('../../lib/userService');
  const user = await getUser(userId);
  if (!user || !user.subscription) return;
  await updateUser(userId, {
    subscription: { ...user.subscription, status: 'CANCELLED' as const },
  });
}
