import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Menu, X, ArrowRight } from 'lucide-react';
import { SIGNUP_BONUS } from '../lib/constants';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 min-h-[44px]" aria-label="PropReel home">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <Play className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-bold text-xl">PropReel</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/pricing" className="text-sm font-medium text-gray-600 hover:text-purple-700 transition">Pricing</Link>
            <Link to="/reviews" className="text-sm font-medium text-gray-600 hover:text-purple-700 transition">Reviews</Link>
            <Link to="/about" className="text-sm font-medium text-gray-600 hover:text-purple-700 transition">About</Link>
            <Link to="/contact" className="text-sm font-medium text-gray-600 hover:text-purple-700 transition">Contact</Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="btn btn-ghost text-gray-700 hover:text-purple-700 min-h-[44px] flex items-center">Log in</Link>
            <Link to="/register" className="btn btn-primary text-sm min-h-[44px] flex items-center">Start Free — {SIGNUP_BONUS} Credits</Link>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-3 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white p-4 space-y-1">
            {[
              ['/pricing', 'Pricing'],
              ['/reviews', 'Reviews'],
              ['/about', 'About'],
              ['/contact', 'Contact'],
              ['/login', 'Log in'],
            ].map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setMenuOpen(false)} className="block py-3 min-h-[44px] flex items-center text-gray-700">{label}</Link>
            ))}
            <Link to="/register" onClick={() => setMenuOpen(false)} className="flex items-center justify-center gap-2 py-3 min-h-[48px] text-purple-700 font-semibold">
              Start Free — {SIGNUP_BONUS} Credits <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </nav>
      {children}
      {/* Mobile sticky CTA — appears once the user scrolls past the hero */}
      <MobileStickyCta />
      <footer className="bg-gray-900 text-gray-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
                  <Play className="w-4 h-4 text-white fill-white" />
                </div>
                <span className="font-bold text-xl text-white">PropReel</span>
              </div>
              <p className="text-sm">Create stunning property videos instantly with AI. Built for South African estate agents.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Product</h4>
              <div className="space-y-2 text-sm">
                <Link to="/pricing" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Pricing</Link>
                <Link to="/studio" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Studio</Link>
                <Link to="/reviews" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Reviews</Link>
                <Link to="/#faq" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">FAQ</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Company</h4>
              <div className="space-y-2 text-sm">
                <Link to="/about" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">About</Link>
                <Link to="/contact" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Contact</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Legal & Compliance</h4>
              <div className="space-y-2 text-sm">
                <Link to="/terms" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Terms of Service</Link>
                <Link to="/privacy" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Privacy Policy</Link>
                <Link to="/cookies" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Cookie Policy</Link>
                <Link to="/refund-policy" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Refund Policy</Link>
                <Link to="/paia" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">PAIA Manual</Link>
                <Link to="/dpa" className="block hover:text-white py-1.5 min-h-[44px] flex items-center">Data Processing</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-sm text-center">
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
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/95 backdrop-blur border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Link to="/register" className="btn btn-primary w-full min-h-[48px] flex items-center justify-center gap-2">
        Start Free — {SIGNUP_BONUS} Credits <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
