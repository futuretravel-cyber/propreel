import { useEffect, useRef, useState } from 'react';

/**
 * Draft photo URL repair — the browser-side twin of the row-level rawS3Url
 * boundary.
 *
 * Server project rows never keep an expiring presign (projects.ts normalises
 * on write and re-signs on read), but STUDIO DRAFTS live in IndexedDB
 * (lib/studioDrafts) and store whatever the upload flow returned: a 1 h
 * signed edge URL. Reload the Studio a day later and every restored draft
 * <img> 403s — and because the media origin sends `nosniff`, the browser
 * throws even the S3 XML error away, surfacing as a grid with most photos
 * missing. Users read that as "it does not upload more than 2 photos".
 *
 * `useRepairDraftPhotos(key, urls, setUrls)` runs once per draft slot after
 * hydration:
 *   1. it probes each URL (presign math first — a 1 h URL from yesterday is
 *      dead without a network hit; otherwise a HEAD),
 *   2. every dead slot is re-signed via GET /api/users?action=media_sign
 *      (server checks the session AND the uploads/<uid>/ key prefix),
 *   3. the setter is called with the CANONICAL raw bucket form (query
 *      stripped) so the draft never freezes another presign, and
 *   4. a display map original→fresh-signed is returned so the grid renders
 *      the healed copy while the draft keeps the raw form.
 *
 * Idempotent: one repair per slot per browser session (CACHE), one at a
 * time (inflight).
 */

/** Parse a SigV4 presign's expiry from the URL itself (X-Amz-Date + Expires). */
function presignExpiry(url: string): number | null {
  const d = /X-Amz-Date=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(url);
  const x = /X-Amz-Expires=(\d+)/.exec(url);
  if (!d || !x) return null;
  const [, y, mo, dd, hh, mm, ss] = d;
  return Date.UTC(+y, +mo - 1, +dd, +hh, +mm, +ss) + Number(x[1]) * 1000;
}

/** Only a presigned edge/bucket URL can expire — plain https photos can't. */
function isPresign(url: string): boolean {
  return url.includes('X-Amz-Signature=') && presignExpiry(url) !== null;
}

async function healOne(url: string): Promise<string | null> {
  const r = await fetch(`/api/users?action=media_sign&url=${encodeURIComponent(url)}`, {
    credentials: 'include',
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return typeof d.url === 'string' ? d.url : null;
}

const CACHE = new Set<string>();

export function useRepairDraftPhotos(
  draftKey: string | null,
  urls: string[],
  setUrls: (next: string[]) => void
): { healing: boolean; display: Record<string, string> } {
  const [healing, setHealing] = useState(false);
  const [display, setDisplay] = useState<Record<string, string>>({});
  const inflight = useRef(false);

  useEffect(() => {
    if (!draftKey || inflight.current) return;
    if (!urls.length || CACHE.has(draftKey)) return;
    inflight.current = true;
    (async () => {
      try {
        // Only our rehosted presigns can go stale. An uploaded photo and an
        // external listing photo both need no help.
        const suspect = urls.filter(isPresign);
        if (!suspect.length) { CACHE.add(draftKey); return; }

        const dead: string[] = [];
        await Promise.all(suspect.map(async u => {
          if ((presignExpiry(u) ?? Infinity) - 60_000 <= Date.now()) { dead.push(u); return; }
          try {
            const r = await fetch(u, { method: 'HEAD', cache: 'no-store' });
            if (r.status === 403 || r.status === 410) dead.push(u);
          } catch { /* network error ≠ signature problem — leave alone */ }
        }));
        if (!dead.length) { CACHE.add(draftKey); return; }

        setHealing(true);
        const fresh = new Map<string, string>();   // original → newly signed
        const raw = new Map<string, string>();     // original → query-stripped bucket form
        for (const u of [...new Set(dead)]) {
          const healed = await healOne(u);
          if (!healed) continue; // slot stays broken — user re-uploads that photo
          fresh.set(u, healed);
          try {
            const h = new URL(healed);
            // Canonical draft form: bucket host, no query. parseObjectUrl on
            // the server accepts both forms, so nothing downstream breaks.
            const obj = /X-Amz/.test(healed)
              ? `${h.protocol}//${h.hostname}` // edge host — resolved server-side
              : h.origin;
            raw.set(u, `${obj}${h.pathname}`);
          } catch { raw.set(u, healed); }
        }
        if (fresh.size) {
          setDisplay(prev => ({ ...prev, ...Object.fromEntries(fresh) }));
          setUrls(urls.map(u => raw.get(u) || u));
        }
        CACHE.add(draftKey);
      } finally {
        inflight.current = false;
        setHealing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  return { healing, display };
}
