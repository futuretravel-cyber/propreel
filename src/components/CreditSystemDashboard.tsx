import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BillingSkeleton } from './Skeleton';

// Billing (invoices, transaction history, bundles) lives inside Credits now
// as its own sub-tab — one fewer sidebar entry.
const EnhancedBilling = lazy(() => import('./EnhancedBilling'));
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatDate } from '../lib/utils';
import { useActivity } from '../lib/useActivity';
import { PLANS, CREDIT_PACK_RAND } from '../lib/constants';
import { CREDIT_EXPIRY_RULE, CREDIT_ROLLOVER_RULE, CREDIT_CANCEL_RULE, CREDIT_SPEND_RULE } from '../../lib/creditPolicy';
import {
  Zap, AlertTriangle, TrendingUp, CreditCard, Gift, Settings,
  Clock, ArrowUpRight, ArrowDownRight, Check, X, Sparkles,
  Crown, Shield, Plus, Minus, RefreshCw, Download
} from 'lucide-react';

// Premium's monthly credit count — read from PLANS so marketing strings can
// never drift from the ladder again (they were hardcoded "1,300" until
// 2026-10-21).
const PREMIUM_CREDITS = PLANS.find(pl => pl.id === 'PREMIUM')?.monthlyCredits ?? 0;
/** The plan's real monthly allowance. This used to be a hardcoded map
 *  (115/600/1300/5000) that had drifted from PLANS (110/520/1150/4300), so
 *  every progress bar and "x / N monthly allowance" was wrong. */
const planAllowance = (planId?: string | null) =>
  PLANS.find(pl => pl.id === planId)?.monthlyCredits ?? 0;

