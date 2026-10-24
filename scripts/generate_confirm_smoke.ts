/**
 * Browser smoke — the pre-spend generate confirms (cost disclosure before spend).
 *
 * Drives a real Chromium through the Studio so the confirms are checked the
 * way an agent uses them: sign in, open a paid generate surface, press
 * Generate and verify the dialog states the cost AND the current balance
 * before anything is charged — then prove both outcomes: Cancel spends
 * nothing, Accept actually starts the job.
 *
 * Usage:
 *   E2E_SESSION_COOKIE='propreel_session=…' npx tsx scripts/generate_confirm_smoke.ts
 *   (or E2E_ACCOUNT_PASSWORD='…' of the e2e account)
 * Env:
 *   E2E_BASE            site origin (default http://localhost:5199 — the local
 *                       dev server carrying the new UI; point it at the
 *                       deployed origin to smoke what is live)
 *   E2E_ACCOUNT_EMAIL   account to drive (default the e2e walkthrough acct)
 *
 * What it proves, in order:
 *   1. IMAGE CONFIRM (Photo Editor → Enhance)
 *      a. dialog states the cost ("costs 2 credits"), the balance
 *         ("You have N credits") and the refund promise before spending.
 *      b. Cancel closes the dialog, starts no render and charges nothing.
 *      c. Accept renders the image; the balance drops by exactly 2 and the
 *         30-day retention note sits next to Download.
 *   2. VIDEO WIZARD CONFIRM (AI Video Generator → step 8)
 *      a. the cost strip totals the render (tier line + "Total for this
 *         render" + ≈ rand) and the balance line sits under Generate.
 *      b. the dialog states the total cost + balance; Cancel starts nothing.
 *      c. Accept starts the render (progress bar), and the in-flight cancel
 *         refunds the charge (net spend on the account is zero).
 *
 * Spend: phase 1 charges 2 credits for one real image render (kept — the
 * smoke asserts the post-render balance). Phase 2 charges then refunds.
 *
 * Exit codes: 0 pass · 1 fail · 2 bad usage (no credentials).
 */
import { chromium, Browser, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const BASE = (process.env.E2E_BASE || 'http://localhost:5199').replace(/\/$/, '');
const EMAIL = process.env.E2E_ACCOUNT_EMAIL || 'futuretravel@gmail.com';
const PASSWORD = process.env.E2E_ACCOUNT_PASSWORD; // never store a password in source
const SESSION_COOKIE = process.env.E2E_SESSION_COOKIE; // optional, instead of the password

if (!PASSWORD && !SESSION_COOKIE) {
  console.error(
    'Set E2E_ACCOUNT_PASSWORD=<password of the e2e account>' +
      ' (or E2E_SESSION_COOKIE=propreel_session=… minted via scripts/_ui_session.ts)'
  );
  process.exit(2);
}

const TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 180_000;
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok, detail]);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (msg: string): never => {
  console.error(`\n✗ SMOKE FAILED: ${msg}`);
  if (failedRequests.length) {
    console.error('recent failed requests:');
    for (const r of failedRequests.slice(-5)) console.error(`  ${r}`);
  }
  summarize();
  process.exit(1);
};
const summarize = () => {
  const pass = results.filter(([, ok]) => ok).length;
  console.log(`\n${pass}/${results.length} smoke checks passed`);
};

/** Network-level failures the page saw — surfaced on fail() for diagnosis. */
const failedRequests: string[] = [];

/**
 * The app uploads straight to S3 with presigned PUTs. S3's bucket CORS only
 * allows the deployed origin, so from a localhost dev server those PUTs die
 * with a bare "Failed to fetch" before any credit moves. Replay them
 * server-side (Node fetch is not subject to CORS): the object really lands in
 * the real bucket and the render pipeline downstream stays fully real.
 */
