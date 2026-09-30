# 🧪 Test Essential Tier (FFmpeg - No AI)

## 📊 Essential Tier Overview

**Processing Type:** Local FFmpeg (NO AI)
- **Model:** None (uses moviepy + PIL + FFmpeg)
- **Resolution:** 1080p (1920×1080)
- **Effect:** Zoom/pan on images
- **Cost:** 5 credits (30s) or 10 credits (60s)
- **Speed:** Fast (~10-30 seconds)

---

## 🚀 Test Command

### Test 1: Essential Tier - 30 seconds, 6 images

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

### Test 2: Essential Tier - 60 seconds, 12 images

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-essential-002",
    "tier": "ESSENTIAL",
    "config_index": 1,
    "orientation": "LANDSCAPE",
    "images": [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800",
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800"
    ],
    "voiceover_text": "Welcome to this stunning luxury property. Featuring panoramic views, modern finishes, and a sparkling pool. This beautiful home offers everything you need for comfortable living. Book your private viewing today.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

**Expected Response:**
```json
{
  "record_id": "test-essential-002",
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-essential-002/video.mp4",
  "tier": "ESSENTIAL",
  "resolution": "1080p",
  "processing_type": "local",
  "credits_used": 10,
  "image_count": 12,
  "duration": 60
}
```

---

## 📊 Comparison: Essential vs AI Tiers

| Feature | Essential (FFmpeg) | SOCIAL (AI) | CINEMATIC (AI) | PREMIUM (AI) |
|---------|-------------------|-------------|----------------|--------------|
| **Model** | None (FFmpeg) | MiniMax Hailuo | MiniMax Hailuo | MiniMax Hailuo |
| **Processing** | Local | fal.ai | fal.ai | fal.ai + upscale |
| **Resolution** | 1080p | 512P | 768P | 1080p |
| **Effect** | Zoom/Pan | AI motion | AI motion | AI motion |
| **Speed** | Fast (10-30s) | Slow (60-120s) | Slow (60-120s) | Slow (120-180s) |
| **Cost (30s)** | 5 credits | 30 credits | 40 credits | 60 credits |
| **Quality** | Good | Good | Better | Best |
| **Use Case** | Quick previews | Social media | Professional | Premium listings |

---

## 🔍 Monitor Logs

```bash
# Watch logs in real-time
modal logs propreel-render
```

**Expected Log Output for Essential Tier:**
```
Starting render job: test-essential-001
Tier: ESSENTIAL, Config: 0, Orientation: LANDSCAPE
Images: 6, Voice: Joanna
Processing type: local, Resolution: 1080p
Duration: 30s, Images: 6, Credits: 5
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

**Key Differences from AI Tiers:**
- ✅ No fal.ai API calls
- ✅ No "Generating AI clip" messages
- ✅ Uses moviepy/FFmpeg locally
- ✅ Much faster processing
- ✅ Lower cost

---

## 🧪 Verification Steps

### 1. Check Video on S3
```bash
# List files in S3
aws s3 ls s3://propreel-video-outputs-sa/renders/test-essential-001/

# Download video
aws s3 cp s3://propreel-video-outputs-sa/renders/test-essential-001/video.mp4 ./test-essential.mp4

# Check video properties
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,codec_name -of default=noprint_wrappers=1 test-essential.mp4
```

**Expected Output:**
```
duration=30.000000
size=12345678
width=1920
height=1080
codec_name=h264
```

### 2. Verify Credits Deducted
```bash
# Check credit transactions in Supabase
SELECT * FROM credit_transactions 
WHERE user_id = 'test-user-001' 
AND reason LIKE '%ESSENTIAL%'
ORDER BY created_at DESC;
```

**Expected:**
- 5 credits deducted for 30s video
- 10 credits deducted for 60s video

### 3. Play the Video
```bash
# Open video in player
vlc test-essential.mp4
```

**What to Check:**
- ✅ Resolution: 1920×1080 (1080p)
- ✅ Duration: 30 or 60 seconds
- ✅ Effect: Zoom/pan on each image
- ✅ Quality: Good (FFmpeg encoding)
- ✅ Audio: Voiceover (if added)

---

## 💡 When to Use Essential Tier

### ✅ Use Essential When:
- Quick property previews
- Internal use (not for marketing)
- Budget-conscious clients
- Fast turnaround needed
- Simple zoom/pan effects are sufficient

### ❌ Don't Use Essential When:
- Professional marketing videos
- Social media content
- Luxury property listings
- Need AI-generated motion
- Client expects cinematic quality

---

## 🐛 Troubleshooting

### Issue: Video has no motion
**Solution:** Essential tier uses simple zoom/pan. For AI motion, use SOCIAL/CINEMATIC/PREMIUM tiers.

### Issue: Video quality is low
**Solution:** Essential uses FFmpeg encoding. For better quality, use AI tiers.

### Issue: Processing is slow
**Solution:** Essential should be fast (10-30s). If slow, check Modal logs for errors.

### Issue: Wrong resolution
**Solution:** Essential should be 1080p. Check the `render_video_local()` function parameters.

---

## 📚 Related Documentation

- **`ESSENTIAL_TIER_TEST.md`** - This file
- **`VIDEO_RENDER_COMPLETE_TEST.md`** - All tiers test guide
- **`MODAL_TIMEOUT_FIX.md`** - Timeout and preemption fixes
- **`FAL_STATUS_OBJECT_FIX.md`** - Status object handling fix

---

## 🎯 Summary

**Essential Tier:**
- ✅ Uses FFmpeg (NO AI)
- ✅ 1080p resolution
- ✅ Zoom/pan effects
- ✅ Fast processing (10-30s)
- ✅ Low cost (5-10 credits)
- ✅ Good for quick previews

**AI Tiers (SOCIAL/CINEMATIC/PREMIUM):**
- ✅ Uses MiniMax Hailuo-02 AI
- ✅ 512P/768P/1080p resolutions
- ✅ AI-generated motion
- ✅ Slow processing (60-180s)
- ✅ Higher cost (30-150 credits)
- ✅ Best for marketing

---

**Test Command:**
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

---

**Date:** March 2025  
**Version:** 1.0.0  
**Status:** ✅ Ready to test  
**Tier:** ESSENTIAL (FFmpeg, NO AI)

🚀 **Test the Essential tier now!**
