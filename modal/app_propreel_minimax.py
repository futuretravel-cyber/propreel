"""
PropReel Modal Backend - Video & Image Rendering Service (Updated)

This Modal app handles:
1. Video rendering using fal-ai/minimax/hailuo-02 with rotating prompts
2. Image editing using fal-ai with comprehensive prompt library
3. FlashHead lip-sync video generation
4. HTTP API endpoints via FastAPI
"""

import modal
import os
import json
import time
import hmac
import hashlib
import base64
import requests
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import fal_client

# Define the Modal app
app = modal.App("propreel-render")

# Define FastAPI web app
web_app = FastAPI(title="PropReel Render API", version="2.1.0")

# Add CORS middleware
from fastapi.middleware.cors import CORSMiddleware

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (configure for production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Worker auth: every endpoint except /health and /probe requires ─────────
# X-PropReel-Token = "v1.<exp_unix>.<uid>.<base64url hmac_sha256(secret, "v1.<exp>.<uid>")>"
# minted by the PropReel Vercel API (RENDER_API_TOKEN, shared via the
# render-auth Modal secret). The browser holds only short-lived signed
# tokens, so the worker URL in the public bundle is useless to scrapers.
# If the secret is not configured the check is SKIPPED (loud warning) so a
# deploy without the secret can never take renders down.
_token_header = "X-PropReel-Token"
_token_allow_paths = {"/health", "/probe", "/docs", "/openapi.json", "/favicon.ico"}
_warned_no_secret = False


def _parse_token(value: Optional[str]):
    """Verify X-PropReel-Token. Returns ({version, uid, scope, exp}, None) on
    success or (None, error) on failure.

    v1.<exp>.<uid>.<sig>              — generic token: status polls, cancels,
                                        cheap text generation. Free to mint.
    v2.<exp>.<uid>.<scope>.<sig>      — PAID job token (scope: render|flashhead|edit),
                                        minted by the API only after it charges
                                        credits at the price in
                                        lib/renderPricing. Required to START a job.
    """
    global _warned_no_secret
    secret = os.environ.get("RENDER_API_TOKEN", "")
    if not secret:
        if not _warned_no_secret:
            print("[auth] RENDER_API_TOKEN not set — worker auth DISABLED (open access)")
            _warned_no_secret = True
        return {"version": 1, "uid": "anon", "scope": None, "exp": 0}, None
    if not value:
        return None, "missing X-PropReel-Token"
    parts = value.split(".")
    if len(parts) == 4 and parts[0] == "v1":
        _, exp_s, uid, sig = parts
        msg = f"v1.{exp_s}.{uid}"
        version, scope = 1, None
    elif len(parts) == 5 and parts[0] == "v2":
        _, exp_s, uid, scope, sig = parts
        if scope not in ("render", "flashhead", "edit"):
            return None, "unknown job scope"
        msg = f"v2.{exp_s}.{uid}.{scope}"
        version = 2
    else:
        return None, "malformed token"
    try:
        exp = int(exp_s)
    except ValueError:
        return None, "malformed token expiry"
    now = int(time.time())
    if exp < now or exp > now + 900:  # minted with 600s TTL, 15 min acceptance window
        return None, "token expired"
    encoded = msg.encode()
    expected = hmac.new(secret.encode(), encoded, hashlib.sha256).digest()
    pad = "=" * (-len(sig) % 4)
    try:
        got = base64.urlsafe_b64decode(sig + pad)
    except Exception:
        return None, "bad token signature"
    if not hmac.compare_digest(got, expected):
        return None, "bad token signature"
    return {"version": version, "uid": uid, "scope": scope, "exp": exp}, None


# Endpoints that spend real money on fal.ai / MiniMax — each requires a PAID
# v2 token whose scope matches, consumed exactly once (see _claim_job_token).
JOB_ENDPOINT_SCOPE = {
    "/render_video": "render",
    "/edit_image": "edit",
    "/flashhead": "flashhead",
    "/generate_flashhead_video": "flashhead",
}


@web_app.middleware("http")
async def require_worker_token(request: Request, call_next):
    # OPTIONS is the CORS preflight (handled below by CORSMiddleware).
    if request.method == "OPTIONS" or request.url.path in _token_allow_paths:
        return await call_next(request)
    info, err = _parse_token(request.headers.get(_token_header))
    if err:
        # This middleware wraps CORS, so mirror the CORS header ourselves.
        return JSONResponse(status_code=401, content={"error": err}, headers={"Access-Control-Allow-Origin": "*"})
    need = JOB_ENDPOINT_SCOPE.get(request.url.path)
    if need and (info["version"] != 2 or info["scope"] != need):
        return JSONResponse(
            status_code=403,
            content={"error": f"paid job token required for this endpoint (scope={need})"},
            headers={"Access-Control-Allow-Origin": "*"},
        )
    return await call_next(request)


def _claim_job_token(request: Request) -> None:
    """Burn a paid v2 token so it can start exactly ONE job.

    The claim is a conditional PutObject (IfNoneMatch='*') on a digest of the
    token — atomic across every worker container, so a replayed or parallel
    use answers 409 instead of spending our AI credits twice. Claims are tiny
    (~150 bytes) and only meaningful while the token itself is valid (10 min);
    they accumulate under jobs/claims/ like the job status files.
    """
    import hashlib as _hashlib
    token = request.headers.get(_token_header) or ""
    info, err = _parse_token(token)
    if err or not info:
        raise HTTPException(status_code=401, detail=err or "invalid token")
    digest = _hashlib.sha256(token.encode()).hexdigest()
    body = json.dumps({
        "scope": info["scope"],
        "uid": info["uid"],
        "token_exp": info["exp"],
        "used_at": int(time.time()),
    })
    try:
        _s3().put_object(
            Bucket=S3_BUCKET,
            Key=f"jobs/claims/{digest}.json",
            Body=body,
            ContentType="application/json",
            IfNoneMatch="*",
        )
    except Exception as e:
        status = getattr(e, "response", {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
        code = str(getattr(e, "response", {}).get("Error", {}).get("Code", ""))
        if status == 412 or "PreconditionFailed" in code:
            raise HTTPException(status_code=409, detail="Job token already used — mint a fresh one")
        # Fail CLOSED: never start a job we cannot prove was paid for.
        raise HTTPException(status_code=503, detail="Could not verify job token — please retry")

# Define the image with required dependencies
image = modal.Image.debian_slim().apt_install(
    "ffmpeg"
).pip_install(
    "boto3",
    "moviepy",
    "Pillow",
    "requests",
    "python-dotenv",
    "fal-client==1.0.3",
    "fastapi",
    "pydantic"
).add_local_file(str(Path(__file__).parent / "image_prompts.py"), remote_path="/root/image_prompts.py")


def _friendly_fal_error(e: Exception) -> str:
    """Map fal.ai/provider failures to clear client-facing messages."""
    import fal_client  # noqa: F401  (ensure module present for error classes)
    msg = str(e) or e.__class__.__name__
    # Remote tracebacks bury the real cause in the last lines.
    if "Could not deserialize remote exception" in msg or "remote traceback" in msg.lower():
        lines = [l.strip() for l in msg.splitlines() if l.strip()]
        msg = lines[-1] if lines else msg
    if "Exhausted balance" in msg or "User is locked" in msg:
        return "Image render failed: the fal.ai account is out of balance (user locked). Top up at fal.ai/dashboard/billing."
    if "401" in msg or "Unauthorized" in msg:
        return "fal.ai rejected the API key (401 Unauthorized) - check FAL_KEY in the fal-credentials Modal secret."
    if "403" in msg or "Forbidden" in msg:
        return f"fal.ai rejected the request (403 Forbidden): {msg[:300]}"
    if "422" in msg or "Unprocessable" in msg:
        return f"fal.ai rejected the request payload (422): {msg[:300]}"
    if "429" in msg or "rate limit" in msg.lower():
        return "fal.ai rate limit reached - please retry in a moment."
    return f"Image edit failed: {msg[:400]}"


# S3 configuration
S3_BUCKET = os.environ.get("AWS_S3_OUTPUT_BUCKET", "propreel-video-outputs-sa")
S3_REGION = os.environ.get("AWS_REGION", "af-south-1")

# ── Private-bucket media helpers (audit M-5) ───────────────────────────────
# Both buckets are private: knowing an object URL no longer grants read
# access. The worker holds IAM credentials, so it (a) reads OUR objects
# through the S3 API instead of HTTP — works whatever form of URL arrives,
# signed or raw, fresh or long expired — and (b) hands third parties
# (fal.ai / MiniMax / Grok vision) presigned URLs, because those vendors
# fetch the images themselves and can't sign anything.
OUR_BUCKETS = {
    S3_BUCKET,
    os.environ.get("AWS_S3_RAW_BUCKET", "propreel-raw-assets"),
}
# Vendor fetch window: long enough for any queue delay, short enough that a
# leaked URL is worthless once it lapses.
MEDIA_VENDOR_SECONDS = 6 * 3600
# What the API returns to the browser — share/copy links need a real lifespan.
# 7 days is the SigV4 maximum for static IAM credentials.
MEDIA_LINK_SECONDS = 7 * 24 * 3600


def _s3():
    import boto3
    from botocore.config import Config
    # addressing_style='virtual' is load-bearing: botocore's default
    # ('auto') mints presigned URLs against the legacy global endpoint
    # (bucket.s3.amazonaws.com) while signing the scope for af-south-1, and
    # S3 answers that with 400 IllegalLocationConstraintException. Virtual-
    # hosted + regional endpoint is what the JS SDK produces on the Vercel
    # side — and the only form that actually fetches.
    return boto3.client(
        "s3",
        region_name=S3_REGION,
        config=Config(s3={"addressing_style": "virtual"}),
    )


def _our_s3_object(url):
    """(bucket, key) when the URL points at one of OUR buckets, else None.

    The query string (any existing presigned signature) is ignored, so a URL
    signed minutes ago — or one that expired years ago — resolves to the same
    object.
    """
    if not isinstance(url, str) or not url.startswith("https://"):
        return None
    try:
        from urllib.parse import urlparse, unquote
        parsed = urlparse(url)
        suffix = f".s3.{S3_REGION}.amazonaws.com"
        if not parsed.hostname or not parsed.hostname.endswith(suffix):
            return None
        bucket = parsed.hostname[: -len(suffix)]
        if bucket not in OUR_BUCKETS:
            return None
        key = unquote(parsed.path.lstrip("/"))
        return (bucket, key) if key else None
    except Exception:
        return None


def presign_media(url: str, expires_in: int = MEDIA_VENDOR_SECONDS) -> str:
    """Presigned GET for one of our object URLs; anything else passes through."""
    obj = _our_s3_object(url)
    if not obj:
        return url
    bucket, key = obj
    try:
        return _s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=int(expires_in),
        )
    except Exception as e:
        # Never fail a job over signing — the raw URL is the fallback.
        print(f"presign_media failed (falling back to raw URL): {e}")
        return url


def to_edge_url(url: str) -> str:
    """Rewrite one of our presigned URLs onto its CloudFront edge hostname.

    Media origin isolation (docs/uploads-origin-isolation.md §5): the
    signature still covers the bucket host — CloudFront's S3 origin rewrites
    Host back on the origin fetch, so S3 validates it unchanged — only the
    hostname the BROWSER sees moves.

    Env-gated: EDGE_RAW_HOST / EDGE_CDN_HOST unset or empty → no-op, so a
    rollback is emptying the secret (no redeploy). BROWSER-BOUND CALLS ONLY
    (presign_urls): vendor submits and internal fetches must stay direct S3.
    """
    obj = _our_s3_object(url)
    if not obj:
        return url
    bucket, _ = obj
    if bucket == S3_BUCKET:
        host = os.environ.get("EDGE_CDN_HOST", "")
    elif bucket == os.environ.get("AWS_S3_RAW_BUCKET", "propreel-raw-assets"):
        host = os.environ.get("EDGE_RAW_HOST", "")
    else:
        return url
    host = host.strip()
    for prefix in ("https://", "http://"):
        if host.startswith(prefix):
            host = host[len(prefix):]
    host = host.strip("/")
    if not host or not all(c.isalnum() or c in ".-" for c in host):
        return url
    from urllib.parse import urlparse, urlunparse
    parsed = urlparse(url)
    # Original path (still percent-encoded) + presigned query, verbatim.
    return urlunparse(("https", host, parsed.path, "", parsed.query, ""))


def presign_urls(value, expires_in: int = MEDIA_LINK_SECONDS):
    """Recursively presign every one-of-ours URL inside a JSON-ish structure
    and rehost it on the edge — these strings are what the browser receives."""
    if isinstance(value, str):
        return to_edge_url(presign_media(value, expires_in)) if _our_s3_object(value) else value
    if isinstance(value, dict):
        return {k: presign_urls(v, expires_in) for k, v in value.items()}
    if isinstance(value, list):
        return [presign_urls(v, expires_in) for v in value]
    return value


def fetch_media(url: str, timeout: int = 120) -> bytes:
    """Download media bytes. Our own objects go through the S3 API (private-
    bucket safe, signature-independent); everything else — fal.ai outputs,
    external hosts — falls back to plain HTTP."""
    obj = _our_s3_object(url)
    if obj:
        bucket, key = obj
        return _s3().get_object(Bucket=bucket, Key=key)["Body"].read()
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content

# Credit cost per image render
IMAGE_RENDER_CREDIT_COST = 2

# Pydantic models for API requests/responses
class RenderVideoRequest(BaseModel):
    record_id: str
    tier: str
    config_index: int
    orientation: str
    images: List[str]
    voiceover_text: str
    voice_id: str = "Joanna"
    include_agent_branding: bool = True
    music_url: Optional[str] = None
    image_prompts: Optional[List[dict]] = None  # [{image_url, prompt_id, prompt}] rotation overrides
    audio: bool = False

class CancelRenderRequest(BaseModel):
    # render record_id or flashhead job_id — both live in the jobs/ store
    record_id: str


class FlashHeadRequest(BaseModel):
    profile_image_url: str
    voiceover_text: str
    user_id: str
    voice: str = "Aria"
    stability: float = 0.5

class EditImageRequest(BaseModel):
    image_url: str
    preset_id: str
    custom_prompt: Optional[str] = None
    strength: Optional[float] = None
    guidance_scale: Optional[float] = None

# Video prompts (rotating A, B, C)
VIDEO_PROMPTS = {
    'A': """Cinematic UE5 visualization of a luxury interior. Source image acts as an unalterable, frozen 3D digital architectural asset and absolute spatial sandbox. Absolute coordinate lock: every pixel, object, fixture, wall, and texture from the source image must remain strictly stationary in its exact original placement. All animation is executed exclusively as an internal digital crop-shift and bounded perspective adjustment—absolutely zero spatial expansion beyond the original frame. Execute a dynamic right-to-left internal lateral sweep combined with a dramatic focal push-in, contained entirely within the source pixels. Hyper-polished Unreal Engine 5.5 Path Traced render, global illumination, 8K resolution, glossy Architectural Digest aesthetic, intense depth of field, cinematic real estate commercial style. Ultra-crisp architectural photography, perfect rectilinear perspective, perfectly straight vertical lines. Lighting features hyper-realistic Ray-Traced reflections, soft ambient occlusion, clean bounce light, and immaculate specular highlights on high-end materials. Absolute pixel-lock on all existing inventory. Zero hallucination, zero alteration, zero border-crossing. Motion must be fluid, smooth, and high-production-value. No adding, removing, replacing, or modifying a single object, wall, furniture piece, appliance, texture, decoration, or architectural element. No creating new rooms, exiting through walls, passing image boundaries, revealing exterior spaces, or border-crossing. No geometry morphing, mutating, warping, melting, bending, slanted walls, curved vertical lines, fisheye lens, or extreme lens distortion. No flickering, flashing, jittery/shaky camera, fast/stuttering motion, low resolution, blur, out-of-focus elements, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures, or unrealistic reflections. No text, watermarks, logos, people, humans, animals, clutter, or dirty surfaces.""",
    
    'B': """Cinematic UE5 visualization of a luxury interior. Source image acts as an unalterable, frozen 3D digital architectural asset and absolute spatial sandbox. Absolute coordinate lock: every pixel, object, fixture, wall, and texture from the source image must remain strictly stationary in its exact original placement. All animation is executed exclusively as an internal digital crop-shift and bounded perspective adjustment—absolutely zero spatial expansion beyond the original frame. Execute a dynamic left-to-right cinematic tracking arc with a sharp focal zoom, strictly maintaining original edges. Hyper-polished Unreal Engine 5.5 Path Traced render, global illumination, 8K resolution, glossy Architectural Digest aesthetic, intense depth of field, cinematic real estate commercial style. Ultra-crisp architectural photography, perfect rectilinear perspective, perfectly straight vertical lines. Lighting features hyper-realistic Ray-Traced reflections, soft ambient occlusion, clean bounce light, and immaculate specular highlights on high-end materials. Absolute pixel-lock on all existing inventory. Zero hallucination, zero alteration, zero border-crossing. Motion must be fluid, smooth, and high-production-value. No adding, removing, replacing, or modifying a single object, wall, furniture piece, appliance, texture, decoration, or architectural element. No creating new rooms, exiting through walls, passing image boundaries, revealing exterior spaces, or border-crossing. No geometry morphing, mutating, warping, melting, bending, slanted walls, curved vertical lines, fisheye lens, or extreme lens distortion. No flickering, flashing, jittery/shaky camera, fast/stuttering motion, low resolution, blur, out-of-focus elements, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures, or unrealistic reflections. No text, watermarks, logos, people, humans, animals, clutter, or dirty surfaces.""",
    
    'C': """Cinematic UE5 visualization of a luxury interior. Source image acts as an unalterable, frozen 3D digital architectural asset and absolute spatial sandbox. Absolute coordinate lock: every pixel, object, fixture, wall, and texture from the source image must remain strictly stationary in its exact original placement. All animation is executed exclusively as an internal digital crop-shift and bounded perspective adjustment—absolutely zero spatial expansion beyond the original frame. Execute a high-impact, dramatic center push-in with a tight inward zoom, locked to the central focal point. Hyper-polished Unreal Engine 5.5 Path Traced render, global illumination, 8K resolution, glossy Architectural Digest aesthetic, intense depth of field, cinematic real estate commercial style. Ultra-crisp architectural photography, perfect rectilinear perspective, perfectly straight vertical lines. Lighting features hyper-realistic Ray-Traced reflections, soft ambient occlusion, clean bounce light, and immaculate specular highlights on high-end materials. Absolute pixel-lock on all existing inventory. Zero hallucination, zero alteration, zero border-crossing. Motion must be fluid, smooth, and high-production-value. No adding, removing, replacing, or modifying a single object, wall, furniture piece, appliance, texture, decoration, or architectural element. No creating new rooms, exiting through walls, passing image boundaries, revealing exterior spaces, or border-crossing. No geometry morphing, mutating, warping, melting, bending, slanted walls, curved vertical lines, fisheye lens, or extreme lens distortion. No flickering, flashing, jittery/shaky camera, fast/stuttering motion, low resolution, blur, out-of-focus elements, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures, or unrealistic reflections. No text, watermarks, logos, people, humans, animals, clutter, or dirty surfaces."""
}

def get_prompt_for_image(image_index: int, image_url: str | None = None) -> str:
    """Get the prompt for an image: frontend-supplied rotation override first,
    then the built-in A/B/C round-robin (image_index % 3)."""
    overrides = globals().get("PROMPT_OVERRIDES") or {}
    if image_url and image_url in overrides:
        return overrides[image_url]
    prompt_keys = ['A', 'B', 'C']
    prompt_key = prompt_keys[image_index % 3]
    return VIDEO_PROMPTS[prompt_key]


# Populated by /render_video from the request's image_prompts payload
PROMPT_OVERRIDES: dict = {}


def _write_job_status(record_id: str, status: str, extra: dict | None = None):
    """Persist job status to S3 so any worker container can serve /render_status."""
    import boto3, json as _json
    try:
        s3 = boto3.client('s3', region_name=S3_REGION)
        # 'cancelled' is terminal: later progress/failed/completed writes from
        # the still-running job must not resurrect it for polling clients.
        if status != "cancelled":
            try:
                existing = _json.loads(s3.get_object(Bucket=S3_BUCKET, Key=f"jobs/{record_id}.json")['Body'].read())
                if existing.get("status") == "cancelled":
                    print(f"Job {record_id}: keeping cancelled status (dropping '{status}' write)")
                    return
            except Exception:
                pass
        body = _json.dumps({"record_id": record_id, "status": status, "updatedAt": __import__('datetime').datetime.utcnow().isoformat(), **(extra or {})})
        s3.put_object(Bucket=S3_BUCKET, Key=f"jobs/{record_id}.json", Body=body, ContentType='application/json')
    except Exception as e:
        print(f"Job status write failed (non-fatal): {e}")


def _read_job_status(record_id: str):
    import boto3, json as _json
    try:
        s3 = boto3.client('s3', region_name=S3_REGION)
        obj = s3.get_object(Bucket=S3_BUCKET, Key=f"jobs/{record_id}.json")
        return _json.loads(obj['Body'].read())
    except Exception:
        return None

class RenderCancelled(Exception):
    """User cancelled this job — raised at cooperative checkpoints so the
    worker stops before spending more fal.ai/ffmpeg work."""


def _ensure_not_cancelled(job_id: str) -> None:
    """Abort if /cancel_render marked this job cancelled in S3."""
    current = _read_job_status(job_id)
    if current and current.get("status") == "cancelled":
        raise RenderCancelled(job_id)


# Tier configurations
TIER_CONFIGS = {
    "ESSENTIAL": {
        "processing_type": "local",
        "resolution": "1080p",
        "configurations": [
            {"duration": 30, "images": 6, "credits": 5},
            {"duration": 60, "images": 12, "credits": 10}
        ]
    },
    "SOCIAL": {
        "processing_type": "ai",
        "resolution": "512p",
        "configurations": [
            {"duration": 30, "images": 5, "credits": 30},
            {"duration": 50, "images": 10, "credits": 50},
            {"duration": 90, "images": 15, "credits": 80}
        ]
    },
    "CINEMATIC": {
        "processing_type": "ai",
        "resolution": "768p",  # Changed from 720p to match fal.ai API (expects 512P or 768P)
        "configurations": [
            {"duration": 30, "images": 5, "credits": 40},
            {"duration": 60, "images": 10, "credits": 70},
            {"duration": 90, "images": 15, "credits": 90}
        ]
    },
    "PREMIUM": {
        "processing_type": "ai_upscaled",
        "resolution": "768p",  # Changed from 720p to match fal.ai API (expects 512P or 768P)
        "configurations": [
            {"duration": 30, "images": 5, "credits": 60},
            {"duration": 60, "images": 10, "credits": 100},
            {"duration": 90, "images": 15, "credits": 150}
        ]
    }
}

@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=600, retries=2, min_containers=0, max_containers=200, scaledown_window=300)
def generate_ai_video_clip(
    image_url: str,
    prompt: str,
    resolution: str,
    duration: int = 6
) -> str:
    """
    Generate a 6-second AI video clip using fal-ai/minimax/hailuo-02
    
    Args:
        image_url: URL of the source image
        prompt: Video generation prompt (max 2000 chars)
        resolution: Target resolution (512p or 720p)
        duration: Duration in seconds (default 6)
    
    Returns:
        URL of the generated video clip
    """
    import fal_client
    
    # Truncate prompt to 2000 characters if needed
    if len(prompt) > 2000:
        prompt = prompt[:2000]
    
    print(f"Generating AI video clip: {resolution}, {duration}s")
    
    # Convert resolution to uppercase (fal.ai expects "512P" or "768P")
    resolution_upper = resolution.upper()
    
    # Use fal_client.submit() for long-running tasks with polling
    handler = fal_client.submit(
        "fal-ai/minimax/hailuo-02/standard/image-to-video",
        arguments={
            # Private buckets: fal.ai downloads the frame itself, so it needs
            # a signature (raw object URLs now 403).
            "image_url": presign_media(image_url),
            "prompt": prompt,
            "num_frames": duration * 24,  # 24 fps
            "resolution": resolution_upper,
            "audio": False  # Audio OFF as requested
        }
    )
    
    # Poll for completion with timeout
    import time
    max_wait = 540  # 9 minutes (leave 1 minute buffer before 10 minute timeout)
    start_time = time.time()
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise Exception(f"Timeout: fal.ai task did not complete within {max_wait}s")
        
        status = handler.status()  # Returns status object (Queued, InProgress, Completed, Failed)
        status_type = type(status).__name__  # Get the class name
        
        if status_type == "Completed":
            result = handler.get()
            video_url = result.get("video", {}).get("url")
            if not video_url:
                raise Exception("Failed to generate video clip")
            print(f"Generated video clip: {video_url}")
            return video_url
        elif status_type == "Failed":
            raise Exception(f"fal.ai task failed: {status.error}")
        elif status_type in ["Queued", "InProgress"]:
            print(f"fal.ai task {status_type}... ({int(elapsed)}s elapsed)")
            time.sleep(5)  # Poll every 5 seconds
        else:
            raise Exception(f"Unknown fal.ai status: {status_type}")


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials")], timeout=600, retries=2)
def upscale_video(input_video_url: str, target_resolution: str = "1080p") -> str:
    """
    Upscale video from 720p to 1080p using FFmpeg
    
    Args:
        input_video_url: URL of the 720p video
        target_resolution: Target resolution (default 1080p)
    
    Returns:
        URL of the upscaled video
    """
    import boto3
    import subprocess
    
    print(f"Upscaling video to {target_resolution}")
    
    # Download video (S3-API path for our own objects — buckets are private)
    input_path = "/tmp/input_video.mp4"
    with open(input_path, 'wb') as f:
        f.write(fetch_media(input_video_url))
    
    # Upscale using FFmpeg
    output_path = "/tmp/upscaled_video.mp4"
    
    if target_resolution == "1080p":
        scale_filter = "scale=1920:1080:flags=lanczos"
    else:
        scale_filter = "scale=1280:720:flags=lanczos"
    
    subprocess.run([
        "ffmpeg", "-i", input_path,
        "-vf", scale_filter,
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-c:a", "copy",
        "-y",
        output_path
    ], check=True)
    
    # Upload to S3
    s3 = boto3.client('s3', region_name=S3_REGION)
    s3_key = f"upscaled/{os.path.basename(input_video_url)}"
    
    s3.upload_file(
        output_path,
        S3_BUCKET,
        s3_key,
        # No ACL: Block Public Access is on — objects are private by default.
        ExtraArgs={'ContentType': 'video/mp4'}
    )
    
    video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    print(f"Upscaled video: {video_url}")
    
    return video_url


# ESSENTIAL-tier Ken Burns motion styles, rotated A → B → C per image exactly
# like the AI tiers rotate their Hailuo prompts. Each style is an ffmpeg
# zoompan expression (x, y, zoom over the clip's frame count).
ESSENTIAL_MOTION_STYLES = [
    # A — slow push-in from center (mirrors AI prompt A's "dramatic focal push-in")
    {"id": "A", "zoom": "min(zoom+{zrate},1.13)", "x": "iw/2-(iw/zoom/2)", "y": "ih/2-(ih/zoom/2)"},
    # B — left-to-right lateral drift with gentle zoom ("cinematic tracking arc")
    {"id": "B", "zoom": "min(zoom+{zrate},1.10)", "x": "(iw-iw/zoom)*({tfrac})", "y": "ih/2-(ih/zoom/2)"},
    # C — slow pull-back reveal (starts tight, eases out — a distinct third feel)
    {"id": "C", "zoom": "if(eq(on,1),1.12,max(zoom-{zrate},1.0))", "x": "iw/2-(iw/zoom/2)", "y": "(ih-ih/zoom)*0.35"},
]


def _essential_kenburns_clip(
    video_path: str,
    out_path: str,
    seconds: float,
    fps: int,
    width: int,
    height: int,
    style: dict,
) -> None:
    """Render one Ken Burns segment with pure ffmpeg zoompan (no fal, no moviepy).
    The image is upscaled 1.4x first so zoompan never samples beyond the frame."""
    import subprocess as _sp
    frames = max(int(round(seconds * fps)), 2)
    zrate = 0.12 / frames  # ~12% zoom across the segment
    style_fmt = {
        "id": style["id"],
        "zoom": style["zoom"].format(zrate=f"{zrate:.6f}"),
        # tfrac: horizontal position over time for the lateral drift (B)
        "x": style["x"].format(tfrac="on/" + str(frames - 1)) if "{tfrac}" in style["x"] else style["x"],
        "y": style["y"],
    }
    vf = (
        f"scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,crop={width * 2}:{height * 2},"
        f"zoompan=z='{style_fmt['zoom']}':x='{style_fmt['x']}':y='{style_fmt['y']}':d={frames}:s={width}x{height}:fps={fps},"
        "format=yuv420p"
    )
    proc = _sp.run(
        ["ffmpeg", "-y", "-loop", "1", "-i", video_path, "-t", f"{seconds}",
         "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "19",
         "-pix_fmt", "yuv420p", out_path],
        capture_output=True, timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg zoompan failed: {(proc.stderr or b'')[-300:]}")


def _mix_music_bed(
    silent_video_path: str,
    music_url: str,
    out_path: str,
    video_duration: float,
    music_volume: float = 0.22,
) -> None:
    """Loop/trim the music track to the video's duration, fade it out over the
    final 2 seconds, and mix it in with ffmpeg (no fal involved). Raises on
    failure — the caller decides whether a music failure fails the render."""
    import subprocess as _sp
    import tempfile as _tf
    import os as _os

    music_bytes = fetch_media(music_url, timeout=120)
    ext = ".mp3" if ".mp3" in music_url.lower() else ".wav" if ".wav" in music_url.lower() else ".m4a"
    with _tf.NamedTemporaryFile(suffix=ext, delete=False) as _f:
        _f.write(music_bytes)
        music_path = _f.name
    try:
        # -stream_loop -1 loops the (usually short) track to cover the video;
        # -shortest stops at the video's length; the fade eases the last 2s out
        # so the loop seam / ending never cuts abruptly.
        fade_start = max(float(video_duration) - 2.0, 0.0)
        proc = _sp.run(
            ["ffmpeg", "-y", "-i", silent_video_path,
             "-stream_loop", "-1", "-i", music_path,
             "-filter_complex",
             f"[1:a]volume={music_volume},afade=t=out:st={fade_start:.2f}:d=2[a]",
             "-map", "0:v", "-map", "[a]",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
             "-shortest", out_path],
            capture_output=True, timeout=600,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg music mix failed: {(proc.stderr or b'')[-300:]}")
    finally:
        try:
            _os.unlink(music_path)
        except Exception:
            pass


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials")], timeout=600, retries=2)
def render_video_local(
    record_id: str,
    images: list[str],
    duration: int,
    orientation: str,
    image_prompts: list[dict] | None = None,
    music_url: str | None = None,
) -> str:
    """
    Render video with pure FFmpeg (ESSENTIAL tier — no fal.ai involved).

    Each image gets a Ken Burns motion segment. Motion styles rotate A → B → C
    per image exactly like the AI tiers rotate their Hailuo prompts: the
    frontend's rotation payload is honored when supplied, otherwise round-robin
    by image index (i % 3).

    Args:
        record_id: Unique identifier for this render job
        images: List of image URLs
        duration: Total video duration in seconds
        orientation: Video orientation (LANDSCAPE or PORTRAIT)
        image_prompts: Optional per-image rotation payload from the frontend
            ([{image_url, prompt_id, prompt}]) — only the prompt_id (A/B/C)
            is used here to pick the matching motion style.

    Returns:
        URL of the rendered video
    """
    import boto3
    import subprocess as _sp
    import tempfile as _tf
    import os as _os

    print(f"Rendering local (pure ffmpeg) video: {record_id}, {duration}s, {orientation}")

    fps = 24
    if orientation == "PORTRAIT":
        width, height = 1080, 1920
    else:
        width, height = 1920, 1080

    work = _tf.mkdtemp(prefix=f"essential_{record_id}_")
    segment_paths = []
    n = max(1, len(images))
    seg_duration = duration / n

    for i, image_url in enumerate(images):
        # Motion-style rotation: frontend payload (A/B/C) if provided,
        # otherwise round-robin by index — same contract as the AI tiers
        supplied = None
        if image_prompts:
            match = next((p for p in image_prompts if p.get("image_url") == image_url and p.get("prompt_id")), None)
            supplied = str(match.get("prompt_id", "")).upper() if match else None
        style_id = supplied if supplied in ("A", "B", "C") else ESSENTIAL_MOTION_STYLES[i % 3]["id"]
        style = next(s for s in ESSENTIAL_MOTION_STYLES if s["id"] == style_id)
        _write_job_status(record_id, "processing", {
            "tier": "ESSENTIAL", "progress": round(i / n * 90),
            "clip": i + 1, "clips": n, "prompt_id": style_id,
        })
        print(f"Segment {i+1}/{n}: style {style_id}")

        # Download image → normalize to the exact output canvas (cover-crop,
        # no stretching) before the zoompan stage
        raw_path = os.path.join(work, f"raw_{i}.jpg")
        image_bytes = fetch_media(image_url, timeout=60)
        norm = _sp.run(
            ["ffmpeg", "-y", "-i", "-", "-vf",
             f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
             raw_path],
            input=image_bytes, capture_output=True, timeout=120,
        )
        if norm.returncode != 0:
            raise RuntimeError(f"ffmpeg normalize failed on image {i+1}: {(norm.stderr or b'')[-300:]}")

        seg_path = os.path.join(work, f"seg_{i}.mp4")
        _essential_kenburns_clip(raw_path, seg_path, seg_duration, fps, width, height, style)
        segment_paths.append(seg_path)
        try:
            _os.unlink(raw_path)
        except Exception:
            pass

    # Concatenate all segments (identical codecs → stream-copy concat)
    concat_list = os.path.join(work, "list.txt")
    with open(concat_list, "w") as f:
        for p in segment_paths:
            f.write(f"file '{p}'\n")
    output_path = os.path.join(work, "output.mp4")
    concat = _sp.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
         "-c", "copy", output_path],
        capture_output=True, timeout=300,
    )
    if concat.returncode != 0:
        # Fallback: re-encode concat (handles any codec drift between segments)
        concat = _sp.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
             "-c:v", "libx264", "-preset", "medium", "-crf", "19",
             "-pix_fmt", "yuv420p", output_path],
            capture_output=True, timeout=600,
        )
        if concat.returncode != 0:
            raise RuntimeError(f"ffmpeg concat failed: {(concat.stderr or b'')[-300:]}")

    # Optional music bed: loop/trim the admin track under the video and mix
    # with ffmpeg. The video stream is stream-copied — only audio is added.
    # If the track can't be fetched/decoded we ship the silent version.
    if music_url:
        try:
            print(f"Mixing music bed from {music_url[:80]}…")
            mixed_path = os.path.join(work, "output_music.mp4")
            _mix_music_bed(output_path, music_url, mixed_path, video_duration=duration)
            _os.replace(mixed_path, output_path)
            print("Music bed mixed in")
        except Exception as me:
            print(f"Music mix failed — shipping silent render: {me}")

    # Upload to S3
    s3 = boto3.client('s3', region_name=S3_REGION)
    s3_key = f"renders/{record_id}/video.mp4"
    s3.upload_file(
        output_path,
        S3_BUCKET,
        s3_key,
        # No ACL: Block Public Access is on — objects are private by default.
        ExtraArgs={'ContentType': 'video/mp4'}
    )
    video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    print(f"Local render complete: {video_url}")
    return video_url


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=900, retries=2, min_containers=0, max_containers=100, scaledown_window=300)
def render_video(
    record_id: str,
    tier: str,
    config_index: int,
    orientation: str,
    images: list[str],
    voiceover_text: str,
    voice_id: str = "Joanna",
    include_agent_branding: bool = True,
    music_url: str | None = None,
    image_prompts: list[dict] | None = None
) -> dict:
    """
    Render a property video based on the provided parameters.
    
    Args:
        record_id: Unique identifier for this render job
        tier: Video tier (ESSENTIAL, SOCIAL, CINEMATIC, PREMIUM)
        config_index: Index of the configuration to use
        orientation: Video orientation (LANDSCAPE or PORTRAIT)
        images: List of image URLs to include in the video
        voiceover_text: Text for the voiceover narration
        voice_id: Voice identifier for TTS (default: Joanna)
        include_agent_branding: Whether to include agent branding
        music_url: Optional background music URL
    
    Returns:
        Dictionary with video URL and metadata
    """
    import boto3
    
    print(f"Starting render job: {record_id}")
    print(f"Tier: {tier}, Config: {config_index}, Orientation: {orientation}")
    print(f"Images: {len(images)}, Voice: {voice_id}")
    
    # Get tier configuration
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS["SOCIAL"])
    config = tier_config["configurations"][config_index]
    processing_type = tier_config["processing_type"]
    resolution = tier_config["resolution"]
    
    print(f"Processing type: {processing_type}, Resolution: {resolution}")
    print(f"Duration: {config['duration']}s, Images: {config['images']}, Credits: {config['credits']}")
    
    # Limit images to configuration
    images = images[:config['images']]
    
    _write_job_status(record_id, "processing", {"tier": tier, "progress": 0})

    if processing_type == "local":
        # ESSENTIAL tier: pure-FFmpeg Ken Burns render (no fal.ai) with the
        # same A/B/C motion-style rotation the AI tiers use for prompts
        _ensure_not_cancelled(record_id)
        video_url = render_video_local.remote(
            record_id=record_id,
            images=images,
            duration=config['duration'],
            orientation=orientation,
            image_prompts=image_prompts,
            music_url=music_url,
        )
    else:
        # SOCIAL, CINEMATIC, PREMIUM tiers: AI rendering
        video_clips = []
        
        for i, image_url in enumerate(images):
            _ensure_not_cancelled(record_id)  # stop before spending fal.ai credits on the next clip
            print(f"Generating AI clip {i+1}/{len(images)}")
            
            # Per-image prompt: frontend rotation payload (A/B/C) if provided,
            # otherwise the built-in round-robin (i % 3)
            supplied = None
            if image_prompts:
                match = next((p for p in image_prompts if p.get("image_url") == image_url and p.get("prompt")), None)
                supplied = match.get("prompt") if match else None
            prompt = supplied or get_prompt_for_image(i)
            _write_job_status(record_id, "processing", {"tier": tier, "progress": round(i / max(1, len(images)) * 100), "clip": i + 1, "clips": len(images), "prompt_id": (match or {}).get("prompt_id") if match else ['A','B','C'][i % 3]})
            
            # Determine base resolution for AI generation
            if processing_type == "ai_upscaled":
                # PREMIUM: Generate at 768p, upscale to 1080p
                ai_resolution = "768p"
            else:
                # SOCIAL/CINEMATIC: Use tier resolution
                ai_resolution = resolution
            
            # Generate 6-second AI video clip
            clip_url = generate_ai_video_clip.remote(
                image_url=image_url,
                prompt=prompt,
                resolution=ai_resolution,
                duration=6
            )
            
            video_clips.append(clip_url)
        
        # Concatenate video clips
        print("Concatenating video clips...")
        # Note: In production, you'd use FFmpeg or moviepy to concatenate
        # For now, we'll use the first clip as placeholder
        video_url = video_clips[0] if video_clips else ""
        
        # Upscale if PREMIUM tier
        if processing_type == "ai_upscaled":
            print("Upscaling to 1080p...")
            video_url = upscale_video.remote(
                input_video_url=video_url,
                target_resolution="1080p"
            )
    
    # Add voiceover and music (placeholder)
    # In production, you'd use moviepy to add audio tracks
    
    print(f"✅ Render complete: {video_url}")

    _ensure_not_cancelled(record_id)  # cancelled during assembly — don't publish

    # Thumbnail for Listings cards: grab a frame from the finished video
    # (best-effort — never fails the render)
    thumbnail_url = None
    try:
        video_bytes = fetch_media(video_url, timeout=120)
        thumbnail_url = _thumbnail_from_video_bytes(video_bytes, f"thumbnails/render/{record_id}.jpg")
    except Exception as _te:
        print(f"render thumbnail skipped: {_te}")

    _write_job_status(record_id, "completed", {
        "video_url": video_url,
        "progress": 100,
        "duration_seconds": config['duration'],
        **({"thumbnail_url": thumbnail_url} if thumbnail_url else {}),
    })
    
    return {
        "record_id": record_id,
        "status": "completed",
        "video_url": video_url,
        "tier": tier,
        "config_index": config_index,
        "duration": config['duration'],
        "resolution": resolution,
        "processing_type": processing_type,
        "credits_used": config['credits'],
        "image_count": len(images)
    }


