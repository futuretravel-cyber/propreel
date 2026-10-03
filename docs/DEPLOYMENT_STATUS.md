# PropReel — Deployment Status

**Last updated:** 3 October 2026 — **Supabase fully retired**; AWS DynamoDB is the only database, auth is first-party (`lib/auth.ts`), emails via Resend (`lib/email.ts`)

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

## Key fixes shipped during deploy

1. API consolidated 15 → 11 functions (`/api/credits?action=…`, `/api/subscriptions?action=…`)
2. Removed `"type": "module"` — Vercel was skipping lib/ bundling (ERR_MODULE_NOT_FOUND)
3. `api/tsconfig.json` forces CommonJS — root tsconfig leaked ESNext into functions
4. `removeUndefinedValues: true` on DynamoDB marshall — undefined optional fields crashed writes
5. Paystack: find-or-create customer before `POST /subscription`
6. Local `tsc` now covers `src api lib scripts` — catches function errors pre-deploy

## Remaining manual steps (dashboard-only)

- [ ] **Resend** → add & verify domain `propreel.co.za` (DKIM/SPF TXT records
      at the registrar, zadns) — until then only `onboarding@resend.dev` →
      the account address can receive mail
- [ ] **Paystack** → Settings → Webhooks: `https://propreel.co.za/api/paystack/webhook`
      (use the vercel.app URL until DNS is live)
- [ ] **DNS at registrar:** A `@` → `76.76.21.21`, CNAME `www` → `cname.vercel-dns.com`;
      then attach both domains in Vercel → Project → Settings → Domains
- [x] **Stale Vercel env vars pruned** (30 Sep): 17 removed (Firebase, JWT, S3,
      GROK, RENDERFUL, MODAL_API_TOKEN, DATABASE_URL, VITE_API_BASE_URL…);
      production now holds exactly the 17 required vars and was redeployed + smoke-tested
- [ ] **Vercel Hobby caveat:** crons clamped to daily; commercial use needs Pro before launch

## Go-live checklist (test → live mode)

- [ ] Recreate all 8 Paystack plans in **live mode**; swap `PAYSTACK_PLAN_*` values in Vercel
- [ ] Swap `PAYSTACK_SECRET_KEY` to live key; update webhook URL in live dashboard
- [ ] Rotate any secret that ever appeared in chat (AWS keys, Paystack test keys, Supabase keys)
- [ ] Point-in-time recovery on `propreel-users` (PITR is per-table)
