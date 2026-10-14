import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  BarChart3, TrendingUp, Clock, CheckCircle2, XCircle, Video,
  Zap, Download, Eye, Loader2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { PropReelAPI, CreditReportData } from '../lib/api';

// ─── Real analytics: every number derives from the user's credit ledger ────

const TIER_COSTS: Record<string, number> =  { ESSENTIAL: 5, SOCIAL: 30, CINEMATIC: 40, PREMIUM: 85 };

export default function EnhancedAnalytics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [report, setReport] = useState<CreditReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    PropReelAPI.creditReport(user.id, '90d')
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const since = Date.now() - days * 86400000;
  const txns = useMemo(() => (report?.transactions || []).filter(t => new Date(t.createdAt).getTime() >= since), [report, since]);

  // Daily usage series
  const dailyData = useMemo(() => {
    const out: Array<{ day: string; renders: number; credits: number }> = [];
    const points = period === '7d' ? 7 : 14;
    for (let i = points - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const used = txns.filter(t => t.amount < 0 && (t.createdAt || '').slice(0, 10) === key)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      out.push({ day: d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' }), renders: 0, credits: used });
    }
    return out;
  }, [txns, period]);

  // Tier breakdown from deduction reasons/metadata amounts
  const tierBreakdown = useMemo(() => {
    const counts: Record<string, { renders: number; credits: number }> = {};
    for (const t of txns) {
      if (t.amount >= 0) continue;
      const reason = String(t.reason || '').toLowerCase();
      const cost = Math.abs(t.amount);
      let tier: string | null = null;
      for (const [name, c] of Object.entries(TIER_COSTS)) {
        if (cost === c && (reason.includes('video') || reason.includes('render'))) tier = name;
      }
      if (tier) {
        counts[tier] = counts[tier] || { renders: 0, credits: 0 };
        counts[tier].renders += 1;
        counts[tier].credits += cost;
      }
    }
    const colors: Record<string, string> = { ESSENTIAL: '#800080', SOCIAL: '#9333ea', CINEMATIC: '#a855f7', PREMIUM: '#c084fc' };
    return Object.entries(counts).map(([name, v]) => ({ name, ...v, color: colors[name] || '#6366f1' }));
  }, [txns]);

  // Refunds = failed renders that were auto-refunded
  const refunds = useMemo(() => txns.filter(t => t.amount > 0 && /refund/i.test(t.reason || '')), [txns]);
  const spends = useMemo(() => txns.filter(t => t.amount < 0 && /video|render/i.test(t.reason || '')), [txns]);
  const successCount = Math.max(0, spends.length - refunds.length);
  const successRate = spends.length ? ((successCount / spends.length) * 100).toFixed(1) : null;
  const totalSpent = spends.reduce((s, t) => s + Math.abs(t.amount), 0);

  const featureUsage = useMemo(() => (report?.creditsByFeature || { videoGeneration: 0, imageEditing: 0, flashHead: 0, other: 0 }), [report]);
  const featurePie = [
    { name: 'Video Renders', value: featureUsage.videoGeneration, color: '#800080' },
    { name: 'Photo Edits', value: featureUsage.imageEditing, color: '#9333ea' },
    { name: 'FlashHead', value: featureUsage.flashHead, color: '#a855f7' },
    { name: 'Other', value: featureUsage.other, color: '#64748b' },
  ].filter(x => x.value > 0);

  const Empty = ({ label }: { label: string }) => (
    <div className="h-[220px] flex items-center justify-center text-ink-500 text-sm text-center px-6">{label}</div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><BarChart3 className="w-6 h-6 text-purple-400" /> Analytics</h1>
          <p className="text-ink-400 mt-1">Real usage data from your credit ledger.</p>
        </div>
        <div className="flex gap-1 bg-ink-800 rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-md text-xs font-medium transition ${period === p ? 'bg-purple-700 text-white' : 'text-ink-400 hover:text-white'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row — real */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-dark p-5">
          <div className="flex items-center justify-between"><span className="text-ink-400 text-sm">Video Renders</span><Video className="w-4 h-4 text-purple-400" /></div>
          <p className="text-3xl font-bold text-white mt-2">{loading ? '…' : successCount + refunds.length}</p>
          <p className="text-xs text-ink-400 mt-1">attempts in {period}</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between"><span className="text-ink-400 text-sm">Success Rate</span><CheckCircle2 className="w-4 h-4 text-green-400" /></div>
          <p className="text-3xl font-bold text-white mt-2">{loading ? '…' : successRate !== null ? `${successRate}%` : '—'}</p>
          <p className="text-xs text-ink-400 mt-1">refunds treated as failures</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between"><span className="text-ink-400 text-sm">Credits Spent</span><Zap className="w-4 h-4 text-yellow-400" /></div>
          <p className="text-3xl font-bold text-white mt-2">{loading ? '…' : totalSpent}</p>
          <p className="text-xs text-ink-400 mt-1">in {period}</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between"><span className="text-ink-400 text-sm">Failed Renders</span><XCircle className="w-4 h-4 text-red-400" /></div>
          <p className="text-3xl font-bold text-white mt-2">{loading ? '…' : refunds.length}</p>
          <p className="text-xs text-ink-400 mt-1">AI renders that failed</p>
        </div>
      </div>

      {/* Daily usage — real */}
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-purple-400" /> Daily Credit Spend</h3>
        {dailyData.every(d => d.credits === 0) ? (
          <Empty label="No spend recorded in this window yet. Renders and photo edits will chart here." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#800080" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#800080" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" stroke="#7f8aab" fontSize={11} />
              <YAxis stroke="#7f8aab" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
              <Area type="monotone" dataKey="credits" stroke="#800080" strokeWidth={2} fill="url(#aGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier breakdown — real */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4"><Video className="w-4 h-4 text-purple-400" /> Renders by Tier</h3>
          {tierBreakdown.length === 0 ? (
            <Empty label="No video renders in this window yet." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={tierBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="credits" paddingAngle={3}>
                    {tierBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {tierBreakdown.map(t => (
                  <div key={t.name} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                    <span className="text-ink-400">{t.name}</span>
                    <span className="text-white font-medium ml-auto">{t.renders} render{t.renders === 1 ? '' : 's'} · {t.credits} cr</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Feature split — real */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4"><Zap className="w-4 h-4 text-purple-400" /> Credits by Feature</h3>
          {featurePie.length === 0 ? (
            <Empty label="No usage in this window yet." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={featurePie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {featurePie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {featurePie.map(t => (
                  <div key={t.name} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                    <span className="text-ink-400">{t.name}</span>
                    <span className="text-white font-medium ml-auto">{t.value} cr</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Honest note about not-yet-tracked metrics */}
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white flex items-center gap-2 mb-3"><Eye className="w-4 h-4 text-green-400" /> Listing Views & Conversion</h3>
        <p className="text-sm text-ink-400">
          View and inquiry tracking is not collected yet — these numbers will appear once your shared reels get
          public analytics. Everything on this page reflects your actual PropReel usage.
        </p>
      </div>
    </div>
  );
}
