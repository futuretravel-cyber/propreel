// Very simple keyword-based moderation flagging for newly submitted reviews.
const FLAGGED_WORDS = ["scam", "fraud", "fuck", "shit", "hate", "stupid", "idiot", "sue", "lawsuit"];

export function moderateReview(comment) {
  const lower = comment.toLowerCase();
  const hit = FLAGGED_WORDS.find((w) => lower.includes(w));
  if (hit) {
    return { status: "flagged", flag_reason: `Contains flagged word: "${hit}"` };
  }
  return { status: "pending", flag_reason: "" };
}