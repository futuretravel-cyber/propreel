# PropReel Deployment Guide

## 🚀 Complete Deployment Automation

This guide provides step-by-step instructions for deploying the PropReel platform using automated scripts in Git Bash.

---

## 📋 Prerequisites

Before starting the deployment, ensure you have:

### Required Accounts
- ✅ **AWS Account** - For S3 storage and IAM
- ✅ **Modal Account** - For video rendering backend
- ✅ **Supabase Account** - For database and authentication
- ✅ **Paystack Account** - For payment processing
- ✅ **Domain Name** - propreel.co.za (or your domain)

### Required Software
- ✅ **Git Bash** (Windows) or Terminal (Mac/Linux)
- ✅ **Node.js 18+** - [Download](https://nodejs.org/)
- ✅ **npm** - Comes with Node.js
- ✅ **Git** - [Download](https://git-scm.com/)

---

## 🎯 Quick Start (Automated Deployment)

### Option 1: Full Automated Deployment

Run the complete deployment automation:

```bash
# Make all scripts executable
chmod +x deploy/*.sh

# Run complete deployment
./deploy/08-complete-deployment.sh
```

This will guide you through all steps automatically.

### Option 2: Step-by-Step Manual Deployment

Run each script individually:

```bash
# Step 1: AWS Setup
./deploy/01-aws-setup.sh

# Step 2: Modal Backend Setup
./deploy/02-modal-setup.sh

# Step 3: Supabase Setup
./deploy/03-supabase-setup.sh

# Step 4: Admin Users Setup
./deploy/04-admin-setup.sh

# Step 5: Build & Deploy
./deploy/05-build-deploy.sh

# Step 6: Feature Activation
./deploy/06-feature-activation.sh

# Step 7: Testing
./deploy/07-testing.sh
```

---

## 📖 Detailed Step-by-Step Guide

### Step 1: AWS CLI Setup & Configuration

**Script:** `deploy/01-aws-setup.sh`

**What it does:**
- Installs AWS CLI if not present
- Configures AWS credentials
- Creates S3 buckets for assets
- Sets up IAM user with proper permissions
- Configures bucket policies and CORS

**Manual Steps:**

1. **Install AWS CLI**
   ```bash
   # Windows (Git Bash)
   curl "https://awscli.amazonaws.com/AWSCLIV2.msi" -o "AWSCLIV2.msi"
   msiexec //i AWSCLIV2.msi //quiet //norestart
   
   # macOS
   curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
   sudo installer -pkg AWSCLIV2.pkg -target /
   
   # Linux
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   ```

2. **Configure AWS CLI**
   ```bash
   aws configure
   ```
   
   Enter your AWS credentials:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Default region: `af-south-1`
   - Default output format: `json`

3. **Get AWS Credentials**
   - Go to [AWS IAM Console](https://console.aws.amazon.com/iam/home#/security_credentials)
   - Create access keys for your user
   - Save credentials securely

4. **Create S3 Buckets**
   ```bash
   # Create raw assets bucket
   aws s3api create-bucket \
     --bucket propreel-raw-assets \
     --region af-south-1 \
     --create-bucket-configuration LocationConstraint=af-south-1
   
   # Create output bucket
   aws s3api create-bucket \
     --bucket propreel-video-outputs-sa \
     --region af-south-1 \
     --create-bucket-configuration LocationConstraint=af-south-1
   ```

5. **Configure Bucket Policies**
   - Enable versioning
   - Set public read access
   - Configure CORS for browser uploads

**Output:**
- Creates `deploy/credentials/aws-credentials.txt`
- Contains AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, bucket names

---

### Step 2: Modal Backend Setup

**Script:** `deploy/02-modal-setup.sh`

**What it does:**
- Installs Modal CLI
- Authenticates with Modal
- Deploys video rendering backend
- Returns endpoint URL

**Manual Steps:**

1. **Install Modal CLI**
   ```bash
   pip install modal
   ```

2. **Authenticate with Modal**
   ```bash
   modal token create
   ```
   
   - Go to [Modal Dashboard](https://modal.com/tokens)
   - Create a new token
   - Save the token

3. **Deploy Modal Backend**
   ```bash
   cd modal
   modal deploy app_propreel_grok_tiers.py
   cd ..
   ```

4. **Get Endpoint URL**
   - Your endpoint will be: `https://your-username--propreel-render.modal.run`
   - Update this in your `.env` file

**Output:**
- Creates `deploy/credentials/modal-endpoint.txt`
- Contains MODAL_RENDER_ENDPOINT

---

### Step 3: Supabase Database & Auth Setup

**Script:** `deploy/03-supabase-setup.sh`

**What it does:**
- Creates Supabase project (manual)
- Configures database schema
- Sets up authentication
- Configures RLS policies

**Note:** Supabase storage is NOT used. All file storage uses AWS S3 (configured in Step 1).

**Manual Steps:**

1. **Create Supabase Project**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard/new)
   - Create new project: `propreel`
   - Set region: `af-south-1` (Cape Town)
   - Set strong database password
   - Wait for project to be ready (~2 minutes)

2. **Get Supabase Credentials**
   - Go to Project Settings → API
   - Copy:
     - Project URL
     - anon public key
     - service_role key (keep secret!)

3. **Deploy Database Schema**
   
   **Option A: Using Supabase SQL Editor**
   - Go to SQL Editor in Supabase Dashboard
   - Copy contents of `deploy/supabase-schema.sql`
   - Run the SQL
   
   **Option B: Using Supabase CLI**
   ```bash
   npm install -g supabase
   supabase init
   supabase link --project-ref YOUR_PROJECT_ID
   supabase db push
   ```

4. **Configure Authentication**
   - Go to Authentication → Providers
   - Enable Email provider (default)
   - Enable Google provider:
     - Create OAuth credentials in Google Cloud Console
     - Add redirect URI: `YOUR_SUPABASE_URL/auth/v1/callback`
     - Add Client ID and Secret to Supabase

5. **Storage Configuration**
   - ⚠️  DO NOT create Supabase storage buckets
   - ✅ All storage uses AWS S3 (configured in Step 1)
   - AWS S3 buckets:
     - `propreel-raw-assets` (photos, logos, headshots)
     - `propreel-video-outputs-sa` (rendered videos)

**Output:**
- Creates `deploy/credentials/supabase-credentials.txt`
- Contains VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

---

### Step 4: Admin Users Setup

**Script:** `deploy/04-admin-setup.sh`

**What it does:**
- Creates admin users in Supabase
- Loads 1000 credits for each admin
- Sets up initial credit transactions

**Admin Users Created:**
- `futuretravel@gmail.com` - 1000 credits
- `ulric@propreel.co.za` - 1000 credits

**Manual Steps:**

1. **Run the Script**
   ```bash
   ./deploy/04-admin-setup.sh
   ```

2. **Verify Admin Users**
   - Go to Supabase Dashboard → Table Editor → users
   - Verify both admin users exist
   - Check credits = 1000
   - Check role = 'ADMIN'

3. **Save Temporary Passwords**
   - Passwords saved to `deploy/credentials/admin-passwords.txt`
   - **IMPORTANT:** Change passwords immediately after first login!

**Output:**
- Creates `deploy/credentials/admin-passwords.txt`
- Contains temporary passwords for admin users

---

### Step 5: Build & Deployment

**Script:** `deploy/05-build-deploy.sh`

**What it does:**
- Loads all credentials
- Creates `.env` file
- Installs dependencies
- Builds production bundle
- Deploys to hosting provider

**Deployment Options:**

#### Option A: cPanel (Shared Hosting)

1. **Build the Application**
   ```bash
   npm run build
   ```

2. **Upload to cPanel**
   - Log in to cPanel
   - Go to File Manager
   - Navigate to `public_html`
   - Upload all files from `dist/` folder
   - Upload `.htaccess` file

3. **Configure .htaccess**
   ```apache
   RewriteEngine On
   RewriteBase /
   RewriteRule ^index\.html$ - [L]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.html [L]
   ```

#### Option B: Vercel (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   vercel --prod
   ```

3. **Configure Domain**
   - Go to Vercel Dashboard
   - Add custom domain: `propreel.co.za`
   - Update DNS records

#### Option C: Netlify

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**
   ```bash
   netlify deploy --prod --dir=dist
   ```

3. **Configure Domain**
   - Go to Netlify Dashboard
   - Add custom domain: `propreel.co.za`
   - Update DNS records

**Output:**
- Creates `.env` file with all configuration
- Builds production bundle in `dist/` folder
- Deploys to chosen hosting provider

---

### Step 6: Feature Activation

**Script:** `deploy/06-feature-activation.sh`

**What it does:**
- Verifies database tables
- Activates default app settings
- Creates prompt templates
- Enables all features

**Features Activated:**
- ✅ Credit system
- ✅ Subscription management
- ✅ Video rendering
- ✅ AI photo editing
- ✅ Virtual staging
- ✅ Social media captions
- ✅ Property descriptions
- ✅ Notification system
- ✅ Admin dashboard
- ✅ All 7 Studio tabs

**Manual Steps:**

1. **Run the Script**
   ```bash
   ./deploy/06-feature-activation.sh
   ```

2. **Verify Features**
   - Log in as admin
   - Check all dashboard sections
   - Test Studio features
   - Verify credit system

---

### Step 7: Testing & Verification

**Script:** `deploy/07-testing.sh`

**What it does:**
- Tests all system components
- Verifies database connections
- Checks authentication
- Validates storage buckets
- Runs health checks

**Test Categories:**
- ✅ Supabase connection
- ✅ Database tables
- ✅ Admin users
- ✅ Authentication system
- ✅ Storage buckets
- ✅ Build files
- ✅ Environment variables

**Manual Testing Checklist:**

1. **User Authentication**
   - [ ] Login with admin credentials
   - [ ] Login with Google OAuth
   - [ ] Register new user
   - [ ] Password reset

2. **Credit System**
   - [ ] Check credit balance display
   - [ ] Verify 1000 credits for admins
   - [ ] Test credit deduction
   - [ ] Test credit purchase

3. **Studio Features**
   - [ ] Create new project
   - [ ] Upload photos
   - [ ] Generate video
   - [ ] Test all 7 tabs
   - [ ] Test AI features

4. **Payment System**
   - [ ] Test subscription signup
   - [ ] Test credit purchase
   - [ ] Verify Paystack integration

5. **Legal Pages**
   - [ ] Terms of Service
   - [ ] Privacy Policy
   - [ ] Cookie Policy
   - [ ] PAIA Manual
   - [ ] Refund Policy
   - [ ] Data Processing Agreement

6. **Tutorial**
   - [ ] Access /tutorial page
   - [ ] Navigate through all steps

7. **Account Management**
   - [ ] Cancel subscription
   - [ ] Delete account
   - [ ] Export data

8. **Admin Features**
   - [ ] Access admin dashboard
   - [ ] Manage users
   - [ ] Manage agencies
   - [ ] Configure integrations

---

## 🔧 Post-Deployment Configuration

### 1. Configure Payment Gateway

**Paystack Setup:**

1. Log in to [Paystack Dashboard](https://dashboard.paystack.com/)
2. Get API keys:
   - Public Key
   - Secret Key
3. Add to `.env` file:
   ```env
   PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
   PAYSTACK_SECRET_KEY=sk_test_xxxxx
   ```
4. Configure webhook:
   - URL: `https://propreel.co.za/api/paystack/webhook`
   - Events: `charge.success`, `invoice.payment_failed`

### 2. Configure Email Service

**Option A: AWS SES**

1. Go to AWS SES Console
2. Verify domain: `propreel.co.za`
3. Get SMTP credentials
4. Add to `.env`:
   ```env
   AWS_SES_REGION=af-south-1
   AWS_SES_ACCESS_KEY=xxxxx
   AWS_SES_SECRET_KEY=xxxxx
   ```

**Option B: SendGrid**

1. Go to [SendGrid Dashboard](https://sendgrid.com/)
2. Create API key
3. Add to `.env`:
   ```env
   SENDGRID_API_KEY=SG.xxxxx
   ```

### 3. Configure Analytics

**Google Analytics:**

1. Go to [Google Analytics](https://analytics.google.com/)
2. Create property for `propreel.co.za`
3. Get Measurement ID
4. Add to `.env`:
   ```env
   VITE_GA_MEASUREMENT_ID=G-XXXXX
   ```

### 4. Configure Monitoring

**Sentry:**

1. Go to [Sentry](https://sentry.io/)
2. Create project
3. Get DSN
4. Add to `.env`:
   ```env
   VITE_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
   ```

### 5. Configure Admin Integrations

**WhatsApp Business:**

1. Go to Admin Dashboard → Integrations
2. Configure WhatsApp Business API
3. Add phone number and API token
4. Set business hours
5. Enable auto-replies

**Live Chat:**

1. Go to Admin Dashboard → Integrations
2. Choose provider (Crisp/Intercom)
3. Add App ID
4. Configure welcome messages
5. Set widget visibility

**Status Page:**

1. Go to Admin Dashboard → Integrations
2. Configure status page
3. Add monitored services
4. Set custom domain
5. Enable notifications

**Monthly Reports:**

1. Go to Admin Dashboard → Integrations
2. Configure report generation
3. Set schedule (1st of month)
4. Add custom branding
5. Configure email delivery

---

## 🚀 Production Checklist

### Pre-Launch

- [ ] All deployment scripts completed
- [ ] Admin users created with 1000 credits
- [ ] Passwords changed from temporary
- [ ] Payment gateway configured
- [ ] Email service configured
- [ ] Analytics configured
- [ ] Monitoring configured
- [ ] SSL certificate installed
- [ ] Domain DNS configured
- [ ] All features tested
- [ ] Legal pages reviewed
- [ ] Tutorial tested

### Launch Day

- [ ] Final deployment to production
- [ ] Verify all systems working
- [ ] Test user registration
- [ ] Test payment flow
- [ ] Test video generation
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Announce launch

### Post-Launch

- [ ] Monitor for 24 hours
- [ ] Check error rates
- [ ] Review user feedback
- [ ] Optimize performance
- [ ] Update documentation
- [ ] Plan marketing campaign

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue: AWS credentials not working**
- Solution: Regenerate access keys in AWS IAM
- Check: `aws sts get-caller-identity`

**Issue: Supabase connection failed**
- Solution: Verify API keys in Supabase Dashboard
- Check: Project is active and not paused

**Issue: Modal endpoint not responding**
- Solution: Redeploy Modal backend
- Check: `modal deploy modal/app_propreel_grok_tiers.py`

**Issue: Build fails**
- Solution: Clear node_modules and reinstall
- Run: `rm -rf node_modules && npm install`

**Issue: Admin users not created**
- Solution: Run admin setup script again
- Check: Supabase service role key is correct

### Support Contacts

- **Email:** support@propreel.co.za
- **Status Page:** status.propreel.co.za
- **Documentation:** See README files in project

---

## 📚 Additional Resources

### Documentation Files

- `README.md` - Project overview
- `FINAL_CHANGES_SUMMARY.md` - Recent changes
- `COMPLETE_IMPLEMENTATION_SUMMARY.md` - Feature list
- `SUPABASE_MIGRATION_GUIDE.md` - Database migration
- `WEBSITE_IMPROVEMENT_SUGGESTIONS.md` - Future improvements

### Deployment Scripts

- `deploy/01-aws-setup.sh` - AWS configuration
- `deploy/02-modal-setup.sh` - Modal backend
- `deploy/03-supabase-setup.sh` - Supabase setup
- `deploy/04-admin-setup.sh` - Admin users
- `deploy/05-build-deploy.sh` - Build & deploy
- `deploy/06-feature-activation.sh` - Feature activation
- `deploy/07-testing.sh` - Testing & verification
- `deploy/08-complete-deployment.sh` - Full automation

### Credential Files

- `deploy/credentials/aws-credentials.txt` - AWS keys
- `deploy/credentials/supabase-credentials.txt` - Supabase keys
- `deploy/credentials/modal-endpoint.txt` - Modal endpoint
- `deploy/credentials/admin-passwords.txt` - Admin passwords

---

## ✅ Deployment Complete!

Congratulations! Your PropReel platform is now live and ready for users.

### Quick Access

- **Website:** https://propreel.co.za
- **Admin Login:** futuretravel@gmail.com
- **Tutorial:** https://propreel.co.za/tutorial
- **Status:** https://status.propreel.co.za

### Next Steps

1. Change admin passwords immediately
2. Configure payment gateway
3. Set up email service
4. Monitor system health
5. Gather user feedback
6. Plan marketing campaign

---

**Deployment Date:** $(date)  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
