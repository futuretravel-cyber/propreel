/**
 * Background queue for batch photo uploads.
 *
 * The upload endpoints answer 429 with a Retry-After window of up to five
 * minutes. Waiting that out inline used to pin a tab's handler — and its
 * "Uploading…" label — to the countdown for the whole window. Batches land
 * here instead: one sequential worker drains them in the background and parks
 * itself whenever the server rate-limits us, so dropping photos returns
 * straight away and the batch finishes on its own.
 *
 * Surfaces subscribe per scope — `useUploadQueue('description')` — so the
 * always-mounted Studio tabs never light each other's labels up, and finished
 * batches are published through `subscribeUploadQueueDone` so
 * <UploadQueueNotifier/> can toast them even when the tab that started them
 * unmounted while the queue was still parked on a rate-limit window.
 *
 * Single-file, user-waiting surfaces (image edit, flash head, admin music)
 * deliberately do NOT use this — they keep the inline `withRateLimitRetry`
 * wait, where a live countdown beats a background hand-off.
 */
import { useSyncExternalStore } from 'react';
import { PropReelAPI, RateLimitedError } from './api';

export interface UploadQueueState {
  /** files still to move for this scope (queued + in flight) */
  pending: number;
  /** files in every unfinished batch of this scope */
  total: number;
  /** seconds until the parked queue resumes (queue-wide), null while running */
  waiting: number | null;
}

export interface UploadBatchResult {
  id: string;
  scope: string;
  total: number;
  ok: number;
  failed: number;
  /** first few failure messages, quoted by the completion toast */
  errors: string[];
}

export interface EnqueueOptions {
  /** surfaces use their own scope so hidden tabs don't share upload labels */
  scope: string;
}

interface Batch {
  id: string;
  scope: string;
  total: number;
  ok: number;
  failed: number;
  errors: string[];
  resolve: (result: UploadBatchResult) => void;
}

interface Job {
  batch: Batch;
  userId?: string;
  file: File;
  /** times THIS job has been parked on a 429 window by the queue itself */
  parks: number;
}

const IMAGE_NAME_RE = /\.(jpe?g|png|webp|heic|avif)$/i;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** uploadImageFile already waits out one window inline; park at most twice
 *  more before declaring the batch finished-with-failures. */
const MAX_PARKS = 2;
const DONE_HISTORY = 20;

let jobs: Job[] = [];
const openBatches = new Set<Batch>();
let waiting: number | null = null;
let pumping = false;
let doneSnapshot: UploadBatchResult[] = [];
let batchSeq = 0;

const stateListeners = new Set<() => void>();
const doneListeners = new Set<() => void>();
const stateCache = new Map<string, UploadQueueState>();

/**
 * Uploaded URLs waiting for their surface to pick them up, by scope.
 *
 * Module-level on purpose: a queue that survives navigation must also hand
 * its results back across it. A per-instance `setImages(prev => …)` callback
 * dies with the component that registered it — React drops setState on an
 * unmounted fiber — which orphaned photos in S3 that the grid never showed.
 * Callers instead `drainBacklog(scope)` from an effect keyed on the queue
 * state: whoever is mounted (now or after the agent comes back) collects the
 * URLs, and `drain` emptying the buffer makes the effect idempotent.
 */
const backlog = new Map<string, string[]>();
const BACKLOG_CAP = 200;

function pushBacklog(scope: string, url: string) {
  const list = backlog.get(scope) || [];
  list.push(url);
  if (list.length > BACKLOG_CAP) list.splice(0, list.length - BACKLOG_CAP);
  backlog.set(scope, list);
}

/** Take (and clear) every URL this scope uploaded — safe to call repeatedly. */
export function drainBacklog(scope: string): string[] {
  const list = backlog.get(scope);
  if (!list || !list.length) return [];
  backlog.delete(scope);
  return list;
}

/** Batches whose completion toast has already been shown — survives a
 *  notifier remount (routes unmount DashboardLayout) without re-toasting. */
const notified = new Set<string>();

export function wasBatchNotified(id: string): boolean { return notified.has(id); }
export function markBatchNotified(id: string): void { notified.add(id); }

function emit() {
  stateListeners.forEach(listener => listener());
}

function computeState(scope: string): UploadQueueState {
  let pending = 0;
  for (const job of jobs) if (job.batch.scope === scope) pending++;
  let total = 0;
  for (const batch of openBatches) if (batch.scope === scope) total += batch.total;
  const prev = stateCache.get(scope);
  if (prev && prev.pending === pending && prev.total === total && prev.waiting === waiting) return prev;
  const next: UploadQueueState = { pending, total, waiting };
  stateCache.set(scope, next);
  return next;
}

export function subscribeUploadQueue(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => { stateListeners.delete(listener); };
}

export function getUploadQueue(scope: string): UploadQueueState {
  return computeState(scope);
}

/** React view of one surface's queue: pending/total for its labels. */
export function useUploadQueue(scope: string): UploadQueueState {
  return useSyncExternalStore(
    subscribeUploadQueue,
    () => computeState(scope),
    () => computeState(scope),
  );
}

/** Convenience for gates: is this surface's batch (or any of them) still going? */
export function useUploadPending(scope: string): boolean {
  return useUploadQueue(scope).pending > 0;
}

export function subscribeUploadQueueDone(listener: () => void): () => void {
  doneListeners.add(listener);
  return () => { doneListeners.delete(listener); };
}

