import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { BackendAPI } from '../lib/backendAPI';
import { TERMS_CONSENT_VERSION } from '../lib/termsContent';

// ─── First-party auth over the shared /api/users function ───────────────────
// Sessions are HttpOnly cookies issued by the API (lib/auth.ts) — no third-
// party auth service. Every call sends credentials so the cookie rides along.
const API_BASE = import.meta.env.VITE_API_URL || '';

async function authFetch(action: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}/api/users?action=${action}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || `Authentication failed (${res.status})`);
    err.code = data.code;
    err.status = res.status;
    // Error bodies can still carry flow flags: auth_register answers 502
    // "account created, but the confirmation email failed" with
    // needsConfirmation:true — callers need it to offer resend/sign-in
    // instead of retrying the same registration into the same failure.
    err.needsConfirmation = !!data.needsConfirmation;
    throw err;
  }
  return data;
}

export type PlanId = 'STARTER' | 'PROFESSIONAL' | 'PREMIUM' | 'AGENCY' | 'FREE';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';
export type UserRole = 'AGENT' | 'AGENCY_OWNER' | 'ADMIN';

export interface CreditExpiry {
  amount: number;
  expiresAt: string;
  source: 'subscription' | 'purchase' | 'gift' | 'bonus';
}

export interface Subscription {
  planId: PlanId;
  cycle: BillingCycle;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'DOWNGRADE_PENDING';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextChargeAmount: number;
  pendingDowngrade?: PlanId;
}

export interface AutoTopup {
  enabled: boolean;
  threshold: number;
  amount: number;
}

/** Agent branding profile — saved once, auto-applied to video output */
export interface AgentProfile {
  id: string;
  profileName: string;
  fullName: string;
  email: string;
  phone: string;
  photoUrl?: string;
  logoUrl?: string;
  isDefault?: boolean;
  includeBranding?: boolean;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  credits: number;
  creditExpiries: CreditExpiry[];
  subscription: Subscription | null;
  autoTopup: AutoTopup;
  agencyId: string | null;
  agencyName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  lastLowCreditWarnedAt: string | null;
  createdAt: string;
  /** Paystack saved-card authorization (captured server-side on charge.success) */
  paystackAuthorizationCode?: string;
  /** Billing dunning state — surfaced as a friendly banner in Billing */
  paymentFailure?: { count: number; firstFailedAt: string; lastAttemptAt: string; lastReference?: string } | null;
  /** Shared agency credit pool (AGENCY plan owners) */
  agencyPoolCredits?: number;
  /** Invoice PDFs (S3) — populated server-side on payment */
  invoices?: Array<{ invoiceNumber: string; url: string; amountZar: number; paidAt: string; reference: string; description?: string }>;
  /** Computed by the monthly cron; shown in Billing */
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
  } | null;
  /** Set by the nightly auto-topup sweep when it needs a one-time checkout */
  autoTopupNeedsAuth?: boolean;
  autoTopupAuthAmount?: number;
  /** Agent branding profiles (Agent Branding tab) */
  agentProfiles?: AgentProfile[];
  /** Two-step verification (authenticator app) */
  twoFactorEnabled?: boolean;
  twoFactorOptIn?: boolean;
  /** Plan picked at signup (pre-subscription) — the trial card upgrades to it */
  planId?: string | null;
  /** Temporary ("trial") account — 7 days from signup, see lib/trial.ts */
  trialExpiresAt?: string;
  /** Day-7 soft delete (sessions revoked, sign-in locked) */
  trialEndedAt?: string;
  /** Re-entered after expiry with password — browse-only until they subscribe */
  trialReactivatedAt?: string;
}

export interface Balance {
  personal: number;
  agency: number;
  total: number;
  expiringSoon: number;
  expiringIn30Days: number;
}

const ADMIN_EMAILS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];

