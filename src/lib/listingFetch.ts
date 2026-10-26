// Server-side, best-effort property listing extraction.
//
// This is the extraction layer for the "Paste a listing link" wizard chip.
// It is intentionally optional and best-effort: on failure it returns a
// structured result that the wizard can ignore and fall back to manual entry.
//
// Current scope:
//   - privateproperty.co.za
//   - property24.com
//   - everything else -> unsupported
//
// Design notes:
//   - Extraction should run server-side, not from the browser.
//   - The server layer can add polite caching, per-domain rate limits, and
//     optional rendered extraction for JS-heavy pages.
//   - This file is the shape + normalization layer; the actual fetch strategy
//     can be swapped without changing the wizard contract.

export interface ListingSnapshot {
  url: string;
  source: 'privateproperty' | 'property24' | 'unknown' | 'failed';
  title: string | null;
  priceText: string | null;
  description: string | null;
  features: string[];
  photos: string[];
  raw?: {
    titleRaw?: string | null;
    descriptionRaw?: string | null;
    priceRaw?: string | null;
  };
  error?: string;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function detectSource(url: string): ListingSnapshot['source'] {
  const u = url.toLowerCase().trim();
  if (u.includes('privateproperty.co.za')) return 'privateproperty';
  if (u.includes('property24.com')) return 'property24';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export async function fetchListing(
  url: string,
  options?: { maxPhotos?: number; timeoutMs?: number },
): Promise<ListingSnapshot> {
  const maxPhotos = options?.maxPhotos ?? 20;
  const timeoutMs = options?.timeoutMs ?? 20000;

  const source = detectSource(url);
  if (source === 'unknown') {
    return {
      url,
      source: 'unknown',
      title: null,
      priceText: null,
      description: null,
      features: [],
      photos: [],
      error: 'Unsupported listing domain. Currently supported: privateproperty.co.za and property24.com.',
      warnings: [],
    };
  }

  try {
    const html = await fetchWithHints(url, timeoutMs);
    return extractFromHTML(html, url, source, maxPhotos);
  } catch (error) {
    return {
      url,
      source,
      title: null,
      priceText: null,
      description: null,
      features: [],
      photos: [],
      error: String(error),
      warnings: [],
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP with hints
// ---------------------------------------------------------------------------

async function fetchWithHints(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-ZA,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ListingFetchError(
        `listing fetch failed: ${response.status} ${response.statusText}`,
        response.status,
        url,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new ListingFetchError(
        `unexpected content-type: ${contentType}`,
        response.status,
        url,
      );
    }

    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Extraction from HTML
// ---------------------------------------------------------------------------

function extractFromHTML(
  html: string,
  url: string,
  source: ListingSnapshot['source'],
  maxPhotos: number,
): ListingSnapshot {
  const warnings: string[] = [];
  const raw: ListingSnapshot['raw'] = {};

  const title = extractMetaOrText(html, [
    ['meta[property="og:title"]', 'content'],
    // Property24 sometimes uses twitter cards / data attributes
    ['meta[name="twitter:title"]', 'content'],
  ]);
  raw.titleRaw = title[0] ?? null;

  const description = extractMetaOrText(html, [
    ['meta[property="og:description"]', 'content'],
    ['meta[name="description"]', 'content'],
    ['meta[name="twitter:description"]', 'content'],
  ]);
  raw.descriptionRaw = description[0] ?? null;

  const price = extractMetaOrText(html, [
    ['meta[property="og:price:amount"]', 'content'],
    ['meta[name="twitter:data1"]', 'content'],
  ]);
  raw.priceRaw = price[0] ?? null;

  let descriptionText = description[0] ?? null;
  if (!descriptionText) {
    const fallback = firstNonEmptyText(html, [
      '.description',
      '.listing-description',
      'section[data-description]',
      'article',
    ]);
    if (fallback) {
      descriptionText = fallback;
      warnings.push('Description came from body markup, not a structured meta tag.');
    }
  }

  let priceText = price[0] ?? null;
  if (!priceText && source === 'privateproperty') {
    const priceFallback = firstNonEmptyText(html, ['.price', '.listing-price']);
    if (priceFallback) {
      priceText = priceFallback;
      warnings.push('Price came from body markup, not a structured meta tag.');
    }
  }

  if (!title[0] && !descriptionText && !photosFromHTML(html, maxPhotos).length && !priceText) {
    return {
      url,
      source,
      title: null,
      priceText: null,
      description: null,
      features: [],
      photos: [],
      raw: { titleRaw: null, descriptionRaw: null, priceRaw: null },
      warnings: [
        ...(warnings ?? []),
        'Page looks like a placeholder, redirect, or anti-bot challenge.',
      ],
      error: 'No usable listing content found in the page.',
    };
  }

  const features = extractFeatures(html);
  const photos = photosFromHTML(html, maxPhotos);
  if (source === 'property24' && !photos.length) {
    warnings.push(
      'Property24 is JS-heavy; photos from the raw HTML are often incomplete without rendered extraction.',
    );
  }

  return {
    url,
    source,
    title: title[0] ?? null,
    priceText,
    description: descriptionText,
    features,
    photos,
    raw,
    warnings: warnings.length ? warnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// Small extraction helpers
// ---------------------------------------------------------------------------

type MetaSelector = readonly [selector: string, attr: 'content' | 'src' | 'href'];

function extractMetaOrText(html: string, selectors: MetaSelector[]): [string | null, string | null] {
  for (const [sel, attr] of selectors) {
    const value = readMetaAttribute(html, sel, attr);
    if (value) return [value, sel];
  }
  return [null, null];
}

function readMetaAttribute(html: string, selector: string, attr: 'content' | 'src' | 'href'): string | null {
  const { tag, predicate } = parseSelector(selector);
  const idx = html.indexOf(`<${tag}`);
  if (idx < 0) return null;

  const endIdx = html.indexOf('>', idx);
  if (endIdx < 0) return null;
  const tagSlice = html.slice(idx, endIdx + 1);

  if (!matchesPredicate(tagSlice, predicate)) return null;

  if (attr === 'content') {
    const m = tagSlice.match(/content\s*=\s*["']([^"']*)["']/i);
    return m?.[1] ?? null;
  }
  if (attr === 'src') {
    const m = tagSlice.match(/src\s*=\s*["']([^"']*)["']/i);
    return m?.[1] ?? null;
  }
  if (attr === 'href') {
    const m = tagSlice.match(/href\s*=\s*["']([^"']*)["']/i);
    return m?.[1] ?? null;
  }
  return null;
}

function parseSelector(selector: string): { tag: string; predicate?: (s: string) => boolean } {
  const trimmed = selector.trim();
  if (trimmed.startsWith('meta[')) {
    const [base, condition] = trimmed.split(/\[/, 2);
    const tag = base || 'meta';
    const name = condition?.replace(/\]$/, '');
    return {
      tag,
      predicate: (s: string) => {
        if (name.startsWith('property=')) {
          const val = name.replace(/^property=/, '');
          return regexAttr(s, 'property', val);
        }
        if (name.startsWith('name=')) {
          const val = name.replace(/^name=/, '');
          return regexAttr(s, 'name', val);
        }
        return false;
      },
    };
  }

  if (trimmed.startsWith('img[')) {
    const name = trimmed.replace(/^img\[/, '').replace(/\]$/, '');
    return {
      tag: 'img',
      predicate: (s: string) => regexAttr(s, 'src', name.replace(/^src=/, '')),
    };
  }

  const simpleTag = trimmed.replace(/^[a-zA-Z0-9_-]+/, '$0');
  return { tag: simpleTag };
}

function regexAttr(attrs: string, name: string, value: string): boolean {
  const pattern = new RegExp(
    `\\b${escapeRegex(name)}\\s*=\\s*["']${escapeRegex(value)}["']`,
    'i',
  );
  return pattern.test(attrs);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPredicate(tagSlice: string, predicate?: (s: string) => boolean): boolean {
  if (!predicate) return true;
  return predicate(tagSlice);
}

function firstNonEmptyText(html: string, selectors: string[]): string | null {
  for (const sel of selectors) {
    const text = textForSelector(html, sel);
    if (text && text.trim()) return text.trim();
  }
  return null;
}

function textForSelector(html: string, selector: string): string {
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    const elements = tagElementsByClass(html, className);
    for (const el of elements) {
      const text = stripTags(el).trim();
      if (text) return text;
    }
    return '';
  }

  const tag = selector.replace(/[^a-zA-Z0-9_-].*/, '');
  return tag ? textByTag(html, tag) : '';
}

function tagElementsByClass(html: string, className: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(
    `<[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    'i',
  );
  for (const m of html.matchAll(regex)) {
    results.push(m[0]);
  }
  return results;
}

function textByTag(html: string, tag: string): string {
  const opening = new RegExp(`<${escapeRegex(tag)}[\\s>]`);
  const idx = html.search(opening);
  if (idx < 0) return '';

  const closeTag = `</${tag}>`;
  const closeIdx = html.indexOf(closeTag, idx);
  if (closeIdx < 0) return '';

  return html.slice(idx, closeIdx + closeTag.length);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function extractFeatures(html: string): string[] {
  const features: string[] = [];
  const classPatterns = [
    '.features li',
    '.listing-features li',
    '.amenities li',
    '.feature li',
  ];

  for (const pattern of classPatterns) {
    const items = liElementsByClass(html, pattern.replace(/ li$/, ''));
    for (const item of items) {
      const text = stripTags(item).trim();
      if (text) features.push(text);
    }
    if (features.length) break;
  }

  return features;
}

function liElementsByClass(html: string, className: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(
    `<li[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/li>`,
    'i',
  );
  for (const m of html.matchAll(regex)) {
    results.push(m[0]);
  }
  return results;
}

function photosFromHTML(html: string, maxPhotos: number): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const src = m[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);

    if (src.length < 60) continue;
    if (src.startsWith('data:')) continue;

    try {
      const url = new URL(src, 'https://example.invalid');
      if (url.pathname.includes('placeholder') || url.pathname.includes('icon')) continue;
    } catch {
      continue;
    }

    photos.push(src);
    if (photos.length >= maxPhotos) break;
  }

  return photos;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ListingFetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = 'ListingFetchError';
  }
}
