# 🚀 GitHub + Vercel Deployment Guide

## Overview

This guide explains how to deploy PropReel using GitHub for version control and Vercel for hosting. This setup provides:

- ✅ Automatic deployments on every push
- ✅ Preview deployments for pull requests
- ✅ Custom domain support
- ✅ SSL certificates (automatic)
- ✅ Global CDN
- ✅ Zero-downtime deployments

---

## 📋 Prerequisites

### Required Accounts
- [GitHub](https://github.com) - Free account
- [Vercel](https://vercel.com) - Free tier available
- [Supabase](https://supabase.com) - Database & Auth
- [Modal](https://modal.com) - Video rendering backend

### Required Tools
- Git installed locally
- Node.js 18+ installed
- npm or yarn package manager

---

## 🎯 Initial Setup (One-Time)

### Step 1: Create GitHub Repository

```bash
# Initialize Git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: PropReel platform"

# Create repository on GitHub
# Go to: https://github.com/new
# Repository name: propreel
# Keep it public or private (your choice)
# DO NOT initialize with README

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/propreel.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 2: Connect Vercel to GitHub

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Click "Import Git Repository"
4. Select your `propreel` repository
5. Vercel will auto-detect Vite configuration
6. Click "Deploy"

### Step 3: Configure Environment Variables in Vercel

1. In Vercel Dashboard, go to your project
2. Navigate to **Settings** → **Environment Variables**
3. Add all required variables (see list below)
4. Select environments: Production, Preview, Development

#### Required Environment Variables

```bash
# Resend (transactional email)
RESEND_API_KEY=re_xxxxx

# AWS
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=af-south-1
AWS_S3_RAW_BUCKET=propreel-raw-assets
AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa

# Modal
MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run

# Paystack
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxx

# AI Services (optional)
XAI_API_KEY=xai-xxxxx
FAL_API_KEY=fal-xxxxx

# Application
NODE_ENV=production
VITE_APP_URL=https://propreel.co.za
```

### Step 4: Configure Custom Domain

1. In Vercel Dashboard → Your Project → **Settings** → **Domains**
2. Add `propreel.co.za`
3. Vercel will provide DNS instructions
4. Update your domain's DNS records:
   - **A Record**: Point to Vercel's IP (provided by Vercel)
   - **CNAME**: `www` → `cname.vercel-dns.com`
5. Wait for DNS propagation (5-30 minutes)
6. SSL certificate will be issued automatically

### Step 5: Configure Supabase Redirect URLs

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/agcchttiomlbuuycwdgy/auth/providers)
2. Navigate to **Authentication** → **Providers**
3. Add these redirect URLs:

```
https://propreel.co.za/**
https://propreel.co.za/auth/v1/callback
https://propreelcoza.vercel.app/**
https://propreelcoza.vercel.app/auth/v1/callback
http://localhost:5173/**
http://localhost:5173/auth/v1/callback
```

---

## 🔄 Daily Development Workflow

### Making Changes

```bash
# 1. Create a feature branch
git checkout -b feature/your-feature-name

# 2. Make your changes
# ... edit files ...

# 3. Test locally
npm run dev

# 4. Commit changes
git add .
git commit -m "Add your feature description"

# 5. Push to GitHub
git push origin feature/your-feature-name
```

### Creating a Pull Request

1. Go to your GitHub repository
2. Click "Compare & pull request"
3. Add description of changes
4. Vercel will automatically create a preview deployment
5. Test the preview URL
6. Request review from team members
7. Merge to main when approved

### Automatic Deployment

When you merge to `main`:

1. GitHub triggers Vercel deployment
2. Vercel builds the project
3. New version goes live at `propreel.co.za`
4. Zero downtime deployment

---

## 📊 Deployment Environments

### Production (main branch)
- **URL**: https://propreel.co.za
- **Trigger**: Push to `main` branch
- **Environment Variables**: Production values
- **Status**: Live to all users

### Preview (pull requests)
- **URL**: https://propreel-git-branch-name.vercel.app
- **Trigger**: Pull request created/updated
- **Environment Variables**: Preview values
- **Status**: Temporary, for testing

### Development (local)
- **URL**: http://localhost:5173
- **Trigger**: `npm run dev`
- **Environment Variables**: Local .env file
- **Status**: Local testing only

---

## 🛠️ Vercel CLI (Optional)

For advanced control, install Vercel CLI:

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy from command line
vercel --prod

# Link local directory to Vercel project
vercel link
```

---

## 🔐 GitHub Secrets (For CI/CD)

If using GitHub Actions for automated testing:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add these secrets:

```bash
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=your-vercel-org-id
VERCEL_PROJECT_ID=your-vercel-project-id
```

**How to get these values:**

- **VERCEL_TOKEN**: Vercel Dashboard → Settings → Tokens → Create Token
- **VERCEL_ORG_ID**: Vercel Dashboard → Your Team → Settings → General
- **VERCEL_PROJECT_ID**: Vercel Dashboard → Your Project → Settings → General

---

## 📝 Branch Strategy

### Recommended Branches

- `main` - Production code (protected)
- `develop` - Development branch (optional)
- `feature/*` - Feature branches
- `bugfix/*` - Bug fix branches
- `hotfix/*` - Emergency fixes

### Branch Protection Rules

Set up in GitHub → Settings → Branches → Add rule:

```yaml
Branch name pattern: main
- Require pull request reviews: 1
- Require status checks: pass
- Require branches to be up to date: yes
- Include administrators: yes
```

---

## 🧪 Testing Before Deployment

### Local Testing

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Test all features:
# - User registration/login
# - Credit system
# - Video generation
# - Payment flow
# - Admin features

# Build for production
npm run build

# Preview production build
npm run preview
```

### Preview Deployment Testing

1. Create pull request
2. Vercel creates preview URL
3. Test all features on preview URL
4. Check console for errors
5. Verify all pages load correctly
6. Test on mobile devices
7. Approve and merge

---

## 🚨 Rollback Procedure

If something goes wrong after deployment:

### Option 1: Vercel Dashboard Rollback

1. Go to Vercel Dashboard → Your Project → **Deployments**
2. Find the previous working deployment
3. Click "Promote to Production"
4. Confirm rollback

### Option 2: Git Revert

```bash
# Find the commit hash of the last working version
git log

# Revert to that commit
git revert HEAD

# Push the revert
git push origin main
```

---

## 📈 Monitoring & Analytics

### Vercel Analytics

1. Enable in Vercel Dashboard → Your Project → **Analytics**
2. View performance metrics
3. Monitor web vitals
4. Track user interactions

### Vercel Logs

1. Go to Vercel Dashboard → Your Project → **Logs**
2. View real-time logs
3. Debug issues
4. Monitor errors

### Supabase Logs

1. Go to Supabase Dashboard → **Logs**
2. View database queries
3. Monitor auth events
4. Track API usage

---

## 🔧 Common Issues & Solutions

### Issue: Build fails on Vercel

**Solution:**
```bash
# Check build locally
npm run build

# Check for TypeScript errors
npm run lint

# Check Vercel build logs
# Vercel Dashboard → Deployments → Failed deployment → View logs
```

### Issue: Environment variables not working

**Solution:**
1. Verify variables are set in Vercel Dashboard
2. Check variable names match exactly
3. Redeploy after adding variables
4. Check for typos in variable values

### Issue: Custom domain not working

**Solution:**
1. Verify DNS records are correct
2. Wait for DNS propagation (up to 48 hours)
3. Check domain is verified in Vercel
4. Verify SSL certificate is issued

### Issue: Preview deployment not creating

**Solution:**
1. Check GitHub Actions workflow is running
2. Verify Vercel is connected to GitHub
3. Check Vercel project settings
4. Review Vercel logs for errors

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Supabase Documentation](https://supabase.com/docs)

---

## ✅ Deployment Checklist

Before going live:

- [ ] GitHub repository created and pushed
- [ ] Vercel project connected to GitHub
- [ ] All environment variables configured in Vercel
- [ ] Custom domain added and verified
- [ ] DNS records updated
- [ ] SSL certificate issued
- [ ] Supabase redirect URLs configured
- [ ] All features tested on production
- [ ] Admin users created with credits
- [ ] Payment gateway configured
- [ ] Email service configured
- [ ] Analytics enabled
- [ ] Monitoring set up
- [ ] Backup strategy in place

---

## 🎉 You're Ready!

Your PropReel platform is now configured for GitHub + Vercel deployment. Every push to `main` will automatically deploy to production!

**Quick Commands:**

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically deploys!
```

**Production URL:** https://propreel.co.za  
**Vercel Dashboard:** https://vercel.com/dashboard  
**GitHub Repository:** https://github.com/YOUR_USERNAME/propreel

---

**Need help?** Check the troubleshooting section or contact support@propreel.co.za
