/**
 * Cross-browser / cross-viewport layout audit.
 *
 *   node scripts/layout_audit.mjs                                   # local build
 *   AUDIT_BASE=https://www.propreel.co.za node scripts/layout_audit.mjs
 *   AUDIT_ENGINES=chromium AUDIT_WIDTHS=375,768 node scripts/layout_audit.mjs
 *
 * Checks, per engine × viewport × page:
 *   - horizontal overflow (document-level sideways scrolling)
 *   - assistant launcher inside the viewport, clear of every fixed bottom bar,
 *     and with nothing painted on top of it
 *   - WhatsApp float not colliding with the launcher
 *   - open chat panel: header inside the viewport and not covered by the site nav
 *   - undersized tap targets on phone widths (reported, non-blocking)
 *   - console errors / uncaught exceptions during load
 */
import { chromium, firefox, webkit } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.env.AUDIT_BASE || 'http://localhost:4173').replace(/\/$/, '');
const OUT = process.env.AUDIT_OUT || '.tmp_layout_audit.json';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const VIEWPORTS = [
  ['320x568 small Android', 320, 568, true],
  ['360x640 budget Android', 360, 640, true],
  ['375x667 iPhone SE2/8', 375, 667, true],
  ['390x844 iPhone 14/15', 390, 844, true],
  ['414x896 iPhone 11 Pro Max', 414, 896, true],
  ['430x932 iPhone 15 Pro Max', 430, 932, true],
  ['768x1024 iPad portrait', 768, 1024, true],
  ['820x1180 iPad Air', 820, 1180, true],
  ['1024x768 iPad landscape', 1024, 768, false],
  ['1280x800 Windows laptop', 1280, 800, false],
  ['1366x768 Windows laptop', 1366, 768, false],
  ['1440x900 MacBook Air', 1440, 900, false],
  ['1920x1080 Windows desktop', 1920, 1080, false],
  ['2560x1440 large desktop', 2560, 1440, false],
];
const CORE_WIDTHS = [320, 375, 768, 1280, 1920];

// Chromium carries the full matrix; the other engines get a representative slice.
const ENGINES = [
  {
    name: 'chromium',
    type: chromium,
    opts: {},
    pages: ['/', '/pricing', '/faq', '/blog', '/register', '/login'],
    widths: CORE_WIDTHS,
  },
  {
    name: 'chrome (installed)',
    type: chromium,
    opts: { channel: 'chrome' },
    pages: ['/', '/pricing', '/faq'],
    widths: [320, 375, 768, 1280],
  },
  {
    name: 'edge (installed)',
    type: chromium,
    opts: { channel: 'msedge' },
    pages: ['/', '/pricing', '/faq'],
    widths: [320, 375, 768, 1280],
  },
  {
    name: 'webkit (Safari engine)',
    type: webkit,
    opts: {},
    pages: ['/', '/pricing', '/faq'],
    widths: [320, 375, 768, 1280],
  },
  { name: 'firefox', type: firefox, opts: {}, pages: ['/', '/faq'], widths: [375, 1280] },
];

const envList = (name) => (process.env[name] ? process.env[name].split(',').map((s) => s.trim()) : null);
const wantEngines = envList('AUDIT_ENGINES');
const wantPages = envList('AUDIT_PAGES');
const wantWidths = envList('AUDIT_WIDTHS')?.map(Number);
// A static preview of the build has no serverless API behind it, so its
// failed /api/* fetches surface as console errors that production never logs.
const ignoreApiErrors = process.env.AUDIT_IGNORE_API_ERRORS === '1';
const onlyEngine = (name) => !wantEngines || wantEngines.some((w) => name.toLowerCase().includes(w.toLowerCase()));