# ═══════════════════════════════════════════════════════════════════════════
# Failure path: mark job failed for polling clients (called via .spawn wrapper)
def render_video_failed(record_id: str, error: str):
    _write_job_status(record_id, "failed", {"error": error[:400]})# ───────────────────────────────────────────────────────────────────────────
# IMAGE EDITING FUNCTIONS
# ───────────────────────────────────────────────────────────────────────────

@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300, retries=2, max_containers=200, scaledown_window=300)
def edit_image_job(edit_id: str, image_url: str, preset_id: str, custom_prompt: str | None = None, strength: float | None = None, guidance_scale: float | None = None):
    """Async image-edit job wrapper: runs the sync edit_image body and mirrors
    progress/result into S3 so /edit_status can serve it to any poller."""
    _write_job_status(edit_id, "processing")
    try:
        result = edit_image.remote(
            image_url=image_url,
            preset_id=preset_id,
            custom_prompt=custom_prompt,
            strength=strength,
            guidance_scale=guidance_scale
        )
        _write_job_status(edit_id, "completed", {
            "image_url": result.get("image_url"),
            "preset_id": result.get("preset_id"),
            "strength": result.get("strength"),
            "guidance_scale": result.get("guidance_scale"),
            "credits_used": result.get("credits_used"),
        })
    except Exception as e:
        _write_job_status(edit_id, "failed", {"error": _friendly_fal_error(e)})


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=120)
def probe_fal_health():
    """Tiny fal.ai health probe: a 1-token any-llm ping. Classifies the result
    (healthy / billing_locked / auth_failed / provider_error / timeout) and
    stores it in S3 for /probe to serve. Scheduled every 15 min below."""
    import time as _time, json as _json
    import boto3
    started = _time.time()
    record = {"checkedAt": __import__('datetime').datetime.utcnow().isoformat(), "healthy": False, "class": "provider_error", "detail": "", "latencyMs": None}
    try:
        # Use the same resilient LLM chain as /generate_text — model paths on
        # the router drift, so the probe must not pin a single dead path.
        text = _llm_chat([{"role": "user", "content": "ping"}])
        ok = bool(text and text.strip())
        record.update({
            "healthy": bool(ok),
            "class": "healthy" if ok else "provider_error",
            "detail": "" if ok else "LLM returned an empty response",
            "latencyMs": int((_time.time() - started) * 1000),
        })
    except Exception as e:
        msg = str(e)
        if "Exhausted balance" in msg or "User is locked" in msg:
            cls, detail = "billing_locked", "fal.ai account out of balance — top up at fal.ai/dashboard/billing"
        elif "401" in msg or "Unauthorized" in msg or "invalid API key" in msg.lower():
            cls, detail = "auth_failed", "FAL_KEY rejected (401) — check the fal-credentials Modal secret"
        elif "timed out" in msg.lower() or "timeout" in msg.lower():
            cls, detail = "timeout", "fal.ai ping timed out after 120s"
        else:
            cls, detail = "provider_error", msg[:300]
        record.update({"healthy": False, "class": cls, "detail": detail, "latencyMs": int((_time.time() - started) * 1000)})

    try:
        s3 = boto3.client('s3', region_name=S3_REGION)
        s3.put_object(
            Bucket=S3_BUCKET, Key="jobs/health/fal.json",
            Body=_json.dumps(record), ContentType="application/json",
        )
        print(f"Health probe: {record['class']} in {record['latencyMs']}ms")
    except Exception as e:
        print(f"Health probe S3 write failed: {e}")
    return record


