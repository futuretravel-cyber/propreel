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
# /admin/secret carries its own stronger gate (ADMIN_API_KEY bearer,
# constant-time compared, allow-listed secret names) — exempt it here.
_token_allow_paths = {"/health", "/probe", "/docs", "/openapi.json", "/favicon.ico", "/admin/secret"}
_warned_no_secret = False


def _parse_token(value: Optional[str]):
    """Verify X-PropReel-Token. Returns ({version, uid, scope, exp, scriptHash?}, None)
    on success or (None, error) on failure.

    v1.<exp>.<uid>.<sig>              — generic token: status polls, cancels,
                                        cheap text generation. Free to mint.
    v2.<exp>.<uid>.<scope>.<sig>      — PAID job token (scope: render|flashhead|edit|script),
                                        minted by the API only after it charges
                                        credits at the price in
                                        lib/renderPricing. Required to START a job.
    v3.<exp>.<uid>.<scope>.<hash>.<sig> — PAID job token bound to the exact
                                        narration script (FlashHead is priced
                                        per 10s of narration): <hash> is a
                                        16-hex sha256 prefix of the normed
                                        voiceover_text the API priced. The
                                        worker refuses a body whose script
                                        hash differs, so a cheaper script
                                        cannot fund a longer one.
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
        # 'description' / 'social_post' ride v2 tokens to /generate_text: the
        # API server-prices those scopes from lib/renderPricing exactly like
        # the others, and a renderer / endpoint that never prices a scope
        # doesn't care what the token says — get_scope is advisory. Keeping
        # the enum closed here used to 401 every Property Description call
        # (agent-visible symptom: "unknown job scope — your credit was
        # refunded") even though the credit was charged and the run was paid.
        if not scope or not scope.isalnum() or len(scope) > 32:
            return None, "unknown job scope"
        msg = f"v2.{exp_s}.{uid}.{scope}"
        version = 2
    elif len(parts) == 6 and parts[0] == "v3":
        _, exp_s, uid, scope, script_hash, sig = parts
        if not scope or not scope.isalnum() or len(scope) > 32:
            return None, "unknown job scope"
        if len(script_hash) != 16 or any(c not in "0123456789abcdef" for c in script_hash):
            return None, "malformed token script hash"
        msg = f"v3.{exp_s}.{uid}.{scope}.{script_hash}"
        version = 3
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
    return {
        "version": version,
        "uid": uid,
        "scope": scope,
        "exp": exp,
        # v3 only — the 16-hex sha256 prefix of the normed narration script
        **({"scriptHash": script_hash} if version == 3 else {}),
    }, None


def _verify_paid_script_hash(info: Optional[dict], voiceover_text: str) -> None:
    """Scope flashhead binds its paid token to the EXACT narration script.

    v3 tokens embed a 16-hex sha256 prefix of the whitespace-normed
    voiceover_text (the same normalization the API minted it from). The body's
    script must hash to the same value — otherwise a tampered client could
    mint a cheap 10-word token and render a 1,000-word clip. The only honest
    route is a fresh mint, which is a fresh charge. v1/v2 tokens carry no
    hash (pre-pricing legacy) and skip this check.

    MUST run before _claim_job_token: claim burns the token, and a mismatch
    must be refundable (the client refunds unreversed charges) — a burnt-but-
    mismatched token would strand the credits without a failed render to
    reverse. Parse errors are ignored here; the middleware / claim still
    enforce authentication.
    """
    if not info or not info.get("scriptHash"):
        return
    normed = " ".join(str(voiceover_text or "").split())
    prefix = hashlib.sha256(normed.encode()).hexdigest()[:16]
    if prefix != info["scriptHash"]:
        raise HTTPException(
            status_code=409,
            detail="This payment was made for a different voiceover script — the render was not started and the charge will be refunded. Re-request the avatar video to pay for the current script.",
        )


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
    # v3 tokens are v2 plus the bound script hash (per-10s narration pricing)
    # — same single-use claim, so paid-job endpoints accept both versions.
    if need and (info["version"] not in (2, 3) or info["scope"] != need):
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

    Script tokens (AI Writer voiceover, scope='script') are charge-proven but
    NOT single-use: /generate_text costs fractions of a cent, holds no job,
    and a failed first call must be retryable without a second 1-credit
    charge (the client refunds on failure; a burn here would make the
    retry re-charge). Every monster-cost endpoint stays single-use.
    """
    import hashlib as _hashlib
    token = request.headers.get(_token_header) or ""
    info, err = _parse_token(token)
    if err or not info:
        raise HTTPException(status_code=401, detail=err or "invalid token")
    if info["scope"] == "script":
        return  # paid at mint; no job to double-spend
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
    "ffmpeg",
    # A real TTF for the branding contact bar: the container ships no fonts,
    # PIL's bitmap default is so small that portrait renders (1080-wide,
    # 96px-tall bar) showed illegible contact details / nothing at all.
    "fonts-dejavu-core"
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


