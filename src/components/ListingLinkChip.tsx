import { useState, useCallback, useRef } from 'react';
import { Link2, Loader2, AlertCircle, Home, Image } from 'lucide-react';
import type { ListingSnapshot } from '../lib/listingFetch';

interface ListingLinkChipProps {
  // Wizard field setters. The chip is optional and does not change the
  // wizard contract — it only pre-fills what the wizard already accepts.
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setFeatures: (value: string[]) => void;
  setPhotos: (value: string[]) => void;

  // Existing wizard state so the chip can hide itself when the wizard is
  // already filled by other means.
  hasTitle: boolean;
  hasDescription: boolean;
  hasPhotos: boolean;

  // Server-side extraction endpoint. The browser never fetches the
  // third-party listing directly — the API route does.
  extractUrl: string;

  onExtracted: (snapshot: ListingSnapshot) => void;
}

export default function ListingLinkChip({
  setTitle,
  setDescription,
  setFeatures,
  setPhotos,
  hasTitle,
  hasDescription,
  hasPhotos,
  extractUrl,
  onExtracted,
}: ListingLinkChipProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSnippet, setLastSnippet] = useState<ListingSnapshot | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const runExtraction = useCallback(
    async (link: string) => {
      if (!link.trim() || !extractUrl) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(extractUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: link }),
        });

        if (!res.ok) {
          let message = `Extraction returned ${res.status}.`;
          try {
            const body = await res.json();
            if (body?.error) message = body.error;
          } catch {
            /* keep the status message */
          }
          throw new Error(message);
        }

        const snapshot: ListingSnapshot = await res.json();
        onExtracted(snapshot);
        setLastSnippet(snapshot);

        if (snapshot.source === 'unknown' || snapshot.source === 'failed') {
          setError(snapshot.error ?? 'Extraction did not return usable listing data.');
          return;
        }

        let filled = 0;
        if (snapshot.title) {
          setTitle(snapshot.title);
          filled++;
        }
        if (snapshot.description) {
          setDescription(snapshot.description);
          filled++;
        }
        if (snapshot.features.length) {
          setFeatures(snapshot.features);
          filled++;
        }
        if (snapshot.photos.length) {
          setPhotos(snapshot.photos);
          filled++;
        }

        if (!filled) {
          setError('Listing page was found, but no usable fields were extracted.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [extractUrl, onExtracted, setTitle, setDescription, setFeatures, setPhotos],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    runExtraction(url.trim());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed) return;
      setUrl(trimmed);
      runExtraction(trimmed);
    } catch {
      // Clipboard denied — focus the input so the user can paste manually.
      urlInputRef.current?.focus();
    }
  };

  // Only offer the chip when the wizard is missing something the link could
  // fill; a fully populated wizard does not need another prefill affordance.
  if (!(!hasTitle || !hasDescription || !hasPhotos)) return null;

  const warnings = lastSnippet?.warnings ?? [];

  return (
    <div className="mt-4 border border-white/10 rounded-xl bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
          ) : (
            <Link2 className="w-5 h-5 text-purple-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Home className="w-4 h-4 text-purple-500" />
              Paste a listing link
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-ink-500">
              best-effort prefill
            </span>
          </div>

          <p className="mt-1 text-xs text-ink-400">
            Try PrivateProperty or Property24. We will pull the title, price,
            description, features, and photos as a starting draft — you still
            edit everything.
          </p>

          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
            <div className="relative">
              <input
                ref={urlInputRef}
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.privateproperty.co.za/..."
                className="w-full bg-ink-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:border-purple-500/60"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl('');
                    setError(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-white"
                  aria-label="Clear link"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching…
                  </>
                ) : (
                  <>
                    <Image className="w-4 h-4" />
                    Extract listing
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePaste}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                Paste from clipboard
              </button>

              <a
                href="/dashboard/credits"
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white"
              >
                What things cost
              </a>
            </div>
          </form>

          {error ? (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          ) : null}

          {lastSnippet?.source &&
            lastSnippet.source !== 'unknown' &&
            lastSnippet.source !== 'failed' && (
              <div className="mt-3 text-xs text-ink-500">
                Extracted from <span className="text-ink-300">{lastSnippet.source}</span>
                {warnings.length ? (
                  <span className="block mt-1 text-amber-200/80">
                    {warnings.map((w) => (
                      <span key={w}>
                        ⚠️ {w}
                        {warnings.length > 1 ? <br /> : ''}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
