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
 * Every step degrades instead of failing hard: Nominatim → Photon for
 * geocoding, three Overpass mirrors for amenities.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';
const USER_AGENT = 'PropReel/1.0 (https://www.propreel.co.za; support@propreel.co.za)';

export interface GeoPoint {
  lat: number;
  lon: number;
  display: string;
}

// 8s hard cap per upstream — a hung request must never stall a function
const upstreamFetch = (url: string) =>
  fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

/**
 * Address → coordinates. Returns null when every upstream answered but found
 * nothing (a genuine "address not found"). Throws only when every upstream
 * was unreachable, so callers can tell "no match" from "lookup failed".
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const clean = String(address || '').trim().slice(0, 300);
  if (!clean) return null;

  let reachedUpstream = false;

  // 1) Nominatim (best South African address coverage)
  try {
    const res = await upstreamFetch(`${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(clean)}`);
    if (res.ok) {
      reachedUpstream = true;
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) {
        const lat = Number(rows[0].lat);
        const lon = Number(rows[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon, display: rows[0].display_name || clean };
        }
      }
    }
  } catch { /* try the fallback below */ }

  // 2) Photon — different dataset, catches what Nominatim misses
  try {
    const res = await upstreamFetch(`${PHOTON}/api/?limit=1&q=${encodeURIComponent(clean)}`);
    if (res.ok) {
      reachedUpstream = true;
      const body = await res.json();
      const first = Array.isArray(body?.features) ? body.features[0] : null;
      const [lon, lat] = first?.geometry?.coordinates || [];
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
        const p = first.properties || {};
        const display = [p.name, p.street, p.housenumber, p.city, p.state, p.country]
          .filter(Boolean).join(', ') || clean;
        return { lat: Number(lat), lon: Number(lon), display };
      }
    }
  } catch { /* fall through */ }

  if (!reachedUpstream) throw new Error('Geocoding upstreams unreachable');
  return null;
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
  let data: any = null;
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      const res = await upstreamFetch(`${host}?data=${encodeURIComponent(q)}`);
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
