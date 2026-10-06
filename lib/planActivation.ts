/**
 * Plan activation from a VERIFIED Paystack payment (subscription_start).
 *
 * Shared by /api/paystack/verify (callback return), the charge.success
 * webhook, and the reference-gated action=create fallback, so all three
 * paths are idempotent against each other via the shared `pay_<reference>`
 * settings marker — the plan can never be granted twice for one payment,
 * and (before this existed) never granted at all without a payment.
 *
 * Flow validated against Paystack test mode (2026-10-06):
 *  - Cardless `POST /subscription` is refused ("no saved authorizations"),
 *    so recurrence can only be set up AFTER a hosted first payment has put
 *    a card authorization on file.
 *  - Creating a subscription for a carded customer charges NOTHING at
 *    creation; the first invoice lands on the plan's billing day going
 *    forward (cron `38 4 6 * *` → 6th monthly). Hosted-first-then-subscribe
 *    therefore never double-charges.
 *  - Recurring invoices re-emit charge.success; the plan allowance is
 *    allocated exactly once per month by allocateMonthlyCredits' period
 *    claim, so cron + renewal webhook + invoice charge can't triple-pay.
 */
import { getPlanDetails, createSubscription as createDbSubscription, getUser } from './userService';
import { createSubscription as createPaystackSub } from './paystack';

export type ActivationResult =
  | { status: 'activated'; credits: number }
  | { status: 'already' }
  | { status: 'invalid_plan' }
  | { status: 'amount_mismatch'; expectedZar: number; paidZar: number };

export async function activateSubscriptionFromPayment(opts: {
  userId: string;
  reference: string;
  planId: string;
  cycle: 'MONTHLY' | 'ANNUAL';
  paidZar: number;
}): Promise<ActivationResult> {
  const { userId, reference, planId, cycle, paidZar } = opts;

  const details = await getPlanDetails(planId, cycle).catch(() => null);
  if (!details) return { status: 'invalid_plan' };

  // Money must match the plan's real price (details.price is the yearly
  // amount for ANNUAL). metadata is set by our own initializePayment, but
  // re-check the captured amount anyway — Paystack is the source of truth.
  if (paidZar < details.price) {
    return { status: 'amount_mismatch', expectedZar: details.price, paidZar };
  }

  // Idempotency: the same marker the generic credit-purchase path uses —
  // whichever of verify / webhook / create runs first consumes it.
  const { putItemIfNotExists, deleteItem, TABLES } = await import('./db');
  const claimed = await putItemIfNotExists(TABLES.SETTINGS, {
    id: `pay_${reference}`,
    userId,
    type: 'payment_processed',
    createdAt: new Date().toISOString(),
  });
  if (!claimed) return { status: 'already' };

  try {
    const user = await getUser(userId);
    if (!user) throw new Error(`User ${userId} vanished mid-activation`);

    // Recurring billing: the hosted first payment has saved the card, so
    // Paystack can now create the subscription (first invoice on the next
    // billing day). Failure here leaves month 1 active but unbilled after —
    // log loudly rather than block the paid activation.
    let paystackSubCode: string | undefined;
    let paystackCustomerCode: string | undefined;
    try {
      const ps = await createPaystackSub(user.email, details.planCode);
      paystackSubCode = ps.data?.subscription_code;
      paystackCustomerCode = ps.data?.customer_code;
    } catch (recErr) {
      console.error(
        `Plan activation: recurrence setup FAILED for ${user.email} (${planId}/${cycle}, ref ${reference}) — month 1 active, no Paystack subscription:`,
        recErr
      );
    }

    const result = await createDbSubscription(userId, planId, cycle, paystackSubCode, paystackCustomerCode);

    // Give 5, get 5 — same payout the old create route granted.
    try {
      const { grantReferralPayout } = await import('./referral');
      await grantReferralPayout(userId);
    } catch (refErr) {
      console.error('Referral payout after activation failed (non-fatal):', refErr);
    }

    console.log(
      `Plan activated: ${user.email} → ${planId}/${cycle} (R${paidZar} paid, +${result.creditsAllocated} credits, ref ${reference}${paystackSubCode ? `, sub ${paystackSubCode}` : ', NO recurrence'})`
    );
    return { status: 'activated', credits: result.creditsAllocated };
  } catch (err) {
    // Release the marker so verify/webhook retry can re-attempt activation.
    try {
      await deleteItem(TABLES.SETTINGS, { id: `pay_${reference}` });
    } catch { /* best effort */ }
    throw err;
  }
}
