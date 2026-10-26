import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { SIGNUP_BONUS } from '../lib/constants';
import { AI_DISCLAIMER_TEXT } from '../lib/aiDisclaimer';
import SupportWidgets from './SupportWidgets';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-950 dark:bg-ink-950 text-white">
      <nav className="sticky top-0 z-50 glass-strong border-b border-white/5 relative">
        {/* Neon hairline under the nav */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-400/70 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 min-h-[44px]" aria-label="PropReel home">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center shadow-[0_0_18px_rgba(168,85,247,0.55)]">
              <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-xl text-glow">PropReel</span>
          </Link>
          {/* Links + CTAs need lg to sit side-by-side without wrapping; at
              md (tablet) the full nav crams the buttons into 2–3 line labels,
              so tablets get the hamburger menu until lg. */}
          <div className="hidden lg:flex items-center gap-8">
            <Link to="/pricing" className="text-sm font-medium text-ink-300 hover:text-white transition">Pricing</Link>
            <Link to="/blog" className="text-sm font-medium text-ink-300 hover:text-white transition">Blog</Link>
            <Link to="/reviews" className="text-sm font-medium text-ink-300 hover:text-white transition">Reviews</Link>
            <Link to="/faq" className="text-sm font-medium text-ink-300 hover:text-white transition">FAQ</Link>
            <Link to="/about" className="text-sm font-medium text-ink-300 hover:text-white transition">About</Link>
            <Link to="/contact" className="text-sm font-medium text-ink-300 hover:text-white transition">Contact</Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="btn glass text-white min-h-[44px] whitespace-nowrap flex items-center hover:bg-white/10">Log in</Link>
            <Link to="/register" className="btn btn-neon min-h-[44px] whitespace-nowrap flex items-center">Start Free — {SIGNUP_BONUS} Credits</Link>
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-3 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t border-white/5 bg-ink-950/95 backdrop-blur-xl p-4 space-y-1">
            {[
              ['/pricing', 'Pricing'],
              ['/blog', 'Blog'],
              ['/reviews', 'Reviews'],
              ['/faq', 'FAQ'],
              ['/about', 'About'],
              ['/contact', 'Contact'],
              ['/login', 'Log in'],
            ].map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setMenuOpen(false)} className="block py-3 min-h-[44px] flex items-center text-ink-200">{label}</Link>
            ))}
            <Link to="/register" onClick={() => setMenuOpen(false)} className="flex items-center justify-center gap-2 py-3 min-h-[48px] text-purple-300 font-semibold">
              Start Free — {SIGNUP_BONUS} Credits <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </nav>
      <main id="main-content">{children}</main>
      <SupportWidgets />
      <MobileStickyCta />
      {/* pb clears the mobile sticky CTA bar (fixed bottom, md:hidden) so it
          never covers the copyright line when scrolled to the end. */}
      <footer className="glass-strong border-t border-white/5 pt-14 pb-24 md:pb-14 relative overflow-hidden">
        {/* Faint grid + neon hairline so the footer feels part of the system */}
        <div className="absolute inset-0 bg-grid-fade opacity-30" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
                  <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
                </div>
                <span className="font-bold text-xl text-white">PropReel</span>
              </div>
              <p className="text-sm text-ink-400">Create stunning property videos instantly with AI. Built for South African estate agents.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Product</h4>
              <div className="space-y-2 text-sm">
                <Link to="/pricing" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Pricing</Link>
                <Link to="/dashboard" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Dashboard</Link>
                <Link to="/dashboard/video" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Video Studio</Link>
                <Link to="/reviews" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Reviews</Link>
                <Link to="/status" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">System status</Link>
                <Link to="/faq" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">FAQ</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Company</h4>
              <div className="space-y-2 text-sm">
                <Link to="/about" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">About</Link>
                <Link to="/blog" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Blog</Link>
                <Link to="/contact" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Contact</Link>
                <Link to="/agency/signup" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">For Agencies</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Legal & Compliance</h4>
              <div className="space-y-2 text-sm">
                <Link to="/terms" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Terms of Service</Link>
                <Link to="/privacy" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Privacy Policy</Link>
                <Link to="/cookies" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Cookie Policy</Link>
                <Link to="/refund-policy" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Refund Policy</Link>
                <Link to="/paia" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">PAIA Manual</Link>
                <Link to="/dpa" className="block hover:text-white py-1.5 min-h-[44px] flex items-center text-ink-300">Data Processing</Link>
              </div>
            </div>
          </div>
          <div className="mt-12 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left" role="note">
            <p className="text-xs font-semibold text-amber-300 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> AI-generated content notice</p>
            <p className="text-xs text-ink-400 leading-relaxed">{AI_DISCLAIMER_TEXT}</p>
          </div>
          <div className="border-t border-white/5 mt-8 pt-8 text-sm text-center text-ink-400">
            <p>© 2026 PropReel. All rights reserved. All prices include VAT.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MobileStickyCta() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden glass-strong border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Link to="/register" className="btn btn-primary w-full min-h-[48px] flex items-center justify-center gap-2">
        Start Free — {SIGNUP_BONUS} Credits <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