async function replayS3Uploads(page: Page) {
  // Presigned PUTs go to the isolated uploads origin (uploads.propreel.co.za)
  // or straight to *.amazonaws.com depending on the environment.
  await page.route(/amazonaws\.com|uploads\./, async (route) => {
    const req = route.request();
    if (req.method() !== 'PUT') { await route.continue(); return; }
    try {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers())) {
        const lk = k.toLowerCase();
        if (['origin', 'referer', 'cookie', 'host', 'connection', 'content-length'].includes(lk)) continue;
        if (lk.startsWith('sec-') || lk.startsWith('accept')) continue;
        headers[lk] = v;
      }
      const res = await fetch(req.url(), {
        method: 'PUT',
        body: (req.postDataBuffer() ?? undefined) as unknown as BodyInit,
        headers,
      });
      await route.fulfill({ status: res.status, body: '' });
    } catch (e: any) {
      await route.fulfill({ status: 502, body: `replay failed: ${e?.message || e}` });
    }
  });
}

/** "Your balance: 597 ⚡ …" → 597 (null when the line isn't rendered). */
async function readBalance(page: Page): Promise<number | null> {
  const line = await page.locator('p:has-text("Your balance:")').first().textContent().catch(() => null);
  const n = line ? Number(/(\d[\d,]*)\s*⚡/.exec(line)?.[1]?.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Close the one-time AI-notice gate if it stacks on top of the first accept. */
async function dismissAIDisclaimer(page: Page) {
  const accept = page.getByRole('button', { name: 'I understand — continue' });
  if (await accept.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await accept.click();
  }
}

/**
 * First-run overlays (onboarding tour, cookie banner) render as fixed z-50
 * modals that swallow every click on the page underneath, and they mount
 * asynchronously AFTER navigation — so a one-shot dismissal races them.
 * Returns true when one was found and dismissed.
 */
async function clearOverlayIfAny(page: Page): Promise<boolean> {
  for (const name of ['Skip tutorial', 'Got it', 'Essential only', 'I understand — continue'] as const) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
      await btn.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(400);
      return true;
    }
  }
  return false;
}

/**
 * Wait for a success locator, racing the app's error boxes so a failed render
 * reports ITS message instead of a bare 180s timeout.
 */
async function waitOrFail(page: Page, ok: string, what: string, timeout = RENDER_TIMEOUT_MS) {
  const outcome = await Promise.race([
    page.locator(ok).first().waitFor({ timeout }).then(() => 'ok' as const),
    page.locator('div[class*="bg-red-950"]').first().waitFor({ timeout }).then(() => 'error' as const),
  ]).catch(() => 'timeout' as const);
  if (outcome !== 'ok') {
    const err = await page.locator('div[class*="bg-red-950"]').first().textContent().catch(() => null);
    fail(`${what} — ${outcome}${err ? `: ${err.trim()}` : ''}`);
  }
}

/** Click a page-level control, dismissing whatever overlay is in the way. */
async function clickSafe(page: Page, locator: ReturnType<Page['locator']> | ReturnType<Page['getByRole']>) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await (locator as any).click({ timeout: 4_000 });
      return;
    } catch (e) {
      lastError = e;
      if (!(await clearOverlayIfAny(page))) await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

async function makeTestImage(name: string): Promise<string> {
  const dir = join(process.cwd(), '.tmp_smoke');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  // Deterministic "photo": gradient + noise-ish bands, real JPEG bytes.
  const img = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 40, g: 60, b: 90 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 800, height: 200, channels: 3, background: { r: 200, g: 170, b: 120 } },
        }).png().toBuffer(),
        top: 200,
        left: 0,
      },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();
  writeFileSync(path, img);
  return path;
}

async function signIn(page: Page) {
  if (SESSION_COOKIE) {
    const { hostname } = new URL(BASE);
    const [name, ...rest] = SESSION_COOKIE.split('=');
    await page.context().addCookies([{
      name: name.trim(),
      value: rest.join('='),
      domain: hostname,
      path: '/',
      secure: BASE.startsWith('https'),
      httpOnly: true,
    }]);
  } else {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.locator('button[type="submit"]:has-text("Sign In")').first().click();
    await page.waitForURL(/\/dashboard|\/studio/, { timeout: TIMEOUT_MS });
    check('login form signs the account in', true, EMAIL);
    return;
  }
  // Cookie mode: prove the planted session authenticates before the phases.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForURL(/\/dashboard|\/studio/, { timeout: 15_000 }).catch(() => {});
  check('session cookie authenticates', /\/dashboard|\/studio/.test(page.url()), page.url());
}

