# PropReel: AWS DynamoDB → Supabase Migration Guide

The codebase now has a **dual-driver data layer**: every database call goes
through [lib/db.ts](../lib/db.ts), which dispatches to either
[lib/db-dynamodb.ts](../lib/db-dynamodb.ts) (current, default) or
[lib/db-supabase.ts](../lib/db-supabase.ts). Both implement identical
helpers **including the atomic operations** (balance decrements, idempotency
locks), so the credit system behaves exactly the same on either backend.
No API route or frontend code changes — the current API is preserved.

---

## Phase 1 — Create the Supabase project (10 min)

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Name: `propreel-prod`. Region: **eu-central-1 (Frankfurt)** or **eu-west-2 (London)**
   — Supabase has no South African region; London gives the best SA latency.
3. Save the database password somewhere safe.
4. When ready: **Project Settings → API** — copy the **Project URL** and the
   **service_role secret** (NOT the anon key).

## Phase 2 — Create the schema (5 min)

1. Open the Supabase dashboard → **SQL Editor** → New query.
2. Paste the full contents of [supabase/schema.sql](../supabase/schema.sql) → **Run**.
3. Verify: **Table Editor** should list `users`, `credit_transactions`,
   `projects`, `settings`, `agencies`, `agency_members`, `subscriptions`,
   `credit_expiries`, `reviews` — all empty.

## Phase 3 — Set the environment variables (5 min)

Local `.env` (and later Vercel → Settings → Environment Variables):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co   # you already have this
SUPABASE_SERVICE_ROLE_KEY=<service_role secret from Phase 1>
# DO NOT set DB_DRIVER yet — the app stays on DynamoDB until Phase 5.
```

The service key is server-side only (used by `api/` functions and scripts).
Never expose it to the frontend.

## Phase 4 — Migrate the data (10 min)

```bash
set -a; source .env; set +a
npx tsx scripts/migrate_dynamodb_to_supabase.ts
```

This **reads** every DynamoDB table and **upserts** everything into Supabase,
then verifies row counts table-by-table and checks both admin accounts
(`futuretravel@gmail.com`, `ulric@propreel.co.za` — role ADMIN, credits loaded).
It is **read-only on AWS** and idempotent — run it as often as you like; a
final re-run right before cutover catches anything written during testing.

## Phase 5 — Cutover (5 min)

1. Re-run the migration once more (syncs rows written since Phase 4).
2. In Vercel: add `DB_DRIVER=supabase` to **Production** environment variables.
3. **Deployments → Redeploy** the latest production deployment.
4. Smoke-test on the live site:
   - Sign in → dashboard loads (users table).
   - Render a cheap Social-tier video → credits deduct (atomic decrement RPC).
   - Credits page → transaction history shows the ledger rows.
   - `/status` → all green.
5. Watch the next nightly cron (02:00 SAST) in `/status` — expiration +
   auto-topup sweeps write through the same helpers.

**Rollback:** remove `DB_DRIVER` from Vercel and redeploy — the app returns
to DynamoDB instantly. If any data was written to Supabase during the trial
period, re-run the Phase 4 migration **in reverse is not supported** — instead
delete the Supabase rows and re-run the migration from DynamoDB (source of
truth) before re-cutting over.

## Phase 6 — Delete the AWS database (Git Bash) — ⚠️ ONLY after 1 week stable

> **Irreversible.** Before deleting: confirm `/status` green for a week, the
> nightly cron has run on Supabase, and you have the Phase 4 migration output
> as a record. Optionally keep a final JSON backup (command below) — it is
> your only recovery path afterwards.

Optional final backup (Git Bash, writes local JSON per table):

```bash
set -a; source .env; set +a
mkdir -p aws-final-backup
for t in users credit_transactions projects settings agencies agency_members subscriptions credit_expiries reviews; do
  PYTHONUTF8=1 aws dynamodb scan --table-name "propreel-$t" --output json > "aws-final-backup/$t.json" && echo "backed up $t"
done
```

Delete the tables (all nine, one command each):

```bash
set -a; source .env; set +a
for t in users credit_transactions projects settings agencies agency_members subscriptions credit_expiries reviews; do
  PYTHONUTF8=1 aws dynamodb delete-table --table-name "propreel-$t" && echo "deleted propreel-$t"
done
```

Verify nothing is left:

```bash
PYTHONUTF8=1 aws dynamodb list-tables --output json
```

(`TableNames` should be `[]` or only contain unrelated tables.)

**Do NOT delete:** the S3 buckets (they hold all videos/images/invoices —
unrelated to this migration), the IAM user (S3 still needs it), or the
Modal deployment. Only DynamoDB is replaced by Supabase.

After deletion, remove `AWS_DYNAMODB_*`-style leftovers only if you want —
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` must STAY (S3).

## What was migrated and how it maps

| DynamoDB | Supabase | Key |
|---|---|---|
| propreel-users | users | id |
| propreel-credit-transactions | credit_transactions | userId + createdAt |
| propreel-projects | projects | userId + id |
| propreel-settings | settings | id |
| propreel-agencies | agencies | id |
| propreel-agency-members | agency_members | agencyId + userId |
| propreel-subscriptions | subscriptions | userId |
| propreel-credit-expiries | credit_expiries | userId + expiresAt |
| propreel-reviews | reviews | id |

Every item is stored whole in a `data jsonb` column (identical shapes, zero
field mapping) with hot attributes as generated columns for indexed filters.
Atomic balance math runs through Postgres functions (`dec_if_enough`,
`inc_value`) — the exact semantics of the DynamoDB conditional updates.

## What stays on AWS after cutover

- **S3** (`propreel-raw-assets`, `propreel-video-outputs-sa`) — videos, images, invoices.
- **Supabase Auth** — was already Supabase (Google OAuth + email).
- **Modal** — the render worker (stateless).
