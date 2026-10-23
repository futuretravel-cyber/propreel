import { VercelRequest, VercelResponse } from '@vercel/node';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUser, updateUser, getUserByEmail, deleteUser, getOrCreateUserByEmail, deductCredits } from '../lib/userService';
import { TABLES, queryItems, putItem, getItem, scanItems, docClient } from '../lib/db';
import { deleteItem } from '../lib/db-helpers';
import {
  hashPassword, verifyPassword, createSession, getSessionUser, deleteSession,
  deleteSessionsForUser, sessionCookie, clearSessionCookie, getTokenFromRequest, SESSION_COOKIE,
  clientMeta,
  issueEmailConfirmToken, consumeEmailConfirmToken, issuePasswordResetToken,
  consumePasswordResetToken,
  requireOwner, requireAdminSession, sessionUser, isAdminActor,
} from '../lib/auth';
import { sendEmail, confirmEmailTemplate, resetPasswordTemplate, accountExistsTemplate, agencyInviteTemplate } from '../lib/email';
import { generateTotpSecret, verifyTotp, otpauthUrl, randomToken } from '../lib/totp';
import { workerTokenHeaders } from '../lib/workerToken';
import { jobCredits, flashheadCreditsForText, narrationSecondsForText, FLASHHEAD_MAX_SECONDS, NARRATION_WORDS_PER_SEC } from '../lib/renderPricing';
import { createHash } from 'crypto';
import { consumeRateLimit } from '../lib/rateLimit';
import { recordCronRun } from '../lib/cronRuns';
import { getMaintenanceState, setMaintenanceState } from '../lib/maintenance';
import { rawS3Url, signS3Url, toEdgeUrl } from '../lib/s3Urls';
import { auditApiResponses, auditStoredRows, type MediaCheck } from '../lib/mediaAudit';

const isAdminEmail = (email: string | undefined | null) =>
  !!email && ADMIN_EMAILS.includes(String(email).toLowerCase());

/**
 * Per-IP signup cap. Offices and carrier NATs legitimately share one
 * address, so this stays generous — what it stops is one host minting
 * throwaway accounts by the hundred, each farming the 5-credit signup
 * bonus and a fresh per-user upload budget.
 */
const REGISTER_RATE_LIMIT = 10;
const REGISTER_RATE_WINDOW_SEC = 3600;

/**
 * Agency nested routes (function consolidation — Hobby 12-function cap).
 *   POST agency_create        — full company-details signup (creator = owner)
 *   GET  agency_overview      — agency + members + pending invites + cap
 *   GET  agency_usage         — real-time credit analytics (owner/admin)
 *   POST agency_invite        — invite agent (enforces the 10-agent cap)
 *   POST agency_set_limit     — per-agent monthly credit limit (owner)
 *   POST agency_remove_member — detach an agent (owner)
 *   POST agency_settings      — company details / report branding / webhook
 *   GET  agency_report        — download a generated report PDF by S3 key
 *   POST agency_report_generate — build month PDF (optionally agent-scoped)
 *   GET  agency_report_zip    — zip the last 12 months for accounting
 *   GET  admin_agencies       — platform-wide agency list (admin only)
 */
async function requireAgencyRole(user_id: string): Promise<{ ok: true; user: any } | { ok: false; res: VercelResponse }> {
  const user = await getUser(user_id);
  if (!user) return { ok: false, res: null as any } as any;
  return { ok: true, user } as any;
}

import { SERVICE_KEYS, ALL_FIELD_NAMES } from '../lib/serviceKeys';

