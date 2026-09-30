# 🚀 Modal Backend Deployment Guide

## ✅ FlashHead Integrated into Main App

The FlashHead lip-sync video functionality has been integrated into the main Modal app (`app_propreel_minimax.py`). You no longer need to deploy a separate FastAPI app.

---

## 📋 What's Included

The updated Modal app now includes:

1. **Video Rendering** (fal-ai/minimax/hailuo-02)
   - 4 tiers: Essential, Social, Cinematic, Premium
   - 6-second clips with rotating prompts
   - Resolutions: 512p, 720p, 1080p

2. **Image Editing** (fal-ai/flux/dev)
   - 29 professional presets
   - 2 credits per image
   - Optimized strength ranges

3. **FlashHead Lip-Sync** (fal-ai/flashhead/v1/lip-sync) ✨ NEW
   - Generate talking head videos from profile pictures
   - Uses AI voiceover scripts
   - 8 credits per video
   - Stored in AWS S3

---

## 🎯 Deployment Steps

### Step 1: Navigate to Modal Directory

```bash
cd modal
```

### Step 2: Deploy the Updated App

```bash
modal deploy app_propreel_minimax.py
```

**Expected Output:**
```
✓ Created objects.
├── 🔨 Created mount app_propreel_minimax.py
├── 🔨 Created function generate_ai_video_clip.
├── 🔨 Created function upscale_video.
├── 🔨 Created function render_video_local.
├── 🔨 Created function render_video.
├── 🔨 Created function edit_image.
├── 🔨 Created function get_image_presets.
├── 🔨 Created function generate_flashhead_video.  ← NEW!
└── 🔨 Created function health_check.
✓ App deployed successfully! 🎉

View Deployment: https://modal.com/apps/futuretravel/main/deployed/propreel-render
```

### Step 3: Verify Deployment

Check the health endpoint:

```bash
curl https://futuretravel--propreel-render.modal.run/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "propreel-render",
  "version": "2.1.0",
  "model": "fal-ai/minimax/hailuo-02",
  "clip_duration": 6,
  "resolutions": ["512p", "720p", "1080p"],
  "audio": false,
  "flashhead": "fal-ai/flashhead/v1/lip-sync"
}
```

---

## 🔧 Testing FlashHead

### Test via Modal CLI

```bash
modal run app_propreel_minimax.py::generate_flashhead_video \
  --profile-image-url "https://example.com/profile.jpg" \
  --voiceover-text "Welcome to this stunning property in Constantia." \
  --user-id "test-user-123"
```

### Test via Frontend

1. Go to Video Generator tab
2. Upload a profile picture
3. Generate a voiceover script
4. Enable "AI Talking Profile"
5. Click "Generate Lip-Sync Video"
6. Wait for processing (~30-60 seconds)
7. Preview the generated video

---

## 💳 Credit Costs

| Feature | Credits |
|---------|---------|
| Video Generation (Essential 30s) | 5 |
| Video Generation (Social 30s) | 30 |
| Video Generation (Cinematic 30s) | 40 |
| Video Generation (Premium 30s) | 60 |
| Image Editing (any preset) | 2 |
| **FlashHead Lip-Sync** | **8** |

---

## 📊 API Endpoints

After deployment, these endpoints are available:

### Video Rendering
- `render_video()` - Generate property videos
- `render_video_local()` - Local FFmpeg rendering (Essential tier)
- `generate_ai_video_clip()` - AI video clip generation
- `upscale_video()` - Upscale 720p to 1080p

### Image Editing
- `edit_image()` - Edit images with presets
- `get_image_presets()` - Get all available presets

### FlashHead ✨ NEW
- `generate_flashhead_video()` - Generate lip-synced videos

### Utility
- `health_check()` - Check service health

---

## 🔐 Required Secrets

Make sure these Modal secrets are configured:

```bash
# Check existing secrets
modal secret list

# If missing, create them:
modal secret create aws-credentials \
  AWS_ACCESS_KEY_ID=your_key \
  AWS_SECRET_ACCESS_KEY=your_secret \
  AWS_REGION=af-south-1 \
  AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa

modal secret create fal-credentials \
  FAL_KEY=your_fal_key
```

---

## 🐛 Troubleshooting

### Issue: "FastAPI object is not a Modal App"

**Solution:** This error occurred because the old `flashhead_endpoint.py` used FastAPI instead of Modal. We've fixed this by integrating FlashHead into the main Modal app.

### Issue: Deployment fails with missing secrets

**Solution:** Create the required secrets as shown above.

### Issue: FlashHead video generation fails

**Solution:** 
1. Check FAL_API_KEY is valid
2. Verify profile image URL is accessible
3. Check voiceover text is not empty
4. Review Modal logs: `modal logs propreel-render`

---

## 📝 Next Steps

After successful deployment:

1. ✅ Update frontend to call the new FlashHead endpoint
2. ✅ Test video generation with FlashHead
3. ✅ Verify credits are deducted correctly
4. ✅ Check S3 storage for generated videos
5. ✅ Monitor Modal logs for any errors

---

## 🎉 Success Criteria

Your deployment is successful when:

- [ ] `modal deploy` completes without errors
- [ ] Health check returns version 2.1.0
- [ ] FlashHead function is listed in deployed functions
- [ ] Test video generation works
- [ ] Videos are stored in S3
- [ ] Credits are deducted correctly

---

## 📞 Support

- **Modal Docs:** https://modal.com/docs
- **fal.ai Docs:** https://fal.ai/docs
- **PropReel Support:** support@propreel.co.za

---

**Deployment Date:** March 2025  
**Version:** 2.1.0  
**Status:** ✅ Ready to Deploy

🚀 **Run `modal deploy app_propreel_minimax.py` now!**
