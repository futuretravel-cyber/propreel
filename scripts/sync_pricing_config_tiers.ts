/**
 * Sync the settings/pricing_config row's `tiers` from the canonical tier
 * catalog (lib/renderPricing ← lib/videoTiers). The live row still held the
 * old spec (Social 512p, 5/10/15 images, a 50s Social duration, credits
 * 40/75/105 and 85/170/250) while source and the Modal worker had moved to
 * 480p / 6/12/18 / 50-150 / 75-225 (2026-10-18). bootstrapPricing() merges
 * row.tiers OVER the built-in TIERS at runtime, so the Studio tier picker,
 * the Property Photos counter and every pricing surface showed the old way
 * while job_token charged the new table — display and charge disagreed.
 *
 * `plans` are intentionally left untouched (admin edits there are live
 * truth). Credits-only drift has its own tool: scripts/fix_pricing_config_row.ts.
 *
 * Run: npx tsx scripts/sync_pricing_config_tiers.ts
 * (lib/db-dynamodb loads .env itself; use `npx dotenv -e .env -- npx tsx …` otherwise)
 */
import { getItem, putItem, TABLES } from '../lib/db';
import { TIERS } from '../lib/renderPricing';

const fmt = (t: any): string =>
  (t?.configurations || [])
    .map((c: any) => `${c.duration}s/${c.images}img/${c.credits}cr`)
    .join(', ');

async function main() {
  const row = await getItem<any>(TABLES.SETTINGS, { id: 'pricing_config' });
  if (!row) {
    console.error('pricing_config row missing — seed it first (scripts/seed_pricing_config.ts)');
    process.exit(1);
  }

  const before: any[] = Array.isArray(row.tiers) ? row.tiers : [];
  // Deep clone so the object we put back never aliases the in-memory TIERS array.
  const canonical = JSON.parse(JSON.stringify(TIERS));
  const changes: string[] = [];
  for (const engine of TIERS) {
    const db = before.find((t: any) => String(t?.id || '').toUpperCase() === engine.id);
    if (!db) {
      changes.push(`${engine.id}: missing → [${fmt(engine)}]`);
      continue;
    }
    const same =
      String(db.resolution || '') === engine.resolution &&
      JSON.stringify((db.configurations || []).map((c: any) => [Number(c.duration), Number(c.images), Number(c.credits)])) ===
        JSON.stringify(engine.configurations.map((c) => [c.duration, c.images, c.credits]));
    if (!same) changes.push(`${engine.id}: [${fmt(db)}] → [${fmt(engine)}]`);
  }

  if (!changes.length) {
    console.log('pricing_config.tiers already in sync with lib/renderPricing — no write needed.');
    process.exit(0);
  }

  console.log('Applying tier sync:');
  for (const c of changes) console.log('  ' + c);
  await putItem(TABLES.SETTINGS, { ...row, tiers: canonical, updatedAt: new Date().toISOString() });

  // Re-read and verify duration/images/credits/resolution against the code table.
  const after = await getItem<any>(TABLES.SETTINGS, { id: 'pricing_config' });
  let mismatch = 0;
  for (const engine of TIERS) {
    const db = (after?.tiers || []).find((t: any) => String(t?.id || '').toUpperCase() === engine.id);
    if (!db) { mismatch++; console.error(`VERIFY FAIL ${engine.id}: missing after write`); continue; }
    if (String(db.resolution) !== engine.resolution) {
      mismatch++;
      console.error(`VERIFY FAIL ${engine.id} resolution: ${db.resolution} != ${engine.resolution}`);
    }
    engine.configurations.forEach((cfg, i) => {
      const got = (db.configurations || [])[i];
      if (!got || Number(got.duration) !== cfg.duration || Number(got.images) !== cfg.images || Number(got.credits) !== cfg.credits) {
        mismatch++;
        console.error(`VERIFY FAIL ${engine.id} #${i}: got ${JSON.stringify(got)} want ${JSON.stringify(cfg)}`);
      }
    });
  }
  if (mismatch) process.exit(1);
  console.log('Verified: pricing_config.tiers matches lib/renderPricing (plans untouched).');
}

main().catch((e) => { console.error(e); process.exit(1); });