def _llm_chat(messages: list) -> str:
    """Call fal's OpenRouter LLM integration with endpoint fallbacks.
    Grok (x-ai) is the primary model for property copy; OpenRouter model
    catalogs drift, so keep fallbacks behind it."""
    attempts = [
        # (endpoint, extra args) — first success wins.
        # (the bare openrouter/router/google/gemini-… path 404s now; the
        # OpenAI-compatible /v1/chat/completions routes are the live ones)
        ("openrouter/router/openai/v1/chat/completions", {"model": "x-ai/grok-4.6"}),
        ("openrouter/router/openai/v1/chat/completions", {"model": "x-ai/grok-4.7"}),
        ("openrouter/router/openai/v1/chat/completions", {"model": "google/gemini-2.0-flash-001"}),
        ("openrouter/router/openai/v1/chat/completions", {"model": "openai/gpt-4o-mini"}),
    ]
    last_err = None
    for endpoint, extra in attempts:
        try:
            result = fal_client.run(endpoint, arguments={**extra, "messages": messages})
            if isinstance(result, dict):
                choices = result.get("choices") or []
                if choices:
                    text = (choices[0].get("message") or {}).get("content")
                    if text:
                        return text
            last_err = RuntimeError(f"LLM returned no output from {endpoint}: {str(result)[:200]}")
        except Exception as e:
            last_err = e
            continue
    raise last_err or RuntimeError("LLM call failed")


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("fal-credentials")], timeout=120)
def generate_text_fn(kind: str, fields: dict, images: list | None = None) -> str:
    """Grok AI text generation for property descriptions, social captions and
    video voiceover scripts (via fal's OpenRouter integration), with optional
    photo URLs for vision-described copy."""
    system_prompts = {
        "description": (
            "You are a professional South African property copywriter for Property24 and "
            "Private Property listings. Write an engaging property description in markdown-free "
            "plain text using the exact facts provided (bedrooms, bathrooms, price, suburb, "
            "key features, nearby amenities). When a confirmed location and nearby amenities are "
            "provided, weave 3-5 of the most relevant ones naturally into the copy (schools, "
            "shopping, cafés, parks) as lifestyle benefits. If photos are attached, describe the "
            "rooms and features you can actually see. Never invent facts that were not provided. "
            "Prices are in ZAR with the decimal system (e.g. R12 500 000,00). 3 short paragraphs, "
            "warm and professional tone."
        ),
        "social_caption": (
            "You are a social media copywriter for a South African estate agency. Write a punchy "
            "Instagram/WhatsApp/Facebook caption for the property described in the provided fields. "
            "Use the exact facts provided (beds, baths, price in ZAR with the decimal system, key "
            "features), mention what you can see in any attached photos, use 1-3 emojis, and end "
            "with 4-6 local hashtags (#PropertyForSale #CapeTown style). Never invent facts."
        ),
        "video_script": (
            "You are a real estate video scriptwriter. Write a spoken voiceover script for a property "
            "tour video using the exact facts in the provided fields. Plain spoken English only — no "
            "stage directions, no scene labels, no markdown. Roughly 140 words (about 60 seconds "
            "of narration). End with a call to action to book a viewing. Never invent facts."
        ),
    }
    system = system_prompts.get(kind, system_prompts["description"])
    facts = "\n".join(f"{k}: {v}" for k, v in fields.items() if v not in (None, "", []))
    user_text = f"Property facts:\n{facts}"
    user_content = user_text
    image_list = [u for u in (images or []) if u]
    if image_list:
        # Vision: Grok describes the attached photos alongside the facts
        user_content = [{"type": "text", "text": user_text}] + [
            {"type": "image_url", "image_url": {"url": presign_media(url)}} for url in image_list
        ]
    text = _llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ])
    return text


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=120, schedule=modal.Cron("*/15 * * * *"))
def scheduled_fal_probe():
    """Runs every 15 minutes on Modal's scheduler; refreshes the S3 health record."""
    probe_fal_health.remote()



