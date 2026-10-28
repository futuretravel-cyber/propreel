# Billing & Credit System — Comprehensive Test & Audit Report

**Date:** 2026-10-27 · **Scope:** recurring billing (monthly + annual), credit packs, deduct/refund, dunning, trials, billing emails (incl. upcoming-billing warnings to futuretravel@gmail.com), payment gates, cron pipeline · **Target:** production (`https://www.propreel.co.za`), production DynamoDB, Paystack, Resend

**Verdict: PASS.** Every billing and credit path verified green. **96 automated checks** across 7 suites, all passing (two intermediate harness bugs and one rate-limit artifact were fixed and re-verified). Four findings worth acting on, none a billing-integrity defect (F-1 below is the most operationally interesting).

---

## 1. What ran

| Suite | Where | Result |
|---|---|---|
| Pricing engine (pure) — `scripts/pricing_paths_e2e.ts` | local | **35/35** |
| Billing hermetic: HMAC signature matrix, email templates, dunning constants — `scripts/_billing_hermetic_test.ts` | local | **22/22** |
| Paystack verify gate: owner gate, rate limit, no Paystack call on failure — `scripts/_paystack_verify_gate_test.ts` | local | **all green** |
| Leads/admin hardening L-1/L-2 — `scripts/_leads_admin_hardening_test.ts` | local | **all green** |
| Live billing E2E — `scripts/_billing_e2e_live.ts` | **production** | **33/33** (cumulative; see §5) |
| Credit deduct/refund round-trip — `scripts/_billing_roundtrip_test.ts` | production DB | **8/8** |
| Pack grant recheck (unique event ids) — `scripts/_billing_pack_recheck.ts` | production | **4/4** |

No real money moved: all charges were synthetic, correctly-signed webhook events. No Paystack transaction was initiated (`initialize` was probed at the auth gate only). The cron invocation (§4) is the one place the audit executed real scheduled maintenance.

## 2. Recurring billing

### Monthly (STARTER, R129/mo)
- Activation from hosted checkout (`charge.success` + `metadata.type=subscription_start`): **activated, money gate exact** (paid R129 = plan price).
- Identical webhook redelivery → **deduped** (`psevt_` payload-hash claim), no double activation.
- Renewal (`subscription.renewal`) → **+110 credits** — exactly the `pricing_config` allowance for STARTER.
- Renewal redelivery → **deduped**. Second renewal in the same period → **0 credits** (`renew_<user>_<YYYY-MM>` period claim). Triple-spend (webhook ×2 + cron) impossible.

### Annual (PROFESSIONAL, R589/mo → R6,720/yr)
- Activation: **activated** at the exact annual price; renewal → **+520 credits** (the monthly allowance), once.

### Consistency proofs
- Test renewals granted **110 / 520** credits — byte-identical to the live `pricing_config` rows (STARTER 110/mo, PROFESSIONAL 520/mo).
- Credit pack charged **R75 for 50 credits** (the R1.50/credit pack rate) and granted **50** — the grant side reads `metadata.credits`, never the paid Rands, so price and grant cannot drift.

## 3. Credit lifecycle, money gates, failure paths

- **Deduct → refund round-trip:** deduct 10 / refund 10 → balance restored to the exact prior value; ledger rows (`deduction` / `refund`) written.
- **Over-draw guard:** deducting more than the balance is refused with `INSUFFICIENT_CREDITS` by an atomic conditional decrement — balance untouched. No path can go negative.
- **Refund idempotency:** a second refund with the same `eventId` is a no-op duplicate.
- **Money gates:** underpaid `subscription_start` (R1 for a R1270 plan) → **never activates**; unknown plan id → **never activates** (both ack 200 to Paystack and log for manual review — by design).
- **Failure path:** `charge.failed` → dunning record (`paymentFailure` count/first/last/reference) → nightly retry ladder.
- **Cancellation:** `subscription.disable` → subscription `CANCELLED`, verified in DB.

## 4. Cron pipeline (the recurring-billing machinery)

Invoked live with `Bearer CRON_SECRET` (wrong/missing secret → 401):

- **`allocate-monthly-credits`** (`0 0 1 * *`): ran the full monthly close — **5,450 credits allocated** (PREMIUM +1,150, AGENCY +4,300 to the two non-test active accounts), **September P&L books closed** (PDF pinned in S3, emailed to the 2 admin recipients with attachment), **agency reports generated** (1 agency + 2 agent PDFs). Monthly run-lock (`cronlock_alloc_2026-10`) claimed; re-invocations correctly return "already ran this month".
- **`send-expiry-notifications`** and **`process-expired-credits`** (daily): both returned **"already ran today"** — proof Vercel's own scheduled runs fired today (00:00 / 09:00 UTC) and the daily gates are idempotent.

