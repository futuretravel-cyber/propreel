// Feasibility probe for fetching property listing descriptions + photos
// from a pasted listing URL (privateproperty.co.za, property24.com, …).
//
// This is NOT wired anywhere yet. It is a standalone exploration of:
//  - which sites are realistically scrapable / have structured feeds
//  - what we can extract (title, price, description, feature list, photos)
//  - where it breaks (anti-bot, JS-rendered galleries, paywalled data)
//  - how it would plug into the existing video wizard prefill flow
//
// This file was written as part of the exploration request only.
// It is not wired into the app and does not change any production behaviour.
//  - which sites are realistically scrapable / have structured feeds
//  - what we can extract (title, price, description, feature list, photos)
//  - where it breaks (anti-bot, JS-rendered galleries, paywalled data)
//  - how it would plug into the existing video wizard prefill flow
//
// Run with:  npx tsx scripts/explore-listing-fetch.ts <url>
// or import the functions from another script / API route.
import { setTimeout } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// 1. What we want to extract
// ---------------------------------------------------------------------------
export interface ListingSnapshot {
  url: string;
  title: string | null;
  priceText: string | null;
  description: string | null;
  features: string[];
  photos: { src: string; alt?: string | null }[];
  source: 'privateproperty' | 'property24' | 'unknown' | 'failed';
  error?: string;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// 2. Site detection (simple enough for a paste box — no heavy classifier)
// ---------------------------------------------------------------------------
export function detectSource(url: string): ListingSnapshot['source'] {
  const u = url.toLowerCase();
  if (u.includes('privateproperty.co.za')) return 'privateproperty';
  if (u.includes('property24.com')) return 'property24';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// 3. PrivateProperty.co.za
//
// Observations (manual spot checks + common patterns):
//  - Listing pages are server-rendered enough that a plain GET usually
//    returns visible description copy and a og:description meta.
//  - Photo galleries are often JS-loaded / lazy, so img srcs in the raw
//    HTML may be low-res placeholders or data-attrs rather than final URLs.
//  - There is no official public JSON listing feed that I can rely on for
//    every agent listing; scraping the page is the pragmatic fallback.
//  - Anti-bot: Cloudflare-style challenges are possible on repeat requests,
//    so this is best treated as "best-effort prefill", not a hard requirement.
// ---------------------------------------------------------------------------

const PRIVATEPROPERTY_SELECTORS = {
  title:      ['meta[property="og:title"]', 'h1.heading', 'h1'],
  price:      ['meta[property="og:description"]', '.price', '.listing-price'],
  description:['meta[name="description"]', '.description', '.listing-description', 'section[data-description]'],
  features:   ['.feature', '.amenity', '.features li', 'ul.features li'],
  photos:     ['img[src]'],
} as const;

export async function fetchPrivateProperty(url: string): Promise<ListingSnapshot> {
  const warn: string[] = [];
  const out: ListingSnapshot = {
    url,
    title: null,
    priceText: null,
    description: null,
    features: [],
    photos: [],
    source: 'privateproperty',
  };

  let html: string;
  try {
    // In Node 18+ this works without extra deps. Real usage would go through
    // a proxy / headless run / the Modal worker so the browser origin is not
    // the API server's IP.
    html = await fetchWithHints(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-ZA,en;q=0.9',
      },
    });
  } catch (err) {
    out.error = String(err);
    out.source = 'failed';
    return out;
  }

  const doc = parseHTML(html, url);

  // Title
  out.title = pick(doc, PRIVATEPROPERTY_SELECTORS.title)?.trim() ?? null;

  // Price / short description — og:description is often the price + area line
  const ogDesc = pick(doc, ['meta[property="og:description"]']).match(/content="([^"]+)"/)?.[1] ?? null;
  const priceCandidate = pick(doc, PRIVATEPROPERTY_SELECTORS.price)?.trim() ?? ogDesc;
  out.priceText = priceCandidate ?? null;

  // Longer description
  out.description = pick(doc, PRIVATEPROPERTY_SELECTORS.description)?.trim() ?? null;

  // Features
  for (const sel of PRIVATEPROPERTY_SELECTORS.features) {
    const nodes = selectAll(doc, [sel]);
    for (const n of nodes) {
      const text = n?.replace(/<[^>]+>/g, '').trim();
      if (text) out.features.push(text);
    }
    if (out.features.length) break;
  }

  // Photos — raw HTML only; real gallery URLs may need JS execution
  const images = selectAll(doc, PRIVATEPROPERTY_SELECTORS.photos);
  const seen = new Set<string>();
  for (const img of images) {
    const srcMatch = img?.match(/src=["']([^"']+)["']/);
    const src = srcMatch?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    // Skip tiny UI icons / tracking pixels
    if (src.length < 60) continue;
    out.photos.push({ src, alt: null });
    if (out.photos.length >= 20) break; // cap for prefill
  }
  if (!out.photos.length) {
    warn.push('No usable photo srcs found in raw HTML — gallery is likely JS-rendered.');
  }

  if (warn.length) out.warnings = warn;
  return out;
}