// ── Phase 1 — Image workbench confirm (Photo Editor) ──────────────────────
async function imageConfirmPhase(page: Page, imagePath: string) {
  console.log('\n── 1) Image confirm — Photo Editor → Enhance ──');
  await page.goto(`${BASE}/dashboard/photo-editor`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

  await clearOverlayIfAny(page);
  const cta = page.getByRole('button', { name: /Enhance \(2 credits\)/ }).first();
  // A persisted draft may already show the workbench; on a fresh one the
  // Generate button only renders after a photo is picked.
  const ready = await cta.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!ready) {
    await page.locator('input[type="file"]').first().setInputFiles(imagePath);
    await page.locator('img[alt="Original"]').first().waitFor({ timeout: TIMEOUT_MS });
  }
  await cta.waitFor({ timeout: TIMEOUT_MS });
  check('photo ready in the workbench', true);

  const balanceBefore = await readBalance(page);
  check('balance line renders next to Generate', balanceBefore !== null, `balance ${balanceBefore}`);

  // a) The dialog must disclose cost + balance + refund policy BEFORE spend.
  await clickSafe(page, cta);
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: TIMEOUT_MS });
  const msg = (await dialog.textContent()) || '';
  check('dialog states the render cost', /costs 2 credits/i.test(msg));
  check('dialog states the current balance', new RegExp(`You have ${balanceBefore} credit`, 'i').test(msg), `expects ${balanceBefore}`);
  check('dialog states the refund promise', /refunded automatically/i.test(msg));

  // b) Cancel → nothing starts, nothing charges.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached', timeout: TIMEOUT_MS }).catch(() => {});
  const busyLabel = await page.locator('button:has-text("Uploading image…"), button:has-text("Reserving credits…"), button:has-text("AI is working…")').count();
  check('Cancel starts no render', busyLabel === 0);
  check('Cancel charges nothing', (await readBalance(page)) === balanceBefore);

  // c) Accept → the render runs and charges exactly 2 credits.
  await clickSafe(page, cta);
  const dialog2 = page.getByRole('alertdialog');
  await dialog2.waitFor({ timeout: TIMEOUT_MS });
  await dialog2.getByRole('button', { name: 'Generate' }).click();
  await dismissAIDisclaimer(page);
  await waitOrFail(page, 'img[alt="AI result"]', 'image render');
  check('Accept starts and finishes the render', true);

  const balanceAfter = await readBalance(page);
  check('charge is exactly 2 credits', balanceBefore !== null && balanceAfter === balanceBefore - 2, `${balanceBefore} → ${balanceAfter}`);
  const retention = await page.locator('p:has-text("kept for")').first().textContent().catch(() => null);
  check('30-day retention note sits with the result', /kept for \d+ days/i.test(retention || ''), (retention || '').trim());
  check('Download button is offered', await page.getByRole('button', { name: 'Download' }).first().isVisible());
}

