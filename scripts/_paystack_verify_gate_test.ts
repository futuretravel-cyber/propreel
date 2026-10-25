/**
 * Gate test for /api/paystack/verify (security-audit H-1 fix, 2026-10-25).
 *
 * Hermetic: lib/db, lib/paystack, lib/userService and lib/rateLimit are
 * replaced via require.cache BEFORE the handler loads, so nothing touches
 * DynamoDB, Paystack or the network. lib/auth is the REAL module so the
 * requireOwner gate logic itself is what gets exercised.
 *
 * Covers:
 *   A. no session cookie            → 401, Paystack never queried
 *   B. signed-in, foreign reference → 403, no billing state in the body
 *   C. signed-in, own reference, per-user limit exhausted → 429
 *      (429 instead of 403 proves the ownership gate PASSED for the owner)
 *   D. signed-in, per-IP limit exhausted → 429 before Paystack is queried
 *
 * Run: npx tsx scripts/_paystack_verify_gate_test.ts
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

// ── stub state (mutated per test) ────────────────────────────────────────────
const TOKEN = 'tok-A-0000000000000000000000000000'; // ≥20 chars: passes the length guard
const USER_A = { id: 'user-A', email: 'a@test.dev', credits: 5, role: 'AGENT' };
const USER_B = { id: 'user-B', email: 'b@test.dev', credits: 999, role: 'AGENT' };

const calls = { verifyPayment: 0, getUser: 0 };
let nextPayment: any = null; // what the verifyPayment stub returns
let rateLimitBlocked: Set<'ip' | 'user'> = new Set();

stubModule('lib/db', {
  TABLES: {
    SESSIONS: 'sessions', USERS: 'users', SETTINGS: 'settings',
    PROJECTS: 'projects', CREDIT_TRANSACTIONS: 'credit_transactions',
  },
  getItem: async (table: string, key: any) => {
    if (table === 'sessions' && key.id === TOKEN) {
      return { id: TOKEN, userId: USER_A.id, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    }
    if (table === 'users') {
      if (key.id === USER_A.id) return USER_A;
      if (key.id === USER_B.id) return USER_B;
    }
    return null;
  },
  putItem: async () => ({}),
  updateItem: async () => ({}),
  deleteItem: async () => ({}),
  scanItems: async () => [],
  queryItems: async () => [],
  queryIndex: async () => [],
  putItemIfNotExists: async () => true,
  docClient: { send: async () => ({}) },
});

stubModule('lib/paystack', {
  verifyPayment: async () => {
    calls.verifyPayment++;
    return nextPayment;
  },
});

stubModule('lib/userService', {
  getUser: async (id: string) => {
    calls.getUser++;
    return id === USER_A.id ? USER_A : id === USER_B.id ? USER_B : null;
  },
});

stubModule('lib/rateLimit', {
  consumeRateLimit: async (scope: string) =>
    rateLimitBlocked.has(scope.endsWith('_ip') ? 'ip' : 'user')
      ? { allowed: false, remaining: 0, retryAfterSec: 60 }
      : { allowed: true, remaining: 59, retryAfterSec: 0 },
});

const handler = require(resolve('api/paystack/verify')).default;

// ── tiny fake req/res ────────────────────────────────────────────────────────
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

function fakeReq(body: any, cookie?: string) {
  return {
    method: 'POST',
    body,
    headers: cookie ? { cookie: `propreel_session=${cookie}` } : {},
    socket: { remoteAddress: '127.0.0.1' },
    query: {},
  } as any;
}

const successPaymentFor = (userId: string) => ({
  data: {
    status: 'success',
    id: 4242,
    amount: 15000,
    customer: { email: 'a@test.dev' },
    metadata: { user_id: userId, credits: 100 },
  },
});

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS: ${name}`);
  else { failures++; console.log(`  FAIL: ${name} ${detail}`); }
}

async function main() {
  // ── A. unauthenticated → 401, no Paystack call ────────────────────────────
  calls.verifyPayment = 0;
  nextPayment = successPaymentFor(USER_A.id);
  rateLimitBlocked = new Set();
  {
    const { res, state } = fakeRes();
    await handler(fakeReq({ reference: 'REF_A' }), res);
    console.log('A. no session');
    check('returns 401', state.status === 401, `got ${state.status}`);
    check('Paystack never queried', calls.verifyPayment === 0);
    check('body has no billing state',
      state.body?.new_balance === undefined && state.body?.subscription === undefined);
  }

  // ── B. signed-in, reference belongs to another user → 403, no state leak ──
  calls.verifyPayment = 0;
  nextPayment = successPaymentFor(USER_B.id); // metadata.user_id = user-B
  {
    const { res, state } = fakeRes();
    await handler(fakeReq({ reference: 'REF_B' }, TOKEN), res);
    console.log('B. foreign reference');
    check('returns 403', state.status === 403, `got ${state.status} ${JSON.stringify(state.body)}`);
    check('code is NOT_ALLOWED', state.body?.code === 'NOT_ALLOWED');
    check('body has no billing state',
      state.body?.new_balance === undefined && state.body?.subscription === undefined,
      JSON.stringify(state.body));
  }

  // ── C. own reference + per-user limit exhausted → 429 (gate passed) ───────
  calls.verifyPayment = 0;
  nextPayment = successPaymentFor(USER_A.id);
  rateLimitBlocked = new Set(['user']);
  {
    const { res, state } = fakeRes();
    await handler(fakeReq({ reference: 'REF_C' }, TOKEN), res);
    console.log('C. owner passes the ownership gate (throttled after)');
    check('returns 429 not 403', state.status === 429, `got ${state.status} ${JSON.stringify(state.body)}`);
    check('Paystack was queried (gate is post-verify)', calls.verifyPayment === 1);
  }

  // ── D. per-IP limit exhausted → 429 BEFORE the Paystack lookup ────────────
  calls.verifyPayment = 0;
  rateLimitBlocked = new Set(['ip']);
  {
    const { res, state } = fakeRes();
    await handler(fakeReq({ reference: 'REF_D' }, TOKEN), res);
    console.log('D. IP throttle is pre-Paystack');
    check('returns 429', state.status === 429, `got ${state.status}`);
    check('Paystack never queried', calls.verifyPayment === 0);
  }

  console.log(failures === 0 ? '\nALL GATE TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
