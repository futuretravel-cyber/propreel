import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatRelative, formatDate } from '../lib/utils';
import { mockProjects, mockTransactions, mockAgencyMembers } from '../lib/mockData';
import { TIERS } from '../lib/constants';
import UpgradeToProCTA from './UpgradeToProCTA';
import {
  Video, Zap, Eye, TrendingUp, Plus, CreditCard, Users, Clock, List,
  CheckCircle2, XCircle, AlertTriangle, ArrowUpRight, ArrowDownRight,
  BarChart3, PieChart as PieIcon, Activity, Target, Award, Gift,
  ChevronRight, MoreHorizontal, Star, Flame, Trophy, Sparkles
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

// ─── Credit Usage Chart Data ───────────────────────────────────────────────
const dailyUsage = [
  { day: 'Mon', credits: 15, renders: 2 },
  { day: 'Tue', credits: 45, renders: 4 },
  { day: 'Wed', credits: 30, renders: 3 },
  { day: 'Thu', credits: 60, renders: 5 },
  { day: 'Fri', credits: 25, renders: 2 },
  { day: 'Sat', credits: 10, renders: 1 },
  { day: 'Sun', credits: 5, renders: 0 },
];

const monthlyUsage = [
  { month: 'Oct', used: 320, allowance: 600 },
  { month: 'Nov', used: 450, allowance: 600 },
  { month: 'Dec', used: 380, allowance: 600 },
  { month: 'Jan', used: 520, allowance: 600 },
  { month: 'Feb', used: 490, allowance: 600 },
  { month: 'Mar', used: 285, allowance: 600 },
];

const projectStatusData = [
  { name: 'Ready', value: 28, color: '#22c55e' },
  { name: 'Processing', value: 3, color: '#f59e0b' },
  { name: 'Draft', value: 12, color: '#6366f1' },
  { name: 'Failed', value: 2, color: '#ef4444' },
];

const activityFeed = [
  { id: 1, type: 'render_complete', message: 'Cinematic reel completed for "Luxury Villa in Constantia"', time: '2 min ago', icon: '✓', color: 'text-green-400' },
  { id: 2, type: 'credits_used', message: '45 credits used for Cinematic render', time: '5 min ago', icon: '⚡', color: 'text-yellow-400' },
  { id: 3, type: 'project_created', message: 'New project created: "Beachfront Property in Umhlanga"', time: '1 hour ago', icon: '+', color: 'text-blue-400' },
  { id: 4, type: 'photo_edited', message: 'AI Photo Editor: Golden Sunset applied to 3 photos', time: '2 hours ago', icon: '📷', color: 'text-purple-400' },
  { id: 5, type: 'social_generated', message: 'Instagram caption generated for "Modern Apartment"', time: '3 hours ago', icon: '📱', color: 'text-pink-400' },
  { id: 6, type: 'credits_purchased', message: '100 credits purchased — R100.00', time: '1 day ago', icon: '💳', color: 'text-green-400' },
  { id: 7, type: 'render_failed', message: 'Render failed for "Townhouse in Waterkloof" — credits refunded', time: '2 days ago', icon: '✗', color: 'text-red-400' },
  { id: 8, type: 'achievement', message: '🏆 Achievement unlocked: "10 Projects Created"', time: '3 days ago', icon: '🏆', color: 'text-yellow-400' },
];

// ─── Low Credit Alert ──────────────────────────────────────────────────────
function LowCreditAlert({ credits, allowance }: { credits: number; allowance: number }) {
  const percentage = (credits / allowance) * 100;
  if (percentage > 20) return null;

  const severity = percentage <= 5 ? 'critical' : percentage <= 10 ? 'warning' : 'info';
  const config = {
    critical: { bg: 'bg-red-950/60', border: 'border-red-500/40', text: 'text-red-300', icon: <AlertTriangle className="w-5 h-5" /> },
    warning: { bg: 'bg-yellow-950/60', border: 'border-yellow-500/40', text: 'text-yellow-300', icon: <AlertTriangle className="w-5 h-5" /> },
    info: { bg: 'bg-blue-950/60', border: 'border-blue-500/40', text: 'text-blue-300', icon: <Activity className="w-5 h-5" /> },
  }[severity];

  return (
    <div className={`${config.bg} border ${config.border} rounded-xl p-4 flex items-center justify-between animate-fade-in`}>
      <div className="flex items-center gap-3">
        <span className={config.text}>{config.icon}</span>
        <div>
          <p className={`font-semibold text-sm ${config.text}`}>
            {severity === 'critical' ? 'Critical: Less than 5% credits remaining!' :
             severity === 'warning' ? 'Warning: Less than 10% credits remaining' :
             'Low credit alert: Below 20% threshold'}
          </p>
          <p className="text-xs text-ink-400">{credits} of {allowance} credits remaining</p>
        </div>
      </div>
      <Link to="/dashboard/billing" className="btn btn-primary text-xs py-2 px-4">Top Up</Link>
    </div>
  );
}

// ─── Quick Actions ─────────────────────────────────────────────────────────
function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { label: 'New Project', icon: <Plus className="w-5 h-5" />, color: 'from-purple-600 to-purple-800', onClick: () => navigate('/studio') },
    { label: 'Buy Credits', icon: <CreditCard className="w-5 h-5" />, color: 'from-green-600 to-green-800', onClick: () => navigate('/dashboard/billing') },
    { label: 'Invite Team', icon: <Users className="w-5 h-5" />, color: 'from-blue-600 to-blue-800', onClick: () => navigate('/dashboard/agency') },
    { label: 'View Analytics', icon: <BarChart3 className="w-5 h-5" />, color: 'from-orange-600 to-orange-800', onClick: () => navigate('/dashboard/analytics') },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {actions.map(a => (
        <button key={a.label} onClick={a.onClick} className={`bg-gradient-to-br ${a.color} rounded-xl p-4 text-left text-white hover:scale-[1.02] transition-transform`}>
          {a.icon}
          <p className="font-semibold text-sm mt-2">{a.label}</p>
        </button>
      ))}
    </div>
  );
}

