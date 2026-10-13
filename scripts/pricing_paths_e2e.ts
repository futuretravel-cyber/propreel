/**
 * Reusable end-to-end pricing sweep — codifies the manual plan-by-plan
 * credit-path verification (Starter / Professional / Premium / Agency ×
 * Description / Social / AI-Write) so it can be ran after ANY pricing
 * or pricing-config change instead of a browser walkthrough.
 *
 * Usage:
 *   E2E_ACCOUNT_PASSWORD='…' npx tsx scripts/pricing_paths_e2e.ts
 * Env:
 *   E2E_ACCOUNT_EMAIL     account to drive (default the admin walkthrough acct)
 *   E2E_BASE              site origin (default https://www.propreel.co.za)
 *   E2E_WORKER_URL        Modal worker (default futuretravel--propreel-render-web)
 *   E2E_RESTORE_PLAN      plan to leave the account on (default: the account's
 *                         original plan; 'NONE' strips the subscription)
 *   PRICING_E2E_QUICK=1   skip the live worker generations (ledger/pricing
 *                         asserts only — no Grok spend)
 *
 * What it proves, in order:
 *   1. ENGINE  — lib/renderPricing (the pure pricing source both the API and
 *      the UI import) prices every render tier × duration, edit preset,
 *      flashhead narration length and the script scope exactly as documented.
 *   2. CONFIG  — the live settings/pricing_config DB row (GET
 *      /api/subscriptions?action=pricing) still carries the four plans and
 *      their monthly credit allowances, and its tier prices match the engine.
 *   3. PLANS   — admin plan-switching works and is credit-neutral: under each
 *      plan the three AI text paths charge exactly the same documented
 *      amounts (Description 1, Social 2, AI-Write 1) and each refund reverses
 *      its charge 1:1.
 *   4. MINTS   — every render tier × duration and flashhead narration mint
 *   4. MINTS   — every render tier × duration and flashhead narration mint
 *      charges the server-side price from lib/renderPricing; the deployed
 *      server, not this script, decides each amount.
 *   5. GUARDS  — refund-without-charge is a harmless no-op, an unknown job
 *      scope is a 400 (never 0 credits), and an over-balance deduct fails.
 *   6. RESTORE — the account's plan and balance are put back exactly.
 *
 * The script refunds EVERY charge it makes, so a successful run leaves the
 * account's balance untouched (asserted) — only ledger rows accumulate.
 */
import { TIERS, jobCredits, SCRIPT_CREDITS, scriptCreditsForDuration, IMAGE_EDIT_CREDITS, STAGING_EDIT_CREDITS, STAGING_PRESET_IDS, DESCRIPTION_CREDITS, SOCIAL_POST_CREDITS, flashheadCreditsForText, FLASHHEAD_MAX_SECONDS, NARRATION_WORDS_PER_SEC } from '../lib/renderPricing';

// ── Config ────────────────────────────────────────────────────────────────
const EMAIL = process.env.E2E_ACCOUNT_EMAIL || 'futuretravel@gmail.com';
const PASSWORD = process.env.E2E_ACCOUNT_PASSWORD; // REQUIRED — never store a password in source
if (!PASSWORD && process.env.PRICING_E2E_ENGINE_ONLY !== '1') {
  console.error('Set E2E_ACCOUNT_PASSWORD=<password of the e2e account>' +
    ' (or PRICING_E2E_ENGINE_ONLY=1 to verify the pricing table without credentials)');
  process.exit(2);
}
const BASE = process.env.E2E_BASE || 'https://www.propreel.co.za';
const WORKER = process.env.E2E_WORKER_URL || 'https://futuretravel--propreel-render-web.modal.run';
const QUICK = !!process.env.PRICING_E2E_QUICK || !!process.env.PRICING_E2E_ENGINE_ONLY;
const RESTORE_OVERRIDE = process.env.E2E_RESTORE_PLAN; // 'NONE' | 'STARTER' | … | undefined(=original)
const PLANS = ['STARTER', 'PROFESSIONAL', 'PREMIUM', 'AGENCY'] as const;
// Expected plan allowances (docs/credit-pricing-runbook.md; DB row is truth —
// a mismatch fails the run so a plan-allowance typo gets caught here).
const EXPECTED_PLAN_CREDITS: Record<string, number> = { STARTER: 130, PROFESSIONAL: 600, PREMIUM: 1300, AGENCY: 5000 };
/** Worker per-attempt cap is 110s × ≤3 fallback attempts; heaviest path ≤210s. */
const GEN_TIMEOUT_MS = 240_000;

