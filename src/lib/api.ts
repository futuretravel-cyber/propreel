/**
 * Real-data client for PropReel serverless APIs (DynamoDB-backed).
 * Every call maps 1:1 to a Vercel function in /api.
 */
import { useSyncExternalStore } from 'react';

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
    /** Ledger metadata — job_token writes scope/tier here (tier breakdown) */
    metadata?: Record<string, any>;
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
    if (res.status === 429) throw new RateLimitedError(parseRetryAfter(res, err), err.error, err.code);
    throw toApiError(res, err);
  }
  return res.json() as Promise<T>;
}

/** Map a failed API response to the right Error (429 → RateLimitedError). */
export function toApiError(res: Response, body: any): Error {
  if (res.status === 429) return new RateLimitedError(parseRetryAfter(res, body), body?.error, body?.code);
  const err: any = new Error(body?.error || `Request failed (${res.status})`);
  // Machine-readable branch key from the standard { ok, error, code } shape —
  // callers switch on this instead of matching message text.
  err.code = body?.code;
  err.status = res.status;
  return err;
}

// ── Rate-limit awareness (429 from the upload actions) ─────────────────
// The API enforces per-user upload windows and answers 429 with a
// Retry-After header. Rather than failing the upload with a toast, the
// pipeline below waits out the window — broadcasting a live countdown
// through useUploadWait, which every "Uploading…" label subscribes to —
// then retries once. The user's photo simply lands a little later.

export class RateLimitedError extends Error {
  /** seconds until the per-user window resets */
  readonly retryAfterSec: number;
  readonly code: string;
  constructor(retryAfterSec: number, message?: string, code?: string) {
    super(message || `Upload limit reached — try again in ${retryAfterSec}s`);
    this.name = 'RateLimitedError';
    this.retryAfterSec = retryAfterSec;
    this.code = code || 'RATE_LIMITED';
  }
}

function parseRetryAfter(res: Response, body: any): number {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(300, Math.ceil(header));
  // Standard 429 body carries retryAfterSec directly; the regex below is the
  // legacy fallback for older deployments.
  const explicit = Number(body?.retryAfterSec);
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(300, Math.ceil(explicit));
  const match = /in (\d+)s/.exec(String(body?.error || ''));
  return match ? Math.min(300, Number(match[1])) : 60;
}

type UploadWaitListener = (secondsRemaining: number | null) => void;
let uploadWaitSeconds: number | null = null;
const uploadWaitListeners = new Set<UploadWaitListener>();

function setUploadWait(seconds: number | null) {
  uploadWaitSeconds = seconds;
  uploadWaitListeners.forEach(listener => listener(seconds));
}

/** Subscribe to the live countdown while an upload waits out a 429 window. */
export function subscribeUploadWait(listener: UploadWaitListener): () => void {
  uploadWaitListeners.add(listener);
  return () => { uploadWaitListeners.delete(listener); };
}

export function getUploadWait(): number | null {
  return uploadWaitSeconds;
}

/** React view of the countdown — drives the "retrying in Ns" upload labels. */
export function useUploadWait(): number | null {
  return useSyncExternalStore(subscribeUploadWait, getUploadWait);
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Run one upload step; if it comes back rate-limited, wait out the server's
 * Retry-After window (countdown broadcast to every useUploadWait subscriber)
 * and retry that step once. A second 429 propagates so the caller can show
 * the fresh wait — waiting twice would be a multi-minute hang.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof RateLimitedError)) throw err;
    // Retry-After counts down to the boundary; +1s lands safely past it.
    const waitSec = Math.min(300, Math.max(1, err.retryAfterSec)) + 1;
    try {
      for (let remaining = waitSec; remaining > 0; remaining--) {
        setUploadWait(remaining);
        await sleep(1000);
      }
      setUploadWait(null);
      return await fn(); // second 429 (if any) propagates to the caller
    } catch (err2) {
      setUploadWait(null);
      throw err2;
    }
  }
}

