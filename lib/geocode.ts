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
  const query = /south africa/i.test(clean) ? clean : `${clean}, South Africa`;

  // Nominatim and Photon run IN PARALLEL with early resolution: as soon as
  // either answers with a point we return, instead of the old sequential
  // chain (whose timeouts ADDED UP past Vercel Hobby's 10s limit — the
  // function died with a 504, the browser fell back to a direct lookup that
  // blocked environments kill, and the user just saw "Map lookup failed").
  // Worst case is now max(Nominatim, Photon) ≈ 8.3s, not their sum.
  type Outcome = { point: GeoPoint | null; ok: boolean };

  // 1) Nominatim (best South African address coverage) — hard-filtered to ZA
  const tryNominatim = async (): Promise<Outcome> => {
    try {
      const res = await upstreamFetch(`${NOMINATIM}/search?format=json&limit=1&countrycodes=za&q=${encodeURIComponent(query)}`);
      if (!res.ok) return { point: null, ok: false };
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) {
        const lat = Number(rows[0].lat);
        const lon = Number(rows[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { point: { lat, lon, display: rows[0].display_name || clean }, ok: true };
        }
      }
      return { point: null, ok: true }; // answered, no match
    } catch { return { point: null, ok: false }; }
  };

  // 2) Photon — different dataset, catches what Nominatim misses
  const tryPhoton = async (): Promise<Outcome> => {
    try {
      const res = await upstreamFetch(`${PHOTON}/api/?limit=1&q=${encodeURIComponent(query)}`);
      if (!res.ok) return { point: null, ok: false };
      const body = await res.json();
      const first = Array.isArray(body?.features) ? body.features[0] : null;
      const [lon, lat] = first?.geometry?.coordinates || [];
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
        const p = first.properties || {};
        const display = [p.name, p.street, p.housenumber, p.city, p.state, p.country]
          .filter(Boolean).join(', ') || clean;
        return { point: { lat: Number(lat), lon: Number(lon), display }, ok: true };
      }
      return { point: null, ok: true };
    } catch { return { point: null, ok: false }; }
  };

  return new Promise<GeoPoint | null>((resolve, reject) => {
    let pending = 2;
    let answered = false;
    let settled = false;
    // First upstream to produce a point wins — both are OSM-derived, and
    // waiting for a slow one after the other already answered is exactly
    // what used to blow the function's time budget.
    const finish = (o: Outcome) => {
      if (settled) return;
      if (o.ok) answered = true;
      if (o.point) { settled = true; resolve(o.point); return; }
      pending -= 1;
      if (pending === 0) {
        settled = true;
        // At least one upstream answered with nothing → genuine not-found;
        // every upstream failed → caller shows "Map lookup failed".
        if (answered) resolve(null);
        else reject(new Error('Geocoding upstreams unreachable'));
      }
    };
    tryNominatim().then(finish);
    tryPhoton().then(finish);
  });
}

/**
 * Named amenities around a confirmed pin (used to weave locality into the
 * description copy). Mirrors — the main Overpass instance rate-limits hard.
 * Throws when every mirror fails.
 */
export async function nearbyAmenities(lat: number, lon: number): Promise<string[]> {
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
  // Total budget across mirrors: three 8s attempts in a row overflowed the
  // function's ~10s limit and the whole lookup died with a 504.
  const deadline = Date.now() + 8500;
  let data: any = null;
  let lastErr: unknown = null;
  for (const host of hosts) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { lastErr = new Error('amenities time budget exhausted'); break; }
    try {
      const res = await upstreamFetch(`${host}?data=${encodeURIComponent(q)}`, Math.min(8000, remaining));
      if (!res.ok) { lastErr = new Error(`${host} → HTTP ${res.status}`); continue; }
      const body = await res.json();
      if (!body || !Array.isArray(body.elements)) { lastErr = new Error(`${host} → unexpected payload`); continue; }
      data = body;
      break;
    } catch (e) {
      lastErr = e; // network error or HTML rate-limit page — try next mirror
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
  return out;
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
