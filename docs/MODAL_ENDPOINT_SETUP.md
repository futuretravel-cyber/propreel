# 🚀 Modal Render Endpoint Setup Guide

## Overview

Your Modal render endpoint is the backend service that generates property videos. This guide will help you deploy it and configure the endpoint URL.

---

## 📋 Prerequisites

Before setting up the Modal endpoint, ensure you have:

- ✅ Modal account created and authenticated
- ✅ AWS credentials configured in Modal secrets
- ✅ Modal CLI installed (`pip install modal`)
- ✅ Python 3.8+ installed

---

## 🔧 Step-by-Step Setup

### Step 1: Verify Modal Authentication

Check if you're authenticated with Modal:

```bash
modal token inspect
```

If not authenticated, run:

```bash
modal setup
```

Follow the browser authentication flow.

---

### Step 2: Configure AWS Secrets in Modal

Your Modal app needs AWS credentials to upload videos to S3. Create a Modal secret:

```bash
modal secret create aws-credentials \
  AWS_ACCESS_KEY_ID=your_aws_access_key \
  AWS_SECRET_ACCESS_KEY=your_aws_secret_key \
  AWS_REGION=af-south-1 \
  AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa
```

**Get your AWS credentials from:**
```bash
cat deploy/credentials/aws-credentials.txt
```

---

### Step 3: Deploy the Modal App

Navigate to the modal directory and deploy:

```bash
cd modal
modal deploy app_propreel_grok_tiers.py
```

**What happens:**
- Modal builds the Docker image with dependencies
- Uploads your app to Modal's cloud
- Creates a public endpoint URL
- Shows you the endpoint in the output

**Expected output:**
```
✓ Created function render_video
✓ Created function health_check
✓ Created function process_render_queue
✓ Built image
✓ Deployed app propreel-render

App URL: https://your-username--propreel-render.modal.run
```

---

### Step 4: Get Your Endpoint URL

After deployment, Modal will display your endpoint URL. It looks like:

```
https://your-username--propreel-render.modal.run
```

**Copy this URL** - you'll need it for the next step.

---

### Step 5: Update Your .env File

Open your `.env` file and update the Modal endpoint:

```bash
# Find and replace this line:
MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run

# With your actual endpoint:
MODAL_RENDER_ENDPOINT=https://futuretravel--propreel-render.modal.run
```

**Your actual username will be different!** Use the URL from Step 4.

---

### Step 6: Test the Endpoint

Verify your endpoint is working:

```bash
# Test health check
curl https://your-username--propreel-render.modal.run/health

# Expected response:
# {"status":"healthy","service":"propreel-render","version":"1.0.0"}
```

---

## 🔍 Finding Your Endpoint URL

### Method 1: From Deployment Output

When you run `modal deploy`, the URL is shown at the end:

```bash
cd modal
modal deploy app_propreel_grok_tiers.py
# Look for "App URL:" in the output
```

### Method 2: From Modal Dashboard

1. Go to https://modal.com
2. Click on your app: `propreel-render`
3. Find the "Endpoint" or "URL" section
4. Copy the URL

### Method 3: Using Modal CLI

```bash
modal app list
# Find your app and get the URL
```

---

## 🧪 Testing Your Setup

### Test 1: Health Check

```bash
curl https://your-username--propreel-render.modal.run/health
```

**Expected:**
```json
{
  "status": "healthy",
  "service": "propreel-render",
  "version": "1.0.0"
}
```

### Test 2: Render Queue Status

```bash
curl https://your-username--propreel-render.modal.run/queue/status
```

**Expected:**
```json
{
  "pending": 0,
  "processing": 0,
  "completed": 0,
  "failed": 0
}
```

### Test 3: Full Render Test

Create a test render request:

```bash
curl -X POST https://your-username--propreel-render.modal.run/render \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test_001",
    "tier": "ESSENTIAL",
    "orientation": "LANDSCAPE",
    "images": ["https://example.com/image1.jpg"],
    "voiceover_text": "Welcome to this beautiful property",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

**Expected:** Job ID returned, video will be processed and uploaded to S3.

---

## 🐛 Troubleshooting

### Issue: "modal: command not found"

**Solution:**
```bash
pip install modal
```

### Issue: Authentication failed

**Solution:**
```bash
modal token clear
modal setup
```

### Issue: AWS credentials error

**Solution:**
```bash
# Recreate the secret
modal secret create aws-credentials \
  AWS_ACCESS_KEY_ID=your_key \
  AWS_SECRET_ACCESS_KEY=your_secret \
  AWS_REGION=af-south-1 \
  AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa
```

### Issue: Deployment fails

**Solution:**
```bash
# Check logs
modal logs propreel-render

# Redeploy
cd modal
modal deploy app_propreel_grok_tiers.py
```

### Issue: Endpoint not responding

**Solution:**
1. Check if app is deployed: `modal app list`
2. Check logs: `modal logs propreel-render`
3. Verify URL is correct in `.env`

---

## 📊 Modal App Functions

Your Modal app exposes these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/render` | POST | Submit render job |
| `/queue/status` | GET | Queue statistics |
| `/job/{id}` | GET | Get job status |

---

## 💰 Modal Pricing

Modal charges based on usage:
- **CPU time:** ~$0.0001/second
- **Memory:** ~$0.00005/GB-second
- **GPU time:** ~$0.0005/second (if using GPU)

**Estimated cost per video:**
- ESSENTIAL (15s): ~$0.01
- SOCIAL (30s): ~$0.02
- CINEMATIC (60s): ~$0.04
- PREMIUM (120s): ~$0.08

Monitor usage: https://modal.com/dashboard

---

## 🔄 Updating the Modal App

When you make changes to `app_propreel_grok_tiers.py`:

```bash
cd modal
modal deploy app_propreel_grok_tiers.py
```

The endpoint URL stays the same, so no need to update `.env`.

---

## 📝 Environment Variables Summary

Your `.env` file should have:

```env
# Modal Render Endpoint
MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run

# AWS Configuration (used by Modal)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=af-south-1
AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa
```

---

## ✅ Checklist

- [ ] Modal CLI installed
- [ ] Modal authenticated (`modal token inspect`)
- [ ] AWS secrets created in Modal
- [ ] Modal app deployed (`modal deploy`)
- [ ] Endpoint URL copied
- [ ] `.env` file updated with endpoint
- [ ] Health check test passed
- [ ] Render test passed (optional)

---

## 🎯 Quick Commands

```bash
# Deploy Modal app
cd modal
modal deploy app_propreel_grok_tiers.py

# Check app status
modal app list

# View logs
modal logs propreel-render

# Test endpoint
curl https://your-username--propreel-render.modal.run/health

# Update .env
nano .env  # or use your preferred editor
```

---

## 📞 Support

- **Modal Documentation:** https://modal.com/docs
- **Modal Dashboard:** https://modal.com/dashboard
- **PropReel Support:** support@propreel.co.za

---

## 🎉 You're Done!

Once you've completed all steps:
1. ✅ Modal app deployed
2. ✅ Endpoint URL in `.env`
3. ✅ Health check passing

Your video rendering backend is ready to use!

**Next:** Test the full workflow by creating a video in the PropReel Studio.
