import type { RenderProgress } from '../lib/useRenderProgress';

interface RenderProgressBarProps {
  progress: RenderProgress;
  /** Worker-reported stage: 'queued' | 'processing' | '' (mapped by callers) */
  stage?: string;
  /** What is being rendered, e.g. "Rendering your video reel" */
  label?: string;
}

/**
 * Honest progress for long renders: real elapsed time against a typical
 * duration on an asymptotic bar. Shows the worker stage when known and an
 * explicit "slower than usual" note instead of stalling silently.
 */
export default function RenderProgressBar({ progress, stage = '', label }: RenderProgressBarProps) {
  if (!progress.active) return null;

  const stageFloor = stage === 'processing' ? 12 : stage === 'queued' ? 5 : 0;
  const shown = Math.max(progress.percent, stageFloor);

  const statusLine = progress.slowerThanUsual
    ? 'Taking longer than usual — still working. Large renders can stretch a few extra minutes.'
    : stage === 'queued'
      ? 'Queued — waiting for a free render slot…'
      : stage === 'processing'
        ? `${label || 'Rendering'} — typically ${progress.typicalLabel}`
        : `${label || 'Rendering'}… typically ${progress.typicalLabel}`;

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        {/* Only the stage text is announced — the elapsed clock ticks every
            second and used to chatter through the wrapper's aria-live. */}
        <span className="text-purple-200 font-medium" aria-live="polite">{statusLine}</span>
        <span className="text-ink-400 tabular-nums" title={`${progress.elapsedLabel} elapsed`}>
          {progress.elapsedLabel} elapsed
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-ink-900 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-label="Render progress"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-600 to-cyan-400 transition-all duration-1000 ease-linear"
          style={{ width: `${shown}%` }}
        />
      </div>
    </div>
  );
}
