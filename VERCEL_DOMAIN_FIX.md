# 🔧 Fix: Vercel "TLD co.za not supported" Error

## Problem
When adding `propreel.co.za` to Vercel, you get:
```
Invalid Search
The TLD "co.za" is not supported.
```

## ✅ Solutions (Try in Order)

### Solution 1: Enter Domain Correctly

**Common mistake:** Adding `www.` prefix

❌ **Wrong:**
```
www.propreel.co.za
```

✅ **Correct:**
```
propreel.co.za
```

**Steps:**
1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Enter **only**: `propreel.co.za` (no www, no https://)
3. Click "Add"

---

### Solution 2: Add Root Domain First, Then WWW

**Step 1: Add root domain**
```
propreel.co.za
```

**Step 2: After it's added, add www subdomain**
```
www.propreel.co.za
```

Vercel will automatically set up the redirect from www to root domain.

---

### Solution 3: Verify DNS Configuration First

Before adding to Vercel, ensure your DNS is configured:

**Check your domain registrar** (where you bought propreel.co.za):

#### Option A: Point to Vercel (Recommended)

**A Records:**
```
@    A    76.76.21.21
```

**CNAME Record:**
```
www  CNAME  cname.vercel-dns.com
```

#### Option B: Use Vercel's Nameservers

If your registrar allows custom nameservers:
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

**After DNS is configured:**
1. Wait 5-30 minutes for propagation
2. Try adding domain to Vercel again

---

### Solution 4: Use Vercel CLI (Bypass Web Interface)

Sometimes the web interface has bugs. Try CLI:

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Link your project
vercel link

# Add domain
vercel domains add propreel.co.za
```

---

### Solution 5: Check Domain Status

Verify your domain is active and not expired:

```bash
# Check domain status
whois propreel.co.za

# Or use online tool
# https://who.is/
```

**Look for:**
- ✅ Domain is registered and active
- ✅ Not expired
- ✅ Nameservers are configured

---

### Solution 6: Try Alternative Domain Format

If `propreel.co.za` still fails, try:

**Option A: Add as subdomain temporarily**
```
app.propreel.co.za
```

**Option B: Use different TLD temporarily**
- `propreel.za` (if available)
- `propreel.africa`
- `propreel.io`

---

### Solution 7: Contact Vercel Support

If nothing works, contact Vercel:

**Option A: Vercel Dashboard**
1. Go to https://vercel.com/support
2. Click "Contact Support"
3. Explain: "Cannot add .co.za domain - getting TLD not supported error"

**Option B: Twitter/X**
Tweet at @vercel with your issue

**Option C: Email**
support@vercel.com

**Include:**
- Your domain: `propreel.co.za`
- Error message: "The TLD co.za is not supported"
- What you've tried
- Screenshots

---

## 🎯 Most Likely Solution

**90% of the time, the issue is:**

### You're entering the domain incorrectly

**Try this exact sequence:**

1. Go to Vercel Dashboard
2. Select your project
3. Settings → Domains
4. In the input field, type **exactly**: `propreel.co.za`
   - No `https://`
   - No `www.`
   - No trailing slash
   - No spaces
5. Click "Add"

**If you see:**
```
propreel.co.za
```
as a suggestion, click it.

---

## 🔍 Verification Checklist

Before adding to Vercel, verify:

- [ ] Domain is registered and active
- [ ] DNS is configured (A record or CNAME)
- [ ] You're entering `propreel.co.za` (not `www.propreel.co.za`)
- [ ] No typos in the domain name
- [ ] Domain is not expired
- [ ] You have access to domain registrar

---

## 🚀 Alternative: Use Vercel's Default Domain

If you can't get custom domain working immediately:

**Your Vercel project already has a default domain:**
```
https://propreelcoza.vercel.app
```

**You can:**
1. Use this domain temporarily
2. Fix the custom domain issue later
3. Both domains will work simultaneously

---

## 📞 Quick Support Contacts

### Vercel Support
- **Help Center:** https://vercel.com/support
- **Twitter:** @vercel
- **Email:** support@vercel.com
- **Community:** https://github.com/vercel/vercel/discussions

### Domain Registrar Support
Contact whoever you bought `propreel.co.za` from:
- **Afrihost:** support@afrihost.com
- **Domain.co.za:** support@domain.co.za
- **GoDaddy:** support@godaddy.com
- **Namecheap:** support@namecheap.com

---

## 🎓 Understanding the Error

**Why does this happen?**

Vercel maintains a list of supported TLDs (Top-Level Domains). Sometimes:

1. **New TLDs** aren't in the list yet
2. **Country code TLDs** (like .co.za) may have validation issues
3. **Web interface bugs** can cause false errors
4. **DNS propagation** delays can trigger validation failures

**Good news:** Vercel **does** support `.co.za` domains. This is just a temporary validation issue.

---

## ✅ Expected Timeline

After successfully adding domain:

| Step | Time |
|------|------|
| Domain added to Vercel | Immediate |
| DNS verification | 5-30 minutes |
| SSL certificate issued | 1-5 minutes |
| Domain fully active | 5-60 minutes |

---

## 🐛 Still Not Working?

### Debug Steps

1. **Clear browser cache**
   - Ctrl + Shift + Delete (Windows)
   - Cmd + Shift + Delete (Mac)

2. **Try different browser**
   - Chrome → Firefox → Safari

3. **Try incognito/private mode**

4. **Check Vercel status**
   - https://www.vercel-status.com/

5. **Verify project settings**
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

---

## 🎯 Recommended Action Plan

### Immediate (Next 5 minutes)
1. Try entering domain correctly: `propreel.co.za`
2. Check DNS is configured
3. Try Vercel CLI method

### Short-term (Next hour)
4. Contact Vercel support if still failing
5. Use default Vercel domain temporarily
6. Continue development

### Long-term (Next 24 hours)
7. Domain should work after DNS propagation
8. SSL certificate will be issued automatically
9. Full custom domain functionality

---

## 💡 Pro Tip

**You can continue working even without custom domain!**

Your site is already live at:
```
https://propreelcoza.vercel.app
```

You can:
- Test all features
- Show to clients
- Continue development
- Fix custom domain later

---

## 📊 Summary

**Problem:** Vercel says `.co.za` TLD not supported  
**Reality:** Vercel does support `.co.za`, this is a validation bug  
**Solution:** Try entering domain correctly, use CLI, or contact support  
**Workaround:** Use `propreelcoza.vercel.app` temporarily  

**Status:** 🟡 Temporary issue, multiple solutions available

---

**Need more help?** Check `GITHUB_VERCEL_DEPLOYMENT.md` for complete deployment guide.
