/**
 * Live E2E test for the agency system: create → cap enforcement → invite cap
 * → per-agent limits → real-time usage analytics → monthly report PDF.
 * Seeds propreel-livetest users, exercises lib/agency + lib/agencyReport
 * against the real tables/S3, then cleans up all created rows.
 *
 * Usage: set -a; source .env; set +a; npx tsx scripts/livetest_agency.ts
 */
import { putItem, deleteItem, TABLES } from '../lib/db';
import { createAgency, getAgency, addMemberToAgency, setAgentMonthlyLimit, agencyUsageAnalytics, countMembers, listMembers } from '../lib/agency';
import { generateAndStoreAgencyReport, buildAgentMonthReport } from '../lib/agencyReport';
import { addAgencyPoolCredits, deductCredits, getUser } from '../lib/userService';

const OWNER = 'propreel-livetest-owner';
const AGENT1 = 'propreel-livetest-agent1';
const AGENT2 = 'propreel-livetest-agent2';
const AGENCY_ID = `agy_${OWNER}`;

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

async function seed(id: string, email: string, credits: number, extra: Record<string, any> = {}) {
  const now = new Date().toISOString();
  await putItem(TABLES.USERS, {
    id, email, fullName: `Livetest ${id.split('-').pop()}`,
    role: 'AGENT', credits, creditExpiries: [], subscription: null,
    autoTopup: { enabled: false, threshold: 50, amount: 200 },
    agencyId: null, agencyName: null, avatarUrl: null, emailVerified: false,
    lastLowCreditWarnedAt: null, createdAt: now, updatedAt: now,
    ...extra,
  });
}

async function del(tableName: string, key: Record<string, any>) {
  try { await deleteItem(tableName, key); } catch { /* best effort */ }
}

async function cleanup() {
  console.log('Cleaning up…');
  // Ledger rows use the real (userId, createdAt) key
  for (const id of [OWNER, AGENT1, AGENT2]) {
    try {
      const { queryItems } = await import('../lib/db');
      const rows = await queryItems<{ userId: string; createdAt: string }>(
        TABLES.CREDIT_TRANSACTIONS, { expression: 'userId = :u', values: { ':u': id } }, { limit: 200 });
      for (const r of rows) await del(TABLES.CREDIT_TRANSACTIONS, { userId: id, createdAt: r.createdAt });
    } catch { /* best effort */ }
    await del(TABLES.USERS, { id });
    await del(TABLES.AGENCY_MEMBERS, { agencyId: AGENCY_ID, userId: id });
  }
  await del(TABLES.AGENCIES, { id: AGENCY_ID });
  // Remove any pending invite rows created during the cap test
  try {
    const { scanItems } = await import('../lib/db');
    const { deleteItem } = await import('../lib/db-helpers');
    const invites = await scanItems<any>(TABLES.SETTINGS, { filter: { expression: '#t = :t', names: { '#t': 'type' }, values: { ':t': 'agency_invite' } }, limit: 100 });
    for (const i of invites.filter(i => String(i.id).includes('livetest') || (i.inviteEmail || '').includes('livetest'))) {
      await deleteItem(TABLES.SETTINGS, { id: i.id });
    }
  } catch { /* best effort */ }
  console.log('Cleanup done.');
}