// ---------------------------------------------------------------------------
// 4. Property24.com
//
// Observations:
//  - Property24 is a larger portal and harder to read naively; listings are
//    frequently JS-rendered, and the underlying markup may be obfuscated or
//    loaded from an API call the browser makes after initial paint.
//  - An agent-owned listing page sometimes includes structured meta tags, but
//    there is no guarantee across sub-domains / layouts.
//  - Direct scraping is riskier here than on a small agent site. If we wanted
//    this to be reliable, the realistic path is either:
//      a) agent pastes a link to THEIR OWN site/property that is server-rendered,
//      b) we ask the site for structured data (no known open API here),
//      c) we render the page headless and read the DOM after JS (heavier).
// ---------------------------------------------------------------------------

export async function fetchProperty24(url: string): Promise<ListingSnapshot> {
  // Implemented as a best-effort scraper with an honest "probably incomplete" flag.
  const out: ListingSnapshot = {
    url,
    title: null,
    priceText: null,
    description: null,
    features: [],
    photos: [],
    source: 'property24',
    warnings: ['Property24 is JS-heavy; extracted data may be incomplete without headless rendering.'],
  };

  let html: string;
  try {
    html = await fetchWithHints(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-ZA,en;q=0.9',
      },
    });
  } catch (err) {
    out.error = String(err);
    out.source = 'failed';
    return out;
  }

  const doc = parseHTML(html, url);
  out.title = pick(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'h1']).trim() || null;
  out.priceText = pick(doc, ['meta[property="og:price:amount"]', 'meta[name="twitter:data1"]', '.price', 'h2'])
    .trim() || null;
  out.description = pick(doc, ['meta[name="description"]', '.description', '.listing-description', 'article'])
    .trim() || null;

  const featNodes = selectAll(doc, ['.features li', '.listing-features li', '.amenities li']);
  for (const n of featNodes) {
    const text = n.replace(/<[^>]+>/g, '').trim();
    if (text) out.features.push(text);
  }

  // Same raw-html limitation as PrivateProperty
  const imgs = selectAll(doc, ['img[src]']);
  const seen = new Set<string>();
  for (const img of imgs) {
    const m = img?.match(/src=["']([^"']+)["']/);
    const src = m?.[1];
    if (!src || seen.has(src) || src.length < 60) continue;
    seen.add(src);
    out.photos.push({ src, alt: null });
    if (out.photos.length >= 20) break;
  }

  if (!out.title && !out.description && !out.photos.length) {
    out.warnings = [...(out.warnings ?? []), 'Placeholder page or anti-bot challenge likely blocked extraction.'];
    out.source = 'failed';
  }

  return out;
}

// ---------------------------------------------------------------------------
// 5. Dispatcher
// ---------------------------------------------------------------------------
export async function fetchListing(url: string): Promise<ListingSnapshot> {
  const src = detectSource(url);
  if (src === 'privateproperty') return fetchPrivateProperty(url);
  if (src === 'property24') return fetchProperty24(url);
  return {
    url,
    title: null,
    priceText: null,
    description: null,
    features: [],
    photos: [],
    source: 'unknown',
    error: 'Unsupported listing domain. Currently supported: privateproperty.co.za, property24.com.',
  };
}

// ---------------------------------------------------------------------------
// 6. Tiny HTML helpers (no extra dependency in this probe)
// ---------------------------------------------------------------------------
type Doc = string; // raw html for this probe — real impl would use a proper parser

function parseHTML(html: string, _baseURL: string): Doc {
  // In this probe we just pass the string through and use regex-based helpers.
  // A real implementation should use a tolerant parser (cheerio / jsdom) so
  // selectors are reliable and img srcs are resolved relative to the page URL.
  return html;
}

function pick(html: Doc, selectors: readonly string[]): string {
  for (const sel of selectors) {
    const val = selectOne(html, sel);
    if (val && val.trim()) return val.trim();
  }
  return '';
}

