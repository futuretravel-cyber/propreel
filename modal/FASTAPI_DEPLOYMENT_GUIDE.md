# 🚀 Modal FastAPI Deployment Guide

## ✅ What Was Fixed

Your Modal app now includes **FastAPI web endpoints** that can be called via HTTP from your frontend.

**Before:** Modal functions could only be called via Modal SDK
**After:** Modal functions are exposed as REST API endpoints via FastAPI

---

## 🎯 New API Endpoints

Your Modal app now exposes these HTTP endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| POST | `/render_video` | Generate property video |
| POST | `/generate_flashhead_video` | Generate lip-sync video |
| POST | `/edit_image` | Edit image with AI |
| GET | `/get_image_presets` | Get all image presets |

---

## 🚀 Deployment Steps

### Step 1: Redeploy Modal App

```bash
cd modal
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
├── 🔨 Created function generate_flashhead_video.
├── 🔨 Created function health_check.
└── 🔨 Created function web.  ← NEW! FastAPI web server
✓ App deployed successfully! 🎉

View Deployment: https://modal.com/apps/futuretravel/main/deployed/propreel-render
```

### Step 2: Test Health Endpoint

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

### Step 3: Test Image Presets Endpoint

```bash
curl https://futuretravel--propreel-render.modal.run/get_image_presets
```

**Expected Response:**
```json
[
  {
    "id": "golden_sunset",
    "label": "Golden Sunset",
    "category": "photo_editor",
    "prompt": "...",
    "negative_prompt": "...",
    "strength": { "min": 0.4, "max": 0.45, "default": 0.42 }
  },
  ...
]
```

---

## 🧪 Testing All Endpoints

### Test 1: Health Check
```bash
curl https://futuretravel--propreel-render.modal.run/health
```

### Test 2: Get Image Presets
```bash
curl https://futuretravel--propreel-render.modal.run/get_image_presets
```

### Test 3: Edit Image
```bash
curl -X POST https://futuretravel--propreel-render.modal.run/edit_image \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/test-image.jpg",
    "preset_id": "golden_sunset"
  }'
```

### Test 4: Generate FlashHead Video
```bash
curl -X POST https://futuretravel--propreel-render.modal.run/generate_flashhead_video \
  -H "Content-Type: application/json" \
  -d '{
    "profile_image_url": "https://example.com/profile.jpg",
    "voiceover_text": "Welcome to this beautiful property.",
    "user_id": "test-user-123",
    "voice_id": "Joanna"
  }'
```

### Test 5: Render Video
```bash
curl -X POST https://futuretravel--propreel-render.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "pr_test_123",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
    "voiceover_text": "Welcome to this stunning property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

---

## 📝 API Request/Response Formats

### POST /render_video

**Request:**
```json
{
  "record_id": "pr_123456",
  "tier": "SOCIAL",
  "config_index": 0,
  "orientation": "LANDSCAPE",
  "images": ["url1", "url2", "url3"],
  "voiceover_text": "Welcome to this property...",
  "voice_id": "Joanna",
  "include_agent_branding": true,
  "music_url": "https://..."
}
```

**Response:**
```json
{
  "record_id": "pr_123456",
  "status": "completed",
  "video_url": "https://s3.../video.mp4",
  "tier": "SOCIAL",
  "duration": 30,
  "credits_used": 30
}
```

### POST /generate_flashhead_video

**Request:**
```json
{
  "profile_image_url": "https://...",
  "voiceover_text": "Welcome to this property...",
  "user_id": "user_123",
  "voice_id": "Joanna"
}
```

**Response:**
```json
{
  "status": "completed",
  "video_url": "https://s3.../flashhead.mp4",
  "duration": 6.0,
  "user_id": "user_123",
  "credits_used": 8
}
```

### POST /edit_image

**Request:**
```json
{
  "image_url": "https://...",
  "preset_id": "golden_sunset",
  "strength": 0.42,
  "guidance_scale": 4.5
}
```

**Response:**
```json
{
  "status": "completed",
  "image_url": "https://s3.../edited.jpg",
  "preset_id": "golden_sunset",
  "credits_used": 2
}
```

---

## 🔧 Frontend Integration

Your frontend `ModalAPI` client is already configured to use these endpoints:

```typescript
// src/lib/modalClient.ts

const MODAL_ENDPOINT = 'https://futuretravel--propreel-render.modal.run';

export const ModalAPI = {
  async renderVideo(params) {
    const response = await fetch(`${MODAL_ENDPOINT}/render_video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },

  async generateFlashHeadVideo(params) {
    const response = await fetch(`${MODAL_ENDPOINT}/generate_flashhead_video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },

  async editImage(params) {
    const response = await fetch(`${MODAL_ENDPOINT}/edit_image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  },

  async getImagePresets() {
    const response = await fetch(`${MODAL_ENDPOINT}/get_image_presets`);
    return response.json();
  },

  async healthCheck() {
    const response = await fetch(`${MODAL_ENDPOINT}/health`);
    return response.json();
  }
};
```

---

## 🐛 Troubleshooting

### Issue: "invalid function call" error

**Solution:** You need to redeploy the Modal app with the FastAPI endpoints:
```bash
cd modal
modal deploy app_propreel_minimax.py
```

### Issue: CORS errors in browser

**Solution:** Add CORS middleware to FastAPI:
```python
from fastapi.middleware.cors import CORSMiddleware

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Endpoint returns 404

**Solution:** 
1. Verify Modal app is deployed
2. Check endpoint URL is correct
3. Verify FastAPI app is mounted correctly

### Issue: Function takes too long

**Solution:** 
- Video rendering can take 30-120 seconds
- Image editing can take 10-30 seconds
- FlashHead can take 30-60 seconds
- Consider adding timeout handling in frontend

---

## 📊 Deployment Checklist

- [ ] Redeploy Modal app with FastAPI endpoints
- [ ] Test `/health` endpoint
- [ ] Test `/get_image_presets` endpoint
- [ ] Test `/edit_image` endpoint
- [ ] Test `/generate_flashhead_video` endpoint
- [ ] Test `/render_video` endpoint
- [ ] Verify frontend can call all endpoints
- [ ] Check CORS is working
- [ ] Test credit deduction flow
- [ ] Verify videos/images are stored in S3

---

## 🎯 Next Steps

1. **Redeploy Modal app:**
   ```bash
   cd modal
   modal deploy app_propreel_minimax.py
   ```

2. **Test all endpoints** using curl commands above

3. **Update frontend** to use ModalAPI client (already done)

4. **Test end-to-end flow:**
   - Upload image
   - Edit with AI
   - Generate video
   - Generate FlashHead
   - Verify credits deducted

5. **Deploy to production:**
   ```bash
   npm run build
   vercel --prod
   ```

---

## 📞 Support

- **Modal Docs:** https://modal.com/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com
- **PropReel Support:** support@propreel.co.za

---

**Status:** ✅ Ready to Deploy  
**Version:** 2.1.0  
**Endpoints:** 5 HTTP API endpoints  
**Date:** March 2025

🚀 **Run `modal deploy app_propreel_minimax.py` now!**
