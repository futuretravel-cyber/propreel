/**
 * /api/users — agency domain.
 *
 * The agency_* nested routes (create, members, invites, limits, reports) plus
 * the platform agency list and the integration feature flags.
 * Dispatched from api/users.ts — the public route surface is unchanged.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, getUserByEmail, deleteUser } from '../../lib/userService';
import { TABLES, queryItems, putItem, getItem, scanItems } from '../../lib/db';
import { deleteItem } from '../../lib/db-helpers';
import { deleteSessionsForUser, requireOwner, requireAdminSession, isAdminEmail } from '../../lib/auth';
import { sendEmail, agencyInviteTemplate } from '../../lib/email';
import { rawS3Url, signS3Url, toEdgeUrl } from '../../lib/s3Urls';
import { siteOrigin } from './shared';

/**
 * Agency branding URLs follow the same "frozen presign" discipline as the
 * project rows (docs/uploads-origin-isolation.md §9):
 *   • WRITE — `rawS3Url` normalises any of our object URLs to the canonical
 *     unsigned bucket form, so a row can never hold an expiring presign.
 *     Foreign URLs (a pasted https logo) pass through untouched.
 *   • READ — `signS3Url` + `toEdgeUrl` mint a fresh presign on the media
 *     origin for whatever form a row holds, so rows written before this
 *     boundary (frozen edge presigns) self-heal instead of rendering broken.
 */
function normalizeBranding(branding: any): any {
  if (!branding || typeof branding !== 'object') return branding;
  const out = { ...branding };
  if (typeof out.logoUrl === 'string') out.logoUrl = rawS3Url(out.logoUrl);
  if (typeof out.reportLogoUrl === 'string') out.reportLogoUrl = rawS3Url(out.reportLogoUrl);
  return out;
}

async function resignAgencyMedia(agency: any): Promise<any> {
  const logoUrl = agency?.branding?.logoUrl;
  if (typeof logoUrl !== 'string' || !logoUrl) return agency;
  const signed = await signS3Url(logoUrl);
  return { ...agency, branding: { ...agency.branding, logoUrl: toEdgeUrl(signed || logoUrl) } };
}

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


export async function agencyRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  const {
    createAgency, getAgency, updateAgency, listMembers, addMemberToAgency,
    removeMember, setAgentMonthlyLimit, agencyUsageAnalytics, listAllAgencies,
    MAX_AGENTS_PER_AGENCY,    } = await import('../../lib/agency');
  const body = req.body || {};

  // Session gate: every agency action names its acting user via user_id /
  // inviter_user_id — identity must come from the cookie, never the payload
  // (otherwise anyone could impersonate an agency owner by passing their id).
  // admin_agencies and feature_flags are handled below with their own
  // admin-session checks; feature_flags GET stays public.
  if (action !== 'feature_flags' && action !== 'admin_agencies') {
    const claimed = String(body.user_id || body.inviter_user_id || req.query.user_id || '');
    const gate = await requireOwner(req, claimed);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
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
        { name: String(name), company, branding: normalizeBranding(branding) }
      );
      return res.status(201).json({
        success: true,
        agency: await resignAgencyMedia(agency),
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
      const { scanItems } = await import('../../lib/db');
      const invites = (await scanItems<any>(TABLES.SETTINGS, {
        filter: { expression: '#t = :t AND agencyId = :a AND #s = :s', names: { '#t': 'type', '#s': 'status' }, values: { ':t': 'agency_invite', ':a': targetAgencyId, ':s': 'pending' } },
        limit: 50,
      }).catch(() => [] as any[]));
      const isOwner = user.role === 'AGENCY_OWNER' || user.role === 'ADMIN' || isAdminEmail(user.email) || agency?.ownerId === user.id;
      return res.status(200).json({
        success: true,
        agency: await resignAgencyMedia(agency),
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

      const { countMembers } = await import('../../lib/agency');
      const { scanItems } = await import('../../lib/db');
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
        // Role assignment is an auditable action (audit §11).
        const { recordAdminAction } = await import('../../lib/adminAudit');
        await recordAdminAction({
          by: inviter.email,
          action: 'ROLE_CHANGE',
          target: invitee.id,
          detail: `Added ${invitee.email} to ${agency.name || agencyId} as ${role || 'AGENT'}`,
        });
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
      if (branding) updates.branding = { ...agency.branding, ...normalizeBranding(branding) };
      if (webhook_url !== undefined) updates.webhookUrl = webhook_url ? String(webhook_url) : undefined;
      await updateAgency(owner.agencyId, updates);
      const fresh = await getAgency(owner.agencyId);
      return res.status(200).json({ success: true, agency: await resignAgencyMedia(fresh) });
    }

    // ── GET ?action=agency_report&user_id=…&key=… — stream a stored PDF ─
    if (action === 'agency_report') {
      const user = await getUser(String(req.query.user_id || ''));
      const key = String(req.query.key || '');
      if (!user?.agencyId || !key.startsWith(`reports/${user.agencyId}/`)) {
        return res.status(403).json({ error: 'Not your agency\'s report' });
      }
      const { getReportPdf } = await import('../../lib/agencyReport');
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
      const { generateAndStoreAgencyReport, generateAgentReports } = await import('../../lib/agencyReport');
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
      const { zipReportHistory } = await import('../../lib/agencyReport');
      const zip = await zipReportHistory(user.agencyId, 12);
      if (!zip) return res.status(404).json({ error: 'No reports generated yet' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zip.fileName}"`);
      return res.status(200).send(zip.buffer);
    }

    // ── GET ?action=admin_agencies&email=… — platform agency list ────
    if (action === 'admin_agencies') {
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
      const agencies = await Promise.all((await listAllAgencies()).map(resignAgencyMedia));
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
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
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
