/**
 * End-to-end test of admin credit grants: POST /api/credits?action=add.
 *
 * Usage: npx tsx scripts/test_admin_grants.ts   (lib/db-dynamodb loads .env)
 *
 * Boots api/credits behind a tiny HTTP shim (same pattern as
 * scripts/test_auth_flow.ts), then drives the authorization and validation
 * matrix with two throwaway users written straight to DynamoDB:
 *
 *   - no session        → 401
 *   - non-admin session → 403          (requireAdminSession gate)
 *   - admin, source≠bonus          → 403
 *   - admin, fractional/negative/zero/over-cap/string amount → 400
 *   - admin, valid grant → 200, new_balance = before + N (server truth)
 *   - ledger row: type 'bonus', metadata.kind ADMIN_CREDIT_GRANT, by admin email
 *
 * Every trace (users, sessions, ledger rows) is removed at the end; the
 * script verifies no residue before exiting non-zero on any failed check.
 */
import http from 'http';
import { URL } from 'url';
import handler from '../api/credits';
import { scanItems, deleteItem, putItem, TABLES } from '../lib/db';
import { createSession } from '../lib/auth';

const PORT = 4312;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const ADMIN_EMAIL = `propreel.autotest.admin.${STAMP}@gmail.com`;
const USER_EMAIL = `propreel.autotest.recipient.${STAMP}@gmail.com`;

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
      await handler({ method: req.method, query, body, headers: req.headers } as any, r);
    } catch (e: any) {
      r.statusCode = 500;
      r.body = { error: `harness: ${e?.message || e}` };
    }

    const outHeaders: Record<string, any> = { 'Content-Type': 'application/json', ...r.headers };
    res.writeHead(r.statusCode, outHeaders);
    res.end(JSON.stringify(r.body ?? {}));
  });
}

async function post(path: string, body: any, cookie?: string): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

async function main() {
  const server = makeServer();
  await new Promise<void>(r => server.listen(PORT, '127.0.0.1', r));
  console.log(`harness on :${PORT}`);

  // Throwaway rows: an ADMIN-role account (role, not curated email, so the
  // test also proves role-based admin passes isAdminActor) and a recipient.
  const adminId = `usr_autotest_admin_${STAMP}`;
  const userId = `usr_autotest_recipient_${STAMP}`;
  await putItem(TABLES.USERS, {
    id: adminId, email: ADMIN_EMAIL, fullName: 'Auto Test Admin',
    role: 'ADMIN', credits: 0, createdAt: new Date().toISOString(),
  } as any);
  await putItem(TABLES.USERS, {
    id: userId, email: USER_EMAIL, fullName: 'Auto Test Recipient',
    role: 'AGENT', credits: 0, createdAt: new Date().toISOString(),
  } as any);

  const adminToken = await createSession(adminId);
  const userToken = await createSession(userId);
  const adminCookie = `propreel_session=${adminToken}`;
  const userCookie = `propreel_session=${userToken}`;

  const action = (body: any, cookie?: string) => post('/api/credits?action=add', body, cookie);
  const goodBody = (over: any = {}) => ({
    user_id: userId, amount: 100, source: 'bonus', description: 'Auto test grant', ...over,
  });

  try {
    // ── Authorization matrix ─────────────────────────────────────────
    let r = await action(goodBody());
    check('no session → 401', r.status === 401, r.json);

    r = await action(goodBody(), userCookie);
    check('non-admin session → 403', r.status === 403, r.json);

    r = await action(goodBody({ source: 'purchase' }), adminCookie);
    check("admin + source 'purchase' → 403 (bonus only)", r.status === 403, r.json);

    // ── Amount validation (the hardened branch) ──────────────────────
    r = await action(goodBody({ amount: 10.5 }), adminCookie);
    check('fractional amount → 400', r.status === 400, r.json);

    r = await action(goodBody({ amount: -50 }), adminCookie);
    check('negative amount → 400', r.status === 400, r.json);

    r = await action(goodBody({ amount: 0 }), adminCookie);
    check('zero amount → 400', r.status === 400, r.json);

    r = await action(goodBody({ amount: 1_000_001 }), adminCookie);
    check('over-cap amount → 400', r.status === 400, r.json);

    r = await action(goodBody({ amount: '100' }), adminCookie);
    check('string amount → 400', r.status === 400, r.json);

    // ── The real grant ───────────────────────────────────────────────
    r = await action(goodBody({ amount: 137 }), adminCookie);
    check('valid grant → 200 + new_balance 137', r.status === 200 && r.json.new_balance === 137, r.json);

    r = await action(goodBody({ amount: 50 }), adminCookie);
    check('second grant accumulates → 187', r.status === 200 && r.json.new_balance === 187, r.json);

    // Server-side truth on the row itself
    const rows = await scanItems<any>(TABLES.USERS, { filter: { expression: 'email = :e', values: { ':e': USER_EMAIL } }, limit: 5 });
    check('recipient row credits = 187', rows[0]?.credits === 187, rows[0]?.credits);

    // ── Ledger audit stamp ───────────────────────────────────────────
    const ledger = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { filter: { expression: 'userId = :u', values: { ':u': userId } }, limit: 20 });
    const grantRows = ledger.filter(t => t.metadata?.kind === 'ADMIN_CREDIT_GRANT');
    check('two ADMIN_CREDIT_GRANT ledger rows', grantRows.length === 2, grantRows.length);
    check('ledger type bonus + by=admin email (server-stamped, unforgeable)',
      grantRows.every(t => t.type === 'bonus' && t.metadata?.by === ADMIN_EMAIL),
      grantRows.map(t => ({ type: t.type, by: t.metadata?.by })));
    check('ledger amount 137 + 50',
      grantRows.map((t: any) => t.amount).sort((a: number, b: number) => a - b).join(',') === '50,137',
      grantRows.map((t: any) => t.amount));
  } finally {
    // ── Cleanup: every trace of both throwaway accounts ──────────────
    for (const uid of [adminId, userId]) {
      const ledger = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { filter: { expression: 'userId = :u', values: { ':u': uid } }, limit: 50 });
      for (const t of ledger) await deleteItem(TABLES.CREDIT_TRANSACTIONS, { userId: t.userId, createdAt: t.createdAt }).catch(() => {});
      const sess = await scanItems<any>(TABLES.SESSIONS, { filter: { expression: 'userId = :u', values: { ':u': uid } }, limit: 20 });
      for (const s of sess) await deleteItem(TABLES.SESSIONS, { id: s.id }).catch(() => {});
      await deleteItem(TABLES.USERS, { id: uid }).catch(() => {});
    }

    // Residue check: neither email may survive
    const leftAdmin = await scanItems<any>(TABLES.USERS, { filter: { expression: 'email = :e', values: { ':e': ADMIN_EMAIL } }, limit: 5 });
    const leftUser = await scanItems<any>(TABLES.USERS, { filter: { expression: 'email = :e', values: { ':e': USER_EMAIL } }, limit: 5 });
    check('no residue (admin row gone)', leftAdmin.length === 0, leftAdmin.length);
    check('no residue (recipient row gone)', leftUser.length === 0, leftUser.length);

    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
