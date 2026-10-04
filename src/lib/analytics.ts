/**
 * Lightweight analytics event tracking.
 * Wire a real provider (Plausible/GA4) later by implementing `send`;
 * events also land in the console in dev for debugging funnels.
 */

type EventName =
  | 'signup_started'
  | 'signup_completed'
  | 'login'
  | 'google_login'
  | 'plan_selected'
  | 'demo_render_requested'
  | 'render_started'
  | 'render_completed'
  | 'share_clicked'
  | 'pricing_toggle'
  | 'cta_clicked'
  | 'trial_upgrade_clicked'
  | 'trial_converted';

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function send(event: EventName, props?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[analytics] ${event}`, props || {});
  }
  try {
    window.plausible?.(event, { props });
    window.gtag?.('event', event, props);
  } catch {
    /* analytics must never break the app */
  }
}

export const track = send;

if (typeof document !== 'undefined' && !import.meta.env.DEV) {
  // Preload placeholder: replace href with your Plausible/GA snippet when ready.
  const s = document.createElement('script');
  s.defer = true;
  s.dataset.domain = 'propreel.co.za';
  s.src = 'https://plausible.io/js/script.js';
  document.head.appendChild(s);
}