// ─── Render Queue Status ───────────────────────────────────────────────────
function RenderQueue() {
  const queue = [
    { id: 1, title: 'Luxury Villa — Cinematic', progress: 85, eta: '~2 min', tier: 'CINEMATIC' },
    { id: 2, title: 'Modern Apartment — Social', progress: 45, eta: '~5 min', tier: 'SOCIAL' },
    { id: 3, title: 'Family Home — Premium', progress: 12, eta: '~12 min', tier: 'PREMIUM' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-white text-sm flex items-center gap-2">
        <Clock className="w-4 h-4 text-purple-400" /> Render Queue
      </h3>
      {queue.map(item => (
        <div key={item.id} className="bg-ink-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white truncate">{item.title}</p>
            <span className="badge badge-brand text-[10px]">{item.tier}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-ink-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
            </div>
            <span className="text-xs text-ink-400 whitespace-nowrap">{item.eta}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Subscription Widget ───────────────────────────────────────────────────
function SubscriptionWidget() {
  return (
    <div className="card-dark p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white text-sm">Subscription</h3>
        <span className="badge badge-brand">Professional</span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-400">Monthly Allowance</span>
          <span className="text-white font-medium">600 credits</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Used This Month</span>
          <span className="text-white font-medium">285 credits</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Rollover Available</span>
          <span className="text-green-400 font-medium">+45 credits</span>
        </div>
        <div className="border-t border-white/5 pt-2 flex justify-between">
          <span className="text-ink-400">Renewal Date</span>
          <span className="text-white font-medium">1 Apr 2025</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Amount</span>
          <span className="text-white font-medium">{formatZar(589)}/mo</span>
        </div>
      </div>
    </div>
  );
}

// ─── Achievement Badges ────────────────────────────────────────────────────
function AchievementBadges() {
  const badges = [
    { id: 1, name: 'First Render', icon: '🎬', earned: true, description: 'Created your first video reel' },
    { id: 2, name: '10 Projects', icon: '📁', earned: true, description: 'Created 10 projects' },
    { id: 3, name: 'Photo Pro', icon: '📸', earned: true, description: 'Edited 50 photos with AI' },
    { id: 4, name: 'Social Star', icon: '⭐', earned: true, description: 'Generated 25 social captions' },
    { id: 5, name: 'Cinematic Master', icon: '🎥', earned: false, description: 'Create 5 Cinematic tier reels', progress: 60 },
    { id: 6, name: 'Speed Demon', icon: '⚡', earned: false, description: 'Complete 10 renders in one day', progress: 30 },
    { id: 7, name: 'Agency Leader', icon: '👑', earned: false, description: 'Invite 5 team members', progress: 80 },
    { id: 8, name: 'Credit Saver', icon: '💰', earned: false, description: 'Maintain 90%+ efficiency for 30 days', progress: 45 },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-white text-sm flex items-center gap-2">
        <Award className="w-4 h-4 text-yellow-400" /> Achievements
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {badges.map(b => (
          <div key={b.id} className={`relative rounded-xl p-3 text-center transition cursor-pointer group ${b.earned ? 'bg-purple-950/50 border border-purple-500/30' : 'bg-ink-800/50 opacity-60'}`} title={b.description}>
            <span className="text-2xl">{b.icon}</span>
            <p className="text-[10px] text-ink-300 mt-1 leading-tight">{b.name}</p>
            {!b.earned && b.progress !== undefined && (
              <div className="mt-1 h-1 bg-ink-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${b.progress}%` }} />
              </div>
            )}
            {b.earned && <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-white" /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Credit Efficiency Score ───────────────────────────────────────────────
function EfficiencyScore() {
  const score = 87;
  const metrics = [
    { label: 'Credits per Video', value: '18.3', trend: -5, better: true },
    { label: 'Render Success Rate', value: '96%', trend: 2, better: true },
    { label: 'Avg Render Time', value: '3.2 min', trend: -12, better: true },
    { label: 'Photo Edit Efficiency', value: '92%', trend: 8, better: true },
  ];

  return (
    <div className="card-dark p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-400" /> Efficiency Score
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-black text-purple-400">{score}</span>
          <span className="text-xs text-green-400 flex items-center"><ArrowUpRight className="w-3 h-3" />+5</span>
        </div>
      </div>
      <div className="space-y-2">
        {metrics.map(m => (
          <div key={m.label} className="flex items-center justify-between text-sm">
            <span className="text-ink-400">{m.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{m.value}</span>
              <span className={`text-xs flex items-center ${m.better ? 'text-green-400' : 'text-red-400'}`}>
                {m.better ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {Math.abs(m.trend)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Enhanced Overview ────────────────────────────────────────────────
export default function EnhancedOverview() {
  const { user, balance } = useAuth();
  const navigate = useNavigate();
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const chartData = chartPeriod === 'daily' ? dailyUsage :
                    chartPeriod === 'weekly' ? monthlyUsage.slice(-4).map(m => ({ ...m, day: m.month })) :
                    monthlyUsage;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome back, {user?.fullName?.split(' ')[0]} 👋</h1>
          <p className="text-ink-400 mt-1">Here's your property marketing dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-brand"><Zap className="w-3 h-3" /> {balance.total} total credits</span>
        </div>
      </div>

      {/* Low Credit Alert */}
      <LowCreditAlert credits={balance.personal} allowance={600} />

      {/* Quick Actions */}
      <QuickActions />

      {/* Upgrade to Pro CTA */}
      <UpgradeToProCTA />

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Active Listings</span>
            <List className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">4</p>
          <p className="text-xs text-green-400 mt-1 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> +2 this week</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Reels Generated</span>
            <Video className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">28</p>
          <p className="text-xs text-green-400 mt-1 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> +5 this week</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Total Views</span>
            <Eye className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">12.4K</p>
          <p className="text-xs text-green-400 mt-1 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> +18% vs last month</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Credits Remaining</span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">{balance.personal}</p>
          <p className="text-xs text-ink-400 mt-1">of 600 monthly allowance</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Credit Usage Chart */}
        <div className="lg:col-span-2 card-dark p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" /> Credit Usage
            </h3>
            <div className="flex gap-1 bg-ink-800 rounded-lg p-1">
              {(['daily', 'weekly', 'monthly'] as const).map(p => (
                <button key={p} onClick={() => setChartPeriod(p)} className={`px-3 py-1 rounded-md text-xs font-medium transition ${chartPeriod === p ? 'bg-purple-700 text-white' : 'text-ink-400 hover:text-white'}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#800080" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#800080" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey={chartPeriod === 'monthly' ? 'month' : 'day'} stroke="#7f8aab" fontSize={12} />
              <YAxis stroke="#7f8aab" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
              <Area type="monotone" dataKey="credits" stroke="#800080" strokeWidth={2} fill="url(#creditGradient)" />
              {chartPeriod !== 'daily' && <Area type="monotone" dataKey="allowance" stroke="#333b56" strokeWidth={1} strokeDasharray="4 4" fill="none" />}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Project Status Breakdown */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-purple-400" /> Project Status
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                {projectStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {projectStatusData.map(s => (
              <div key={s.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                <span className="text-xs text-ink-400">{s.name}</span>
                <span className="text-xs text-white font-medium ml-auto">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Feed + Side Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-2 card-dark p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" /> Recent Activity
            </h3>
            <button className="text-xs text-purple-400 hover:text-purple-300">View All</button>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar">
            {activityFeed.map(a => (
              <div key={a.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                <div className={`w-8 h-8 rounded-lg bg-ink-800 flex items-center justify-center text-sm flex-shrink-0`}>
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-200 leading-snug">{a.message}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Side Column */}
        <div className="space-y-4">
          <RenderQueue />
          <SubscriptionWidget />
          <EfficiencyScore />
        </div>
      </div>

      {/* Achievements */}
      <AchievementBadges />

      {/* Recent Projects Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Recent Projects</h2>
          <Link to="/dashboard/listings" className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockProjects.slice(0, 3).map(p => (
            <div key={p.id} className="card-dark overflow-hidden group cursor-pointer hover:border-purple-500/30 transition" onClick={() => navigate('/studio')}>
              <div className="aspect-video bg-ink-800 relative overflow-hidden">
                <img src={p.thumbnailUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute top-2 right-2 flex gap-1">
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
                <p className="text-ink-400 text-xs mt-1">{p.suburb}, {p.city}</p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-purple-400 font-semibold text-sm">{formatZar(p.price)}</p>
                  <p className="text-ink-500 text-xs">{formatRelative(p.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


