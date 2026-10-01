import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate, formatRelative } from '../lib/utils';
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
}

interface PendingInvite {
  id: string;
  email: string;
  createdAt: string;
}

interface AgencyProject {
  id: string;
  title: string;
  kind?: 'REEL' | 'FLASHHEAD';
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
  { title: 'Share Credits', description: 'Gift credits to team members — transfers are instant and tracked in both ledgers.', icon: '⚡' },
  { title: "You're All Set!", description: 'Your agency is ready. Every member creates stunning property videos together.', icon: '🚀' },
];

export default function EnhancedAgency() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'overview' | 'members' | 'history' | 'onboarding' | 'settings'>('overview');
  const isLead = user?.role === 'AGENCY_OWNER' || user?.role === 'ADMIN';
  const [members, setMembers] = useState<AgencyMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
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

  // Real team list from the backend
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leads?action=agency_members&user_id=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      setMembers(data.members || []);
      setInvites(data.invites || []);
      setAgencyName(data.agencyName || null);
      if (data.agencyName) setSettings({ agencyName: data.agencyName });
    } catch {
      toast.error('Could not load your agency team');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Real invite via the backend (adds existing users instantly, stores pending invites)
  const sendInvite = async () => {
    if (!user?.id || !inviteEmail.trim()) { toast.error('Enter an email address'); return; }
    setInviting(true);
    try {
      const res = await fetch('/api/leads?action=agency_invite', {
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

  // Real credit gift
  const giftCredits = async () => {
    if (!giftTarget) return;
    try {
      await fetch('/api/credits?action=gift_email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_user_id: user?.id, to_email: giftTarget.email, amount: giftAmount, reason: `Agency gift from ${user?.email}` }),
      });
      toast.success(`Gifted ${giftAmount} credits to ${giftTarget.fullName}`, 'Gift Sent');
      setGiftTarget(null);
      refresh();
      load();
    } catch (e: any) {
      const msg = await e.message;
      toast.error(msg || 'Gift failed');
    }
  };

  // Save agency settings (persists the agency name on the user record)
  const saveSettings = async () => {
    if (!user?.id) return;
    try {
      await fetch('/api/users?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, updates: { agencyName: settings.agencyName } }),
      });
      toast.success('Agency settings saved', 'Settings Updated');
      load();
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-purple-400" /> Agency Dashboard
          </h1>
          <p className="text-ink-400 mt-1">{agencyName || user?.agencyName || 'No agency yet — invite your first agent to create one'} • {members.length} member{members.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInvite(true)} className="btn btn-primary text-sm"><Plus className="w-4 h-4" /> Invite Agent</button>
          <button onClick={() => setTab('settings' as any)} className="btn btn-secondary text-sm"><Settings className="w-4 h-4" /> Settings</button>
        </div>
      </div>

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

      {/* Gift panel */}
      {giftTarget && (
        <div className="card-dark p-6 border border-purple-500/30 animate-fade-in">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4"><Gift className="w-4 h-4 text-purple-400" /> Gift credits to {giftTarget.fullName}</h3>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <label className="label">Amount (you have {user?.credits ?? 0})</label>
              <input type="number" className="input" min={1} max={user?.credits ?? 0} value={giftAmount} onChange={e => setGiftAmount(Number(e.target.value))} />
            </div>
            <button onClick={giftCredits} className="btn btn-primary" disabled={(user?.credits ?? 0) < 1}><Zap className="w-4 h-4" /> Send Gift</button>
            <button onClick={() => setGiftTarget(null)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'members', label: 'Team Members', icon: <Users className="w-4 h-4" /> },
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
              <p className="text-xs text-ink-400 mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> gift from your balance</p>
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
                      <button onClick={() => setGiftTarget(m)} className="btn btn-ghost text-xs py-1"><Gift className="w-3 h-3" /> Gift</button>
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
        <p className="text-ink-400 text-sm mt-1">Every reel and Talking Head video your agents create will appear here.</p>
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
          {([['all', 'All'], ['REEL', 'Reels'], ['FLASHHEAD', 'Talking Head']] as const).map(([k, label]) => (
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
                  <span className="badge badge-brand text-[10px] flex items-center gap-1"><Mic className="w-3 h-3" /> Talking Head</span>
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
