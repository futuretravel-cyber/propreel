/**
 * Browser smoke — admin panel → Audit log tab → CSV export.
 *
 * Drives a real Chromium against the site so the admin access control and
 * audit flow are checked the way a human uses them: open /admin signed out,
 * sign in through the login form as the admin, land back on the admin panel,
 * open System → Audit log and download one CSV export — and, as a separate
 * identity, prove a signed-in NON-admin is bounced off /admin to /dashboard.
 * Read-only against the admin account; the default non-admin fixture is a
 * throwaway user the smoke deletes again at the end of the run.
 *
 * Usage:
 *   E2E_ACCOUNT_PASSWORD='…' npx tsx scripts/admin_ui_smoke.ts
 * Env:
 *   E2E_BASE            site origin (default https://www.propreel.co.za)
 *   E2E_ACCOUNT_EMAIL   admin account (default the admin walkthrough acct)
 *   E2E_SESSION_COOKIE  'propreel_session=…' — ALTERNATIVE to the password:
 *                       a minted session cookie (scripts/_ui_session.ts) for
 *                       credential-less runs. The sign-in form is then
 *                       skipped; everything after it is identical.
 *   E2E_NONADMIN_SESSION_COOKIE  'propreel_session=…' — a NON-admin session
 *                       for the bounce case (skips the throwaway fixture).
 *   E2E_NONADMIN_ACCOUNT_EMAIL / E2E_NONADMIN_ACCOUNT_PASSWORD
 *                       sign in as an existing non-admin through the form.
 *                       With neither, the smoke provisions a throwaway AGENT
 *                       and mints its session itself (needs the AWS env —
 *                       same as scripts/_ui_session.ts).
 *
 * What it proves, in order:
 *   1. SIGNED-OUT — /admin bounces a signed-out visitor to /login?next=/admin
 *      (the panel is really behind the auth + admin gate).
 *   2. LOGIN     — the sign-in form authenticates the admin and lands back on
 *      /admin (RequireAdmin passes: the account is genuinely an admin).
 *   3. NON-ADMIN — a signed-in non-admin hitting /admin is redirected to
 *      /dashboard and never sees the Admin Panel (RequireAdmin's role gate,
 *      not just its auth gate).
 *   4. AUDIT TAB — System → Audit log opens and loads the admin action log.
 *   5. CSV       — the export chip downloads admin-audit-log.csv with the
 *      expected header and at least one recorded action.
 *
 * Exit codes: 0 pass · 1 fail · 2 bad usage (no credentials).
 */
import { chromium } from '@playwright/test';

const BASE = (process.env.E2E_BASE || 'https://www.propreel.co.za').replace(/\/$/, '');
const EMAIL = process.env.E2E_ACCOUNT_EMAIL || 'futuretravel@gmail.com';
const PASSWORD = process.env.E2E_ACCOUNT_PASSWORD; // never store a password in source
const SESSION_COOKIE = process.env.E2E_SESSION_COOKIE; // optional, instead of the password
const NONADMIN_COOKIE = process.env.E2E_NONADMIN_SESSION_COOKIE; // optional non-admin identity
const NONADMIN_EMAIL = process.env.E2E_NONADMIN_ACCOUNT_EMAIL; // optional non-admin identity
const NONADMIN_PASSWORD = process.env.E2E_NONADMIN_ACCOUNT_PASSWORD;

if (!PASSWORD && !SESSION_COOKIE) {
  console.error(
    'Set E2E_ACCOUNT_PASSWORD=<password of the admin account>' +
      ' (or E2E_SESSION_COOKIE=propreel_session=… minted via scripts/_ui_session.ts)'
  );
  process.exit(2);
}

const TIMEOUT_MS = 30_000;
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok, detail]);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (msg: string): never => {
  console.error(`\n✗ SMOKE FAILED: ${msg}`);
  summarize();
  process.exit(1);
};
const summarize = () => {
  const pass = results.filter(([, ok]) => ok).length;
  console.log(`\n${pass}/${results.length} smoke checks passed`);
};

/** The throwaway AGENT fixture (id set only when this run provisioned one). */
let fixtureUserId: string | null = null;

