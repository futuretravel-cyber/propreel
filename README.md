# PropReel - AI Property Video Platform

Create stunning property videos instantly with AI. Built for South African estate agents.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS 4
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: AWS DynamoDB (af-south-1) — the only backend
- **Authentication**: First-party email/password sessions in DynamoDB (`lib/auth.ts`) with confirmation/reset emails via **Resend**
- **Payments**: Paystack
- **Video Rendering**: Modal + Fal.ai (Minimax Hailuo-02)
- **File Storage**: AWS S3

## Data Layer

All database access goes through `lib/db.ts` → `lib/db-dynamodb.ts`
(AWS DynamoDB). Every helper — including the atomic credit operations
(conditional balance decrements, idempotency locks) — lives there.

Auth is first-party too: `lib/auth.ts` (scrypt passwords, opaque session
cookies, DynamoDB `propreel-sessions` table) and `lib/email.ts` (Resend for
email confirmation + password resets). Supabase was fully removed on
3 Oct 2026; pricing tiers and monthly/annual plan prices are served from the
`settings/pricing_config` row (seed with `npx tsx scripts/seed_pricing_config.ts`).
File storage is AWS S3; see [docs/ARCHITECTURE_STORAGE_DECISION.md](docs/ARCHITECTURE_STORAGE_DECISION.md).

> A previous Express + Prisma + PostgreSQL monorepo attempt (and its deployment
> scripts) was removed — `api/` + `lib/` on Vercel is the only backend.

## AWS Setup

### 1. Create IAM User

1. Go to AWS Console → IAM → Users → Create user
2. Name: `propreel-app`
3. Attach policies:
   - `AmazonDynamoDBFullAccess`
   - `AmazonS3FullAccess` (for file storage)
4. Create access key and save the credentials

### 2. Create DynamoDB Tables

Option A: Auto-create (default for development)
```bash
# Set in .env
DYNAMODB_TABLES_AUTO_CREATE=true
```

Option B: Pre-create tables manually

```bash
# Users table
aws dynamodb create-table \
  --table-name propreel-users \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region af-south-1

# Credit transactions table
aws dynamodb create-table \
  --table-name propreel-credit_transactions \
  --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH AttributeName=createdAt,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region af-south-1

# Subscriptions table
aws dynamodb create-table \
  --table-name propreel-subscriptions \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region af-south-1

# Credit expiries table
aws dynamodb create-table \
  --table-name propreel-credit_expiries \
  --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=expiresAt,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH AttributeName=expiresAt,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region af-south-1
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `AWS_ACCESS_KEY_ID` - AWS IAM access key
- `AWS_SECRET_ACCESS_KEY` - AWS IAM secret key
- `RESEND_API_KEY` - Resend API key (confirmation + password-reset emails)
- `PAYSTACK_SECRET_KEY` - Paystack secret key
- `VITE_MODAL_ENDPOINT` - Modal render endpoint

## Authentication & Email (first-party, Supabase-free)

- Signup → `POST /api/users?action=auth_register` provisions the DynamoDB row
  and emails a confirmation link (Resend, `EMAIL_FROM` defaults to
  `PropReel <no-reply@propreel.co.za>`).
- **Resend domain verification**: until `propreel.co.za` is added at
  <https://resend.com/domains> with the DKIM/SPF TXT records published at the
  registrar (zadns), Resend only accepts `onboarding@resend.dev` → the account
  address. Verify the domain for real traffic.
- Sessions are HttpOnly cookies (`propreel_session`) backed by the
  `propreel-sessions` table; reset links live at `/forgot-password`.
- **Temporary (trial) accounts** (`lib/trial.ts`): the signup form offers an
  opt-in 7-day trial — the row gets `trialExpiresAt`, riding on the standard
  5-credit signup bonus. While it runs, a dashboard banner shows days left and
  the 9am cron emails a daily reminder. Day 7 without a subscription → the
  nightly sweep soft-deletes (`trialEndedAt`, sessions revoked, sign-in locked
  with `403 TRIAL_EXPIRED`); signing in again with the correct password
  reactivates browse-only access, but rendering stays blocked
  (`deductCredits` gate) until they subscribe. Any subscription wipes all
  trial fields (`createSubscription`), and rows still unsubscribed 30 days
  after expiry are purged (projects + sessions + user row).

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

## API Endpoints

All of these are single serverless functions with an `action` query parameter.

### Credit Management
- `POST /api/credits?action=deduct` - Deduct credits from user
- `POST /api/credits?action=add` - Add credits to user
- `POST /api/credits?action=refund` - Refund a failed job
- `POST /api/credits?action=transfer` - Transfer credits between users
- `POST /api/credits?action=gift_email` - Gift credits by recipient email
- `GET /api/credits?action=report` - Get credit usage report

### Subscriptions
- `POST /api/subscriptions?action=create` - Create subscription
- `POST /api/subscriptions?action=checkout` - Start a Paystack checkout
- `POST /api/subscriptions?action=upgrade` - Prorated plan upgrade
- `POST /api/subscriptions?action=cancel` - Cancel subscription
- `GET /api/subscriptions?action=pricing` - Current plan pricing

### Payments
- `POST /api/paystack/initialize` - Initialize Paystack payment
- `POST /api/paystack/verify` - Verify payment
- `POST /api/paystack/webhook` - Paystack webhook (receives events)

### Cron Jobs (Vercel Cron)
- `POST /api/cron/allocate-monthly-credits` - Allocate monthly credits (1st of month)
- `POST /api/cron/process-expired-credits` - Process expired credits + trial sweep: soft-delete day-7 trials, purge after 30-day retention (daily)
- `POST /api/cron/send-expiry-notifications` - Daily trial "days left" reminder emails (daily 9am)

## Deployment to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Vercel Environment Variables

Add these in Vercel Dashboard → Project Settings → Environment Variables:

**Production:**
- All `.env` variables above
- `VERTEX_REGION=af-south-1`

**Preview:**
- Same as production but with test API keys

### Vercel Cron Configuration

The `vercel.json` file includes cron job schedules:
- Monthly credit allocation: 1st of every month at 00:00
- Daily credit expiry processing: Every day at 00:00
- Daily expiry notifications: Every day at 09:00

## Database Schema (DynamoDB)

### Users Table (`propreel-users`)
```
PK: id (String)
Attributes:
  - email: String
  - fullName: String
  - role: String (AGENT | AGENCY_OWNER | ADMIN)
  - credits: Number
  - creditExpiries: Array of { amount, expiresAt, source }
  - subscription: Object or null
  - autoTopup: Object { enabled, threshold, amount }
  - agencyId: String or null
  - agencyName: String or null
  - passwordHash: String (scrypt, server-side only — never sent to clients)
  - emailVerified: Boolean
  - trialExpiresAt: String (ISO date, opt-in 7-day trial — see lib/trial.ts)
  - trialEndedAt / trialReactivatedAt / trialLastReminderDate: String (trial lifecycle)
  - createdAt: String (ISO date)