# # IMAGE EDITING FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300, retries=2)
def edit_image(
    image_url: str,
    preset_id: str,
    custom_prompt: str | None = None,
    strength: float | None = None,
    guidance_scale: float | None = None
) -> dict:
    """
    Edit an image using fal-ai with comprehensive prompt library
    
    Args:
        image_url: URL of the source image
        preset_id: ID of the preset to use (e.g., 'golden_sunset', 'luxury_modern')
        custom_prompt: Optional custom prompt (overrides preset)
        strength: Optional strength override (uses preset default if not provided)
        guidance_scale: Optional guidance scale override (uses preset default if not provided)
    
    Returns:
        Dictionary with edited image URL and metadata
    """
    import boto3
    import fal_client
    
    print(f"Editing image: {preset_id}")
    
    # Get preset from library
    import sys
    sys.path.insert(0, '/root')
    from image_prompts import IMAGE_PRESETS
    preset = next((p for p in IMAGE_PRESETS if p['id'] == preset_id), None)
    
    if not preset:
        raise Exception(f"Preset not found: {preset_id}")
    
    # Use custom prompt if provided, otherwise use preset prompt
    prompt = custom_prompt if custom_prompt else preset['prompt']
    negative_prompt = preset['negative_prompt']
    
    # Use provided strength/guidance or preset defaults
    actual_strength = strength if strength is not None else preset['strength']['default']
    actual_guidance = guidance_scale if guidance_scale is not None else preset['guidanceScale']['default']
    
    print(f"Using strength: {actual_strength}, guidance: {actual_guidance}")
    
    # Use fal_client.submit() for long-running tasks with polling
    try:
        handler = fal_client.submit(
            "fal-ai/flux/dev/image-to-image",
            arguments={
                "image_url": presign_media(image_url),
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "strength": actual_strength,
                "guidance_scale": actual_guidance,
                "num_inference_steps": 50,
                "enable_safety_checker": False
            }
        )
    except Exception as e:
        # Convert provider errors to a plain exception: custom classes like
        # FalClientHTTPError fail to deserialize on the caller side and bury
        # the real cause (e.g. billing lock) in a deserialization blob.
        raise RuntimeError(_friendly_fal_error(e)) from None
    
    # Poll for completion with timeout
    import time
    max_wait = 240  # 4 minutes (leave 1 minute buffer before 5 minute timeout)
    start_time = time.time()
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise Exception(f"Timeout: fal.ai image edit task did not complete within {max_wait}s")
        
        status = handler.status()  # Returns status object (Queued, InProgress, Completed, Failed)
        status_type = type(status).__name__  # Get the class name
        
        if status_type == "Completed":
            result = handler.get()
            edited_image_url = result.get("images", [{}])[0].get("url")
            if not edited_image_url:
                raise Exception("Failed to generate edited image")
            break
        elif status_type == "Failed":
            raise Exception(f"fal.ai image edit task failed: {status.error}")
        elif status_type in ["Queued", "InProgress"]:
            print(f"fal.ai image edit task {status_type}... ({int(elapsed)}s elapsed)")
            time.sleep(3)  # Poll every 3 seconds (faster for images)
        else:
            raise Exception(f"Unknown fal.ai status: {status_type}")
    
    # Download and upload to S3
    response = requests.get(edited_image_url)
    
    s3 = boto3.client('s3', region_name=S3_REGION)
    s3_key = f"edited/{preset_id}_{os.path.basename(image_url)}"
    
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=response.content,
        ContentType='image/jpeg'
    )
    
    final_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    
    print(f"✅ Image edit complete: {final_url}")
    
    return {
        "status": "completed",
        "image_url": final_url,
        "preset_id": preset_id,
        "strength": actual_strength,
        "guidance_scale": actual_guidance,
        "credits_used": IMAGE_RENDER_CREDIT_COST
    }