// ── Harness ───────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
}
type Resp = { status: number; json: any; headers: Headers };
async function call(path: string, opts: { method?: string; body?: any; cookie?: string | null; headers?: Record<string, string> } = {}): Promise<Resp> {
  const res = await fetch(`${path.startsWith('http') ? '' : BASE}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.cookie ? { Cookie: opts.cookie } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}
function getCookie(r: Resp): string | null {
  const sc = (r.headers as any).getSetCookie?.() || [];
  const match = sc.find((c: string) => c.startsWith('propreel_session=')) || r.headers.get('set-cookie');
  return match ? match.split(';')[0] : null;
}
if (process.env.PRICING_E2E_ENGINE_ONLY === '1') {
  // Dry-run mode: verify the pricing TABLE itself (no credentials, no
  // network) — handy in CI or right after editing lib/renderPricing.
  console.log('pricing_paths_e2e — engine-only dry run');
  enginePhase();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
let cookie: string | null = null;
let userId = '';
let adminOk = true;
let original = { planId: '' as string | null, cycle: 'MONTHLY' as 'MONTHLY' | 'ANNUAL', status: '' as string };

// ── 0) Engine asserts (lib/renderPricing — no network) ───────────────────
function enginePhase() {
  console.log('\n── 0) Engine: lib/renderPricing table ──');
  for (const tier of TIERS) {
    tier.configurations.forEach((cfg, i) => {
      check(`render ${tier.id} ${cfg.duration}s == ${cfg.credits}`, jobCredits('render', { tier: tier.id, configIndex: i }) === cfg.credits);
    });
  }
  check('render unknown scope → null', jobCredits('render', { tier: 'NOPE', configIndex: 0 }) === null);
  // AI Writer script: priced by duration — ceil(duration/30) ⚡ (30s→1,
  // 50s→2, 60s→2, 90s→3; 12-image/90s Grok vision cost ~R1.08 ⇒ flat 1⚡
  // was a loss). Mints with no duration stay on the legacy flat rate.
  check('script legacy mint (no duration) == flat 1', jobCredits('script') === SCRIPT_CREDITS && SCRIPT_CREDITS === 1);
  const SCRIPT_LADDER: Array<[number, number]> = [[30, 1], [50, 2], [60, 2], [90, 3]];
  for (const [dur, expect] of SCRIPT_LADDER) {
    check(`script ${dur}s == ${expect} credit${expect === 1 ? '' : 's'} (server-priced)`, scriptCreditsForDuration(dur) === expect && jobCredits('script', { duration: dur }) === expect);
  }
  check('description scope == 1 credit (server-priced)', jobCredits('description') === DESCRIPTION_CREDITS && DESCRIPTION_CREDITS === 1);
  check('social_post scope == 2 credits (server-priced)', jobCredits('social_post') === SOCIAL_POST_CREDITS && SOCIAL_POST_CREDITS === 2);
  check('plain preset edit == 2', jobCredits('edit', { presetId: 'sky_fix' }) === IMAGE_EDIT_CREDITS);
  for (const id of STAGING_PRESET_IDS) check(`staging preset ${id} == ${STAGING_EDIT_CREDITS}`, jobCredits('edit', { presetId: id }) === STAGING_EDIT_CREDITS);
  check('edit unknown preset falls back to base rate', jobCredits('edit', { presetId: 'not_a_preset' }) === IMAGE_EDIT_CREDITS);
  // FlashHead: per-10s blocks at 2.4 words/s, hard 90s cap (≈216 words)
  const words30 = 30; const expect30 = Math.ceil((words30 / NARRATION_WORDS_PER_SEC) / 10) * 2;
  const got30 = flashheadCreditsForText('x '.repeat(words30).trim());
  check(`flashhead 30 words == ${expect30} (2 per 10s block)`, got30 === expect30, got30);
  check('flashhead just over 90s cap → null', flashheadCreditsForText('x '.repeat(Math.ceil(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC) + 10).trim()) === null);
}

// ── 1) Auth + live pricing config ─────────────────────────────────────────
async function loginPhase() {
  console.log('\n── 1) Auth + live pricing config ──');
  const a = await call('/api/users?action=auth_login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  cookie = getCookie(a);
  check('login → 200 + session cookie', a.status === 200 && !!cookie, a.status);
  const s = await call('/api/users?action=auth_session', { cookie });
  userId = s.json?.user?.id;
  check('session identifies the account', !!userId, s.json?.user?.email);

  const p = await call('/api/subscriptions?action=pricing');
  const plans = p.json?.pricing?.plans || {};
  for (const [id, expected] of Object.entries(EXPECTED_PLAN_CREDITS)) {
    const row = plans[id];
    if (!row) { check(`pricing plan ${id} present`, false, 'missing from DB pricing_config'); continue; }
    const credits = Number(row.monthlyCredits ?? row.credits);
    check(`pricing plan ${id} allowance == ${expected}`, credits === expected, credits);
  }
  const dbTiers = p.json?.pricing?.tiers;
  if (dbTiers) {
    for (const tier of TIERS) {
      const dt = (dbTiers as any[]).find(t => String(t.id).toUpperCase() === tier.id);
      if (!dt) { check(`DB tier ${tier.id} present`, false); continue; }
      (tier.configurations as any[]).forEach((cfg, i) => {
        const dbCfg = dt.configurations?.[i];
        check(`DB tier ${tier.id} #${i} == engine ${cfg.credits}`, !!dbCfg && Number(dbCfg.credits) === cfg.credits, dbCfg?.credits);
      });
    }
  } else {
    console.log('  (no tiers row in pricing_config — engine table skipped for DB parity)');
  }
  // Snapshot the original subscription BEFORE any switching
  original = {
    planId: s.json?.user?.subscription?.planId ?? null,
    cycle: (s.json?.user?.subscription?.cycle || 'MONTHLY') as 'MONTHLY' | 'ANNUAL',
    status: s.json?.user?.subscription?.status || '',
  };
  console.log(`  original subscription: ${original.planId ?? '(none)'} / ${original.cycle} / ${original.status || '(no status)'}`);
}

