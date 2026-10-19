# PropReel Modal Backend

This directory contains the Modal backend for video rendering.

## Overview

The Modal backend handles:
- Video rendering from property images
- AI voiceover generation using AWS Polly
- Video upload to AWS S3
- Tier-based video generation (Essential, Social, Cinematic, Premium)

## Files

- `app_propreel_minimax.py` - **the live Modal application** (the render
  worker, FastAPI web endpoint, crons and selftests — this is what
  `modal deploy` targets)
- *(removed)* `app_propreel_grok_tiers.py` — legacy stub, deleted so it can
  never be deployed: it declared the same app name (`propreel-render`) but had
  no web endpoints, so deploying it would have replaced and stripped the live
  worker (see the warning in `docs/MODAL_ENDPOINT_SETUP.md`; recover from git
  history if it is ever needed for reference)
- `image_prompts.py` - prompt libraries bundled into the worker image

## Prerequisites

1. **Modal Account**: Sign up at https://modal.com
2. **AWS Credentials**: Configure AWS access for S3 and Polly
3. **Modal CLI**: Install with `pip install modal`

## Setup

### 1. Authenticate with Modal

```bash
modal setup
```

This will open your browser for authentication.

### 2. Configure AWS Secrets

Create a Modal secret for AWS credentials:

```bash
modal secret create aws-credentials \
  AWS_ACCESS_KEY_ID=your_access_key \
  AWS_SECRET_ACCESS_KEY=your_secret_key \
  AWS_REGION=af-south-1
```

### 3. Deploy the Backend

```bash
modal deploy app_propreel_minimax.py
```

## API Endpoints

### render_video

Renders a property video.

**Parameters:**
- `record_id` (str): Unique identifier for the render job
- `tier` (str): Video tier (ESSENTIAL, SOCIAL, CINEMATIC, PREMIUM)
- `orientation` (str): Video orientation (LANDSCAPE or PORTRAIT)
- `images` (list[str]): List of image URLs
- `voiceover_text` (str): Text for voiceover narration
- `voice_id` (str): AWS Polly voice ID (default: "Joanna")
- `include_agent_branding` (bool): Include agent branding overlay

**Returns:**
```json
{
  "record_id": "string",
  "status": "completed",
  "video_url": "https://...",
  "tier": "string",
  "orientation": "string",
  "duration": 30,
  "image_count": 8
}
```

### health_check

Health check endpoint.

**Returns:**
```json
{
  "status": "healthy",
  "service": "propreel-render",
  "version": "1.0.0"
}
```

## Video Tiers

| Tier | Durations | Images (per duration) | Transition | Credits |
|------|-----------|----------------------|------------|---------|
| ESSENTIAL | 30s / 60s | 6 / 12 | fade | 5-10 |
| SOCIAL | 30s / 60s / 90s | 6 / 12 / 18 | slide | 30-90 |
| CINEMATIC | 30s / 60s / 90s | 6 / 12 / 18 | zoom | 50-150 |
| PREMIUM | 30s / 60s / 90s | 6 / 12 / 18 | cinematic | 75-225 |

## Deployment

The deployment script `deploy/02-modal-setup.sh` handles:
1. Modal CLI installation
2. Authentication
3. Backend deployment
4. Endpoint URL extraction

## Troubleshooting

### Authentication Issues

If you see "No such command 'create'":
- Use `modal setup` instead of `modal token create`
- The Modal CLI has changed its authentication flow

### Deployment Failures

Check:
1. AWS credentials are correctly configured in Modal secrets
2. S3 bucket exists and is accessible
3. Modal account has sufficient resources

### Video Rendering Issues

Check:
1. Image URLs are accessible
2. Voiceover text is valid
3. AWS Polly is available in your region

## Cost Estimation

Modal pricing (as of 2025):
- CPU: ~$0.0001 per second
- GPU: ~$0.0005 per second (if using GPU)
- Memory: ~$0.00005 per GB-second

Estimated cost per video:
- ESSENTIAL (15s): ~$0.01
- SOCIAL (30s): ~$0.02
- CINEMATIC (60s): ~$0.04
- PREMIUM (120s): ~$0.08

## Support

For issues or questions:
- Modal docs: https://modal.com/docs
- Email: support@propreel.co.za