@app.function(image=image)
def get_image_presets() -> list:
    """
    Get all available image editing presets
    
    Returns:
        List of preset dictionaries
    """
    import sys
    sys.path.insert(0, '/root')
    from image_prompts import IMAGE_PRESETS
    return IMAGE_PRESETS


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300, retries=2)
def generate_flashhead_video(
    profile_image_url: str,
    voiceover_text: str,
    user_id: str,
    voice: str = "Aria",
    stability: float = 0.5
) -> dict:
    """
    Generate a lip-synced video using fal-ai/flashhead
    
    Args:
        profile_image_url: URL of the agent's profile image (portrait recommended)
        voiceover_text: Text to speak (converted to speech via ElevenLabs)
        user_id: User identifier for S3 storage
        voice: ElevenLabs voice name (default: Aria)
               Options: Aria, Roger, Sarah, Laura, Charlie, George, Callum, 
                       River, Liam, Charlotte, Alice, Matilda, Will, Jessica, 
                       Eric, Chris, Brian, Daniel, Lily, Bill
        stability: Voice stability 0-1 (default: 0.5)
    
    Returns:
        Dictionary with video URL and metadata
    """
    import boto3
    import fal_client
    
    print(f"Generating FlashHead video for user: {user_id}")
    print(f"Voice: {voice}, Text length: {len(voiceover_text)} characters")
    
    # Use fal_client.submit() for long-running tasks with polling
    handler = fal_client.submit(
        "fal-ai/flashhead",
        arguments={
            "image_url": presign_media(profile_image_url),
            "text": voiceover_text,
            "voice": voice,
            "stability": stability
        }
    )
    
    # Poll for completion with timeout
    import time
    max_wait = 240  # 4 minutes (leave 1 minute buffer before 5 minute timeout)
    start_time = time.time()
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise Exception(f"Timeout: fal.ai FlashHead task did not complete within {max_wait}s")
        
        status = handler.status()  # Returns status object (Queued, InProgress, Completed, Failed)
        status_type = type(status).__name__  # Get the class name
        
        if status_type == "Completed":
            result = handler.get()
            video_url = result.get("video", {}).get("url")
            if not video_url:
                raise Exception("Failed to generate FlashHead video")
            print(f"✅ FlashHead video generated: {video_url}")
            break
        elif status_type == "Failed":
            raise Exception(f"fal.ai FlashHead task failed: {status.error}")
        elif status_type in ["Queued", "InProgress"]:
            print(f"fal.ai FlashHead task {status_type}... ({int(elapsed)}s elapsed)")
            time.sleep(5)  # Poll every 5 seconds
        else:
            raise Exception(f"Unknown fal.ai status: {status_type}")
    
    # Download the video and upload to S3
    s3 = boto3.client('s3', region_name=S3_REGION)
    
    # Download video from fal.ai
    video_response = requests.get(video_url)
    
    # Upload to S3
    import uuid
    video_key = f"flashhead/{user_id}/{uuid.uuid4().hex}.mp4"
    
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=video_key,
        Body=video_response.content,
        ContentType='video/mp4'
    )
    
    # Generate public URL
    final_video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{video_key}"
    
    print(f"✅ FlashHead video uploaded to S3: {final_video_url}")
    
    return {
        "status": "completed",
        "video_url": final_video_url,
        "duration": result.get("duration", 0.0),
        "seed": result.get("seed", 0),
        "user_id": user_id,
        "credits_used": 8,  # FlashHead costs 8 credits
        "model": "fal-ai/flashhead",
        "voice": voice
    }