function selectOne(html: Doc, sel: string): string {
  // Naive selector support for the common patterns we actually use:
  //   meta[property="og:title"]
  //   meta[name="description"]
  //   h1, .price, .description, img[src], ul.features li
  if (sel.startsWith('meta[')) {
    const m = html.match(new RegExp(`<meta\\s[^>]*${escapeRegex(sel.split('[')[1])}[^>]*>`));
    const contentMatch = m?.[0]?.match(/content=["']([^"']*)["']/);
    return contentMatch?.[1] ?? '';
  }
  if (sel.startsWith('img[')) {
    const xs = selectAll(html, ['img[src]']);
    return xs[0] ?? '';
  }
  // class or tag selectors
  const cls = sel.match(/^\.([a-zA-Z0-9_-]+)/);
  if (cls) {
    const m = html.match(new RegExp(`<[^>]*\\bclass=["'][^"']*\\b${escapeRegex(cls[1])}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`));
    return m?.[1] ?? '';
  }
  // bare tag
  const tag = sel.replace(/^([a-zA-Z0-9_-]+).*/, '$1');
  if (/^[a-zA-Z0-9_-]+$/.test(tag)) {
    const opening = new RegExp(`<${escapeRegex(tag)}[\\s>]`);
    const idx = html.search(opening);
    if (idx < 0) return '';
    const closeTag = `</${tag}>`;
    const closeIdx = html.indexOf(closeTag, idx);
    if (closeIdx < 0) return '';
    return html.slice(idx, closeIdx + closeTag.length);
  }
  return '';
}

function selectAll(html: Doc, selectors: readonly string[]): string[] {
  // For this probe we only use img[src] here.
  const out: string[] = [];
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/g)) {
    out.push(m[0]);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 7. Fetch with hints (no heavy library for this probe)
// ---------------------------------------------------------------------------
async function fetchWithHints(url: string, opts?: RequestInit): Promise<string> {
  // Node 18+ global fetch. For a real feature we would:
  //  - route through a headless/rendered worker for JS-heavy sites
  //  - add per-site rate limits and polite caching
  //  - normalize photo URLs, validate they are real images, not tracking pixels
  const res = await fetch(url, {
    ...opts,
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/html') && !ct.includes('application/xhtml+xml')) {
    throw new Error(`Unexpected content-type: ${ct}`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// 8. Node entrypoint: one-off validation against pasted links
// ---------------------------------------------------------------------------
// Expected env for the real version:
//   LISTING_FETCH_WORKER_URL   - the worker/API that runs fetches with hints,
//                                 optional headless rendering, and polite caching.
//   LISTING_FETCH_TIMEOUT_MS   - per-site extraction timeout.
//   LISTING_FETCH_MAX_PHOTOS   - photo cap we return to the wizard.
//
// For now this module is NOT wired into the app. It is a focused validation tool
// you can point at real pasted links to see how much of the description and
// photo set we recover before deciding whether to build the wizard chip.
// ---------------------------------------------------------------------------
// 9. Where this plugs into the existing product (not wired yet)
// ---------------------------------------------------------------------------
//
// Current video wizard prefill path (from the read files):
//   VideoWizard.tsx / BudgetVideoWizard.tsx already accept manual inputs:
//     - listing title, description, features, photo upload / selection
//   The wizard already lets an agent paste a brief and pick photos.
//
// The cleanest integration I see is:
//   - New "Paste property link" chip above the description field on the wizard.
//   - On paste/submit, call server-side extraction (not from the browser).
//   - Server returns a structured preview: title + price + description + photo set.
//   - UI fills the wizard fields and shows selected photos in the media strip,
//     exactly as if the agent had pasted them manually.
//   - Agent still edits everything — extraction is only a starting draft.
//
// This keeps the feature safe:
//   - No site is modified; we only read public listing pages.
//   - We do not depend on a private API that may not exist.
//   - Extraction failures just fall back to manual entry, not an error block.
//
// Biggest unknowns to validate before building for real:
//   - Which actual listing URLs extract cleanly from a server-side fetch?
//   - Are the photo URLs usable (real images, correct size, not expiry-binded)?
//   - Do we need headless/rendered extraction per site, or is static HTML enough
//     for the listings our agents actually paste?
//   - Rate limits / ToS: Property24 is a portal; if we hit it heavily we would
//     want a polite cache and possibly a per-domain cap.
//
// If you want, next step is a small server endpoint + wizard chip behind a flag,
// wired to a real extraction worker, and a short list of test listing URLs so we
// can see how much of the description + photo set we actually recover.
