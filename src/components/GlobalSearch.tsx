import { useState, useEffect, useRef } from 'react';
import { Search, X, Video, Image, FileText, CreditCard, Settings, ArrowRight, Clock, Star, TrendingUp } from 'lucide-react';
import { mockProjects } from '../lib/mockData';
import { formatZar, formatRelative } from '../lib/utils';

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

    // Search projects
    mockProjects.forEach(project => {
      if (
        project.title.toLowerCase().includes(lowerQuery) ||
        project.suburb.toLowerCase().includes(lowerQuery) ||
        project.city.toLowerCase().includes(lowerQuery)
      ) {
        searchResults.push({
          id: project.id,
          type: 'project',
          title: project.title,
          subtitle: `${project.suburb}, ${project.city} • ${formatZar(project.price)}`,
          icon: Video,
          url: `/dashboard/projects/${project.id}`,
          category: 'Projects'
        });
      }
    });

    // Quick actions
    const actions = [
      { id: 'new-project', title: 'Create New Project', icon: Video, url: '/studio', category: 'Actions' },
      { id: 'edit-photo', title: 'Edit Photo with AI', icon: Image, url: '/studio?tab=photo', category: 'Actions' },
      { id: 'generate-video', title: 'Generate Video', icon: Video, url: '/studio?tab=video', category: 'Actions' },
      { id: 'buy-credits', title: 'Buy Credits', icon: CreditCard, url: '/dashboard/credits', category: 'Actions' },
      { id: 'settings', title: 'Account Settings', icon: Settings, url: '/dashboard/settings', category: 'Actions' }
    ];

    actions.forEach(action => {
      if (action.title.toLowerCase().includes(lowerQuery)) {
        searchResults.push({
          ...action,
          type: 'action'
        });
      }
    });

    // Recent searches (mock)
    const recentSearches = [
      { id: 'recent-1', title: 'Luxury Villa Constantia', type: 'recent' as const, icon: Clock, category: 'Recent' },
      { id: 'recent-2', title: 'Generate Video', type: 'recent' as const, icon: Clock, category: 'Recent' }
    ];

    if (query.length < 3) {
      searchResults.push(...recentSearches);
    }

    setResults(searchResults.slice(0, 10));
    setSelectedIndex(0);
  }, [query]);

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
      window.location.href = result.url;
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

// Search button component for header
export function SearchButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-secondary text-sm gap-2"
        title="Search (⌘K)"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 text-xs">
          ⌘K
        </kbd>
      </button>
      {isOpen && <GlobalSearch />}
    </>
  );
}
