# PropReel — Deployment Status

**Last updated:** 25 October 2026 — security-audit hardening deployed (Modal
worker fail-closed auth + CORS allow-list, CSP without `'unsafe-inline'`, gated
`/api/paystack/verify`, rate-limited `/api/leads`, no secret echo from admin
API-keys). Details + live-verification log:
[`docs/security-audit-2026-10-25.md`](security-audit-2026-10-25.md). Deployed
from an isolated tree of the security fixes only — the in-progress
listing-fetch / agency-logo work in the working tree is NOT live.

Previous (3 October 2026): **Supabase fully retired**; AWS DynamoDB is the only database, auth is first-party (`lib/auth.ts`), emails via Resend (`lib/email.ts`)

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
