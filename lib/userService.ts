/**
 * User Service - DynamoDB implementation
 * Handles user, subscription, and credit operations
 */

import { getItem, putItem, putItemIfNotExists, updateItem, queryItems, scanItems, decrementIfEnough, incrementValue, TABLES } from './db';

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
  supabaseUserId?: string; // Links to Supabase auth user
  notificationPreferences?: Record<string, boolean>;
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
  /** Set when a no-saved-card upgrade is awaiting hosted-checkout payment */
  pendingPlanUpgrade?: {
    toPlanId: string;
    cycle: 'MONTHLY' | 'ANNUAL';
    chargeZar: number;
    reference: string;
    createdAt: string;
  };
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

// Plan details (exported for the prorated-upgrade math in api/subscriptions.ts)
export const PLANS: Record<string, { monthlyZar: number; annualZar: number; monthlyCredits: number }> = {
  'STARTER': { monthlyZar: 129, annualZar: 110, monthlyCredits: 130 },
  'PROFESSIONAL': { monthlyZar: 589, annualZar: 560, monthlyCredits: 600 },
  'PREMIUM': { monthlyZar: 1270, annualZar: 1200, monthlyCredits: 1300 },
  'AGENCY': { monthlyZar: 5000, annualZar: 5000, monthlyCredits: 5000 },
};

// Get user by ID
export async function getUser(id: string): Promise<User | null> {
  return getItem<User>(TABLES.USERS, { id });
}

// NOTE: The users table has no GSIs (hash key = id only), so non-key lookups
// use Scan with a FilterExpression. Values use ":" placeholders; attribute names
// are only referenced literally (reserved words avoided).

// Get user by Supabase user ID (for OAuth callback)
export async function getUserBySupabaseId(supabaseUserId: string): Promise<User | null> {
  const users = await scanItems<User>(TABLES.USERS, {
    filter: {
      expression: 'supabaseUserId = :sid',
      values: { ':sid': supabaseUserId },
    },
    limit: 1,
  });
  return users[0] || null;
}

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
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, any>,
  pool?: 'personal' | 'agency'
): Promise<{ success: boolean; newBalance: number; error?: string }> {
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
    // Per-agent monthly cap (owner-set via the agency dashboard) — enforced
    // here so no caller can bypass it. Dynamic import avoids the load cycle
    // with lib/agency.
    const { checkAgentLimit } = await import('./agency');
    const limitError = await checkAgentLimit(userId, amount);
    if (limitError) {
      return { success: false, newBalance: 0, error: limitError };
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
      if (!user) return { success: false, newBalance: 0, error: 'User not found' };
      if (useAgencyPool) {
        const { getAgency } = await import('./agency');
        const agency = user.agencyId ? await getAgency(user.agencyId) : null;
        return {
          success: false,
          newBalance: agency?.poolCredits ?? user.agencyPoolCredits ?? 0,
          error: 'Insufficient agency pool credits',
        };
      }
      return { success: false, newBalance: user.credits, error: 'Insufficient credits' };
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
      if (!user) return { success: false, newBalance: 0, error: 'User not found' };
      if (useAgencyPool) {
        const { getAgency } = await import('./agency');
        const agency = user.agencyId ? await getAgency(user.agencyId) : null;
        return {
          success: false,
          newBalance: agency?.poolCredits ?? user.agencyPoolCredits ?? 0,
          error: 'Insufficient agency pool credits',
        };
      }
      return { success: false, newBalance: user.credits, error: 'Insufficient credits' };
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
    if (expiresAt && (source === 'subscription' || source === 'purchase')) {
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
): Promise<{ success: boolean; newBalance: number; error?: string }> {
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
  }
  await updateUser(toUserId, { credits: receiver.credits + amount });

  return { success: true, newBalance: deduct.newBalance };
}

// Get credit transactions for user
export async function getCreditTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
  const transactions = await queryItems<CreditTransaction>(TABLES.CREDIT_TRANSACTIONS, {
    expression: 'userId = :uid',
    values: { ':uid': userId },
  }, { limit, scanIndexForward: false });

  return transactions;
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
  const plan = PLANS[planId];
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
  const expiryDate = cycle === 'MONTHLY'
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
    : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();

  // Update user with subscription and credits
  await updateUser(userId, {
    subscription,
    credits,
    creditExpiries: [{ amount: credits, expiresAt: expiryDate, source: 'subscription' }],
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

// Process monthly credit allocation (called by cron)
export async function allocateMonthlyCredits(userId: string): Promise<{ allocated: number; newBalance: number } | null> {
  const user = await getUser(userId);
  if (!user || !user.subscription || user.subscription.status !== 'ACTIVE') {
    return null;
  }

  const plan = PLANS[user.subscription.planId];
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
  const expiryDate = user.subscription.cycle === 'MONTHLY'
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
    : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();

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
export function getPlanDetails(planId: string, cycle: 'MONTHLY' | 'ANNUAL') {
  const plan = PLANS[planId];
  if (!plan) return null;
  const envCode = process.env[`PAYSTACK_PLAN_${planId}_${cycle}`];
  return {
    price: cycle === 'MONTHLY' ? plan.monthlyZar : plan.annualZar,
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

  const transactions = await queryItems<CreditTransaction>(TABLES.CREDIT_TRANSACTIONS, {
    expression: 'userId = :uid',
    values: { ':uid': userId },
  }, { limit: 400 });

  const filteredTransactions = transactions.filter(t => new Date(t.createdAt) >= since);

  return {
    currentBalance: user.credits,
    totalUsed: filteredTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    totalPurchased: filteredTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    transactions: filteredTransactions,
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
  const newPlan = PLANS[toPlanId];
  const sub = user.subscription;
  if (!newPlan) throw new Error(`Unknown plan: ${toPlanId}`);
  if (!sub) throw new Error('User has no subscription');

  const oldPlan = PLANS[sub.planId];
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

  const expiryDate = cycle === 'MONTHLY'
    ? new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1).toISOString()
    : new Date(nowDate.getFullYear() + 1, nowDate.getMonth(), nowDate.getDate()).toISOString();

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
      ...(unusedOldCredits > 0 ? [{ amount: unusedOldCredits, expiresAt: new Date(now + 30 * 86400000).toISOString(), source: 'bonus' as const }] : []),
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
