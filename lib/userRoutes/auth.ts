/**
 * /api/users — identity + account self-service domain.
 *
 * First-party auth (register / confirm / login / Google / 2FA / password),
 * account provisioning and the session-gated account routes (profile update,
 * delete, data export, AI-notice ack, notification preferences, media re-sign).
 * Dispatched from api/users.ts — the public route surface is unchanged.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser, getUserByEmail, deleteUser, getOrCreateUserByEmail, deductCredits } from '../../lib/userService';
import { TABLES, queryItems, putItem, scanItems } from '../../lib/db';
import { deleteItem } from '../../lib/db-helpers';
import { hashPassword, verifyPassword, createSession, getSessionUser, deleteSession, deleteSessionsForUser, sessionCookie, clearSessionCookie, getTokenFromRequest, SESSION_COOKIE, clientMeta, issueEmailConfirmToken, consumeEmailConfirmToken, issuePasswordResetToken, consumePasswordResetToken, requireOwner, sessionUser, isAdminActor, ADMIN_EMAILS } from '../../lib/auth';
import { sendEmail, confirmEmailTemplate, resetPasswordTemplate, accountExistsTemplate } from '../../lib/email';
import { generateTotpSecret, verifyTotp, otpauthUrl, randomToken } from '../../lib/totp';
import { consumeRateLimit } from '../../lib/rateLimit';
import { recordCronRun } from '../../lib/cronRuns';
import { rawS3Url, signS3Url, toEdgeUrl } from '../../lib/s3Urls';
import { auditApiResponses, auditStoredRows, type MediaCheck } from '../../lib/mediaAudit';
import { readCookie, siteOrigin, clientIp, tooMany } from './shared';

/**
 * Per-IP signup cap. Offices and carrier NATs legitimately share one
 * address, so this stays generous — what it stops is one host minting
 * throwaway accounts by the hundred, each farming the 5-credit signup
 * bonus and a fresh per-user upload budget.
 */
const REGISTER_RATE_LIMIT = 10;
const REGISTER_RATE_WINDOW_SEC = 3600;


// Admin accounts receive 1000 credits on first sign-in (spec doc)
const ADMIN_GRANT_CREDITS = 1000;

// Default notification preferences applied to new users
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailNotifications: true,
  pushNotifications: true,
  renderComplete: true,
  lowCredits: true,
  newFeatures: true,
  billingAlerts: true,
  marketingEmails: false,
};


/**
 * Agency-invited signup: does the REGISTERING email have a pending agency
 * invite? Used by auth_register (credits come from the agency — no plan,
 * no trial) and by the signup page to pre-fetch the agency banner. A user
 * is eligible only when the invite is pending AND they have no confirmed
 * account yet (existing members join via the normal accept path).
 */
async function findPendingAgencyInvite(email: string): Promise<any | null> {
  const normalized = String(email || '').toLowerCase();
  if (!normalized) return null;
  try {
    const { scanItems, TABLES } = await import('../../lib/db');
    const all = await scanItems<any>(TABLES.SETTINGS, { limit: 300 });
    return all.find(i => i.type === 'agency_invite' && i.status === 'pending' && i.inviteEmail === normalized) || null;
  } catch (e) {
    console.error('findPendingAgencyInvite failed:', e);
    return null;
  }
}


/**
 * Nested route: POST /api/users?action=delete — real account deletion.
 * Removes the DynamoDB user row, the user's projects, and every auth
 * session (so the email can never sign in again). Credits are intentionally
 * forfeited per the deletion flow the user confirms in the UI.
 */