## 5. Emails → futuretravel@gmail.com

All billing templates rendered and delivered through production Resend (send-scoped key, so per-message delivery lookup is API-denied by design; acceptance IDs are recorded below):

- **Upcoming-billing warning** (`upcomingBillingTemplate`): "*[TEST] PropReel billing reminder — R589 on 30 October 2026*" — accepted, e.g. id `01a17dc1-dcd3-…`, `01a17dc8-a71b-…`, `01a17dca-be8b-…` (one per verified run).
- **Payment-failed notice** (`paymentFailedTemplate`, day-1 style): "*[TEST] PropReel payment failed — R589 needs a card update*" — accepted, e.g. id `01a17dc1-dedc-…`, `01a17dc8-a909-…`, `01a17dca-c06a-…`.
- Email matrix (code-verified + exercised): upcoming-billing reminders send (`lib/billingNotice.ts`), dunning day-1/3/7/14 reminders send (`lib/dunning.ts`), trial reminders/ended send (`lib/trial.ts`). **6 "[TEST]" emails total** landed in the inbox across the verified runs.

## 6. Auth & abuse gates (all probed live)

- Webhook: unsigned → 401, forged signature → 401, valid HMAC-SHA512 over raw body → 2xx (all three accepted serialisation forms incl. Python-spaced + non-ASCII escaping). Local secret matches production (the audit could sign real events).
- `verify`: session gate → 401 `SIGN_IN_REQUIRED` (the H-1 IDOR fix holds), owner gate, per-IP throttle 30/600s.
- `initialize`, `subscriptions?action=checkout`, `credits?action=deduct`, `translate_quote`: unauthenticated → 401.
- Cron routes: no/wrong `CRON_SECRET` → 401 (fail-closed; the old spoofable `x-vercel-cron` fallback is gone).
- Register: 10/hour/IP fixed window — **fired correctly during testing** (run 4 hit it; see §8).

## 7. Live system state (read-only scan, post-test)

- **13 users** · 3 ACTIVE subs (PREMIUM/MONTHLY, AGENCY/MONTHLY, PROFESSIONAL/ANNUAL — the last is a test account) · 1 CANCELLED (test) · 0 overdue renewals, 2 due within 30 days · 5 saved cards · 1 payment-failure record (test) · 0 auto-topup.
- **8,462 credits** in circulation across personal balances.
- **Ledger (30d, 718 rows):** subscription +9,470 · bonus +6,150 · deduction −7,051 · refund +3,137 (render-failure compensation, 173 rows) · purchase +1,130 · transfer +100. Categories and nets are coherent.
- **Idempotency markers:** 183 `evt_` event locks · 10 `pay_` payment markers · 13 `psevt_` webhook-delivery claims · 4 `renew_` period claims — matching every grant observed.
- **Pricing config live:** STARTER R129/mo (R110/mo-annual), 110 cr · PROFESSIONAL R589/mo (R560/mo-annual), 520 cr · PREMIUM R1,270/mo (R1,200/mo-annual), 1,150 cr · AGENCY R5,000/mo, 4,300 cr.

## 8. Findings

**F-1 (info) — Mid-month run of the monthly cron grants extra allowances.** The audit invoked `allocate-monthly-credits` on Oct 27 (its normal schedule is the 1st). Git history shows nothing was *missed*: the P&L close landed Oct 3 and the run-lock Oct 6, and the single scheduled October fire (Oct 1, 00:00 UTC) predated both — with the first subscription not activated until Oct 1, 19:39 UTC. But because the job grants the *current calendar month's* claim (`renew_<user>_2026-10`) to everyone active at run time, the two non-test accounts received an October monthly allowance (+1,150 / +4,300) on top of their early-October activation grants — an allowance they would not have received on a strict 1st-of-month schedule. Net effect: **+5,450 credits** to 2 accounts. The one-grant-per-calendar-month model is intact (their next grant is November's). Reversible with a deduct if exact schedule parity is wanted. Note the flip side: this run is also what produced September's P&L + agency reports, which no scheduled fire would have closed (Nov 1 closes October).

