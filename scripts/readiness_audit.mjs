/**
 * Public-launch readiness audit (black box, against a running deployment).
 *
 *   node scripts/readiness_audit.mjs                                  # production
 *   READY_BASE=https://staging.example.com node scripts/readiness_audit.mjs
 *   READY_SKIP_LLM=1 node scripts/readiness_audit.mjs                 # no /api/chat call
 *
 * What it answers: "could a stranger land here today and have a safe,
 * working, indexable experience?"
 *
 *   A. Transport & security headers (http→https, apex→www, HSTS, CSP, …)
 *   B. Every public route serves the SPA shell with a 200
 *   C. Static/SEO assets resolve (robots, sitemap + every URL in it, OG image,
 *      manifest, icons) and nothing sensitive is served (.env, source, docs)
 *   D. API contract: unauthenticated data routes refuse, health reports,
 *      the assistant answers, malformed input is a 4xx not a 500 with a stack
 *   E. Rendered experience: console errors, title/canonical/H1, legal copy,
 *      cookie consent, load timing and JS weight
 *
 * Exit 1 on any FAIL. WARN never fails the run (they are launch judgement
 * calls, e.g. a soft 404 or a missing canonical on a secondary route).
 * Exit 2 if no check ran at all, so an empty audit can never look green.
 *
 * It never writes anything and never sends credentials. The only mutating
 * call is a signed-payload-less request to the payment webhook, which must be
 * rejected — that is the point of the check.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.env.READY_BASE || 'https://www.propreel.co.za').replace(/\/$/, '');
const HOST = new URL(BASE).host;
const APEX = HOST.replace(/^www\./, '');
const OUT = process.env.READY_OUT || '.tmp_readiness.json';
const SKIP_LLM = process.env.READY_SKIP_LLM === '1';
const TIMEOUT = Number(process.env.READY_TIMEOUT || 30000);

const results = [];
const add = (area, name, status, detail) => {
  results.push({ area, name, status, detail });
  const tag = status === 'PASS' ? ' ok ' : status === 'WARN' ? 'warn' : 'FAIL';
  console.log(`[${tag}] ${area} · ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── public surface ───────────────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  '/', '/pricing', '/reviews', '/about', '/contact', '/tutorial', '/faq',
  '/blog', '/blog/property-listing-video-south-africa', '/blog/social-media-marketing-estate-agents',
  '/login', '/register',
  '/terms', '/privacy', '/cookies', '/paia', '/refund-policy', '/dpa', '/ai-notice',
];

const LEGAL_ROUTES = ['/terms', '/privacy', '/cookies', '/paia', '/refund-policy', '/dpa'];

// Paths that would be a real leak if the static layer ever served them raw.
// The SPA rewrite means most of these come back as text/html — that is fine;
// what matters is that no *file* content (JSON/markdown/source) comes back.
const SENSITIVE_PATHS = [
  '/.env', '/.env.local', '/.env.live', '/.env.vercel', '/.vercel_env_prod',
  '/package.json', '/vercel.json', '/tsconfig.json', '/README.md', '/build.log',
  '/src/main.tsx', '/src/App.tsx', '/lib/auth.ts', '/api/leads.ts', '/api/users.ts',
  '/docs/pricing-cost-analysis.md', '/docs/security-audit.md', '/credit-pricing-runbook.md',
  '/pricing-cost-analysis.md', '/scripts/_admin_api_key.txt', '/backups/',
  '/.git/config', '/.git/HEAD', '/.vercel/project.json', '/node_modules/react/package.json',
];

// Unauthenticated data routes: each must refuse, never return rows.
// Probed WITH an identifier, because that is the real attack: "you are not
// allowed to read any row, including one you can name". A bare path that
// answers "provide ?id=" proves nothing about the gate.
const PROTECTED_APIS = [
  '/api/users?id=usr_readiness_probe',
  '/api/users?email=nobody@example.com',
  '/api/users?action=list&id=usr_readiness_probe',
  '/api/users?action=admin_stats',
  '/api/projects?user_id=usr_readiness_probe',
  '/api/credits?action=report&user_id=usr_readiness_probe',
  '/api/leads?action=review_queue',
  '/api/leads?action=agency_members&user_id=usr_readiness_probe',
  '/api/subscriptions',
];

const SECRET_PATTERNS = [
  ['AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['AWS secret access key assignment', /aws_?secret_?access_?key["'\s:=]{1,6}[A-Za-z0-9/+=]{40}/i],
  ['PEM private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Paystack live secret', /sk_live_[A-Za-z0-9]{20,}/],
  ['Paystack test secret', /sk_test_[A-Za-z0-9]{20,}/],
  ['Generic bearer literal', /Bearer\s+ey[A-Za-z0-9._-]{30,}/],
];

// ── helpers ──────────────────────────────────────────────────────────────────

const get = async (path, opts = {}) => {
  const url = path.startsWith('http') ? path : BASE + path;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, ...opts });
    const body = opts.method && opts.method !== 'GET' ? '' : await res.text().catch(() => '');
    return { res, body, url, status: res.status, headers: res.headers };
  } finally {
    clearTimeout(t);
  }
};

const redirectStatus = (s) => s === 301 || s === 302 || s === 307 || s === 308;

// ── A. transport & headers ───────────────────────────────────────────────────

async function auditTransport() {
  const httpUrl = `http://${HOST}/`;
  try {
    const r = await get(httpUrl);
    const loc = r.headers.get('location') || '';
    const ok = redirectStatus(r.status) && loc.startsWith('https://');
    add('transport', 'http → https', ok ? 'PASS' : 'FAIL', `${r.status} → ${loc || '(no location)'}`);
  } catch (e) {
    add('transport', 'http → https', 'WARN', `not reachable from here (${e.name}); browsers upgrade via HSTS`);
  }

  try {
    const r = await get(`https://${APEX}/`);
    const loc = r.headers.get('location') || '';
    const ok = redirectStatus(r.status) && loc.replace(/\/$/, '') === BASE;
    add('transport', 'apex → canonical www', ok ? 'PASS' : 'FAIL', `${r.status} → ${loc || '(no location)'}`);
  } catch (e) {
    add('transport', 'apex → canonical www', 'WARN', `apex not reachable (${e.name})`);
  }

  const root = await get('/');
  const h = root.headers;
  add('transport', 'root responds 200', root.status === 200 ? 'PASS' : 'FAIL', `status ${root.status}`);
  add('transport', 'content-type html', /text\/html/.test(h.get('content-type') || '') ? 'PASS' : 'FAIL', h.get('content-type') || 'missing');

  const hsts = h.get('strict-transport-security') || '';
  const hstsMax = Number((hsts.match(/max-age=(\d+)/i) || [])[1] || 0);
  add('headers', 'HSTS ≥ 180 days', hstsMax >= 15552000 ? 'PASS' : hstsMax > 0 ? 'WARN' : 'FAIL', hsts || 'missing');
  if (hsts && !/includeSubDomains/i.test(hsts)) add('headers', 'HSTS includeSubDomains', 'WARN', hsts);

  const csp = h.get('content-security-policy') || '';
  if (!csp) {
    add('headers', 'CSP present', 'FAIL', 'missing');
  } else {
    add('headers', 'CSP present', 'PASS', `${csp.length} bytes`);
    add('headers', 'CSP default-src', /default-src[^;]*'self'/.test(csp) ? 'PASS' : 'WARN', '');
    add('headers', 'CSP object-src none', /object-src\s+'none'/.test(csp) ? 'PASS' : 'WARN', '');
    add('headers', 'CSP frame-ancestors none', /frame-ancestors\s+'none'/.test(csp) ? 'PASS' : 'WARN', '');
    const scriptSrc = (csp.match(/script-src([^;]*)/i) || [])[1] || '';
    add('headers', 'CSP script-src has no unsafe-inline/eval',
      /unsafe-inline|unsafe-eval/.test(scriptSrc) ? 'WARN' : 'PASS', scriptSrc.trim() || '(absent)');
    add('headers', 'CSP upgrade-insecure-requests', /upgrade-insecure-requests/.test(csp) ? 'PASS' : 'WARN', '');
    add('headers', 'CSP blocks plain http media/img', /(?:media-src|img-src)[^;]*\bhttp:(?!\/)/.test(csp) ? 'WARN' : 'PASS', '');
  }

  add('headers', 'X-Content-Type-Options nosniff', /nosniff/i.test(h.get('x-content-type-options') || '') ? 'PASS' : 'FAIL', h.get('x-content-type-options') || 'missing');
  const xfo = h.get('x-frame-options') || '';
  add('headers', 'clickjacking blocked', /DENY|SAMEORIGIN/i.test(xfo) || /frame-ancestors\s+'none'/.test(csp) ? 'PASS' : 'FAIL', xfo || '(only CSP)');
  const ref = h.get('referrer-policy') || '';
  add('headers', 'Referrer-Policy safe', /no-referrer|strict-origin|same-origin/i.test(ref) ? 'PASS' : ref ? 'WARN' : 'FAIL', ref || 'missing');
  add('headers', 'Permissions-Policy present', !!h.get('permissions-policy') ? 'PASS' : 'WARN', h.get('permissions-policy') || 'missing');

  const leak = ['x-powered-by', 'server', 'x-vercel-id'].filter((k) => {
    const v = h.get(k) || '';
    // A bare platform id is fine; a version string is not.
    return /\d+\.\d+/.test(v);
  });
  add('headers', 'no framework version leak', leak.length === 0 ? 'PASS' : 'WARN', leak.length ? leak.join(', ') : '');

  // Hashed asset caching
  const m = (root.body.match(/\/assets\/[A-Za-z0-9._-]+\.js/) || [])[0];
  if (m) {
    const a = await get(m);
    const cc = a.headers.get('cache-control') || '';
    add('headers', 'hashed asset cached immutable', /immutable/.test(cc) && /max-age=3\d{7}/.test(cc) ? 'PASS' : 'WARN', cc || 'missing');
    add('headers', 'asset served as javascript', /javascript/.test(a.headers.get('content-type') || '') ? 'PASS' : 'FAIL', a.headers.get('content-type') || 'missing');
    add('headers', 'compression enabled', !!a.headers.get('content-encoding') ? 'PASS' : 'WARN', a.headers.get('content-encoding') || 'none');
  } else {
    add('headers', 'hashed asset referenced from HTML', 'FAIL', 'no /assets/*.js found in document');
  }
}

// ── B. routes ────────────────────────────────────────────────────────────────

async function auditRoutes() {
  for (const route of PUBLIC_ROUTES) {
    const r = await get(route);
    const type = r.headers.get('content-type') || '';
    const isShell = /text\/html/.test(type) && r.body.includes('id="root"');
    if (r.status === 200 && isShell) {
      add('routes', route, 'PASS', '200 shell');
    } else if (r.status >= 300 && r.status < 400) {
      add('routes', route, 'WARN', `${r.status} → ${r.headers.get('location')}`);
    } else {
      add('routes', route, 'FAIL', `${r.status} ${type}`);
    }
  }

  // Soft-404 behaviour: an unknown path must not claim 200 with real content.
  const unknown = `/__readiness_probe_${Date.now()}`;
  const u = await get(unknown);
  if (u.status === 404) add('routes', 'unknown path → 404', 'PASS', '404');
  else if (u.status === 200 && /text\/html/.test(u.headers.get('content-type') || '')) {
    add('routes', 'unknown path → 404', 'WARN', '200 SPA shell (soft 404 — search engines may index it)');
  } else add('routes', 'unknown path → 404', 'WARN', `status ${u.status}`);

  // A missing static file must be a real 404, not the shell.
  const miss = await get('/assets/__nope__' + Date.now() + '.js');
  add('routes', 'missing asset → 404', miss.status === 404 ? 'PASS' : 'WARN', `status ${miss.status}`);
}

// ── C. assets, SEO, leak surface ─────────────────────────────────────────────

async function auditAssets() {
  const assets = [
    ['/robots.txt', /text\/plain/, 'robots.txt'],
    ['/sitemap.xml', /xml/, 'sitemap.xml'],
    ['/manifest.json', /json/, 'web app manifest'],
    ['/favicon.png', /image\//, 'favicon'],
    ['/favicon.svg', /svg/, 'favicon.svg'],
    ['/apple-touch-icon.png', /image\//, 'apple touch icon'],
    ['/icon-192.png', /image\//, '192 icon'],
    ['/icon-512.png', /image\//, '512 icon'],
    ['/sw.js', /javascript/, 'service worker'],
  ];
  for (const [path, type, label] of assets) {
    const r = await get(path);
    const ok = r.status === 200 && type.test(r.headers.get('content-type') || '');
    add('assets', label, ok ? 'PASS' : 'FAIL', `${r.status} ${r.headers.get('content-type') || ''}`);
  }

  const robots = (await get('/robots.txt')).body || '';
  add('seo', 'robots references sitemap', /Sitemap:\s*https:\/\/\S+sitemap\.xml/i.test(robots) ? 'PASS' : 'FAIL', '');
  add('seo', 'robots disallows private areas',
    ['/dashboard', '/admin', '/api'].every((p) => new RegExp(`Disallow:\\s*${p}\\b`).test(robots)) ? 'PASS' : 'WARN',
    '');
  add('seo', 'robots blocks AI crawlers', /User-agent:\s*GPTBot\s*\n\s*Disallow:\s*\/\s*$/im.test(robots) ? 'PASS' : 'WARN', '');

  const sm = (await get('/sitemap.xml')).body || '';
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  add('seo', 'sitemap has URLs', locs.length > 0 ? 'PASS' : 'FAIL', `${locs.length} urls`);
  const broken = [];
  for (const loc of locs) {
    try {
      const r = await get(loc);
      if (r.status !== 200) broken.push(`${loc} ${r.status}`);
    } catch { broken.push(`${loc} unreachable`); }
  }
  add('seo', 'every sitemap URL returns 200', broken.length === 0 ? 'PASS' : 'FAIL', broken.slice(0, 6).join('; ') || `${locs.length}/${locs.length}`);
  const offHost = locs.filter((l) => new URL(l).host !== HOST);
  if (offHost.length) add('seo', 'sitemap uses canonical host', 'WARN', offHost.slice(0, 3).join(', '));

  const index = (await get('/')).body || '';
  const og = (index.match(/property="og:image"\s+content="([^"]+)"/) || [])[1];
  if (og) {
    const r = await get(og);
    add('seo', 'og:image resolves', r.status === 200 && /image\//.test(r.headers.get('content-type') || '') ? 'PASS' : 'FAIL', `${r.status} ${r.headers.get('content-type') || ''}`);
  } else add('seo', 'og:image declared', 'FAIL', 'missing');
  add('seo', 'lang attribute en-ZA', /<html[^>]+lang="en-ZA"/i.test(index) ? 'PASS' : 'WARN', '');
  add('seo', 'structured data (ld+json)', /application\/ld\+json/.test(index) ? 'PASS' : 'WARN', '');

  // Leak surface: whatever comes back must not be the real file.
  const leaks = [];
  for (const path of SENSITIVE_PATHS) {
    const r = await get(path);
    const type = r.headers.get('content-type') || '';
    const body = r.body || '';
    // /api/*.ts is a serverless function route, not a file: Vercel answers it
    // with the handler's JSON. A leak there would be TypeScript source.
    const isApiFunction = path.startsWith('/api/');
    const tsSource = /\bexport default async function\b|\bimport type \{[^}]*\} from '\.\.\//.test(body);
    const servedFile = !isApiFunction && /json|markdown|plain|octet-stream/.test(type) && !/text\/html/.test(type);
    const hasSecret = SECRET_PATTERNS.some(([, re]) => re.test(body));
    if (servedFile) leaks.push(`${path} (${type.split(';')[0]})`);
    if (tsSource) leaks.push(`${path} (typescript source)`);
    if (hasSecret) leaks.push(`${path} (secret pattern)`);
  }
  add('leaks', 'no source/config/doc files served', leaks.length === 0 ? 'PASS' : 'FAIL', leaks.slice(0, 5).join('; ') || `${SENSITIVE_PATHS.length} paths probed`);

  // Source maps are an IP/leak question, not a break.
  const js = (index.match(/\/assets\/[A-Za-z0-9._-]+\.js/) || [])[0];
  if (js) {
    const m = await get(js + '.map');
    add('leaks', 'source maps not public', m.status === 404 ? 'PASS' : 'WARN', `status ${m.status}`);

    const bundle = (await get(js)).body || '';
    const found = SECRET_PATTERNS.filter(([, re]) => re.test(bundle)).map(([n]) => n);
    add('leaks', 'no credentials in client bundle', found.length === 0 ? 'PASS' : 'FAIL', found.join(', ') || `${(bundle.length / 1024).toFixed(0)} KB scanned`);
    add('perf', 'client JS size', bundle.length < 800 * 1024 ? 'PASS' : 'WARN', `${(bundle.length / 1024).toFixed(0)} KB (main chunk, uncompressed)`);
  }
}

// ── D. API contract ──────────────────────────────────────────────────────────

async function auditApi() {
  for (const path of PROTECTED_APIS) {
    let r;
    try {
      r = await get(path);
    } catch (e) {
      add('api', `${path} refuses anonymous`, 'FAIL', e.name);
      continue;
    }
    const body = r.body || '';
    let json = null;
    try { json = JSON.parse(body); } catch { /* not json */ }
    const rows = json && (Array.isArray(json) ? json : json.items || json.users || json.projects || json.data);
    const leakedRows = Array.isArray(rows) && rows.length > 0;
    // 400/404 are fine *when the body carries no data* — they are "you did not
    // name a row" / "unknown action", not a partial grant.
    const refused = [400, 401, 403, 404, 405].includes(r.status) && !leakedRows;
    const stack = /at\s+\w+\s+\(.*:\d+:\d+\)/.test(body);
    if (refused && !stack) add('api', `${path} refuses anonymous`, 'PASS', `${r.status}${r.status === 400 || r.status === 404 ? ' (no data returned)' : ''}`);
    else if (r.status >= 500) add('api', `${path} refuses anonymous`, 'FAIL', `${r.status} server error`);
    else add('api', `${path} refuses anonymous`, 'FAIL', leakedRows ? `${r.status} but returned rows` : `${r.status} without a gate`);
  }

  const health = await get('/api/leads?action=status');
  let hj = null;
  try { hj = JSON.parse(health.body); } catch { /* noop */ }
  add('api', 'public health endpoint', health.status === 200 && hj ? 'PASS' : 'FAIL', `${health.status} ${hj ? Object.keys(hj).slice(0, 6).join(',') : 'non-json'}`);
  const healthText = health.body || '';
  add('api', 'health leaks no secrets', SECRET_PATTERNS.some(([, re]) => re.test(healthText)) ? 'FAIL' : 'PASS', '');

  const music = await get('/api/music');
  let tracks = null;
  try { tracks = JSON.parse(music.body); } catch { /* noop */ }
  const list = Array.isArray(tracks) ? tracks : tracks?.tracks || tracks?.items;
  if (Array.isArray(list) && list.length) {
    const bad = list.filter((t) => !JSON.stringify(t).match(/X-Amz-Expires=\d+/));
    add('api', 'music list returns signed URLs', bad.length === 0 ? 'PASS' : 'WARN', `${list.length} tracks, ${bad.length} without a signature`);
  } else {
    add('api', 'music list returns signed URLs', 'WARN', `${music.status} ${list ? 'empty' : 'unexpected shape'}`);
  }

  // Malformed and empty bodies must be handled, not crash.
  for (const [label, payload, expectation] of [
    ['empty body', '', 'reject'],
    ['malformed JSON', '{"messages":', 'reject'],
    ['wrong shape', JSON.stringify({ messages: 'not-an-array' }), 'reject'],
    // handleChat slices every message to 1200 chars, so a huge body is
    // truncated and answered — refusing it is not required, crashing is.
    ['oversized message', JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(20000) }] }), 'capped'],
  ]) {
    const r = await fetch(BASE + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT),
    }).catch((e) => ({ status: 0, text: async () => e.name }));
    const text = await r.text().catch(() => '');
    const stack = /at\s+\w+\s+\(.*:\d+:\d+\)|node_modules\//.test(text);
    const ok = expectation === 'capped'
      ? (r.status === 200 || (r.status >= 400 && r.status < 500)) && !stack
      : r.status >= 400 && r.status < 500 && !stack;
    const note = expectation === 'capped' && r.status === 200 ? '200 (message capped at 1200 chars server-side)' : `${r.status}`;
    add('api', `chat handles ${label}`, ok ? 'PASS' : 'FAIL', `${note}${stack ? ' (stack trace in body)' : ''}`);
  }

  // Unsigned payment webhook must be refused outright.
  const hook = await fetch(BASE + '/api/paystack/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'charge.success', data: { reference: 'readiness_probe', amount: 1 } }),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e) => ({ status: 0, text: async () => e.name }));
  const hookBody = await hook.text().catch(() => '');
  add('api', 'forged payment webhook rejected', [401, 403, 400].includes(hook.status) && !/success/i.test(hookBody) ? 'PASS' : 'FAIL', `${hook.status}`);

  // Cross-origin probe: no wildcard CORS on a data route.
  const cors = await get('/api/users', { headers: { Origin: 'https://evil.example' } });
  const acao = cors.headers.get('access-control-allow-origin');
  add('api', 'no wildcard CORS on data route', !acao || (acao !== '*' && !acao.includes('evil.example')) ? 'PASS' : 'FAIL', acao || '(none)');

  // The product's own assistant — one real question, so this costs one call.
  if (!SKIP_LLM) {
    const started = Date.now();
    const r = await fetch(BASE + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'How much does the Starter plan cost?' }] }),
      signal: AbortSignal.timeout(45000),
    }).catch((e) => ({ status: 0, text: async () => e.name }));
    const text = await r.text().catch(() => '');
    let j = null;
    try { j = JSON.parse(text); } catch { /* noop */ }
    const reply = (j && (j.reply || j.answer || j.message || j.content)) || '';
    const answered = r.status === 200 && String(reply).length > 20;
    add('api', 'assistant answers a real question', answered ? 'PASS' : 'FAIL',
      `${r.status} · ${String(reply).length} chars · ${Date.now() - started}ms${answered ? '' : ` · ${text.slice(0, 120)}`}`);
    if (answered) {
      const cites = /R\s?\d|ZAR|credit|plan/i.test(String(reply));
      add('api', 'assistant reply is on-topic', cites ? 'PASS' : 'WARN', String(reply).slice(0, 90).replace(/\s+/g, ' '));
    }
  } else {
    add('api', 'assistant answers a real question', 'WARN', 'skipped (READY_SKIP_LLM=1)');
  }
}