// ── Admin → API Keys propagation (consolidated into this function: the
// Hobby plan caps a deployment at 12 serverless functions). GET returns
// per-var configuration status (existence only, never values); POST
// upserts the Vercel project env (+ production redeploy) and the matching
// Modal secret via the worker's bearer-gated /admin/secret route.
// Values are pass-through only — never persisted, logged, or re-returned.
const VERCEL_API = 'https://api.vercel.com';
const WORKER_URL = () =>
  (process.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run').replace(/\/$/, '');

async function vercelFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is not configured');
  const team = process.env.VERCEL_TEAM_ID ? `teamId=${process.env.VERCEL_TEAM_ID}` : '';
  return fetch(`${VERCEL_API}${path}${path.includes('?') ? '&' : '?'}${team}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function upsertVercelEnv(key: string, value: string): Promise<'created' | 'updated'> {
  const listRes = await vercelFetch(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/env`);
  if (!listRes.ok) throw new Error(`Vercel env list failed: ${listRes.status} ${(await listRes.text()).slice(0, 200)}`);
  const { envs } = (await listRes.json()) as { envs: Array<{ id: string; key: string; target?: string[] }> };
  const existing = envs.find(e => e.key === key);
  if (existing) {
    const patch = await vercelFetch(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/env/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    if (!patch.ok) throw new Error(`Vercel env patch failed: ${patch.status} ${(await patch.text()).slice(0, 200)}`);
    return 'updated';
  }
  const create = await vercelFetch(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/env`, {
    method: 'POST',
    body: JSON.stringify({ key, value, target: ['production', 'preview', 'development'] }),
  });
  if (!create.ok) throw new Error(`Vercel env create failed: ${create.status} ${(await create.text()).slice(0, 200)}`);
  return 'created';
}

async function updateModalSecret(name: string, envDict: Record<string, string>): Promise<{ ok: boolean; via?: string; error?: string }> {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return { ok: false, error: 'ADMIN_API_KEY not configured' };
  try {
    const res = await fetch(`${WORKER_URL()}/admin/secret`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, env_dict: envDict }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as any)?.detail || `worker ${res.status}` };
    return { ok: true, via: (data as any)?.via };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'worker unreachable' };
  }
}

async function triggerProductionRedeploy(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const id = process.env.VERCEL_PROJECT_ID;
  const projRes = await vercelFetch(`/v9/projects/${id}`);
  if (!projRes.ok) return { ok: false, error: `project lookup failed: ${projRes.status}` };
  const { name } = (await projRes.json()) as { name: string };
  const res = await vercelFetch('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({ name, target: ['production'] }),
  });
  if (!res.ok) return { ok: false, error: `redeploy failed: ${res.status} ${(await res.text()).slice(0, 200)}` };
  const data = (await res.json()) as { url?: string; id?: string };
  return { ok: true, url: data.url || data.id };
}

async function adminApiKeysRoute(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  if (req.method === 'GET') {
    const envPresence: Record<string, boolean> = {};
    for (const f of ALL_FIELD_NAMES) envPresence[f] = !!process.env[f];
    return res.status(200).json({
      success: true,
      services: SERVICE_KEYS.map(s => ({ id: s.id, label: s.label, blurb: s.blurb, fields: s.fields.map(f => ({ name: f.name, label: f.label })) })),
      configured: envPresence,
      plumbing: {
        vercelToken: !!process.env.VERCEL_TOKEN,
        projectId: !!process.env.VERCEL_PROJECT_ID,
        adminApiKey: !!process.env.ADMIN_API_KEY,
      },
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { service_id, values, redeploy } = (req.body || {}) as {
    service_id?: string; values?: Record<string, string>; redeploy?: boolean;
  };
  const spec = SERVICE_KEYS.find(s => s.id === service_id);
  if (!spec) return res.status(400).json({ error: `Unknown service: ${service_id}` });
  const clean: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = values?.[f.name];
    if (typeof v === 'string' && v.trim()) clean[f.name] = v.trim();
  }
  if (!Object.keys(clean).length) return res.status(400).json({ error: 'No values supplied' });
  for (const k of Object.keys(clean)) {
    if (!spec.fields.some(f => f.name === k && ALL_FIELD_NAMES.includes(k))) {
      return res.status(400).json({ error: `Field not allowed for this service: ${k}` });
    }
  }

  const vercel: Array<{ key: string; result?: string; error?: string }> = [];
  const vercelFields = spec.fields.filter(f => f.vercelEnv && clean[f.name]);
  if (vercelFields.length && !process.env.VERCEL_TOKEN) {
    for (const f of vercelFields) vercel.push({ key: f.name, error: 'VERCEL_TOKEN not configured' });
  } else {
    for (const f of vercelFields) {
      try {
        vercel.push({ key: f.name, result: await upsertVercelEnv(f.name, clean[f.name]) });
      } catch (e: any) {
        vercel.push({ key: f.name, error: e?.message || 'failed' });
      }
    }
  }

  const modal: Array<{ secret: string; ok: boolean; via?: string; error?: string }> = [];
  const groups = new Map<string, Record<string, string>>();
  for (const f of spec.fields) {
    if (f.modalSecret && clean[f.name]) {
      const g = groups.get(f.modalSecret) || {};
      g[f.name] = clean[f.name];
      groups.set(f.modalSecret, g);
    }
  }
  for (const [secretName, envDict] of groups) {
    modal.push({ secret: secretName, ...(await updateModalSecret(secretName, envDict)) });
  }

  let redeployResult: { ok: boolean; url?: string; error?: string } | null = null;
  const vercelOk = vercel.some(v => v.result);
  if (redeploy !== false && vercelOk) {
    redeployResult = await triggerProductionRedeploy().catch((e: any) => ({ ok: false, error: e?.message || 'redeploy failed' }));
  }

  const envLines = Object.entries(clean).map(([k, v]) => `${k}=${v}`).join('\n');

  return res.status(200).json({
    success: vercel.every(v => !v.error) && modal.every(m => m.ok),
    vercel,
    modal,
    redeploy: redeployResult,
    envLines,
  });
}

async function agencyRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  const {
    createAgency, getAgency, updateAgency, listMembers, addMemberToAgency,
    removeMember, setAgentMonthlyLimit, agencyUsageAnalytics, listAllAgencies,
    MAX_AGENTS_PER_AGENCY,    } = await import('../lib/agency');
  const body = req.body || {};

  // Session gate: every agency action names its acting user via user_id /
  // inviter_user_id — identity must come from the cookie, never the payload
  // (otherwise anyone could impersonate an agency owner by passing their id).
  // admin_agencies and feature_flags are handled below with their own
  // admin-session checks; feature_flags GET stays public.
  if (action !== 'feature_flags' && action !== 'admin_agencies') {
    const claimed = String(body.user_id || body.inviter_user_id || req.query.user_id || '');
    const gate = await requireOwner(req, claimed);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
  }

  try {
    // ── POST ?action=agency_create — agency signup ──────────────────
    if (action === 'agency_create') {
      const { user_id, name, company, branding } = body;
      if (!user_id || !name) return res.status(400).json({ error: 'user_id and name are required' });
      const owner = await getUser(user_id);
      if (!owner) return res.status(404).json({ error: 'User not found' });
      if (owner.agencyId) {
        return res.status(400).json({ error: 'You already belong to an agency — leave it before creating a new one' });
      }
      const agency = await createAgency(
        { id: owner.id, email: owner.email, fullName: owner.fullName, agencyName: owner.agencyName },
        { name: String(name), company, branding }
      );
      return res.status(201).json({
        success: true,
        agency,
        maxAgents: MAX_AGENTS_PER_AGENCY,
        message: `Agency created. You can invite up to ${MAX_AGENTS_PER_AGENCY} agents — each agent needs their own login.`,
      });
    }

    // ── GET ?action=agency_overview&user_id=… [&agency_id=… for admins] ─
    if (action === 'agency_overview') {
      const user = await getUser(String(req.query.user_id || body.user_id || ''));
      if (!user) return res.status(404).json({ error: 'User not found' });
      // Platform admins may inspect any agency directly
      const targetAgencyId = (req.query.agency_id && isAdminEmail(user.email))
        ? String(req.query.agency_id)
        : user.agencyId;
      if (!targetAgencyId) return res.status(200).json({ success: true, agency: null, members: [], invites: [], maxAgents: MAX_AGENTS_PER_AGENCY });
      const agency = await getAgency(targetAgencyId);
      const members = await listMembers(targetAgencyId);
      const { scanItems } = await import('../lib/db');
      const invites = (await scanItems<any>(TABLES.SETTINGS, {
        filter: { expression: '#t = :t AND agencyId = :a AND #s = :s', names: { '#t': 'type', '#s': 'status' }, values: { ':t': 'agency_invite', ':a': targetAgencyId, ':s': 'pending' } },
        limit: 50,
      }).catch(() => [] as any[]));
      const isOwner = user.role === 'AGENCY_OWNER' || user.role === 'ADMIN' || isAdminEmail(user.email) || agency?.ownerId === user.id;
      return res.status(200).json({
        success: true,
        agency,
        members,
        invites,
        isOwner,
        maxAgents: MAX_AGENTS_PER_AGENCY,
        canInvite: isOwner && members.length + invites.length < MAX_AGENTS_PER_AGENCY,
      });
    }

    // ── GET ?action=agency_usage&user_id=…&days=… [&agency_id=… admin] ──
    if (action === 'agency_usage') {
      const user = await getUser(String(req.query.user_id || ''));
      if (!user) return res.status(404).json({ error: 'User not found' });
      const agencyId = (req.query.agency_id && isAdminEmail(user.email)) ? String(req.query.agency_id) : user.agencyId;
      if (!agencyId) return res.status(400).json({ error: 'You are not part of an agency' });
      const agency = await getAgency(agencyId);
      const isOwner = user.role === 'AGENCY_OWNER' || user.role === 'ADMIN' || isAdminEmail(user.email) || agency?.ownerId === user.id;
      if (!isOwner) return res.status(403).json({ error: 'Agency admins only' });
      const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
      const usage = await agencyUsageAnalytics(agencyId, days);
      return res.status(200).json({ success: true, usage });
    }

    // ── POST ?action=agency_invite — cap-aware invite ────────────────
    if (action === 'agency_invite') {
      const { inviter_user_id, invite_email, role } = body;
      if (!inviter_user_id || !invite_email) return res.status(400).json({ error: 'inviter_user_id and invite_email are required' });
      const inviter = await getUser(inviter_user_id);
      if (!inviter) return res.status(404).json({ error: 'Inviter not found' });
      if (inviter.role !== 'AGENCY_OWNER' && inviter.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only the agency owner can invite agents' });
      }
      const agencyId = inviter.agencyId || `agy_${inviter.id}`;
      const agency = await getAgency(agencyId);
      if (!agency) return res.status(400).json({ error: 'Create your agency first' });

      const { countMembers } = await import('../lib/agency');
      const { scanItems } = await import('../lib/db');
      const memberCount = await countMembers(agencyId);
      const pendingCount = (await scanItems<any>(TABLES.SETTINGS, {
        filter: { expression: '#t = :t AND agencyId = :a AND #s = :s', names: { '#t': 'type', '#s': 'status' }, values: { ':t': 'agency_invite', ':a': agencyId, ':s': 'pending' } },
        limit: 50,
      }).catch(() => [] as any[])).length;
      if (memberCount + pendingCount >= agency.memberLimit) {
        return res.status(400).json({
          error: `Agent limit reached — agencies are capped at ${agency.memberLimit} agents to keep the system simple. If you have more than ${agency.memberLimit} agents, create a second agency.`,
          limit: agency.memberLimit,
          members: memberCount,
          pending: pendingCount,
        });
      }

      const invitee = await getUserByEmail(String(invite_email).toLowerCase());
      if (invitee) {
        if (invitee.agencyId && invitee.agencyId !== agencyId) {
          return res.status(400).json({ error: 'That user already belongs to another agency' });
        }
        await addMemberToAgency(agencyId, invitee.id, role || 'AGENT');
        return res.status(200).json({ success: true, addedExisting: true, member: invitee.email });
      }
      const inviteId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await putItem(TABLES.SETTINGS, {
        id: inviteId,
        type: 'agency_invite',
        inviterUserId: inviter_user_id,
        inviterEmail: inviter.email,
        agencyId,
        agencyName: agency.name,
        inviteEmail: String(invite_email).toLowerCase(),
        role: role || 'AGENT',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      // The invitation EMAIL — the bug: the row was stored but no mail ever
      // went out, so agents never learned they'd been invited. Best-effort
      // delivery: a mail failure must not lose the stored invite (the
      // signup-time accept path still works), but the owner needs to know
      // the notification didn't reach the agent's inbox.
      try {
        const origin = siteOrigin(req);
        // The CTA deep-links into the INVITE signup mode (no plan/payment
        // step — name + password only, credits from the agency).
        const tpl = agencyInviteTemplate(
          agency.name || 'your agency',
          inviter.fullName || inviter.email,
          `${origin}/signup?invite=${encodeURIComponent(String(invite_email).toLowerCase())}`,
          role || 'AGENT',
        );
        const inviteSent = await sendEmail({
          to: String(invite_email).toLowerCase(),
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          replyTo: inviter.email || undefined,
        });
        if (!inviteSent.ok) {
          console.error(`Agency invite email failed (invite ${inviteId}):`, inviteSent.error);
          return res.status(201).json({
            success: true,
            pending: true,
            email_sent: false,
            email_error: inviteSent.error || 'email provider rejected the invitation',
            message: 'Invite stored, but the email could not be sent — share the signup link directly.',
          });
        }
        return res.status(201).json({
          success: true,
          pending: true,
          email_sent: true,
          ...(inviteSent.usedFallback ? { email_sender: 'resend-onboarding' } : {}),
          message: `Invite sent to ${String(invite_email).toLowerCase()} — they will join your agency when they sign up with this email.`,
        });
      } catch (mailErr: any) {
        console.error(`Agency invite email threw (invite ${inviteId}):`, mailErr?.message || mailErr);
        return res.status(201).json({
          success: true,
          pending: true,
          email_sent: false,
          email_error: String(mailErr?.message || mailErr),
          message: 'Invite stored, but the email could not be sent — share the signup link directly.',
        });
      }
    }

    // ── POST ?action=agency_set_limit — per-agent monthly cap ────────
    if (action === 'agency_set_limit') {
      const { user_id, target_user_id, monthly_limit } = body;
      const owner = await getUser(user_id);
      if (!owner?.agencyId) return res.status(400).json({ error: 'You are not part of an agency' });
      const agency = await getAgency(owner.agencyId);
      if (!agency || (owner.role !== 'AGENCY_OWNER' && owner.role !== 'ADMIN' && agency.ownerId !== owner.id)) {
        return res.status(403).json({ error: 'Agency admins only' });
      }
      const target = await getUser(target_user_id);
      if (!target || target.agencyId !== owner.agencyId) return res.status(404).json({ error: 'Agent not found in your agency' });
      const limit = monthly_limit == null ? null : Number(monthly_limit);
      if (limit != null && (!Number.isFinite(limit) || limit < 0)) return res.status(400).json({ error: 'Invalid limit' });
      await setAgentMonthlyLimit(owner.agencyId, target_user_id, limit);
      return res.status(200).json({ success: true, target_user_id, monthly_limit: limit });
    }

    // ── POST ?action=agency_remove_member ────────────────────────────
    if (action === 'agency_remove_member') {      const { user_id, target_user_id } = body;
      const owner = await getUser(user_id);
      if (!owner?.agencyId) return res.status(400).json({ error: 'You are not part of an agency' });
      const agency = await getAgency(owner.agencyId);
      if (!agency || (owner.role !== 'AGENCY_OWNER' && owner.role !== 'ADMIN' && agency.ownerId !== owner.id)) {
        return res.status(403).json({ error: 'Agency admins only' });
      }
      if (target_user_id === owner.id) return res.status(400).json({ error: 'Owners cannot remove themselves' });
      const target = await getUser(target_user_id);
      if (!target || target.agencyId !== owner.agencyId) return res.status(404).json({ error: 'Agent not found in your agency' });
      await removeMember(owner.agencyId, target_user_id);
      return res.status(200).json({ success: true });
    }

    // ── POST ?action=agency_delete_member — DELETE the account ────────
    // Owner-side hard delete of an invited agent's account (they were given
    // access without paying, so the agency admin can also take it away).
    // Wipes the user row, their projects and sessions — the same physical
    // deletion the self-service ?action=delete performs. Only the owning
    // agency's owner/admin may call it, and never on themselves or a fellow
    // AGENCY_OWNER (that stays with the account holder / platform admin).
    if (action === 'agency_delete_member') {
      const { user_id, target_user_id } = body;
      if (!target_user_id) return res.status(400).json({ error: 'target_user_id is required' });
      const owner = await getUser(user_id);
      if (!owner?.agencyId) return res.status(400).json({ error: 'You are not part of an agency' });
      const agency = await getAgency(owner.agencyId);
      if (!agency || (owner.role !== 'AGENCY_OWNER' && owner.role !== 'ADMIN' && agency.ownerId !== owner.id)) {
        return res.status(403).json({ error: 'Agency admins only' });
      }
      const target = await getUser(target_user_id);
      if (!target || target.agencyId !== owner.agencyId) return res.status(404).json({ error: 'Agent not found in your agency' });
      if (target_user_id === owner.id) return res.status(400).json({ error: 'Use the account settings page to delete your own account' });
      if (target.role === 'AGENCY_OWNER' || target.role === 'ADMIN') {
        return res.status(403).json({ error: 'Agency admins cannot be deleted here — contact platform support' });
      }
      // Same physical deletion as the self-service delete path: projects,
      // the user row, then every session so the email cannot sign in again.
      try {
        const projects = await queryItems(TABLES.PROJECTS, { expression: 'userId = :u', values: { ':u': target_user_id } });
        for (const p of projects) {
          await deleteItem(TABLES.PROJECTS, { userId: target_user_id, id: (p as any).id });
        }
      } catch (e) {
        console.error('Project deletion error during agency_delete_member:', e);
      }
      await deleteUser(target_user_id);
      await deleteSessionsForUser(target_user_id).catch(() => {});
      console.log(`Agency member deleted by owner: ${target_user_id} (${target.email}) via ${owner.agencyId}`);
      return res.status(200).json({ success: true, deleted: target.email });
    }

    // ── POST ?action=agency_settings — company details / branding / webhook ─
    if (action === 'agency_settings') {
      const { user_id, name, company, branding, webhook_url } = body;
      const owner = await getUser(user_id);
      if (!owner?.agencyId) return res.status(400).json({ error: 'You are not part of an agency' });
      const agency = await getAgency(owner.agencyId);
      if (!agency || (owner.role !== 'AGENCY_OWNER' && owner.role !== 'ADMIN' && agency.ownerId !== owner.id)) {
        return res.status(403).json({ error: 'Agency admins only' });
      }
      const updates: any = {};
      if (name) updates.name = String(name).slice(0, 100);
      if (company) updates.company = { ...agency.company, ...company };
      if (branding) updates.branding = { ...agency.branding, ...branding };
      if (webhook_url !== undefined) updates.webhookUrl = webhook_url ? String(webhook_url) : undefined;
      await updateAgency(owner.agencyId, updates);
      const fresh = await getAgency(owner.agencyId);
      return res.status(200).json({ success: true, agency: fresh });
    }

    // ── GET ?action=agency_report&user_id=…&key=… — stream a stored PDF ─
    if (action === 'agency_report') {
      const user = await getUser(String(req.query.user_id || ''));
      const key = String(req.query.key || '');
      if (!user?.agencyId || !key.startsWith(`reports/${user.agencyId}/`)) {
        return res.status(403).json({ error: 'Not your agency\'s report' });
      }
      const { getReportPdf } = await import('../lib/agencyReport');
      const pdf = await getReportPdf(key);
      if (!pdf) return res.status(404).json({ error: 'Report not found' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
      return res.status(200).send(pdf);
    }

    // ── POST ?action=agency_report_generate — month PDF (owner) ──────
    if (action === 'agency_report_generate') {
      const { user_id, month, agent_user_id } = body;
      const owner = await getUser(user_id);
      if (!owner?.agencyId) return res.status(400).json({ error: 'You are not part of an agency' });
      const agency = await getAgency(owner.agencyId);
      if (!agency || (owner.role !== 'AGENCY_OWNER' && owner.role !== 'ADMIN' && agency.ownerId !== owner.id)) {
        return res.status(403).json({ error: 'Agency admins only' });
      }
      const monthKey = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : new Date().toISOString().slice(0, 7);
      const { generateAndStoreAgencyReport, generateAgentReports } = await import('../lib/agencyReport');
      if (agent_user_id) {
        const reports = await generateAgentReports(owner.agencyId, monthKey);
        const one = reports.find(r => r.userId === agent_user_id) || reports[0];
        if (!one) return res.status(404).json({ error: 'No members to report on' });
        return res.status(200).json({ success: true, agents: reports, selected: one });
      }
      const report = await generateAndStoreAgencyReport(owner.agencyId, monthKey);
      if (!report) return res.status(500).json({ error: 'Report generation failed' });
      return res.status(200).json({ success: true, report });
    }

    // ── GET ?action=agency_report_zip&user_id=… — 12-month bulk export ─
    if (action === 'agency_report_zip') {
      const user = await getUser(String(req.query.user_id || ''));
      if (!user?.agencyId) return res.status(400).json({ error: 'You are not part of an agency' });
      const agency = await getAgency(user.agencyId);
      if (!agency || (user.role !== 'AGENCY_OWNER' && user.role !== 'ADMIN' && agency.ownerId !== user.id)) {
        return res.status(403).json({ error: 'Agency admins only' });
      }
      const { zipReportHistory } = await import('../lib/agencyReport');
      const zip = await zipReportHistory(user.agencyId, 12);
      if (!zip) return res.status(404).json({ error: 'No reports generated yet' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zip.fileName}"`);
      return res.status(200).send(zip.buffer);
    }

    // ── GET ?action=admin_agencies&email=… — platform agency list ────
    if (action === 'admin_agencies') {
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      const agencies = await listAllAgencies();
      return res.status(200).json({ success: true, agencies });
    }

    // ── Integration feature flags (WhatsApp float, live chat widget) ────
    // GET ?action=feature_flags → public, non-secret config for the site.
    // POST ?action=feature_flags → admin-only updates.
    if (action === 'feature_flags') {
      const DEFAULTS = {
        whatsapp: { enabled: false, number: '', message: 'Hi PropReel! I have a question about my listing video.' },
        liveChat: { enabled: false, provider: 'crisp' as 'crisp' | 'intercom', websiteId: '' },
      };
      if (req.method === 'GET') {
        const flags = await getItem<any>(TABLES.SETTINGS, { id: 'feature_flags' });
        return res.status(200).json({ success: true, flags: { ...DEFAULTS, ...(flags?.flags || {}) } });
      }
      const { flags } = body;
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      const existing = await getItem<any>(TABLES.SETTINGS, { id: 'feature_flags' });
      const merged = { ...DEFAULTS, ...(existing?.flags || {}), ...(flags || {}) };
      // Never persist secrets here — provider IDs are public embed values
      await putItem(TABLES.SETTINGS, { id: 'feature_flags', type: 'feature_flags', flags: merged, updatedAt: new Date().toISOString() });
      return res.status(200).json({ success: true, flags: merged });
    }

    return res.status(404).json({ error: `Unknown agency action: ${action}` });
  } catch (error: any) {
    if (error?.message?.startsWith('AGENT_LIMIT_REACHED')) {
      const limit = error.message.split(':')[1];
      return res.status(400).json({ error: `Agent limit reached — agencies are capped at ${limit} agents. If you have more than ${limit} agents, create a second agency.`, limit: Number(limit) });
    }
    console.error(`Agency action ${action} error:`, error);
    return res.status(500).json({ error: 'Agency request failed' });
  }
}

