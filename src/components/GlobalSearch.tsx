import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Video, Image, FileText, CreditCard, Settings, ArrowRight, Clock, Star, TrendingUp, Mic } from 'lucide-react';
import { PropReelAPI, Project } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatZar, formatRelative } from '../lib/utils';

/**
 * The header button and ⌘K both ask the one mounted <GlobalSearch/> to open.
 * The modal must stay mounted — the keyboard listener lives inside it, so
 * rendering it only "when open" (behind a parent's own flag) left both the
 * button and the ⌘K shortcut doing nothing at all.
 */
const openRequests = new Set<() => void>();
function requestSearchOpen(): void {
  openRequests.forEach(open => open());
}

interface SearchResult {
  id: string;
  type: 'project' | 'action' | 'setting' | 'recent';
  title: string;
  subtitle?: string;
  icon: any;
  url?: string;
  category?: string;
}

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const { user } = useAuth();

  // Load the user's real projects for searching
  useEffect(() => {
    if (!user?.id) return;
    PropReelAPI.listProjects(user.id).then(setProjects).catch(() => setProjects([]));
  }, [user?.id]);

  // Stay mounted for ⌘K; the header button asks us to open (requestSearchOpen).
  useEffect(() => {
    const open = () => setIsOpen(true);
    openRequests.add(open);
    return () => { openRequests.delete(open); };
  }, []);

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Search logic
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchResults: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    // Search the user's real projects (DynamoDB) — reels and Talking Head clips
    projects.forEach(project => {
      const isTalkingHead = project.kind === 'FLASHHEAD';
      const matchesAvatarKind = isTalkingHead && ['avatar', 'avatar video', 'talking head', 'flashhead']
        .some(term => term.includes(lowerQuery) || lowerQuery.includes(term));
      if (
        project.title.toLowerCase().includes(lowerQuery) ||
        (project.suburb || '').toLowerCase().includes(lowerQuery) ||
        (project.city || '').toLowerCase().includes(lowerQuery) ||
        matchesAvatarKind
      ) {
        searchResults.push({
          id: project.id,
          type: 'project',
          title: project.title,
          subtitle: (isTalkingHead ? 'AI Avatar Video • ' : '') + [project.suburb, project.city].filter(Boolean).join(', ') + (project.price ? ` • ${formatZar(project.price)}` : ''),
          icon: isTalkingHead ? Mic : Video,
          url: isTalkingHead ? '/dashboard/video' : '/dashboard/listings',
          category: 'Projects'
        });
      }
    });

    // Quick actions
    const actions = [
      { id: 'new-project', title: 'Create New Project', icon: Video, url: '/dashboard/video', category: 'Actions' },
      { id: 'edit-photo', title: 'Edit Photo with AI', icon: Image, url: '/dashboard/photo-editor', category: 'Actions' },
      { id: 'staging', title: 'Virtual Staging', icon: Image, url: '/dashboard/photo-editor?tab=staging', category: 'Actions' },
      { id: 'generate-video', title: 'Generate Video', icon: Video, url: '/dashboard/video', category: 'Actions' },
      { id: 'avatar-video', title: 'AI Avatar Video', icon: Mic, url: '/dashboard/video', category: 'Actions' },
      { id: 'description', title: 'AI Property Description', icon: FileText, url: '/dashboard/description', category: 'Actions' },
      { id: 'social', title: 'AI Social Media Post', icon: FileText, url: '/dashboard/social', category: 'Actions' },
      { id: 'buy-credits', title: 'Buy Credits', icon: CreditCard, url: '/dashboard/credits', category: 'Actions' },
      { id: 'listings', title: 'Property Listings', icon: FileText, url: '/dashboard/listings', category: 'Pages' },
      { id: 'projects', title: 'My Projects', icon: Video, url: '/dashboard/projects', category: 'Pages' },
      { id: 'billing', title: 'Billing & Credits', icon: CreditCard, url: '/dashboard/credits?tab=billing', category: 'Pages' },
      { id: 'analytics', title: 'Analytics', icon: TrendingUp, url: '/dashboard/analytics', category: 'Pages' },
      { id: 'branding', title: 'Agent Branding', icon: Star, url: '/dashboard/branding', category: 'Pages' },
      { id: 'notifications', title: 'Notifications', icon: Clock, url: '/dashboard/settings?tab=notifications', category: 'Pages' },
      { id: 'settings', title: 'Account Settings', icon: Settings, url: '/dashboard/settings', category: 'Pages' }
    ];

    actions.forEach(action => {
      if (action.title.toLowerCase().includes(lowerQuery)) {
        searchResults.push({
          ...action,
          type: 'action'
        });
      }
    });

    // Quick links (static actions, not mock data)

    if (query.length < 3 && searchResults.length === 0) {
      searchResults.push({ id: 'hint-1', title: 'Type at least 3 characters to search…', type: 'recent' as const, icon: Clock, category: 'Hint' });
    }

    setResults(searchResults.slice(0, 10));
    setSelectedIndex(0);
    // projects must be in the deps: typing while the project list was still
    // loading used to run this closure against an empty array and never
    // re-run it, so searches returned nothing.
  }, [query, projects]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      navigateToResult(results[selectedIndex]);
    }
  };

  const navigateToResult = (result: SearchResult) => {
    if (result.url) {
      navigate(result.url); // SPA — a full reload would drop drafts and in-flight uploads
      setIsOpen(false);
      setQuery('');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={() => setIsOpen(false)}
      />

      {/* Search Modal */}
      <div className="fixed inset-x-0 top-20 z-50 max-w-2xl mx-auto px-4">
        <div className="card-dark overflow-hidden animate-scale-in">
          {/* Search Input */}
          <div className="flex items-center gap-3 p-4 border-b border-white/5">
            <Search className="w-5 h-5 text-ink-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search projects, actions, settings..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-white placeholder-ink-500 outline-none text-sm"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-ink-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded bg-ink-800 text-ink-400 text-xs">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {results.length === 0 ? (
              <div className="p-8 text-center">
                <Search className="w-12 h-12 text-ink-500 mx-auto mb-3" />
                <p className="text-ink-400 text-sm">
                  {query ? 'No results found' : 'Start typing to search...'}
                </p>
                {!query && (
                  <p className="text-ink-500 text-xs mt-2">
                    Try searching for projects, actions, or settings
                  </p>
                )}
              </div>
            ) : (
              <div className="p-2">
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    onClick={() => navigateToResult(result)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition ${
                      index === selectedIndex
                        ? 'bg-purple-700/20 border border-purple-500/30'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      result.type === 'project' ? 'bg-purple-950/50 text-purple-400' :
                      result.type === 'action' ? 'bg-blue-950/50 text-blue-400' :
                      'bg-ink-800 text-ink-400'
                    }`}>
                      <result.icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-xs text-ink-400 truncate">
                          {result.subtitle}
                        </p>
                      )}
                    </div>

                    {result.category && (
                      <span className="badge badge-muted text-[10px] flex-shrink-0">
                        {result.category}
                      </span>
                    )}

                    {index === selectedIndex && (
                      <ArrowRight className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 p-3 flex items-center justify-between text-xs text-ink-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-ink-800">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-ink-800">↵</kbd>
                Select
              </span>
            </div>
            <span>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// Search button component for header. It never owns the modal's open state —
// it asks the always-mounted <GlobalSearch/> to open, so the button and the
// ⌘K shortcut share one instance instead of two conflicting flags.
export function SearchButton() {
  return (
    <>
      <button
        onClick={() => requestSearchOpen()}
        className="btn btn-secondary text-sm gap-2"
        title="Search (⌘K)"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 text-xs">
          ⌘K
        </kbd>
      </button>
      <GlobalSearch />
    </>
  );
}
