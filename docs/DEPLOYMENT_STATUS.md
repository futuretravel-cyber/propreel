# PropReel — Deployment Status

**Last updated:** 28 October 2026 — billing/credit audit fixes deployed
(Vercel `propreel-wsgxjbj9o`; Modal unchanged — no worker edits). See the
28 Oct section below.

26 October 2026 — full working tree deployed (listing-fetch
import + cost display, agency white-label header logo, showcase gallery video
reels, plus the dark-theme / language-gate / responsive / photo-swap commits).
Vercel `propreel-72h14yymg`; Modal `propreel-render` redeployed and
health-checked 200. The 25 October 2026 security-audit hardening (Modal
worker fail-closed auth + CORS allow-list, CSP without `'unsafe-inline'`, gated
`/api/paystack/verify`, rate-limited `/api/leads`, no secret echo from admin
API-keys). Details + live-verification log:
[`docs/security-audit-2026-10-25.md`](security-audit-2026-10-25.md). Deployed
from an isolated tree of the security fixes only — the in-progress
listing-fetch / agency-logo work was NOT live then — both went live 26 Oct.

Previous (3 October 2026): **Supabase fully retired**; AWS DynamoDB is the only database, auth is first-party (`lib/auth.ts`), emails via Resend (`lib/email.ts`)

## 28 Oct 2026 — billing/credit audit fixes deployed (verified live)

- Vercel `propreel-wsgxjbj9o` (quick-deploy.sh; stealth + CSP guards green,
  1 superseded deployment retired) ships the full 28 Oct tree: every fix from
  [`docs/billing-credit-audit-2026-10-27.md`](billing-credit-audit-2026-10-27.md).
  Modal `propreel-render` not redeployed — no worker changes today.
- **F-1 prevention:** `createSubscription` claims
  `renew_<user>_<activation month>` before granting, so the activation grant
  IS that month's allowance — neither a mid-month cron run nor a late renewal
  webhook can stack a second one.
- **F-2 dunning emails are real:** immediate payment-failed at `charge.failed`
  (episode-start only), day-1/3/7/14 reminders, day-21 cancellation, and
  recovery notices. Recovery is now sent whenever ANY payment clears an
  active episode — hosted-checkout `/verify`, `charge.success` (incl. renewal
  invoices) and `subscription.renewal` — through one shared
  `clearDunningAndNotify` (`lib/dunning.ts`), exactly-once per episode via a
  claimed `recovery_<user>_<episodeStart>` marker. Renewals now actually
  close the episode (previously a fixed card's successful renewal stayed in
  dunning and could be cancelled at day 21 despite paying).
- **One-off purchase failures no longer enter dunning:** `charge.failed` /
  `invoice.payment_failed` classify the charge first — credit packs,
  agency-pool top-ups and upgrade-checkout failures are acknowledged without
  ever creating `paymentFailure` (no retries, no renewal-failure emails, no
  day-21 cancellation over a failed top-up). The sweep additionally skips
  users without an ACTIVE-ish subscription (no stray charge, no cancel).
- **F-3:** all 8 `PAYSTACK_PLAN_*` codes confirmed against real ZAR Paystack
  plans matching live `pricing_config` (`scripts/_paystack_plan_codes_check.ts`).
- **F-4 cleanup:** the 10 billing-e2e test accounts deleted and the +5,450
  October allowance over-grant reversed with ledger'd deducts
  (`scripts/_billing_cleanup.ts --apply`, strict guards).
- **Post-deploy smoke (28 Oct, live):** site 200 · unsigned webhook POST 401 ·
  anonymous `/api/paystack/verify` 401 · webhook accept-path selftest
  `pass: true` (compact / Python-spaced / non-ASCII signatures accepted,
  forged 401, `charge.success` handled then deduped). Pre-deploy evidence:
  `scripts/_dunning_email_e2e.ts` **34/34** against the same code (real
  handler + sweep + Resend; Paystack charge/verify calls stubbed, no money
  moved), `npx tsc --noEmit` clean.

