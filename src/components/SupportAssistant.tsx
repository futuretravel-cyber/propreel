import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Sparkles, Loader2 } from 'lucide-react';

/**
 * Floating support assistant. Answers come from /api/chat, which retrieves
 * from the site's own FAQ/docs before asking the model — so it can only talk
 * about features PropReel actually ships, and it cites the page it used.
 *
 * Deliberately no vendor, model or key here: everything model-side is
 * server-side (see lib/chatAssistant.ts and the stealth build guard).
 */

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ href: string; label: string }>;
}

const SUGGESTIONS = [
  'How do credits work?',
  'How do I make my first video?',
  'Which tier should I start with?',
  'What happens to unused credits?',
];

const WELCOME =
  "Hi — I'm the PropReel assistant. Ask me about credits, video tiers, photo editing, or how to get a listing reel out the door. I answer from PropReel's own help pages.";

export default function SupportAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view without yanking the whole page.
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Only the conversation text goes up — no page, account or draft data.
          messages: next.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'I could not answer that just now. Please try again.');
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: String(data.answer), sources: data.sources || [] },
        ]);
      }
    } catch {
      setError('I could not reach the assistant. Check your connection, or email support@propreel.co.za.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 min-h-[48px] pl-4 pr-5 rounded-full bg-gradient-to-br from-purple-700 to-purple-500 text-white shadow-xl shadow-black/40 flex items-center gap-2 hover:scale-105 transition-transform"
          aria-label="Open the PropReel assistant"
        >
          <Sparkles className="w-5 h-5" aria-hidden />
          <span className="text-sm font-semibold hidden sm:inline">Ask PropReel</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="PropReel assistant"
          className="fixed z-40 bottom-0 right-0 sm:bottom-5 sm:right-5 w-full sm:w-[380px] h-[85vh] sm:h-auto sm:max-h-[70vh] flex flex-col card-dark border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-4 h-4 text-white" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">PropReel Assistant</p>
                <p className="text-[11px] text-ink-400 truncate">Answers from our help pages</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-ink-300 hover:text-white rounded-lg hover:bg-white/10"
              aria-label="Close the assistant"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[180px]">
            <p className="text-sm text-ink-200 leading-relaxed bg-white/[0.04] rounded-xl rounded-tl-sm px-3 py-2">
              {WELCOME}
            </p>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-xs text-purple-200 bg-purple-500/10 border border-purple-400/30 rounded-full px-3 py-2 hover:bg-purple-500/20 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <p
                  key={i}
                  className="text-sm text-white bg-purple-600/80 rounded-xl rounded-tr-sm px-3 py-2 ml-8 leading-relaxed"
                >
                  {m.content}
                </p>
              ) : (
                <div key={i} className="mr-4">
                  <p className="text-sm text-ink-200 bg-white/[0.04] rounded-xl rounded-tl-sm px-3 py-2 whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </p>
                  {!!m.sources?.length && (
                    <p className="mt-1 text-[11px] text-ink-500">
                      From{' '}
                      {m.sources.map((s, j) => (
                        <span key={s.href}>
                          {j > 0 && ' · '}
                          <a href={s.href} className="underline hover:text-purple-300">
                            {s.label}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )
            )}

            {busy && (
              <p className="flex items-center gap-2 text-xs text-ink-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Looking that up…
              </p>
            )}

            {error && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                {error}{' '}
                <a href="mailto:support@propreel.co.za" className="underline">
                  Email support
                </a>
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-white/[0.02]"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about credits, tiers, setup…"
              aria-label="Your question"
              maxLength={500}
              className="flex-1 bg-ink-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-purple-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-purple-500 transition"
              aria-label="Send question"
            >
              <Send className="w-4 h-4" aria-hidden />
            </button>
          </form>

          <p className="px-4 pb-3 text-[10px] text-ink-500 leading-snug">
            AI answers can be wrong — check{' '}
            <a href="/faq" className="underline hover:text-purple-300">the FAQ</a> or{' '}
            <a href="/ai-notice" className="underline hover:text-purple-300">how we use AI</a>.
          </p>
        </div>
      )}
    </>
  );
}
