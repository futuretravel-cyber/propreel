/**
 * Update ONLY the `plans` array of the DynamoDB `settings/pricing_config`
 * row from the canonical PLANS in src/lib/constants.ts — the server-side
 * truth getPlans()/checkout reads (the site serves it via
 * GET /api/subscriptions?action=pricing).
 *
 * Unlike seed_pricing_config.ts (full overwrite), this read-modify-write
 * keeps every other field exactly as stored — notably the admin-editable
 * `tiers` — so only plan prices/credits move. Idempotent, safe to re-run.
 *
 * 2026-10-21 credit ladder (client-approved, prices unchanged — final
 * revision the same day): Starter 115 → **110**, Professional 600 → **520**,
 * Premium 1300 → **1150**, Agency 5000 → **4300**. Rates ≈R1.10–1.17/credit:
 * 22–26% under the R1.50 list value, worst-case single-SKU margins 30–34%,
 * blended ~60% (sized against Hailuo-era COGS — the docs' original
 * worst-case plan economics quoted stale wan-era costs; see
 * docs/pricing-cost-analysis.md suggestion 8).
 *
 * Usage: set -a; source .env; set +a; npx tsx scripts/update_pricing_plans.ts
 */
import { PLANS } from '../src/lib/constants';
import { getItem, putItem, TABLES } from '../lib/db';

async function main() {
  const row = await getItem<Record<string, any>>(TABLES.SETTINGS, { id: 'pricing_config' });
  if (!row) {
    throw new Error('settings/pricing_config row missing — run scripts/seed_pricing_config.ts first');
  }
  await putItem(TABLES.SETTINGS, {
    ...row,
    plans: PLANS,
    updatedAt: new Date().toISOString(),
  });
  console.log(`✓ plans updated on settings/pricing_config (tiers untouched — ${row.tiers?.length ?? 0} render tiers kept)`);
  for (const p of PLANS) {
    console.log(`  ${p.id}: R${p.monthlyZar}/mo, R${p.annualZar}/yr-equiv, ${p.monthlyCredits} credits`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
