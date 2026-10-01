import { docClient, TABLES, scanItems } from './db';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { addCredits } from './userService';

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
}

/** Ask the Modal worker how the abandoned job ended. null = unknown. */
async function lookupJob(kind: string | undefined, jobId: string | undefined): Promise<JobOutcome | null> {
  if (!jobId) return null;
  const path = kind === 'FLASHHEAD' ? '/flashhead_status?job_id=' : '/render_status?record_id=';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${WORKER_URL}${path}${encodeURIComponent(jobId)}`, { signal: ctrl.signal });
      if (!res.ok) return null; // 404 etc → unknown outcome
      const data = await res.json();
      return {
        status: String(data.status || ''),
        videoUrl: data.video_url || undefined,
        durationSeconds: data.duration_seconds != null ? Number(data.duration_seconds) : undefined,
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
 *   • worker says failed / unknown → record becomes FAILED and the credits
 *     recorded on the project are refunded server-side
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
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLES.PROJECTS,
        Key: { userId: p.userId, id: p.id },
        UpdateExpression: 'SET #st = :newStatus, updatedAt = :now',
        ConditionExpression: '#st = :processing',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':processing': 'PROCESSING',
          ':newStatus': completedOk ? 'READY' : 'FAILED',
          ':now': new Date().toISOString(),
        },
      }));
    } catch (e: any) {
      if (e?.name === 'ConditionalCheckFailedException') {
        result.skipped++;
        result.details.push(`${p.id}: transitioned concurrently — skipped`);
        continue;
      }
      throw e;
    }

    if (completedOk) {
      // Fill in what the client never received
      const fields: Record<string, any> = { videoUrl: job!.videoUrl, updatedAt: new Date().toISOString() };
      const extra: string[] = [];
      if (job!.durationSeconds != null) { fields.durationSeconds = job!.durationSeconds; extra.push(', durationSeconds = :dur'); }
      await docClient.send(new UpdateCommand({
        TableName: TABLES.PROJECTS,
        Key: { userId: p.userId, id: p.id },
        UpdateExpression: `SET videoUrl = :url, updatedAt = :now${extra.join('')}`,
        ExpressionAttributeValues: {
          ':url': job!.videoUrl,
          ':now': new Date().toISOString(),
          ...(job!.durationSeconds != null ? { ':dur': job!.durationSeconds } : {}),
        },
      }));
      result.completedJobs++;
      result.details.push(`${p.id}: job ${p.jobId} had completed — finalized READY with URL, no refund`);
    } else {
      const amount = Math.max(0, Number(p.creditsSpent) || 0);
      if (amount > 0 && p.userId) {
        const refund = await addCredits(
          p.userId,
          amount,
          'refund',
          `Refund — abandoned ${p.kind === 'FLASHHEAD' ? 'Talking Head' : 'video'} render`,
          { kind: 'reaper', projectId: p.id }
        );
        if (refund.success) {
          result.refundedJobs++;
          result.details.push(`${p.id}: refunded ${amount} credits to ${p.userId} (job ${p.jobId || 'unknown'} ${job ? `ended '${job.status}'` : 'not found'})`);
        } else {
          result.details.push(`${p.id}: refund of ${amount} credits FAILED for ${p.userId} (newBalance ${refund.newBalance})`);
        }
      } else {
        result.details.push(`${p.id}: marked FAILED — no credits recorded to refund`);
      }
    }
  }

  return result;
}