## 27 Oct 2026 — stealth hardening + translate pricing deployed (verified live)

- **Modal `propreel-render`** redeployed (`App deployed in 5.67s`; `/health`
  200, v2.1.0, `avatar_video` + `upscale_enabled`): ships the avatar job-kind
  schema migration (legacy job tokens and credit history normalize
  server-side to the `avatar` vocabulary) and scrubbed error strings. Hermetic
  suite green before deploy, incl. the 8 avatar-scope cases. `propreel-flashvsr`
  skipped — no changes.
- **Vercel `propreel-ntoq5yk9x`** (quick-deploy.sh; 8 superseded deployments
  retired) ships the full 27 Oct tree: translate credit pricing (1 credit via
  `?action=deduct` kind `TRANSLATE`, **first 3 free on a running trial** —
  `TRANSLATE_CREDITS` / `TRIAL_FREE_TRANSLATES`; `?action=translate_quote`
  feeds the mismatch dialog label showing cost + remaining balance side by
  side), the build-time stealth guard, the generic `/status` page +
  robots/sitemap scrub, and the env-inline fix (`VITE_MODAL_ENDPOINT` now
  first-party in `.env`/`.env.local` — the guard fails any build whose env
  inlines a vendor URL).
- **Build guards now run on the Vercel builder**: `npm run build` runs
  `scripts/check-bundle-stealth.mjs` (vendor/model names in bundle CONTENTS or
  CHUNK FILENAMES fail the deploy) + the CSP guard. First deploy attempt died
  `MODULE_NOT_FOUND` because `.vercelignore`'s `scripts/*` re-include list
  shipped only the CSP guard — `.vercelignore` now re-includes both.
- **Live-verified:** stealth guard over the SERVED bundle — 77 text assets
  incl. 70 lazy chunks, contents + filenames: 0 vendor/model strings;
  `/status` leak grep empty (no AWS/Modal/provider names);
  `translate_quote` answers 401 (auth-gated); `/w/health` through
  `api.propreel.co.za` healthy. Admin Detail + Analytics rows and the billing
  history label legacy rows in the canonical vocabulary (server-side
  normalization).
- **Workstation note:** `modal deploy` on Windows needs `PYTHONUTF8=1` (the
  CLI prints `✓`, which crashes a cp1252 console with a charmap error).

## Production

| Item | Value |
|---|---|
| URL | https://propreel-xi.vercel.app (auto-aliases latest deploy) |
| Project | `futuretravel-5761s-projects/propreel` (`prj_WoZmzg7PbpE7OdIqRUtm8TA7fmbp`) |
| Repo | https://github.com/futuretravel-cyber/propreel.co.za (`main`) |
| Database | **AWS DynamoDB** (af-south-1) — `lib/db-dynamodb.ts`, all tables incl. `propreel-sessions` |
| Rollback | Supabase project deleted 3 Oct 2026 — no rollback; restore from DynamoDB backups only |
| Region | eu-west-1 (Supabase), iad1 (Vercel functions) |
| Plan | Vercel Hobby — 12-function cap, currently **11** functions |

## Cutover verification (2 Oct 2026, all passed)

- Final pre-cutover sync: 2 users / 11 ledger / 4 settings — counts matched
- Probe signup via live API → row + bonus ledger landed **in Supabase only** (DynamoDB: zero rows), then cleaned
- Settings-backed GET (`feature_flags`), cron status, homepage, bundle all healthy

## Verified working (smoke-tested live)

- Static site: HTTP 200
- `GET /api/users?email=…` → `{"error":"User not found"}`
- Cron **without** secret → HTTP 401; **with** `CRON_SECRET` → HTTP 200
- E2E signup → user in Supabase + 5-credit signup bonus
- Credit + agency E2E suites pass on both drivers (11/11, 17/17)
- E2E subscription → Paystack plan `PLN_68okgs5e0ge03g6` accepted, status ACTIVE, 130 credits allocated