// Admin accounts receive 1000 credits on first sign-in (spec doc)
const ADMIN_EMAILS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];
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
    const { scanItems, TABLES } = await import('../lib/db');
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
async function deleteAccount(req: VercelRequest, res: VercelResponse) {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  // Session-or-admin (IDOR fix): this used to run with NO authentication —
  // anyone could POST {user_id} and wipe an arbitrary account (row,
  // projects, sessions). Self or platform admin only.
  const gate = await requireOwner(req, user_id);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

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
async function dataExport(req: VercelRequest, res: VercelResponse) {
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
  const rows = await scanItems<any>(TABLES.SESSIONS, {
    filter: { expression: 'userId = :u', values: { ':u': user.id } },
    limit: 200,
  });
  return { user, token, rows };
}

/**
 * Nested route: GET /api/users?action=sessions — the real Active Sessions
 * list behind Settings → Security → Sessions. One row per issued session
 * cookie with the IP / user-agent captured at sign-in time; expired rows are
 * dropped and only a token fingerprint leaves the server.
 */
async function listSessions(req: VercelRequest, res: VercelResponse) {
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
async function revokeSessions(req: VercelRequest, res: VercelResponse) {
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
async function auditLog(req: VercelRequest, res: VercelResponse) {
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
async function aiNoticeAck(req: VercelRequest, res: VercelResponse) {
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

async function updateUserFields(req: VercelRequest, res: VercelResponse) {
  const { user_id, updates } = req.body || {};
  if (!user_id || typeof updates !== 'object' || updates === null) {
    return res.status(400).json({ error: 'Missing user_id or updates' });
  }
  // Session-or-admin (IDOR fix): the route used to trust the body's user_id,
  // so an unauthenticated caller could rewrite any account's profile fields.
  const gate = await requireOwner(req, user_id);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
 * Nested route: GET /api/users?action=admin_stats — real platform stats.
 * Admin-only (server-side email check). Counts come from DynamoDB directly.
 */
async function adminStats(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  const { scanItems } = await import('../lib/db');
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const projects = await scanItems<any>(TABLES.PROJECTS, { limit: 1000 });

  const creditsSpent = users.reduce((s: number, u: any) => s + Math.max(0, (u.totalSpent ?? 0)), 0);
  const activeUsers = users.filter((u: any) =>
    u.updatedAt && (Date.now() - new Date(u.updatedAt).getTime()) < 30 * 86400000
  ).length;

  // ── AI render activity (last 30d): counts, credits, durations ────────
  // Derived from the real credit ledger (every render deducts credits with
  // metadata) plus measured talking-head runtime stored on project records.
  const txns = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 2000 });
  const since = Date.now() - 30 * 86400000;
  const video = { renders: 0, credits: 0, plannedSeconds: 0 };
  const flashhead = { renders: 0, credits: 0, measuredSeconds: 0 };
  const imageEdits = { edits: 0, credits: 0 };
  const dailyMap = new Map<string, { videoRenders: number; videoCredits: number; flashheadRenders: number; flashheadCredits: number; imageEdits: number; imageCredits: number }>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const ts = Date.parse(t.createdAt || '');
    if (Number.isNaN(ts) || ts < since) continue;
    const desc = String(t.description || '');
    const isVideo = /video generation/i.test(desc);
    const isFlash = /flashhead/i.test(desc);
    const isImage = /image edit/i.test(desc);
    if (!isVideo && !isFlash && !isImage) continue;
    const day = new Date(ts).toISOString().slice(0, 10);
    const bucket = dailyMap.get(day) || { videoRenders: 0, videoCredits: 0, flashheadRenders: 0, flashheadCredits: 0, imageEdits: 0, imageCredits: 0 };
    const credits = Math.abs(Number(t.amount));
    if (isVideo) {
      video.renders += 1;
      video.credits += credits;
      video.plannedSeconds += Number(t.metadata?.duration) || 0;
      bucket.videoRenders += 1;
      bucket.videoCredits += credits;
    } else if (isImage) {
      imageEdits.edits += 1;
      imageEdits.credits += credits;
      bucket.imageEdits += 1;
      bucket.imageCredits += credits;
    } else {
      flashhead.renders += 1;
      flashhead.credits += credits;
      bucket.flashheadRenders += 1;
      bucket.flashheadCredits += credits;
    }
    dailyMap.set(day, bucket);
  }
  // Talking-head runtime: measured by the worker (ffprobe) and persisted on
  // project records when the client polls to completion.
  flashhead.measuredSeconds = projects
    .filter((p: any) => p.kind === 'FLASHHEAD' && p.durationSeconds)
    .reduce((s: number, p: any) => s + Number(p.durationSeconds), 0);

  const daily: Array<{ date: string; videoRenders: number; videoCredits: number; flashheadRenders: number; flashheadCredits: number; imageEdits: number; imageCredits: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const b = dailyMap.get(day) || { videoRenders: 0, videoCredits: 0, flashheadRenders: 0, flashheadCredits: 0, imageEdits: 0, imageCredits: 0 };
    daily.push({ date: day.slice(5), ...b });
  }

  return res.status(200).json({
    success: true,
    stats: {
      userCount: users.length,
      activeUsers,
      agencyCount: new Set(users.map((u: any) => u.agencyId).filter(Boolean)).size,
      projectCount: projects.length,
      readyReels: projects.filter((p: any) => p.status === 'READY').length,
      processingReels: projects.filter((p: any) => p.status === 'PROCESSING').length,
      failedReels: projects.filter((p: any) => p.status === 'FAILED').length,
      creditsSpent,
    },
    renderMetrics: {
      windowDays: 30,
      video,
      flashhead,
      imageEdits,
      daily,
    },
  });
}

/**
 * Nested route: GET /api/users?action=list_users — real user list (admin-only).
 *
 * Besides the profile basics it returns each account's subscription and
 * billing state (subscription row, trial/dunning/pending-upgrade flags,
 * whether a card is on file) — the read half of the admin panel's
 * subscription viewer/editor; the write half is
 * POST /api/subscriptions?action=admin_set_subscription.
 */
async function listUsers(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
  const { scanItems } = await import('../lib/db');
  const users = await scanItems<any>(TABLES.USERS, { limit: 200 });
  // Only return safe fields
  const safe = users.map((u: any) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role || 'AGENT',
    credits: u.credits ?? 0,
    planId: u.planId || null,
    // Subscription + billing state (admin-only route, see header comment)
    subscription: u.subscription || null,
    trialExpiresAt: u.trialExpiresAt || null,
    trialEndedAt: u.trialEndedAt || null,
    paymentFailure: u.paymentFailure || null,
    pendingPlanUpgrade: u.pendingPlanUpgrade || null,
    hasCard: Boolean(u.paystackAuthorizationCode),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    // AI-notice ack as it stands on the row — version + timestamp for the
    // admin user detail view (non-secret; safeUser returns them too)
    aiNoticeAckVersion: u.aiNoticeAckVersion || null,
    aiNoticeAckAt: u.aiNoticeAckAt || null,
  }));
  safe.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return res.status(200).json({ success: true, users: safe });
}

/**
 * Nested route: GET/POST /api/users?action=preferences (moved from the retired
 * /api/notifications/preferences function to stay under the Vercel Hobby cap).
 */
async function notificationPreferences(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const userId = req.query.user_id as string;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const gate = await requireOwner(req, userId);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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

/**
 * Nested route: GET /api/users?action=admin_ledger — platform-wide credit
 * ledger (admin-only). Powers the audit-log view in the dashboard.
 */
async function adminLedger(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  const { scanItems } = await import('../lib/db');
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit as string) || 150));
  const typeFilter = (req.query.type as string) || '';

  const txns = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 2000 });
  // Hide internal index rows (idx_<eventId> dedupe helpers)
  let rows = txns.filter((t: any) => t.type !== 'event_index');
  if (typeFilter) rows = rows.filter((t: any) => t.type === typeFilter);
  rows.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  rows = rows.slice(0, limit);

  // Resolve emails for display
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const emailById = new Map<string, string>(users.map((u: any) => [u.id, u.email]));

  return res.status(200).json({
    success: true,
    count: rows.length,
    transactions: rows.map((t: any) => ({
      id: t.id,
      userId: t.userId,
      userEmail: emailById.get(t.userId) || null,
      amount: t.amount,
      type: t.type,
      description: t.description,
      eventId: t.eventId || null,
      pool: t.metadata?.pool || null,
      // Acting admin on support-written rows (e.g. admin_set_subscription)
      by: t.metadata?.by || null,
      createdAt: t.createdAt,
    })),
  });
}

