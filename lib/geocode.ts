/**
 * Server-side OpenStreetMap lookups (Nominatim / Photon / Overpass).
 *
 * The browser used to call these upstreams directly. That breaks whenever a
 * client environment blocks third-party origins (privacy extensions, corporate
 * filters, CORS quirks) — the user just sees "Map lookup failed". Routing the
 * lookup through our own API means the browser only ever talks to its own
 * origin, and the server sends a proper identifying User-Agent (required by
 * Nominatim's usage policy).
 *
 * Every step degrades instead of failing hard: Nominatim and Photon race in
 * parallel for geocoding (first real answer wins), three Overpass mirrors
 * for amenities.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';
const USER_AGENT = 'PropReel/1.0 (https://www.propreel.co.za; support@propreel.co.za)';

export interface GeoPoint {
  lat: number;
  lon: number;
  display: string;
}

// 8s hard cap per upstream — a hung request must never stall a function.
// Geocoding runs its two upstreams in parallel so the wall clock stays
// inside this budget instead of adding it up (see geocodeAddress).
const upstreamFetch = (url: string, timeoutMs = 8000) =>
  fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });

/**
 * Address → coordinates. Returns null when every upstream answered but found
 * nothing (a genuine "address not found"). Throws only when every upstream
 * was unreachable, so callers can tell "no match" from "lookup failed".
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const clean = String(address || '').trim().slice(0, 300);
  if (!clean) return null;
  // Bias every lookup to South Africa: this is an SA-only product, and an
  // unbiasased query like "18 Marlo Road, Constantia" happily resolves to a
  // Marlo Road in Prince Edward Island, Canada.
  const saQuery = (q: string) => (/south africa/i.test(q) ? q : `${q}, South Africa`);
  const query = saQuery(clean);

  // Both upstreams race with early resolution: as soon as either answers
  // with a point we return. The old sequential chain let one hanging
  // upstream consume the function's whole time budget (Photon, in
  // particular, hangs on Vercel's network) — the function died with a 504,
  // the browser fell back to a direct lookup that blocked environments kill,
  // and the user just saw "Map lookup failed".
  type Outcome = { point: GeoPoint | null; ok: boolean };

  const tryNominatim = async (q: string, timeoutMs: number): Promise<Outcome> => {
    try {
      const res = await upstreamFetch(`${NOMINATIM}/search?format=json&limit=1&countrycodes=za&q=${encodeURIComponent(q)}`, timeoutMs);
      if (!res.ok) return { point: null, ok: false };
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) {
        const lat = Number(rows[0].lat);
        const lon = Number(rows[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { point: { lat, lon, display: rows[0].display_name || q }, ok: true };
        }
      }
      return { point: null, ok: true }; // answered, no match
    } catch { return { point: null, ok: false }; }
  };

  const tryPhoton = async (q: string, timeoutMs: number): Promise<Outcome> => {
    try {
      const res = await upstreamFetch(`${PHOTON}/api/?limit=1&q=${encodeURIComponent(q)}`, timeoutMs);
      if (!res.ok) return { point: null, ok: false };
      const body = await res.json();
      const first = Array.isArray(body?.features) ? body.features[0] : null;
      const [lon, lat] = first?.geometry?.coordinates || [];
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
        const p = first.properties || {};
        const display = [p.name, p.street, p.housenumber, p.city, p.state, p.country]
          .filter(Boolean).join(', ') || q;
        return { point: { lat: Number(lat), lon: Number(lon), display }, ok: true };
      }
      return { point: null, ok: true };
    } catch { return { point: null, ok: false }; }
  };

  /** Race both upstreams; resolve early on the first point, or once both settle. */
  const race = (q: string, photonMs: number, nominatimMs: number) =>
    new Promise<{ point: GeoPoint | null; answered: boolean }>((resolve) => {
      let pending = photonMs > 0 ? 2 : 1;
      let answered = false;
      let settled = false;
      const finish = (o: Outcome) => {
        if (settled) return;
        if (o.ok) answered = true;
        if (o.point) { settled = true; resolve({ point: o.point, answered: true }); return; }
        pending -= 1;
        if (pending === 0) { settled = true; resolve({ point: null, answered }); }
      };
      // Nominatim answers in ~0.6–1.7s from Vercel; 2.8s covers the bursts.
      tryNominatim(q, nominatimMs).then(finish);
      // Photon's cap stays small — when it hangs (Vercel → komoot routes)
      // it must not eat the whole budget; when it answers it's usually <1s.
      if (photonMs > 0) tryPhoton(q, photonMs).then(finish);
    });

  // Three progressively looser rounds, each capped, total worst case ≈ 8.7s
  // (under Vercel Hobby's 10s limit):
  //   1. the full query — landmarks, suburbs and well-mapped streets hit here
  //   2. house numbers dropped — SA's OSM data rarely carries them
  //   3. locality only — pin lands in the right suburb for the agent to confirm
  // The old single sequential chain let one hanging upstream (Photon, on
  // Vercel's network) consume the whole budget — the function died with a
  // 504, the browser fell back to a direct lookup that blocked environments
  // kill, and the user just saw "Map lookup failed".
  const NOMINATIM_MS = 2800;

  // Round 1 — the full query.
  const first = await race(query, 1800, NOMINATIM_MS);
  if (first.point) return first.point;
  let answered = first.answered;

  // Round 2 — strip a leading house number ("17 Main Road, Camps Bay, Cape
  // Town" → "Main Road, Camps Bay, Cape Town") so the pin lands on the street.
  const trimmed = clean.replace(/^\d+\s+/, '');
  if (trimmed !== clean && trimmed.length >= 3) {
    const second = await race(saQuery(trimmed), 0, NOMINATIM_MS);
    if (second.point) return second.point;
    answered = answered || second.answered;
  }

  // Round 3 — street-level coverage is thin, so fall back to the last two
  // segments ("…, Camps Bay, Cape Town"): the display string shows the agent
  // exactly which locality they're confirming.
  const parts = clean.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const locality = parts.slice(-2).join(', ');
    if (locality && locality.toLowerCase() !== clean.toLowerCase()) {
      const third = await race(saQuery(locality), 0, NOMINATIM_MS);
      if (third.point) return third.point;
      answered = answered || third.answered;
    }
  }

  if (answered) return null; // upstreams answered: genuine "address not found"
  throw new Error('Geocoding upstreams unreachable');
}