// ── E. rendered experience ───────────────────────────────────────────────────

async function auditRender() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const pagesToRender = ['/', '/pricing', '/register', '/privacy'];

  for (const route of pagesToRender) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));

    try {
      const t0 = Date.now();
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // "#root has a child" is not "the page rendered": React commits a
      // Suspense fallback first, so measuring there reports a 20-char page with
      // no H1 and a homepage canonical on every route. Wait for real copy.
      await page
        .waitForFunction(
          () => (document.body.innerText || '').trim().length > 300 && document.querySelectorAll('h1').length > 0,
          { timeout: 45000 }
        )
        .catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      const mount = Date.now() - t0;

      const info = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
        const text = (document.body.innerText || '').trim();
        return {
          title: document.title,
          canonical: q('link[rel=canonical]')?.href || '',
          description: q('meta[name=description]')?.content || '',
          h1: [...document.querySelectorAll('h1')].map((h) => (h.innerText || '').trim()).filter(Boolean),
          textLen: text.length,
          fcp: paint ? Math.round(paint.startTime) : null,
          dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          // alt="" is the CORRECT markup for a decorative image (the logo next
          // to the wordmark, a hero behind a scrim). Only a missing alt
          // attribute is a defect.
          imgsWithoutAlt: [...document.images].filter((i) => !i.hasAttribute('alt') && i.naturalWidth > 0).length,
          imgsDecorative: [...document.images].filter((i) => i.getAttribute('alt') === '').length,
          imgsTotal: document.images.length,
          consentBanner: !!document.body.innerText.match(/cookie/i),
          buttons: document.querySelectorAll('button, a').length,
        };
      });

      add('render', `${route} mounts`, 'PASS', `${mount}ms to first paint of app`);
      add('render', `${route} has a title`, info.title && info.title.length > 8 ? 'PASS' : 'FAIL', info.title || '(empty)');
      add('render', `${route} has an H1`, info.h1.length === 1 ? 'PASS' : info.h1.length === 0 ? 'FAIL' : 'WARN', `${info.h1.length} h1${info.h1[0] ? `: ${info.h1[0].slice(0, 50)}` : ''}`);
      add('render', `${route} has content`, info.textLen > 400 ? 'PASS' : 'WARN', `${info.textLen} chars`);
      add('render', `${route} console clean`, errors.length === 0 ? 'PASS' : 'WARN', errors.slice(0, 2).join(' | ') || 'none');
      if (info.imgsWithoutAlt > 0) add('render', `${route} images have alt text`, 'WARN', `${info.imgsWithoutAlt}/${info.imgsTotal} with no alt attribute`);
      else add('render', `${route} images have alt text`, 'PASS', `${info.imgsTotal} images (${info.imgsDecorative} decorative alt="")`);
      if (info.canonical) {
        const sameHost = new URL(info.canonical).host === HOST;
        add('render', `${route} canonical host`, sameHost ? 'PASS' : 'FAIL', info.canonical);
        if (new URL(info.canonical).pathname === '/' && route !== '/') {
          add('render', `${route} canonical is route-specific`, 'WARN', `still points at "/" — every route claims the homepage`);
        } else add('render', `${route} canonical is route-specific`, 'PASS', info.canonical);
      } else add('render', `${route} canonical host`, 'WARN', 'no canonical tag');
      add('perf', `${route} FCP`, info.fcp && info.fcp < 2500 ? 'PASS' : info.fcp ? 'WARN' : 'WARN', info.fcp ? `${info.fcp}ms` : 'not reported');
      const cold = info.dcl && info.dcl > 10000;
      add('perf', `${route} DOMContentLoaded`, info.dcl && info.dcl < 4000 ? 'PASS' : 'WARN',
        info.dcl ? `${info.dcl}ms${cold ? ' (cold start — re-measure warm before calling it a regression)' : ''}` : 'not reported');
      if (route === '/privacy') {
        add('legal', 'privacy policy is substantive', info.textLen > 2500 ? 'PASS' : 'WARN', `${info.textLen} chars`);
      }
      if (route === '/') {
        add('legal', 'cookie consent shown', info.consentBanner ? 'PASS' : 'WARN', info.consentBanner ? 'banner text present' : 'no cookie text on first paint');
      }
      if (route === '/register') {
        add('render', 'register form present', info.buttons > 8 ? 'PASS' : 'WARN', `${info.buttons} interactive elements`);
      }
    } catch (e) {
      add('render', `${route} mounts`, 'FAIL', `${e.name}: ${String(e.message).slice(0, 140)}`);
    } finally {
      await page.close();
    }
  }

  // Legal pages must carry real copy, not placeholders.
  for (const route of LEGAL_ROUTES) {
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page
        .waitForFunction(() => (document.body.innerText || '').trim().length > 600, { timeout: 30000 })
        .catch(() => {});
      const len = await page.evaluate(() => (document.body.innerText || '').trim().length);
      const placeholder = await page.evaluate(() => /lorem ipsum|TODO|\[insert|placeholder text/i.test(document.body.innerText || ''));
      add('legal', `${route} substantive copy`, len > 1500 && !placeholder ? 'PASS' : 'WARN', `${len} chars${placeholder ? ' · placeholder text found' : ''}`);
    } catch (e) {
      add('legal', `${route} substantive copy`, 'FAIL', `${e.name}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

// ── run ──────────────────────────────────────────────────────────────────────

const t0 = Date.now();
console.log(`\nReadiness audit → ${BASE}\n${'─'.repeat(72)}`);
await auditTransport();
await auditRoutes();
await auditAssets();
await auditApi();
await auditRender();

const count = (s) => results.filter((r) => r.status === s).length;
const pass = count('PASS'), warn = count('WARN'), fail = count('FAIL');

console.log(`${'─'.repeat(72)}`);
console.log(`PASS ${pass}   WARN ${warn}   FAIL ${fail}   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

if (fail) {
  console.log('\nBlocking failures:');
  for (const r of results.filter((x) => x.status === 'FAIL')) console.log(`  ✗ ${r.area} · ${r.name} — ${r.detail}`);
}
if (warn) {
  console.log('\nWarnings (judgement calls, not blockers):');
  for (const r of results.filter((x) => x.status === 'WARN')) console.log(`  ! ${r.area} · ${r.name} — ${r.detail}`);
}

fs.writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), pass, warn, fail, results }, null, 2));
console.log(`\nReport: ${OUT}`);

if (results.length === 0) {
  console.error('No checks ran — refusing to report readiness.');
  process.exit(2);
}
process.exit(fail > 0 ? 1 : 0);
