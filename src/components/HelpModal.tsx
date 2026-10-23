import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Search, ChevronDown, MessageCircle, BookOpen, ExternalLink } from 'lucide-react';
import { FAQS, FAQ_CATEGORIES } from '../lib/faq';

const CATEGORIES = FAQ_CATEGORIES;

/* FAQ content lives in src/lib/faq.ts so the public /faq page and this modal
   cannot drift apart. */

export default function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const results = useMemo(() => {
    if (!query.trim()) return FAQS;
    const q = query.toLowerCase();
    return FAQS.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
  }, [query]);

  // Escape closes the dialog (the backdrop handles click-outside).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-x-4 top-[5vh] z-50 max-w-2xl mx-auto" role="dialog" aria-modal="true" aria-label="Help and FAQ">
        <div className="card-dark overflow-hidden animate-scale-in max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Help Centre</h3>
                <p className="text-xs text-ink-500">Answers to common questions</p>
              </div>
            </div>
            <button onClick={onClose} className="text-ink-400 hover:text-white p-2" aria-label="Close help">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-white/5 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                autoFocus
                className="input pl-10"
                placeholder="Search help articles..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search help articles"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {results.length === 0 ? (
              <div className="text-center py-10">
                <Search className="w-10 h-10 text-ink-600 mx-auto mb-3" />
                <p className="text-ink-400 text-sm">No results for "{query}"</p>
                <a
                  href="mailto:support@propreel.co.za?subject=Question%20from%20Help%20Centre"
                  className="btn btn-secondary text-xs mt-4 inline-flex items-center gap-2"
                >
                  <MessageCircle className="w-3 h-3" /> Ask us directly
                </a>
              </div>
            ) : (
              CATEGORIES.filter(cat => results.some(r => r.category === cat)).map(cat => (
                <div key={cat} className="mb-5 last:mb-0">
                  <p className="text-xs text-ink-500 uppercase tracking-wide mb-2">{cat}</p>
                  <div className="space-y-2">
                    {results.map((faq, idx) => {
                      if (faq.category !== cat) return null;
                      const globalIdx = FAQS.indexOf(faq);
                      const isOpenItem = openIndex === globalIdx;
                      return (
                        <div key={globalIdx} className="rounded-xl bg-ink-800/50 overflow-hidden">
                          <button
                            onClick={() => setOpenIndex(isOpenItem ? null : globalIdx)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition"
                            aria-expanded={isOpenItem}
                          >
                            <span className="text-sm font-medium text-white">{faq.q}</span>
                            <ChevronDown className={`w-4 h-4 text-ink-400 flex-shrink-0 transition-transform ${isOpenItem ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpenItem && (
                            <p className="px-4 pb-4 text-sm text-ink-400 leading-relaxed">{faq.a}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-white/5 text-center flex-shrink-0 space-y-1">
            <p className="text-xs text-ink-500">
              Still stuck? Email{' '}
              <a href="mailto:support@propreel.co.za" className="text-purple-400 hover:text-purple-300">support@propreel.co.za</a>
              {' '}— we reply within one business day.
            </p>
            <Link to="/faq" onClick={onClose} className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300">
              Browse all FAQs <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
