/**
 * Admin panel (route /admin) — extracted verbatim from App.tsx so the panel,
 * its recharts bundle and its admin fetches live behind a lazy route instead
 * of the main chunk. Behaviour is unchanged.
 */
import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SA_LANGUAGES } from '../lib/constants';
import { IMAGE_PRESETS } from '../lib/imagePrompts';
import { formatZar } from '../lib/utils';
import { RENDER_ENDPOINT } from '../lib/renderEndpoint';
import { Video, Image, BarChart3, Settings, Shield, Users, Star, Check, X, Sparkles, TrendingUp, Download, RefreshCw, Plus, Search, Mic, FileText, Music, User } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Line, Tooltip as RTooltip } from 'recharts';
import AdminTutorials from './AdminTutorials';
import AdminMusicLibrary from './AdminMusicLibrary';
import AdminApiKeys from './AdminApiKeys';
import AdminUpdateMode from './AdminUpdateMode';
import AdminUserDetail from './AdminUserDetail';
import AdminGiveCredits from './AdminGiveCredits';
import CurrencyInput from './CurrencyInput';
import { downloadCsv } from '../lib/utils';

/** Small download-as-CSV chip for the admin tables (audit §11: finance asks
 *  for CSV the moment a table exists). Rows are exported as-is. */
function CsvExportButton({ filename, rows, columns }: { filename: string; rows: Array<Record<string, unknown>>; columns?: string[] }) {
  return (
    <button
      onClick={() => downloadCsv(filename, rows, columns)}
      disabled={!rows.length}
      className="btn btn-ghost text-xs px-2 py-1 min-h-[32px] disabled:opacity-40"
      title={`Download ${rows.length} rows as CSV`}
    >
      <Download className="w-3 h-3" /> CSV ({rows.length})
    </button>
  );
}

// Admin: the platform action log — credit grants, subscription/role changes,
// review moderation and update-mode toggles (audit §11). Server-written only.
function AdminAuditLog() {
  const [events, setEvents] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/users?action=admin_audit_log')
      .then(r => { if (!r.ok) throw new Error('Admin access required'); return r.json(); })
      .then(d => setEvents(d.events || []))
      .catch(e => { setError(e.message); setEvents([]); });
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!events) return <p className="text-sm text-ink-400">Loading the audit log…</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white">Admin audit log</h3>
          <p className="text-xs text-ink-500">Credit grants, subscription and role changes, review moderation, update-mode toggles — written server-side with the acting admin.</p>
        </div>
        <CsvExportButton filename="admin-audit-log.csv" rows={events} columns={['createdAt', 'action', 'by', 'target', 'detail']} />
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-ink-400">No admin actions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">When</th>
                <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Action</th>
                <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Admin</th>
                <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} className="border-b border-white/5">
                  <td className="px-3 py-2 text-ink-300 whitespace-nowrap">{e.createdAt ? new Date(e.createdAt).toLocaleString('en-ZA') : ''}</td>
                  <td className="px-3 py-2 text-white font-medium whitespace-nowrap">{e.action}</td>
                  <td className="px-3 py-2 text-ink-300">{e.by}</td>
                  <td className="px-3 py-2 text-ink-300">{e.detail}{e.target ? <span className="text-xs text-ink-500 ml-2">{e.target}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════

const ADMIN_SECTIONS: { label: string; tabs: { key: string; label: string }[] }[] = [
  {
    label: 'Business',
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'pnl', label: 'Profit & loss' },
      { key: 'ops', label: 'Render operations' },
    ],
  },
  {
    label: 'People',
    tabs: [
      { key: 'users', label: 'Users' },
      { key: 'agencies', label: 'Agencies' },
      { key: 'reviews', label: 'Reviews' },
    ],
  },
  {
    label: 'Content',
    tabs: [
      { key: 'prompts', label: 'AI prompts' },
      { key: 'tutorials', label: 'Tutorials' },
      { key: 'music', label: 'Music Library' },
    ],
  },
  {
    label: 'System',
    tabs: [
      { key: 'settings', label: 'Settings' },
      { key: 'api-keys', label: 'API Keys' },
      { key: 'update-mode', label: 'Maintenance' },
      { key: 'audit', label: 'Audit log' },
    ],
  },
];
const ADMIN_TAB_KEYS = ADMIN_SECTIONS.flatMap(s => s.tabs.map(t => t.key));

