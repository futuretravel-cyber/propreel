import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getUser,
  createSubscription as createDbSubscription,
  cancelSubscription as cancelDbSubscription,
  hasActiveSubscription,
  getPlanDetails,
  getPlans,
  updateUser,
  recordTransaction,
  applyPendingUpgrade,
  markUpgradePaid,
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

  // GET ?action=pricing — public, read-only pricing source of truth.
  // Serves the DynamoDB `settings/pricing_config` row (plans + render tiers)
  // so the site's displayed pricing comes from the database, not constants.
  if (req.method === 'GET' && action === 'pricing') {
    try {
      const { getItem, TABLES } = await import('../lib/db');
      const row = await getItem<any>(TABLES.SETTINGS, { id: 'pricing_config' });
      if (!row) return res.status(200).json({ success: true, pricing: null });
      return res.status(200).json({
        success: true,
        pricing: { plans: row.plans || null, tiers: row.tiers || null, updatedAt: row.updatedAt || null },
      });
    } catch (e) {
      console.error('pricing read failed:', e);
      return res.status(200).json({ success: true, pricing: null });
    }
  }

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

      const planDetails = await getPlanDetails(plan_id, cycle);
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

      const dbPlans = await getPlans();
      const newPlan = dbPlans[plan_id];
      if (!newPlan) return res.status(400).json({ error: 'Invalid plan' });

      const sub = user.subscription;
      if (!sub || sub.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'No active subscription to upgrade' });
      }

      const oldPlan = dbPlans[sub.planId];
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

      // Prorated amount to charge for the remainder of the new plan
      const chargeZar = Math.max(50, Math.round((newPrice - oldPrice) * remaining));

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
          // Gate the plan switch so a retried/duplicated charge.success
          // webhook for this reference can't apply the upgrade twice.
          await markUpgradePaid(reference, user_id);
        } catch (chargeErr: any) {
          return res.status(402).json({ error: chargeErr?.message || 'Card charge failed — no changes made' });
        }
      } else {
        // No saved card: hosted checkout for the difference. The plan switch
        // is applied by the webhook/verify handler once the payment clears.
        const { initializePayment } = await import('../lib/paystack');
        const init = await initializePayment(user.email, chargeZar, {
          user_id, type: 'plan_upgrade_checkout', to_plan: plan_id, cycle,
        });
        await updateUser(user_id, {
          pendingPlanUpgrade: {
            toPlanId: plan_id,
            cycle,
            chargeZar,
            reference: init.data.reference,
            createdAt: new Date().toISOString(),
          },
        });
        return res.status(200).json({
          success: true,
          requires_checkout: true,
          authorization_url: init.data.authorization_url,
          amount_zar: chargeZar,
          message: `Pay R${chargeZar} to complete the upgrade — it applies automatically once payment clears`,
        });
      }

      // ── Apply the upgrade ────────────────────────────────────────────
      const result = await applyPendingUpgrade(user, plan_id, cycle);
      const updated = await getUser(user_id);

      return res.status(200).json({
        success: true,
        charged_zar: result.chargedZar,
        carried_over_credits: result.carriedOver,
        credits_allocated: result.creditsAllocated,
        subscription: updated?.subscription,
        new_balance: updated?.credits,
        message: `Upgraded to ${plan_id} — R${result.chargedZar} charged, ${result.creditsAllocated} credits added`,
      });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Subscriptions endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process subscription request' });
  }
}
