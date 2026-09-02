import { base44 } from "@/api/base44Client";

export const PHOTO_TOOL_CREDIT_COST = 2;

export const VIDEO_TIER_CREDITS = {
  essential: { 30: 5, 60: 10 },
  social: { 20: 30, 40: 50, 60: 70 },
  cinematic: { 30: 40, 60: 70, 90: 90 },
  premium: { 30: 60, 60: 100, 90: 150 },
};

// Credit cost is looked up per tier + duration (no longer linear)
export function getVideoTierCredits(tier, durationSeconds) {
  const tierCredits = VIDEO_TIER_CREDITS[tier] || VIDEO_TIER_CREDITS.essential;
  return tierCredits[durationSeconds] ?? Object.values(tierCredits)[0];
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