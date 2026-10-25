# PropReel — Security Audit (2026-10-25)

**Scope:** the whole site — Vercel SPA + serverless API (`api/*`, `lib/*`), the Modal
render worker (`modal/app_propreel_minimax.py`, `modal/flashvsr_endpoint.py`),
payments (Paystack), storage (S3/DynamoDB), CI, and the dependency tree.
**Method:** static code review of every auth/authorization/payment/secrets path,
pattern scans for injection sinks, header/config review, and `npm audit`.
No live exploitation was attempted against production accounts or payments.

**Verdict:** the platform's core security posture is strong — first-party scrypt
auth, opaque server-side sessions, consistent IDOR gates, server-priced job
tokens, and a properly verified + idempotent payment webhook. No critical
findings. One **High** (unauthenticated `/api/paystack/verify`), two **Medium**
(worker auth fail-open, CSP `unsafe-inline`/`unsafe-eval`), and several
low-severity hardening items.

---

## Deploy & live-verification log (2026-10-25 evening)

Every finding marked FIXED below is **deployed to production and verified
live**. The deploy shipped the security fixes only (built in an isolated tree
from `HEAD` + the security files — the in-progress listing-fetch feature,
agency-logo UI and ledger-ordering fix in the working tree were deliberately
left out and remain local). Still uncommitted in git.

- **Modal** — `propreel-render` (web => `futuretravel--propreel-render-web.modal.run`)
  and `propreel-flashvsr` redeployed with the hardening. Live checks:
  `/health` → 200 unauthenticated (allow-list intact); `/render_video`,
  `/generate_text`, `/tts_preview` without token → **401**, garbage token →
  **401** (M-1 fail-closed); error body is generic `{"error":"malformed
  token"}`; `Origin: https://evil.example` preflight gets **no
  `Access-Control-Allow-Origin`** while `https://www.propreel.co.za` gets its
  exact origin echoed (L-3). `RENDER_API_TOKEN` present on both sides
  (Vercel production env + the `render-auth` Modal secret) before the cutover.
- **Vercel** — production deployment `propreel-5zkbhi8dj` (builder runs
  `vite build && node scripts/check-no-inline-scripts.mjs`, so the CSP guard
  gates every future deploy). Live checks: `script-src` header has no
  `'unsafe-inline'`/`'unsafe-eval'` (M-2); anonymous `POST
  /api/paystack/verify` → **401** `SIGN_IN_REQUIRED` before Paystack is
  queried (H-1); anonymous `admin_api_keys` → **401** and anonymous
  `agency_invite` → **401** (L-1/L-2); demo POST → **202** then repeat →
  **429** `RATE_LIMITED` from the same-IP throttle (L-2, one clearly-marked
  `deploy-verify@example.com` test row, self-expiring). Browser on
  `https://www.propreel.co.za`: home renders with zero console errors and
  zero CSP violations, lazy chunks + `plausible.io/js/script.js` load (200,
  event POST 202), and a deliberately injected inline script is **refused by
  CSP** — enforcement live.
- One deploy-system fix was needed en route: `.vercelignore` excluded
  `scripts/`, so the builder could not run the new guard (`MODULE_NOT_FOUND`);
  it now uses `scripts/*` + `!scripts/check-no-inline-scripts.mjs`.
- **CI gate (same day):** `.github/workflows/ci-cd.yml` now runs the CSP guard
  and all three hermetic suites (paystack gate, leads/admin hardening, worker
  hardening) on **every push** — any branch — plus PRs to main/develop. The
  suites were un-ignored in `.gitignore` (`scripts/_*` scratch convention
  carved out exactly these three) so they live in the repo; the worker suite
  runs against pinned `modal==1.5.5 fastapi==0.141.1 httpx==0.28.1` and was
  verified in a clean venv without `requests`/`fal_client` (its stub path).
  The live admin-UI smoke keeps its original cadence (main/develop + PRs).

---

## Findings

