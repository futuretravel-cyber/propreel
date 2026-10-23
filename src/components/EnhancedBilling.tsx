import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatDate, creditListZar } from '../lib/utils';
import { PLANS, TIERS, CREDIT_PACK_RAND } from '../lib/constants';
import { PropReelAPI, CreditReportData, ReferralStats } from '../lib/api';
import { BackendAPI } from '../lib/backendAPI';
import { track } from '../lib/analytics';
import { AI_DISCLAIMER_TEXT } from '../lib/aiDisclaimer';
import {
  CreditCard, Zap, Download, Search,
  Gift, Package, TrendingUp, Clock,
  Check, Star, Info, Sparkles, History, BarChart3, XCircle, Lightbulb, Copy,
  MessageCircle, Facebook, Twitter, Linkedin, Mail, Users, UserCheck,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

// ─── Real data: everything on this page comes from the credits ledger ──────

// Credit bundles (1 credit = R1,50; checkout via Paystack hosted page)
const bundles = [
  { credits: 50, price: 50, popular: false },
  { credits: 100, price: 100, popular: true },
  { credits: 250, price: 250, popular: false },
  { credits: 500, price: 500, popular: false },
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
  const [refCopied, setRefCopied] = useState(false);
  const [refStats, setRefStats] = useState<ReferralStats | null>(null);
  const [refStatsLoading, setRefStatsLoading] = useState(true);

  // Credit Cost Breakdown — derived from the canonical tier table at render
  // time, so it tracks the same TIERS the Studio picker, job_token pricing
  // and the pricing_config merge use (the hardcoded copy still showed the
  // old 40/85 prices after the 2026-10-18 tier move).
  const costEstimates = TIERS.map((t) => ({
    tier: t.label,
    credits: t.configurations[0]?.credits ?? 0,
  }));

  // Give-5-get-5 numbers: signups by link, first purchases (paid), pending payout
  useEffect(() => {
    if (!user?.id) { setRefStatsLoading(false); return; }
    let alive = true;
    PropReelAPI.referralStats(user.id)
      .then(s => { if (alive) setRefStats(s); })
      .catch(() => { /* stats are non-critical — card renders without them */ })
      .finally(() => { if (alive) setRefStatsLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  // Share targets for the referral link (WhatsApp first — it is how SA agents share)
  const refLink = user ? `${window.location.origin}/register?ref=${user.id}` : '';
  const shareMsg = 'Get 5 free credits on PropReel — AI property videos for estate agents:';
  const shareTargets: Array<{ id: string; label: string; icon: typeof Users; url: () => string }> = [
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, url: () => `https://wa.me/?text=${encodeURIComponent(`${shareMsg}\n${refLink}`)}` },
    { id: 'facebook', label: 'Facebook', icon: Facebook, url: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(refLink)}` },
    { id: 'x', label: 'X', icon: Twitter, url: () => `https://twitter.com/intent/tweet?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareMsg)}` },
    { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, url: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(refLink)}` },
    { id: 'email', label: 'Email', icon: Mail, url: () => `mailto:?subject=${encodeURIComponent('5 free credits on PropReel')}&body=${encodeURIComponent(`${shareMsg}\n\n${refLink}`)}` },
  ];
  const shareReferral = (t: typeof shareTargets[number]) => {
    track('share_clicked', { platform: `referral_${t.id}` });
    window.open(t.url(), '_blank', 'noopener,width=640,height=560');
  };

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

  // ── Trial countdown card (temporary accounts — lib/trial.ts) ─────────
  // Shown while the 7-day clock ticks (and after expiry for reactivated
  // browse-only users); disappears the moment a subscription exists because
  // createSubscription wipes every trial field server-side.
  const [upgrading, setUpgrading] = useState(false);
  const trialExpiryIso = user?.subscription?.status === 'ACTIVE' ? null : user?.trialExpiresAt || null;
  const trialMsLeft = trialExpiryIso ? Date.parse(trialExpiryIso) - Date.now() : 0;
  const trialRunning = !!trialExpiryIso && !Number.isNaN(trialMsLeft) && trialMsLeft > 0;
  const trialEndedNotice = !!trialExpiryIso && !Number.isNaN(trialMsLeft) && trialMsLeft <= 0;
  const trialDaysLeft = trialRunning ? Math.max(1, Math.ceil(trialMsLeft / 86_400_000)) : 0;
  // The plan they picked at signup — the one-click upgrade activates it.
  const trialPlanId = user?.planId && user.planId !== 'FREE' ? user.planId : 'STARTER';
  const trialPlan = PLANS.find(p => p.id === trialPlanId) || PLANS.find(p => p.id === 'STARTER')!;
  const formatExact = (iso: string) => {
    try {
      return `${new Intl.DateTimeFormat('en-ZA', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg', hour12: false,
      }).format(new Date(iso))} SAST`;
    } catch {
      return formatDate(iso);
    }
  };
  const trialUpgrade = async () => {
    if (!user || upgrading) return;
    setUpgrading(true);
    try {
      track('trial_upgrade_clicked', { plan: trialPlanId });
      const res = await BackendAPI.checkoutSubscription(user.id, trialPlanId, 'MONTHLY');
      if (res.authorization_url) { window.location.href = res.authorization_url; return; }
      if (!res.success) throw new Error(res.message || 'Subscription could not be created');
      track('trial_converted', { plan: trialPlanId });
      await refresh();
      toast.success(
        `${trialPlan.name} activated — ${res.credits_allocated} credits loaded. Your trial account is now a full account.`,
        'Welcome to PropReel!'
      );
    } catch (e: any) {
      toast.error(e.message || 'Upgrade failed — please try again');
      setUpgrading(false);
    }
  };

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
          {/* Trial countdown — exact expiry + one-click upgrade */}
          {(trialRunning || trialEndedNotice) && (
            <div className={`card-dark p-6 border ${trialEndedNotice ? 'border-amber-500/40 bg-amber-950/20' : 'border-purple-500/30 bg-purple-950/20'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Clock className={`w-5 h-5 shrink-0 mt-0.5 ${trialEndedNotice ? 'text-amber-300' : 'text-purple-300'}`} />
                  <div>
                    <h3 className="font-semibold text-white">
                      {trialEndedNotice ? 'Your free trial has ended' : 'Free trial — temporary account'}
                    </h3>
                    {trialRunning ? (
                      <p className="text-xs text-ink-400 mt-1">
                        Expires <span className="text-white font-semibold">{formatExact(trialExpiryIso!)}</span>
                        {' '}— <span className="text-purple-300 font-semibold">{trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left</span>.
                        {' '}Upgrade before then and your projects, branding and {user?.credits ?? 0} credits carry over.
                      </p>
                    ) : (
                      <p className="text-xs text-ink-400 mt-1">
                        Your projects, branding and credits are kept for 30 days — subscribe to unlock rendering and pick up exactly where you left off.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 sm:flex-col sm:items-end">
                  {trialRunning && (
                    <div className="text-center sm:text-right">
                      <p className="text-3xl font-black text-white leading-none">{trialDaysLeft}</p>
                      <p className="text-[11px] text-ink-500">day{trialDaysLeft === 1 ? '' : 's'} left</p>
                    </div>
                  )}
                  <button onClick={trialUpgrade} disabled={upgrading} className="btn btn-primary text-sm py-2 px-4 whitespace-nowrap">
                    {upgrading ? 'Activating…'
                      : trialEndedNotice ? `Subscribe — ${trialPlan.name} ${formatZar(trialPlan.monthlyZar)}/mo`
                      : `Upgrade to ${trialPlan.name} · ${formatZar(trialPlan.monthlyZar)}/mo`}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  (user!.creditExpiries || []).slice(0, 3).map((e, i) => {
                    const days = Math.ceil((new Date(e.expiresAt).getTime() - Date.now()) / 86400000);
                    return (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-white">{e.amount} credits <span className="text-xs text-ink-500">({e.source})</span></span>
                        <span className={`text-xs ${days <= 7 ? 'text-red-400' : days <= 30 ? 'text-yellow-400' : 'text-ink-400'}`}>
                          {days > 0 ? `expires in ${days} day${days === 1 ? '' : 's'}` : 'expired'} · {formatDate(e.expiresAt)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Give 5, get 5 — referral link, share buttons, stats */}
          {user && (
            <div className="card-dark p-6 border border-purple-500/30 bg-purple-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Gift className="w-4 h-4 text-purple-400" /> Give 5, get 5 — refer a colleague
                  </h3>
                  <p className="text-xs text-ink-400 mt-1">
                    Share your link: they get <span className="text-purple-300 font-semibold">5 bonus credits</span> on signup,
                    and you get <span className="text-purple-300 font-semibold">5 credits</span> the moment they make their first purchase.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={refLink}
                    onFocus={e => e.currentTarget.select()}
                    className="input text-xs w-full sm:w-72 font-mono"
                    aria-label="Your referral link"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(refLink).then(() => {
                        setRefCopied(true);
                        toast.success('Referral link copied', 'Share it!');
                        setTimeout(() => setRefCopied(false), 2500);
                      }).catch(() => toast.error('Copy failed — select the link and copy manually'));
                    }}
                    className="btn btn-primary text-sm py-2 px-4 shrink-0"
                  >
                    {refCopied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                  </button>
                </div>
              </div>

              {/* One-tap share targets */}
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
                <span className="text-xs text-ink-400 mr-1">Share your link:</span>
                {shareTargets.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => shareReferral(t)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-ink-200 hover:text-white hover:bg-white/10 transition"
                    >
                      <Icon className="w-3.5 h-3.5" /> {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Referral stats */}
              {(refStatsLoading || refStats) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <p className="text-lg font-bold text-white flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-purple-400" />
                      {refStatsLoading ? '…' : refStats!.signups}
                    </p>
                    <p className="text-[11px] text-ink-400 mt-0.5">Signups via your link</p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <p className="text-lg font-bold text-white flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-purple-400" />
                      {refStatsLoading ? '…' : refStats!.activated}
                    </p>
                    <p className="text-[11px] text-ink-400 mt-0.5">Made their first purchase</p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-purple-500/30 p-3">
                    <p className="text-lg font-bold text-purple-300 flex items-center gap-1.5">
                      <Zap className="w-4 h-4" />
                      {refStatsLoading ? '…' : `${refStats!.pendingCredits} ⚡`}
                    </p>
                    <p className="text-[11px] text-ink-400 mt-0.5">
                      Pending payout{refStats && refStats.pending > 0 ? ` — ${refStats.pending} friend${refStats.pending === 1 ? '' : 's'} yet to buy` : ''}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <p className="text-lg font-bold text-emerald-400 flex items-center gap-1.5">
                      <Zap className="w-4 h-4" />
                      {refStatsLoading ? '…' : `${refStats!.earnedCredits} ⚡`}
                    </p>
                    <p className="text-[11px] text-ink-400 mt-0.5">Earned from referrals</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment issue banner (dunning) — honest, actionable */}
          {user?.paymentFailure && (
            <div className="card-dark p-6 border border-red-500/40 bg-red-950/30">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-white text-sm">Payment failed — action needed</h3>
                  <p className="text-xs text-ink-400 mt-1">
                    Your last card charge didn't go through ({user.paymentFailure.count} attempt{user.paymentFailure.count === 1 ? '' : 's'},
                    first on {formatDate(user.paymentFailure.firstFailedAt)}). We retry your saved card automatically over the
                    next two weeks. If payment can't be collected within 21 days, the subscription is cancelled — your
                    remaining credits stay usable.
                  </p>
                </div>
                <button onClick={() => navigate('/dashboard/bundles')} className="btn btn-primary text-xs py-2 px-3 shrink-0">Update Payment</button>
              </div>
            </div>
          )}

          {/* Monthly usage summary (computed by the 1st-of-month cron) */}
          {user?.monthlySummary && (
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-1">Usage Summary — {user.monthlySummary.month}</h3>
              <p className="text-xs text-ink-500 mb-4">Generated from your credit ledger on the 1st of each month</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <div className="bg-ink-800/50 rounded-xl p-3"><p className="text-xs text-ink-400">Opened with</p><p className="text-lg font-bold text-white">{user.monthlySummary.openingBalance}</p></div>
                <div className="bg-ink-800/50 rounded-xl p-3"><p className="text-xs text-ink-400">Added</p><p className="text-lg font-bold text-green-400">+{user.monthlySummary.allocated}</p></div>
                <div className="bg-ink-800/50 rounded-xl p-3"><p className="text-xs text-ink-400">Used</p><p className="text-lg font-bold text-purple-400">−{user.monthlySummary.used}</p></div>
                <div className="bg-ink-800/50 rounded-xl p-3"><p className="text-xs text-ink-400">Expired</p><p className="text-lg font-bold text-yellow-400">−{user.monthlySummary.expired}</p></div>
                <div className="bg-ink-800/50 rounded-xl p-3"><p className="text-xs text-ink-400">Closed with</p><p className="text-lg font-bold text-white">{user.monthlySummary.closingBalance}</p></div>
              </div>
              {user.monthlySummary.subscriptionZar != null && (
                <p className="text-xs text-ink-400 mt-3">
                  Subscription: {formatZar(user.monthlySummary.subscriptionZar)} · next charge {user.monthlySummary.nextChargeDate ? formatDate(user.monthlySummary.nextChargeDate) : '—'}
                </p>
              )}
            </div>
          )}

          {/* Invoices — real PDFs generated on every payment (S3) */}
          {(user?.invoices || []).length > 0 && (
            <div className="card-dark p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Download className="w-4 h-4 text-purple-400" /> Invoices
              </h3>
              <div className="space-y-2">
                {user!.invoices!.slice().reverse().slice(0, 8).map(inv => (
                  <div key={inv.invoiceNumber} className="flex items-center justify-between bg-ink-800/50 rounded-lg px-4 py-2.5">
                    <div>
                      <p className="text-sm text-white font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-ink-500">{formatDate(inv.paidAt)} · {inv.description || 'Credit purchase'}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-white font-semibold">{formatZar(inv.amountZar)}</span>
                      {/* Streamed through our own origin (session-gated) — the
                          buckets are private, and a forwarded S3 link must never
                          outlive the invoice. */}
                      <a href={`/api/users?action=invoice_pdf&user_id=${encodeURIComponent(user!.id)}&n=${encodeURIComponent(inv.invoiceNumber)}`} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs py-1.5 px-3">
                        <Download className="w-3 h-3" /> PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Plan — real */}
          <div className="card-dark p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Current Plan</h3>
              {!user?.subscription?.planId && user?.agencyId && (
                <span className="badge badge-brand">Agency member</span>
              )}
              {plan ? (
                <span className="badge badge-brand">{plan.name}</span>
              ) : user?.agencyId ? (
                <span className="badge badge-brand">Covered by agency</span>
              ) : (
                <span className="badge badge-muted">No active plan</span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div><p className="text-ink-400">Monthly Cost</p><p className="text-white font-semibold">{plan ? `${formatZar(plan.monthlyZar)}/mo` : '—'}</p></div>
              <div><p className="text-ink-400">Credits/Month</p><p className="text-white font-semibold">{plan ? `${plan.monthlyCredits} (≈ ${creditListZar(plan.monthlyCredits)})` : '—'}</p></div>
              <div><p className="text-ink-400">Next Renewal</p><p className="text-white font-semibold">{user?.subscription?.currentPeriodEnd ? formatDate(user.subscription.currentPeriodEnd) : '—'}</p></div>
              <div><p className="text-ink-400">Status</p><p className="text-white font-semibold">{user?.subscription?.status || 'NONE'}</p></div>
            </div>
            <div className="pt-4 border-t border-white/5 flex gap-3">
              {!user?.agencyId && (
                <button onClick={() => navigate('/pricing')} className="btn btn-primary flex-1">{plan ? 'Change Plan' : 'Choose a Plan'}</button>
              )}
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
                Each AI photo edit costs 2 credits.
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
              <p className="text-xl font-bold text-white">{formatZar(credits * CREDIT_PACK_RAND)} <span className="text-sm text-ink-400 font-normal">(R{CREDIT_PACK_RAND.toFixed(2)}/credit)</span></p>
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
            <p className="text-ink-400 text-sm mb-4">Buy credits via Paystack's secure checkout. Credits land in your account immediately after payment.</p>
            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3" role="note">
              <p className="text-xs font-semibold text-amber-300 mb-1">AI-generated content notice</p>
              <p className="text-xs text-ink-400 leading-relaxed">{AI_DISCLAIMER_TEXT}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {bundles.map(b => (
                <div key={b.credits} className={`relative rounded-xl p-6 text-center transition ${b.popular ? 'bg-gradient-to-b from-purple-950/80 to-ink-900 border-2 border-purple-500/50' : 'bg-ink-800/50 border border-white/5'}`}>
                  {b.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-brand">Most Popular</div>}
                  <p className="text-3xl font-black text-white">{b.credits}</p>
                  <p className="text-sm text-ink-400">credits</p>
                  <div className="my-4">
                    <p className="text-2xl font-bold text-purple-400">{formatZar(b.price * CREDIT_PACK_RAND)}</p>
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
                    <p className="text-xs text-purple-400 mt-1">{p.monthlyCredits} credits/month ≈ {creditListZar(p.monthlyCredits)}</p>
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