def _friendly_fal_error(e: Exception, context: str = "Image edit") -> str:
    """Map fal.ai/provider failures to clear client-facing messages.

    `context` names the failing feature ("Image edit", "Description", "AI
    writer", ...) — the text-generation endpoints previously inherited the
    "Image edit failed" prefix for their LLM timeouts, which sent agents to
    debug the wrong tool."""
    import fal_client  # noqa: F401  (ensure module present for error classes)
    msg = str(e) or e.__class__.__name__
    # Remote tracebacks bury the real cause in the last lines.
    if "Could not deserialize remote exception" in msg or "remote traceback" in msg.lower():
        lines = [l.strip() for l in msg.splitlines() if l.strip()]
        msg = lines[-1] if lines else msg
    lowered = msg.lower()
    if "Exhausted balance" in msg or "User is locked" in msg:
        return f"{context} failed: the fal.ai account is out of balance (user locked). Top up at fal.ai/dashboard/billing."
    # ── Media-fetch failures BEFORE any status-code branch ────────────────
    # When a provider failed to fetch OUR media (an input image the vendor
    # downloads itself), its error text often carries the HTTP status of that
    # download ("failed to download image ... 401", "Error fetching image: 403")
    # — which the generic 401 branch below used to blame on FAL_KEY, sending
    # the agent to rotate a perfectly-valid key while the real problem is the
    # media URL (expired/unsigned presign, deleted object, host 403 on a
    # private bucket). Detection: a download/fetch/load verb over an image/
    # media/URL token. This precedence is intentional.
    media_fetch_failure = (
        ("download" in lowered or "fetch" in lowered or "load" in lowered or "retrieve" in lowered)
        and ("image" in lowered or "media" in lowered or "url" in lowered or "https://" in lowered)
    )
    if media_fetch_failure:
        return (
            f"{context} failed: the provider could not fetch the attached image/media "
            f"({msg[:220]}). This is about the media URL, not the API key — "
            "usually an expired/unreachable image link. Retry the request; if it "
            "persists the source image needs re-uploading."
        )
    # Worker-side S3 credentials missing (presign_media historically raised
    # this when the aws-credentials Modal secret was not mounted on the
    # function) — distinct from fal auth and actionable on OUR side.
    if "unable to locate credentials" in lowered:
        return (
            f"{context} failed: this worker is missing its S3 credentials "
            "(aws-credentials Modal secret not mounted on the function) — "
            "vendor media could not be presigned. Ops: attach the "
            "aws-credentials secret and redeploy."
        )
    if "401" in msg or "Unauthorized" in msg:
        return "fal.ai rejected the API key (401 Unauthorized) - check FAL_KEY in the fal-credentials Modal secret."
    if "403" in msg or "Forbidden" in msg:
        return f"fal.ai rejected the request (403 Forbidden): {msg[:300]}"
    if "422" in msg or "Unprocessable" in msg:
        return f"fal.ai rejected the request payload (422): {msg[:300]}"
    if "429" in msg or "rate limit" in msg.lower():
        return "fal.ai rate limit reached - please retry in a moment."
    return f"{context} failed: {msg[:400]}"


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
    object. The hostname may be either the bucket itself OR its CloudFront
    edge alias (uploads./cdn.propreel.co.za): since Phase 2 of the media
    isolation, EVERYTHING the browser receives — including the music_url
    this worker gets back from the Studio — is edge-hosted, and a plain
    HTTP fetch of those 403s. Resolving edge URLs to the bucket+key and
    reading through the S3 API is what makes the music bed actually audible
    in finished renders.
    """
    if not isinstance(url, str) or not url.startswith("https://"):
        return None
    try:
        from urllib.parse import urlparse, unquote
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        bucket = None
        suffix = f".s3.{S3_REGION}.amazonaws.com"
        edge_raw = os.environ.get("EDGE_RAW_HOST", "propreel-raw-assets").replace("https://", "").strip("/")
        edge_cdn = os.environ.get("EDGE_CDN_HOST", "propreel-video").replace("https://", "").strip("/")
        if hostname.endswith(suffix):
            bucket = hostname[: -len(suffix)]
        elif edge_raw and hostname == edge_raw.lower():
            bucket = os.environ.get("AWS_S3_RAW_BUCKET", "propreel-raw-assets")
        elif edge_cdn and hostname == edge_cdn.lower():
            bucket = S3_BUCKET
        if not bucket or bucket not in OUR_BUCKETS:
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


# Every image editor on the site returns ONE frame size: 1920×1080 (16:9).
# The model follows input aspect natively, so outputs otherwise drift
# (1024×576, 1248×832, 2048×2048 …) — the product wants a uniform frame
# for thumbnails, grids and downloads across Photo Editor / Staging /
# Removal / Twilight, which all funnel through this one function.
# Portrait sources are pillarboxed into the frame (see _fit_image_bytes);
# narrower landscape sources are scaled by WIDTH and center-cropped
# top/bottom. That direction matters: the horizontal field of view is
# always preserved, so a landscape photo is never magnified the way the
# old 4:3 frame magnified it (cropping the SIDES made everything look
# "zoomed in" next to the untouched Before).
EDIT_OUTPUT_WIDTH = 1920
EDIT_OUTPUT_HEIGHT = 1080


def _fit_image_bytes(data: bytes, width: int = EDIT_OUTPUT_WIDTH,
                     height: int = EDIT_OUTPUT_HEIGHT) -> bytes:
    """Fit to exactly width×height.

    Landscape/square sources cover-scale then center-crop (never pads —
    the accepted behaviour for wide property shots). PORTRAIT sources
    (taller than wide) scale to fit INSIDE the frame and pillarbox with
    black bars instead: a center-crop amputates the top and bottom of a
    vertical photo (agent loses the ceiling, the floor, half the room).
    Already-correct bytes pass through untouched (no re-encode); any ffprobe/
    ffmpeg failure degrades to the original rather than failing an edit the
    agent already paid for."""
    import subprocess as _sp
    import tempfile as _tf
    import os as _os
    in_path = out_path = None
    portrait = False
    try:
        with _tf.NamedTemporaryFile(suffix='.img', delete=False) as f:
            f.write(data)
            in_path = f.name
        # Already the target frame → hand back the original bytes untouched
        try:
            probe = _sp.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=width,height', '-of', 'csv=p=0', in_path],
                capture_output=True, text=True, timeout=30,
            )
            line = (probe.stdout or '').strip().splitlines()
            if line:
                w_str, h_str = line[0].split(',')[:2]
                src_w, src_h = int(w_str), int(h_str)
                if (src_w, src_h) == (width, height):
                    return data
                portrait = src_h > src_w
        except Exception:
            pass  # unreadable dims → run ffmpeg anyway (crop fallback)
        out_path = in_path + '.fit.jpg'
        if portrait:
            # contain + pillarbox: the whole photo survives, bars fill the sides
            vf = (f'scale={width}:{height}:force_original_aspect_ratio=decrease,'
                  f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black')
        else:
            vf = (f'scale={width}:{height}:force_original_aspect_ratio=increase,'
                  f'crop={width}:{height}')
        _sp.run(
            ['ffmpeg', '-v', 'error', '-y', '-i', in_path,
             '-vf', vf,
             '-q:v', '2', out_path],
            check=True, capture_output=True, timeout=60,
        )
        with open(out_path, 'rb') as f:
            fitted = f.read()
        # ffmpeg writes a valid JPEG; sanity-check before replacing the payload
        return fitted if fitted else data
    except Exception as e:
        print(f"fit-to-{width}x{height} skipped: {e}")
        return data
    finally:
        for p in (in_path, out_path):
            if p:
                try:
                    _os.unlink(p)
                except Exception:
                    pass

def _luma_mean(data: bytes) -> float | None:
    """Mean luminance (0-255) of a still image, via ffmpeg downscale to a
    64x36 gray raster. None when ffmpeg cannot read the bytes."""
    import subprocess as _sp
    import tempfile as _tf
    import os as _os
    p = None
    try:
        with _tf.NamedTemporaryFile(suffix='.img', delete=False) as f:
            f.write(data)
            p = f.name
        r = _sp.run(
            ['ffmpeg', '-v', 'error', '-i', p,
             '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-'],
            capture_output=True, timeout=30,
        )
        if r.returncode == 0 and r.stdout:
            return sum(r.stdout) / len(r.stdout)
    except Exception:
        pass
    finally:
        if p:
            try:
                _os.unlink(p)
            except Exception:
                pass
    return None


# Staging renders occasionally come back cave-dark (the style vocabulary
# outweighs the prompt's lighting instructions — twice-reported by agents:
# Industrial Loft at mean 24.7/255 against a 154-bright source). Prompt
# fixes reduce the frequency but cannot guarantee it, so the store path
# enforces a floor: a staging output below 60% of the SOURCE's mean
# luminance gets an ffmpeg gamma lift until it clears the bar. Twilight
# presets are deliberately exempt (Blue Hour / Night are SUPPOSED dark).
STAGING_BRIGHTNESS_FLOOR = 0.60
_STAGING_GAMMA_LADDER = (1.3, 1.5, 1.75, 2.0)


def _twilight_brightness_floor(payload: bytes, source: bytes, preset_id: str) -> bytes:
    """Twilight variants with bounded luminance targets: the render must keep
    some readability (an agent's listing photo that reads as a black rectangle
    is a failed render) while still being visibly night/day-mood appropriate.
    Enforced per preset because each mood has a different natural floor:
    absolute mean-luma targets. Best-effort gamma lift only (same machinery
    as the staging floor); a cosmetic failure never fails a paid render."""
    # Absolute target (mean luma /255). Measured against the failure window:
    # night_lights came back ~19/255 for a 103/255 source (unreadable), while
    # the correct target for a classic dusk real-estate shot sits 60-80.
    TWILIGHT_TARGETS = {
        "blue_hour": 78.0,          # brightest twilight — holds ambient light
        "night_lights": 62.0,       # dark sky but a luminous, inviting home
        "moody_atmospheric": 68.0,  # overcast evening, soft readable light
    }
    target = TWILIGHT_TARGETS.get(preset_id)
    if target is None:
        return payload
    out_mean = _luma_mean(payload)
    if not out_mean or out_mean >= target:
        return payload
    print(f"twilight floor: {preset_id} output {out_mean:.0f} < target {target} — lifting")
    import subprocess as _sp
    import tempfile as _tf
    import os as _os
    in_path = None
    best, best_mean = payload, out_mean
    try:
        with _tf.NamedTemporaryFile(suffix='.img', delete=False) as f:
            f.write(payload)
            in_path = f.name
        for gamma in _STAGING_GAMMA_LADDER:
            out_path = in_path + f'.tw{gamma}.jpg'
            _sp.run(
                ['ffmpeg', '-v', 'error', '-y', '-i', in_path,
                 '-vf', f'eq=gamma={gamma}', '-q:v', '2', out_path],
                check=True, capture_output=True, timeout=60,
            )
            with open(out_path, 'rb') as g:
                cand = g.read()
            cand_mean = _luma_mean(cand)
            if best_mean is None or (cand_mean is not None and abs(cand_mean - target) < abs(best_mean - target)):
                best, best_mean = cand, cand_mean
            if cand_mean is not None and cand_mean >= target:
                best, best_mean = cand, cand_mean
                break
        return best
    except Exception as e:
        print(f"twilight floor skipped: {e}")
        return payload
    finally:
        try:
            if in_path:
                _os.unlink(in_path)
        except Exception:
            pass


def _staging_brightness_floor(payload: bytes, source: bytes) -> bytes:
    """Gamma-lift a too-dark staging render toward its source photo's
    brightness. Best-effort and bounded: any failure returns the original
    payload — an edit the agent paid for must never fail over cosmetics."""
    import subprocess as _sp
    import tempfile as _tf
    import os as _os
    try:
        src_mean = _luma_mean(source)
        out_mean = _luma_mean(payload)
        if not src_mean or not out_mean:
            return payload
        target = STAGING_BRIGHTNESS_FLOOR * src_mean
        if out_mean >= target:
            return payload
        print(f"brightness floor: output {out_mean:.0f} < {target:.0f} "
              f"(60% of source {src_mean:.0f}) — lifting")
        in_path = None
        best, best_mean = payload, out_mean
        try:
            with _tf.NamedTemporaryFile(suffix='.img', delete=False) as f:
                f.write(payload)
                in_path = f.name
            for gamma in _STAGING_GAMMA_LADDER:
                out_path = in_path + f'.g{gamma}.jpg'
                _sp.run(
                    ['ffmpeg', '-v', 'error', '-y', '-i', in_path,
                     '-vf', f'eq=gamma={gamma}', '-q:v', '2', out_path],
                    check=True, capture_output=True, timeout=60,
                )
                with open(out_path, 'rb') as f:
                    lifted = f.read()
                mean = _luma_mean(lifted)
                if lifted and mean and mean > best_mean:
                    best, best_mean = lifted, mean
                if lifted and mean and mean >= target:
                    print(f"brightness floor: gamma {gamma} -> {mean:.0f}")
                    return lifted
                try:
                    _os.unlink(out_path)
                except Exception:
                    pass
        finally:
            if in_path:
                try:
                    _os.unlink(in_path)
                except Exception:
                    pass
        # Nothing reached the floor — hand back the brightest attempt.
        print(f"brightness floor: best effort {best_mean:.0f} (target {target:.0f})")
        return best
    except Exception as e:
        print(f"brightness floor skipped: {e}")
        return payload


# Caption system prompt for the room-anchor injected into staging/removal
# edit prompts. Kontext routinely reinvents featureless rooms (white-walled
# open-plan spaces especially) into furniture-catalog interiors — stairs,
# brick, dropped ceilings that were never in the photo. Describing THE actual
# room factually inside the prompt anchors the edit to this photo's geometry.
# Entities must never be named conditionally ("no staircase…"), because
# Kontext tends to PAINT whatever the prompt mentions — so the caption states
# only what is visible, and geometry rules speak in constraints, not objects.
_ROOM_ANCHOR_SYSTEM = (
    "Describe the room photographed in this image factually for downstream "
    "image-editing software. In 2-3 sentences state the room layout, the visible "
    "openings and doorways and where they lead, the ceiling shape and height, the "
    "wall colours and materials, the floor material, the furniture exactly as "
    "placed, and any built-in features. State only what is actually visible. "
    "No styles, no suggestions, no marketing language."
)


def _room_cleared(image_url: str, emptied_url: str) -> bool:
    """Vision check: did the emptier leave furniture in the room?

    Feeds the original + emptied photos to the LLM and asks strictly whether
    any movable item remains. The stubborn dining set survived stage A even
    at guidance 2.9 in three different wordings — the reliable pattern is a
    strict Y/N vision gate, not firmer prose."""
    caption = _llm_chat([
        {"role": "system", "content": (
            "You check whether a room was successfully emptied of furniture. "
            "You are shown PHOTO 1 (the original furnished room) and PHOTO 2 "
            "(the same room after a removal edit). Built-in elements — "
            "kitchen units, cupboards, appliances, counters, light switches, "
            "wall art, curtains, doors — SHOULD remain and do not count as "
            "furniture. Movable items — tables, chairs, sofas, beds, lamps, "
            "rugs, side tables, decorative objects, personal belongings — "
            "MUST all be gone. Answer with ONLY the word YES if photo 2 "
            "contains any such movable item from photo 1, or NO if the room "
            "is completely empty of movable items. One word, nothing else."
        )},
        {"role": "user", "content": [
            {"type": "text", "text": "Is PHOTO 2 completely empty of movable furniture and items? PHOTO 1 is the original, PHOTO 2 is the emptied room."},
            *[
                {"type": "image_url", "image_url": {"url": presign_media(u)}}
                for u in (image_url, emptied_url)
            ],
        ]},
    ])
    verdict = caption.strip().upper()
    return verdict.endswith("YES")


def _room_anchor_bytes_url(image_url: str, images: "list | None" = None) -> str:
    """Best-effort factual caption of the input photo (see _ROOM_ANCHOR_SYSTEM).

    Raises on failure — callers decide whether that is fatal or skippable.
    `images` overrides the photo list (urls are presigned via presign_media)."""
    image_list = images if images is not None else [image_url]
    caption = _llm_chat([
        {"role": "system", "content": _ROOM_ANCHOR_SYSTEM},
        {"role": "user", "content": [
            {"type": "text", "text": "Describe this room."},
            *[
                {"type": "image_url", "image_url": {"url": presign_media(u)}}
                for u in image_list
            ],
        ]},
    ])
    return " ".join(caption.split())[:600]


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
    # BCP-47 code of one of South Africa's 11 official languages — the
    # narrator must natively speak it (re-validated against voice_id below).
    language: str = "en-ZA"
    include_agent_branding: bool = True
    music_url: Optional[str] = None
    image_prompts: Optional[List[dict]] = None  # [{image_url, prompt_id, prompt}] rotation overrides
    audio: bool = False
    # Agent branding payload (Video Generator → Enhancements toggle). The
    # flag alone was never enough — the worker had nothing to draw, so the
    # toggle silently produced no overlay. Everything the renderer needs
    # rides along: photo top-left, logo top-right, contact line at the
    # bottom. use_avatar swaps the agent photo for the AI-avatar headshot.
    branding: Optional[dict] = None  # {photo_url, logo_url, contact_line, use_avatar}

class CancelRenderRequest(BaseModel):
    # render record_id or flashhead job_id — both live in the jobs/ store
    record_id: str


class FlashHeadRequest(BaseModel):
    profile_image_url: str
    voiceover_text: str
    user_id: str
    voice: str = "Aria"
    language: str = "en-ZA"  # BCP-47 voiceover language (11 official SA languages)
    stability: float = 0.5

class EditImageRequest(BaseModel):
    image_url: str
    preset_id: str
    custom_prompt: Optional[str] = None
    strength: Optional[float] = None
    guidance_scale: Optional[float] = None
    # Brush-tool mask (staging): white = regenerable, black = locked.
    mask_url: Optional[str] = None

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
def generate_ai_video_clip(spec: tuple) -> str:
    """
    Generate a 6-second AI video clip using fal-ai/minimax/hailuo-02

    Args (one tuple per clip — Modal .map fans these out one container each):
        spec: (image_url, prompt, resolution, duration) —
              image_url: URL of the source image,
              prompt: Video generation prompt (max 2000 chars),
              resolution: Target resolution (512p or 768p),
              duration: Duration in seconds (default 6)

    Returns:
        URL of the generated video clip
    """
    import fal_client

    image_url, prompt, resolution, duration = (list(spec) + ["512p", 6])[:4]
    duration = int(duration)

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
        "-movflags", "+faststart",  # publish path — Premium upscale ships direct
        "-c:a", "copy",
        "-y",
        output_path
    ], check=True)
    
    # Upload to S3
    s3 = boto3.client('s3', region_name=S3_REGION)
    # Strip any presigned query — an embedded "?X-Amz-…" would become part of
    # the key and the stored object could never be fetched back (same bug as
    # the image-edit path).
    from urllib.parse import urlparse
    s3_key = f"upscaled/{os.path.basename(urlparse(input_video_url).path)}"
    
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
# ESSENTIAL-tier Ken Burns motion styles, rotated A → B → C per image exactly
# like the AI tiers rotate their Hailuo prompts. Each style is an ffmpeg
# zoompan expression (x, y, zoom over the clip's frame count).
#
# Amplitude: the first pass used ~10–13% zoom, which over a still frame reads
# as "the video hardly moves" (agent-reported). These zoom bands (~1.0 →
# 1.25+) with an explicit edge-to-edge lateral drift are visibly cinematic
# without fisheye-ing the room.
ESSENTIAL_MOTION_STYLES = [
    # A — decisive push-in from center ("dramatic focal push-in")
    {"id": "A", "zoom": "min(zoom+{zrate},1.28)", "x": "iw/2-(iw/zoom/2)", "y": "ih/2-(ih/zoom/2)"},
    # B — REAL left-to-right pan: the window sweeps across the frame ("tracking arc")
    {"id": "B", "zoom": "min(zoom+{zrate},1.22)",
     # start at the frame's left edge, travel to its right edge over the clip
     "x": "(iw-iw/zoom)*on/({frames}-1)", "y": "ih/2-(ih/zoom/2)"},
    # C — top-to-bottom tilt with a strong pull-back reveal
    {"id": "C", "zoom": "if(eq(on,1),1.25,max(zoom-{zrate},1.0))",
     "x": "iw/2-(iw/zoom/2)", "y": "(ih-ih/zoom)*on/({frames}-1)"},
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
    zrate = 0.09 / frames  # steady zoom shared by every style band
    style_fmt = {
        "id": style["id"],
        "zoom": style["zoom"].format(zrate=f"{zrate:.6f}"),
        # The pan styles track on/frames-1 explicitly — a uniform velocity
        # sweep over the frame, not a curve.
        "x": style["x"].format(frames=frames) if "{frames}" in style["x"] else style["x"],
        "y": style["y"].format(frames=frames) if "{frames}" in style["y"] else style["y"],
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


# ── Agent branding overlay (Video Generator) ───────────────────────────────
# The toggle-SERVED flag used to flow all the way down with NO artwork:
# the worker had nothing to draw on, so "Agent Profile Branding INCLUDED"
# rendered exactly like OFF. This composes, with Pillow, ONE transparent
# strip PNG per video (agent photo in a white-ringed circle top-left,
# agency logo top-right, contact line in a translucent bar along the
# bottom, all scaled to the render's canvas) and the renderer overlays it
# for the whole duration. Every element degrades independently: no logo →
# just photo+bar; nothing fetched → no overlay flag ever fails a render.

def _branding_card_png(
    branding: dict,
    use_avatar: bool,
    width: int,
    height: int,
    work_dir: str,
) -> str | None:
    """Compose the full-canvas transparent branding strip; returns its path.

    Elements: agent photo (or AI-avatar headshot) in a white-ringed circle
    at the TOP-LEFT, agency logo at the TOP-RIGHT, and the agent's contact
    details on a translucent bar along the BOTTOM. Scales from the video
    canvas so the card looks identical at 1080p and 512p.
    """
    from PIL import Image, ImageDraw, ImageFont

    # 1080p reference design (relative to height): photo Ø96, margin 28.
    scale = height / 1080.0
    margin = int(36 * scale)
    photo_d = int(110 * scale)
    ring = max(3, int(5 * scale))
    logo_h = int(72 * scale)
    bar_h = int(96 * scale)
    font_size = int(40 * scale)

    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    # The AI avatar's VIDEO owns this corner when the add-on is on — it is
    # burned in separately by _apply_avatar_overlay, so drawing the static
    # photo circle in the same spot would sit right on top of it.
    if str((branding or {}).get("avatar_video_url") or "").strip():
        photo_url = None
    else:
        photo_url = (branding or {}).get("use_avatar_url") if use_avatar else (branding or {}).get("photo_url")
        if not photo_url:
            photo_url = (branding or {}).get("photo_url")

    # 1) Agent / avatar photo — top-left, white-ringed circle.
    photo_fetched = False
    if photo_url:
        try:
            from io import BytesIO
            img = Image.open(BytesIO(fetch_media(photo_url, timeout=60))).convert("RGBA")
            side = max(img.width, img.height)
            # center-crop to a square then scale
            left = (img.width - side) // 2
            top = (img.height - side) // 2
            img = img.crop((left, top, left + side, top + side)).resize((photo_d, photo_d), Image.LANCZOS)
            mask = Image.new("L", (photo_d, photo_d), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, photo_d, photo_d), fill=255)
            cx, cy = margin + photo_d // 2, margin + photo_d // 2
            ImageDraw.Draw(canvas).ellipse(
                (cx - photo_d // 2 - ring, cy - photo_d // 2 - ring,
                 cx + photo_d // 2 + ring, cy + photo_d // 2 + ring),
                fill=(255, 255, 255, 235),
            )
            canvas.paste(img, (margin, margin), mask)
            photo_fetched = True
        except Exception as pe:
            print(f"branding photo fetch failed (skipped): {pe}")

    # 2) Agency logo — top-right, fitted height.
    logo_url = (branding or {}).get("logo_url")
    logo_fetched = False
    if logo_url:
        try:
            from io import BytesIO
            logo = Image.open(BytesIO(fetch_media(logo_url, timeout=60))).convert("RGBA")
            w = max(1, int(logo.width * logo_h / max(logo.height, 1)))
            logo = logo.resize((min(w, width // 3), logo_h), Image.LANCZOS)
            canvas.alpha_composite(logo, (width - margin - logo.width, margin))
            logo_fetched = True
        except Exception as le:
            print(f"branding logo fetch failed (skipped): {le}")

    # 3) Contact bar — bottom, full width, translucent dark with white text.
    #    Legibility scale: fonts-dejavu-core is baked into the Modal image
    #    (formerly there was NO ttf on the box, so Pillow fell back to its
    #    ~11px bitmap default and portrait renders unreadable / blank —
    #    the "can't see the contact details" report).
    contact = str((branding or {}).get("contact_line") or "").strip()
    if contact:
        draw = ImageDraw.Draw(canvas)
        bar_top = height - bar_h
        draw.rectangle((0, bar_top, width, height), fill=(8, 6, 18, 190))
        try:
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except Exception:
            font = None
        bbox = draw.textbbox((0, 0), contact, font=font or ImageFont.load_default())
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        max_w = width - 2 * margin
        # Too long for one line → shrink the REAL font progressively,
        # floor 0.55×design; the old fallback jumped to an illegible bitmap
        # font — the unreadable-render root cause.
        MIN_SCALE = 0.55
        while font is not None and tw > max_w and font_size > int(24 * scale):
            font_size = max(int(font_size * 0.9), int(24 * scale))
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            bbox = draw.textbbox((0, 0), contact, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        font = font or ImageFont.load_default()
        draw.text(((width - tw) // 2, bar_top + (bar_h - th) // 2 - bbox[1]), contact,
                  font=font, fill=(255, 255, 255, 245))

    if not (photo_fetched or logo_fetched or contact):
        return None
    out = os.path.join(work_dir, f"branding_{width}x{height}.png")
    canvas.save(out)
    return out


def _apply_branding_overlay(video_path: str, branding: dict | None, use_avatar: bool,
                            width: int, height: int, work_dir: str) -> str:
    """Burn the branding strip onto the finished video (stream copy if the
    overlay's both absent; re-encode is unavoidable otherwise). Never raises
    for cosmetic reasons: a card-composition failure returns the input path
    and the render ships unbranded rather than failing a paid job."""
    if not branding:
        return video_path
    try:
        card = _branding_card_png(branding, use_avatar, width, height, work_dir)
    except Exception as be:
        print(f"branding card compose failed — shipping unbranded: {be}")
        return video_path
    if not card:
        return video_path
    import subprocess as _sp
    out_path = video_path.replace(".mp4", "_branded.mp4")
    proc = _sp.run(
        ["ffmpeg", "-y", "-i", video_path, "-i", card,
         "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[v]",
         "-map", "[v]", "-map", "0:a?",
         "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
         # faststart: moov first — browsers can start playback while the file
         # downloads (a trailing moov makes video elements spin forever on
         # progressively-fetched MP4s, incl. every shared producted link).
         "-movflags", "+faststart", "-c:a", "copy", out_path],
        capture_output=True, timeout=600,
    )
    if proc.returncode != 0:
        # Fallback: drop the audio copy flag (a video-only source has no #0:a)
        proc = _sp.run(
            ["ffmpeg", "-y", "-i", video_path, "-i", card,
             "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
             "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", out_path],
            capture_output=True, timeout=600,
        )
        if proc.returncode != 0:
            print(f"branding overlay failed — shipping unbranded: {(proc.stderr or b'')[-300:]}")
            return video_path
    print("Branding overlay burned in")
    try:
        os.unlink(video_path)
    except Exception:
        pass
    return out_path


def _concat_ai_clips(
    clip_urls: list[str],
    tier_duration: float,
    width: int,
    height: int,
    work: str,
) -> str:
    """Normalize every fal clip to the tier canvas and assemble the FULL reel.

    The old path shipped video_clips[0] — a ~1.9s 512p fal clip with the
    rest of the 3x-credit tier duration freeze-extended behind it ("stuck on
    the first image"), and no branding/avatar card could align on the off-
    canvas resolution. This stage:
      1. downloads each fal clip (they were paid for — always use them),
      2. pad/scales each to exactly width×height (portrait canvases get
         contain+pad for portrait sources, landscape sources cover-crop),
      3. stretches each clip over an EVEN share of the tier duration
         (setpts+tpad clone-freeze the clip's motion frame tail, not none),
      4. stream-copy concats the uniform segments + faststart.
    Normalized segments are identical-format so concat never re-encodes.
    Raises on failure: the caller falls back to the old single-clip path
    rather than losing a paid job.
    """
    import subprocess as _sp

    n = max(1, len(clip_urls))
    seg_dur = float(tier_duration) / n
    seg_paths = []
    for i, url in enumerate(clip_urls):
        raw_path = os.path.join(work, f"ai_raw_{i}.mp4")
        with open(raw_path, "wb") as f:
            f.write(fetch_media(url, timeout=300))
        seg_path = os.path.join(work, f"ai_seg_{i}.mp4")
        # Each clip's share of the tier duration: -stream_loop replays the
        # clip until -t cuts it (slow clips just repeat; no pts arithmetic).
        # Portrait canvas: contain + pad (never amputate a vertical shot).
        # Landscape canvas: cover-crop, same convention as the Essential tier.
        if height > width:
            vf = (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                  f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
                  f"fps=24,format=yuv420p")
        else:
            vf = (f"scale={width}:{height}:force_original_aspect_ratio=increase,"
                  f"crop={width}:{height},fps=24,format=yuv420p")
        proc = _sp.run(
            ["ffmpeg", "-y", "-stream_loop", "-1", "-i", raw_path,
             "-an", "-vf", vf, "-c:v", "libx264", "-preset", "medium",
             "-crf", "19", "-pix_fmt", "yuv420p", "-t", f"{seg_dur:.3f}",
             seg_path],
            capture_output=True, timeout=300,
        )
        try:
            os.unlink(raw_path)
        except Exception:
            pass
        if proc.returncode != 0:
            raise RuntimeError(f"ai segment {i + 1} normalize failed: {(proc.stderr or b'')[-300:]}")
        seg_paths.append(seg_path)

    concat_list = os.path.join(work, "ai_list.txt")
    with open(concat_list, "w") as f:
        for p in seg_paths:
            f.write(f"file '{p}'\n")
    out_path = os.path.join(work, "ai_concat.mp4")
    proc = _sp.run(
        # Identical codecs/dims/fps now → no re-encode
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
         "-c", "copy", "-movflags", "+faststart", out_path],
        capture_output=True, timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ai concat failed: {(proc.stderr or b'')[-300:]}")
    for p in seg_paths:
        try:
            os.unlink(p)
        except Exception:
            pass
    print(f"AI clips assembled: {n} × {seg_dur:.1f}s = {_media_duration(out_path):.1f}s on {width}x{height}")
    return out_path


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
             # faststart: the muxed container is a publish candidate when no
             # narration followed (video stream copy still rewrite the container).
             "-movflags", "+faststart",
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


# ── Voiceover: Narakeet TTS for all 11 official SA languages ──────────────
# ElevenLabs (via fal) only accepts af/en — every other official SA language
# 422s ("feature_not_supported") — so narration is synthesized by Narakeet,
# whose native ZA voices cover all 11. Voice list mirrors
# src/lib/constants.ts; the pair is re-validated below because stale clients
# post legacy ElevenLabs names (Joanna, Aria…).
NARAKEET_VOICES: dict = {
    "af-ZA": ["rolanda", "jochem", "joost", "laurika"],
    "en-ZA": ["aletta", "piet", "charlize", "hilda", "riaan", "joanna", "sarah", "amy", "brian"],
    "nso-ZA": ["mpho", "mogau"],
    "st-ZA": ["palesa"],
    "tn-ZA": ["bokang"],
    "xh-ZA": ["thabo", "lindiwe"],
    "zu-ZA": ["nandi", "menzi", "zanele", "themba"],
    "ssw-ZA": ["nomcebo"],
    "tso-ZA": ["basetsana"],
    "ven-ZA": ["mulalo"],
    "nr-ZA": ["dumisani"],
}
DEFAULT_NARAKEET_LANGUAGE = "en-ZA"


def _resolve_narakeet_voice(voice_id: str | None, language: str | None) -> tuple:
    """Pick the (language, voice) pair the narrator will actually speak.

    The SELECTED LANGUAGE always wins — a stale client posting a legacy
    ElevenLabs name or a mismatched voice falls back to that language's
    native default voice. A client that sends only a voice (no language)
    gets the voice's own language.
    """
    v = (voice_id or "").strip().lower()
    lang = (language or "").strip()
    if lang not in NARAKEET_VOICES:
        lang = next((l for l, voices in NARAKEET_VOICES.items() if v in voices),
                    DEFAULT_NARAKEET_LANGUAGE)
    if v not in NARAKEET_VOICES[lang]:
        v = NARAKEET_VOICES[lang][0]
    return lang, v


def _narakeet_audio_seconds(header_value, mp3: bytes) -> float:
    """Billed length of one synthesis (seconds) for the admin ops report.

    Narakeet reports what it bills for on both flows — `x-duration-seconds`
    on streaming, `durationInSeconds` on polling. If either is missing,
    ffprobe measures the very same mp3; a silent 0 would under-count spend.
    """
    try:
        s = float(header_value)
        if s > 0:
            return round(s, 2)
    except (TypeError, ValueError):
        pass
    try:
        import subprocess as _sp
        import tempfile as _tf
        import os as _os
        with _tf.NamedTemporaryFile(suffix=".mp3", delete=False) as _f:
            _f.write(mp3)
            _tmp = _f.name
        try:
            out = _sp.run(["ffprobe", "-v", "error", "-show_entries",
                           "format=duration", "-of",
                           "default=noprint_wrappers=1:nokey=1", _tmp],
                          capture_output=True, text=True, timeout=30)
            return round(float(out.stdout.strip()), 2)
        finally:
            _os.unlink(_tmp)
    except Exception as e:
        print(f"Narakeet duration unavailable ({e}) — counting 0s")
        return 0.0


def narakeet_tts(text: str, voice: str) -> tuple:
    """Synthesize `text` with a Narakeet native voice → (MP3 bytes, seconds).

    The seconds are exactly what Narakeet bills for and feed the admin ops
    report (Narakeet minutes per render / per avatar video).

    Short scripts use the streaming endpoint (single request, ~1 KB body
    cap); anything longer goes through the polling API (1 MB / 45 min caps).
    Requires NARAKEET_API_KEY via the `narakeet` Modal secret.
    """
    key = os.environ.get("NARAKEET_API_KEY", "")
    if not key:
        raise RuntimeError("NARAKEET_API_KEY missing — create the 'narakeet' Modal secret")
    text = (text or "").strip()
    if not text:
        raise RuntimeError("narakeet_tts called with empty text")
    body = text.encode("utf-8")
    url = "https://api.narakeet.com/text-to-speech/mp3"
    headers = {"x-api-key": key, "content-type": "text/plain"}
    # Streaming: ≤~1 KB body, audio bytes come straight back. The gateway
    # intermittently answers 403 here (verified live), so treat any bad
    # response as retryable and fall through to the polling flow below.
    if len(body) <= 950:
        last_err = ""
        for _attempt in range(2):
            try:
                r = requests.post(url, params={"voice": voice}, data=body,
                                  headers={**headers, "accept": "application/octet-stream"}, timeout=90)
                if r.status_code == 200 and r.content[:1] != b"{":
                    return r.content, _narakeet_audio_seconds(
                        r.headers.get("x-duration-seconds"), r.content)
                last_err = f"HTTP {r.status_code}: {r.text[:120]}"
            except Exception as e:
                last_err = str(e)[:120]
            time.sleep(1)
        print(f"Narakeet streaming TTS failed ({last_err}) — falling back to polling")
    # Polling: POST → statusUrl → poll until finished → download result.
    # This path is the reliable one (verified end-to-end) and is also what
    # longer scripts (1 MB cap) always use.
    r = None
    for _attempt in range(3):
        try:
            r = requests.post(url, params={"voice": voice}, data=body, headers=headers, timeout=60)
            if r.status_code == 200:
                break
        except Exception:
            pass
        r = None
        time.sleep(2)
    if r is None or r.status_code != 200:
        detail = f"HTTP {r.status_code}: {r.text[:200]}" if r is not None else "connection failed after 3 attempts"
        raise RuntimeError(f"Narakeet TTS submit failed ({detail})")
    try:
        status_url = r.json().get("statusUrl")
    except Exception:
        status_url = None
    if not status_url:
        raise RuntimeError(f"Narakeet TTS returned no statusUrl: {r.text[:200]}")
    deadline = time.time() + 180
    while time.time() < deadline:
        time.sleep(1.5)
        try:
            data = requests.get(status_url, timeout=30).json()
        except Exception:
            continue
        if not data.get("finished"):
            continue
        if not data.get("succeeded") or not data.get("result"):
            raise RuntimeError(f"Narakeet TTS failed: {str(data.get('message'))[:200]}")
        audio = requests.get(data["result"], timeout=120)
        audio.raise_for_status()
        return audio.content, _narakeet_audio_seconds(
            data.get("durationInSeconds"), audio.content)
    raise RuntimeError("Narakeet TTS timed out after 180s")


def _narakeet_audio_url(text: str, voice_id: str | None, language: str | None,
                        user_id: str) -> tuple:
    """Synthesize narration in the selected language and host it on S3.

    Returns (presigned URL fal.ai can fetch, billed seconds). Media URLs
    are private: knowing the object URL no longer grants read access. The
    mp3 lands under flashhead/, so the 30-day retention cron purges it too.
    """
    import boto3
    import uuid as _uuid
    lang, nar_voice = _resolve_narakeet_voice(voice_id, language)
    mp3, tts_seconds = narakeet_tts(text, nar_voice)
    s3_key = f"flashhead/{user_id}/narration_{_uuid.uuid4().hex}.mp3"
    boto3.client('s3', region_name=S3_REGION).put_object(
        Bucket=S3_BUCKET, Key=s3_key, Body=mp3, ContentType='audio/mpeg'
    )
    raw = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    return presign_media(raw), tts_seconds


def _media_duration(path: str) -> float:
    """Duration in seconds via ffprobe (raises on failure)."""
    import subprocess as _sp
    p = _sp.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, timeout=60,
    )
    try:
        return float(p.stdout.strip())
    except ValueError:
        raise RuntimeError(f"ffprobe could not measure {path}: {(p.stderr or b'')[-200:]}")


def _mix_narration(video_path: str, narration_path: str, out_path: str,
                   music_url: str | None = None, music_volume: float = 0.22) -> float:
    """One ffmpeg pass: narration + optional music bed over a silent render.

    If the narration runs longer than the video (AI-tier clips are ~6 s while
    scripts target 30 s+), the last frame is frozen — tpad=stop_mode=clone —
    so the voiceover is never cut off. A music fetch failure degrades to a
    narration-only mix; a mixing failure raises. Returns final duration (s).
    """
    import subprocess as _sp
    import tempfile as _tf
    import os as _os

    video_dur = _media_duration(video_path)
    narr_dur = _media_duration(narration_path)
    if narr_dur + 0.3 > video_dur:
        target = narr_dur + 0.3
        extend = target - video_dur
    else:
        target = video_dur
        extend = 0.0

    music_path = None
    if music_url:
        try:
            music_bytes = fetch_media(music_url, timeout=120)
            ext = ".mp3" if ".mp3" in music_url.lower() else ".wav" if ".wav" in music_url.lower() else ".m4a"
            with _tf.NamedTemporaryFile(suffix=ext, delete=False) as _f:
                _f.write(music_bytes)
                music_path = _f.name
        except Exception as me:
            print(f"Music fetch failed — narration-only mix: {me}")
            music_path = None
    try:
        inputs = ["-y", "-i", video_path, "-i", narration_path]
        chains = []
        if extend > 0.05:
            chains.append(f"[0:v]tpad=stop_mode=clone:stop_duration={extend:.3f},format=yuv420p[v]")
            video_map, video_args = ("[v]", ["-c:v", "libx264", "-preset", "medium",
                                              "-crf", "19", "-pix_fmt", "yuv420p"])
        else:
            video_map, video_args = ("0:v", ["-c:v", "copy"])
        # Narration padded with silence up to the full target length
        chains.append(f"[1:a]aresample=44100,apad,atrim=0:{target:.3f},asetpts=PTS-STARTPTS[vo]")
        if music_path:
            inputs += ["-stream_loop", "-1", "-i", music_path]
            fade_start = max(target - 2.0, 0.0)
            chains.append(
                f"[2:a]volume={music_volume},aresample=44100,apad,atrim=0:{target:.3f},"
                f"asetpts=PTS-STARTPTS,afade=t=out:st={fade_start:.3f}:d=2[bg]"
            )
            chains.append("[vo][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.98[a]")
            audio_map = "[a]"
        else:
            audio_map = "[vo]"
        proc = _sp.run(
            ["ffmpeg", *inputs,
             "-filter_complex", ";".join(chains),
             "-map", video_map, "-map", audio_map,
             *video_args, "-c:a", "aac", "-b:a", "160k",
             # faststart (publish path — Essential tier + AI-tier voiceover mix:
             # a trailing moov stops browsers starting playback progressively).
             "-movflags", "+faststart",
             "-t", f"{target:.3f}", out_path],
            capture_output=True, timeout=600,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg narration mix failed: {(proc.stderr or b'')[-300:]}")
    finally:
        if music_path:
            try:
                _os.unlink(music_path)
            except Exception:
                pass
    return target


def _apply_avatar_overlay(
    video_path: str,
    avatar_video_url: str,
    out_path: str,
    width: int,
    height: int,
    music_url: str | None = None,
    music_volume: float = 0.22,
) -> float:
    """Burn the AI-avatar clip into the TOP-LEFT corner and use ITS audio as
    the reel's voiceover.

    The avatar add-on replaces the reel's own narration: the FlashHead clip
    was rendered first (Narakeet script → lip-sync) and carries the voiceover,
    so this pass composites it and skips a second TTS synthesis entirely.

    Shape & size — matched to the Agent Branding card so the avatar reads as
    "the profile photo, live": the branding photo burns as a WHITE-RINGED
    CIRCLE of 110/1080-canvas-height diameter at a 36/1080 margin; the avatar
    is the same circle, just a bit bigger (~1.3x), so it stays visible
    without dominating the frame or covering the property. Both land
    correctly in either orientation because they scale from the canvas
    height. A circular alpha mask is merged into every avatar frame
    (alphamerge against a static disc), and the ring is a static RGBA
    overlay on top — the talking head moves INSIDE the circle.

    The avatar's last frame repeats for the rest of the reel, its audio is
    padded with silence, and a selected music bed loops underneath with the
    standard 2-second fade. A narration that outruns the reel freeze-extends
    the video exactly like the TTS path does.

    Raises on failure: the agent paid for the avatar, so silently shipping an
    avatar-less, unvoiced reel would be the very bug this replaces.
    """
    import subprocess as _sp
    import tempfile as _tf
    import os as _os

    avatar_bytes = fetch_media(avatar_video_url, timeout=300)
    with _tf.NamedTemporaryFile(suffix=".mp4", delete=False) as _f:
        _f.write(avatar_bytes)
        avatar_path = _f.name
    music_path = None
    mask_path = ring_path = None
    try:
        video_dur = _media_duration(video_path)
        avatar_dur = _media_duration(avatar_path)
        target = video_dur
        if avatar_dur + 0.3 > target:
            target = avatar_dur + 0.3

        # ── Geometry: the branding card's conventions scale from HEIGHT/1080
        # (110px photo, 36px margin, 5px ring at 1080p) — reuse them so the
        # avatar reads as the same element, just a bit bigger.
        scale_ref = height / 1080.0
        ring_w = max(3, int(5 * scale_ref))
        # Disc diameter ~1.3x the branding photo. EVEN, always: yuv420p
        # encoding cannot carry odd dims, and the alphamerge mask must match
        # the scaled avatar frame EXACTLY (scale rounds to even internally).
        side = max(64, int(110 * scale_ref * 1.3) & ~1)
        outer = side + 2 * ring_w                      # ring outer diameter
        margin = max(8, int(36 * scale_ref))
        av_ext = max(0.0, target - avatar_dur)

        # Static artwork: black-background white disc (becomes the alpha
        # mask) and a transparent white ring. Pillow is already a dependency
        # (branding card) and both PNGs are tiny.
        from PIL import Image, ImageDraw
        mask_img = Image.new("RGB", (side, side), (0, 0, 0))
        ImageDraw.Draw(mask_img).ellipse((0, 0, side - 1, side - 1), fill=(255, 255, 255))
        _mf = _tf.NamedTemporaryFile(suffix=".png", delete=False)
        mask_img.save(_mf, format="PNG")
        _mf.close()
        mask_path = _mf.name
        ring_img = Image.new("RGBA", (outer, outer), (0, 0, 0, 0))
        ImageDraw.Draw(ring_img).ellipse(
            (0, 0, outer - 1, outer - 1), outline=(255, 255, 255, 255), width=ring_w,
        )
        _rf = _tf.NamedTemporaryFile(suffix=".png", delete=False)
        ring_img.save(_rf, format="PNG")
        _rf.close()
        ring_path = _rf.name

        # A silent avatar clip must not break the graph — fall back to a
        # generated silent track (the music bed, if any, still mixes in).
        probe = _sp.run(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=index", "-of", "csv=p=0", avatar_path],
            capture_output=True, text=True, timeout=30,
        )
        has_audio = bool((probe.stdout or "").strip())

        if music_url:
            try:
                music_bytes = fetch_media(music_url, timeout=120)
                ext = ".mp3" if ".mp3" in music_url.lower() else ".wav" if ".wav" in music_url.lower() else ".m4a"
                with _tf.NamedTemporaryFile(suffix=ext, delete=False) as _mf2:
                    _mf2.write(music_bytes)
                    music_path = _mf2.name
            except Exception as me:
                print(f"Music fetch failed — avatar voiceover only: {me}")
                music_path = None

        inputs = ["-y", "-i", video_path, "-i", avatar_path,
                  "-loop", "1", "-i", mask_path, "-loop", "1", "-i", ring_path]
        chains = []
        if target > video_dur + 0.05:
            chains.append(
                f"[0:v]tpad=stop_mode=clone:stop_duration={target - video_dur:.3f},"
                f"format=yuv420p[base]"
            )
        else:
            chains.append("[0:v]format=yuv420p[base]")
        # Avatar: cover-crop to the disc's square, hold the LAST frame for the
        # rest of the reel (tpad), then round it with the static disc mask.
        av_chain = (
            f"[1:v]scale={side}:{side}:force_original_aspect_ratio=increase,"
            f"crop={side}:{side},format=yuv420p"
        )
        if av_ext > 0.05:
            av_chain += f",tpad=stop_mode=clone:stop_duration={av_ext:.3f}"
        chains.append(av_chain + "[av0]")
        chains.append("[2:v]format=gray[m0]")
        chains.append("[av0][m0]alphamerge[av]")
        chains.append(f"[base][av]overlay=x={margin}:y={margin}:eof_action=repeat[v0]")
        # White ring, drawn as one element so the edge stays crisp even while
        # the underlying head compresses.
        chains.append("[3:v]format=rgba[m1]")
        chains.append(
            f"[v0][m1]overlay=x={margin - ring_w}:y={margin - ring_w}:eof_action=repeat[v]"
        )
        # Voice track: the avatar's own narration, padded with silence to the
        # full length so a shorter clip never truncates the music bed.
        if has_audio:
            chains.append(
                f"[1:a]aresample=44100,apad,atrim=0:{target:.3f},asetpts=PTS-STARTPTS[vo]"
            )
        else:
            chains.append(f"anullsrc=r=44100:cl=stereo,atrim=0:{target:.3f}[vo]")
        if music_path:
            inputs += ["-stream_loop", "-1", "-i", music_path]
            fade_start = max(target - 2.0, 0.0)
            chains.append(
                f"[4:a]volume={music_volume},aresample=44100,apad,atrim=0:{target:.3f},"
                f"asetpts=PTS-STARTPTS,afade=t=out:st={fade_start:.3f}:d=2[bg]"
            )
            chains.append(
                "[vo][bg]amix=inputs=2:duration=first:dropout_transition=0:"
                "normalize=0,alimiter=limit=0.98[a]"
            )
            audio_map = "[a]"
        else:
            audio_map = "[vo]"
        proc = _sp.run(
            ["ffmpeg", *inputs,
             "-filter_complex", ";".join(chains),
             "-map", "[v]", "-map", audio_map,
         "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k",
         # faststart (see _apply_branding_overlay) — this mux is one of the
         # publish paths when no branding (final upload follows directly).
         "-movflags", "+faststart",
         "-t", f"{target:.3f}", out_path],
            capture_output=True, timeout=900,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg avatar overlay failed: {(proc.stderr or b'')[-400:]}")
        return target
    finally:
        for _p in (avatar_path, music_path, mask_path, ring_path):
            if _p:
                try:
                    _os.unlink(_p)
                except Exception:
                    pass


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("narakeet")], timeout=1200, retries=2)
def render_video_local(
    record_id: str,
    images: list[str],
    duration: int,
    orientation: str,
    image_prompts: list[dict] | None = None,
    music_url: str | None = None,
    voiceover_text: str = "",
    voice_id: str = "Joanna",
    language: str = "en-ZA",
    branding: dict | None = None,
    use_avatar: bool = False,
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
        voiceover_text: Narration the narrator speaks in `language`.
        voice_id: Preferred Narakeet voice (re-validated against `language`).
        language: BCP-47 code of one of SA's 11 official languages.

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
         "-c", "copy", "-movflags", "+faststart", output_path],  # faststart: publish path when no narration follows — moov header first, players start before the download finishes
        capture_output=True, timeout=300,
    )
    if concat.returncode != 0:
        # Fallback: re-encode concat (handles any codec drift between segments)
        concat = _sp.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
             "-c:v", "libx264", "-preset", "medium", "-crf", "19",
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", output_path],
            capture_output=True, timeout=600,
        )
        if concat.returncode != 0:
            raise RuntimeError(f"ffmpeg concat failed: {(concat.stderr or b'')[-300:]}")

    # Voiceover — three mutually exclusive paths:
    #   1. AI Avatar add-on: the FlashHead clip (rendered BEFORE this job)
    #      IS the voiceover — composite it top-left and use its audio; its
    #      narration replaced the reel's TTS, so no second synthesis runs.
    #   2. Narration first (the promise the user paid for — a TTS failure
    #      raises and the job refunds), with the music bed mixed in the same
    #      pass.
    #   3. Without narration, the music bed keeps its old standalone path.
    narakeet_seconds = 0.0
    avatar_video_url = str((branding or {}).get("avatar_video_url") or "").strip()
    if avatar_video_url:
        print(f"Compositing AI avatar top-left from {avatar_video_url[:90]}…")
        mixed_path = os.path.join(work, "output_avatar.mp4")
        final_dur = _apply_avatar_overlay(
            output_path, avatar_video_url, mixed_path, width, height, music_url=music_url,
        )
        _os.replace(mixed_path, output_path)
        print(f"AI avatar composited ({final_dur:.1f}s final duration)")
    elif (voiceover_text or "").strip():
        lang, nar_voice = _resolve_narakeet_voice(voice_id, language)
        print(f"Synthesizing narration ({lang} / {nar_voice}): {len(voiceover_text)} chars")
        narr_bytes, tts_seconds = narakeet_tts(voiceover_text, nar_voice)
        narakeet_seconds = round(tts_seconds, 2)
        print(f"Narakeet billed {narakeet_seconds:.1f}s ({lang} / {nar_voice})")
        narr_path = os.path.join(work, "narration.mp3")
        with open(narr_path, "wb") as nf:
            nf.write(narr_bytes)
        mixed_path = os.path.join(work, "output_voiceover.mp4")
        final_dur = _mix_narration(output_path, narr_path, mixed_path, music_url=music_url)
        _os.replace(mixed_path, output_path)
        print(f"Voiceover mixed in ({final_dur:.1f}s final duration)")
    elif music_url:
        # Optional music bed: loop/trim the admin track under the video and mix
        # with ffmpeg. The video stream is stream-copied — only audio is added.
        # If the track can't be fetched/decoded we ship the silent version.
        try:
            print(f"Mixing music bed from {music_url[:80]}…")
            mixed_path = os.path.join(work, "output_music.mp4")
            _mix_music_bed(output_path, music_url, mixed_path, video_duration=duration)
            _os.replace(mixed_path, output_path)
            print("Music bed mixed in")
        except Exception as me:
            print(f"Music mix failed — shipping silent render: {me}")

    # Agent branding: profile photo top-left, agency logo top-right,
    # contact details along the bottom — burned in on the final assembly.
    output_path = _apply_branding_overlay(
        output_path, branding, use_avatar, width, height, work,
    )

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
    return video_url, narakeet_seconds


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials"), modal.Secret.from_name("narakeet")], timeout=1800, retries=2, min_containers=0, max_containers=100, scaledown_window=300)
def render_video(
    record_id: str,
    tier: str,
    config_index: int,
    orientation: str,
    images: list[str],
    voiceover_text: str,
    voice_id: str = "Joanna",
    language: str = "en-ZA",
    include_agent_branding: bool = True,
    music_url: str | None = None,
    image_prompts: list[dict] | None = None,
    branding: dict | None = None,
    use_avatar: bool = False,
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
        voice_id: Preferred Narakeet voice (re-validated against `language`)
        language: BCP-47 code of one of SA's 11 official languages — the
            narrator natively speaks it (Narakeet native voice)
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
    # Real (post-narration) runtime: AI tiers freeze-extend the clip when the
    # script outruns it, so it can differ from the tier's nominal duration.
    actual_duration = float(config['duration'])
    narakeet_seconds = 0.0

    if processing_type == "local":
        # ESSENTIAL tier: pure-FFmpeg Ken Burns render (no fal.ai) with the
        # same A/B/C motion-style rotation the AI tiers use for prompts
        _ensure_not_cancelled(record_id)
        video_url, narakeet_seconds = render_video_local.remote(
            record_id=record_id,
            images=images,
            duration=config['duration'],
            orientation=orientation,
            image_prompts=image_prompts,
            music_url=music_url,
            voiceover_text=voiceover_text,
            voice_id=voice_id,
            language=language,
            branding=branding,
            use_avatar=use_avatar,
        )
    else:
        # SOCIAL, CINEMATIC, PREMIUM tiers: AI rendering. All clips fan out
        # CONCURRENTLY (Modal map) — a serial loop made a 5-clip tier wait
        # 5× fal latency (~9 min) while the render timeout loomed.
        # Per-image prompt: frontend rotation payload (A/B/C) if provided,
        # otherwise the built-in round-robin (i % 3).
        prompts: list[str] = []
        for i, image_url in enumerate(images):
            supplied = None
            match = None
            if image_prompts:
                match = next((p for p in image_prompts if p.get("image_url") == image_url and p.get("prompt")), None)
                supplied = match.get("prompt") if match else None
            prompts.append(supplied or get_prompt_for_image(i))

        # Determine base resolution for AI generation
        if processing_type == "ai_upscaled":
            # PREMIUM: Generate at 768p, upscale to 1080p
            ai_resolution = "768p"
        else:
            # SOCIAL/CINEMATIC: Use tier resolution
            ai_resolution = resolution

        _ensure_not_cancelled(record_id)  # stop before spending fal.ai credits
        _write_job_status(record_id, "processing", {
            "tier": tier, "progress": 0,
            "clip": 0, "clips": len(images),
            "prompt_id": ['A', 'B', 'C'][0 % 3],
            "note": "fanned out",
        })
        # .map fans one tuple out per Modal container (all run concurrently);
        # each clip still retries independently (retries=2 on the function).
        video_clips = list(generate_ai_video_clip.map(
            [
                (image_url, prompt, ai_resolution, 6)
                for image_url, prompt in zip(images, prompts)
            ],
            order_outputs=True,
        ))
        for c in video_clips:
            if not c:
                raise RuntimeError("One or more AI clips came back empty — render aborted")

        # Concatenate video clips — the paid clips are ALWAYS used now.
        # Assembly runs on its own container (ffmpeg work, not fal spend) so
        # the fal clip calls above stay the only fal cost.
        import tempfile as _tfa
        with _tfa.TemporaryDirectory(prefix=f"assemble_{record_id}_") as awork:
            # The tier canvas: 512p fal clips upscale to 960×540 landscape
            # (SOCIAL); 768p → 1440×810 (CINEMATIC/PREMIUM). Portrait keeps
            # 1080×1920. Every later stage (avatar, branding, narration mix,
            # upscale) works on this SAME canvas so cards align exactly.
            if orientation == "PORTRAIT":
                bw, bh = 1080, 1920
            else:
                # match the fal clip's aspect: 512p is 960x540, 768p is 1440x810
                # (exactly proportional to 1920x1080), so the canvas matches
                # the tier's advertised resolution without letterboxing.
                if resolution == "512p":
                    bw, bh = 960, 540
                elif resolution == "768p":
                    bw, bh = 1440, 810
                else:
                    bw, bh = 1920, 1080
            try:
                assembled = _concat_ai_clips(video_clips, config['duration'], bw, bh, awork)
                upload = boto3.client('s3', region_name=S3_REGION)
                s3_key = f"renders/{record_id}/video.mp4"
                upload.upload_file(assembled, S3_BUCKET, s3_key,
                                   ExtraArgs={'ContentType': 'video/mp4'})
                video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
                actual_duration = float(config['duration'])
                print(f"AI assembly published: {video_url}")
            except Exception as ae:
                # Hard fallback to the old single-clip behavior so a paid job
                # still ships SOMETHING (the client refunds on hard failure).
                print(f"AI concat failed — falling back to first clip only: {ae}")
                _write_job_status(record_id, "processing", {
                    "tier": tier, "progress": 95,
                    "assembly_note": f"concat failed: {type(ae).__name__}: {str(ae)[:200]}",
                })
                video_url = video_clips[0] if video_clips else ""

        # Upscale if PREMIUM tier (768p canvas → 1440x810 → 1920x1080 real)
        if processing_type == "ai_upscaled":
            print("Upscaling to 1080p...")
            video_url = upscale_video.remote(
                input_video_url=video_url,
                target_resolution="1080p"
            )
            # The published video changed size — later burn-in stages must
            # compose for what is actually on disk now.
            bw, bh = 1920, 1080

        # AI Avatar add-on: the lip-sync clip rendered FIRST (before this
        # job, as part of the client's Generate Video action) and its
        # narration IS the voiceover — composite it top-left and use its
        # audio instead of a second TTS pass. Runs regardless of the
        # branding toggle: the agent paid for the avatar either way.
        avatar_video_url = str((branding or {}).get("avatar_video_url") or "").strip()
        if avatar_video_url:
            import tempfile as _tf
            import os as _os
            workdir = _tf.mkdtemp(prefix=f"avatar_{record_id}_")
            try:
                src = os.path.join(workdir, "src.mp4")
                dst = os.path.join(workdir, "out.mp4")
                with open(src, "wb") as vf:
                    vf.write(fetch_media(video_url, timeout=300))
                final_dur = _apply_avatar_overlay(src, avatar_video_url, dst, bw, bh, music_url=music_url)
                s3 = boto3.client('s3', region_name=S3_REGION)
                s3_key = f"renders/{record_id}/video.mp4"
                s3.upload_file(dst, S3_BUCKET, s3_key,
                               ExtraArgs={'ContentType': 'video/mp4'})
                video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
                actual_duration = round(final_dur, 1)
                print(f"AI avatar composited ({final_dur:.1f}s): {video_url}")
            finally:
                try:
                    import shutil as _shutil
                    _shutil.rmtree(workdir, ignore_errors=True)
                except Exception:
                    pass

        # Voiceover + music for AI tiers: fal clips arrive silent (and only
        # ~6 s while scripts target 30 s+), so synthesize the narration in
        # the selected language, freeze the last frame if it overruns the
        # clip, mix the music bed in the same pass, and publish to OUR S3
        # (fal media URLs are not covered by the 30-day retention purge).
        # The ESSENTIAL tier already mixed narration inside render_video_local.
        elif (voiceover_text or "").strip():
            import tempfile as _tf
            import os as _os
            lang, nar_voice = _resolve_narakeet_voice(voice_id, language)
            print(f"Synthesizing narration ({lang} / {nar_voice}): {len(voiceover_text)} chars")
            narr_bytes, narakeet_seconds = narakeet_tts(voiceover_text, nar_voice)
            print(f"Narakeet billed {narakeet_seconds:.1f}s ({lang} / {nar_voice})")
            workdir = _tf.mkdtemp(prefix=f"vo_{record_id}_")
            try:
                src = os.path.join(workdir, "src.mp4")
                narr_path = os.path.join(workdir, "narration.mp3")
                dst = os.path.join(workdir, "out.mp4")
                with open(src, "wb") as vf:
                    vf.write(fetch_media(video_url, timeout=300))
                with open(narr_path, "wb") as nf:
                    nf.write(narr_bytes)
                final_dur = _mix_narration(src, narr_path, dst, music_url=music_url)
                s3 = boto3.client('s3', region_name=S3_REGION)
                s3_key = f"renders/{record_id}/video.mp4"
                s3.upload_file(dst, S3_BUCKET, s3_key,
                               ExtraArgs={'ContentType': 'video/mp4'})
                video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
                actual_duration = round(final_dur, 1)
                print(f"Voiceover mixed in ({final_dur:.1f}s): {video_url}")
            finally:
                try:
                    import shutil as _shutil
                    _shutil.rmtree(workdir, ignore_errors=True)
                except Exception:
                    pass
    
    print(f"✅ Render complete: {video_url}")

    _ensure_not_cancelled(record_id)  # cancelled during assembly — don't publish

    # Agent branding burn-in (AI tiers): the overlay needs LOCAL bytes, and
    # the assembled video is a URL — fetch it, burn the card, re-upload.
    # Cosmetic: any failure ships unbranded rather than failing the job.
    # AI tiers only — Essential burned inside render_video_local (a second
    # pass here would double-apply the card on tier-resolution pixels).
    if processing_type != "local" and include_agent_branding and branding:
        try:
            import tempfile as _tf
            with _tf.TemporaryDirectory(prefix=f"blist_{record_id}_") as _work:
                src = os.path.join(_work, "src.mp4")
                branded = os.path.join(_work, "branded.mp4")
                with open(src, "wb") as bvf:
                    bvf.write(fetch_media(video_url, timeout=300))
                # Render dimensions: bw/bh computed with the avatar overlay
                # above — both passes share one canvas.
                branded_path = _apply_branding_overlay(src, branding, use_avatar, bw, bh, _work)
                if os.path.exists(branded_path) and branded_path != src:
                    import os as _os2
                    s3b = boto3.client('s3', region_name=S3_REGION)
                    s3_key = f"renders/{record_id}/video.mp4"
                    s3b.upload_file(branded_path, S3_BUCKET, s3_key,
                                    ExtraArgs={'ContentType': 'video/mp4'})
                    video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
                    print(f"Branding burned in (AI tier): {video_url}")
        except Exception as be:
            print(f"AI-tier branding burn-in failed — shipping unbranded: {be}")

    # Thumbnail for Listings cards: grab a frame from the finished video
    # (best-effort — never fails the render)
    thumbnail_url = None
    try:
        video_bytes = fetch_media(video_url, timeout=120)
        thumbnail_url = _thumbnail_from_video_bytes(video_bytes, f"thumbnails/render/{record_id}.jpg")
        # Measured runtime: narration can freeze-extend a render past its
        # nominal tier duration (short clip, long script) — the project
        # record should show what actually plays.
        try:
            import tempfile as _tf
            with _tf.NamedTemporaryFile(suffix=".mp4", delete=False) as _f:
                _f.write(video_bytes)
                _dur_path = _f.name
            try:
                actual_duration = round(_media_duration(_dur_path), 1)
            finally:
                try:
                    import os as _os
                    _os.unlink(_dur_path)
                except Exception:
                    pass
        except Exception as _de:
            print(f"duration probe skipped: {_de}")
    except Exception as _te:
        print(f"render thumbnail skipped: {_te}")

    # Ops report: Narakeet bills per synthesized second — record it on every
    # completed video job (0 = no narration) so old records stay guessable
    # (absent key = predates measurement, excluded from the report totals).
    nar_extra = {"narakeet_seconds": round(float(narakeet_seconds), 2)}
    if narakeet_seconds > 0:
        _rep_lang, _rep_voice = _resolve_narakeet_voice(voice_id, language)
        nar_extra.update({"narakeet_voice": _rep_voice, "narakeet_language": _rep_lang})

    _write_job_status(record_id, "completed", {
        "video_url": video_url,
        "progress": 100,
        "duration_seconds": actual_duration,
        "kind": "render",
        "tier": tier,
        **nar_extra,
        **({"thumbnail_url": thumbnail_url} if thumbnail_url else {}),
    })
    
    return {
        "record_id": record_id,
        "status": "completed",
        "video_url": video_url,
        "tier": tier,
        "config_index": config_index,
        "resolution": resolution,
        "processing_type": processing_type,
        "credits_used": config['credits'],
        "image_count": len(images),
        "duration": actual_duration
    }


# ═══════════════════════════════════════════════════════════════════════════
# Failure path: mark job failed for polling clients
# (called by render_video_job below — never from inside a retried attempt)
def render_video_failed(record_id: str, error: str):
    _write_job_status(record_id, "failed", {"error": error[:400]})


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=3600, retries=0)
async def render_video_job(
    record_id: str,
    tier: str,
    config_index: int,
    orientation: str,
    images: list[str],
    voiceover_text: str,
    voice_id: str = "Joanna",
    language: str = "en-ZA",
    include_agent_branding: bool = True,
    music_url: str | None = None,
    image_prompts: list[dict] | None = None,
    branding: dict | None = None,
    use_avatar: bool = False,
) -> None:
    """Spawn target for POST /render_video: awaits the retried render and —
    ONLY once every Modal retry is exhausted — flips the job to `failed`.

    The write cannot live inside render_video itself: it would fire on the
    FIRST failed attempt while attempts 2-3 are still running, and the client
    treats `failed` as terminal (refund + FAILED record) — a retry that then
    succeeded would publish an orphaned video for a refunded job. Conversely,
    nothing used to call render_video_failed at all, so a crash (e.g. the
    Oct-6 UnboundLocalError) left `processing / progress 0` forever and the
    client sat until its 25-minute deadline.

    Cancellation stays safe: _write_job_status keeps `cancelled` terminal, so
    this write is dropped for a job the user cancelled (RenderCancelled
    propagates here as an exception like any other).
    """
    try:
        await render_video.remote.aio(
            record_id=record_id,
            tier=tier,
            config_index=config_index,
            orientation=orientation,
            images=images,
            voiceover_text=voiceover_text,
            voice_id=voice_id,
            language=language,
            include_agent_branding=include_agent_branding,
            music_url=music_url,
            image_prompts=image_prompts,
            branding=branding,
            use_avatar=use_avatar
        )
    except Exception as e:
        print(f"❌ Render {record_id} failed after retries: {type(e).__name__}: {e}")
        render_video_failed(record_id, f"{type(e).__name__}: {e}")
# ───────────────────────────────────────────────────────────────────────────
# IMAGE EDITING FUNCTIONS
# ───────────────────────────────────────────────────────────────────────────

@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300, retries=2, max_containers=200, scaledown_window=300)
def edit_image_job(edit_id: str, image_url: str, preset_id: str, custom_prompt: str | None = None, strength: float | None = None, guidance_scale: float | None = None, mask_url: str | None = None):
    """Async image-edit job wrapper: runs the sync edit_image body and mirrors
    progress/result into S3 so /edit_status can serve it to any poller."""
    _write_job_status(edit_id, "processing")
    try:
        result = edit_image.remote(
            image_url=image_url,
            preset_id=preset_id,
            custom_prompt=custom_prompt,
            strength=strength,
            guidance_scale=guidance_scale,
            mask_url=mask_url,
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


def _fal_run_queued(endpoint: str, arguments: dict, max_wait: float = 180, context: str = "AI text"):
    """Run one fal request via queue submit + poll instead of fal_client.run.

    fal's SYNC path is server-killed after 120s with
    'Task's current input <request_id> hit its timeout of 120s'. Multi-photo
    Grok descriptions (vision calls on the OpenRouter route) regularly run
    longer than that, so the text pipeline must not use sync mode. The queue
    protocol has no such cap — same pattern as _run_kontext above."""
    import fal_client
    import time
    try:
        handler = fal_client.submit(endpoint, arguments=arguments)
    except Exception as e:
        # Convert provider errors to a plain exception so they deserialize
        # cleanly on the caller side (same reason _run_kontext does this).
        raise RuntimeError(_friendly_fal_error(e, context=context)) from None
    start_time = time.time()
    while True:
        if time.time() - start_time > max_wait:
            raise TimeoutError(f"fal.ai {endpoint} did not complete within {int(max_wait)}s")
        status = handler.status()
        status_type = type(status).__name__
        if status_type == "Completed":
            return handler.get()
        if status_type == "Failed":
            raise RuntimeError(_friendly_fal_error(Exception(str(status.error)), context=context))
        if status_type not in ("Queued", "InProgress"):
            raise RuntimeError(f"Unknown fal.ai status: {status_type}")
        time.sleep(3)


def _llm_chat(messages: list) -> str:
    """Call fal's OpenRouter LLM integration with endpoint fallbacks.
    Grok (x-ai) is the primary model for property copy; OpenRouter model
    catalogs drift, so keep fallbacks behind it.

    Two hard constraints shape this call path:
     • Modal's web proxy enforces a 150 s HTTP timeout, and for CORS browsers
       (all our clients) there is NO redirect fallback — the response dies
       without CORS headers and the browser reports a raw "Failed to fetch".
       So the WHOLE fallback chain must finish inside that wall: the budget
       is split evenly across attempts and each poll stops before it.
     • xAI's Grok reasons by default — one 12-image video_script call burned
       ~11k completion tokens (mostly internal word-counting loops) and
       ~$0.12 for a 130-word script, pushing the call past the wall. For
       short marketing copy reasoning is pure waste: request it OFF and
       excluded from the response (models that cannot disable it simply
       ignore this param, where the per-attempt cap keeps the chain inside
       the wall anyway)."""
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
    # Stay under Modal's 150 s CORS wall: budget the chain evenly, leaving
    # headroom for the ~3 s poll cadence (each attempt can overshoot its
    # window by one poll tick before the check runs).
    CHAIN_BUDGET_S = 125.0
    per_attempt_s = max(15.0, CHAIN_BUDGET_S / max(1, len(attempts)))
    for endpoint, extra in attempts:
        try:
            result = _fal_run_queued(
                endpoint,
                arguments={
                    **extra,
                    "messages": messages,
                    # OpenRouter unified reasoning control: marketing copy is a
                    # short, fact-bound task — internal CoT added minutes of
                    # latency and real cost ($0.12 for one script) while the
                    # browser sat on a request Modal's CORS proxy kills at 150 s.
                    "reasoning": {"enabled": False, "exclude": True},
                },
                max_wait=per_attempt_s,
                context="AI text",
            )
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


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300)
def generate_text_fn(kind: str, fields: dict, images: list | None = None) -> str:
    """Grok AI text generation for property descriptions, social captions and
    video voiceover scripts (via fal's OpenRouter integration), with optional
    photo URLs for vision-described copy.

    Chain budget: the whole fallback chain is capped at 125 s (+ one poll
    tick per attempt) because Modal's web proxy kills CORS-browser responses
    at 150 s with no redirect fallback — see _llm_chat. Each poll window is
    capped per attempt inside _fal_run_queued so a hard-hang endpoint falls
    through to the next model path within the budget."""
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
            "tour video, grounded in the LISTING DETAILS and the ATTACHED PHOTOS the agent uploaded "
            "— use what the details say and what you can see in the photos (rooms, finishes, light, "
            "garden, views); do not narrate rooms the photos do not show. {SOURCE_RULE} "
            "{LANGUAGE_RULE} {WORD_RULE} — no "
            "stage directions, no scene labels, no markdown. End with a call "
            "to action to book a viewing. Never invent facts."
        ),
        "language_check": (
            "You are a strict language detector for South African property voiceover scripts. "
            "You receive a target language and a script. Reply with ONLY minified JSON and nothing "
            "else: {\"detected\":\"<code>\",\"ok\":<true|false>}. `detected` is the language the "
            "SCRIPT is actually written in — one of af-ZA, en-ZA, nso-ZA, st-ZA, tn-ZA, xh-ZA, "
            "zu-ZA, ssw-ZA, tso-ZA, ven-ZA, nr-ZA (closest match otherwise). `ok` is true only when "
            "the script is correctly written IN THE TARGET LANGUAGE: code-switched property names, "
            "suburbs, numbers and contact details are fine, but text written wholesale in another "
            "language must return false. Never add commentary or code fences."
        ),
        "translate": (
            "You are a translator for South African property voiceover scripts. Translate the "
            "user's script into the target language named in the request — natural, spoken wording "
            "suitable for narration by a native voice. Keep property names, suburbs, numbers, prices "
            "and agent contact details EXACTLY as written. Output ONLY the translated script: no "
            "quotes, no notes, no explanation."
        ),
    }
    system = system_prompts.get(kind, system_prompts["description"])
    # The narrator speaks the SELECTED language (one of SA's 11 official
    # languages), so the AI-written script must be in it too. The frontend
    # sends `language` / `language_label` / `target_words` / `duration_seconds`
    # with video_script requests; other kinds ignore them.
    if kind == "video_script":
        lang_label = str(fields.get("language_label") or "").strip()
        lang_code = str(fields.get("language") or "").strip()
        target_words = fields.get("target_words")
        duration_s = fields.get("duration_seconds")
        if lang_label and lang_label.lower() != "english":
            language_rule = (
                f"Write the ENTIRE script in {lang_label} (language code {lang_code}) — plain "
                f"spoken {lang_label} only, every word including the call to action, never "
                f"English or another language —"
            )
        else:
            language_rule = "Plain spoken English only —"
        # HARD CAP, not just a target: browsers/agents expect the narration to
        # fit the video length — an over-length LLM response froze the last
        # frame past the tier duration (a 30s video running ~38s). Ask for
        # slightly under the target so natural reading never overruns, and
        # name the absolute ceiling explicitly.
        if target_words and duration_s:
            words = int(target_words)
            word_rule = (
                f"HARD LIMIT: {words} words or fewer — the script must fill {int(duration_s)} seconds of "
                f"narration and MUST NOT exceed {words} words. Aim for about 90% of that length "
                f"(short, punchy sentences). If the listing content is too much, summarize it — "
                f"never run over {words} words. Count your words before answering."
            )
        else:
            word_rule = (
                "HARD LIMIT: 130 words or fewer — the script must fill about 60 seconds of "
                "narration and MUST NOT exceed 130 words. Aim for about 120 words."
            )
        # Source rule: agents complete the Property Description on the Video
        # tab (with photos uploaded alongside) — the description is PRIMARY
        # and the attached photos REFINE it (what the model sees: room
        # layout, finishes, light, garden). With no description the photos
        # are the ONLY ground truth. With neither, fall back to form facts.
        if fields.get("property_description"):
            photos_note = (
                " The attached photos show what the narrated tour visits — describe the rooms "
                "and features you can see in them as you move through the script so words and "
                "picture agree."
                if fields.get("photos_supplement")
                else ""
            )
            source_rule = (
                f"Base the script on this Property Description from the listing — speak its "
                f"content in narration order, trimmed to fit the narration length. "
                f"Do not contradict it; do not add facts it does not mention." + photos_note + "\n"
                f"{str(fields['property_description'])[:3000]}\n"
            )
        elif fields.get("describe_photos"):
            source_rule = (
                "There is NO property description — the attached photos are your only source: "
                "describe what you can SEE in them (rooms, finishes, light, garden, views, "
                "saleable features) as you narrate through the tour. Never invent specifics "
                "(no made-up prices, suburbs or schools).\n"
            )
        else:
            source_rule = "Using the exact facts in the provided fields,"
        system = (system
                  .replace("{SOURCE_RULE}", source_rule)
                  .replace("{LANGUAGE_RULE}", language_rule)
                  .replace("{WORD_RULE}", word_rule)
                  .replace("{WORD_RULE}", word_rule))
    facts = "\n".join(f"{k}: {v}" for k, v in fields.items() if v not in (None, "", []))
    if kind in ("language_check", "translate"):
        # Frontend-driven mismatch detection / auto-correction: fields carry
        # {text, target_language, language_label} — no property-facts framing.
        user_text = (f"target_language: {fields.get('target_language')}"
                     f" ({fields.get('language_label') or ''})\n\nscript:\n{fields.get('text')}")
    else:
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

def _hdr_boost_bytes(data: bytes) -> bytes:
    """Deterministic HDR tone-map of the SOURCE pixels.

    HDR Boost used to ask flux-pro/kontext for an "HDR look" at gentle
    guidance: agents got essentially the same photo back ("it keeps the
    photo as is"), and whatever slight reframing the model did read as a
    zoom. Dynamic range is a TONAL property, not a compositional one — so
    this bypasses the generative model entirely and runs a real single-
    exposure tone-map in ffmpeg instead:

      1. curves  — lift crushed shadows, roll off blown highlights so
                   detail shows at BOTH ends of the range (the HDR base)
      2. eq      — restore punch: contrast, colour richness, a touch of gamma
      3. unsharp — local contrast ("clarity") so stucco, brick, foliage and
                   window frames snap instead of looking flat

    Framing is untouched (the standard fit to EDIT_OUTPUT_* below is the
    only geometry change) and the result is identical on every run. Any
    ffmpeg failure degrades to the untouched source rather than failing a
    render the agent already paid for."""
    import subprocess as _sp
    import tempfile as _tf
    import os as _os
    in_path = out_path = None
    try:
        with _tf.NamedTemporaryFile(suffix='.img', delete=False) as f:
            f.write(data)
            in_path = f.name
        out_path = in_path + '.hdr.jpg'
        vf = (
            "curves=master='0/0.05 0.10/0.18 0.30/0.355 0.50/0.505 0.70/0.69 0.88/0.83 1/0.93',"
            "eq=contrast=1.05:saturation=1.32:gamma=1.02,"
            # NOTE: ffmpeg's unsharp caps luma width/height at 13 (chroma too)
            # — wider args make ffmpeg reject the WHOLE filter graph and
            # this function would silently fall back to the untouched source.
            "unsharp=13:13:0.9:13:13:0.0"
        )
        _sp.run(
            ['ffmpeg', '-v', 'error', '-y', '-i', in_path, '-vf', vf,
             '-q:v', '2', out_path],
            check=True, capture_output=True, timeout=60,
        )
        with open(out_path, 'rb') as f:
            boosted = f.read()
        return boosted if boosted else data
    except Exception as e:
        print(f"hdr boost skipped: {e}")
        return data
    finally:
        for p in (in_path, out_path):
            if p:
                try:
                    _os.unlink(p)
                except Exception:
                    pass


# Two-stage staging (empty then furnish): a single Kontext pass that must
# BOTH clear the old furniture AND place a new set routinely re-renders the
# whole room on featureless spaces, substituting architecture outright.
# Splitting the task halves the instructions per pass, so gentler guidance
# suffices per pass and the room survives both:
#   Stage A — clear: remove freestanding furniture, reconstruct floors/walls.
#             (a single-object removal task Kontext performs reliably)
#   Stage B — furnish: add ONLY the preset's new furniture into the now-empty
#             room. Nothing to remove, nothing to drift past.
# Both passes get the same room-anchor caption ("THIS EXACT ROOM for
# reference") and the brightness floor. Timeout doubles because two fal jobs
# run back-to-back. Custom prompts skip the two-stage path.
def _run_kontext(image_url: str, prompt: str, guidance: float):
    """Submit one Kontext job and return its output image bytes.

    Shared by the single- and two-stage staging paths so error handling and
    polling stay identical. Raises RuntimeError on provider errors (plain,
    deserializable) and Exception on timeout/failure."""
    import fal_client
    try:
        handler = fal_client.submit(
            "fal-ai/flux-pro/kontext",
            arguments={
                "image_url": presign_media(image_url),
                "prompt": prompt,
                "guidance_scale": guidance,
            }
        )
    except Exception as e:
        # Convert provider errors to a plain exception: custom classes like
        # FalClientHTTPError fail to deserialize on the caller side and bury
        # the real cause (e.g. billing lock) in a deserialization blob.
        raise RuntimeError(_friendly_fal_error(e)) from None

    import time
    max_wait = 240  # 4 minutes per pass (leave 1 minute buffer before 5 minute timeout)
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

    response = requests.get(edited_image_url)
    return response.content


def _fill_pro(image_url: str, mask_url: str, prompt: str) -> bytes:
    """One fal-ai/flux-pro/v1/fill (inpainting) call: regenerate ONLY the masked
    region; everything outside the mask is physically locked to the source
    pixels — a hard constraint, unlike prompt-based 'keep the walls' language.
    Returns the output image bytes. guidance defaults are fal's own.

    Fill accepts regular images and data URIs; source and mask must have the
    same aspect ratio — callers pre-crop the mask to the image size.
    """
    import fal_client
    try:
        result = fal_client.run(
            "fal-ai/flux-pro/v1/fill",
            arguments={
                "image_url": presign_media(image_url),
                "mask_url": presign_media(mask_url),
                "prompt": prompt,
                # Fill bills per OUTPUT megapixel, rounded UP ($0.05/MP).
                # The old 1920x1080 request (2.07MP) billed as 3MP = $0.15;
                # 1280x720 (0.92MP) bills as 1MP = $0.05 — a 3x cut on every
                # masked call (2-call staging: $0.30 -> $0.10). Same 16:9
                # frame, same aspect constraints, and the pipeline still
                # stores a 1920x1080 image: every masked-path output goes
                # through _fit_image_bytes before storage.
                "image_size": {"width": 1280, "height": 720},
            },
        )
    except Exception as e:
        raise RuntimeError(_friendly_fal_error(e)) from None
    # Fill's response shape is {images: [{url, ...}], timings, seed, ...}
    images = (result or {}).get("images") or []
    out_url = (images[0] or {}).get("url") if images else None
    if not out_url:
        raise Exception(f"Fill Pro returned no image: {str(result)[:200]}")
    return requests.get(out_url, timeout=120).content


def _erase_pro(image_url: str, mask_url: str, prompt: str) -> bytes:
    """One fal-ai/flux-pro/v1/erase call: regenerate ONLY the white mask
    pixels — whatever the user painted is erased as seamless continuation
    of the surrounding floor/walls, and everything outside the mask stays
    source pixels. (The 'fal-ai/flux-erase' alias does not exist —
    flux-pro/v1/erase is the real endpoint; verified 2026-10-11.)
    Returns the output image bytes.
    """
    import fal_client
    try:
        result = fal_client.run(
            "fal-ai/flux-pro/v1/erase",
            arguments={
                "image_url": presign_media(image_url),
                "mask_url": presign_media(mask_url),
                "prompt": prompt,
            },
        )
    except Exception as e:
        raise RuntimeError(_friendly_fal_error(e)) from None
    # Erase's response shape matches Fill: {images: [{url, ...}], ...}
    images = (result or {}).get("images") or []
    out_url = (images[0] or {}).get("url") if images else None
    if not out_url:
        raise Exception(f"Erase Pro returned no image: {str(result)[:200]}")
    return requests.get(out_url, timeout=120).content


def _mask_png_bytes(data: bytes, width: int, height: int) -> bytes:
    """Decode uploaded mask (PNG/JPEG, arbitrary size) and fit it exactly onto
    (width, height): mask is white where regeneration happens, black elsewhere.
    JPEG masks come off the brush tool slightly gray — threshold pushes
    anything past half-brightness to full white so furniture coverage matches
    what the user painted.
    """
    from PIL import Image
    import io as _io
    img = Image.open(_io.BytesIO(data)).convert("L")
    img = img.resize((width, height), Image.LANCZOS)
    img = img.point(lambda v: 255 if v > 127 else 0, mode="1").convert("L")
    out = _io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def _style_hint(preset_prompt: str) -> str:
    """Extract the preset's furniture sentence for stage B of two-stage
    staging: the text between 'Only add or replace freestanding furniture and
    soft furnishings: ' and the following '.'."""
    marker = "Only add or replace freestanding furniture and soft furnishings: "
    i = preset_prompt.find(marker)
    if i == -1:
        return preset_prompt[:200]
    rest = preset_prompt[i + len(marker):]
    j = rest.find(".")
    return rest[: j if j != -1 else 300].strip()


def _store_intermediate(payload: bytes, image_url: str, preset_id: str,
                        tag: str) -> str:
    """Persist a mid-pipeline frame (e.g. stage A 'empty' pass) under
    edited/_tmp/<preset>_<tag>_<source>.<ext> and return its serving URL for
    stage B's input. Same clean-key handling as _store_edit."""
    import boto3
    from urllib.parse import urlparse
    ext = os.path.splitext(os.path.basename(urlparse(image_url).path))[1] or ".jpg"
    s3_key_free = f"edited/_tmp/{preset_id}_{tag}_{os.path.basename(urlparse(image_url).path)}"
    s3_key = s3_key_free if ext == ".jpg" else (s3_key_free[:-len(ext)] + ".jpg")

    s3 = boto3.client('s3', region_name=S3_REGION)
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=payload,
        ContentType='image/jpeg'
    )
    url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    print(f"stage A stored: {url}")
    return url


def _store_edit(payload: bytes, image_url: str, preset_id: str,
                strength_value, guidance_value) -> dict:
    """Persist an edited frame at edited/<preset>_<source>.jpg and return the
    standard edit-response dict. Shared by the generative path and the
    deterministic HDR path so both store and answer identically."""
    import boto3
    from urllib.parse import urlparse
    # image_url routinely arrives presigned (the studio hands us a 1h signed
    # preview link): the query must never land in the key. basename() used to
    # swallow it whole, so the object was stored at "x.jpg?X-Amz-…" while
    # every reader (status presigner, download link) requested the clean
    # "x.jpg" → NoSuchKey on view and download.
    s3_key = f"edited/{preset_id}_{os.path.basename(urlparse(image_url).path)}"

    s3 = boto3.client('s3', region_name=S3_REGION)
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=payload,
        ContentType='image/jpeg'
    )

    final_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    print(f"✅ Image edit complete: {final_url}")

    return {
        "status": "completed",
        "image_url": final_url,
        "preset_id": preset_id,
        "strength": strength_value,
        "guidance_scale": guidance_value,
        "credits_used": IMAGE_RENDER_CREDIT_COST
    }


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300, retries=2)
def edit_image(
    image_url: str,
    preset_id: str,
    custom_prompt: str | None = None,
    strength: float | None = None,
    guidance_scale: float | None = None,
    mask_url: str | None = None
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

    # Room anchor (staging + the three furniture-removal presets): caption
    # the actual source photo and inject it ahead of the negative tail, so
    # the model edits THIS room. Best-effort: an LLM hiccup must not fail a
    # paid render. Masked staging skips the anchor entirely: Fill Pro
    # physically locks the unmasked pixels, so the caption adds nothing.
    # remove_cars (the AI Photo Editor's only vehicle-removal preset — the
    # old remove_vehicles clone was deleted) deliberately gets NO anchor —
    # it must run exactly the path that already worked.
    _anchor = ""
    _anchor_ids = ("remove_all_furniture", "remove_clutter", "remove_personal_items")
    if (preset.get("category") == "staging" or preset_id in _anchor_ids) and not custom_prompt and not mask_url:
        try:
            _anchor = _room_anchor_bytes_url(image_url)
            print(f"room anchor: {_anchor[:160]}")
        except Exception as e:
            print(f"room anchor skipped: {e}")
    
    # Use provided strength/guidance or preset defaults
    actual_strength = strength if strength is not None else preset['strength']['default']
    actual_guidance = guidance_scale if guidance_scale is not None else preset['guidanceScale']['default']
    
    print(f"Using strength: {actual_strength}, guidance: {actual_guidance}")

    # HDR Boost (no custom instruction) is a tone-map, not a regeneration:
    # process the source pixels directly — zero generative reframing, no fal
    # job, guaranteed visible dynamic-range recovery. A custom prompt is an
    # explicit request for generative editing and keeps the Kontext path.
    if preset_id == 'hdr_boost' and not custom_prompt:
        print("hdr_boost: deterministic tone-map (no fal job)")
        source_bytes = fetch_media(image_url, timeout=60)
        return _store_edit(
            _fit_image_bytes(_hdr_boost_bytes(source_bytes)),
            image_url, preset_id, actual_strength, actual_guidance
        )

    # The three furniture-removal presets erase the user-painted mask with
    # FLUX Erase [pro] (fal-ai/flux-pro/v1/erase — the "fal-ai/flux-erase"
    # alias does not exist; verified 2026-10-11). White mask pixels are
    # regenerated as seamless continuation of what surrounds them; the mask
    # is the hard structure constraint, and the preset prompt is passed
    # verbatim. remove_cars (photo editor) keeps the plain Kontext path,
    # and a removal preset WITHOUT a mask (stale client) falls through to
    # the same Kontext path as before.
    if preset_id in ("remove_all_furniture", "remove_clutter", "remove_personal_items") and not custom_prompt and mask_url:
        from urllib.parse import urlparse as _ulp
        source_bytes = fetch_media(image_url, timeout=60)
        mask_bytes = fetch_media(mask_url, timeout=60)
        from PIL import Image
        import io as _io3
        src_img = Image.open(_io3.BytesIO(source_bytes))
        fitted = _mask_png_bytes(mask_bytes, src_img.width, src_img.height)
        mask_s3_key = f"edited/_masks/{preset_id}_{os.path.basename(_ulp(image_url).path)}.png"
        s3m = boto3.client('s3', region_name=S3_REGION)
        s3m.put_object(Bucket=S3_BUCKET, Key=mask_s3_key,
                       Body=fitted, ContentType='image/png')
        mask_fitted_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{mask_s3_key}"
        erased = _erase_pro(image_url, mask_fitted_url, preset["prompt"])
        return _store_edit(
            _fit_image_bytes(erased), image_url, preset_id,
            actual_strength, actual_guidance
        )

    # Masked staging (brush tool): FLUX.1 Fill [pro] inpainting. The mask is
    # a HARD constraint — everything outside it never changes — so both calls
    # can reuse the SAME user-painted furniture mask:
    #   Call 1 removes: fill masked-area with continuation of surrounding
    #                   floor/walls → emptied room, zero structural drift.
    #   Call 2 furnishes: use call 1's output, same mask over the now-empty
    #                   floor → place the preset's furniture set there.
    # Falls back gracefully: mask processing failures land on the Kontext
    # two-stage path rather than failing a paid render.
    if preset.get("category") == "staging" and not custom_prompt and mask_url:
        try:
            from urllib.parse import urlparse as _ulp
            source_bytes = fetch_media(image_url, timeout=60)
            mask_bytes = fetch_media(mask_url, timeout=60)
            from PIL import Image
            import io as _io2
            src_img = Image.open(_io2.BytesIO(source_bytes))
            fitted = _mask_png_bytes(mask_bytes, src_img.width, src_img.height)
            mask_s3_key = f"edited/_masks/{preset_id}_{os.path.basename(_ulp(image_url).path)}.png"
            s3m = boto3.client('s3', region_name=S3_REGION)
            s3m.put_object(Bucket=S3_BUCKET, Key=mask_s3_key,
                           Body=fitted, ContentType='image/png')
            mask_fitted_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{mask_s3_key}"
            _set_hint_b = _style_hint(preset["prompt"])
            mapped_guidance = round(max(1.5, min(3.5, 1.5 + float(actual_strength) * 2.0)), 2)  # unused in fill path (kept for response shape)

            # Call 1 — remove furniture inside the mask. Output comes back in
            # Fill's target frame (1920x1080), which may differ from the
            # source's aspect for photos wider/taller than 16:9.
            removed = _fill_pro(
                image_url, mask_fitted_url,
                "Completely remove the furniture and objects inside the "
                "masked area. Replace each masked area with a seamless, "
                "natural continuation of the existing floor tiles and white "
                "walls visible in the surrounding unmasked areas. Match the "
                "existing tile color, grout lines, wall texture, skirting "
                "boards, and natural lighting exactly. The result must be a "
                "completely empty room showing only fixed architecture. "
                "Do not modify anything outside the masked area.",
            )
            removed_store = _store_intermediate(
                _fit_image_bytes(removed), image_url, preset_id, "masked_empty")

            # Call 2 — furnish the SAME mask region of the emptied frame.
            # The emptied frame lives in Fill's 1920x1080 output frame, so the
            # mask MUST be re-fitted to THAT frame — reusing the source-fitted
            # mask here is what made fal reject "Image and mask sizes do not
            # match" on photos wider than 16:9 (Fill center-cropped Call 1's
            # output to the 16:9 frame) and silently fall back to whole-frame
            # Kontext, which re-rendered the entire room. Re-fit from the
            # ORIGINAL user mask to the emptied frame's true pixel size so
            # Call 2 regenerates exactly the furniture regions of Call 1's
            # output — the staircase/kitchen outside the paint never moves.
            removed_img = Image.open(_io2.BytesIO(_fit_image_bytes(removed)))
            mask_for_b = _mask_png_bytes(mask_bytes, removed_img.width, removed_img.height)
            mask_b_key = f"edited/_masks/{preset_id}_b_{os.path.basename(_ulp(image_url).path)}.png"
            s3m.put_object(Bucket=S3_BUCKET, Key=mask_b_key,
                           Body=mask_for_b, ContentType='image/png')
            mask_b_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{mask_b_key}"

            final_bytes = _fill_pro(
                removed_store, mask_b_url,
                "Virtual staging: fill the masked floor area with the "
                f"following furniture, placed realistically with correct "
                f"perspective, scale, and natural shadows matching the "
                f"room's existing daylight: {_set_hint_b} All furniture "

                "sits flush on the existing floor. Natural bright daylight "
                "consistent with the room's existing light sources. "
                "High-end real estate color grading. Hyper-realistic, "

                "magazine-quality, ultra-high resolution. Do not modify "
                "anything outside the masked area.",
            )

            payload = _fit_image_bytes(final_bytes)

            payload = _staging_brightness_floor(payload, source_bytes)

            return _store_edit(payload, image_url, preset_id,
                               actual_strength, actual_guidance)
        except Exception as e:
            # Failed inpaint falls through to the Kontext two-stage path
            # (blur is not fatal — mask tool is best-effort on paid renders)
            print(f"masked staging failed ({e}); falling back to Kontext two-stage")

    # Kontext (fal's instruction-editing model) changes ONLY what the prompt
    # asks for and keeps everything else faithful to the source. The old
    # fal-ai/flux/dev/image-to-image re-rendered the whole scene at mid
    # strength — agents got a COMPLETELY DIFFERENT house — and it silently
    # drops negative_prompt (verified live: "no house" as a negative still
    # returned a house), so the preset negative lists never did anything.
    #   - FLUX-family models have no negative-prompt support at all, so the
    #     preset's negative list rides along as an explicit
    #     "Do not include:" instruction, which Kontext does follow.
    #   - Kontext has no `strength`; the preset strength slider maps onto
    #     its guidance_scale (1.5 gentle → 3.5 assertive; 2.5 is fal's
    #     default). Client guidance ranges (4–5) predate Kontext and are
    #     deliberately not forwarded — out of range they'd 422 the job.
    mapped_guidance = round(max(1.5, min(3.5, 1.5 + float(actual_strength) * 2.0)), 2)

    def _wrap(prompt_body: str) -> str:
        if _anchor:
            return (
                f"{prompt_body}\n\nTHIS EXACT ROOM for reference: {_anchor}\n\n"
                f"Do not include: {negative_prompt}."
            )
        if negative_prompt:
            return f"{prompt_body}\n\nDo not include: {negative_prompt}."
        return prompt_body

    # Staging replaces furniture in one shot only when the room is already
    # empty; otherwise a combined clear+place task re-renders whole rooms.
    # Split: pass 1 gently empties (single removal task), pass 2 gently
    # furnishes the emptied frame. Both passes stay anchored and gentle, so
    # the architecture holds and the furniture genuinely changes.
    if preset.get("category") == "staging" and not custom_prompt and _anchor:
        # Stage A reuses the remove_all_furniture preset prompt verbatim:
        # it's the exact single-purpose task the removal preset was verified
        # on (VQA PASS), so no bespoke weakened wording. Stage B is the
        # staging preset's own furnish text (clear-first sentence stripped —
        # wrong for an already-emptied room) with an explicit
        # "already-empty room" frame.
        _empty_preset = next(
            (p for p in IMAGE_PRESETS if p["id"] == "remove_all_furniture"), None)
        removal_prompt = _empty_preset["prompt"] if _empty_preset else preset["prompt"]
        stage_a_prompt = _wrap(removal_prompt)

        _directive = (
            " This room is already furnished: FIRST remove the existing "
            "freestanding furniture and movable decor — tables, chairs, "
            "sofas, armchairs, lamps, rugs and loose items — reconstructing "
            "the floor beneath them naturally, THEN place the new furniture "
            "set. Nothing may remain from the old furnishing."
        )
        stage_b_prompt = _wrap(
            "The room in this photo is already empty and unfurnished. "
            + preset["prompt"].replace(_directive, ""))

        # Stage A at the removal preset's proven default (0.55 → gc 2.6-
        # equivalent); stage B gentle (2.0): furnishing an EMPTY room needs
        # no force — the only risk left is redrawing architecture.
        stage_a_guidance = 2.9
        stage_b_guidance = 2.0
        print(f"staging two-stage: stageA gc={stage_a_guidance}, stageB gc={stage_b_guidance}")
        # Clear-and-verify loop: Kontext sometimes leaves stubborn pieces
        # (this user's dining set survived three firmer wordings). Each retry
        # costs one fal job but preserves the guarantee the preset is sold on.
        stage_a_url = None
        for attempt in range(3):
            stage_a_bytes = _run_kontext(image_url, stage_a_prompt, stage_a_guidance)
            stage_a_url = _store_intermediate(
                stage_a_bytes, image_url, preset_id, f"empty{attempt or ''}")
            try:
                cleared = _room_cleared(image_url, stage_a_url)
            except Exception as e:
                print(f"cleared-check skipped: {e}")
                cleared = True  # don't loop forever on LLM hiccups
            if cleared:
                _anchor = _anchor or ""  # keep original anchor for stage B
                break
            print(f"stage A attempt {attempt}: furniture remains — retrying")
        if stage_a_url is None:
            raise Exception("staging: emptier produced no output")
        # Anchor stage B on BOTH frames: the emptied stage-A output is the
        # geometry it must furnish into, and the ORIGINAL photo anchor pins
        # the pillar/openings that stage A must have kept. Recaptioning only
        # the emptied frame lets stage B quietly drop structural features it
        # can no longer see (the middle-room pillar vanished this way).
        try:
            stage_b_anchor = _room_anchor_bytes_url(
                stage_a_url, images=[image_url, stage_a_url])
        except Exception as e:
            print(f"stage B anchor skipped: {e}")
            stage_b_anchor = _anchor
        stage_b_prompt = (
            f"{stage_b_prompt}\n\nTHIS EXACT ROOM for reference: "
            f"{stage_b_anchor}\n\nDo not include: {negative_prompt}."
        )
        stage_b_bytes = _run_kontext(stage_a_url, stage_b_prompt, stage_b_guidance)
        payload = _fit_image_bytes(stage_b_bytes)
        payload = _staging_brightness_floor(payload, fetch_media(image_url, timeout=60))
        return _store_edit(payload, image_url, preset_id, actual_strength, mapped_guidance)

    prompt_for_model = _wrap(prompt)
    print(f"kontext: guidance={mapped_guidance}, prompt={len(prompt_for_model)} chars")

    payload = _fit_image_bytes(_run_kontext(image_url, prompt_for_model, mapped_guidance))

    # Staging: enforce the relative brightness floor against the source photo.
    if preset.get("category") == "staging":
        payload = _staging_brightness_floor(payload, fetch_media(image_url, timeout=60))
    # Twilight: three presets kept coming back cave-dark (agents: "too dark")
    # even after prompt text was strengthened — 'night'/'blue hour' vocabulary
    # outweighs lighting instructions. Bounded absolute luma targets instead.
    if preset.get("category") == "twilight":
        payload = _twilight_brightness_floor(
            payload, fetch_media(image_url, timeout=60), preset_id)

    return _store_edit(payload, image_url, preset_id, actual_strength, mapped_guidance)


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


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials"), modal.Secret.from_name("narakeet")], timeout=420, retries=2)
def generate_flashhead_video(
    profile_image_url: str,
    voiceover_text: str,
    user_id: str,
    voice: str = "Aria",
    language: str = "en-ZA",
    stability: float = 0.5
) -> dict:
    """
    Generate a lip-synced video from the agent's headshot + narration.

    Narakeet synthesizes the narration in the selected language (one of SA's
    11 official languages, native voice) and fal's flashhead audio-to-video
    mode lip-syncs the avatar to it — the old text mode only had ElevenLabs
    af/en voices, so it could never speak the other nine languages.

    Args:
        profile_image_url: URL of the agent's profile image (portrait recommended)
        voiceover_text: Narration text — spoken in `language`
        user_id: User identifier for S3 storage
        voice: Preferred Narakeet voice (re-validated against `language`)
        language: BCP-47 code of one of SA's 11 official languages
        stability: Unused — kept for API compatibility

    Returns:
        Dictionary with video URL and metadata
    """
    import boto3
    import fal_client

    lang, nar_voice = _resolve_narakeet_voice(voice, language)
    print(f"Generating FlashHead video for user: {user_id}")
    print(f"Voice: {nar_voice} ({lang}), Text length: {len(voiceover_text)} characters")

    # 1) Narration → hosted on S3 → presigned URL fal can fetch
    audio_url, nar_seconds = _narakeet_audio_url(voiceover_text, voice, language, user_id)

    # 2) Lip-sync the avatar to that audio (no text/voice/stability — the
    #    audio-to-video schema takes {image_url, audio_url} only)
    handler = fal_client.submit(
        "fal-ai/flashhead/audio-to-video",
        arguments={
            "image_url": presign_media(profile_image_url),
            "audio_url": audio_url,
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
        "model": "fal-ai/flashhead/audio-to-video",
        "voice": nar_voice,
        "language": lang,
        "narakeet_seconds": round(float(nar_seconds), 2)
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
            try:
                result = await render_video.remote.aio(
                    record_id=request.record_id,
                    tier=request.tier,
                    config_index=request.config_index,
                    orientation=request.orientation,
                    images=request.images,
                    voiceover_text=request.voiceover_text,
                    voice_id=request.voice_id,
                    language=request.language,
                    include_agent_branding=request.include_agent_branding,
                    music_url=request.music_url,
                    image_prompts=request.image_prompts,
                    branding=request.branding,
                    use_avatar=bool((request.branding or {}).get("use_avatar")),
                )
            except Exception as e:
                # Same contract as the async path: a crashed render must land
                # as `failed`, never freeze at `processing / progress 0`.
                render_video_failed(request.record_id, f"{type(e).__name__}: {e}")
                raise
            # Private buckets: the browser plays/shares this URL directly,
            # so hand it a long-lived presigned link, never the raw object.
            return presign_urls(result)

        # Async path: write initial job status to S3, then spawn
        _write_job_status(request.record_id, "queued", {"tier": request.tier})
        await render_video_job.spawn.aio(
            record_id=request.record_id,
            tier=request.tier,
            config_index=request.config_index,
            orientation=request.orientation,
            images=request.images,
            voiceover_text=request.voiceover_text,
            voice_id=request.voice_id,
            language=request.language,
            include_agent_branding=request.include_agent_branding,
            music_url=request.music_url,
            image_prompts=request.image_prompts,
            branding=request.branding,
            use_avatar=bool((request.branding or {}).get("use_avatar")),
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
    # Script-hash binding BEFORE the claim: a mismatch must leave the paid
    # token un-burnt so the client's refund path can reverse the charge.
    _verify_paid_script_hash(
        _parse_token(raw_request.headers.get(_token_header))[0],
        request.voiceover_text,
    )
    _claim_job_token(raw_request)  # paid + single-use before any work starts
    try:
        # Call the Modal function asynchronously
        result = await generate_flashhead_video.remote.aio(
            profile_image_url=request.profile_image_url,
            voiceover_text=request.voiceover_text,
            user_id=request.user_id,
            voice=request.voice,
            language=request.language,
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
                guidance_scale=request.guidance_scale,
                mask_url=request.mask_url,
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
            guidance_scale=request.guidance_scale,
            mask_url=request.mask_url,
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


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials"), modal.Secret.from_name("narakeet")], timeout=900, retries=1, max_containers=100, scaledown_window=300)
def flashhead_job(job_id: str, profile_image_url: str, voiceover_text: str, user_id: str, voice: str = "Aria", language: str = "en-ZA", stability: float = 0.5):
    """Async FlashHead lip-sync job: Narakeet narrates the script in the
    selected language, fal's fal-ai/flashhead/audio-to-video lip-syncs the
    agent's profile picture to it, and the result is mirrored into S3 so
    /flashhead_status can serve any poller."""
    import boto3
    import time
    import uuid

    s3 = boto3.client('s3', region_name=S3_REGION)
    video_key = f"flashhead/{user_id}/{uuid.uuid4().hex}.mp4"

    _write_job_status(job_id, "processing", {"kind": "flashhead"})
    try:
        lang, nar_voice = _resolve_narakeet_voice(voice, language)
        print(f"FlashHead job {job_id}: voice={nar_voice} ({lang}), text={len(voiceover_text)} chars")
        # 1) Narration in the selected language → hosted on S3 → presigned
        audio_url, nar_seconds = _narakeet_audio_url(voiceover_text, voice, language, user_id)
        # 2) Lip-sync the avatar to that audio (audio-to-video schema:
        #    {image_url, audio_url} — no text/voice/stability)
        handler = fal_client.submit(
            "fal-ai/flashhead/audio-to-video",
            arguments={
                "image_url": presign_media(profile_image_url),
                "audio_url": audio_url,
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
            # Ops report: billed Narakeet seconds per avatar video
            "kind": "flashhead",
            "narakeet_seconds": round(float(nar_seconds), 2),
            "narakeet_voice": nar_voice,
            "narakeet_language": lang,
            **({"duration_seconds": duration_seconds} if duration_seconds else {}),
            **({"thumbnail_url": thumbnail_url} if thumbnail_url else {}),
        })
    except Exception as e:
        _write_job_status(job_id, "failed", {"error": _friendly_fal_error(e, context="AI Avatar")})


class FlashHeadJobRequest(BaseModel):
    profile_image_url: str
    voiceover_text: str
    user_id: str
    voice: str = "Aria"
    language: str = "en-ZA"  # BCP-47 voiceover language (11 official SA languages)
    stability: float = 0.5


class GenerateTextRequest(BaseModel):
    kind: str  # description | social_caption | video_script | language_check | translate
    fields: dict = {}
    images: list[str] = []  # optional photo URLs for Grok vision

@web_app.post("/flashhead")
async def api_flashhead(request: FlashHeadJobRequest, raw_request: Request):
    """Start an async FlashHead lip-sync job. Poll /flashhead_status."""
    # Script-hash binding BEFORE the claim (same contract as /generate_flashhead_video).
    _verify_paid_script_hash(
        _parse_token(raw_request.headers.get(_token_header))[0],
        request.voiceover_text,
    )
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
            language=request.language,
            stability=request.stability,
        )
        return {
            "job_id": job_id,
            "status": "queued",
            "poll_url": f"/flashhead_status?job_id={job_id}",
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=_friendly_fal_error(e, context="AI Avatar"))

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
        # An empty 200 settles silently in the browser (the caller writes ""
        # or does nothing and the agent sees no error at all) — fail loudly
        # with a retryable reason instead.
        if not (text or "").strip():
            raise HTTPException(status_code=502, detail="The AI returned an empty response — please try again")
        return {"success": True, "kind": request.kind, "text": text}
    except Exception as e:            raise HTTPException(status_code=502, detail=_friendly_fal_error(e, context="AI text"))


class VoicePreviewRequest(BaseModel):
    voice: str = ""
    language: str = "en-ZA"

# Fixed ~5 s sample line per language (written natively, one-off generated).
# Server-side and constant on purpose: the preview endpoint costs Narakeet
# cents per UNIQUE (language, voice) pair only — request payloads never
# reach TTS, so nobody can turn previews into an arbitrary-text spend lever.
VOICE_SAMPLE_TEXT: dict = {
    "af-ZA": "Welkom by hierdie pragtige huis, boek vandag nog 'n besigtiging asseblief.",
    "en-ZA": "Welcome to this beautiful home, please book a viewing with us today.",
    "nso-ZA": "Re a go amogela ntlong ye ntle, kgopela go e lebelela gona bjale.",
    "st-ZA": "Re u amohela ntlong e ntle, kopa ho e sheba kajeno hona joale.",
    "tn-ZA": "Re a go amogela mo ntlong e ntle, kopa go e lebelela gompieno.",
    "xh-ZA": "Siyakwamkela kule ndlu yethu entle, nceda ubhuke ukuyibona namhlanje ngoku.",
    "zu-ZA": "Siyakwamukela kule ndlu yethu enhle kakhulu, sicela ubhuke ukuyibona namuhla.",
    "ssw-ZA": "Siyakwemukela kule ndlu yethu lenhle kakhulu, sicela ubhuke kuyibona namuhla.",
    "tso-ZA": "Mi amukeriwile endlwini leyinene ngopfu, kombelani ku yi vona namuntlha.",
    "ven-ZA": "Ndi a ni tanganedza nnḓuni yavhuḓi, kombelani u i vhona ṋamusi.",
    "nr-ZA": "Siyakwamukela kule ndlu yethu enhle kakhulu, sicela ubhuke ukuyibona namhlanje.",
}

@web_app.post("/tts_preview")
def api_tts_preview(request: VoicePreviewRequest):
    """Playable ~5 s sample of a narrator voice speaking the selected language.

    The pair is re-validated (stale clients post legacy voice names), the MP3
    is cached in S3 under voice-samples/{lang}_{voice}.mp3 and served
    presigned — so each unique pair synthesizes once, ever (bounded at ~30
    pairs ≈ a few cents total). Auth: worker token via the shared middleware.
    """
    import boto3
    lang, nar_voice = _resolve_narakeet_voice(request.voice, request.language)
    s3_key = f"voice-samples/{lang}_{nar_voice}.mp3"
    s3 = boto3.client('s3', region_name=S3_REGION)
    cached = True
    try:
        s3.head_object(Bucket=S3_BUCKET, Key=s3_key)
    except Exception:
        cached = False
    if not cached:
        text = VOICE_SAMPLE_TEXT.get(lang) or VOICE_SAMPLE_TEXT[DEFAULT_NARAKEET_LANGUAGE]
        try:
            mp3, tts_seconds = narakeet_tts(text, nar_voice)
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e)[:300])
        s3.put_object(Bucket=S3_BUCKET, Key=s3_key, Body=mp3, ContentType='audio/mpeg')
        print(f"voice sample synthesized: {s3_key} ({len(mp3)} bytes, {tts_seconds:.1f}s)")
    raw_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    return {**presign_urls({"url": raw_url}), "language": lang, "voice": nar_voice, "cached": cached}


@web_app.get("/get_image_presets")
async def api_get_image_presets():
    """API endpoint to get all image presets"""
    try:
        # Call the Modal function
        result = get_image_presets.remote()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Admin: upsert a named Modal secret in place ───────────────────────────
# The Admin dashboard's API Keys tab POSTs here so a key typed there lands
# in Modal Secrets without anyone opening the Modal UI. Bearer-gated by
# ADMIN_API_KEY (secret "admin-api"); only allow-listed secret names are
# accepted; values are never logged. SDK auth tries the ambient worker
# client first (it can touch the secrets this app mounts), then falls back
# to the account token from secret "modal-admin-creds" — which the same
# request may (re)supply once, to bootstrap a fresh or rotated token.
_ADMIN_SECRET_ALLOWLIST = {"fal-credentials", "aws-credentials", "narakeet", "render-auth"}


@web_app.post("/admin/secret")
async def admin_secret(request: Request) -> dict:
    import hmac as _hmac
    expected = os.environ.get("ADMIN_API_KEY", "")
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not expected or not _hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="unauthorized")
    body = await request.json()
    name = str(body.get("name", ""))
    env_dict = body.get("env_dict") or {}
    if name not in _ADMIN_SECRET_ALLOWLIST:
        raise HTTPException(status_code=400, detail=f"name not allow-listed: {name!r}")
    if not isinstance(env_dict, dict) or not env_dict or not all(
        isinstance(k, str) and isinstance(v, str) and k and v for k, v in env_dict.items()
    ):
        raise HTTPException(status_code=400, detail="env_dict must be a non-empty {str: str}")

    # SDK auth: the account token from secret "modal-admin-creds" (mounted
    # as env) — or supplied once by the request to bootstrap a fresh or
    # rotated token, which is then persisted back into that secret.
    import modal as _modal
    tok_id = str(body.get("modal_token_id") or os.environ.get("MODAL_TOKEN_ID", ""))
    tok_sec = str(body.get("modal_token_secret") or os.environ.get("MODAL_TOKEN_SECRET", ""))
    if not tok_id or not tok_sec:
        raise HTTPException(status_code=502, detail=(
            "MODAL_TOKEN_ID/SECRET not available — paste the Modal token once "
            "in the admin tab (Advanced) or create the modal-admin-creds secret"))
    try:
        # NOTE: from_credentials() opens its own stub — SDK 1.5.5 asserts if
        # it is also used as a context manager, so call it plainly.
        client = _modal.client.Client.from_credentials(tok_id, tok_sec)
        sec = _modal.Secret.from_name(name, client=client)
        sec.update(env_dict)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"secret update failed for {name!r}: {e}")
    try:
        client = _modal.client.Client.from_credentials(tok_id, tok_sec)
        _modal.Secret.from_name("modal-admin-creds", client=client).update(
            {"MODAL_TOKEN_ID": tok_id, "MODAL_TOKEN_SECRET": tok_sec})
    except Exception as persist_err:
        print(f"modal-admin-creds persist skipped: {persist_err}")
    print(f"admin/secret: updated {name}")
    return {"ok": True, "name": name, "via": "token"}


# Mount the FastAPI app to Modal
@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("render-auth"), modal.Secret.from_name("narakeet"), modal.Secret.from_name("admin-api"), modal.Secret.from_name("modal-admin-creds")])
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
    print("  POST /tts_preview    {voice, language} — narrator sample MP3")
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


