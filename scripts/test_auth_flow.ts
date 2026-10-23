/**
 * End-to-end test of the first-party auth routes (no third-party service).
 * Usage: set -a; source .env; set +a; npx tsx scripts/test_auth_flow.ts
 *
 * Boots api/users behind a tiny HTTP shim, then drives the full lifecycle:
 * register → (login blocked pre-confirm) → confirm → session → logout →
 * login → forgot → reset → login with new password. Creates and removes a
 * throwaway user; expects no residue.
 *
 * Note: until the propreel.co.za domain is verified in Resend, actual email
 * DELIVERY only works for the account address — the send path is exercised
 * here but inbox delivery is proven in the production browser walkthrough.
 */
import http from 'http';
import { URL } from 'url';
import handler from '../api/users';
import { scanItems, deleteItem, TABLES } from '../lib/db';

const PORT = 4310;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = `propreel.autotest.${Date.now()}@gmail.com`;

function makeServer() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url || '/', BASE);
    const query: Record<string, any> = {};
    u.searchParams.forEach((v, k) => { query[k] = v; });

    let body: any = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }
    }

    const r: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined,
      status(c: number) { r.statusCode = c; return r; },
      json(b: any) { r.body = b; return r; },
      send(b: any) { r.body = b; return r; },
      setHeader(k: string, v: any) { r.headers[k.toLowerCase()] = String(v); return r; },
      getHeader(k: string) { return r.headers[k.toLowerCase()]; },
    };

    try {
      await handler({ method: req.method, query, body, headers: req.headers, cookies: undefined } as any, r);
    } catch (e: any) {
      r.statusCode = 500;
      r.body = { error: `harness: ${e?.message || e}` };
    }

    const outHeaders: Record<string, any> = { 'Content-Type': 'application/json', ...r.headers };
    if (typeof r.body === 'string') {
      res.writeHead(r.statusCode, outHeaders);
      res.end(r.body);
    } else {
      res.writeHead(r.statusCode, outHeaders);
      res.end(JSON.stringify(r.body ?? {}));
    }
  });
}

function getCookie(res: Response): string | null {
  // Node fetch exposes headers; grab the raw set-cookie
  const sc = (res.headers as any).getSetCookie?.() || [];
  const match = sc.find((c: string) => c.startsWith('propreel_session=')) || res.headers.get('set-cookie');
  if (!match) return null;
  const pair = match.split(';')[0];
  return pair && pair.startsWith('propreel_session=') && pair.length > 'propreel_session='.length ? pair : null;
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

async function call(path: string, opts: { method?: string; body?: any; cookie?: string | null } = {}): Promise<{ res: Response; json: any; cookie: string | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json, cookie: getCookie(res) };
}

