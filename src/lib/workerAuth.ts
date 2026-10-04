/**
 * Short-lived tokens for the Modal render worker.
 *
 * Minted by GET /api/users?action=worker_token (HMAC over the shared
 * RENDER_API_TOKEN secret), sent to the worker as X-PropReel-Token, and
 * verified server-side for signature + 10-minute expiry. The worker URL is
 * public in the bundle — without this, anyone could spend our AI credits.
 *
 * Tokens are cached in-memory across the polling loops (render status polls
 * every 5s — they must not re-mint each time).
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

const HEADER = 'X-PropReel-Token';
/** Refresh a minute before the worker's 10-minute acceptance window closes. */
const REFRESH_MARGIN_MS = 60_000;

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<Record<string, string>> | null = null;

async function mint(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/users?action=worker_token`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`worker token mint failed (${res.status})`);
  const data = await res.json();
  if (!data?.token) throw new Error('worker token mint returned no token');
  const expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 10 * 60_000;
  cached = { token: data.token, expiresAt };
  return { [HEADER]: data.token as string };
}

/**
 * Headers for a worker request. Returns {} only if the mint itself failed —
 * the worker then answers 401 when auth is enforced, which the caller's
 * existing !response.ok error path surfaces.
 */
export async function workerHeaders(): Promise<Record<string, string>> {
  try {
    if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
      return { [HEADER]: cached.token };
    }
    if (!inflight) {
      inflight = mint().finally(() => { inflight = null; });
    }
    return await inflight;
  } catch (e) {
    console.error('worker token mint failed:', e);
    return {};
  }
}
