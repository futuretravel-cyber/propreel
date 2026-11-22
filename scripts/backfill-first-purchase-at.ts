/**
 * One-off backfill for the Black Friday first-purchase bonus.
 *
 * Accounts that bought credits before `firstPurchaseAt` existed have no flag,
 * so their next R200 purchase in the window would wrongly get the bonus. This
 * sets `firstPurchaseAt` to the date of their earliest personal credit
 * purchase, using the credit ledger as the source of truth.
 *
 * A personal credit purchase is a CREDIT_TRANSACTIONS row with:
 *   - type 'purchase'
 *   - amount > 0 (excludes plan-upgrade charges, which are negative)
 *   - no metadata.pool === 'agency' (agency-pool top-ups never set the flag)
 *
 * Users who already have `firstPurchaseAt` are left alone, so re-running is safe.
 *
 * Dry-run by default — prints what would change.
 * Usage: set -a; source .env; set +a; npx tsx scripts/backfill-first-purchase-at.ts [--apply]
 */
import { scanAll, TABLES } from '../lib/db';
import { getUser, updateUser } from '../lib/userService';

const APPLY = process.argv.includes('--apply');

interface LedgerRow {
  userId: string;
  amount: number;
  type: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

async function main() {
  const rows = await scanAll<LedgerRow>(TABLES.CREDIT_TRANSACTIONS, {
    filter: { expression: '#t = :p', names: { '#t': 'type' }, values: { ':p': 'purchase' } },
  });

  // Earliest personal purchase per user (ISO timestamps sort lexicographically).
  const firstByUser = new Map<string, string>();
  for (const row of rows) {
    if (!(row.amount > 0)) continue;
    if (row.metadata?.pool === 'agency') continue;
    const prev = firstByUser.get(row.userId);
    if (!prev || row.createdAt < prev) firstByUser.set(row.userId, row.createdAt);
  }
  console.log(`${APPLY ? 'Applying' : 'Dry run'} — ${firstByUser.size} users with a prior personal purchase`);

  let updated = 0;
  let alreadySet = 0;
  let missing = 0;
  for (const [userId, purchasedAt] of firstByUser) {
    const user = await getUser(userId);
    if (!user) {
      missing++;
      continue;
    }
    if (user.firstPurchaseAt) {
      alreadySet++;
      continue;
    }
    console.log(`${APPLY ? 'set' : 'would set'} ${userId} (${user.email}) firstPurchaseAt=${purchasedAt}`);
    if (APPLY) await updateUser(userId, { firstPurchaseAt: purchasedAt });
    updated++;
  }
  console.log(`${APPLY ? 'Updated' : 'Would update'} ${updated}; already set ${alreadySet}; user row missing ${missing}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
