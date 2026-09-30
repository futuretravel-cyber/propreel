/**
 * User Service - DynamoDB implementation
 * Handles user, subscription, and credit operations
 */

import { docClient, getItem, putItem, updateItem, queryItems, scanItems, TABLES } from './db';

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
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'purchase' | 'bonus' | 'gift' | 'refund' | 'subscription' | 'deduction' | 'expiration';
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
}

// Plan details
const PLANS: Record<string, { monthlyZar: number; annualZar: number; monthlyCredits: number }> = {
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
  metadata?: Record<string, any>
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const user = await getUser(userId);
  if (!user) {
    return { success: false, newBalance: 0, error: 'User not found' };
  }

  if (user.credits < amount) {
    return { success: false, newBalance: user.credits, error: 'Insufficient credits' };
  }

  const newBalance = user.credits - amount;
  await updateUser(userId, { credits: newBalance });

  // Record transaction
  await recordTransaction({
    userId,
    amount: -amount,
    type: 'deduction',
    description: reason,
    metadata: metadata || {},
  });

  return { success: true, newBalance };
}

// Add credits to user
export async function addCredits(
  userId: string,
  amount: number,
  source: 'purchase' | 'bonus' | 'gift' | 'refund' | 'subscription',
  description: string,
  metadata?: Record<string, any>,
  expiresAt?: string
): Promise<{ success: boolean; newBalance: number }> {
  const user = await getUser(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const newBalance = user.credits + amount;
  await updateUser(userId, { credits: newBalance });

  // Record transaction
  await recordTransaction({
    userId,
    amount,
    type: source,
    description,
    metadata: metadata || {},
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
}

// Record a credit transaction
export async function recordTransaction(data: Omit<CreditTransaction, 'id' | 'createdAt'>): Promise<void> {
  const transaction: CreditTransaction = {
    ...data,
    id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
  };

  await putItem(TABLES.CREDIT_TRANSACTIONS, transaction);
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
  }, { limit: 100 });

  const filteredTransactions = transactions.filter(t => new Date(t.createdAt) >= since);

  return {
    currentBalance: user.credits,
    totalUsed: filteredTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    totalPurchased: filteredTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    transactions: filteredTransactions,
  };
}
