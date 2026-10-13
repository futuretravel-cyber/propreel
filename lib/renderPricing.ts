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
    // 768p fal cost is $0.045/s (~R0.74/s): 60s costs R44.7, 90s R67 — the
    // old 70/90 prices left margins of 36% and 26%. 75/105 restores ≥36% on
    // every length (30s stays at 40 = 44%).
    configurations: [
      { duration: 30, images: 5, credits: 40 },
      { duration: 60, images: 10, credits: 75 },
      { duration: 90, images: 15, credits: 105 }
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

/** AI Avatar (FlashHead lip-sync) is billed per 10 seconds of narration —
 *  cost scales linearly with fal + Narakeet per the audio length, so a flat
 *  price bakes in a loss past ~58s. 2 credits per 10s keeps every narration
 *  length ≥ ~31% margin against the ~R0.137/s unit cost. */
export const FLASHHEAD_CREDITS_PER_10S = 2;
/** Hard cap: no avatar video may bill past 90 seconds of narration. */
export const FLASHHEAD_MAX_SECONDS = 90;
/** Narakeet default reading pace ≈ 145 wpm ≈ 2.4 words/sec. Estimates only
 *  — the actual narakeet_seconds land in the job status after TTS. */
export const NARRATION_WORDS_PER_SEC = 2.4;

export function narrationWordCount(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function narrationSecondsForWords(words: number): number {
  return words / NARRATION_WORDS_PER_SEC;
}

export function narrationSecondsForText(text: string): number {
  return narrationSecondsForWords(narrationWordCount(text));
}

/**
 * Price one FlashHead job from its narration length in words. Returns null
 * when the script exceeds the 90-second cap — callers must answer 400 with a
 * clear "shorten the script" message rather than silently truncating.
 */
export function flashheadCreditsForWords(words: number): number | null {
  const seconds = narrationSecondsForWords(words);
  if (seconds > FLASHHEAD_MAX_SECONDS) return null;
  const blocks = Math.max(1, Math.ceil(seconds / 10)); // ≥1 block, i.e. min 2 credits
  return blocks * FLASHHEAD_CREDITS_PER_10S;
}

export function flashheadCreditsForText(text: string): number | null {
  return flashheadCreditsForWords(narrationWordCount(text));
}

/**
 * @deprecated Legacy flat avatar price. Only the job_token mint still reads
 * it — as a fallback for legacy clients that never send their script text.
 * New clients always send voiceover_text and are priced per 10s narration.
 */
export const FLASHHEAD_CREDITS = 8;
/** AI Writer voiceover script (Grok, vision over the uploaded photos).
 *
 *  Cost is driven by the photo count the call attaches (~2k input tokens per
 *  image on fal's OpenRouter Grok route, $2/M in / $6/M out — verified Nov
 *  2026 against a billed 12-image call), so the price scales with the
 *  selected duration: the script rides the tier configs' image allotment.
 *  At R1/credit the flat legacy 1⚡ was breakeven at 60s and a LOSS at 90s
 *  (15 images ⇒ ~R1.08 provider cost). `ceil(duration/30)` restores ≥56%
 *  margin on every length the catalog sells: 30s→1, 50s→2, 60s→2, 90s→3.
 */
export const SCRIPT_CREDITS_PER_30S = 1;
/** @deprecated Legacy flat script price — job_token's fallback when a mint
 *  arrives with no duration at all (stale clients). New clients always send
 *  duration and are priced by scriptCreditsForDuration. */
export const SCRIPT_CREDITS = 1;
/** Number of vision images a tier attaches per duration, by catalog rule of
 *  thumb — used only for legacy mints that carry no duration. */
export function scriptCreditsForDuration(duration: number | null | undefined): number {
  const s = Number(duration);
  if (!Number.isFinite(s) || s <= 0) return SCRIPT_CREDITS; // legacy: flat 1
  // 1 ⚡ per 30 seconds (rounded up), capped at 6⚡ so no script can approach
  // the cost of an Essential 30s render without a deliberate pricing bump.
  return Math.min(6, Math.ceil(s / 30) * SCRIPT_CREDITS_PER_30S);
}
/** Preset image edit (Kontext / local HDR tone-map) — fixed price. */
export const IMAGE_EDIT_CREDITS = 2;
/** Staging/brush-mask presets: Fill Pro costs ~2x Kontext per fal call and
 *  the render is the product the agent paid for, so it prices at 4 credits
 *  (R4 at R1/credit vs ~R1.65 fal cost ~$0.10). Routed through the same
 *  'edit' scope; the mint decides by presetId. */
export const STAGING_EDIT_CREDITS = 4;
/** Preset ids priced at the 4-credit brush-render rate. Only the staging
 *  presets belong here — they run the masked Fill [pro] path. Removal
 *  presets render via the plain Kontext path with their full preset prompts
 *  (kept in sync with modal/image_prompts.py categories), so they price at
 *  the base 2-credit edit like every other Kontext preset. */
export const STAGING_PRESET_IDS = [
  'luxury_modern', 'scandinavian_minimal', 'coastal_relaxed',
  'family_comfortable', 'luxury_bedroom', 'home_office', 'industrial_loft',
];

export function isStagingPreset(presetId: string | undefined | null): boolean {
  return !!presetId && STAGING_PRESET_IDS.includes(presetId);
}

/** Job scopes the worker accepts a paid single-use token for. Script
 *  (AI Writer voiceover) and now ALSO the text tools (description /
 *  social_post) tokens are charged by job_token but never verify a worker
 *  job — those text generations call the same worker's /generate_text with
 *  the paid token in X-PropReel-Token: the CHARGE is the enforcement point,
 *  priced server-side below, so a modified client cannot choose what it
 *  pays (the old client-sent ?action=deduct amount is gone).
 */
export type JobScope = 'render' | 'flashhead' | 'edit' | 'script' | 'description' | 'social_post';
/** AI text tools — fixed prices, previously client constants sent as the
 *  deduct amount; now dollar-priced here so server and UI share one source. */
export const DESCRIPTION_CREDITS = 1;
export const SOCIAL_POST_CREDITS = 2;

/**
 * Price one job server-side. Returns null for an unknown tier/config —
 * callers answer 400 rather than guessing (or, worse, charging 0).
 */
export function jobCredits(
  scope: string,
  args: { tier?: string; configIndex?: number; presetId?: string; voiceoverText?: string; voiceover_text?: string; wordCount?: number; duration?: number } = {}
): number | null {
  if (scope === 'flashhead') {
    // Preferred: price from the narration script the client already has.
    // Only when NO script travels with the mint at all (a legacy client) do
    // we fall back to the deprecated flat rate — that fallback delivers no
    // less billing than the pre-change behavior.
    const text = args.voiceoverText ?? args.voiceover_text;
    if (text != null && text.trim()) return flashheadCreditsForText(text);
    if (typeof args.wordCount === 'number') return flashheadCreditsForWords(args.wordCount);
    return FLASHHEAD_CREDITS;
  }
  if (scope === 'script') return scriptCreditsForDuration(args.duration);
  if (scope === 'description') return DESCRIPTION_CREDITS;
  if (scope === 'social_post') return SOCIAL_POST_CREDITS;
  if (scope === 'edit') {
    // Brush-mask staging runs Fill Pro (~2x Kontext's fal cost) and is the
    // tool agents actually pay for — price it at 4 credits. Plain preset
    // edits (removal, twilight, sky fix, HDR tone-map…) stay at 2 credits.
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