/**
 * Named amenities around a confirmed pin (used to weave locality into the
 * description copy). Mirrors — the main Overpass instance rate-limits hard.
 *
 * All mirrors race in parallel (first valid payload wins): the two backups
 * routinely need 20s+ to answer, so the old sequential loop burned the whole
 * budget waiting on dead mirrors while the healthy one had already failed
 * with a transient 429 — that was the "Nearby amenities lookup failed" toast
 * the Description tab kept showing. Throws when every mirror fails.
 */
const AMENITY_TTL_MS = 15 * 60 * 1000;
const amenityCache = new Map<string, { rows: string[]; expires: number }>();

export async function nearbyAmenities(lat: number, lon: number): Promise<string[]> {
  // Warm-instance cache: retrying the same pin during one editing session
  // answers instantly instead of re-rolling the same flaky mirrors.
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = amenityCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.rows;
  amenityCache.delete(cacheKey);

  const around = (r: number) => `(around:${r},${lat},${lon})`;
  const q = `[out:json][timeout:25];(
    node${around(2000)}["amenity"~"^(school|kindergarten|hospital|clinic|pharmacy|restaurant|cafe|bar|fuel|gym|library|supermarket)$"];
    way${around(2000)}["shop"~"^(mall|supermarket|convenience)$"];
    way${around(2500)}["leisure"="park"];
  );out center 120;`;

  const hosts = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  // 25s total budget: the old 8.5s was sized for the function's former ~10s
  // limit, which vercel.json has since lifted to maxDuration 60 — one slow
  // mirror used to starve everything after it of its whole budget.
  const BUDGET_MS = 25_000;
  const started = Date.now();

  const queryMirror = async (host: string, timeoutMs: number): Promise<any> => {
    const res = await upstreamFetch(`${host}?data=${encodeURIComponent(q)}`, timeoutMs);
    if (!res.ok) throw new Error(`${host} → HTTP ${res.status}`);
    const body = await res.json();
    if (!body || !Array.isArray(body.elements)) throw new Error(`${host} → unexpected payload`);
    return body;
  };

  // First valid payload wins; the slow mirrors are only awaited while every
  // fast one has yet to answer (manual race — Promise.any needs an ES2021 lib).
  const raceMirrors = (): Promise<any> =>
    new Promise((resolve, reject) => {
      const remaining = BUDGET_MS - (Date.now() - started);
      if (remaining <= 0) { reject(new Error('amenities time budget exhausted')); return; }
      const timeoutMs = Math.min(15_000, remaining);
      let pending = hosts.length;
      const errs: string[] = [];
      for (const host of hosts) {
        queryMirror(host, timeoutMs).then(resolve, (e: unknown) => {
          errs.push(e instanceof Error ? e.message : String(e));
          if (--pending === 0) reject(new Error(errs.join('; ').slice(0, 300)));
        });
      }
    });

  let data: any = null;
  let lastErr: unknown = null;
  for (let round = 0; round < 2; round++) {
    try {
      data = await raceMirrors();
      break;
    } catch (e) {
      lastErr = e;
      // One more parallel shot whenever the budget can still fit a
      // meaningful round — transient 429 bursts AND slow-mirror timeouts
      // (504) both recover on a re-roll. raceMirrors() refuses to start a
      // round that cannot finish inside the deadline.
      const elapsed = Date.now() - started;
      if (BUDGET_MS - elapsed >= 7000) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      break;
    }
  }
  if (!data) throw new Error(`Nearby amenities lookup failed (${lastErr instanceof Error ? lastErr.message : 'unknown'})`);

  type Row = { name: string; kind: string; dist: number };
  const rows: Row[] = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    const name = t.name || t['name:en'];
    const kind = t.amenity || t.shop || (t.leisure === 'park' ? 'park' : null);
    if (!name || !kind) continue;
    const elLat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
    const elLon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
    const dist = typeof elLat === 'number' && typeof elLon === 'number' ? haversineKm(lat, lon, elLat, elLon) : 99;
    rows.push({ name, kind, dist });
  }
  rows.sort((a, b) => a.dist - b.dist);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${r.name} (${r.kind}, ${r.dist < 10 ? `${(r.dist * 1000).toFixed(0)}m` : `${r.dist.toFixed(1)}km`} away)`);
    if (out.length >= 10) break;
  }
  if (amenityCache.size > 200) amenityCache.clear();
  amenityCache.set(cacheKey, { rows: out, expires: Date.now() + AMENITY_TTL_MS });
  return out;
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
