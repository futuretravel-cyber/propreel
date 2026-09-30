import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatZar, formatDate } from '../lib/utils';
import {
  BarChart3, TrendingUp, Clock, CheckCircle2, XCircle, Video,
  Zap, Target, Download, Calendar, ArrowUpRight, ArrowDownRight,
  Eye, Award, Flame, PieChart as PieIcon
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';

const weeklyData = [
  { day: 'Mon', renders: 5, credits: 75, success: 5, failed: 0, avgTime: 2.8 },
  { day: 'Tue', renders: 8, credits: 120, success: 7, failed: 1, avgTime: 3.1 },
  { day: 'Wed', renders: 3, credits: 45, success: 3, failed: 0, avgTime: 2.5 },
  { day: 'Thu', renders: 10, credits: 180, success: 9, failed: 1, avgTime: 3.4 },
  { day: 'Fri', renders: 6, credits: 90, success: 6, failed: 0, avgTime: 2.9 },
  { day: 'Sat', renders: 2, credits: 30, success: 2, failed: 0, avgTime: 2.2 },
  { day: 'Sun', renders: 1, credits: 15, success: 1, failed: 0, avgTime: 2.0 },
];

const monthlyData = [
  { month: 'Oct', renders: 32, credits: 480, views: 8200 },
  { month: 'Nov', renders: 45, credits: 675, views: 11500 },
  { month: 'Dec', renders: 38, credits: 570, views: 9800 },
  { month: 'Jan', renders: 52, credits: 780, views: 14200 },
  { month: 'Feb', renders: 49, credits: 735, views: 13100 },
  { month: 'Mar', renders: 35, credits: 525, views: 12400 },
];

const tierBreakdown = [
  { name: 'Essential', renders: 15, credits: 75, color: '#800080' },
  { name: 'Social', renders: 28, credits: 420, color: '#9333ea' },
  { name: 'Cinematic', renders: 12, credits: 540, color: '#a855f7' },
  { name: 'Premium', renders: 4, credits: 600, color: '#c084fc' },
];

const renderTimes = [
  { tier: 'Essential', avgTime: 45, target: 60 },
  { tier: 'Social', avgTime: 90, target: 120 },
  { tier: 'Cinematic', avgTime: 180, target: 240 },
  { tier: 'Premium', avgTime: 360, target: 480 },
];

export default function EnhancedAnalytics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const totalRenders = weeklyData.reduce((s, d) => s + d.renders, 0);
  const totalCredits = weeklyData.reduce((s, d) => s + d.credits, 0);
  const totalSuccess = weeklyData.reduce((s, d) => s + d.success, 0);
  const totalFailed = weeklyData.reduce((s, d) => s + d.failed, 0);
  const successRate = ((totalSuccess / (totalSuccess + totalFailed)) * 100).toFixed(1);
  const avgRenderTime = (weeklyData.reduce((s, d) => s + d.avgTime, 0) / weeklyData.length).toFixed(1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-purple-400" /> Analytics
          </h1>
          <p className="text-ink-400 mt-1">Your personal usage dashboard and performance metrics.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-ink-800 rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-md text-xs font-medium transition ${period === p ? 'bg-purple-700 text-white' : 'text-ink-400 hover:text-white'}`}>
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary text-sm"><Download className="w-4 h-4" /> Export</button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Total Renders</span>
            <Video className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">{totalRenders}</p>
          <p className="text-xs text-green-400 mt-1 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> +12% vs last period</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Success Rate</span>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">{successRate}%</p>
          <p className="text-xs text-green-400 mt-1 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> +2.3% improvement</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Avg Render Time</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">{avgRenderTime}m</p>
          <p className="text-xs text-green-400 mt-1 flex items-center gap-1"><ArrowDownRight className="w-3 h-3" /> -8% faster</p>
        </div>
        <div className="card-dark p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-400 text-sm">Credits Used</span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-2">{totalCredits}</p>
          <p className="text-xs text-ink-400 mt-1">{(totalCredits / totalRenders).toFixed(1)} avg per render</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Render Activity */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-400" /> Render Activity
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="renderGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#800080" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#800080" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" stroke="#7f8aab" fontSize={12} />
              <YAxis stroke="#7f8aab" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
              <Area type="monotone" dataKey="renders" stroke="#800080" strokeWidth={2} fill="url(#renderGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Success vs Failure */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-green-400" /> Success vs Failure Rate
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" stroke="#7f8aab" fontSize={12} />
              <YAxis stroke="#7f8aab" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
              <Bar dataKey="success" fill="#22c55e" radius={[4, 4, 0, 0]} name="Success" stackId="a" />
              <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} name="Failed" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Trend */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" /> Monthly Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" stroke="#7f8aab" fontSize={12} />
              <YAxis stroke="#7f8aab" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
              <Line type="monotone" dataKey="renders" stroke="#800080" strokeWidth={2} dot={{ fill: '#800080' }} name="Renders" />
              <Line type="monotone" dataKey="views" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} name="Views" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tier Breakdown */}
        <div className="card-dark p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-purple-400" /> Usage by Tier
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={tierBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="renders" paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {tierBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {tierBreakdown.map(t => (
              <div key={t.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                <span className="text-ink-400">{t.name}</span>
                <span className="text-white font-medium ml-auto">{t.renders} renders</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Render Time Analysis */}
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" /> Average Render Times by Tier
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {renderTimes.map(r => (
            <div key={r.tier} className="bg-ink-800/50 rounded-xl p-4 text-center">
              <p className="text-xs text-ink-400">{r.tier}</p>
              <p className="text-2xl font-bold text-white mt-1">{r.avgTime}s</p>
              <p className="text-xs text-ink-500">target: {r.target}s</p>
              <div className="mt-2 h-2 bg-ink-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full" style={{ width: `${(r.target / r.avgTime) * 100}%` }} />
              </div>
              <p className="text-xs text-green-400 mt-1">{Math.round((1 - r.avgTime / r.target) * 100)}% faster than target</p>
            </div>
          ))}
        </div>
      </div>

      {/* Views Analytics */}
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4 text-green-400" /> Views Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-4xl font-black text-white">12.4K</p>
            <p className="text-sm text-ink-400 mt-1">Total Views (30d)</p>
            <p className="text-xs text-green-400 mt-1">+18% vs last month</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-black text-purple-400">348</p>
            <p className="text-sm text-ink-400 mt-1">Avg Views per Reel</p>
            <p className="text-xs text-green-400 mt-1">+5% vs last month</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-black text-green-400">2.1%</p>
            <p className="text-sm text-ink-400 mt-1">Conversion Rate</p>
            <p className="text-xs text-green-400 mt-1">View → Inquiry</p>
          </div>
        </div>
      </div>
    </div>
  );
}
