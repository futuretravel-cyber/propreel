/**
 * Server-side mint of the Modal worker token (X-PropReel-Token).
 *
 * Same scheme as api/users.ts ?action=worker_token — used by cron/reaper
 * paths that call the worker outside the browser. Shares RENDER_API_TOKEN
 * with the render-auth Modal secret. Returns null when the secret is not
 * configured (the worker then only enforces if ITS secret is set).
 */
import { createHmac } from 'crypto';

export function workerToken(ttlSeconds = 600): string | null {
  const secret = process.env.RENDER_API_TOKEN;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const msg = `v1.${exp}.server`;
  const sig = createHmac('sha256', secret).update(msg).digest('base64url');
  return `${msg}.${sig}`;
}

/** Headers object for fetch() — {} when no secret is configured. */
export function workerTokenHeaders(): Record<string, string> {
  const token = workerToken();
  return token ? { 'X-PropReel-Token': token } : {};
}