@app.function(image=image)
def health_check() -> dict:
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "propreel-render",
        "version": "2.1.0",
        "model": "fal-ai/minimax/hailuo-02",
        "clip_duration": 6,
        "resolutions": ["512p", "720p", "1080p"],
        "audio": False,
        "flashhead": "fal-ai/flashhead/v1/lip-sync"
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FASTAPI WEB ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class ThumbnailRequest(BaseModel):
    video_url: str

@web_app.post("/make_thumbnail")
async def api_make_thumbnail(request: ThumbnailRequest):
    """Extract a thumbnail frame from a video URL. Used by the one-off
    backfill for pre-thumbnail renders and any client-less flows."""
    try:
        video_bytes = fetch_media(request.video_url, timeout=120)
        import uuid as _uuid
        url = _thumbnail_from_video_bytes(video_bytes, f"thumbnails/backfill/{_uuid.uuid4().hex}.jpg")
        if not url:
            raise HTTPException(status_code=502, detail="Thumbnail extraction failed")
        return presign_urls({"thumbnail_url": url})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:300])

@web_app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "propreel-render",
        "version": "2.1.0",
        "model": "fal-ai/minimax/hailuo-02",
        "clip_duration": 6,
        "resolutions": ["512p", "720p", "1080p"],
        "audio": False,
        "flashhead": "fal-ai/flashhead/v1/lip-sync"
    }

