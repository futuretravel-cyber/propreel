# Credits Runbook — pricing per tool & refund semantics

> Point this doc at code where it matters. Deep margin math lives separately in
> [pricing-cost-analysis.md](pricing-cost-analysis.md). **1 credit = R1.50 retail (list value)** since the 2026-10-19 reprice; top-up packs charge **R1.50/credit** cash since the 2026-10-21 parity reprice (`CREDIT_PACK_RAND` in `lib/renderPricing.ts`, consumed by `api/paystack/initialize`), plans bundle **≈R1.10–1.17/credit** since the final 2026-10-21 ladder (see the watch note below the table).

## Who sets the price

Prices are **decided on the server, never the browser**:

| Tool class | Charge path | Table it reads |
|---|---|---|
| Video render, AI Avatar, image edit, AI-Write script, **Property Description, Social Post** | `POST /api/users?action=job_token` — the mint prices, deducts, and issues the single-use token the next worker call carries (`X-PropReel-Token`) | `lib/renderPricing.ts` (`jobCredits()`) |
| Language check / tone translate | free (no charge) | — |

The text tools moved onto the mint on 2026-10-13: previously the browser sent
the amount to `?action=deduct`, so a modified client could choose what it paid.
Now **every resource-granting path is priced server-side**. The legacy
`?action=deduct` endpoint still validates known kinds (`PROPERTY_DESCRIPTION`,
`SOCIAL_POST`) against the server's own price — a mismatched amount gets a 400,
never a ledger row — and no product caller remains on it.

`src/lib/constants.ts` re-exports the tier/credit data so the UI always shows the same numbers the server charges.

## Plans (monthly credit allocations)

| Plan | Price | Credits | per-credit |
|---|---:|---:|---:|
| Starter | R129 | 110 | ≈R1.17 |
| Professional | R589 | 520 | ≈R1.13 |
| Premium | R1 270 | 1 150 | ≈R1.10 |
| Agency | R5 000 | 4 300 | ≈R1.16 |

Plans can be switched in Admin → Users → Details → Change (remove = "— Remove subscription —"). Plan switches do **not** mint or burn credits.

Starter trimmed **130 → 115 credits** on 2026-10-19 (price unchanged): at
the floored catalog a 130⚡ annual Starter (R110/mo-equiv) spent entirely
on Cinematic 60s bought 2 reels for R113.38 of COGS — **−3.1%, below
cost**. At 115 the worst single-SKU spend is +22.9% (annual) / +34.3%
(monthly). Every other plan/billing cell was already above cost — the
thinnest are annual Professional (+4.6% on 100% Social 60s) and annual
Premium (+5.5% on 100% Cinematic 60s); trim those allotments too if those
corners ever worry you (`docs/pricing-cost-analysis.md`, suggestion 8).

