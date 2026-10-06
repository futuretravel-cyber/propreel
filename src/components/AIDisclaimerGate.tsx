import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AI_DISCLAIMER_SENTENCES,
  acceptAIDisclaimer,
  clearPendingRender,
  hydrateServerAIDisclaimer,
  postAIDisclaimerAck,
  subscribeAIDisclaimerOpen,
  takePendingRender,
} from '../lib/aiDisclaimer';

/** The standing notice, verbatim — wherever the warning must stay visible. */
export function AIDisclaimerText({ className = '' }: { className?: string }) {
  return <p className={className}>{AI_DISCLAIMER_SENTENCES.join(' ')}</p>;
}

/**
 * Blocking AI-generated-content notice, mounted once at the app root.
 *
 * Render buttons call `guardAIRender(fn)` from lib/aiDisclaimer: already
 * acknowledged → the render runs untouched; otherwise this opens with the
 * render parked behind "I understand — continue", so acknowledging once both
 * satisfies the requirement and completes the click the user just made.
 * Backing out (Esc / "Not now" / backdrop) drops the queued render.
 *
 * Acknowledgements are mirrored server-side per account ({ version, timestamp })
 * so they follow the user across devices: on mount (and again whenever the
 * notice opens, to catch a sync landing mid-click) we hydrate from the account,
 * and a fresh "I understand" writes through. The server only stores the
 * version it is given — the local gate accepts it solely when that hash
 * matches the live notice, so edited text still re-prompts everywhere.
 */
export default function AIDisclaimerGate() {
  const [open, setOpen] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => subscribeAIDisclaimerOpen(pending => {
    setHasPending(pending);
    setOpen(true);
  }), []);

  // Seed this browser from the account as soon as it mounts — a device that
  // has never seen the notice skips it entirely when the account already
  // acknowledged this exact version.
  useEffect(() => { void hydrateServerAIDisclaimer(); }, []);

  const dismiss = () => {
    clearPendingRender();
    setHasPending(false);
    setOpen(false);
  };

  const accept = () => {
    acceptAIDisclaimer();
    void postAIDisclaimerAck(); // write-through — other devices inherit it
    const render = takePendingRender();
    setHasPending(false);
    setOpen(false);
    render?.();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The notice can open a beat before a hydrate started elsewhere resolves
  // (or a slow one from mount). If the account says this exact notice was
  // already acknowledged, continue instead of asking again — the render the
  // user clicked starts, just as it would have on the device they accepted on.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    hydrateServerAIDisclaimer().then(synced => {
      if (synced && !stale) accept();
    });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-disclaimer-title"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={dismiss} />
      <div className="card-dark relative w-full max-w-xl p-6 border border-amber-500/30 animate-scale-in shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </span>
          <div>
            <h2 id="ai-disclaimer-title" className="text-lg font-bold text-white">AI-generated content notice</h2>
            <p className="text-xs text-ink-400">Required before any AI render</p>
          </div>
        </div>

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 space-y-2.5">
          {AI_DISCLAIMER_SENTENCES.map(sentence => (
            <p key={sentence} className="text-sm text-amber-100 leading-relaxed">{sentence}</p>
          ))}
        </div>

        <p className="text-xs text-ink-500 mt-3">
          Acknowledged once and stored on your account with the date — every render after this, on any device you sign in on, starts without the prompt.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-5">
          <button onClick={accept} className="btn btn-primary flex-1" autoFocus>
            I understand — continue
          </button>
          <button onClick={dismiss} className="btn btn-ghost flex-1">Not now</button>
        </div>

        {hasPending && (
          <p className="text-xs text-ink-400 mt-3 text-center">
            Your render starts as soon as you acknowledge the notice.
          </p>
        )}
      </div>
    </div>
  );
}
