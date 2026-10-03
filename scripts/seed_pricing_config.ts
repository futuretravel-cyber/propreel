/**
 * Seed the DynamoDB `settings/pricing_config` row from the canonical
 * constants (plans = monthly/annual prices + credits; tiers = video render
 * configs). The site reads this row at runtime (GET /api/subscriptions
 * ?action=pricing) and billing reads it via lib/userService.getPlans().
 *
 * Usage: set -a; source .env; set +a; npx tsx scripts/seed_pricing_config.ts
 * Re-running overwrites the row with the built-in defaults — only do that
 * intentionally (to reset), since admin edits to the row are live truth.
 */

import { PLANS, TIERS } from '../src/lib/constants';
import { putItem, TABLES } from '../lib/db';

async function main() {
  const now = new Date().toISOString();
  await putItem(TABLES.SETTINGS, {
    id: 'pricing_config',
    type: 'pricing_config',
    plans: PLANS,
    tiers: TIERS,
    updatedAt: now,
  });
  console.log(`✓ Seeded settings/pricing_config — ${PLANS.length} plans, ${TIERS.length} render tiers`);
  for (const p of PLANS) {
    console.log(`  ${p.id}: R${p.monthlyZar}/mo, R${p.annualZar}/yr-equiv, ${p.monthlyCredits} credits`);
  }
  for (const t of TIERS) {
    console.log(`  ${t.id}: ${t.configurations.map(c => `${c.duration}s/${c.credits}cr`).join(', ')}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
