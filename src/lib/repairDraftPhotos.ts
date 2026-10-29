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
 * `useRepairDraftPhotos(key, urls, setUrls)`:
 *   1. flags every slot whose presign is already past its X-Amz-Date+Expires
 *      (no network hit) — only OUR rehosted presigns carry those params.
 *   2. re-signs each dead slot via GET /api/users?action=media_sign
 *      (server checks the session AND the uploads/<uid>/ key prefix).
 *   3. writes the FRESH SIGNED url back into the draft (setUrls) and
 *      mirrors it in a display map keyed by the ORIGINAL slot url, so the
 *      grid repaints the healed copy in the same render that swaps the
 *      draft over.
 *
 * The draft therefore always holds a URL that works for the next hour —
 * and each visit re-heals anything that died since. One repair per mount
 * (idempotent via CACHE/inflight), re-runs on hydration landing.
 */
function presignExpiry(url: string): number | null {
  const d = /X-Amz-Date=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(url);
  const x = /X-Amz-Expires=(\d+)/.exec(url);
  if (!d || !x) return null;
  const [, y, mo, dd, hh, mm, ss] = d;
  return Date.UTC(+y, +mo - 1, +dd, +hh, +mm, +ss) + Number(x[1]) * 1000;
}

/**
 * Only a SigV4 presign expires; everything else is one of:
 *   • a plain https photo (external listing photo) — always fine;
 *   • the BUCKET host, query-stripped (a pre-repair draft) — private,
 *     403s for the browser but is still renewáble server-side;
 *   • the EDGE host, query-stripped (cut-1 of this fix persisted those) —
 *     same as the bucket form for practical purposes.
 * The first cut's mistake: judging deadness ONLY from a timestamp in the
 * URL — queryless slots were never flagged, so a draft once poisoned with
 * them stayed broken forever. Anything that is ONE OF OUR object URLs and
 * does not carry a CURRENT signature is repairable.
 */
function isReparable(url: string): boolean {
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  const ours =
    host === (import.meta.env.VITE_EDGE_RAW_HOST || 'uploads.propreel.co.za') ||
    host === (import.meta.env.VITE_EDGE_CDN_HOST || 'cdn.propreel.co.za') ||
    // Shape match only — never spell the cloud provider's domain in shipped
    // code (stealth 2026-10-27). media_sign server-side validates ownership,
    // so a false positive here merely fails to heal.
    /(^|\.)s3[.-]/.test(host);
  if (!ours) return false;
  const exp = presignExpiry(url);
  // No timestamp at all (query-stripped form) → treat as dead.
  if (exp === null) return true;
  // Timestamp present → live only if it outlasts a grace minute.
  return exp - 60_000 <= Date.now();
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
  setUrls: (next: string[]) => void,
  /** Receives {originalUrl: freshSignedUrl} for every healed slot so
   *  URL-keyed side state (the wizard's photoMeta) can follow the swap. */
  onHeal?: (healed: Record<string, string>) => void
): { healing: boolean; display: Record<string, string> } {
  const [healing, setHealing] = useState(false);
  const [display, setDisplay] = useState<Record<string, string>>({});
  const inflight = useRef(false);

  // Re-run when the draft CONTENT lands (hydration is async) — but exactly
  // one batch at a time and one per slot per page load (CACHE).
  const urlsSig = `${urls.length}:${urls[urls.length - 1] || ''}`;

  useEffect(() => {
    if (!draftKey || inflight.current) return;
    if (!urls.length || CACHE.has(draftKey)) return;
    inflight.current = true;
    (async () => {
      try {
        const dead = urls.filter(isReparable);
        if (!dead.length) { CACHE.add(draftKey); return; }
        setHealing(true);
        const healedNow = new Map<string, string>(); // original → fresh signed
        for (const u of [...new Set(dead)]) {
          const healed = await healOne(u);
          // A slot that won't heal keeps its (broken) URL — the user's fix
          // is to remove & re-upload that one photo.
          if (healed) healedNow.set(u, healed);
        }
        if (healedNow.size) {
          const healedMap = Object.fromEntries(healedNow);
          setDisplay(prev => ({ ...prev, ...healedMap }));
          setUrls(urls.map(u => healedNow.get(u) || u));
          onHeal?.(healedMap);
        }
        CACHE.add(draftKey);
      } finally {
        inflight.current = false;
        setHealing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, urlsSig]);

  return { healing, display };
}