## Database (AWS DynamoDB, af-south-1, account 619924817943)

9 runtime tables (see `lib/db.ts`): users, credit_transactions, subscriptions,
credit_expiries, agencies, agency_members, reviews, projects, settings.
Legacy (app no longer reads): propreel-credits, propreel-renders — do NOT delete.
IAM: `propreel-app-user` with scoped policy `deploy/aws/propreel-ddb-policy.json`.
Recreate anytime with `npm run create-tables` (idempotent).

## 27 Oct 2026 — first-party API domain live (verified)

The browser now reaches the render worker through **https://api.propreel.co.za/w**
(a Vercel rewrite in `vercel.json` proxying to the worker). No vendor hostname
appears anywhere on the public site any more — verified on the live bundle
(0 occurrences), in the live `connect-src` CSP (the `https://*.modal.run` entry
removed), and in every production build shape (env set or missing).

- Domain `api.propreel.co.za` added to the Vercel project; its DNS record was
  synthesised automatically (the zone runs on Vercel nameservers).
- `src/lib/renderEndpoint.ts` is now the single browser origin definition; its
  vendor fallback is dev-only and dead-code-eliminated from production builds.
  Vercel env: `VITE_MODAL_ENDPOINT=https://api.propreel.co.za/w` (Production).
- Server-side callers (`lib/userRoutes/admin.ts`, `lib/projectReaper.ts`) talk
  to the worker directly (optional `RENDER_WORKER_URL` override) — long calls
  never loop through the proxy.
- AI-writer cap moved 145 s → 115 s in `src/lib/api.ts`: Vercel caps proxied
  responses at 120 s, and `generate_text`'s tail (the description path with
  3 vision photos "previously blew 120 s" per `scripts/ai_writer_e2e.py`)
  would otherwise die as a raw 504. A Modal custom domain (Team plan) removes
  the cap entirely — restore 145_000 if that ever ships.
- Verified live: `/w/probe` answers through the domain, site 200, bundle and
  CSP clean. NOT verified from this machine: an authenticated `generate_text`
  wall-time measurement (`RENDER_API_TOKEN` absent from local `.env`) — run
  `scripts/_ai_writer_proxy_wall.py` after `vercel env pull` to measure the
  proxy vs direct wall for the heavy path.

## 27 Oct 2026 — language-check rate limit deployed (verified)

- Modal `propreel-render` redeployed: `language_check` + `translate` on
  `POST /generate_text` now carry a per-user sliding-window rate limit —
  **30 calls / 10 min** per token uid (client-host fallback for token-less
  callers), HTTP 429 with an actionable message beyond it. The browser is
  fail-open on 429: it skips the advisory language check, never blocks a
  render. Anonymous `/generate_text` is rejected by the fail-closed auth
  middleware before the limiter (confirmed live).
- Companion frontend volume cuts (same feature, `src/lib/useVoiceoverLanguageCheck.ts`):
  verdict caching on (language, text) — session Map + localStorage so
  identical pairs never re-spend a call; check-on-settle (2.5 s quiet window,
  ≤2-word drift over a verified-OK script inherits without a call); translate
  seeds its own verdict so the post-translate re-check is free. Also fixed a
  latent bug where Translate read `.text` off a string return and always
  errored "empty script".
- Verified: 8/8 hermetic checks (FastAPI TestClient against the real handler
  + middleware, LLM call stubbed, zero spend) — first 30 calls pass, 31st is
  429, per-user isolation, both kinds share one bucket, `description` /
  `video_script` unaffected. Deploy receipt green ("App deployed in 6.8 s").
  Authenticated production smoke not run from the workstation
  (`RENDER_API_TOKEN` is not in the local `.env`).

## 26 Oct 2026 — full working tree deployed (verified live)

- Vercel `propreel-72h14yymg`: `www.propreel.co.za` 200; the served bundle
  references all four showcase reels; the 4 mp4s + 4 first-frame posters serve
  200 with correct content types.
