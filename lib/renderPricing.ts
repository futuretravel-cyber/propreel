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
/** Preset image edit (FLUX dev) — fixed price. */
export const IMAGE_EDIT_CREDITS = 2;

/** Job scopes the worker accepts a paid single-use token for. */
export type JobScope = 'render' | 'flashhead' | 'edit';

/**
 * Price one job server-side. Returns null for an unknown tier/config —
 * callers answer 400 rather than guessing (or, worse, charging 0).
 */
export function jobCredits(
  scope: string,
  args: { tier?: string; configIndex?: number } = {}
): number | null {
  if (scope === 'flashhead') return FLASHHEAD_CREDITS;
  if (scope === 'edit') return IMAGE_EDIT_CREDITS;
  if (scope === 'render') {
    const tier = TIERS.find(t => t.id === String(args.tier || '').toUpperCase());
    if (!tier) return null;
    const config = tier.configurations[Number(args.configIndex)];
    return typeof config?.credits === 'number' ? config.credits : null;
  }
  return null;
}