### H-1 · `/api/paystack/verify` is unauthenticated, unrated, and discloses billing state
**File:** [api/paystack/verify.ts](../api/paystack/verify.ts) · **Severity: High**
**Status: FIXED + DEPLOYED 2026-10-25** (verified live, see the deploy log
above; still uncommitted in git) — the route now requires a
signed-in session (`sessionUser` → 401 before Paystack is ever queried),
enforces ownership after the reference resolves (`requireOwner` → 403 for
callers who do not own the payment, with no billing state in the body), and is
throttled per IP (`paystack_verify_ip`, 30/10 min, pre-Paystack) and per
account (`paystack_verify_user`, 60/10 min). Regression coverage:
[scripts/_paystack_verify_gate_test.ts](../scripts/_paystack_verify_gate_test.ts)
(hermetic: 401 / 403-no-leak / 429×2, all passing). Takes effect on the next
Vercel deploy.

The handler performs no session check at all. Anyone who knows (or brute-forces)
a Paystack reference can POST it and:

1. **Read another user's billing state** — the response returns
   `new_balance` and the payer's full `subscription` object for any reference
   whose payment resolved (`metadata.user_id` / customer email). This is an
   IDOR-style disclosure of credit balances and plan details.
2. **Trigger state changes on someone else's account** (credit grant, plan
   activation, card-authorization capture). Double-processing is prevented by
   the `pay_<reference>` / `upg_<reference>` markers and `addCredits` event
   locks, so no double-credit — but the *first* caller consumes the markers.
3. **Use the endpoint as a Paystack API oracle / amplifier** — every call
   performs a live `verifyPayment(reference)` with zero rate limiting.

The paired webhook path is properly signature-verified; this client-polled path
is the weak twin.

**Fix:** after resolving `userId`, enforce `requireOwner(req, userId)` (or mint
the verify call from the owning session only), add a `consumeRateLimit` on the
route, and stop returning `new_balance`/`subscription` to non-owners.

### M-1 · Modal worker auth is fail-open when `RENDER_API_TOKEN` is missing
**File:** [modal/app_propreel_minimax.py](../modal/app_propreel_minimax.py) (≈L78–106) · [lib/workerToken.ts](../lib/workerToken.ts) · **Severity: Medium**
**Status: FIXED 2026-10-25** (uncommitted) — `_parse_token` now returns an error
when the secret is missing instead of an "anon" pass, so every tokened endpoint
(paid scopes AND the other spend paths like `/generate_text` + `/tts_preview`)
rejects with 401; only the `_token_allow_paths` observability endpoints stay
reachable. `_claim_job_token` is fail-closed through the same parse.

`_parse_token` returns `{uid: "anon"}` with a console warning when the secret is
unset, and `lib/workerToken.ts` then sends no header at all. The worker URL is
public (hardcoded fallback `https://futuretravel--propreel-render-web.modal.run`
in the client bundle), so a single missing/rotated secret turns every paid
endpoint (`/render_video`, `/edit_image`, `/generate_flashhead_video`) into
**open GPU + fal.ai spend** for anyone who finds the URL. The design comment
("a deploy without the secret can never take renders down") makes this a
deliberate availability-vs-security trade — but on the money path, fail closed.

**Fix:** require the token unconditionally for paid scopes (fail 401 without
the secret), and keep fail-open only for `/health` + `/probe`. The good news:
`/admin/secret` is already fail-closed (`if not expected or …` → 401).

### M-2 · CSP allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`
**File:** [vercel.json](../vercel.json) · **Severity: Medium**
**Status: FIXED 2026-10-25** (uncommitted) — `script-src` is now allowlist-only:
`'unsafe-eval'` and `'unsafe-inline'` are both gone. Takes effect on the next
Vercel deploy.

**Why this is the nonce migration on this stack.** The SPA is static HTML
served straight from Vercel's CDN (`vercel.json` headers are static per
deployment) — the document is never rendered per-request, so there is nowhere
to inject a fresh per-request nonce. The standards-approved equivalent for
static hosting is stricter than a nonce anyway: **zero executable inline
scripts**, so `'unsafe-inline'` has nothing left to allow. The embed audit the
fix called for came back clean:

- `index.html` ships no executable inline `<script>` — only the external
  module entry and a `type="application/ld+json"` data block (CSP-exempt, and
  confirmed unblocked at runtime).
- The Paystack / Crisp / Intercom embeds load as **external `src`-only**
  script tags created from the bundle
  ([src/components/SupportWidgets.tsx](../src/components/SupportWidgets.tsx),
  [src/lib/analytics.ts](../src/lib/analytics.ts)) — no vendor inline
  snippets, no queue stubs, and `window.plausible?.()` calls are guarded.
