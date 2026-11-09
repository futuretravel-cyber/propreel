import { hasAnalyticsConsent, CONSENT_CHANGED_EVENT } from './consent';

/**
 * Page-view + time-on-page tracking for the admin Visitors tab.
 *
 * POPIA: runs only after the visitor chooses "Accept all" in the cookie banner
 * (hasAnalyticsConsent). The server derives the IP address; this file sends
 * only the path, the seconds spent on the page and a random per-tab visit id.
 */

const ENDPOINT = '/api/leads?action=visit';

let visitId = '';
let currentPath = '';
let pageStartedAt = 0;
let started = false;

function newVisitId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function send(path: string, seconds: number) {
  if (!visitId || !path) return;
  const body = JSON.stringify({ visitId, path, seconds });
  // sendBeacon survives page unload; fall back to fetch with keepalive.
  if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

/** Close out the page the visitor is leaving and record its duration. */
function flush() {
  if (!currentPath || !pageStartedAt) return;
  const seconds = Math.round((Date.now() - pageStartedAt) / 1000);
  send(currentPath, seconds);
  pageStartedAt = 0;
}

/** Record a page view. Called on load and on every in-app route change. */
export function trackPageView(path: string) {
  if (!hasAnalyticsConsent()) return;
  if (!visitId) visitId = newVisitId();
  if (path === currentPath && pageStartedAt) return;
  flush();
  currentPath = path;
  pageStartedAt = Date.now();
  send(path, 0);
}

/** Start listening for leave/hide events once. Safe to call repeatedly. */
export function startVisitTracking() {
  if (started || typeof window === 'undefined') return;
  started = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener(CONSENT_CHANGED_EVENT, () => {
    if (!hasAnalyticsConsent()) {
      // Visitor withdrew analytics consent: stop and drop the open page.
      currentPath = '';
      pageStartedAt = 0;
    } else {
      // Consent just granted: record the page they are on now.
      trackPageView(window.location.pathname + window.location.search);
    }
  });
}
