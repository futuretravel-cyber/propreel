import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, getUserByEmail } from '../lib/userService';
import { requireAdminSession, sessionUser, isAdminActor } from '../lib/auth';
import { getMaintenanceState } from '../lib/maintenance';
import { isVercelCronRequest } from '../lib/userRoutes/shared';
import {
  authRoutes, provisionUser, safeUser, notificationPreferences, aiNoticeAck,
  updateUserFields, deleteAccount, dataExport, mediaSign,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../lib/userRoutes/auth';
import { tokenRoutes, invoicePdf } from '../lib/userRoutes/credits';
import { listSessions, revokeSessions, auditLog } from '../lib/userRoutes/sessions';
import {
  adminApiKeysRoute, adminStats, listUsers, adminLedger, adminNarakeetUsage,
  imagePresets, pnlRoutes, maintenanceRoute, adminAuditLog, adminUnmatchedPayments,
} from '../lib/userRoutes/admin';
import { agencyRoutes } from '../lib/userRoutes/agency';

// isAdminEmail + ADMIN_EMAILS come from lib/auth — single source of truth.

// Re-exported for scripts and backwards compatibility with api/users.ts's old surface.
export { safeUser, DEFAULT_NOTIFICATION_PREFERENCES };
export { consumeMintQuota } from '../lib/userRoutes/credits';

/**
 * GET    /api/users?email=xxx   → find user by email
 * GET    /api/users?id=xxx      → get user by id
 * POST   /api/users             → create or update a user row (provisioning)
 *
 * Body (POST):
 *   email, fullName, phone?, role?, agencyName?, planId?, cycle?
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.action === 'maintenance') return maintenanceRoute(req, res);
  // ── Update-mode gate (Admin → Update Mode) ───────────────────────────
  // While the row is ON, every non-admin caller gets a 503 across this
  // whole function (nested routes included): the SPA refuses to render
  // anything else and direct callers get the same protocol answer, so the
  // "entire website" is really in update mode, not just the homepage.
  // Exempt: the auth_* family (sign-in/registration/session restore —
  // admins must be able to sign in during a maintenance window and users
  // must be able to see the gate) and this status action itself. The admin
  // check uses the SESSION identity — a claimed admin id in the payload
  // proves nothing. When the mode is OFF (the normal case) this costs one
  // cached settings read (lib/maintenance, 10s TTL).
  const gateAction = String(req.query.action || req.body?.action || '');
  if (!gateAction.startsWith('auth_') && gateAction !== 'maintenance') {
    const maint = await getMaintenanceState();
    if (maint.enabled) {
      const actor = await sessionUser(req);
      if (!actor || !isAdminActor(actor)) {
        return res.status(503).json({
          maintenance: true,
          error: maint.message,
          message: maint.message,
        });
      }
    }
  }

  // Nested routes (function consolidation)
  if (req.query.action === 'preferences') {
    return notificationPreferences(req, res);
  }
  if (req.query.action === 'ai_notice') {
    return aiNoticeAck(req, res);
  }
  if (req.query.action === 'update' && req.method === 'POST') {
    return updateUserFields(req, res);
  }
  if (req.query.action === 'delete' && req.method === 'POST') {
    return deleteAccount(req, res);
  }
  if (req.query.action === 'data_export' && req.method === 'POST') {
    return dataExport(req, res);
  }
  if (req.query.action === 'sessions' && req.method === 'GET') {
    return listSessions(req, res);
  }
  if (req.query.action === 'sessions_revoke' && req.method === 'POST') {
    return revokeSessions(req, res);
  }
  if (req.query.action === 'audit_log' && req.method === 'GET') {
    return auditLog(req, res);
  }
  if (req.query.action === 'admin_audit_log' && req.method === 'GET') return adminAuditLog(req, res);
  if (req.query.action === 'unmatched_payments' && (req.method === 'GET' || req.method === 'POST')) return adminUnmatchedPayments(req, res);
  if (req.query.action === 'admin_api_keys') {
    return adminApiKeysRoute(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'media_sign') return mediaSign(req, res);
  if (req.method === 'GET' && req.query.action === 'invoice_pdf') return invoicePdf(req, res);
  // The daily selftest cron GETs the bare path from vercel.json — no query
  // string, so the schedule can't break on path encoding. Cron requests carry
  // User-Agent vercel-cron/1.0 (or the schedule header), and the target action
  // still enforces its own Bearer CRON_SECRET gate, so faking the UA gains
  // nothing (it just reaches a 401).
  if (!req.query.action && isVercelCronRequest(req)) {
    (req.query as any).action = 'auth_selftest';
  }
  // Token minting (worker_token / job_token — the charge happens there)
  // lives in the credits domain module.
  if (req.query.action === 'worker_token' || req.query.action === 'job_token') {
    return tokenRoutes(req, res, String(req.query.action));
  }
  if (String(req.query.action || '').startsWith('auth_')) {
    return authRoutes(req, res, String(req.query.action));
  }
  if (req.method === 'GET' && req.query.action === 'admin_stats') {
    return adminStats(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'list_users') {
    return listUsers(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'admin_ledger') {
    return adminLedger(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'admin_voice_usage') {
    return adminNarakeetUsage(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'image_presets') {
    return imagePresets(req, res);
  }
  if (String(req.query.action || '').startsWith('pln_')) {
    return pnlRoutes(req, res, String(req.query.action));
  }
  if (String(req.query.action || '').startsWith('agency_') || req.query.action === 'admin_agencies' || req.query.action === 'feature_flags') {
    return agencyRoutes(req, res, String(req.query.action));
  }

  if (req.method === 'GET') {
    const { id, email } = req.query as { id?: string; email?: string };

    if (!id && !email) {
      return res.status(400).json({ error: 'Provide ?id= or ?email=' });
    }

    // Session-or-admin only: the signed-in user may read their own row
    // (by id or email); every other lookup requires a platform admin.
    const actor = await sessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Sign in required' });
    const selfMatch =
      (id && actor.id === id) ||
      (email && String(actor.email || '').toLowerCase() === String(email).toLowerCase());
    if (!selfMatch && !isAdminActor(actor)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    try {
      const user = id ? await getUser(id) : await getUserByEmail(String(email).toLowerCase());
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(200).json(await safeUser(user));
    } catch (error) {
      console.error('Get user error:', error);
      return res.status(500).json({ error: 'Failed to get user' });
    }
  }

  if (req.method === 'POST') {
    // Provisioning is admin-only — unauthenticated POSTs could otherwise
    // mint accounts with an arbitrary `role` (including ADMIN).
    const provisionGate = await requireAdminSession(req);
    if (!provisionGate.ok) return res.status(provisionGate.status).json({ error: provisionGate.error });
    const {
      email,
      fullName,
      phone = null,
      role = 'AGENT',
      agencyName = null,
      planId = null,
      cycle = 'MONTHLY',
    } = req.body || {};

    if (!email || !fullName) {
      return res.status(400).json({ error: 'Missing email or fullName' });
    }

    try {
      const { user, created } = await provisionUser({ email, fullName, phone, role, agencyName, planId, cycle });
      return res.status(created ? 201 : 200).json({ success: true, user: await safeUser(user), created });
    } catch (error) {
      console.error('Create user error:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
