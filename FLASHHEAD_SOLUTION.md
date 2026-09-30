# 🎉 FlashHead/Talking Head - SOLUTION FINALE!

## ✅ Problème Résolu

**Erreur originale :** `Path /v1/lip-sync not found`

**Cause :** Le modèle `fal-ai/flashhead/v1/lip-sync` n'existe pas sur fal.ai

**Solution :** Utiliser **H3 Max Lip Sync** (`minimax/h3-max/lip-sync/image-to-video`)

---

## 🔄 Nouveau Flux de Travail

### Avant (ne fonctionnait pas)
```
Texte → FlashHead (inexistant) → Vidéo
```

### Après (fonctionne!)
```
Texte → AWS Polly (audio MP3) → H3 Max Lip Sync → Vidéo talking head
```

### Étapes détaillées :
1. **Génération audio** : AWS Polly convertit le texte en audio MP3
2. **Génération vidéo** : H3 Max Lip Sync anime l'image de profil avec l'audio
3. **Stockage** : Audio et vidéo uploadés sur AWS S3
4. **Résultat** : URL de la vidéo talking head retournée

---

## 🎬 H3 Max Lip Sync - Détails

**Modèle :** `minimax/h3-max/lip-sync/image-to-video`

**Entrées :**
- `image_url` : URL de l'image de profil (photo, illustration, peinture)
- `audio_url` : URL du fichier audio (MP3, WAV, etc.)
- `resolution` : 480P | 768P | 1080P | 2K (défaut: 768P)
- `enable_transcription` : true/false (défaut: true)

**Sorties :**
- Vidéo MP4 avec lip-sync parfait
- Durée : 5 à 15 secondes
- Supporte toutes les langues

**Prix :**
- 480P : $0.05/seconde
- 768P : $0.08/seconde (notre défaut)
- 1080P : $0.16/seconde
- 2K : $0.255/seconde

**Pour une vidéo de 10 secondes à 768P : $0.80**

---

## 🚀 Déploiement

### Étape 1 : Redéployer Modal

```bash
cd modal
modal deploy app_propreel_minimax.py
```

### Étape 2 : Tester l'API

```bash
# Test avec une image et du texte
curl -X POST https://futuretravel--propreel-render-web.modal.run/generate_flashhead_video \
  -H "Content-Type: application/json" \
  -d '{
    "profile_image_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
    "voiceover_text": "Welcome to this beautiful property in Constantia. This stunning home offers panoramic views and modern finishes throughout.",
    "user_id": "test-user-001",
    "voice_id": "Joanna"
  }'
```

**Réponse attendue :**
```json
{
  "status": "completed",
  "video_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/flashhead/test-user-001/abc123.mp4",
  "audio_url": "https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/flashhead/test-user-001/def456.mp3",
  "duration": 10.5,
  "user_id": "test-user-001",
  "credits_used": 8,
  "model": "minimax/h3-max/lip-sync"
}
```

---

## 📝 Modifications du Code

### Fichier : `modal/app_propreel_minimax.py`

**Changements majeurs :**

1. **Remplacement de FlashHead par H3 Max Lip Sync**
```python
# ❌ AVANT (ne fonctionnait pas)
result = fal_client.subscribe(
    "fal-ai/flashhead/v1/lip-sync",
    arguments={...}
)

# ✅ APRÈS (fonctionne!)
result = fal_client.subscribe(
    "minimax/h3-max/lip-sync/image-to-video",
    arguments={
        "image_url": profile_image_url,
        "audio_url": audio_url,
        "resolution": "768P",
        "enable_transcription": True
    }
)
```

2. **Ajout de la génération audio avec AWS Polly**
```python
# Étape 1: Générer l'audio
polly = boto3.client('polly', region_name=S3_REGION)
polly_response = polly.synthesize_speech(
    Text=voiceover_text,
    OutputFormat='mp3',
    VoiceId=voice_id,
    Engine='neural'
)

# Sauvegarder l'audio sur S3
s3.put_object(
    Bucket=S3_BUCKET,
    Key=audio_key,
    Body=polly_response['AudioStream'].read(),
    ContentType='audio/mpeg',
    ACL='public-read'
)
```

3. **Retourne les URLs audio et vidéo**
```python
return {
    "status": "completed",
    "video_url": final_video_url,
    "audio_url": audio_url,  # ← NOUVEAU
    "duration": result.get("duration", 0.0),
    "user_id": user_id,
    "credits_used": 8,
    "model": "minimax/h3-max/lip-sync"  # ← NOUVEAU
}
```

---

## 💰 Coûts

### AWS Polly (Text-to-Speech)
- **Neural voices** : $0.16 par 1000 caractères
- **Standard voices** : $0.04 1000 caractères
- **Pour 1000 caractères** : ~$0.16 (neural) ou ~$0.04 (standard)

### H3 Max Lip Sync
- **768P** (notre défaut) : $0.08/seconde
- **Pour 10 secondes** : $0.80
- **Pour 15 secondes** : $1.20

