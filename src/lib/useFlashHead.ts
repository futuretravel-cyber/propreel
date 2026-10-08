import { useCallback, useRef, useState } from 'react';
import { useCredit } from '../context/AuthContext';
import { track } from './analytics';
import { PropReelAPI } from './api';

import { FLASHHEAD_CREDITS as FLASHHEAD_COST } from '../../lib/renderPricing';
const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';
import { workerHeaders, jobHeaders } from './workerAuth';

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
  const { refundCredits, user, refresh } = useCredit() as any;
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('');
  // Cooperative cancel — refs (not state) so the 5s poll loop sees the flag on
  // its very next tick; `cancelling` is state purely for the button label.
  const cancelRequestedRef = useRef(false);
  const activeJobRef = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Fire the worker's cancel endpoint (same one the Studio video render uses).
  const postCancel = useCallback(async (jobId: string) => {
    try {
      await fetch(`${MODAL_ENDPOINT}/cancel_render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await workerHeaders()) },
        body: JSON.stringify({ record_id: jobId }),
      });
    } catch { /* best-effort — polling stops regardless */ }
  }, []);

  /** Stop the in-flight avatar render: the poll loop exits on its next tick,
   *  the worker aborts at its next fal poll, and generate()'s catch refunds. */
  const cancel = useCallback(() => {
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setCancelling(true);
    if (activeJobRef.current) void postCancel(activeJobRef.current);
  }, [postCancel]);

  const generate = useCallback(async (opts: {
    /** Locally picked file — presigned to S3 before the render */
    file?: File;
    /** Already-hosted image (the agent's branding photo) — skips the upload */
    imageUrl?: string;
    voiceoverText: string;
    voice?: string;
    /** BCP-47 language the narrator speaks — Narakeet native voice pair */
    language?: string;
    stability?: number;
  }): Promise<{ videoUrl: string } | null> => {
    setError(null);
    cancelRequestedRef.current = false; // the flag belongs to THIS render only
    activeJobRef.current = null;
    setCancelling(false);

    if (!user) {
      setError('You must be signed in');
      return null;
    }
    if (!opts.file && !opts.imageUrl) {
      setError('Add a profile picture first — upload one or use your branding photo');
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

    // 1) Source image → public URL the worker (and fal) can fetch.
    //    A branding photo is already hosted, so it skips the presigned upload.
    setStage('uploading');
    let publicUrl: string;
    if (opts.imageUrl) {
      publicUrl = opts.imageUrl;
    } else {
      try {
        // Presign (pinned size + type allowlist) → PUT → server-side binary
        // verification (sharp) — validation never trusts the browser alone.
        publicUrl = await PropReelAPI.uploadImageFile(user.id, opts.file!);
      } catch (e: any) {
        setError(e.message || 'Upload failed');
        setStage('idle');
        return null;
      }
    }

    // 2) Pay at mint: ?action=job_token charges the 8 credits server-side
    //    (price lives in lib/renderPricing) and returns the single-use token
    //    the worker demands before it starts an avatar job.
    setStage('deducting');
    let jobToken: Record<string, string>;
    try {
      jobToken = await jobHeaders('flashhead', {
        metadata: { kind: 'FLASHHEAD', voice: opts.voice || 'aletta', language: opts.language || 'en-ZA' },
      });
      void refresh();
    } catch (e: any) {
      setError(e?.message || 'Could not charge credits — check your balance and try again');
      setStage('idle');
      return null;
    }

    // 3) Start async job + poll status
    setStage('rendering');
    setJobStatus('queued');
    // Project record id (hoisted so the failure path can mark it FAILED)
    let projectId: string | null = null;
    let wasCancelled = false;
    try {
      const submitRes = await fetch(`${MODAL_ENDPOINT}/flashhead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...jobToken },
        body: JSON.stringify({
          profile_image_url: publicUrl,
          voiceover_text: opts.voiceoverText,
          user_id: user.id,
          voice: opts.voice || 'aletta',
          language: opts.language || 'en-ZA',
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
      activeJobRef.current = jobId;
      if (cancelRequestedRef.current) void postCancel(jobId); // cancelled during startup

      // Track in propreel-projects so Listings, search and the activity feed
      // surface it automatically (created as PROCESSING, updated on terminal).
      // jobId + creditsSpent let the nightly reaper reconcile abandoned renders.
      try {
        const project = await PropReelAPI.createProject({
          userId: user.id,
          title: `AI Avatar Video — ${opts.voiceoverText.trim().replace(/\s+/g, ' ').slice(0, 60)}`,
          kind: 'FLASHHEAD',
          voice: opts.voice || 'aletta',
          language: opts.language || 'en-ZA',
          status: 'PROCESSING',
          jobId,
          creditsSpent: FLASHHEAD_COST,
        } as any);
        projectId = project.id;
      } catch { /* non-fatal — render proceeds without the record */ }

      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        if (cancelRequestedRef.current) { wasCancelled = true; throw new Error('Render cancelled'); }
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
        if (job.status === 'cancelled') { wasCancelled = true; throw new Error('Render cancelled'); }
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
      await refundCredits('flashhead').catch(() => {});
      setError(wasCancelled ? 'Render cancelled — your 8 credits were refunded.' : (e.message || 'Render failed — your 8 credits were refunded'));
      setStage('idle');
      return null;
    }
  }, [user, refundCredits, refresh, postCancel]);

  return {
    generate,
    stage,
    error,
    setError,
    jobStatus,
    cancel,
    cancelling,
    busy: stage === 'uploading' || stage === 'deducting' || stage === 'rendering',
    cost: FLASHHEAD_COST,
  };
}
