import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Zap, X, ArrowRight, CreditCard } from 'lucide-react';
import { useCredit, isFreeTierUser } from '../context/AuthContext';
import { PLANS, SIGNUP_BONUS } from '../lib/constants';

/**
 * Out-of-credits conversion nudge (free tier).
 *
 * When a FREE account's balance hits 0, the dashboard pops this modal once
 * per 24h per account (localStorage cooldown) pointing at PLANS — the
 * conversion goal for free users — with the one-off credit top-up as the
 * secondary path. It reuses the same eligibility rule as the free-tier
 * branch of `lowCreditWarning` in AuthContext (no subscription, no trial
 * clock, not admin, not an agency account), so the banner and the modal
 * always agree about who counts as a free user.
 *
 * Never shown on /pricing or /payment — nobody gets nagged while already
 * checking out.
 */
const cooldownKey = (userId: string) => `propreel:out-of-credits:${userId}`;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export default function LowCreditNudge() {
  const { user } = useCredit();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isFreeOutOfCredits = isFreeTierUser(user) && (user?.credits || 0) <= 0;

  // Pop once per 24h per account. A storage failure (private mode, blocked
  // localStorage) must not break the nudge — it just means no cooldown.
  useEffect(() => {
    if (!isFreeOutOfCredits || !user) return;
    try {
      const last = Number(localStorage.getItem(cooldownKey(user.id)) || 0);
      if (Date.now() - last < COOLDOWN_MS) return;
    } catch { /* no storage — show without cooldown */ }
    setOpen(true);
  }, [isFreeOutOfCredits, user]);

  const dismiss = () => {
    try { if (user) localStorage.setItem(cooldownKey(user.id), String(Date.now())); } catch { /* ignore */ }
    setOpen(false);
  };

  // Never nag on the checkout/pricing surfaces themselves.
  useEffect(() => {
    if (location.pathname.startsWith('/payment') || location.pathname.startsWith('/pricing')) {
      setOpen(false);
    }
  }, [location.pathname]);

  // Escape closes (accessible dismissal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, user?.id]);

  if (!open) return null;

  const starter = PLANS.find(p => p.id === 'STARTER');

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="out-of-credits-title">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative card-dark max-w-md w-full p-6 border border-purple-500/30 animate-fade-up shadow-2xl">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-ink-500 hover:text-white transition"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center mb-4">
          <Zap className="w-6 h-6 text-yellow-300" />
        </div>

        <h2 id="out-of-credits-title" className="text-xl font-bold text-white mb-2">
          You're out of credits
        </h2>
        <p className="text-ink-400 text-sm mb-1">
          Your {SIGNUP_BONUS} free welcome credits have been used up — nice work getting
          your first listings on video.
        </p>
        <p className="text-ink-400 text-sm mb-5">
          {starter
            ? `Upgrade to keep creating: ${starter.name} is R${starter.monthlyZar}/mo for ${starter.monthlyCredits.toLocaleString('en-ZA')} credits — every render, description and social post unlocked.`
            : 'Upgrade to keep creating — every render, description and social post unlocked.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            to="/pricing"
            onClick={dismiss}
            className="btn btn-primary flex-1 justify-center whitespace-nowrap"
          >
            View plans <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/payment?topup=true&amount=50"
            onClick={dismiss}
            className="btn btn-ghost flex-1 justify-center whitespace-nowrap"
          >
            <CreditCard className="w-4 h-4" /> Buy credits once-off
          </Link>
        </div>

        <p className="text-[11px] text-ink-500 text-center mt-3">
          Plans renew monthly, cancel any time. Prefer not to? Stay on free — your projects are kept.
        </p>
      </div>
    </div>
  );
}