export const PropReelAPI = {
  // ── Image uploads: presign → PUT → server-side verification ──────────
  // The bytes go browser→S3 directly, so a plain presigned URL trusts the
  // client completely. This closes the loop: presign validates the declared
  // type and pins Content-Length into the signature (hard 25MB cap), and
  // verify_upload makes the server parse the real header with sharp — SVGs
  // with embedded scripts, HTML or truncated garbage are rejected and
  // deleted, and the stored content-type is normalised to the sniffed
  // format. Throws the server's message when validation fails.
  async uploadImageFile(userId: string | undefined, file: File): Promise<string> {
    const contentType = file.type || 'image/jpeg';
    // Presign and verify are the rate-limited steps (S3's PUT never 429s) —
    // each waits out a limited window and retries once; see withRateLimitRetry.
    const pre = await withRateLimitRetry(async () =>
      j<{ uploadUrl: string; publicUrl: string; key: string }>(
        await fetch(`${API_BASE}/api/music?action=presign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, contentType, size: file.size }),
        })
      )
    );
    const put = await fetch(pre.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);

    await withRateLimitRetry(async () =>
      j(await fetch(`${API_BASE}/api/music?action=verify_upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, key: pre.key }),
      }))
    );
    return pre.publicUrl;
  },

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
    kind: 'description' | 'social_caption' | 'social_pack' | 'video_script' | 'language_check' | 'translate',
    fields: Record<string, any>,
    images: string[] = [],
    /** Optional extra auth headers — the paid video_script path sends the
     *  ONE job token the 1-credit AI Writer charge minted, so the worker
     *  can prove the script was paid for. Other kinds use the free
     *  short-lived worker token as before. */
    extraHeaders: Record<string, string> = {},
    /** Per-call timeout override (ms). Callers don't need this normally —
     *  the kind-based default below covers the worker's own worst case. */
    timeoutMs?: number
  ): Promise<string> {
    // The AI-Writer wedge fix: when a Modal response hung, the client await
    // never settled — spinner stuck, button disabled forever, no error, and
    // the credit refund only fired because the pending fetch happened to be
    // torn down with the page reload. AbortSignal.timeout guarantees the
    // promise settles, so the caller's catch refunds the mint and re-enables
    // the button with an actionable message.
    // Caps chosen against the REAL transport wall, not the worker's budget:
    // Modal's web proxy kills any response at 150 s, and a CORS fetch (the
    // browser → Modal case) gets NO 303-redirect recovery — the connection
    // just drops and the raw error is "Failed to fetch". Aborting slightly
    // under the wall guarantees every long call settles with our actionable
    // timeout message instead of that opaque browser error.
    const limit = timeoutMs ?? (
      kind === 'description' || kind === 'video_script' || kind === 'social_caption' || kind === 'social_pack' ? 145_000
      : 75_000 // language_check / translate are one-shot LLM calls
    );
    const { workerHeaders } = await import('./workerAuth');
    try {
      const res = await fetch(`${MODAL_ENDPOINT}/generate_text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await workerHeaders()), ...extraHeaders },
        body: JSON.stringify({ kind, fields, images }),
        signal: AbortSignal.timeout(limit),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        // The worker sends its reason as `detail` (HTTPException) but auth
        // middleware answers `error` — read both so failures never collapse
        // into a generic message the agent can't act on.
        const msg = err.detail || err.error || (res.status === 401
          ? 'Your sign-in session expired — refresh the page, sign in again, then retry'
          : `AI generation failed (${res.status})`);
        throw new Error(msg);
      }
      const data = await res.json();
      // A 200 with an empty body used to settle silently (the caller wrote ""
      // into its box, or did nothing) — the classic "it spun and nothing
      // happened". Fail loudly so the UI can show why.
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text) throw new Error('The AI returned an empty response — press the button again to retry');
      return text;
    } catch (e: any) {
      // TimeoutError comes from AbortSignal.timeout(); fall through real
      // network/auth errors to their own messages untouched.
      if (e instanceof DOMException && e.name === 'TimeoutError' && `${e.message}`.includes('timed out')) {
        throw new Error(`AI generation took longer than ${Math.round(limit / 1000)}s and was stopped — press the button again to retry`);
      }
      if (e instanceof DOMException && e.name === 'AbortError') {
        // The page tore this request down (route change mid-generation) —
        // same actionable shape rather than a raw "The user aborted a request".
        throw new Error('Generation was interrupted by navigation — press the button again to retry');
      }
      throw e;
    }
  },

  // ── Narrator voice preview (Narakeet sample, S3-cached per pair) ───
  async previewVoice(voice: string, language: string): Promise<string> {
    const { workerHeaders } = await import('./workerAuth');
    const res = await fetch(`${MODAL_ENDPOINT}/tts_preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await workerHeaders()) },
      body: JSON.stringify({ voice, language }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as any));
      throw new Error(err.detail || 'Voice preview failed');
    }
    const data = await res.json();
    if (!data.url) throw new Error('Voice preview returned no audio');
    return data.url as string;
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
