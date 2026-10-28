/**
 * Stealth build guard — the invariant behind "nobody can find out which
 * vendors or models run underneath this site" (27 Oct 2026 stealth work).
 *
 * The shipped bundle is public: every visitor (and every crawler / AI
 * scraper) can read the JS, CSS, HTML and text assets Vercel serves. One
 * leftover string — a hostname, a model name, an internal route alias — is
 * enough to identify the inference stack, so the boundary is enforced at
 * build time like the CSP guard: if a vendor or model name reaches dist/,
 * the build fails.
 *
 * Two matching styles:
 *   1. SUBSTRING tokens — distinctive vendor/model spellings that cannot
 *      collide with ordinary English (no word contains "flashhead"). Matched
 *      as case-insensitive substrings so they also fire inside camelCase
 *      identifiers kept in string literals (`…generateFlashHeadVideo…`) and
 *      in filenames.
 *   2. BOUNDARY tokens — short spellings that DO collide with ordinary words
 *      ("fal" in false/default, "kling" in twinkling/sparkling, "aws" in
 *      draws, "flux" in influx). Matched only when not embedded in a longer
 *      word: standalone (`fal-ai`, "Fal", `AWS S3`, `kling-26`) or starting
 *      at a word edge (`falImage`, `KlingVideo`).
 *
 * Every pattern is checked against BOTH the file contents and the file's
 * relative path — chunk filenames derive from source filenames and are not
 * minified, so a lazily imported `useFlashHead.ts` would otherwise ship a
 * `useFlashHead-<hash>.js` chunk naming the model.
 *
 * Deliberately NOT banned: the site's own brand, and the providers users see
 * by design (Paystack checkout, Crisp/Intercom chat, Google Maps embeds).
 * Add a token here only when its absence from the bundle is an invariant.
 *
 * Run: node scripts/check-bundle-stealth.mjs [distDir]
 * (wired into `npm run build` after `vite build`)
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const distDir = resolve(process.argv[2] || 'dist');

/** Text assets worth scanning — binaries (mp4/webp/png) are not the crawl surface. */
const TEXT_EXT = new Set([
  '.html', '.js', '.mjs', '.cjs', '.css', '.json', '.svg', '.webmanifest',
  '.txt', '.xml', '.map',
]);

/**
 * Distinctive vendor/model spellings — plain case-insensitive substrings.
 * These can never collide with ordinary English, so sensitivity wins.
 */
const SUBSTRING_TOKENS = [
  // Hidden infrastructure behind the first-party api.propreel.co.za proxy
  'modal.run', 'modal.com', 'fal.run', 'fal.ai', 'fal-ai', 'fal_ai', 'fal.media',
  // LLM gateway and the TTS/video vendors billed as COGS
  'openrouter', 'narakeet', 'minimax',
  // Model names — the same vocabulary modal/app_propreel_minimax.py scrubs
  // from error text
  'flashhead', 'flashvsr', 'hailuo', 'seedance', 'seedvr',
  'gpt-4', 'gpt-image', 'wan-2',
  // Cloud internals (the uploads/CDN hosts are first-party CNAMEs)
  'amazonaws', 'dynamodb', 'af-south-1', 'cloudfront',
];

/**
 * Short spellings that collide with ordinary words — matched only outside
 * longer words (see the header). Case variants are enumerated in a character
 * class so the lookarounds can stay case-SENSITIVE (`fal` inside `false` is
 * blocked by the trailing lowercase letter, while `falImage` still fires).
 */
const BOUNDARY_TOKENS = ['fal', 'aws', 'kling', 'grok', 'gemini', 'flux'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const charClass = (s) =>
  s.split('').map((c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).join('');

const PATTERNS = [
  ...SUBSTRING_TOKENS.map((t) => ({ token: t, re: new RegExp(escapeRe(t), 'i') })),
  ...BOUNDARY_TOKENS.map((t) => ({
    token: t,
    re: new RegExp(`(?<![A-Za-z])${charClass(t)}(?![a-z])`),
  })),
];

if (!existsSync(distDir)) {
  console.error(`[stealth-guard] ${distDir} does not exist — run \`vite build\` first.`);
  process.exit(1);
}

function textFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...textFiles(p));
    else if (TEXT_EXT.has(entry.toLowerCase().slice(entry.lastIndexOf('.')))) out.push(p);
  }
  return out;
}

const files = textFiles(distDir);
if (files.length === 0) {
  console.error(`[stealth-guard] no text assets under ${distDir} — wrong output dir?`);
  process.exit(1);
}

const problems = [];
const MAX_HITS_PER_FILE = 6;

for (const file of files) {
  const rel = relative(process.cwd(), file);

  // 0. The FILENAME itself is shipped (chunk names, asset URLs) — check it
  //    with the same vocabulary before reading a byte.
  for (const { token, re } of PATTERNS) {
    if (re.test(rel)) {
      problems.push(`${rel}: filename contains "${token}" — rename the source module the chunk name derives from`);
    }
  }

  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (const { token, re } of PATTERNS) {
    let hits = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      hits += 1;
      if (hits <= MAX_HITS_PER_FILE) {
        const excerpt = lines[i].trim().slice(0, 120);
        problems.push(`${rel}:${i + 1}: "${token}" — ${excerpt}`);
      }
    }
    if (hits > MAX_HITS_PER_FILE) {
      problems.push(`${rel}: …and ${hits - MAX_HITS_PER_FILE} more line(s) containing "${token}"`);
    }
  }
}

if (problems.length) {
  console.error('[stealth-guard] FAILED — a vendor or model name reached the shipped bundle:\n');
  for (const p of problems) console.error('  • ' + p);
  console.error('\n  Fix: rename the identifier/copy that carries the string, or route the');
  console.error('  value through src-side config that is not inlined into the bundle.');
  console.error('  NOTE: `import.meta.env.*` is inlined at build time — a VITE_* env var');
  console.error('  holding a vendor URL ships it verbatim, so build env must be clean too.');
  console.error('  If the token is genuinely ours (false positive), narrow its pattern in');
  console.error('  scripts/check-bundle-stealth.mjs and say why in the comment.');
  process.exit(1);
}

console.log(`[stealth-guard] ok — ${files.length} text asset(s) scanned (contents + filenames), no vendor or model strings.`);
