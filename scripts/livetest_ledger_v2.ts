/**
 * Live E2E test for ledger v2 (transfer + eventId idempotency + agency pool).
 * Seeds propreel-livetest users, exercises lib/userService against the real
 * DynamoDB tables, prints results, then cleans up all created rows.
 *
 * Usage: npx tsx scripts/livetest_ledger_v2.ts
 */
import { putItem, deleteItem, queryItems, scanItems, TABLES } from '../lib/db';
import {
  addCredits,
  transferCredits,
  deductCredits,
  addAgencyPoolCredits,
  getUser,
} from '../lib/userService';

const A = 'propreel-livetest-a';
const B = 'propreel-livetest-b';
const stamp = Date.now();

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

async function seed(id: string, credits: number, extra: Record<string, any> = {}) {
  const now = new Date().toISOString();
  await putItem(TABLES.USERS, {
      id,
      email: `${id}@example.com`,
      fullName: 'Ledger Livetest',
      role: 'AGENT',
      credits,
      creditExpiries: [],
      subscription: null,
      autoTopup: { enabled: false, threshold: 50, amount: 200 },
      agencyId: null,
      agencyName: null,
      avatarUrl: null,
      emailVerified: false,
      lastLowCreditWarnedAt: null,
      createdAt: now,
      updatedAt: now,
      ...extra,
  });
}

async function cleanup() {
  // Ledger rows must be deleted with the table's REAL key (userId HASH +
  // createdAt RANGE).
  for (const id of [A, B]) {
    try { await deleteItem(TABLES.USERS, { id }); } catch { /* best effort */ }
    try {
      const rows = await queryItems<{ userId: string; createdAt: string; id: string }>(
        TABLES.CREDIT_TRANSACTIONS,
        { expression: 'userId = :u', values: { ':u': id } },
        { limit: 200 }
      );
      for (const r of rows) {
        await deleteItem(TABLES.CREDIT_TRANSACTIONS, { userId: r.userId, createdAt: r.createdAt });
      }
    } catch (e) { console.error('ledger cleanup failed for', id, e); }
  }
  // Settings-table event locks created by this test (evt_evt_livetest_<ts>)
  try {
    const markers = await scanItems<{ id: string }>(TABLES.SETTINGS, { limit: 500 });
    for (const m of markers) {
      if (m.id.startsWith('evt_evt_livetest_') || m.id.startsWith('pay_livetest_')) {
        await deleteItem(TABLES.SETTINGS, { id: m.id });
      }
    }
  } catch { /* best effort */ }
}

async function main() {
  console.log('Seeding test users…');
  await seed(A, 100);
  await seed(B, 20);

  try {
    // ── 1. eventId idempotency: duplicate addCredits must not double-credit ──
    console.log('\n[1] eventId idempotency');
    const eventId = `evt_livetest_${stamp}`;
    const r1 = await addCredits(A, 50, 'purchase', 'Livetest purchase #1', { via: 'livetest' }, undefined, eventId);
    check('first add credits', r1.success && r1.newBalance === 150, `newBalance=${r1.newBalance}`);
    const r2 = await addCredits(A, 50, 'purchase', 'Livetest purchase #1 (replay)', { via: 'livetest' }, undefined, eventId);
    check('duplicate eventId ignored', r2.duplicated === true, `duplicated=${r2.duplicated} newBalance=${r2.newBalance}`);
    const aAfter = await getUser(A);
    check('balance unchanged after replay', aAfter?.credits === 150, `credits=${aAfter?.credits}`);

    // ── 2. transferCredits: atomic sender deduct + linked ledger rows ──────
    console.log('\n[2] transferCredits');
    const t1 = await transferCredits(A, B, 30, 'Livetest transfer');
    check('transfer succeeds', t1.success, `sender newBalance=${t1.newBalance}`);
    const a2 = await getUser(A);
    const b2 = await getUser(B);
    check('sender debited', a2?.credits === 120, `A=${a2?.credits}`);
    check('receiver credited', b2?.credits === 50, `B=${b2?.credits}`);

    // Insufficient-funds transfer must fail cleanly
    const t2 = await transferCredits(B, A, 9999, 'Livetest overspend');
    check('overspend rejected', !t2.success && t2.error === 'Insufficient credits', `error=${t2.error}`);

    // ── 3. Agency pool deduct ──────────────────────────────────────────────
    console.log('\n[3] agency pool');
    const p0 = await addAgencyPoolCredits(A, 500, 'Livetest pool top-up', { via: 'livetest' });
    check('pool top-up', p0 === 500, `pool=${p0}`);
    const d1 = await deductCredits(A, 40, 'Livetest render (pool)', { tier: 'CINEMATIC' }, 'agency');
    check('pool deduct', d1.success && d1.newBalance === 460, `pool=${d1.newBalance}`);
    const d2 = await deductCredits(A, 10000, 'Livetest overspend (pool)', {}, 'agency');
    check('pool overspend rejected', !d2.success && d2.error === 'Insufficient agency pool credits', `error=${d2.error}`);
    const a3 = await getUser(A);
    check('personal balance untouched by pool spend', a3?.credits === 120, `A=${a3?.credits}`);

    console.log(`\n${results.filter(r => r.pass).length}/${results.length} checks passed`);
    if (results.some(r => !r.pass)) process.exitCode = 1;
  } finally {
    console.log('\nCleaning up test rows…');
    await cleanup();
    console.log('Cleanup done.');
  }
}

main().catch(e => { console.error('LIVETEST ERROR:', e); process.exit(1); });
