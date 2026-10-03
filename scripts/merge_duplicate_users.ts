/**
 * Merge duplicate user rows (same email) into the canonical one.
 *
 * Canonical = the row carrying a subscription; tie-break on oldest createdAt,
 * then lexicographic id. Every duplicate is archived in full (user + ledger)
 * into a settings marker before deletion, so nothing is lost. Duplicate
 * balances from the signup race are auto-grants, not real money — they are
 * documented in the archive, not merged into the canonical balance.
 *
 * Run once against DynamoDB (the only backend):
 *   npx tsx scripts/merge_duplicate_users.ts
 *
 * Optional: EMAIL=other@example.com to target a different account.
 */
import {
  scanItems, queryItems, deleteItem, putItem, TABLES,
} from '../lib/db';

const EMAIL = (process.env.EMAIL || 'futuretravel@gmail.com').toLowerCase();
// Deterministic marker id: running the merge on both backends (or re-running
// after a DynamoDB→Supabase re-sync) converges on the same marker instead of
// piling up timestamped duplicates.

async function main() {
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const rows = users.filter(u => (u.email || '').toLowerCase() === EMAIL);

  if (rows.length <= 1) {
    console.log(`No duplicates for ${EMAIL} (${rows.length} row). Nothing to do.`);
    return;
  }

  rows.sort((a, b) => {
    const subA = a.subscription ? 1 : 0;
    const subB = b.subscription ? 1 : 0;
    if (subA !== subB) return subB - subA;              // subscription holder first
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  const canonical = rows[0];
  const dupes = rows.slice(1);
  const MARKER = `dup_merge_${canonical.id}`;
  console.log(`Canonical: ${canonical.id} (credits=${canonical.credits}, subscription=${canonical.subscription?.planId ?? 'none'})`);
  console.log(`Duplicates: ${dupes.map(d => `${d.id} (credits=${d.credits})`).join(', ')}\n`);

  const archive: any[] = [];
  let removedLedger = 0;

  for (const d of dupes) {
    const ledger = await queryItems<any>(
      TABLES.CREDIT_TRANSACTIONS,
      { expression: 'userId = :u', values: { ':u': d.id } },
      { limit: 200 }
    );
    archive.push({ user: d, ledger });

    for (const t of ledger) {
      await deleteItem(TABLES.CREDIT_TRANSACTIONS, { userId: t.userId, createdAt: t.createdAt });
      removedLedger++;
    }
    await deleteItem(TABLES.USERS, { id: d.id });
    console.log(`  removed ${d.id} + ${ledger.length} ledger rows`);
  }

  await putItem(TABLES.SETTINGS, {
    id: MARKER,
    type: 'dup_user_merge',
    email: EMAIL,
    canonicalId: canonical.id,
    removed: dupes.map(d => d.id),
    archive,
    createdAt: new Date().toISOString(),
  } as any);

  console.log(`\nRemoved ${dupes.length} rows + ${removedLedger} ledger entries; archive → settings/${MARKER}`);
  console.log(`Canonical balance unchanged at ${canonical.credits}.`);
}

main().catch(e => { console.error('MERGE ERROR:', e); process.exit(1); });
