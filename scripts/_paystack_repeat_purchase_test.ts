/**
 * Gate test for /api/paystack/initialize repeat-purchase guard.
 *
 * A second checkout started within 5 minutes must be refused with 409
 * (REPEAT_PURCHASE_CONFIRM) unless the request carries confirm_repeat: true.
 * Hermetic: lib/userService, lib/paystack and lib/auth are replaced via
 * require.cache BEFORE the handler loads, so nothing touches DynamoDB,
 * Paystack or the network.
 *
 * Covers:
 *   A. first purchase (no prior checkout)              → 200, Paystack called
 *   B. second purchase within 5 min, no confirm        → 409, Paystack NOT called
 *   C. second purchase within 5 min, confirm_repeat    → 200, Paystack called
 *   D. second purchase after 5 min, no confirm         → 200, Paystack called
 *
 * Run: npx tsx scripts/_paystack_repeat_purchase_test.ts
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

const USER_ID = 'user-A';
const EMAIL = 'a@test.dev';
const user: any = { id: USER_ID, email: EMAIL, credits: 5 };

let paystackCalls = 0;

stubModule('lib/userService', {
  getUser: async (id: string) => (id === USER_ID ? user : null),
  updateUser: async (id: string, patch: any) => {
    if (id === USER_ID) Object.assign(user, patch);
    return user;
  },
});

stubModule('lib/paystack', {
  initializePayment: async () => {
    paystackCalls++;
    return { data: { authorization_url: 'https://checkout.test', access_code: 'ac', reference: `ref_${paystackCalls}` } };
  },
});

stubModule('lib/auth', {
  requireOwner: async () => ({ ok: true }),
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const handler = require(resolve('api/paystack/initialize.ts')).default;

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}

async function call(body: any) {
  const before = paystackCalls;
  const res = mockRes();
  await handler({ method: 'POST', body: { user_id: USER_ID, credits: 50, email: EMAIL, pool: 'personal', ...body } } as any, res);
  return { status: res.statusCode, code: res.body?.code, called: paystackCalls > before };
}

let failures = 0;
function check(label: string, cond: boolean, detail: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`, cond ? '' : JSON.stringify(detail));
  if (!cond) failures++;
}

(async () => {
  // A. first purchase
  const a = await call({});
  check('A first purchase is allowed', a.status === 200 && a.called, a);

  // B. second within 5 min without confirm → refused
  const b = await call({});
  check('B repeat within 5 min is refused (409)', b.status === 409 && b.code === 'REPEAT_PURCHASE_CONFIRM' && !b.called, b);

  // C. same window with explicit confirmation → allowed
  const c = await call({ confirm_repeat: true });
  check('C repeat within 5 min with confirm_repeat is allowed', c.status === 200 && c.called, c);

  // D. last checkout 6 minutes ago → allowed without confirm
  user.lastCheckoutInitAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const d = await call({});
  check('D repeat after 5 min window is allowed', d.status === 200 && d.called, d);

  if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('All repeat-purchase checks passed');
  process.exit(0);
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
