import { base44 } from "@/api/base44Client";

export const PHOTO_TOOL_CREDIT_COST = 2;

export const VIDEO_TIER_CREDITS = {
  essential: { 30: 5, 60: 10 },
  social: { 20: 30, 40: 50, 60: 70 },
  cinematic: { 30: 40, 60: 70, 90: 90 },
  premium: { 30: 60, 60: 100, 90: 150 },
};

export const FREE_SIGNUP_CREDITS = 5;

// Credit cost is looked up per tier + duration (no longer linear)
export function getVideoTierCredits(tier, durationSeconds) {
  const tierCredits = VIDEO_TIER_CREDITS[tier] || VIDEO_TIER_CREDITS.essential;
  return tierCredits[durationSeconds] ?? Object.values(tierCredits)[0];
}

// Checks if the current user has enough credits and deducts them if so.
// If the user belongs to an agency, credits are deducted from the agency pool.
// Returns { success, remaining }.
export async function spendCredits(cost) {
  const user = await base44.auth.me();

  // Agency agents spend from the shared agency pool
  if (user.agency_id) {
    const agency = await base44.entities.Agency.get(user.agency_id);
    const current = agency.credits || 0;
    if (current < cost) {
      return { success: false, remaining: current, source: "agency" };
    }
    const remaining = current - cost;
    await base44.entities.Agency.update(user.agency_id, { credits: remaining });
    window.dispatchEvent(new CustomEvent("credits:updated", { detail: { credits: remaining, source: "agency" } }));
    return { success: true, remaining, source: "agency" };
  }

  // Independent agents spend from their own balance
  const current = user.credits || 0;
  if (current < cost) {
    return { success: false, remaining: current, source: "user" };
  }
  await base44.auth.updateMe({ credits: current - cost });
  const remaining = current - cost;
  window.dispatchEvent(new CustomEvent("credits:updated", { detail: { credits: remaining } }));
  return { success: true, remaining, source: "user" };
}

// Returns the current credit balance for display, fetching from agency pool if needed.
export async function getCreditBalance() {
  const user = await base44.auth.me();
  if (user.agency_id) {
    const agency = await base44.entities.Agency.get(user.agency_id);
    return agency.credits || 0;
  }
  return user.credits || 0;
}