/**
 * Nested route: GET /api/users?action=admin_narakeet_usage&days=30 —
 * ops report: Narakeet voiceover minutes consumed per render (admin only).
 *
 * Sums `narakeet_seconds` — the billed audio duration the worker records on
 * every completed video job status (jobs/{id}.json, retention-exempt so the
 * history persists). Records predating the field are counted as
 * `unmeasured` rather than silently reported as zero spend.
 */
async function adminNarakeetUsage(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  // Newest N job records read — bounds the Vercel runtime on busy windows.
  const FETCH_CAP = 400;
  // Narakeet's published pay-as-you-go rate (~$0.20 per synthesized minute).
  const USD_PER_MINUTE = 0.2;

  const { s3 } = await import('../lib/mediaRetention');
  const { ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await s3();
  const bucket = process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa';

  // List jobs/ (keys + timestamps only), keep top-level status files inside
  // the window; nested jobs/claims/ and jobs/health/ are never job records.
  const candidates: { key: string; when: Date }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'jobs/',
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const o of page.Contents || []) {
      const key = o.Key || '';
      if (!/^jobs\/[^/]+\.json$/.test(key)) continue;
      if (!o.LastModified || o.LastModified.getTime() < cutoff) continue;
      candidates.push({ key, when: o.LastModified });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  candidates.sort((a, b) => b.when.getTime() - a.when.getTime());
  const toFetch = candidates.slice(0, FETCH_CAP);

  const totals = { videoJobs: 0, withNarration: 0, withoutNarration: 0, unmeasured: 0, seconds: 0 };
  const byLang = new Map<string, { renders: number; seconds: number }>();
  const recent: any[] = [];

  for (let i = 0; i < toFetch.length; i += 25) {
    const batch = toFetch.slice(i, i + 25);
    const docs = await Promise.all(batch.map(async c => {
      try {
        const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: c.key }));
        const text = await obj.Body!.transformToString();
        return { c, doc: JSON.parse(text) as any };
      } catch {
        return { c, doc: null as any };
      }
    }));

    for (const { c, doc } of docs) {
      if (!doc) continue;
      const id = String(doc.record_id || c.key.slice('jobs/'.length, -'.json'.length));
      // Classify video jobs; image-edit and other job files carry no
      // voiceover and are excluded entirely.
      const kind = doc.kind === 'flashhead' || id.startsWith('fh_') ? 'flashhead'
        : doc.kind === 'render' || id.startsWith('pr_') ? 'render'
        : null;
      if (!kind) continue;

      totals.videoJobs += 1;
      const secs = typeof doc.narakeet_seconds === 'number' ? doc.narakeet_seconds : null;
      if (secs === null) {
        totals.unmeasured += 1;
      } else {
        totals.seconds += secs;
        if (secs > 0) {
          totals.withNarration += 1;
          const lang = String(doc.narakeet_language || 'unknown');
          const row = byLang.get(lang) || { renders: 0, seconds: 0 };
          row.renders += 1;
          row.seconds += secs;
          byLang.set(lang, row);
        } else {
          totals.withoutNarration += 1;
        }
      }

      if (recent.length < 50) {
        recent.push({
          id,
          kind,
          status: String(doc.status || 'unknown'),
          when: c.when.toISOString(),
          tier: doc.tier || null,
          language: doc.narakeet_language || null,
          voice: doc.narakeet_voice || null,
          seconds: secs,
        });
      }
    }
  }

  const minutes = Math.round((totals.seconds / 60) * 10) / 10;
  return res.status(200).json({
    success: true,
    days,
    cutoffIso: new Date(cutoff).toISOString(),
    listed: candidates.length,
    fetched: toFetch.length,
    totals: {
      ...totals,
      seconds: Math.round(totals.seconds * 10) / 10,
      minutes,
      estCostUsd: Math.round(minutes * USD_PER_MINUTE * 100) / 100,
    },
    usdPerMinute: USD_PER_MINUTE,
    byLanguage: [...byLang.entries()]
      .map(([language, v]) => ({ language, renders: v.renders, minutes: Math.round((v.seconds / 60) * 10) / 10 }))
      .sort((a, b) => b.minutes - a.minutes),
    recent,
  });
}

