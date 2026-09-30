# 🚀 PropReel - GitHub & Vercel Deployment Guide

## ✅ Pre-Deployment Checklist

Before deploying to GitHub and Vercel, ensure you have completed the following:

### 1. Environment Variables Setup

Create a `.env` file in your project root with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=af-south-1
AWS_S3_RAW_BUCKET=propreel-raw-assets
AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa

# Modal Configuration
MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run

# Paystack Configuration
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
PAYSTACK_WEBHOOK_URL=https://propreel.co.za/api/paystack/webhook

# Application Configuration
VITE_APP_URL=https://propreel.co.za
NODE_ENV=production
```

### 2. Database Setup

Ensure your Supabase database has the following tables:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'AGENT',
  credits INTEGER DEFAULT 0,
  credit_expiries JSONB DEFAULT '[]',
  subscription JSONB,
  auto_topup JSONB,
  agency_id UUID,
  agency_name TEXT,
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT false,
  last_low_credit_warned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Credit transactions table
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  plan_id TEXT NOT NULL,
  cycle TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  next_charge_amount DECIMAL,
  paystack_customer_code TEXT,
  paystack_subscription_code TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  title TEXT,
  address TEXT,
  suburb TEXT,
  city TEXT,
  province TEXT,
  price DECIMAL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  garages INTEGER,
  photos JSONB DEFAULT '[]',
  description TEXT,
  social_captions JSONB DEFAULT '{}',
  video_tier TEXT,
  orientation TEXT,
  voiceover_text TEXT,
  voice_id TEXT,
  include_agent_branding BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'DRAFT',
  render_job_id TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  credits_spent INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Admin Users

Create admin users in Supabase with 1000 credits each:

```sql
INSERT INTO users (email, full_name, role, credits, email_verified)
VALUES 
  ('futuretravel@gmail.com', 'PropReel Administrator', 'ADMIN', 1000, true),
  ('ulric@propreel.co.za', 'Ulric - PropReel Admin', 'ADMIN', 1000, true);
```

---

## 📦 Step 1: Push to GitHub

### 1.1 Initialize Git Repository (if not already done)

```bash
git init
```

### 1.2 Create .gitignore File

Create a `.gitignore` file in your project root:

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Production
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Deployment credentials
deploy/credentials/
*.pem
*.key

# Modal configuration
.modal/

# Temporary files
tmp/
temp/
*.tmp

# OS files
Thumbs.db
.DS_Store

# Build artifacts
*.log
.cache/

# Supabase local development
.supabase/

# Test results
test-results/
playwright-report/
```

### 1.3 Add and Commit Files

```bash
git add .
git commit -m "Initial commit: PropReel platform with complete credit system"
```

### 1.4 Create GitHub Repository

1. Go to [GitHub](https://github.com/new)
2. Create a new repository named `propreel`
3. **DO NOT** initialize with README, .gitignore, or license
4. Click "Create repository"

### 1.5 Push to GitHub

```bash
# Add remote repository
git remote add origin https://github.com/YOUR_USERNAME/propreel.git

# Push to main branch
git branch -M main
git push -u origin main
```

---

## 🚀 Step 2: Deploy to Vercel

### 2.1 Connect Vercel to GitHub

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Click "Import Git Repository"
4. Select your `propreel` repository
5. Click "Import"

### 2.2 Configure Build Settings

Vercel will auto-detect Vite configuration. Verify the following settings:

- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### 2.3 Add Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

Add all environment variables from your `.env` file:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_S3_RAW_BUCKET
AWS_S3_OUTPUT_BUCKET
MODAL_RENDER_ENDPOINT
PAYSTACK_PUBLIC_KEY
PAYSTACK_SECRET_KEY
PAYSTACK_WEBHOOK_URL
VITE_APP_URL
NODE_ENV
```

**Important:** Select "Production", "Preview", and "Development" for each variable.

### 2.4 Deploy

Click "Deploy" and wait for the deployment to complete.

### 2.5 Configure Custom Domain

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add `propreel.co.za`
3. Vercel will provide DNS instructions
4. Update your domain's DNS records:
   - **A Record:** Point to Vercel's IP (provided by Vercel)
   - **CNAME:** `www` → `cname.vercel-dns.com`
5. Wait for DNS propagation (5-30 minutes)
6. SSL certificate will be issued automatically

---

## 🔧 Step 3: Configure Supabase

### 3.1 Update Redirect URLs

Go to Supabase Dashboard → Authentication → URL Configuration

Add these redirect URLs:

```
https://propreel.co.za/**
https://propreel.co.za/auth/v1/callback
https://propreelcoza.vercel.app/**
https://propreelcoza.vercel.app/auth/v1/callback
http://localhost:5173/**
http://localhost:5173/auth/v1/callback
```

### 3.2 Configure Google OAuth (if using)

1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://propreel.co.za/auth/v1/callback`
4. Copy Client ID and Secret to Supabase

### 3.3 Enable Row Level Security (RLS)

Ensure RLS is enabled on all tables:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
```

Add RLS policies:

```sql
-- Users can read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );
```

---

## 💳 Step 4: Configure Paystack

### 4.1 Get API Keys

1. Login to [Paystack Dashboard](https://dashboard.paystack.com/)
2. Go to Settings → API Keys
3. Copy Public Key and Secret Key
4. Add to Vercel environment variables

### 4.2 Configure Webhook

1. Go to Settings → Preferences → Transfer Recipients
2. Add webhook URL: `https://propreel.co.za/api/paystack/webhook`
3. Select events:
   - `charge.success`
   - `charge.failed`
   - `invoice.create`
   - `invoice.update`
4. Copy webhook secret to environment variables

### 4.3 Test Payment Flow

