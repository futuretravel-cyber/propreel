import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser, getUserByEmail, deleteUser, getOrCreateUserByEmail } from '../lib/userService';
import { TABLES, queryItems, putItem, getItem } from '../lib/db';
import { deleteItem } from '../lib/db-helpers';
import {
  hashPassword, verifyPassword, createSession, getSessionUser, deleteSession,
  deleteSessionsForUser, sessionCookie, clearSessionCookie, getTokenFromRequest,
  issueEmailConfirmToken, consumeEmailConfirmToken, issuePasswordResetToken,
  consumePasswordResetToken,
} from '../lib/auth';
import { sendEmail, confirmEmailTemplate, resetPasswordTemplate } from '../lib/email';

const isAdminEmail = (email: string | undefined | null) =>
  !!email && ADMIN_EMAILS.includes(String(email).toLowerCase());

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

async function agencyRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  const {
    createAgency, getAgency, updateAgency, listMembers, addMemberToAgency,
    removeMember, setAgentMonthlyLimit, agencyUsageAnalytics, listAllAgencies,
    MAX_AGENTS_PER_AGENCY,
  } = await import('../lib/agency');
  const body = req.body || {};

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
      await putItem(TABLES.SETTINGS, {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
      return res.status(201).json({ success: true, pending: true, message: 'Invite stored — they will join your agency when they sign up with this email.' });
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
    if (action === 'agency_remove_member') {
      const { user_id, target_user_id } = body;
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
      if (!isAdminEmail(String(req.query.email || ''))) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
      const { email, flags } = body;
      if (!isAdminEmail(String(email || ''))) {
        return res.status(403).json({ error: 'Admin access required' });
      }
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
 * Nested route: POST /api/users?action=delete — real account deletion.
 * Removes the DynamoDB user row, the user's projects, and every auth
 * session (so the email can never sign in again). Credits are intentionally
 * forfeited per the deletion flow the user confirms in the UI.
 */
async function deleteAccount(req: VercelRequest, res: VercelResponse) {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

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
 * Nested route: POST /api/users?action=update — whitelisted profile updates.
 */
async function updateUserFields(req: VercelRequest, res: VercelResponse) {
  const { user_id, updates } = req.body || {};
  if (!user_id || typeof updates !== 'object' || updates === null) {
    return res.status(400).json({ error: 'Missing user_id or updates' });
  }
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
        photoUrl: p?.photoUrl ? String(p.photoUrl).slice(0, 600) : undefined,
        logoUrl: p?.logoUrl ? String(p.logoUrl).slice(0, 600) : undefined,
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
  return res.status(200).json({ success: true, user: safeUser(updated) });
}

/**
 * Nested route: GET /api/users?action=admin_stats — real platform stats.
 * Admin-only (server-side email check). Counts come from DynamoDB directly.
 */
async function adminStats(req: VercelRequest, res: VercelResponse) {
  const email = String(req.query.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

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
 */
async function listUsers(req: VercelRequest, res: VercelResponse) {
  const email = String(req.query.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
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
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
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
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ success: true, preferences: user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES });
  }
  if (req.method === 'POST') {
    const { user_id, preferences } = req.body || {};
    if (!user_id || typeof preferences !== 'object' || preferences === null) {
      return res.status(400).json({ error: 'Missing user_id or preferences' });
    }
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
  const email = String(req.query.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

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
      createdAt: t.createdAt,
    })),
  });
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
  const email = String(req.query.email || body.email || '').toLowerCase();
  if (!isAdminEmail(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

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
      return res.status(200).json({ success: true, url, instant });
    }

    return res.status(404).json({ error: `Unknown P&L action: ${action}` });
  } catch (err) {
    console.error('P&L error:', err);
    return res.status(500).json({ error: 'P&L request failed' });
  }
}

/** Strip auth secrets before a user row leaves the API. */
function safeUser(user: any) {
  if (!user) return user;
  const { passwordHash, emailConfirmToken, passwordResetToken, confirmEmailLastSentAt, ...rest } = user;
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
    emailVerified: false,
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
    const { addCredits } = await import('../lib/userService');
    const bonusExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
function googleConfigError(title = 'Google sign-in is not configured', detail = ''): string {
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

/** Canonical origin for links inside confirmation / reset emails. */
function siteOrigin(req: VercelRequest): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host && host !== 'localhost') {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return `${proto}://${host}`;
  }
  return process.env.VITE_APP_URL || 'https://propreel-xi.vercel.app';
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
async function authRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  try {
    const body = req.body || {};

    // ── POST auth_register ───────────────────────────────────────────
    if (action === 'auth_register') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { email, password, fullName, phone = null, agencyName = null, planId = null, cycle = 'MONTHLY', redirect } = body;
      if (!email || !fullName) return res.status(400).json({ error: 'Missing email or fullName' });
      if (!EMAIL_RE.test(String(email))) return res.status(400).json({ error: 'Enter a valid email address' });
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const normalized = String(email).toLowerCase();
      const existing = await getUserByEmail(normalized);
      if (existing?.emailVerified) {
        return res.status(409).json({
          error: existing.passwordHash
            ? 'An account with this email already exists — sign in instead.'
            : 'An account with this email already exists. Use "Forgot password" to set a password.',
        });
      }

      // Provision (creates the row + signup bonus + admin grant) or reuse the
      // still-unconfirmed row (re-register with a corrected password).
      const { user } = await provisionUser({ email: normalized, fullName, phone, agencyName, planId, cycle });
      await updateUser(user.id, { passwordHash: hashPassword(password), emailVerified: false } as any);
      const fresh = (await getUser(user.id)) || user;

      const token = await issueEmailConfirmToken(fresh, redirect);
      const confirmUrl = `${siteOrigin(req)}/confirm-email?token=${token}`;
      const tpl = confirmEmailTemplate(fresh.fullName || '', confirmUrl);
      const sent = await sendEmail({ to: fresh.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
      if (!sent.ok) {
        console.error('Confirmation email failed:', sent.error);
        return res.status(502).json({
          error: `Account created, but the confirmation email could not be sent (${sent.error}). Use "Resend email" to retry.`,
          needsConfirmation: true,
        });
      }
      return res.status(201).json({ success: true, needsConfirmation: true, email: fresh.email, userId: fresh.id });
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
      const sessionToken = await createSession(user.id);
      res.setHeader('Set-Cookie', sessionCookie(sessionToken, req));
      const updated = await getUser(user.id);
      return res.status(200).json({ success: true, redirect: row.redirect || null, user: safeUser(updated) });
    }

    // ── POST auth_resend {email, redirect?} ───────────────────────────
    if (action === 'auth_resend') {
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
        if (!sent.ok) return res.status(502).json({ error: `Could not send the email: ${sent.error}` });
      }
      // Generic success — never reveals whether the address exists
      return res.status(200).json({ success: true, message: 'If that address needs confirmation, the email is on its way.' });
    }

    // ── POST auth_login {email, password} ────────────────────────────
    if (action === 'auth_login') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const email = String(body.email || '').toLowerCase();
      const password = String(body.password || '');
      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        // Equalize timing so probing can't distinguish unknown emails
        verifyPassword(password, 'scrypt$16384$dummy$dummy');
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!user.emailVerified) {
        return res.status(403).json({
          error: 'Confirm your email first — open the confirmation link we sent you.',
          code: 'EMAIL_NOT_CONFIRMED',
        });
      }
      const sessionToken = await createSession(user.id);
      res.setHeader('Set-Cookie', sessionCookie(sessionToken, req));
      return res.status(200).json({ success: true, user: safeUser(user) });
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
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${siteOrigin(req)}/api/users?action=auth_google_callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state: safe,
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

        // 3) Find-or-create the account (new Google users get the standard
        //    signup bonus via provisionUser; existing accounts keep their name).
        const existing = await getUserByEmail(email);
        const user = existing || (await provisionUser({
          email,
          fullName: String(profile.name || email).slice(0, 120),
          role: 'AGENT',
        })).user;

        // 4) First-party session + land on the requested destination
        const token = await createSession(user.id);
        res.setHeader('Set-Cookie', sessionCookie(token, req));
        const dest = state.startsWith('/') && !state.startsWith('//') ? state : '/dashboard';
        return res.redirect(302, dest);
      } catch (oauthErr: any) {
        console.error('Google OAuth error:', oauthErr);
        return res.status(500).send(googleConfigError('Google sign-in failed', String(oauthErr?.message || oauthErr)));
      }
    }

    if (action === 'auth_session') {
      const user = await getSessionUser(getTokenFromRequest(req));
      return res.status(200).json({ user: user ? safeUser(user) : null });
    }

    // ── POST auth_logout ──────────────────────────────────────────────
    if (action === 'auth_logout') {
      await deleteSession(getTokenFromRequest(req));
      res.setHeader('Set-Cookie', clearSessionCookie(req));
      return res.status(200).json({ success: true });
    }

    // ── POST auth_forgot {email} ──────────────────────────────────────
    if (action === 'auth_forgot') {
      const email = String(body.email || '').toLowerCase();
      const user = EMAIL_RE.test(email) ? await getUserByEmail(email) : null;
      if (user) {
        const token = await issuePasswordResetToken(user);
        const tpl = resetPasswordTemplate(`${siteOrigin(req)}/reset-password?token=${token}`);
        const sent = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
        if (!sent.ok) console.error('Password-reset email failed:', sent.error);
      }
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
      await updateUser(row.userId, { passwordHash: hashPassword(password), passwordResetToken: null } as any);
      await deleteSessionsForUser(row.userId);
      return res.status(200).json({ success: true });
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
  // Nested routes (function consolidation)
  if (req.query.action === 'preferences') {
    return notificationPreferences(req, res);
  }
  if (req.query.action === 'update' && req.method === 'POST') {
    return updateUserFields(req, res);
  }
  if (req.query.action === 'delete' && req.method === 'POST') {
    return deleteAccount(req, res);
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

    try {
      const user = id ? await getUser(id) : await getUserByEmail(String(email).toLowerCase());
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(200).json(safeUser(user));
    } catch (error) {
      console.error('Get user error:', error);
      return res.status(500).json({ error: 'Failed to get user' });
    }
  }

  if (req.method === 'POST') {
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
      return res.status(created ? 201 : 200).json({ success: true, user: safeUser(user), created });
    } catch (error) {
      console.error('Create user error:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