/**
 * Nested route: GET /api/users?action=image_presets — the full AI prompt
 * library (prompt + negative-prompt text) for the admin Prompts viewer.
 * Admin session required. The text itself never ships in the public JS
 * bundle and the browser never calls the worker for it: this handler
 * proxies the worker's /get_image_presets server-side with the shared HMAC
 * token, so the only public surface is a same-origin, session-gated read.
 */
let promptsCache: { at: number; presets: unknown } | null = null;

async function imagePresets(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getSessionUser(getTokenFromRequest(req));
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  if (!(user.role === 'ADMIN' || isAdminEmail(user.email))) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // The library only changes when the worker is redeployed — cache per instance.
  if (promptsCache && Date.now() - promptsCache.at < 10 * 60_000) {
    return res.status(200).json({ success: true, presets: promptsCache.presets });
  }

  const workerUrl = process.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const upstream = await fetch(`${workerUrl}/get_image_presets`, {
      headers: workerTokenHeaders(),
      signal: ctrl.signal,
    });
    if (!upstream.ok) {
      console.error(`image_presets upstream failed: ${upstream.status}`);
      return res.status(502).json({ error: 'Prompt library unavailable' });
    }
    const presets = await upstream.json();
    promptsCache = { at: Date.now(), presets };
    return res.status(200).json({ success: true, presets });
  } catch (e) {
    console.error('image_presets proxy error:', e);
    return res.status(502).json({ error: 'Prompt library unavailable' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Nested route: GET/POST /api/users?action=pln_* — monthly Profit & Loss
 * statement for the admin dashboard (admin-only, Hobby-cap consolidation).
 *   GET  pln_get            &month=YYYY-MM → statement + 12-month series + analyst insights
 *   POST pln_expense_add    {month, label, category, amount, note?}
 *   POST pln_expense_delete {month, itemId}
 *   GET  pln_pdf            &month=YYYY-MM → downloadable P&L PDF (S3 URL)
 */
async function pnlRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  const body = (req.body || {}) as any;
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  const { isMonthKey, buildPnlReport, loadPnlSnapshot, addPnlExpense, deletePnlExpense, generatePnlPdf, EXPENSE_CATEGORIES } =
    await import('../lib/pnl');

  const month = String(req.query.month || body.month || '').trim();
  if (!isMonthKey(month)) {
    return res.status(400).json({ error: 'month must be YYYY-MM' });
  }

  try {
    if (action === 'pln_get' && req.method === 'GET') {
      // Finalized months serve their frozen snapshot — instant, and immune
      // to the ledger scan window as history grows.
      const snapshot = await loadPnlSnapshot(month);
      if (snapshot) {
        return res.status(200).json({
          success: true,
          ...snapshot.report,
          finalized: true,
          finalizedAt: snapshot.finalizedAt,
          pdfUrl: snapshot.pdfUrl,
        });
      }
      const report = await buildPnlReport(month);
      return res.status(200).json({ success: true, ...report, finalized: false });
    }

    if (action === 'pln_expense_add' && req.method === 'POST') {
      const label = String(body.label || '').trim().slice(0, 120);
      const amount = Math.round(Number(body.amount) * 100) / 100;
      const category = String(body.category || 'Other');
      if (!label || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'label and a positive amount are required' });
      }
      const safeCategory = (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? category : 'Other';
      const item = await addPnlExpense(month, {
        label,
        category: safeCategory,
        amount,
        note: String(body.note || '').trim().slice(0, 300) || undefined,
      });
      return res.status(201).json({ success: true, item });
    }

    if (action === 'pln_expense_delete' && req.method === 'POST') {
      const itemId = String(body.itemId || '');
      if (!itemId) return res.status(400).json({ error: 'itemId is required' });
      const removed = await deletePnlExpense(month, itemId);
      return res.status(200).json({ success: removed });
    }

    if (action === 'pln_pdf' && req.method === 'GET') {
      const { url, instant } = await generatePnlPdf(month);
      // Buckets are private (M-5): the browser opens this link straight
      // after the click, so a 15-minute presigned URL is plenty and never
      // outlives the admin's own download.
      const { signS3Url, toEdgeUrl } = await import('../lib/s3Urls');
      return res.status(200).json({ success: true, url: toEdgeUrl((await signS3Url(url, 900)) || url), instant });
    }

    return res.status(404).json({ error: `Unknown P&L action: ${action}` });
  } catch (err) {
    console.error('P&L error:', err);
    return res.status(500).json({ error: 'P&L request failed' });
  }
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
async function provisionUser(input: ProvisionInput): Promise<{ user: any; created: boolean }> {
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
    const { addCredits, creditTtlIso } = await import('../lib/userService');
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

/** Read one cookie value by name (hand-rolled — req.cookies is Vercel-only). */
function readCookie(req: VercelRequest, name: string): string | undefined {
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
function isVercelCronRequest(req: VercelRequest): boolean {
  return (
    String(req.headers['user-agent'] || '').startsWith('vercel-cron/') ||
    String(req.headers['x-vercel-cron-schedule'] || '') !== ''
  );
}

function siteOrigin(req: VercelRequest): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host && host !== 'localhost') {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return `${proto}://${host}`;
  }
  return process.env.VITE_APP_URL || 'https://propreel-xi.vercel.app';
}

// ── worker_token mint rate limit ──────────────────────────────────────────
// Fixed hourly window per key, tracked in DynamoDB (serverless instances are
// stateless, so in-process counters can't hold). Ceilings are deliberately
// generous: a browser tab re-mints ~once per 9 minutes (token cached in
// workerAuth.ts), so even a busy office NAT — ~10 agents × a couple of tabs
// ≈ 30–60 mints/hour — sits comfortably under 150, while scripted bulk
// minting from one host/account gets cut off.
const MINT_WINDOW_MS = 60 * 60 * 1000;
const MINT_LIMIT_PER_IP = 150;
const MINT_LIMIT_PER_USER = 40;

/**
 * Consume one unit from an hourly quota counter and report whether it is
 * still within `limit`. Fails OPEN: a DynamoDB error must never break token
 * minting (and therefore rendering) — it only logs.
 *
 * Fast path is an atomic ADD guarded by the window value, so parallel
 * scripted requests can't race a read-modify-write past the limit; the
 * conditional-reset branch runs at most once per window per key.
 */
export async function consumeMintQuota(
  scope: 'ip' | 'uid',
  value: string,
  limit: number
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const windowStart = Math.floor(Date.now() / MINT_WINDOW_MS) * MINT_WINDOW_MS;
  const id = `rlw_${scope}_${value}`;
  const nowIso = new Date().toISOString();
  const expiresAt = Math.floor((windowStart + MINT_WINDOW_MS) / 1000) + 7200;
  let count: number;
  try {
    try {
      const out = await docClient.send(new UpdateCommand({
        TableName: TABLES.SETTINGS,
        Key: { id },
        UpdateExpression: 'ADD #c :one SET #w = :w, updatedAt = :now, expiresAt = :exp',
        ConditionExpression: 'attribute_not_exists(#w) OR #w = :w',
        ExpressionAttributeNames: { '#c': 'count', '#w': 'windowStart' },
        ExpressionAttributeValues: { ':one': 1, ':w': windowStart, ':now': nowIso, ':exp': expiresAt },
        ReturnValues: 'ALL_NEW',
      }));
      count = Number(out.Attributes?.count ?? 1);
    } catch (e: any) {
      if (e?.name !== 'ConditionalCheckFailedException') throw e;
      // Window rolled since the row was written — start the new window at 1.
      const out = await docClient.send(new UpdateCommand({
        TableName: TABLES.SETTINGS,
        Key: { id },
        UpdateExpression: 'SET #c = :one, #w = :w, updatedAt = :now, expiresAt = :exp',
        ExpressionAttributeNames: { '#c': 'count', '#w': 'windowStart' },
        ExpressionAttributeValues: { ':one': 1, ':w': windowStart, ':now': nowIso, ':exp': expiresAt },
        ReturnValues: 'ALL_NEW',
      }));
      count = Number(out.Attributes?.count ?? 1);
    }
  } catch (e) {
    console.error('mint rate-limit check failed (failing open):', e);
    return { ok: true, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + MINT_WINDOW_MS - Date.now()) / 1000));
  return { ok: count <= limit, retryAfterSec };
}

function mintTooMany(res: VercelResponse, retryAfterSec: number) {
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({
    error: `Too many token requests — try again in ${Math.max(1, Math.ceil(retryAfterSec / 60))} minute(s)`,
  });
}

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

/** Client IP for rate-limit keys (first x-forwarded-for hop, else socket). */
function clientIp(req: VercelRequest): string {
  return String((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown').toLowerCase();
}

/** Shared 429: Retry-After header + friendly message (no enumeration). */
function tooMany(res: VercelResponse, rl: { retryAfterSec: number }, msg = 'Too many attempts — try again in a few minutes') {
  res.setHeader('Retry-After', String(rl.retryAfterSec));
  return res.status(429).json({ error: msg });
}

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
 */
const AUTH_FLOOR_LOGIN_MS = 1200;
const AUTH_FLOOR_FORGOT_MS = 2200;
const AUTH_FLOOR_RESEND_MS = 2200;
const AUTH_FLOOR_REGISTER_MS = 4500;

async function authRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  const authStartedAt = Date.now();
  const holdAuthFloor = async (floorMs: number): Promise<void> => {
    const remain = authStartedAt + floorMs - Date.now();
    if (remain > 0) await new Promise(resolve => setTimeout(resolve, remain));
  };
  try {
    const body = req.body || {};

    // ── GET/POST worker_token — short-lived HMAC token for the Modal render
    // worker (sent as X-PropReel-Token). Shared secret RENDER_API_TOKEN:
    // this endpoint signs "v1.<exp>.<uid>", the worker verifies signature and
    // a 10-minute expiry. Session is optional — anonymous callers get 'anon' —
    // but minting only ever happens through here, so the worker URL in the
    // public bundle is useless to direct scrapers.
    if (action === 'worker_token') {
      if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const secret = process.env.RENDER_API_TOKEN;
      if (!secret) return res.status(500).json({ error: 'RENDER_API_TOKEN is not configured' });

      // Rate limit before paying for session lookups. Per-IP first (bounds
      // anonymous harvesters), then per-user for signed-in callers.
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      const ipQuota = await consumeMintQuota('ip', ip, MINT_LIMIT_PER_IP);
      if (!ipQuota.ok) return mintTooMany(res, ipQuota.retryAfterSec);

      const { createHmac } = await import('crypto');
      const sessionUser = await getSessionUser(getTokenFromRequest(req));
      const uid = sessionUser?.id || 'anon';
      if (sessionUser) {
        const uidQuota = await consumeMintQuota('uid', uid, MINT_LIMIT_PER_USER);
        if (!uidQuota.ok) return mintTooMany(res, uidQuota.retryAfterSec);
      }
      const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutes
      const msg = `v1.${exp}.${uid}`;
      const sig = createHmac('sha256', secret).update(msg).digest('base64url');
      return res.status(200).json({ token: `${msg}.${sig}`, expiresAt: exp * 1000 });
    }

    // ── POST job_token — PAID, single-use token for exactly one worker job ─
    // The worker refuses to start a render / image edit / avatar without one,
    // and refuses a second use of the same token (S3 conditional put claim),
    // so this mint is where the charge happens: the price comes from
    // lib/renderPricing — the browser no longer decides what a job costs, and
    // a modified client can neither render for free nor underpay. The generic
    // v1 token above stays free (status polls and cancels need no charge).
    if (action === 'job_token') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const secret = process.env.RENDER_API_TOKEN;
      if (!secret) return res.status(500).json({ error: 'RENDER_API_TOKEN is not configured' });

      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      const ipQuota = await consumeMintQuota('ip', ip, MINT_LIMIT_PER_IP);
      if (!ipQuota.ok) return mintTooMany(res, ipQuota.retryAfterSec);

      const payer = await getSessionUser(getTokenFromRequest(req));
      if (!payer) return res.status(401).json({ error: 'Sign in to start a paid job' });
      const uidQuota = await consumeMintQuota('uid', payer.id, MINT_LIMIT_PER_USER);
      if (!uidQuota.ok) return mintTooMany(res, uidQuota.retryAfterSec);

      const b = (req.body || {}) as any;
      const scope = String(b.scope || '');
      const voiceoverText = typeof b.voiceover_text === 'string' ? b.voiceover_text : String(b.metadata?.voiceover_text ?? '');

      // FlashHead is priced per 10s of narration (per lib/renderPricing), so
      // the script must travel with the mint: no text → legacy flat rate
      // fallback; text beyond the 90-second cap → a clear client error.
      let credits: number | null;
      let priceError: string | null = null;
      if (scope === 'flashhead' && voiceoverText.trim()) {
        const seconds = narrationSecondsForText(voiceoverText);
        if (seconds > FLASHHEAD_MAX_SECONDS) {
          priceError =
            `This script is ~${Math.round(seconds)}s of narration — the cap is ${FLASHHEAD_MAX_SECONDS}s ` +
            `(~${Math.ceil(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC)} words). Shorten the voiceover and try again.`;
        }
      }
      credits = priceError ? null : jobCredits(scope, { tier: b.tier, configIndex: b.config_index, presetId: b.preset_id ?? b.metadata?.presetId, voiceover_text: b.voiceover_text, voiceoverText: b.metadata?.voiceover_text, duration: b.duration ?? b.metadata?.duration });
      if (credits == null) {
        return res.status(400).json({ error: priceError || 'Unknown job scope or tier' });
      }

      // Bind the token to the exact script it paid for (scope flashhead):
      // a tampered client must not mint a token for a 10-word script and then
      // POST a 1,000-word one to the worker. The worker re-hashes the body's
      // voiceover_text and rejects a mismatch — the only honest route to a
      // new price is a fresh mint (a fresh charge).
      const scriptHash = scope === 'flashhead' && voiceoverText.trim()
        ? createHash('sha256').update(voiceoverText.split(/\s+/).filter(Boolean).join(' ')).digest('hex').slice(0, 16)
        : undefined;

      // Same reasons/metadata the client-side deduct used to write, so the
      // ledger and the analytics that read it keep their shape.
      const reason =
        scope === 'render' ? 'Video generation'
        : scope === 'rerender' ? 'Clip re-render'
        : scope === 'flashhead' ? 'FlashHead lip-sync video'
        : scope === 'script' ? 'AI Writer voiceover script'
        : scope === 'description' ? 'Property description'
        : scope === 'social_post' ? 'Social media post'
        : `Image edit — ${b.preset_id || b.metadata?.presetId || 'custom'}`;
      // Ledger continuity: the description/social refund matchers (and the
      // analytics that read these rows) keyed on metadata.kind — keep writing
      // it even if a caller forgets to send it.
      const ledgerKind = scope === 'description' ? 'PROPERTY_DESCRIPTION' : scope === 'social_post' ? 'SOCIAL_POST' : null;
      const metadata = { ...(ledgerKind ? { kind: ledgerKind } : {}), ...(b.metadata || {}), scope, ...(b.tier ? { tier: b.tier } : {}), ...(scope === 'flashhead' && voiceoverText.trim() ? { narration_words: voiceoverText.split(/\s+/).filter(Boolean).length } : {}) };

      const { createHmac } = await import('crypto');
      const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutes
      const result = await deductCredits(
        payer.id,
        credits,
        reason,
        metadata,
        b.pool === 'agency' ? 'agency' : 'personal'
      );
      if (!result.success) {
        const isLimit = (result.error || '').includes('Monthly credit limit reached');
        return res.status(isLimit ? 402 : 400).json({
          error: result.error || 'Failed to charge credits',
          current_balance: result.newBalance,
          ...(isLimit ? { limit_reached: true } : {}),
        });
      }
      // v3 tokens carry the paid script's hash: msg = v3.<exp>.<uid>.<scope>.<hash>
      const msg = scriptHash
        ? `v3.${exp}.${payer.id}.${scope}.${scriptHash}`
        : `v2.${exp}.${payer.id}.${scope}`;
      const sig = createHmac('sha256', secret).update(msg).digest('base64url');
      return res.status(200).json({
        token: `${msg}.${sig}`,
        expiresAt: exp * 1000,
        scope,
        credits,
        new_balance: result.newBalance,
      });
    }

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
        return res.status(429).json({ error: `Too many signups from this network — try again in ${waitSec}s` });
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
          const { addMemberToAgency } = await import('../lib/agency');
          await addMemberToAgency(pendingInvite.agencyId, user.id, pendingInvite.role || 'AGENT');
          const { updateItem, TABLES } = await import('../lib/db');
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
          passwordHash: hashPassword(password),
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
            const { startTrial: beginTrial } = await import('../lib/trial');
            await beginTrial(user.id);
          }
        })(),
        // Give 5, get 5: attribute to ?ref= and grant the friend's +5 now; the
        // referrer's +5 is paid on this account's first purchase (lib/referral).
        (async () => {
          const { attributeReferral } = await import('../lib/referral');
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
        verifyPassword(password, 'scrypt$16384$dummy$dummy');
        await holdAuthFloor(AUTH_FLOOR_LOGIN_MS);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        await holdAuthFloor(AUTH_FLOOR_LOGIN_MS);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!user.emailVerified) {
        return res.status(403).json({
          error: 'Confirm your email first — open the confirmation link we sent you.',
          code: 'EMAIL_NOT_CONFIRMED',
        });
      }

      // Expired temporary account: sign-in is locked until they subscribe.
      // reactivate:true (correct password already verified above) lets them
      // back in to browse/pay — rendering stays blocked by deductCredits.
      {
        const { isTrialLocked } = await import('../lib/trial');
        if (isTrialLocked(user as any)) {
          if (body.reactivate !== true) {
            return res.status(403).json({
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
          const { isTrialLocked } = await import('../lib/trial');
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
      await updateUser(row.userId, { passwordHash: hashPassword(password), passwordResetToken: null, twoFactorEnabled: false, twoFactorSecret: null, twoFactorOptIn: false, twoFactorPendingToken: null, passwordChangedAt: new Date().toISOString() } as any);
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
        const { isTrialLocked } = await import('../lib/trial');
        if (isTrialLocked(pendingUser as any)) {
          if (body.reactivate !== true) {
            return res.status(403).json({
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
            passwordHash: hashPassword(`${randomToken()}${randomToken()}`),
            createdAt: now,
            updatedAt: now,
          } as any);
        } else if (!known.emailVerified || !known.passwordHash) {
          await updateUser(known.id, {
            emailVerified: true,
            ...(known.passwordHash ? {} : { passwordHash: hashPassword(`${randomToken()}${randomToken()}`) }),
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

/**
 * GET    /api/users?email=xxx   → find user by email
 * GET    /api/users?id=xxx      → get user by id
 * POST   /api/users             → create or update a user row (provisioning)
 *
 * Body (POST):
 *   email, fullName, phone?, role?, agencyName?, planId?, cycle?
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── ?action=maintenance — site Update Mode state ────────────────────
  // GET: public — the browser boot gate shows the maintenance page even
  // pre-login. POST: admin-session-only { enabled, message }.
  if (req.query.action === 'maintenance') {
    if (req.method === 'GET') {
      const state = await getMaintenanceState();
      return res.status(200).json({ success: true, ...state });
    }
    if (req.method === 'POST') {
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      const { enabled, message } = req.body || {};
      const state = await setMaintenanceState(
        !!enabled,
        typeof message === 'string' ? message.slice(0, 300) : undefined,
      );
      console.log(`Update mode ${state.enabled ? 'ENABLED' : 'disabled'} by ${gate.user.email}`);
      return res.status(200).json({ success: true, ...state });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
  if (req.query.action === 'admin_api_keys') {
    return adminApiKeysRoute(req, res);
  }
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
    const { parseObjectUrl, signS3Url, toEdgeUrl } = await import('../lib/s3Urls');
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
  // ── GET ?action=invoice_pdf&user_id=…&n=PR-… ─────────────────────────
  // Streams a stored invoice PDF through our own origin. Buckets are
  // private (M-5), and a session gate beats a long-lived signed link:
  // only the owner (or an admin) can fetch it, and the URL stops working
  // the moment it is forwarded or leaked.
  if (req.method === 'GET' && req.query.action === 'invoice_pdf') {
    const userId = String(req.query.user_id || '');
    const invoiceNumber = String(req.query.n || '');
    if (!userId || !/^PR-\d{8}-[A-Za-z0-9]{1,12}$/.test(invoiceNumber)) {
      return res.status(400).json({ error: 'Invalid invoice request' });
    }
    const gate = await requireOwner(req, userId);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: process.env.AWS_REGION || 'af-south-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });
      const obj = await s3.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets',
        Key: `invoices/${userId}/${invoiceNumber}.pdf`,
      }));
      const pdf = Buffer.from(await (obj.Body as any).transformToByteArray());
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoiceNumber}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).send(pdf);
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      console.error('invoice_pdf failed:', e);
      return res.status(500).json({ error: 'Could not load the invoice' });
    }
  }
  // The daily selftest cron GETs the bare path from vercel.json — no query
  // string, so the schedule can't break on path encoding. Cron requests carry
  // User-Agent vercel-cron/1.0 (or the schedule header), and the target action
  // still enforces its own Bearer CRON_SECRET gate, so faking the UA gains
  // nothing (it just reaches a 401).
  if (!req.query.action && isVercelCronRequest(req)) {
    (req.query as any).action = 'auth_selftest';
  }
  if (String(req.query.action || '').startsWith('auth_') || req.query.action === 'worker_token' || req.query.action === 'job_token') {
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
  if (req.method === 'GET' && req.query.action === 'admin_narakeet_usage') {
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
