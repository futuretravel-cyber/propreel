/**
 * Regression tests for the L-1/L-2 hardening (security audit 2026-10-25):
 *   L-2  /api/leads public POSTs are rate limited (10/action/IP/hour)
 *   +    agency_invite / agency_accept_pending are session-gated (found while
 *        implementing: both trusted the body's user id with no session check)
 *   L-1  /api/users?action=admin_api_keys never echoes submitted secret values
 *
 * Hermetic: lib/db and lib/userService are replaced via require.cache before
 * the handlers load, so nothing touches AWS or the network. lib/auth and
 * lib/rateLimit are the REAL modules so the requireOwner gates and the
 * limiter itself are what gets exercised — the limiter is steered through the
 * stubbed lib/db it calls (docClient.send = the atomic ADD guard).
 *
 * Note on the stubs: Node 20's ESM↔CJS bridge exposes a synthetic
 * require.cache entry to `await import()` as `default` ONLY, so modules the
 * handlers load via dynamic import() cannot be stubbed that way —
 * `const { consumeRateLimit } = await import('../lib/rateLimit')` would
 * destructure to undefined and the handler 500s ("consumeRateLimit is not a
 * function" — exactly what CI's Node 20 showed while Node 24's interop hid
 * it locally). Static require()s and real modules with stubbed dependencies
 * behave identically on every Node.
 *
 * Run: npx tsx scripts/_leads_admin_hardening_test.ts
 */
import path from 'path';
import Module from 'module';

const root = path.resolve(__dirname, '..');
const resolve = (rel: string) => require.resolve(path.join(root, rel));

function stubModule(rel: string, exports: Record<string, unknown>) {
  const resolved = resolve(rel);
  const m = new (Module as any)(resolved);
  m.filename = resolved;
  m.loaded = true;
  m.exports = exports;
  require.cache[resolved] = m;
}

// ── stub state ──────────────────────────────────────────────────────────────
const TOKEN_A = 'tok-A-0000000000000000000000000000';   // user-A (regular)
const TOKEN_ADMIN = 'tok-admin-0000000000000000000000'; // user-admin (ADMIN)
const USER_A = { id: 'user-A', email: 'a@test.dev', role: 'AGENT' };
const USER_B = { id: 'user-B', email: 'b@test.dev', role: 'AGENT' };
const USER_ADMIN = { id: 'user-admin', email: 'futuretravel@gmail.com', role: 'ADMIN' };
const USERS: Record<string, any> = { 'user-A': USER_A, 'user-B': USER_B, 'user-admin': USER_ADMIN };

let rateBlocked = false;
const dbWrites: Array<{ table: string; item: any }> = [];
const userUpdates: Array<{ id: string; updates: any }> = [];

