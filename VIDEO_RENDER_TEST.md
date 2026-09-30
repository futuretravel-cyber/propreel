# 🧪 Test de Rendu Vidéo - 1 Image, 6 Secondes, 512p

## 🎯 Objectif

Tester le rendu vidéo avec:
- **1 image** (au lieu de 5)
- **6 secondes** de vidéo
- **512p** de résolution (tier SOCIAL)

---

## 📋 Commande de Test

### Test 1: Rendu Vidéo Simple (1 image)

```bash
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

### Paramètres Expliqués

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `record_id` | "test-video-001" | Identifiant unique pour ce rendu |
| `tier` | "SOCIAL" | Tier SOCIAL = 512p |
| `config_index` | 0 | Première configuration (30s, 5 images) |
| `orientation` | "LANDSCAPE" | Format paysage 16:9 |
| `images` | [1 URL] | **1 seule image** (au lieu de 5) |
| `voiceover_text` | "Welcome..." | Texte du voiceover |
| `voice_id` | "Joanna" | Voix AWS Polly |
| `include_agent_branding` | true | Inclure le branding |

---

## 📊 Résultat Attendu

### Réponse API (Succès)
```json
{
  "record_id": "test-video-001",
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-video-001/video.mp4",
  "tier": "SOCIAL",
  "config_index": 0,
  "duration": 6,
  "resolution": "512p",
  "processing_type": "ai",
  "credits_used": 30,
  "image_count": 1
}
```

### Ce qui se passe en arrière-plan

1. **Génération du clip vidéo**
   - 1 image → 1 clip de 6 secondes
   - Résolution: 512p
   - Modèle: fal-ai/minimax/hailuo-02
   - Prompt: Prompt A (right-to-left sweep)

2. **Voiceover**
   - Texte converti en audio avec AWS Polly
   - Voix: Joanna
   - Durée: ~3-4 secondes

3. **Assemblage**
   - Clip vidéo + audio voiceover
   - Branding ajouté (si activé)
   - Upload vers S3

4. **Coût**
   - 30 crédits (tier SOCIAL, config 0)
   - ~$0.08 (coût réel fal.ai)
   - Marge: ~R6.50

---

## 🧪 Tests Supplémentaires

### Test 2: Avec Voiceover Plus Long

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-video-002",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property in Constantia. This beautiful home features panoramic views, modern finishes, and a sparkling pool. Book your private viewing today.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

### Test 3: Format Portrait (9:16)

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-video-003",
    "tier": "SOCIAL",
    "config_index": 0,
    "orientation": "PORTRAIT",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

### Test 4: Tier CINEMATIC (720p)

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-video-004",
    "tier": "CINEMATIC",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

### Test 5: Tier PREMIUM (1080p upscaled)

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-video-005",
    "tier": "PREMIUM",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

---

## 🔍 Vérification des Résultats

### 1. Vérifier la Réponse API

La réponse doit contenir:
- ✅ `status: "completed"`
- ✅ `video_url` valide
- ✅ `duration: 6` (ou proche de 6)
- ✅ `resolution: "512p"` (pour SOCIAL)
- ✅ `credits_used: 30` (pour SOCIAL config 0)

### 2. Vérifier la Vidéo sur S3

```bash
# Lister les fichiers dans le bucket
aws s3 ls s3://propreel-video-outputs-sa/renders/

# Télécharger la vidéo
aws s3 cp s3://propreel-video-outputs-sa/renders/test-video-001/video.mp4 ./test-video.mp4

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

## 📊 Comparaison des Tiers

| Tier | Résolution | Config 0 | Config 1 | Config 2 |
|------|-----------|----------|----------|----------|
| **ESSENTIAL** | 1080p (local) | 30s, 6 images, 5cr | 60s, 12 images, 10cr | - |
| **SOCIAL** | 512p (AI) | 30s, 5 images, 30cr | 50s, 10 images, 50cr | 90s, 15 images, 80cr |
| **CINEMATIC** | 720p (AI) | 30s, 5 images, 40cr | 60s, 10 images, 70cr | 90s, 15 images, 90cr |
| **PREMIUM** | 1080p (upscaled) | 30s, 5 images, 60cr | 60s, 10 images, 100cr | 90s, 15 images, 150cr |

**Pour 1 image, 6 secondes, 512p:**
- ✅ Tier: **SOCIAL**
- ✅ Config: **0** (30s, mais seulement 1 image = ~6s de vidéo)
- ✅ Coût: **30 crédits**

---

## 🐛 Dépannage

### Problème: "Not enough images"
**Solution:** Le système attend 5 images pour config 0. Fournir 5 images ou utiliser une autre configuration.

### Problème: "Invalid tier"
**Solution:** Vérifier que le tier est en majuscules: "SOCIAL", "CINEMATIC", etc.

### Problème: "Invalid config_index"
**Solution:** Vérifier l'index:
- SOCIAL: 0, 1, 2
- CINEMATIC: 0, 1, 2
- PREMIUM: 0, 1, 2
- ESSENTIAL: 0, 1

### Problème: Vidéo trop courte
**Solution:** Le système génère 6s par image. Avec 1 image = 6s de vidéo. C'est normal.

### Problème: Crédits non déduits
**Solution:** Vérifier que la fonction `deductCredits` est appelée dans le frontend avant l'appel API.

---

## 🎯 Résultat Attendu

Après le test, vous devriez avoir:

1. ✅ **Vidéo générée** sur S3
   - URL: `https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-video-001/video.mp4`
   - Durée: ~6 secondes
   - Résolution: 512p
   - Format: MP4

2. ✅ **Crédits déduits**
   - 30 crédits retirés du compte
   - Transaction enregistrée dans `credit_transactions`

3. ✅ **Logs Modal**
   - Génération du clip vidéo
   - Génération du voiceover
   - Upload vers S3
   - Durée totale: ~30-60 secondes

4. ✅ **Réponse API**
   - Status: "completed"
   - Video URL valide
   - Métadonnées correctes

---

## 🚀 Prochaines Étapes

### 1. Exécuter le Test
```bash
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

### 2. Vérifier les Résultats
- ✅ Réponse API correcte
- ✅ Vidéo accessible sur S3
- ✅ Crédits déduits
- ✅ Logs Modal propres

### 3. Tester dans le Frontend
```bash
npm run dev
# Naviguer vers Studio → Video Generator
# Uploader 1 image
# Générer la vidéo
# Vérifier le résultat
```

### 4. Tester avec Plusieurs Images
```bash
# Test avec 5 images (configuration standard)
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-video-006",
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
    "voiceover_text": "Welcome to this stunning luxury property. Featuring panoramic views, modern finishes, and a sparkling pool. Book your private viewing today.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

---

## 📚 Documentation

- **`VIDEO_RENDER_TEST.md`** - Ce fichier (guide de test)
- **`FLASHHEAD_ALL_FIXED.md`** - Résumé des corrections FlashHead
- **`MODAL_INTEGRATION_GUIDE.md`** - Guide d'intégration Modal

---

**Date:** Mars 2025  
**Version:** 1.0.0  
**Status:** ✅ Prêt à tester  
**Prochaine commande:** `curl -X POST ...` (voir ci-dessus)

🚀 **Testez le rendu vidéo maintenant!**