let balance = 0;
async function refreshBalance(): Promise<void> {
  const s = await call('/api/users?action=auth_session', { cookie });
  balance = Number(s.json?.user?.credits ?? 0);
}

// ── 2) Plan switching + the three AI text paths per plan ────────────────
async function setPlan(plan: 'STARTER' | 'PROFESSIONAL' | 'PREMIUM' | 'AGENCY' | null, note: string): Promise<boolean> {
  const r = await call('/api/subscriptions?action=admin_set_subscription', {
    method: 'POST',
    cookie,
    body: { user_id: userId, plan_id: plan, cycle: 'MONTHLY', status: plan ? 'ACTIVE' : undefined, allocate_credits: false, cancel_paystack: false, reason: note },
  });
  if (r.status === 403) {
    if (adminOk) console.log('  ⚠ account is not a platform admin — plan switching and per-plan phases skipped (auth remains tested)');
    adminOk = false;
    return false;
  }
  check(`admin_set_subscription ${plan ?? 'NONE'} → 200`, r.status === 200, r.json);
  return r.status === 200;
}

async function deductAndGenerate(
  kind: 'description' | 'social_caption',
  amount: number,
  scope: 'description' | 'social_post',
  metaKind: string
): Promise<{ ok: boolean; words: number }> {
  await refreshBalance();
  // The mint IS the charge (server-priced via renderPricing); the old
  // client-sent ?action=deduct amount is no longer part of the product path.
  const m = await call('/api/users?action=job_token', { method: 'POST', cookie, body: { scope, metadata: { kind: metaKind } } });
  check(`mint ${scope} → 200, server price == ${amount}`, m.status === 200 && Number(m.json.credits) === amount, { credits: m.json.credits, status: m.status });
  if (m.status !== 200) return { ok: false, words: 0 };
  check(`${scope} mint charged exactly ${amount}`, Number(m.json.new_balance) === balance - amount, { new_balance: m.json.new_balance, was: balance });

  let words = 0;
  if (!QUICK) {
    // Exactly the browser contract after the server-pricing move: the PAID
    // mint token rides in X-PropReel-Token (PropReelAPI.generateText merges
    // extraHeaders last, so the paid v2 token replaces the free worker one).
    const w = await call(`${WORKER}/generate_text`, {
      method: 'POST',
      headers: { 'X-PropReel-Token': String(m.json.token) },
      body: {
        kind,
        fields: kind === 'description'
          ? {
              tone: 'Professional', address: '12 Fuchsia Road, Constantia, Cape Town', price: 'R 6 950 000,00',
              bedrooms: '5', bathrooms: '4', garages: '2', propertyType: 'House', province: 'Western Cape',
              erf_size_m2: '600', floor_size_m2: '280', extra_features: 'gas stove, walk-in pantry, mountain views',
              currency: 'ZAR (South African Rand) — always write prices with the decimal system, e.g. R12 500 000,00',
            }
          : { platform: 'instagram', suburb: 'Constantia, Cape Town', property_type: 'House', price: 'R 6 950 000,00', bedrooms: '5', bathrooms: '4', garages: '2', features: 'pool, solar, mountain views, staff quarters', currency: 'ZAR (South African Rand) — write prices with the decimal system, e.g. R12 500 000,00' },
        images: [],
      },
    });
    const text = typeof w.json?.text === 'string' ? w.json.text : '';
    words = text.trim().split(/\s+/).filter(Boolean).length;
    check(`${kind} generate_text → 200 + substantial copy`, w.status === 200 && words >= 15, { status: w.status, words });
  }
  const rf = await call('/api/credits?action=refund', { method: 'POST', cookie, body: { user_id: userId, scope } });
  check(`refund ${metaKind} → exactly ${amount} restored`, rf.status === 200 && Number(rf.json.refunded) === amount, rf.json);
  return { ok: words === 0 || words >= 15, words };
}

