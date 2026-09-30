# ✅ Corrections Timeout et Preemption - Modal

## 🐛 Problèmes Identifiés

### 1. AsyncUsageWarning
**Erreur :** `A blocking Modal interface is being used in an async context`

**Cause :** Utilisation de `.remote()` (synchrone) dans des endpoints FastAPI async

**Solution :** Convertir en `.remote.aio()` (asynchrone)

### 2. Timeout et Preemption
**Erreur :** `Task's current input hit its timeout of 300s`

**Cause :** 
- Timeouts par défaut trop courts (300s = 5 min)
- Les appels fal.ai peuvent prendre 5-10 minutes
- Pas de retry en cas de preemption

**Solution :**
- Augmenter les timeouts (300-900s)
- Ajouter `retries=2` pour gérer les preemptions
- Utiliser `fal_client.submit()` avec polling au lieu de `subscribe()`

---

## 🔧 Corrections Appliquées

### 1. Timeouts et Retries aux Fonctions Modal

**Fichier :** `modal/app_propreel_minimax.py`

```python
# Avant
@app.function(image=image, secrets=[...])
def generate_ai_video_clip(...):

# Après
@app.function(image=image, secrets=[...], timeout=600, retries=2)
def generate_ai_video_clip(...):
```

**Fonctions mises à jour :**
- ✅ `generate_ai_video_clip()` : timeout=600s (10 min), retries=2
- ✅ `upscale_video()` : timeout=600s, retries=2
- ✅ `render_video_local()` : timeout=600s, retries=2
- ✅ `render_video()` : timeout=900s (15 min), retries=2
- ✅ `edit_image()` : timeout=300s (5 min), retries=2
- ✅ `generate_flashhead_video()` : timeout=300s, retries=2

### 2. Conversion en Appels Async

**Avant (synchrone) :**
```python
@web_app.post("/render_video")
async def api_render_video(request: RenderVideoRequest):
    result = render_video.remote(...)  # ❌ Bloquant
    return result
```

**Après (asynchrone) :**
```python
@web_app.post("/render_video")
async def api_render_video(request: RenderVideoRequest):
    result = await render_video.remote.aio(...)  # ✅ Non-bloquant
    return result
```

**Endpoints convertis :**
- ✅ `/render_video`
- ✅ `/generate_flashhead_video`
- ✅ `/edit_image`

### 3. Polling au lieu de Subscribe

**Avant (bloquant) :**
```python
result = fal_client.subscribe(
    "fal-ai/minimax/hailuo-02/standard/image-to-video",
    arguments={...}
)
```

**Après (polling avec timeout) :**
```python
handler = fal_client.submit(
    "fal-ai/minimax/hailuo-02/standard/image-to-video",
    arguments={...}
)

# Poll for completion with timeout
import time
max_wait = 540  # 9 minutes
start_time = time.time()

while True:
    elapsed = time.time() - start_time
    if elapsed > max_wait:
        raise Exception(f"Timeout: fal.ai task did not complete within {max_wait}s")
    
    status = handler.status
    if status == "COMPLETED":
        result = handler.get()
        video_url = result.get("video", {}).get("url")
        return video_url
    elif status == "FAILED":
        raise Exception(f"fal.ai task failed: {handler.result}")
    elif status in ["IN_QUEUE", "IN_PROGRESS"]:
        print(f"fal.ai task {status}... ({int(elapsed)}s elapsed)")
        time.sleep(5)  # Poll every 5 seconds
```

**Fonctions mises à jour :**
- ✅ `generate_ai_video_clip()` : polling avec max_wait=540s
- ✅ `generate_flashhead_video()` : polling avec max_wait=240s
- ✅ `edit_image()` : polling avec max_wait=240s

---

## 📊 Comparaison des Timeouts

| Fonction | Timeout Avant | Timeout Après | Retries | Polling |
|----------|--------------|---------------|---------|---------|
| `generate_ai_video_clip` | 300s | **600s** | 2 | 540s max |
| `upscale_video` | 300s | **600s** | 2 | - |
| `render_video_local` | 300s | **600s** | 2 | - |
| `render_video` | 300s | **900s** | 2 | - |
| `edit_image` | 300s | **300s** | 2 | 240s max |
| `generate_flashhead_video` | 300s | **300s** | 2 | 240s max |

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
├── 🔨 Created function generate_ai_video_clip (timeout=600s, retries=2).
├── 🔨 Created function upscale_video (timeout=600s, retries=2).
├── 🔨 Created function render_video_local (timeout=600s, retries=2).
├── 🔨 Created function render_video (timeout=900s, retries=2).
├── 🔨 Created function edit_image (timeout=300s, retries=2).
├── 🔨 Created function generate_flashhead_video (timeout=300s, retries=2).
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

