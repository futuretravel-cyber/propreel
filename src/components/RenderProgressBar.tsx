import type { RenderProgress } from '../lib/useRenderProgress';

interface RenderProgressBarProps {
  progress: RenderProgress;
  /** Worker-reported stage: 'queued' | 'processing' | '' (mapped by callers) */
  stage?: string;
  /** What is being rendered, e.g. "Rendering your video reel" */
  label?: string;
}

const SEGMENTS = 24;

/**
 * Honest progress for long renders: real elapsed time against a typical
 * duration on an asymptotic bar. Shows the worker stage when known and an
 * explicit "slower than usual" note instead of stalling silently.
 */
export default function RenderProgressBar({ progress, stage = '', label }: RenderProgressBarProps) {
  if (!progress.active) return null;

  const stageFloor = stage === 'processing' ? 12 : stage === 'queued' ? 5 : 0;
  const shown = Math.max(progress.percent, stageFloor);
  const litSegments = Math.round((shown / 100) * SEGMENTS);

  const title = stage === 'queued'
    ? 'Queued'
    : `${label || 'Rendering your video reel'}…`;

  const statusLine = progress.slowerThanUsual
    ? 'Taking longer than usual — still working. Large renders can stretch a few extra minutes.'
    : stage === 'queued'
      ? 'Waiting for a free render slot…'
      : `Typically ${progress.typicalLabel}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12] p-5 text-center shadow-[0_0_40px_-12px_rgba(56,189,248,0.35)]">
      <div className="mx-auto flex h-36 w-36 items-center justify-center">
        <div className="relative h-full w-full">
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const lit = i < litSegments;
            return (
              <span
                key={i}
                className="absolute inset-0"
                style={{ transform: `rotate(${i * (360 / SEGMENTS)}deg)` }}
              >
                <span
                  className="absolute left-1/2 top-0 block h-3 w-1.5 -translate-x-1/2 rounded-sm transition-colors duration-500"
                  style={{
                    background: lit ? '#e0f2fe' : 'rgba(148,163,184,0.25)',
                    boxShadow: lit ? '0 0 8px rgba(125,211,252,0.9)' : 'none',
                  }}
                />
              </span>
            );
          })}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-white">{Math.round(shown)}%</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-widest text-sky-200/70">Loading</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold text-white" aria-live="polite">{title}</p>
      <p className="mt-1 text-xs text-ink-400">{statusLine}</p>

      <div className="mt-4 flex items-center justify-between text-xs tabular-nums text-ink-400">
        <span>Elapsed <span className="text-sky-200">{progress.elapsedLabel}</span></span>
        <span>Estimate <span className="text-sky-200">{progress.typicalLabel}</span></span>
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-label="Render progress"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-300 to-white transition-all duration-1000 ease-linear"
          style={{ width: `${shown}%`, boxShadow: '0 0 12px rgba(125,211,252,0.8)' }}
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent shadow-[0_0_14px_3px_rgba(125,211,252,0.6)]"
      />
    </div>
  );
}