export async function deleteAccount(req: VercelRequest, res: VercelResponse) {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  // Session-or-admin (IDOR fix): this used to run with NO authentication —
  // anyone could POST {user_id} and wipe an arbitrary account (row,
  // projects, sessions). Self or platform admin only.
  const gate = await requireOwner(req, user_id);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

  // Admin → Users → detail may delete any OTHER account, but never its own
  // through this route: nuking the acting admin's session mid-action is
  // always a misclick, and self-deletion has its own confirmed flow at
  // /account/delete (DeleteAccountPage).
  if (isAdminActor(gate.user) && gate.user.id === user_id) {
    return res.status(400).json({ error: 'Use the account delete page to delete your own account' });
  }

  const user = await getUser(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // 1) Delete all of the user's projects
  try {
    const projects = await queryItems(TABLES.PROJECTS, { expression: 'userId = :u', values: { ':u': user_id } });
    for (const p of projects) {
      await deleteItem(TABLES.PROJECTS, { userId: user_id, id: (p as any).id });
    }
  } catch (e) {
    console.error('Project deletion error during account delete:', e);
  }

  // 2) Delete the DynamoDB user row
  await deleteUser(user_id);

  // 3) Revoke every first-party session for the account
  await deleteSessionsForUser(user_id);

  // 3) Admin-action audit (audit §11): server-derived actor, best-effort —
  // an admin deleting an account lands in Admin → Audit exactly like credit
  // grants and subscription changes do. Self-service deletions are not admin
  // actions and are not recorded here.
  if (isAdminActor(gate.user)) {
    const { recordAdminAction } = await import('../../lib/adminAudit');
    await recordAdminAction({
      by: gate.user.email,
      action: 'USER_DELETED',
      target: user_id,
      detail: `Deleted account ${user.email}`,
    });
  }

  console.log(`Account deleted: ${user_id} (${user.email})`);
  return res.status(200).json({ success: true, message: 'Account permanently deleted' });
}


/**
 * Nested route: POST /api/users?action=data_export — POPIA right of access
 * (section 23) + data portability (section 26). Session-authed: returns ONLY
 * the signed-in user's own data (profile with secrets stripped by safeUser,
 * projects, full credit ledger). Agency rows are deliberately excluded —
 * they contain other members' personal information. The client downloads
 * this payload as JSON / derives CSVs from it (SecuritySettings privacy tab).
 */
export async function dataExport(req: VercelRequest, res: VercelResponse) {
  const user = await getSessionUser(getTokenFromRequest(req));
  if (!user) return res.status(401).json({ error: 'Sign in to export your data' });
  try {
    const [projects, transactions] = await Promise.all([
      queryItems<any>(TABLES.PROJECTS, { expression: 'userId = :u', values: { ':u': user.id } }),
      queryItems<any>(TABLES.CREDIT_TRANSACTIONS, { expression: 'userId = :u', values: { ':u': user.id } },
        { limit: 2000, scanIndexForward: false }),
    ]);
    return res.status(200).json({
      service: 'PropReel',
      generatedAt: new Date().toISOString(),
      exportedBy: { id: user.id, email: user.email },
      profile: await safeUser(user),
      projects,
      creditTransactions: transactions,
    });
  } catch (e) {
    console.error('data_export failed:', e);
    return res.status(500).json({ error: 'Data export failed — try again' });
  }
}


/**
 * Nested route: POST /api/users?action=update — whitelisted profile updates.
 */
/**
 * Nested route: GET/POST /api/users?action=ai_notice — the AI-generated-content
 * notice acknowledgement, kept on the user row so it follows the account across
 * devices. Session cookie required; you can only read or write your own.
 *
 * GET  → { version, acknowledgedAt }. `version` is the client's FNV-1a hash of
 *        the exact notice text that was acknowledged — the caller only seeds its
 *        local acknowledgement when that hash matches its live notice, so an
 *        edited notice re-prompts everywhere without any server-side knowledge
 *        of the copy.
 * POST → body { version } records the acknowledgement (idempotent per version:
 *        re-posting the same hash never rewrites the original timestamp).
 */
export async function aiNoticeAck(req: VercelRequest, res: VercelResponse) {
  const user = await getSessionUser(getTokenFromRequest(req));
  if (!user) return res.status(401).json({ error: 'Sign in to sync your acknowledgement' });

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      version: user.aiNoticeAckVersion || null,
      acknowledgedAt: user.aiNoticeAckAt || null,
    });
  }

  if (req.method === 'POST') {
    const version = String((req.body || {}).version || '');
    if (!/^[0-9a-f]{8}$/.test(version)) {
      return res.status(400).json({ error: 'Missing or malformed version' });
    }
    if (user.aiNoticeAckVersion === version && user.aiNoticeAckAt) {
      return res.status(200).json({ success: true, version, acknowledgedAt: user.aiNoticeAckAt, unchanged: true });
    }
    const acknowledgedAt = new Date().toISOString();
    await updateUser(user.id, { aiNoticeAckVersion: version, aiNoticeAckAt: acknowledgedAt });
    return res.status(200).json({ success: true, version, acknowledgedAt });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export async function updateUserFields(req: VercelRequest, res: VercelResponse) {
  const { user_id, updates } = req.body || {};
  if (!user_id || typeof updates !== 'object' || updates === null) {
    return res.status(400).json({ error: 'Missing user_id or updates' });
  }
  // Session-or-admin (IDOR fix): the route used to trust the body's user_id,
  // so an unauthenticated caller could rewrite any account's profile fields.
  const gate = await requireOwner(req, user_id);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
  const user = await getUser(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Only allow safe, self-service fields through
  const allowed = [
    'fullName', 'phone', 'avatarUrl', 'agencyName',
    'autoTopup', 'notificationPreferences', 'businessProfile',
    'agentProfiles',
  ] as const;
  const clean: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) clean[key] = updates[key as keyof typeof updates];
  }
  // Same rule as project rows: the client echoes back whatever URL it was
  // handed, and since the media edge that is a PRESIGNED edge URL. Persist the
  // canonical bucket form (query stripped) or the row freezes an expiring
  // signature that no read path can renew (docs/uploads-origin-isolation.md §5).
  if (typeof clean.avatarUrl === 'string') clean.avatarUrl = rawS3Url(clean.avatarUrl);

  // Agent branding profiles — server-side shape enforcement (cap, field
  // whitelisting, exactly one default) so the user row stays predictable.
  if ('agentProfiles' in clean) {
    const list = Array.isArray(clean.agentProfiles) ? clean.agentProfiles : [];
    let seenDefault = false;
    clean.agentProfiles = list.slice(0, 12).map((p: any) => {
      const isDefault = !!p?.isDefault && !seenDefault;
      if (isDefault) seenDefault = true;
      return {
        id: String(p?.id || `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        profileName: String(p?.profileName || '').slice(0, 120),
        fullName: String(p?.fullName || '').slice(0, 120),
        email: String(p?.email || '').slice(0, 200),
        phone: String(p?.phone || '').slice(0, 40),
        photoUrl: p?.photoUrl ? (rawS3Url(String(p.photoUrl).slice(0, 600)) as string) : undefined,
        logoUrl: p?.logoUrl ? (rawS3Url(String(p.logoUrl).slice(0, 600)) as string) : undefined,
        isDefault,
        includeBranding: p?.includeBranding !== false,
      };
    });
  }

  if (Object.keys(clean).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  await updateUser(user_id, clean as any);
  const updated = await getUser(user_id);
  return res.status(200).json({ success: true, user: await safeUser(updated) });
}


/**
 * Nested route: GET/POST /api/users?action=preferences (moved from the retired
 * /api/notifications/preferences function to stay under the Vercel Hobby cap).
 */
export async function notificationPreferences(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const userId = req.query.user_id as string;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const gate = await requireOwner(req, userId);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ success: true, preferences: user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES });
  }
  if (req.method === 'POST') {
    const { user_id, preferences } = req.body || {};
    if (!user_id || typeof preferences !== 'object' || preferences === null) {
      return res.status(400).json({ error: 'Missing user_id or preferences' });
    }
    const gate = await requireOwner(req, user_id);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
    const user = await getUser(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const cleaned: Record<string, boolean> = { ...(user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES) };
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
      if (key in preferences) cleaned[key] = Boolean(preferences[key]);
    }
    await updateUser(user_id, { notificationPreferences: cleaned });
    return res.status(200).json({ success: true, preferences: cleaned, message: 'Notification preferences saved' });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}


/** Strip auth secrets before a user row leaves the API. */
/**
 * User shape handed to the client: secrets stripped, media RE-SIGNED.
 *
 * Rows store the canonical raw bucket URL (see rawS3Url) — this is the read
 * boundary that turns it into a short-lived edge URL, the same contract
 * signProjectUrls holds for project rows. Without it, a branding photo or
 * avatar stored as an unsigned bucket URL would be served to `<img>` tags as
 * a private-bucket 403 (and an edge URL echoed back by an older client would
 * only live as long as its frozen presign).
 */
export async function safeUser(user: any) {
  if (!user) return user;
  const { passwordHash, emailConfirmToken, passwordResetToken, confirmEmailLastSentAt, twoFactorSecret, twoFactorPendingToken, ...rest } = user;

  const rehost = async (url: any): Promise<any> =>
    typeof url === 'string' && url ? toEdgeUrl((await signS3Url(url)) || url) : url;

  if (rest.avatarUrl) rest.avatarUrl = await rehost(rest.avatarUrl);
  if (Array.isArray(rest.agentProfiles)) {
    rest.agentProfiles = await Promise.all(
      rest.agentProfiles.map(async (p: any) => {
        if (!p || typeof p !== 'object') return p;
        const next = { ...p };
        if (p.photoUrl) next.photoUrl = await rehost(p.photoUrl);
        if (p.logoUrl) next.logoUrl = await rehost(p.logoUrl);
        return next;
      })
    );
  }
  return rest;
}

interface ProvisionInput {
  email: string;
  fullName: string;
  phone?: string | null;
  role?: string;
  agencyName?: string | null;
  planId?: string | null;
  cycle?: string;
  /** True when the address was verified by an IdP (Google) — skips email confirmation. */
  emailVerified?: boolean;
}

/**
 * Idempotent user provisioning shared by POST /api/users and
 * POST ?action=auth_register: one row per email even under concurrent
 * first-login requests, profile refresh, the 5-credit signup bonus and the
 * admin allocation on first creation.
 */
export async function provisionUser(input: ProvisionInput): Promise<{ user: any; created: boolean }> {
  const normalizedEmail = String(input.email).toLowerCase();
  const { user: provisioned, created } = await getOrCreateUserByEmail({
    email: normalizedEmail,
    fullName: input.fullName,
    role: input.role || 'AGENT',
    credits: 0, // bonuses credited separately below
    creditExpiries: [],
    subscription: null,
    autoTopup: { enabled: false, threshold: 50, amount: 200 },
    agencyId: null,
    agencyName: input.agencyName || null,
    avatarUrl: null,
    emailVerified: !!input.emailVerified,
    lastLowCreditWarnedAt: null,
    notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    planId: input.planId || null,
    cycle: input.cycle || 'MONTHLY',
  } as any);

  // Profile fields on an existing row are refreshed either way.
  const profileUpdates: Record<string, any> = { fullName: input.fullName, email: normalizedEmail };
  if (input.agencyName) profileUpdates.agencyName = input.agencyName;
  if (input.phone) profileUpdates.phone = input.phone;
  await updateUser(provisioned.id, profileUpdates);

  if (!created) {
    return { user: (await getUser(provisioned.id)) || provisioned, created: false };
  }

  // Grant 5-credit signup bonus (best effort)
  try {
    const { addCredits, creditTtlIso } = await import('../../lib/userService');
    const bonusExpiry = creditTtlIso(); // credits expire 365 days after grant
    await addCredits(
      provisioned.id,
      5,
      'bonus',
      'Signup bonus — welcome to PropReel!',
      { kind: 'signup_bonus' },
      bonusExpiry
    );

    // Admin accounts: 1000 credits, no expiry (spec doc)
    if (ADMIN_EMAILS.includes(normalizedEmail)) {
      try {
        await addCredits(
          provisioned.id,
          ADMIN_GRANT_CREDITS,
          'bonus',
          'Admin account allocation',
          { kind: 'admin_grant' }
        );
        await updateUser(provisioned.id, { role: 'ADMIN' } as any);
      } catch (adminErr) {
        console.error('Admin credit grant error:', adminErr);
      }
    }
  } catch (bonusError) {
    console.error('Signup bonus error:', bonusError);
  }
  return { user: (await getUser(provisioned.id)) || provisioned, created: true };
}


/** Minimal styled error page for the Google OAuth routes (server-rendered). */
function googleConfigError(titleIn = 'Google sign-in is not configured', detailIn = ''): string {
  // L-5/xss: title and detail are sometimes built from query params
  // (?error_description=…) or provider errors — escape before they land in
  // this HTML page (CSP allows inline script, so an unescaped reflection
  // would execute).
  const esc = (s: string) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const title = esc(titleIn);
  const detail = esc(detailIn);
  return `<!doctype html><html><head><meta charset="utf-8"><title>PropReel — Google sign-in</title></head>
<body style="margin:0;background:#0b0b14;color:#e5e7eb;font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <div style="max-width:420px;padding:32px;background:#151527;border:1px solid #262643;border-radius:16px;text-align:center">
    <div style="font-size:22px;font-weight:bold;margin-bottom:12px">▶ PropReel</div>
    <h1 style="font-size:18px;margin:0 0 8px">${title}</h1>
    <p style="font-size:14px;color:#9a9ab8;line-height:1.6">${detail || 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Vercel, then redeploy — see docs/GOOGLE_AUTH_SETUP.md. Email + password sign-in works in the meantime.'}</p>
    <a href="/login" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#7e22ce;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Back to sign in</a>
  </div>
</body></html>`;
}


// ─── First-party auth routes (Supabase replaced — see lib/auth.ts) ─────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


/**
 * Response-time floors for the existence-sensitive auth actions, measured
 * from authRoutes entry (L-2 residual: the timing oracle).
 *
 * Known-email branches do strictly more work than unknown ones — forgot/
 * resend mint a reset token and call Resend, signup provisions a row — so
 * even with byte-identical bodies a prober could time the difference. Every
 * branch of an action is held until startedAt + floor, which erases any
 * delta below it. Pick a value above the SLOWER branch's typical work: a
 * floor that is exceeded still responds immediately (a late response beats
 * a broken one) and only narrows the guarantee. Cold starts and network sit
 * OUTSIDE the floor and hit both branches equally.
 */const AUTH_FLOOR_LOGIN_MS = 1200;
const AUTH_FLOOR_FORGOT_MS = 2200;
const AUTH_FLOOR_RESEND_MS = 2200;
const AUTH_FLOOR_REGISTER_MS = 4500;

/**
 *   POST auth_register  {email, password, fullName, phone?, planId?, cycle?, redirect?}
 *                        → provisions the row, emails a Resend confirmation link
 *   GET  auth_confirm   &token= → verifies the address, opens a session
 *   POST auth_resend    {email, redirect?} → re-sends the confirmation email
 *   POST auth_login     {email, password} → session cookie
 *   GET  auth_session   → current user from the session cookie (or null)
 *   POST auth_logout    → clears the session
 *   POST auth_forgot    {email} → password-reset email
 *   POST auth_reset     {token, password} → sets a new password, kills sessions
 */
export async function authRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  const authStartedAt = Date.now();
  const holdAuthFloor = async (floorMs: number): Promise<void> => {
    const remain = authStartedAt + floorMs - Date.now();
    if (remain > 0) await new Promise(resolve => setTimeout(resolve, remain));
  };
  try {
    const body = req.body || {};




    // ── POST auth_register ───────────────────────────────────────────
    if (action === 'auth_register') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      // Per-IP cap — every attempt counts (validated or not) so a single
      // host can't grind out accounts. The IP is base64url-encoded because
      // the limiter's row ids strip dots/colons, which would otherwise
      // collide distinct addresses (1.2.3.4 vs 1.23.4).
      const ip = String(
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown'
      ).toLowerCase();
      const rl = await consumeRateLimit('register', Buffer.from(ip).toString('base64url'), REGISTER_RATE_LIMIT, REGISTER_RATE_WINDOW_SEC);
      if (!rl.allowed) {
        const waitSec = Math.max(1, rl.retryAfterSec);
        res.setHeader('Retry-After', String(waitSec));
        return res.status(429).json({ ok: false, error: `Too many signups from this network — try again in ${waitSec}s`, code: 'RATE_LIMITED', retryAfterSec: waitSec });
      }

      const { email, password, fullName, phone = null, agencyName = null, planId = null, cycle = 'MONTHLY', redirect, enableTwoFactor = false, referralCode, startTrial = false, aiAcknowledged = false, termsConsentVersion = null } = body;
      if (!email || !fullName) return res.status(400).json({ error: 'Missing email or fullName' });
      if (!EMAIL_RE.test(String(email))) return res.status(400).json({ error: 'Enter a valid email address' });
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const normalized = String(email).toLowerCase();
      const existing = await getUserByEmail(normalized);
      // Agency-invited signup (SERVER-side accept, not just the client call):
      // a pending invite for this email — and no confirmed account — means
      // this is an invited agent joining their agency. Their credits come
      // from the agency, so plan/trial/referral/agency-name fields are
      // ignored: no subscription prompts, no trial clock, no self-created
      // agency. The invite is accepted right here; the client-side
      // agency_accept_pending call stays as a no-op fallback (idempotent).
      const pendingInvite = existing?.emailVerified ? null : await findPendingAgencyInvite(normalized);
      if (existing?.emailVerified) {
        // Anti-enumeration (L-2): the response is byte-identical to a fresh
        // signup, so probing the register endpoint can never reveal which
        // addresses are taken. The real signal — "you already have an
        // account" with sign-in / reset links — goes to the mailbox itself,
        // where only the owner can read it. A per-address cooldown stops
        // signup being used to bomb an inbox; when it trips we simply skip
        // the mail (silently, since saying so would re-open the oracle).
        const noticeRl = await consumeRateLimit('register_notice', normalized, 3, 3600);
        if (noticeRl.allowed) {
          try {
            const origin = siteOrigin(req);
            const tpl = accountExistsTemplate(`${origin}/login`, `${origin}/forgot-password`);
            const sent = await sendEmail({ to: existing.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
            if (!sent.ok) console.error('Existing-account signup notice failed:', sent.error);
          } catch (noticeErr) {
            console.error('Existing-account signup notice error:', noticeErr);
          }
        }
        await holdAuthFloor(AUTH_FLOOR_REGISTER_MS);
        return res.status(201).json({ success: true, needsConfirmation: true, email: normalized });
      }

      // Provision (creates the row + signup bonus + admin grant) or reuse the
      // still-unconfirmed row (re-register with a corrected password).
      // Invited agents: planId/agencyName stay null at creation — no plan row,
      // no self-created agency — and the invite ACCEPT runs next.
      const { user } = await provisionUser({
        email: normalized,
        fullName,
        phone,
        agencyName: pendingInvite ? null : agencyName,
        planId: pendingInvite ? null : planId,
        cycle,
      });
      if (pendingInvite) {
        try {
          const { addMemberToAgency } = await import('../../lib/agency');
          await addMemberToAgency(pendingInvite.agencyId, user.id, pendingInvite.role || 'AGENT');
          const { updateItem, TABLES } = await import('../../lib/db');
          await updateItem(TABLES.SETTINGS, { id: pendingInvite.id }, { status: 'accepted', acceptedBy: user.id });
          console.log(`Agency invite accepted at signup: ${normalized} → ${pendingInvite.agencyId}`);
        } catch (acceptErr: any) {
          // The invite STAYS pending — the client-side agency_accept_pending
          // fallback (and every later sign-in) retries until it succeeds.
          console.error('Signup-time invite accept failed (invite stays pending):', acceptErr?.message || acceptErr);
        }
      }
      // Signup consent, content-versioned: the client hashes the exact Terms
      // text its checkbox was shown (same self-versioning trick as the AI
      // notice — the server never needs a copy of the Terms). Recorded only
      // when the caller says the box was ticked, and stamped server-side, so
      // an account later knows WHICH Terms it agreed to and when. A missing or
      // malformed hash is stored as null rather than trusted verbatim.
      const consentVersion =
        aiAcknowledged === true && /^[0-9a-f]{8}$/.test(String(termsConsentVersion || ''))
          ? String(termsConsentVersion)
          : null;
      // Password/consent, the trial clock and referral touch DISJOINT
      // attributes on the row, so they run together — both signup branches
      // must do comparable work for the timing floor to hide the difference
      // (this chain used to be ~4 serial round trips longer than the
      // existing-account branch, which the selftest measured as an ~800ms
      // systematic delta).
      await Promise.all([
        updateUser(user.id, {
          passwordHash: await hashPassword(password),
          emailVerified: false,
          ...(enableTwoFactor ? { twoFactorOptIn: true } : {}),
          ...(consentVersion
            ? { termsConsentVersion: consentVersion, termsConsentAt: new Date().toISOString() }
            : {}),
        } as any),
        // Temporary account (opt-in): 7-day trial clock on top of the standard
        // 5-credit signup bonus — no extra credits. Only set when the row is
        // new or has never had a trial, so a re-register can't reset expiry.
        (async () => {
          if (!startTrial) return;
          const freshBefore = await getUser(user.id);
          if (!freshBefore?.trialExpiresAt) {
            const { startTrial: beginTrial } = await import('../../lib/trial');
            await beginTrial(user.id);
          }
        })(),
        // Give 5, get 5: attribute to ?ref= and grant the friend's +5 now; the
        // referrer's +5 is paid on this account's first purchase (lib/referral).
        (async () => {
          const { attributeReferral } = await import('../../lib/referral');
          await attributeReferral(user.id, user.email, referralCode);
        })(),
      ]);
      // provisionUser already returns a freshly-read row — no second read.
      const token = await issueEmailConfirmToken(user, redirect);
      const confirmUrl = `${siteOrigin(req)}/confirm-email?token=${token}`;
      const tpl = confirmEmailTemplate(user.fullName || '', confirmUrl);
      const sent = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
      if (!sent.ok) {
        console.error('Confirmation email failed:', sent.error);
        return res.status(502).json({
          // L-5: provider error stays in the server log — the client gets a
          // generic message it can act on (resend) without leaking internals.
          error: 'Account created, but the confirmation email could not be sent. Use "Resend email" to retry.',
          needsConfirmation: true,
        });
      }
      await holdAuthFloor(AUTH_FLOOR_REGISTER_MS);
      return res.status(201).json({ success: true, needsConfirmation: true, email: user.email });
    }

    // ── GET auth_signup_invite&email= ───────────────────────────────
    // For the signup page: does this email have a PENDING agency invite (and
    // no confirmed account yet)? Returns just what the invite-mode UI needs —
    // agency name, inviter, role, plan. No user data beyond that.
    if (action === 'auth_signup_invite') {
      const email = String(req.query.email || '').toLowerCase();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      const existing = await getUserByEmail(email);
      const invite = existing?.emailVerified ? null : await findPendingAgencyInvite(email);
      if (!invite) return res.status(404).json({ error: 'No pending agency invite for this email' });
      return res.status(200).json({
        agencyId: invite.agencyId,
        agencyName: invite.agencyName || null,
        inviterName: invite.inviterEmail || null,
        role: invite.role || 'AGENT',
        signupUrl: `${siteOrigin(req)}/signup?invite=${encodeURIComponent(email)}`,
      });
    }

    // ── GET auth_confirm&token= ───────────────────────────────────────
    if (action === 'auth_confirm') {
      const token = String(req.query.token || body.token || '');
      const row = await consumeEmailConfirmToken(token);
      if (!row) {
        return res.status(410).json({ error: 'This confirmation link is invalid or has expired. Request a new one.' });
      }
      const user = await getUser(row.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      // Idempotent: scanners / repeat clicks may arrive after the first
      // confirmation — keep the emailed link working until its TTL.
      if (!user.emailVerified) {
        await updateUser(user.id, { emailVerified: true, emailConfirmToken: null } as any);
      }
      const sessionToken = await createSession(user.id, clientMeta(req));
      res.setHeader('Set-Cookie', sessionCookie(sessionToken, req));
      const updated = await getUser(user.id);
      return res.status(200).json({ success: true, redirect: row.redirect || null, user: await safeUser(updated) });
    }

    // ── POST auth_resend {email, redirect?} ───────────────────────────
    if (action === 'auth_resend') {
      // Per-IP ceiling on confirmation re-sends (per-user 30s cooldown below
      // handles the single-mailbox case).
      const ipRl = await consumeRateLimit('resend_ip', clientIp(req), 10, 3600);
      if (!ipRl.allowed) return tooMany(res, ipRl);
      const email = String(body.email || '').toLowerCase();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      const user = await getUserByEmail(email);
      if (user && !user.emailVerified) {
        const last = (user as any).confirmEmailLastSentAt;
        if (last && Date.now() - new Date(last).getTime() < 30_000) {
          return res.status(200).json({ success: true, message: 'A confirmation email was just sent — give it a moment.' });
        }
        const token = await issueEmailConfirmToken(user, body.redirect);
        const tpl = confirmEmailTemplate(user.fullName || '', `${siteOrigin(req)}/confirm-email?token=${token}`);
        const sent = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
        if (!sent.ok) {
          console.error('Confirmation resend failed:', sent.error);
          return res.status(502).json({ error: 'Could not send the email — try again in a moment' });
        }
      }
      // Generic success — never reveals whether the address exists (the
      // floor keeps latency from revealing it either)
      await holdAuthFloor(AUTH_FLOOR_RESEND_MS);
      return res.status(200).json({ success: true, message: 'If that address needs confirmation, the email is on its way.' });
    }

    // ── POST auth_login {email, password} ────────────────────────────
    if (action === 'auth_login') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const email = String(body.email || '').toLowerCase();
      const password = String(body.password || '');

      // Credential-stuffing guard: a per-IP ceiling (office NATs stay well
      // under it) plus a tighter per-account ceiling so one mailbox can't be
      // ground down from many hosts. Fixed 15-min windows, counted before
      // any user lookup so probes are bounded too.
      const ipRl = await consumeRateLimit('login_ip', clientIp(req), 30, 900);
      if (!ipRl.allowed) return tooMany(res, ipRl);
      if (email) {
        const acctRl = await consumeRateLimit('login_email', email, 10, 900);
        if (!acctRl.allowed) return tooMany(res, acctRl, 'Too many sign-in attempts for this account — try again in a few minutes');
      }

      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        // Equalize timing so probing can't distinguish unknown emails
        await verifyPassword(password, 'scrypt$16384$dummy$dummy');
        await holdAuthFloor(AUTH_FLOOR_LOGIN_MS);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!(await verifyPassword(password, user.passwordHash))) {
        await holdAuthFloor(AUTH_FLOOR_LOGIN_MS);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!user.emailVerified) {
        return res.status(403).json({
          ok: false,
          error: 'Confirm your email first — open the confirmation link we sent you.',
          code: 'EMAIL_NOT_CONFIRMED',
        });
      }

      // Expired temporary account: sign-in is locked until they subscribe.
      // reactivate:true (correct password already verified above) lets them
      // back in to browse/pay — rendering stays blocked by deductCredits.
      {
        const { isTrialLocked } = await import('../../lib/trial');
        if (isTrialLocked(user as any)) {
          if (body.reactivate !== true) {
            return res.status(403).json({
              ok: false,
              error: 'Your 7-day trial has ended. Sign in again with "Keep browsing" to review your account, or subscribe to restore full access.',
              code: 'TRIAL_EXPIRED',
            });
          }
          await updateUser(user.id, { trialReactivatedAt: new Date().toISOString() } as any);
          user.trialReactivatedAt = new Date().toISOString();
        }
      }

      // Two-step verification: password OK, but the authenticator code is
      // still required — issue a 5-minute pending challenge instead of a session.
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const pending = randomToken();
        await updateUser(user.id, {
          twoFactorPendingToken: pending,
          twoFactorPendingExpires: new Date(Date.now() + 5 * 60_000).toISOString(),
        } as any);
        return res.status(200).json({ requires2fa: true, token: pending });
      }

      const sessionToken = await createSession(user.id, clientMeta(req));
      res.setHeader('Set-Cookie', sessionCookie(sessionToken, req));
      // Signed up with the two-step checkbox but not configured yet → land on setup.
      if (user.twoFactorOptIn && !user.twoFactorEnabled) {
        return res.status(200).json({ success: true, setupRequired: true, user: await safeUser(user) });
      }
      return res.status(200).json({ success: true, user: await safeUser(user) });
    }

    // ── GET auth_session ──────────────────────────────────────────────
    // ── Google OAuth (authorization code flow, first-party) ────────
    // Restored after Supabase's retirement removed the hosted Google button.
    // Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (docs/GOOGLE_AUTH_SETUP.md).
    if (action === 'auth_google_start') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return res.status(503).send(googleConfigError());
      }
      const redirect = String(req.query.redirect || '/dashboard');
      const safe = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard';
      // CSRF guard: bind a one-time nonce into both the state param and an
      // HttpOnly cookie; the callback rejects any state whose nonce mismatches.
      const nonce = randomToken();
      const cookieAttrs = [
        `propreel_oauth_state=${nonce}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=600',
      ];
      if (String(req.headers['x-forwarded-proto'] || 'https') === 'https' || process.env.VERCEL) cookieAttrs.push('Secure');
      res.setHeader('Set-Cookie', cookieAttrs.join('; '));
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${siteOrigin(req)}/api/users?action=auth_google_callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state: `${nonce}:${safe}`,
        prompt: 'select_account',
      });
      return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    }

    if (action === 'auth_google_callback') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return res.status(503).send(googleConfigError());

      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      if (!code) {
        const detail = String(req.query.error_description || req.query.error || 'Missing authorization code');
        return res.status(400).send(googleConfigError('Google sign-in failed', detail));
      }

      // CSRF guard: the nonce in state must match the cookie we set on start.
      const sep = state.indexOf(':');
      const stateNonce = sep > 0 ? state.slice(0, sep) : '';
      const dest = sep > 0 && state.slice(sep + 1).startsWith('/') && !state.slice(sep + 1).startsWith('//')
        ? state.slice(sep + 1)
        : '/dashboard';
      const cookieNonce = readCookie(req, 'propreel_oauth_state');
      if (!stateNonce || !cookieNonce || stateNonce !== cookieNonce) {
        return res.status(400).send(googleConfigError(
          'Google sign-in could not be verified',
          'This sign-in attempt expired or was initiated from another tab. Please try again.'
        ));
      }
      // One-time use — clear it whether the rest of the flow succeeds or not.
      // (Re-set as an array when the session cookie is issued below so both land.)
      let clearOauthCookie: string;
      {
        const clearAttrs = ['propreel_oauth_state=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
        if (String(req.headers['x-forwarded-proto'] || 'https') === 'https' || process.env.VERCEL) clearAttrs.push('Secure');
        clearOauthCookie = clearAttrs.join('; ');
        res.setHeader('Set-Cookie', clearOauthCookie);
      }

      try {
        // 1) Code → tokens (server-side exchange; secret never reaches the client)
        const tokRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: `${siteOrigin(req)}/api/users?action=auth_google_callback`,
            grant_type: 'authorization_code',
          }),
        });
        if (!tokRes.ok) {
          const errBody = await tokRes.json().catch(() => ({} as any));
          return res.status(400).send(googleConfigError('Google token exchange failed', String(errBody.error_description || errBody.error || tokRes.status)));
        }
        const tok = await tokRes.json();

        // 2) access_token → verified profile (Google-asserted)
        const uiRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        if (!uiRes.ok) {
          return res.status(400).send(googleConfigError('Google profile lookup failed', String(uiRes.status)));
        }
        const profile = await uiRes.json();
        const email = String(profile.email || '').toLowerCase();
        if (!email || profile.email_verified === false) {
          return res.status(400).send(googleConfigError('Google account not verified', 'Use a Google account with a verified email address.'));
        }

        // 3) Find-or-create the account. Google asserts email_verified, so
        //    these users are emailVerified — otherwise password login would be
        //    permanently blocked while Resend stays unverified (it isn't).
        const existing = await getUserByEmail(email);
        let user = existing || (await provisionUser({
          email,
          fullName: String(profile.name || email).slice(0, 120),
          role: 'AGENT',
          emailVerified: true,
        })).user;
        if (existing && !existing.emailVerified) {
          await updateUser(existing.id, { emailVerified: true } as any);
          user = { ...existing, emailVerified: true };
        }

        // 3b) Expired temporary account → send back to login with a clear reason
        //     (the OAuth state carries no reactivate flag; password login does).
        {
          const { isTrialLocked } = await import('../../lib/trial');
          if (isTrialLocked(user as any)) {
            return res.redirect(302, '/login?trial=expired');
          }
        }

        // 4) First-party session + land on the requested destination
        const token = await createSession(user.id, clientMeta(req));
        res.setHeader('Set-Cookie', [sessionCookie(token, req), clearOauthCookie]);
        return res.redirect(302, dest);
      } catch (oauthErr: any) {
        console.error('Google OAuth error:', oauthErr);
        console.error('Google OAuth exchange failed:', oauthErr);
        return res.status(500).send(googleConfigError('Google sign-in failed', 'This sign-in could not be completed — please try again, or use your email and password.'));
      }
    }

    if (action === 'auth_session') {
      const user = await getSessionUser(getTokenFromRequest(req));
      return res.status(200).json({ user: user ? await safeUser(user) : null });
    }

    // ── POST auth_logout ──────────────────────────────────────────────
    if (action === 'auth_logout') {
      await deleteSession(getTokenFromRequest(req));
      res.setHeader('Set-Cookie', clearSessionCookie(req));
      return res.status(200).json({ success: true });
    }

    // ── POST auth_forgot {email} ──────────────────────────────────────
    if (action === 'auth_forgot') {
      // Email-bombing / enumeration guard: few reset mails per IP per hour,
      // a couple per address. Responses stay generic either way.
      const ipRl = await consumeRateLimit('forgot_ip', clientIp(req), 5, 3600);
      if (!ipRl.allowed) return tooMany(res, ipRl);
      const email = String(body.email || '').toLowerCase();
      if (EMAIL_RE.test(email)) {
        const emRl = await consumeRateLimit('forgot_email', email, 3, 3600);
        if (!emRl.allowed) return tooMany(res, emRl);
      }
      const user = EMAIL_RE.test(email) ? await getUserByEmail(email) : null;
      if (user) {
        const token = await issuePasswordResetToken(user);
        const tpl = resetPasswordTemplate(`${siteOrigin(req)}/reset-password?token=${token}`);
        const sent = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
        if (!sent.ok) console.error('Password-reset email failed:', sent.error);
      }
      await holdAuthFloor(AUTH_FLOOR_FORGOT_MS);
      return res.status(200).json({ success: true, message: 'If that address has an account, a reset link is on its way.' });
    }

    // ── POST auth_reset {token, password} ─────────────────────────────
    if (action === 'auth_reset') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const token = String(body.token || '');
      const password = String(body.password || '');
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const row = await consumePasswordResetToken(token);
      if (!row) return res.status(410).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
      await updateUser(row.userId, { passwordHash: await hashPassword(password), passwordResetToken: null, twoFactorEnabled: false, twoFactorSecret: null, twoFactorOptIn: false, twoFactorPendingToken: null, passwordChangedAt: new Date().toISOString() } as any);
      await deleteSessionsForUser(row.userId);
      return res.status(200).json({ success: true });
    }

    // ── POST auth_2fa_setup (session) — mint a fresh TOTP secret ───────
    if (action === 'auth_2fa_setup') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const sessionUser = await getSessionUser(getTokenFromRequest(req));
      if (!sessionUser) return res.status(401).json({ error: 'Sign in to manage two-step verification' });
      const secret = generateTotpSecret();
      await updateUser(sessionUser.id, { twoFactorSecret: secret, twoFactorEnabled: false } as any);
      return res.status(200).json({ success: true, secret, otpauthUrl: otpauthUrl(sessionUser.email, secret) });
    }

    // ── POST auth_2fa_confirm {code} (session) — activate ──────────────
    if (action === 'auth_2fa_confirm') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const sessionUser = await getSessionUser(getTokenFromRequest(req));
      if (!sessionUser) return res.status(401).json({ error: 'Sign in to manage two-step verification' });
      if (!sessionUser.twoFactorSecret) return res.status(400).json({ error: 'Start the setup first' });
      if (!verifyTotp(sessionUser.twoFactorSecret, body.code)) {
        return res.status(400).json({ error: 'Invalid code — check your authenticator app and try again' });
      }
      const updated = await updateUser(sessionUser.id, { twoFactorEnabled: true, twoFactorOptIn: false, twoFactorChangedAt: new Date().toISOString() } as any);
      return res.status(200).json({ success: true, user: await safeUser(updated) });
    }

    // ── POST auth_2fa_disable {code} (session) ─────────────────────────
    if (action === 'auth_2fa_disable') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const sessionUser = await getSessionUser(getTokenFromRequest(req));
      if (!sessionUser) return res.status(401).json({ error: 'Sign in to manage two-step verification' });
      if (!sessionUser.twoFactorEnabled) return res.status(400).json({ error: 'Two-step verification is not enabled' });
      if (!verifyTotp(sessionUser.twoFactorSecret || '', body.code)) {
        return res.status(400).json({ error: 'Invalid code — enter the current code from your authenticator app' });
      }
      const updated = await updateUser(sessionUser.id, { twoFactorEnabled: false, twoFactorSecret: null, twoFactorOptIn: false, twoFactorChangedAt: new Date().toISOString() } as any);
      return res.status(200).json({ success: true, user: await safeUser(updated) });
    }

    // ── POST auth_2fa_skip (session) — "set up later" after signup ─────
    if (action === 'auth_2fa_skip') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const sessionUser = await getSessionUser(getTokenFromRequest(req));
      if (!sessionUser) return res.status(401).json({ error: 'Sign in required' });
      await updateUser(sessionUser.id, { twoFactorOptIn: false } as any);
      return res.status(200).json({ success: true });
    }

    // ── POST auth_2fa_verify {email, token, code} — sign-in challenge ──
    if (action === 'auth_2fa_verify') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      // TOTP brute-force guard: the pending challenge lives 5 minutes, so
      // these windows let a human retry a typo a few times while capping a
      // code-guessing run at a handful of tries per account.
      const ipRl = await consumeRateLimit('2fa_ip', clientIp(req), 30, 900);
      if (!ipRl.allowed) return tooMany(res, ipRl);
      const email = String(body.email || '').toLowerCase();
      if (email) {
        const acctRl = await consumeRateLimit('2fa_email', email, 15, 900);
        if (!acctRl.allowed) return tooMany(res, acctRl, 'Too many verification attempts — try again in a few minutes');
      }
      const token = String(body.token || '');
      const pendingUser = email ? await getUserByEmail(email) : null;
      const expires = pendingUser ? Date.parse(pendingUser.twoFactorPendingExpires || '') : NaN;
      if (!pendingUser || !token || pendingUser.twoFactorPendingToken !== token || Number.isNaN(expires) || expires < Date.now()) {
        return res.status(400).json({ error: 'This verification expired — sign in again' });
      }
      if (!verifyTotp(pendingUser.twoFactorSecret || '', body.code)) {
        return res.status(401).json({ error: 'Invalid code — check your authenticator app' });
      }
      // Trial lock mirrors auth_login: blocked unless explicitly reactivating.
      {
        const { isTrialLocked } = await import('../../lib/trial');
        if (isTrialLocked(pendingUser as any)) {
          if (body.reactivate !== true) {
            return res.status(403).json({
              ok: false,
              error: 'Your 7-day trial has ended. Sign in again with "Keep browsing" to review your account, or subscribe to restore full access.',
              code: 'TRIAL_EXPIRED',
            });
          }
          await updateUser(pendingUser.id, { trialReactivatedAt: new Date().toISOString() } as any);
        }
      }
      await updateUser(pendingUser.id, { twoFactorPendingToken: null, twoFactorPendingExpires: null } as any);
      const sessionToken = await createSession(pendingUser.id, clientMeta(req));
      res.setHeader('Set-Cookie', sessionCookie(sessionToken, req));
      return res.status(200).json({ success: true, user: await safeUser(pendingUser) });
    }

    // ── POST auth_selftest (Bearer CRON_SECRET) — enumeration selftest ────
    // Operator-triggered (same bearer gate as the Paystack webhook selftest)
    // and repeatable: it asserts against THIS deployment that known and
    // unknown emails get byte-identical responses on login, forgot-password
    // and signup — the property the L-2 anti-enumeration fix depends on. Any
    // future edit that reintroduces an oracle (distinct message, status or
    // body) fails here instead of in the wild.
    //
    // Side effects, all deliberate and none reaching a human: a stable
    // enumeration-selftest@invalid.test account is provisioned once and kept;
    // probe mail for known addresses goes to that nonexistent mailbox; the
    // throwaway row the unknown-signup probe creates is deleted on the way
    // out. A pair that trips a rate limit reports `skipped`, never a false
    // failure. Invoke:
    //   curl -X POST '…/api/users?action=auth_selftest' -H "Authorization: Bearer $CRON_SECRET"
    if (action === 'auth_selftest') {
      const secret = process.env.CRON_SECRET;
      if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not configured' });
      if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

      const origin = siteOrigin(req);
      const KNOWN_EMAIL = 'enumeration-selftest@invalid.test';
      const UNKNOWN_EMAIL = `enumeration-unknown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@invalid.test`;
      const WRONG_PASSWORD = 'selftest-this-is-never-the-password';

      // The known account must be verified AND password-hashed: a missing
      // hash short-circuits login into the same branch as an unknown email,
      // so the login pair would pass without testing anything.
      try {
        const known = await getUserByEmail(KNOWN_EMAIL);
        if (!known) {
          const now = new Date().toISOString();
          await putItem(TABLES.USERS, {
            id: `usr_selftest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            email: KNOWN_EMAIL,
            fullName: 'Enumeration Selftest',
            credits: 0,
            emailVerified: true,
            passwordHash: await hashPassword(`${randomToken()}${randomToken()}`),
            createdAt: now,
            updatedAt: now,
          } as any);
        } else if (!known.emailVerified || !known.passwordHash) {
          await updateUser(known.id, {
            emailVerified: true,
            ...(known.passwordHash ? {} : { passwordHash: await hashPassword(`${randomToken()}${randomToken()}`) }),
          } as any);
        }
      } catch (e) {
        console.error('auth_selftest provisioning failed:', e);
        return res.status(500).json({ error: 'Could not provision the selftest account' });
      }

      async function probe(actionName: string, body: Record<string, unknown>, email: string) {
        const started = Date.now();
        try {
          const r = await fetch(`${origin}/api/users?action=${actionName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, email }),
            signal: AbortSignal.timeout(20_000),
          });
          const text = await r.text();
          return { status: r.status, text, ms: Date.now() - started, headers: r.headers };
        } catch (e: any) {
          return { status: 0, text: `probe failed: ${e?.message || e}`, ms: Date.now() - started, headers: null };
        }
      }

      // ── header invariants ──────────────────────────────────────────
      // Two different contracts, both asserted below:
      //   app surfaces (API + static): X-Frame-Options DENY + CSP
      //   frame-ancestors 'none' + HSTS + nosniff. The app CSP is NOT
      //   sandboxed — the SPA needs its scripts — so framing is stopped by
      //   frame-ancestors instead.
      //   media edge: the sandbox CSP lives HERE (hostile-by-default bytes)
      //   plus frame-ancestors, HSTS, nosniff and no-referrer.
      type HeaderCheck = { surface: string; ok?: boolean; problems?: string[]; skipped?: string };

      const appHeaderProblems = (h: Headers): string[] => {
        const problems: string[] = [];
        const xfo = h.get('x-frame-options');
        const csp = h.get('content-security-policy') || '';
        const hsts = h.get('strict-transport-security') || '';
        const nosniff = h.get('x-content-type-options');
        if (xfo !== 'DENY') problems.push(`X-Frame-Options=${xfo ?? '(missing)'}`);
        if (!csp.includes("frame-ancestors 'none'")) problems.push('CSP missing frame-ancestors \'none\'');
        if (!/max-age=\d+/.test(hsts)) problems.push(`HSTS=${hsts || '(missing)'}`);
        if (nosniff !== 'nosniff') problems.push(`X-Content-Type-Options=${nosniff ?? '(missing)'}`);
        return problems;
      };

      const edgeHeaderProblems = (h: Headers): string[] => {
        const problems = appHeaderProblems(h);
        const csp = h.get('content-security-policy') || '';
        if (!/\bsandbox\b/.test(csp)) problems.push('edge CSP missing sandbox');
        if ((h.get('referrer-policy') || '') !== 'no-referrer') {
          problems.push(`Referrer-Policy=${h.get('referrer-policy') ?? '(missing)'}`);
        }
        return problems;
      };

      const pairs = [
        { name: 'login', actionName: 'auth_login', body: { password: WRONG_PASSWORD } },
        { name: 'forgot', actionName: 'auth_forgot', body: {} },
        {
          name: 'signup',
          actionName: 'auth_register',
          body: { password: 'Selftest!pass9x', fullName: 'Enumeration Selftest', aiAcknowledged: false, startTrial: false },
        },
      ];

      const checks: any[] = [];
      const headerChecks: HeaderCheck[] = [];
      for (const p of pairs) {
        const knownRes = await probe(p.actionName, p.body, KNOWN_EMAIL);
        const unknownRes = await probe(p.actionName, p.body, UNKNOWN_EMAIL);
        // The responses may differ ONLY by the echo of the submitted address —
        // normalise that out, then require identical status AND identical bytes.
        const knownBody = knownRes.text.split(KNOWN_EMAIL).join('<EMAIL>');
        const unknownBody = unknownRes.text.split(UNKNOWN_EMAIL).join('<EMAIL>');
        const rateLimited = knownRes.status === 429 || unknownRes.status === 429;
        const unreachable = knownRes.status === 0 || unknownRes.status === 0;
        const identical = !rateLimited && !unreachable && knownRes.status === unknownRes.status && knownBody === unknownBody;
        checks.push({
          name: p.name,
          knownStatus: knownRes.status,
          unknownStatus: unknownRes.status,
          identical,
          msKnown: knownRes.ms,
          msUnknown: unknownRes.ms,
          ...(rateLimited ? { skipped: 'rate limited — run again later' } : {}),
          ...(unreachable ? { failed: 'probe could not reach the API' } : {}),
          // The signup pair additionally proves the 409 oracle stays closed.
          ...(p.name === 'signup' && !rateLimited && !unreachable
            ? { no409: knownRes.status !== 409 && unknownRes.status !== 409 }
            : {}),
        });
        // Every probe response carries the platform headers (vercel.json
        // applies them even to 429s) — assert the invariants on each one.
        for (const which of ['known', 'unknown'] as const) {
          const r = which === 'known' ? knownRes : unknownRes;
          const surface = `api:${p.name}/${which}`;
          if (!r.headers) {
            headerChecks.push({ surface, skipped: 'probe unreachable' });
            continue;
          }
          const problems = appHeaderProblems(r.headers);
          headerChecks.push({ surface, ...(problems.length ? { ok: false, problems } : { ok: true }) });
        }
      }

      // The unknown-signup probe provisions a throwaway account — remove it
      // (plus its bonus ledger row and any event locks) so runs stay idempotent.
      let unknownRemoved = false;
      try {
        const created = await getUserByEmail(UNKNOWN_EMAIL);
        if (created) {
          const txns = await queryItems<any>(TABLES.CREDIT_TRANSACTIONS, {
            expression: 'userId = :u',
            values: { ':u': created.id },
          });
          for (const t of txns) {
            await deleteItem(TABLES.CREDIT_TRANSACTIONS, { userId: t.userId, createdAt: t.createdAt });
          }
          const locks = (await scanItems<any>(TABLES.SETTINGS, { limit: 2000 })).filter(r =>
            JSON.stringify(r).includes(created.id)
          );
          for (const l of locks) await deleteItem(TABLES.SETTINGS, { id: l.id });
          await deleteUser(created.id);
          unknownRemoved = true;
        }
      } catch (e) {
        console.error('auth_selftest cleanup failed:', e);
      }

      // Canonical app origin — the page a clickjacking frame would target.
      try {
        const page = await fetch('https://www.propreel.co.za/', { signal: AbortSignal.timeout(15_000) });
        await page.text();
        const problems = appHeaderProblems(page.headers);
        headerChecks.push({ surface: 'static:www', ...(problems.length ? { ok: false, problems } : { ok: true }) });
      } catch (e: any) {
        headerChecks.push({ surface: 'static:www', skipped: `unreachable: ${e?.message || e}` });
      }

      // Media edge: sandbox CSP must hold here, and an UNSIGNED GET must
      // stay a 4xx — a 200 would mean the buckets are public again (M-5).
      const edgeHosts: Array<[string, string | undefined]> = [
        ['raw', process.env.EDGE_RAW_HOST],
        ['cdn', process.env.EDGE_CDN_HOST],
      ];
      for (const [name, host] of edgeHosts) {
        const h = String(host || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        if (!h) {
          headerChecks.push({ surface: `edge:${name}`, skipped: 'EDGE host unset' });
          continue;
        }
        try {
          const r = await fetch(`https://${h}/__selftest__`, { signal: AbortSignal.timeout(15_000) });
          await r.text();
          const problems = edgeHeaderProblems(r.headers);
          if (r.status < 400) problems.push(`unsigned edge GET returned ${r.status} — bucket may be public`);
          headerChecks.push({ surface: `edge:${name}`, ...(problems.length ? { ok: false, problems } : { ok: true }) });
        } catch (e: any) {
          headerChecks.push({ surface: `edge:${name}`, skipped: `unreachable: ${e?.message || e}` });
        }
      }

      // ── media invariants (lib/mediaAudit) ─────────────────────────────
      // Two assertions, both silent until they break:
      //   • no API response may hand the client a BUCKET hostname — the
      //     browser must only ever see the media origin (uploads./cdn.),
      //   • no stored row may keep a signed URL — a frozen presign no read
      //     path can renew (the Phase-3 defect), nor an edge host, which
      //     server-side consumers (worker fetch_media, zip, reaper) resolve
      //     buckets past.
      // The projects probe plants a row in canonical bucket form and reads
      // it back through the real API with a real session: row → response →
      // media origin, signed, byte-checked at the boundary.
      const mediaChecks: MediaCheck[] = [];
      let probeProjectId = '';
      let probeSessionToken = '';
      try {
        const knownUser = await getUserByEmail(KNOWN_EMAIL);
        if (!knownUser) throw new Error('selftest account missing');
        const now = new Date().toISOString();
        probeProjectId = `prj_selftest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const region = process.env.AWS_REGION || 'af-south-1';
        const rawBucket = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
        const outBucket = process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa';
        await putItem(TABLES.PROJECTS, {
          userId: knownUser.id,
          id: probeProjectId,
          title: 'Media selftest probe',
          status: 'READY',
          kind: 'REEL',
          // Canonical bucket form, unsigned — exactly what a write boundary
          // must produce, and what every read must re-sign.
          photos: [`https://${rawBucket}.s3.${region}.amazonaws.com/_selftest/photo.jpg`],
          videoUrl: `https://${outBucket}.s3.${region}.amazonaws.com/_selftest/video.mp4`,
          thumbnailUrl: `https://${outBucket}.s3.${region}.amazonaws.com/_selftest/thumb.jpg`,
          createdAt: now,
          updatedAt: now,
        } as any);
        probeSessionToken = await createSession(knownUser.id, clientMeta(req));
        const [responseChecks, rowChecks] = await Promise.all([
          auditApiResponses(origin, `${SESSION_COOKIE}=${probeSessionToken}`, {
            userId: knownUser.id,
            probeProjectId,
          }),
          auditStoredRows(),
        ]);
        mediaChecks.push(...responseChecks, ...rowChecks);
      } catch (e: any) {
        // A crash here is a failure, never a silent skip — an audit that
        // cannot run must not read as a pass.
        mediaChecks.push({ name: 'media:audit', ok: false, detail: `media audit failed: ${e?.message || e}` });
      } finally {
        // The probe project + session exist only for the duration of this
        // run. Sweep by prefix, not just by id: if a previous run was
        // killed mid-flight (function timeout), its probe row would
        // otherwise linger in the selftest account forever.
        try {
          const knownUser = await getUserByEmail(KNOWN_EMAIL);
          if (knownUser) {
            const stale = await queryItems<any>(TABLES.PROJECTS, {
              expression: 'userId = :u',
              values: { ':u': knownUser.id },
            });
            for (const p of stale) {
              if (typeof p?.id === 'string' && p.id.startsWith('prj_selftest_')) {
                await deleteItem(TABLES.PROJECTS, { userId: knownUser.id, id: p.id });
              }
            }
          }
          if (probeSessionToken) await deleteSession(probeSessionToken);
        } catch (e) {
          console.error('auth_selftest media probe cleanup failed:', e);
        }
      }

      const mediaEvaluated = mediaChecks.filter(c => !c.skipped);
      const mediaPass = mediaEvaluated.length > 0 && mediaEvaluated.every(c => c.ok === true);

      const evaluated = checks.filter(c => !c.skipped && !c.failed);
      const pairsPass = evaluated.length > 0 && evaluated.every(c => c.identical && c.no409 !== false);
      const headerEvaluated = headerChecks.filter(c => !c.skipped);
      const headersPass = headerEvaluated.length > 0 && headerEvaluated.every(c => c.ok === true);
      const pass = pairsPass && headersPass && mediaPass;
      const summary = `${evaluated.length}/${checks.length} pairs, ${headerEvaluated.length}/${headerChecks.length} headers, ${mediaEvaluated.length}/${mediaChecks.length} media`;

      // Everything that actually failed — a pair that stopped being byte-
      // identical, the 409 oracle returning, or a header regression. An
      // inconclusive run (everything rate-limited) counts as a failure too:
      // a daily schedule that never evaluates anything is itself a problem.
      const failures = !pass
        ? [
            ...checks
              .filter(c => !c.skipped && !c.failed && (!c.identical || c.no409 === false))
              .map(c => `pair ${c.name}: known=${c.knownStatus} unknown=${c.unknownStatus} identical=${c.identical}${c.no409 === false ? ' — 409 oracle is BACK' : ''}`),
            ...headerChecks
              .filter(c => !c.skipped && c.ok !== true)
              .map(c => `header ${c.surface}: ${(c.problems || []).join('; ') || 'failed'}`),
            ...mediaChecks
              .filter(c => !c.skipped && c.ok !== true)
              .map(c => `media ${c.name}: ${c.detail}`),
          ]
        : [];
      if (!pass && !failures.length) {
        failures.push('inconclusive — every pair was rate limited or unreachable');
      }

      // Status-page freshness: recorded for manual runs too (last run wins).
      try {
        await recordCronRun(
          'auth-selftest',
          pass ? 'success' : 'error',
          Date.now() - authStartedAt,
          failures.length ? `${summary} — ${failures[0]}`.slice(0, 300) : summary
        );
      } catch (e) {
        console.error('auth-selftest cron record failed:', e);
      }

      // One email when something stops holding — quiet on success, and an
      // alert failure never fails the run itself.
      if (!pass) {
        try {
          const to = process.env.SELFTEST_ALERT_EMAIL || 'futuretravel@gmail.com';
          const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const sent = await sendEmail({
            to,
            subject: `PropReel auth selftest FAILED — ${failures.length} issue${failures.length === 1 ? '' : 's'}`,
            html: `<!doctype html><body style="font-family:Arial,sans-serif;color:#e5e7eb;background:#0b0b14;padding:24px"><h2 style="color:#f87171">Auth selftest failed</h2><p>${esc(summary)} — ${failures.length} issue${failures.length === 1 ? '' : 's'}:</p><ul>${failures.map(f => `<li>${esc(f)}</li>`).join('')}</ul><p style="color:#9a9ab8">Ran ${new Date().toISOString()}. Re-run: POST /api/users?action=auth_selftest with Authorization: Bearer $CRON_SECRET</p></body>`,
            text: `Auth selftest failed (${summary}):\n\n- ${failures.join('\n- ')}\n\nRan ${new Date().toISOString()}. Re-run: POST /api/users?action=auth_selftest (Bearer CRON_SECRET)`,
          });
          if (sent.ok) console.log(`auth_selftest alert emailed to ${to}`);
          else console.error('auth_selftest alert email rejected:', sent.error);
        } catch (e) {
          console.error('auth_selftest alert email failed:', e);
        }
      }

      return res.status(200).json({
        pass,
        summary,
        ...(evaluated.length === 0 ? { note: 'inconclusive — every pair was rate limited or unreachable' } : {}),
        checks,
        headers: { pass: headersPass, checks: headerChecks },
        media: { pass: mediaPass, checks: mediaChecks },
        selftestAccount: KNOWN_EMAIL,
        unknownSignupRowRemoved: unknownRemoved,
        ranAt: new Date().toISOString(),
      });
    }

    return res.status(404).json({ error: `Unknown auth action: ${action}` });
  } catch (error) {
    console.error(`Auth action ${action} error:`, error);
    return res.status(500).json({ error: 'Authentication request failed' });
  }
}


