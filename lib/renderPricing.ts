/**
 * Render pricing — SINGLE SOURCE OF TRUTH for what a job costs.
 *
 * The browser used to decide prices (it called /api/credits?action=deduct
 * with an amount it chose). Job tokens move the charge into the mint
 * (POST /api/users?action=job_token), so the server prices the job itself
 * from this table: a modified client can underpay no more than it can
 * overdraw. src/lib/constants.ts re-exports TIERS, so the UI keeps reading
 * exactly the same numbers the server charges.
 *
 * Keep this module dependency-free (pure data) — it is imported by both the
 * Vite bundle and the Vercel functions.
 */

export const TIERS = [
  {
    id: 'ESSENTIAL',
    label: 'Essential',
    description: 'Local FFmpeg zoom/pan render at 1080p',
    processingType: 'local',
    resolution: '1080p',
    configurations: [
      { duration: 30, images: 6, credits: 5 },
      { duration: 60, images: 12, credits: 10 }
    ]
  },
  {
    id: 'SOCIAL',
    label: 'Social',
    description: 'AI Motion at 512p',
    processingType: 'ai',
    resolution: '512p',
    configurations: [
      { duration: 30, images: 5, credits: 30 },
      { duration: 50, images: 10, credits: 50 },
      { duration: 90, images: 15, credits: 80 }
    ]
  },
  {
    id: 'CINEMATIC',
    label: 'Cinematic',
    description: 'AI Motion at 720p',
    processingType: 'ai',
    resolution: '720p',
    configurations: [
      { duration: 30, images: 5, credits: 40 },
      { duration: 60, images: 10, credits: 70 },
      { duration: 90, images: 15, credits: 90 }
    ]
  },
  {
    id: 'PREMIUM',
    label: 'Premium',
    description: 'AI Motion 720p → 1080p upscaled',
    processingType: 'ai_upscaled',
    resolution: '1080p',
    configurations: [
      { duration: 30, images: 5, credits: 60 },
      { duration: 60, images: 10, credits: 100 },
      { duration: 90, images: 15, credits: 150 }
    ]
  },
];

/** AI Avatar (FlashHead lip-sync) — fixed price. */
export const FLASHHEAD_CREDITS = 8;
/** Preset image edit (Kontext / local HDR tone-map) — fixed price. */
export const IMAGE_EDIT_CREDITS = 2;
/** Staging/brush-mask presets: Fill Pro costs ~2x Kontext per fal call and
 *  the render is the product the agent paid for, so it prices at 4 credits
 *  (R4 at R1/credit vs ~R1.65 fal cost ~$0.10). Routed through the same
 *  'edit' scope; the mint decides by presetId. */
export const STAGING_EDIT_CREDITS = 4;
/** Preset ids that route through the masked Fill path (kept in sync with
 *  modal/image_prompts.py categories — staging + removal presets). */
export const STAGING_PRESET_IDS = [
  'luxury_modern', 'scandinavian_minimal', 'coastal_relaxed',
  'family_comfortable', 'luxury_bedroom', 'home_office', 'industrial_loft',
  'remove_all_furniture', 'remove_clutter', 'remove_personal_items',
];

export function isStagingPreset(presetId: string | undefined | null): boolean {
  return !!presetId && STAGING_PRESET_IDS.includes(presetId);
}

/** Job scopes the worker accepts a paid single-use token for. */
export type JobScope = 'render' | 'flashhead' | 'edit';

/**
 * Price one job server-side. Returns null for an unknown tier/config —
 * callers answer 400 rather than guessing (or, worse, charging 0).
 */
export function jobCredits(
  scope: string,
  args: { tier?: string; configIndex?: number; presetId?: string } = {}
): number | null {
  if (scope === 'flashhead') return FLASHHEAD_CREDITS;
  if (scope === 'edit') {
    // Brush-mask staging/removal runs Fill Pro (~2x Kontext's fal cost) and
    // is the tool agents actually pay for — price it at 4 credits. Plain
    // preset edits (twilight, sky fix, HDR tone-map…) stay at 2 credits.
    return isStagingPreset(args.presetId) ? STAGING_EDIT_CREDITS : IMAGE_EDIT_CREDITS;
  }
  if (scope === 'render') {
    const tier = TIERS.find(t => t.id === String(args.tier || '').toUpperCase());
    if (!tier) return null;
    const config = tier.configurations[Number(args.configIndex)];
    return typeof config?.credits === 'number' ? config.credits : null;
  }
  return null;
}
