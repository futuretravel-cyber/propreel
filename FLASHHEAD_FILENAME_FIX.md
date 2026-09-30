# ✅ FlashHead Filename Generation Fix

## 🐛 Problem Identified

**Error:** `ValueError: invalid literal for int() with base 10: 'f08792bb6f73612e'`

**Root Cause:**
```python
# ❌ BROKEN CODE
video_key = f"flashhead/{user_id}/{int(os.urandom(8).hex())}.mp4"
```

The issue: `os.urandom(8).hex()` generates a 16-character hex string like `'f08792bb6f73612e'`, which is too large to convert to a Python integer. Python's `int()` function can't handle hex strings this large.

---

## 🔧 The Fix

**File:** `modal/app_propreel_minimax.py` (Line 613)

```python
# ✅ FIXED CODE
import uuid
video_key = f"flashhead/{user_id}/{uuid.uuid4().hex}.mp4"
```

**Why this works:**
- `uuid.uuid4().hex` generates a 32-character hex string (UUID)
- We use it directly as a string (no conversion to int)
- Guaranteed to be unique
- Standard Python practice for unique filenames

---

## 🚀 Deploy the Fix

### Step 1: Redeploy Modal Backend
```bash
cd modal
modal deploy app_propreel_minimax.py
```

**Expected Output:**
```
✓ Created objects.
├── 🔨 Created function generate_flashhead_video.
├── 🔨 Created function health_check.
└── 🔨 Created web function web
✓ App deployed successfully! 🎉
```

### Step 2: Test the API
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

**Expected Response:**
```json
{
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/flashhead/test-user-001/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.mp4",
  "duration": 8.5,
  "seed": 12345,
  "user_id": "test-user-001",
  "credits_used": 8,
  "model": "fal-ai/flashhead",
  "voice": "Aria"
}
```

### Step 3: Verify S3 Storage
```bash
# Check that the video was uploaded to S3
aws s3 ls s3://propreel-video-outputs-sa/flashhead/test-user-001/
```

**Expected Output:**
```
2025-03-14 12:34:56    1234567 a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.mp4
```

---

## 📊 What Changed

### Before (Broken)
```python
import os

# Generate random bytes
random_bytes = os.urandom(8)  # 8 bytes = 16 hex chars
hex_string = random_bytes.hex()  # e.g., 'f08792bb6f73612e'

# Try to convert to int (FAILS for large hex strings)
random_int = int(hex_string)  # ❌ ValueError!

# Use in filename
video_key = f"flashhead/{user_id}/{random_int}.mp4"
```

### After (Fixed)
```python
import uuid

# Generate UUID
random_uuid = uuid.uuid4()  # Standard UUID
hex_string = random_uuid.hex  # 32 hex chars, e.g., 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'

# Use directly as string (no conversion needed)
video_key = f"flashhead/{user_id}/{hex_string}.mp4"  # ✅ Works!
```

---

## 🧪 Testing Checklist

### Backend Tests
- [ ] Modal deployment successful
- [ ] No ValueError in logs
- [ ] Video generated successfully
- [ ] Video uploaded to S3 with UUID filename
- [ ] Response contains valid video_url

### S3 Verification
- [ ] Check S3 bucket: `aws s3 ls s3://propreel-video-outputs-sa/flashhead/`
- [ ] Verify filename format: `flashhead/{user_id}/{uuid}.mp4`
- [ ] Verify file size: Should be ~1-5 MB
- [ ] Verify content type: `video/mp4`

### Frontend Tests
- [ ] Video URL is accessible
- [ ] Video plays in browser
- [ ] Video integrates into property reel
- [ ] No CORS errors

---

## 🐛 Troubleshooting

### Issue: Still getting ValueError
**Solution:** Make sure you redeployed the Modal backend
```bash
cd modal
modal deploy app_propreel_minimax.py
```

### Issue: Video not uploading to S3
**Solution:** Check AWS credentials
```bash
modal secret list
# Verify aws-credentials secret exists
```

### Issue: Video URL returns 404
**Solution:** Check S3 bucket permissions
```bash
aws s3 ls s3://propreel-video-outputs-sa/flashhead/test-user-001/
# Verify file exists and is public
```

---

## 📝 Code Changes Summary

### File: `modal/app_propreel_minimax.py`

**Line 613:**
```python
# ❌ BEFORE
video_key = f"flashhead/{user_id}/{int(os.urandom(8).hex())}.mp4"

# ✅ AFTER
import uuid
video_key = f"flashhead/{user_id}/{uuid.uuid4().hex}.mp4"
```

**Why:**
- `uuid.uuid4().hex` is the standard Python way to generate unique filenames
- No integer conversion needed
- Guaranteed unique
- Works for any length

---

## 💡 Best Practices

### For Unique Filenames in Python

**✅ Recommended:**
```python
import uuid

# Option 1: UUID (best for most cases)
filename = f"{uuid.uuid4().hex}.mp4"

# Option 2: Timestamp + UUID
import time
filename = f"{int(time.time())}_{uuid.uuid4().hex}.mp4"

# Option 3: User ID + UUID
filename = f"user_{user_id}_{uuid.uuid4().hex}.mp4"
```

**❌ Avoid:**
```python
import os

# Don't do this - can fail for large values
filename = f"{int(os.urandom(8).hex())}.mp4"

# Don't do this - not guaranteed unique
import random
filename = f"{random.randint(0, 999999)}.mp4"
```

---

## 📚 Related Documentation

- **`FLASHHEAD_FILENAME_FIX.md`** - This file (filename fix)
- **`FLASHHEAD_PARAMETER_FIX.md`** - Previous parameter fix
- **`FLASHHEAD_COMPLETE.md`** - Quick reference
- **`FLASHHEAD_FINAL.md`** - Detailed guide

---

## 🎯 Summary

**Problem:** `int(os.urandom(8).hex())` fails for large hex strings  
**Solution:** Use `uuid.uuid4().hex` directly as string  
**Status:** ✅ Fixed and ready to deploy  

**Next Command:**
```bash
cd modal
modal deploy app_propreel_minimax.py
```

Then test with the curl command above. The FlashHead video generation should now work perfectly with proper UUID filenames! 🚀

---

**Date:** March 2025  
**Version:** 2.3.2  
**Status:** ✅ Fixed  
**Next:** Redeploy and test
