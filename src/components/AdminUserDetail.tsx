import { useEffect } from 'react';
import { X } from 'lucide-react';
import { AI_NOTICE_ACK_VERSION } from '../lib/aiDisclaimer';

/**
 * Admin → Users → detail view for a single account.
 *
 * Alongside the basic profile, it surfaces the AI-generated-content notice
 * acknowledgement exactly as it stands on the user row: the recorded
 * content-versioned hash (the FNV-1a of the exact notice text that was agreed
 * to) and when it was given, compared against the live notice so an
 * acknowledgement for older wording is visible at a glance.
 */
export default function AdminUserDetail({ user, onClose }: { user: any; onClose: () => void }) {
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

  const fields: Array<[string, string]> = [
    ['Name', user.fullName || '—'],
    ['Email', user.email || '—'],
    ['Role', String(user.role || 'AGENT').toUpperCase()],
    ['Plan', user.planId || '—'],
    ['Credits', String(user.credits ?? '—')],
    ['Joined', user.createdAt ? new Date(user.createdAt).toLocaleString() : '—'],
  ];

  const chip = ackState === 'current'
    ? <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-green-500/15 text-green-300 border border-green-500/30">Current notice</span>
    : ackState === 'stale'
      ? <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">Older notice text</span>
      : <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-white/5 text-ink-400 border border-white/10">Never acknowledged</span>;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="User detail"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="card-dark relative w-full max-w-lg p-6 border border-white/10 animate-scale-in shadow-2xl">
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
