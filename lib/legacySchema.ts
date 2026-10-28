/**
 * The avatar schema migration (2026-10-27).
 *
 * The paid lip-sync feature's job kind and credit actions used to carry the
 * vendor model name (`flashhead` / `FLASHHEAD` / "FlashHead lip-sync video").
 * Everything speaks `avatar` now, and HISTORY IS NORMALIZED SERVER-SIDE: the
 * DynamoDB rows, job-status records and P&L snapshots are never rewritten —
 * every server read maps the legacy identifiers onto the canonical ones
 * through this module, and every new write emits canonical values only.
 *
 * Canonical vocabulary (legacy alias → canonical):
 *   job-token scope      'flashhead'   → 'avatar'
 *   job record kind      'flashhead'   → 'avatar'
 *   project kind         'FLASHHEAD'   → 'AVATAR'
 *   credit action scope  'flashhead'   → 'avatar'
 *   credit action kind   'FLASHHEAD'   → 'AVATAR'
 *   credit description   'FlashHead lip-sync video' → 'AI Avatar video'
 *
 * Keep this module PURE (no server imports) — the client bundle classifies
 * ledger history with isAvatarCharge too.
 */

export const AVATAR_JOB_SCOPE = 'avatar';
export const AVATAR_PROJECT_KIND = 'AVATAR';
export const AVATAR_CHARGE_DESCRIPTION = 'AI Avatar video';
export const LEGACY_AVATAR_CHARGE_DESCRIPTION = 'FlashHead lip-sync video';

/**
 * Job-token / job-record scope vocabulary. Only the legacy alias is mapped —
 * any other value passes through verbatim (unknown scopes still fail pricing
 * and refund validation exactly as before).
 */
export function normalizeJobScope(scope: string | undefined | null): string {
  const s = String(scope ?? '');
  return s.toLowerCase() === 'flashhead' ? AVATAR_JOB_SCOPE : s;
}

/**
 * Project kind vocabulary. Only the legacy alias is mapped; every other kind
 * is returned untouched so writes and reads never reshape unrelated values.
 */
export function normalizeProjectKind(kind: string | undefined | null): string {
  const k = String(kind ?? '');
  return k.toUpperCase() === 'FLASHHEAD' ? AVATAR_PROJECT_KIND : k;
}

interface ChargeLike {
  description?: string | null;
  metadata?: { scope?: unknown; kind?: unknown } | null;
}

/**
 * Is this credit-transaction row part of the avatar charge family — old or
 * new spelling? Shared by the refund matcher and every charge classifier
 * (admin render stats, P&L, the client's per-feature report).
 */
export function isAvatarCharge(t: ChargeLike): boolean {
  if (normalizeJobScope(String(t.metadata?.scope ?? '')) === AVATAR_JOB_SCOPE) return true;
  if (normalizeProjectKind(String(t.metadata?.kind ?? '')) === AVATAR_PROJECT_KIND) return true;
  const d = String(t.description ?? '').toLowerCase();
  return d.includes('flashhead') || d.includes('lip-sync') || d.includes('avatar video');
}

/**
 * Server-side history normalization for ONE credit-transaction row: the
 * legacy scope/kind/description values map onto the canonical vocabulary.
 * Returns a copy — callers may hold the raw scanned item. Every other field
 * (and every other scope/kind value) passes through untouched.
 */
export function normalizeCreditAction<T extends ChargeLike>(t: T): T {
  const desc = String(t.description ?? '');
  const description =
    desc === LEGACY_AVATAR_CHARGE_DESCRIPTION ? AVATAR_CHARGE_DESCRIPTION : t.description;
  const scope =
    t.metadata && String(t.metadata.scope ?? '').toLowerCase() === 'flashhead'
      ? AVATAR_JOB_SCOPE
      : t.metadata?.scope;
  const kind =
    t.metadata && String(t.metadata.kind ?? '').toUpperCase() === 'FLASHHEAD'
      ? AVATAR_PROJECT_KIND
      : t.metadata?.kind;
  const metadata = t.metadata
    ? {
        ...t.metadata,
        ...(scope !== undefined ? { scope } : {}),
        ...(kind !== undefined ? { kind } : {}),
      }
    : t.metadata;
  return { ...t, description, metadata };
}
