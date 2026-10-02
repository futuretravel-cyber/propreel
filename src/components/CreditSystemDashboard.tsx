import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatDate } from '../lib/utils';
import { PLANS } from '../lib/constants';
import {
  Zap, AlertTriangle, TrendingUp, CreditCard, Gift, Settings,
  Clock, ArrowUpRight, ArrowDownRight, Check, X, Sparkles,
  Crown, Shield, Plus, Minus, RefreshCw, Download
} from 'lucide-react';

export default function CreditSystemDashboard() {
  const { user, balance, lowCreditWarning, acknowledgeLowCredit, purchaseCredits, setAutoTopup, giftCredits, upgradePlan, isAdmin } = useCredit();
  const toast = useToast();
  const navigate = useNavigate();
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState(100);
  const [showAutoTopup, setShowAutoTopup] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [giftEmail, setGiftEmail] = useState('');
  const [giftAmount, setGiftAmount] = useState(50);
  const [autoTopupAuthPrompt, setAutoTopupAuthPrompt] = useState(false);

  // One-time auto-recharge setup prompt (flagged by the nightly sweep when
  // auto-topup fired with no saved card on file)
  useEffect(() => {
    if (user?.autoTopupNeedsAuth && user?.autoTopup?.enabled) setAutoTopupAuthPrompt(true);
  }, [user?.autoTopupNeedsAuth, user?.autoTopup?.enabled]);

  // ── Admin: platform-wide ledger audit ────────────────────────────────
  const [audit, setAudit] = useState<Array<{ id: string; userEmail: string | null; amount: number; type: string; description: string; createdAt: string; pool: string | null }> | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const loadAudit = useCallback(async () => {
    if (!user?.email) return;
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/users?action=admin_ledger&email=${encodeURIComponent(user.email)}&limit=100`);
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

  const allowance = user?.subscription?.planId === 'STARTER' ? 130 :
                    user?.subscription?.planId === 'PROFESSIONAL' ? 600 :
                    user?.subscription?.planId === 'PREMIUM' ? 1300 :
                    user?.subscription?.planId === 'AGENCY' ? 5000 : 0;

  const usagePercentage = allowance > 0 ? ((allowance - user!.credits) / allowance) * 100 : 0;

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

      {/* Upgrade to Pro Banner */}
      {user?.subscription?.planId !== 'PREMIUM' && user?.subscription?.planId !== 'AGENCY' && (
        <div className="card-dark p-6 bg-gradient-to-r from-purple-950/50 to-ink-900 border-purple-500/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Crown className="w-8 h-8 text-yellow-400" />
              <div>
                <h3 className="text-lg font-bold text-white">Upgrade to Premium</h3>
                <p className="text-ink-400 text-sm">Get 1,300 credits/month, fastest render queue, and priority support</p>
              </div>
            </div>
            <button onClick={() => navigate('/payment?plan=PREMIUM&cycle=MONTHLY&price=1270')} className="btn btn-primary">
              <Sparkles className="w-4 h-4" /> Upgrade Now
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => setShowTopup(true)} className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-4 text-left text-white hover:scale-[1.02] transition-transform">
          <Plus className="w-5 h-5" />
          <p className="font-semibold text-sm mt-2">Top Up Credits</p>
          <p className="text-xs text-green-200 mt-1">From R50</p>
        </button>
        <button onClick={() => setShowAutoTopup(!showAutoTopup)} className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-4 text-left text-white hover:scale-[1.02] transition-transform">
          <RefreshCw className="w-5 h-5" />
          <p className="font-semibold text-sm mt-2">Auto Top-up</p>
          <p className="text-xs text-blue-200 mt-1">{user?.autoTopup.enabled ? 'Enabled' : 'Disabled'}</p>
        </button>
        <button onClick={() => setShowGift(true)} className="bg-gradient-to-br from-pink-600 to-pink-800 rounded-xl p-4 text-left text-white hover:scale-[1.02] transition-transform">
          <Gift className="w-5 h-5" />
          <p className="font-semibold text-sm mt-2">Gift Credits</p>
          <p className="text-xs text-pink-200 mt-1">Transfer to agent</p>
        </button>
        <button onClick={() => navigate('/dashboard/billing')} className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-xl p-4 text-left text-white hover:scale-[1.02] transition-transform">
          <CreditCard className="w-5 h-5" />
          <p className="font-semibold text-sm mt-2">Billing History</p>
          <p className="text-xs text-orange-200 mt-1">View invoices</p>
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
              <p className="text-xs text-ink-500 mt-1">Amount to add when triggered (min R50)</p>
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
                <span className="text-white font-bold text-xl">{formatZar(topupAmount)}</span>
              </div>
              <p className="text-xs text-ink-500 mt-1">R1 per credit • Credits expire after 365 days</p>
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
                <CreditCard className="w-4 h-4" /> Pay {formatZar(topupAmount)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gift Credits Modal */}
      {showGift && (
        <div className="card-dark p-6 animate-fade-in">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Gift className="w-5 h-5 text-pink-400" /> Gift Credits to Team Member
          </h3>
          <div className="space-y-4">
            <div>
              <label className="label">Recipient Email</label>
              <input
                type="email"
                className="input"
                placeholder="agent@agency.co.za"
                value={giftEmail}
                onChange={e => setGiftEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Amount (credits)</label>
              <input
                type="number"
                className="input"
                value={giftAmount}
                onChange={e => setGiftAmount(Number(e.target.value))}
                min={1}
                max={user?.credits || 0}
              />
              <p className="text-xs text-ink-500 mt-1">You have {user?.credits} credits available</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowGift(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    await giftCredits(giftEmail, giftAmount);
                    toast.success(`Gifted ${giftAmount} credits to ${giftEmail}`, 'Gift Sent!');
                    setShowGift(false);
                  } catch (err: any) {
                    toast.error(err.message);
                  }
                }}
                className="btn btn-primary flex-1"
              >
                <Gift className="w-4 h-4" /> Send Gift
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
                      <td className="px-2 py-1.5 text-xs text-ink-400 max-w-[260px] truncate" title={t.description}>{t.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Credit Expiry Information */}
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-yellow-400" /> Credit Expiry Policy
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-ink-800/50 rounded-lg">
            <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Subscription Credits</p>
              <p className="text-xs text-ink-400">Unused credits roll over to next month. Expire at next renewal date.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-ink-800/50 rounded-lg">
            <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Purchased Credits</p>
              <p className="text-xs text-ink-400">Never expire as long as account is active. 365-day expiry if account inactive.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-ink-800/50 rounded-lg">
            <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Gifted Credits</p>
              <p className="text-xs text-ink-400">Follow same expiry rules as subscription credits.</p>
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
    </div>
  );
}
