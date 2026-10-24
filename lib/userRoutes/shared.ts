/**
 * Request helpers shared by the /api/users domain modules (lib/userRoutes/*).
 * Verbatim moves from api/users.ts — behaviour unchanged.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';

/** Read one cookie value by name (hand-rolled — req.cookies is Vercel-only). */
export function readCookie(req: VercelRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Canonical origin for links inside confirmation / reset emails. */
/** Vercel Cron GETs carry this user agent + an x-vercel-cron-schedule header. */
export function isVercelCronRequest(req: VercelRequest): boolean {
  return (
    String(req.headers['user-agent'] || '').startsWith('vercel-cron/') ||
    String(req.headers['x-vercel-cron-schedule'] || '') !== ''
  );
}

export function siteOrigin(req: VercelRequest): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host && host !== 'localhost') {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return `${proto}://${host}`;
  }
  return process.env.VITE_APP_URL || 'https://propreel-xi.vercel.app';
}


/** Client IP for rate-limit keys (first x-forwarded-for hop, else socket). */
export function clientIp(req: VercelRequest): string {
  return String((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown').toLowerCase();
}

/** Shared 429: Retry-After header + friendly message (no enumeration). */
export function tooMany(res: VercelResponse, rl: { retryAfterSec: number }, msg = 'Too many attempts — try again in a few minutes') {
  res.setHeader('Retry-After', String(rl.retryAfterSec));
  return res.status(429).json({ ok: false, error: msg, code: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec });
}
