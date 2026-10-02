import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getUser,
  createSubscription as createDbSubscription,
  cancelSubscription as cancelDbSubscription,
  hasActiveSubscription,
  getPlanDetails,
  updateUser,
  recordTransaction,
  PLANS,
} from '../lib/userService';
import { createSubscription as createPaystackSub, cancelSubscription as cancelPaystackSub, chargeAuthorization } from '../lib/paystack';

/**
 * Unified subscriptions endpoint (Hobby plan has a 12-function limit).
 * Routes on ?action= : create | cancel | upgrade
 *
 * Response shapes are identical to the former /api/subscriptions/create
 * and /api/subscriptions/cancel endpoints.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (action === 'create') {
      const { user_id, plan_id, cycle } = req.body;

      if (!user_id || !plan_id || !cycle) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['MONTHLY', 'ANNUAL'].includes(cycle)) {
        return res.status(400).json({ error: 'Invalid cycle' });
      }

      const user = await getUser(user_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const hasActive = await hasActiveSubscription(user_id);
      if (hasActive) {
        const existingSub = await getUser(user_id);
        return res.status(400).json({
          error: 'User already has an active subscription',
          subscription: existingSub?.subscription,
        });
      }

      const planDetails = getPlanDetails(plan_id, cycle);
      if (!planDetails) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      let paystackSubCode: string | undefined;
      let paystackCustomerCode: string | undefined;

      try {
        const paystackResult = await createPaystackSub(user.email, planDetails.planCode);
        if (paystackResult.data) {
          paystackSubCode = paystackResult.data.subscription_code;
          paystackCustomerCode = paystackResult.data.customer_code;
        }
      } catch (paystackError) {
        console.error('Paystack subscription error:', paystackError);
        // Continue without Paystack subscription code (for testing)
      }

      const result = await createDbSubscription(
        user_id,
        plan_id,
        cycle,
        paystackSubCode,
        paystackCustomerCode
      );

      return res.status(200).json({
        success: true,
        subscription: result.subscription,
        credits_allocated: result.creditsAllocated,
        message: 'Subscription created successfully',
      });
    }

    if (action === 'cancel') {
      const { user_id, immediate } = req.body;
      const isImmediate = immediate === true;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      const hasActive = await hasActiveSubscription(user_id);
      if (!hasActive) {
        return res.status(400).json({ error: 'No active subscription found' });
      }

      const user = await getUser(user_id);

      if (user?.subscription?.paystackSubscriptionCode) {
        try {
          await cancelPaystackSub(user.subscription.paystackSubscriptionCode);
        } catch (paystackError) {
          console.error('Paystack cancel error:', paystackError);
          // Continue with local cancellation
        }
      }

      await cancelDbSubscription(user_id, isImmediate);

      return res.status(200).json({
        success: true,
        message: isImmediate
          ? 'Subscription cancelled immediately'
          : 'Subscription will be cancelled at end of billing period',
      });
    }

    // ── POST ?action=upgrade — immediate prorated plan upgrade ──────────
    // Charges the plan-price difference for the REMAINING period via the
    // customer's saved card (or returns a hosted-checkout URL when no card
    // is saved), credits the unused portion of the old plan's allowance
    // back as bonus credits, then switches the plan + grants the new
    // allowance immediately.
    if (action === 'upgrade') {
      const { user_id, plan_id, cycle } = req.body;

      if (!user_id || !plan_id || !cycle) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!['MONTHLY', 'ANNUAL'].includes(cycle)) {
        return res.status(400).json({ error: 'Invalid cycle' });
      }

      const user = await getUser(user_id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const newPlan = PLANS[plan_id];
      if (!newPlan) return res.status(400).json({ error: 'Invalid plan' });

      const sub = user.subscription;
      if (!sub || sub.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'No active subscription to upgrade' });
      }

      const oldPlan = PLANS[sub.planId];
      if (!oldPlan) return res.status(400).json({ error: 'Current plan is invalid' });

      // Same plan & cycle → nothing to do
      if (sub.planId === plan_id && sub.cycle === cycle) {
        return res.status(400).json({ error: 'Already on that plan and cycle' });
      }

      // Old plan price (cycle-adjusted, annual is per-month equivalent)
      const oldPrice = sub.cycle === 'MONTHLY' ? oldPlan.monthlyZar : oldPlan.annualZar * 12;
      const newPrice = cycle === 'MONTHLY' ? newPlan.monthlyZar : newPlan.annualZar * 12;

      if (newPrice <= oldPrice) {
        return res.status(400).json({
          error: 'Downgrades apply at the next renewal — use Cancel instead',
          current_plan: sub.planId,
          requested_plan: plan_id,
        });
      }

      // Unused fraction of the current period (floor 0 when past period end)
      const periodStart = new Date(sub.currentPeriodStart).getTime();
      const periodEnd = new Date(sub.currentPeriodEnd).getTime();
      const now = Date.now();
      const totalPeriod = Math.max(1, periodEnd - periodStart);
      const remaining = Math.max(0, Math.min(1, (periodEnd - now) / totalPeriod));

      // Credit back the unused portion of the old allowance
      const unusedOldCredits = Math.floor(oldPlan.monthlyCredits * remaining);

      // Prorated amount to charge for the remainder of the new plan
      const chargeZar = Math.max(50, Math.round((newPrice - oldPrice) * remaining));
      const chargeKobo = chargeZar * 100;

      // Pay the difference: saved card if we have one, else hosted checkout
      if (user.paystackAuthorizationCode) {
        const reference = `upg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        try {
          const charge = await chargeAuthorization(user.email, chargeZar, user.paystackAuthorizationCode, {
            user_id, type: 'plan_upgrade', from_plan: sub.planId, to_plan: plan_id, cycle,
          });
          if (charge.status !== 'success') {
            return res.status(402).json({
              error: 'Card charge failed — no changes made',
              charge_status: charge.status,
              amount_zar: chargeZar,
            });
          }
          await recordTransaction({
            userId: user_id,
            amount: -chargeZar,
            type: 'purchase',
            description: `Plan upgrade ${sub.planId} → ${plan_id} (prorated R${chargeZar})`,
            metadata: { kind: 'PLAN_UPGRADE', reference, chargeZar, toPlan: plan_id },
          });
        } catch (chargeErr: any) {
          return res.status(402).json({ error: chargeErr?.message || 'Card charge failed — no changes made' });
        }
      } else {
        // No saved card: send the user to hosted checkout for the difference.
        // The plan switch happens after they pay (client re-calls upgrade —
        // the charge marker then exists, or we keep this simple: return URL).
        const { initializePayment } = await import('../lib/paystack');
        const init = await initializePayment(user.email, chargeZar, {
          user_id, type: 'plan_upgrade_checkout', to_plan: plan_id, cycle,
        });
        return res.status(200).json({
          success: true,
          requires_checkout: true,
          authorization_url: init.data.authorization_url,
          amount_zar: chargeZar,
          message: `Pay R${chargeZar} to complete the upgrade`,
        });
      }

      // ── Apply the upgrade ────────────────────────────────────────────
      const nowDate = new Date();
      const periodEndDate = new Date();
      periodEndDate.setDate(periodEndDate.getDate() + (cycle === 'MONTHLY' ? 30 : 365));

      // Refund unused old credits as bonus, then grant the new allowance
      const expiryDate = cycle === 'MONTHLY'
        ? new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1).toISOString()
        : new Date(nowDate.getFullYear() + 1, nowDate.getMonth(), nowDate.getDate()).toISOString();

      const newCredits = (user.credits ?? 0) + unusedOldCredits + newPlan.monthlyCredits;

      await updateUser(user_id, {
        subscription: {
          ...sub,
          planId: plan_id,
          cycle,
          currentPeriodStart: nowDate.toISOString(),
          currentPeriodEnd: periodEndDate.toISOString(),
          nextChargeAmount: cycle === 'MONTHLY' ? newPlan.monthlyZar : newPlan.annualZar,
        },
        credits: newCredits,
        creditExpiries: [
          ...(user.creditExpiries || []),
          ...(unusedOldCredits > 0 ? [{ amount: unusedOldCredits, expiresAt: new Date(now + 30 * 86400000).toISOString(), source: 'bonus' as const }] : []),
          { amount: newPlan.monthlyCredits, expiresAt: expiryDate, source: 'subscription' as const },
        ],
      });

      await recordTransaction({
        userId: user_id,
        amount: newPlan.monthlyCredits + unusedOldCredits,
        type: 'subscription',
        description: `Plan upgrade: ${plan_id} (${cycle})${unusedOldCredits > 0 ? ` + ${unusedOldCredits} unused credits carried over` : ''}`,
        metadata: { planId: plan_id, cycle, carriedOver: unusedOldCredits, kind: 'PLAN_UPGRADE_ALLOCATION' },
      });

      const updated = await getUser(user_id);

      return res.status(200).json({
        success: true,
        charged_zar: chargeZar,
        carried_over_credits: unusedOldCredits,
        credits_allocated: newPlan.monthlyCredits,
        subscription: updated?.subscription,
        new_balance: updated?.credits,
        message: `Upgraded to ${plan_id} — R${chargeZar} charged, ${newPlan.monthlyCredits} credits added`,
      });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Subscriptions endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process subscription request' });
  }
}
