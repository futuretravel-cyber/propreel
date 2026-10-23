/**
 * One place for what credits are and how long they last.
 *
 * Every grant path — subscription activation, the monthly allocation, plan
 * upgrades' carry-over, top-ups, gifts and bonuses — stamps an expiry with
 * `creditTtlIso()` (lib/userService), which reads CREDIT_TTL_DAYS below.
 * The UI copy lives here too so no screen can state a different rule:
 * before this file the product said "never expire", "365 days after
 * purchase" and "expire at renewal" on four different screens.
 */

/** Days a credit stays usable after the moment it is granted. */
export const CREDIT_TTL_DAYS = 365;

export const CREDIT_EXPIRY_RULE =
  `Every credit lasts ${CREDIT_TTL_DAYS} days from the day it is added — plan, ` +
  'top-up, bonus and gift credits alike. We always spend your oldest credits first.';

export const CREDIT_ROLLOVER_RULE =
  'Plan credits roll over month to month while your plan is active — they do not reset when your plan renews.';

export const CREDIT_CANCEL_RULE =
  'If you cancel, credits already in your account stay usable until their expiry date.';

export const CREDIT_TOPUP_RULE =
  `Top-ups are non-refundable once a render is started, and expire ${CREDIT_TTL_DAYS} days after purchase.`;

export const CREDIT_SPEND_RULE =
  'A render is charged when it starts. If it fails, the credits are returned automatically.';

/** Short label used inside pricing tables and payout cards. */
export const CREDIT_EXPIRY_SHORT = `${CREDIT_TTL_DAYS}-day credit life`;
