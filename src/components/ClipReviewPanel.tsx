import { useState } from 'react';
import { Film, RefreshCw, X } from 'lucide-react';
import type { RenderClip } from '../lib/renderPoll';
import { budgetCameraPrompt, matchBudgetPrompt } from '../../lib/budgetVideoPrompts';
import { movesForRoomType, CAMERA_MOVE_LABEL } from '../../lib/videoPrompts';

/**
 * PER-CLIP REVIEW (Option 2 — 2026-10-23): shown on the Render step when the
 * worker pauses a finished generation at `clips_ready`, BEFORE assembly.
 *
 * The agent watches every generated clip here and decides:
 *  - re-select the clip's CAMERA MOVE (the 2026-10-23 add-on) and re-roll it
 *    — a paid, per-clip fal regeneration with the newly chosen prompt, so a
 *    clip whose motion doesn't fit can change course without re-rendering
 *    the reel;
 *  - re-roll as-is — same shot, fresh attempt (fire on furniture, invented
 *    room, …);
 *  - assemble the reviewed clips into the finished reel (free — the original
 *    render charge already paid for it);
 *  - cancel instead — the render charge refunds, same contract as cancel
 *    during generation.
 *
 * The move row only renders for clips whose prompt byte-matches the gentle
 * deck (matchBudgetPrompt), so it can never mislabel a move — and every
 * prompt the re-roll sends comes from budgetCameraPrompt, the same source
 * the render itself used.
 */
export interface ClipReviewPanelProps {
  clips: RenderClip[];
  /** Credits for one re-roll (lib/renderPricing rerenderClipCredits). */
  rerenderCredits: number | null;
  /** Index currently re-rolling, or null. */
  busyIndex: number | null;
  assembling: boolean;
  cancelling: boolean;
  /** `prompt` is the full replacement prompt when the agent reselected a
   *  camera move; omitted ⇒ the worker replays the clip's stored prompt. */
  onRerender: (index: number, prompt?: string) => void;
  onAssemble: () => void;
  onCancel: () => void;
}

export default function ClipReviewPanel({
  clips,
  rerenderCredits,
  busyIndex,
  assembling,
  cancelling,
  onRerender,
  onAssemble,
  onCancel,
}: ClipReviewPanelProps) {
  const busy = busyIndex !== null || assembling;
  // Pending move reselection per clip (unset ⇒ keep the clip's current move).
  const [pendingMoves, setPendingMoves] = useState<Partial<Record<number, string>>>({});

  const rerenderPrice = rerenderCredits != null ? ` · ${rerenderCredits}⚡` : '';

  const selectMove = (index: number, move: string) =>
    setPendingMoves(prev => ({ ...prev, [index]: move }));

  const reroll = (index: number, current: ReturnType<typeof matchBudgetPrompt>) => {
    const picked = pendingMoves[index] as CameraMoveLike | undefined;
    let prompt: string | undefined;
    if (current && picked && picked !== current.move) {
      prompt = budgetCameraPrompt(current.roomType, picked) ?? undefined;
    }
    onRerender(index, prompt);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
        <p className="text-sm text-amber-200 font-semibold flex items-center gap-2">
          <Film className="w-4 h-4 shrink-0" /> Review each clip before the final video is stitched
        </p>
        <p className="text-xs text-ink-300 mt-1">
          Watch every clip below — each is generated straight from your photo. Don't like how a clip moves? Pick a
          different camera move for it, then re-roll just that clip instead of paying for a whole new render. When
          all clips look right, create the final video: narration, music and branding are added in one pass.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {clips.map((clip, i) => {
          const found = matchBudgetPrompt(clip.prompt || '');
          const currentMove = found?.move;
          const picked = (pendingMoves[i] ?? currentMove) as CameraMoveLike | undefined;
          const switching = !!(found && picked && picked !== currentMove);
          const reRollingThis = busyIndex === i;
          const rerolled = !!clip.rerendered_at;
          return (
            <div
              key={i}
              className="rounded-xl overflow-hidden border border-white/10 bg-black flex flex-col"
            >
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                controls
                playsInline
                preload="metadata"
                src={clip.clip_url}
                aria-label={`Generated clip ${i + 1} preview`}
                className="w-full max-h-[240px] bg-black"
              />
              {found && (
                <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
                  <span className="text-[11px] text-ink-500 mr-1">Camera move</span>
                  {movesForRoomType(found.roomType).map(m => {
                    const isSelected = picked === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={busy}
                        aria-pressed={isSelected}
                        onClick={() => selectMove(i, m)}
                        className={`text-[11px] px-2 py-1 rounded-md border transition-colors disabled:opacity-40 ${
                          isSelected
                            ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
                            : 'border-white/10 text-ink-400 hover:text-ink-200 hover:border-white/25'
                        }`}
                        title={isSelected ? 'Current move for this clip' : `Re-generate this clip with a ${CAMERA_MOVE_LABEL[m].toLowerCase()} move`}
                      >
                        {CAMERA_MOVE_LABEL[m]}
                      </button>
                    );
                  })}
                  {switching && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingMoves(prev => {
                        const next = { ...prev };
                        delete next[i];
                        return next;
                      })}
                      className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-ink-500 hover:text-ink-300 disabled:opacity-40"
                      title="Keep this clip's current camera move"
                    >
                      reset
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 px-2 py-2 bg-white/[0.03]">
                <span className="text-xs text-ink-300">
                  Clip {i + 1} of {clips.length}
                  {found && <> · {CAMERA_MOVE_LABEL[currentMove!]}</>}
                  {rerolled && (
                    <span className="text-emerald-400/90"> · re-rolled</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => reroll(i, found)}
                  disabled={busy}
                  className="btn btn-ghost text-xs px-3 min-h-[32px] disabled:opacity-40 border border-white/15 hover:border-amber-400/50"
                  title={
                    switching && picked
                      ? `Generate this clip again with a ${CAMERA_MOVE_LABEL[picked].toLowerCase()} camera move — costs ${rerenderCredits ?? '?'} credits`
                      : rerenderCredits != null
                        ? `Pay ${rerenderCredits} credits to generate this clip again with the same prompt`
                        : 'Generate this clip again with the same prompt'
                  }
                >
                  {reRollingThis ? (
                    <><RefreshCw className="w-3 h-3 animate-spin" /> Re-rolling…</>
                  ) : switching && picked ? (
                    <>Re-roll as {CAMERA_MOVE_LABEL[picked]}{rerenderPrice}</>
                  ) : (
                    <>Re-roll{rerenderPrice}</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAssemble}
        disabled={busy}
        className="btn btn-primary w-full text-lg py-4"
      >
        {assembling ? (
          <><RefreshCw className="w-5 h-5 animate-spin" /> Creating final video…</>
        ) : (
          <>Create final video ({clips.length} clips)</>
        )}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="btn btn-secondary w-full min-h-[48px] text-red-300 hover:text-red-200 border border-red-500/30"
      >
        {cancelling ? (
          <><RefreshCw className="w-4 h-4 animate-spin" /> Cancelling… saving your credits</>
        ) : (
          <><X className="w-4 h-4" /> Cancel render — unused credits come back</>
        )}
      </button>

      <p className="text-xs text-ink-500 text-center">
        Nothing is stitched yet — the final video only starts once you create it.
      </p>
    </div>
  );
}

/** CameraMove without importing the type name twice — string-literal union
 *  kept local so this component stays tolerant of future deck additions. */
type CameraMoveLike = Parameters<typeof budgetCameraPrompt>[1];
