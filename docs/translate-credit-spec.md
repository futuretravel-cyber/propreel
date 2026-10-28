# Spec — 1 credit per voiceover Translate

**Status:** implemented (2026-10-27) — 1 credit per translate, **first 3 free on a running trial** · **Owner cost:** ~$0.0005–0.002 per call · **Price:** 1 credit (R1.50)

## Why

The mismatch gate's Translate action is the last per-user LLM call that spends
the owner's money without recovering anything. The volume cuts (verdict cache,
check-on-settle, rate limit) made the *checks* nearly free — translation is
deliberately excluded from caching because every script is unique. At 1,000
users, unlimited free translation is an open-ended LLM bill; a 1-credit charge
makes every translate margin-positive (≈5–150× cost) while staying trivially
cheap for the user.

## Pricing decision

| Item | Value |
|---|---|
| Price per translate | **1 credit** (R1.50 ≈ $0.085) |
| Billed per | per click (whole script), not per word |
| Paid by | everyone — paid tiers **and** trial; a running trial gets its first **3 translates free** (`TRIAL_FREE_TRANSLATES` in `lib/trial.ts`), the 1-credit charge starts on the 4th |
| Agency pool | not eligible — personal balance only |
| Refund | full, on failure/empty/timeout |
| Free forever | `language_check` (the safety check is never paywalled), "Keep as is", dismiss |

Alternatives considered: per-word pricing (rejects — translate cost barely
scales with length and per-word pricing reads as expensive), 2 credits (aligns
with Social Post but "small" means small). first-N-free shipped as the trial
allowance below (2026-10-27): 3 free translates on a running trial, counted
off the ledger — no separate counter state.

## Charge lifecycle

Mirrors the Social Post pattern ("2 credits per post render, refunded on
failure"):

1. User clicks **Translate (1 credit)** in the mismatch dialog/banner.
2. `POST /api/credits?action=deduct` `{ user_id, amount: 1, reason:
   'Translate voiceover script', metadata: { kind: 'TRANSLATE' } }`.
   The server rejects any amount ≠ `TRANSLATE_CREDITS` (400) — the client
   never chooses the price. **Trial freebie:** while the trial is running and
   fewer than 3 translates are used, this step consumes one for free — it
   records a 0-amount `kind: TRANSLATE` consumption row and answers
   `{ success, free: true, free_remaining }` without touching the balance.
   `GET /api/credits?action=translate_quote` reports the same numbers so the
   button can show "free — N left" or "1 credit" before the click.
3. **402 / insufficient balance → stop here.** No LLM call happens; show the
   existing low-credit nudge with the top-up route.
4. On deduct success → `PropReelAPI.generateText('translate', …)` (unchanged).
5. Success → done; the ledger row (`kind: TRANSLATE`) feeds usage reporting.
6. Failure / empty response / timeout → `POST /api/credits?action=refund`
   `{ user_id, scope: 'translate' }` and surface the error in the banner.
   The refund matcher reverses exactly one real unreversed deduction, so a
   double refund is impossible even if the client retries the call. For a
   trial freebie the reversal is a no-op on the balance (abs(0)) that simply
   un-counts the consumption row — **the free try comes back** instead of
   burning on a call that produced nothing.

Retry after failure re-enters at step 2 (a fresh charge), which is correct:
the failed attempt was already refunded. The Translate button stays disabled
while `translating` (already true), so double-clicks cannot double-charge.

## Server changes

1. **`lib/renderPricing.ts`** — add `TRANSLATE_CREDITS = 1` next to
   `DESCRIPTION_CREDITS` / `SOCIAL_POST_CREDITS`, and extend `jobCredits()`
   with `'translate': TRANSLATE_CREDITS`.
2. **`api/credits.ts`** (`?action=deduct`) — add `|| kind === 'TRANSLATE'` to
   the server-priced-kinds branch (line ~157) and price it via
   `jobCredits('translate')`. Everything else in the handler is unchanged.
3. **`lib/userService.ts`** — add a `translate` entry to `REFUND_MATCHERS`
   (matches ledger rows with `metadata.kind === 'TRANSLATE'`); it flows into
   `REFUND_SCOPES` automatically. `refundDeduction`'s candidate filter also
   accepts the 0-amount trial-free rows for this scope only (their reversal
   mints nothing — it exists to return the allowance).
3b. **`api/credits.ts`** — the trial allowance: `translateTrialUsage()` counts
   unreversed `kind: TRANSLATE` rows; `?action=translate_quote` prices the
   next click for the UI; the `deduct` branch consumes a freebie (0-amount
   row) while `isTrialRunning` and usage < 3, and rejects `pool: 'agency'`
   (personal balance only).

## Frontend changes

4. **`src/lib/useVoiceoverLanguageCheck.ts`** — `translate()` becomes:
   deduct → generateText → refund-on-failure (the verdict-cache seeding on
   success is kept). A 402/INSUFFICIENT_CREDITS deduct maps to the
   low-credit message before any LLM call happens. The hook also prefetches
   `translate_quote` (deduped module cache) and exposes `translateCostLabel`.
5. **`src/components/LanguageMismatchBanner.tsx`** + the ConfirmContext
   dialog copy — button labels read **"Translate to X (1 credit)"** or
   **"Translate to X (free — N left)"** so the cost is visible *before* the
   click (the dialog already offers Translate / Keep as is; only the label
   changes).

## Edge cases

- **Tampered client:** sending `amount: 0` or `amount: 5` gets a 400 — same
  guarantee as Description/Social today.
- **Concurrent tabs:** each translate charges once; refunds reverse the oldest
  unreversed TRANSLATE deduction (matcher semantics) — fine at 1 credit.
- **Concurrent tabs (trial freebies):** two simultaneous clicks can both see
  the last free try and both go free — 1-credit exposure, same tolerance the
  concurrent-tabs row below already accepts.
- **Rate limits stay:** the worker's per-user cap remains the abuse guard;
  credits are the monetization layer. They compose, they don't replace.
- **Admins:** no exemption (admins can grant themselves credits via the
  existing admin `add` action); avoids a role branch in billing.

## Phase 2 (optional hardening)

Enforcement is mint-side, matching Description today: a user who calls the
worker endpoint directly with their own worker token skips the credit (cost
exposure ≈ fractions of a cent per call, bounded by the rate limit). If that
ever matters, mint a single-use scoped token per translate (the `job_token`
machinery + `extraHeaders` already support this, same as `video_script`) and
have `/generate_text` claim it for `kind: 'translate'`.

## Verification

- Deduct with wrong amount → 400 (table-driven over 0, 2, 0.5).
- Deduct → forced LLM failure → refund lands; balance restored; second refund
  call returns 0 refunded.
- 402 on empty balance → no LLM call (assert via stub), low-credit UI shown.
- Live: mismatch dialog → Translate → 1 credit deducted, script rewritten in
  the target language, ledger row visible in billing history.
