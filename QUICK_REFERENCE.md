# 🚀 Quick Reference: GitHub + Vercel Deployment

## ✅ Setup Complete!

Your PropReel project is now configured for automatic deployment via GitHub and Vercel.

---

## 📦 What's Been Created

### Configuration Files
- ✅ `.gitignore` - Protects sensitive files
- ✅ `vercel.json` - Vercel deployment config
- ✅ `.env.example` - Environment variable template
- ✅ `.github/workflows/ci-cd.yml` - Automated testing

### Documentation
- ✅ `README.md` - Project overview
- ✅ `GITHUB_VERCEL_DEPLOYMENT.md` - Complete guide
- ✅ `CONTRIBUTING.md` - Contribution guidelines
- ✅ `GITHUB_SETUP_COMPLETE.md` - Setup summary
- ✅ `QUICK_REFERENCE.md` - This file

---

## 🎯 Quick Start (5 Minutes)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Ready for GitHub deployment"
git remote add origin https://github.com/YOUR_USERNAME/propreel.git
git branch -M main
git push -u origin main
```

### 2. Connect to Vercel
1. Go to https://vercel.com/new
2. Import your `propreel` repository
3. Add environment variables (see below)
4. Click "Deploy"

### 3. Configure Environment Variables
In Vercel Dashboard → Settings → Environment Variables:

```bash
VITE_SUPABASE_URL=https://agcchttiomlbuuycwdgy.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=af-south-1
AWS_S3_RAW_BUCKET=propreel-raw-assets
AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa
MODAL_RENDER_ENDPOINT=https://futuretravel--propreel-render.modal.run
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxx
VITE_APP_URL=https://propreel.co.za
NODE_ENV=production
```

### 4. Add Custom Domain
1. Vercel → Settings → Domains
2. Add `propreel.co.za`
3. Update DNS records
4. Wait for SSL (automatic)

---

## 🔄 Daily Workflow

### Make Changes
```bash
git checkout -b feature/new-feature
# ... make changes ...
npm run dev  # test locally
git add .
git commit -m "Add new feature"
git push origin feature/new-feature
```

### Deploy
```bash
# Push to main = automatic deployment
git checkout main
git merge feature/new-feature
git push origin main
# → Vercel deploys automatically!
```

---

## 📊 Deployment URLs

| Type | URL | When |
|------|-----|------|
| **Production** | https://propreel.co.za | Push to `main` |
| **Preview** | https://propreel-git-branch.vercel.app | Pull request |
| **Local** | http://localhost:5173 | `npm run dev` |

---

## 🛡️ Security

### Never Commit
- ❌ `.env` files
- ❌ `deploy/credentials/`
- ❌ API keys
- ❌ Passwords

### Always Use
- ✅ Environment variables in Vercel
- ✅ `.gitignore` for sensitive files
- ✅ Branch protection on GitHub
- ✅ HTTPS everywhere

---

## 🧪 Testing

### Before Push
```bash
npm run dev      # test locally
npm run build    # test build
npm run preview  # test production build
```

### After Push
1. Check Vercel deployment logs
2. Visit preview/production URL
3. Test all features
4. Check console for errors

---

## 📚 Documentation

| Document | When to Read |
|----------|--------------|
| `README.md` | First time setup |
| `GITHUB_VERCEL_DEPLOYMENT.md` | Detailed deployment guide |
| `CONTRIBUTING.md` | Contributing to project |
| `GITHUB_SETUP_COMPLETE.md` | Setup verification |
| `QUICK_REFERENCE.md` | Quick commands (this file) |

---

## 🎯 Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run preview         # Preview production build

# Git
git status              # Check changes
git add .               # Stage all changes
git commit -m "message" # Commit changes
git push                # Push to GitHub
git pull                # Pull latest changes

# Deployment
./quick-deploy.sh       # Quick deploy to Vercel
./deploy.sh             # Interactive deploy

# Utilities
npm install             # Install dependencies
rm -rf node_modules     # Clear dependencies
npm ci                  # Clean install
```

---

## 🐛 Quick Fixes

### Build fails?
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Environment variables not working?
1. Check Vercel Dashboard → Settings → Environment Variables
2. Verify all variables are set
3. Redeploy

### Preview not creating?
1. Check GitHub Actions running
2. Verify Vercel connected to GitHub
3. Check Vercel logs

---

## 📞 Need Help?

### Documentation
- Full guide: `GITHUB_VERCEL_DEPLOYMENT.md`
- Contributing: `CONTRIBUTING.md`
- Setup: `GITHUB_SETUP_COMPLETE.md`

### Support
- Email: support@propreel.co.za
- Status: status.propreel.co.za
- GitHub Issues: Your repository issues page

---

## ✅ Checklist

### First Time Setup
- [ ] GitHub repository created
- [ ] Code pushed to GitHub
- [ ] Vercel project connected
- [ ] Environment variables configured
- [ ] Custom domain added
- [ ] DNS records updated
- [ ] SSL certificate issued
- [ ] Supabase redirect URLs configured
- [ ] All features tested

### Before Each Push
- [ ] Code tested locally
- [ ] Build successful
- [ ] No console errors
- [ ] Documentation updated (if needed)
- [ ] Commit message clear

### After Each Deployment
- [ ] Site loads correctly
- [ ] All features working
- [ ] No errors in logs
- [ ] Mobile responsive
- [ ] Performance acceptable

---

## 🎉 You're Ready!

Your project is fully configured for GitHub + Vercel deployment.

**Quick Deploy:**
```bash
git add .
git commit -m "Update"
git push origin main
# → Automatic deployment!
```

**Production URL:** https://propreel.co.za  
**GitHub:** https://github.com/YOUR_USERNAME/propreel  
**Vercel:** https://vercel.com/dashboard

---

**Status:** ✅ Ready for Deployment  
**Configuration:** ✅ Complete  
**Documentation:** ✅ Comprehensive  
**Automation:** ✅ Enabled  

🚀 **Happy coding and deploying!**
