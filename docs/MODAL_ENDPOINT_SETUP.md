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
modal deploy app_propreel_minimax.py
```

> ⚠️ **Always deploy `app_propreel_minimax.py` — never `app_propreel_grok_tiers.py`.**
> Both files declare the same Modal app name (`propreel-render`), but
> `app_propreel_grok_tiers.py` is a 211-line legacy stub with a different
> `render_video` signature and **no web endpoints**. Deploying it replaces the
> live app and strips `/render_video`, `/render_status`, `/cancel_render`,
> `/health`, `/probe`, the fal-health cron and every other function — the site
> would stop rendering immediately. The live worker is `app_propreel_minimax.py`
> (see `modal/DEPLOYMENT_GUIDE.md`).

**What happens:**
- Modal builds the Docker image with dependencies (ffmpeg, boto3, fal.ai, …)
- Mounts `app_propreel_minimax.py` and `image_prompts.py`
- Deploys the worker functions plus the FastAPI web endpoint
- Shows you the endpoint URL in the output

**Expected output (abridged):**
```
✓ Created objects.
├── 🔨 Created mount …\modal\app_propreel_minimax.py
├── 🔨 Created function render_video.
├── 🔨 Created function render_video_job.
├── 🔨 Created function render_video_local.
├── …  (15 functions in total: clip generation, edits, flashhead, crons, selftest)
└── 🔨 Created web function web =>
│   https://futuretravel--propreel-render-web.modal.run
✓ App deployed in ~10s! 🎉
```

Confirm the deployment version afterwards:

```bash
modal app history propreel-render
```

---

### Step 4: Get Your Endpoint URL

After deployment, Modal will display your endpoint URL. It looks like:

```
https://your-username--propreel-render-web.modal.run
```

Note the **`-web`** suffix — it comes from the FastAPI web function. The live
production URL is:

```
https://futuretravel--propreel-render-web.modal.run
```

**Copy this URL** - you'll need it for the next step.

---

### Step 5: Update Your .env File

Open your `.env` file and update the Modal endpoint:

```bash
# Find and replace this line:
VITE_MODAL_ENDPOINT=https://your-username--propreel-render-web.modal.run

# With your actual endpoint:
VITE_MODAL_ENDPOINT=https://futuretravel--propreel-render-web.modal.run
```

(The frontend falls back to this URL when the variable is unset — see
`RENDER_ENDPOINT` in `src/App.tsx`.)

**Your actual username will be different!** Use the URL from Step 4.

---

### Step 6: Test the Endpoint

Verify your endpoint is working:

```bash
# Test health check (tokenless — /health and /probe are the only open routes)
curl https://futuretravel--propreel-render-web.modal.run/health

# Expected response:
# {"status":"healthy","service":"propreel-render","version":"2.1.0",
#  "model":"fal-ai/minimax/hailuo-02","clip_duration":6,
#  "resolutions":["512p","720p","1080p"],"audio":false,
#  "flashhead":"fal-ai/flashhead/v1/lip-sync"}
```

---

## 🔍 Finding Your Endpoint URL

### Method 1: From Deployment Output

When you run `modal deploy`, the URL is shown at the end:

```bash
cd modal
modal deploy app_propreel_minimax.py
# Look for the "Created web function web =>" URL in the output
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

Every route except `/health` and `/probe` requires the `X-PropReel-Token`
header (a worker token minted by `GET /api/users?action=worker_token`), and
the money-spending routes (`/render_video`, `/edit_image`, `/flashhead`,
`/generate_flashhead_video`) additionally require a **single-use paid v2
token** from `POST /api/users?action=job_token` — unsigned requests are
rejected by design.

### Test 1: Health Check

```bash
curl https://futuretravel--propreel-render-web.modal.run/health
```

**Expected:**
```json
{
  "status": "healthy",
  "service": "propreel-render",
  "version": "2.1.0"
}
```

### Test 2: fal.ai Probe

