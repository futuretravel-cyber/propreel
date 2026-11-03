import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MessageCircle, Search } from 'lucide-react';
import { PublicLayout } from '../components/PublicLayout';
import { FAQS, FAQ_CATEGORIES } from '../lib/faq';
import { SIGNUP_BONUS } from '../lib/constants';

/**
 * Public FAQ. The footer has always linked to /#faq, which never existed.
 * Content comes from src/lib/faq.ts — the same list the in-app Help modal
 * renders — so the two can't disagree about credits or retention.
 */
/**
 * FAQPage structured data. Every answer is also rendered in the page (see
 * below), which is what Google requires to show a FAQ rich result.
 */
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function FaqPage() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(FAQS[0]?.q ?? null);

  const q = query.trim().toLowerCase();
  const results = q
    ? FAQS.filter(f => [f.q, f.a, f.category].some(v => v.toLowerCase().includes(q)))
    : FAQS;

  return (
    <PublicLayout>
      <section className="py-16 sm:py-20">
        <script type="application/ld+json">{JSON.stringify(FAQ_JSON_LD)}</script>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-5xl font-black text-white">Questions, answered</h1>
            <p className="mt-4 text-lg text-ink-400">
              Credits, renders, storage and billing — in plain language.
            </p>
          </div>

          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              className="input pl-10"
              placeholder="Search the FAQs…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search the FAQs"
            />
          </div>

          {results.length === 0 ? (
            <div className="card-dark p-10 text-center">
              <p className="text-white font-medium">No answer for “{query}”</p>
              <p className="text-sm text-ink-400 mt-1">Send us the question and we'll add it.</p>
              <a
                href={`mailto:support@propreel.co.za?subject=${encodeURIComponent(`FAQ question: ${query}`)}`}
                className="btn btn-secondary mt-4 inline-flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> Ask support
              </a>
            </div>
          ) : (
            <div className="space-y-8">
              {FAQ_CATEGORIES.filter(cat => results.some(r => r.category === cat)).map(cat => (
                <div key={cat}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-3">{cat}</h2>
                  <div className="space-y-2">
                    {results.filter(r => r.category === cat).map(item => {
                      const isOpen = open === item.q;
                      return (
                        <div key={item.q} className="card-dark overflow-hidden">
                          <button
                            onClick={() => setOpen(isOpen ? null : item.q)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition"
                            aria-expanded={isOpen}
                          >
                            <span className="text-sm font-medium text-white">{item.q}</span>
                            <ChevronDown className={`w-4 h-4 text-ink-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {/* Answers stay in the DOM even when collapsed so
                              search engines can index them; the button's
                              aria-expanded carries the visual state. */}
                          <div className={isOpen ? 'block' : 'hidden'}>
                            <p className="px-5 pb-4 text-sm text-ink-300 leading-relaxed">{item.a}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-12 card-dark p-6 text-center">
            <p className="text-white font-semibold">Still deciding?</p>
            <p className="text-sm text-ink-400 mt-1">
              Start with {SIGNUP_BONUS} free credits — enough for one Essential 30-second reel, no card needed.
            </p>
            <Link to="/register" className="btn btn-primary mt-4 inline-flex items-center gap-2">
              Create a free account
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
