# 🚀 PropReel - Complete Deployment Guide

## 📖 Overview

This comprehensive guide provides everything you need to deploy the PropReel platform from scratch to production. The deployment is fully automated with step-by-step scripts that handle every aspect of the setup.

**Total Deployment Time:** ~45 minutes  
**Difficulty:** Intermediate  
**Prerequisites:** AWS, Modal, Supabase, Paystack accounts

---

## 🎯 What You'll Deploy

### Core Platform
- ✅ React + Vite frontend application
- ✅ Supabase database with authentication
- ✅ AWS S3 storage for assets
- ✅ Modal backend for video rendering
- ✅ Paystack payment integration
- ✅ All 7 Studio AI features
- ✅ Credit system with 1000 credits for admins
- ✅ Agency management system
- ✅ Real-time notifications
- ✅ PWA with offline support

### Legal & Compliance
- ✅ Terms of Service
- ✅ Privacy Policy (POPIA compliant)
- ✅ Cookie Policy
- ✅ PAIA Manual
- ✅ Data Processing Agreement
- ✅ Credit & Cancellation Policy

### Admin Features
- ✅ User management
- ✅ Agency management
- ✅ Credit management
- ✅ Review moderation
- ✅ API settings
- ✅ System integrations
- ✅ Audit logs

### New Features
- ✅ Tutorial video page (6-step guide)
- ✅ Subscription cancellation with terms
- ✅ Account deletion with data export
- ✅ Non-refundable credit policy
- ✅ WhatsApp Business integration
- ✅ Live chat support
- ✅ Status page
- ✅ Monthly PDF reports

---

## 📋 Prerequisites

### Required Accounts

1. **AWS Account**
   - Sign up: https://aws.amazon.com/
   - Need: Access Key ID, Secret Access Key
   - Region: af-south-1 (Cape Town)

2. **Modal Account**
   - Sign up: https://modal.com/
   - Need: API token
   - For: Video rendering backend

3. **Supabase Account**
   - Sign up: https://supabase.com/
   - Need: Project URL, anon key, service role key
   - Region: af-south-1

4. **Paystack Account**
   - Sign up: https://paystack.com/
   - Need: Public key, Secret key
   - For: Payment processing

5. **Domain Name**
   - propreel.co.za (or your domain)
   - DNS access for configuration

### Required Software

1. **Git Bash** (Windows) or Terminal (Mac/Linux)
2. **Node.js 18+** - https://nodejs.org/
3. **npm** - Comes with Node.js
4. **Git** - https://git-scm.com/

---

## 🚀 Quick Start (Recommended)

### One-Command Deployment

```bash
# Clone or navigate to project
cd /path/to/propreel

# Make scripts executable
chmod +x deploy/*.sh

# Run complete automated deployment
./deploy/08-complete-deployment.sh
```

This single command will guide you through all 7 deployment steps automatically.

---

## 📖 Step-by-Step Manual Deployment

### Step 1: AWS Setup (10 minutes)

**Script:** `deploy/01-aws-setup.sh`

```bash
./deploy/01-aws-setup.sh
```

**What it does:**
- Installs AWS CLI if needed
- Configures AWS credentials
- Creates S3 buckets:
  - `propreel-raw-assets` (for uploaded photos)
  - `propreel-video-outputs-sa` (for rendered videos)
- Creates IAM user with S3 and Polly access
- Configures bucket policies and CORS
- Enables versioning

**Output:**
- `deploy/credentials/aws-credentials.txt`

**Manual Alternative:**

```bash
# Install AWS CLI
# Windows:
curl "https://awscli.amazonaws.com/AWSCLIV2.msi" -o "AWSCLIV2.msi"
msiexec //i AWSCLIV2.msi //quiet //norestart

# Configure
aws configure
# Enter: Access Key, Secret Key, Region (af-south-1), Output (json)

# Create buckets
aws s3api create-bucket \
  --bucket propreel-raw-assets \
  --region af-south-1 \
  --create-bucket-configuration LocationConstraint=af-south-1

aws s3api create-bucket \
  --bucket propreel-video-outputs-sa \
  --region af-south-1 \
  --create-bucket-configuration LocationConstraint=af-south-1
```

---

### Step 2: Modal Backend Setup (5 minutes)

**Script:** `deploy/02-modal-setup.sh`

```bash
./deploy/02-modal-setup.sh
```

**What it does:**
- Installs Modal CLI
- Authenticates with Modal
- Deploys video rendering backend
- Returns endpoint URL

