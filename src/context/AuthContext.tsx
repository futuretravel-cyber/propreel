import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { BackendAPI } from '../lib/backendAPI';

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
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  acceptPendingAgencyInvite: (userId: string) => Promise<void>;
  purchaseCredits: (amount: number) => Promise<{ authorizationUrl: string; reference: string }>;
  setAutoTopup: (config: AutoTopup) => void;
  giftCredits: (toEmail: string, amount: number) => Promise<void>;
  upgradePlan: (planId: PlanId, cycle: BillingCycle) => Promise<{ authorizationUrl: string }>;
  downgradePlan: (planId: PlanId) => void;
  acknowledgeLowCredit: () => void;
  deductCredits: (amount: number, reason: string, metadata?: any) => Promise<boolean>;
  addCredits: (amount: number, source: 'purchase' | 'bonus' | 'gift' | 'refund' | 'subscription', description: string) => Promise<boolean>;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  agencyName?: string;
  planId: PlanId;
  cycle: BillingCycle;
  aiAcknowledged: boolean;
  companyName?: string;
  companyReg?: string;
  companyVat?: string;
  companyAddress?: string;
  referralCode?: string;
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

  // Ensure a backend user exists for the Supabase auth identity, then load it.
  // The backend POST /api/users is an idempotent upsert: existing users are
  // updated, new users are created with the 5-credit signup bonus (and the
  // admin grant when the email is on the admin list).
  const fetchUserData = useCallback(async (_authUserId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authUser = session?.user;
      if (!authUser?.email) throw new Error('No authenticated Supabase user');
      const meta = (authUser.user_metadata || {}) as Record<string, any>;
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUserId: authUser.id,
          email: authUser.email,
          fullName: meta.full_name || meta.fullName || meta.name || authUser.email.split('@')[0],
          agencyName: meta.agency_name || undefined,
          planId: meta.plan_id || undefined,
        }),
      });
      if (!response.ok) throw new Error(`Backend user lookup failed (${response.status})`);
      const data = await response.json();
      setUser(data.user);
      // If this user was invited to an agency before signing up, attach them now
      acceptPendingAgencyInvite(data.user.id).catch(() => {});
      return data.user;
    } catch (error) {
      console.error('Failed to load user from backend:', error);
      setUser(null);
      return null;
    }
  }, [acceptPendingAgencyInvite]);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await fetchUserData(session.user.id);
        }
      } catch (error) {
        console.error('Auth init error:', error);
        setUser(null);
      }
      setLoading(false);
      setIsInitialLoad(false);
    };

    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  // Calculate balance
  const balance: Balance = {
    personal: user?.credits || 0,
    agency: 0, // Would come from backend for agency users
    total: (user?.credits || 0),
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

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    // Register with Supabase auth
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          plan_id: data.planId,
          agency_name: data.agencyName,
        },
      },
    });
    if (error) throw error;

    // Create user in backend
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (authData.session?.user) {
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabaseUserId: authData.session.user.id,
            email: data.email,
            fullName: data.fullName,
            role: 'AGENT',
            agencyName: data.agencyName,
            planId: data.planId,
            cycle: data.cycle,
          }),
        });
      }
    } catch (error) {
      console.error('Failed to create user in backend:', error);
      // Non-critical error, continue
    }

    // Referral: credit the referrer if this signup came via ?ref=
    if (data.referralCode) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const newUserId = sessionData.session?.user?.id;
        if (newUserId) {
          await fetch(`${import.meta.env.VITE_API_URL || ''}/api/leads?action=referral`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referrer: data.referralCode, newUserId, newUserEmail: data.email }),
          });
        }
      } catch (refError) {
        console.error('Referral apply failed (non-critical):', refError);
      }
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    import('../lib/analytics').then(m => m.track('google_login')).catch(() => {});
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/payment/callback`,
        scopes: 'profile email',
      },
    });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await fetchUserData(session.user.id);
    }
  }, [fetchUserData]);

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

    const response = await BackendAPI.createSubscription(user.id, planId, cycle);
    if (response.authorization_url) {
      return { authorizationUrl: response.authorization_url };
    }
    throw new Error('Failed to create subscription');
  }, [user]);

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

  const deductCredits = useCallback(async (amount: number, reason: string, metadata?: any): Promise<boolean> => {
    if (!user) return false;
    if (user.credits < amount) {
      throw new Error(`Insufficient credits. You need ${amount} but only have ${user.credits}`);
    }

    try {
      const result = await BackendAPI.deductCredits({
        user_id: user.id,
        amount,
        reason,
        metadata,
      });

      setUser(prev => prev ? { ...prev, credits: result.new_balance } : null);
      return true;
    } catch (error) {
      console.error('Error deducting credits:', error);
      throw error;
    }
  }, [user]);

  const addCredits = useCallback(async (amount: number, source: 'purchase' | 'bonus' | 'gift' | 'refund' | 'subscription', description: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const result = await BackendAPI.addCredits({
        user_id: user.id,
        amount,
        source,
        description,
      });

      setUser(prev => prev ? { ...prev, credits: result.new_balance } : null);
      return true;
    } catch (error) {
      console.error('Error adding credits:', error);
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
      login, register, loginWithGoogle, logout, refresh, acceptPendingAgencyInvite,
      purchaseCredits, setAutoTopup, giftCredits,
      upgradePlan, downgradePlan, acknowledgeLowCredit,
      deductCredits, addCredits,
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