1. Create a test user account
2. Attempt to purchase credits
3. Verify Paystack checkout works
4. Check webhook receives payment notification
5. Verify credits are added to user account

---

## 🎬 Step 5: Deploy Modal Backend

### 5.1 Install Modal CLI

```bash
pip install modal
```

### 5.2 Authenticate with Modal

```bash
modal setup
```

Follow the browser authentication flow.

### 5.3 Deploy FlashHead Endpoint

```bash
cd modal
modal deploy flashhead_endpoint.py
```

### 5.4 Deploy Video Rendering Backend

```bash
modal deploy app_propreel_minimax.py
```

### 5.5 Get Endpoint URLs

After deployment, Modal will provide endpoint URLs:

```
FlashHead: https://your-username--flashhead.modal.run
Video Render: https://your-username--propreel-render.modal.run
```

Update these URLs in your Vercel environment variables:

```
MODAL_FLASHHEAD_ENDPOINT=https://your-username--flashhead.modal.run
MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run
```

---

## 🧪 Step 6: Testing

### 6.1 User Registration

- [ ] Test user registration flow
- [ ] Verify email verification works
- [ ] Check initial credits are allocated

### 6.2 Credit System

- [ ] Test credit purchase via Paystack
- [ ] Verify credits are added to account
- [ ] Test credit deduction for video generation
- [ ] Test credit deduction for image editing
- [ ] Test credit deduction for FlashHead
- [ ] Verify low credit warnings appear

### 6.3 Video Generation

- [ ] Test Essential tier video generation
- [ ] Test Social tier video generation
- [ ] Test Cinematic tier video generation
- [ ] Test Premium tier video generation
- [ ] Verify rotating prompts work
- [ ] Test AI Talking Profile (FlashHead)

### 6.4 Image Editing

- [ ] Test all 29 image presets
- [ ] Verify 2 credits deducted per image
- [ ] Check output quality

### 6.5 Subscription Management

- [ ] Test monthly subscription
- [ ] Test annual subscription
- [ ] Verify credit rollover
- [ ] Test subscription cancellation
- [ ] Test plan upgrades/downgrades

### 6.6 Payment Integration

- [ ] Test Paystack checkout
- [ ] Verify webhook receives payments
- [ ] Test failed payment handling
- [ ] Verify refund processing

---

## 📊 Step 7: Monitoring & Analytics

### 7.1 Vercel Analytics

Enable Vercel Analytics:

1. Go to Vercel Dashboard → Your Project → Analytics
2. Enable Web Analytics
3. Monitor performance metrics

### 7.2 Supabase Logs

Monitor database operations:

1. Go to Supabase Dashboard → Logs
2. View API logs
3. Monitor authentication events
4. Track database queries

### 7.3 Error Tracking

Set up error tracking (optional):

1. Create Sentry account
2. Add Sentry DSN to environment variables
3. Monitor errors in production

---

## 🔄 Step 8: Automated Deployments

### 8.1 GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 8.2 Vercel Git Integration

Vercel automatically deploys on every push to main branch.

---

## 🎯 Post-Deployment Tasks

### 1. Update DNS Records

Ensure your domain points to Vercel:

```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### 2. Configure Email Service

Set up email service for notifications:

1. Choose email provider (SendGrid, AWS SES, etc.)
2. Configure SMTP settings
3. Add to environment variables
4. Test email delivery

### 3. Set Up Backups

Configure database backups:

1. Go to Supabase Dashboard → Database → Backups
2. Enable automatic backups
3. Set backup schedule (daily recommended)

### 4. Monitor Performance

Set up monitoring:

1. Vercel Analytics for frontend
2. Supabase logs for backend
3. Modal logs for AI services
4. Paystack dashboard for payments

---

## 🐛 Troubleshooting

### Issue: Build fails on Vercel

**Solution:**
```bash
# Check build locally
npm run build

# Check for TypeScript errors
npm run lint

# Review Vercel build logs
```

### Issue: Environment variables not working

**Solution:**
1. Verify variables are set in Vercel Dashboard
2. Check variable names match exactly
3. Redeploy after adding variables

### Issue: Paystack webhook not receiving events

**Solution:**
1. Verify webhook URL is correct
2. Check webhook signature verification
3. Review Paystack dashboard for webhook status

### Issue: Modal endpoint not responding

**Solution:**
```bash
# Check Modal deployment status
modal app list

# Review Modal logs
modal logs your-app-name

# Redeploy if necessary
modal deploy your-app.py
```

### Issue: Credits not deducting

**Solution:**
1. Check `deductCredits()` function in AuthContext
2. Verify backend API endpoint is working
3. Check database transactions table
4. Review browser console for errors

---

## 📞 Support & Resources

### Documentation
- [Vercel Docs](https://vercel.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Paystack Docs](https://paystack.com/docs)
- [Modal Docs](https://modal.com/docs)

### Support Contacts
- **Email:** support@propreel.co.za
- **Status Page:** status.propreel.co.za
- **Vercel Support:** https://vercel.com/support
- **Supabase Support:** https://supabase.com/support

---

## ✅ Deployment Complete!

Your PropReel platform is now live at:

- **Production:** https://propreel.co.za
- **Vercel Dashboard:** https://vercel.com/dashboard
- **GitHub Repository:** https://github.com/YOUR_USERNAME/propreel
- **Supabase Dashboard:** https://supabase.com/dashboard/project/YOUR_PROJECT_ID

### Quick Commands

```bash
# Deploy updates
git add .
git commit -m "Update description"
git push origin main
# → Vercel automatically deploys!

# Check deployment status
vercel ls

# View logs
vercel logs propreel.co.za
```

---

**Deployment Date:** March 2025  
**Version:** 1.0.0  
**Status:** ✅ Production Ready

🎉 **Your PropReel platform is live and ready for users!**