export default function CreditSystemDashboard() {
  const { user, balance, lowCreditWarning, acknowledgeLowCredit, setAutoTopup, upgradePlan, isAdmin } = useCredit();
  const toast = useToast();
  const navigate = useNavigate();
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState(100);
  const [showAutoTopup, setShowAutoTopup] = useState(false);
  const [autoTopupAuthPrompt, setAutoTopupAuthPrompt] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  // Sub-tab in the URL (?tab=billing) so the old /dashboard/billing links and
  // the profile menu's "Go to Billing" land straight on the billing view.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'billing' ? 'billing' : 'credits';
  const setActiveTab = (t: 'credits' | 'billing') => {
    const next = new URLSearchParams(searchParams);
    if (t === 'billing') next.set('tab', 'billing');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  // One-click prorated upgrade (saved card: charged instantly; no card:
  // hosted checkout, applied automatically when payment clears)
  const handleUpgradeNow = async () => {
    if (!user || upgrading) return;
    setUpgrading(true);
    try {
      const result = await upgradePlan('PREMIUM', 'MONTHLY');
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
        return;
      }
      toast.success(
        typeof result.chargedZar === 'number'
          ? `Upgraded to Premium — R${result.chargedZar} charged, ${PREMIUM_CREDITS} credits added`
          : `Upgraded to Premium — ${PREMIUM_CREDITS} credits added`,
        'Upgrade Complete!'
      );
    } catch (err: any) {
      if (err?.message?.includes('No active subscription') || err?.message?.includes('Downgrades apply')) {
        // No active subscription — fall back to the normal checkout flow
        navigate(`/payment?plan=PREMIUM&cycle=MONTHLY&price=${PLANS.find(pl => pl.id === 'PREMIUM')?.monthlyZar ?? ''}`);
        return;
      }
      toast.error(err?.message || 'Upgrade failed — try again or use the payment page');
    } finally {
      setUpgrading(false);
    }
  };

  // One-time auto-recharge setup prompt (flagged by the nightly sweep when
  // auto-topup fired with no saved card on file)
  useEffect(() => {
    if (user?.autoTopupNeedsAuth && user?.autoTopup?.enabled) setAutoTopupAuthPrompt(true);
  }, [user?.autoTopupNeedsAuth, user?.autoTopup?.enabled]);

  // ── Admin: platform-wide ledger audit ────────────────────────────────
  const [audit, setAudit] = useState<Array<{ id: string; userEmail: string | null; amount: number; type: string; description: string; createdAt: string; pool: string | null; by: string | null }> | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const loadAudit = useCallback(async () => {
    if (!user?.email) return;
    setAuditLoading(true);
    try {
      const res = await fetch('/api/users?action=admin_ledger&limit=100');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAudit(data.transactions || []);
      else toast.error(data.error || 'Ledger load failed');
    } catch {
      toast.error('Ledger load failed');
    } finally {
      setAuditLoading(false);
    }
  }, [user?.email]);
  useEffect(() => { if (isAdmin && user?.email) loadAudit(); }, [isAdmin, user?.email, loadAudit]);

  const allowance = planAllowance(user?.subscription?.planId);

  // Credit runway — balance vs the 30-day usage pace from the activity feed.
  const { stats: activityStats } = useActivity(user?.id);
  const runwayDays = activityStats.used30d > 0
    ? Math.round((balance.total / activityStats.used30d) * 30)
    : null;
  const runwayLabel = runwayDays == null ? null
    : runwayDays < 60 ? `about ${runwayDays} days`
    : runwayDays < 365 ? `about ${Math.round(runwayDays / 7)} weeks`
    : 'over a year';

  // Low credit warning banner
  const LowCreditBanner = () => {
    if (lowCreditWarning === 'none') return null;
    
    const config = {
      info: { bg: 'bg-blue-950/60', border: 'border-blue-500/40', text: 'text-blue-300', message: 'Credits running low (below 20%)' },
      warning: { bg: 'bg-yellow-950/60', border: 'border-yellow-500/40', text: 'text-yellow-300', message: 'Low credit warning (below 10%)' },
      critical: { bg: 'bg-red-950/60', border: 'border-red-500/40', text: 'text-red-300', message: 'Critical: Less than 5% credits remaining!' },
    }[lowCreditWarning];

    return (
      <div className={`${config.bg} border ${config.border} rounded-xl p-4 flex items-center justify-between animate-fade-in mb-6`}>
        <div className="flex items-center gap-3">
          <AlertTriangle className={`w-5 h-5 ${config.text}`} />
          <div>
            <p className={`font-semibold text-sm ${config.text}`}>{config.message}</p>
            <p className="text-xs text-ink-400">{user?.credits} credits remaining • Auto-topup {user?.autoTopup.enabled ? 'enabled' : 'disabled'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTopup(true)} className="btn btn-primary text-xs py-2 px-4">Recharge Now</button>
          <button onClick={acknowledgeLowCredit} className="btn btn-ghost text-xs py-2 px-2"><X className="w-4 h-4" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Credits / Billing sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('credits')} className={`tab-pill ${activeTab === 'credits' ? 'tab-pill-active' : ''}`}>Credits</button>
        <button onClick={() => setActiveTab('billing')} className={`tab-pill ${activeTab === 'billing' ? 'tab-pill-active' : ''}`}>Billing</button>
      </div>

      {activeTab === 'billing' ? (
        /* A crash inside billing (bad invoice row, malformed Paystack payload)
           must not blank the whole page — retry lands on this card only. */
        <ErrorBoundaryWrapper>
          <Suspense fallback={<BillingSkeleton />}><EnhancedBilling /></Suspense>
        </ErrorBoundaryWrapper>
      ) : (<>
      <LowCreditBanner />

      {/* One-time auto-recharge setup prompt (nightly sweep flagged this) */}
      {autoTopupAuthPrompt && (
        <div className="card-dark p-4 border border-blue-500/40 bg-blue-950/30 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-300" />
            <div>
              <p className="text-sm font-semibold text-blue-300">Finish setting up Auto Top-up</p>
              <p className="text-xs text-ink-400">Your balance dropped below {user?.autoTopup?.threshold} credits but no card is saved yet — complete one checkout to enable automatic recharges of {user?.autoTopup?.amount} credits.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate(`/payment?topup=true&amount=${user?.autoTopupAuthAmount || 200}`)} className="btn btn-primary text-xs py-2 px-3">Save Card</button>
            <button onClick={() => setAutoTopupAuthPrompt(false)} className="btn btn-ghost text-xs py-2 px-2"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Credit Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-ink-400">Personal Credits</p>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <p className="text-4xl font-black text-white">{user?.credits || 0}</p>
          {allowance > 0 && (
            <>
              <div className="mt-3 h-2 bg-ink-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all" style={{ width: `${(user!.credits / allowance) * 100}%` }} />
              </div>
              <p className="text-xs text-ink-400 mt-2">{user?.credits} / {allowance} monthly allowance</p>
            </>
          )}
          {balance.expiringSoon > 0 && (
            <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {balance.expiringSoon} credits expire soon
            </p>
          )}
        </div>

        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-ink-400">Agency Pool</p>
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-4xl font-black text-purple-400">{balance.agency}</p>
          <p className="text-xs text-ink-400 mt-2">Shared across team members</p>
          {balance.expiringIn30Days > 0 && (
            <p className="text-xs text-ink-500 mt-2">{balance.expiringIn30Days} expiring in 30 days</p>
          )}
        </div>

        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-ink-400">Total Available</p>
            <TrendingUp className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-4xl font-black text-white">{balance.total}</p>
          <p className="text-xs text-ink-400 mt-2">Personal + Agency combined</p>
        </div>
      </div>

      {/* Upgrade to Premium banner */}
      {user?.subscription?.planId !== 'PREMIUM' && user?.subscription?.planId !== 'AGENCY' && (
        <div className="card-dark p-6 bg-gradient-to-r from-purple-950/50 to-ink-900 border-purple-500/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Crown className="w-8 h-8 text-yellow-400" />
              <div>
                <h3 className="text-lg font-bold text-white">Upgrade to Premium</h3>
                <p className="text-ink-400 text-sm">Get {PREMIUM_CREDITS} credits/month and a dedicated support line</p>
              </div>
            </div>
            <button onClick={handleUpgradeNow} disabled={upgrading} className="btn btn-primary disabled:opacity-60">
              {upgrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {upgrading ? 'Upgrading…' : 'Upgrade Now'}
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => setShowTopup(true)} className="btn btn-primary flex-col items-start gap-1 p-4 min-h-[92px]">
          <Plus className="w-5 h-5" />
          <span className="font-semibold text-sm mt-1">Top up credits</span>
          <span className="text-xs font-normal text-white/70">From R75 (50 credits)</span>
        </button>
        <button onClick={() => setShowAutoTopup(!showAutoTopup)} className="btn btn-secondary flex-col items-start gap-1 p-4 min-h-[92px]">
          <RefreshCw className="w-5 h-5 text-purple-300" />
          <span className="font-semibold text-sm mt-1">Auto top-up</span>
          <span className="text-xs font-normal text-ink-400">{user?.autoTopup.enabled ? 'Enabled' : 'Disabled'}</span>
        </button>
        <button onClick={() => navigate('/dashboard/credits?tab=billing&btab=gifting')} className="btn btn-secondary flex-col items-start gap-1 p-4 min-h-[92px]">
          <Gift className="w-5 h-5 text-purple-300" />
          <span className="font-semibold text-sm mt-1">Gift credits</span>
          <span className="text-xs font-normal text-ink-400">Transfer to an agent</span>
        </button>
        <button onClick={() => setActiveTab('billing')} className="btn btn-secondary flex-col items-start gap-1 p-4 min-h-[92px]">
          <CreditCard className="w-5 h-5 text-purple-300" />
          <span className="font-semibold text-sm mt-1">Billing history</span>
          <span className="text-xs font-normal text-ink-400">Invoices & payments</span>
        </button>
      </div>

      {/* Auto Top-up Configuration */}
      {showAutoTopup && (
        <div className="card-dark p-6 animate-fade-in">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" /> Auto Top-up Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Enable Auto Top-up</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAutoTopup({ ...user!.autoTopup, enabled: !user!.autoTopup.enabled })}
                  className={`relative w-12 h-6 rounded-full transition ${user?.autoTopup.enabled ? 'bg-green-600' : 'bg-ink-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition ${user?.autoTopup.enabled ? 'left-7' : 'left-1'}`} />
                </button>
                <span className="text-sm text-ink-300">{user?.autoTopup.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
            <div>
              <label className="label">Trigger Threshold (credits)</label>
              <input
                type="number"
                className="input"
                value={user?.autoTopup.threshold || 50}
                onChange={e => setAutoTopup({ ...user!.autoTopup, threshold: Number(e.target.value) })}
                min={10}
                max={500}
              />
              <p className="text-xs text-ink-500 mt-1">Auto-topup when balance drops below this</p>
            </div>
            <div>
              <label className="label">Top-up Amount (credits)</label>
              <input
                type="number"
                className="input"
                value={user?.autoTopup.amount || 200}
                onChange={e => setAutoTopup({ ...user!.autoTopup, amount: Number(e.target.value) })}
                min={50}
                max={1000}
              />
              <p className="text-xs text-ink-500 mt-1">Amount to add when triggered (minimum 50 credits)</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-blue-950/30 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300">💡 Auto top-up uses Paystack to charge your card when credits drop below the threshold. You'll receive an email notification before each charge.</p>
          </div>
        </div>
      )}

      {/* Top-up Modal */}
      {showTopup && (
        <div className="card-dark p-6 animate-fade-in">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-400" /> Top Up Credits
          </h3>
          <div className="space-y-4">
            <div>
              <label className="label">Amount (credits)</label>
              <input
                type="range"
                min={50}
                max={1000}
                step={50}
                value={topupAmount}
                onChange={e => setTopupAmount(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm mt-2">
                <span className="text-ink-400">50 credits</span>
                <span className="text-white font-bold text-lg">{topupAmount} credits</span>
                <span className="text-ink-400">1000 credits</span>
              </div>
            </div>
            <div className="bg-ink-800/50 rounded-xl p-4">
              <div className="flex justify-between text-sm">
                <span className="text-ink-400">Price</span>
                <span className="text-white font-bold text-xl">{formatZar(topupAmount * CREDIT_PACK_RAND)}</span>
              </div>
              <p className="text-xs text-ink-500 mt-1">
                R{CREDIT_PACK_RAND.toFixed(2)} per credit · {CREDIT_EXPIRY_RULE}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowTopup(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => {
                  navigate(`/payment?topup=true&amount=${topupAmount}`);
                  setShowTopup(false);
                }}
                className="btn btn-primary flex-1"
              >
                <CreditCard className="w-4 h-4" /> Pay {formatZar(topupAmount * CREDIT_PACK_RAND)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Admin: platform-wide ledger audit ─────────────────────── */}
      {isAdmin && (
        <div className="card-dark p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" /> Credit Ledger Audit (Admin)
            </h3>
            <button onClick={loadAudit} disabled={auditLoading} className="btn btn-secondary text-xs py-1.5 px-3">
              <RefreshCw className={`w-3 h-3 ${auditLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {!audit && auditLoading && <p className="text-sm text-ink-400">Loading ledger…</p>}
          {audit && audit.length === 0 && <p className="text-sm text-ink-400">No ledger entries found.</p>}
          {audit && audit.length > 0 && (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-900">
                  <tr className="border-b border-white/10">
                    <th className="text-left px-2 py-2 text-xs font-semibold text-ink-400 uppercase">When</th>
                    <th className="text-left px-2 py-2 text-xs font-semibold text-ink-400 uppercase">User</th>
                    <th className="text-right px-2 py-2 text-xs font-semibold text-ink-400 uppercase">Amount</th>
                    <th className="text-left px-2 py-2 text-xs font-semibold text-ink-400 uppercase">Type</th>
                    <th className="text-left px-2 py-2 text-xs font-semibold text-ink-400 uppercase">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map(t => (
                    <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-2 py-1.5 text-xs text-ink-400 whitespace-nowrap">{new Date(t.createdAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-2 py-1.5 text-xs text-ink-300 max-w-[180px] truncate" title={t.userEmail || t.id}>{t.userEmail || t.id}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${t.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</td>
                      <td className="px-2 py-1.5"><span className="badge badge-muted text-[10px]">{t.type}{t.pool === 'agency' ? ' · pool' : ''}</span></td>
                      <td className="px-2 py-1.5 text-xs text-ink-400 max-w-[260px] truncate" title={t.description}>{t.description}{t.by ? <span className="text-ink-500"> · by {t.by}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Credit runway — how long the balance lasts at the current pace */}
      {activityStats.used30d > 0 && runwayLabel && (
        <div className="card-dark p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Credit runway</p>
            <p className="text-xs text-ink-400 mt-1">
              You've used {activityStats.used30d} credits in the last 30 days — at that pace your {balance.total} credits last {runwayLabel}.
            </p>
          </div>
          {balance.expiringSoon > 0 && (
            <span className="badge badge-warning">{balance.expiringSoon} credits expire within 7 days</span>
          )}
        </div>
      )}

      {/* Credit Expiry Information — one rule, shared with the rest of the app */}
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-yellow-400" /> How credits work
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-ink-800/50 rounded-lg">
            <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Expiry</p>
              <p className="text-xs text-ink-400">{CREDIT_EXPIRY_RULE}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-ink-800/50 rounded-lg">
            <RefreshCw className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Rollover</p>
              <p className="text-xs text-ink-400">{CREDIT_ROLLOVER_RULE}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-ink-800/50 rounded-lg">
            <CreditCard className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Refunds</p>
              <p className="text-xs text-ink-400">{CREDIT_SPEND_RULE} {CREDIT_CANCEL_RULE}</p>
            </div>
          </div>
        </div>
        {user?.creditExpiries && user.creditExpiries.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-sm text-ink-400 mb-2">Your Expiring Credits:</p>
            {user.creditExpiries.map((exp, i) => {
              const daysLeft = Math.ceil((new Date(exp.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-300">{exp.amount} credits ({exp.source})</span>
                  <span className={daysLeft <= 7 ? 'text-red-400' : daysLeft <= 30 ? 'text-yellow-400' : 'text-ink-400'}>
                    expires in {daysLeft} days
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

/** Minimal local error boundary so a billing-tab crash doesn't take the
 *  whole Credits page down with it. */
class ErrorBoundaryWrapper extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="card-dark p-6 border border-red-500/30">
          <p className="text-sm text-red-300 mb-3">Billing failed to load: {this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} className="btn btn-secondary text-sm">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
