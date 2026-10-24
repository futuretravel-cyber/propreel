/**
 * Standard API error shape: `{ ok: false, error, code, ...extra }`.
 *
 * `error` stays the human message (existing clients read it); `code` is the
 * machine-readable branch key so the client never has to match on message
 * text (the audit's error-shape item). Codes are SCREAMING_SNAKE to match the
 * two already in production (`TRIAL_EXPIRED`, `EMAIL_NOT_CONFIRMED`).
 *
 * Usage:
 *   return apiError(res, 402, 'INSUFFICIENT_CREDITS', 'Not enough credits', { current_balance });
 * or, for gate results (see lib/auth.ts SessionGate, which carries `code`):
 *   return gateError(res, gate);
 */

export type ApiErrorCode =
  // auth / access
  | 'SIGN_IN_REQUIRED'
  | 'NOT_ALLOWED'
  | 'ADMIN_REQUIRED'
  | 'EMAIL_NOT_CONFIRMED'
  | 'TRIAL_EXPIRED'
  | 'TRIAL_LOCKED'
  // money
  | 'INSUFFICIENT_CREDITS'
  | 'INSUFFICIENT_AGENCY_POOL'
  | 'MONTHLY_LIMIT_REACHED'
  | 'PRICE_CHANGED'
  // request problems
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'UNKNOWN_JOB'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ApiErrorBody {
  ok: false;
  error: string;
  code: ApiErrorCode;
  [extra: string]: unknown;
}

/** Build the standard error body (spread `extra` for balances, retryAfterSec, …). */
export function apiErrorBody(
  code: ApiErrorCode,
  error: string,
  extra?: Record<string, unknown>,
): ApiErrorBody {
  return { ok: false, error, code, ...(extra || {}) };
}

/** Send the standard error body with `status`. */
export function apiError(
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  status: number,
  code: ApiErrorCode,
  error: string,
  extra?: Record<string, unknown>,
) {
  return res.status(status).json(apiErrorBody(code, error, extra));
}

/** A gate failure from lib/auth.ts (requireOwner / requireAdminSession / …). */
export function gateError(
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  gate: { ok: false; status: number; error: string; code: ApiErrorCode },
) {
  return apiError(res, gate.status, gate.code, gate.error);
}
