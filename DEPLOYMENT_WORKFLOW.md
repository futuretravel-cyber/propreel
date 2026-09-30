# 🚀 PropReel Deployment Guide

## Quick Start

After completing work, deploy with one command:

```bash
# Option 1: Interactive deployment (choose your method)
./deploy.sh

# Option 2: Quick deploy to Vercel (recommended)
./quick-deploy.sh

# Option 3: Create ZIP package for manual upload
./deploy.sh
# Then choose option 6
```

---

## 📦 Deployment Methods

### 1. Vercel (Recommended) ⭐

**Best for:** Production deployments, automatic updates, custom domains

**Setup:**
```bash
# Install Vercel CLI (one-time)
npm install -g vercel

# Login (one-time)
vercel login

# Deploy
vercel --prod
```

**Benefits:**
- ✅ Free tier available
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Preview deployments
- ✅ Custom domains
- ✅ Zero configuration

**Workflow:**
1. Complete your work
2. Run `./quick-deploy.sh`
3. Your site is live in ~30 seconds!

---

### 2. Netlify

**Best for:** Static sites, form handling, serverless functions

**Setup:**
```bash
# Install Netlify CLI (one-time)
npm install -g netlify-cli

# Login (one-time)
netlify login

# Deploy
netlify deploy --prod --dir=dist
```

**Benefits:**
- ✅ Free tier available
- ✅ Automatic HTTPS
- ✅ Form handling
- ✅ Split testing
- ✅ Rollbacks

---

### 3. cPanel / Shared Hosting

**Best for:** Existing hosting, traditional setup

**Method A: File Manager**
1. Build: `npm run build`
2. Log in to cPanel
3. Open File Manager
4. Navigate to `public_html`
5. Delete old files (backup first!)
6. Upload all files from `dist/` folder
7. Done!

**Method B: FTP**
```bash
# Using FileZilla or similar:
Host: your-domain.com
Username: your cPanel username
Password: your cPanel password
Port: 21
Directory: /public_html/

# Upload contents of dist/ folder
```

**Method C: ZIP Upload**
```bash
# Create deployment package
./deploy.sh
# Choose option 6

# Upload ZIP to cPanel File Manager
# Extract in public_html
```

---

### 4. GitHub Pages

**Best for:** Free hosting, open source projects

**Setup:**
```bash
# Install gh-pages (one-time)
npm install --save-dev gh-pages
```

**Add to package.json:**
```json
{
  "scripts": {
    "deploy": "gh-pages -d dist"
  }
}
```

**Deploy:**
```bash
npm run deploy
```

**Note:** Your site will be at `https://username.github.io/repo-name/`

---

### 5. Manual ZIP Package

**Best for:** Any hosting provider, offline deployment

```bash
# Create deployment package
./deploy.sh
# Choose option 6

# This creates: propreel-deploy-YYYYMMDD_HHMMSS.zip
# Upload to your hosting and extract
```

---

## 🔄 Development Workflow

### Local Development
```bash
# Start development server
npm run dev

# Open http://localhost:5173
```

### Preview Production Build
```bash
# Build and preview
npm run build
npm run preview

# Open http://localhost:4173
```

### Deploy to Production
```bash
# Quick deploy
./quick-deploy.sh

# Or interactive deploy
./deploy.sh
```

---

## 📋 Deployment Checklist

Before deploying:

- [ ] Test locally: `npm run dev`
- [ ] Build succeeds: `npm run build`
- [ ] Preview works: `npm run preview`
- [ ] No console errors
- [ ] All features working
- [ ] Environment variables set (if needed)

After deploying:

- [ ] Site loads correctly
- [ ] All pages accessible
- [ ] Forms working
- [ ] Images loading
- [ ] No broken links
- [ ] Mobile responsive

---

## 🎯 Recommended Workflow

### For Solo Developers

```bash
# 1. Make changes
# 2. Test locally
npm run dev

# 3. Build
npm run build

# 4. Deploy
./quick-deploy.sh

# Total time: ~1 minute
```

### For Teams

```bash
# 1. Push to Git
git add .
git commit -m "Update feature X"
git push origin main

# 2. Vercel/Netlify auto-deploys
# (if connected to Git repo)
```

---

## 🔧 Environment Variables

If your app needs environment variables:

### Vercel
```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
# ... add all variables
```

### Netlify
Add in Netlify Dashboard → Site settings → Environment variables

### Local Development
Create `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## 🐛 Troubleshooting

### Build fails
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Deploy fails
```bash
# Check Vercel/Netlify logs
vercel logs
# or
netlify logs
```

### Site not updating
```bash
# Hard refresh browser
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)

# Or clear cache
```

### 404 errors on refresh
Make sure `.htaccess` (Apache) or `vercel.json` is configured:

**vercel.json:**
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**_redirects (Netlify):**
```
/*    /index.html   200
```

**.htaccess (Apache/cPanel):**
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

---

## 📊 Deployment Comparison

| Platform | Cost | Speed | Custom Domain | Auto HTTPS | Best For |
|----------|------|-------|---------------|------------|----------|
| Vercel | Free | ⚡⚡⚡ | ✅ | ✅ | Production |
| Netlify | Free | ⚡⚡⚡ | ✅ | ✅ | Static sites |
| cPanel | Included | ⚡ | ✅ | Maybe | Existing hosting |
| GitHub Pages | Free | ⚡⚡ | ✅ | ✅ | Open source |
| Manual ZIP | Varies | ⚡ | ✅ | Maybe | Any hosting |

---

## 🎓 Best Practices

### 1. Use Git
```bash
git init
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Connect to Vercel/Netlify
- Link your Git repo
- Auto-deploy on push
- Preview deployments for PRs

### 3. Environment Variables
- Never commit `.env` to Git
- Use platform's env variable system
- Keep secrets secure

### 4. Custom Domain
- Buy domain (Namecheap, Google Domains)
- Point DNS to Vercel/Netlify
- Enable HTTPS (automatic)

### 5. Monitoring
- Set up error tracking (Sentry)
- Monitor uptime (UptimeRobot)
- Track analytics (Google Analytics)

---

## 📞 Quick Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run preview         # Preview production build

# Deployment
./deploy.sh             # Interactive deploy
./quick-deploy.sh       # Quick deploy to Vercel
vercel --prod           # Deploy to Vercel
netlify deploy --prod   # Deploy to Netlify

# Utilities
npm install             # Install dependencies
npm update              # Update dependencies
rm -rf dist             # Clean build folder
```

---

## 🎉 You're Ready!

Your deployment workflow is now set up. After completing work:

1. **Test locally:** `npm run dev`
2. **Build:** `npm run build`
3. **Deploy:** `./quick-deploy.sh`

That's it! Your site will be live in seconds.

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

---

**Need help?** Check the troubleshooting section or contact support.