export async function mediaSign(req: VercelRequest, res: VercelResponse) {
  // ── GET ?action=media_sign&url=… ────────────────────────────────────
  // Studio drafts persist their photo URLs in IndexedDB (studioDrafts):
  // the upload flow hands back a 1 h signed edge URL, so yesterday's draft
  // previews are dead on arrival — every <img> 403s (and with nosniff the
  // browser discards even the XML error, surfacing as a broken grid that
  // LOOKS like an upload limit). The server-side fix is rows-only
  // (rawS3Url), but a draft written before that boundary needs a live
  // renewal path: re-sign ONE of our own objects for the signed-in owner.
  // Ownership is enforced by key prefix, so a user can only renew their
  // own uploads — never someone else's, and nothing outside uploads/.
  if (req.method === 'GET' && req.query.action === 'media_sign') {
    const actor = await sessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Sign in required' });
    const url = String(req.query.url || '');
    const { parseObjectUrl, signS3Url, toEdgeUrl } = await import('../../lib/s3Urls');
    const obj = parseObjectUrl(url);
    const PREFIX = `uploads/${actor.id}/`;
    if (!obj || obj.bucket !== (process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets') || !obj.key.startsWith(PREFIX)) {
      return res.status(403).json({ error: 'Not your media' });
    }
    try {
      const signed = await signS3Url(`https://${obj.bucket}.s3.${process.env.AWS_REGION || 'af-south-1'}.amazonaws.com/${obj.key}`);
      return res.status(200).json({ success: true, url: toEdgeUrl(signed) || signed });
    } catch (e) {
      console.error('media_sign failed:', e);
      return res.status(500).json({ error: 'Could not sign the media URL' });
    }
  }
}