**→ RESOLVED (2026-10-28).** Closed on both sides:
1. *Prevention* — `createSubscription` (`lib/userService.ts`) now claims `renew_<user>_<YYYY-MM>` **before** granting, in the same claim space `allocateMonthlyCredits` races for, so the activation grant IS the activation month's allocation: neither a mid-month cron run nor a late renewal webhook can stack a second allowance in that month. The claim's result is ignored on purpose (an existing claim must never block the grant the customer just paid for); claim-then-grant mirrors the allocator, so a claim-write failure fails the activation and its callers retry via the released `pay_<ref>` marker.
2. *Reversal* — the +5,450 was reversed with ledger'd deducts (`scripts/_billing_cleanup.ts --apply`; strict guard: the non-test Oct-27 grant rows must be exactly +1,150 and +4,300 or it aborts): `ulric@fetgroup.co.za` −1,150 (balance 1,152 → 2) and `futuretravel@gmail.com` −4,300 (balance 4,875 → 575). Both rows verified in `CREDIT_TRANSACTIONS` (type `deduction`, metadata `kind: ALLOWANCE_REVERSAL`, each linked to the original grant via `reversedTxnId`/`reversedCreatedAt`). The `renew_2026-10` claims remain in place — the activation grants are October's allowance.

**F-2 (low) — Immediate payment-failure email is log-only.** `charge.failed` writes the dunning record but only `console.log`s `[dunning-email]`; the first real email goes out at the nightly day-1 sweep. The downgrade notice (day 21) and the recovered-payment notice are also log-only (`lib/dunning.ts`). Consider sending on the event itself and real messages for downgrade/recovery.

**→ RESOLVED (2026-10-28).** All three notices are now real Resend emails (`lib/email.ts` templates, `api/paystack/webhook.ts`, `lib/dunning.ts`):
- *Immediate payment-failed* at `charge.failed`/`invoice.payment_failed` (`paymentFailedTemplate` with a "just now" immediate variant), gated to the **start of a dunning episode** (Paystack's paired `charge.failed`+`invoice.payment_failed`, redeliveries, and mid-episode sweep retries never re-email — the sweep's day-1/3/7/14 reminders own the cadence) and to **subscription-scoped charges** (a failed one-off credit-pack or upgrade checkout never promises renewal retries or threatens plan cancellation). Send failures are logged, never fatal — the webhook keeps returning 200.
- *Downgrade (day 21)*: one-shot `subscriptionCancelledTemplate`, sent **only on the actual downgrade** so re-sweeps of an already-cancelled plan can never re-send it.
- *Recovery*: `paymentRecoveredTemplate` when a dunning retry finally charges the card, in its own try/catch so a send failure can't fall through into the payment-failed email.
Verified by `tsc --noEmit`, code inspection, and a **live end-to-end run (2026-10-28, `scripts/_dunning_email_e2e.ts`, 21/21 checks)**: the real webhook handler (properly HMAC-signed `charge.failed` payloads) and the real sweep sent all three emails to fresh test accounts — immediate payment-failed, mid-episode re-suppression, one-off gate, day-1 reminder, recovery (retry charge stubbed at the fetch layer so no money moved) and day-21 cancellation incl. one-shot proof. Copies with `[TEST]` subjects went to the owner's inbox; test accounts and marker rows deleted afterwards.

**F-3 (low) — Paystack-native plan codes not configured locally.** `PAYSTACK_PLAN_<PLAN>_<CYCLE>` env vars are absent in `.env`; `subscription.create`'s plan mapping falls back to legacy `PLN_*` names. The live path (hosted checkout → `subscription_start`) is unaffected; confirm the codes exist in production env if Paystack-native subscriptions are ever used.

