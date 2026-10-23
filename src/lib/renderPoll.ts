/**
 * Shared /render_status polling for reel renders — the ONE place that
 * understands the job state machine, including the 2026-10-23 PER-CLIP
 * REVIEW gate (Option 2):
 *
 *   queued → processing → clips_ready → (per-clip /rerender_clip re-rolls,
 *   job never leaves clips_ready) → processing (/assemble_reel resume) →
 *   completed
 *
 * Both the main Video Tab and the Budget tab run their poll loops through
 * `pollRenderJob`, so the review gate behaves identically everywhere — a
 * defect discovered in one tab's flow could not survive in the other's.
 * The loop's transport/grace semantics (bounded 404 outage, bounded lost
 * contact, terminal verdicts only from response bodies) are carried over
 * verbatim from the original inline loops.
 */
import { workerHeaders } from './workerAuth';

/** One clip of a review-paused render, as /render_status serves it
 *  (S3 URLs already presigned + edge-hosted for the browser). */
export interface RenderClip {
  index: number;
  image_url?: string;
  clip_url?: string;
  /** The exact prompt this clip was generated with — re-rolls replay it. */
  prompt?: string;
  /** Set by the worker when a re-roll replaced this clip (marker.at). */
  rerendered_at?: string;
}

/** The job's re-roll marker: reservation `{index, at, done:false}` while a
 *  re-roll runs, then `{index, at, ok}` (± error) when the job resolves it. */
export interface RerenderMarker {
  index: number;
  at?: string;
  done?: boolean;
  ok?: boolean;
  error?: string;
}

export type RenderPollOutcome =
  | { kind: 'completed'; url: string; duration?: number; thumb?: string }
  /** Job paused at the review gate — clips are playable, reel NOT assembled. */
  | { kind: 'review'; clips: RenderClip[] }
  | { kind: 'cancelled' };

const POLL_INTERVAL_MS = 5000;
const DEADLINE_MS = 25 * 60 * 1000;
const UNKNOWN_GRACE_MS = 120_000;
const CONTACT_GRACE_MS = 5 * 60_000;

export interface RenderPollOptions {
  /** Worker origin, e.g. RENDER_ENDPOINT. */
  endpoint: string;
  isCancelled: () => boolean;
  /** Mirrors the old inline `setRenderStatus(...)` hook (progress bar). */
  onStatus?: (status: string) => void;
}

/**
 * Poll a render job to a verdict. Never resolves `completed` without a URL;
 * throws the original error texts on lost-contact / lost-job / failed /
 * 25-minute deadline so every caller's existing catch path (FAILED row +
 * refund + toast) keeps working unchanged.
 */
export async function pollRenderJob(
  recordId: string,
  opts: RenderPollOptions
): Promise<RenderPollOutcome> {
  const deadline = Date.now() + DEADLINE_MS;
  // A worker restart mid-job can leave the status object missing (404).
  // Tolerate a bounded outage instead of refunding on one bad tick.
  let unknownSince = 0;
  // Last time the status endpoint answered AT ALL (any HTTP response).
  // Transport failures are never terminal on their own, but lost contact
  // still needs a bound so an unreachable endpoint cannot spin to deadline.
  let lastPollOkAt = Date.now();

  while (Date.now() < deadline) {
    if (opts.isCancelled()) return { kind: 'cancelled' };
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    let pollRes: Response;
    try {
      pollRes = await fetch(
        `${opts.endpoint}/render_status?record_id=${encodeURIComponent(recordId)}`,
        {
          headers: await workerHeaders(),
          signal: AbortSignal.timeout(30_000),
        }
      );
    } catch {
      // Transport-only failure: network drop or the 30s AbortSignal timeout.
      // NEVER terminal on its own — the worker keeps rendering regardless of
      // this browser's connection; a single timed-out poll must not fail a
      // healthy render minutes before it publishes.
      if (Date.now() - lastPollOkAt > CONTACT_GRACE_MS) {
        throw new Error(
          'Lost contact with the render service while your render was still running — your credits were refunded. Please try again in a moment.'
        );
      }
      continue;
    }
    lastPollOkAt = Date.now();
    if (pollRes.status === 404) {
      if (!unknownSince) unknownSince = Date.now();
      else if (Date.now() - unknownSince > UNKNOWN_GRACE_MS) {
        throw new Error(
          'The render service lost this job before it started — your charge is being refunded. Please try again.'
        );
      }
      continue;
    }
    unknownSince = 0;
    const s = await pollRes.json();
    opts.onStatus?.(String(s.status || '').toLowerCase());
    if (s.status === 'completed' && s.video_url) {
      return {
        kind: 'completed',
        url: String(s.video_url),
        duration: s.duration_seconds ? Number(s.duration_seconds) : undefined,
        thumb: s.thumbnail_url ? String(s.thumbnail_url) : undefined,
      };
    }
    if (s.status === 'clips_ready') {
      // PER-CLIP REVIEW GATE: stop polling — the agent decides per clip
      // (re-roll) and then resumes via /assemble_reel (another pollRenderJob).
      return {
        kind: 'review',
        clips: (Array.isArray(s.clips) ? s.clips : []) as RenderClip[],
      };
    }
    if (s.status === 'cancelled') return { kind: 'cancelled' };
    if (s.status === 'failed') throw new Error(s.error || 'Render failed');
  }
  throw new Error(
    'The render did not finish within 25 minutes — your credits were refunded. Please try again from the Studio.'
  );
}

