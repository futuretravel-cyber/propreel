import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatDate } from '../lib/utils';
import { PLANS, TIERS } from '../lib/constants';
import { PropReelAPI, CreditReportData } from '../lib/api';
import {
  CreditCard, Zap, Download, Search,
  Gift, Package, TrendingUp,
  Check, Star, Info, Sparkles, History, BarChart3, XCircle, Lightbulb,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

// ─── Real data: everything on this page comes from the credits ledger ──────

// Credit bundles (1 credit = R1; checkout via Paystack hosted page)
const bundles = [
  { credits: 50, price: 50, popular: false },
  { credits: 100, price: 100, popular: true },
  { credits: 250, price: 250, popular: false },
  { credits: 500, price: 500, popular: false },
];

const costEstimates = [
  { tier: 'Essential', credits: 5 },
  { tier: 'Social', credits: 30 },
  { tier: 'Cinematic', credits: 40 },
  { tier: 'Premium', credits: 60 },
];

export default function EnhancedBilling() {
  const { user, balance, refresh, giftCredits } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'history' | 'bundles' | 'analytics' | 'gifting'>('overview');
  const [credits, setCredits] = useState(100);
  const [report, setReport] = useState<CreditReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [giftAmount, setGiftAmount] = useState(50);
  const [giftEmail, setGiftEmail] = useState('');
  const [gifting, setGifting] = useState(false);

  const loadReport = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      setReport(await PropReelAPI.creditReport(user.id, '90d'));
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Real transactions from the DynamoDB credit ledger
  const allTransactions = useMemo(() => (report?.transactions || []).map((t, i) => ({
    id: `tx_${i}`,
    type: (t.amount > 0
      ? (String(t.kind || '').includes('refund') ? 'REFUND' : 'CREDIT')
      : 'SPEND') as string,
    amount: t.amount,
    description: t.reason || (t.amount > 0 ? 'Credits added' : 'Credits used'),
    createdAt: t.createdAt,
  })), [report]);

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

  // Real usage-by-feature from the ledger metadata
  const usageByType = useMemo(() => {
    const byFeature = report?.creditsByFeature || { videoGeneration: 0, imageEditing: 0, flashHead: 0, other: 0 };
    return [
      { name: 'Video Renders', value: byFeature.videoGeneration, color: '#800080' },
      { name: 'Photo Edits', value: byFeature.imageEditing, color: '#9333ea' },
      { name: 'FlashHead', value: byFeature.flashHead, color: '#a855f7' },
      { name: 'Other', value: byFeature.other, color: '#c084fc' },
    ].filter(x => x.value > 0);
  }, [report]);

  // Real monthly trend (last 6 months from the ledger)
  const monthlyTrend = useMemo(() => {
    const months: Array<{ month: string; spent: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const spent = allTransactions
        .filter(t => t.amount < 0 && t.createdAt.slice(0, 7) === key)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      months.push({ month: d.toLocaleDateString('en-ZA', { month: 'short' }), spent });
    }
    return months;
  }, [allTransactions]);

  // Buy credits: real Paystack hosted checkout
  const buyCredits = async (amount: number) => {
    if (!user) { toast.error('Please sign in first'); return; }
    setPurchasing(true);
    try {
      const response = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, credits: amount, email: user.email }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Payment could not be initialized');
      }
      const data = await response.json();
      // Real redirect to Paystack's hosted checkout
      window.location.href = data.authorization_url;
    } catch (e: any) {
      toast.error(e.message || 'Payment failed');
      setPurchasing(false);
    }
  };

  // Gift credits: real transfer via /api/credits?action=gift_email
  const sendGift = async () => {
    if (!giftEmail.trim()) { toast.error('Enter the recipient email'); return; }
    if (giftAmount < 1 || giftAmount > balance.personal) {
      toast.error(`Amount must be between 1 and ${balance.personal}`);
      return;
    }
    setGifting(true);
    try {
      await giftCredits(giftEmail.trim(), giftAmount);
      toast.success(`Gifted ${giftAmount} credits to ${giftEmail}`, 'Gift Sent!');
      setGiftEmail('');
      loadReport();
    } catch (e: any) {
      toast.error(e.message || 'Gift failed');
    } finally {
      setGifting(false);
    }
  };

  const plan = user?.subscription?.planId ? PLANS.find(p => p.id === user.subscription!.planId) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Billing & Credits</h1>
        <div className="flex items-center gap-3">
          <div className="card-dark px-4 py-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-white font-bold">{balance.personal}</span>
            <span className="text-ink-400 text-sm">credits</span>
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

      {/* ─── Overview Tab ──────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card-dark p-6">
              <p className="text-sm text-ink-400">Personal Credits</p>
              <p className="text-4xl font-black text-white mt-1">{balance.personal}</p>
              <p className="text-xs text-ink-400 mt-3">Credits are consumed by renders and edits</p>
            </div>
            <div className="card-dark p-6">
              <p className="text-sm text-ink-400">Expiring in 7 Days</p>
              <p className={`text-4xl font-black mt-1 ${balance.expiringSoon > 0 ? 'text-yellow-400' : 'text-white'}`}>{balance.expiringSoon}</p>
              <p className="text-xs text-ink-400 mt-3">FIFO — oldest credits are spent first</p>
            </div>
            <div className="card-dark p-6">
              <p className="text-sm text-ink-400">Credit Expiries</p>
              <div className="mt-3 space-y-2">
                {(user?.creditExpiries || []).length === 0 ? (
                  <p className="text-xs text-ink-500">No expiring credit batches on your account.</p>
                ) : (
                  (user!.creditExpiries || []).slice(0, 3).map((e, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-white">{e.amount} credits</span>
                      <span className="text-xs text-ink-400">{formatDate(e.expiresAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Current Plan — real */}
          <div className="card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Current Plan</h3>
              {plan ? (
                <span className="badge badge-brand">{plan.name}</span>
              ) : (
                <span className="badge badge-muted">No active plan</span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div><p className="text-ink-400">Monthly Cost</p><p className="text-white font-semibold">{plan ? `${formatZar(plan.monthlyZar)}/mo` : '—'}</p></div>
              <div><p className="text-ink-400">Credits/Month</p><p className="text-white font-semibold">{plan ? plan.monthlyCredits : '—'}</p></div>
              <div><p className="text-ink-400">Next Renewal</p><p className="text-white font-semibold">{user?.subscription?.currentPeriodEnd ? formatDate(user.subscription.currentPeriodEnd) : '—'}</p></div>
              <div><p className="text-ink-400">Status</p><p className="text-white font-semibold">{user?.subscription?.status || 'NONE'}</p></div>
            </div>
            <div className="pt-4 border-t border-white/5 flex gap-3">
              <button onClick={() => navigate('/pricing')} className="btn btn-primary flex-1">{plan ? 'Change Plan' : 'Choose a Plan'}</button>
              {plan && (
                <button onClick={() => navigate('/dashboard/cancel-subscription')} className="btn btn-secondary flex-1">
                  <XCircle className="w-4 h-4" /> Cancel Subscription
                </button>
              )}
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
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-purple-950/30 border border-purple-500/20 rounded-lg">
              <p className="text-xs text-purple-300 flex items-center gap-2">
                <Sparkles className="w-3 h-3" />
                Each AI photo edit costs 2 credits. Failed renders are refunded automatically.
              </p>
            </div>
          </div>

          {/* Quick Top-Up — real checkout */}
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
              <button onClick={() => buyCredits(credits)} disabled={purchasing} className="btn btn-primary">
                <CreditCard className="w-4 h-4" /> {purchasing ? 'Redirecting…' : 'Pay with Paystack'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Transaction History Tab — real ledger ─────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="card-dark p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input className="input pl-10" placeholder="Search transactions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <select className="input max-w-[160px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="SPEND">Spends</option>
                <option value="CREDIT">Credits Added</option>
                <option value="REFUND">Refunds</option>
              </select>
              <select className="input max-w-[140px]" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                <option value="all">All Time</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>
          </div>

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

          <div className="card-dark overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-400 text-sm">Loading transactions…</td></tr>}
                  {!loading && filteredTransactions.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-400 text-sm">No transactions in this period yet.</td></tr>
                  )}
                  {filteredTransactions.map(tx => (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm text-white">{tx.description}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${tx.amount > 0 ? 'badge-success' : 'badge-warning'}`}>{tx.type}</span>
                      </td>
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

      {/* ─── Credit Bundles Tab — real checkout ────────────────────────── */}
      {tab === 'bundles' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-2">Credit Bundles</h3>
            <p className="text-ink-400 text-sm mb-6">Buy credits via Paystack's secure checkout. Credits land in your account immediately after payment.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {bundles.map(b => (
                <div key={b.credits} className={`relative rounded-xl p-6 text-center transition ${b.popular ? 'bg-gradient-to-b from-purple-950/80 to-ink-900 border-2 border-purple-500/50' : 'bg-ink-800/50 border border-white/5'}`}>
                  {b.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-brand">Most Popular</div>}
                  <p className="text-3xl font-black text-white">{b.credits}</p>
                  <p className="text-sm text-ink-400">credits</p>
                  <div className="my-4">
                    <p className="text-2xl font-bold text-purple-400">{formatZar(b.price)}</p>
                  </div>
                  <button onClick={() => buyCredits(b.credits)} disabled={purchasing} className={`btn w-full ${b.popular ? 'btn-primary' : 'btn-secondary'}`}>
                    {purchasing ? 'Redirecting…' : 'Buy Now'}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLANS.map(p => {
                const isCurrent = plan?.id === p.id;
                return (
                  <div key={p.id} className={`rounded-xl p-5 ${isCurrent ? 'bg-purple-950/50 border border-purple-500/30' : 'bg-ink-800/50'}`}>
                    {isCurrent && <span className="badge badge-brand mb-2">Current Plan</span>}
                    <h4 className="font-bold text-white">{p.name}</h4>
                    <p className="text-2xl font-black text-white mt-2">{formatZar(p.monthlyZar)}<span className="text-sm text-ink-400 font-normal">/mo</span></p>
                    <p className="text-xs text-purple-400 mt-1">{p.monthlyCredits} credits/month</p>
                    <ul className="mt-4 space-y-2">
                      {p.features.slice(0, 3).map((f, i) => (
                        <li key={i} className="text-xs text-ink-300 flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> {f}</li>
                      ))}
                    </ul>
                    <button onClick={() => navigate(`/payment?plan=${p.id}&cycle=MONTHLY&price=${p.monthlyZar}`)} className="btn btn-secondary w-full mt-4 text-xs">
                      {isCurrent ? 'Renew' : 'Switch Plan'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Usage Analytics Tab — real ledger aggregates ──────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4">Credits Used by Feature</h3>
              {usageByType.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-ink-500 text-sm">No usage data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={usageByType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {usageByType.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4">Monthly Credit Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="#7f8aab" fontSize={12} />
                  <YAxis stroke="#7f8aab" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1e2338', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                  <Bar dataKey="spent" fill="#800080" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" /> Summary (last 90 days)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-ink-800/50 rounded-xl p-4">
                <p className="text-xs text-ink-400">Credits Spent</p>
                <p className="text-2xl font-bold text-white">{totalSpent}</p>
              </div>
              <div className="bg-ink-800/50 rounded-xl p-4">
                <p className="text-xs text-ink-400">Credits Added</p>
                <p className="text-2xl font-bold text-white">{totalEarned}</p>
              </div>
              <div className="bg-green-950/30 border border-green-500/20 rounded-xl p-4">
                <p className="text-xs text-green-400">Current Balance</p>
                <p className="text-2xl font-bold text-green-400">{balance.personal}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Gifting Tab — real transfer ───────────────────────────────── */}
      {tab === 'gifting' && (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-400" /> Gift Credits
            </h3>
            <p className="text-ink-400 text-sm mb-6">Transfer credits to another PropReel account by email. The recipient must have a PropReel account. Gifts are instant and non-refundable.</p>
            <div className="max-w-md space-y-4">
              <div>
                <label className="label">Recipient Email</label>
                <input className="input" placeholder="colleague@agency.co.za" value={giftEmail} onChange={e => setGiftEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Amount (credits) — you have {balance.personal}</label>
                <input type="number" className="input" min={1} max={balance.personal} value={giftAmount} onChange={e => setGiftAmount(Number(e.target.value))} />
              </div>
              <button onClick={sendGift} disabled={gifting || balance.personal < 1} className="btn btn-primary w-full">
                <Gift className="w-4 h-4" /> {gifting ? 'Sending…' : `Send Gift (${giftAmount} credits)`}
              </button>
            </div>
          </div>

          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Recent Gifts (from your ledger)</h3>
            {(() => {
              const gifts = allTransactions.filter(t => t.amount > 0 && /gift/i.test(t.description));
              if (gifts.length === 0) return <p className="text-sm text-ink-500">No gift transactions on your account yet.</p>;
              return (
                <div className="space-y-3">
                  {gifts.slice(0, 5).map((g, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <p className="text-sm text-white">{g.description}</p>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-purple-400">+{g.amount} cr</p>
                        <p className="text-xs text-ink-500">{formatDate(g.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