export default function AdminPage() {
  // Tab lives in the URL (?tab=...) so a refresh keeps the selected section.
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('tab');
  const tab = ADMIN_TAB_KEYS.includes(param || '') ? (param as string) : 'overview';
  const setTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-purple-400" />
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
      </div>
      <div className="space-y-3">
        {ADMIN_SECTIONS.map(section => (
          <div key={section.label} className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">{section.label}</span>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {section.tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`tab-pill ${tab === t.key ? 'tab-pill-active' : ''}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="card-dark p-6">
        {tab === 'overview' && <AdminOverview />}
        {tab === 'audit' && <AdminAuditLog />}
        {tab === 'pnl' && <AdminPnl />}
        {tab === 'ops' && <AdminNarakeetOps />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'agencies' && <AdminAgencies />}
        {tab === 'reviews' && <AdminReviews />}
        {tab === 'settings' && <AdminSettings />}
        {tab === 'prompts' && <AdminPrompts />}
        {tab === 'tutorials' && <AdminTutorials />}
        {tab === 'music' && <AdminMusicLibrary />}
        {tab === 'api-keys' && <AdminApiKeys />}
        {tab === 'update-mode' && <AdminUpdateMode />}
      </div>
    </div>
  );
}

// Admin: every agency on the platform — members, owners, pool, reports.
function AdminAgencies() {
  const { user } = useCredit();
  const toast = useToast();
  const [agencies, setAgencies] = useState<any[] | null>(null);
  useEffect(() => {
    if (!user?.email) return;
    // Session cookie carries the admin identity — no ?email= param needed.
    fetch('/api/users?action=admin_agencies')
      .then(r => { if (!r.ok) throw new Error('Admin access required'); return r.json(); })
      .then(d => setAgencies(d.agencies || []))
      .catch(e => toast.error(e.message));
  }, [user?.email]);

  if (!agencies) return <p className="text-sm text-ink-400">Loading agencies…</p>;
  if (agencies.length === 0) return <p className="text-sm text-ink-400">No agencies created yet.</p>;
  return (
    <div className="space-y-3">
    <div className="flex justify-end">
      <CsvExportButton filename="propreel-agencies.csv" rows={agencies} columns={['id', 'name', 'ownerEmail', 'memberCount', 'memberLimit', 'poolCredits', 'createdAt']} />
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Agency</th>
            <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Owner</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Agents</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Pool</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Reports</th>
            <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Created</th>
          </tr>
        </thead>
        <tbody>
          {agencies.map(a => (
            <tr key={a.id} className="border-b border-white/5">
              <td className="px-3 py-2 text-white font-medium">{a.name}<span className="text-xs text-ink-500 ml-2">{a.id}</span></td>
              <td className="px-3 py-2 text-ink-300">{a.ownerEmail}</td>
              <td className="px-3 py-2 text-right text-white">{a.memberCount}/{a.memberLimit}</td>
              <td className="px-3 py-2 text-right text-purple-300">{a.poolCredits ?? 0}</td>
              <td className="px-3 py-2 text-right text-ink-300">{(a.reports || []).length}</td>
              <td className="px-3 py-2 text-ink-400 text-xs">{a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-ZA') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

// Platform health from the Modal worker's fal.ai probe (billing/auth locks
// surface here before users hit them). Polled every 60s while the tab is open.
function useFalProbe() {
  const [probe, setProbe] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      const url = `${RENDER_ENDPOINT}/probe`;
      fetch(url).then(r => r.json()).then(d => { if (alive) setProbe(d); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return probe;
}

function FalHealthCard() {
  const probe = useFalProbe();
  const cls = probe?.class || 'loading';
  const config: Record<string, { color: string; label: string }> = {
    healthy: { color: 'text-green-400', label: 'AI provider healthy' },
    billing_locked: { color: 'text-red-400', label: 'AI provider OUT OF BALANCE — renders will fail' },
    auth_failed: { color: 'text-red-400', label: 'AI provider key rejected — check the service key secret' },
    provider_error: { color: 'text-yellow-400', label: 'AI provider degraded' },
    timeout: { color: 'text-yellow-400', label: 'AI provider slow/timeout' },
    no_data: { color: 'text-ink-400', label: 'Awaiting first probe' },
    loading: { color: 'text-ink-400', label: 'Checking AI provider status…' },
  };
  const c = config[cls] || config.loading;
  return (
    <div className="bg-ink-800/50 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium"><span className={c.color}>●</span> <span className="text-white">{c.label}</span></p>
        {probe?.detail && <p className="text-xs text-ink-500 mt-1">{String(probe.detail).slice(0, 120)}</p>}
      </div>
      <div className="text-right">
        {probe?.latencyMs != null && <p className="text-xs text-ink-400">{probe.latencyMs} ms</p>}
        {probe?.checkedAt && <p className="text-[10px] text-ink-500">checked {new Date(probe.checkedAt).toLocaleTimeString()}</p>}
      </div>
    </div>
  );
}

function AdminOverview() {
  const { user } = useCredit();
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user?.email) return;
    fetch('/api/users?action=admin_stats')
      .then(r => { if (!r.ok) throw new Error('Admin stats unavailable'); return r.json(); })
      .then(d => setStats(d.stats))
      .catch(e => setError(e.message));
  }, [user?.email]);

  const items = stats ? [
    { label: 'Total Users', value: stats.userCount },
    { label: 'Active Users (30d)', value: stats.activeUsers },
    { label: 'Agencies', value: stats.agencyCount },
    { label: 'Projects', value: stats.projectCount },
    { label: 'Ready Reels', value: stats.readyReels },
    { label: 'Processing', value: stats.processingReels },
    { label: 'Failed', value: stats.failedReels },
    { label: 'Credits Spent', value: stats.creditsSpent },
  ] : [];

  const fmtRuntime = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
  const rm = stats?.renderMetrics;

  return (
    <div className="space-y-6">
      <FalHealthCard />
      {error && <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">{error}</div>}
      {!stats && !error && <p className="text-sm text-ink-400">Loading platform stats…</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.label} className="bg-ink-800/50 rounded-xl p-4">
            <p className="text-xs text-ink-400">{item.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{Number(item.value).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {rm && (
        <div className="bg-ink-800/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" /> AI Render Activity
            </h3>
            <span className="text-xs text-ink-500">last {rm.windowDays} days · credits & runtime from the live ledger</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">Video renders</p>
              <p className="text-xl font-bold text-white">{rm.video.renders}</p>
              <p className="text-[11px] text-purple-300">{rm.video.credits} credits</p>
            </div>
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">Video runtime</p>
              <p className="text-xl font-bold text-white">{fmtRuntime(rm.video.plannedSeconds)}</p>
              <p className="text-[11px] text-ink-500">planned duration</p>
            </div>
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">AI Avatar Video renders</p>
              <p className="text-xl font-bold text-white">{rm.avatar.renders}</p>
              <p className="text-[11px] text-cyan-300">{rm.avatar.credits} credits</p>
            </div>
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">AI Avatar Video runtime</p>
              <p className="text-xl font-bold text-white">{rm.avatar.measuredSeconds ? fmtRuntime(rm.avatar.measuredSeconds) : '—'}</p>
              <p className="text-[11px] text-ink-500">measured by worker</p>
            </div>
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">Image edits</p>
              <p className="text-xl font-bold text-white">{rm.imageEdits?.edits ?? 0}</p>
              <p className="text-[11px] text-pink-300">{rm.imageEdits?.credits ?? 0} credits</p>
            </div>
          </div>
          <div className="h-[180px]" aria-label="Daily AI credits spent, video versus AI Avatar Video">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rm.daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#8b8b9e', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                <YAxis tick={{ fill: '#8b8b9e', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <RTooltip
                  contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#c9c9d4' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="videoCredits" name="Video credits" stackId="ai" fill="#7c3aed" />
                <Bar dataKey="avatarCredits" name="AI Avatar Video credits" stackId="ai" fill="#22d3ee" />
                <Bar dataKey="imageCredits" name="Image edit credits" stackId="ai" fill="#ec4899" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-ink-500">
            Video runtime is the planned tier duration; AI Avatar Video runtime is measured from the finished file. Renders whose browser closed mid-job may be missing duration.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Admin: Narakeet voiceover ops — billed minutes (and est. USD) per
// render, so TTS spend sits next to the credit ledger. Aggregated from the
// worker's jobs/{id}.json records by GET admin_narakeet_usage. ──────────────
function AdminNarakeetOps() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/users?action=admin_voice_usage&days=${days}`)
      .then(r => { if (!r.ok) throw new Error('Ops report unavailable'); return r.json(); })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const langLabel = (code: string) => SA_LANGUAGES.find(l => l.id === code)?.label || code;
  const kindLabel = (kind: string) => (kind === 'avatar' ? 'Avatar' : 'Reel');
  // Render ops CSV — the per-render rows behind the tiles (audit §11).
  const opsRows = (data?.recent || []).map((r: any) => ({
    jobId: r.jobId || r.recordId || '',
    kind: r.kind || '',
    language: r.language || '',
    seconds: r.seconds ?? '',
    minutes: r.minutes ?? '',
    estCostUsd: r.minutes != null ? (r.minutes * (data?.usdPerMinute || 0)).toFixed(4) : '',
    at: r.at || r.createdAt || '',
  }));
  const t = data?.totals;
  const tiles = t ? [
    { label: 'Narration minutes', value: t.minutes.toFixed(1), sub: `billed audio (${Math.round(t.seconds)}s)` },
    { label: 'Est. TTS cost', value: `$${t.estCostUsd.toFixed(2)}`, sub: `at $${data.usdPerMinute.toFixed(2)}/min` },
    { label: 'Jobs with voiceover', value: `${t.withNarration}/${t.videoJobs}`, sub: `${t.withoutNarration} rendered without narration` },
    { label: 'Unmeasured', value: String(t.unmeasured), sub: t.unmeasured ? 'predates instrumentation' : 'full coverage' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Mic className="w-4 h-4 text-purple-400" /> Voiceover ops — billed minutes per render
        </h3>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`tab-pill ${days === d ? 'tab-pill-active' : ''}`}>{d}d</button>
          ))}
          <CsvExportButton filename={`propreel-render-ops-${days}d.csv`} rows={opsRows} columns={['jobId', 'kind', 'language', 'seconds', 'minutes', 'estCostUsd', 'at']} />
          <button onClick={() => setDays(v => v)} disabled={loading} className="text-xs text-purple-400 hover:text-purple-300" aria-label="Refresh report">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">{error}</div>}
      {!data && !error && <p className="text-sm text-ink-400">Loading usage…</p>}

      {t && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tiles.map(item => (
              <div key={item.label} className="bg-ink-800/50 rounded-xl p-4">
                <p className="text-xs text-ink-400">{item.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{item.value}</p>
                <p className="text-[11px] text-ink-500">{item.sub}</p>
              </div>
            ))}
          </div>

          {data.byLanguage.length > 0 && (
            <div className="bg-ink-800/50 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-3">Minutes by language</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.byLanguage.map((row: any) => (
                  <div key={row.language} className="bg-ink-900/60 rounded-lg p-3">
                    <p className="text-[11px] text-ink-400 truncate">{langLabel(row.language)}</p>
                    <p className="text-lg font-bold text-white">{row.minutes.toFixed(1)} min</p>
                    <p className="text-[11px] text-ink-500">{row.renders} render{row.renders === 1 ? '' : 's'} · ${(row.minutes * data.usdPerMinute).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-ink-800/50 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-3">Per render — newest {Math.min(50, data.recent.length)}</h4>
            {data.recent.length === 0 ? (
              <p className="text-sm text-ink-400">No video jobs in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-ink-400 border-b border-white/10">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Job</th>
                      <th className="px-3 py-2 font-medium">Kind</th>
                      <th className="px-3 py-2 font-medium">Tier</th>
                      <th className="px-3 py-2 font-medium">Voice</th>
                      <th className="px-3 py-2 font-medium">Language</th>
                      <th className="px-3 py-2 font-medium text-right">Minutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r: any) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="px-3 py-2 text-ink-300 whitespace-nowrap">
                          {new Date(r.when).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}{' '}
                          {new Date(r.when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-ink-400" title={r.id}>{r.id}</td>
                        <td className="px-3 py-2 text-ink-300">{kindLabel(r.kind)}</td>
                        <td className="px-3 py-2 text-ink-400">{r.tier || '—'}</td>
                        <td className="px-3 py-2 text-ink-300">{r.voice || '—'}</td>
                        <td className="px-3 py-2 text-ink-300">{r.language ? langLabel(r.language) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-white">
                          {r.seconds === null ? <span className="text-ink-500" title="Predates instrumentation">unmeasured</span>
                            : r.seconds > 0 ? (r.seconds / 60).toFixed(2)
                            : <span className="text-ink-500">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[11px] text-ink-500">
            Minutes are the billed synthesis duration recorded by the render worker ({data.fetched} of {data.listed} job records read, newest {data.fetched}).
            Jobs predating the instrumentation — and jobs that failed after synthesis — show as unmeasured. Voice preview samples are cached per voice+language and excluded.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Admin: monthly Profit & Loss statement (derived from the real credit
// ledger) with admin-entered operating expenses and a PDF export. ──────────
function PnlLine({ label, value, bold, tone, dim }: { label: string; value: string; bold?: boolean; tone?: string; dim?: boolean }) {
  return (
    <tr className={bold ? 'border-t border-white/10' : ''}>
      <td className={`px-3 py-1.5 ${bold ? 'text-white font-semibold' : dim ? 'text-ink-500' : 'text-ink-300'}`}>{label}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${bold ? 'text-white font-semibold' : tone || 'text-ink-200'}`}>{value}</td>
    </tr>
  );
}

function PnlSectionRow({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={2} className="px-3 pt-4 pb-1 text-[11px] font-semibold text-purple-300 uppercase tracking-wider">{title}</td>
    </tr>
  );
}

function AdminPnl() {
  const { user } = useCredit();
  const toast = useToast();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [form, setForm] = useState({ label: '', category: 'AI services', amount: '', note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    setData(null);
    setError('');
    fetch(`/api/users?action=pln_get&month=${month}`)
      .then(r => { if (!r.ok) throw new Error('P&L statement unavailable'); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message));
  }, [user?.email, month, reloadKey]);

  const refresh = () => setReloadKey(k => k + 1);
  const fmt = formatZar;

  const addExpense = async () => {
    if (!user?.email || saving) return;
    if (!form.label.trim() || !(Number(form.amount) > 0)) {
      toast.error('Enter a label and a positive amount');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/users?action=pln_expense_add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, month, label: form.label, category: form.category, amount: Number(form.amount), note: form.note }),
      });
      if (!res.ok) throw new Error();
      setForm({ label: '', category: form.category, amount: '', note: '' });
      toast.success('Expense added');
      refresh();
    } catch {
      toast.error('Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const removeExpense = async (itemId: string) => {
    if (!user?.email) return;
    try {
      const res = await fetch('/api/users?action=pln_expense_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, month, itemId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Expense removed');
      refresh();
    } catch {
      toast.error('Failed to remove expense');
    }
  };

  const downloadPdf = async () => {
    if (!user?.email || pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/users?action=pln_pdf&month=${month}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (d.url) window.open(d.url, '_blank', 'noopener');
      toast.success('P&L PDF generated');
    } catch {
      toast.error('PDF generation failed');
    } finally {
      setPdfBusy(false);
    }
  };

  const s = data?.statement;
  const kpis = s ? [
    { label: 'Revenue (cash)', value: fmt(s.revenue.total), sub: 'collected this month', tone: 'text-white' },
    { label: 'Net profit (cash)', value: fmt(s.net.cash), sub: s.margin.cash !== null ? `${(s.margin.cash * 100).toFixed(1)}% margin` : 'no revenue yet', tone: s.net.cash >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Recognised from usage', value: fmt(s.usage.recognizedRevenue), sub: `${s.usage.creditsConsumed.toLocaleString('en-ZA')} credits consumed`, tone: 'text-white' },
    { label: 'Operating expenses', value: fmt(s.expenses.total), sub: `${s.expenses.items.length} line item${s.expenses.items.length === 1 ? '' : 's'}`, tone: 'text-white' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="pnl-month" className="text-xs text-ink-400">Month</label>
          <input id="pnl-month" type="month" className="input w-44" value={month} onChange={e => setMonth(e.target.value)} />
          {data?.finalized
            ? <span className="badge badge-success">FINALIZED</span>
            : s?.inProgress && <span className="badge badge-warning">IN PROGRESS</span>}
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton
            filename={`propreel-pnl-${month}.csv`}
            rows={s ? [
              { line: 'Subscription revenue', amount: s.revenue.subscription },
              { line: 'Credit top-ups (one-off)', amount: s.revenue.topups },
              { line: 'Refunds & adjustments', amount: s.revenue.refunds },
              { line: 'Total revenue', amount: s.revenue.total },
              { line: 'Recognised revenue @ R1.00/credit', amount: s.usage.recognizedRevenue },
              ...s.expenses.items.map((i: any) => ({ line: `Expense — ${i.label}`, amount: -Math.abs(i.amount), category: i.category, note: i.note || '' })),
              { line: 'Total expenses', amount: -s.expenses.total },
              { line: 'Net profit (cash)', amount: s.net.cash },
            ] : []}
            columns={['line', 'amount', 'category', 'note']}
          />
          <button onClick={downloadPdf} disabled={!s || pdfBusy} className="btn btn-primary text-sm">
            <Download className="w-4 h-4" /> {pdfBusy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">{error}</div>}
      {!s && !error && <p className="text-sm text-ink-400">Building statement from the credit ledger…</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="bg-ink-800/50 rounded-xl p-4">
                <p className="text-xs text-ink-400">{k.label}</p>
                <p className={`text-xl font-bold mt-1 ${k.tone}`}>{k.value}</p>
                <p className="text-[11px] text-ink-500 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th scope="col" className="text-left px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Line item</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-ink-400 uppercase">Amount (ZAR)</th>
                </tr>
              </thead>
              <tbody>
                <PnlSectionRow title="Revenue — cash collected" />
                <PnlLine label="Subscription revenue" value={fmt(s.revenue.subscription)} />
                <PnlLine label="Credit top-ups (one-off)" value={fmt(s.revenue.topups)} />
                {s.revenue.refunds !== 0 && <PnlLine label="Refunds & adjustments" value={fmt(s.revenue.refunds)} />}
                <PnlLine label="Total revenue" value={fmt(s.revenue.total)} bold />

                <PnlSectionRow title="Usage — accrual view (credits used by all users)" />
                <PnlLine label="Credits consumed" value={`${s.usage.creditsConsumed.toLocaleString('en-ZA')} cr`} />
                <PnlLine label="Recognised revenue @ R1.00/credit" value={fmt(s.usage.recognizedRevenue)} />
                <PnlLine label="Credits granted (still to consume)" value={`${s.usage.creditsGranted.toLocaleString('en-ZA')} cr`} dim />

                <PnlSectionRow title="Operating expenses" />
                {s.expenses.byCategory.length === 0
                  ? <PnlLine label="No expenses logged" value={fmt(0)} dim />
                  : s.expenses.byCategory.map((c: any) => <PnlLine key={c.category} label={c.category} value={fmt(c.total)} />)}
                <PnlLine label="Total expenses" value={fmt(s.expenses.total)} bold />

                <PnlSectionRow title="Profit" />
                <PnlLine label="Net profit — cash basis" value={fmt(s.net.cash)} bold tone={s.net.cash >= 0 ? 'text-green-400' : 'text-red-400'} />
                <PnlLine label="Profit margin — cash basis" value={s.margin.cash !== null ? `${(s.margin.cash * 100).toFixed(1)}%` : '—'} />
                <PnlLine label="Net profit — usage basis" value={fmt(s.net.usage)} bold tone={s.net.usage >= 0 ? 'text-green-400' : 'text-red-400'} />
                <PnlLine label="Profit margin — usage basis" value={s.margin.usage !== null ? `${(s.margin.usage * 100).toFixed(1)}%` : '—'} />
              </tbody>
            </table>
          </div>

          <div className="bg-ink-800/50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" /> Expense entries — {s.monthLabel}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <input className="input md:col-span-4" placeholder="e.g. AI provider October usage" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
              <select className="input md:col-span-2" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} aria-label="Expense category">
                {['AI services', 'Compute', 'Cloud services', 'Payments', 'Marketing', 'Payroll', 'Software', 'Office', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <CurrencyInput className="input md:col-span-2" allowDecimals value={form.amount} onChange={v => setForm({ ...form, amount: v })} placeholder="Amount (R)" aria-label="Amount in rand" />
              <input className="input md:col-span-3" placeholder="Note (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
              <button onClick={addExpense} disabled={saving} className="btn btn-primary justify-center"><Plus className="w-4 h-4" /> Add</button>
            </div>
            {s.expenses.items.length === 0 ? (
              <p className="text-xs text-ink-500">No expenses for this month yet — log AI, compute, cloud and payment fees, salaries, anything the business pays for.</p>
            ) : (
              <ul className="space-y-1">
                {s.expenses.items.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 bg-ink-900/60 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{e.label}</p>
                      <p className="text-[11px] text-ink-500">{e.category}{e.note ? ` · ${e.note}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm text-white tabular-nums">{fmt(e.amount)}</span>
                      <button onClick={() => removeExpense(e.id)} className="text-ink-500 hover:text-red-400 transition-colors" aria-label={`Delete ${e.label}`}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {Array.isArray(data.series) && (
            <div className="bg-ink-800/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-400" /> Revenue vs expenses — trailing 12 months
                </h3>
                <span className="text-xs text-ink-500">cash basis · SAST months</span>
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tickFormatter={(v: string) => v.slice(5)} tick={{ fill: '#8b8b9e', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                    <YAxis tick={{ fill: '#8b8b9e', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <RTooltip
                      formatter={(v: any) => formatZar(Number(v))}
                      contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" name="Revenue" fill="#a855f7" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <PnlAnalyst data={data} />
        </>
      )}
    </div>
  );
}

// Analyst panel attached to the P&L dashboard — deterministic insights
// computed server-side (the same text lands in the PDF export) plus
// unit-economics KPIs derived from the ledger and expense entries.
function PnlAnalyst({ data }: { data: any }) {
  if (!data?.statement) return null;
  const s = data.statement;
  const m = data.metrics;
  const margin = s.margin.cash;
  const verdict = margin === null
    ? { label: 'AWAITING REVENUE', cls: 'badge-muted' }
    : margin >= 0.3 ? { label: 'HEALTHY', cls: 'badge-success' }
    : margin >= 0.1 ? { label: 'WORKABLE', cls: 'badge-muted' }
    : margin >= 0 ? { label: 'THIN MARGIN', cls: 'badge-warning' }
    : { label: 'LOSS-MAKING', cls: 'badge-danger' };

  const stats = [
    { label: 'Cost per credit consumed', value: m.costPerCredit !== null ? formatZar(m.costPerCredit) : '—' },
    { label: 'Paying customers', value: String(m.payingCustomers) },
    { label: 'Active subscribers', value: String(m.activeSubscriptions) },
    { label: 'New signups', value: String(m.newSignups) },
  ];

  const forecastText = (f: any): string => {
    switch (f.status) {
      case 'already_covered':
        return `Usage-basis revenue (${formatZar(f.currentUsageRevenue)}) already covers the ${formatZar(f.expenseBase)} expense base — break-even achieved.`;
      case 'projected':
        return `Usage revenue is trending ${formatZar(f.monthlyTrend)}/month against a ${formatZar(f.expenseBase)} expense base — break-even projected by ${f.breakEvenMonth} (about ${f.monthsToBreakEven} month${f.monthsToBreakEven === 1 ? '' : 's'} out).`;
      case 'stalled':
        return `Usage revenue trend is flat or declining (${formatZar(f.monthlyTrend)}/month) — no break-even date projected at this trajectory.`;
      case 'insufficient_data':
        return `Break-even forecast needs at least 2 months of usage data (have ${f.sampleMonths}).`;
      default:
        return 'No expense base logged yet — add AI, compute, cloud and payment bills to project break-even.';
    }
  };

  return (
    <div className="bg-ink-800/50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" /> Analyst — {s.monthLabel}
        </h3>
        <span className={`badge ${verdict.cls}`}>{verdict.label}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(st => (
          <div key={st.label} className="bg-ink-900/60 rounded-lg p-3">
            <p className="text-[11px] text-ink-400">{st.label}</p>
            <p className="text-lg font-bold text-white mt-0.5">{st.value}</p>
          </div>
        ))}
      </div>

      {/* Cohort analysis: revenue by plan, this month vs last */}
      {Array.isArray(data.planMix) && data.planMix.length > 0 && (
        <div>
          <p className="text-[11px] text-ink-400 uppercase tracking-wide mb-2">Revenue by plan — this month vs last</p>
          <div className="space-y-1">
            {data.planMix.map((p: any) => {
              const delta = p.zar - p.prevZar;
              return (
                <div key={p.planId} className="flex items-center justify-between text-sm">
                  <span className="text-white">{p.planId} <span className="text-ink-500 text-xs">· {p.customers} cust.</span></span>
                  <span className="tabular-nums flex items-center gap-2">
                    <span className="text-ink-200">{formatZar(p.zar)}</span>
                    {p.prevZar > 0 && (
                      <span className={`text-xs ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {delta >= 0 ? '▲' : '▼'} {formatZar(Math.abs(delta))}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subscriber movement: new / renewed / churned / past due / active */}
      {data.subscribers && (
        <div>
          <p className="text-[11px] text-ink-400 uppercase tracking-wide mb-2">Subscriber movement</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'New', value: data.subscribers.newSubscribers, tone: 'text-green-400' },
              { label: 'Renewed', value: data.subscribers.renewed, tone: 'text-white' },
              { label: 'Churned', value: data.subscribers.churned, tone: data.subscribers.churned > 0 ? 'text-red-400' : 'text-white' },
              { label: 'Past due', value: data.subscribers.pastDue, tone: data.subscribers.pastDue > 0 ? 'text-yellow-400' : 'text-white' },
              { label: 'Active', value: data.subscribers.active, tone: 'text-purple-300' },
            ].map(x => (
              <div key={x.label} className="bg-ink-900/60 rounded-lg p-3">
                <p className="text-[11px] text-ink-400">{x.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${x.tone}`}>{x.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Break-even forecast: when usage-basis profit covers the expense base */}
      {data.forecast && (
        <div className="bg-ink-900/60 rounded-lg p-4 space-y-1">
          <p className="text-[11px] text-ink-400 uppercase tracking-wide">Break-even forecast — usage basis</p>
          <p className="text-sm text-ink-200 leading-relaxed">{forecastText(data.forecast)}</p>
          <p className="text-[11px] text-ink-500">
            Expense base {formatZar(data.forecast.expenseBase)}/mo · usage trend {formatZar(data.forecast.monthlyTrend)}/mo · {data.forecast.sampleMonths}-month sample
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {(data.insights || []).map((ins: string, i: number) => (
          <li key={i} className="flex gap-2 text-sm text-ink-300 leading-relaxed">
            <span className="text-purple-400 mt-0.5 flex-shrink-0">▸</span>
            <span>{ins}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-500">These notes are included in the PDF export.</p>
      {data.finalized && (
        <p className="text-[11px] text-green-400">
          Books closed {new Date(data.finalizedAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} — figures frozen; editing an expense re-opens the month.
        </p>
      )}
    </div>
  );
}

function AdminUsers() {
  const { user } = useCredit();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [detailUser, setDetailUser] = useState<any>(null);
  const [giveUser, setGiveUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    fetch('/api/users?action=list_users')
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [user?.email]);

  const shown = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.fullName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input className="input max-w-xs" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
        <CsvExportButton
          filename="propreel-users.csv"
          rows={shown}
          columns={['id', 'email', 'fullName', 'role', 'credits', 'agencyId', 'createdAt', 'lastActiveAt']}
        />
      </div>
      {detailUser && (
        <AdminUserDetail
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onUpdated={u => {
            setDetailUser(u);
            setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, ...u } : x)));
          }}
          onDeleted={() => {
            const id = detailUser?.id;
            setDetailUser(null);
            setUsers(prev => prev.filter(x => x.id !== id));
          }}
        />
      )}
      {/* Custom-amount grant — the server reports the real new balance, and
          both the row and an open detail modal pick it up from there. */}
      {giveUser && (
        <AdminGiveCredits
          user={giveUser}
          onClose={() => setGiveUser(null)}
          onGranted={(id, newBalance) => {
            setUsers(prev => prev.map(u => (u.id === id ? { ...u, credits: newBalance } : u)));
            setDetailUser((prev: any) => (prev && prev.id === id ? { ...prev, credits: newBalance } : prev));
          }}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th scope="col" className="text-left px-3 py-2 text-xs text-ink-400">User</th>
              <th scope="col" className="text-left px-3 py-2 text-xs text-ink-400">Role</th>
              <th scope="col" className="text-left px-3 py-2 text-xs text-ink-400">Subscription</th>
              <th scope="col" className="text-left px-3 py-2 text-xs text-ink-400">Credits</th>
              <th scope="col" className="text-left px-3 py-2 text-xs text-ink-400">Joined</th>
              <th scope="col" className="text-left px-3 py-2 text-xs text-ink-400"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-400 text-sm">Loading users…</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-400 text-sm">No users found</td></tr>}
            {shown.map(m => (
              <tr key={m.id} className="border-b border-white/5">
                <td className="px-3 py-3"><p className="text-sm text-white">{m.fullName}</p><p className="text-xs text-ink-400">{m.email}</p></td>
                <td className="px-3 py-3"><span className="badge badge-muted">{(m.role || 'AGENT').toUpperCase()}</span></td>
                <td className="px-3 py-3">
                  {/* Plan names a REAL subscription only. The top-level planId
                      is a checkout/trial-era residual that survives a
                      de-subscription — showing it here made de-subscribed
                      accounts look like they still own a plan.  A status
                      always rides a real subscription object, so a missing
                      status ⇒ no plan; CANCELLED/PAST_DUE/DOWNGRADE_PENDING
                      stay named (access keeps running to period end). */}
                  {(() => {
                    const st = m.subscription?.status;
                    const hasPlan = st === 'ACTIVE' || st === 'PAST_DUE' || st === 'CANCELLED' || st === 'DOWNGRADE_PENDING';
                    return <p className="text-sm text-white">{hasPlan ? (m.subscription!.planId || '—') : '—'}</p>;
                  })()}
                  {m.subscription?.status ? (
                    <span className={`badge mt-1 ${m.subscription.status === 'ACTIVE' ? 'badge-success' : m.subscription.status === 'PAST_DUE' ? 'badge-warning' : m.subscription.status === 'CANCELLED' ? 'badge-danger' : 'badge-brand'}`}>{m.subscription.status}</span>
                  ) : m.trialExpiresAt ? (
                    <span className="badge badge-muted mt-1">Trial</span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-sm text-white">{m.credits}</td>
                <td className="px-3 py-3 text-xs text-ink-400">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-3">
                  <button onClick={() => setGiveUser(m)} className="btn btn-ghost text-xs py-1"><Plus className="w-3 h-3" /> Give</button> <button onClick={() => setDetailUser(m)} className="btn btn-ghost text-xs py-1">Details</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminReviews() {
  const { user } = useCredit();
  const toast = useToast();
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    fetch('/api/leads?action=review_queue')
      .then(r => r.json())
      .then(d => setPending(d.reviews || []))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, [user?.email]);

  const moderate = async (reviewId: string, approve: boolean) => {
    try {
      await fetch('/api/leads?action=review_moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, approve }),
      });
      setPending(prev => prev.filter(r => r.id !== reviewId));
      toast.success(approve ? 'Review approved and published' : 'Review rejected');
    } catch {
      toast.error('Moderation action failed');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">Pending reviews awaiting moderation.</p>
      {loading && <p className="text-sm text-ink-500">Loading…</p>}
      {!loading && pending.length === 0 && <p className="text-sm text-ink-500">No pending reviews. New submissions appear here.</p>}
      <div className="space-y-3">
        {pending.map(r => (
          <div key={r.id} className="bg-ink-800/50 rounded-xl p-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex gap-1 mb-1">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />)}</div>
              <p className="text-sm text-white">"{r.comment}"</p>
              <p className="text-xs text-ink-400 mt-1">{r.fullName} — {r.agency || 'Independent'}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => moderate(r.id, true)} className="btn btn-primary text-xs py-1 px-3"><Check className="w-3 h-3" /> Approve</button>
              <button onClick={() => moderate(r.id, false)} className="btn btn-ghost text-xs py-1 px-3 text-red-400"><X className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings() {
  // Read-only service status. Real secrets live in Vercel env vars and the
  // Modal fal-credentials secret — they are never editable from the UI.
  const probe = useFalProbe();
  const [modalHealth, setModalHealth] = useState<any>(null);
  const [musicApi, setMusicApi] = useState<'ok' | 'fail' | 'loading'>('loading');

  useEffect(() => {
    fetch(`${RENDER_ENDPOINT}/health`)
      .then(r => r.json()).then(setModalHealth).catch(() => setModalHealth(null));
    fetch('/api/music').then(r => setMusicApi(r.ok ? 'ok' : 'fail')).catch(() => setMusicApi('fail'));
  }, []);

  const statusPill = (ok: boolean | null) => (
    <span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>{ok ? 'OPERATIONAL' : 'DOWN'}</span>
  );

  const services = [
    { name: 'Modal Render Worker', detail: modalHealth ? `v${modalHealth.version} · ${modalHealth.model}` : 'unreachable', ok: !!modalHealth?.status?.match(/healthy/) },
    { name: 'AI provider account', detail: probe?.detail || (probe?.class === 'healthy' ? 'key valid, balance OK' : probe?.class || 'checking…'), ok: probe?.class === 'healthy' },
    { name: 'Platform API & database', detail: musicApi === 'ok' ? '/api reachable' : musicApi === 'fail' ? '/api unreachable' : 'checking…', ok: musicApi === 'ok' },
    { name: 'Paystack', detail: 'managed via PAYSTACK_SECRET_KEY env var', ok: null as unknown as boolean },
    { name: 'Media & data storage', detail: 'managed via platform storage env vars', ok: null as unknown as boolean },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">Live service status. API keys are managed in Vercel environment variables and render-platform secrets — never stored in or editable from the app.</p>
      {services.map(s => (
        <div key={s.name} className="bg-ink-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <h4 className="font-semibold text-white text-sm">{s.name}</h4>
            <p className="text-xs text-ink-400 mt-1">{s.detail}</p>
          </div>
          {s.ok === null || s.ok === undefined
            ? <span className="badge badge-muted">ENV-MANAGED</span>
            : statusPill(s.ok)}
        </div>
      ))}
    </div>
  );
}

function AdminPrompts() {
  const [expanded, setExpanded] = useState<string | null>(null);
  // Prompt text lives ONLY in the Modal worker (modal/image_prompts.py) — the
  // bundle keeps UI metadata (id/label/emoji/strength). Full text is read
  // through a session-gated Vercel route that proxies the worker server-side.
  const [full, setFull] = useState<Array<{ id: string; prompt?: string; negative_prompt?: string }> | null>(null);
  const [fullFailed, setFullFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/users?action=image_presets');
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) setFull(Array.isArray(data?.presets) ? data.presets : []);
      } catch {
        if (alive) setFullFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []);
  const promptFor = (id: string, field: 'prompt' | 'negative_prompt') =>
    full?.find(f => f.id === id)?.[field]
    || (fullFailed ? 'Prompt text unavailable — reload the page or sign in again.' : 'Loading prompt text…');
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        The live prompt library ({IMAGE_PRESETS.length} presets). Prompt text is served through the
        admin API, sourced from <code className="text-purple-300">modal/image_prompts.py</code> — edit it there and redeploy the worker.
      </p>
      <div className="space-y-2">
        {IMAGE_PRESETS.map(p => (
          <div key={p.id} className="bg-ink-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="flex items-center gap-2 text-left min-w-0">
                <span className="text-lg">{p.emoji}</span>
                <div className="min-w-0">
                  <h4 className="font-medium text-white text-sm truncate">{p.label}</h4>
                  <p className="text-[10px] text-ink-500">{p.category} · id: {p.id}</p>
                </div>
              </button>
              <div className="flex gap-1 flex-shrink-0">
                <span className="badge badge-brand">str {p.strength.min}–{p.strength.max}</span>
                <span className="badge badge-muted">cfg {p.guidanceScale.min}–{p.guidanceScale.max}</span>
              </div>
            </div>
            {expanded === p.id && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-ink-300 whitespace-pre-wrap">{promptFor(p.id, 'prompt')}</p>
                <p className="text-[10px] text-ink-500 whitespace-pre-wrap"><strong>Negative:</strong> {promptFor(p.id, 'negative_prompt')}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