interface CreditContextType {
  user: User | null;
  balance: Balance;
  loading: boolean;
  isAdmin: boolean;
  isAgencyOwner: boolean;
  lowCreditWarning: 'none' | 'info' | 'warning' | 'critical';
  login: (email: string, password: string, opts?: { reactivate?: boolean }) => Promise<{ requires2fa?: boolean; token?: string; setupRequired?: boolean }>;
  loginWithTwoFactor: (email: string, token: string, code: string, opts?: { reactivate?: boolean }) => Promise<void>;
  register: (data: RegisterData) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  acceptPendingAgencyInvite: (userId: string) => Promise<void>;
  purchaseCredits: (amount: number) => Promise<{ authorizationUrl: string; reference: string }>;
  setAutoTopup: (config: AutoTopup) => void;
  giftCredits: (toEmail: string, amount: number) => Promise<void>;
  upgradePlan: (planId: PlanId, cycle: BillingCycle) => Promise<{ authorizationUrl?: string; chargedZar?: number; requiresCheckout?: boolean }>;
  downgradePlan: (planId: PlanId) => void;
  acknowledgeLowCredit: () => void;
  deductCredits: (amount: number, reason: string, metadata?: any, pool?: 'personal' | 'agency') => Promise<boolean>;
  /** Reverse ONE real charge after a failure — the server picks the amount */
  refundCredits: (scope: 'render' | 'flashhead' | 'edit' | 'description' | 'social_post') => Promise<boolean>;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  /** Where the "confirm your email" link should land (e.g. the payment page) */
  emailRedirectTo?: string;
  agencyName?: string;
  planId: PlanId;
  cycle: BillingCycle;
  aiAcknowledged: boolean;
  companyName?: string;
  companyReg?: string;
  companyVat?: string;
  companyAddress?: string;
  referralCode?: string;
  /** Sign up with the two-step verification prompt (authenticator app) */
  enableTwoFactor?: boolean;
  /** Opt in to the 7-day temporary account (5 free test credits, no card) */
  startTrial?: boolean;
}

const CreditContext = createContext<CreditContextType | null>(null);

