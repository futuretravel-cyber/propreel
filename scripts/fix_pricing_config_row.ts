/**
 * One-off: sync the settings/pricing_config DB row's tier prices from
 * lib/renderPricing — the code table that job_token mints actually charge.
 * Only CINEMATIC had drifted (60s 70→75, 90s 90→105); all other fields are
 * written back byte-identical, so the fix is exactly the drift.
 *
 * Run: npx dotenv -e .env -- tsx scripts/fix_pricing_config_row.ts
 * (tsx loads .env via dotenv — plain `npx tsx` works if dotenv.config()
 * runs inside the imported lib, which lib/db-dynamodb does.)
 */
import { getItem, putItem, TABLES } from '../lib/db';
import { TIERS } from '../lib/renderPricing';

async function main() {
  const row = await getItem<any>(TABLES.SETTINGS, { id: 'pricing_config' });
  if (!row) {
    console.error('pricing_config row missing — nothing to fix here (seed it first)');
    process.exit(1);
  }
  const tiers: any[] = Array.isArray(row.tiers) ? row.tiers : [];
  const changes: string[] = [];

  for (const engine of TIERS) {
    const db = tiers.find(t => String(t.id).toUpperCase() === engine.id);
    if (!db) { console.log(`tier ${engine.id} missing from DB row — left untouched (seed-level gap, not drift)`); continue; }
    engine.configurations.forEach((cfg, i) => {
      const dcfg = (db.configurations || [])[i];
      if (!dcfg) return;
      if (Number(dcfg.credits) !== cfg.credits) {
        changes.push(`${engine.id} ${cfg.duration}s: ${dcfg.credits} → ${cfg.credits}`);
        dcfg.credits = cfg.credits;
      }
    });
  }

  if (!changes.length) {
    console.log('pricing_config already in sync with lib/renderPricing — no write needed.');
    process.exit(0);
  }

  console.log('Applying drift fixes:', changes.join(', '));
  await putItem(TABLES.SETTINGS, { ...row, tiers, updatedAt: new Date().toISOString() });
  console.log('pricing_config updated (+updatedAt stamp).');

  // Re-read and verify
  const after = await getItem<any>(TABLES.SETTINGS, { id: 'pricing_config' });
  let mismatch = 0;
  for (const engine of TIERS) {
    const db = (after?.tiers || []).find((t: any) => String(t.id).toUpperCase() === engine.id);
    engine.configurations.forEach((cfg, i) => {
      const got = db?.configurations?.[i]?.credits;
      if (Number(got) !== cfg.credits) { mismatch++; console.error(`VERIFY FAIL ${engine.id} #${i}: ${got} != ${cfg.credits}`); }
    });
  }
  if (mismatch) process.exit(1);
  console.log('Verified: all tier prices in pricing_config now match lib/renderPricing.');
}

main().catch(e => { console.error(e); process.exit(1); });
