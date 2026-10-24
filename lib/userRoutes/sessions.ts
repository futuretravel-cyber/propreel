/**
 * /api/users — session security + user audit domain.
 *
 * The real Active Sessions list / revocation behind Settings → Security and
 * the per-user audit log built from recorded events (sign-ins, security
 * changes, credit ledger). Dispatched from api/users.ts.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { TABLES, queryItems, queryIndex, scanItems } from '../../lib/db';
import { deleteItem } from '../../lib/db-helpers';
import { getSessionUser, getTokenFromRequest } from '../../lib/auth';

/** Human-readable device label for a stored user-agent string (never guessed). */
function describeUA(ua?: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /curl|node|python|okhttp|axios/i.test(ua) ? 'API client'
    : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}

/** Load the signed-in user's own session rows (never anyone else's). */
async function ownSessionRows(req: VercelRequest) {
  const token = getTokenFromRequest(req);
  const user = await getSessionUser(token);
  if (!user) return null;
  // userId-index GSI keeps this O(user's sessions); scan is the pre-GSI fallback.
  let rows: any[];
  try {
    rows = await queryIndex<any>(TABLES.SESSIONS, 'userId-index',
      { expression: 'userId = :u', values: { ':u': user.id } }, { limit: 200 });
  } catch {
    rows = await scanItems<any>(TABLES.SESSIONS, {
      filter: { expression: 'userId = :u', values: { ':u': user.id } },
      limit: 200,
    });
  }
  return { user, token, rows };
}

/**
 * Nested route: GET /api/users?action=sessions — the real Active Sessions
 * list behind Settings → Security → Sessions. One row per issued session
 * cookie with the IP / user-agent captured at sign-in time; expired rows are
 * dropped and only a token fingerprint leaves the server.
 */
export async function listSessions(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await ownSessionRows(req);
    if (!ctx) return res.status(401).json({ error: 'Sign in to view your active sessions' });
    const nowSec = Math.floor(Date.now() / 1000);
    const sessions = ctx.rows
      .filter((r: any) => typeof r.expiresAt !== 'number' || r.expiresAt > nowSec)
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((r: any) => ({
        id: String(r.id).slice(0, 12), // fingerprint only — the full token stays server-side
        current: r.id === ctx.token,
        createdAt: r.createdAt || null,
        expiresAt: typeof r.expiresAt === 'number' ? new Date(r.expiresAt * 1000).toISOString() : null,
        device: describeUA(r.userAgent),
        userAgent: r.userAgent || null,
        ip: r.ip || null,
      }));
    return res.status(200).json({ sessions });
  } catch (e) {
    console.error('sessions list failed:', e);
    return res.status(500).json({ error: 'Could not load sessions — try again' });
  }
}

/**
 * Nested route: POST /api/users?action=sessions_revoke — revoke one session
 * by fingerprint, or every other session with { scope: 'others' }. The
 * caller's own cookie is never revoked here.
 */
export async function revokeSessions(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { id, scope } = req.body || {};
  if (scope !== 'others' && (typeof id !== 'string' || !id)) {
    return res.status(400).json({ error: 'Provide a session id or scope: "others"' });
  }
  try {
    const ctx = await ownSessionRows(req);
    if (!ctx) return res.status(401).json({ error: 'Sign in to manage your sessions' });
    let revoked = 0;
    for (const r of ctx.rows) {
      if (r.id === ctx.token) continue; // never kill the session making this request
      if (scope === 'others' || String(r.id).startsWith(String(id))) {
        await deleteItem(TABLES.SESSIONS, { id: r.id }).catch(() => {});
        revoked++;
      }
    }
    return res.status(200).json({ success: true, revoked });
  } catch (e) {
    console.error('sessions revoke failed:', e);
    return res.status(500).json({ error: 'Could not revoke sessions — try again' });
  }
}


/** Map a real credit-ledger row to an audit action label. */
function ledgerAction(t: { type?: string }): string {
  switch (t.type) {
    case 'purchase': return 'CREDITS_PURCHASED';
    case 'subscription': return 'SUBSCRIPTION_CREDITS';
    case 'bonus': return 'CREDITS_GRANTED';
    case 'gift': return 'CREDITS_RECEIVED';
    case 'refund': return 'CREDITS_REFUNDED';
    case 'transfer': return 'CREDITS_TRANSFERRED';
    case 'expiration': return 'CREDITS_EXPIRED';
    case 'deduction': return 'CREDITS_USED';
    default: return 'CREDITS_ADJUSTED';
  }
}

/**
 * Nested route: GET /api/users?action=audit_log — the real Audit Log behind
 * Settings → Security → Audit. Built only from data the system actually
 * recorded: sign-in session rows, credit-ledger entries and the
 * password / two-factor change timestamps. Nothing is invented — when there
 * is no event, the log is simply shorter.
 */
export async function auditLog(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await ownSessionRows(req);
    if (!ctx) return res.status(401).json({ error: 'Sign in to view your audit log' });
    const { user } = ctx;

    const txns = await queryItems<any>(TABLES.CREDIT_TRANSACTIONS, {
      expression: 'userId = :u', values: { ':u': user.id },
    }, { limit: 150, scanIndexForward: false });

    const events: any[] = [];

    // Sign-in history — one entry per real session row (newest first later)
    for (const s of ctx.rows) {
      if (!s.createdAt) continue;
      events.push({
        id: `login_${s.createdAt}`,
        action: 'LOGIN',
        category: 'auth',
        severity: 'info',
        description: `Signed in — ${describeUA(s.userAgent)}`,
        ip: s.ip || null,
        timestamp: s.createdAt,
      });
    }

    // Security changes, timestamped at the moment they happened
    if (user.passwordChangedAt) {
      events.push({
        id: `pwd_${user.passwordChangedAt}`,
        action: 'PASSWORD_CHANGED',
        category: 'auth',
        severity: 'warning',
        description: 'Password updated successfully',
        ip: null,
        timestamp: user.passwordChangedAt,
      });
    }
    if (user.twoFactorChangedAt) {
      events.push({
        id: `2fa_${user.twoFactorChangedAt}`,
        action: user.twoFactorEnabled ? 'TWO_FACTOR_ENABLED' : 'TWO_FACTOR_DISABLED',
        category: 'auth',
        severity: 'warning',
        description: user.twoFactorEnabled
          ? 'Two-step verification enabled'
          : 'Two-step verification disabled',
        ip: null,
        timestamp: user.twoFactorChangedAt,
      });
    }

    // Credit ledger — every real balance change
    for (const t of txns) {
      events.push({
        id: t.id || `txn_${t.createdAt}_${t.amount}`,
        action: ledgerAction(t),
        category: 'credits',
        severity: t.amount < 0 ? 'warning' : 'info',
        description: t.description || `${t.amount > 0 ? '+' : ''}${t.amount} credits`,
        ip: null,
        timestamp: t.createdAt,
      });
    }

    events.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return res.status(200).json({ events: events.slice(0, 150), generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('audit_log failed:', e);
    return res.status(500).json({ error: 'Could not load the audit log — try again' });
  }
}
