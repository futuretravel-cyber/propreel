/**
 * CSP build guard — the invariant behind `script-src` having no
 * `'unsafe-inline'` (security audit 2026-10-25, M-2).
 *
 * This site is a static Vite SPA served straight from Vercel's CDN, so the
 * HTML is never rendered per-request and a classic per-request **nonce** has
 * nowhere to live. The standards-approved equivalent for static hosting is:
 *
 *   every executable script is either external (`src=`, covered by 'self' or
 *   an explicit host in script-src) or a non-executing data block
 *   (`type="application/ld+json"` etc.). With zero inline scripts, dropping
 *   `'unsafe-inline'` costs nothing and blocks injected markup from running.
 *
 * This guard keeps that true forever. It fails the build when someone adds:
 *   1. an executable inline <script> (no src, JS/absent type) to any shipped
 *      HTML file,
 *   2. an inline event handler attribute (onclick= …) in shipped HTML, or
 *   3. a javascript: URL in shipped HTML,
 * and cross-checks that vercel.json's script-src still refuses
 * `'unsafe-inline'` / `'unsafe-eval'`.
 *
 * Styles are hashed, not 'unsafe-inline' (same idea, one block): every inline
 * <style> in shipped HTML must have its exact sha256 listed in style-src (or
 * style-src-elem) in vercel.json, and style-src must refuse 'unsafe-inline'.
 * If you edit an inline style block, the failure message prints the new hash
 * to paste.
 *
 * If an inline script is ever genuinely unavoidable, the migration path is
 * either an external file or a sha256 hash / nonce injected by an Edge
 * Middleware that rewrites the HTML per request — not 'unsafe-inline'.
 *
 * Run: node scripts/check-no-inline-scripts.mjs [distDir]
 * (wired into `npm run build` after `vite build`)
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';

const distDir = resolve(process.argv[2] || 'dist');
const vercelJsonPath = resolve('vercel.json');

/** Script types that actually execute and therefore need script-src approval. */
const EXECUTABLE_TYPES = new Set([
  '', // absent type attribute → classic JS
  'module',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
  'text/babel',
]);

const problems = [];
/** Inline <style> blocks found in shipped HTML, with their CSP hashes. */
const inlineStyles = [];

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...htmlFiles(p));
    else if (entry.toLowerCase().endsWith('.html')) out.push(p);
  }
  return out;
}

if (!existsSync(distDir)) {
  console.error(`[csp-guard] ${distDir} does not exist — run \`vite build\` first.`);
  process.exit(1);
}

const pages = htmlFiles(distDir);
if (pages.length === 0) {
  console.error(`[csp-guard] no .html files under ${distDir} — wrong output dir?`);
  process.exit(1);
}

for (const page of pages) {
  const rel = relative(process.cwd(), page);
  const html = readFileSync(page, 'utf8');

  // 1. Executable inline <script> elements.
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const body = m[2];
    const type = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').trim().toLowerCase();
    const hasSrc = /\bsrc\s*=/i.test(attrs);
    if (EXECUTABLE_TYPES.has(type) && !hasSrc && body.trim() !== '') {
      problems.push(`${rel}: executable inline <script> — externalize it or move the logic into the bundle`);
    }
  }

  // 2. Inline event handler attributes (onclick=, onerror=, …) — also gated by
  //    script-src once 'unsafe-inline' is gone.
  for (const m of html.matchAll(/<[a-zA-Z][^<>]*>/g)) {
    const tag = m[0];
    // Skip the JSON-LD / data-block interiors: those are between tags, and
    // this regex only matches tag markup itself.
    const handler = tag.match(/\son[a-z]+\s*=/i);
    if (handler) problems.push(`${rel}: inline event handler ${handler[0].trim()} — use addEventListener from the bundle`);
  }

  // 3. javascript: URLs.
  for (const m of html.matchAll(/(?:href|src|action)\s*=\s*["']\s*javascript:/gi)) {
    problems.push(`${rel}: javascript: URL (${m[0]}) — use a real handler from the bundle`);
  }

  // 4. Inline <style> blocks must be covered by a 'sha256-…' in the CSP's
  //    style-src (or style-src-elem) — style-src carries no 'unsafe-inline'
  //    either, so an unhashed style block silently loses its styles.
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const cssText = m[1];
    if (cssText.trim() === '') continue;
    const hash = 'sha256-' + createHash('sha256').update(cssText, 'utf8').digest('base64');
    inlineStyles.push({ rel, hash });
  }
}

// 4. The header must agree with the HTML posture.
if (existsSync(vercelJsonPath)) {
  const conf = JSON.parse(readFileSync(vercelJsonPath, 'utf8'));
  const csp = (conf.headers || [])
    .flatMap((h) => h.headers || [])
    .find((h) => h.key === 'Content-Security-Policy')?.value;
  if (!csp) {
    problems.push('vercel.json: no Content-Security-Policy header found');
  } else {
    const directives = csp.split(';').map((d) => d.trim());
    const scriptSrc = directives.find((d) => d.startsWith('script-src')) || '';
    for (const banned of ["'unsafe-inline'", "'unsafe-eval'"]) {
      if (scriptSrc.includes(banned)) {
        problems.push(`vercel.json: script-src must not contain ${banned}`);
      }
    }
    // style-src must refuse 'unsafe-inline' AND carry a hash for every inline
    // <style> block in the shipped HTML (style-src-elem wins when present).
    const styleSrc = directives.find((d) => d.startsWith('style-src-elem'))
      || directives.find((d) => d.startsWith('style-src')) || '';
    if (styleSrc.includes("'unsafe-inline'")) {
      problems.push("vercel.json: style-src must not contain 'unsafe-inline'");
    }
    for (const { rel, hash } of inlineStyles) {
      if (!styleSrc.includes(`'${hash}'`)) {
        problems.push(`${rel}: inline <style> block is not in the CSP — add '${hash}' to style-src in vercel.json (or externalize the styles)`);
      }
    }
  }
} else {
  problems.push('vercel.json not found — cannot cross-check script-src');
}

if (problems.length) {
  console.error('[csp-guard] FAILED — the shipped HTML needs inline script execution that CSP no longer allows:\n');
  for (const p of problems) console.error('  • ' + p);
  console.error('\n  Fix: put the code in an external file or the JS bundle.');
  console.error('  If inline is truly unavoidable, add a hash/nonce via Edge Middleware (see docs/security-audit-2026-10-25.md, M-2).');
  process.exit(1);
}

console.log(`[csp-guard] ok — ${pages.length} HTML page(s), no executable inline scripts; script-src has no 'unsafe-inline'/'unsafe-eval'; ${inlineStyles.length} inline style block(s) hash-matched.`);