**Output:**
- `deploy/credentials/modal-endpoint.txt`

**Manual Alternative:**

```bash
# Install Modal CLI
pip install modal

# Authenticate
modal token create

# Deploy backend
cd modal
modal deploy app_propreel_grok_tiers.py
cd ..
```

---

### Step 3: Supabase Setup (15 minutes)

**Script:** `deploy/03-supabase-setup.sh`

```bash
./deploy/03-supabase-setup.sh
```

**What it does:**
- Guides you through Supabase project creation
- Deploys database schema
- Creates all tables with RLS policies
- Sets up authentication (Email + Google)
- Creates storage buckets
- Configures indexes and triggers

**Output:**
- `deploy/credentials/supabase-credentials.txt`

**Manual Steps:**

1. **Create Supabase Project**
   - Go to: https://supabase.com/dashboard/new
   - Name: `propreel`
   - Region: `af-south-1`
   - Password: (generate strong password)
   - Wait ~2 minutes for setup

2. **Get Credentials**
   - Dashboard → Settings → API
   - Copy: Project URL, anon key, service_role key

3. **Deploy Schema**
   - Go to SQL Editor
   - Copy contents of `deploy/supabase-schema.sql`
   - Run the SQL

4. **Configure Auth**
   - Authentication → Providers
   - Enable Email (default)
   - Enable Google:
     - Create OAuth in Google Cloud Console
     - Add redirect URI: `YOUR_URL/auth/v1/callback`
     - Add Client ID and Secret

5. **Storage Configuration**
   - ⚠️  DO NOT create Supabase storage buckets
   - ✅ All storage uses AWS S3 (configured in Step 1)
   - AWS S3 buckets:
     - `propreel-raw-assets` (photos, logos, headshots)
     - `propreel-video-outputs-sa` (rendered videos)

---

### Step 4: Admin Users Setup (2 minutes)

**Script:** `deploy/04-admin-setup.sh`

```bash
./deploy/04-admin-setup.sh
```

**What it does:**
- Creates admin users in Supabase
- Loads 1000 credits for each admin
- Sets up initial credit transactions

**Admin Users Created:**
- `futuretravel@gmail.com` - 1000 credits - ADMIN
- `ulric@propreel.co.za` - 1000 credits - ADMIN

**Output:**
- `deploy/credentials/admin-passwords.txt`

**⚠️ IMPORTANT:** Change passwords immediately after first login!

---

### Step 5: Build & Deploy (10 minutes)

**Script:** `deploy/05-build-deploy.sh`

```bash
./deploy/05-build-deploy.sh
```

**What it does:**
- Loads all credentials
- Creates `.env` file with configuration
- Installs npm dependencies
- Builds production bundle
- Deploys to your chosen platform

**Deployment Options:**

#### Option A: cPanel (Shared Hosting)

```bash
# Build
npm run build

# Upload dist/ folder to public_html via cPanel File Manager
# Upload .htaccess file
```

#### Option B: Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Configure domain in Vercel dashboard
```

#### Option C: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist

# Configure domain in Netlify dashboard
```

**Output:**
- `.env` file with all configuration
- `dist/` folder with production build

---

### Step 6: Feature Activation (2 minutes)

**Script:** `deploy/06-feature-activation.sh`

```bash
./deploy/06-feature-activation.sh
```

**What it does:**
- Verifies database tables
- Activates default app settings
- Creates prompt templates
- Enables all features

**Features Activated:**
- Credit system
- Subscription management
- Video rendering (all tiers)
- AI photo editing
- Virtual staging
- Furniture removal
- Twilight photography
- Social media captions
- Property descriptions
- Notification system
- Admin dashboard
- All 7 Studio tabs

---

### Step 7: Testing & Verification (5 minutes)

**Script:** `deploy/07-testing.sh`

```bash
./deploy/07-testing.sh
```

**What it tests:**
- Supabase connection
- Database tables
- Admin users
- Authentication system
- Storage buckets
- Build files
- Environment variables

**Manual Testing Checklist:**

See `deploy/07-testing.sh` for complete checklist including:
- User authentication
- Credit system
- Studio features
- Payment system
- Legal pages
- Tutorial
- Account management
- Admin features

---

## 🔧 Post-Deployment Configuration

### 1. Change Admin Passwords (CRITICAL!)

```bash
# View temporary passwords
cat deploy/credentials/admin-passwords.txt

# Login to application
# URL: https://propreel.co.za
# Email: futuretravel@gmail.com
# Password: [from admin-passwords.txt]

# Change password immediately in Settings
```