- React registers listeners programmatically, so there are no inline `on*=`
  handlers or `javascript:` URLs in the shipped HTML.

**Guardrail:** [scripts/check-no-inline-scripts.mjs](../scripts/check-no-inline-scripts.mjs)
is wired into `npm run build` (runs after `vite build` on every deploy) and
fails the build on executable inline scripts, inline event handlers, or
`javascript:` URLs in any shipped HTML, and cross-checks that `vercel.json`'s
`script-src` still refuses `'unsafe-inline'` / `'unsafe-eval'`. If inline is
ever unavoidable again, the path is a sha256 hash or an Edge-Middleware nonce
that rewrites the HTML per request — never `'unsafe-inline'`.

**Verified** against the real production bundle served with the exact
deployed header: home + `/pricing` deep link render, lazy route chunks and
the Plausible external script load (200), and a deliberately injected inline
script is refused by CSP (the only violation in the console — enforcement is
live).

The CSP is otherwise tight (HSTS preload, `frame-ancestors 'none'`,
`object-src 'none'`, narrow `connect-src`, `base-uri 'self'`), but
`script-src 'self' 'unsafe-inline' 'unsafe-eval'` means any future HTML
injection (a bug in a third-party widget, an HTML rendering path, a
dependency) immediately becomes script execution. No nonce/hash is used.

**Fix:** drop `'unsafe-eval'` first (only dev tooling needs it), then move to
nonce-based `'unsafe-inline'` removal once Paystack/Crisp/Intercom embeds are
audited. Also drop the deprecated `X-XSS-Protection` header (no-op today).

**Second pass, 2026-10-25 — live-verified on Vercel preview**
(`propreel-jli8i1blt-futuretravel-5761s-projects.vercel.app`; production
promotion pending): the deprecated `X-XSS-Protection` header is gone, and
`style-src` no longer uses `'unsafe-inline'` either — the inline `<style>`
reset in `index.html` is allowed by hash:
`style-src 'self' 'sha256-XhB/sT1NFZiND03EBI02AuLnkpCY2zNyXLrK3A24IXo='
https://client.crisp.chat`. The build guard hash-verifies every inline
`<style>` block against the CSP, so a stale hash fails the deploy and the
failure message prints the new hash to paste. Verified in-browser under the
enforced header: the block's rules apply (body margin reset, `#root` fills the
viewport) with zero violations, while an injected un-hashed `<style>` is
refused. Confirmed against the live preview headers: `X-XSS-Protection` is
absent, `style-src` carries the hash and no `'unsafe-inline'`, the hash block
applies, and BOTH injected probes (inline `<script>`, un-hashed `<style>`)
are refused. The CSP also correctly blocks Vercel's own preview-toolbar
script (`vercel.live/_next-live/…`) — third-party injection is refused even
by the deployment platform itself. Nothing else needs style-src coverage — the app sets styles via
React's CSSOM `style` prop (not CSP-gated) and has no
`dangerouslySetInnerHTML` or `style="…"` attributes anywhere in `src/`.

**If a chat widget is ever enabled** (Admin → Integrations: Crisp/Intercom),
its outer-document styling may need `style-src-attr 'unsafe-inline'` or the
vendor's documented directives — widgets are currently disabled in
production (verified in the live network log), and their chat UIs run inside
their own iframes (governed by their own CSP, not ours).

### L-1 · Admin API-key route echoes submitted secrets back to the browser
**File:** [lib/userRoutes/admin.ts](../lib/userRoutes/admin.ts) (≈L160) · **Severity: Low**
**Status: FIXED 2026-10-25** (uncommitted) — the response returns
`updatedKeys` (names only); the admin panel composes the copyable `.env`
block locally from its own form state, so submitted values are write-only.

`adminApiKeysRoute` responds with `envLines: "KEY=value…"` for every submitted
secret so the admin UI can offer a copyable `.env` block. The values round-trip
into the browser DOM (and any proxy/extension logging). Admin-gated
(`requireAdminSession`) and allow-listed field names, but secrets should be
write-only: return `{ key: ok }` per field and never the value.

### L-2 · Public `/api/leads` POST endpoints have no rate limiting
**File:** [api/leads.ts](../api/leads.ts) · **Severity: Low**
**Status: FIXED 2026-10-25** (uncommitted) — the anonymous POSTs (`demo`,
`referral`, `review`, `contact`) are throttled 10/action/IP/hour via
`consumeRateLimit`, on top of demo's stricter 1/day counter.