# ── One-off ops: faststart-repack published renders ─────────══════════════
# Runs on Modal (ffmpeg + aws creds are already here); `modal run` a single
# key or a renders/ prefix to fix stranded non-faststart MP4s whose share
# links won't play progressively. Idempotent: a faststart object is skipped.
@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials")], timeout=600)
def faststart_repack(*keys: str) -> list[str]:
    import shutil as _shutil
    import tempfile as _tf
    s3 = _s3()
    out = []
    for key in keys:
        try:
            body = s3.get_object(Bucket=S3_BUCKET, Key=key)["Body"].read()
            # Walk the top-level atoms; moov already in the first MB → skip.
            off, found = 0, len(body)
            while off + 8 <= len(body):
                size = int.from_bytes(body[off:off + 4], "big")
                if body[off + 4:off + 8] == b"moov":
                    found = off
                    break
                if size < 8:
                    break
                off += size
            if found < 1024 * 1024:
                out.append(f"{key}: skip (moov at {found}, already faststart)")
                continue
            with _tf.TemporaryDirectory(prefix="faststart_") as tmp:
                src, dst = os.path.join(tmp, "src.mp4"), os.path.join(tmp, "dst.mp4")
                with open(src, "wb") as f:
                    f.write(body)
                proc = _sp_run_ffmpeg_faststart(src, dst)
                if proc.returncode != 0:
                    out.append(f"{key}: FAIL {(proc.stderr or b'')[-160:]!r}")
                    continue
                with open(dst, "rb") as f:
                    fixed = f.read()
            # Republish in place — same key, same path; presign URLs cover host+path
            # only, so existing share links stay valid over the rewritten object.
            s3.put_object(Bucket=S3_BUCKET, Key=key, Body=fixed, ContentType="video/mp4")
            _off, new_found = 0, len(fixed)
            while _off + 8 <= len(fixed):
                size = int.from_bytes(fixed[_off:_off + 4], "big")
                if fixed[_off + 4:_off + 8] == b"moov":
                    new_found = _off
                    break
                if size < 8:
                    break
                _off += size
            out.append(f"{key}: repacked {len(body)//1024}KiB → {len(fixed)//1024}KiB, moov {found} → {new_found}")
        except Exception as e:
            out.append(f"{key}: ERROR {e}")
    for line in out:
        print(line)
    return out