### 2. Configure Payment Gateway

**Paystack Setup:**

1. Go to [Paystack Dashboard](https://dashboard.paystack.com/)
2. Get API keys (Public & Secret)
3. Add to `.env`:

```env
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxx
```

4. Configure webhook:
   - URL: `https://propreel.co.za/api/paystack/webhook`
   - Events: `charge.success`, `invoice.payment_failed`

### 3. Configure Email Service

**Option A: AWS SES**

```env
AWS_SES_REGION=af-south-1
AWS_SES_ACCESS_KEY=xxxxx
AWS_SES_SECRET_KEY=xxxxx
```

**Option B: SendGrid**

```env
SENDGRID_API_KEY=SG.xxxxx
```

### 4. Configure Analytics

**Google Analytics:**

```env
VITE_GA_MEASUREMENT_ID=G-XXXXX
```

### 5. Configure Monitoring

**Sentry:**

```env
VITE_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### 6. Configure Admin Integrations

Log in as admin and go to Admin → Integrations:

**WhatsApp Business:**
- Business phone number
- API token
- Webhook URL
- Business hours
- Auto-reply messages

**Live Chat:**
- Choose provider (Crisp/Intercom/Tawk.to)
- App ID
- Welcome messages
- Widget visibility

**Status Page:**
- Custom domain: status.propreel.co.za
- Company branding
- Monitored services
- Incident management

**Monthly Reports:**
- Generation schedule (1st of month)
- Custom branding/logo
- Email recipients
- Slack webhook
- Report sections

---

## 📊 Verification Checklist

After deployment, verify all systems:

### Authentication
- [ ] Login with futuretravel@gmail.com
- [ ] Login with ulric@propreel.co.za
- [ ] Verify 1000 credits for each admin
- [ ] Test Google OAuth login
- [ ] Test new user registration

### Credit System
- [ ] Check credit balance display
- [ ] Test credit purchase
- [ ] Test credit deduction on render
- [ ] Verify transaction history
- [ ] Test auto-topup configuration

### Studio Features
- [ ] Create new project
- [ ] Upload photos
- [ ] Generate video (all tiers)
- [ ] Test AI photo editing
- [ ] Test virtual staging
- [ ] Test furniture removal
- [ ] Test twilight photography
- [ ] Test social media captions
- [ ] Test property descriptions

### Payment System
- [ ] Test subscription signup
- [ ] Test credit purchase
- [ ] Verify Paystack webhook
- [ ] Test subscription cancellation
- [ ] Test account deletion

### Legal Pages
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Cookie Policy
- [ ] PAIA Manual
- [ ] Refund Policy
- [ ] Data Processing Agreement

### Tutorial
- [ ] Access /tutorial page
- [ ] Navigate through all 6 steps
- [ ] Verify video player works

### Admin Features
- [ ] Access admin dashboard
- [ ] Manage users
- [ ] Manage agencies
- [ ] Configure integrations
- [ ] View audit logs

---

## 🚨 Troubleshooting

### Issue: Scripts not executable

**Solution:**
```bash
chmod +x deploy/*.sh
```

### Issue: AWS credentials not working

**Solution:**
```bash
# Reconfigure AWS
aws configure

# Test credentials
aws sts get-caller-identity
```

### Issue: Supabase connection failed

**Solution:**
1. Verify project is active in Supabase Dashboard
2. Check API keys are correct
3. Verify project region is af-south-1
4. Check RLS policies are enabled

### Issue: Modal endpoint not responding

**Solution:**
```bash
# Redeploy Modal backend
cd modal
modal deploy app_propreel_grok_tiers.py
cd ..
```

### Issue: Build fails

**Solution:**
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: Admin users not created

**Solution:**
```bash
# Run admin setup again
./deploy/04-admin-setup.sh

# Or manually create in Supabase SQL Editor
```

### Issue: Database tables not created

**Solution:**
1. Go to Supabase SQL Editor
2. Copy contents of `deploy/supabase-schema.sql`
3. Run the SQL
4. Verify tables in Table Editor

---

## 📁 File Structure

```
propreel/
├── deploy/                          # Deployment scripts
│   ├── 01-aws-setup.sh             # AWS configuration
│   ├── 02-modal-setup.sh           # Modal backend
│   ├── 03-supabase-setup.sh        # Supabase setup
│   ├── 04-admin-setup.sh           # Admin users
│   ├── 05-build-deploy.sh          # Build & deploy
│   ├── 06-feature-activation.sh    # Feature activation
│   ├── 07-testing.sh               # Testing & verification
│   ├── 08-complete-deployment.sh   # Full automation
│   ├── supabase-schema.sql         # Database schema
│   ├── README.md                   # Deployment guide
│   └── credentials/                # Generated credentials
│       ├── aws-credentials.txt
│       ├── supabase-credentials.txt
│       ├── modal-endpoint.txt
│       └── admin-passwords.txt
├── src/                             # Source code
│   ├── components/                  # React components
│   ├── pages/                       # Page components
│   ├── context/                     # React context
│   └── lib/                         # Utilities
├── public/                          # Static assets
├── .env                             # Environment variables (generated)
├── package.json                     # Dependencies
├── README.md                        # Project overview
├── QUICK_START.md                   # Quick start guide
└── DEPLOYMENT_GUIDE.md             # This file
```

---

## 📚 Documentation

### Deployment Documentation
- `DEPLOYMENT_GUIDE.md` - This comprehensive guide
- `QUICK_START.md` - Quick start guide
- `deploy/README.md` - Deployment scripts documentation

### Project Documentation
- `README.md` - Project overview
- `FINAL_CHANGES_SUMMARY.md` - Recent changes
- `COMPLETE_IMPLEMENTATION_SUMMARY.md` - Feature list
- `SUPABASE_MIGRATION_GUIDE.md` - Database migration
- `WEBSITE_IMPROVEMENT_SUGGESTIONS.md` - Future improvements

### Legal Documentation
- Terms of Service (`/terms`)
- Privacy Policy (`/privacy`)
- Cookie Policy (`/cookies`)
- PAIA Manual (`/paia`)
- Data Processing Agreement (`/dpa`)
- Credit & Cancellation Policy (`/refund-policy`)

---

## 📞 Support

### Documentation
- Check `deploy/README.md` for detailed instructions
- Review `QUICK_START.md` for quick reference
- See `FINAL_CHANGES_SUMMARY.md` for recent changes

### Credentials Location
All credentials are stored in `deploy/credentials/`:
- `aws-credentials.txt` - AWS access keys
- `supabase-credentials.txt` - Supabase API keys
- `modal-endpoint.txt` - Modal backend URL
- `admin-passwords.txt` - Admin temporary passwords

**⚠️ Security:** Keep these files secure and never commit to Git!

### Support Contacts
- **Email:** support@propreel.co.za
- **Status Page:** status.propreel.co.za
- **Information Officer:** information.officer@propreel.co.za

---

## ✅ Deployment Complete!

Congratulations! Your PropReel platform is now live and ready for users.

### Quick Access
- **Website:** https://propreel.co.za
- **Admin:** https://propreel.co.za/admin
- **Tutorial:** https://propreel.co.za/tutorial
- **Status:** https://status.propreel.co.za

### Admin Login
- **Email:** futuretravel@gmail.com
- **Password:** Check `deploy/credentials/admin-passwords.txt`
- **Credits:** 1000

### Second Admin
- **Email:** ulric@propreel.co.za
- **Password:** Check `deploy/credentials/admin-passwords.txt`
- **Credits:** 1000

### Next Steps
1. ✅ Change admin passwords immediately
2. ✅ Configure payment gateway (Paystack)
3. ✅ Set up email service (AWS SES/SendGrid)
4. ✅ Configure analytics (Google Analytics)
5. ✅ Set up monitoring (Sentry)
6. ✅ Configure admin integrations
7. ✅ Test all features manually
8. ✅ Launch marketing campaign

---

## 🎉 Success Metrics

### Deployment Statistics
- **Total Scripts:** 8 automation scripts
- **Database Tables:** 10 tables with RLS
- **Features:** 50+ features activated
- **Legal Pages:** 6 compliance documents
- **Admin Users:** 2 users with 1000 credits each
- **Deployment Time:** ~45 minutes
- **Status:** ✅ Production Ready

### Platform Capabilities
- **AI Features:** 7 Studio tools
- **Video Tiers:** 4 tiers (Essential to Premium)
- **Payment:** Paystack integration
- **Storage:** AWS S3 (af-south-1)
- **Database:** Supabase PostgreSQL
- **Auth:** Email + Google OAuth
- **Compliance:** POPIA & GDPR ready

---

**Deployment Date:** $(date)  
**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Build:** ✅ Successful  

🎊 **Your PropReel platform is ready to revolutionize South African property marketing!** 🏠🎬✨
