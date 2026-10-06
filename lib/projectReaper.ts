import { TABLES, scanItems, updateWhere, updateItem } from './db';
import { refundDeduction } from './userService';
import { rawS3Url } from './s3Urls';
import { workerTokenHeaders } from './workerToken';

const WORKER_URL = process.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

export interface ReapResult {
  scanned: number;
  stale: number;
  /** Job actually finished after the browser left — record finalized to READY, no refund owed */
  completedJobs: number;
  /** Job failed or unknown — record marked FAILED and credits refunded */
  refundedJobs: number;
  /** Transitioned concurrently (client woke up) or skipped for another reason */
  skipped: number;
  details: string[];
}

interface JobOutcome {
  status: string;
  videoUrl?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
}

/** Ask the Modal worker how the abandoned job ended. null = unknown. */
async function lookupJob(kind: string | undefined, jobId: string | undefined): Promise<JobOutcome | null> {
  if (!jobId) return null;
  const path = kind === 'FLASHHEAD' ? '/flashhead_status?job_id=' : '/render_status?record_id=';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${WORKER_URL}${path}${encodeURIComponent(jobId)}`, { signal: ctrl.signal, headers: workerTokenHeaders() });
      if (!res.ok) return null; // 404 etc → unknown outcome
      const data = await res.json();
      return {
        status: String(data.status || ''),
        videoUrl: data.video_url || undefined,
        durationSeconds: data.duration_seconds != null ? Number(data.duration_seconds) : undefined,
        thumbnailUrl: data.thumbnail_url || undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Find projects stuck in PROCESSING (the browser died mid-render and never
 * finalized them) and reconcile:
 *   • worker says completed → record becomes READY with the video URL (the
 *     render exists in S3 — no refund owed)
 *   • worker says failed / unknown → record becomes FAILED and any real
 *     unreversed charge for that render is refunded (ledger-verified — the
 *     row's own `creditsSpent` claim is never trusted)
 *
 * Each record is claimed atomically (ConditionExpression on status) so a
 * client that wakes up at the same moment can never double-refund.
 */
export async function reapStaleProjects(maxAgeHours = 2): Promise<ReapResult> {
  const result: ReapResult = { scanned: 0, stale: 0, completedJobs: 0, refundedJobs: 0, skipped: 0, details: [] };
  const projects = await scanItems<any>(TABLES.PROJECTS, { limit: 1000 });
  const cutoff = Date.now() - maxAgeHours * 3600000;

  for (const p of projects) {
    result.scanned++;
    if (p.status !== 'PROCESSING') continue;
    const ts = Date.parse(p.updatedAt || p.createdAt || '');
    if (Number.isNaN(ts) || ts > cutoff) continue; // too fresh — a client may still be polling
    result.stale++;

    const job = await lookupJob(p.kind, p.jobId);
    const completedOk = job?.status === 'completed' && !!job.videoUrl;

    // Atomic claim: only proceed if the record is still PROCESSING
    const claimed = await updateWhere(
      TABLES.PROJECTS,
      { userId: p.userId, id: p.id },
      { status: completedOk ? 'READY' : 'FAILED', updatedAt: new Date().toISOString() },
      { attrEquals: { status: 'PROCESSING' } }
    );
    if (!claimed) {
      result.skipped++;
      result.details.push(`${p.id}: transitioned concurrently — skipped`);
      continue;
    }

    if (completedOk) {
      // Fill in what the client never received. The worker returns
      // presigned links (private buckets, M-5) — rows keep the raw object
      // URL, because signing happens on read and a stored signature expires.
      const updates: Record<string, any> = { videoUrl: rawS3Url(job!.videoUrl) || job!.videoUrl, updatedAt: new Date().toISOString() };
      if (job!.durationSeconds != null) updates.durationSeconds = job!.durationSeconds;
      if (job!.thumbnailUrl) updates.thumbnailUrl = rawS3Url(job!.thumbnailUrl) || job!.thumbnailUrl;
      await updateItem(TABLES.PROJECTS, { userId: p.userId, id: p.id }, updates);
      result.completedJobs++;
      result.details.push(`${p.id}: job ${p.jobId} had completed — finalized READY with URL, no refund`);
    } else {
      // Refund the LEDGER, not the row: `creditsSpent` is client-written on
      // create and in the update whitelist, so trusting it here would mint
      // arbitrary credits (set status=PROCESSING + jobId=bogus +
      // creditsSpent=999999 and wait for this sweep). refundDeduction
      // reverses at most one real, unreversed charge for its actual amount —
      // an attacker with no charge gets nothing, ever.
      const scope = p.kind === 'FLASHHEAD' ? 'flashhead' : 'render';
      if (p.userId) {
        const refund = await refundDeduction(p.userId, scope);
        if (refund.success && refund.refunded > 0) {
          result.refundedJobs++;
          result.details.push(`${p.id}: refunded ${refund.refunded} credits to ${p.userId} (job ${p.jobId || 'unknown'} ${job ? `ended '${job.status}'` : 'not found'})`);
        } else if (refund.success) {
          result.details.push(`${p.id}: marked FAILED — no unreversed charge in the ledger for ${p.userId} (row claimed ${Number(p.creditsSpent) || 0}; ledger governs)`);
        } else {
          result.details.push(`${p.id}: refund FAILED for ${p.userId}: ${refund.error || 'unknown error'}`);
        }
      } else {
        result.details.push(`${p.id}: marked FAILED — no userId to refund`);
      }
    }
  }

  return result;
}