export type RerenderPollOutcome =
  /** The re-roll landed — fresh clips array from /render_status. */
  | { kind: 'done'; clips: RenderClip[] }
  /** The job resolved the re-roll with ok:false (old clip kept). */
  | { kind: 'error'; message: string }
  /** The record left clips_ready entirely (cancelled/failed/assembled). */
  | { kind: 'terminal'; status: string; error?: string };

export interface RerenderPollOptions {
  endpoint: string;
  recordId: string;
  clipIndex: number;
  /** Client's known `rerendered_at` for this clip BEFORE this re-roll —
   *  a stale marker from a previous re-roll must never count as success. */
  previousRerenderedAt?: string;
  /** fal clip gen + optional upscale. Budget: a native clip is ~40-90s, but a
   *  PREMIUM re-roll then blocks on the FlashVSR GPU upscale, whose A100
   *  container is often cold when you re-roll right after the render (the
   *  container caps at 6 and scales back after 2 idle minutes), so the real
   *  wall can reach 9-10 min: cold-start image pull + model load + queue.
   *  12 min clears that with headroom and still bounds the refund. */
  timeoutMs?: number;
}

/**
 * Watch ONE re-roll to its verdict. Bounded: a job killed by Modal (timeout,
 * OOM) never writes its marker, so the client must give up, refund the
 * re-roll charge and keep the review usable (the old clip is still there).
 * Transport blips and 404s are tolerated inside the bound — only the marker
 * and the record's leaving `clips_ready` are verdicts.
 */
export async function pollRerender(opts: RerenderPollOptions): Promise<RerenderPollOutcome> {
  const deadline = Date.now() + (opts.timeoutMs ?? 12 * 60_000);
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    let s: any;
    try {
      const res = await fetch(
        `${opts.endpoint}/render_status?record_id=${encodeURIComponent(opts.recordId)}`,
        { headers: await workerHeaders(), signal: AbortSignal.timeout(20_000) }
      );
      if (res.status === 404) continue; // bounded by the outer deadline
      s = await res.json();
    } catch {
      continue; // transport blip — bounded by the outer deadline
    }
    if (s.status === 'clips_ready') {
      const m = (s.rerender || null) as RerenderMarker | null;
      const clips = (Array.isArray(s.clips) ? s.clips : []) as RenderClip[];
      const mine = m && m.index === opts.clipIndex ? clips[opts.clipIndex] : undefined;
      if (m && m.index === opts.clipIndex && typeof m.ok === 'boolean') {
        if (m.ok) {
          const fresh = mine?.rerendered_at;
          if (fresh && fresh !== opts.previousRerenderedAt) return { kind: 'done', clips };
          // Stale ok-marker from an earlier re-roll — keep waiting for this
          // request's own verdict.
          continue;
        }
        return {
          kind: 'error',
          message: m.error
            ? `Re-roll failed: ${m.error} — your re-roll credits were refunded.`
            : 'The re-roll failed — your re-roll credits were refunded. The original clip is unchanged.',
        };
      }
      continue; // reservation (done:false) or no marker yet — still running
    }
    // The record moved on without us (cancel, failure, or an assemble from
    // another tab). The re-roll's result can no longer land in this review.
    return { kind: 'terminal', status: String(s.status || 'unknown'), error: s.error };
  }
  // Hit the budget without a verdict: the worker's re-roll job runs detached
  // (up to its own 15-min Modal timeout) and usually lands shortly after this
  // gives up — so say what's true (still running) rather than "failed", which
  // used to send agents to re-roll a clip that was about to replace itself.
  return {
    kind: 'error',
    message: 'This re-roll is taking unusually long (a Premium clip re-rolls through a GPU upscale that can cold-start). It is likely still running server-side and may land in the next few minutes — your re-roll credits were refunded; if the clip does not update, roll it again.',
  };
}