```bash
curl https://futuretravel--propreel-render-web.modal.run/probe
```

**Expected:**
```json
{
  "healthy": true,
  "class": "healthy",
  "probe": "fal-ai",
  "service": "propreel-render"
}
```

### Test 3: Job Status Poll

```bash
curl -H "X-PropReel-Token: $WORKER_TOKEN" \
  "https://futuretravel--propreel-render-web.modal.run/render_status?record_id=pr_1700000000000_abcd"
```

Returns the S3-backed job status (`queued` / `processing` / `completed` /
`failed` / `cancelled`); an unknown id answers `404`.

### Test 4: Full Render Test

Full renders are paid (credits are charged when the token is minted), so the
canonical path is the Studio in the app. To exercise the endpoint directly,
mint a token with a signed-in session first:

```bash
TOKEN=$(curl -s -X POST "https://www.propreel.co.za/api/users?action=job_token" \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"scope":"render","tier":"SOCIAL","config_index":0}' | jq -r .token)

curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -H "X-PropReel-Token: $TOKEN" \
  -d '{
    "record_id": "test_001",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://example.com/image1.jpg"],
    "voiceover_text": "Welcome to this beautiful property",
    "voice_id": "Joanna",
    "include_agent_branding": true,
    "audio": false
  }'
```

**Expected:** `{"record_id":"test_001","status":"queued", …}` — then poll
`/render_status`. The token is consumed exactly once (a replay answers `409`).

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
modal app logs propreel-render

# Redeploy (always the minimax worker — see the Step 3 warning)
cd modal
modal deploy app_propreel_minimax.py
```

### Issue: Endpoint not responding

**Solution:**
1. Check if app is deployed: `modal app list`
2. Check logs: `modal app logs propreel-render`
3. Verify the URL is correct (`VITE_MODAL_ENDPOINT`, note the `-web` suffix)

---

## 📊 Modal App Functions

Your Modal app exposes these endpoints:

| Endpoint | Method | Auth | Description |
|----------|--------|-----|-------------|
| `/health` | GET | none | Health check |
| `/probe` | GET | none | fal.ai health + latency (`?refresh=true` to force) |
| `/render_video` | POST | paid v2 | Spawn a render (async; returns `queued`) |
| `/render_status` | GET | worker | Poll job status (`?record_id=`) |
| `/cancel_render` | POST | worker | Cancel an in-flight job (terminal state) |
| `/edit_image`, `/edit_status` | POST/GET | paid v2 / worker | Image editing jobs |
| `/generate_flashhead_video`, `/flashhead`, `/flashhead_status` | POST/GET | paid v2 / worker | Avatar / lip-sync jobs |
| `/generate_text`, `/get_image_presets`, `/make_thumbnail` | POST/GET | worker | Studio helpers |

All authenticated routes take the `X-PropReel-Token` header; the paid routes
require the v2 scope (`render` / `edit` / `flashhead`) that `?action=job_token`
mints after charging credits.

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

When you make changes to `app_propreel_minimax.py`:

```bash
cd modal
modal deploy app_propreel_minimax.py
```

The endpoint URL stays the same, so no need to update `.env`.

---

## 📝 Environment Variables Summary

Your `.env` file should have:

```env
# Modal Render Endpoint (frontend build variable)
VITE_MODAL_ENDPOINT=https://futuretravel--propreel-render-web.modal.run

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
- [ ] Modal app deployed (`modal deploy app_propreel_minimax.py`)
- [ ] Endpoint URL copied
- [ ] `.env` file updated with endpoint
- [ ] Health check test passed
- [ ] Render test passed (optional)

---

## 🎯 Quick Commands

```bash
# Deploy Modal app (live worker — never app_propreel_grok_tiers.py)
cd modal
modal deploy app_propreel_minimax.py

# Check app status / deployment history
modal app list
modal app history propreel-render

# View logs
modal app logs propreel-render

# Test endpoint
curl https://futuretravel--propreel-render-web.modal.run/health

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
