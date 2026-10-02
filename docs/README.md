# PropReel Documentation

The current architecture in one paragraph: a **React + Vite + Tailwind frontend**
and **Vercel serverless TypeScript functions** in `api/` (12-function Hobby cap —
extend existing functions rather than adding new ones). Data lives in
**DynamoDB today**, behind a driver switch in `lib/db.ts` that can move it to
**Supabase Postgres** without touching a single API route. **Supabase Auth** handles
sign-in, **AWS S3** stores every file, **Modal + fal.ai** render video, and
**Paystack** takes payments.

## Documents

| Document | What it covers |
|---|---|
| [SUPABASE_MIGRATION.md](SUPABASE_MIGRATION.md) | Moving the database from DynamoDB to Supabase — 6 phases, including the gated AWS deletion |
| [ARCHITECTURE_STORAGE_DECISION.md](ARCHITECTURE_STORAGE_DECISION.md) | Why all storage is AWS S3 (and why Supabase Storage is not used) |
| [GITHUB_VERCEL_DEPLOYMENT.md](GITHUB_VERCEL_DEPLOYMENT.md) | Push-to-`main` → Vercel deployment flow |
| [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) | Current production status and live endpoints |
| [MODAL_ENDPOINT_SETUP.md](MODAL_ENDPOINT_SETUP.md) | Deploying and configuring the Modal render worker |
| [MODAL_API_URLS.md](MODAL_API_URLS.md) | The two different Modal URLs — a common source of confusion |
| [WEBSITE_IMPROVEMENT_PLAN.md](WEBSITE_IMPROVEMENT_PLAN.md) | Prioritised (P0 → P3) improvement plan from a live-site audit |
| [WEBSITE_IMPROVEMENT_SUGGESTIONS.md](WEBSITE_IMPROVEMENT_SUGGESTIONS.md) | Longer-term product and business ideas |

## Verification ritual

Before considering any change done:

```bash
npx tsc --noEmit                          # frontend
npx tsc --noEmit -p api/tsconfig.json     # api/ + lib/
npm run build
```

## Removed architecture (historical)

An earlier attempt built the product as an Express + Prisma + PostgreSQL
monorepo (`legacy-monorepo/`) and shipped a shell-script deployment package
(`deploy/`, `deploy.sh`) targeting cPanel. Both were abandoned and have been
removed: Vercel serverless is the only backend, and its scripts contradicted the
live data layer (they prescribed a different Postgres schema, which is what
previously left conflicting tables in the Supabase project).