async function main() {
  console.log('Seeding test users…');
  await seed(OWNER, 'propreel-livetest-owner@example.com', 1000, { role: 'AGENT' });
  await seed(AGENT1, 'propreel-livetest-agent1@example.com', 100);
  await seed(AGENT2, 'propreel-livetest-agent2@example.com', 100);

  try {
    // ── 1. Create agency (owner promoted) ─────────────────────────────────
    console.log('\n[1] create agency');
    const agency = await createAgency(
      { id: OWNER, email: 'propreel-livetest-owner@example.com', fullName: 'Livetest Owner' },
      { name: 'Livetest Realty', company: { registrationNumber: '2016/123456/07', vatNumber: '4123456789', address: '12 Test Street, Cape Town' } }
    );
    check('agency created with company details', agency.id === AGENCY_ID && agency.company.vatNumber === '4123456789', `id=${agency.id}`);
    const owner = await getUser(OWNER);
    check('owner promoted + attached', owner?.role === 'AGENCY_OWNER' && owner?.agencyId === AGENCY_ID, `role=${owner?.role} agencyId=${owner?.agencyId}`);
    check('owner occupies a member slot', (await countMembers(AGENCY_ID)) === 1, `members=${await countMembers(AGENCY_ID)}`);

    // ── 2. Add members + enforce the 10-agent cap ─────────────────────────
    console.log('\n[2] member cap');
    await addMemberToAgency(AGENCY_ID, AGENT1, 'AGENT');
    await addMemberToAgency(AGENCY_ID, AGENT2, 'AGENT');
    const members = await listMembers(AGENCY_ID);
    check('members attached with their own logins intact', members.length === 3 && members.every(m => m.name), `members=${members.map(m => m.name).join(',')}`);
    // Fill to the cap: agency now has 3, cap 10 → add 7 more seed users
    const fillers: string[] = [];
    for (let i = 0; i < 7; i++) {
      const fid = `propreel-livetest-filler${i}`;
      fillers.push(fid);
      await seed(fid, `propreel-livetest-filler${i}@example.com`, 0);
      await addMemberToAgency(AGENCY_ID, fid, 'AGENT');
    }
    check('cap reached at 10 members', (await countMembers(AGENCY_ID)) === 10, `members=${await countMembers(AGENCY_ID)}`);
    const f11 = 'propreel-livetest-filler10';
    await seed(f11, 'propreel-livetest-filler10@example.com', 0);
    let capThrew = false;
    try { await addMemberToAgency(AGENCY_ID, f11, 'AGENT'); } catch (e: any) { capThrew = String(e.message).startsWith('AGENT_LIMIT_REACHED'); }
    check('11th member rejected (hard cap)', capThrew, '');
    // Cleanup fillers immediately
    for (const fid of [...fillers, f11]) {
      await del(TABLES.USERS, { id: fid });
      await del(TABLES.AGENCY_MEMBERS, { agencyId: AGENCY_ID, userId: fid });
    }

    // ── 3. Per-agent monthly limit enforcement ────────────────────────────
    console.log('\n[3] per-agent limits');
    const topUp = await addAgencyPoolCredits(OWNER, 500, 'Livetest pool top-up', { via: 'livetest' });
    check('pool top-up lands on the shared agency row', topUp === 500, `pool=${topUp}`);
    const agencyAfterTopUp = await getAgency(AGENCY_ID);
    check('agency row poolCredits is source of truth', agencyAfterTopUp?.poolCredits === 500, `poolCredits=${agencyAfterTopUp?.poolCredits}`);
    await setAgentMonthlyLimit(AGENCY_ID, AGENT1, 50);
    const okDeduct = await deductCredits(AGENT1, 30, 'Livetest render (limit test)', { tier: 'CINEMATIC' }, 'agency');
    check('spend within limit succeeds', okDeduct.success, `pool spent 30`);
    const overDeduct = await deductCredits(AGENT1, 30, 'Livetest over-limit', {}, 'agency');
    check('spend past limit blocked (402 path)', !overDeduct.success && (overDeduct.error || '').includes('Monthly credit limit reached'), `error=${overDeduct.error}`);
    const a1 = await getUser(AGENT1);
    check('blocked spend did not touch balances', a1?.credits === 100, `personal=${a1?.credits}`);

    // ── 4. Real-time usage analytics ──────────────────────────────────────
    console.log('\n[4] usage analytics');
    const usage = await agencyUsageAnalytics(AGENCY_ID, 30);
    check('owner sees pool spend attribution', usage.poolUsed >= 30, `poolUsed=${usage.poolUsed}`);
    check('agent rows carry limits + month spend', usage.agents.find(a => a.userId === AGENT1)?.monthlyLimit === 50, `limit=${usage.agents.find(a => a.userId === AGENT1)?.monthlyLimit}`);
    check('per-day series has 30 buckets', usage.perDay.length === 30, `days=${usage.perDay.length}`);

    // ── 5. Monthly report PDF (S3 round-trip) ─────────────────────────────
    console.log('\n[5] report generation');
    const month = new Date().toISOString().slice(0, 7);
    const report = await generateAndStoreAgencyReport(AGENCY_ID, month);
    check('report generated + stored in S3', !!report?.url && report.url.includes('reports/' + AGENCY_ID), `url=${report?.url?.split('.com/')[1]}`);
    const head = await fetch(report!.url, { method: 'HEAD' });
    check('report PDF is publicly fetchable', head.ok, `status=${head.status}`);
    const agentRep = await buildAgentMonthReport(AGENCY_ID, AGENT1, month);
    check('agent-scoped report builds', !!agentRep && agentRep.scopeLabel?.includes('Livetest') === true, `scope=${agentRep?.scopeLabel}`);

    console.log(`\n${results.filter(r => r.pass).length}/${results.length} checks passed`);
    if (results.some(r => !r.pass)) process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main().catch(e => { console.error('LIVETEST ERROR:', e); process.exit(1); });
