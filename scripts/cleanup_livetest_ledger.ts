/**
 * One-off: delete leftover livetest ledger rows using the table's real key
 * (userId HASH + createdAt RANGE). The E2E script's cleanup used only { id },
 * which DynamoDB rejected; the per-row catch swallowed it.
 * Usage: npx tsx scripts/cleanup_livetest_ledger.ts
 */
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { scanItems, TABLES } from '../lib/db';

async function main() {
  const txns = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 2000 });
  const residue = txns.filter((t: any) =>
    String(t.userId || '').startsWith('propreel-livetest') || String(t.description || '').includes('Livetest')
  );
  console.log(`Found ${residue.length} livetest ledger rows`);
  let deleted = 0;
  for (const t of residue) {
    try {
      await docSend(t.userId, t.createdAt);
      deleted++;
    } catch (e: any) {
      console.error(`  FAILED ${t.id}: ${e?.message || e}`);
    }
  }
  console.log(`Deleted ${deleted}/${residue.length} rows`);
  if (deleted !== residue.length) process.exitCode = 1;

  async function docSend(userId: string, createdAt: string) {
    const { docClient } = await import('../lib/db');
    await docClient.send(new DeleteCommand({
      TableName: TABLES.CREDIT_TRANSACTIONS,
      Key: { userId, createdAt },
    }));
  }
}

main().catch(e => { console.error('CLEANUP ERROR:', e); process.exit(1); });
