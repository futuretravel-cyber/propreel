import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Search, ArrowLeft } from 'lucide-react';

const popularPages = [
  { to: '/', label: 'Home' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/dashboard/video', label: 'Video Generator' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/contact', label: 'Contact' },
];

export default function NotFoundPage() {
  const location = useLocation();

  // This page is the ONLY thing that knows a route is really a 404, so it
  // owns the document title. RouteSEO runs first (it is a sibling before
  // <Routes>), then this effect — so a 404 under /dashboard gets the real
  // "Page not found" label instead of a humanized title of the bogus path.
  useEffect(() => {
    document.title = 'Page not found | PropReel';
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center animate-fade-in">
        <Link to="/" className="inline-flex items-center gap-2 mb-8" aria-label="PropReel home">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
            <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-xl text-white">PropReel</span>
        </Link>

        <p className="text-7xl font-black brand-text-gradient mb-2">404</p>
        <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-ink-400 mb-1">
          We couldn't find <span className="text-ink-300 font-mono text-sm break-all">{location.pathname}</span>
        </p>
        <p className="text-sm text-ink-500 mb-8">It may have been moved, or the link is incorrect.</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Link to="/" className="btn btn-primary">
            <Home className="w-4 h-4" /> Back to Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" /> Go Back
          </button>
        </div>

        <div className="card-dark p-5 text-left">
          <p className="text-xs text-ink-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Search className="w-3 h-3" /> Popular pages
          </p>
          <div className="flex flex-wrap gap-2">
            {popularPages.map(p => (
              <Link
                key={p.to}
                to={p.to}
                className="px-3 py-1.5 rounded-full bg-white/5 text-sm text-ink-300 hover:text-white hover:bg-white/10 transition"
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
