# 🎬 Guide de Test Complet - Rendu Vidéo par Tier

## ✅ Corrections Appliquées

### Problème Résolu
**Erreur :** `Input should be '512P' or '768P'`

**Corrections :**
1. ✅ Ajout de `resolution.upper()` dans `generate_ai_video_clip()` (ligne 165-175)
2. ✅ Changé `"720p"` → `"768p"` dans `TIER_CONFIGS` pour CINEMATIC et PREMIUM
3. ✅ Changé `"720p"` → `"768p"` dans la logique de upscaling pour PREMIUM

---

## 🚀 Déploiement

### Étape 1 : Redéployer Modal

```bash
cd modal
modal deploy app_propreel_minimax.py
```

**Sortie attendue :**
```
✓ Created objects.
├── 🔨 Created function generate_ai_video_clip.
├── 🔨 Created function upscale_video.
├── 🔨 Created function render_video_local.
├── 🔨 Created function render_video.
├── 🔨 Created function edit_image.
├── 🔨 Created function get_image_presets.
├── 🔨 Created function generate_flashhead_video.
├── 🔨 Created function health_check.
└── 🔨 Created web function web
✓ App deployed successfully! 🎉
```

---

## 🧪 Tests par Tier

### Test 1 : ESSENTIAL (1080p - Local FFmpeg)

**Caractéristiques :**
- Résolution : 1080p (1920×1080)
- Traitement : Local FFmpeg (zoom/pan)
- Coût : 5 crédits (30s) ou 10 crédits (60s)
- Durée : 30s ou 60s

**Commande :**
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

**Résultat attendu :**
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

---

### Test 2 : SOCIAL (512P - AI)

**Caractéristiques :**
- Résolution : 512P (512×288)
- Traitement : AI (fal-ai/minimax/hailuo-02)
- Coût : 30 crédits (30s), 50 crédits (50s), 80 crédits (90s)
- Durée : 30s, 50s, ou 90s

**Commande (1 image, 6s) :**
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

**Commande (5 images, 30s) :**
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-social-002",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800"
    ],
    "voiceover_text": "Welcome to this stunning luxury property. Featuring panoramic views and modern finishes.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

**Résultat attendu :**
```json
{
  "record_id": "test-social-001",
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-social-001/video.mp4",
  "tier": "SOCIAL",
  "resolution": "512p",
  "processing_type": "ai",
  "credits_used": 30,
  "image_count": 1,
  "duration": 30
}
```

---

### Test 3 : CINEMATIC (768P - AI)

**Caractéristiques :**
- Résolution : 768P (768×432)
- Traitement : AI (fal-ai/minimax/hailuo-02)
- Coût : 40 crédits (30s), 70 crédits (60s), 90 crédits (90s)
- Durée : 30s, 60s, ou 90s

**Commande (5 images, 30s) :**
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-cinematic-001",
    "tier": "CINEMATIC",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800"
    ],
    "voiceover_text": "Welcome to this stunning luxury property. Featuring panoramic views, modern finishes, and a sparkling pool. Book your private viewing today.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

**Résultat attendu :**
```json
{
  "record_id": "test-cinematic-001",
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-cinematic-001/video.mp4",
  "tier": "CINEMATIC",
  "resolution": "768p",
  "processing_type": "ai",
  "credits_used": 40,
  "image_count": 5,
  "duration": 30
}
```

---

### Test 4 : PREMIUM (768P → 1080p - AI + Upscale)

**Caractéristiques :**
- Résolution : 768P → 1080p (upscaled)
- Traitement : AI + FFmpeg upscaling
- Coût : 60 crédits (30s), 100 crédits (60s), 150 crédits (90s)
- Durée : 30s, 60s, ou 90s

**Commande (5 images, 30s) :**
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-premium-001",
    "tier": "PREMIUM",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800"
    ],
    "voiceover_text": "Welcome to this stunning luxury property. Featuring panoramic views, modern finishes, and a sparkling pool. Book your private viewing today.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

**Résultat attendu :**
```json
{
  "record_id": "test-premium-001",
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-premium-001/video.mp4",
  "tier": "PREMIUM",
  "resolution": "768p",
  "processing_type": "ai_upscaled",
  "credits_used": 60,
  "image_count": 5,
  "duration": 30
}
```

---

## 📊 Tableau Récapitulatif des Tiers

