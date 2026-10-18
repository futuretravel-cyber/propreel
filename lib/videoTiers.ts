/**
 * Video tier catalog — SINGLE SOURCE OF TRUTH for what a video render costs
 * and what it produces.
 *
 * The browser used to decide prices (it called /api/credits?action=deduct
 * with an amount it chose). Job tokens move the charge into the mint
 * (POST /api/users?action=job_token), so the SERVER prices the job itself
 * from this table: a modified client can underpay no more than it can
 * overdraw. src/App.tsx and src/lib/renderPricing.ts re-export TIERS, so the
 * UI keeps reading exactly the same numbers the server charges.
 *
 * Keep this module dependency-free (pure data + pure functions) — it is
 * imported by both the Vite bundle and the Vercel functions.
 */

/** Per-photo camera metadata: the render picks the exact prompt from it. */
export interface PhotoMeta {
  roomType: 'interior' | 'exterior';
  move: 'in' | 'left' | 'right' | 'out';
}

/** fal image-to-video engine per tier. ESSENTIAL is pure-FFmpeg (no engine). */
export type VideoEngine = 'hailuo-02-standard' | 'kling-26-pro' | 'wan-25-preview';

export interface TierConfig {
  duration: number; // seconds
  images: number;   // source photos for this duration
  credits: number;  // server-priced charge
}

export interface Tier {
  id: string;
  label: string;
  description: string;
  processingType: 'local' | 'ai' | 'ai_upscaled';
  resolution: string;
  engine: VideoEngine | null; // null = local FFmpeg (Essential)
  configurations: TierConfig[];
}

/** Per-second pricing for the wan-25-preview engine ($/sec by resolution). */
const WAN_PRICE_PER_SEC: Record<string, number> = {
  '480p': 0.05,
  '720p': 0.10,
  '1080p': 0.15,
};

/**
 * Canonical tier catalog. The SAME data is mirrored in the Modal worker's
 * `TIER_CONFIGS` (modal/app_propreel_minimax.py) — the worker picks clip
 * count, canvas and assemble duration from it, while the browser + server
 * price from THIS file. Keep them identical: resolution, durations, image
 * counts and credits. (2026-10-18: the worker copy had drifted to 512p/768p
 * with 5/10/15 images — it rendered a different reel than what was charged.)
 */
export const TIERS: Tier[] = [
  {
    id: 'ESSENTIAL',
    label: 'Essential',
    description: 'Local FFmpeg zoom/pan render at 1080p',
    processingType: 'local',
    resolution: '1080p',
    engine: null,
    configurations: [
      { duration: 30, images: 6, credits: 5 },
      { duration: 60, images: 12, credits: 10 },
    ],
  },
  {
    id: 'SOCIAL',
    label: 'Social',
    // 2026-10-18: 512p → 480p. wan-25-preview is the new AI engine and its
    // cheapest tier is 480p ($0.05/s); the old Hailuo 512p tier is gone.
    description: 'AI Motion at 480p',
    processingType: 'ai',
    resolution: '480p',
    engine: 'wan-25-preview',
    configurations: [
      { duration: 30, images: 6, credits: 30 },
      { duration: 60, images: 12, credits: 60 },
      { duration: 90, images: 18, credits: 90 },
    ],
  },
  {
    id: 'CINEMATIC',
    label: 'Cinematic',
    description: 'AI Motion at 720p',
    processingType: 'ai',
    resolution: '720p',
    engine: 'wan-25-preview',
    configurations: [
      { duration: 30, images: 6, credits: 50 },
      { duration: 60, images: 12, credits: 100 },
      { duration: 90, images: 18, credits: 150 },
    ],
  },
  {
    id: 'PREMIUM',
    label: 'Premium',
    description: 'AI Motion at 1080p',
    processingType: 'ai',
    resolution: '1080p',
    engine: 'wan-25-preview',
    configurations: [
      { duration: 30, images: 6, credits: 75 },
      { duration: 60, images: 12, credits: 150 },
      { duration: 90, images: 18, credits: 225 },
    ],
  },
];

/** Source photos the render uses per duration. Drives the Voiceover Script
 *  word target (2.4 words/sec) and the AI Writer's image allotment, so a
 *  duration change flows into the word count automatically. */
export function imagesForDuration(tierId: string, duration: number): number | undefined {
  const tier = TIERS.find(t => t.id === tierId);
  return tier?.configurations.find(c => c.duration === duration)?.images;
}

/** The fal engine for a tier (null for Essential's local FFmpeg path). */
export function engineForTier(tierId: string): VideoEngine | null {
  return TIERS.find(t => t.id === tierId)?.engine ?? null;
}

/** wan-25-preview price (USD) for a clip at a resolution, in seconds. */
export function wanPricePerSecond(resolution: string): number {
  return WAN_PRICE_PER_SEC[resolution] ?? WAN_PRICE_PER_SEC['1080p'];
}

/** Find a tier's config by id + duration (server-side pricing helper). */
export function configForTierDuration(tierId: string, duration: number): TierConfig | undefined {
  return TIERS.find(t => t.id === tierId)?.configurations.find(c => c.duration === duration);
}
