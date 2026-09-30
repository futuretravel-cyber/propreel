import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatDate, formatRelative } from '../lib/utils';
import { PLANS, TIERS } from '../lib/constants';
import { mockTransactions } from '../lib/mockData';
import {
  CreditCard, Zap, Download, Filter, Search, ArrowUpRight, ArrowDownRight,
  Gift, Package, TrendingUp, Calendar, Check, Star, Shield, Users,
  ChevronDown, Info, AlertCircle, Sparkles, History, BarChart3, XCircle, Lightbulb
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

// Extended transaction data
const allTransactions: Array<{ id: string; type: string; amount: number; description: string; createdAt: string; project: string | null }> = [
  { id: 'tx_001', type: 'RENDER', amount: -45, description: 'Render — Cinematic', createdAt: '2025-03-12T09:15:00Z', project: 'Modern Apartment' },
  { id: 'tx_002', type: 'RENDER', amount: -150, description: 'Render — Premium', createdAt: '2025-03-10T14:30:00Z', project: 'Luxury Villa' },
  { id: 'tx_003', type: 'PURCHASE', amount: 600, description: 'Subscription — Professional (Monthly)', createdAt: '2025-03-01T00:00:00Z', project: null },
  { id: 'tx_004', type: 'RENDER', amount: -15, description: 'Render — Social', createdAt: '2025-02-28T16:00:00Z', project: 'Beachfront Property' },
  { id: 'tx_005', type: 'RENDER', amount: -5, description: 'AI photo edit', createdAt: '2025-02-25T10:30:00Z', project: 'Family Home' },
  { id: 'tx_006', type: 'SIGNUP_BONUS', amount: 5, description: '5 free credits on signup', createdAt: '2025-01-15T10:00:00Z', project: null },
  { id: 'tx_007', type: 'RENDER', amount: -5, description: 'AI photo edit (Golden Sunset)', createdAt: '2025-02-22T14:00:00Z', project: 'Luxury Villa' },
  { id: 'tx_008', type: 'RENDER', amount: -15, description: 'Social caption generation', createdAt: '2025-02-20T10:30:00Z', project: 'Modern Apartment' },
  { id: 'tx_009', type: 'REFUND', amount: 45, description: 'Render failed — credits refunded', createdAt: '2025-02-18T16:00:00Z', project: 'Townhouse' },
  { id: 'tx_010', type: 'RENDER', amount: -150, description: 'Render — Premium (Family Home)', createdAt: '2025-02-15T09:00:00Z', project: 'Family Home' },
  { id: 'tx_011', type: 'GIFT_RECEIVED', amount: 50, description: 'Credits gifted by Demo Realty SA', createdAt: '2025-02-12T11:00:00Z', project: null },
  { id: 'tx_012', type: 'PURCHASE', amount: 100, description: 'Credit bundle purchase (100 credits)', createdAt: '2025-02-10T08:00:00Z', project: null },
  { id: 'tx_013', type: 'RENDER', amount: -5, description: 'Render — Essential', createdAt: '2025-02-08T15:30:00Z', project: 'Beachfront Property' },
  { id: 'tx_014', type: 'AGENCY_SPEND', amount: -45, description: 'Render — Cinematic (agency pool)', createdAt: '2025-02-05T12:00:00Z', project: 'Luxury Villa' },
];

// Credit usage by type
const usageByType = [
  { name: 'Video Renders', value: 65, color: '#800080' },
  { name: 'Photo Edits', value: 15, color: '#9333ea' },
  { name: 'Social Captions', value: 8, color: '#a855f7' },
  { name: 'Descriptions', value: 12, color: '#c084fc' },
];

// Credit bundles
const bundles = [
  { credits: 50, price: 45, discount: 10, popular: false },
  { credits: 100, price: 85, discount: 15, popular: true },
  { credits: 250, price: 200, discount: 20, popular: false },
  { credits: 500, price: 375, discount: 25, popular: false },
];

// Cost estimator data
const costEstimates = [
  { tier: 'Essential', credits: 5, duration: '15s', images: 4 },
  { tier: 'Social', credits: 15, duration: '30s', images: 8 },
  { tier: 'Cinematic', credits: 45, duration: '60s', images: 14 },
  { tier: 'Premium', credits: 150, duration: '120s', images: 24 },
];

export default function EnhancedBilling() {
  const { user, balance } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'overview' | 'history' | 'bundles' | 'analytics' | 'gifting'>('overview');
  const [credits, setCredits] = useState(100);
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [annual, setAnnual] = useState(false);
  const [giftAmount, setGiftAmount] = useState(50);
  const [giftEmail, setGiftEmail] = useState('');

  const filteredTransactions = allTransactions.filter(tx => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (searchQuery && !tx.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterDate !== 'all') {
      const txDate = new Date(tx.createdAt);
      const now = new Date();
      if (filterDate === '7d' && (now.getTime() - txDate.getTime()) > 7 * 24 * 60 * 60 * 1000) return false;
      if (filterDate === '30d' && (now.getTime() - txDate.getTime()) > 30 * 24 * 60 * 60 * 1000) return false;
      if (filterDate === '90d' && (now.getTime() - txDate.getTime()) > 90 * 24 * 60 * 60 * 1000) return false;
    }
    return true;
  });

  const totalSpent = allTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalEarned = allTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Billing & Credits</h1>
        <div className="flex items-center gap-3">
          <div className="card-dark px-4 py-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-white font-bold">{balance.personal}</span>
            <span className="text-ink-400 text-sm">personal</span>
            {balance.agency > 0 && (
              <>
                <span className="text-ink-600">|</span>
                <span className="text-purple-400 font-bold">{balance.agency}</span>
                <span className="text-ink-400 text-sm">agency</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: <CreditCard className="w-4 h-4" /> },
          { id: 'history', label: 'Transaction History', icon: <History className="w-4 h-4" /> },
          { id: 'bundles', label: 'Credit Bundles', icon: <Package className="w-4 h-4" /> },
          { id: 'analytics', label: 'Usage Analytics', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'gifting', label: 'Gift Credits', icon: <Gift className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`flex items-center gap-2 tab-pill ${tab === t.id ? 'tab-pill-active' : ''}`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ──────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card-dark p-6">
              <p className="text-sm text-ink-400">Personal Credits</p>
              <p className="text-4xl font-black text-white mt-1">{balance.personal}</p>
              <div className="mt-3 h-2 bg-ink-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full" style={{ width: `${(balance.personal / 600) * 100}%` }} />
              </div>
              <p className="text-xs text-ink-400 mt-2">{balance.personal} / 600 monthly allowance</p>
            </div>
            <div className="card-dark p-6">
              <p className="text-sm text-ink-400">Agency Pool</p>
              <p className="text-4xl font-black text-purple-400 mt-1">{balance.agency}</p>
              <p className="text-xs text-ink-400 mt-3">Shared across 4 team members</p>
              <p className="text-xs text-green-400 mt-1">Draws from pool first when rendering</p>
            </div>
            <div className="card-dark p-6">
              <p className="text-sm text-ink-400">Credit Expiry Timeline</p>
              <p className="text-xs text-ink-500 mt-1 mb-4">Your credits expire in the following order (FIFO):</p>
              
              <div className="space-y-3">
                {[
                  { amount: 45, expiresAt: '30 Apr 2025', source: 'Rollover', color: 'bg-yellow-500', status: 'Active' },
                  { amount: 130, expiresAt: '1 May 2025', source: 'Subscription', color: 'bg-purple-500', status: 'Active' },
                  { amount: 600, expiresAt: '1 Jun 2025', source: 'Next Renewal', color: 'bg-green-500', status: 'Upcoming' },
                ].map((credit, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: credit.color }} />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-white">{credit.amount} credits — {credit.source}</span>
                        <span className="text-xs text-ink-400">{credit.status}</span>
                      </div>
                      <div className="mt-1 h-1.5 bg-ink-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${credit.color}`} 
                          style={{ width: `${100 - (i * 20)}%` }}
                        />
                      </div>
                      <p className="text-xs text-ink-500 mt-1">Expires: {credit.expiresAt}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Current Plan */}
          <div className="card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Current Plan</h3>
              <span className="badge badge-brand">Professional</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div><p className="text-ink-400">Monthly Cost</p><p className="text-white font-semibold">{formatZar(589)}/mo</p></div>
              <div><p className="text-ink-400">Credits/Month</p><p className="text-white font-semibold">600</p></div>
              <div><p className="text-ink-400">Next Renewal</p><p className="text-white font-semibold">1 Apr 2025</p></div>
              <div><p className="text-ink-400">Cost per Credit</p><p className="text-white font-semibold">{formatZar(0.98)}</p></div>
            </div>
            <div className="pt-4 border-t border-white/5">
              <Link to="/dashboard/cancel-subscription" className="btn btn-secondary w-full">
                <XCircle className="w-4 h-4" /> Cancel Subscription
              </Link>
            </div>
          </div>

          {/* Cost Estimator */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-400" /> Credit Cost Breakdown
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {costEstimates.map(c => (
                <div key={c.tier} className="bg-ink-800/50 rounded-xl p-4 text-center">
                  <p className="font-bold text-white">{c.tier}</p>
                  <p className="text-2xl font-black text-purple-400 my-2">{c.credits}</p>
                  <p className="text-xs text-ink-400">credits</p>
                  <p className="text-xs text-ink-500 mt-2">{c.duration} • {c.images} images</p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-purple-950/30 border border-purple-500/20 rounded-lg">
              <p className="text-xs text-purple-300 flex items-center gap-2">
                <Sparkles className="w-3 h-3" />
                <strong>Agency savings:</strong> When rendering from the agency pool, you save personal credits. Current pool balance: {balance.agency} credits.
              </p>
            </div>
          </div>

          {/* Suggested Bundle */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" /> Suggested for You
            </h3>
            <p className="text-xs text-ink-400 mb-4">Based on your usage, we recommend:</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { credits: 100, price: 85, reason: 'Matches your monthly usage' },
                { credits: 250, price: 200, reason: 'Best value for regular users' },
                { credits: 500, price: 375, reason: 'Save 25% - best overall deal' },
              ].map((bundle, i) => (
                <div key={i} className={`rounded-xl p-4 text-center transition ${i === 1 ? 'bg-purple-950/50 border-2 border-purple-500/50' : 'bg-ink-800/50 border border-white/5'}`}>
                  <p className="text-xl font-bold text-white">{bundle.credits}</p>
                  <p className="text-xs text-ink-400">credits</p>
                  <p className="text-lg font-bold text-purple-400 mt-1">{formatZar(bundle.price)}</p>
                  <p className="text-xs text-green-400">Save {100 - Math.round(bundle.price/bundle.credits * 100)}%</p>
                  <p className="text-xs text-ink-500 mt-2">{bundle.reason}</p>
                  <button 
                    onClick={() => { setCredits(bundle.credits); toast.success(`Selected ${bundle.credits} credits`); }}
                    className="btn btn-secondary w-full mt-2 text-xs py-1"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Credit Top-Up */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Custom Amount</h3>
            <div className="flex items-center gap-4">
              <input type="range" min={50} max={1000} step={10} value={credits} onChange={e => setCredits(Number(e.target.value))} className="flex-1" />
              <div className="text-right min-w-[80px]">
                <p className="text-2xl font-bold text-white">{credits}</p>
                <p className="text-xs text-ink-400">credits</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xl font-bold text-white">{formatZar(credits)} <span className="text-sm text-ink-400 font-normal">(R1/credit)</span></p>
              <button onClick={() => toast.success(`Redirecting to Paystack for ${credits} credits...`, 'Processing')} className="btn btn-primary">
                <CreditCard className="w-4 h-4" /> Pay with Paystack
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Transaction History Tab ───────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card-dark p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input className="input pl-10" placeholder="Search transactions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <select className="input max-w-[160px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="RENDER">Renders</option>
                <option value="PURCHASE">Purchases</option>
                <option value="SIGNUP_BONUS">Bonuses</option>
                <option value="REFUND">Refunds</option>
                <option value="GIFT_RECEIVED">Gifts</option>
                <option value="AGENCY_SPEND">Agency Spend</option>
              </select>
              <select className="input max-w-[140px]" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                <option value="all">All Time</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
              <button className="btn btn-secondary"><Download className="w-4 h-4" /> Export</button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card-dark p-4 text-center">
              <p className="text-xs text-ink-400">Total Spent</p>
              <p className="text-xl font-bold text-red-400">-{totalSpent} cr</p>
            </div>
            <div className="card-dark p-4 text-center">
              <p className="text-xs text-ink-400">Total Earned</p>
              <p className="text-xl font-bold text-green-400">+{totalEarned} cr</p>
            </div>
            <div className="card-dark p-4 text-center">
              <p className="text-xs text-ink-400">Transactions</p>
              <p className="text-xl font-bold text-white">{filteredTransactions.length}</p>
            </div>
          </div>

          {/* Transaction List */}
          <div className="card-dark overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map(tx => (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm text-white">{tx.description}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${
                          tx.type === 'PURCHASE' || tx.type === 'SIGNUP_BONUS' || tx.type === 'REFUND' || tx.type === 'GIFT_RECEIVED' ? 'badge-success' :
                          tx.type === 'RENDER' || tx.type === 'AGENCY_SPEND' ? 'badge-warning' : 'badge-muted'
                        }`}>{tx.type.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-400">{tx.project || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold text-sm ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount} cr
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-400">{formatDate(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Credit Bundles Tab ────────────────────────────────────────────── */}
      {tab === 'bundles' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-2">Credit Bundles — Save More</h3>
            <p className="text-ink-400 text-sm mb-6">Buy credits in bulk and save. Credits never expire.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {bundles.map(b => (
                <div key={b.credits} className={`relative rounded-xl p-6 text-center transition ${b.popular ? 'bg-gradient-to-b from-purple-950/80 to-ink-900 border-2 border-purple-500/50' : 'bg-ink-800/50 border border-white/5'}`}>
                  {b.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-brand">Best Value</div>}
                  <p className="text-3xl font-black text-white">{b.credits}</p>
                  <p className="text-sm text-ink-400">credits</p>
                  <div className="my-4">
                    <p className="text-2xl font-bold text-purple-400">{formatZar(b.price)}</p>
                    <p className="text-xs text-ink-500 line-through">{formatZar(b.credits)}</p>
                  </div>
                  <div className="badge badge-success mb-4">Save {b.discount}%</div>
                  <button onClick={() => toast.success(`Adding ${b.credits} credits to cart...`)} className={`btn w-full ${b.popular ? 'btn-primary' : 'btn-secondary'}`}>
                    Buy Now
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Plans */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" /> Subscription Plans
            </h3>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setAnnual(false)} className={`px-4 py-2 rounded-lg text-sm font-medium ${!annual ? 'bg-purple-700 text-white' : 'text-ink-400'}`}>Monthly</button>
              <button onClick={() => setAnnual(true)} className={`px-4 py-2 rounded-lg text-sm font-medium ${annual ? 'bg-purple-700 text-white' : 'text-ink-400'}`}>Annual <span className="text-green-400 text-xs">Save 15%</span></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLANS.map(plan => {
                const price = annual ? plan.annualZar : plan.monthlyZar;
                const isCurrent = plan.id === 'PROFESSIONAL';
                return (
                  <div key={plan.id} className={`rounded-xl p-5 ${isCurrent ? 'bg-purple-950/50 border border-purple-500/30' : 'bg-ink-800/50'}`}>
                    {isCurrent && <span className="badge badge-brand mb-2">Current Plan</span>}
                    <h4 className="font-bold text-white">{plan.name}</h4>
                    <p className="text-2xl font-black text-white mt-2">{formatZar(price)}<span className="text-sm text-ink-400 font-normal">/mo</span></p>
                    <p className="text-xs text-purple-400 mt-1">{plan.monthlyCredits} credits/month</p>
                    <ul className="mt-4 space-y-2">
                      {plan.features.slice(0, 3).map((f, i) => (
                        <li key={i} className="text-xs text-ink-300 flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> {f}</li>
                      ))}
                    </ul>
                    {!isCurrent && <button className="btn btn-secondary w-full mt-4 text-xs">Switch Plan</button>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Usage Analytics Tab ───────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Usage by Type */}
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4">Credits Used by Feature</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={usageByType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {usageByType.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Trend */}
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4">Monthly Credit Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { month: 'Oct', spent: 320, earned: 600 },
                  { month: 'Nov', spent: 450, earned: 600 },
                  { month: 'Dec', spent: 380, earned: 600 },
                  { month: 'Jan', spent: 520, earned: 600 },
                  { month: 'Feb', spent: 490, earned: 600 },
                  { month: 'Mar', spent: 285, earned: 600 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="#7f8aab" fontSize={12} />
                  <YAxis stroke="#7f8aab" fontSize={12} />
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                  <Bar dataKey="spent" fill="#800080" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Usage by Project Type */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Usage by Project Type</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { type: 'Essential', count: 8, credits: 40, avgCost: 5 },
                { type: 'Social', count: 12, credits: 180, avgCost: 15 },
                { type: 'Cinematic', count: 5, credits: 225, avgCost: 45 },
                { type: 'Premium', count: 2, credits: 300, avgCost: 150 },
              ].map(t => (
                <div key={t.type} className="bg-ink-800/50 rounded-xl p-4">
                  <p className="text-sm text-ink-400">{t.type}</p>
                  <p className="text-xl font-bold text-white mt-1">{t.count} renders</p>
                  <p className="text-sm text-purple-400 font-semibold">{t.credits} credits</p>
                  <p className="text-xs text-ink-500 mt-1">Avg: {t.avgCost} cr/render</p>
                </div>
              ))}
            </div>
          </div>

          {/* ROI Calculator */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" /> ROI Calculator
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-ink-800/50 rounded-xl p-4">
                <p className="text-xs text-ink-400">Monthly Spend</p>
                <p className="text-2xl font-bold text-white">{formatZar(589)}</p>
                <p className="text-xs text-ink-500">Subscription + extras</p>
              </div>
              <div className="bg-ink-800/50 rounded-xl p-4">
                <p className="text-xs text-ink-400">Est. Additional Sales</p>
                <p className="text-2xl font-bold text-green-400">{formatZar(2500000)}</p>
                <p className="text-xs text-ink-500">From video-enhanced listings</p>
              </div>
              <div className="bg-green-950/30 border border-green-500/20 rounded-xl p-4">
                <p className="text-xs text-green-400">Return on Investment</p>
                <p className="text-2xl font-bold text-green-400">4,244x</p>
                <p className="text-xs text-ink-500">Based on avg. commission</p>
              </div>
            </div>
          </div>

          <button className="btn btn-secondary"><Download className="w-4 h-4" /> Export Full Report (CSV)</button>
        </div>
      )}

      {/* ─── Gifting Tab ───────────────────────────────────────────────────── */}
      {tab === 'gifting' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-400" /> Gift Credits to Team Members
            </h3>
            <p className="text-ink-400 text-sm mb-6">Share your credits with agency team members. Gifts are non-refundable.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="label">Recipient Email</label>
                  <input className="input" placeholder="agent@agency.co.za" value={giftEmail} onChange={e => setGiftEmail(e.target.value)} />
                </div>
                <div>
                  <label className="label">Amount (credits)</label>
                  <input type="number" className="input" min={1} max={balance.personal} value={giftAmount} onChange={e => setGiftAmount(Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Message (optional)</label>
                  <input className="input" placeholder="Thanks for your hard work!" />
                </div>
                <button onClick={() => toast.success(`Gifted ${giftAmount} credits to ${giftEmail || 'team member'}`, 'Gift Sent!')} className="btn btn-primary w-full">
                  <Gift className="w-4 h-4" /> Send Gift ({giftAmount} credits)
                </button>
              </div>
              <div className="bg-ink-800/50 rounded-xl p-4">
                <h4 className="font-medium text-white text-sm mb-3">Quick Select Team Member</h4>
                <div className="space-y-2">
                  {['Sarah van der Merwe', 'James Molefe', 'Priya Naidoo', 'David Botha'].map(name => (
                    <button key={name} onClick={() => setGiftEmail(name.toLowerCase().replace(' ', '.') + '@demorealty.co.za')} className="w-full flex items-center justify-between p-3 rounded-lg bg-ink-700/50 hover:bg-ink-700 transition text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 text-xs font-bold">
                          {name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm text-white">{name}</span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-ink-400 rotate-[-90deg]" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Gift History */}
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Gift History</h3>
            <div className="space-y-3">
              {[
                { to: 'Sarah van der Merwe', amount: 50, date: '2025-03-10', message: 'Great work on the Constantia listing!' },
                { to: 'James Molefe', amount: 25, date: '2025-02-28', message: 'Bonus for top performer' },
              ].map((g, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm text-white">Gifted to {g.to}</p>
                    <p className="text-xs text-ink-400">{g.message}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-purple-400">-{g.amount} cr</p>
                    <p className="text-xs text-ink-500">{formatDate(g.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
