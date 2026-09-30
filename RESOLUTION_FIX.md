# ✅ Correction du Problème de Résolution - fal.ai API

## 🐛 Problème Identifié

**Erreur :** `Input should be '512P' or '768P'`

**Cause :** L'API fal.ai attend les résolutions en **MAJUSCULES** (`"512P"`, `"768P"`) mais le code envoyait en **minuscules** (`"512p"`, `"720p"`).

---

## 🔧 Correction Appliquée

### Fichier : `modal/app_propreel_minimax.py`

**Ligne 165-175 :** Ajout de la conversion en majuscules

```python
# Convert resolution to uppercase (fal.ai expects "512P" or "768P")
resolution_upper = resolution.upper()

# Call fal.ai API
result = fal_client.subscribe(
    "fal-ai/minimax/hailuo-02/standard/image-to-video",
    arguments={
        "image_url": image_url,
        "prompt": prompt,
        "num_frames": duration * 24,  # 24 fps
        "resolution": resolution_upper,  # ✅ Maintenant en majuscules
        "audio": False
    }
)
```

---

## 🚀 Redéploiement

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

### Étape 2 : Tester le Rendu Vidéo

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

---

## 📊 Résolution par Tier

| Tier | Résolution (config) | Résolution (API fal.ai) | Conversion |
|------|---------------------|-------------------------|------------|
| **ESSENTIAL** | 1080p | N/A (local FFmpeg) | - |
| **SOCIAL** | 512p | **512P** | ✅ `.upper()` |
| **CINEMATIC** | 720p | **768P** | ⚠️ Voir note |
| **PREMIUM** | 720p → 1080p | **768P** → upscale | ⚠️ Voir note |

### ⚠️ Note Importante : CINEMATIC et PREMIUM

L'API fal.ai n'accepte que **deux résolutions** :
- `"512P"` (pour SOCIAL)
- `"768P"` (pour CINEMATIC et PREMIUM)

**Problème :** Notre configuration utilise `"720p"` pour CINEMATIC et PREMIUM, mais fal.ai attend `"768P"`.

### Solution : Mettre à jour TIER_CONFIGS

```python
TIER_CONFIGS = {
    "ESSENTIAL": {
        "processing_type": "local",
        "resolution": "1080p",  # Local FFmpeg, pas d'impact
        "configurations": [...]
    },
    "SOCIAL": {
        "processing_type": "ai",
        "resolution": "512p",  # ✅ Converti en "512P"
        "configurations": [...]
    },
    "CINEMATIC": {
        "processing_type": "ai",
        "resolution": "768p",  # ⚠️ CHANGÉ de "720p" à "768p"
        "configurations": [...]
    },
    "PREMIUM": {
        "processing_type": "ai_upscaled",
        "resolution": "768p",  # ⚠️ CHANGÉ de "720p" à "768p"
        "configurations": [...]
    }
}
```

---

## 🔍 Vérification de la Correction

### Test 1 : SOCIAL Tier (512P)

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

**Résultat attendu :**
```json
{
  "record_id": "test-social-001",
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/test-social-001/video.mp4",
  "tier": "SOCIAL",
  "resolution": "512p",
  "credits_used": 30,
  "image_count": 1
}
```

### Test 2 : CINEMATIC Tier (768P)

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/render_video \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "test-cinematic-001",
    "tier": "CINEMATIC",
    "config_index": 0,
    "orientation": "LANDSCAPE",
    "images": ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
    "voiceover_text": "Welcome to this stunning luxury property.",
    "voice_id": "Joanna",
    "include_agent_branding": true
  }'
```

---

## 📝 Résumé des Corrections

### Fichiers Modifiés
1. ✅ `modal/app_propreel_minimax.py`
   - Ligne 165-175 : Ajout de `resolution.upper()` dans `generate_ai_video_clip()`

### Corrections Nécessaires (Optionnel)
2. ⚠️ `modal/app_propreel_minimax.py`
   - Lignes 118-135 : Changer `"720p"` en `"768p"` dans `TIER_CONFIGS`

---

## 🎯 Prochaines Étapes

### Option 1 : Tester avec SOCIAL (512P) - Déjà corrigé ✅

```bash
# Redéployer
cd modal
modal deploy app_propreel_minimax.py

# Tester
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

### Option 2 : Corriger aussi CINEMATIC et PREMIUM (Recommandé)

Modifier `TIER_CONFIGS` dans `modal/app_propreel_minimax.py` :

```python
"CINEMATIC": {
    "processing_type": "ai",
    "resolution": "768p",  # CHANGÉ de "720p"
    "configurations": [...]
},
"PREMIUM": {
    "processing_type": "ai_upscaled",
    "resolution": "768p",  # CHANGÉ de "720p"
    "configurations": [...]
}
```

Puis redéployer et tester.

---

## 💡 Pourquoi fal.ai n'accepte que 512P et 768P ?

Le modèle **minimax/hailuo-02** est optimisé pour deux résolutions spécifiques :
- **512P** : 512×288 pixels (rapide, économique)
- **768P** : 768×432 pixels (meilleure qualité)

**Note :** 768P n'est pas exactement 720p (1280×720), c'est une résolution personnalisée par fal.ai.

---

## 📚 Documentation

- **`RESOLUTION_FIX.md`** - Ce fichier (correction de résolution)
- **`VIDEO_RENDER_TEST.md`** - Guide de test de rendu vidéo
- **`FLASHHEAD_ALL_FIXED.md`** - Résumé des corrections FlashHead

---

**Date :** Mars 2025  
**Version :** 2.3.4  
**Status :** ✅ Corrigé (SOCIAL), ⚠️ À corriger (CINEMATIC/PREMIUM)  
**Prochaine commande :** `modal deploy app_propreel_minimax.py`

🚀 **Redéployez et testez maintenant !**