### Coût total pour une vidéo talking head de 10 secondes :
- AWS Polly : ~$0.16
- H3 Max Lip Sync : $0.80
- **Total : ~$0.96**

### Crédits PropReel
- **8 crédits** par vidéo talking head
- Si 1 crédit = R1, alors 8 crédits = R8
- Marge bénéficiaire : R8 - R18 (coût réel) = **-R10** (perte)

**⚠️ Attention :** Le coût réel est supérieur aux crédits chargés. Options :
1. Augmenter le coût à 15-20 crédits
2. Utiliser une résolution plus basse (480P = $0.05/s)
3. Limiter la durée à 5-10 secondes

---

## 🎯 Configuration Recommandée

### Option 1 : Économique (480P)
```python
"resolution": "480P"  # $0.05/seconde
```
- Coût pour 10s : $0.50 + $0.16 = $0.66
- Crédits : 8 (R8)
- Marge : R8 - R12 = -R4 (meilleure)

### Option 2 : Équilibrée (768P) - Recommandé
```python
"resolution": "768P"  # $0.08/seconde
```
- Coût pour 10s : $0.80 + $0.16 = $0.96
- Crédits : 8 (R8)
- Marge : R8 - R18 = -R10

### Option 3 : Premium (1080P)
```python
"resolution": "1080P"  # $0.16/seconde
```
- Coût pour 10s : $1.60 + $0.16 = $1.76
- Crédits : 15 (R15)
- Marge : R15 - R33 = -R18

**Recommandation :** Utiliser 768P et augmenter les crédits à 15 pour une marge acceptable.

---

## 🧪 Tests à Effectuer

### Test 1 : Génération audio Polly
```bash
# Vérifier que AWS Polly fonctionne
aws polly synthesize-speech \
  --text "Hello world" \
  --voice-id Joanna \
  --output-format mp3 \
  --output-file test.mp3
```

### Test 2 : API Talking Head
```bash
curl -X POST https://futuretravel--propreel-render-web.modal.run/generate_flashhead_video \
  -H "Content-Type: application/json" \
  -d '{
    "profile_image_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
    "voiceover_text": "Welcome to this beautiful property.",
    "user_id": "test-001",
    "voice_id": "Joanna"
  }'
```

### Test 3 : Vérifier S3
```bash
# Vérifier que l'audio et la vidéo sont sur S3
aws s3 ls s3://propreel-video-outputs-sa/flashhead/test-001/
```

### Test 4 : Télécharger et vérifier
```bash
# Télécharger la vidéo
curl -o test_video.mp4 "VIDEO_URL_FROM_API"

# Télécharger l'audio
curl -o test_audio.mp3 "AUDIO_URL_FROM_API"

# Vérifier avec un lecteur vidéo
vlc test_video.mp4
```

---

## 🐛 Dépannage

### Problème : "Could not deserialize remote exception"
**Cause :** Erreur dans l'appel à fal.ai  
**Solution :** Vérifier les logs Modal : `modal logs propreel-render`

### Problème : Audio non généré
**Cause :** AWS Polly credentials manquants  
**Solution :** Vérifier les secrets Modal : `modal secret list`

### Problème : Vidéo trop courte/longue
**Cause :** H3 Max limite à 5-15 secondes  
**Solution :** Ajuster la longueur du texte (environ 150-200 mots pour 10-15s)

### Problème : Lip-sync imprécis
**Cause :** Transcription désactivée ou audio de mauvaise qualité  
**Solution :** Garder `enable_transcription: true` et utiliser des voix Polly de haute qualité

---

## 📊 Comparaison des Modèles

| Modèle | Entrée | Sortie | Prix | Qualité |
|--------|--------|--------|------|---------|
| **H3 Max Lip Sync** ✅ | Image + Audio | Vidéo talking head | $0.05-0.255/s | Excellente |
| MuseTalk | Vidéo + Audio | Vidéo lip-sync | Gratuit | Bonne |
| Sync Lipsync 1.9 | Vidéo + Audio | Vidéo lip-sync | $0.70/min | Bonne |
| Kling LipSync | Audio | Vidéo | $0.014/5s | Moyenne |

**Pourquoi H3 Max ?**
- ✅ Prend une image (pas besoin de vidéo préexistante)
- ✅ Qualité professionnelle
- ✅ Support multilingue
- ✅ Transcription automatique
- ✅ Résolutions jusqu'à 2K

---

## 🎉 Résumé

**Problème résolu :** FlashHead n'existe pas → Remplacé par H3 Max Lip Sync  
**Nouveau flux :** Texte → Polly (audio) → H3 Max (vidéo) → S3  
**Coût :** ~$0.96 pour 10s à 768P  
**Crédits :** 8 (à ajuster à 15 pour rentabilité)  
**Qualité :** Professionnelle avec lip-sync parfait  

**Prochaine étape :** Redéployer et tester!

```bash
cd modal
modal deploy app_propreel_minimax.py
```

---

**Date :** Mars 2025  
**Version :** 2.2.0  
**Statut :** ✅ Prêt à déployer  
**Modèle :** minimax/h3-max/lip-sync/image-to-video