```

### Credit Transactions Table (`propreel-credit_transactions`)
```
PK: userId (String)
SK: createdAt (String, ISO date)
Attributes:
  - id: String
  - amount: Number (positive for additions, negative for deductions)
  - type: String
  - description: String
  - metadata: Object
```

### Subscriptions Table (`propreel-subscriptions`)
```
PK: userId (String)
Attributes:
  - planId: String
  - cycle: String (MONTHLY | ANNUAL)
  - status: String
  - currentPeriodStart: String
  - currentPeriodEnd: String
  - nextChargeAmount: Number
  - paystackSubscriptionCode: String
```

### Credit Expiries Table (`propreel-credit_expiries`)
```
PK: userId (String)
SK: expiresAt (String, ISO date)
Attributes:
  - amount: Number
  - source: String
```

## Credit System

### Credit Expiration (FIFO)
- Subscription credits: Expire at end of billing period (rollover enabled)
- Purchased credits: Never expire (365 days inactivity timeout)
- Bonus credits: 90 days
- Gift credits: 180 days

### Plans

| Plan | Monthly (ZAR) | Annual (ZAR) | Credits/Month |
|------|---------------|--------------|---------------|
| Starter | R129 | R1,320/yr | 110 |
| Professional | R589 | R6,720/yr | 520 |
| Premium | R1,270 | R14,400/yr | 1,150 |
| Agency | R5,000 | R60,000/yr | 4,300 |

These numbers live in `src/lib/constants.ts` (`PLANS`); update them there first.

### Video Tiers

| Tier | Processing | Resolution | Images (30s/60s/90s) | Credits |
|------|------------|------------|----------------------|---------|
| Essential | Local FFmpeg | 1080p | 6 / 12 / — | 5 / 10 |
| Social | AI (hailuo-02-standard) | 512p | 6 / 12 / 18 | 34 / 60 / 89 |
| Cinematic | AI (hailuo-02-standard) | 768p | 6 / 12 / 18 | 47 / 63 / 95 |
| Premium | AI (hailuo-02-standard + FlashVSR) | 1080p | 6 / 12 / 18 | 60 / 80 / 100 |
| Budget | AI (hailuo-02-standard) | 512p / 768p | 5 (30s only) | 20 / 34 |

The tier table in `lib/videoTiers.ts` is authoritative — the client, the modal worker and the pricing docs all read it.

## Environment Variables Summary

### Required
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (default: af-south-1)
- `RESEND_API_KEY`
- `PAYSTACK_SECRET_KEY`
- `VITE_MODAL_ENDPOINT`

### Optional
- `CRON_SECRET` - Secures cron endpoints
- `DYNAMODB_TABLES_AUTO_CREATE` - Auto-create tables on first use
- `VITE_API_URL` - Backend API URL (for production)
- `VITE_APP_URL` - Frontend URL
