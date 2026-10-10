import { useEffect, useState } from 'react';
import { Brush, Eraser, X } from 'lucide-react';

interface MaskTutorialProps {
  photoSrc: string;      // the photo currently in the workbench
  onReplaySignal?: number; // bump to replay the animation (Help button)
  onClose?: () => void;
  /** Autoplay on mount (first entry to the tab): true → popup instead of hint */
  autoOpen?: boolean;
  /** In "hint" mode the tutorial renders the inline instruction bar with the
   *  live status + Clear mask + the "Show me how" opener; "modal" is the
   *  popup demo (also opened from the hint's button). */
  variant?: 'modal' | 'hint';
  /** hint-mode live status + Clear-mask wiring (controlled by the workbench) */
  hasStrokes?: boolean;
  onClearStrokes?: () => void;
  /** Disable Clear mask while a render is in flight */
  busy?: boolean;
}

/**
 * Mask-tutor for Virtual Staging: shows the user's current photo with an
 * animated brush trajectory that demonstrates exactly what to paint — the
 * furniture you want replaced — plus a live "before → after" promise.
 * Opens as a popup every time the tab is entered (autoOpen), shows brush
 * size, and can be replayed from the inline hint via the ✕/replay button.
 *
 * The animation is CSS-driven (a translucent purple blob follows a keyframed
 * path over the photo, leaving a fading ghost) — no canvas needed.
 */
export default function MaskTutorial({ photoSrc, onReplaySignal, onClose, hasStrokes, onClearStrokes, busy, variant = 'modal' }: MaskTutorialProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [runId, setRunId] = useState(0); // restart key for the CSS animation

  useEffect(() => {
    if (onReplaySignal !== undefined && onReplaySignal > 0) {
      setModalOpen(true);
      setRunId(r => r + 1);
    }
  }, [onReplaySignal]);

  const replay = () => setRunId(r => r + 1);
  const close = () => { setModalOpen(false); onClose?.(); };

  // Hint bar: instructions + live status + Clear mask + tutorial opener.
  // The modal body is shared — "Show me how" reopens it any time.
  if (variant === 'hint') {
    return (
      <div className="flex items-center gap-3 text-xs text-ink-400 flex-wrap">
        <Brush className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="min-w-0 flex-1">Paint over the furniture you want replaced — everything left unpainted stays in the photo.</span>
        <span className={`shrink-0 font-medium ${hasStrokes ? 'text-green-400' : 'text-amber-400'}`}>
          {hasStrokes ? 'masked ✓' : 'nothing painted yet'}
        </span>
        <button
          onClick={onClearStrokes}
          className="btn btn-ghost text-xs min-h-[32px] shrink-0"
          disabled={busy || !hasStrokes}
          aria-label="Clear mask"
        >
          <Eraser className="w-3 h-3" /> Clear mask
        </button>
        <button
          onClick={() => { setModalOpen(true); setRunId(r => r + 1); }}
          className="btn btn-ghost text-xs min-h-[32px] shrink-0"
          aria-label="Show me how"
        >
          <Brush className="w-3 h-3" /> Show me how
        </button>
        {modalOpen && (
          <ModalDemo photoSrc={photoSrc} runId={runId} onReplay={replay} onClose={close} />
        )}
      </div>
    );
  }

  // popup variant (autoplays on mount — used on tab entry)
  return <ModalDemo photoSrc={photoSrc} runId={runId} onReplay={replay} onClose={close} />;
}

/** The popup demo: animated brush over the user's photo (shared body). */
function ModalDemo({ photoSrc, runId, onReplay, onClose }: { photoSrc: string; runId: number; onReplay: () => void; onClose: () => void }) {

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="How to paint the mask">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="card-dark relative max-w-xl w-full overflow-hidden animate-scale-in" key={runId}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <Brush className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Paint what you want replaced</h3>
              <p className="text-xs text-ink-500">60-second walkthrough — uses your current photo</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-white p-2" aria-label="Close tutorial">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Animated demo over the user's photo */}
        <div className="relative bg-black">
          <img src={photoSrc} alt="" className="w-full block max-h-[42vh] object-contain" draggable={false} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Ghost of the painted area blob */}
            <div
              className="relative w-full h-full"
              style={{ animation: `maskTutorialDemo 4s ease-in-out ${runId * 0}s both` }}
            >
              {[
                /* Left blob (e.g. dining chair) */
                { top: '55%', left: '10%', delay: '0.2s' },
                /* Right blob (e.g. lounge chair) */
                { top: '48%', left: '68%', delay: '1.4s' },
              ].map((pos, i) => (
                <div
                  key={i}
                  className="absolute rounded-full bg-purple-500/40 ring-2 ring-purple-400/60"
                  style={{
                    top: pos.top, left: pos.left, width: '18%', height: '18%',
                    transform: 'translate(-50%, -50%)',
                    animation: `maskTutorialBlob 4s ease-in-out both`,
                    animationDelay: pos.delay,
                  }}
                />
              ))}
              {/* The brush cursor itself */}
              <div
                className="absolute w-3 h-3 rounded-full bg-purple-400 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                style={{ animation: `maskTutorialCursor 4s ease-in-out both`, top: '52%', left: '14%', transform: 'translate(-50%,-50%)' }}
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="p-4 space-y-2 text-sm text-ink-300">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <p><strong className="text-white">Hold and drag</strong> over each piece of furniture you want removed — chairs, tables, clutter.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
            <p>Brush size scales with your photo; wheels/finger auto-adapt.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 bg-ink-700 text-white text-xs rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
            <p><strong className="text-white">Everything you leave unpainted is locked.</strong> Only the painted area gets new furniture in your chosen style.</p>
          </div>
          <div className="flex items-start gap-2 pt-1 flex-wrap">
            <button onClick={onReplay} className="btn btn-ghost text-xs min-h-[36px]">
              <Eraser className="w-3 h-3" /> Replay
            </button>
            <span className="text-xs text-ink-500 self-center">Tip: press Clear mask to restart your paint from scratch anytime.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 pt-0">
          <button onClick={onClose} className="btn btn-primary w-full">
            Got it — start painting
          </button>
        </div>
      </div>
      <style>{`
        @keyframes maskTutorialCursor {
          0%   { top: 52%; left: 14%; opacity: 0; }
          10%  { opacity: 1; }
          40%  { top: 60%; left: 22%; }
          55%  { top: 52%; left: 78%; }
          75%  { top: 58%; left: 72%; opacity: 1; }
          100% { top: 58%; left: 72%; opacity: 0; }
        }
        @keyframes maskTutorialBlob {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.4); }
          20%  { opacity: 0; }
          30%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0.25; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes maskTutorialDemo { 0% { opacity: 0.9; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}
