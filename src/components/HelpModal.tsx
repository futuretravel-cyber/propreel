import { useState, useMemo } from 'react';
import { X, Search, ChevronDown, MessageCircle, BookOpen } from 'lucide-react';

interface FaqItem {
  q: string;
  a: string;
  category: string;
}

const FAQS: FaqItem[] = [
  { category: 'Getting Started', q: 'How do credits work?', a: 'Every action in PropReel uses credits: AI photo edits cost 2 credits, video tiers cost 5–250 credits depending on tier (Essential 5–10, Social 30–80, Cinematic 40–105, Premium 85–250), and AI Avatar talking-head videos are billed 2 credits per 10 seconds of narration (90-second cap). You get 5 free credits on signup, and plan credits renew monthly. FIFO expiry: oldest credits are spent first.' },
  { category: 'Getting Started', q: 'How do I create my first video?', a: 'Open the Video Generator and follow the 8 steps: add a property description, pick a video tier (start with Essential to try it out), upload your photos, choose orientation and a voice, then hit Generate on the last step. Your video usually renders in a few minutes and appears under Projects when ready.' },
  { category: 'Getting Started', q: 'What are project templates?', a: 'Templates pre-fill property type, tier, and style defaults so you can move faster. Find them via the Templates button on the Projects page — options include Family Home, Luxury Villa, Apartment, Commercial, Vacant Land, and New Development.' },
  { category: 'Credits & Billing', q: 'How do I top up credits?', a: 'Go to Dashboard → Credits, pick a bundle or a custom amount (minimum R50), and pay securely with Paystack using card, EFT, or SnapScan. Credits are added the moment your payment is confirmed.' },
  { category: 'Credits & Billing', q: 'Do unused credits roll over?', a: 'Plan credits expire at the end of each billing month. Purchased credit bundles last 12 months. We always spend your oldest credits first, and you can see exactly what expires when on Credits → Billing under Credit Expiry Timeline.' },
  { category: 'Credits & Billing', q: 'Can I cancel anytime?', a: 'Yes — no contracts. Cancel from Credits → Billing → Manage Subscription; your plan stays active until the end of the paid period, then moves to the free tier. See our Refund Policy for details.' },
  { category: 'Videos & Renders', q: 'My render failed. What now?', a: 'Open the failed project and press Retry, or contact support if the problem persists.' },
  { category: 'Videos & Renders', q: 'How long does a render take?', a: 'Essential and Social tiers typically render in 2–4 minutes. Cinematic and Premium tiers take 5–10 minutes depending on length and voice-over. You will get a notification the moment yours is ready.' },
  { category: 'Videos & Renders', q: 'What is the AI Photo Editor?', a: 'It enhances listing photos in one click: twilight conversion, sky replacement, lawn greening, decluttering, and virtual staging. Each enhancement costs 2 credits and you can compare before/after side by side before saving.' },
  { category: 'Account & Agency', q: 'How does the agency plan work?', a: 'The Agency plan gives you a shared 5,000-credit pool. Invite team members from the Agency page, assign roles, and transfer credits between agents. Agency owners see team-wide analytics.' },
  { category: 'Account & Agency', q: 'How do I delete my account?', a: 'Go to Settings → Account → Delete Account. We permanently remove your data in line with POPIA within 30 days. Active subscriptions should be cancelled first.' },
  { category: 'Account & Agency', q: 'Is my listing data safe?', a: 'Yes. Property data is encrypted in transit and at rest (AWS DynamoDB, af-south-1 region — data stays in South Africa). We never sell data or use your listings to train AI models. Full details in our Privacy Policy and PAIA Manual.' },
];

const CATEGORIES = [...new Set(FAQS.map(f => f.category))];

export default function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const results = useMemo(() => {
    if (!query.trim()) return FAQS;
    const q = query.toLowerCase();
    return FAQS.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
  }, [query]);

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

          <div className="p-3 border-t border-white/5 text-center flex-shrink-0">
            <p className="text-xs text-ink-500">
              Still stuck? Email{' '}
              <a href="mailto:support@propreel.co.za" className="text-purple-400 hover:text-purple-300">support@propreel.co.za</a>
              {' '}— we reply within one business day.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
