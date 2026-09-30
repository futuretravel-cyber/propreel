import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, createSubscription as createDbSubscription, hasActiveSubscription, getPlanDetails } from '../../lib/userService';
import { createSubscription as createPaystackSub } from '../../lib/paystack';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, plan_id, cycle } = req.body;

    if (!user_id || !plan_id || !cycle) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['MONTHLY', 'ANNUAL'].includes(cycle)) {
      return res.status(400).json({ error: 'Invalid cycle' });
    }

    // Get user
    const user = await getUser(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has active subscription
    const hasActive = await hasActiveSubscription(user_id);
    if (hasActive) {
      const existingSub = await getUser(user_id);
      return res.status(400).json({
        error: 'User already has an active subscription',
        subscription: existingSub?.subscription,
      });
    }

    // Get plan details
    const planDetails = getPlanDetails(plan_id, cycle);
    if (!planDetails) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Create Paystack subscription
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

    // Create subscription in DynamoDB
    const { subscription, credits_allocated } = await createDbSubscription(
      user_id,
      plan_id,
      cycle,
      paystackSubCode,
      paystackCustomerCode
    );

    return res.status(200).json({
      success: true,
      subscription,
      credits_allocated,
      message: 'Subscription created successfully',
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
}
