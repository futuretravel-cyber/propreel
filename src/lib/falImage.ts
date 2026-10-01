/**
 * Fal.ai FLUX Dev image-to-image client.
 *
 * Implements the spec doc rules:
 *  - Endpoint: https://fal.run/fal-ai/flux/dev/image-to-image
 *  - Geometry-lock SYSTEM OVERRIDE prepended to EVERY prompt
 *  - Fixed negative prompt injected on every request
 *  - Strength clamped to 0.25–0.35 (0.25 lighting, 0.30 staging, 0.35 removal)
 *  - Result URL is returned; Modal re-hosts to S3
 *
 * Runs through the Modal web service (`/edit_image`) which holds FAL_KEY
 * server-side — the browser never sees the key.
 */

const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

// CRITICAL: prepended to every prompt (spec doc "CRITICAL" note)
export const GEOMETRY_LOCK_PREFIX =
  '[SYSTEM OVERRIDE: 100% PIXEL & GEOMETRY LOCK] Architectural preservation. Retain every original wall, brickwork, window frame, staircase, and fixture precisely.';

// CRITICAL: injected negative prompt (spec doc)
export const FAL_NEGATIVE_PROMPT =
  'text, watermarks, signatures, letters, words, blurry, distorted geometry, extra rooms, structural mutation, changing staircases, shifting windows, hallucinated built-in furniture, cupboards.';

export type FalEditCategory = 'lighting' | 'staging' | 'removal';

/** Backend clamp per category (doc: 0.25 lighting, 0.30 staging, 0.35 removal) */
export const STRENGTH_CLAMP: Record<FalEditCategory, number> = {
  lighting: 0.25,
  staging: 0.30,
  removal: 0.35,
};

export function clampStrength(requested: number, category: FalEditCategory): number {
  const cap = STRENGTH_CLAMP[category];
  // Doc: enforce strength between 0.25 and 0.35 overall
  return Math.min(0.35, Math.max(0.25, Math.min(requested, cap)));
}

export interface FalEditParams {
  imageUrl: string;
  prompt: string;
  category: FalEditCategory;
  strength?: number;
  guidanceScale?: number;
}

export interface FalEditResult {
  imageUrl: string;
  strengthUsed: number;
  promptUsed: string;
}

export async function falEditImage(params: FalEditParams): Promise<FalEditResult> {
  const strengthUsed = clampStrength(params.strength ?? STRENGTH_CLAMP[params.category], params.category);
  const promptUsed = `${GEOMETRY_LOCK_PREFIX} ${params.prompt}`;

  const response = await fetch(`${MODAL_ENDPOINT}/edit_image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: params.imageUrl,
      prompt: promptUsed,
      negative_prompt: FAL_NEGATIVE_PROMPT,
      strength: strengthUsed,
      guidance_scale: params.guidanceScale,
      model: 'fal-ai/flux/dev/image-to-image',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Fal edit failed (${response.status})`);
  }

  const data = await response.json();
  return {
    imageUrl: data.image_url || data.imageUrl || data.url,
    strengthUsed,
    promptUsed,
  };
}
