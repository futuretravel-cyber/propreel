import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getUser,
  cancelSubscription as cancelDbSubscription,
  hasActiveSubscription,
  getPlanDetails,
  getPlans,
  updateUser,
  recordTransaction,
  applyPendingUpgrade,
  markUpgradePaid,
  creditTtlIso,
  type Subscription,
  type User,
} from '../lib/userService';
import { cancelSubscription as cancelPaystackSub, chargeAuthorization } from '../lib/paystack';
import { requireOwner, requireAdminSession } from '../lib/auth';

/**
 * Unified subscriptions endpoint (Hobby plan has a 12-function limit).
 * Routes on ?action= : create | cancel | upgrade | admin_set_subscription
 * (GET ?action=pricing stays public and read-only).
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
    // ── POST ?action=checkout — pay-before-activate hosted checkout ─────
    // Plan activation requires a verified subscription_start payment: the
    // client redirects to Paystack and the callback's /api/paystack/verify
    // activates. The old direct-create path below minted plan credits with
    // no payment at all (Paystack errors were swallowed), so it now demands
    // a verified reference as a fallback only.
    if (action === 'checkout') {
      const { user_id, plan_id, cycle } = req.body;

      if (!user_id || !plan_id || !cycle) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!['MONTHLY', 'ANNUAL'].includes(cycle)) {
        return res.status(400).json({ error: 'Invalid cycle' });
      }
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      const user = await getUser(user_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (await hasActiveSubscription(user_id)) {
        return res.status(400).json({
          error: 'User already has an active subscription',
          subscription: user.subscription,
        });
      }

      const planDetails = await getPlanDetails(plan_id, cycle);
      if (!planDetails) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      const { initializePayment } = await import('../lib/paystack');
      const init = await initializePayment(user.email, planDetails.price, {
        user_id,
        type: 'subscription_start',
        plan_id,
        cycle,
      });

      return res.status(200).json({
        success: true,
        authorization_url: init.data.authorization_url,
        access_code: init.data.access_code,
        reference: init.data.reference,
        amount_zar: planDetails.price,
      });
    }

    if (action === 'create') {
      const { user_id, plan_id, cycle, reference } = req.body;

      if (!user_id || !plan_id || !cycle) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['MONTHLY', 'ANNUAL'].includes(cycle)) {
        return res.status(400).json({ error: 'Invalid cycle' });
      }
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

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

      // Pay-before-activate: only a VERIFIED subscription_start payment for
      // THIS user/plan/cycle can create a plan. The verify callback usually
      // activates already — this route is the reference-checked fallback.
      if (!reference || typeof reference !== 'string') {
        return res.status(402).json({ error: 'Payment required — start checkout to activate this plan' });
      }
      const { verifyPayment } = await import('../lib/paystack');
      const paid = await verifyPayment(reference).catch(() => null);
      const meta: any = paid?.data?.metadata || {};
      if (
        !paid?.data ||
        paid.data.status !== 'success' ||
        meta.type !== 'subscription_start' ||
        meta.plan_id !== plan_id ||
        meta.cycle !== cycle ||
        meta.user_id !== user_id
      ) {
        return res.status(402).json({ error: 'Payment not verified for this plan' });
      }

      const { activateSubscriptionFromPayment } = await import('../lib/planActivation');
      const outcome = await activateSubscriptionFromPayment({
        userId: user_id,
        reference,
        planId: plan_id,
        cycle,
        paidZar: Math.round((paid.data.amount || 0) / 100),
      });
      if (outcome.status === 'invalid_plan') {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      if (outcome.status === 'amount_mismatch') {
        console.error(`Subscriptions create: ${reference} underpaid (R${outcome.paidZar} < R${outcome.expectedZar}) — manual review`);
        return res.status(402).json({ error: 'Payment amount does not match this plan' });
      }

      const fresh = await getUser(user_id);
      return res.status(200).json({
        success: true,
        subscription: fresh?.subscription,
        credits_allocated: outcome.status === 'activated' ? outcome.credits : 0,
        already_processed: outcome.status === 'already',
        message: 'Subscription created successfully',
      });
    }

    if (action === 'cancel') {
      const { user_id, immediate } = req.body;
      const isImmediate = immediate === true;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

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
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

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

    // ── POST ?action=admin_set_subscription — platform-admin override ─────
    // The write half of the admin panel's subscription editor (the read
    // half is list_users in api/users.ts, which returns every row's
    // subscription). Lets an admin change ANY account's subscription as
    // they see fit — grant a comp plan with no payment, switch
    // plan/cycle/status/period, allocate the allowance, or strip the
    // subscription outright. Each change is written to the credit ledger
    // with the acting admin's email (kind ADMIN_SUBSCRIPTION_CHANGE) so the
    // audit-log view shows who did what.
    if (action === 'admin_set_subscription') {
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      const body = req.body || {};
      const userId: string = body.user_id;
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : '';
      if (!userId) return res.status(400).json({ error: 'user_id is required' });
      // plan_id must be sent explicitly: null/'' means "remove it", an
      // omitted key is a typo and never silently deletes a subscription.
      if (body.plan_id === undefined) {
        return res.status(400).json({ error: 'plan_id is required (send null to remove the subscription)' });
      }
      if (body.plan_id !== null && body.plan_id !== '' && typeof body.plan_id !== 'string') {
        return res.status(400).json({ error: 'plan_id must be a plan id or null' });
      }

      const cycle: 'MONTHLY' | 'ANNUAL' = body.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
      const status = String(body.status || 'ACTIVE').toUpperCase();
      if (!['ACTIVE', 'PAST_DUE', 'CANCELLED', 'DOWNGRADE_PENDING'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const user = await getUser(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const existing = user.subscription || null;
      const removing = body.plan_id === null || body.plan_id === '';
      if (removing && !existing) {
        return res.status(400).json({ error: 'This user has no subscription to remove' });
      }

      // Paystack teardown is explicit (the UI pre-ticks it for
      // CANCELLED/removal): cancelling locally while recurrence keeps
      // running would bill the customer for a plan the panel says is gone.
      let paystack: 'none' | 'cancelled' | 'failed' = 'none';
      let paystackError: string | null = null;
      const subCode = existing?.paystackSubscriptionCode;
      if (body.cancel_paystack === true && subCode) {
        try {
          await cancelPaystackSub(subCode);
          paystack = 'cancelled';
        } catch (err: any) {
          paystack = 'failed';
          paystackError = err?.message || 'Paystack cancellation failed';
          console.error('Admin: Paystack cancel failed:', err);
        }
      }

      let creditsAllocated = 0;
      let periodDays: number | null = null;
      let appliedPlan: string | null = null;

      if (removing) {
        await updateUser(userId, {
          subscription: undefined,
          pendingPlanUpgrade: undefined,
        });
      } else {
        const planId: string = body.plan_id;
        const plan = (await getPlans())[planId];
        if (!plan) return res.status(400).json({ error: 'Invalid plan' });

        const rawDays = body.period_days;
        const days = rawDays === undefined || rawDays === null || rawDays === ''
          ? (cycle === 'ANNUAL' ? 365 : 30)
          : Math.round(Number(rawDays));
        if (!Number.isFinite(days) || days < 1 || days > 730) {
          return res.status(400).json({ error: 'period_days must be between 1 and 730' });
        }

        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + days);

        const subscription: Subscription = {
          planId,
          cycle,
          status: status as Subscription['status'],
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
          nextChargeAmount: cycle === 'MONTHLY' ? plan.monthlyZar : plan.annualZar,
          // Keep the Paystack recurrence unless the admin cancels it.
          ...(subCode && body.cancel_paystack !== true
            ? { paystackSubscriptionCode: subCode, paystackCustomerCode: existing?.paystackCustomerCode }
            : {}),
          ...(status === 'DOWNGRADE_PENDING' && existing?.pendingDowngrade
            ? { pendingDowngrade: existing.pendingDowngrade }
            : {}),
        };

        const patch: Partial<User> = {
          subscription,
          // An admin edit supersedes any upgrade queued behind a payment.
          pendingPlanUpgrade: undefined,
        };
        if (status === 'ACTIVE') {
          // Reactivating clears the dunning state its retries hang off …
          patch.paymentFailure = undefined;
          // … and a real subscription converts a temporary trial account
          // (same wipe createSubscription does) so the trial sweep,
          // reminders and day-7 lock can never touch a paying account.
          patch.trialExpiresAt = undefined;
          patch.trialEndedAt = undefined;
          patch.trialReactivatedAt = undefined;
          patch.trialLastReminderDate = undefined;
        }
        if (body.allocate_credits === true) {
          creditsAllocated = plan.monthlyCredits;
          patch.credits = (user.credits ?? 0) + creditsAllocated;
          patch.creditExpiries = [
            ...(user.creditExpiries || []),
            { amount: creditsAllocated, expiresAt: creditTtlIso(), source: 'subscription' },
          ];
        }
        await updateUser(userId, patch);

        periodDays = days;
        appliedPlan = planId;
      }

      await recordTransaction({
        userId,
        amount: creditsAllocated,
        type: 'subscription',
        description: removing
          ? `Support removed the subscription${reason ? ` — ${reason}` : ''}`
          : `Support set ${appliedPlan} (${cycle}) ${status}${creditsAllocated ? ` +${creditsAllocated} credits` : ''}${reason ? ` — ${reason}` : ''}`,
        metadata: {
          kind: 'ADMIN_SUBSCRIPTION_CHANGE',
          by: gate.user.email,
          planId: removing ? null : appliedPlan,
          cycle,
          status: removing ? 'REMOVED' : status,
          periodDays,
          allocated: creditsAllocated,
          paystack,
          reason,
        },
      });

      // Admin audit trail (audit §11) — server-derived actor, best-effort.
      const { recordAdminAction } = await import('../lib/adminAudit');
      await recordAdminAction({
        by: gate.user.email,
        action: 'SUBSCRIPTION_CHANGE',
        target: userId,
        detail: removing
          ? `Removed subscription${reason ? ` — ${reason}` : ''}`
          : `Set ${appliedPlan} (${cycle}) ${status}${creditsAllocated ? ` +${creditsAllocated} credits` : ''}${reason ? ` — ${reason}` : ''}`,
      });

      const fresh = await getUser(userId);
      return res.status(200).json({
        success: true,
        subscription: fresh?.subscription || null,
        credits_allocated: creditsAllocated,
        paystack: paystack === 'failed'
          ? { cancelled: false, error: paystackError }
          : { cancelled: paystack === 'cancelled' },
        // Same safe shape list_users returns, so the panel can merge it.
        user: {
          id: userId,
          subscription: fresh?.subscription || null,
          credits: fresh?.credits ?? 0,
          planId: fresh?.planId || null,
          trialExpiresAt: fresh?.trialExpiresAt || null,
          trialEndedAt: fresh?.trialEndedAt || null,
          paymentFailure: fresh?.paymentFailure || null,
          pendingPlanUpgrade: fresh?.pendingPlanUpgrade || null,
          updatedAt: fresh?.updatedAt || null,
        },
        message: removing
          ? 'Subscription removed'
          : `${appliedPlan} set to ${status} for ${periodDays} day${periodDays === 1 ? '' : 's'}${creditsAllocated ? ` (+${creditsAllocated} credits)` : ''}`,
      });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Subscriptions endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process subscription request' });
  }
}
