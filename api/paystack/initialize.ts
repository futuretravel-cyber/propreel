import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser } from '../../lib/userService';
import { initializePayment } from '../../lib/paystack';
import { requireOwner } from '../../lib/auth';
import { CREDIT_PACK_RAND } from '../../lib/renderPricing';

/**
 * Initialize a Paystack credit purchase.
 * Looks the user up in DynamoDB (source of truth) and returns the
 * Paystack authorization_url for hosted checkout.
 *
 * Repeat-purchase guard: a second checkout started within the repeat window
 * (PAYSTACK_REPEAT_WINDOW_MINUTES, default 5) is refused with 409 (code REPEAT_PURCHASE_CONFIRM) unless the request
 * carries confirm_repeat: true, which the billing UI sends only after the
 * customer explicitly confirms.
 */
const DEFAULT_REPEAT_WINDOW_MINUTES = 5;
// PAYSTACK_REPEAT_WINDOW_MINUTES overrides the window; 0 disables it.
function repeatWindowMs(): number {
  const raw = process.env.PAYSTACK_REPEAT_WINDOW_MINUTES;
  const minutes = raw === undefined || raw === '' ? NaN : Number(raw);
  const value = Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_REPEAT_WINDOW_MINUTES;
  return value * 60 * 1000;
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, credits, email, pool, confirm_repeat } = req.body;

    // Validate input (50 credits × CREDIT_PACK_RAND is the cash minimum)
    if (!user_id || !credits || credits < 50 || !email) {
      return res.status(400).json({
        error: `Invalid request. Minimum purchase is 50 credits (R${50 * CREDIT_PACK_RAND}).`
      });
    }
    const gate = await requireOwner(req, user_id);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

    // Get user from DynamoDB (source of truth for accounts)
    const user = await getUser(user_id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify email matches
    if (user.email !== String(email).toLowerCase()) {
      return res.status(400).json({ error: 'Email does not match user account' });
    }

    const lastInitMs = user.lastCheckoutInitAt ? Date.parse(user.lastCheckoutInitAt) : NaN;
    const repeatWithinWindow = Number.isFinite(lastInitMs) && Date.now() - lastInitMs < repeatWindowMs();
    if (repeatWithinWindow && confirm_repeat !== true) {
      return res.status(409).json({
        ok: false,
        code: 'REPEAT_PURCHASE_CONFIRM',
        error: 'You started another credit purchase a few minutes ago. Confirm you want to start another payment.',
      });
    }

    // Initialize Paystack payment — charge Rands at the pack rate; the
    // GRANT side (verify/webhook) reads metadata.credits (the count), never
    // this Rand amount, so the two can never drift apart.
    const chargeZar = Math.round(credits * CREDIT_PACK_RAND);
    const paymentData = await initializePayment(email, chargeZar, {
      user_id,
      credits,
      // 'agency_pool' purchases land in the shared agency pool on charge.success
      type: pool === 'agency' ? 'agency_pool_purchase' : 'credit_purchase',
      pool: pool === 'agency' ? 'agency' : 'personal',
    });

    await updateUser(user_id, { lastCheckoutInitAt: new Date().toISOString() });

    return res.status(200).json({
      success: true,
      authorization_url: paymentData.data.authorization_url,
      access_code: paymentData.data.access_code,
      reference: paymentData.data.reference
    });

  } catch (error) {
    console.error('Payment initialization error:', error);
    return res.status(500).json({ error: 'Failed to initialize payment' });
  }
}
