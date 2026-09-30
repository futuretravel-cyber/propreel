import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, cancelSubscription as cancelDbSubscription, hasActiveSubscription } from '../../lib/userService';
import { cancelSubscription as cancelPaystackSub } from '../../lib/paystack';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, immediate } = req.body;
    const isImmediate = immediate === true;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Check user has active subscription
    const hasActive = await hasActiveSubscription(user_id);
    if (!hasActive) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    // Get user for Paystack cancellation
    const user = await getUser(user_id);

    // Cancel in Paystack (if we have the subscription code)
    if (user?.subscription?.paystackSubscriptionCode) {
      try {
        await cancelPaystackSub(user.subscription.paystackSubscriptionCode);
      } catch (paystackError) {
        console.error('Paystack cancel error:', paystackError);
        // Continue with local cancellation
      }
    }

    // Cancel in DynamoDB
    await cancelDbSubscription(user_id, isImmediate);

    return res.status(200).json({
      success: true,
      message: isImmediate
        ? 'Subscription cancelled immediately'
        : 'Subscription will be cancelled at end of billing period',
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}
