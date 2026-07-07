import { base44 } from "@/api/base44Client";

export const PHOTO_TOOL_CREDIT_COST = 1;

export const VIDEO_TIER_CREDITS = {
  essential: 5,
  social: 15,
  cinematic: 30,
  premium: 50,
  pro: 75,
};

// Credit cost scales linearly with video duration (30s = base cost from VIDEO_TIER_CREDITS)
export function getVideoTierCredits(tier, durationSeconds) {
  const base = VIDEO_TIER_CREDITS[tier] || VIDEO_TIER_CREDITS.essential;
  return Math.round(base * ((durationSeconds || 30) / 30));
}

// Checks if the current user has enough credits and deducts them if so.
// Returns { success, remaining }.
export async function spendCredits(cost) {
  const user = await base44.auth.me();
  const current = user.credits || 0;
  if (current < cost) {
    return { success: false, remaining: current };
  }
  await base44.auth.updateMe({ credits: current - cost });
  const remaining = current - cost;
  window.dispatchEvent(new CustomEvent("credits:updated", { detail: { credits: remaining } }));
  return { success: true, remaining };
}