/**
 * Pricing bootstrap — makes DynamoDB the source of truth for displayed
 * pricing. The `settings/pricing_config` row (plans + render tiers) is
 * fetched once in main.tsx BEFORE the first render and merged in-place over
 * the built-in constants, so every consumer (Pricing, Signup, Payment,
 * Billing, Studio tier picker) shows DB values with zero per-component
 * changes. If the API is unreachable the built-in constants remain — the
 * site still renders with the seeded defaults.
 */

import { PLANS, TIERS } from './constants';

const API_BASE = import.meta.env.VITE_API_URL || '';
let bootstrapped = false;

function num(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function bootstrapPricing(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions?action=pricing`);
    if (!res.ok) return;
    const data = await res.json();
    const pricing = data?.pricing;
    if (!pricing) return;

    if (Array.isArray(pricing.plans)) {
      for (const db of pricing.plans) {
        const i = PLANS.findIndex(p => p.id === db?.id);
        if (i === -1) continue;
        PLANS.splice(i, 1, {
          ...PLANS[i],
          monthlyZar: num(db.monthlyZar, PLANS[i].monthlyZar),
          annualZar: num(db.annualZar, PLANS[i].annualZar),
          monthlyCredits: num(db.monthlyCredits, PLANS[i].monthlyCredits),
          ...(typeof db.tagline === 'string' && db.tagline ? { tagline: db.tagline } : {}),
          ...(Array.isArray(db.features) && db.features.length ? { features: db.features } : {}),
          ...(typeof db.name === 'string' && db.name ? { name: db.name } : {}),
          ...(typeof db.popular === 'boolean' ? { popular: db.popular } : {}),
        });
      }
    }

    if (Array.isArray(pricing.tiers)) {
      for (const db of pricing.tiers) {
        const i = TIERS.findIndex(t => t.id === db?.id);
        if (i === -1) continue;
        TIERS.splice(i, 1, { ...TIERS[i], ...db });
      }
    }
  } catch (e) {
    console.warn('Pricing bootstrap failed — using built-in defaults:', e);
  }
}
