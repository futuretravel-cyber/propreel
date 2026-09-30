import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getUser,
  createSubscription as createDbSubscription,
  cancelSubscription as cancelDbSubscription,
  hasActiveSubscription,
  getPlanDetails,
} from '../lib/userService';
import { createSubscription as createPaystackSub, cancelSubscription as cancelPaystackSub } from '../lib/paystack';

/**
 * Unified subscriptions endpoint (Hobby plan has a 12-function limit).
 * Routes on ?action= : create | cancel
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

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Subscriptions endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process subscription request' });
  }
}
