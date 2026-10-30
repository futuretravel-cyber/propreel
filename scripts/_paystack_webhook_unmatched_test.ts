/**
 * Regression test for api/paystack/webhook.ts: a signed charge.success whose
 * customer email matches no user must be recorded as an UNMATCHED_PAYMENT row
 * for admin reconciliation, alert the admins exactly once, grant no credit, and
 * acknowledge with 200 while KEEPING its idempotency claim so Paystack's
 * redelivery is deduped instead of retried.
 *
 * This file previously asserted the old "return 500 and release the claim"
 * behaviour, which made Paystack retry a payment that could never match and
 * buried the orphaned money in the logs. The 200-and-record contract is the
 * intended one; fix the handler, never this test, if it regresses.
 *
 * Hermetic: lib/db, lib/userService, lib/invoice, lib/dunning and lib/email
 * are replaced via require.cache BEFORE the handler loads. lib/paystack is the
 * REAL module so the HMAC-SHA512 signature check is exercised with a real
 * signed payload.
 *
 * Run: npx tsx scripts/_paystack_webhook_unmatched_test.ts
 */
import path from 'path';
import Module from 'module';
import { createHash, createHmac } from 'crypto';

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

const SECRET = 'sk_test_unmatched_webhook_secret';
process.env.PAYSTACK_SECRET_KEY = SECRET;

const calls = {
  putItemIfNotExists: [] as string[],
  deleteItem: [] as string[],
  scanItems: 0,
  addCredits: 0,
  allocateMonthlyCredits: 0,
  unmatchedItems: [] as any[],
};

// Mirrors the real put-if-absent: a second write of the same id returns false.
// That is what makes the admin alert fire once per orphaned payment.
const alreadyPresent = new Set<string>();

// The DB stub is what getUserByEmail() scans through. An empty scan means no user
// matches the email, which is the case under test.
stubModule('lib/db', {
  TABLES: {
    SESSIONS: 'sessions', USERS: 'users', SETTINGS: 'settings',
    PROJECTS: 'projects', CREDIT_TRANSACTIONS: 'credit_transactions',
  },
  getItem: async () => null,
  putItem: async () => ({}),
  updateItem: async () => ({}),
  deleteItem: async (_table: string, key: { id: string }) => {
    calls.deleteItem.push(key.id);
    return {};
  },
  scanItems: async () => {
    calls.scanItems++;
    return [];
  },
  queryItems: async () => [],
  queryIndex: async () => [],
  putItemIfNotExists: async (_table: string, item: { id: string }) => {
    calls.putItemIfNotExists.push(item.id);
    if (item.id.startsWith('unmatched_')) calls.unmatchedItems.push(item);
    if (alreadyPresent.has(item.id)) return false;
    alreadyPresent.add(item.id);
    return true;
  },
  docClient: { send: async () => ({}) },
});

stubModule('lib/userService', {
  addCredits: async () => {
    calls.addCredits++;
    return {};
  },
  allocateMonthlyCredits: async () => {
    calls.allocateMonthlyCredits++;
    return {};
  },
  createSubscription: async () => ({}),
  getUser: async () => null,
  updateUser: async () => ({}),
  markUpgradePaid: async () => true,
  applyPendingUpgrade: async () => ({}),
});

stubModule('lib/invoice', { generateInvoicePdf: async () => Buffer.from('') });
stubModule('lib/dunning', { clearDunningAndNotify: async () => ({}) });
const emailRecipients: string[] = [];
stubModule('lib/email', {
  sendEmail: async (input: { to: string }) => { emailRecipients.push(input.to); return { ok: true }; },
  paymentFailedTemplate: () => ({ subject: '', html: '' }),
});

const handler = require(resolve('api/paystack/webhook')).default;

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

