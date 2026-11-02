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

/** fal image-to-video engine per tier. ESSENTIAL is pure-FFmpeg (no engine).
 *  2026-10-21: wan-25-preview removed from the catalog — every AI tier runs
 *  MiniMax Hailuo-02 standard (kling-26-pro stays as the dormant alternate). */
export type VideoEngine = 'motion-standard' | 'motion-pro-alt';

export interface TierConfig {
  duration: number; // seconds
  images: number;   // source photos for this duration
  credits: number;  // server-priced charge
  /** fal generation resolution for THIS config. BUDGET is the only tier
   *  that varies it per config (512p / 768p — the one thing an agent picks
   *  there); every other tier's configs inherit the tier-level
   *  `resolution`. The worker mirror reads it with the same "config first,
   *  tier default after" rule. */
  resolution?: string;
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

/**
 * Canonical tier catalog. The SAME data is mirrored in the Modal worker's
 * `TIER_CONFIGS` (modal/app_propreel_minimax.py) — the worker picks clip
 * count, canvas and assemble duration from it, while the browser + server
 * price from THIS file. Keep them identical: resolution, durations, image
 * counts and credits. (2026-10-18: the worker copy had drifted to 512p/768p
 * with 5/10/15 images — it rendered a different reel than what was charged.)
 *
 * 2026-10-19: repriced as a Rand-anchored ladder at 1 credit = R1.50,
 * rounded UP to the next whole credit — Social R50/70/100 → 34/47/67,
 * Cinematic R70/90/120 → 47/60/80, Premium R90/120/150 → 60/80/100.
 * ESSENTIAL was not in the ladder and stays 5/10 (now R7.50/R15 at the
 * new credit value). Avatar is 2 credits per 10s (lib/renderPricing.ts).
 *
 * Same-day floor raise (2026-10-19): the ladder's long reels breached the
 * 40% margin floor (Social 60/90s at 24/21%, Cinematic 60/90s at 37/29%),
 * so 60/90s moved to the exact floor prices at R1.50/credit — Social
 * 60/90s → 60/89 (R90.00/R133.50), Cinematic 60/90s → 63/95
 * (R94.50/R142.50), all ≈40–41% margin. 30s prices and Premium unchanged.
 *
 * 2026-10-20: BUDGET tier — the gentle-motion rung on MiniMax Hailuo-02
 * standard (the only non-wan engine left in the catalog at the time). One
 * length only (30s from 6 photos), no voiceover, no avatar; the configs each
 * name their own fal resolution, the only tier where they do. Floor math at
 * R16.55/USD + the R0.45 assembly pass: 512p ≈ R8.89 COGS ($0.017/s × 30s),
 * 768p ≈ R22.79 COGS ($0.045/s × 30s). Launched on the floor at 10/26⚡;
 * repriced the same day on the client's call to 20⚡ (R30.00, 70.4%) and
 * 34⚡ (R51.00, 55.3%) — well clear of the floor and of the 512p-rate
 * uncertainty. See docs/pricing-cost-analysis.md.
 *
 * 2026-10-21: ENGINE UNIFICATION — wan-25-preview is gone. Its reels warped
 * geometry and invented rooms (client A/B against the Budget reels, same
 * day), so every AI tier now runs fal-ai/minimax/hailuo-02/standard/
 * image-to-video — the Budget engine — with the SAME gentle per-photo
 * prompts (lib/budgetVideoPrompts.ts; that file's text is byte-identical,
 * untouched by this change). Hailuo standard's native rungs are 512p
 * ($0.017/s) and 768p ($0.045/s), so: SOCIAL → native 512p, CINEMATIC →
 * native 768p (delivered on the 1920×1080 canvas by the assembler's lanczos
 * normalize), PREMIUM → generates 768p and the self-hosted FlashVSR
 * upscaler delivers 1080p (≈$0.048/s all-in vs $0.08/s for native-1080p
 * Hailuo Pro — and one engine across the catalog). Voiceover, avatar and
 * music are assembly-stage and unchanged. Credit prices are unchanged and
 * every AI rung's margin IMPROVES: Hailuo COGS sits below wan's at these
 * rungs ($0.017/s vs $0.05/s, $0.045/s vs $0.10/s). The worker mirror
 * (modal/app_propreel_minimax.py TIER_CONFIGS / TIER_VIDEO_ENGINE) keeps
 * the same values; run scripts/sync_pricing_config_tiers.ts after a catalog
 * change so the DB row the Studio picker reads stays in step.
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
    // 2026-10-21: back on Hailuo-02 standard at its native 512p rung
    // ($0.017/s — below the wan 480p rate it replaces).
    description: 'AI Motion at 512p',
    processingType: 'ai',
    resolution: '512p',
    engine: 'motion-standard',
    configurations: [
      { duration: 30, images: 6, credits: 34 },
      { duration: 60, images: 12, credits: 60 },
      { duration: 90, images: 18, credits: 89 },
    ],
  },
  {
    id: 'CINEMATIC',
    label: 'Cinematic',
    // 2026-10-21: Hailuo-02 standard's top native rung, 768p ($0.045/s).
    // Delivered on the standard 1920×1080 canvas via the assembler's lanczos
    // normalize — no upscale hop.
    description: 'AI Motion at 768p',
    processingType: 'ai',
    resolution: '768p',
    engine: 'motion-standard',
    configurations: [
      { duration: 30, images: 6, credits: 47 },
      { duration: 60, images: 12, credits: 63 },
      { duration: 90, images: 18, credits: 95 },
    ],
  },
  {
    id: 'PREMIUM',
    label: 'Premium',
    // 2026-10-21: Hailuo-02 standard has no 1080p rung, so the worker
    // generates 768p and the self-hosted FlashVSR upscaler delivers 1080p
    // (kill-switch FLASHVSR_UPSCALE; when off, 768p content ships on the
    // 1080p canvas — the assembler's lanczos normalize handles it).
    // ≈$0.048/s all-in vs $0.08/s for native-1080p Hailuo Pro.
    description: 'AI Motion at 1080p',
    processingType: 'ai',
    resolution: '1080p',
    engine: 'motion-standard',
    configurations: [
      { duration: 30, images: 6, credits: 60 },
      { duration: 60, images: 12, credits: 80 },
      { duration: 90, images: 18, credits: 100 },
    ],
  },
  {
    id: 'BUDGET',
    // 2026-10-20: the gentle-motion rung — MiniMax Hailuo-02 standard, the
    // engine that (2026-10-21) now serves EVERY AI tier, and the only tier
    // whose CONFIGS each name their own fal resolution (512p / 768p). One length
    // only (30s / 6 photos), no voiceover: photos + calm camera motion +
    // optional music and agent branding (both ride the same worker paths as
    // every AI tier). Rendered from its own Budget AI Video studio tab; the
    // main Video Generator picker filters this tier out. Credits repriced
    // from the 10/26 floor to 20/34 on the client's call the same day.
    label: 'Budget',
    description: 'Gentle cinematic motion, 512p or 768p — 30s from 6 photos, no voiceover',
    processingType: 'ai',
    resolution: '512p', // display fallback — the real pick is per-config below
    engine: 'motion-standard',
    configurations: [
      { duration: 30, images: 6, credits: 20, resolution: '512p' },
      { duration: 30, images: 6, credits: 34, resolution: '768p' },
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

/** Find a tier's config by id + duration (server-side pricing helper). */
export function configForTierDuration(tierId: string, duration: number): TierConfig | undefined {
  return TIERS.find(t => t.id === tierId)?.configurations.find(c => c.duration === duration);
}
