# 🚀 PropReel Quick Start Deployment Guide

## ⚡ Fastest Way to Deploy (5 Minutes)

### Step 1: Make Scripts Executable

Open Git Bash and run:

```bash
# Navigate to project directory
cd /path/to/propreel

# Make all deployment scripts executable
chmod +x deploy/*.sh

# Verify scripts are executable
ls -la deploy/
```

### Step 2: Run Complete Automated Deployment

```bash
# Run the complete deployment automation
./deploy/08-complete-deployment.sh
```

This single command will:
- ✅ Set up AWS CLI and S3 buckets
- ✅ Deploy Modal backend
- ✅ Configure Supabase database
- ✅ Create admin users with 1000 credits
- ✅ Build and deploy the application
- ✅ Activate all features
- ✅ Run verification tests

---

## 📋 Manual Step-by-Step Deployment

If you prefer to run each step individually:

### 1. AWS Setup (10 minutes)

```bash
./deploy/01-aws-setup.sh
```

**You'll need:**
- AWS Access Key ID
- AWS Secret Access Key
- AWS Region: af-south-1

**What it creates:**
- S3 buckets: propreel-raw-assets, propreel-video-outputs-sa
- IAM user with S3 and Polly access
- Credentials saved to: `deploy/credentials/aws-credentials.txt`

---

### 2. Modal Backend Setup (5 minutes)

```bash
./deploy/02-modal-setup.sh
```

**You'll need:**
- Modal account (sign up at modal.com)
- Modal API token

**What it creates:**
- Video rendering backend
- Endpoint URL saved to: `deploy/credentials/modal-endpoint.txt`

---

### 3. Supabase Setup (15 minutes)

```bash
./deploy/03-supabase-setup.sh
```

**You'll need:**
- Supabase account (sign up at supabase.com)
- Create new project: propreel
- Region: af-south-1

**What it creates:**
- Database with all tables
- Authentication system
- Storage buckets
- Credentials saved to: `deploy/credentials/supabase-credentials.txt`

**Manual step required:**
- Run the SQL schema in Supabase SQL Editor
- File: `deploy/supabase-schema.sql`

---

### 4. Admin Users Setup (2 minutes)

```bash
./deploy/04-admin-setup.sh
```

**What it creates:**
- Admin user: futuretravel@gmail.com (1000 credits)
- Admin user: ulric@propreel.co.za (1000 credits)
- Passwords saved to: `deploy/credentials/admin-passwords.txt`

---

### 5. Build & Deploy (10 minutes)

```bash
./deploy/05-build-deploy.sh
```

**What it does:**
- Loads all credentials
- Creates `.env` file
- Installs dependencies
- Builds production bundle
- Deploys to your chosen platform

**Deployment options:**
1. cPanel (shared hosting)
2. Vercel (recommended)
3. Netlify
4. Manual upload

---

### 6. Feature Activation (2 minutes)

```bash
./deploy/06-feature-activation.sh
```

**What it activates:**
- All database features
- Default app settings
- Prompt templates
- Credit system
- All Studio features

---

### 7. Testing & Verification (5 minutes)

```bash
./deploy/07-testing.sh
```

**What it tests:**
- Database connections
- Authentication system
- Storage buckets
- Build files
- Environment variables

---

## 🎯 Post-Deployment Configuration

### 1. Change Admin Passwords (CRITICAL!)

```bash
# View temporary passwords
cat deploy/credentials/admin-passwords.txt

# Login to the application
# URL: https://propreel.co.za
# Email: futuretravel@gmail.com
# Password: [from admin-passwords.txt]

# Change password immediately!
```

### 2. Configure Payment Gateway

**Paystack Setup:**

1. Go to [Paystack Dashboard](https://dashboard.paystack.com/)
2. Get API keys (Public & Secret)
3. Add to `.env` file:

```env
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxx
```

4. Configure webhook:
   - URL: `https://propreel.co.za/api/paystack/webhook`
   - Events: `charge.success`, `invoice.payment_failed`

### 3. Configure Email Service

**AWS SES:**

```env
AWS_SES_REGION=af-south-1
AWS_SES_ACCESS_KEY=xxxxx
AWS_SES_SECRET_KEY=xxxxx
```

**SendGrid:**

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

---

## 🔧 Admin Dashboard Configuration

After deployment, log in as admin and configure:

### 1. WhatsApp Business Integration

**Path:** Admin → Integrations → WhatsApp

**Configuration:**
- Business phone number
- API token
- Webhook URL
- Business hours
- Auto-reply messages

### 2. Live Chat Support

**Path:** Admin → Integrations → Live Chat

**Configuration:**
- Choose provider (Crisp/Intercom/Tawk.to)
- App ID
- Welcome messages
- Widget visibility

### 3. Status Page

**Path:** Admin → Integrations → Status Page

**Configuration:**
- Custom domain: status.propreel.co.za
- Company branding
- Monitored services
- Incident management

### 4. Monthly Reports

**Path:** Admin → Integrations → Reports

**Configuration:**
- Generation schedule (1st of month)
- Custom branding/logo
- Email recipients
- Slack webhook
- Report sections

---

## 📊 Verification Checklist

After deployment, verify:

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

---

## 📞 Support

### Documentation
- `deploy/README.md` - Complete deployment guide
- `FINAL_CHANGES_SUMMARY.md` - Recent changes
- `COMPLETE_IMPLEMENTATION_SUMMARY.md` - Feature list

### Credentials Location
- `deploy/credentials/aws-credentials.txt`
- `deploy/credentials/supabase-credentials.txt`
- `deploy/credentials/modal-endpoint.txt`
- `deploy/credentials/admin-passwords.txt`

### Support Contacts
- Email: support@propreel.co.za
- Status: status.propreel.co.za
- Information Officer: information.officer@propreel.co.za

---

## ✅ Deployment Complete!

Your PropReel platform is now live!

### Quick Access
- **Website:** https://propreel.co.za
- **Admin:** https://propreel.co.za/admin
- **Tutorial:** https://propreel.co.za/tutorial
- **Status:** https://status.propreel.co.za

### Admin Login
- **Email:** futuretravel@gmail.com
- **Password:** Check `deploy/credentials/admin-passwords.txt`
- **Credits:** 1000

### Next Steps
1. ✅ Change admin passwords
2. ✅ Configure payment gateway
3. ✅ Set up email service
4. ✅ Configure analytics
5. ✅ Set up monitoring
6. ✅ Test all features
7. ✅ Launch marketing campaign

---

**Deployment Time:** ~45 minutes  
**Status:** ✅ Production Ready  
**Version:** 1.0.0

🎉 Congratulations! Your PropReel platform is ready to revolutionize South African property marketing!