**Credits set 2026-10-21 (client-approved, prices unchanged — final
revision after an interim bump the same day):** Starter 115 → **110**,
Professional 600 → **520**, Premium 1 300 → **1 150**, Agency 5 000 →
**4 300**. Plan rates ≈**R1.10–1.17/credit** = 22–26% under the R1.50
list value. Worst single-SKU burn (fractional, Premium-90s R0.774/credit,
client's (revenue−COGS)/COGS method): Starter +51% monthly / +29% annual,
Professional +46%/+39%, Premium +43%/+35%, Agency +50% — every cell far
above cost; blended realistic mixes (≈R0.45/credit) clear ~55–62%. The
2026-10-19 trim paragraph above was computed on **wan-era COGS** (its
"R113.38 for 2 reels" = 2 × R56.69 wan Cinematic 60s; on Hailuo that burn
costs R96.90 — rebuilt in pricing-cost-analysis.md suggestion 8).
Applied in `src/lib/constants.ts` + the `settings/pricing_config` row via
`scripts/update_pricing_plans.ts` (plans-only — admin-edited render tiers
untouched); marketing copy reads credits from PLANS so hardcoded counts
can't drift again.

**WATCH — packs vs plans (resolved 2026-10-21):** packs were repriced from
R1.00 to **R1.50/credit** (exactly the R1.50 list value) via
`CREDIT_PACK_RAND` in `lib/renderPricing.ts`, so every cash path
(initialize, charge grant, auto-topup) now converts at 1.5. Plans at
≈R1.10–1.17 sit 22–26% UNDER the pack cash rate — the ladder now reads
exactly as marketed (plans = the bundle discount), which is the fix this
note called for. No remaining quirk: list value, pack cash rate and
(plan) bundle rate are now one consistent ladder.

**Free registration (2026-10-21):** signup now defaults to a permanent
free account (5-credit signup bonus, no card, no 7-day trial clock — the
trial checkbox is gone from the UI; `lib/trial.ts` still runs for rows
already clocked). Subscribing happens later from Billing, or at signup
via the opt-in that routes to Paystack checkout.

## Price list (per action)

### Video Generator — priced by tier + duration (job_token `render`)

| Tier | What it is | 30s | 60s | 90s |
|---|---|---:|---:|---:|
| Essential | local FFmpeg zoom/pan, 1080p | 5 ⚡ | 10 ⚡ | — |
| Social | AI Motion, wan 480p | 34 ⚡ | 60 ⚡ | 89 ⚡ |
| Cinematic | AI Motion, wan 480p + FlashVSR → 720p | 47 ⚡ | 63 ⚡ | 95 ⚡ |
| Premium | AI Motion, wan 480p + FlashVSR → 1080p | 60 ⚡ | 80 ⚡ | 100 ⚡ |

Repriced 2026-10-19: a Rand-anchored ladder (Social R50/70/100, Cinematic
R70/90/120, Premium R90/120/150) converted at 1 credit = R1.50, rounded up —
then floored the SAME day: the long reels sat under the 40% margin floor
(Social 60/90s at 24/21%, Cinematic 60/90s at 37/29%), so 60/90s moved to
the exact floor prices at R1.50/credit — Social 60/90s → 60/89
(R90.00/R133.50), Cinematic 60/90s → 63/95 (R94.50/R142.50). Essential was
not in the ladder and keeps 5/10 (now R7.50/R15 at the new credit value).
Engine history: Hailuo/Kling were retired 2026-10-18 — all AI tiers
generate on wan-25 480p and Cinematic/Premium upscale via the self-hosted
FlashVSR endpoint (`docs/flashvsr-upscale-integration.md`), which makes the
two tiers' COGS identical (R28.6/56.7/84.8 per length). Margins at the
floored ladder: Essential 72–75%, Social 47/41/41%, Cinematic 60/40/40%,
Premium 68/53/43% — every SKU now clears the 40% floor.

### AI Avatar (FlashHead, job_token `flashhead`)

**2 credits per 10 s of narration** (≈2.4 words/sec; minimum 2, hard cap 90 s of narration (longer script → worker answers 400). At R1.50/credit that is R3.00 per 10 s against a ~R1.37 unit cost — about **55% margin**, above the floor. The 2026-10-19 R1.50 reprice briefly took this to 1cr (≈9%, under the floor) and it was restored to 2cr the same day; all client copy (HelpModal, AITalkingProfile, FlashHeadVideo, EnhancedOverview) has always said 2. Legacy flat-8 fallback only if the mint receives no script text at all.

### AI text

| Tool | Price | Scope |
|---|---:|---|
| Property Description | 1 ⚡ | `description` |
| Social Media Post | 2 ⚡ | `social_post` |
| AI Writer voiceover script (`video_script`) | **1 ⚡ per 30s of script, rounded up** (30s→1, 50s→2, 60s→2, 90s→3) | `script` |

The script price scales with duration because cost does: each call attaches every
uploaded photo to a Grok vision prompt (~2k input tokens/image on fal's
OpenRouter route, $2/M in / $6/M out), so a 90s/15-image script costs ~R1.08 in
provider tokens — flat 1⚡ was breakeven at 60s and a loss at 90s
(repriced 2026-10-13). Mints with no duration at all (stale clients) still fall
back to the legacy flat 1⚡ in `jobCredits`. The mint is charged from
`metadata.duration` sent by the client; `SCRIPT_CREDITS` (1) is the legacy
fallback constant only.

### Image editing (job_token `edit`, priced server-side by preset)

| Path | Price |
|---|---:|
| Plain presets (photo editor, removal/erase, twilight, sky, HDR tone-map) | 2 ⚡ |
| Virtual Staging presets (gpt-image-2.5 whole-photo pass: `luxury_modern`, `scandinavian_minimal`, `contemporary_dark`, `coastal_relaxed`, `family_comfortable`, `luxury_bedroom`, `home_office`, `industrial_loft`) | 2 ⚡ (repriced from 4 on 2026-10-16 — same whole-image flare pass as every other edit) |

## Refund semantics — the three rules

1. **Charge first, refund on failure only.** Every paid action deducts (or mints) *before* generating. A failed generation refunds; an *unsatisfactory but successful* output does **not** (stated in the in-app AI notice — never make ad-hoc goodwill refunds outside a support decision).
2. **The client names a scope, never an amount.** Refunds go `POST /api/credits?action=refund { user_id, scope }` with scope ∈ `render | flashhead | edit | description | social_post | script`. The server finds the matching **unreversed** deduction in the ledger and reverses at most its real amount, **at most once per charge** (event lock). There is no "amount" field to abuse by design (`api/credits.ts`).
3. **Only the ledger is trusted.** A project row's `creditsSpent` is client-written and never grounds a refund — `refundDeduction()` reconciles against actual ledger deductions (`lib/projectReaper.ts`, `lib/userService.ts`).

### Failure → refund paths in the product

| Path | Refunded by |
|---|---|
| Description / Social / AI-Write (text) | the tool's own `catch` → `refundCredits(scope)` → `?action=refund` |
| AI-Write client timeout (AbortSignal deadline per kind, `src/lib/api.ts`) | same catch — timeout is a failure |
| Render render loop / cancel (`/cancel_render`, poll loop stop) | `refundCredits('render')` + project row → FAILED |
| FlashHead avatar job (`useFlashHead`) | `refundCredits('flashhead')` — on failure *or* in-flight cancel (it posts its own `/cancel_render` first) |
| Image edit (`useImageEdit`) | `refundCredits('edit')` |
| **Browser died mid-render** (project stuck `PROCESSING` >2 h) | **nightly reaper** (`lib/projectReaper.ts`, run from the `process-expired-credits` cron): worker says completed → finalize READY, **no refund**; failed/unknown → FAILED + ledger-verified refund. Atomic status claim prevents double-refund with a waking client. |

### Never do / look out for

- `?action=add` is **admin-session-only** and limited to `source: 'bonus'` — do not add credit routes outside it. Amount must be a whole number of credits (1–1,000,000), and every grant is ledger-stamped server-side with `kind: ADMIN_CREDIT_GRANT` + the acting admin's email — the client cannot forge either (`api/credits.ts`, UI in `AdminGiveCredits.tsx`, e2e `scripts/test_admin_grants.ts`).
- A refund whose ledger shows no unreversed charge is a no-op by design (don't "fix" it by minting).
- Expired per-allotment credits are burned nightly by the same cron (`processExpiredCredits`) — an expiring credit cannot refund a later failure.

## Ops quick checks

- **User's last 30 days ledger:** `GET /api/credits?action=report&user_id=<id>&period=30d` (200 = current_balance, transactions, totals).
- **Admin console:** Admin → Users — per-user credits/plan; the **Give** button grants any amount with a note (the row's new balance comes from the server response, never a local guess). Admin → P&L.
- **Reaper output:** every night's reconciliation is logged per project (`<projectId>: refunded N credits…`) — grep the cron logs.
- **Verify a pricing change:** edit `lib/renderPricing.ts` (pure data, shared by UI + server), typecheck (`npm run typecheck`), then smoke-test the *password-protected* mint: POST `job_token` for a bad tier/config must answer 400, never 0 credits.