stubModule('lib/db', {
  TABLES: {
    SESSIONS: 'sessions', USERS: 'users', SETTINGS: 'settings',
    PROJECTS: 'projects', CREDIT_TRANSACTIONS: 'credit_transactions',
    AGENCY_MEMBERS: 'agency_members',
  },
  getItem: async (table: string, key: any) => {
    if (table === 'sessions') {
      if (key.id === TOKEN_A) return { id: TOKEN_A, userId: 'user-A', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
      if (key.id === TOKEN_ADMIN) return { id: TOKEN_ADMIN, userId: 'user-admin', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    }
    if (table === 'users') return USERS[key.id] || null;
    // Real consumeRateLimit's rollover probe: report an exhausted in-window
    // counter when the scenario is throttled (same 3600s window math the
    // handler passes to consumeRateLimit('lead_post', …, 10, 3600)).
    if (rateBlocked && String(key?.id || '').startsWith('rl_')) {
      return { id: key.id, windowStart: Math.floor(Date.now() / 1000 / 3600) * 3600, count: 999 };
    }
    return null;
  },
  putItem: async (table: string, item: any) => { dbWrites.push({ table, item }); return item; },
  updateItem: async (table: string, key: any, updates: any) => { dbWrites.push({ table, item: { key, ...updates } }); },
  deleteItem: async () => ({}),
  scanItems: async () => [],
  queryItems: async () => [],
  queryIndex: async () => [],
  putItemIfNotExists: async () => true,
  // The real consumeRateLimit's atomic ADD guard: throw the exact DynamoDB
  // conditional error when the scenario is throttled (→ block path), answer
  // with an incremented counter otherwise (→ allowed, remaining = limit-1).
  docClient: {
    send: async () => {
      if (rateBlocked) {
        const err: any = new Error('The conditional request failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      return { Attributes: { count: 1 } };
    },
  },
});

stubModule('lib/userService', {
  getUser: async (id: string) => USERS[id] || null,
  getUserByEmail: async (email: string) => Object.values(USERS).find(u => u.email === email) || null,
  updateUser: async (id: string, updates: any) => { userUpdates.push({ id, updates }); },
});

// lib/rateLimit is NOT stubbed (see header): the real limiter runs against
// the stubbed lib/db above, so `rateBlocked` steers its DynamoDB guard.

const leadsHandler = require(resolve('api/leads')).default;
const { adminApiKeysRoute } = require(resolve('lib/userRoutes/admin'));

// ── fake req/res ────────────────────────────────────────────────────────────
function fakeRes() {
  const state: { status: number; body: any } = { status: 0, body: undefined };
  const res: any = {
    status(n: number) { state.status = n; return res; },
    json(o: any) { state.body = o; return res; },
    setHeader() { return res; },
    send() { return res; },
  };
  return { res, state };
}

function fakeReq(action: string, body: any, cookie?: string) {
  return {
    method: 'POST',
    body,
    query: { action },
    headers: cookie ? { cookie: `propreel_session=${cookie}` } : {},
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
}

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS: ${name}`);
  else { failures++; console.log(`  FAIL: ${name} ${detail}`); }
}

async function main() {
  // ── 1. rate limit blocks a public POST ────────────────────────────────────
  console.log('1. public POST throttled');
  rateBlocked = true;
  dbWrites.length = 0;
  {
    const { res, state } = fakeRes();
    await leadsHandler(fakeReq('review', { fullName: 'X', rating: 5, comment: 'hi' }), res);
    check('review returns 429 when throttled', state.status === 429, `got ${state.status}`);
    check('code is RATE_LIMITED', state.body?.code === 'RATE_LIMITED', JSON.stringify(state.body));
    check('no rows written', dbWrites.length === 0, JSON.stringify(dbWrites));
  }

  // ── 2. and lets a legitimate one through ─────────────────────────────────
  console.log('2. public POST allowed');
  rateBlocked = false;
  dbWrites.length = 0;
  {
    const { res, state } = fakeRes();
    await leadsHandler(fakeReq('contact', { name: 'X', email: 'x@y.z', message: 'hello' }), res);
    check('contact returns 201', state.status === 201, `got ${state.status} ${JSON.stringify(state.body)}`);
    check('contact row stored', dbWrites.some(d => d.item?.type === 'contact_message'), JSON.stringify(dbWrites));
  }

  // ── 3. agency_invite is session-gated ────────────────────────────────────
  console.log('3. agency_invite gate');
  dbWrites.length = 0;
  {
    const { res, state } = fakeRes();
    await leadsHandler(fakeReq('agency_invite', { inviter_user_id: 'user-B', invite_email: 'x@y.z' }), res);
    check('unauthenticated invite 401s', state.status === 401, `got ${state.status}`);
  }
  {
    const { res, state } = fakeRes();
    await leadsHandler(fakeReq('agency_invite', { inviter_user_id: 'user-B', invite_email: 'x@y.z' }, TOKEN_A), res);
    check('caller does not own the inviter id → 403', state.status === 403, `got ${state.status} ${JSON.stringify(state.body)}`);
    check('no rows written', dbWrites.length === 0, JSON.stringify(dbWrites));
  }

  // ── 4. agency_accept_pending is session-gated ────────────────────────────
  console.log('4. agency_accept_pending gate');
  {
    const { res, state } = fakeRes();
    await leadsHandler(fakeReq('agency_accept_pending', { user_id: 'user-B' }, TOKEN_A), res);
    check('session A cannot join user-B → 403', state.status === 403, `got ${state.status} ${JSON.stringify(state.body)}`);
  }

  // ── 5. admin API-keys never echoes secret values (L-1) ───────────────────
  console.log('5. admin_api_keys response is value-free');
  {
    const { res, state } = fakeRes();
    await adminApiKeysRoute(fakeReq('', {
      service_id: 'paystack',
      values: { PAYSTACK_SECRET_KEY: 'sk_test_LEAKME123456789' },
      redeploy: false,
    }, TOKEN_ADMIN), res);
    const raw = JSON.stringify(state.body);
    check('route answers 200', state.status === 200, `got ${state.status} ${raw.slice(0, 200)}`);
    check('secret value absent from response', !raw.includes('LEAKME'), raw.slice(0, 300));
    check('updatedKeys names the key', state.body?.updatedKeys?.includes('PAYSTACK_SECRET_KEY'), raw.slice(0, 300));
  }

  console.log(failures === 0 ? '\nALL L-1/L-2 HARDENING TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
