/**
 * First-party authentication (Supabase-free).
 *
 * - Passwords: scrypt (node:crypto) with a per-user random salt, constant-time
 *   comparison. Stored on the user row as `passwordHash`.
 * - Sessions: opaque 256-bit tokens stored server-side in the DynamoDB
 *   `sessions` table; handed to the browser as an HttpOnly cookie
 *   (`propreel_session`). Lookup is by token id — nothing is forgeable
 *   without database write access.
 * - Email-confirmation / password-reset tokens: single-use rows in the
 *   `settings` table (`emconf_<token>`, `pwreset_<token>`) with expiry,
 *   cross-referenced from the user row so re-sends rotate cleanly.
 *
 * All of it lives in AWS DynamoDB — no third-party auth service.
 */

import crypto from 'crypto';
import { getItem, putItem, deleteItem, updateItem, scanItems, TABLES } from './db';
import type { User } from './userService';

export const SESSION_COOKIE = 'propreel_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CONFIRM_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 60;

// ─── Passwords ───────────────────────────────────────────────────────────────

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p,
  }).toString('base64');
  return `scrypt$${SCRYPT_PARAMS.N}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  if (!stored) return false;
  try {
    const [scheme, nStr, salt, expected] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const actual = crypto.scryptSync(password, salt, 64, {
      N: Number(nStr) || SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p,
    }).toString('base64');
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

const newToken = () => crypto.randomBytes(32).toString('hex');

// ─── Sessions ────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;          // the opaque token (high-entropy, server-side only)
  userId: string;
  createdAt: string;
  expiresAt: number;   // epoch seconds
  /** Sign-in origin — powers the real "Active Sessions" list (never guessed). */
  ip?: string;
  userAgent?: string;
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export async function createSession(userId: string, meta?: SessionMeta): Promise<string> {
  const token = newToken();
  await putItem(TABLES.SESSIONS, {
    id: token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    ...(meta?.ip ? { ip: meta.ip } : {}),
    ...(meta?.userAgent ? { userAgent: meta.userAgent } : {}),
  } as SessionRow);
  return token;
}

/** Client origin of a request (first forwarded IP + browser UA). */
export function clientMeta(req: any): SessionMeta {
  const fwd = req?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const ip = String(raw || req?.socket?.remoteAddress || '')
    .split(',')[0].trim().slice(0, 64) || 'unknown';
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 250);
  return { ip, userAgent: userAgent || undefined };
}

/** Resolve a session token to its user row; null when missing/expired. */
export async function getSessionUser(token: string | undefined | null): Promise<User | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  try {
    const row = await getItem<SessionRow>(TABLES.SESSIONS, { id: token });
    if (!row) return null;
    if (typeof row.expiresAt === 'number' && row.expiresAt < Math.floor(Date.now() / 1000)) {
      // Expired — lazily clean up
      await deleteItem(TABLES.SESSIONS, { id: token }).catch(() => {});
      return null;
    }
    const user = await getItem<User>(TABLES.USERS, { id: row.userId });
    if (!user) return null;
    // Temporary (trial) account soft-deleted at day 7: existing sessions are
    // treated as dead so stale cookies can't outlive the trial. The nightly
    // sweep also revokes the rows themselves — this closes the window before
    // it runs. Re-login (with reactivate) re-enters legitimately.
    const { isTrialLocked } = await import('./trial');
    if (isTrialLocked(user)) return null;
    return user;
  } catch (e) {
    console.error('Session lookup failed:', e);
    return null;
  }
}

export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await deleteItem(TABLES.SESSIONS, { id: token }).catch(() => {});
}

/** Invalidate every session for a user (password reset, account deletion). */
export async function deleteSessionsForUser(userId: string): Promise<void> {
  try {
    const rows = await scanItems<SessionRow>(TABLES.SESSIONS, {
      filter: { expression: 'userId = :u', values: { ':u': userId } },
      limit: 500,
    });
    for (const r of rows) await deleteItem(TABLES.SESSIONS, { id: r.id }).catch(() => {});
  } catch (e) {
    console.error('deleteSessionsForUser failed:', e);
  }
}

// ─── Cookies ─────────────────────────────────────────────────────────────────

function isHttps(req: any): boolean {
  if (req?.headers?.['x-forwarded-proto'] === 'https') return true;
  if (process.env.VERCEL) return true;
  return false;
}

export function sessionCookie(token: string, req?: any): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isHttps(req)) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearSessionCookie(req?: any): string {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) attrs.push('Secure');
  return attrs.join('; ');
}

export function getTokenFromRequest(req: any): string | undefined {
  // Hand-rolled parse: works the same on Vercel, in local harnesses, and
  // behind the vite dev proxy (req.cookies is Vercel-specific).
  const header = req?.headers?.cookie;
  if (!header) return undefined;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim();
  }
  return undefined;
}

// ─── Email-confirmation tokens ───────────────────────────────────────────────

export interface ConfirmTokenRow {
  id: string;             // `emconf_<token>`
  type: 'email_confirm';
  userId: string;
  email: string;
  redirect?: string;      // where the link should land after confirming
  createdAt: string;
  expiresAt: string;      // ISO
}

/**
 * Issue (rotate) a confirmation token for a user. The token is mirrored on
 * the user row (`emailConfirmToken`) so a resend can delete the previous
 * settings row instead of orphaning it.
 */
export async function issueEmailConfirmToken(user: User, redirect?: string): Promise<string> {
  const token = newToken();
  // Rotate: drop any previous token row
  const prev = (user as any).emailConfirmToken as string | undefined;
  if (prev) await deleteItem(TABLES.SETTINGS, { id: `emconf_${prev}` }).catch(() => {});

  const row: ConfirmTokenRow = {
    id: `emconf_${token}`,
    type: 'email_confirm',
    userId: user.id,
    email: user.email,
    redirect,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CONFIRM_TTL_HOURS * 3600 * 1000).toISOString(),
  };
  await putItem(TABLES.SETTINGS, row);
  await updateItem(TABLES.USERS, { id: user.id }, {
    emailConfirmToken: token,
    confirmEmailLastSentAt: new Date().toISOString(),
  } as any);
  return token;
}

export async function consumeEmailConfirmToken(token: string): Promise<ConfirmTokenRow | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const row = await getItem<ConfirmTokenRow>(TABLES.SETTINGS, { id: `emconf_${token}` });
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await deleteItem(TABLES.SETTINGS, { id: row.id }).catch(() => {});
    return null;
  }
  // NOTE: the row is intentionally NOT deleted on use. Mail scanners (Gmail
  // fetches links from unverified senders) and double-clicks used to burn the
  // single-use token before the human arrived → "link invalid" with the
  // account already confirmed. Possession of the emailed link == the person
  // it was sent to, so re-confirming within the 24h TTL stays safe and is
  // idempotent (already-verified users just get a fresh session).
  return row;
}

export async function consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const row = await getItem<any>(TABLES.SETTINGS, { id: `pwreset_${token}` });
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await deleteItem(TABLES.SETTINGS, { id: row.id }).catch(() => {});
    return null;
  }
  // Reusable until the 1-hour expiry for the same reason as the confirm
  // token: link scanners must not be able to burn a reset link before the
  // user clicks it. Every successful reset still kills all sessions, and the
  // row disappears at expiry (lazy).
  return { userId: row.userId };
}

export async function issuePasswordResetToken(user: User): Promise<string> {
  const token = newToken();
  const prev = (user as any).passwordResetToken as string | undefined;
  if (prev) await deleteItem(TABLES.SETTINGS, { id: `pwreset_${prev}` }).catch(() => {});
  await putItem(TABLES.SETTINGS, {
    id: `pwreset_${token}`,
    type: 'password_reset',
    userId: user.id,
    email: user.email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString(),
  });
  await updateItem(TABLES.USERS, { id: user.id }, { passwordResetToken: token } as any);
  return token;
}

// ─── Session gates (IDOR protection) ─────────────────────────────────────────
//
// Identity for data routes comes from the session cookie — never from a
// client-supplied user_id or email query param. Each helper returns a
// ready-to-send failure the handler can send as
// `return res.status(gate.status).json({ error: gate.error })`.

const ADMIN_EMAILS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];

export type SessionGate =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string };

/** Signed-in user for this request, or null (never throws). */
export async function sessionUser(req: any): Promise<User | null> {
  try {
    return await getSessionUser(getTokenFromRequest(req));
  } catch {
    return null;
  }
}

/** Platform admin? Curated email list or the stamped ADMIN role. */
export function isAdminActor(user: User | null | undefined): boolean {
  if (!user) return false;
  return (user.role as string) === 'ADMIN' ||
    ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
}

/**
 * Require a session that OWNS `claimedUserId` (platform admins may act on
 * any id). With no claimed id, any valid session passes.
 */
export async function requireOwner(req: any, claimedUserId?: string | null): Promise<SessionGate> {
  const user = await sessionUser(req);
  if (!user) return { ok: false, status: 401, error: 'Sign in required' };
  if (claimedUserId && user.id !== claimedUserId && !isAdminActor(user)) {
    return { ok: false, status: 403, error: 'Not allowed' };
  }
  return { ok: true, user };
}

/** Require a platform-admin session (for admin dashboards and grants). */
export async function requireAdminSession(req: any): Promise<SessionGate> {
  const user = await sessionUser(req);
  if (!user) return { ok: false, status: 401, error: 'Sign in required' };
  if (!isAdminActor(user)) return { ok: false, status: 403, error: 'Admin access required' };
  return { ok: true, user };
}