- Ships: listing-fetch import + cost display (`/api/listing/extract`,
  ListingLinkChip, CostHeader, Overview credits display), agency white-label
  header logo, dark theme, Video Wizard language gate, tablet/mobile header +
  showcase fixes, showcase photo swaps, showcase gallery video reels.
- Modal `propreel-render` redeployed (health 200, v2.1.0); `propreel-flashvsr`
  deploy skipped — no changes. quick-deploy.sh retired 11 superseded Vercel
  deployments.

## 25 Oct 2026 — security hardening deployed (verified live)

- Vercel production `propreel-5zkbhi8dj`: CSP `script-src` allowlist-only
  (no `'unsafe-inline'`/`'unsafe-eval'`); the build now runs
  `scripts/check-no-inline-scripts.mjs` after `vite build`, so a reintroduced
  inline script fails the deploy instead of shipping.
- Modal `propreel-render` + `propreel-flashvsr`: token auth is fail-closed
  (paid/spend endpoints 401 without a valid token), CORS is an explicit
  origin allow-list, ffprobe `eval()` removed.
- Live-verified: 401s on anonymous `/api/paystack/verify`, `admin_api_keys`,
  `agency_invite`; demo POST 202→429; production browser clean of CSP
  violations with an injected inline script refused.

## Key fixes shipped during deploy

1. API consolidated 15 → 11 functions (`/api/credits?action=…`, `/api/subscriptions?action=…`)
2. Removed `"type": "module"` — Vercel was skipping lib/ bundling (ERR_MODULE_NOT_FOUND)
3. `api/tsconfig.json` forces CommonJS — root tsconfig leaked ESNext into functions
4. `removeUndefinedValues: true` on DynamoDB marshall — undefined optional fields crashed writes
5. Paystack: find-or-create customer before `POST /subscription`
6. Local `tsc` now covers `src api lib scripts` — catches function errors pre-deploy

## Remaining manual steps (dashboard-only)

- [x] **Resend** → domain `propreel.co.za` **Verified 4 Oct 2026** — branded
      sender live, E2E-tested (register + reset both Delivered FROM
      `no-reply@propreel.co.za`; fallback retired).
      **Step-by-step: [`docs/RESEND_DNS_SETUP.md`](RESEND_DNS_SETUP.md)**
- [ ] **Paystack** → Settings → Webhooks: `https://www.propreel.co.za/api/paystack/webhook`
      (**`www` required** — apex 308-redirects to www; endpoint verified live:
      unsigned POST → 401 Invalid signature)
- [x] **DNS at registrar** (verified 3 Oct): apex + `www` resolve, apex → `308` →
      `https://www.propreel.co.za` (site 200). Consider setting `www` as the
      primary domain in Vercel to avoid the redirect hop
- [x] **Stale Vercel env vars pruned** (30 Sep): 17 removed (Firebase, JWT, S3,
      GROK, RENDERFUL, MODAL_API_TOKEN, DATABASE_URL, VITE_API_BASE_URL…);
      production now holds exactly the 17 required vars and was redeployed + smoke-tested
- [ ] **Vercel Hobby caveat:** crons clamped to daily; commercial use needs Pro before launch

## Go-live checklist (test → live mode)

**Full, maintained checklist → [`docs/GO_LIVE_CHECKLIST.md`](GO_LIVE_CHECKLIST.md)**

- [ ] Recreate all 8 Paystack plans in **live mode**; swap `PAYSTACK_PLAN_*` values in Vercel
- [ ] Swap `PAYSTACK_SECRET_KEY` to live key; set webhook URL (`www` host) in live dashboard
- [ ] Rotate any secret that ever appeared in chat (AWS keys, Paystack test keys, Supabase keys)
- [ ] Point-in-time recovery on `propreel-users` (PITR is per-table)
- [ ] Vercel Hobby → Pro (cron clamp + 12-function cap)
- [x] Leftover Supabase env purged from Preview/Development (3 Oct) — only AWS keys remain for PR previews
