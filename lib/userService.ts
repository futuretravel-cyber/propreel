/**
 * User Service - DynamoDB implementation
 * Handles user, subscription, and credit operations
 */

import { getItem, putItem, putItemIfNotExists, updateItem, queryItems, scanItems, decrementIfEnough, incrementValue, TABLES } from './db';
import type { ApiErrorCode } from './apiError';
import { CREDIT_TTL_DAYS } from './creditPolicy';
import { isAvatarCharge, normalizeCreditAction } from './legacySchema';

export interface CreditExpiry {
  amount: number;
  expiresAt: string;
  source: 'subscription' | 'purchase' | 'gift' | 'bonus';
}

export interface Subscription {
  planId: string;
  cycle: 'MONTHLY' | 'ANNUAL';
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'DOWNGRADE_PENDING';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextChargeAmount: number;
  paystackSubscriptionCode?: string;
  paystackCustomerCode?: string;
  pendingDowngrade?: string;
}

/**
 * One expiry rule for every credit grant: credits expire 365 days after they
 * land — signup bonus, referral bonuses, purchases, auto top-ups and
 * subscription allocations alike. Single source of truth; the nightly
 * process-expired-credits cron consumes the resulting creditExpiries rows.
 * Re-exported for existing importers; the value now lives in creditPolicy so
 * the UI copy and the expiry stamp can never disagree.
 */
export { CREDIT_TTL_DAYS };
export const creditTtlIso = (from: number = Date.now()): string =>
  new Date(from + CREDIT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'AGENT' | 'AGENCY_OWNER' | 'ADMIN';
  credits: number;
  creditExpiries: CreditExpiry[];
  subscription: Subscription | null;
  autoTopup: {
    enabled: boolean;
    threshold: number;
    amount: number;
  };
  agencyId: string | null;
  agencyName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  lastLowCreditWarnedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** First-party auth (scrypt) — never leaves the API (stripped by safeUser) */
  passwordHash?: string;
  /** Single-use tokens mirrored here for clean rotation (server-side only) */
  emailConfirmToken?: string | null;
  confirmEmailLastSentAt?: string;
  passwordResetToken?: string | null;
  /** Two-step verification (TOTP) — server-side only, stripped by safeUser */
  twoFactorSecret?: string | null;
  twoFactorEnabled?: boolean;
  /** Chose the two-step checkbox at sign-up but hasn't scanned the QR yet */
  twoFactorOptIn?: boolean;
  /** Short-lived sign-in challenge (auth_login → auth_2fa_verify) */
  twoFactorPendingToken?: string | null;
  twoFactorPendingExpires?: string | null;
  /** Security-change timestamps — real Audit Log feed (written at change time) */
  passwordChangedAt?: string | null;
  twoFactorChangedAt?: string | null;
  notificationPreferences?: Record<string, boolean>;
  /** AI-generated-content notice — content-versioned ack (FNV-1a hash of the
   *  exact notice text) + when it was given, so it follows the account */
  aiNoticeAckVersion?: string | null;
  aiNoticeAckAt?: string | null;
  /** Signup consent — content-versioned hash of the exact Terms text the
   *  signup checkbox was ticked against + when it was recorded */
  termsConsentVersion?: string | null;
  termsConsentAt?: string | null;
  projectFolders?: Array<{ id: string; name: string; icon: string; createdAt: string }>;
  planId?: string | null;
  cycle?: string;
  /** Paystack saved-card authorization (captured on charge.success; used by auto-topup) */
  paystackAuthorizationCode?: string;
  /** Billing dunning state (retries day 1/3/7/14, downgrade at day 21) */
  paymentFailure?: {
    count: number;
    firstFailedAt: string;
    lastAttemptAt: string;
    lastReference?: string;
  };
  /** Invoice PDFs (S3) — populated by lib/invoice.ts, shown in Billing */
  invoices?: Array<{ invoiceNumber: string; url: string; amountZar: number; paidAt: string; reference: string; description?: string }>;
  /** Shared agency credit pool (AGENCY plan); spent first for tier features */
  agencyPoolCredits?: number;
  /** Give 5, get 5 referrals — see lib/referral.ts */
  referredBy?: string | null;
  /** Friend's +5 signup grant has been claimed (exactly-once guard) */
  referralRedeemed?: boolean;
  /** Referrer's +5 paid after this user's first purchase */
  referralPaid?: boolean;
  /** Set when a no-saved-card upgrade is awaiting hosted-checkout payment */
  pendingPlanUpgrade?: {
    toPlanId: string;
    cycle: 'MONTHLY' | 'ANNUAL';
    chargeZar: number;
    reference: string;
    createdAt: string;
  };
  /** Temporary ("trial") account — see lib/trial.ts. All optional; wiped on subscription. */
  trialExpiresAt?: string;
  /** Day-7 soft delete: sessions revoked, sign-in locked until reactivation/subscribe */
  trialEndedAt?: string;
  /** User re-entered with their password after expiry (browse-only, no rendering) */
  trialReactivatedAt?: string;
  /** Last day (YYYY-MM-DD UTC) a daily trial reminder email went out */
  trialLastReminderDate?: string;
  /** Computed by the allocate-monthly-credits cron for the Billing page */
  monthlySummary?: {
    month: string;
    generatedAt: string;
    openingBalance: number;
    allocated: number;
    used: number;
    expired: number;
    closingBalance: number;
    subscriptionZar: number | null;
    nextChargeDate: string | null;
  };
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'purchase' | 'bonus' | 'gift' | 'transfer' | 'refund' | 'subscription' | 'deduction' | 'expiration';
  description: string;
  metadata: Record<string, any>;
  /** Idempotency key (e.g. Paystack data.id or reference) — duplicate events never double-credit */
  eventId?: string;
  createdAt: string;
}

