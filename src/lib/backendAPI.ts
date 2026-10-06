/**
 * Backend API Client
 * Handles communication with Vercel serverless functions
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface CreditDeductRequest {
  user_id: string;
  amount: number;
  reason: string;
  metadata?: any;
  /** 'agency' spends the shared agency pool instead of personal credits */
  pool?: 'personal' | 'agency';
}

export interface CreditAddRequest {
  user_id: string;
  amount: number;
  source: 'purchase' | 'bonus' | 'gift' | 'refund' | 'subscription';
  description: string;
  metadata?: any;
  expires_at?: string;
}

export interface CreditTransferRequest {
  from_user_id: string;
  to_user_id: string;
  amount: number;
  reason?: string;
}

export interface CreditReportResponse {
  success: boolean;
  period: string;
  start_date: string;
  end_date: string;
  current_balance: number;
  total_credits_used: number;
  total_credits_purchased: number;
  credits_by_feature: {
    videoGeneration: number;
    imageEditing: number;
    flashHead: number;
    other: number;
  };
  daily_usage: Array<{
    date: string;
    used: number;
    purchased: number;
  }>;
  average_cost_per_video: number;
  estimated_roi: number;
  transaction_count: number;
}

export interface PaymentInitializeResponse {
  success: boolean;
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaymentVerifyResponse {
  success: boolean;
  credits_added: number;
  new_balance: number;
  reference: string;
}

export const BackendAPI = {
  /**
   * Deduct credits from user account
   */
  async deductCredits(params: CreditDeductRequest) {
    const response = await fetch(`${API_BASE}/api/credits?action=deduct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to deduct credits');
    }

    return response.json();
  },

  /**
   * Add credits to user account
   */
  async addCredits(params: CreditAddRequest) {
    const response = await fetch(`${API_BASE}/api/credits?action=add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add credits');
    }

    return response.json();
  },

  /**
   * Transfer credits between users
   */
  async transferCredits(params: CreditTransferRequest) {
    const response = await fetch(`${API_BASE}/api/credits?action=transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to transfer credits');
    }

    return response.json();
  },

  /**
   * Get credit usage report
   */
  async getCreditReport(userId: string, period: string = '30d'): Promise<CreditReportResponse> {
    const response = await fetch(`${API_BASE}/api/credits?action=report&user_id=${userId}&period=${period}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get credit report');
    }

    return response.json();
  },

  /**
   * Initialize Paystack payment
   */
  async initializePayment(userId: string, credits: number, email: string): Promise<PaymentInitializeResponse> {
    const response = await fetch(`${API_BASE}/api/paystack/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, credits, email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to initialize payment');
    }

    return response.json();
  },

  /**
   * Verify Paystack payment
   */
  async verifyPayment(reference: string): Promise<PaymentVerifyResponse> {
    const response = await fetch(`${API_BASE}/api/paystack/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to verify payment');
    }

    return response.json();
  },

  /**
   * Create subscription
   */
  /**
   * Start pay-before-activate plan checkout. Returns a Paystack hosted
   * authorization_url to redirect to; the callback's server-side verify
   * activates the subscription (action=create is a reference-gated
   * fallback for stale bundles, never a free path).
   */
  async checkoutSubscription(userId: string, planId: string, cycle: 'MONTHLY' | 'ANNUAL') {
    const response = await fetch(`${API_BASE}/api/subscriptions?action=checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, plan_id: planId, cycle }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start checkout');
    }

    return response.json();
  },

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, immediate: boolean = false) {
    const response = await fetch(`${API_BASE}/api/subscriptions?action=cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, immediate }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to cancel subscription');
    }

    return response.json();
  },
};

export default BackendAPI;
