import { callGrokVision } from "@/lib/grokVision";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/**
 * Detects whether an error represents a 429 / resource-exhausted / capacity
 * condition from the xAI API that is worth retrying.
 */
function isResourceExhaustedError(error) {
  if (!error) return false;
  const status = error.status || error.statusCode || 0;
  const msg = (error.message || "").toLowerCase();
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("resource exhausted") ||
    msg.includes("resource-exhausted") ||
    msg.includes("capacity") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("too many requests")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with randomized jitter.
 * Attempt 0 → ~2s, attempt 1 → ~4s, attempt 2 → ~8s (plus up to 1s jitter).
 */
function getBackoffDelay(attempt) {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return exponential + jitter;
}

/**
 * Wraps xAI text generation with automatic retry on 429 / resource-exhausted
 * errors. Retries up to 3 times with exponential backoff + jitter before
 * throwing a user-friendly error.
 *
 * @param {string} systemPrompt - System message for the AI
 * @param {string} userPrompt - User text prompt
 * @param {string[]} imageUrls - Optional image URLs for vision analysis
 * @param {(info: {attempt: number, maxRetries: number, delay: number}) => void} [onRetry]
 *        Optional callback invoked before each retry attempt.
 * @returns {Promise<string>} The generated text response
 */
export async function generateScriptWithRetry(systemPrompt, userPrompt, imageUrls = [], onRetry) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGrokVision(systemPrompt, userPrompt, imageUrls);
    } catch (error) {
      const canRetry = attempt < MAX_RETRIES && isResourceExhaustedError(error);

      if (canRetry) {
        const delay = getBackoffDelay(attempt);
        if (typeof onRetry === "function") {
          onRetry({ attempt: attempt + 1, maxRetries: MAX_RETRIES, delay });
        }
        await sleep(delay);
        continue;
      }

      // Non-retryable error — rethrow immediately
      if (!isResourceExhaustedError(error)) {
        throw error;
      }

      // Retries exhausted for a resource-exhausted error — user-friendly message
      throw new Error(
        "The AI service is experiencing high demand right now. Please wait a moment and try again."
      );
    }
  }

  // Unreachable safety net
  throw new Error(
    "The AI service is experiencing high demand right now. Please wait a moment and try again."
  );
}