const inPageAudit = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docW = document.documentElement.clientWidth;
  const scrollW = document.documentElement.scrollWidth;
  const hOverflow = Math.max(0, scrollW - docW);

  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  const offenders = [];
  if (hOverflow > 1) {
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        const key = el.tagName + '|' + String(el.className);
        if (seen.has(key)) continue;
        seen.add(key);
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 90),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
        if (offenders.length >= 5) break;
      }
    }
  }

  const bars = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.height >= 40 && r.width >= vw * 0.9 && r.bottom >= vh - 2;
    })
    .map((el) => ({ cls: String(el.className).slice(0, 70), ...rect(el), z: getComputedStyle(el).zIndex }));

  const launcherEl = document.querySelector('[aria-label="Open the PropReel assistant"]');
  const waEl = document.querySelector('[aria-label="Chat with us on WhatsApp"]');
  const launcher = launcherEl ? rect(launcherEl) : null;
  const wa = waEl ? rect(waEl) : null;
  const overlaps = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);

  let launcherCoveredAt = null;
  if (launcher) {
    const cx = Math.round((launcher.left + launcher.right) / 2);
    const cy = Math.round((launcher.top + launcher.bottom) / 2);
    const topEl = document.elementFromPoint(cx, cy);
    if (topEl && !launcherEl.contains(topEl) && topEl !== launcherEl) {
      launcherCoveredAt = String(topEl.className || topEl.tagName).slice(0, 70);
    }
  }

  const smallTargets = [];
  if (vw < 768) {
    const seen = new Set();
    for (const el of document.querySelectorAll('a, button, [role="button"], input, select, textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      if (r.width < 40 || r.height < 40) {
        const key = el.tagName + '|' + String(el.className).slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        smallTargets.push({
          tag: el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28),
        });
      }
      if (smallTargets.length >= 6) break;
    }
  }

  return {
    vw,
    vh,
    docW,
    scrollW,
    hOverflow,
    offenders,
    launcher,
    launcherInsideViewport: launcher
      ? launcher.top >= 0 && launcher.bottom <= vh + 1 && launcher.left >= 0 && launcher.right <= vw + 1
      : null,
    launcherCoveredAt,
    bottomBars: bars,
    launcherOverlapsBar: bars.some((b) => overlaps(launcher, b)),
    waOverlapsLauncher: overlaps(wa, launcher),
    smallTargets,
  };
};

const panelAudit = () => {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const panel = document.querySelector('[role="dialog"][aria-label="PropReel assistant"]');
  if (!panel) return { opened: false };
  const pr = panel.getBoundingClientRect();
  const header = panel.firstElementChild.getBoundingClientRect();
  const cx = Math.round(header.left + header.width / 2);
  const cy = Math.round(header.top + header.height / 2);
  const topEl = document.elementFromPoint(cx, cy);
  return {
    opened: true,
    panel: { top: Math.round(pr.top), bottom: Math.round(pr.bottom), h: Math.round(pr.height) },
    header: { top: Math.round(header.top), bottom: Math.round(header.bottom) },
    headerInsideViewport: header.top >= 0 && header.bottom <= vh + 1,
    headerCovered: !!(topEl && !panel.contains(topEl)),
    headerCoveredBy: topEl ? String(topEl.className || topEl.tagName).slice(0, 60) : null,
    panelFitsWidth: pr.left >= -1 && pr.right <= vw + 1,
  };
};

async function dismissOverlays(page) {
  for (const re of [/accept all/i, /^accept$/i, /^agree$/i, /^got it$/i, /reject/i, /decline/i]) {
    const btn = page.getByRole('button', { name: re });
    if (await btn.count().catch(() => 0)) {
      // Force: a sticky consent banner can sit under another fixed layer while
      // still being the thing we want gone before measuring.
      await btn.first().click({ timeout: 1500, force: true }).catch(() => {});
      await page.waitForTimeout(200);
      if (!(await btn.count().catch(() => 0))) return true;
    }
  }
  return false;
}

