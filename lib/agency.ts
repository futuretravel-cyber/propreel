/**
 * Agency core — creation, membership (hard 10-agent cap), per-agent credit
 * limits, and real-time usage analytics derived from the credit ledger.
 *
 * Privacy model: agency owners see CREDIT activity only (amounts, categories,
 * timestamps). Project files (videos/images) stay in each agent's own
 * dashboard and are never exposed through this module.
 */

import { getItem, putItem, updateItem, queryItems, scanItems, TABLES } from './db';
import { getUser, recordTransaction } from './userService';

/** Hard cap — agencies needing more agents create a second agency. */
export const MAX_AGENTS_PER_AGENCY = 10;

export interface AgencyCompanyDetails {
  registrationNumber?: string;
  vatNumber?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
}

export interface AgencyBranding {
  /** https URL of the report-specific logo (separate from the app logo) */
  reportLogoUrl?: string;
  /** Hex header colour for reports, e.g. '#6b21a8' */
  reportHeaderColor?: string;
}

export interface AgencyReportRecord {
  month: string; // 'YYYY-MM'
  url: string;
  generatedAt: string;
  totalCreditsUsed: number;
  agentCount: number;
}

export interface Agency {
  id: string;
  name: string;
  ownerId: string;
  company: AgencyCompanyDetails;
  branding: AgencyBranding;
  memberLimit: number; // always MAX_AGENTS_PER_AGENCY (10)
  poolCredits: number; // mirror of owner agencyPoolCredits for quick reads
  reports: AgencyReportRecord[];
  /** Slack/email webhook endpoint notified when a report is generated */
  webhookUrl?: string;
  lastWebhook?: { url: string; status: string; at: string; detail?: string };
  createdAt: string;
  updatedAt: string;
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── CRUD ────────────────────────────────────────────────────────────────

export async function createAgency(
  owner: { id: string; email: string; fullName: string; agencyName?: string | null },
  details: { name: string; company?: AgencyCompanyDetails; branding?: AgencyBranding }
): Promise<Agency> {
  const now = new Date().toISOString();
  const agency: Agency = {
    id: `agy_${owner.id}`,
    name: details.name.slice(0, 100),
    ownerId: owner.id,
    company: details.company || {},
    branding: details.branding || {},
    memberLimit: MAX_AGENTS_PER_AGENCY,
    poolCredits: 0,
    reports: [],
    createdAt: now,
    updatedAt: now,
  };
  await putItem(TABLES.AGENCIES, agency);
  // The creator is the agency admin — attach + promote in one pass.
  await putItem(TABLES.AGENCY_MEMBERS, { agencyId: agency.id, userId: owner.id, role: 'AGENCY_OWNER', addedAt: now });
  await updateItem(TABLES.USERS, { id: owner.id }, {
    agencyId: agency.id,
    agencyName: agency.name,
    role: 'AGENCY_OWNER',
  });
  return agency;
}

export async function getAgency(agencyId: string): Promise<Agency | null> {
  return getItem<Agency>(TABLES.AGENCIES, { id: agencyId });
}

export async function updateAgency(agencyId: string, updates: Partial<Agency>): Promise<void> {
  const clean: Record<string, any> = { updatedAt: new Date().toISOString() };
  for (const k of ['name', 'company', 'branding', 'lastWebhook', 'poolCredits'] as const) {
    if ((updates as any)[k] !== undefined) clean[k] = (updates as any)[k];
  }
  if (updates.reports !== undefined) clean.reports = updates.reports;
  if (updates.webhookUrl !== undefined) clean.webhookUrl = updates.webhookUrl;
  await updateItem(TABLES.AGENCIES, { id: agencyId }, clean);
}

// ─── Membership ──────────────────────────────────────────────────────────

export async function countMembers(agencyId: string): Promise<number> {
  const rows = await queryItems(TABLES.AGENCY_MEMBERS, {
    expression: '#agencyId = :a',
    names: { '#agencyId': 'agencyId' },
    values: { ':a': agencyId },
  });
  return rows.length;
}

export async function listMembers(agencyId: string): Promise<Array<{ userId: string; role: string; addedAt: string; name: string; email: string; credits: number; monthlyLimit: number | null }>> {
  const rows = await queryItems<any>(TABLES.AGENCY_MEMBERS, {
    expression: '#agencyId = :a',
    names: { '#agencyId': 'agencyId' },
    values: { ':a': agencyId },
  });
  const members = await Promise.all(rows.map(async (r) => {
    const u = await getUser(r.userId);
    return {
      userId: r.userId,
      role: r.role || 'AGENT',
      addedAt: r.addedAt,
      monthlyLimit: r.monthlyLimit ?? null,
      name: u?.fullName || '(deleted user)',
      email: u?.email || '(unknown)',
      credits: u?.credits ?? 0,
    };
  }));
  return members.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Attach a user to an agency. Throws when the agency is at its 10-agent cap
 * so callers can surface a clear message (invite + accept paths both use it).
 */
export async function addMemberToAgency(agencyId: string, userId: string, role: string = 'AGENT'): Promise<void> {
  const agency = await getAgency(agencyId);
  if (!agency) throw new Error('Agency not found');
  const count = await countMembers(agencyId);
  if (count >= agency.memberLimit) {
    throw new Error(`AGENT_LIMIT_REACHED:${agency.memberLimit}`);
  }
  const existing = await getItem(TABLES.AGENCY_MEMBERS, { agencyId, userId });
  if (existing) return; // idempotent
  await putItem(TABLES.AGENCY_MEMBERS, { agencyId, userId, role, addedAt: new Date().toISOString() });
  await updateItem(TABLES.USERS, { id: userId }, { agencyId, agencyName: agency.name });
}

export async function removeMember(agencyId: string, userId: string): Promise<void> {
  const { deleteItem } = await import('./db-helpers');
  await deleteItem(TABLES.AGENCY_MEMBERS, { agencyId, userId });
  await updateItem(TABLES.USERS, { id: userId }, { agencyId: null });
}

// ─── Per-agent monthly credit limit ──────────────────────────────────────

export async function setAgentMonthlyLimit(agencyId: string, userId: string, monthlyLimit: number | null): Promise<void> {
  const clean: Record<string, any> = {};
  if (monthlyLimit == null) {
    clean.monthlyLimit = null; // marshallOptions removes undefined; explicit null clears
  } else {
    clean.monthlyLimit = Math.max(0, Math.floor(monthlyLimit));
  }
  await updateItem(TABLES.AGENCY_MEMBERS, { agencyId, userId }, clean);
}

/** Credits an agent has spent (all sources) in the current calendar month. */
export async function agentMonthSpend(userId: string): Promise<number> {
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  const txs = await queryItems<{ amount: number; createdAt: string }>(TABLES.CREDIT_TRANSACTIONS, {
    expression: 'userId = :u',
    values: { ':u': userId },
  }, { limit: 400, scanIndexForward: false });
  return txs
    .filter(t => t.amount < 0 && new Date(t.createdAt) >= start)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
}

/**
 * Enforcement hook for the deduct path: returns an error string when the
 * agent would blow through their owner-set monthly limit, else null.
 */
export async function checkAgentLimit(userId: string, amount: number): Promise<string | null> {
  const user = await getUser(userId);
  if (!user?.agencyId) return null;
  const membership = await getItem<{ monthlyLimit: number | null }>(TABLES.AGENCY_MEMBERS, { agencyId: user.agencyId, userId });
  const limit = membership?.monthlyLimit;
  if (limit == null || limit <= 0) return null;
  const spent = await agentMonthSpend(userId);
  if (spent + amount > limit) {
    return `Monthly credit limit reached (${spent} of ${limit} used this month) — ask your agency admin to raise your limit`;
  }
  return null;
}

// ─── Real-time usage analytics (credits only — never project files) ──────

export interface AgentUsage {
  userId: string;
  name: string;
  email: string;
  creditsUsed: number;      // window total (negative ledger rows)
  rendersToday: number;     // video-feature deductions today
  monthSpend: number;       // calendar-month spend
  monthlyLimit: number | null;
  balance: number;
  byCategory: Record<string, number>;
}

export interface AgencyUsage {
  agencyId: string;
  agencyName: string;
  windowDays: number;
  totalUsed: number;
  poolUsed: number;
  personalUsed: number;
  memberCount: number;
  pendingInvites: number;
  perDay: Array<{ day: string; credits: number }>;
  agents: AgentUsage[];
  generatedAt: string;
}

function categoryOf(description: string): string {
  const d = description.toLowerCase();
  if (d.includes('video generation') || d.includes('reel')) return 'Video renders';
  if (d.includes('flashhead') || d.includes('lip-sync') || d.includes('talking')) return 'Talking Head';
  if (d.includes('image edit') || d.includes('staging') || d.includes('photo')) return 'Image edits';
  if (d.includes('expired')) return 'Expired';
  if (d.includes('gift') || d.includes('transfer')) return 'Transfers';
  return 'Other';
}

/**
 * Per-agent credit usage for the agency over the last `days` days, plus a
 * day-by-day series. Derived from each member's ledger (their PK, so cheap
 * per-agent queries — no full-table scan).
 */
export async function agencyUsageAnalytics(agencyId: string, days: number = 30): Promise<AgencyUsage> {
  const agency = await getAgency(agencyId);
  if (!agency) throw new Error('Agency not found');
  const members = await listMembers(agencyId);
  const memberIds = new Set(members.map(m => m.userId));

  const since = new Date(Date.now() - days * 86400000);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const dayBuckets = new Map<string, number>();
  const agents: AgentUsage[] = [];
  let totalUsed = 0, poolUsed = 0, personalUsed = 0;

  for (const m of members) {
    const txs = await queryItems<{ amount: number; description: string; createdAt: string; metadata?: any }>(
      TABLES.CREDIT_TRANSACTIONS,
      { expression: 'userId = :u', values: { ':u': m.userId } },
      { limit: 400, scanIndexForward: false }
    );
    const inWindow = txs.filter(t => t.amount < 0 && new Date(t.createdAt) >= since);
    const byCategory: Record<string, number> = {};
    let used = 0, rendersToday = 0;
    for (const t of inWindow) {
      used += Math.abs(t.amount);
      const cat = categoryOf(t.description || '');
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(t.amount);
      const at = new Date(t.createdAt);
      if (at >= todayStart && cat === 'Video renders') rendersToday++;
      if (at >= monthStart) {
        const day = at.toISOString().slice(0, 10);
        dayBuckets.set(day, (dayBuckets.get(day) || 0) + Math.abs(t.amount));
      }
      if (t.metadata?.pool === 'agency') poolUsed += Math.abs(t.amount);
      else personalUsed += Math.abs(t.amount);
    }
    totalUsed += used;
    agents.push({
      userId: m.userId,
      name: m.name,
      email: m.email,
      creditsUsed: used,
      rendersToday,
      monthSpend: await agentMonthSpend(m.userId),
      monthlyLimit: m.monthlyLimit,
      balance: m.credits,
      byCategory,
    });
  }

  const perDay: Array<{ day: string; credits: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    perDay.push({ day: d, credits: dayBuckets.get(d) || 0 });
  }

  // Pending invites live in settings (type agency_invite)
  const invites = await scanItems<any>(TABLES.SETTINGS, {
    filter: { expression: '#t = :t AND agencyId = :a AND #s = :s', names: { '#t': 'type', '#s': 'status' }, values: { ':t': 'agency_invite', ':a': agencyId, ':s': 'pending' } },
    limit: 50,
  }).catch(() => [] as any[]);

  return {
    agencyId,
    agencyName: agency.name,
    windowDays: days,
    totalUsed,
    poolUsed,
    personalUsed,
    memberCount: members.length,
    pendingInvites: invites.length,
    perDay,
    agents: agents.sort((a, b) => b.creditsUsed - a.creditsUsed),
    generatedAt: new Date().toISOString(),
  };
}

/** Admin overview: every agency with member counts and owner info. */
export async function listAllAgencies(): Promise<Array<Agency & { memberCount: number; ownerEmail: string }>> {
  const agencies = await scanItems<Agency>(TABLES.AGENCIES, { limit: 200 });
  return Promise.all(agencies.map(async (a) => {
    const owner = await getUser(a.ownerId);
    return { ...a, memberCount: await countMembers(a.id), ownerEmail: owner?.email || '(unknown)' };
  }));
}
