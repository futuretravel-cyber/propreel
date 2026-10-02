/**
 * Read cron_run_<name> records from the settings table and print status,
 * timing, and detail. Reusable for verifying scheduled runs fired correctly.
 *
 * Usage: npx tsx scripts/check_cron_runs.ts [name ...]
 *   (no args → all known cron names)
 */
import { getItem, TABLES } from '../lib/db';

const KNOWN = [
  'process-expired-credits',
  'allocate-monthly-credits',
  'render-probe',
];

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : KNOWN;
  for (const name of names) {
    const rec = await getItem<{
      id: string; name: string; status: string;
      finishedAt: string; durationMs: number; detail?: string;
    }>(TABLES.SETTINGS, { id: `cron_run_${name}` });
    if (!rec) {
      console.log(`\n=== ${name}: NO RECORD FOUND ===`);
      continue;
    }
    const ageMin = Math.round((Date.now() - new Date(rec.finishedAt).getTime()) / 60000);
    const when = new Date(rec.finishedAt);
    const sast = new Date(when.getTime() + 2 * 3600 * 1000);
    console.log(`\n=== ${name} ===`);
    console.log(`  status:     ${rec.status.toUpperCase()}`);
    console.log(`  finished:   ${when.toISOString()} (${ageMin} min ago; ${sast.toISOString().slice(0, 16).replace('T', ' ')} SAST)`);
    console.log(`  duration:   ${rec.durationMs} ms`);
    console.log(`  detail:     ${rec.detail || '(none)'}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
