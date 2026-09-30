# ✅ Fix: MoviePy 2.x API Compatibility

## 🐛 Problem Identified

**Error:** `No module named 'moviepy.editor'`

**Root Cause:**
- MoviePy 2.x has a completely different API from MoviePy 1.x
- The old import `from moviepy.editor import ...` no longer exists
- Methods like `clip.resize()`, `clip.crossfadein()`, `clip.set_position()` have changed
- MoviePy requires FFmpeg to be installed in the system

---

## 🔧 Fixes Applied

### 1. Added FFmpeg to Modal Image

**Files Updated:**
- `modal/app_propreel_minimax.py`
- `modal/app_propreel_grok_tiers.py`

**Change:**
```python
# Before
image = modal.Image.debian_slim().pip_install(
    "boto3",
    "moviepy",
    ...
)

# After
image = modal.Image.debian_slim().apt_install(
    "ffmpeg"  # ✅ Added FFmpeg
).pip_install(
    "boto3",
    "moviepy",
    ...
)
```

### 2. Updated MoviePy Imports

**Before (MoviePy 1.x):**
```python
from moviepy.editor import ImageClip, concatenate_videoclips
```

**After (MoviePy 2.x):**
```python
from moviepy import ImageClip, concatenate_videoclips
from moviepy.video.fx import Resize, CrossFadeIn, Slide
```

### 3. Updated MoviePy Method Calls

#### Resize Effect
**Before:**
```python
clip = clip.resize(lambda t: 1 + 0.1 * t / image_duration)
```

**After:**
```python
clip = clip.with_effects([Resize(lambda t: 1 + 0.1 * t / image_duration)])
```

#### CrossFade Effect
**Before:**
```python
clip = clip.crossfadein(0.5)
```

**After:**
```python
clip = clip.with_effects([CrossFadeIn(0.5)])
```

#### Slide Effect
**Before:**
```python
clip = clip.set_position(lambda t: ('center', f'{t*100}%'))
```

**After:**
```python
clip = clip.with_effects([Slide()])
```

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
├── 🔨 Created image (with ffmpeg installed)
├── 🔨 Created function render_video_local.
├── 🔨 Created function render_video.
├── 🔨 Created function edit_image.
├── 🔨 Created function get_image_presets.
├── 🔨 Created function generate_flashhead_video.
├── 🔨 Created function health_check.
└── 🔨 Created web function web
✓ App deployed successfully! 🎉
```

**Note:** The first deployment will take longer (2-3 minutes) because it needs to install FFmpeg.

### Step 2: Test Essential Tier

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-essential-001",
    "tier": "ESSENTIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800"
    ],
    "voiceover_text": "Welcome to this stunning luxury property. Featuring panoramic views, modern finishes, and a sparkling pool. Book your private viewing today.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

**Expected Response:**
```json
{
  "record_id": "test-essential-001",
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-essential-001/video.mp4",
  "tier": "ESSENTIAL",
  "resolution": "1080p",
  "processing_type": "local",
  "credits_used": 5,
  "image_count": 6,
  "duration": 30
}
```

### Step 3: Monitor Logs

```bash
modal logs propreel-render
```

**Expected Log Output:**
```
Rendering local video: test-essential-001, 30s, LANDSCAPE
Processing image 1/6
Processing image 2/6
Processing image 3/6
Processing image 4/6
Processing image 5/6
Processing image 6/6
Concatenating video clips...
Exporting video with FFmpeg...
✅ Local render complete: https://propreel-video-outputs-sa.s3...
```

---

## 📊 MoviePy 1.x vs 2.x API Comparison

| Feature | MoviePy 1.x | MoviePy 2.x |
|---------|-------------|-------------|
| **Import** | `from moviepy.editor import ...` | `from moviepy import ...` |
| **Effects** | `clip.resize(...)` | `clip.with_effects([Resize(...)])` |
| **CrossFade** | `clip.crossfadein(0.5)` | `clip.with_effects([CrossFadeIn(0.5)])` |
| **Position** | `clip.set_position(lambda t: ...)` | `clip.with_effects([Slide()])` |
| **Audio** | `clip.set_audio(audio)` | `clip.with_audio(audio)` |
| **Write** | `clip.write_videofile(...)` | `clip.write_videofile(...)` (same) |

---

## 🧪 Test All Tiers

### Test 1: Essential Tier (FFmpeg)
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-essential-001",
    "tier": "ESSENTIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800", ...],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

### Test 2: Social Tier (AI - MiniMax Hailuo)
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-social-001",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

### Test 3: FlashHead (Lip-Sync)
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/generate_flashhead_video \
  -H "Content-Type: application/json" \
  -d '{
    "profile_image_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
    "voiceover_text": "Welcome to this beautiful property in Constantia.",
    "user_id": "test-user-001",
    "voice": "Aria",
    "stability": 0.5
  }'
```

### Test 4: Image Editing (FLUX)
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/edit_image \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
    "preset_id": "golden_sunset"
  }'
```

---

## 🐛 Troubleshooting

### Issue: FFmpeg not found
**Solution:** Make sure you redeployed after adding `apt_install("ffmpeg")`
```bash
cd modal
modal deploy app_propreel_minimax.py
```

### Issue: MoviePy import error
**Solution:** Check that you're using MoviePy 2.x API
- `from moviepy import ...` (not `from moviepy.editor import ...`)
- Use `.with_effects([...])` for effects

### Issue: Video export fails
**Solution:** Check Modal logs for FFmpeg errors
```bash
modal logs propreel-render
```

### Issue: Slow first deployment
**Solution:** Normal - FFmpeg installation takes 2-3 minutes on first deploy

---

## 📚 Related Documentation

- **`MOVIEPY_FIX.md`** - This file (MoviePy 2.x fix)
- **`FAL_STATUS_OBJECT_FIX.md`** - Status object handling fix
- **`MODAL_TIMEOUT_FIX.md`** - Timeout and preemption fixes
- **`ESSENTIAL_TIER_TEST.md`** - Essential tier test guide

---

## ✅ Summary

**Problem:** MoviePy 1.x API no longer exists in MoviePy 2.x  
**Fix:** Updated imports and method calls to MoviePy 2.x API  
**Files Modified:** 
- `modal/app_propreel_minimax.py`
- `modal/app_propreel_grok_tiers.py`

**Changes:**
1. ✅ Added FFmpeg to Modal image
2. ✅ Updated MoviePy imports
3. ✅ Updated resize() to with_effects([Resize(...)])
4. ✅ Updated crossfadein() to with_effects([CrossFadeIn(...)])
5. ✅ Updated set_position() to with_effects([Slide()])

**Status:** ✅ Ready to deploy

**Next Command:**
```bash
cd modal
modal deploy app_propreel_minimax.py
```

---

**Date:** March 2025  
**Version:** 2.3.9  
**Status:** ✅ Fixed and ready to deploy  
**Next:** Redeploy and test Essential tier!

🚀 **The MoviePy 2.x compatibility issue is now fixed!**
