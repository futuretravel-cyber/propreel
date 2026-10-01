/**
 * Fal.ai FLUX Dev image-to-image client.
 *
 * Model: fal-ai/flux/dev/image-to-image (called via the Modal web service's
 * /edit_image endpoint, which holds FAL_KEY server-side).
 *
 * Strength/guidance come from the per-preset ranges in imagePrompts.ts
 * (e.g. Remove All Furniture 0.5–0.6, Brighten 0.2–0.3) — the prompt library
 * is the source of truth; no global clamp is applied here because presets
 * legitimately need up to 0.6 for removal tasks.
 */

const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

export interface FalEditParams {
  imageUrl: string;         // public URL or data URI accepted by Modal/Fal
  presetId: string;         // preset from imagePrompts.ts (server resolves prompt+negative)
  strength?: number;        // within the preset's min–max; server defaults to preset default
  guidanceScale?: number;
  customPrompt?: string;    // overrides the preset prompt (AI Photo Editor custom box)
}

export interface FalEditResult {
  imageUrl: string;
  presetId: string;
  strengthUsed: number;
  guidanceUsed: number;
}

export async function falEditImage(params: FalEditParams): Promise<FalEditResult> {
  const response = await fetch(`${MODAL_ENDPOINT}/edit_image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: params.imageUrl,
      preset_id: params.presetId,
      strength: params.strength,
      guidance_scale: params.guidanceScale,
      custom_prompt: params.customPrompt || undefined,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Image edit failed (${response.status})`);
  }

  const data = await response.json();
  const imageUrl = data.image_url || data.imageUrl || data.url || data.output?.image_url;
  if (!imageUrl) throw new Error('Modal returned no image URL');

  return {
    imageUrl,
    presetId: params.presetId,
    strengthUsed: data.strength_used ?? params.strength ?? 0,
    guidanceUsed: data.guidance_scale_used ?? params.guidanceScale ?? 0,
  };
}

/** Clamp a user-chosen strength into the preset's recommended range. */
export function clampToPreset(requested: number, preset: { strength: { min: number; max: number; default: number } }): number {
  return Math.min(preset.strength.max, Math.max(preset.strength.min, requested));
}