async function aiWritePhase(targetWords = 72): Promise<boolean> {
  await refreshBalance();
  const m = await call('/api/users?action=job_token', { method: 'POST', cookie, body: { scope: 'script', metadata: { kind: 'VIDEO_SCRIPT', duration: 30 } } });
  check('AI-Write mint (script) → 200, price == 1 from the server', m.status === 200 && Number(m.json.credits) === SCRIPT_CREDITS, { credits: m.json.credits, status: m.status });
  if (m.status !== 200) return false;
  check('AI-Write mint deducted exactly 1', Number(m.json.new_balance) === balance - 1, { new_balance: m.json.new_balance, was: balance });

  if (!QUICK) {
    const w = await fetch(`${WORKER}/generate_text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie!, 'X-PropReel-Token': String(m.json.token) },
    body: JSON.stringify({ kind: 'video_script', fields: { tier: 'premium', duration_seconds: 30, target_words: targetWords, language: 'en', language_label: 'English', property_description: '12 Fuchsia Road, Constantia, Cape Town. R6 950 000. 5-bed house, pool, solar, staff quarters, mountain views.' }, images: [] }),
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    });
    const data = await w.json().catch(() => ({}));
    const words = String(data.text || '').trim().split(/\s+/).filter(Boolean).length;
    // The server is the payer — the depot token must be accepted, and the
    // script must fit the requested duration's word budget.
    check('video_script generate_text → 200 + text within target', w.status === 200 && words > 10 && words <= targetWords, { status: w.status, words, target: targetWords });
  }
  // The browser keeps the charge on success; for test economy the sweep
  // refunds after asserting, using the documented scope path.
  const rf = await call('/api/credits?action=refund', { method: 'POST', cookie, body: { user_id: userId, scope: 'script' } });
  check('refund script → exactly 1 restored', rf.status === 200 && Number(rf.json.refunded) === 1, rf.json);
  return true;
}

// ── 3) Mint-driven render/flashhead pricing across the whole catalog ─────
let cachedWorkerToken: { token: string; exp: number } | null = null;
async function workerToken(): Promise<string> {
  if (cachedWorkerToken && Date.now() < cachedWorkerToken.exp - 60_000) return cachedWorkerToken.token;
  const r = await call('/api/users?action=worker_token', { cookie });
  if (r.status !== 200) throw new Error(`worker_token mint failed (${r.status})`);
  cachedWorkerToken = { token: String(r.json.token), exp: Number(r.json.expiresAt || Date.now() + 600_000) };
  return cachedWorkerToken.token;
}

async function mintsPhase() {
  console.log('\n── 3) Render + flashhead mint pricing (server-decided) ──');
  for (const tier of TIERS) {
    for (let i = 0; i < tier.configurations.length; i++) {
      const cfg = tier.configurations[i];
      await refreshBalance();
      const before = balance;
      const m = await call('/api/users?action=job_token', { method: 'POST', cookie, body: { scope: 'render', tier: tier.id, config_index: i } });
      check(`mint render ${tier.id} ${cfg.duration}s == ${cfg.credits} (from the server)`, m.status === 200 && Number(m.json.credits) === cfg.credits, { credits: m.json.credits, status: m.status, err: m.json.error });
      if (m.status === 200) {
        // The mint charges BEFORE returning: new_balance must equal
        // before − credits exactly (a live run caught the earlier
        // compare-before-with-after version of this assert as a tautology).
        check(`render ${tier.id} ${cfg.duration}s charged ${m.json.credits} of ${before}`, Number(m.json.new_balance) === before - Number(m.json.credits), { before, new: m.json.new_balance, credits: m.json.credits });
        const rf = await call('/api/credits?action=refund', { method: 'POST', cookie, body: { user_id: userId, scope: 'render' } });
        check(`refund render ${tier.id} ${cfg.duration}s → ${m.json.credits} restored`, rf.status === 200 && Number(rf.json.refunded) === Number(m.json.credits), rf.json);
        await refreshBalance();
        check(`render ${tier.id} ${cfg.duration}s net 0`, balance === before, { now: balance, before });
      }
    }
  }
  // FlashHead: price from narration length, and pricing refuses the cap
  await refreshBalance();
  const words30 = 30;
  const mFh = await call('/api/users?action=job_token', { method: 'POST', cookie, body: { scope: 'flashhead', voiceover_text: Array(words30).fill('word').join(' ') } });
  const expectFh = Math.ceil((words30 / NARRATION_WORDS_PER_SEC) / 10) * 2;
  check(`mint flashhead ${words30} words == ${expectFh} credits (per-10s rule)`, mFh.status === 200 && Number(mFh.json.credits) === expectFh, { credits: mFh.json.credits, status: mFh.status });
  if (mFh.status === 200) {
    const rf = await call('/api/credits?action=refund', { method: 'POST', cookie, body: { user_id: userId, scope: 'flashhead' } });
    check(`refund flashhead → ${expectFh} restored`, rf.status === 200 && Number(rf.json.refunded) === expectFh, rf.json);
  }
  const mCap = await call('/api/users?action=job_token', { method: 'POST', cookie, body: { scope: 'flashhead', voiceover_text: Array(Math.ceil(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC) + 10).fill('word').join(' ') } });
  check('mint flashhead over the 90s cap → 400 (never a 0-credit mint)', mCap.status === 400, mCap.json);
}

// ── 4) Guards ────────────────────────────────────────────────────────────
async function guardsPhase() {
  console.log('\n── 4) Guard rails ──');
  await refreshBalance();
  // Ledger-aware no-op refund probe: the refund matcher reverses the OLDEST
  // unreversed deduction for a scope within the 7-day window — a live run
  // showed this guard sweeping up a day-old unreversed script charge (a
  // legitimate deferred refund, +1 the account kept). So the no-op assertion
  // only runs for a scope with NO real unreversed deduction in the ledger;
  // otherwise it is skipped loudly, never blindly.
  const SCOPED_HINTS: Record<string, string> = {
    render: 'Video generation', flashhead: 'FlashHead lip-sync video',
    edit: 'Image edit', description: 'Property description',
    social_post: 'Social media post', script: 'AI Writer voiceover script',
  };
  const rep = await call(`/api/credits?action=report&user_id=${userId}&period=7d`, { cookie });
  const tx: any[] = (rep.json.transactions || (rep.json.report && rep.json.report.transactions) || []);
  const reversed = new Set(tx.filter((t: any) => t.type === 'refund' && String(t.eventId || '').startsWith('rfnd_')).map((t: any) => String(t.eventId).slice(5)));
  const unreversed = (hints: string) => tx.some((t: any) =>
    t.type === 'deduction' && t.amount < 0 && !reversed.has(String(t.id)) &&
    (String(t.description || '').startsWith(hints) || String(t.metadata?.description || '').startsWith(hints) || String(t.description || '') === hints));
  if (!unreversed(SCOPED_HINTS.edit!)) {
    const rf = await call('/api/credits?action=refund', { method: 'POST', cookie, body: { user_id: userId, scope: 'edit' } });
    check('refund with no unreversed charge → 200 refunded:0 (idempotent, mints nothing)', rf.status === 200 && Number(rf.json.refunded) === 0, rf.json);
  } else {
    console.log('  ⚠ unreversed edit deduction exists in the ledger — no-op probe skipped (a real deferred refund would mint credits)');
  }
  check('idempotent-refund probe left the balance untouched', Number(((await call('/api/users?action=auth_session', { cookie })).json?.user?.credits ?? -1)) === balance, balance);
  const badMint = await call('/api/users?action=job_token', { method: 'POST', cookie, body: { scope: 'render', tier: 'NOT_A_TIER', config_index: 0 } });
  check('unknown tier mint → 400 (server refuses to price 0)', badMint.status === 400, badMint.status);
  const bigDeduct = await call('/api/credits?action=deduct', { method: 'POST', cookie, body: { user_id: userId, amount: 1_000_000, reason: 'over-balance guard', metadata: { kind: 'PROPERTY_DESCRIPTION' } } });
  check('deduct past the balance → 400', bigDeduct.status === 400, bigDeduct.status);
  const anon = await call('/api/users?action=job_token', { method: 'POST', body: { scope: 'script' } });
  check('anonymous paid mint → 401', anon.status === 401, anon.status);
}

// ── 5) Restore + ledger closure ──────────────────────────────────────────
async function restorePhase(initialBalance: number) {
  console.log('\n── 5) Restore account state ──');
  if (adminOk) {
    const target = RESTORE_OVERRIDE ? (RESTORE_OVERRIDE === 'NONE' ? null : RESTORE_OVERRIDE as any) : (original.planId || null);
    if (target === null && !original.planId) {
      check('account already had no subscription — nothing to restore', true);
    } else {
      const r = await call('/api/subscriptions?action=admin_set_subscription', {
        method: 'POST',
        cookie,
        body: { user_id: userId, plan_id: target, ...(target ? { cycle: original.cycle || 'MONTHLY', status: 'ACTIVE' } : {}), allocate_credits: false, cancel_paystack: false, reason: 'pricing_paths_e2e — restore original state' },
      });
      check(`restore plan ${target ?? 'NONE'} → 200`, r.status === 200, r.json);
    }
  }
  await refreshBalance();
  check(`final balance == starting balance (${initialBalance}) — the sweep is credit-neutral`, balance === initialBalance, { final: balance, initial: initialBalance });
}

async function main() {
  console.log(`pricing_paths_e2e → ${BASE}${QUICK ? '  [QUICK: no worker generations]' : ''}`);
  enginePhase();
  await loginPhase();
  await refreshBalance();
  const initialBalance = balance;
  console.log(`  starting balance: ${initialBalance}`);

  if (adminOk) {
    for (const plan of PLANS) {
      console.log(`\n── 2) Plan ${plan} ──`);
      if (!(await setPlan(plan, `pricing_paths_e2e — switch to ${plan}`))) { if (!adminOk) break; continue; }
      await deductAndGenerate('description', 1, 'description', 'PROPERTY_DESCRIPTION');
      await deductAndGenerate('social_caption', 2, 'social_post', 'SOCIAL_POST');
      await aiWritePhase();
      await refreshBalance();
      check(`plan ${plan} net drift = 0`, balance === initialBalance, { now: balance, expected: initialBalance });
    }
  }

  await mintsPhase();
  await guardsPhase();
  await restorePhase(initialBalance);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(async e => {
  console.error('\nFATAL:', e?.message || e);
  // Best-effort restore even on an unexpected crash path
  try {
    if (userId && adminOk && cookie) {
      await setPlan(RESTORE_OVERRIDE ? (RESTORE_OVERRIDE === 'NONE' ? null : RESTORE_OVERRIDE as any) : (original.planId || null), 'pricing_paths_e2e — crash-path restore');
    }
  } catch { /* nothing more we can do */ }
  process.exit(1);
});