/**
 * Identity for the non-admin bounce case, in order of preference:
 * a brought-along session cookie, a brought-along form login, or a throwaway
 * AGENT provisioned straight into the DB (no email confirmation dance) with
 * its session minted server-side — scripts/_ui_session.ts does the same.
 */
async function nonAdminIdentity(): Promise<{ cookie?: string; email?: string; password?: string }> {
  if (NONADMIN_COOKIE) return { cookie: NONADMIN_COOKIE };
  if (NONADMIN_EMAIL && NONADMIN_PASSWORD) return { email: NONADMIN_EMAIL, password: NONADMIN_PASSWORD };
  const { createUser } = await import('../lib/userService');
  const { createSession, clientMeta, SESSION_COOKIE } = await import('../lib/auth');
  const user = await createUser({
    email: `propreel.smoke.nonadmin.${Date.now()}@example.com`,
    fullName: 'Smoke Non-Admin',
    role: 'AGENT',
    credits: 0,
    creditExpiries: [],
    subscription: null,
    autoTopup: { enabled: false, threshold: 0, amount: 0 },
    agencyId: null,
    agencyName: null,
    avatarUrl: null,
    emailVerified: true,
    lastLowCreditWarnedAt: null,
  });
  fixtureUserId = user.id;
  const token = await createSession(user.id, clientMeta({ headers: {} }));
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ── 1. Signed-out: /admin must bounce to the login form ───────────────
    if (SESSION_COOKIE) {
      // Credential-less run: plant the minted session for the target origin.
      const { hostname } = new URL(BASE);
      const [name, ...rest] = SESSION_COOKIE.split('=');
      await context.addCookies([{
        name: name.trim(),
        value: rest.join('='),
        domain: hostname,
        path: '/',
        secure: BASE.startsWith('https'),
        httpOnly: true,
      }]);
    } else {
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      await page.waitForURL(/\/login/, { timeout: TIMEOUT_MS });
      check('signed-out /admin redirects to the login form', true, page.url());

      // ── 2. Sign in through the real form ────────────────────────────────
      await page.locator('input[type="email"]').first().fill(EMAIL);
      await page.locator('input[type="password"]').first().fill(PASSWORD!);
      await page.locator('button[type="submit"]:has-text("Sign In")').first().click();

      const deadline = Date.now() + TIMEOUT_MS;
      let loginError = '';
      while (Date.now() < deadline) {
        const url = page.url();
        if (/\/admin/.test(url)) break; // RequireAdmin lets the panel render
        if (/\/dashboard/.test(url)) {
          fail(`signed in as ${EMAIL} but RequireAdmin bounced to /dashboard — the account is not an admin`);
        }
        if (await page.locator('input[placeholder="000000"]').count()) {
          fail('the account has two-factor sign-in enabled — this smoke needs a password-only admin account (or extend it with TOTP)');
        }
        const err = await page.locator('div.text-red-300').first().textContent().catch(() => null);
        if (err && err.trim()) { loginError = err.trim(); break; }
        await page.waitForTimeout(250);
      }
      if (loginError) fail(`login rejected: "${loginError}"`);
      if (!/\/admin/.test(page.url())) fail(`login never reached /admin (stuck on ${page.url()})`);
      check('login form signs the admin in and lands on /admin', true, `${EMAIL}`);
    }

    // ── 3. Signed-in NON-admin: /admin must bounce to /dashboard ─────────
    // Separate context so the admin's session above is untouched. Proves
    // RequireAdmin's ROLE gate (isAdmin → /dashboard), not just its auth gate.
    {
      const id = await nonAdminIdentity().catch((e: any) =>
        fail(`non-admin identity unavailable: ${e?.message || e} — set E2E_NONADMIN_SESSION_COOKIE ` +
          '(or E2E_NONADMIN_ACCOUNT_EMAIL/_PASSWORD), or run with the AWS env sourced so the smoke ' +
          'can provision a throwaway AGENT itself (same as scripts/_ui_session.ts)'));
      const nctx = await browser.newContext();
      const npage = await nctx.newPage();
      try {
        if (id.cookie) {
          const { hostname } = new URL(BASE);
          const [name, ...rest] = id.cookie.split('=');
          await nctx.addCookies([{
            name: name.trim(),
            value: rest.join('='),
            domain: hostname,
            path: '/',
            secure: BASE.startsWith('https'),
            httpOnly: true,
          }]);
        } else {
          await npage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
          await npage.locator('input[type="email"]').first().fill(id.email!);
          await npage.locator('input[type="password"]').first().fill(id.password!);
          await npage.locator('button[type="submit"]:has-text("Sign In")').first().click();
          await npage.waitForURL(/\/dashboard|\/admin|\/login/, { timeout: TIMEOUT_MS });
          if (/\/login/.test(npage.url())) fail(`non-admin sign-in was rejected (stuck on ${npage.url()})`);
        }
        await npage.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
        await npage.waitForURL(/\/dashboard/, { timeout: TIMEOUT_MS });
        const bounced = /\/dashboard/.test(npage.url()) && !/\/admin|\/login/.test(npage.url());
        check('signed-in non-admin /admin redirects to /dashboard', bounced, npage.url());
        check('non-admin never sees the Admin Panel',
          (await npage.getByRole('heading', { name: 'Admin Panel' }).count()) === 0);
      } finally {
        await nctx.close();
        if (fixtureUserId) {
          const { deleteUser } = await import('../lib/userService');
          await deleteUser(fixtureUserId).catch(() => {});
          fixtureUserId = null;
        }
      }
    }

    // ── 4. Admin panel → System → Audit log tab ──────────────────────────
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.getByRole('heading', { name: 'Admin Panel' }).waitFor({ timeout: TIMEOUT_MS });
    check('admin panel renders (RequireAdmin passed)', true);

    const auditTab = page.getByRole('button', { name: 'Audit log', exact: true });
    await auditTab.waitFor({ timeout: TIMEOUT_MS });
    await auditTab.click();
    await page.waitForURL(/tab=audit/, { timeout: TIMEOUT_MS }).catch(() => {});
    check('Audit log tab opens', page.url().includes('tab=audit'), page.url());

    const panelError = page.locator('div.card-dark p.text-red-400');
    const auditHeading = page.getByRole('heading', { name: 'Admin audit log' });
    await Promise.race([
      auditHeading.waitFor({ timeout: TIMEOUT_MS }),
      panelError.first().waitFor({ timeout: TIMEOUT_MS }),
    ]);
    const errText = await panelError.first().textContent().catch(() => null);
    if (errText && errText.trim()) fail(`audit log refused to load: "${errText.trim()}"`);
    check('audit log loads', await auditHeading.isVisible());

    // ── 5. Download one CSV export ───────────────────────────────────────
    const csvButton = page.locator('button[title^="Download "]').first();
    await csvButton.waitFor({ timeout: TIMEOUT_MS });
    const title = (await csvButton.getAttribute('title')) || '';
    const rowCount = Number(/(\d+)/.exec(title)?.[1] || 0);
    if (await csvButton.isDisabled() || rowCount < 1) {
      fail('audit log has no recorded actions — the CSV chip is disabled (nothing to export)');
    }
    check('CSV chip is enabled', true, `${rowCount} rows`);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: TIMEOUT_MS }),
      csvButton.click(),
    ]);
    const name = download.suggestedFilename();
    check('CSV download fires', name === 'admin-audit-log.csv', name);
    if (name !== 'admin-audit-log.csv') fail(`unexpected download name: ${name}`);

    const stream = await download.createReadStream();
    const csv: string = await new Promise((resolve, reject) => {
      let data = '';
      stream.on('data', (c) => (data += c));
      stream.on('end', () => resolve(data));
      stream.on('error', reject);
    });
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    check('CSV header matches the audit columns', lines[0] === 'createdAt,action,by,target,detail', lines[0]);
    check('CSV contains at least one recorded action', lines.length >= 2, `${lines.length - 1} data rows`);
    if (lines[0] !== 'createdAt,action,by,target,detail' || lines.length < 2) {
      fail(`CSV content unexpected — header: ${JSON.stringify(lines[0])}, rows: ${lines.length - 1}`);
    }

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
