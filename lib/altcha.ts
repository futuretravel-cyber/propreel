/**
 * ALTCHA proof-of-work CAPTCHA for the sign-in and sign-up endpoints.
 * Self-hosted: the challenge is signed with ALTCHA_HMAC_SECRET and the
 * solution is checked here, so no external service is involved.
 */
import { createChallenge, verifySolution, CappedMap } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';

const ALGORITHM = 'PBKDF2/SHA-256';
// Work factor: iterations the browser must run per attempt. Tune if sign-up feels slow.
const COST = 5_000;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

// Solved challenge nonces, so a payload cannot be replayed. Each entry is
// kept for the challenge lifetime. In-memory per serverless instance, which
// is enough to block casual replay; a shared store is needed for strict use.
const usedChallenges = new CappedMap<string, boolean>({ maxSize: 5_000 });

function hmacSecret(): string {
  const secret = process.env.ALTCHA_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ALTCHA_HMAC_SECRET is missing or shorter than 32 characters');
  }
  return secret;
}

/** Issues a fresh signed challenge for the widget. */
export function issueAltchaChallenge() {
  return createChallenge({
    algorithm: ALGORITHM,
    cost: COST,
    deriveKey,
    hmacSignatureSecret: hmacSecret(),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
}

/**
 * Verifies the base64 ALTCHA payload the widget posts with the form.
 * Returns true only for a valid, unexpired, never-before-used solution.
 */
export async function verifyAltchaPayload(payload: unknown): Promise<boolean> {
  if (typeof payload !== 'string' || !payload || payload.length > 10_000) return false;
  let parsed: { challenge?: any; solution?: any };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return false;
  }
  if (!parsed?.challenge || !parsed?.solution) return false;

  const result = await verifySolution({
    challenge: parsed.challenge,
    solution: parsed.solution,
    deriveKey,
    hmacSignatureSecret: hmacSecret(),
  });
  if (!result.verified) return false;

  const nonce = String(parsed.challenge?.parameters?.nonce || '');
  if (!nonce) return false;
  return usedChallenges.setIfAbsent(nonce, true);
}
