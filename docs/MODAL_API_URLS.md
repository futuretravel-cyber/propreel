# 🎯 Modal API URLs - IMPORTANT!

## ⚠️ Critical: Two Different URLs

Your Modal deployment has **TWO different URLs**:

### 1. Main App URL (for Modal functions)
```
https://futuretravel--propreel-render.modal.run
```
- Used for: Direct Modal function calls via SDK
- NOT for: HTTP REST API calls

### 2. Web Function URL (for REST API) ✅ USE THIS ONE
```
https://futuretravel--propreel-render-web.modal.run
```
- Used for: HTTP REST API calls from frontend
- This is where your FastAPI endpoints live!

---

## 🚀 Correct API Endpoints

All API calls should use the **web function URL**:

### Health Check
```bash
curl https://futuretravel--propreel-render-web.modal.run/health
```

### Get Image Presets
```bash
curl https://futuretravel--propreel-render-web.modal.run/get_image_presets
```

### Edit Image
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/edit_image \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/image.jpg",
    "preset_id": "golden_sunset"
  }'
```

### Generate FlashHead Video
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/generate_flashhead_video \
  -H "Content-Type: application/json" \
  -d '{
    "profile_image_url": "https://example.com/profile.jpg",
    "voiceover_text": "Welcome to this property!",
    "user_id": "test-user-123",
    "voice_id": "Joanna"
  }'
```

### Render Video
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "pr_123456",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["url1", "url2", "url3"],
    "voiceover_text": "Welcome to this property...",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

---

## 📝 Frontend Configuration

Your frontend `ModalAPI` client has been updated to use the correct URL:

```typescript
// src/lib/modalClient.ts
const MODAL_ENDPOINT = 'https://futuretravel--propreel-render-web.modal.run';
```

---

## 🧪 Quick Test

Run this to verify everything works:

```bash
# Test health endpoint
curl https://futuretravel--propreel-render-web.modal.run/health

# Expected response:
{
  "status": "healthy",
  "service": "propreel-render",
  "version": "2.1.0",
  ...
}
```

---

## 🔍 Why Two URLs?

Modal separates:
1. **Function calls** (via Modal SDK) - for internal function-to-function calls
2. **Web endpoints** (via HTTP) - for external API calls from frontend

The `-web` suffix indicates this is the ASGI web application endpoint.

---

## ✅ Summary

| What | URL |
|------|-----|
| Modal Dashboard | https://modal.com/apps/futuretravel/main/deployed/propreel-render |
| Main App (SDK) | https://futuretravel--propreel-render.modal.run |
| **Web API (HTTP)** ✅ | **https://futuretravel--propreel-render-web.modal.run** |
| Frontend Config | `src/lib/modalClient.ts` |

**Always use the `-web` URL for API calls!**

---

## 🐛 Troubleshooting

### "invalid function call" error
**Cause:** Using wrong URL (without `-web` suffix)  
**Solution:** Use `https://futuretravel--propreel-render-web.modal.run`

### CORS errors
**Cause:** Frontend trying to call wrong URL  
**Solution:** Update `VITE_MODAL_ENDPOINT` in `.env` or `modalClient.ts`

### 404 errors
**Cause:** Endpoint doesn't exist  
**Solution:** Check Modal logs: `modal logs propreel-render`

---

**Updated:** March 2025  
**Status:** ✅ Fixed - Use `-web` URL for all API calls
