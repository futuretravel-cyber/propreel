import { useCallback, useState } from 'react';
import { useCredit } from '../context/AuthContext';
import { track } from './analytics';
import { PropReelAPI } from './api';

const FLASHHEAD_COST = 8;
const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';
import { workerHeaders } from './workerAuth';

const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 10 * 60 * 1000; // fal FlashHead takes ~4–6 min for real scripts

type Stage = 'idle' | 'uploading' | 'deducting' | 'rendering' | 'done';

/**
 * FlashHead lip-sync pipeline (fal-ai/flashhead):
 *   1. Presigned S3 upload of the agent's profile picture
 *   2. 8-credit atomic deduction (server-side conditional decrement)
 *   3. Async Modal job (POST /flashhead → job_id, poll /flashhead_status)
 *   4. Result stored in AWS S3 by the worker; URL returned here
 *   5. Failed renders auto-refund the 8 credits
 */
export function useFlashHead() {
  const { deductCredits, addCredits, user } = useCredit() as any;
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('');

  const generate = useCallback(async (opts: {
    file: File;
    voiceoverText: string;
    voice?: string;
    stability?: number;
  }): Promise<{ videoUrl: string } | null> => {
    setError(null);

    if (!user) {
      setError('You must be signed in');
      return null;
    }
    if (!opts.voiceoverText.trim()) {
      setError('Generate or write a voiceover script first');
      return null;
    }
    if (((user as any).credits ?? 0) < FLASHHEAD_COST) {
      setError(`Not enough credits — FlashHead costs ${FLASHHEAD_COST} credits. Recharge from your dashboard.`);
      return null;
    }

    // 1) Presigned upload: profile picture → S3 (fal must be able to fetch it)
    setStage('uploading');
    let publicUrl: string;
    try {
      const contentType = opts.file.type || 'image/jpeg';
      const preRes = await fetch('/api/music?action=presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, contentType }),
      });
      if (!preRes.ok) {
        const d = await preRes.json().catch(() => ({}));
        throw new Error(d.error || 'Upload authorisation failed');
      }
      const pre = await preRes.json();
      const put = await fetch(pre.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: opts.file,
      });
      if (!put.ok) throw new Error('Profile image upload failed');
      publicUrl = pre.publicUrl;
    } catch (e: any) {
      setError(e.message || 'Upload failed');
      setStage('idle');
      return null;
    }

    // 2) Deduct 8 credits atomically
    setStage('deducting');
    const ok = await deductCredits(FLASHHEAD_COST, 'FlashHead lip-sync video', {
      kind: 'FLASHHEAD',
      voice: opts.voice || 'Aria',
    });
    if (!ok) {
      setError('Could not deduct credits — check your balance and try again');
      setStage('idle');
      return null;
    }

    // 3) Start async job + poll status
    setStage('rendering');
    setJobStatus('queued');
    // Project record id (hoisted so the failure path can mark it FAILED)
    let projectId: string | null = null;
    try {
      const submitRes = await fetch(`${MODAL_ENDPOINT}/flashhead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await workerHeaders()) },
        body: JSON.stringify({
          profile_image_url: publicUrl,
          voiceover_text: opts.voiceoverText,
          user_id: user.id,
          voice: opts.voice || 'Aria',
          stability: opts.stability ?? 0.5,
        }),
      });
      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({}));
        throw new Error(err.detail || `FlashHead submit failed (${submitRes.status})`);
      }
      const submitted = await submitRes.json();
      const jobId: string | undefined = submitted.job_id;
      if (!jobId) throw new Error('Render service did not return a job id');

      // Track in propreel-projects so Listings, search and the activity feed
      // surface it automatically (created as PROCESSING, updated on terminal).
      // jobId + creditsSpent let the nightly reaper reconcile abandoned renders.
      try {
        const project = await PropReelAPI.createProject({
          userId: user.id,
          title: `Talking Head — ${opts.voiceoverText.trim().replace(/\s+/g, ' ').slice(0, 60)}`,
          kind: 'FLASHHEAD',
          voice: opts.voice || 'Aria',
          status: 'PROCESSING',
          jobId,
          creditsSpent: FLASHHEAD_COST,
        } as any);
        projectId = project.id;
      } catch { /* non-fatal — render proceeds without the record */ }

      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const statusRes = await fetch(`${MODAL_ENDPOINT}/flashhead_status?job_id=${encodeURIComponent(jobId)}`, { headers: await workerHeaders() });
        if (!statusRes.ok) continue; // transient — retry until deadline
        const job = await statusRes.json();
        setJobStatus(String(job.status || ''));
        if (job.status === 'completed' && job.video_url) {
          if (projectId) {
            PropReelAPI.updateProject(user.id, projectId, {
              status: 'READY',
              videoUrl: job.video_url,
              ...(job.duration_seconds ? { durationSeconds: Number(job.duration_seconds) } : {}),
              ...(job.thumbnail_url ? { thumbnailUrl: String(job.thumbnail_url) } : {}),
            }).catch(() => {});
          }
          track('render_completed', { kind: 'FLASHHEAD' });
          setStage('done');
          return { videoUrl: job.video_url };
        }
        if (job.status === 'failed') {
          throw new Error(job.error || 'FlashHead render failed');
        }
      }
      throw new Error('FlashHead timed out — please try again (credits refunded)');
    } catch (e: any) {
      // Mark the project record failed (best effort) and auto-refund
      if (projectId) {
        PropReelAPI.updateProject(user.id, projectId, { status: 'FAILED' }).catch(() => {});
      }
      await addCredits(FLASHHEAD_COST, 'refund', 'Refund — failed FlashHead render').catch(() => {});
      setError(e.message || 'Render failed — your 8 credits were refunded');
      setStage('idle');
      return null;
    }
  }, [user, deductCredits, addCredits]);

  return {
    generate,
    stage,
    error,
    setError,
    jobStatus,
    busy: stage === 'uploading' || stage === 'deducting' || stage === 'rendering',
    cost: FLASHHEAD_COST,
  };
}
