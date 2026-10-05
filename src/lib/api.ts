/**
 * Real-data client for PropReel serverless APIs (DynamoDB-backed).
 * Every call maps 1:1 to a Vercel function in /api.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';
const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

export type ProjectStatus = 'DRAFT' | 'PROCESSING' | 'READY' | 'FAILED';

export interface Project {
  id: string;
  userId: string;
  title: string;
  address: string;
  suburb: string;
  city: string;
  province: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  garages: number;
  propertyType: string;
  features: string[];
  status: ProjectStatus;
  /** REEL = AI video render, FLASHHEAD = Talking Head clip, IMAGE = photo-tool
   *  output (Photo Editor / Staging / Removal / Twilight), SOCIAL = generated
   *  social caption — all stored in My Projects */
  kind?: 'REEL' | 'FLASHHEAD' | 'IMAGE' | 'SOCIAL';
  voice?: string;
  /** Modal job id — lets the reaper reconcile abandoned renders */
  jobId?: string;
  /** Credits reserved for this render — what the reaper refunds if it failed */
  creditsSpent?: number;
  /** Clip runtime in seconds — planned for reels, ffprobe-measured for Talking Head */
  durationSeconds?: number;
  videoTier: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
  /** Portfolio listing extras (Property Listings page) */
  photos?: string[];
  description?: string;
  marketStatus?: 'ACTIVE' | 'DRAFT' | 'SOLD' | 'EXPIRED';
  /** Server-set: has this listing's 2-credit fee ever been charged? `false`
   * only on free wizard drafts — publishing those takes the fee once. */
  listingFeeCharged?: boolean;
  soldAt?: string;
  erfSize?: number;
  floorSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditReportData {
  currentBalance: number;
  totalUsed: number;
  totalPurchased: number;
  transactions: Array<{
    /** Stable ledger id — used as the notification key so "read" sticks */
    id?: string;
    createdAt: string;
    amount: number;
    type?: string;
    description?: string;
    reason?: string;
    kind?: string;
  }>;
  /** Derived client-side from transaction reasons (ledger has no feature column) */
  creditsByFeature: { videoGeneration: number; imageEditing: number; flashHead: number; other: number };
}

export interface ReferralStats {
  /** Friends who signed up with this user's ?ref= link */
  signups: number;
  /** …of whom made their first purchase (referrer has been paid) */
  activated: number;
  /** Signups not yet purchased — each still owes the referrer a payout */
  pending: number;
  pendingCredits: number;
  earnedCredits: number;
  friendCredits: number;
  payoutCredits: number;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const PropReelAPI = {
  // ── Projects (propreel-projects table; per-user HASH key) ──────────────
  async listProjects(userId: string): Promise<Project[]> {
    const data = await j<{ projects: Project[] }>(
      await fetch(`${API_BASE}/api/projects?user_id=${encodeURIComponent(userId)}`)
    );
    return data.projects || [];
  },

  async createProject(input: Omit<Project, 'id' | 'userId' | 'status' | 'videoUrl' | 'thumbnailUrl' | 'createdAt' | 'updatedAt'> & { userId: string; status?: ProjectStatus }): Promise<Project> {
    // API expects snake_case user_id — camelCase userId was rejected with a
    // 400 and swallowed by callers' non-fatal catch, so renders left no
    // project row (dashboard history + reaper reconciliation both broke).
    const { userId, ...rest } = input;
    const data = await j<{ project: Project }>(
      await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, user_id: userId }),
      })
    );
    return data.project;
  },

  async updateProject(userId: string, id: string, updates: Partial<Project>): Promise<Project> {
    const data = await j<{ project: Project }>(
      await fetch(`${API_BASE}/api/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, id, updates }),
      })
    );
    return data.project;
  },

  async deleteProject(userId: string, id: string): Promise<void> {
    await j<{ success: boolean }>(
      await fetch(`${API_BASE}/api/projects?user_id=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    );
  },

  // ── Agency render history (team leads) ───────────────────────────
  async agencyRenderHistory(userId: string): Promise<{
    authorized: boolean;
    agencyName: string | null;
    agentCount: number;
    projects: Array<Project & { agentName?: string; agentAvatar?: string }>;
  }> {
    const data = await j<any>(
      await fetch(`${API_BASE}/api/projects?action=agency_history&user_id=${encodeURIComponent(userId)}`)
    );
    return {
      authorized: !!data.authorized,
      agencyName: data.agencyName ?? null,
      agentCount: data.agentCount ?? 0,
      projects: data.projects || [],
    };
  },

  // ── Credits report (real transaction history) ───────────────────────────
  async creditReport(userId: string, period = '30d'): Promise<CreditReportData> {
    const data = await j<any>(
      await fetch(`${API_BASE}/api/credits?action=report&user_id=${encodeURIComponent(userId)}&period=${period}`)
    );
    const transactions = data.transactions || [];

    // Derive per-feature usage from the transaction reasons we write at
    // deduction time ("Video generation", "Image edit — <preset>", "FlashHead …")
    const creditsByFeature = { videoGeneration: 0, imageEditing: 0, flashHead: 0, other: 0 };
    for (const t of transactions) {
      if (t.amount >= 0) continue;
      const reason = String(t.reason || '').toLowerCase();
      const cost = Math.abs(t.amount);
      if (reason.includes('flashhead')) creditsByFeature.flashHead += cost;
      else if (reason.includes('image edit') || reason.includes('photo')) creditsByFeature.imageEditing += cost;
      else if (reason.includes('video') || reason.includes('render')) creditsByFeature.videoGeneration += cost;
      else creditsByFeature.other += cost;
    }

    return {
      currentBalance: data.current_balance ?? 0,
      totalUsed: data.total_credits_used ?? 0,
      totalPurchased: data.total_credits_purchased ?? 0,
      transactions,
      creditsByFeature,
    };
  },

  // ── Give-5-get-5 referral stats (billing page) ──────────────────────
  async referralStats(userId: string): Promise<ReferralStats> {
    const data = await j<any>(
      await fetch(`${API_BASE}/api/leads?action=referral_stats&user_id=${encodeURIComponent(userId)}`)
    );
    return {
      signups: data.signups ?? 0,
      activated: data.activated ?? 0,
      pending: data.pending ?? 0,
      pendingCredits: data.pendingCredits ?? 0,
      earnedCredits: data.earnedCredits ?? 0,
      friendCredits: data.friendCredits ?? 5,
      payoutCredits: data.payoutCredits ?? 5,
    };
  },

  // ── AI text generation (Grok via Modal's OpenRouter route) ──────────────
  async generateText(
    kind: 'description' | 'social_caption' | 'video_script',
    fields: Record<string, any>,
    images: string[] = []
  ): Promise<string> {
    const { workerHeaders } = await import('./workerAuth');
    const res = await fetch(`${MODAL_ENDPOINT}/generate_text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await workerHeaders()) },
      body: JSON.stringify({ kind, fields, images }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as any));
      throw new Error(err.detail || 'AI generation failed');
    }
    const data = await res.json();
    return data.text || '';
  },

  // ── Account deletion (DynamoDB user row + projects) ──────────────
  async deleteAccount(userId: string): Promise<void> {
    await j<{ success: boolean }>(
      await fetch(`${API_BASE}/api/users?action=delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
    );
  },
};

export default PropReelAPI;
