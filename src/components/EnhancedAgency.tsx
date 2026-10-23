import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { formatDate, formatRelative, formatZar } from '../lib/utils';
import { PropReelAPI } from '../lib/api';
import {
  Users, Plus, Zap, TrendingUp, Mail, Settings,
  BarChart3, CheckCircle2, Send, Gift, Film, Download,
  Building2, Clock, Mic,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Real agency data: members come from the agency_members table ──────────

interface AgencyMember {
  id: string;
  fullName: string;
  email: string;
  credits: number;
  role: string;
  avatar: string;
  createdAt: string;
  monthlyLimit?: number | null;
}

interface PendingInvite {
  id: string;
  email: string;
  createdAt: string;
}

interface AgencyRecord {
  id: string;
  name: string;
  memberLimit: number;
  poolCredits: number;
  company?: Record<string, string | undefined>;
  branding?: { reportLogoUrl?: string; reportHeaderColor?: string };
  webhookUrl?: string;
  reports?: Array<{ month: string; url: string; generatedAt: string; totalCreditsUsed: number; agentCount: number }>;
  lastWebhook?: { url: string; status: string; at: string; detail?: string };
}

interface AgentUsageRow {
  userId: string;
  name: string;
  email: string;
  creditsUsed: number;
  rendersToday: number;
  monthSpend: number;
  monthlyLimit: number | null;
  balance: number;
  byCategory: Record<string, number>;
}

interface AgencyUsageData {
  windowDays: number;
  totalUsed: number;
  poolUsed: number;
  personalUsed: number;
  memberCount: number;
  pendingInvites: number;
  perDay: Array<{ day: string; credits: number }>;
  agents: AgentUsageRow[];
  generatedAt: string;
}

interface AgencyProject {
  id: string;
  title: string;
  kind?: 'REEL' | 'FLASHHEAD' | 'IMAGE' | 'SOCIAL';
  status?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number;
  createdAt: string;
  agentName?: string;
  agentAvatar?: string;
}

const onboardingSteps = [
  { title: 'Welcome to Your Agency Dashboard', description: 'Manage your team, track credits, and keep everyone productive.', icon: '👋' },
  { title: 'Invite Your Team', description: 'Add agents by email. Existing PropReel users join instantly; new users join when they sign up with that email.', icon: '📧' },
  { title: 'Share Credits', description: 'Transfer credits to team members — transfers are instant and tracked in both ledgers.', icon: '⚡' },
  { title: "You're All Set!", description: 'Your agency is ready. Every member creates stunning property videos together.', icon: '🚀' },
];

export default function EnhancedAgency() {
  const confirm = useConfirm();
  const { user, refresh, isAdmin } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'overview' | 'members' | 'team_credits' | 'usage' | 'reports' | 'history' | 'onboarding' | 'settings'>('overview');
  const isLead = user?.role === 'AGENCY_OWNER' || user?.role === 'ADMIN';
  const [members, setMembers] = useState<AgencyMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [agency, setAgency] = useState<AgencyRecord | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [maxAgents, setMaxAgents] = useState(10);
  const [canInvite, setCanInvite] = useState(false);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('AGENT');
  const [inviting, setInviting] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [giftTarget, setGiftTarget] = useState<AgencyMember | null>(null);
  const [giftAmount, setGiftAmount] = useState(50);
  const [settings, setSettings] = useState({ agencyName: user?.agencyName || '' });
  const [poolAmount, setPoolAmount] = useState(500);
  const [poolLoading, setPoolLoading] = useState(false);
  const [limitEditing, setLimitEditing] = useState<AgencyMember | null>(null);
  const [limitValue, setLimitValue] = useState(200);

  // Real team list from the backend (agency_overview: cap, roles, reports)
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users?action=agency_overview&user_id=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      const overviewMembers: AgencyMember[] = (data.members || []).map((m: any) => ({
        id: m.userId,
        fullName: m.name,
        email: m.email,
        credits: m.credits,
        role: m.role,
        avatar: (m.name || '?').split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase(),
        createdAt: m.addedAt,
        monthlyLimit: m.monthlyLimit ?? null,
      }));
      setMembers(overviewMembers);
      setInvites(data.invites || []);
      setAgency(data.agency || null);
      setIsOwner(Boolean(data.isOwner));
      setMaxAgents(data.maxAgents || 10);
      setCanInvite(Boolean(data.canInvite));
      const name = data.agency?.name || null;
      setAgencyName(name);
      if (name) setSettings({ agencyName: name });
    } catch {
      toast.error('Could not load your agency team');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Per-agent monthly credit limit (owner control) ──────────────────
  const saveLimit = async () => {
    if (!limitEditing) return;
    try {
      const res = await fetch('/api/users?action=agency_set_limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, target_user_id: limitEditing.id, monthly_limit: limitValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not set limit');
      toast.success(`Monthly limit of ${limitValue} credits set for ${limitEditing.fullName}`, 'Limit Saved');
      setLimitEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Could not set limit');
    }
  };

  // ── Remove member (owner control) ───────────────────────────────────
  const removeMember = async (m: AgencyMember) => {
    if (!(await confirm(`Remove ${m.fullName} from the agency? They keep their personal account and projects.`, { title: 'Remove member?', confirmLabel: 'Remove', destructive: true }))) return;
    try {
      const res = await fetch('/api/users?action=agency_remove_member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, target_user_id: m.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove member');
      toast.success(`${m.fullName} removed from the agency`, 'Member Removed');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Could not remove member');
    }
  };

  // ── Delete member ACCOUNT (owner control — cannot be undone) ────────
  // Wipes the account, projects and sessions. For accounts the agency
  // created via invite (the agent never paid a subscription themselves),
  // the agency admin is the natural person to also take that away.
  const deleteMember = async (m: AgencyMember) => {
    if (!(await confirm(`Permanently DELETE ${m.fullName}'s account (${m.email})?

This removes their account, projects and sign-ins — it cannot be undone. The email address can only be used again by creating a brand-new account. Use "Remove" instead if you only want to detach them from the agency.`, { title: 'Delete account?', confirmLabel: 'Delete account', destructive: true }))) return;
    try {
      const res = await fetch('/api/users?action=agency_delete_member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, target_user_id: m.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete the account');
      toast.success(`${m.fullName}'s account was permanently deleted`, 'Account Deleted');
      load();
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Could not delete the account');
    }
  };

  // Real invite via the backend (adds existing users instantly, stores pending
  // invites, enforces the 10-agent cap server-side)
  const sendInvite = async () => {
    if (!user?.id || !inviteEmail.trim()) { toast.error('Enter an email address'); return; }
    setInviting(true);
    try {
      const res = await fetch('/api/users?action=agency_invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviter_user_id: user.id, invite_email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      if (data.addedExisting) {
        toast.success(`${data.member} was added to your agency`, 'Member Added');
      } else {
        toast.success(data.message || 'Invite stored', 'Invite Pending');
      }
      setInviteEmail('');
      setShowInvite(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  // Real credit transfer (ledger type stays 'gift' server-side)
  const transferCredits = async () => {
    if (!giftTarget) return;

    try {
      await fetch('/api/credits?action=gift_email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_user_id: user?.id, to_email: giftTarget.email, amount: giftAmount, reason: `Agency gift from ${user?.email}` }),
      });
      toast.success(`Transferred ${giftAmount} credits to ${giftTarget.fullName}`, 'Transfer Sent');
      setGiftTarget(null);
      refresh();
      load();
    } catch (e: any) {
      const msg = await e.message;
      toast.error(msg || 'Transfer failed');
    }
  };

  // Save agency settings (persists the agency name via the agency endpoint)
  const saveSettings = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/users?action=agency_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, name: settings.agencyName }),
      });
      if (!res.ok) throw new Error();
      toast.success('Agency settings saved', 'Settings Updated');
      load();
      refresh();
    } catch {
      toast.error('Could not save settings');
    }
  };

  // Real derived stats
  const totalCredits = useMemo(() => members.reduce((s, m) => s + (m.credits || 0), 0), [members]);
  const chartData = useMemo(() => members.map(m => ({
    name: m.fullName.split(' ')[0],
    credits: m.credits || 0,
  })), [members]);

  // ── No agency yet → creation CTA (owners create via /agency/signup) ──
  if (!loading && !agency && !user?.agencyId) {
    const canCreate = user?.role === 'AGENCY_OWNER' || user?.role === 'ADMIN' || !user?.agencyId;
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card-dark p-10 text-center">
          <Building2 className="w-12 h-12 text-purple-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">You're not part of an agency yet</h1>
          <p className="text-ink-400 mt-2 max-w-lg mx-auto">
            Create an agency to manage up to {maxAgents} agents, share a credit pool, set per-agent limits,
            and watch credit usage in real time. Videos and images stay in each agent's own dashboard.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            {canCreate && (
              <a href="/agency/signup" className="btn btn-primary">Create your agency</a>
            )}
            <button onClick={load} className="btn btn-secondary">Refresh</button>
          </div>
          <p className="text-xs text-ink-500 mt-4">Have more than {maxAgents} agents? Create more than one agency — each is capped at {maxAgents} to keep the system simple.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-purple-400" /> Agency Dashboard
          </h1>
          <p className="text-ink-400 mt-1">
            {agencyName || user?.agencyName || 'Agency'} • {members.length} of {agency?.memberLimit ?? maxAgents} agents
            {invites.length > 0 && ` • ${invites.length} pending invite${invites.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <button
              onClick={() => { setShowInvite(true); if (!canInvite) toast.info(`Agent limit — ${members.length + invites.length} of ${agency?.memberLimit ?? maxAgents} slots used. Remove a member or create a second agency.`); }}
              className="btn btn-primary text-sm"
            >
              <Plus className="w-4 h-4" /> Invite Agent
            </button>
          )}
          <button onClick={() => setTab('settings' as any)} className="btn btn-secondary text-sm"><Settings className="w-4 h-4" /> Settings</button>
        </div>
      </div>

      {/* 10-agent cap visibility */}
      {isOwner && (
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({ length: agency?.memberLimit ?? maxAgents }).map((_, i) => (
            <div
              key={i}
              title={i < members.length ? 'Filled slot' : i < members.length + invites.length ? 'Pending invite' : 'Open slot'}
              className={`w-3.5 h-3.5 rounded-full ${i < members.length ? 'bg-purple-500' : i < members.length + invites.length ? 'bg-yellow-500/70' : 'bg-ink-700'}`}
            />
          ))}
          <span className="text-xs text-ink-500 ml-2">{members.length} agents · {invites.length} invited · {(agency?.memberLimit ?? maxAgents) - members.length - invites.length} slots free · cap {(agency?.memberLimit ?? maxAgents)}</span>
        </div>
      )}

      {/* Invite Modal — real backend action */}
      {showInvite && (
        <div className="card-dark p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2"><Mail className="w-4 h-4 text-purple-400" /> Invite Team Member</h3>
            <button onClick={() => setShowInvite(false)} className="text-ink-400 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Email Address</label><input className="input" placeholder="agent@agency.co.za" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="AGENT">Agent</option><option value="AGENCY_OWNER">Admin</option></select>
            </div>
          </div>
          <p className="text-xs text-ink-500 mt-3">Existing PropReel accounts are added immediately. New users join automatically when they sign up with this email.</p>
          <div className="flex gap-3 mt-4">
            <button onClick={sendInvite} disabled={inviting} className="btn btn-primary"><Send className="w-4 h-4" /> {inviting ? 'Sending…' : 'Send Invite'}</button>
            <button onClick={() => setShowInvite(false)} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Limit editor panel */}
      {limitEditing && (
        <div className="card-dark p-6 border border-purple-500/30 animate-fade-in">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-purple-400" /> Monthly credit limit — {limitEditing.fullName}</h3>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <label className="label">Credits per calendar month (0 = blocked)</label>
              <input type="number" className="input" min={0} max={100000} value={limitValue} onChange={e => setLimitValue(Number(e.target.value))} />
            </div>
            <button onClick={saveLimit} className="btn btn-primary"><CheckCircle2 className="w-4 h-4" /> Save limit</button>
            <button onClick={() => setLimitEditing(null)} className="btn btn-ghost">Cancel</button>
          </div>
          <p className="text-xs text-ink-500 mt-2">Enforced server-side at every spend. Clear the field by setting a large value — there is no "unlimited" flag, or remove and re-invite the agent.</p>
        </div>
      )}

      {/* Gift panel */}
      {giftTarget && (
        <div className="card-dark p-6 border border-purple-500/30 animate-fade-in">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4"><Gift className="w-4 h-4 text-purple-400" /> Transfer credits to {giftTarget.fullName}</h3>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <label className="label">Amount (you have {user?.credits ?? 0})</label>
              <input type="number" className="input" min={1} max={user?.credits ?? 0} value={giftAmount} onChange={e => setGiftAmount(Number(e.target.value))} />
            </div>
            <button onClick={transferCredits} className="btn btn-primary" disabled={(user?.credits ?? 0) < 1}><Zap className="w-4 h-4" /> Send Transfer</button>
            <button onClick={() => setGiftTarget(null)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'members', label: 'Team Members', icon: <Users className="w-4 h-4" /> },
          ...(isLead ? [{ id: 'team_credits', label: 'Team Credits', icon: <Zap className="w-4 h-4" /> }] : []),
          ...(isOwner ? [{ id: 'usage', label: 'Live Usage', icon: <TrendingUp className="w-4 h-4" /> }] : []),
          ...(isOwner ? [{ id: 'reports', label: 'Reports', icon: <Download className="w-4 h-4" /> }] : []),
          ...(isLead ? [{ id: 'history', label: 'Render History', icon: <Film className="w-4 h-4" /> }] : []),
          { id: 'onboarding', label: 'Setup Guide', icon: <Zap className="w-4 h-4" /> },
          { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`flex items-center gap-2 tab-pill ${tab === t.id ? 'tab-pill-active' : ''}`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ──────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Team Members</p>
              <p className="text-3xl font-bold text-white mt-1">{loading ? '…' : members.length}</p>
            </div>
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Agency Credits</p>
              <p className="text-3xl font-bold text-white mt-1">{loading ? '…' : totalCredits.toLocaleString()}</p>
              <p className="text-xs text-ink-400 mt-2">across all members</p>
            </div>
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Pending Invites</p>
              <p className="text-3xl font-bold text-white mt-1">{invites.length}</p>
            </div>
            <div className="card-dark p-5">
              <p className="text-sm text-ink-400">Your Credits</p>
              <p className="text-3xl font-bold text-purple-400 mt-1">{user?.credits ?? 0}</p>
              <p className="text-xs text-ink-400 mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> transfer from your balance</p>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4">Credits by Member</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#7f8aab" fontSize={12} />
                  <YAxis stroke="#7f8aab" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                  <Bar dataKey="credits" fill="#800080" radius={[4, 4, 0, 0]} name="Credits remaining" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ─── Team Credits Tab — shared pool management (owner) ────── */}
      {tab === 'team_credits' && isLead && (
        <div className="space-y-6">
          {/* Shared pool card + top-up */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-dark p-6">
              <p className="text-sm text-ink-400">Shared Agency Pool</p>
              <p className="text-4xl font-black text-purple-400 mt-1">{user?.agencyPoolCredits ?? 0}</p>
              <p className="text-xs text-ink-400 mt-2">Spent first for tier render features (Essential → Premium) by every team member. Personal credits cover extras like FlashHead and photo edits.</p>
            </div>
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-purple-400" /> Top Up Pool</h3>
              <input
                type="range" min={50} max={5000} step={50}
                value={poolAmount}
                onChange={e => setPoolAmount(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm mt-2">
                <span className="text-ink-400">50</span>
                <span className="text-white font-bold">{poolAmount} credits · {formatZar(poolAmount)}</span>
                <span className="text-ink-400">5,000</span>
              </div>
              <button
                onClick={async () => {
                  if (!user) return;
                  setPoolLoading(true);
                  try {
                    const res = await fetch('/api/paystack/initialize', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ user_id: user.id, credits: poolAmount, email: user.email, pool: 'agency' }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Payment could not be initialized');
                    window.location.href = data.authorization_url;
                  } catch (e: any) {
                    toast.error(e.message || 'Pool top-up failed');
                    setPoolLoading(false);
                  }
                }}
                disabled={poolLoading}
                className="btn btn-primary w-full mt-4"
              >
                <Zap className="w-4 h-4" /> {poolLoading ? 'Opening checkout…' : `Top up ${poolAmount} credits`}
              </button>
              <p className="text-xs text-ink-500 mt-2">Secured by Paystack · pool credits expire 365 days after purchase</p>
            </div>
          </div>

          {/* Per-agent balances */}
          <div className="card-dark overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h3 className="font-semibold text-white text-sm">Agent Balances</h3>
              <p className="text-xs text-ink-500 mt-0.5">Personal credits per agent. Pool renders are deducted from the shared pool and appear in each agent's ledger as “agency pool”.</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Role</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Personal Credits</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-400 text-sm">Loading team…</td></tr>}
                {!loading && members.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-400 text-sm">No members yet — invite your first agent.</td></tr>}
                {!loading && members.map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 font-bold text-xs">{m.avatar}</div>
                        <div>
                          <p className="text-sm font-medium text-white">{m.fullName}</p>
                          <p className="text-xs text-ink-400">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="badge badge-muted">{m.role}</span></td>
                    <td className="px-4 py-3 text-sm text-white text-right">{m.credits}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setGiftTarget(m)} className="btn btn-ghost text-xs py-1"><Gift className="w-3 h-3" /> Transfer</button>
                        {isOwner && m.role !== 'AGENCY_OWNER' && (
                          <>
                            <button onClick={() => { setLimitEditing(m); setLimitValue(m.monthlyLimit ?? 200); }} className="btn btn-ghost text-xs py-1" title="Set monthly credit limit">
                              <TrendingUp className="w-3 h-3" /> {m.monthlyLimit != null ? `Limit: ${m.monthlyLimit}` : 'Limit'}
                            </button>
                            <button onClick={() => removeMember(m)} className="btn btn-ghost text-xs py-1 text-red-400" title="Remove from agency">✕ Remove</button>
                            <button onClick={() => deleteMember(m)} className="btn btn-ghost text-xs py-1 text-red-500" title="Permanently delete this agent's account">🗑 Delete account</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Live Usage Tab — real-time credit analytics (owner) ─── */}
      {tab === 'usage' && isOwner && user?.id && <AgencyLiveUsage userId={user.id} />}

      {/* ─── Reports Tab — branded monthly PDFs (owner) ───────────── */}
      {tab === 'reports' && isOwner && user?.id && (
        <AgencyReportsPanel
          userId={user.id}
          agency={agency}
          onRegenerated={load}
        />
      )}

      {/* ─── Render History Tab — agency-wide, team leads ─────────── */}
      {tab === 'history' && isLead && user?.id && <AgencyRenderHistory userId={user.id} />}

      {/* ─── Members Tab — real ────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-4">
          {invites.length > 0 && (
            <div className="card-dark p-4">
              <h3 className="text-sm font-semibold text-white mb-2">Pending invites</h3>
              {invites.map(i => (
                <div key={i.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-sm text-ink-300 flex items-center gap-2"><Clock className="w-3 h-3" /> {i.email}</span>
                  <span className="text-xs text-ink-500">invited {formatDate(i.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card-dark overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Credits</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Joined</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-400 text-sm">Loading team…</td></tr>}
                {!loading && members.map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 font-bold text-sm">{m.avatar}</div>
                        <div>
                          <p className="text-sm font-medium text-white">{m.fullName}</p>
                          <p className="text-xs text-ink-400">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="badge badge-muted">{m.role}</span></td>
                    <td className="px-4 py-3 text-sm text-white">{m.credits}</td>
                    <td className="px-4 py-3 text-sm text-ink-400">{m.createdAt ? formatDate(m.createdAt) : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setGiftTarget(m)} className="btn btn-ghost text-xs py-1"><Gift className="w-3 h-3" /> Transfer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Onboarding Tab ────────────────────────────────────────────── */}
      {tab === 'onboarding' && (
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white mb-2">Agency Setup Guide</h3>
          <div className="flex items-center gap-2 mb-8">
            {onboardingSteps.map((_, i) => (
              <div key={i} className={`flex-1 h-2 rounded-full ${i <= onboardingStep ? 'bg-purple-600' : 'bg-ink-700'}`} />
            ))}
          </div>
          <div className="text-center py-8">
            <span className="text-5xl">{onboardingSteps[onboardingStep].icon}</span>
            <h4 className="text-xl font-bold text-white mt-4">{onboardingSteps[onboardingStep].title}</h4>
            <p className="text-ink-400 mt-2 max-w-md mx-auto">{onboardingSteps[onboardingStep].description}</p>
          </div>
          <div className="flex items-center justify-center gap-4">
            {onboardingStep > 0 && <button onClick={() => setOnboardingStep(s => s - 1)} className="btn btn-secondary">← Previous</button>}
            {onboardingStep < onboardingSteps.length - 1
              ? <button onClick={() => setOnboardingStep(s => s + 1)} className="btn btn-primary">Next Step →</button>
              : <button onClick={() => { toast.success('Agency setup complete!'); setTab('overview'); }} className="btn btn-primary">Finish Setup 🎉</button>}
          </div>
        </div>
      )}

      {/* ─── Settings Tab — persists agency name ───────────────────────── */}
      {tab === 'settings' && (
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" /> Agency Settings
          </h3>
          <div className="max-w-md">
            <label className="label">Agency Name</label>
            <input
              type="text"
              className="input"
              value={settings.agencyName}
              onChange={(e) => setSettings({ ...settings, agencyName: e.target.value })}
              placeholder="e.g. Cape Luxury Properties"
            />
            <p className="text-xs text-ink-500 mt-2">This name appears on your team's dashboards.</p>
            <button onClick={saveSettings} className="btn btn-primary mt-4">
              <CheckCircle2 className="w-4 h-4" /> Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Live Usage (owner): real-time credit analytics — who is spending what,
// right now. Credit activity only; project files never leave the agent's
// own dashboard. Polls every 30 s while the tab is open.
// ═════════════════════════════════════════════════════════════════════

function AgencyLiveUsage({ userId }: { userId: string }) {
  const toast = useToast();
  const [usage, setUsage] = useState<AgencyUsageData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/users?action=agency_usage&user_id=${encodeURIComponent(userId)}&days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load usage');
      setUsage(data.usage);
      setUpdatedAt(new Date());
    } catch (e: any) {
      toast.error(e.message || 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  }, [userId, days]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000); // real-time: refresh every 30 s
    return () => clearInterval(t);
  }, [load]);

  const chartData = (usage?.perDay || []).map(d => ({
    day: d.day.slice(5),
    credits: d.credits,
  }));

  if (loading && !usage) return <div className="card-dark p-10 text-center text-sm text-ink-400">Loading live usage…</div>;
  if (!usage) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-ink-400 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live — refreshes every 30 s{updatedAt && ` · updated ${updatedAt.toLocaleTimeString('en-ZA')}`}
        </p>
        <div className="flex items-center gap-1">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-full text-xs font-medium transition ${days === d ? 'bg-purple-700/20 text-purple-300 border border-purple-500/30' : 'bg-white/5 text-ink-400 border border-transparent'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-dark p-5"><p className="text-sm text-ink-400">Credits used ({usage.windowDays}d)</p><p className="text-3xl font-bold text-white mt-1">{usage.totalUsed.toLocaleString()}</p></div>
        <div className="card-dark p-5"><p className="text-sm text-ink-400">From agency pool</p><p className="text-3xl font-bold text-purple-400 mt-1">{usage.poolUsed.toLocaleString()}</p></div>
        <div className="card-dark p-5"><p className="text-sm text-ink-400">From personal</p><p className="text-3xl font-bold text-white mt-1">{usage.personalUsed.toLocaleString()}</p></div>
        <div className="card-dark p-5"><p className="text-sm text-ink-400">Active agents</p><p className="text-3xl font-bold text-white mt-1">{usage.agents.filter(a => a.creditsUsed > 0).length}<span className="text-base text-ink-500">/{usage.memberCount}</span></p></div>
      </div>

      {chartData.length > 0 && (
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white mb-4 text-sm">Credits spent — last {usage.windowDays} days</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" tick={{ fill: '#8b8b9e', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} interval={Math.max(0, Math.floor(chartData.length / 12) - 1)} />
                <YAxis tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#c9c9d4' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="credits" name="Credits" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card-dark overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white text-sm">Who is using credits</h3>
          <p className="text-xs text-ink-500 mt-0.5">Credit activity only — each agent's videos and images stay in their own dashboard.</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Agent</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Used ({usage.windowDays}d)</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Renders today</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-400 uppercase">This month vs limit</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Balance</th>
            </tr>
          </thead>
          <tbody>
            {usage.agents.map(a => {
              const pct = a.monthlyLimit ? Math.min(100, Math.round((a.monthSpend / a.monthlyLimit) * 100)) : null;
              return (
                <tr key={a.userId} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-white">{a.name}</p>
                    <p className="text-xs text-ink-500">{a.email}</p>
                    {Object.keys(a.byCategory).length > 0 && (
                      <p className="text-[10px] text-ink-500 mt-1">
                        {Object.entries(a.byCategory).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-white text-right font-semibold">{a.creditsUsed.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {a.rendersToday > 0 ? <span className="badge badge-success">{a.rendersToday} today</span> : <span className="text-ink-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.monthlyLimit == null ? (
                      <span className="text-xs text-ink-500">No limit</span>
                    ) : (
                      <div>
                        <p className={`text-sm font-medium ${pct! >= 100 ? 'text-red-400' : pct! >= 80 ? 'text-yellow-400' : 'text-white'}`}>{a.monthSpend}/{a.monthlyLimit}</p>
                        <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden mt-1 w-24 ml-auto">
                          <div className={`h-full rounded-full ${pct! >= 100 ? 'bg-red-500' : pct! >= 80 ? 'bg-yellow-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-white text-right">{a.balance.toLocaleString()}</td>
                </tr>
              );
            })}
            {usage.agents.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-400">No agents yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Reports (owner): branded monthly PDFs, agent-scoped reports, zip export,
// webhook configuration. Generated automatically on the 1st by the cron;
// can also be generated on demand here.
// ═════════════════════════════════════════════════════════════════════

function AgencyReportsPanel({ userId, agency, onRegenerated }: { userId: string; agency: AgencyRecord | null; onRegenerated: () => void }) {
  const toast = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(agency?.webhookUrl || '');
  const [logoUrl, setLogoUrl] = useState(agency?.branding?.reportLogoUrl || '');
  const [headerColor, setHeaderColor] = useState(agency?.branding?.reportHeaderColor || '#6b21a8');
  const [savingBranding, setSavingBranding] = useState(false);

  const generate = async (agentScoped: boolean) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/users?action=agency_report_generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, month, agent_user_id: agentScoped ? 'all' : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Report generation failed');
      if (agentScoped && data.agents) {
        toast.success(`${data.agents.length} agent report(s) generated — download links stored`, 'Agent Reports Ready');
      } else {
        toast.success('Monthly report generated', 'Report Ready');
      }
      onRegenerated();
    } catch (e: any) {
      toast.error(e.message || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const downloadZip = () => {
    setZipLoading(true);
    window.location.href = `/api/users?action=agency_report_zip&user_id=${encodeURIComponent(userId)}`;
    setTimeout(() => setZipLoading(false), 3000);
  };

  const saveBranding = async () => {
    setSavingBranding(true);
    try {
      const res = await fetch('/api/users?action=agency_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          branding: { reportLogoUrl: logoUrl.trim() || undefined, reportHeaderColor: headerColor },
          webhook_url: webhookUrl.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      toast.success('Report branding and webhook saved', 'Saved');
      onRegenerated();
    } catch (e: any) {
      toast.error(e.message || 'Could not save');
    } finally {
      setSavingBranding(false);
    }
  };

  const reports = agency?.reports || [];

  return (
    <div className="space-y-4">
      <div className="card-dark p-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label className="label">Report month</label>
            <input type="month" className="input max-w-[200px]" value={month} max={new Date().toISOString().slice(0, 7)} onChange={e => setMonth(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => generate(false)} disabled={generating} className="btn btn-primary text-sm">
              {generating ? 'Generating…' : 'Generate agency report'}
            </button>
            <button onClick={() => generate(true)} disabled={generating} className="btn btn-secondary text-sm">
              Generate per-agent reports
            </button>
            <button onClick={downloadZip} disabled={zipLoading || reports.length === 0} className="btn btn-secondary text-sm disabled:opacity-50">
              Export zip (12 mo)
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-500 mt-3">
          Reports generate automatically on the 1st of each month for the month just ended. Agent-scoped PDFs are stored for distribution — email delivery will switch on when email infrastructure lands.
        </p>
      </div>

      <div className="card-dark overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white text-sm">Report history</h3>
        </div>
        {reports.length === 0 ? (
          <p className="p-6 text-sm text-ink-400 text-center">No reports yet — generate one above, or wait for the 1st-of-month cron.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {reports.map(r => (
                <tr key={r.month} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-white">{new Date(r.month + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</td>
                  <td className="px-4 py-3 text-sm text-ink-400">{r.totalCreditsUsed.toLocaleString()} credits · {r.agentCount} agent{r.agentCount === 1 ? '' : 's'}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">generated {new Date(r.generatedAt).toLocaleDateString('en-ZA')}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/api/users?action=agency_report&user_id=${encodeURIComponent(userId)}&key=${encodeURIComponent(`reports/${agency!.id}/${r.month}/propreel-credit-report-${agency!.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.month}.pdf`)}`} className="btn btn-ghost text-xs py-1.5 text-purple-300">
                      <Download className="w-3 h-3" /> PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Branding + webhook */}
      <div className="card-dark p-6 space-y-4">
        <h3 className="font-semibold text-white text-sm">Custom report branding & notifications</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Report logo URL (separate from app logo)</label>
            <input className="input" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://agency.co.za/logo.png" />
          </div>
          <div>
            <label className="label">Header colour</label>
            <div className="flex items-center gap-2">
              <input type="color" value={headerColor} onChange={e => setHeaderColor(e.target.value)} className="w-10 h-10 rounded-lg bg-transparent cursor-pointer" aria-label="Header colour" />
              <input className="input flex-1" value={headerColor} onChange={e => setHeaderColor(e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Webhook URL (Slack/email integrations — POSTed when a report generates)</label>
            <input className="input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
            {agency?.lastWebhook && (
              <p className="text-xs mt-1 text-ink-500">
                Last delivery: <span className={agency.lastWebhook.status === 'delivered' ? 'text-green-400' : 'text-yellow-400'}>{agency.lastWebhook.status}</span> at {new Date(agency.lastWebhook.at).toLocaleString('en-ZA')}
              </p>
            )}
          </div>
        </div>
        <button onClick={saveBranding} disabled={savingBranding} className="btn btn-primary text-sm">{savingBranding ? 'Saving…' : 'Save branding & webhook'}</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Agency-wide render history (team leads): every reel + talking-head clip
// the agency's agents produced, with per-agent attribution and per-agent stats.
// ═══════════════════════════════════════════════════════════════════════════

function AgencyRenderHistory({ userId }: { userId: string }) {
  const toast = useToast();
  const [projects, setProjects] = useState<AgencyProject[]>([]);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(true);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | 'REEL' | 'FLASHHEAD'>('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await PropReelAPI.agencyRenderHistory(userId);
        if (cancelled) return;
        setAuthorized(data.authorized);
        setAgencyName(data.agencyName);
        setProjects(data.projects);
        if (!data.authorized) {
          toast.info('Render history is available to agency team leads.');
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e.message || 'Failed to load render history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const agents = useMemo(
    () => [...new Map(projects.map(p => [p.agentName, p.agentName])).values()].filter(Boolean).sort(),
    [projects]
  );

  const perAgent = useMemo(() => {
    const m = new Map<string, { renders: number; runtime: number }>();
    for (const p of projects) {
      if (p.status !== 'READY') continue;
      const k = p.agentName || 'Unknown';
      const cur = m.get(k) || { renders: 0, runtime: 0 };
      cur.renders += 1;
      cur.runtime += p.durationSeconds || 0;
      m.set(k, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name: name.split(' ')[0], ...v }))
      .sort((a, b) => b.renders - a.renders);
  }, [projects]);

  const filtered = useMemo(() => projects.filter(p => {
    if (kindFilter !== 'all' && (p.kind || 'REEL') !== kindFilter) return false;
    if (agentFilter !== 'all' && p.agentName !== agentFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [projects, kindFilter, agentFilter, search]);

  const fmtRuntime = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

  if (!authorized) {
    return (
      <div className="card-dark p-10 text-center">
        <Film className="w-10 h-10 text-ink-500 mx-auto mb-3" />
        <p className="text-white font-medium">Team leads only</p>
        <p className="text-ink-400 text-sm mt-1">Ask your agency admin to promote your role to see the agency-wide render history.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="card-dark p-10 text-center text-sm text-ink-400">Loading agency render history…</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="card-dark p-10 text-center">
        <Film className="w-10 h-10 text-ink-500 mx-auto mb-3" />
        <p className="text-white font-medium">No renders yet</p>
        <p className="text-ink-400 text-sm mt-1">Every reel and AI Avatar Video your agents create will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Per-agent output */}
      {perAgent.length > 0 && (
        <div className="card-dark p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" /> Agent output — finished renders & runtime
          </h3>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perAgent} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                <YAxis tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#c9c9d4' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="renders" name="Finished renders" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search titles…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search agency renders" />
        <div className="flex items-center gap-1 px-1" role="group" aria-label="Filter by type">
          {([['all', 'All'], ['REEL', 'Reels'], ['FLASHHEAD', 'AI Avatar Video']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKindFilter(k)} className={`px-3 py-1 rounded-full text-xs font-medium transition ${kindFilter === k ? 'bg-purple-700/20 text-purple-300 border border-purple-500/30' : 'bg-white/5 text-ink-400 hover:text-white border border-transparent'}`}>
              {label}
            </button>
          ))}
        </div>
        {agents.length > 1 && (
          <select className="input max-w-[180px] text-sm" value={agentFilter} onChange={e => setAgentFilter(e.target.value)} aria-label="Filter by agent">
            <option value="all">All agents</option>
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <span className="text-xs text-ink-500 ml-auto">{filtered.length} of {projects.length}{agencyName ? ` · ${agencyName}` : ''}</span>
      </div>

      {/* Feed */}
      <div className="card-dark divide-y divide-white/5 overflow-hidden">
        {filtered.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-4">
            {/* Thumbnail */}
            <div className="w-20 h-12 rounded-lg overflow-hidden bg-ink-800 flex-shrink-0 flex items-center justify-center">
              {p.thumbnailUrl ? (
                <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              ) : p.videoUrl && p.status === 'READY' ? (
                <video src={p.videoUrl} muted preload="metadata" className="w-full h-full object-cover" aria-hidden="true" />
              ) : (
                <span className="text-lg">{p.kind === 'FLASHHEAD' ? '🎙️' : '🎬'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-white truncate max-w-[280px]">{p.title}</p>
                {p.kind === 'FLASHHEAD' ? (
                  <span className="badge badge-brand text-[10px] flex items-center gap-1"><Mic className="w-3 h-3" /> AI Avatar Video</span>
                ) : (
                  <span className="badge badge-brand text-[10px]"><Film className="w-3 h-3 inline" /> Reel</span>
                )}
                <span className={`badge text-[10px] ${p.status === 'READY' ? 'badge-success' : p.status === 'PROCESSING' ? 'badge-warning' : p.status === 'FAILED' ? 'badge-danger' : 'badge-muted'}`}>
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-1">
                {p.agentAvatar && <span className="inline-block w-4 h-4 rounded-full bg-purple-700/40 text-purple-200 text-[9px] leading-4 text-center mr-1 align-middle">{p.agentAvatar}</span>}
                {p.agentName} · {formatRelative(p.createdAt)}
                {p.durationSeconds ? ` · ${fmtRuntime(p.durationSeconds)}` : ''}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {p.videoUrl && p.status === 'READY' && (
                <button onClick={() => window.open(p.videoUrl!, '_blank')} className="btn btn-ghost text-xs py-1.5 text-green-400 hover:text-green-300" title="Watch">
                  Watch
                </button>
              )}
              {p.videoUrl && p.status === 'READY' && (
                <button
                  onClick={() => { window.location.href = `/api/projects?action=social_pack&user_id=${encodeURIComponent(userId)}&id=${encodeURIComponent(p.id)}`; }}
                  className="btn btn-ghost text-xs py-1.5 text-purple-300 hover:text-purple-200"
                  title="Download branded social pack"
                >
                  <Download className="w-3 h-3" /> Pack
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-6 text-sm text-ink-400 text-center">No renders match these filters.</div>
        )}
      </div>
    </div>
  );
}
