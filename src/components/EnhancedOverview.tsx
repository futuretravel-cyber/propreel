import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatZar, formatRelative } from '../lib/utils';
import { PropReelAPI, Project, CreditReportData } from '../lib/api';
import { TIERS } from '../lib/constants';
import UpgradeToProCTA from './UpgradeToProCTA';
import {
  Video, Zap, List, Clock, ArrowUpRight, Activity,
  BarChart3, PieChart as PieIcon, ChevronRight, Loader2, Image as ImageIcon,
  Sparkles, X, FileText, Camera,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';

// ─── Real-data dashboard: stats come from the credits ledger and projects DB ──

function StatCard({ label, value, sub, icon, accent }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="card-dark p-5">
      <div className="flex items-center justify-between">
        <span className="text-ink-400 text-sm">{label}</span>
        {icon}
      </div>
      <p className={`text-3xl font-bold mt-2 ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function EnhancedOverview() {
  const { user, balance } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [report, setReport] = useState<CreditReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'monthly'>('daily');
  // Post-payment welcome: PaymentPage lands here as /dashboard?welcome=1
  const [searchParams, setSearchParams] = useSearchParams();
  const [showWelcome, setShowWelcome] = useState(() => searchParams.get('welcome') === '1');

  const dismissWelcome = () => {
    setShowWelcome(false);
    const next = new URLSearchParams(searchParams);
    next.delete('welcome');
    setSearchParams(next, { replace: true });
    // Closing the welcome card (or "Explore on my own") also opts out of the
    // dashboard auto-tour — don't stack a second modal right after. The tour
    // stays reachable from the welcome card's button and Help → Replay tour
    // (both dispatch `propreel:start-tour`, which clears this flag).
    try {
      const id = user?.id || user?.email;
      if (id) localStorage.setItem(`propreel:onboarded:${id}`, '1');
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [projects, report] = await Promise.all([
          PropReelAPI.listProjects(user.id),
          PropReelAPI.creditReport(user.id, '30d').catch(() => null),
        ]);
        if (!cancelled) {
          setProjects(projects);
          setReport(report);
        }
      } catch {
        // Overview still renders with user/balance from context
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Real derived stats
  const stats = useMemo(() => {
    const ready = projects.filter(p => p.status === 'READY').length;
    const processing = projects.filter(p => p.status === 'PROCESSING').length;
    const videoRenders = report?.creditsByFeature?.videoGeneration ?? 0;
    return { ready, processing, videoRenders };
  }, [projects, report]);

  // Real daily usage from the transaction ledger (last 14 days)
  const dailyData = useMemo(() => {
    const days: Array<{ day: string; credits: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const used = (report?.transactions || [])
        .filter(t => (t.createdAt || '').slice(0, 10) === key && t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      days.push({ day: d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' }), credits: used });
    }
    return days;
  }, [report]);

  // Real project status breakdown
  const statusData = useMemo(() => {
    const count = (s: string) => projects.filter(p => p.status === s).length;
    return [
      { name: 'Ready', value: count('READY'), color: '#22c55e' },
      { name: 'Processing', value: count('PROCESSING'), color: '#f59e0b' },
      { name: 'Draft', value: count('DRAFT'), color: '#6366f1' },
      { name: 'Failed', value: count('FAILED'), color: '#ef4444' },
    ].filter(s => s.value > 0);
  }, [projects]);

  // Real recent activity: derived from actual transactions
  const activity = useMemo(() => (report?.transactions || []).slice(0, 8).map((t, i) => ({
    id: i,
    message: t.reason || (t.amount > 0 ? `+${t.amount} credits added` : `${Math.abs(t.amount)} credits used`),
    amount: t.amount,
    time: formatRelative(t.createdAt),
  })), [report]);

  // Subscription details from the real user record
  const sub = user?.subscription;
  const planName = sub?.planId ? TIERS.find(t => t.id === sub.planId)?.label || sub.planId : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Post-payment welcome message (PaymentPage → /dashboard?welcome=1) ── */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="card-dark p-8 max-w-lg w-full text-center animate-scale-in relative">
            <button onClick={dismissWelcome} aria-label="Close welcome" className="absolute top-4 right-4 text-ink-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4"><Sparkles className="w-8 h-8 text-purple-400" /></div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to PropReel, {user?.fullName?.split(' ')[0] || 'Agent'}! 🎉</h2>
            <p className="text-ink-400 mb-5">
              Your {planName || 'PropReel'} account is active with <span className="text-white font-semibold">{balance.total} credits</span> ready to spend.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-6 text-left">
              <div className="bg-ink-800/50 rounded-xl p-3"><FileText className="w-4 h-4 text-purple-400 mb-1" /><p className="text-xs text-ink-300">AI description</p><p className="text-xs font-bold text-purple-300">⚡1 / render</p></div>
              <div className="bg-ink-800/50 rounded-xl p-3"><Camera className="w-4 h-4 text-purple-400 mb-1" /><p className="text-xs text-ink-300">Photo edit</p><p className="text-xs font-bold text-purple-300">⚡2 / render</p></div>
              <div className="bg-ink-800/50 rounded-xl p-3"><Zap className="w-4 h-4 text-purple-400 mb-1" /><p className="text-xs text-ink-300">Social post</p><p className="text-xs font-bold text-purple-300">⚡2 / post</p></div>
            </div>
            <button
              onClick={() => { dismissWelcome(); window.dispatchEvent(new Event('propreel:start-tour')); }}
              className="btn btn-primary w-full mb-3"
            >
              Start the 60-second dashboard tour
            </button>
            <button onClick={dismissWelcome} className="btn w-full">Explore on my own</button>
          </div>
        </div>
      )}

      {/* Welcome */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome back, {user?.fullName?.split(' ')[0] || 'there'} 👋</h1>
          <p className="text-ink-400 mt-1">Here's your property marketing dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-brand"><Zap className="w-3 h-3" /> {balance.total} total credits</span>
        </div>
      </div>

      <UpgradeToProCTA />

      {/* Stats Row — real numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Projects" value={loading ? '…' : projects.length} sub={`${stats.ready} ready · ${stats.processing} processing`} icon={<List className="w-4 h-4 text-blue-400" />} accent="text-white" />
        <StatCard label="Video Renders" value={loading ? '…' : stats.videoRenders} sub="last 30 days (ledger)" icon={<Video className="w-4 h-4 text-purple-400" />} accent="text-white" />
        <StatCard label="Credits Used" value={loading ? '…' : report?.totalUsed ?? 0} sub="last 30 days" icon={<Activity className="w-4 h-4 text-green-400" />} accent="text-white" />
        <StatCard label="Credits Remaining" value={balance.personal} sub={planName ? `${planName} plan` : 'no active plan'} icon={<Zap className="w-4 h-4 text-yellow-400" />} accent="text-white" />
      </div>

      {/* Credit cost cheat-sheet — what each AI tool costs */}
      <div className="card-dark p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" /> What things cost</h3>
          <span className="text-xs text-amber-400/90">AI output can be inaccurate — credits are non-refundable once spent</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'AI Property Description', cost: '⚡1 / render' },
            { label: 'Social Media Post', cost: '⚡2 / post' },
            { label: 'Photo Edit / Staging', cost: '⚡2 / render' },
            { label: 'AI Avatar Video', cost: '⚡8 / render' },
            { label: 'Property Video', cost: '⚡ by tier' },
          ].map(c => (
            <div key={c.label} className="bg-ink-800/50 rounded-xl p-3">
              <p className="text-xs text-ink-300">{c.label}</p>
              <p className="text-sm font-bold text-purple-300 mt-1">{c.cost}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Credit Usage — real ledger data */}
        <div className="lg:col-span-2 card-dark p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" /> Credit Usage
            </h3>
            <div className="flex gap-1 bg-ink-800 rounded-lg p-1">
              {(['daily', 'monthly'] as const).map(p => (
                <button key={p} onClick={() => setChartPeriod(p)} className={`px-3 py-1 rounded-md text-xs font-medium transition ${chartPeriod === p ? 'bg-purple-700 text-white' : 'text-ink-400 hover:text-white'}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {dailyData.every(d => d.credits === 0) ? (
            <div className="h-[220px] flex items-center justify-center text-ink-500 text-sm">
              No credit usage in this period yet — render a video or edit a photo to see activity.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartPeriod === 'daily' ? dailyData : dailyData}>
                <defs>
                  <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#800080" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#800080" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" stroke="#7f8aab" fontSize={11} />
                <YAxis stroke="#7f8aab" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                <Area type="monotone" dataKey="credits" stroke="#800080" strokeWidth={2} fill="url(#creditGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Project Status — real */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-purple-400" /> Project Status
          </h3>
          {statusData.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-ink-500 text-sm text-center">
              No projects yet.<br />Create your first one in the Studio.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {statusData.map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                    <span className="text-xs text-ink-400">{s.name}</span>
                    <span className="text-xs text-white font-medium ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Activity Feed + Side Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity — real transaction ledger */}
        <div className="lg:col-span-2 card-dark p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" /> Recent Activity
            </h3>
            <Link to="/dashboard/credits" className="text-xs text-purple-400 hover:text-purple-300">View All</Link>
          </div>
          {activity.length === 0 ? (
            <div className="py-8 text-center text-ink-500 text-sm">No activity yet — your credit transactions will appear here.</div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar">
              {activity.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-ink-800 flex items-center justify-center text-sm flex-shrink-0">
                    {a.amount > 0 ? '⚡' : '🎬'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-200 leading-snug">{a.message}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{a.time}</p>
                  </div>
                  <span className={`text-sm font-medium ${a.amount > 0 ? 'text-green-400' : 'text-ink-300'}`}>
                    {a.amount > 0 ? '+' : ''}{a.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side Column — real subscription info */}
        <div className="space-y-4">
          <div className="card-dark p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">Subscription</h3>
              {planName ? (
                <span className="badge badge-brand">{planName}</span>
              ) : (
                <Link to="/pricing" className="badge badge-muted hover:badge-brand">No plan</Link>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-400">Credits Remaining</span>
                <span className="text-white font-medium">{balance.personal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-400">Expiring in 7 days</span>
                <span className={balance.expiringSoon > 0 ? 'text-yellow-400 font-medium' : 'text-white font-medium'}>{balance.expiringSoon}</span>
              </div>
              {sub?.currentPeriodEnd && (
                <div className="flex justify-between border-t border-white/5 pt-2">
                  <span className="text-ink-400">Renews</span>
                  <span className="text-white font-medium">{formatRelative(sub.currentPeriodEnd)}</span>
                </div>
              )}
              {sub?.nextChargeAmount ? (
                <div className="flex justify-between">
                  <span className="text-ink-400">Next charge</span>
                  <span className="text-white font-medium">{formatZar(sub.nextChargeAmount)}</span>
                </div>
              ) : null}
              <Link to="/dashboard/billing" className="btn btn-primary text-xs py-2 w-full mt-2 block text-center">Manage Billing</Link>
            </div>
          </div>

          <div className="card-dark p-5">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2 mb-3">
              <ImageIcon className="w-4 h-4 text-purple-400" /> Photo Edits
            </h3>
            <p className="text-3xl font-bold text-white">{report?.creditsByFeature?.imageEditing ?? 0}</p>
            <p className="text-xs text-ink-400 mt-1">image edits in the last 30 days</p>
          </div>
        </div>
      </div>

      {/* Recent Projects — real */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Recent Projects</h2>
          <Link to="/dashboard/listings" className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></Link>
        </div>
        {loading ? (
          <div className="card-dark p-10 text-center"><Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto" /></div>
        ) : projects.length === 0 ? (
          <div className="card-dark p-10 text-center">
            <p className="text-white font-medium">No projects yet</p>
            <p className="text-ink-400 text-sm mt-1 mb-4">Head to the Studio to create your first property video.</p>
            <button onClick={() => navigate('/studio')} className="btn btn-primary text-sm">Open Studio</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 3).map(p => (
              <div key={p.id} className="card-dark overflow-hidden group cursor-pointer hover:border-purple-500/30 transition" onClick={() => navigate('/dashboard/projects')}>
                <div className="aspect-video bg-ink-800 relative overflow-hidden">
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🏡</div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className={`badge ${p.status === 'READY' ? 'badge-success' : p.status === 'PROCESSING' ? 'badge-warning' : p.status === 'FAILED' ? 'badge-danger' : 'badge-muted'}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="absolute bottom-2 left-2">
                    <span className="badge badge-brand text-[10px]">{p.videoTier}</span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-white text-sm truncate">{p.title}</h3>
                  <p className="text-ink-400 text-xs mt-1">{[p.suburb, p.city].filter(Boolean).join(', ')}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-purple-400 font-semibold text-sm">{p.price ? formatZar(p.price) : '—'}</p>
                    <p className="text-ink-500 text-xs">{formatRelative(p.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
