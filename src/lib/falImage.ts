/**
 * Fal.ai FLUX Dev image-to-image client (async job pattern).
 *
 * POST /edit_image → { edit_id, poll_url } immediately
 * GET  /edit_status?edit_id=… → { status: queued|processing|completed|failed, image_url?, error?,
 *                                 progress? }
 *
 * The client polls until the job reaches a terminal state, so callers keep the
 * same simple `await falEditImage(...)` contract while the browser no longer
 * holds a single long HTTP connection through fal queue times.
 *
 * `progress` is the worker's live line for the removal paths: the removal
 * gate's leftover inventory (gate), each directed sweep, the masked engine
 * passes, and the final verdict. It rides the same S3-backed record the poll
 * already fetches, so the agent sees a stubborn recliner DURING the edit
 * instead of only in the finished frame — the optional onProgress callback
 * gets every update as it lands.
 */

const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

export interface FalEditParams {
  imageUrl: string;         // public URL accepted by fal (S3 URLs in production)
  presetId: string;         // preset from imagePrompts.ts (server resolves prompt+negative)
  strength?: number;        // within the preset's min–max; server defaults to preset default
  guidanceScale?: number;
  customPrompt?: string;    // overrides the preset prompt (AI Photo Editor custom box)
  maskUrl?: string;         // brush mask (staging); triggers the Fill Pro path
}

export interface FalEditResult {
  imageUrl: string;
  presetId: string;
  strengthUsed: number;
  guidanceUsed: number;
}

/** Live edit progress written by the Modal worker (see _edit_progress). */
export interface EditProgress {
  stage?: string;         // gate | sweep | engines | composite | furnish | done
  label?: string;         // the sentence to show the agent
  leftovers?: string[];   // movable items the removal gate still sees
  pass_no?: number;       // 1-based pass / sweep number, when it has one
  of?: number;            // how many passes that stage allows
  done?: boolean;         // the removal finished (nothing left behind)
}

import { workerHeaders } from './workerAuth';

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 8 * 60 * 1000; // 8 minutes — fal queues can be long; UI shows live status

export async function falEditImage(params: FalEditParams, jobToken?: Record<string, string>, onProgress?: (progress: EditProgress) => void): Promise<FalEditResult> {
  // 1) Submit the async job — with the PAID single-use token when the caller
  //    minted one (?action=job_token). Polling below keeps using the free
  //    generic token: status reads are not jobs and must not burn a payment.
  const submitRes = await fetch(`${MODAL_ENDPOINT}/edit_image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jobToken || (await workerHeaders())) },
    body: JSON.stringify({
      image_url: params.imageUrl,
      preset_id: params.presetId,
      strength: params.strength,
      guidance_scale: params.guidanceScale,
      custom_prompt: params.customPrompt || undefined,
      mask_url: params.maskUrl || undefined,
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Image edit failed (${submitRes.status})`);
  }

  const submitted = await submitRes.json();

  // Legacy synchronous response (?wait=true style) — job already done
  if (submitted.status === 'completed' && submitted.image_url) {
    return {
      imageUrl: submitted.image_url,
      presetId: params.presetId,
      strengthUsed: submitted.strength ?? params.strength ?? 0,
      guidanceUsed: submitted.guidance_scale ?? params.guidanceScale ?? 0,
    };
  }

  const editId: string | undefined = submitted.edit_id;
  if (!editId) throw new Error('Render service did not return an edit id');

  // 2) Poll /edit_status until terminal
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${MODAL_ENDPOINT}/edit_status?edit_id=${encodeURIComponent(editId)}`, { headers: await workerHeaders() });
    if (!statusRes.ok) {
      // Transient 404/5xx right after submit — retry until deadline
      continue;
    }
    const job = await statusRes.json();

    // Live progress (removal gate verdict / sweeps). Best-effort by design: a
    // malformed or absent field must never disturb the poll loop.
    if (onProgress && job.progress && typeof job.progress === 'object') {
      onProgress(job.progress as EditProgress);
    }

    if (job.status === 'completed' && job.image_url) {
      return {
        imageUrl: job.image_url,
        presetId: params.presetId,
        strengthUsed: job.strength ?? params.strength ?? 0,
        guidanceUsed: job.guidance_scale ?? params.guidanceScale ?? 0,
      };
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'Image edit failed — your 2 credits were refunded');
    }
    // queued | processing → keep polling
  }

  throw new Error('Image edit timed out — please try again (credits refunded)');
}

/** Clamp a user-chosen strength into the preset's recommended range. */
export function clampToPreset(requested: number, preset: { strength: { min: number; max: number; default: number } }): number {
  return Math.min(preset.strength.max, Math.max(preset.strength.min, requested));
}
