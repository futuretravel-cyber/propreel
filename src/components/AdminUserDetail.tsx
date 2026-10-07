import { useEffect, useState } from 'react';
import { X, Pencil, Check, Loader2 } from 'lucide-react';
import { AI_NOTICE_ACK_VERSION } from '../lib/aiDisclaimer';
import { PLANS } from '../lib/constants';
import { useToast } from '../context/ToastContext';

/**
 * Admin → Users → detail view for a single account.
 *
 * Two halves:
 *  - Read: profile basics plus the account's subscription exactly as it
 *    stands on the row (plan, cycle, status, period, next charge, Paystack
 *    recurrence, card on file, dunning/trial state) — fed by
 *    GET /api/users?action=list_users.
 *  - Write: the subscription editor. Admins can change any account's
 *    subscription as they see fit — grant a comp plan, switch
 *    plan/cycle/status/period, allocate the allowance, or remove it — via
 *    POST /api/subscriptions?action=admin_set_subscription (admin session
 *    required, every change audited to the credit ledger).
 *
 * Alongside that it surfaces the AI-generated-content notice acknowledgement
 * exactly as it stands on the user row: the recorded content-versioned hash
 * (the FNV-1a of the exact notice text that was agreed to) and when it was
 * given, compared against the live notice so an acknowledgement for older
 * wording is visible at a glance.
 */
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge badge-success',
  PAST_DUE: 'badge badge-warning',
  CANCELLED: 'badge badge-danger',
  DOWNGRADE_PENDING: 'badge badge-brand',
};

const STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'DOWNGRADE_PENDING'] as const;

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
const daysLeft = (iso?: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;

interface FormState {
  planId: string;
  cycle: 'MONTHLY' | 'ANNUAL';
  status: string;
  days: number;
  allocate: boolean;
  cancelPaystack: boolean;
  reason: string;
}

export default function AdminUserDetail({
  user,
  onClose,
  onUpdated,
}: {
  user: any;
  onClose: () => void;
  onUpdated?: (u: any) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    planId: '',
    cycle: 'MONTHLY',
    status: 'ACTIVE',
    days: 30,
    allocate: false,
    cancelPaystack: false,
    reason: '',
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ackVersion: string = user?.aiNoticeAckVersion || '';
  const ackAt: string = user?.aiNoticeAckAt || '';
  const ackState: 'none' | 'current' | 'stale' = !ackVersion
    ? 'none'
    : ackVersion === AI_NOTICE_ACK_VERSION ? 'current' : 'stale';

  const sub = user?.subscription || null;
  const planName = (id: string) => PLANS.find(p => p.id === id)?.name || id;
  const left = daysLeft(sub?.currentPeriodEnd);
  const hasPaystack = Boolean(sub?.paystackSubscriptionCode);

  const fields: Array<[string, string]> = [
    ['Name', user.fullName || '—'],
    ['Email', user.email || '—'],
    ['Role', String(user.role || 'AGENT').toUpperCase()],
    ['Plan', sub?.planId ? planName(sub.planId) : (user.planId && user.planId !== 'FREE' ? planName(user.planId) : '—')],
    ['Credits', String(user.credits ?? '—')],
    ['Joined', user.createdAt ? new Date(user.createdAt).toLocaleString() : '—'],
  ];

  const chip = ackState === 'current'
    ? <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-green-500/15 text-green-300 border border-green-500/30">Current notice</span>
    : ackState === 'stale'
      ? <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">Older notice text</span>
      : <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-white/5 text-ink-400 border border-white/10">Never acknowledged</span>;

  const openEdit = () => {
    const cycle: 'MONTHLY' | 'ANNUAL' = sub?.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const status = sub?.status || 'ACTIVE';
    setForm({
      planId: sub?.planId || '',
      cycle,
      status,
      days: cycle === 'ANNUAL' ? 365 : 30,
      allocate: false,
      cancelPaystack: Boolean(sub?.paystackSubscriptionCode) && (status === 'CANCELLED'),
      reason: '',
    });
    setEditing(true);
  };

  const save = async () => {
    if (!form.planId && !sub) {
      toast.error('This user has no subscription to remove');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/subscriptions?action=admin_set_subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          plan_id: form.planId || null,
          cycle: form.cycle,
          status: form.status,
          period_days: Number(form.days) || (form.cycle === 'ANNUAL' ? 365 : 30),
          allocate_credits: form.allocate,
          cancel_paystack: form.cancelPaystack,
          reason: form.reason.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || 'Subscription update failed');
        return;
      }
      if (d.paystack?.error) {
        toast.error(`Saved — but Paystack cancel failed: ${d.paystack.error}`);
      } else {
        toast.success(d.message || 'Subscription updated');
      }
      onUpdated?.({ ...user, ...(d.user || {}) });
      setEditing(false);
    } catch {
      toast.error('Subscription update failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedPlan = PLANS.find(p => p.id === form.planId);
  const removing = !form.planId;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="User detail"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="card-dark relative w-full max-w-xl p-6 border border-white/10 animate-scale-in shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">User detail</h2>
            <p className="text-xs text-ink-400">{user.email}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost text-xs py-1" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-500">{label}</dt>
              <dd className="text-sm text-white truncate">{value}</dd>
            </div>
          ))}
        </dl>

        {/* ── Subscription: view + admin override ─────────────────────── */}
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">Subscription</p>
              <span className={sub ? (STATUS_BADGE[sub.status] || 'badge badge-muted') : 'badge badge-muted'}>
                {sub ? sub.status : 'None'}
              </span>
            </div>
            {!editing && (
              <button onClick={openEdit} className="btn btn-ghost text-xs py-1">
                <Pencil className="w-3 h-3" /> Change
              </button>
            )}
          </div>

          {!editing && (sub ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-ink-500">Plan</p>
                <p className="text-sm text-white">{planName(sub.planId)} <span className="text-ink-500">({sub.cycle})</span></p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Next charge</p>
                <p className="text-sm text-white">R {sub.nextChargeAmount ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Period</p>
                <p className="text-sm text-white">
                  {fmt(sub.currentPeriodStart)} → {fmt(sub.currentPeriodEnd)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Time left</p>
                <p className={`text-sm ${left === null ? 'text-white' : left > 7 ? 'text-green-300' : left > 0 ? 'text-amber-300' : 'text-red-300'}`}>
                  {left === null ? '—' : left > 0 ? `${left} day${left === 1 ? '' : 's'}` : 'Expired'}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Paystack recurrence</p>
                <p className="text-sm text-white font-mono truncate">{sub.paystackSubscriptionCode || 'None'}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Card on file</p>
                <p className="text-sm text-white">{user.hasCard ? 'Yes' : 'No'}</p>
              </div>
              {user.paymentFailure && (
                <div>
                  <p className="text-xs text-ink-500">Dunning</p>
                  <p className="text-sm text-amber-300">{user.paymentFailure.count} failed charge{user.paymentFailure.count === 1 ? '' : 's'}</p>
                </div>
              )}
              {sub.pendingDowngrade && (
                <div>
                  <p className="text-xs text-ink-500">Pending downgrade</p>
                  <p className="text-sm text-white">{planName(sub.pendingDowngrade)}</p>
                </div>
              )}
              {user.pendingPlanUpgrade && (
                <div className="col-span-2">
                  <p className="text-xs text-ink-500">Upgrade awaiting payment</p>
                  <p className="text-sm text-white">{planName(user.pendingPlanUpgrade.toPlanId)} — R {user.pendingPlanUpgrade.chargeZar}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-400">
              No subscription.
              {user.trialExpiresAt && <> Temporary account — trial until {fmt(user.trialExpiresAt)}.</>}
              {user.trialEndedAt && <> Trial ended {fmt(user.trialEndedAt)} (sign-in locked until they subscribe or reactivate).</>}
              {!user.trialExpiresAt && !user.trialEndedAt && <> Plans are normally bought at checkout.</>}
            </p>
          ))}

          {/* ── Editor ────────────────────────────────────────────────── */}
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-ink-500">Plan</span>
                  <select
                    className="input mt-1"
                    value={form.planId}
                    onChange={e => setForm(f => ({ ...f, planId: e.target.value }))}
                  >
                    {!sub && <option value="">— No subscription —</option>}
                    {sub && <option value="">— Remove subscription —</option>}
                    {PLANS.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — R{p.monthlyZar}/mo, {p.monthlyCredits} credits</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-ink-500">Cycle</span>
                  <select
                    className="input mt-1"
                    value={form.cycle}
                    onChange={e => setForm(f => ({ ...f, cycle: e.target.value as FormState['cycle'], days: e.target.value === 'ANNUAL' ? 365 : 30 }))}
                  >
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="ANNUAL">ANNUAL</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-ink-500">Status</span>
                  <select
                    className="input mt-1"
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-ink-500">New period (days, from now)</span>
                  <input
                    type="number"
                    min={1}
                    max={730}
                    className="input mt-1"
                    value={form.days}
                    onChange={e => setForm(f => ({ ...f, days: parseInt(e.target.value, 10) || 0 }))}
                  />
                </label>
              </div>

              {removing ? (
                <p className="text-xs text-red-300">
                  This removes the subscription entirely (credits already granted stay). It does not refund Paystack — tick the box below to stop recurrence too.
                </p>
              ) : selectedPlan ? (
                <p className="text-xs text-ink-500">
                  {form.cycle === 'MONTHLY'
                    ? `R${selectedPlan.monthlyZar}/month, ${selectedPlan.monthlyCredits} credits, renews for ${form.days} days.`
                    : `R${selectedPlan.annualZar}/month billed annually, ${selectedPlan.monthlyCredits} credits, renews for ${form.days} days.`}
                </p>
              ) : null}

              {!removing && (
                <label className="flex items-center gap-2 text-xs text-white">
                  <input
                    type="checkbox"
                    checked={form.allocate}
                    onChange={e => setForm(f => ({ ...f, allocate: e.target.checked }))}
                  />
                  {selectedPlan ? `Allocate ${selectedPlan.monthlyCredits} credits now` : 'Allocate plan credits now'}
                </label>
              )}

              {hasPaystack && (
                <label className="flex items-center gap-2 text-xs text-white">
                  <input
                    type="checkbox"
                    checked={form.cancelPaystack}
                    onChange={e => setForm(f => ({ ...f, cancelPaystack: e.target.checked }))}
                  />
                  Cancel Paystack recurring billing too
                  <span className="text-ink-500">(recommended when removing or CANCELLED)</span>
                </label>
              )}

              <label className="block">
                <span className="text-xs text-ink-500">Reason (goes to the audit log)</span>
                <input
                  className="input mt-1"
                  maxLength={200}
                  placeholder="e.g. comp month for the launch event"
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="btn btn-ghost text-xs py-1 px-3" disabled={saving}>
                  Cancel
                </button>
                <button onClick={save} className="btn btn-primary text-xs py-1 px-3" disabled={saving}>
                  {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : <><Check className="w-3 h-3" /> Apply</>}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-amber-300">AI-notice acknowledgement</p>
            {chip}
          </div>

          {ackVersion ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-ink-500">Version</p>
                <p className="font-mono text-sm text-white">{ackVersion}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Acknowledged</p>
                <p className="text-sm text-white">{ackAt ? new Date(ackAt).toLocaleString() : '—'}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-400">
              No server-side acknowledgement yet — recorded the next time they accept the notice in-app.
            </p>
          )}

          <p className="text-xs text-ink-500 mt-3">
            The version is a content hash of the exact notice text agreed to — “Older notice text” means the
            wording has changed since, and they will be re-prompted on their next render.
          </p>
        </div>
      </div>
    </div>
  );
}