// Signs the exact compact JSON the verifier HMACs when no raw body is supplied.
function signedRequest(body: any) {
  const signature = createHmac('sha512', SECRET).update(JSON.stringify(body)).digest('hex');
  return {
    method: 'POST',
    body,
    rawBody: undefined,
    headers: { 'x-paystack-signature': signature },
    socket: { remoteAddress: '127.0.0.1' },
    query: {},
  } as any;
}

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS: ${name}`);
  else { failures++; console.log(`  FAIL: ${name} ${detail}`); }
}

async function main() {
  const payload = {
    event: 'charge.success',
    data: {
      customer_email: 'nobody-matches@test.dev',
      amount: 500000,
      reference: 'REF_UNMATCHED_TEST',
      metadata: {},
    },
  };
  const expectedClaimId = `psevt_charge.success_${createHash('sha256')
    .update(JSON.stringify(payload)).digest('hex').slice(0, 32)}`;

  const origError = console.error;
  console.error = () => {}; // the handler logs the expected error; keep output clean
  const { res, state } = fakeRes();
  try {
    await handler(signedRequest(payload), res);
  } finally {
    console.error = origError;
  }

  console.log('Unmatched email charge.success');
  check('signature accepted (handler reached the event path)', state.status !== 401, `got ${state.status}`);
  check('returns 200 (no Paystack retry)', state.status === 200, `got ${state.status} ${JSON.stringify(state.body)}`);
  check('body marks the charge unmatched',
    state.body?.unmatched === true && state.body?.reference === 'REF_UNMATCHED_TEST',
    JSON.stringify(state.body));
  check('claim was taken for this event', calls.putItemIfNotExists.includes(expectedClaimId),
    JSON.stringify(calls.putItemIfNotExists));
  check('claim is KEPT so a redelivery is deduped', !calls.deleteItem.includes(expectedClaimId),
    JSON.stringify(calls.deleteItem));
  check('orphaned payment recorded under its reference',
    calls.putItemIfNotExists.includes('unmatched_REF_UNMATCHED_TEST'),
    JSON.stringify(calls.putItemIfNotExists));
  check('recorded row is an UNMATCHED_PAYMENT with Rand amount + email',
    calls.unmatchedItems[0]?.type === 'UNMATCHED_PAYMENT' &&
      calls.unmatchedItems[0]?.amountZar === 5000 &&
      calls.unmatchedItems[0]?.email === 'nobody-matches@test.dev',
    JSON.stringify(calls.unmatchedItems[0]));
  check('user lookup ran (stub was hit)', calls.scanItems > 0);
  check('admin alert sent to every admin', emailRecipients.length === 2 && emailRecipients.includes('futuretravel@gmail.com') && emailRecipients.includes('ulric@propreel.co.za'),
    JSON.stringify(emailRecipients));
  check('no credits granted', calls.addCredits === 0 && calls.allocateMonthlyCredits === 0,
    JSON.stringify(calls));

  // ── Second orphaned charge for the SAME reference ────────────────────────
  // A different payload (new data.id) means a new event claim, but the
  // unmatched row already exists. The row must not be duplicated and the
  // admins must not be emailed twice for one orphaned payment.
  const alertsAfterFirst = emailRecipients.length;
  const repeatPayload = {
    event: 'charge.success',
    data: {
      id: 999,
      customer_email: 'nobody-matches@test.dev',
      amount: 500000,
      reference: 'REF_UNMATCHED_TEST',
      metadata: {},
    },
  };
  {
    const origError2 = console.error;
    console.error = () => {};
    const { res, state } = fakeRes();
    try {
      await handler(signedRequest(repeatPayload), res);
    } finally {
      console.error = origError2;
    }
    console.log('Same orphaned reference delivered again');
    check('still acknowledges 200', state.status === 200, `got ${state.status}`);
    check('no duplicate alert for the same reference',
      emailRecipients.length === alertsAfterFirst,
      `alerts went ${alertsAfterFirst} -> ${emailRecipients.length}`);
    check('exactly one UNMATCHED_PAYMENT row was requested',
      calls.putItemIfNotExists.filter((id) => id === 'unmatched_REF_UNMATCHED_TEST').length === 2 &&
        calls.unmatchedItems.length === 2,
      JSON.stringify(calls.unmatchedItems.length));
    check('still no credits granted', calls.addCredits === 0 && calls.allocateMonthlyCredits === 0);
  }

  // ── Recurring plan charge with no matching user ──────────────────────────
  // This path used to THROW, which released the event claim and made Paystack
  // retry a charge that can never match — for days — with nobody notified.
  // It must acknowledge 200, record the charge, and alert the admins.
  //
  // Reaching it requires metadata.user_id to be present (otherwise the earlier
  // `!userId` return handles the charge) while the customer email matches no
  // user — i.e. the payer changed their email in Paystack after subscribing.
  const alertsBeforeRecurring = emailRecipients.length;
  const recurringPayload = {
    event: 'charge.success',
    data: {
      id: 1001,
      customer_email: 'gone@test.dev',
      amount: 49900,
      currency: 'ZAR',
      reference: 'REF_RECURRING_ORPHAN',
      plan: { plan_code: 'PLN_monthly' },
      subscription: { next_payment_date: '2026-11-30T00:00:00.000Z' },
      metadata: { user_id: 'user-orphaned-sub' },
    },
  };
  {
    const origError3 = console.error;
    console.error = () => {};
    const { res, state } = fakeRes();
    let threw = false;
    try {
      await handler(signedRequest(recurringPayload), res);
    } catch {
      threw = true;
    } finally {
      console.error = origError3;
    }
    const recurringRow = calls.unmatchedItems.find(
      (i) => i.reference === 'REF_RECURRING_ORPHAN',
    );
    console.log('Recurring plan charge with no user');
    check('handler does not throw', !threw);
    check('acknowledges 200 (no Paystack retry)', state.status === 200, `got ${state.status}`);
    check('claim is KEPT so a redelivery is deduped',
      !calls.deleteItem.includes(`psevt_charge.success_` +
        createHash('sha256').update(JSON.stringify(recurringPayload)).digest('hex').slice(0, 32)),
      JSON.stringify(calls.deleteItem));
    check('orphaned renewal recorded as a recurring plan charge',
      recurringRow?.type === 'UNMATCHED_PAYMENT' &&
        recurringRow?.kind === 'recurring plan charge' &&
        recurringRow?.amountZar === 499 &&
        recurringRow?.planCode === 'PLN_monthly',
      JSON.stringify(recurringRow));
    check('admins were alerted for the orphaned renewal',
      emailRecipients.length === alertsBeforeRecurring + 2,
      `alerts went ${alertsBeforeRecurring} -> ${emailRecipients.length}`);
    check('no monthly allocation and no credits granted',
      calls.allocateMonthlyCredits === 0 && calls.addCredits === 0,
      JSON.stringify(calls));
  }

  console.log(failures === 0 ? '\nALL WEBHOOK UNMATCHED TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
