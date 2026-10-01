import { useCallback, useEffect, useRef, useState } from 'react';

export interface RenderProgress {
  active: boolean;
  elapsedSeconds: number;
  /** 0–99 while running (asymptotic against the typical duration) */
  percent: number;
  /** "2m 14s" */
  elapsedLabel: string;
  /** "~5 min" */
  typicalLabel: string;
  /** elapsed exceeds 1.2× the typical duration */
  slowerThanUsual: boolean;
  start: () => void;
  stop: () => void;
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/**
 * Realistic progress for long renders. The true percent is unknowable from a
 * polling client, so we track real elapsed time and ease an asymptotic curve
 * against a typical duration (63% at 1×, ~86% at 2×, ~95% at 3×) — the bar
 * always moves, never jumps to 100, and flags when the render is slower than
 * usual instead of lying.
 */
export function useRenderProgress(typicalSeconds: number): RenderProgress {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    timer.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [startedAt]);

  const start = useCallback(() => {
    setStartedAt(Date.now());
    setNow(Date.now());
  }, []);
  const stop = useCallback(() => setStartedAt(null), []);

  const elapsedSeconds = startedAt === null ? 0 : Math.max(0, (now - startedAt) / 1000);
  const T = Math.max(5, typicalSeconds);
  const percent = startedAt === null ? 0 : Math.min(99, Math.round(100 * (1 - Math.exp(-elapsedSeconds / T))));

  return {
    active: startedAt !== null,
    elapsedSeconds,
    percent,
    elapsedLabel: fmtDuration(elapsedSeconds),
    typicalLabel: `~${fmtDuration(T)}`,
    slowerThanUsual: elapsedSeconds > T * 1.2,
    start,
    stop,
  };
}

/** Typical Talking Head render time, scaled by script length (measured: 20 words ≈ 5 min). */
export function typicalFlashheadSeconds(scriptWords: number): number {
  return Math.min(720, Math.max(240, 210 + Math.max(0, scriptWords) * 5));
}

/** Typical video reel render time, scaled by the number of clips being generated. */
export function typicalVideoSeconds(imageCount: number): number {
  return Math.min(600, Math.max(180, 150 + Math.max(1, imageCount) * 75));
}

/** Typical FLUX image edit time. */
export const TYPICAL_IMAGE_EDIT_SECONDS = 30;