async function runCombo(browser, engineName, [vpName, width, height, mobile], path) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    reducedMotion: 'reduce',
    userAgent: mobile ? IPHONE_UA : undefined,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 160)));

  const row = { engine: engineName, viewport: vpName, width, height, path, ok: true, problems: [], warnings: [] };

  try {
    const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 40000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res ? res.status() : 'no response'}`);
    // React mounts an empty div first on some routes, so "#root > * is visible"
    // can never be satisfied; wait for actual children instead.
    await page.waitForFunction(() => (document.querySelector('#root')?.children.length ?? 0) > 0, null, {
      timeout: 15000,
    });
    await page.waitForTimeout(600);
    await dismissOverlays(page);

    const top = await page.evaluate(inPageAudit);
    row.atTop = top;

    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(400);
    const scrolled = await page.evaluate(inPageAudit);
    row.scrolled = scrolled;

    for (const [label, snap] of [['at top', top], ['after scroll', scrolled]]) {
      if (snap.hOverflow > 1) {
        row.ok = false;
        row.problems.push(
          `${label}: horizontal overflow ${snap.hOverflow}px (scrollWidth ${snap.scrollW} vs client ${snap.docW}) — ${snap.offenders
            .map((o) => `${o.tag}.${o.cls.split(' ').slice(0, 4).join('.')}`)
            .join(' | ')}`,
        );
      }
      if (snap.launcher && snap.launcherInsideViewport === false) {
        row.ok = false;
        row.problems.push(`${label}: assistant launcher outside viewport ${JSON.stringify(snap.launcher)}`);
      }
      if (snap.launcherOverlapsBar) {
        row.ok = false;
        row.problems.push(`${label}: launcher overlapped by bottom bar (${snap.bottomBars.map((b) => b.cls).join(' | ')})`);
      }
      if (snap.launcherCoveredAt) {
        row.ok = false;
        row.problems.push(`${label}: something is painted on top of the launcher: ${snap.launcherCoveredAt}`);
      }
      if (snap.waOverlapsLauncher) {
        row.ok = false;
        row.problems.push(`${label}: WhatsApp float overlaps the assistant launcher`);
      }
      if (snap.smallTargets.length) {
        row.warnings.push(
          `${label}: ${snap.smallTargets.length} tap target(s) under 40px — ${snap.smallTargets
            .map((t) => `${t.tag} ${t.w}x${t.h} "${t.text}"`)
            .join(', ')}`,
        );
      }
    }

    if (width < 768 && top.launcher) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('[aria-label="Open the PropReel assistant"]', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(450);
      const panel = await page.evaluate(panelAudit);
      row.panel = panel;
      if (!panel.opened) {
        row.ok = false;
        row.problems.push('chat panel did not open when the launcher was tapped');
      } else {
        if (!panel.headerInsideViewport) row.ok = false, row.problems.push(`panel header outside viewport ${JSON.stringify(panel.header)}`);
        if (panel.headerCovered) row.ok = false, row.problems.push(`panel header covered by ${panel.headerCoveredBy}`);
        if (!panel.panelFitsWidth) row.ok = false, row.problems.push('panel wider than the viewport');
      }
      await page.click('[aria-label="Close the assistant"]', { timeout: 3000 }).catch(() => {});
    }

    const realErrors = consoleErrors.filter(
      (e) => !(ignoreApiErrors && /\/api|Failed to fetch|ERR_|NetworkError|Unexpected token/i.test(e)),
    );
    row.consoleErrors = [...new Set(consoleErrors)];
    if (realErrors.length) {
      row.ok = false;
      row.problems.push(`console errors: ${[...new Set(realErrors)].slice(0, 3).join(' || ')}`);
    } else if (consoleErrors.length) {
      row.warnings.push(`console errors ignored as static-preview noise: ${[...new Set(consoleErrors)].length}`);
    }
  } catch (err) {
    row.ok = false;
    row.problems.push('harness error: ' + String(err.message || err).slice(0, 200));
  } finally {
    await context.close().catch(() => {});
  }
  return row;
}

const results = [];
const skipped = [];

for (const engine of ENGINES.filter((e) => onlyEngine(e.name))) {
  let browser;
  try {
    browser = await engine.type.launch(engine.opts);
  } catch (err) {
    skipped.push(`${engine.name}: ${String(err.message || err).split('\n')[0].slice(0, 140)}`);
    continue;
  }
  const viewports = VIEWPORTS.filter(([, w]) => engine.widths.includes(w) && (!wantWidths || wantWidths.includes(w)));
  const pages = engine.pages.filter((p) => !wantPages || wantPages.includes(p));
  for (const vp of viewports) {
    for (const path of pages) {
      const started = Date.now();
      const row = await runCombo(browser, engine.name, vp, path);
      row.ms = Date.now() - started;
      results.push(row);
      process.stdout.write(`· ${engine.name} ${vp[0]} ${path} — ${row.ok ? 'ok' : 'FAIL'} (${row.ms}ms)\n`);
    }
  }
  await browser.close().catch(() => {});
}

const failures = results.filter((r) => !r.ok);
fs.writeFileSync(OUT, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), skipped, results }, null, 2));

console.log('\n================ LAYOUT AUDIT ================');
console.log(`target      : ${BASE}`);
console.log(`combinations: ${results.length}  (engines: ${[...new Set(results.map((r) => r.engine))].join(', ') || 'none'})`);
console.log(`verdict     : ${failures.length === 0 ? 'PASS' : 'FAIL'} — ${failures.length} failing combination(s)`);
if (skipped.length) {
  console.log('\nENGINES SKIPPED');
  for (const s of skipped) console.log('  - ' + s);
}
if (failures.length) {
  console.log('\nFAILURES');
  for (const f of failures) {
    console.log(`  ✗ ${f.engine} ${f.viewport} ${f.path}`);
    for (const p of f.problems) console.log(`      ${p}`);
  }
}
const warned = results.filter((r) => r.warnings.length);
if (warned.length) {
  const seen = new Set();
  console.log('\nWARNINGS (non-blocking, deduped)');
  for (const w of warned) {
    for (const x of w.warnings) {
      const msg = x.replace(/^\S+ \S+: /, '');
      if (seen.has(msg)) continue;
      seen.add(msg);
      console.log(`  ! ${w.engine} ${w.viewport} ${w.path}\n      ${msg}`);
    }
  }
}
console.log(`\nfull report: ${OUT}`);
process.exit(failures.length ? 1 : 0);
