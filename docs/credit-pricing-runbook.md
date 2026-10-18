# Credits Runbook — pricing per tool & refund semantics

> Point this doc at code where it matters. Deep margin math lives separately in
> [pricing-cost-analysis.md](pricing-cost-analysis.md). **1 credit ≈ R1** (packs at parity, plans ≈ R0.99/credit).

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
| Starter | R129 | 130 | ≈R0.99 |
| Professional | R589 | 600 | ≈R0.98 |
| Premium | R1 270 | 1 300 | ≈R0.98 |
| Agency | R5 000 | 5 000 | R1.00 |

Plans can be switched in Admin → Users → Details → Change (remove = "— Remove subscription —"). Plan switches do **not** mint or burn credits.

## Price list (per action)

### Video Generator — priced by tier + duration (job_token `render`)

| Tier | What it is | 30s | 60s | 90s |
|---|---|---:|---:|---:|
| Essential | local FFmpeg zoom/pan, 1080p | 5 ⚡ | 10 ⚡ | — |
| Social | AI Motion, 512p | 30 ⚡ | 50 ⚡ (50s) | 80 ⚡ |
| Cinematic | AI Motion, 768p ("720p") | 40 ⚡ | 75 ⚡ | 105 ⚡ (repriced 2026-10-13) |
| Premium | **Kling 2.6 Pro**, native 1080p (replaced the 768p→1080p ffmpeg upscale 2026-10-14) | 85 ⚡ | 170 ⚡ | 250 ⚡ |

Premium engine note (2026-10-14): the tier moved from Hailuo-02 standard
768p + ffmpeg upscale to **Kling 2.6 Pro image-to-video** (`fal-ai/kling-
video/v2.6/pro/image-to-video`, $0.07/s flat across 720p/1080p, no-audio).
Kling only accepts 5s/10s clips, so Premium clips render at 5s ($0.35 ≈
R5.7 each) and the Modal assembler slow-stretches each to its 6s share of
the reel (setpts re-time — no stream-loop replay seam). COGS per length:
30s R28.6 / 60s R57.2 / 90s R85.8 → margins at 85/170/250 ≈ 54/55/54%.
The old 60/100/150 prices would have been ~36% on Kling COGS (below floor).
Cinematic stays on Hailuo-02 standard — Kling at 720p costs the same $0.07/s
as 1080p, so there is no cheaper Kling entry for the mid tier.

### AI Avatar (FlashHead, job_token `flashhead`)

**2 credits per 10 s of narration** (≈2.4 words/sec), minimum 2, hard cap 90 s of narration (longer script → worker answers 400). Legacy flat-8 fallback only if the mint receives no script text at all.

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
| Virtual Staging presets (gpt-image-2.5 whole-photo pass: `luxury_modern`, `scandinavian_minimal`, `contemporary_dark`, `coastal_relaxed`, `family_comfortable`, `luxury_bedroom`, `home_office`, `industrial_loft`) | 4 ⚡ |

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

- `?action=add` is **admin-session-only** and limited to `source: 'bonus'` — do not add credit routes outside it.
- A refund whose ledger shows no unreversed charge is a no-op by design (don't "fix" it by minting).
- Expired per-allotment credits are burned nightly by the same cron (`processExpiredCredits`) — an expiring credit cannot refund a later failure.

## Ops quick checks

- **User's last 30 days ledger:** `GET /api/credits?action=report&user_id=<id>&period=30d` (200 = current_balance, transactions, totals).
- **Admin console:** Admin → Users (per-user credits/plan) and Admin → P&L.
- **Reaper output:** every night's reconciliation is logged per project (`<projectId>: refunded N credits…`) — grep the cron logs.
- **Verify a pricing change:** edit `lib/renderPricing.ts` (pure data, shared by UI + server), typecheck (`npm run typecheck`), then smoke-test the *password-protected* mint: POST `job_token` for a bad tier/config must answer 400, never 0 credits.
