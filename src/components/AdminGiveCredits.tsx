import { useEffect, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

/**
 * Admin → Users → give-credits dialog.
 *
 * The write half of "the admin can hand a user credits": it posts to the
 * admin-session-only `POST /api/credits?action=add` (source pinned to
 * 'bonus' server-side; positive-integer amount validated there too), then
 * reports the balance the SERVER returned — never a local +N guess — so a
 * rejected grant (403, update-mode 503, bad amount) surfaces the server's
 * error instead of a false success toast. The ledger row is stamped
 * server-side with kind ADMIN_CREDIT_GRANT and the acting admin's email,
 * mirroring how the subscription editor audits itself
 * (api/subscriptions.ts → ADMIN_SUBSCRIPTION_CHANGE).
 */
export default function AdminGiveCredits({
  user,
  onClose,
  onGranted,
}: {
  user: any;
  onClose: () => void;
  onGranted?: (userId: string, newBalance: number) => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('100');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const credits = Math.floor(Number(amount));
  const valid = Number.isFinite(credits) && credits >= 1 && credits <= 1_000_000;
  const balance = Number(user?.credits ?? 0);

  const give = async () => {
    if (!valid) {
      toast.error('Enter a whole number of credits between 1 and 1,000,000');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/credits?action=add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          amount: credits,
          source: 'bonus',
          description: note.trim() || 'Admin grant',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || 'Grant failed');
        return;
      }
      toast.success(`Granted ${credits} credits — new balance ${d.new_balance}`);
      onGranted?.(user.id, Number(d.new_balance));
      onClose();
    } catch {
      toast.error('Grant failed — no response from the server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Give credits"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="card-dark relative w-full max-w-md p-6 border border-white/10 animate-scale-in shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">Give credits</h2>
            <p className="text-xs text-ink-400 truncate">{user.email} · current balance {balance}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost text-xs py-1" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-500 mb-1" htmlFor="admin-grant-amount">Credits to add</label>
            <input
              id="admin-grant-amount"
              type="number"
              min={1}
              max={1000000}
              step={1}
              className="input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
            <div className="flex gap-1 mt-2">
              {[50, 100, 500, 1000].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(String(p))}
                  className="btn btn-ghost text-xs py-1 px-2"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-ink-500">Note (recorded in the ledger)</span>
            <input
              className="input mt-1"
              maxLength={200}
              placeholder="e.g. comp for the launch event"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </label>

          {valid && (
            <p className="text-xs text-ink-400">
              Balance {balance} → <span className="text-white">{balance + credits}</span> after granting {credits} ⚡
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn btn-ghost text-xs py-1 px-3" disabled={saving}>
              Cancel
            </button>
            <button onClick={give} className="btn btn-primary text-xs py-1 px-3" disabled={saving || !valid}>
              {saving ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Giving…</>
              ) : (
                <><Check className="w-3 h-3" /> Give {valid ? credits : ''} credits</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