@web_app.post("/render_video")
async def api_render_video(request: RenderVideoRequest, raw_request: Request):
    """API endpoint to render video — SPAWNS the job and returns immediately.

    For 1000-concurrent-user scale, the HTTP request must not hold a connection
    for the full multi-minute render. Clients poll /render_status instead.
    Backward compatible: ?wait=true blocks like the old behaviour.
    """
    # Claim OUTSIDE the try: the blanket handler below would otherwise
    # re-wrap the 401/409/503 from _claim_job_token as a 500.
    _claim_job_token(raw_request)  # paid + single-use before any work starts
    try:
        if raw_request.query_params.get("wait") in ("true", "1"):
            result = await render_video.remote.aio(
                record_id=request.record_id,
                tier=request.tier,
                config_index=request.config_index,
                orientation=request.orientation,
                images=request.images,
                voiceover_text=request.voiceover_text,
                voice_id=request.voice_id,
                include_agent_branding=request.include_agent_branding,
                music_url=request.music_url,
                image_prompts=request.image_prompts
            )
            # Private buckets: the browser plays/shares this URL directly,
            # so hand it a long-lived presigned link, never the raw object.
            return presign_urls(result)

        # Async path: write initial job status to S3, then spawn
        _write_job_status(request.record_id, "queued", {"tier": request.tier})
        render_video.spawn(
            record_id=request.record_id,
            tier=request.tier,
            config_index=request.config_index,
            orientation=request.orientation,
            images=request.images,
            voiceover_text=request.voiceover_text,
            voice_id=request.voice_id,
            include_agent_branding=request.include_agent_branding,
            music_url=request.music_url,
            image_prompts=request.image_prompts
        )
        return {
            "record_id": request.record_id,
            "status": "queued",
            "poll_url": f"/render_status?record_id={request.record_id}",
            "message": "Render job accepted. Poll /render_status for progress."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@web_app.post("/cancel_render")
async def api_cancel_render(request: CancelRenderRequest):
    """Cancel an in-flight render job (video record_id or avatar job_id).

    Marks the S3 status file 'cancelled' (terminal) so polling clients stop
    immediately and the running job aborts at its next checkpoint — the guard
    in _write_job_status keeps later progress/completed writes from
    resurrecting it. The client refunds the credits and marks its project
    record FAILED, so the nightly reaper (PROCESSING rows only) never
    double-refunds.
    """
    current = _read_job_status(request.record_id)
    if current and current.get("status") == "completed":
        # Too late to cancel — hand back the finished render instead
        return presign_urls({
            "record_id": request.record_id,
            "status": "completed",
            "cancelled": False,
            "video_url": current.get("video_url"),
        })
    _write_job_status(request.record_id, "cancelled", {
        "previous": (current or {}).get("status", "unknown"),
        "reason": "user_cancelled",
    })
    return {"record_id": request.record_id, "status": "cancelled", "cancelled": True}

@web_app.get("/render_status")
async def api_render_status(record_id: str):
    """Poll render job status (S3-backed so any container can answer)."""
    status = _read_job_status(record_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown record_id: {record_id}")
    return presign_urls(status)

@web_app.post("/generate_flashhead_video")
async def api_generate_flashhead_video(request: FlashHeadRequest, raw_request: Request):
    """API endpoint to generate FlashHead lip-sync video"""
    _claim_job_token(raw_request)  # paid + single-use before any work starts
    try:
        # Call the Modal function asynchronously
        result = await generate_flashhead_video.remote.aio(
            profile_image_url=request.profile_image_url,
            voiceover_text=request.voiceover_text,
            user_id=request.user_id,
            voice=request.voice,
            stability=request.stability
        )
        return presign_urls(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@web_app.post("/edit_image")
async def api_edit_image(request: EditImageRequest, raw_request: Request):
    """API endpoint to edit image.

    Default: async — spawns an edit job and returns immediately with an
    edit_id; clients poll /edit_status. Backward compatible: ?wait=true
    blocks until the render completes.
    """
    _claim_job_token(raw_request)  # paid + single-use before any work starts
    try:
        if raw_request.query_params.get("wait") in ("true", "1"):
            result = await edit_image.remote.aio(
                image_url=request.image_url,
                preset_id=request.preset_id,
                custom_prompt=request.custom_prompt,
                strength=request.strength,
                guidance_scale=request.guidance_scale
            )
            return presign_urls(result)

        import time as _time, uuid as _uuid
        edit_id = f"edt_{int(_time.time() * 1000)}_{_uuid.uuid4().hex[:6]}"
        _write_job_status(edit_id, "queued", {"kind": "image_edit", "preset_id": request.preset_id})
        edit_image_job.spawn(
            edit_id=edit_id,
            image_url=request.image_url,
            preset_id=request.preset_id,
            custom_prompt=request.custom_prompt,
            strength=request.strength,
            guidance_scale=request.guidance_scale
        )
        return {
            "edit_id": edit_id,
            "status": "queued",
            "poll_url": f"/edit_status?edit_id={edit_id}",
            "message": "Edit job accepted. Poll /edit_status for progress."
        }
    except Exception as e:
        # Surface the real provider error (e.g. fal.ai billing/auth lock)
        # instead of an opaque serialized-exception blob.
        raise HTTPException(status_code=502, detail=_friendly_fal_error(e))

@web_app.get("/edit_status")
async def api_edit_status(edit_id: str):
    """Poll image edit job status (S3-backed so any container can answer)."""
    status = _read_job_status(edit_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown edit_id: {edit_id}")
    return presign_urls(status)

@web_app.get("/probe")
async def api_probe(refresh: str = ""):
    """fal.ai health probe: reads the last scheduled probe result from S3.
    ?refresh=true runs a fresh check now (tiny any-llm ping, negligible cost).
    Detects billing locks / bad API keys before users hit them."""
    import boto3
    try:
        if refresh in ("true", "1"):
            await probe_fal_health.remote.aio()
        s3 = boto3.client('s3', region_name=S3_REGION)
        obj = s3.get_object(Bucket=S3_BUCKET, Key="jobs/health/fal.json")
        import json as _json
        record = _json.loads(obj['Body'].read())
        return {**record, "service": "propreel-render", "probe": "fal-ai"}
    except Exception as e:
        return JSONResponse(status_code=503, content={
            "healthy": False,
            "class": "no_data",
            "detail": f"No probe result available: {e}",
            "service": "propreel-render",
        })

def _thumbnail_from_video_bytes(content: bytes, s3_key: str):
    """Grab a frame from video bytes with ffmpeg and upload it as a public
    JPEG. Returns the public URL, or None on any failure — thumbnails must
    never break a render."""
    import subprocess as _sp
    import tempfile as _tf
    import os as _os
    import boto3 as _boto3
    try:
        with _tf.NamedTemporaryFile(suffix=".mp4", delete=False) as _f:
            _f.write(content)
            video_path = _f.name
        thumb_path = video_path + ".jpg"
        try:
            # -ss 0.4 skips leading black frames; height derived, capped width
            grab = _sp.run(
                ["ffmpeg", "-y", "-ss", "0.4", "-i", video_path,
                 "-frames:v", "1", "-vf", "scale='min(800,iw)':-2", "-q:v", "4",
                 thumb_path],
                capture_output=True, timeout=60,
            )
            if grab.returncode != 0 or not _os.path.exists(thumb_path) or _os.path.getsize(thumb_path) == 0:
                stderr = (grab.stderr or b"")[-200:]
                print(f"thumbnail extract failed rc={grab.returncode}: {stderr}")
                return None
            s3 = _boto3.client("s3", region_name=S3_REGION)
            with open(thumb_path, "rb") as _img:
                s3.put_object(
                    Bucket=S3_BUCKET, Key=s3_key, Body=_img.read(),
                    ContentType="image/jpeg",
                )
            return f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
        finally:
            for _p in (video_path, thumb_path):
                try:
                    _os.unlink(_p)
                except Exception:
                    pass
    except Exception as e:
        print(f"thumbnail generation error: {e}")
        return None


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=900, retries=1, max_containers=100, scaledown_window=300)
def flashhead_job(job_id: str, profile_image_url: str, voiceover_text: str, user_id: str, voice: str = "Aria", stability: float = 0.5):
    """Async FlashHead lip-sync job (fal-ai/flashhead): mirrors progress and
    result into S3 so /flashhead_status can serve any poller. Input is the
    agent's profile picture + the AI-generated voiceover script text."""
    import boto3
    import time
    import uuid

    _write_job_status(job_id, "processing", {"kind": "flashhead"})
    try:
        print(f"FlashHead job {job_id}: voice={voice}, text={len(voiceover_text)} chars")
        handler = fal_client.submit(
            "fal-ai/flashhead",
            arguments={
                "image_url": presign_media(profile_image_url),
                "text": voiceover_text,
                "voice": voice,
                "stability": stability,
            },
        )

        max_wait = 840  # full-length scripts take ~4–6 min on fal; leave headroom
        start = time.time()
        while True:
            if time.time() - start > max_wait:
                raise RuntimeError(f"FlashHead task did not complete within {max_wait}s")
            current = _read_job_status(job_id)
            if current and current.get("status") == "cancelled":
                try:
                    handler.cancel()  # stop fal.ai billing — best effort
                except Exception:
                    pass
                raise RenderCancelled(job_id)
            status = handler.status()
            stype = type(status).__name__
            if stype == "Completed":
                result = handler.get()
                video_url = (result.get("video") or {}).get("url")
                if not video_url:
                    raise RuntimeError("FlashHead returned no video URL")
                break
            if stype == "Failed":
                raise RuntimeError(f"fal.ai FlashHead task failed: {getattr(status, 'error', 'unknown')}")
            print(f"FlashHead {stype}... ({int(time.time() - start)}s)")
            time.sleep(5)

        # Download from fal and store in AWS S3
        video_response = requests.get(video_url)
        video_response.raise_for_status()
        content = video_response.content
        # Measure the clip (dashboard runtime metrics) and grab a thumbnail
        # frame (Listings cards) — both best-effort, never fatal
        duration_seconds = None
        thumbnail_url = None
        try:
            import subprocess as _sp
            import tempfile as _tf
            import os as _os
            with _tf.NamedTemporaryFile(suffix=".mp4", delete=False) as _f:
                _f.write(content)
                _tmp_path = _f.name
            try:
                try:
                    _probe = _sp.run(
                        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                         "-of", "default=noprint_wrappers=1:nokey=1", _tmp_path],
                        capture_output=True, text=True, timeout=30,
                    )
                    duration_seconds = round(float(_probe.stdout.strip()), 1)
                except Exception as _pe:
                    print(f"ffprobe failed ({_pe}) — duration not recorded")
                thumbnail_url = _thumbnail_from_video_bytes(content, video_key[:-4] + ".jpg")
            finally:
                _os.unlink(_tmp_path)
        except Exception as _pe:
            print(f"probe/thumbnail unavailable ({_pe})")
        s3.put_object(
            Bucket=S3_BUCKET, Key=video_key,
            Body=content, ContentType='video/mp4',
        )
        final_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{video_key}"
        print(f"FlashHead job {job_id} complete: {final_url} ({duration_seconds}s)")
        _write_job_status(job_id, "completed", {
            "video_url": final_url,
            **({"duration_seconds": duration_seconds} if duration_seconds else {}),
            **({"thumbnail_url": thumbnail_url} if thumbnail_url else {}),
        })
    except Exception as e:
        _write_job_status(job_id, "failed", {"error": _friendly_fal_error(e)})


class FlashHeadJobRequest(BaseModel):
    profile_image_url: str
    voiceover_text: str
    user_id: str
    voice: str = "Aria"
    stability: float = 0.5


class GenerateTextRequest(BaseModel):
    kind: str  # description | social_caption | video_script
    fields: dict = {}
    images: list[str] = []  # optional photo URLs for Grok vision

@web_app.post("/flashhead")
async def api_flashhead(request: FlashHeadJobRequest, raw_request: Request):
    """Start an async FlashHead lip-sync job. Poll /flashhead_status."""
    _claim_job_token(raw_request)  # paid + single-use before any work starts
    try:
        import time as _time, uuid as _uuid
        job_id = f"fh_{int(_time.time() * 1000)}_{_uuid.uuid4().hex[:6]}"
        _write_job_status(job_id, "queued", {"kind": "flashhead"})
        flashhead_job.spawn(
            job_id=job_id,
            profile_image_url=request.profile_image_url,
            voiceover_text=request.voiceover_text,
            user_id=request.user_id,
            voice=request.voice,
            stability=request.stability,
        )
        return {
            "job_id": job_id,
            "status": "queued",
            "poll_url": f"/flashhead_status?job_id={job_id}",
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=_friendly_fal_error(e))

@web_app.get("/flashhead_status")
async def api_flashhead_status(job_id: str):
    status = _read_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")
    return presign_urls(status)

@web_app.post("/generate_text")
async def api_generate_text(request: GenerateTextRequest):
    """Grok AI text generation for property descriptions, social captions,
    and video voiceover scripts (optional attached photos)."""
    try:
        text = await generate_text_fn.remote.aio(kind=request.kind, fields=request.fields, images=request.images)
        return {"success": True, "kind": request.kind, "text": text}
    except Exception as e:
        raise HTTPException(status_code=502, detail=_friendly_fal_error(e))
@web_app.get("/get_image_presets")
async def api_get_image_presets():
    """API endpoint to get all image presets"""
    try:
        # Call the Modal function
        result = get_image_presets.remote()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount the FastAPI app to Modal
@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("render-auth")])
@modal.asgi_app()
def web():
    """Mount FastAPI app as Modal web endpoint"""
    return web_app