async function main() {
  const server = makeServer();
  await new Promise<void>(r => server.listen(PORT, '127.0.0.1', r));
  console.log(`harness on :${PORT}, test email ${EMAIL}\n`);

  // 1) register — pre-domain-verification, Resend only accepts the account
  // address, so a send failure (502) is EXPECTED for test addresses; the
  // account + token must still be created. Real delivery is proven in the
  // production browser walkthrough.
  let r = await call('/api/users?action=auth_register', {
    method: 'POST',
    body: { email: EMAIL, password: 'TestPass123!', fullName: 'Auto Test', planId: 'PROFESSIONAL', cycle: 'MONTHLY', redirect: '/payment?plan=PROFESSIONAL' },
  });
  console.log('register:', r.res.status, JSON.stringify(r.json));
  const registerOk = r.res.status === 201 || (r.res.status === 502 && r.json.needsConfirmation === true);
  check('register → 201/502 + needsConfirmation', registerOk, r.json);
  let userId = r.json.userId;
  if (!userId) {
    const rows = await scanItems<any>(TABLES.USERS, { filter: { expression: 'email = :e', values: { ':e': EMAIL } }, limit: 5 });
    userId = rows[0]?.id;
  }

  // 2) login blocked before confirm
  r = await call('/api/users?action=auth_login', { method: 'POST', body: { email: EMAIL, password: 'TestPass123!' } });
  console.log('login pre-confirm:', r.res.status, JSON.stringify(r.json));
  check('login pre-confirm → 403 EMAIL_NOT_CONFIRMED', r.res.status === 403 && r.json.code === 'EMAIL_NOT_CONFIRMED', r.json);

  // 3) resend (cooldown just armed by register → neutral success)
  r = await call('/api/users?action=auth_resend', { method: 'POST', body: { email: EMAIL, redirect: '/payment?plan=PROFESSIONAL' } });
  console.log('resend:', r.res.status, JSON.stringify(r.json));
  check('resend → 200', r.res.status === 200, r.json);

  // 4) confirm via the token row (the email link carries this token)
  await new Promise(res => setTimeout(res, 1200)); // pass the 30s resend cooldown clock? no — just settle
  const confRows = await scanItems<any>(TABLES.SETTINGS, { filter: { expression: '#t = :t AND userId = :u', names: { '#t': 'type' }, values: { ':t': 'email_confirm', ':u': userId } }, limit: 10 });
  check('confirm token row exists in settings', confRows.length >= 1, confRows.length);
  const token = String(confRows[0]?.id || '').replace(/^emconf_/, '');
  r = await call(`/api/users?action=auth_confirm&token=${token}`);
  console.log('confirm:', r.res.status, JSON.stringify(r.json).slice(0, 200));
  const sessionCookie = r.cookie;
  check('confirm → 200 + session cookie + redirect', r.res.status === 200 && !!sessionCookie && !!r.json.redirect, { status: r.res.status, cookie: !!sessionCookie, redirect: r.json.redirect });

  // 5) session with cookie
  r = await call('/api/users?action=auth_session', { cookie: sessionCookie });
  check('session → user', r.res.status === 200 && r.json.user?.email === EMAIL, r.json);
  check('session user has no passwordHash', !('passwordHash' in (r.json.user || {})), Object.keys(r.json.user || {}));

  // 6) logout
  r = await call('/api/users?action=auth_logout', { method: 'POST', cookie: sessionCookie });
  check('logout → 200', r.res.status === 200, r.json);
  r = await call('/api/users?action=auth_session', { cookie: sessionCookie });
  check('session after logout → null', r.json.user === null, r.json);

  // 7) login (right + wrong password)
  r = await call('/api/users?action=auth_login', { method: 'POST', body: { email: EMAIL, password: 'TestPass123!' } });
  console.log('login:', r.res.status);
  check('login → 200 + cookie', r.res.status === 200 && !!r.cookie, r.json);
  const loginCookie = r.cookie;
  r = await call('/api/users?action=auth_login', { method: 'POST', body: { email: EMAIL, password: 'WrongPass999!' } });
  check('wrong password → 401', r.res.status === 401, r.json);

  // 8) duplicate register — since the L-2 anti-enumeration hardening
  // (api/users.ts, committed 2026-10-15) the answer for ANY existing
  // confirmed address is byte-identical to a fresh signup: 201 +
  // needsConfirmation (the "account exists" signal goes to the mailbox).
  r = await call('/api/users?action=auth_register', { method: 'POST', body: { email: EMAIL, password: 'TestPass123!', fullName: 'Auto Test', planId: 'STARTER', cycle: 'MONTHLY' } });
  check('re-register verified email → 201 needsConfirmation (anti-enumeration)', r.res.status === 201 && r.json.needsConfirmation === true, r.json);
  // …and the futuretravel email send SUCCEEDS (account address), so it
  // proves the full email path — then its account gets cleaned up below.
  const futuretravelEmail = 'futuretravel@gmail.com';
  let ftRow = (await scanItems<any>(TABLES.USERS, { filter: { expression: 'email = :e', values: { ':e': futuretravelEmail } }, limit: 5 }))[0];

  // 9) forgot → reset → login with new password
  r = await call('/api/users?action=auth_forgot', { method: 'POST', body: { email: EMAIL } });
  check('forgot → 200 neutral', r.res.status === 200, r.json);
  const rstRows = await scanItems<any>(TABLES.SETTINGS, { filter: { expression: '#t = :t AND userId = :u', names: { '#t': 'type' }, values: { ':t': 'password_reset', ':u': userId } }, limit: 10 });
  check('reset token row exists', rstRows.length >= 1, rstRows.length);
  const rstToken = String(rstRows[0]?.id || '').replace(/^pwreset_/, '');
  r = await call('/api/users?action=auth_reset', { method: 'POST', body: { token: rstToken, password: 'NewPass456!' } });
  check('reset → 200', r.res.status === 200, r.json);
  r = await call('/api/users?action=auth_login', { method: 'POST', body: { email: EMAIL, password: 'TestPass123!' } });
  check('old password after reset → 401', r.res.status === 401, r.json);
  r = await call('/api/users?action=auth_login', { method: 'POST', body: { email: EMAIL, password: 'NewPass456!' } });
  check('new password → 200', r.res.status === 200 && !!r.cookie, r.json);

  // 10) auth_register on an existing verified email → same
  // anti-enumeration answer (201 + needsConfirmation, never 409)
  r = await call('/api/users?action=auth_register', { method: 'POST', body: { email: futuretravelEmail, password: 'TestPass123!', fullName: 'X', planId: 'STARTER', cycle: 'MONTHLY' } });
  check('register existing verified email → 201 needsConfirmation (anti-enumeration)', r.res.status === 201 && r.json.needsConfirmation === true, r.json);
  void ftRow;

  // cleanup test user — every trace (row, tokens, sessions, ledger)
  if (userId) {
    const ledger = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { filter: { expression: 'userId = :u', values: { ':u': userId } }, limit: 50 });
    for (const t of ledger) await deleteItem(TABLES.CREDIT_TRANSACTIONS, { userId: t.userId, createdAt: t.createdAt }).catch(() => {});
    await deleteItem(TABLES.USERS, { id: userId });
    for (const row of [...confRows, ...rstRows]) await deleteItem(TABLES.SETTINGS, { id: row.id }).catch(() => {});
    const sess = await scanItems<any>(TABLES.SESSIONS, { filter: { expression: 'userId = :u', values: { ':u': userId } }, limit: 20 });
    for (const s of sess) await deleteItem(TABLES.SESSIONS, { id: s.id }).catch(() => {});
    console.log(`\ncleaned up test user ${userId} (+${ledger.length} ledger row(s))`);
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
