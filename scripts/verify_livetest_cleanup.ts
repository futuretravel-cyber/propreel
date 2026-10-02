/**
 * Verify no propreel-livetest residue remains in prod tables (read-only).
 * Usage: npx tsx scripts/verify_livetest_cleanup.ts
 */
import { scanItems, TABLES } from '../lib/db';

async function main() {
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const residue = users.filter((u: any) => String(u.id).startsWith('propreel-livetest') || String(u.email || '').includes('livetest'));
  console.log(`users table: ${users.length} rows, livetest residue: ${residue.length}`);

  const txns = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 2000 });
  const txnResidue = txns.filter((t: any) => String(t.userId || '').startsWith('propreel-livetest') || String(t.description || '').includes('Livetest'));
  console.log(`ledger table: ${txns.length} rows scanned, livetest residue: ${txnResidue.length}`);

  const settings = await scanItems<any>(TABLES.SETTINGS, { limit: 500 });
  const lockResidue = settings.filter((s: any) => String(s.id).startsWith('evt_evt_livetest') || String(s.id).startsWith('pay_livetest'));
  console.log(`settings table: ${settings.length} rows, livetest residue: ${lockResidue.length}`);

  if (residue.length || txnResidue.length || lockResidue.length) {
    console.log('RESIDUE FOUND:', JSON.stringify({ residue: residue.map(r => r.id), txnResidue: txnResidue.map(r => r.id), lockResidue: lockResidue.map(r => r.id) }, null, 2));
    process.exitCode = 1;
  } else {
    console.log('CLEAN — no test residue.');
  }
}

main().catch(e => { console.error('VERIFY ERROR:', e); process.exit(1); });