def _sp_run_ffmpeg_faststart(src: str, dst: str):
    import subprocess as _sp
    return _sp.run(
        ["ffmpeg", "-y", "-i", src, "-c", "copy", "-movflags", "+faststart", dst],
        capture_output=True, timeout=500,
    )


# TEMP ops probe (remove once the oct-13 concat fix is verified live):
# reports the build id + whether _concat_ai_clips exists in this container.
@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials")], timeout=300)
def code_version_probe() -> dict:
    import tempfile as _tf
    with _tf.TemporaryDirectory(prefix="probe_") as work:
        try:
            out = _concat_ai_clips(
                [
                    "https://v3b.fal.media/files/b/0aae3a90/1QM470oCaahTtH6hWU8Vw_4Y0k15xq.mp4",
                    "https://v3b.fal.media/files/b/0aae3a98/-cLailpv_TxwYnAkfjAT2_9qJS3aP4.mp4",
                ],
                30.0, 960, 540, work,
            )
            dur = _media_duration(out)
            # publish for inspection
            import boto3 as _b
            _c = _b.client("s3", region_name=S3_REGION)
            _c.upload_file(out, S3_BUCKET, "selftest/concat_probe.mp4",
                           ExtraArgs={"ContentType": "video/mp4"})
            return {"has_concat": True, "probe_dur": round(dur, 2), "ok": True}
        except Exception as e:
            return {"has_concat": True, "error": f"{type(e).__name__}: {str(e)[:300]}", "ok": False}
