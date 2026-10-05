/**
 * Shared listing helpers: S3 photo upload (presigned via /api/music) and the
 * free OpenStreetMap geocoding / nearby-amenities lookups used by the
 * Description tab and the Property Listings wizard.
 */
import { PropReelAPI } from './api';

/**
 * Upload images to S3; returns public URLs. Each file goes through
 * PropReelAPI.uploadImageFile — presign (pinned size + type allowlist), PUT,
 * then server-side binary verification — so validation never depends on the
 * browser's own checks.
 *
 * This is the synchronous, single-file path (AgentBranding). Batch photo
 * drops use `enqueueImagesForAI` from ./uploadQueue instead, which runs in
 * the background and parks itself when the API rate-limits us.
 */
export async function uploadImagesForAI(files: FileList | null, userId: string | undefined, max: number): Promise<string[]> {
  if (!files || !files.length) return [];
  const urls: string[] = [];
  const list = Array.from(files).slice(0, max);
  for (const file of list) {
    const okType = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|avif)$/i.test(file.name);
    if (!okType) throw new Error(`${file.name} is not an image file`);
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is over 25MB`);
    try {
      urls.push(await PropReelAPI.uploadImageFile(userId, file));
    } catch (e: any) {
      throw new Error(e?.message ? `${file.name}: ${e.message}` : `Upload failed for ${file.name}`);
    }
  }
  return urls;
}

/**
 * Address → coordinates (OpenStreetMap, no API key).
 *
 * Primary path is our own `/api/projects?action=geocode` proxy: the browser
 * only talks to its own origin, so extensions / CORS / corporate filters can
 * no longer break map lookup (that was the "Map lookup failed" bug). The
 * proxy is retried once — a transient 504 from the function used to drop us
 * straight into a direct lookup that blocked environments kill. Only then do
 * we fall back to calling the upstreams directly (Nominatim, then Photon).
 *
 * Returns null for a genuine "address not found", throws when every path
 * failed so callers can show the retry toast honestly.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number; display: string } | null> {
  const proxied = `/api/projects?action=geocode&q=${encodeURIComponent(address)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(proxied);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.found && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))) {
          return { lat: Number(data.lat), lon: Number(data.lon), display: String(data.display || address) };
        }
        if (data && data.found === false) return null; // upstream answered: no match
        // 502/unknown shape → retry once, then fall through to direct
      }
    } catch { /* network — retry */ }
    if (attempt === 0) await new Promise(r => setTimeout(r, 400));
  }

  // Last resort: talk to the upstreams ourselves. Nominatim first, Photon
  // second (different dataset) — one blocked origin must not fail the lookup
  // on its own.
  const query = /south africa/i.test(address) ? address : `${address}, South Africa`;
  const attempts: Array<{ url: string; kind: 'nominatim' | 'photon' }> = [
    { url: `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=za&q=${encodeURIComponent(query)}`, kind: 'nominatim' },
    { url: `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`, kind: 'photon' },
  ];
  let anyUpstreamAnswered = false;
  for (const { url, kind } of attempts) {
    try {
      // 6s cap each — a hanging upstream in a blocked environment must not
      // leave the Verify button spinning indefinitely.
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      anyUpstreamAnswered = true;
      const body = await res.json();
      if (kind === 'nominatim') {
        const rows = body;
        if (Array.isArray(rows) && rows.length) {
          return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), display: rows[0].display_name || address };
        }
      } else {
        const first = Array.isArray(body?.features) ? body.features[0] : null;
        const [lon, lat] = first?.geometry?.coordinates || [];
        if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
          const p = first.properties || {};
          const display = [p.name, p.street, p.housenumber, p.city, p.state, p.country].filter(Boolean).join(', ') || address;
          return { lat: Number(lat), lon: Number(lon), display };
        }
      }
    } catch { /* blocked or offline — try the next one */ }
  }
  // Everything failed (blockers, offline) → throw so the caller shows
  // "Map lookup failed"; an answered-but-empty response is a true not-found.
  if (!anyUpstreamAnswered) throw new Error('Map lookup failed');
  return null;
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Named amenities near a confirmed point (OpenStreetMap Overpass — free).
 *  Proxied through our API first; direct Overpass mirrors as fallback. */
export async function findNearbyAmenities(lat: number, lon: number): Promise<string[]> {
  try {
    const res = await fetch(`/api/projects?action=amenities&lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.amenities)) return data.amenities;
    }
  } catch { /* proxy unreachable — fall back below */ }

  const around = (r: number) => `(around:${r},${lat},${lon})`;
  const q = `[out:json][timeout:25];(
    node${around(2000)}["amenity"~"^(school|kindergarten|hospital|clinic|pharmacy|restaurant|cafe|bar|fuel|gym|library|supermarket)$"];
    way${around(2000)}["shop"~"^(mall|supermarket|convenience)$"];
    way${around(2500)}["leisure"="park"];
  );out center 120;`;
  // Mirrors — the main instance rate-limits hard during busy periods
  const hosts = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  let data: any = null;
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}?data=${encodeURIComponent(q)}`);
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
