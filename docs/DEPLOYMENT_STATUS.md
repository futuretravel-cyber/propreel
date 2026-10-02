# PropReel — Deployment Status

**Last updated:** 30 September 2026 — Git auto-deploy from GitHub now connected

## Production

| Item | Value |
|---|---|
| URL | https://propreel.vercel.app (auto-aliases latest deploy) |
| Project | `futuretravel-5761s-projects/propreel` (`prj_WoZmzg7PbpE7OdIqRUtm8TA7fmbp`) |
| Repo | https://github.com/futuretravel-cyber/propreel.co.za (`main`) |
| Region | af-south-1 (AWS DynamoDB), iad1 (Vercel functions) |
| Plan | Vercel Hobby — 12-function cap, currently **11** functions |

## Verified working (smoke-tested live)

- Static site: HTTP 200
- `GET /api/users?email=…` → `{"error":"User not found"}`
- Cron **without** secret → HTTP 401; **with** `CRON_SECRET` → HTTP 200
- E2E signup → user in DynamoDB + 5-credit signup bonus
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

- [ ] **Supabase** → Authentication → URL Configuration: Site URL `https://propreel.co.za`;
      Redirect URLs: `https://propreel.co.za/**`, `https://www.propreel.co.za/**`,
      `https://propreel.vercel.app/**`
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