**Extra finding while fixing (worse than L-2, now fixed):** the legacy
`agency_invite` and `agency_accept_pending` POSTs were not just unthrottled —
they were **unauthenticated state-changes**, trusting the body's
`inviter_user_id` / `user_id` blindly. Anyone could add arbitrary existing
users to an arbitrary agency (`updateUser(…, {agencyId})`) or force-join a
user to a pending invite. Both are now `requireOwner`-gated (the callers —
the agency owner's invite form and the sign-in/session-restore flow — always
send the signed-in user's own id, so real flows are unaffected).
Regression coverage: [scripts/_leads_admin_hardening_test.ts](../scripts/_leads_admin_hardening_test.ts)
(12 assertions, all passing).

### L-3 · Worker CORS is `allow_origins=["*"]` with `allow_credentials=True`
**File:** [modal/app_propreel_minimax.py](../modal/app_propreel_minimax.py) (≈L60) · **Severity: Low**
**Status: FIXED 2026-10-25** (uncommitted) — explicit origin allow-list
(www + apex + the Vercel prod alias + localhost dev), an anchored regex for
`*.vercel.app` previews, and the middleware's error responses no longer hand a
blanket `ACAO: *` to arbitrary origins.

An invalid combination per the CORS spec (browsers reject credentialed
wildcard responses) and it invites any site to call the worker cross-origin
with a stolen token. Restrict to the real app origins
(`https://www.propreel.co.za`, Vercel previews, localhost dev).

### L-4 · `eval()` on ffprobe-derived text in the FlashVSR endpoint
**File:** [modal/flashvsr_endpoint.py](../modal/flashvsr_endpoint.py) (≈L186) · **Severity: Low**
**Status: FIXED 2026-10-25** (uncommitted) — replaced by `_parse_fps()`, which
parses `num/den` by division with the same 24 fps fallback. Regression coverage:
[scripts/_worker_hardening_test.py](../scripts/_worker_hardening_test.py)
(28 assertions, all passing).

`float(eval(_fps))` parses `r_frame_rate` out of an ffprobe CSV of a
user-supplied video. Today the value is emitted by ffmpeg itself (num/den), so
it is not directly attacker-controlled — but `eval` over anything derived from
an uploaded file is one refactor away from remote code execution on an A100.
Replace with `a, b = _fps.split('/'); float(a)/float(b)`.

### L-5 · Dependency vulnerabilities (`npm audit`, 2026-10-25)
**Severity: Low–Moderate** · updated after `npm audit fix` (2026-10-25)

**Fixed by the non-breaking `npm audit fix`:** vite 6.4.3 → 6.4.5 (all five of
its advisories gone, incl. the `launch-editor` highs), source-map-js 1.2.1 →
1.2.2 (high gone), react-router(-dom) → 6.30.6 (latest 6.x). Totals went
10 → 8 findings and 4 → 2 highs (both remaining highs are dev-only). Verified:
`tsc --noEmit`, `vite build` on the new vite, and both hermetic test suites.

**Majors taken 2026-10-25:** react-router-dom 6.30.6 → **7.18.4** (clears both
react-router advisories — the open-redirect via backslash in `<Link>`/
`useNavigate` and the `deserializeErrors()` constructor injection; zero source
changes needed, the declarative API surface is identical in v7) and uuid
9.0.1 → **14.0.3** (`@types/uuid` removed — v14 bundles its own types; note the
npm `uuid` package turns out to be imported NOWHERE in the TS codebase, so it
could also just be deleted). Verified: `tsc --noEmit`, `vite build`, all three
hermetic suites, and a browser smoke (home renders, `<Link>` client-side
navigation and deep links work on v7). `npm audit --omit=dev` now reports
**0 vulnerabilities**.

**Remaining — dev tooling only (not shipped to the site):** `@vercel/node`
(high) + `@vercel/static-config`, path-to-regexp (high), ajv, esbuild — fix is
`@vercel/node@27` (major).

### L-6 · Deliberate, documented soft spots (accepted risk — verify intent)
- **Reusable confirm/reset tokens within TTL** ([lib/auth.ts](../lib/auth.ts)):
  email-confirm (24 h) and password-reset (1 h) links are not single-use, by
  design, so mail-scanner prefetch cannot burn them. Residual risk: a leaked
  reset link works for the full hour. Mitigated by "reset kills all sessions".
  Acceptable; keep the comment trail intact.
- **Unauthenticated worker docs surface**: `/docs`, `/openapi.json`, `/probe`
  are token-exempt, exposing the API schema to anyone with the URL. Minor.
- **Webhook selftest `keyPrefix`**: the `action=selftest` probe (Bearer
  CRON_SECRET) returns the first 8 chars of `PAYSTACK_SECRET_KEY` — harmless
  to an actor who already holds CRON_SECRET, but needless.

---

## Verified-solid controls (no action needed)

| Area | What holds up |
|---|---|
| Passwords | scrypt (N=16384) per-user salt, `timingSafeEqual` compare ([lib/auth.ts](../lib/auth.ts)) |
| Sessions | opaque 256-bit tokens server-side in DynamoDB; HttpOnly + SameSite=Lax + Secure cookie; 30-day TTL with lazy expiry; trial-locked accounts invalidate sessions |
| IDOR | `requireOwner` / `requireAdminSession` used consistently across `api/*` and `lib/userRoutes/*`; admin identity always from session, never from payload; provisioning POST is admin-only (blocks role=ADMIN minting) |
| Profile writes | field whitelist + server-side shape enforcement (agent branding capped/whitelisted) |
| Payments | Paystack HMAC-SHA512 verified over raw wire bytes with 4 re-serialisation candidates + `timingSafeEqual`; **awaited** (the historic "un-awaited Promise always truthy" bug is documented and fixed); top-level event idempotency + `pay_<reference>` markers + `addCredits` event locks = no double-credit; upgrade/activation paths amount-checked (`amount_mismatch` → manual review) |
| Job pricing | browser cannot set prices: `job_token` mint charges via `lib/renderPricing`, single-use (S3 conditional-put claim), v3 tokens bind the paid FlashHead script hash |
| Rate limits | login (ip+email), register, forgot-password, 2FA, resend, token mints (ip+uid, atomic ADD), music presign/verify — all `consumeRateLimit` backed |
| Cron | fail-closed `CRON_SECRET` Bearer (old spoofable `x-vercel-cron` fallback removed) + once-per-day run lock |
| S3 | `media_sign` enforces `uploads/<caller.id>/` prefix + exact bucket; invoices streamed behind `requireOwner`; buckets private; 7-day presigned links |
| OAuth (Google) | state nonce bound to HttpOnly cookie (CSRF), `redirect` restricted to same-site `/path` (blocks `//host`), verified-email requirement |
| Secrets | no `.env` in repo, `.vercelignore` excludes it; client bundle carries only `VITE_` public config; `serviceKeys.ts` is name-only catalog; pre-commit secret scanner ([scripts/precommit-secret-scan.sh](../scripts/precommit-secret-scan.sh)); CI injects E2E creds via GitHub Secrets and skips when absent |
| Injection/XSS | no `dangerouslySetInnerHTML`, no markdown→HTML path (blog posts are structured blocks), no client `eval`; DynamoDB expressions parameterised |
| Headers | HSTS preload, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy, tight `connect-src` |

---

## Recommended order of work

1. ~~**H-1** — session-gate + rate-limit `/api/paystack/verify`, stop returning
   balances to non-owners.~~ **Done 2026-10-25** — deploy to take effect.
2. ~~**M-1** — fail-closed worker auth on paid scopes.~~ **Done 2026-10-25** — deploy `propreel-render` to take effect.
3. ~~**M-2** — drop `'unsafe-eval'` from CSP now.~~ **Done 2026-10-25** —
   nonce migration for `'unsafe-inline'` still open; deploy to take effect.
4. ~~**L-5** — `npm audit fix` for react-router + vite, plus the majors.~~
   **Done 2026-10-25** — production audit is clean; only dev-tooling majors
   remain.
5. ~~**L-1/L-2** — secret echo on the admin API-keys route, lead rate limits,
   worker CORS, ffprobe `eval`.~~ **All done 2026-10-25** — L-1/L-2 + the
   agency-invite gates deploy with Vercel; L-3/L-4 with `propreel-render` +
   `propreel-flashvsr`.