export function getUploadQueueDone(): UploadBatchResult[] {
  return doneSnapshot;
}

/** Batches that finished recently — <UploadQueueNotifier/> turns new ones into toasts. */
export function useUploadQueueDone(): UploadBatchResult[] {
  return useSyncExternalStore(subscribeUploadQueueDone, getUploadQueueDone, getUploadQueueDone);
}

/**
 * Label text for an upload drop zone while its queue is busy. Order matters:
 * our own parked countdown is the honest one (the queue is not running at
 * all), then the inline wait inside the in-flight upload, then plain progress.
 */
export function uploadStatusText(state: UploadQueueState, uploadWait: number | null): string {
  if (state.pending > 0) {
    if (state.waiting != null) {
      const n = state.pending;
      return `Upload limit reached — ${n} photo${n === 1 ? '' : 's'} queued, resuming in ${state.waiting}s…`;
    }
    if (uploadWait != null) return `Upload limit reached — retrying in ${uploadWait}s…`;
    const done = Math.max(0, state.total - state.pending);
    return `Uploading ${Math.min(done + 1, state.total)} of ${state.total}…`;
  }
  return 'Uploading…';
}

function removeJob(job: Job) {
  const index = jobs.indexOf(job);
  if (index >= 0) jobs.splice(index, 1);
}

function finishBatch(batch: Batch) {
  openBatches.delete(batch);
  const result: UploadBatchResult = {
    id: batch.id,
    scope: batch.scope,
    total: batch.total,
    ok: batch.ok,
    failed: batch.failed,
    errors: batch.errors.slice(0, 3),
  };
  doneSnapshot = [...doneSnapshot, result].slice(-DONE_HISTORY);
  batch.resolve(result);
  doneListeners.forEach(listener => listener());
  emit();
}

function completeJob(batch: Batch) {
  if (batch.ok + batch.failed >= batch.total) finishBatch(batch);
  else emit();
}

function succeed(job: Job, url: string) {
  removeJob(job);
  job.batch.ok++;
  pushBacklog(job.batch.scope, url);
  completeJob(job.batch);
}

function fail(job: Job, message: string) {
  removeJob(job);
  job.batch.failed++;
  if (job.batch.errors.length < DONE_HISTORY) job.batch.errors.push(message);
  completeJob(job.batch);
}

/** Park the whole queue until the server's Retry-After window resets. */
function parkQueue(retryAfterSec: number): Promise<void> {
  return new Promise(resolve => {
    const deadline = Date.now() + (Math.min(300, Math.max(1, Math.ceil(retryAfterSec))) + 1) * 1000;
    let iv: ReturnType<typeof setInterval>;
    const tick = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      waiting = left > 0 ? left : null;
      emit();
      if (left <= 0) { clearInterval(iv); resolve(); }
    };
    iv = setInterval(tick, 1000);
    tick();
  });
}

async function runQueue() {
  try {
    while (jobs.length) {
      const job = jobs[0]; // stays at the head while parked, so order holds
      try {
        const url = await PropReelAPI.uploadImageFile(job.userId, job.file);
        succeed(job, url);
      } catch (err: any) {
        if (err instanceof RateLimitedError && job.parks < MAX_PARKS) {
          job.parks++;
          await parkQueue(err.retryAfterSec);
          continue; // same job, fresh window
        }
        fail(job, err?.message || `Upload failed for ${job.file.name}`);
      }
    }
  } finally {
    pumping = false;
    if (jobs.length) ensurePump(); // enqueued between the last check and now
  }
}

function ensurePump() {
  if (pumping) return;
  pumping = true;
  void runQueue();
}

function emptyResult(scope: string): UploadBatchResult {
  return { id: `ub_${Date.now()}_${batchSeq++}`, scope, total: 0, ok: 0, failed: 0, errors: [] };
}

/**
 * Hand a batch of photos to the background queue. Validates type + size up
 * front (failures ride along in the batch result), then uploads sequentially
 * in the background — a 429 parks the queue instead of the caller. The
 * returned promise settles when the whole batch has finished; callers use it
 * only to tidy up, never to gate the UI.
 */
export function enqueueImagesForAI(
  files: FileList | File[] | null,
  userId: string | undefined,
  max: number,
  opts: EnqueueOptions,
): Promise<UploadBatchResult> {
  const list = (files ? Array.from(files) : []).slice(0, Math.max(0, max));
  if (!list.length) return Promise.resolve(emptyResult(opts.scope));

  const valid: File[] = [];
  const errors: string[] = [];
  for (const file of list) {
    const okType = file.type.startsWith('image/') || IMAGE_NAME_RE.test(file.name);
    if (!okType) { errors.push(`${file.name} is not an image file`); continue; }
    if (file.size > MAX_IMAGE_BYTES) { errors.push(`${file.name} is over 25MB`); continue; }
    valid.push(file);
  }

  const batch: Batch = {
    id: `ub_${Date.now()}_${batchSeq++}`,
    scope: opts.scope,
    total: valid.length + errors.length,
    ok: 0,
    failed: errors.length,
    errors,
    resolve: () => {},
  };
  const settled = new Promise<UploadBatchResult>(resolve => { batch.resolve = resolve; });

  if (!valid.length) {
    // Nothing to upload — publish right away so the failures get their toast.
    finishBatch(batch);
    return settled;
  }

  openBatches.add(batch);
  for (const file of valid) jobs.push({ batch, userId, file, parks: 0 });
  emit();
  ensurePump();
  return settled;
}