@app.local_entrypoint()
def main():
    """Local entrypoint for testing"""
    print("PropReel Modal Backend v2.2 (async image edits, health probe, LLM text)")

    print("Video Model: fal-ai/minimax/hailuo-02")
    print("FlashHead Model: fal-ai/flashhead/v1/lip-sync")
    print("Clip Duration: 6 seconds")
    print("Resolutions: 512p, 720p, 1080p")
    print("Audio: OFF")
    print("\nAPI Endpoints:")
    print("  GET  /health")
    print("  POST /render_video")
    print("  POST /generate_flashhead_video")
    print("  POST /edit_image  (async: poll /edit_status; ?wait=true for legacy)")
    print("  GET  /edit_status?edit_id=…")
    print("  GET  /probe  (?refresh=true for immediate check)")
    print("  POST /generate_text  {kind, fields}")
    print("  GET  /get_image_presets")
    print("\nUse 'modal deploy' to deploy this app")


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials")], timeout=120)
def media_selftest(object_key: str = "renders/pr_1791056980364_fgxj/video.mp4") -> dict:
    """Operator smoke test for the private-bucket media path (audit M-5).

    Exercises, from inside the worker:
      1. fetch_media() on a RAW object URL — the S3-API read path that keeps
         working once the buckets are private
      2. presign_media() + a real HTTP GET of the minted link
      3. a no-ACL PutObject (what every render now does) followed by a raw GET
         (403 expected once Block Public Access is on) and a presigned GET
      4. cleanup of the probe object

    Run before AND after the bucket flip:
        modal run app_propreel_minimax.py::media_selftest
    """
    import time as _t
    results: dict = {"bucket": S3_BUCKET, "object_key": object_key}
    s3 = _s3()

    # 1) raw URL → S3 API read
    raw_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{object_key}"
    try:
        data = fetch_media(raw_url, timeout=60)
        results["fetch_media"] = f"ok ({len(data)} bytes)"
    except Exception as e:
        results["fetch_media"] = f"FAIL: {e}"

    # 2) presigned GET over HTTP
    signed = presign_media(raw_url)
    results["presigned_url_minted"] = signed != raw_url and "X-Amz-Signature" in signed
    try:
        r = requests.get(signed, timeout=60, headers={"Range": "bytes=0-1"})
        results["presigned_http_status"] = r.status_code
    except Exception as e:
        results["presigned_http_status"] = f"FAIL: {e}"

    # 3b) edge rehost — only meaningful when EDGE_*_HOST is configured on the
    # worker; the signed link must still fetch 200 through CloudFront.
    edged = to_edge_url(signed)
    if edged != signed:
        try:
            r3 = requests.get(edged, timeout=60, headers={"Range": "bytes=0-1"})
            results["edge_http_status"] = r3.status_code
            results["edge_host"] = edged.split("/")[2]
        except Exception as e:
            results["edge_http_status"] = f"FAIL: {e}"
    else:
        results["edge_http_status"] = "skipped (EDGE_*_HOST unset)"

    # 3) upload without ACL (the shape every render uses), then probe access
    probe_key = f"selftest/media_{int(_t.time() * 1000)}.txt"
    probe_raw = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{probe_key}"
    try:
        s3.put_object(Bucket=S3_BUCKET, Key=probe_key, Body=b"propreel-media-selftest", ContentType="text/plain")
        results["upload_no_acl"] = "ok"
        try:
            r = requests.get(probe_raw, timeout=30)
            results["raw_get_status"] = r.status_code  # 403 = buckets really are private
        except Exception as e:
            results["raw_get_status"] = f"FAIL: {e}"
        r2 = requests.get(presign_media(probe_raw), timeout=30)
        results["presigned_probe_status"] = r2.status_code
    except Exception as e:
        results["upload_no_acl"] = f"FAIL: {e}"
        results.setdefault("raw_get_status", "skipped")
        results.setdefault("presigned_probe_status", "skipped")
    finally:
        try:
            s3.delete_object(Bucket=S3_BUCKET, Key=probe_key)
            results["cleanup"] = "ok"
        except Exception as e:
            results["cleanup"] = f"FAIL: {e}"

    # Print as well as return — `modal run` doesn't surface return values.
    print("SELFTEST " + json.dumps(results))
    return results
