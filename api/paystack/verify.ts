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

    // Resolve the payer exactly like the charge.success webhook does: OUR
    // stamped metadata.user_id FIRST (Paystack echoes custom metadata
    // verbatim, so it survives any provider field-shape change), then the
    // customer email as fallback for references minted without it.
    //
    // 2026-10-23 live fix: the verify RESPONSE carries no top-level
    // `customer_email` (only webhook payloads do), so the old email-first
    // lookup ran getUserByEmail(undefined) → `email.toLowerCase()` TypeError
    // → 500 on every poll: the charge was captured at Paystack but the UI
    // could never confirm it. metadata.user_id exists on every reference
    // initialize has minted since the ZAR pack change.
    let userId: string | undefined =
      typeof result.data.metadata?.user_id === 'string' ? result.data.metadata.user_id : undefined;
    const email = result.data.customer?.email || result.data.customer_email;
    if (!userId && email) {
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

    // ── Prorated plan upgrade (hosted-checkout branch) ────────────────
    // The plan switch is gated by an `upg_<reference>` marker in settings:
    // present → the webhook already applied it; absent → webhook was lost,
    // so this verify call consumes the marker and applies the upgrade.
    if (result.data.metadata?.type === 'plan_upgrade_checkout') {
      const { markUpgradePaid, applyPendingUpgrade } = await import('../../lib/userService');
      const consumed = await markUpgradePaid(reference, userId);
      if (!consumed) {
        const user = await getUser(userId);
        return res.status(200).json({
          success: true,
          already_processed: true,
          plan_upgrade: true,
          reference,
          subscription: user?.subscription,
          new_balance: user?.credits,
        });
      }
      const payer = await getUser(userId);
      if (payer?.subscription) {
        const targetPlan = result.data.metadata.to_plan as string;
        const targetCycle = (result.data.metadata.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') as 'MONTHLY' | 'ANNUAL';
        try {
          const up = await applyPendingUpgrade(payer, targetPlan, targetCycle);
          console.log(`Verify: plan upgrade applied for ${payer.email} → ${targetPlan} (R${up.chargedZar} prorated, +${up.creditsAllocated} credits)`);
        } catch (upErr) {
          console.error('Verify: upgrade application failed (payment captured):', upErr);
        }
      }
      // Capture the card + clear dunning/pending state (payment recovered)
      const authCode = result.data.authorization?.authorization_code;
      if (authCode) {
        try {
          const { updateUser } = await import('../../lib/userService');
          await updateUser(userId, {
            paystackAuthorizationCode: authCode,
            paymentFailure: undefined,
            pendingPlanUpgrade: undefined,
          } as any);
        } catch (authErr) {
          console.error('Auth code capture failed (non-fatal):', authErr);
        }
      }
      const user = await getUser(userId);
      return res.status(200).json({
        success: true,
        plan_upgrade: true,
        reference,
        subscription: user?.subscription,
        new_balance: user?.credits,
      });
    }

    // ── Plan activation from hosted checkout (subscription_start) ───────
    // Pay-before-activate: the first plan payment goes through Paystack
    // hosted checkout; activation is gated on this verified reference and
    // shared with the webhook + reference-gated action=create via the
    // pay_<reference> marker inside the helper.
    if (result.data.metadata?.type === 'subscription_start') {
      const meta = result.data.metadata;
      const { activateSubscriptionFromPayment } = await import('../../lib/planActivation');
      const outcome = await activateSubscriptionFromPayment({
        userId,
        reference,
        planId: String(meta.plan_id || ''),
        cycle: (meta.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') as 'MONTHLY' | 'ANNUAL',
        paidZar: amount,
      });
      if (outcome.status === 'invalid_plan') {
        return res.status(400).json({ success: false, error: 'Unknown plan on this payment', reference });
      }
      if (outcome.status === 'amount_mismatch') {
        console.error(`Verify: subscription_start ${reference} underpaid (R${outcome.paidZar} < R${outcome.expectedZar}) — manual review`);
        return res.status(400).json({ success: false, error: 'Payment amount does not match this plan', reference });
      }
      // This payment saved the card authorization that funds recurrence.
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
      const activatedUser = await getUser(userId);
      return res.status(200).json({
        success: true,
        reference,
        plan_activated: outcome.status === 'activated',
        already_processed: outcome.status === 'already',
        credits_added: outcome.status === 'activated' ? outcome.credits : 0,
        new_balance: activatedUser?.credits || 0,
      });
    }

    // Recurring subscription invoice verified directly: never credit it as
    // cash — allocateMonthlyCredits' period claim grants the plan allowance
    // exactly once per month across cron + renewal webhook + this path.
    if (result.data.plan && !result.data.metadata?.type) {
      const { allocateMonthlyCredits } = await import('../../lib/userService');
      const alloc = await allocateMonthlyCredits(userId).catch(() => null);
      const holder = await getUser(userId);
      return res.status(200).json({
        success: true,
        reference,
        recurring_invoice: true,
        credits_added: alloc?.allocated || 0,
        new_balance: holder?.credits || 0,
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
    //
    // GRANT THE CREDIT COUNT, not the paid Rands: initialize stamps
    // metadata.credits (since 2026-10-21 packs charge credits × 1.50). The
    // `amount` fallback keeps pre-ratelimit references (R1/credit) exact.
    const creditsGranted = Number(result.data.metadata?.credits) || amount;
    const eventId = result.data.id != null ? `ps_${result.data.id}` : undefined;
    const { addCredits } = await import('../../lib/userService');
    const addResult = await addCredits(
      userId,
      creditsGranted,
      'purchase',
      `Credit purchase: R${amount} (${creditsGranted} credits)`,
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

    // Give 5, get 5: first purchase by a referred user pays their referrer +5.
    const { grantReferralPayout } = await import('../../lib/referral');
    await grantReferralPayout(userId);

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
        credits: creditsGranted,
        description: `PropReel credit top-up (${creditsGranted} credits)`,
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
      credits_added: creditsGranted,
      new_balance: user?.credits || 0,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
}