**→ RESOLVED (2026-10-28).** All 8 `PAYSTACK_PLAN_<PLAN>_<CYCLE>` codes are configured in `.env` **and** in Vercel production env (`vercel env ls production`: 8/8 `PAYSTACK_PLAN_*` + `PAYSTACK_SECRET_KEY`, values masked there — so the code values themselves were validated via the local `.env`). `scripts/_paystack_plan_codes_check.ts` (read-only GETs) confirms each code resolves to a real ZAR Paystack plan whose amount/interval match the live `pricing_config`, and that `getPlanDetails` prefers the env code over the legacy `PLN_*` fallback in all 8 cases: STARTER R129/R1,320 · PROFESSIONAL R589/R6,720 · PREMIUM R1,270/R14,400 · AGENCY R5,000/R60,000 (annual = monthly-equivalent × 12, matching `getPlanDetails`' price math). Cosmetic note: 6 of the 8 plans' Paystack display names are raw env-var strings (e.g. `PAYSTACK_PLAN_PROFESSIONAL_MONTHLY`) — mapping is by plan code, so billing is unaffected.

**F-4 (info) — Test data left in production.** 10 labelled accounts (`billing-e2e-{monthly,annual,pack}-<ts>@propreel.co.za`, fullName "BILLING E2E … safe to delete"), holding ~2,865 credits total; 2 carry ACTIVE annual subscriptions and payment-failure flags. Full list for cleanup:

| email | credits | sub | paymentFailure |
|---|---|---|---|
| billing-e2e-monthly-1793110709204 | 5 | none | no |
| billing-e2e-annual-1793110709204 | 5 | none | no |
| billing-e2e-pack-1793110709204 | 5 | none | no |
| billing-e2e-monthly-1793111140493 | 220 | CANCELLED | no |
| billing-e2e-annual-1793111140493 | 1040 | ACTIVE | **yes** |
| billing-e2e-pack-1793111140493 | 105 | none | no |
| billing-e2e-monthly-1793111610693 | 220 | CANCELLED | no |
| billing-e2e-annual-1793111610693 | 1040 | ACTIVE | **yes** |
| billing-e2e-pack-1793111610693 | 5 | none | no |
| billing-e2e-monthly-1793111767266 | 220 | CANCELLED | no |

All `@propreel.co.za`. Delete via the admin panel. Idempotency markers and ledger rows for these accounts are harmless (they only dedupe their own synthetic events). The pack recheck added +50 to `…pack-1793111140493`.

**→ RESOLVED (2026-10-28).** All 10 accounts deleted (`scripts/_billing_cleanup.ts --apply`, exact-email allowlist): projects + user row + sessions, mirroring the production `deleteAccount` flow; post-check confirmed **10/10 gone**. None carried a Paystack recurrence code (the two ACTIVE test subscriptions were purely DynamoDB records fed by synthetic webhook events — confirmed, not assumed), so there was no real payment subscription to cancel. Their historical ledger rows and idempotency markers remain (append-only history, harmless per above), and the harness's same-day grant rows on these accounts (+110/+520 renewal-test allocations) were removed with the accounts and deliberately never "reversed". Cleanup tooling is idempotent — a re-run reports "already gone" and changes nothing.

## 9. Test-harness notes (transparency)

Three intermediate failures were harness bugs, not system bugs, each found, fixed and re-verified:
1. The live driver initially didn't load `dotenv`, so signatures were HMAC'd with an empty key ("Invalid signature"), the cron bearer was empty, and Resend looked unconfigured. Fixed → 32/33.
2. Synthetic Paystack event ids were stable across runs; the `ps_<id>` ledger lock correctly refused the second grant (a *pass* for the system, a *fail* for the harness). Fixed with per-run unique ids → pack recheck 4/4. A cross-run byproduct also proved the event lock under real conditions (the run-3 pack account sits at exactly 5 credits = signup bonus only).
3. The Resend delivery-list check assumed a read-scoped key; production's key is send-only (`restricted_api_key`). The check now records acceptance IDs.

Run 4 additionally hit the register rate limit (10/hour/IP, two 429s) — the limiter works; the cascade is documented in the run logs. All green results above are from full runs or targeted rechecks after the fixes.

## 10. Recommendations

1. ✅ **DONE (2026-10-28)** — ~~Delete the 10 test accounts (F-4 table); optionally reverse the +5,450 October allowance (F-1) with a ledger'd deduct.~~ Both done and verified: 10/10 accounts deleted, −5,450 reversed with traceable ledger rows (see F-4/F-1 resolutions).
2. ✅ **DONE (2026-10-28)** — ~~Send the payment-failed email at `charge.failed` time and real downgrade/recovery notices (F-2).~~ All three send real Resend emails now (see F-2 resolution; not live-delivered).
3. ✅ **DONE (2026-10-28)** — ~~Confirm `PAYSTACK_PLAN_*` codes in production env (F-3).~~ 8/8 present in production env and validated against live Paystack plans (see F-3 resolution).
4. ✅ **DONE (2026-10-28)** — ~~Decide the October allowance semantics.~~ Decision: activation month must NOT also receive a calendar-month grant — `createSubscription` now claims `renew_<user>_<activation month>` at activation (see F-1 resolution).
5. Consider a full-scope Resend key (server-side) if delivery monitoring beyond acceptance is wanted.

---
*Harness: `scripts/_billing_e2e_live.ts`, `scripts/_billing_hermetic_test.ts`, `scripts/_billing_roundtrip_test.ts`, `scripts/_billing_pack_recheck.ts`, `scripts/_billing_state_scan.ts`. Resolution tooling (2026-10-28): `scripts/_billing_cleanup.ts` (F-1/F-4 cleanup, dry-run by default, `--apply` to execute), `scripts/_paystack_plan_codes_check.ts` (F-3 verification). Run with `npx tsx --env-file=.env <script>`.*