| Tier | Résolution | Traitement | Config 0 | Config 1 | Config 2 |
|------|-----------|------------|----------|----------|----------|
| **ESSENTIAL** | 1080p | Local FFmpeg | 30s, 6 img, 5cr | 60s, 12 img, 10cr | - |
| **SOCIAL** | 512P | AI | 30s, 5 img, 30cr | 50s, 10 img, 50cr | 90s, 15 img, 80cr |
| **CINEMATIC** | 768P | AI | 30s, 5 img, 40cr | 60s, 10 img, 70cr | 90s, 15 img, 90cr |
| **PREMIUM** | 768P→1080p | AI + Upscale | 30s, 5 img, 60cr | 60s, 10 img, 100cr | 90s, 15 img, 150cr |

---

## 🔍 Vérification des Résultats

### 1. Vérifier la Réponse API

La réponse doit contenir :
- ✅ `status: "completed"`
- ✅ `video_url` valide
- ✅ `resolution` correct (512p, 768p, ou 1080p)
- ✅ `credits_used` correct selon le tier
- ✅ `image_count` correct

### 2. Vérifier la Vidéo sur S3

```bash
# Lister les fichiers dans le bucket
aws s3 ls s3://propreel-video-outputs-sa/renders/

# Télécharger la vidéo
aws s3 cp s3://propreel-video-outputs-sa/renders/test-social-001/video.mp4 ./test-video.mp4

# Vérifier les métadonnées
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 test-video.mp4
```

### 3. Vérifier les Crédits

```bash
# Via Supabase SQL
SELECT * FROM credit_transactions 
WHERE user_id = 'test-user-001' 
ORDER BY created_at DESC 
LIMIT 5;
```

### 4. Vérifier les Logs Modal

```bash
# Voir les logs en temps réel
modal logs propreel-render

# Ou via le dashboard
# https://modal.com/apps/futuretravel/main/deployed/propreel-render
```

---

## 🎯 Tests Spéciaux

### Test 5 : Format Portrait (9:16)

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-portrait-001",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "PORTRAIT",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

### Test 6 : Config Index 1 (50s pour SOCIAL)

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-social-003",
    "tier": "SOCIAL",
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
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800"
    ],
    "voiceover_text": "Welcome to this stunning luxury property. Featuring panoramic views, modern finishes, and a sparkling pool. Book your private viewing today.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

---

## 🐛 Dépannage

### Problème : "Input should be '512P' or '768P'"
**Solution :** Vérifiez que vous avez redéployé Modal après les corrections
```bash
cd modal
modal deploy app_propreel_minimax.py
```

### Problème : "Not enough images"
**Solution :** Fournissez le nombre d'images requis par la configuration
- Config 0 : 5 images (SOCIAL, CINEMATIC, PREMIUM) ou 6 images (ESSENTIAL)
- Config 1 : 10 images (SOCIAL, CINEMATIC, PREMIUM) ou 12 images (ESSENTIAL)
- Config 2 : 15 images

### Problème : Vidéo trop courte
**Solution :** Le système génère 6s par image
- 1 image = 6s de vidéo
- 5 images = 30s de vidéo
- 10 images = 60s de vidéo

### Problème : Crédits non déduits
**Solution :** Vérifiez que la fonction `deductCredits` est appelée dans le frontend avant l'appel API

---

## 📚 Documentation

- **`VIDEO_RENDER_COMPLETE_TEST.md`** - Ce fichier (guide de test complet)
- **`RESOLUTION_FIX.md`** - Correction de résolution
- **`VIDEO_RENDER_TEST.md`** - Guide de test initial
- **`FLASHHEAD_ALL_FIXED.md`** - Résumé des corrections FlashHead

---

## 🎉 Résumé

### Corrections Appliquées
1. ✅ Conversion résolution en majuscules (`resolution.upper()`)
2. ✅ CINEMATIC : "720p" → "768p"
3. ✅ PREMIUM : "720p" → "768p"
4. ✅ Logique de upscaling : "720p" → "768p"

### Tests Disponibles
- ✅ ESSENTIAL (1080p, local FFmpeg)
- ✅ SOCIAL (512P, AI)
- ✅ CINEMATIC (768P, AI)
- ✅ PREMIUM (768P → 1080p, AI + upscale)
- ✅ Format portrait
- ✅ Multiple configurations

### Prochaine Étape
```bash
# Redéployer
cd modal
modal deploy app_propreel_minimax.py

# Tester SOCIAL (1 image)
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-video-001",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

---

**Date :** Mars 2025  
**Version :** 2.3.5  
**Status :** ✅ Toutes les résolutions corrigées  
**Prochaine commande :** `modal deploy app_propreel_minimax.py`

🚀 **Tous les tiers sont maintenant prêts à être testés !**
