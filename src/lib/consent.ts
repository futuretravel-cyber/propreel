/**
 * Cookie consent (POPIA) — persisted choice for the banner in
 * src/components/CookieConsent.tsx.
 *
 * Only TWO values exist because only two categories exist today:
 *   'essential' — session/oauth cookies only (strictly necessary)
 *   'all'       — essential + privacy-friendly analytics (plausible/gtag,
 *                 when a provider is ever wired up — analytics.ts checks
 *                 hasAnalyticsConsent() before firing anything)
 *
 * Stored in localStorage (not a cookie — no consent needed to store consent).
 */

export type CookieChoice = 'all' | 'essential';

const KEY = 'propreel_cookie_consent';
/** Fired on window when the user resets their choice (Cookie Policy page). */
export const CONSENT_CHANGED_EVENT = 'propreel:cookie-consent-changed';

export function getConsent(): CookieChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'all' || v === 'essential' ? v : null;
  } catch {
    return null; // private mode / storage blocked → treat as "not chosen"
  }
}

export function setConsent(choice: CookieChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch { /* storage blocked — banner will simply re-appear next visit */ }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }));
}

/** Forget the choice — used by "Change cookie preferences" on /cookies. */
export function clearConsent(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: null }));
}

/** True only when the visitor explicitly opted in to analytics. */
export function hasAnalyticsConsent(): boolean {
  return getConsent() === 'all';
}