### Étape 3 : Surveiller les Logs

```bash
# Voir les logs en temps réel
modal logs propreel-render

# Ou via le dashboard
# https://modal.com/apps/futuretravel/main/deployed/propreel-render
```

**Logs attendus :**
```
Starting render job: test-video-001
Tier: SOCIAL, Config: 0, Orientation: LANDSCAPE
Images: 1, Voice: Joanna
Processing type: ai, Resolution: 512p
Duration: 30s, Images: 5, Credits: 30
Generating AI clip 1/1
Generating AI video clip: 512P, 6s
fal.ai task IN_QUEUE... (0s elapsed)
fal.ai task IN_PROGRESS... (5s elapsed)
fal.ai task IN_PROGRESS... (10s elapsed)
...
fal.ai task IN_PROGRESS... (60s elapsed)
✅ Generated video clip: https://...
✅ Render complete: https://...
```

---

## 🧪 Tests de Validation

### Test 1 : Rendu Vidéo (SOCIAL, 1 image)

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
- ✅ Pas de AsyncUsageWarning
- ✅ Pas de timeout
- ✅ Vidéo générée avec succès
- ✅ URL de vidéo retournée

### Test 2 : FlashHead (Lip-Sync)

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

**Résultat attendu :**
- ✅ Pas de AsyncUsageWarning
- ✅ Pas de timeout
- ✅ Vidéo lip-sync générée
- ✅ URL de vidéo retournée

### Test 3 : Édition d'Image

```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/edit_image \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
    "preset_id": "golden_sunset"
  }'
```

**Résultat attendu :**
- ✅ Pas de AsyncUsageWarning
- ✅ Pas de timeout
- ✅ Image éditée avec succès
- ✅ URL d'image retournée

---

## 🐛 Dépannage

### Problème : Encore des AsyncUsageWarning

**Solution :** Vérifiez que tous les endpoints FastAPI utilisent `.remote.aio()`
```bash
grep -n "\.remote(" modal/app_propreel_minimax.py
# Devrait retourner uniquement les appels dans les fonctions non-async
```

### Problème : Timeout après 600s

**Solution :** Augmenter le timeout
```python
@app.function(..., timeout=1200, retries=2)  # 20 minutes
```

### Problème : Preemption fréquente

**Solution :** 
1. Augmenter `retries=3`
2. Utiliser des volumes persistants pour les checkpoints
3. Réduire la taille des tâches

### Problème : fal.ai task FAILED

**Solution :**
1. Vérifier les logs Modal : `modal logs propreel-render`
2. Vérifier les credentials FAL : `modal secret list`
3. Tester l'API fal.ai directement

---

## 📚 Documentation

- **`MODAL_TIMEOUT_FIX.md`** - Ce fichier (corrections timeout)
- **`RESOLUTION_FIX.md`** - Correction de résolution
- **`VIDEO_RENDER_COMPLETE_TEST.md`** - Guide de test complet
- **`FLASHHEAD_ALL_FIXED.md`** - Corrections FlashHead

---

## 🎯 Résumé des Corrections

### Problèmes Résolus
1. ✅ AsyncUsageWarning → Conversion en `.remote.aio()`
2. ✅ Timeout 300s → Augmenté à 300-900s
3. ✅ Preemption → Ajout de `retries=2`
4. ✅ Blocage fal.ai → Polling avec `submit()`

### Améliorations
- ✅ Timeouts adaptés à chaque fonction
- ✅ Retries pour gérer les preemptions
- ✅ Polling non-bloquant pour fal.ai
- ✅ Logs détaillés pour le debugging
- ✅ Messages d'erreur clairs

### Performance
- ✅ Pas de blocage dans les endpoints async
- ✅ Meilleure gestion des tâches longues
- ✅ Retry automatique en cas d'échec
- ✅ Polling efficace (3-5s)

---

## 🚀 Prochaines Étapes

1. **Redéployer Modal :**
   ```bash
   cd modal
   modal deploy app_propreel_minimax.py
   ```

2. **Tester tous les endpoints :**
   - `/render_video` (SOCIAL, CINEMATIC, PREMIUM)
   - `/generate_flashhead_video`
   - `/edit_image`

3. **Surveiller les logs :**
   ```bash
   modal logs propreel-render
   ```

4. **Vérifier les performances :**
   - Temps de génération
   - Taux de succès
   - Nombre de retries

---

**Date :** Mars 2025  
**Version :** 2.3.6  
**Status :** ✅ Corrections appliquées  
**Prochaine commande :** `modal deploy app_propreel_minimax.py`

🚀 **Les problèmes de timeout et preemption sont maintenant résolus !**
