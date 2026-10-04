/**
 * Give 5, get 5 referral program.
 *
 * - Attributed server-side during auth_register (?ref= → referralCode):
 *   the FRIEND gets +5 credits the moment the account is created.
 * - The REFFERER gets +5 credits once, when that friend makes their FIRST
 *   purchase (credit top-up or subscription) — see grantReferralPayout(),
 *   called from the Paystack verify/webhook/subscription paths.
 *
 * Both grants are exactly-once: addCredits() takes an eventId whose
 * conditional settings lock (evt_<id>) makes concurrent replays no-ops, and
 * the user-row flags (referralRedeemed / referralPaid) short-circuit later
 * attempts without a write.
 */
import { getUser, getUserByEmail, updateUser, addCredits } from './userService';

export const REFERRAL_FRIEND_CREDITS = 5;
export const REFERRAL_PAYOUT_CREDITS = 5;

/**
 * Attribute a new account to the referrer in ?ref= and grant the friend's
 * +5 signup boost. Non-fatal: never throws — a referral hiccup must not fail
 * registration. Idempotent via referralRedeemed + the addCredits event lock.
 */
export async function attributeReferral(
  newUserId: string,
  newUserEmail: string,
  referralCode: string | null | undefined
): Promise<void> {
  try {
    const code = String(referralCode || '').trim();
    if (!code) return;

    // Accept either the referrer's user id or their email.
    let referrer = await getUser(code);
    if (!referrer && code.includes('@')) referrer = await getUserByEmail(code.toLowerCase());
    if (!referrer || referrer.id === newUserId) return;

    const newUser = await getUser(newUserId);
    if (!newUser || newUser.referralRedeemed) return;

    await updateUser(newUserId, {
      referredBy: referrer.id,
      referralRedeemed: true,
    } as any);

    await addCredits(
      newUserId,
      REFERRAL_FRIEND_CREDITS,
      'bonus',
      `Referral bonus — you signed up via ${referrer.email}'s invite`,
      { kind: 'referral_friend', referrerId: referrer.id },
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days, like the signup bonus
      `ref_f_${newUserId}` // exactly-once even under concurrent double-registration
    );
  } catch (err) {
    console.error('Referral attribution failed (non-fatal):', err);
  }
}

/**
 * Pay the referrer +5 for their referred friend's FIRST purchase. Safe to
 * call from every payment path — referralPaid + the event lock guarantee a
 * single payout per referred user. Non-fatal: never throws.
 */
export async function grantReferralPayout(userId: string): Promise<void> {
  try {
    const user = await getUser(userId);
    if (!user?.referredBy || user.referralPaid) return;

    const referrer = await getUser(user.referredBy);
    if (!referrer) return;

    const result = await addCredits(
      referrer.id,
      REFERRAL_PAYOUT_CREDITS,
      'bonus',
      `Referral payout — ${user.email} made their first purchase`,
      { kind: 'referral_payout', referredUserId: userId },
      undefined, // no expiry, matching the previous referral reward
      `ref_p_${userId}` // one payout per referred user, race-proof
    );

    if (!result.duplicated) {
      await updateUser(userId, { referralPaid: true } as any);
      console.log(`Referral: paid ${REFERRAL_PAYOUT_CREDITS} credits to ${referrer.email} (first purchase by ${user.email})`);
    }
  } catch (err) {
    console.error('Referral payout failed (non-fatal):', err);
  }
}
