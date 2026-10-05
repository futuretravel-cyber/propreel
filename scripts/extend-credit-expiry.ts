/**
 * One-off migration: bring EXISTING credit expiry rows in line with the new
 * rule that every credit grant is valid for 365 days.
 *
 * Why it's needed: subscription allocations used to expire at the end of the
 * billing month and plan-upgrade carry-overs after 30 days. New grants all
 * use creditTtlIso() (365 days), but rows already written keep their old
 * dates — without this, existing balances would still vanish at month end.
 *
 * What it does (per user row):
 *   - source 'subscription' / 'bonus' → expiry pushed to 365 days from now
 *     (the grant date isn't stored, so "valid for a year from today" is the
 *     honest reading of the new rule)
 *   - source 'purchase' → untouched (already 365 days from the purchase)
 *   - rows already expiring further out than 365 days → untouched
 *   - expired rows are left for the nightly cron to consume
 *
 * Dry-run by default — prints what would change.
 * Usage: set -a; source .env; set +a; npx tsx scripts/extend-credit-expiry.ts [--apply]
 */
import { scanItems, TABLES } from '../lib/db';
import { updateUser, User } from '../lib/userService';

const APPLY = process.argv.includes('--apply');
const DAY_MS = 86400000;
const YEAR_MS = 365 * DAY_MS;
// A row this script wrote minutes ago is already at "grant + 365 days", so a
// naive `target < now + 365d` comparison would re-trigger on every run (by
// the run's own elapsed seconds). Only rows expiring a day or more early are
// rewritten — that keeps the migration idempotent.
const TOLERANCE_MS = DAY_MS;

async function main() {
  const users = await scanItems<User>(TABLES.USERS, { limit: 3000 });
  console.log(`${APPLY ? 'Applying' : 'Dry run'} — ${users.length} user rows scanned`);

  let usersChanged = 0;
  let rowsChanged = 0;

  for (const u of users) {
    if (!u.creditExpiries || !u.creditExpiries.length) continue;
    const now = Date.now();
    let touched = false;

    const next = u.creditExpiries.map(e => {
      const target = e.expiresAt ? new Date(e.expiresAt).getTime() : 0;
      if (target <= now) return e; // already expired — nightly cron handles it
      if (e.source !== 'subscription' && e.source !== 'bonus') return e; // purchases already 365d
      if (target >= now + YEAR_MS - TOLERANCE_MS) return e; // already valid for ~a year
      touched = true;
      rowsChanged++;
      return { ...e, expiresAt: new Date(now + YEAR_MS).toISOString() };
    });

    if (!touched) continue;
    usersChanged++;
    console.log(`• ${u.email} (${u.id}) — ${u.creditExpiries.length} expiry row(s) reviewed`);

    if (APPLY) {
      await updateUser(u.id, { creditExpiries: next });
    }
  }

  console.log(`\n${usersChanged} user(s), ${rowsChanged} expiry row(s) ${APPLY ? 'updated' : 'would change'}`);
  if (!APPLY && rowsChanged) console.log('Re-run with --apply to write the changes.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