// Plan details — built-in fallback. The live source of truth is the
// `pricing_config` row in the settings table (seeded from these values);
// getPlans() below reads it so DB edits drive real billing.
export const PLANS: Record<string, { monthlyZar: number; annualZar: number; monthlyCredits: number }> = {
  'STARTER': { monthlyZar: 129, annualZar: 110, monthlyCredits: 115 },
  'PROFESSIONAL': { monthlyZar: 589, annualZar: 560, monthlyCredits: 600 },
  'PREMIUM': { monthlyZar: 1270, annualZar: 1200, monthlyCredits: 1300 },
  'AGENCY': { monthlyZar: 5000, annualZar: 5000, monthlyCredits: 5000 },
};

let plansCache: { at: number; plans: Record<string, typeof PLANS[string]> } | null = null;

/**
 * DB-backed plan table: reads `settings/pricing_config`.plans (60s in-memory
 * cache) so monthly/annual prices and credit allocations stored in DynamoDB
 * are what billing actually charges. Falls back to the built-in PLANS when
 * the row is missing or unreadable.
 */
export async function getPlans(): Promise<Record<string, typeof PLANS[string]>> {
  if (plansCache && Date.now() - plansCache.at < 60_000) return plansCache.plans;
  try {
    const { getItem, TABLES } = await import('./db');
    const row = await getItem<any>(TABLES.SETTINGS, { id: 'pricing_config' });
    const dbPlans = row?.plans;
    if (Array.isArray(dbPlans) && dbPlans.length > 0) {
      const merged: Record<string, typeof PLANS[string]> = { ...PLANS };
      for (const p of dbPlans) {
        if (!p?.id || !merged[p.id]) continue;
        merged[p.id] = {
          monthlyZar: Number.isFinite(Number(p.monthlyZar)) ? Number(p.monthlyZar) : merged[p.id].monthlyZar,
          annualZar: Number.isFinite(Number(p.annualZar)) ? Number(p.annualZar) : merged[p.id].annualZar,
          monthlyCredits: Number.isFinite(Number(p.monthlyCredits)) ? Number(p.monthlyCredits) : merged[p.id].monthlyCredits,
        };
      }
      plansCache = { at: Date.now(), plans: merged };
      return merged;
    }
  } catch (e) {
    console.error('pricing_config read failed — using built-in plans:', e);
  }
  plansCache = { at: Date.now(), plans: PLANS };
  return PLANS;
}

// Get user by ID
export async function getUser(id: string): Promise<User | null> {
  return getItem<User>(TABLES.USERS, { id });
}

// NOTE: The users table has no GSIs (hash key = id only), so non-key lookups
// use Scan with a FilterExpression. Values use ":" placeholders; attribute names
// are only referenced literally (reserved words avoided).

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await scanItems<User>(TABLES.USERS, {
    filter: {
      expression: 'email = :email',
      values: { ':email': email.toLowerCase() },
    },
    limit: 1,
  });
  return users[0] || null;
}

// Create user (after Google OAuth)
export async function createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    ...data,
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(TABLES.USERS, user);
  return user;
}

/**
 * Idempotent user provisioning: exactly one row per email even when several
 * requests arrive together (first login fires multiple API calls). The old
 * check-then-create lost that race: every concurrent request saw "no user"
 * and created its own row, each collecting the signup bonus — and for admins,
 * a fresh 1000-credit allocation.
 *
 * The claim is putItemIfNotExists on a generated id; the loser of a race
 * re-reads and returns the winner's row. On DynamoDB this is a conditional
 * put; on Supabase it is ON CONFLICT DO NOTHING — identical semantics.
 */
export async function getOrCreateUserByEmail(
  input: Omit<User, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ user: User; created: boolean }> {
  const email = input.email.toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) return { user: existing, created: false };

  const now = new Date().toISOString();
  const candidate: User = {
    ...input,
    email,
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  } as User;

  const claimed = await putItemIfNotExists(TABLES.USERS, candidate);
  if (claimed) return { user: candidate, created: true };

  // Lost the race — the winner's row now exists.
  const winner = await getUserByEmail(email);
  if (winner) return { user: winner, created: false };
  throw new Error(`user provisioning race lost and no row found for ${email}`);
}