export function CreditProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Agency invites: attach the user to any pending agency invite for their
  // email (invited before they signed up)
  const acceptPendingAgencyInvite = useCallback(async (userId: string) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || ''}/api/leads?action=agency_accept_pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
    } catch (e) {
      console.error('Agency invite attach failed (non-critical):', e);
    }
  }, []);

  // Load the signed-in user from the first-party session cookie. The API
  // returns the full profile row (minus auth secrets) in one round trip.
  const loadSessionUser = useCallback(async (): Promise<User | null> => {
    try {
      const data = await authFetch('auth_session');
      if (data.user) {
        setUser(data.user);
        // If this user was invited to an agency before signing up, attach them now
        acceptPendingAgencyInvite(data.user.id).catch(() => {});
        return data.user;
      }
      setUser(null);
      return null;
    } catch (error) {
      console.error('Failed to load session user:', error);
      setUser(null);
      return null;
    }
  }, [acceptPendingAgencyInvite]);

  useEffect(() => {
    const init = async () => {
      try {
        await loadSessionUser();
      } catch (error) {
        console.error('Auth init error:', error);
        setUser(null);
      }
      setLoading(false);
      setIsInitialLoad(false);
    };

    init();
  }, [loadSessionUser]);

  // Calculate balance
  const balance: Balance = {
    personal: user?.credits || 0,
    agency: user?.agencyPoolCredits || 0, // shared agency pool (AGENCY plan)
    total: (user?.credits || 0) + (user?.agencyPoolCredits || 0),
    expiringSoon: user?.creditExpiries?.filter(e => {
      const days = (new Date(e.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days <= 7 && days > 0;
    }).reduce((s, e) => s + e.amount, 0) || 0,
    expiringIn30Days: user?.creditExpiries?.filter(e => {
      const days = (new Date(e.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days <= 30 && days > 0;
    }).reduce((s, e) => s + e.amount, 0) || 0,
  };

  // Low credit warning
  const lowCreditWarning: 'none' | 'info' | 'warning' | 'critical' = (() => {
    if (!user?.subscription) return 'none';
    const allowance = user.subscription.planId === 'STARTER' ? 130 :
                      user.subscription.planId === 'PROFESSIONAL' ? 600 :
                      user.subscription.planId === 'PREMIUM' ? 1300 : 5000;
    const pct = (user.credits / allowance) * 100;
    if (pct <= 5) return 'critical';
    if (pct <= 10) return 'warning';
    if (pct <= 20) return 'info';
    return 'none';
  })();

  const login = useCallback(async (email: string, password: string, opts?: { reactivate?: boolean }): Promise<{ requires2fa?: boolean; token?: string; setupRequired?: boolean }> => {
    const data = await authFetch('auth_login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(opts?.reactivate ? { reactivate: true } : {}) }),
    });
    // Two-step verification: no session yet — the caller prompts for the
    // 6-digit authenticator code and finishes with loginWithTwoFactor.
    if (data.requires2fa) return { requires2fa: true, token: data.token };
    setUser(data.user);
    acceptPendingAgencyInvite(data.user.id).catch(() => {});
    return data.setupRequired ? { setupRequired: true } : {};
  }, [acceptPendingAgencyInvite]);

  const loginWithTwoFactor = useCallback(async (email: string, token: string, code: string, opts?: { reactivate?: boolean }) => {
    const data = await authFetch('auth_2fa_verify', {
      method: 'POST',
      body: JSON.stringify({ email, token, code, ...(opts?.reactivate ? { reactivate: true } : {}) }),
    });
    setUser(data.user);
    acceptPendingAgencyInvite(data.user.id).catch(() => {});
  }, [acceptPendingAgencyInvite]);

  const register = useCallback(async (data: RegisterData): Promise<{ needsConfirmation: boolean }> => {
    // First-party signup: the API provisions the row (signup bonus, admin
    // grant) and emails a Resend confirmation link. There is NO session yet —
    // callers must not assume the user is signed in (needsConfirmation=true).
    const res = await authFetch('auth_register', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        phone: data.phone,
        agencyName: data.agencyName,
        planId: data.planId,
        cycle: data.cycle,
        redirect: data.emailRedirectTo,
        enableTwoFactor: data.enableTwoFactor,
        referralCode: data.referralCode,
        startTrial: data.startTrial,
        // The checkbox the caller just ticked, versioned against the exact
        // Terms text it was given: the account records which Terms were
        // agreed to (and the server stamps when).
        aiAcknowledged: data.aiAcknowledged,
        termsConsentVersion: TERMS_CONSENT_VERSION,
      }),
    });

    return { needsConfirmation: !!res.needsConfirmation };
  }, []);

  const logout = useCallback(async () => {
    try {
      await authFetch('auth_logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed (clearing local state anyway):', error);
    }
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    await loadSessionUser();
  }, [loadSessionUser]);

  const purchaseCredits = useCallback(async (amount: number) => {
    if (amount < 50) throw new Error('Minimum purchase is R50 (50 credits)');
    if (!user) throw new Error('Not logged in');

    const response = await BackendAPI.initializePayment(user.id, amount, user.email);
    return {
      authorizationUrl: response.authorization_url,
      reference: response.reference,
    };
  }, [user]);

  const setAutoTopup = useCallback((config: AutoTopup) => {
    setUser(prev => prev ? { ...prev, autoTopup: config } : null);
    // Persist to the backend (best-effort; UI state is optimistic)
    if (user) {
      fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, updates: { autoTopup: config } }),
      }).catch(() => {});
    }
  }, [user]);

  const giftCredits = useCallback(async (toEmail: string, amount: number) => {
    if (!user || user.credits < amount) throw new Error('Insufficient credits');

    const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/credits?action=gift_email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_user_id: user.id, to_email: toEmail, amount, reason: `Gift from ${user.email}` }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Gift failed');
    }
    await refresh();
  }, [user, refresh]);

  const upgradePlan = useCallback(async (planId: PlanId, cycle: BillingCycle) => {
    if (!user) throw new Error('Not logged in');

    // Active subscription → prorated immediate upgrade (charges the plan
    // difference via saved card, credits unused allowance back).
    if (user.subscription?.status === 'ACTIVE') {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/subscriptions?action=upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, plan_id: planId, cycle }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) throw new Error(data.error || 'Upgrade failed');
      if (data.requires_checkout && data.authorization_url) {
        return { authorizationUrl: data.authorization_url as string, requiresCheckout: true };
      }
      await refresh();
      return { chargedZar: data.charged_zar as number | undefined };
    }

    // No active subscription → pay-before-activate hosted checkout; the
    // callback's server-side verify activates and refreshes the plan.
    const response = await BackendAPI.checkoutSubscription(user.id, planId, cycle);
    if (response.authorization_url) {
      return { authorizationUrl: response.authorization_url };
    }
    throw new Error('Failed to create subscription');
  }, [user, refresh]);

  const downgradePlan = useCallback((planId: PlanId) => {
    setUser(prev => prev?.subscription ? {
      ...prev,
      subscription: { ...prev.subscription, status: 'DOWNGRADE_PENDING' as const, pendingDowngrade: planId },
    } : null);
    // Mark the Paystack subscription for cancellation at period end (real effect;
    // the plan switch itself is applied by billing support/cron at renewal).
    if (user) {
      BackendAPI.cancelSubscription(user.id, false).catch(console.error);
    }
  }, [user]);

  const acknowledgeLowCredit = useCallback(() => {
    setUser(prev => prev ? { ...prev, lastLowCreditWarnedAt: new Date().toISOString() } : null);
  }, []);

  const deductCredits = useCallback(async (amount: number, reason: string, metadata?: any, pool?: 'personal' | 'agency'): Promise<boolean> => {
    if (!user) return false;

    try {
      const result = await BackendAPI.deductCredits({
        user_id: user.id,
        amount,
        reason,
        metadata,
        pool,
      });

      setUser(prev => {
        if (!prev) return prev;
        if (pool === 'agency') return { ...prev, agencyPoolCredits: result.new_balance };
        return { ...prev, credits: result.new_balance };
      });
      return true;
    } catch (error) {
      console.error('Error deducting credits:', error);
      throw error;
    }
  }, [user]);

  const refundCredits = useCallback(async (scope: 'render' | 'flashhead' | 'edit' | 'description' | 'social_post'): Promise<boolean> => {
    if (!user) return false;

    try {
      // Server-verified: the API reverses one matching, unreversed deduction
      // for its actual amount (at most once). The client can no longer name
      // an amount or a source — that was a self-minting hole.
      const result = await BackendAPI.refundCredits({
        user_id: user.id,
        scope,
      });

      setUser(prev => prev ? { ...prev, credits: result.new_balance } : null);
      return true;
    } catch (error) {
      console.error('Refund failed:', error);
      throw error;
    }
  }, [user]);

  // Backend sets role=ADMIN (see api/users.ts); the email list is a fallback
  // for accounts created before role provisioning existed.
  const isAdmin = user?.role === 'ADMIN' || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
  const isAgencyOwner = user?.role === 'AGENCY_OWNER';

  return (
    <CreditContext.Provider value={{
      user, balance, loading: isInitialLoad, isAdmin, isAgencyOwner, lowCreditWarning,
      login, loginWithTwoFactor, register, logout, refresh, acceptPendingAgencyInvite,
      purchaseCredits, setAutoTopup, giftCredits,
      upgradePlan, downgradePlan, acknowledgeLowCredit,
      deductCredits, refundCredits,
    }}>
      {children}
    </CreditContext.Provider>
  );
}

export function useCredit() {
  const ctx = useContext(CreditContext);
  if (!ctx) throw new Error('useCredit must be used within CreditProvider');
  return ctx;
}

export const useAuth = useCredit;
export const AuthProvider = CreditProvider;
