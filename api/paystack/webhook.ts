import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPaystackSignature } from '../../lib/paystack';
import { addCredits, createSubscription, getUser, allocateMonthlyCredits, updateUser } from '../../lib/userService';
import { generateInvoicePdf } from '../../lib/invoice';

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

      // ── Prorated plan upgrades (saved-card + hosted-checkout) ──────────
      // Upgrade payments must NOT fall through to the generic credit-purchase
      // path below — that would top up credits with the plan-difference money.
      const upgradeKind = data.metadata?.type;
      if (upgradeKind === 'plan_upgrade' || upgradeKind === 'plan_upgrade_checkout') {
        const targetPlan = data.metadata.to_plan as string;
        const targetCycle = (data.metadata.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') as 'MONTHLY' | 'ANNUAL';

        // Atomic marker: duplicate webhook deliveries and the /verify endpoint
        // can never apply the same upgrade payment twice.
        const { markUpgradePaid, applyPendingUpgrade } = await import('../../lib/userService');
        const consumed = await markUpgradePaid(reference, userId);
        if (!consumed) {
          console.log(`Webhook: upgrade ${reference} already applied — skipping`);
          return res.status(200).json({ success: true, already_processed: true, reference });
        }

        const payer = await getUser(userId);
        if (payer?.subscription) {
          try {
            const result = await applyPendingUpgrade(payer, targetPlan, targetCycle);
            console.log(`Webhook: plan upgrade applied for ${payer.email} → ${targetPlan} (R${result.chargedZar} prorated, +${result.creditsAllocated} credits)`);
          } catch (upErr) {
            console.error('Upgrade application failed (payment captured):', upErr);
          }
        }

        // Capture the card authorization + clear dunning (recovered payment)
        const authCode = data.authorization?.authorization_code;
        if (authCode) {
          try {
            await updateUser(userId, {
              paystackAuthorizationCode: authCode,
              paymentFailure: undefined,
              pendingPlanUpgrade: undefined,
            } as any);
          } catch (authErr) {
            console.error('Auth code capture failed (non-fatal):', authErr);
          }
        }

        return res.status(200).json({ success: true, plan_upgrade_applied: true, reference });
      }

      // Idempotency: the client may also call /api/paystack/verify for this
      // reference — credit exactly once per Paystack reference.
      const { getItem, putItem, TABLES: T } = await import('../../lib/db');
      const markerId = `pay_${reference}`;
      const already = await getItem<{ id: string; userId: string }>(T.SETTINGS, { id: markerId });
      if (already) {
        console.log(`Webhook: reference ${reference} already credited (via ${already.userId === userId ? 'webhook' : 'verify'}) — skipping`);
        return res.status(200).json({ success: true, already_processed: true, reference });
      }
      await putItem(T.SETTINGS, { id: markerId, userId, type: 'payment_processed', createdAt: new Date().toISOString() });

      // Agency-pool purchases (type 'agency_pool_purchase') land in the
      // shared agency pool instead of the personal balance.
      const isPoolPurchase = data.metadata?.type === 'agency_pool_purchase';

      // Add credits — eventId (Paystack's unique data.id) makes the ledger
      // row itself idempotent, so duplicate/re-delivered webhooks (and
      // renewals sharing a reference pattern) can never double-credit.
      const eventId = data.id != null ? `ps_${data.id}` : undefined;
      let addResult: Awaited<ReturnType<typeof addCredits>>;
      if (isPoolPurchase) {
        const { addAgencyPoolCredits } = await import('../../lib/userService');
        const newPool = await addAgencyPoolCredits(
          userId,
          amount,
          `Agency pool top-up: R${amount}`,
          { paystackReference: reference, paystackEventId: data.id ?? null, channel: data.channel }
        );
        addResult = { success: true, newBalance: newPool };
      } else {
        addResult = await addCredits(
          userId,
          amount,
          'purchase',
          `Credit purchase: R${amount}`,
          { paystackReference: reference, paystackEventId: data.id ?? null, channel: data.channel },
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year expiry
          eventId
        );
      }
      if (addResult.duplicated) {
        console.log(`Webhook: eventId ${eventId} already credited — balance untouched`);
        return res.status(200).json({ success: true, already_processed: true, reference });
      }

      // Capture the card authorization for auto-topup / dunning retries
      const authCode = data.authorization?.authorization_code;
      if (authCode) {
        try {
          const { updateUser } = await import('../../lib/userService');
          await updateUser(userId, {
            paystackAuthorizationCode: authCode,
            paymentFailure: undefined,
          } as any);
          console.log(`Webhook: saved card authorization for user ${userId}`);
        } catch (authErr) {
          console.error('Auth code capture failed (non-fatal):', authErr);
        }
      }

      // SA tax invoice PDF → S3 (never blocks crediting)
      try {
        const payer = await getUser(userId);
        await generateInvoicePdf({
          reference,
          userName: payer?.fullName || '',
          userEmail: payer?.email || '',
          amountZar: amount,
          credits: amount,
          description: `PropReel credit top-up (${amount} credits)`,
          paidAt: new Date().toISOString(),
          userId,
        });
      } catch (invErr) {
        console.error('Invoice generation failed (non-fatal):', invErr);
      }

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

      // SA tax invoice for the renewal charge — the amount the customer was
      // actually billed lives on the transaction Paystack references in the
      // payload; fall back to the plan's nextChargeAmount.
      try {
        let renewalZar: number | undefined;
        const renewalRef: string | undefined = data.transaction?.reference || data.reference;
        if (renewalRef) {
          const { getTransaction } = await import('../../lib/paystack');
          const tx = await getTransaction(renewalRef);
          if (tx?.data?.amount) renewalZar = Math.round(tx.data.amount / 100);
        }
        if (!renewalZar) renewalZar = user?.subscription?.nextChargeAmount;
        if (renewalZar) {
          const payer = await getUser(userId);
          await generateInvoicePdf({
            reference: renewalRef || `renewal_${data.subscription_code || userId}`,
            userName: payer?.fullName || '',
            userEmail: payer?.email || email,
            amountZar: renewalZar,
            description: `PropReel subscription renewal — ${user?.subscription?.planId || ''} (${user?.subscription?.cycle || 'MONTHLY'})`.trim(),
            paidAt: new Date().toISOString(),
            userId,
          });
        }
      } catch (invErr) {
        console.error('Renewal invoice generation failed (non-fatal):', invErr);
      }

      return res.status(200).json({
        success: true,
        event: 'subscription.renewal',
        credits_allocated: result?.allocated || 0,
      });
    }

    // Payment failed — start/advance the dunning sequence. A nightly sweep
    // (lib/dunning.ts) retries saved cards on day 1/3/7/14 and downgrades at
    // day 21; reminder "emails" are logged (no email infra yet).
    if (event === 'charge.failed' || event === 'invoice.payment_failed') {
      const data = payload.data;
      const email = data.customer?.email || data.customer_email;

      const user = await getUserByEmail(email || '');
      if (!user) {
        console.error(`No user found for email ${email} on ${event}`);
        return res.status(200).json({ received: true });
      }

      const now = new Date().toISOString();
      const existing = user.paymentFailure;
      await updateUser(user.id, {
        paymentFailure: {
          count: (existing?.count || 0) + 1,
          firstFailedAt: existing?.firstFailedAt || now,
          lastAttemptAt: now,
          lastReference: data.reference || undefined,
        },
      } as any);

      console.log(`[dunning-email] to=${user.email} subject="Your PropReel payment failed — please update your card" reference=${data.reference || 'n/a'}`);

      return res.status(200).json({ success: true, event, dunning_started: true });
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
