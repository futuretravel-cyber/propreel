import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Check, ShieldCheck } from 'lucide-react';
import { getConsent, setConsent, CONSENT_CHANGED_EVENT, CookieChoice } from '../lib/consent';

/**
 * POPIA cookie consent banner — shown until the visitor picks a side.
 * "Essential only" keeps the site fully working (session + OAuth cookies are
 * strictly necessary); "Accept all" additionally opts in to analytics, which
 * src/lib/analytics.ts refuses to fire without.
 *
 * The Cookie Policy page (/cookies) can re-open the banner via clearConsent().
 */
export default function CookieConsent() {
  const [choice, setChoice] = useState<CookieChoice | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Read after mount: localStorage is client-only (SSR-safe habit) and this
    // keeps the banner from flashing for visitors who already decided.
    setVisible(!getConsent());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setChoice(detail as CookieChoice | null);
      setVisible(!detail);
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  const choose = (v: CookieChoice) => {
    setConsent(v);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[90] p-4 sm:p-6 pointer-events-none"
      role="region"
      aria-label="Cookie consent"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl card-dark p-5 border border-purple-500/30 bg-ink-900/95 backdrop-blur shadow-2xl animate-fade-in">
        <div className="flex items-start gap-3">
          <Cookie className="w-5 h-5 text-purple-300 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              We value your privacy
              <span className="badge badge-brand text-[10px] py-0.5">POPIA</span>
            </h2>
            <p className="text-xs text-ink-400 mt-1 leading-relaxed">
              We use <span className="text-ink-200">essential cookies</span> to keep you signed in — the site
              works without anything else. With your permission we'll also load privacy-friendly analytics
              to see which features matter. No advertising trackers, ever.
              Full details in our <Link to="/cookies" className="text-purple-400 hover:text-purple-300 underline">Cookie Policy</Link>.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:justify-end">
          <button
            onClick={() => choose('essential')}
            className="btn btn-secondary text-sm py-2 px-4"
          >
            <ShieldCheck className="w-4 h-4" /> Essential only
          </button>
          <button
            onClick={() => choose('all')}
            className="btn btn-primary text-sm py-2 px-4"
          >
            <Check className="w-4 h-4" /> Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