// Delete user (account deletion flow)
export async function deleteUser(id: string): Promise<boolean> {
  const { deleteItem } = await import('./db-helpers');
  return deleteItem(TABLES.USERS, { id });
}

// Update user
export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  await updateItem(TABLES.USERS, { id }, updates);
  const updated = await getUser(id);
  if (updated) {
    updated.updatedAt = new Date().toISOString();
  }
  return updated;
}

// Deduct credits from user
//
// `code` on failure is the machine-readable branch key (lib/apiError.ts) so
// API routes and the client never string-match these messages.
export interface DeductResult {
  success: boolean;
  newBalance: number;
  error?: string;
  code?: Extract<ApiErrorCode, 'TRIAL_LOCKED' | 'MONTHLY_LIMIT_REACHED' | 'INSUFFICIENT_CREDITS' | 'INSUFFICIENT_AGENCY_POOL' | 'NOT_FOUND'>;
}

export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, any>,
  pool?: 'personal' | 'agency'
): Promise<DeductResult> {
  // Fully atomic server-side decrement: DynamoDB evaluates
  // `balance = balance - :amount WHERE balance >= :amount` on the CURRENT
  // item, so concurrent requests can never double-spend or go negative.
  // The authoritative new balance comes back via ReturnValues.
  //
  // pool='agency' spends the shared agency pool (agencyPoolCredits) instead of
  // the personal balance — used for preset-tier render features. The ledger
  // row keeps type 'deduction' with metadata.pool='agency' for reporting.
  const useAgencyPool = pool === 'agency';
  const balanceExpr = useAgencyPool ? 'agencyPoolCredits' : 'credits';
  try {
    // Expired trial accounts (even after reactivation) may not spend until
    // they subscribe. Dynamic import keeps lib/trial.ts out of the import
    // graph at module-load time.
    const trial = await import('./trial');
    const spendUser = await getUser(userId);
    if (spendUser && trial.isTrialSpendingBlocked(spendUser)) {
      return {
        success: false,
        newBalance: spendUser.credits,
        error: 'Your free trial has ended — subscribe to a plan to keep rendering.',
        code: 'TRIAL_LOCKED',
      };
    }

    // Per-agent monthly cap (owner-set via the agency dashboard) — enforced
    // here so no caller can bypass it. Dynamic import avoids the load cycle
    // with lib/agency.
    const { checkAgentLimit } = await import('./agency');
    const limitError = await checkAgentLimit(userId, amount);
    if (limitError) {
      return { success: false, newBalance: 0, error: limitError, code: 'MONTHLY_LIMIT_REACHED' };
    }

    // Agency-pool spends draw from the SHARED agency row (lib/agency holds
    // poolCredits there), not the spending agent's own record — any member
    // spends the one true pool. Solo users (no agencyId) keep the legacy
    // per-user agencyPoolCredits attribute.
    let targetTable: string = TABLES.USERS;
    let targetKey: Record<string, any> = { id: userId };
    if (useAgencyPool) {
      const spender = await getUser(userId);
      if (spender?.agencyId) {
        targetTable = TABLES.AGENCIES;
        targetKey = { id: spender.agencyId };
      }
    }
    const poolExpr = useAgencyPool && targetTable === TABLES.AGENCIES ? 'poolCredits' : balanceExpr;
    const newBalance = await decrementIfEnough(targetTable, targetKey, poolExpr, amount);
    if (newBalance == null) {
      // Row missing or balance insufficient — mirror the DynamoDB semantics
      const user = await getUser(userId);
      if (!user) return { success: false, newBalance: 0, error: 'User not found', code: 'NOT_FOUND' };
      if (useAgencyPool) {
        const { getAgency } = await import('./agency');
        const agency = user.agencyId ? await getAgency(user.agencyId) : null;
        return {
          success: false,
          newBalance: agency?.poolCredits ?? user.agencyPoolCredits ?? 0,
          error: 'Insufficient agency pool credits',
          code: 'INSUFFICIENT_AGENCY_POOL',
        };
      }
      return { success: false, newBalance: user.credits, error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' };
    }

    await recordTransaction({
      userId,
      amount: -amount,
      type: 'deduction',
      description: reason,
      metadata: { ...(metadata || {}), pool: useAgencyPool ? 'agency' : 'personal' },
    });

    return { success: true, newBalance };
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      const user = await getUser(userId);
      if (!user) return { success: false, newBalance: 0, error: 'User not found', code: 'NOT_FOUND' };
      if (useAgencyPool) {
        const { getAgency } = await import('./agency');
        const agency = user.agencyId ? await getAgency(user.agencyId) : null;
        return {
          success: false,
          newBalance: agency?.poolCredits ?? user.agencyPoolCredits ?? 0,
          error: 'Insufficient agency pool credits',
          code: 'INSUFFICIENT_AGENCY_POOL',
        };
      }
      return { success: false, newBalance: user.credits, error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' };
    }
    throw error;
  }
}

// Add credits to the shared agency pool (owner tops it up via Paystack).
// With an agencyId the pool lives on the agency row (source of truth for all
// members); the buyer's own record keeps a display mirror when they are the
// agency owner. Solo buyers keep the legacy per-user attribute.
export async function addAgencyPoolCredits(
  userId: string,
  amount: number,
  description: string,
  metadata?: Record<string, any>
): Promise<number> {
  const user = await getUser(userId);
  if (!user) throw new Error('User not found');

  let newBalance: number;
  if (user.agencyId) {
    newBalance = await incrementValue(TABLES.AGENCIES, { id: user.agencyId }, 'poolCredits', amount);
    // Display mirror for the agency owner's own dashboard
    if (user.role === 'AGENCY_OWNER') {
      await updateUser(userId, { agencyPoolCredits: newBalance });
    }
  } else {
    newBalance = (user.agencyPoolCredits ?? 0) + amount;
    await updateUser(userId, { agencyPoolCredits: newBalance });
  }

  await recordTransaction({
    userId,
    amount,
    type: 'purchase',
    description,
    metadata: { ...(metadata || {}), pool: 'agency' },
  });
  return newBalance;
}

// Add credits to user
export async function addCredits(
  userId: string,
  amount: number,
  source: 'purchase' | 'bonus' | 'gift' | 'refund' | 'subscription' | 'transfer',
  description: string,
  metadata?: Record<string, any>,
  expiresAt?: string,
  eventId?: string
): Promise<{ success: boolean; newBalance: number; duplicated?: boolean }> {
  // Idempotency first: atomically claim the event via a conditional put on
  // the settings table (HASH key = id, so attribute_not_exists is a true
  // uniqueness guarantee). Duplicate webhooks / renewal replays land here,
  // lose the race, and never touch the balance. The lock is released if the
  // credit add itself fails, so a later retry can proceed.
  const lockId = eventId ? `evt_${eventId}` : undefined;
  if (lockId) {
    try {
      const claimed = await putItemIfNotExists(TABLES.SETTINGS, {
        id: lockId,
        type: 'event_lock',
        userId,
        eventId,
        createdAt: new Date().toISOString(),
      });
      if (!claimed) {
        const current = await getUser(userId);
        return { success: true, newBalance: current?.credits ?? 0, duplicated: true };
      }
    } catch (e: any) {
      if (e?.name === 'ConditionalCheckFailedException') {
        const current = await getUser(userId);
        return { success: true, newBalance: current?.credits ?? 0, duplicated: true };
      }
      throw e;
    }
  }

  try {
    const user = await getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Atomic increment — safe under concurrency on both drivers
    const newBalance = await incrementValue(TABLES.USERS, { id: userId }, 'credits', amount);

    // Record transaction (idempotent on eventId; belt-and-braces with the
    // settings lock above)
    await recordTransaction({
      userId,
      amount,
      type: source,
      description,
      metadata: metadata || {},
      eventId,
    });

    // Add to credit expiries if applicable
    if (expiresAt && (source === 'subscription' || source === 'purchase' || source === 'bonus')) {
      const userAfter = await getUser(userId);
      if (userAfter) {
        const updatedExpiries = [...(userAfter.creditExpiries || []), {
          amount,
          expiresAt,
          source,
        }];
        await updateUser(userId, { creditExpiries: updatedExpiries });
      }
    }

    return { success: true, newBalance };
  } catch (err) {
    // Release the event lock so a retry after a transient failure can proceed
    if (lockId) {
      try {
        const { deleteItem } = await import('./db-helpers');
        await deleteItem(TABLES.SETTINGS, { id: lockId });
      } catch { /* best effort */ }
    }
    throw err;
  }
}

/**
 * Refund scopes → the deduction each one reverses. Scope strings mirror the
 * charge sites: `job_token` mints (render / flashhead / edit — priced server-
 * side by lib/renderPricing) and the client `deduct` action (description /
 * social_post). The matcher only ever selects a NEGATIVE ledger row (plus
 * the 0-amount trial-free TRANSLATE rows, whose reversal mints nothing), so
 * a refund can never reverse an inflow (purchase, bonus, gift, transfer-in).
 */
const REFUND_MATCHERS: Record<string, (t: CreditTransaction) => boolean> = {
  render: t => t.metadata?.scope === 'render' || t.description === 'Video generation',
  // Avatar (legacy alias 'flashhead' + the old 'FlashHead lip-sync video'
  // rows) — history is never rewritten, so the matcher accepts both spellings
  // via the shared schema classifier.
  avatar: t => isAvatarCharge(t),
  edit: t => t.metadata?.scope === 'edit' || t.metadata?.kind === 'IMAGE_EDIT' || t.description.startsWith('Image edit'),
  description: t => t.metadata?.kind === 'PROPERTY_DESCRIPTION' || t.description === 'Property description',
  social_post: t => t.metadata?.kind === 'SOCIAL_POST' || t.description === 'Social media post',
  social_pack: t => t.metadata?.kind === 'SOCIAL_PACK' || t.description === 'Social media pack (all platforms)',
  script: t => t.metadata?.scope === 'script' || t.description === 'AI Writer voiceover script',
  // Per-clip re-roll inside the post-render review (Option 2) — charged by
  // job_token with scope=rerender, so it has its own matcher like render.
  rerender: t => t.metadata?.scope === 'rerender' || t.description === 'Clip re-render',
  // Voiceover Translate — charged by the client `deduct` action (kind
  // TRANSLATE), or consumed free on a trial as a 0-amount row of the same
  // kind. Reversing a freebie row returns the TRIAL ALLOWANCE (it un-counts
  // the row in api/credits.ts's usage count), never credits.
  translate: t => t.metadata?.kind === 'TRANSLATE' || t.description.startsWith('Translate voiceover script'),
};

export const REFUND_SCOPES = Object.keys(REFUND_MATCHERS);

/** How far back a refund claim may reach — real flows refund within seconds. */
const REFUND_WINDOW_MS = 7 * 24 * 3600_000;

/**
 * Reverse ONE real, unreversed deduction — the server-verified replacement
 * for the client-issued `source:'refund'` mints (self-refund hole).
 *
 * Invariants this enforces, none of which the old path had:
 *  - the amount is taken from the ORIGINAL deduction row, never the client;
 *  - at most one refund per deduction (eventId `rfnd_<txnId>` → the same
 *    settings-table event lock Paystack webhooks use — concurrent losers
 *    get `duplicated` and mint nothing);
 *  - only real `deduction` rows younger than REFUND_WINDOW_MS qualify, so a
 *    refund can never exceed what was actually charged (net-zero at worst);
 *  - nothing to reverse ⇒ success with refunded:0 (idempotent no-op, so the
 *    client's failure path behaves exactly as before).
 *
 * Refunds land on the personal balance — the same choice every existing
 * server-side refund (nightly reaper, listing rollback) already makes, even
 * when the original charge drew the agency pool.
 */
export async function refundDeduction(
  userId: string,
  scope: string
): Promise<{ success: boolean; newBalance: number; refunded: number; error?: string }> {
  const matches = REFUND_MATCHERS[scope];
  if (!matches) return { success: false, newBalance: 0, refunded: 0, error: 'Unknown refund scope' };

  const txns = await getCreditTransactions(userId, 500);
  // Originals already reversed: the reversal row carries eventId rfnd_<origId>
  const reversed = new Set(
    txns
      .filter(t => t.type === 'refund' && t.eventId?.startsWith('rfnd_'))
      .map(t => t.eventId!.slice('rfnd_'.length))
  );
  const candidate = txns.find(
    t =>
      t.type === 'deduction' &&
      // Negative = a real charge. Zero is allowed ONLY for the trial-free
      // TRANSLATE consumption rows: reversing one moves no balance (abs(0)
      // refunds nothing) and exists purely to give the free allowance back —
      // the rfnd_ marker un-counts the row in api/credits.ts's usage count.
      (t.amount < 0 || (t.amount === 0 && scope === 'translate')) &&
      !reversed.has(t.id) &&
      Date.now() - Date.parse(t.createdAt) <= REFUND_WINDOW_MS &&
      matches(t)
  );

  const current = await getUser(userId);
  if (!current) return { success: false, newBalance: 0, refunded: 0, error: 'User not found' };
  if (!candidate) {
    return { success: true, newBalance: current.credits, refunded: 0 };
  }

  const amount = Math.abs(candidate.amount);
  const result = await addCredits(
    userId,
    amount,
    'refund',
    `Refund — ${candidate.description}`,
    {
      reversalOf: candidate.id,
      scope,
      ...(candidate.metadata?.pool ? { chargedTo: candidate.metadata.pool } : {}),
    },
    undefined,
    `rfnd_${candidate.id}`
  );
  return {
    success: true,
    newBalance: result.newBalance,
    refunded: result.duplicated ? 0 : amount,
  };
}

// Record a credit transaction. Idempotency for event-driven credits is
// handled by the settings-table event lock in addCredits (the credit-
// transactions table is keyed by (userId, createdAt), so a uniqueness
// condition here could not work across items); eventId is kept on the row
// for audit and joins.
export async function recordTransaction(data: Omit<CreditTransaction, 'id' | 'createdAt'>): Promise<{ recorded: boolean }> {
  const transaction: CreditTransaction = {
    ...data,
    id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
  };

  await putItem(TABLES.CREDIT_TRANSACTIONS, transaction);
  return { recorded: true };
}

// Transfer credits between agents (agency teammates especially). Atomic on
// the sender's side; writes two linked TRANSFER ledger rows.
export async function transferCredits(
  fromUserId: string,
  toUserId: string,
  amount: number,
  reason?: string
): Promise<DeductResult> {
  const linkId = `xfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const deduct = await deductCredits(fromUserId, amount, reason || 'Credit transfer sent', {
    kind: 'TRANSFER', linkId, toUserId,
  });
  if (!deduct.success) return deduct;

  await recordTransaction({
    userId: toUserId,
    amount,
    type: 'transfer',
    description: reason || 'Credit transfer received',
    metadata: { kind: 'TRANSFER', linkId, fromUserId },
    eventId: linkId,
  });

  // Credit the receiver's balance directly (ledger row already written)
  const receiver = await getUser(toUserId);
  if (!receiver) {
    // Roll back — receiver vanished mid-transfer
    await addCredits(fromUserId, amount, 'refund', 'Transfer reversed — recipient not found', { kind: 'TRANSFER_REVERSAL', linkId });
    return { success: false, newBalance: deduct.newBalance, error: 'Recipient not found' };
  }    await updateUser(toUserId, { credits: receiver.credits + amount });


  return { success: true, newBalance: deduct.newBalance };
}

// Get credit transactions for user
export async function getCreditTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
  const transactions = await queryItems<CreditTransaction>(TABLES.CREDIT_TRANSACTIONS, {
    expression: 'userId = :uid',
    values: { ':uid': userId },
  }, { limit, scanIndexForward: false });

  // Server-side history normalization (2026-10-27 avatar migration): legacy
  // scope/kind/description values come back in the canonical vocabulary.
  return transactions.map(normalizeCreditAction);
}

// Get subscription by user ID
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const user = await getUser(userId);
  return user?.subscription || null;
}

// Create subscription for user
export async function createSubscription(
  userId: string,
  planId: string,
  cycle: 'MONTHLY' | 'ANNUAL',
  paystackSubCode?: string,
  paystackCustomerCode?: string
): Promise<{ subscription: Subscription; creditsAllocated: number }> {
  const plan = (await getPlans())[planId];
  if (!plan) {
    throw new Error('Invalid plan');
  }

  const now = new Date();
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + (cycle === 'MONTHLY' ? 30 : 365));

  const subscription: Subscription = {
    planId,
    cycle,
    status: 'ACTIVE',
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    nextChargeAmount: cycle === 'MONTHLY' ? plan.monthlyZar : plan.annualZar,
    paystackSubscriptionCode: paystackSubCode,
    paystackCustomerCode: paystackCustomerCode,
  };

  const credits = plan.monthlyCredits;
  // One expiry rule for every grant: 365 days from the moment it lands.
  const expiryDate = creditTtlIso();

  // The activation grant IS this month's allocation: claim the same
  // renew_<user>_<YYYY-MM> marker allocateMonthlyCredits races for, so the
  // monthly cron (or a late renewal webhook inside the activation month)
  // can never stack a second allowance on top of the one just activated.
  // The claim's result is ignored on purpose — an existing claim (e.g. the
  // cron already allocated this month before the customer re-subscribed)
  // must not stop the activation grant the customer just paid for.
  // Claim-then-grant like allocateMonthlyCredits: a claim write failure
  // fails the activation, whose callers release their pay_<ref> marker and
  // retry from the top.
  await putItemIfNotExists(TABLES.SETTINGS, {
    id: `renew_${userId}_${new Date().toISOString().slice(0, 7)}`,
    type: 'renewal_allocation',
    userId,
    createdAt: new Date().toISOString(),
  });

  // Update user with subscription and credits. A subscription converts a
  // temporary (trial) account into a normal one — every trial field is
  // removed (undefined = REMOVE in updateItem) so the sweep/reminders/lock
  // and the day-7 purge can never touch a paying account.
  await updateUser(userId, {
    subscription,
    credits,
    creditExpiries: [{ amount: credits, expiresAt: expiryDate, source: 'subscription' }],
    trialExpiresAt: undefined,
    trialEndedAt: undefined,
    trialReactivatedAt: undefined,
    trialLastReminderDate: undefined,
  });

  // Record transaction
  await recordTransaction({
    userId,
    amount: credits,
    type: 'subscription',
    description: `Subscription: ${planId} (${cycle})`,
    metadata: { planId, cycle },
  });

  const user = await getUser(userId);
  return {
    subscription: user?.subscription || subscription,
    creditsAllocated: credits,
  };
}

// Cancel subscription
export async function cancelSubscription(userId: string, immediate: boolean = false): Promise<void> {
  const user = await getUser(userId);
  if (!user || !user.subscription) {
    throw new Error('No active subscription');
  }

  const newStatus = immediate ? 'CANCELLED' : 'PAST_DUE';

  await updateUser(userId, {
    subscription: {
      ...user.subscription,
      status: newStatus as Subscription['status'],
    },
  });
}

// Process monthly credit allocation (called by cron + webhooks).
// Exactly-once per calendar month: three callers race for the same
// allowance — the monthly cron, the subscription.renewal webhook, and
// recurring charge.success invoices — so claim renew_<user>_<YYYY-MM>
// atomically first; losers return null without allocating, and the claim
// is released if the allocation itself fails so a retry can proceed.
export async function allocateMonthlyCredits(userId: string): Promise<{ allocated: number; newBalance: number } | null> {
  const eligibility = await getUser(userId);
  if (!eligibility?.subscription || eligibility.subscription.status !== 'ACTIVE') {
    return null;
  }

  const periodKey = `renew_${userId}_${new Date().toISOString().slice(0, 7)}`;
  const claimed = await putItemIfNotExists(TABLES.SETTINGS, {
    id: periodKey,
    type: 'renewal_allocation',
    userId,
    createdAt: new Date().toISOString(),
  });
  if (!claimed) return null;

  try {
    return await runMonthlyAllocation(userId);
  } catch (err) {
    try {
      const { deleteItem } = await import('./db-helpers');
      await deleteItem(TABLES.SETTINGS, { id: periodKey });
    } catch { /* best effort */ }
    throw err;
  }
}

async function runMonthlyAllocation(userId: string): Promise<{ allocated: number; newBalance: number } | null> {
  const user = await getUser(userId);
  if (!user || !user.subscription || user.subscription.status !== 'ACTIVE') {
    return null;
  }

  const plan = (await getPlans())[user.subscription.planId];
  if (!plan) {
    return null;
  }

  const now = new Date();
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + (user.subscription.cycle === 'MONTHLY' ? 30 : 365));

  const subscription: Subscription = {
    ...user.subscription,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    nextChargeAmount: user.subscription.cycle === 'MONTHLY' ? plan.monthlyZar : plan.annualZar,
  };

  // Add credits (credits roll over)
  const newCredits = user.credits + plan.monthlyCredits;
  const expiryDate = creditTtlIso();

  await updateUser(userId, {
    credits: newCredits,
    subscription,
    creditExpiries: [...(user.creditExpiries || []), {
      amount: plan.monthlyCredits,
      expiresAt: expiryDate,
      source: 'subscription',
    }],
  });

  await recordTransaction({
    userId,
    amount: plan.monthlyCredits,
    type: 'subscription',
    description: `Monthly credit allocation (${user.subscription.planId})`,
    metadata: { planId: user.subscription.planId, cycle: user.subscription.cycle },
  });

  return { allocated: plan.monthlyCredits, newBalance: newCredits };
}

// Process expired credits (called by cron)
export async function processExpiredCredits(): Promise<{ processed: number; expiredAmount: number }> {
  const now = new Date();
  let processed = 0;
  let expiredAmount = 0;

  // Get all users
  const users = await scanItems<User>(TABLES.USERS);

  for (const user of users) {
    if (!user.creditExpiries || user.creditExpiries.length === 0) {
      continue;
    }

    const validExpiries: CreditExpiry[] = [];
    let userExpired = 0;

    for (const expiry of user.creditExpiries) {
      if (new Date(expiry.expiresAt) <= now) {
        userExpired += expiry.amount;
      } else {
        validExpiries.push(expiry);
      }
    }

    if (userExpired > 0) {
      const newCredits = Math.max(0, user.credits - userExpired);
      await updateUser(user.id, {
        credits: newCredits,
        creditExpiries: validExpiries,
      });

      await recordTransaction({
        userId: user.id,
        amount: -userExpired,
        type: 'expiration',
        description: 'Credits expired',
        metadata: { expiredAt: now.toISOString() },
      });

      processed++;
      expiredAmount += userExpired;
    }
  }

  return { processed, expiredAmount };
}

// Ledger rows for a user within [start, end) — used by agency monthly reports.
export async function queryLedgerWindow(
  userId: string,
  start: Date,
  end: Date
): Promise<CreditTransaction[]> {
  const txs = await queryItems<CreditTransaction>(TABLES.CREDIT_TRANSACTIONS, {
    expression: 'userId = :uid',
    values: { ':uid': userId },
  }, { limit: 400, scanIndexForward: false });
  return txs.filter(t => {
    const at = new Date(t.createdAt);
    return at >= start && at < end;
  });
}

// Get plan details
// Paystack plan codes come from env (PAYSTACK_PLAN_<PLAN>_<CYCLE>, e.g.
// PAYSTACK_PLAN_STARTER_MONTHLY=PLN_68okgs5e0ge03g6) so real dashboard codes
// are used; falls back to the legacy generated name.
export async function getPlanDetails(planId: string, cycle: 'MONTHLY' | 'ANNUAL') {
  const plan = (await getPlans())[planId];
  if (!plan) return null;
  const envCode = process.env[`PAYSTACK_PLAN_${planId}_${cycle}`];
  return {
    // annualZar is the per-month equivalent (see upgrade proration) —
    // Paystack's annual plan bills it × 12 (test mode: R110 → 132000 kobo).
    price: cycle === 'MONTHLY' ? plan.monthlyZar : plan.annualZar * 12,
    credits: plan.monthlyCredits,
    planCode: envCode || `PLN_${planId.toLowerCase()}_${cycle.toLowerCase()}`,
  };
}

// Check if user has active subscription
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  return user?.subscription?.status === 'ACTIVE';
}

// Get user credit report
export async function getCreditReport(userId: string, days = 30): Promise<{
  currentBalance: number;
  totalUsed: number;
  totalPurchased: number;
  transactions: CreditTransaction[];
}> {
  const user = await getUser(userId);
  if (!user) {
    return { currentBalance: 0, totalUsed: 0, totalPurchased: 0, transactions: [] };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Newest-first, like every other ledger reader (getCreditTransactions,
  // agency monthly usage, the allocate cron). The default ascending order
  // made the fixed read cap and the API's slice(0, 100) drop the NEWEST
  // rows — history silently stopped at some old date.
  const transactions = await queryItems<CreditTransaction>(TABLES.CREDIT_TRANSACTIONS, {
    expression: 'userId = :uid',
    values: { ':uid': userId },
  }, { limit: 400, scanIndexForward: false });

  const filteredTransactions = transactions
    .filter(t => new Date(t.createdAt) >= since)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    currentBalance: user.credits,
    totalUsed: filteredTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    totalPurchased: filteredTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    // Server-side history normalization (avatar migration) — see above.
    transactions: filteredTransactions.map(normalizeCreditAction),
  };
}

// ─── Prorated plan upgrade (shared by api/subscriptions.ts + webhook/verify) ──

/** Marker id in the settings table that gates the plan-switch (paid amount). */
export function upgradeMarkerId(reference: string): string {
  return `upg_${reference}`;
}

/**
 * Write the paid-upgrade marker (atomic). Returns false when the marker
 * already exists — i.e. this payment was already consumed by another caller.
 */
export async function markUpgradePaid(reference: string, userId: string): Promise<boolean> {
  return putItemIfNotExists(TABLES.SETTINGS, {
    id: upgradeMarkerId(reference),
    userId,
    type: 'plan_upgrade_paid',
    createdAt: new Date().toISOString(),
  });
}

/** Switch the user onto the upgraded plan: prorate credit-back, new allowance. */
export async function applyPendingUpgrade(
  user: User,
  toPlanId: string,
  cycle: 'MONTHLY' | 'ANNUAL'
): Promise<{ chargedZar: number; carriedOver: number; creditsAllocated: number }> {
  const plans = await getPlans();
  const newPlan = plans[toPlanId];
  const sub = user.subscription;
  if (!newPlan) throw new Error(`Unknown plan: ${toPlanId}`);
  if (!sub) throw new Error('User has no subscription');

  const oldPlan = plans[sub.planId];
  if (!oldPlan) throw new Error(`Unknown current plan: ${sub.planId}`);

  const oldPrice = sub.cycle === 'MONTHLY' ? oldPlan.monthlyZar : oldPlan.annualZar * 12;
  const newPrice = cycle === 'MONTHLY' ? newPlan.monthlyZar : newPlan.annualZar * 12;

  const periodStart = new Date(sub.currentPeriodStart).getTime();
  const periodEnd = new Date(sub.currentPeriodEnd).getTime();
  const now = Date.now();
  const totalPeriod = Math.max(1, periodEnd - periodStart);
  const remaining = Math.max(0, Math.min(1, (periodEnd - now) / totalPeriod));

  // Credit back the unused portion of the old allowance
  const unusedOldCredits = Math.floor(oldPlan.monthlyCredits * remaining);

  // Prorated amount that was charged for the remainder of the new plan
  const chargeZar = Math.max(50, Math.round((newPrice - oldPrice) * remaining));

  const nowDate = new Date();
  const periodEndDate = new Date();
  periodEndDate.setDate(periodEndDate.getDate() + (cycle === 'MONTHLY' ? 30 : 365));

  const expiryDate = creditTtlIso(now);

  const newCredits = (user.credits ?? 0) + unusedOldCredits + newPlan.monthlyCredits;

  await updateUser(user.id, {
    subscription: {
      ...sub,
      planId: toPlanId,
      cycle,
      currentPeriodStart: nowDate.toISOString(),
      currentPeriodEnd: periodEndDate.toISOString(),
      nextChargeAmount: cycle === 'MONTHLY' ? newPlan.monthlyZar : newPlan.annualZar,
    },
    credits: newCredits,
    creditExpiries: [
      ...(user.creditExpiries || []),
      ...(unusedOldCredits > 0 ? [{ amount: unusedOldCredits, expiresAt: creditTtlIso(now), source: 'bonus' as const }] : []),
      { amount: newPlan.monthlyCredits, expiresAt: expiryDate, source: 'subscription' as const },
    ],
    pendingPlanUpgrade: undefined,
  });

  await recordTransaction({
    userId: user.id,
    amount: newPlan.monthlyCredits + unusedOldCredits,
    type: 'subscription',
    description: `Plan upgrade: ${toPlanId} (${cycle})${unusedOldCredits > 0 ? ` + ${unusedOldCredits} unused credits carried over` : ''}`,
    metadata: { planId: toPlanId, cycle, carriedOver: unusedOldCredits, kind: 'PLAN_UPGRADE_ALLOCATION' },
  });

  return { chargedZar: chargeZar, carriedOver: unusedOldCredits, creditsAllocated: newPlan.monthlyCredits };
}
