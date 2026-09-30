# PropReel - AI Property Video Platform

Create stunning property videos instantly with AI. Built for South African estate agents.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS 4
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: AWS DynamoDB (primary data storage)
- **Authentication**: Supabase Auth (Google OAuth only)
- **Payments**: Paystack
- **Video Rendering**: Modal + Fal.ai (Minimax Hailuo-02)
- **File Storage**: AWS S3

## Architecture Change

**Previously**: Supabase Postgres for all data storage

**Now**: AWS DynamoDB for all data (users, credits, subscriptions, transactions), Supabase only for Google OAuth authentication.

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
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for server-side)
- `PAYSTACK_SECRET_KEY` - Paystack secret key
- `VITE_MODAL_ENDPOINT` - Modal render endpoint

## Google OAuth Setup (Supabase)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - `https://agcchttiomlbuuycwdgy.supabase.co/auth/v1/callback` (Supabase callback)
   - `http://localhost:3000` (local dev)
4. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google provider
   - Add your Google Client ID and Secret
   - Add redirect URLs

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

### Credit Management
- `POST /api/credits/deduct` - Deduct credits from user
- `POST /api/credits/add` - Add credits to user
- `GET /api/credits/report` - Get credit usage report
- `POST /api/credits/transfer` - Transfer credits between users

### Subscriptions
- `POST /api/subscriptions/create` - Create subscription
- `POST /api/subscriptions/cancel` - Cancel subscription

### Payments
- `POST /api/paystack/initialize` - Initialize Paystack payment
- `POST /api/paystack/verify` - Verify payment
- `POST /api/paystack/webhook` - Paystack webhook (receives events)

### Cron Jobs (Vercel Cron)
- `POST /api/cron/allocate-monthly-credits` - Allocate monthly credits (1st of month)
- `POST /api/cron/process-expired-credits` - Process expired credits (daily)
- `POST /api/cron/send-expiry-notifications` - Send expiry notifications (daily 9am)

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
  - supabaseUserId: String (links to Supabase auth)
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
| Starter | R129 | R1,320/yr | 130 |
| Professional | R589 | R6,720/yr | 600 |
| Premium | R1,270 | R14,400/yr | 1,300 |
| Agency | R5,000 | R60,000/yr | 5,000 |

### Video Tiers

| Tier | Processing | Resolution | Credits |
|------|------------|------------|---------|
| Essential | Local FFmpeg | 1080p | 5-10 |
| Social | AI (512p) | 512p | 30-80 |
| Cinematic | AI (720p) | 720p | 40-90 |
| Premium | AI + Upscale | 1080p | 60-150 |

## Environment Variables Summary

### Required
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (default: af-south-1)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `VITE_MODAL_ENDPOINT`

### Optional
- `CRON_SECRET` - Secures cron endpoints
- `DYNAMODB_TABLES_AUTO_CREATE` - Auto-create tables on first use
- `VITE_API_URL` - Backend API URL (for production)
- `VITE_APP_URL` - Frontend URL
