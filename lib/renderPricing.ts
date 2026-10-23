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
 * The tier catalog (durations, image allotments, resolutions, engine, credit
 * prices) lives in lib/videoTiers.ts and is re-exported here, so there is one
 * price table, not two.
 *
 * Keep this module dependency-free (pure data) — it is imported by both the
 * Vite bundle and the Vercel functions.
 */

// The tier catalog (durations, images, resolutions, engine, credits) is the
// shared one in lib/videoTiers.ts — re-exported here so every existing
// `import { TIERS } from './renderPricing'` keeps working and reads the single
// source of truth. lib/videoTiers.ts is also imported directly where callers
// need tier helpers (engineForTier, imagesForDuration).
export { TIERS } from './videoTiers';
export type { Tier, TierConfig, VideoEngine } from './videoTiers';
import { TIERS } from './videoTiers';

/**
 * Cash price in Rands charged per credit for TOP-UP PACKS. Set to 1.50 on
 * 2026-10-21 to match the R1.50 list value every action is priced at
 * (docs/pricing-cost-analysis.md) — packs had charged R1.00/credit since
 * launch while the price list assumed R1.50.
 *
 * Money → credits (server, never the browser): api/paystack/initialize and
 * lib/autoTopup multiply credits by this before charging.
 * Credits → money (grants): verify/webhook/autotopup must credit
 * `metadata.credits` (the count), never the paid Rand amount.
 * Client displays (CreditSystemDashboard, EnhancedBilling, PaymentPage)
 * read the same constant so quotes match the charge.
 */
export const CREDIT_PACK_RAND = 1.5;

/** AI Avatar (FlashHead lip-sync) is billed per 10 seconds of narration —
 *  cost scales linearly with fal + Narakeet per the audio length, so a flat
 *  price bakes in a loss past ~58s. Restored to 2 credits per 10s on
 *  2026-10-19: the R1.50 reprice briefly took it to 1cr (= R1.50/10s vs the
 *  ~R1.37 unit cost ≈ 9% margin — under the 40% floor); 2cr = R3.00/10s ≈
 *  55% margin, which all client copy already stated. */
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
/** Preset image edit (gpt-image-2.5 flare whole-image pass) — fixed price. */
export const IMAGE_EDIT_CREDITS = 2;
/** Staging presets price at the same base rate as every other edit since
 *  2026-10-16: all categories run the same whole-image gpt-image-2.5/flare
 *  call, so the old 4-credit Fill-Pro-era premium no longer applies. The
 *  separate constant stays so a future cost-based re-split only edits here
 *  (the mint still decides by presetId via isStagingPreset). */
export const STAGING_EDIT_CREDITS = 2;
/** Preset ids priced at the 4-credit staging rate. Only the staging presets
 *  belong here — they run the gpt-image-2.5 whole-image path (kept in sync
 *  with modal/image_prompts.py categories). Removal presets run the same
 *  engine at the base 2-credit edit, so they are NOT listed; every other
 *  preset still prices at the base edit too. */
export const STAGING_PRESET_IDS = [
  'luxury_modern', 'scandinavian_minimal', 'contemporary_dark', 'coastal_relaxed',
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
export type JobScope = 'render' | 'flashhead' | 'edit' | 'script' | 'description' | 'social_post' | 'rerender';
/** AI text tools — fixed prices, previously client constants sent as the
 *  deduct amount; now dollar-priced here so server and UI share one source. */
export const DESCRIPTION_CREDITS = 1;
export const SOCIAL_POST_CREDITS = 2;

/**
 * Price of re-rolling ONE clip of a review-paused render (Option 2 — the
 * per-clip review step after generation, before assembly).
 *
 * Rule: the clip's own share of the tier price, rounded UP — ceil(credits /
 * images). The tier price already carries assembly/narration/music margin on
 * top of generation, so a generation-only re-roll at the clip's share always
 * clears the 40% floor (Social 30s: ceil(34/6)=6⚡ = R9 vs ~R1.70 COGS;
 * Cinematic 768p: ceil(47/6)=8⚡ vs ~R4.50; Budget 768p: ceil(34/5)=7⚡).
 * ESSENTIAL never pauses for review (local FFmpeg render), so its price is
 * unreachable in practice.
 */
export function rerenderClipCredits(tierId?: string, configIndex?: number): number | null {
  const tier = TIERS.find(t => t.id === String(tierId || '').toUpperCase());
  if (!tier) return null;
  const config = tier.configurations[Number(configIndex)];
  if (typeof config?.credits !== 'number' || typeof config?.images !== 'number' || config.images < 1) return null;
  return Math.max(1, Math.ceil(config.credits / config.images));
}

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
    // Every edit category (staging, removal, twilight, photo editor) runs
    // the same whole-image flare pass and prices at the base rate. The
    // presetId split is kept so a future cost-based re-split only edits
    // STAGING_EDIT_CREDITS above.
    return isStagingPreset(args.presetId) ? STAGING_EDIT_CREDITS : IMAGE_EDIT_CREDITS;
  }
  if (scope === 'rerender') return rerenderClipCredits(args.tier, args.configIndex);
  if (scope === 'render') {
    const tier = TIERS.find(t => t.id === String(args.tier || '').toUpperCase());
    if (!tier) return null;
    const config = tier.configurations[Number(args.configIndex)];
    return typeof config?.credits === 'number' ? config.credits : null;
  }
  return null;
}