// ── Phase 2 — Video wizard confirm (step 8) ───────────────────────────────
async function videoConfirmPhase(page: Page, photoA: string, photoB: string) {
  console.log('\n── 2) Video wizard confirm — AI Video Generator → Generate ──');
  await page.goto(`${BASE}/dashboard/video`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  // The page h1 and the wizard's own h2 both read "AI Video Generator".
  await page.getByRole('heading', { name: 'AI Video Generator' }).first().waitFor({ timeout: TIMEOUT_MS });
  await clearOverlayIfAny(page);

  // Steps 1–3 (listing details, tier, orientation) — pick the cheapest tier
  // so the accept/cancel leg below moves the smallest possible charge.
  const next = page.getByRole('button', { name: 'Next →' });
  await clickSafe(page, next); // → tier
  const essential = page.getByRole('button', { name: /^Essential/ }).first();
  if (await essential.isVisible({ timeout: 3_000 }).catch(() => false)) await clickSafe(page, essential);
  await clickSafe(page, next); // → orientation
  await clickSafe(page, next); // → photos

  // Photos step (the only hard gate): upload two, tag both Interior.
  const photosInput = page.locator('input[type="file"][multiple]').first();
  await photosInput.setInputFiles([photoA, photoB]);
  const thumbs = page.locator('img[alt^="Photo"]');
  await thumbs.first().waitFor({ timeout: TIMEOUT_MS });
  await page.waitForFunction(
    (n) => document.querySelectorAll('img[alt^="Photo"]').length >= n,
    2,
    { timeout: TIMEOUT_MS },
  ).catch(() => {});
  const interiorButtons = page.getByRole('button', { name: 'Interior' });
  const n = await interiorButtons.count();
  for (let i = 0; i < n; i++) await clickSafe(page, interiorButtons.nth(i));
  check('photos uploaded and room-tagged', n >= 2, `${n} tags applied`);
  await clickSafe(page, next); // → voiceover
  await clickSafe(page, next); // → avatar (left off — the confirm covers the tier total)
  await clickSafe(page, next); // → music & branding
  await clickSafe(page, next); // → render

  // a) Cost strip + balance line.
  await page.locator('text=Total for this render').waitFor({ timeout: TIMEOUT_MS });
  const strip = (await page.locator('div:has-text("Total for this render")').last().textContent()) || '';
  check('cost strip totals the render in credits and rand', /Total for this render/.test(strip) && /≈\s*R/.test(strip));
  const balanceBefore = await readBalance(page);
  check('balance line renders under Generate', balanceBefore !== null, `balance ${balanceBefore}`);

  // b) The dialog must disclose the total + balance; Cancel starts nothing.
  const gen = page.getByRole('button', { name: /Generate Video \(\d+ credits\)/ }).first();
  await clickSafe(page, gen);
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: TIMEOUT_MS });
  const msg = (await dialog.textContent()) || '';
  check('dialog titles the action', /Generate video\?/i.test(msg));
  const cost = Number(/costs (\d+) credits/.exec(msg)?.[1] || 0);
  check('dialog states the total cost', cost > 0, `${cost} credits`);
  check('dialog states the current balance', new RegExp(`You have ${balanceBefore} credit`, 'i').test(msg), `expects ${balanceBefore}`);
  check('dialog states the refund promise', /refunded automatically/i.test(msg));
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached', timeout: TIMEOUT_MS }).catch(() => {});
  check('Cancel starts no render', !(await page.locator('button:has-text("Generating Video")').count()));

  // c) Accept → the render starts; the in-flight cancel refunds it.
  await clickSafe(page, gen);
  const dialog2 = page.getByRole('alertdialog');
  await dialog2.waitFor({ timeout: TIMEOUT_MS });
  await dialog2.getByRole('button', { name: 'Generate' }).click();
  await dismissAIDisclaimer(page);
  await waitOrFail(page, 'button:has-text("Generating Video")', 'video render start', TIMEOUT_MS);
  check('Accept starts the render', true);

  const cancelRender = page.getByRole('button', { name: /Cancel/i }).last();
  await cancelRender.waitFor({ timeout: TIMEOUT_MS });
  await cancelRender.click();
  await page.locator('button:has-text("Generating Video")').first().waitFor({ state: 'detached', timeout: RENDER_TIMEOUT_MS }).catch(() => {});
  check('in-flight cancel stops the render', !(await page.locator('button:has-text("Generating Video")').count()));

  // The refund can land a beat after the UI settles — poll the balance line.
  let refunded = false;
  for (let i = 0; i < 20; i++) {
    const now = await readBalance(page);
    if (now !== null && balanceBefore !== null && now >= balanceBefore) { refunded = true; break; }
    await page.waitForTimeout(1_500);
  }
  const finalBalance = await readBalance(page);
  check('cancelled render is refunded', refunded, `balance ${balanceBefore} → ${finalBalance}`);
}

async function main() {
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('requestfailed', (r) =>
    failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`));
  await replayS3Uploads(page);

  try {
    const photoA = await makeTestImage('confirm-smoke-a.jpg');
    const photoB = await makeTestImage('confirm-smoke-b.jpg');
    await signIn(page);

    await imageConfirmPhase(page, photoA);
    await videoConfirmPhase(page, photoA, photoB);

    summarize();
    if (results.some(([, ok]) => !ok)) process.exit(1);
  } catch (e: any) {
    fail(e?.message || String(e));
  } finally {
    await browser.close();
  }
  process.exit(0);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
