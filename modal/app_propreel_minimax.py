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
# Authoritative per-photo (roomType, move) → gentle walkthrough prompt table,
# generated from lib/budgetVideoPrompts.ts (single source of truth — re-run
# scripts/gen_camera_prompts_py.ts after editing that file). render_video maps
# each tagged photo to a CAMERA_PROMPTS entry; the browser sends the same text
# via the request's image_prompts field. (The generated table no longer ships
# CAMERA_NEGATIVE_PROMPT — that was wan-25's dedicated negative field, and the
# engine went with it. It was once shipped without this import at all, so any
# AI-tier render raised NameError before a single fal call went out.)
from camera_prompts import CAMERA_PROMPTS

# FlashVSR self-hosted upscaler (modal/flashvsr_endpoint.py, separate Modal app
# so its ~8 GB GPU image stays out of the render image). When enabled, PREMIUM
# generates its Hailuo clips at 768p (the top native rung) and FlashVSR
# upscales them to the 1080p delivery resolution here — Hailuo standard has
# no 1080p rung, and ~$0.0033/s of A100 time beats Hailuo Pro's $0.08/s
# native-1080p generation.
# Kill-switch: unset FLASHVSR_UPSCALE (or set it to "0") to generate at the
# tier's native resolution and skip the hop entirely.
FLASHVSR_APP = "propreel-flashvsr"
FLASHVSR_FN = "flashvsr_upscale_video"


def _flashvsr_enabled() -> bool:
    return os.environ.get("FLASHVSR_UPSCALE", "").strip().lower() in ("1", "true", "yes", "on")


# Define the Modal app
app = modal.App("propreel-render")

# Define FastAPI web app
web_app = FastAPI(title="PropReel Render API", version="2.1.0")

# Add CORS middleware
from fastapi.middleware.cors import CORSMiddleware

# Browser origins allowed to call the worker (security audit 2026-10-25, L-3).
# The auth token travels in X-PropReel-Token, never in a cookie, but the old
# allow_origins=["*"] invited ANY site to fire calls with a stolen token and
# was an invalid combination with allow_credentials=True per the CORS spec.
_ALLOWED_ORIGINS = [
    "https://www.propreel.co.za",
    "https://propreel.co.za",
    "https://propreel-xi.vercel.app",   # canonical Vercel production alias
    "http://localhost:3000",            # vite dev (npm run dev, strictPort 3000)
    "http://127.0.0.1:3000",
]


def _origin_allowed(origin: str) -> bool:
    """Strict allow-check for error responses (kept in lockstep with the
    CORSMiddleware config below). Vercel preview deployments get random
    subdomains; any localhost port is allowed for dev harnesses."""
    if not origin:
        return False
    if origin in _ALLOWED_ORIGINS:
        return True
    if origin.startswith("https://") and origin.endswith(".vercel.app"):
        return True
    for base in ("http://localhost", "http://127.0.0.1"):
        if origin == base or origin.startswith(base + ":"):
            return True
    return False


web_app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    # Anchored so `x.vercel.app.evil.com` can never match.
    allow_origin_regex=r"(https://[a-z0-9-]+\.vercel\.app|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Worker auth: every endpoint except /health and /probe requires ─────────
# X-PropReel-Token = "v1.<exp_unix>.<uid>.<base64url hmac_sha256(secret, "v1.<exp>.<uid>")>"
# minted by the PropReel Vercel API (RENDER_API_TOKEN, shared via the
# render-auth Modal secret). The browser holds only short-lived signed
# tokens, so the worker URL in the public bundle is useless to scrapers.
# If the secret is not configured every tokened endpoint FAILS CLOSED with
# 401 (security audit 2026-10-25, M-1) — only the allow-listed observability
# paths below stay reachable. A missing secret can never turn the spend
# endpoints (/render_video, /edit_image, /flashhead, /generate_text,
# /tts_preview, …) into open access; the API mints no tokens without the
# secret either, so legitimate traffic loses nothing here.
_token_header = "X-PropReel-Token"
# /admin/secret carries its own stronger gate (ADMIN_API_KEY bearer,
# constant-time compared, allow-listed secret names) — exempt it here.
# STEALTH (2026-10-27): /docs and /openapi.json are no longer exempt — the
# OpenAPI schema named every route and model to anonymous visitors.
_token_allow_paths = {"/health", "/probe", "/favicon.ico", "/admin/secret"}
_warned_no_secret = False


def _parse_token(value: Optional[str]):
    """Verify X-PropReel-Token. Returns ({version, uid, scope, exp, scriptHash?}, None)
    on success or (None, error) on failure.

    v1.<exp>.<uid>.<sig>              — generic token: status polls, cancels,
                                        cheap text generation. Free to mint.
    v2.<exp>.<uid>.<scope>.<sig>      — PAID job token (scope: render|avatar|edit|script;
                                        legacy alias: flashhead),
                                        minted by the API only after it charges
                                        credits at the price in
                                        lib/renderPricing. Required to START a job.
    v3.<exp>.<uid>.<scope>.<hash>.<sig> — PAID job token bound to the exact
                                        narration script (the avatar is priced
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
        # Fail CLOSED (security audit 2026-10-25, M-1). With no signing secret
        # every token is meaningless, so the old "anon" fallback — which made
        # every tokened endpoint open to the world — is gone. _claim_job_token
        # re-parses through here too, so the paid single-use claim is
        # fail-closed as well.
        if not _warned_no_secret:
            print("[auth] RENDER_API_TOKEN not set — worker auth is FAIL-CLOSED (all tokened endpoints reject)")
            _warned_no_secret = True
        return None, "worker auth is not configured (RENDER_API_TOKEN missing)"
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
        # Scopes are the API's job scopes — 'social_post' / 'social_pack'
        # carry an underscore, which str.isalnum() rejects: every paid social
        # caption/pack generation 401'd here AFTER the credit was charged.
        if not scope or len(scope) > 32 or not all(c.isalnum() or c == "_" for c in scope):
            return None, "unknown job scope"
        msg = f"v2.{exp_s}.{uid}.{scope}"
        version = 2
    elif len(parts) == 6 and parts[0] == "v3":
        _, exp_s, uid, scope, script_hash, sig = parts
        if not scope or len(scope) > 32 or not all(c.isalnum() or c == "_" for c in scope):
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
    # Job-kind vocabulary (2026-10-27 avatar migration): 'avatar' is
    # canonical; stale cached bundles still mint 'flashhead' tokens.
    if isinstance(scope, str) and scope.lower() == "flashhead":
        scope = "avatar"
    return {
        "version": version,
        "uid": uid,
        "scope": scope,
        "exp": exp,
        # v3 only — the 16-hex sha256 prefix of the normed narration script
        **({"scriptHash": script_hash} if version == 3 else {}),
    }, None


def _verify_paid_script_hash(info: Optional[dict], voiceover_text: str) -> None:
    """Scope avatar binds its paid token to the EXACT narration script.

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
    # Avatar jobs (2026-10-27 schema migration — the job kind was
    # "flashhead"). The canonical routes AND the deprecated aliases all
    # enforce the 'avatar' paid scope. Before the migration /avatar and
    # /generate_avatar_video were MISSING from this table entirely: the
    # middleware then demanded only a valid (free v1) token, so a tampered
    # client could start paid avatar jobs uncharged. Listed now.
    "/avatar": "avatar",
    "/generate_avatar_video": "avatar",
    "/flashhead": "avatar",
    "/generate_flashhead_video": "avatar",
    # Per-clip re-roll of a review-paused render — a real fal call, so it
    # carries its own paid single-use token (priced per tier clip-share by
    # lib/renderPricing jobCredits('rerender')). /assemble_reel is NOT here:
    # assembly was already paid by the original render charge.
    "/rerender_clip": "rerender",
}


def _cors_error_headers(request: Request) -> dict:
    """ACAO headers for middleware error responses. This middleware wraps
    CORSMiddleware, so its headers never reach these responses — mirror them
    ourselves, but ONLY for origins we allow (the old blanket "*" handed any
    site a readable error body)."""
    origin = request.headers.get("origin") or ""
    if _origin_allowed(origin):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {"Vary": "Origin"}


@web_app.middleware("http")
async def require_worker_token(request: Request, call_next):
    # OPTIONS is the CORS preflight (handled below by CORSMiddleware).
    if request.method == "OPTIONS" or request.url.path in _token_allow_paths:
        return await call_next(request)
    info, err = _parse_token(request.headers.get(_token_header))
    if err:
        return JSONResponse(status_code=401, content={"error": err}, headers=_cors_error_headers(request))
    need = JOB_ENDPOINT_SCOPE.get(request.url.path)
    # v3 tokens are v2 plus the bound script hash (per-10s narration pricing)
    # — same single-use claim, so paid-job endpoints accept both versions.
    if need and (info["version"] not in (2, 3) or info["scope"] != need):
        return JSONResponse(
            status_code=403,
            content={"error": f"paid job token required for this endpoint (scope={need})"},
            headers=_cors_error_headers(request),
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
).add_local_file(str(Path(__file__).parent / "image_prompts.py"), remote_path="/root/image_prompts.py").add_local_file(str(Path(__file__).parent / "camera_prompts.py"), remote_path="/root/camera_prompts.py")


import re as _re

_MODEL_ID_RE = _re.compile(
    r"(?i)\b(?:fal-ai|x-ai|openai|google|openrouter|minimax|anthropic|stability-ai|bria)/[A-Za-z0-9/._-]+"
    r"|\b(?:hailuo|kling|seedance|seedvr|flashhead|flashvsr|grok|gemini|gpt-4o|wan-2)[-\w.]*"
)


def _scrub_models(text: str) -> str:
    """Strip provider/model identifiers from text headed for a client.

    Error details land in user-visible toasts and /health is unauthenticated —
    model ids must never ride either (stealth rule 2026-10-27: nothing outside
    this module may reveal which providers or models run underneath)."""
    return _MODEL_ID_RE.sub("[model]", text)


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
    msg = _scrub_models(msg)
    lowered = msg.lower()
    if "Exhausted balance" in msg or "User is locked" in msg:
        return f"{context} failed: the AI service is temporarily unavailable (account balance) — please try again later."
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
            f"{context} failed: this worker is missing its media-storage "
            "credentials — media links could not be signed. Ops: attach the "
            "storage credentials secret and redeploy."
        )
    if "401" in msg or "Unauthorized" in msg:
        return "the AI service rejected our service key (401) — please contact support."
    if "403" in msg or "Forbidden" in msg:
        return f"the AI service refused the request (403): {msg[:300]}"
    if "422" in msg or "Unprocessable" in msg:
        return f"the AI service rejected the request payload (422): {msg[:300]}"
    if "429" in msg or "rate limit" in msg.lower():
        return "the AI service rate limit reached - please retry in a moment."
    if "404" in msg or "could not be found" in lowered or "no endpoints found" in lowered:
        return (
            f"{context} is temporarily unavailable — our team has been notified. "
            f"({msg[:120]})"
        )
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


def _finish_edit_job(edit_id: str, status: str, extra: dict):
    """Terminal job write that carries the live progress line forward.

    _write_job_status replaces the whole record, so a plain 'completed' write
    dropped `progress` — a poller that arrived after the render (slow poll,
    reloaded tab, a second device) saw the finished image but not the reason
    it looks the way it does ("Removal gate still sees 3 item(s): kettle")
    or that a sweep even ran. The last verdict stays attached to the result.
    """
    prior = _read_job_status(edit_id) or {}
    if prior.get("progress"):
        extra = {"progress": prior["progress"], **extra}
    _write_job_status(edit_id, status, extra)


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
    # Per-photo camera metadata from the Photos step: [{image_url, roomType,
    # move}] where move is one of in|left|right|out (out = exterior-only
    # zoom-out). The render maps (roomType, move) to one of the authoritative
    # walk-through prompts baked into camera_prompts.py; a photo with no entry
    # falls back to the built-in A/B/C deck so legacy clients keep working.
    photo_meta: Optional[List[dict]] = None
    audio: bool = False
    # Agent branding payload (Video Generator → Enhancements toggle). The
    # flag alone was never enough — the worker had nothing to draw, so the
    # toggle silently produced no overlay. Everything the renderer needs
    # rides along: photo top-left, logo top-right, contact line at the
    # bottom. use_avatar swaps the agent photo for the AI-avatar headshot.
    branding: Optional[dict] = None  # {photo_url, logo_url, contact_line, use_avatar}
    # 2026-10-23 PER-CLIP REVIEW (Option 2): when true, an AI-tier render
    # generates every clip, uploads them to OUR S3, then PAUSES at status
    # `clips_ready` with the per-clip URLs so the agent can watch each clip
    # and re-roll the bad ones (/rerender_clip) before assembling the reel
    # (/assemble_reel). Assembly (narration, music, branding) is unchanged
    # and runs exactly once — the review gate only splits the SAME paid job
    # in two, so no extra charge lands at assembly. Ignored for ESSENTIAL
    # (local FFmpeg render — no clips to review).
    review: bool = False

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

class RerenderClipRequest(BaseModel):
    """Re-roll ONE clip of a review-paused render (paid, scope=rerender).

    Regenerates the clip with the SAME prompt the original render resolved
    for that photo (stored in the job's review context) — a fresh fal call
    is a fresh seed, which is exactly the "same shot, better result" the
    agent is paying for. The clip keeps its slot; only its URL changes.
    """
    record_id: str
    clip_index: int
    # Camera-move reselection (2026-10-23): when the agent picked a
    # different move in the review panel, the FULL replacement prompt rides
    # here — same trust model as the render request's image_prompts (the
    # browser builds it from lib/budgetVideoPrompts). Absent/empty ⇒ replay
    # the clip's stored prompt byte-for-byte.
    prompt: Optional[str] = None

class AssembleReelRequest(BaseModel):
    """Finish a review-paused render: concat the CURRENT clips and run the
    full post pipeline (avatar, narration, music, branding, endcard,
    thumbnail). Free with a v1 token — the original render charge already
    paid for the finished reel; the gate is the job's `clips_ready` state,
    which only a paid render can reach."""
    record_id: str

class EditImageRequest(BaseModel):
    image_url: str
    preset_id: str
    custom_prompt: Optional[str] = None
    strength: Optional[float] = None
    guidance_scale: Optional[float] = None

# Fallback prompt deck (rotating A, B, C)
# 2026-10-21 ENGINE UNIFICATION: the cinematic A/B/C deck this replaces warped
# geometry and invented rooms (client A/B against the Budget reels), so the
# fallback deck now holds the GENTLE Budget prompts — the motion standard for
# every AI tier. Text is byte-identical to lib/budgetVideoPrompts.ts (via
# camera_prompts.py); only the deck KEYS stay A/B/C so _camera_move_deck and
# the retry-replay seeding are untouched. These fire only for photos with
# neither an image_prompts entry nor camera_prompts tags (legacy drafts,
# hand-edited payloads) — the browser sends the same gentle text for every
# tagged photo on every tier. Interior wording is the fallback default (most
# reel photos are interiors); tagged photos always get their exact
# room-appropriate prompt. All sit far under Hailuo's 2000-char ceiling.
VIDEO_PROMPTS = {
    'A': """Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, flawless staging, no clutter or personal items. The camera smoothly dollies forward and pushes into the property for a seamless first-person walking tour. Near objects grow larger as far walls draw closer, a true 3D push-in, never a flat digital zoom. The scene comes alive: inside, curtains sway gently while light patterns shift subtly across polished floors, wood, and metal; outside, leaves shift in the breeze and clouds drift slowly across the sky. No text, watermarks, logos, people, animals, or clutter.""",
    'B': """Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, flawless staging, no clutter or personal items. The camera sweeps in a wide, graceful arc to the LEFT inside the room. Near objects grow larger as far walls ease slowly , a true 3D push-in, never a flat digital zoom. The scene comes alive: inside, curtains sway gently while light patterns shift subtly across polished floors, wood, and metal; outside, leaves shift in the breeze and clouds drift slowly across the sky. No text, watermarks, logos, people, animals, or clutter.""",
    'C': """Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, flawless staging, no clutter or personal items. The camera sweeps in a wide, graceful arc to the RIGHT inside the room. Near objects grow larger as far walls ease slowly , a true 3D push-in, never a flat digital zoom. The scene comes alive: inside, curtains sway gently while light patterns shift subtly across polished floors, wood, and metal; outside, leaves shift in the breeze and clouds drift slowly across the sky. No text, watermarks, logos, people, animals, or clutter.""",
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


def _camera_move_deck(record_id: str) -> list[str]:
    """Per-render randomized camera-move deck over ZOOM (A) / LEFT (B) / RIGHT
    (C). A fresh shuffle every render, seeded by record_id so Modal retries
    replay the identical sequence; deck cycling guarantees all three moves
    appear before any repeat, and no two consecutive images ever share the
    same move — the fixed A,B,C round-robin this replaced made every render
    feel like the same preset pattern, and one Hailuo slot (3rd image, prompt
    C) regularly came back near-still."""
    import random
    return random.Random(record_id or "").sample(sorted(VIDEO_PROMPTS), 3)


# ── Premium-tier prompt set (Kling 2.6 Pro) ─────────────────────────────────
# Kling prompting practice differs from Hailuo's: the POSITIVE prompt should
# be short, carry exactly ONE camera move at its head, describe what the
# viewer sees, and explicitly preserve the source image's room (I2V's image
# already supplies the scene; big departures from it are what causes
# hallucinated geometry). Exclusions ride in the ENDPOINT's dedicated
# negative_prompt field, short and specific — not as a long in-prompt "No ...
# list", which Kling guidance says can weaken the result. Same A/B/C move
# deck (zoom-in / pan-left / pan-right) so the render-level rotation, camera
# deck seeding and merge timing stay identical across engines.
_KLING_BODY = (
    "Premium real estate walkthrough of the room shown in the image. "
    "%MOVE% "
    "Keep this exact room unchanged: every wall, window, door, cupboard, "
    "fixture, texture and colour stays exactly as pictured - the camera "
    "only travels through space already visible in the frame and never "
    "exits through a wall or the image edge. Ambient motion stays "
    "luxurious and minimal: daylight and lamp light remain constant, "
    "curtains and reflective surfaces drift almost imperceptibly, nothing "
    "else in the room moves. Calm high-end interior cinematography, "
    "stable perspective, even natural light, crisp detail throughout."
)
KLING_PROMPTS = {
    "A": _KLING_BODY.replace(
        "%MOVE%",
        "The camera performs one continuous slow dolly push-in, drifting "
        "gently deeper into the room at walking pace: foreground furniture "
        "and door frames slide wide with soft parallax as the far wall "
        "recedes."),
    "B": _KLING_BODY.replace(
        "%MOVE%",
        "The camera performs one continuous slow lateral pan left across "
        "the room, near furniture gliding past while the far walls ease "
        "slowly with soft parallax - a gliding dolly pan, never a flat "
        "swivel."),
    "C": _KLING_BODY.replace(
        "%MOVE%",
        "The camera performs one continuous slow lateral pan right across "
        "the room, near furniture gliding past while the far walls ease "
        "slowly with soft parallax - a gliding dolly pan, never a flat "
        "swivel."),
}
KLING_NEGATIVE_PROMPT = (
    "invented rooms, added objects, new furniture, changed room layout, "
    "warped walls, bent lines, distorted geometry, exiting the frame, "
    "revealing spaces beyond the image, camera drift, shaking, handheld "
    "jitter, sudden zooms, fast sweeping pans, flicker, jump cuts, blur, "
    "low quality, text, watermark, people, animals"
)


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
        doc = _json.loads(obj['Body'].read())
        # Job-kind normalization (2026-10-27 avatar migration): records
        # written before the rename carry kind "flashhead" — readers always
        # see the canonical "avatar" (history is never rewritten).
        if isinstance(doc, dict) and doc.get("kind") == "flashhead":
            doc["kind"] = "avatar"
        return doc
    except Exception:
        return None


def _edit_progress(progress_id: str | None, stage: str, label: str, **extra):
    """Publish one line of live progress for an image edit (best-effort).

    Why: engine passes (removal / staging start and end lines) used to exist
    only in container logs and in the finished image, so an agent watching
    the spinner could not tell one pass from a stalled render — a hang looked
    identical until the result landed. /edit_status already serves
    jobs/{id}.json to every poller, so the progress rides there and the
    Studio shows it while the edit runs.

    Read-merge-write on purpose: _write_job_status replaces the whole record,
    which would drop fields other writers set (kind, preset_id, the finished
    image_url). A terminal record is never reopened, and a falsy progress_id
    (synchronous ?wait=true calls, ops scripts) makes this a no-op, so the
    progress channel can never change a job's outcome.
    """
    if not progress_id:
        return None
    payload = {"stage": stage, "label": label, **extra}
    try:
        current = _read_job_status(progress_id) or {}
        if current.get("status") in ("completed", "failed", "cancelled"):
            return None
        carried = {k: v for k, v in current.items()
                   if k not in ("record_id", "status", "updatedAt", "progress")}
        _write_job_status(progress_id, "processing", {**carried, "progress": payload})
    except Exception as e:
        # A progress write must never fail a paid render.
        print(f"edit progress write skipped ({e})")
    # Returned so the caller can hand the FINAL line to _store_edit: the job
    # wrapper then puts it in the completed record from the result itself,
    # instead of depending on a fresh read of a record another container wrote.
    return payload

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
    # 2026-10-19 repriced with lib/videoTiers.ts (single source of truth):
    # R-ladder at 1 credit = R1.50, rounded up — Social 34/60/89, Cinematic
    # 47/63/95, Premium 60/80/100 (60/90s floored to the 40% margin floor
    # the same day). Keep this mirror identical to the TS copy.
    # 2026-10-21 engine unification: SOCIAL 480p → 512p, CINEMATIC 720p →
    # 768p — Hailuo-02 standard's two native rungs replace wan-25's ladder.
    "SOCIAL": {
        "processing_type": "ai",
        "resolution": "512p",
        "configurations": [
            {"duration": 30, "images": 6, "credits": 34},
            {"duration": 60, "images": 12, "credits": 60},
            {"duration": 90, "images": 18, "credits": 89}
        ]
    },
    "CINEMATIC": {
        "processing_type": "ai",
        "resolution": "768p",
        "configurations": [
            {"duration": 30, "images": 6, "credits": 47},
            {"duration": 60, "images": 12, "credits": 63},
            {"duration": 90, "images": 18, "credits": 95}
        ]
    },
    "PREMIUM": {
        "processing_type": "ai",
        "resolution": "1080p",
        "configurations": [
            {"duration": 30, "images": 6, "credits": 60},
            {"duration": 60, "images": 12, "credits": 80},
            {"duration": 90, "images": 18, "credits": 100}
        ]
    },
    # 2026-10-20: BUDGET — the gentle-motion tier, mirror of lib/videoTiers.ts
    # (20⚡ 512p / 34⚡ 768p — repriced from the 10/26 launch floor the same
    # day on the client's call). Hailuo-02 standard — since 2026-10-21 the
    # engine EVERY AI tier shares (wan-25-preview removed): one length (30s
    # from 5 photos), no voiceover and no avatar ever — the agent-facing copy
    # promises calm motion, so the per-photo prompts ride the request's
    # image_prompts payload (gentle library in lib/budgetVideoPrompts.ts) and
    # this mirror's CONFIGS each name their own fal resolution — the only
    # tier where the config, not the tier, picks 512p vs 768p. No FlashVSR
    # hop (that gate is Premium-only); assembly lands on the same 1080p
    # canvas as every AI tier.
    "BUDGET": {
        "processing_type": "ai",
        "resolution": "512p",
        "configurations": [
            {"duration": 30, "images": 6, "credits": 20, "resolution": "512p"},
            {"duration": 30, "images": 6, "credits": 34, "resolution": "768p"}
        ]
    }
}


# ── Tier-engine map (2026-10-21 ENGINE UNIFICATION): one engine everywhere ──
# wan-25-preview is gone — its reels warped geometry and invented rooms
# (client A/B against the Budget reels, 2026-10-21), so every AI tier runs
# MiniMax Hailuo-02 standard image-to-video — the Budget engine — with the
# SAME gentle per-photo prompts (lib/budgetVideoPrompts.ts). Hailuo's native
# rungs are 512p ($0.017/s) and 768p ($0.045/s): SOCIAL → 512p, CINEMATIC →
# 768p (both land on the 1920×1080 delivery canvas via the assembler's
# lanczos normalize), PREMIUM → generates 768p and the self-hosted FlashVSR
# upscaler delivers 1080p (≈$0.048/s all-in vs $0.08/s for native-1080p
# Hailuo Pro; kill-switch FLASHVSR_UPSCALE ships 768p content on the 1080p
# canvas). ESSENTIAL stays pure-FFmpeg (no engine). KLING26 is retained as
# the dormant alternate engine (native 1080p; 5s/10s clips only, which is
# why the assembler's stretch flag names it) in case Premium ever needs a
# different flagship family again.
ENG_HAILUO = "hailuo-02-standard"
ENG_KLING26 = "kling-26-pro"
TIER_VIDEO_ENGINE = {
    "SOCIAL": ENG_HAILUO,
    "CINEMATIC": ENG_HAILUO,
    "PREMIUM": ENG_HAILUO,
    # BUDGET: the gentle-motion rung that (2026-10-21) became the motion
    # standard for the whole catalog — same engine, priced below Social.
    "BUDGET": ENG_HAILUO,
}
KLING_MODEL = "fal-ai/kling-video/v2.6/pro/image-to-video"      # $0.07/s, native 1080p (dormant)
HAILUO_MODEL = "fal-ai/minimax/hailuo-02/standard/image-to-video"  # $0.017/s @ 512P, $0.045/s @ 768P

@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials"), modal.Secret.from_name("bria-credentials")], timeout=600, retries=2, min_containers=0, max_containers=200, scaledown_window=300)
def generate_ai_video_clip(spec: tuple) -> str:
    """
    Generate a 6-second AI video clip using fal-ai/minimax/hailuo-02

    Args (one tuple per clip — Modal .map fans these out one container each):
        spec: (image_url, prompt, resolution, duration, engine) —
              image_url: URL of the source image,
              prompt: Video generation prompt (Hailuo clips past 2000 chars;
                     Kling has no limit),
              resolution: Target resolution (512p/768p Hailuo — the engine now
                     serving EVERY AI tier; 1080p Kling native),
              duration: Duration in seconds (default 6; Kling: 5 or 10),
              engine: ENG_HAILUO (default) or ENG_KLING26 — picks the fal model
              (Kling's i2v aspect follows the input image — no aspect arg)

    Returns:
        URL of the generated video clip
    """
    import fal_client

    parts = list(spec)
    image_url, prompt, resolution, duration = (parts + ["768p", 6, ENG_HAILUO])[:4]
    engine = parts[4] if len(parts) > 4 else ENG_HAILUO
    duration = int(duration)

    # Hailuo silently clips prompts past 2000 chars (the negatives ride at the
    # tail, so a clipped prompt loses its negative block). Kling gets the
    # prompt verbatim. The gentle per-photo prompts (lib/budgetVideoPrompts.ts
    # via camera_prompts.py / image_prompts) all sit well under the ceiling.
    if engine == ENG_HAILUO and len(prompt) > 2000:
        prompt = prompt[:2000]

    print(f"Generating AI video clip: {engine}, {resolution}, {duration}s")

    if engine == ENG_KLING26:
        # Kling 2.6 Pro image-to-video (PREMIUM): fal's documented schema for
        # this endpoint is prompt + start_image_url (REQUIRED), with optional
        # duration ("5"/"10"), negative_prompt and generate_audio. There is
        # NO image_url, resolution or aspect_ratio field on the i2v route
        # (the aspect follows the input image) — sending them would 422 the
        # whole Premium render.
        model = KLING_MODEL
        fal_arguments = {
            # Private buckets: fal.ai downloads the frame itself, so it needs
            # a signature (raw object URLs now 403).
            "prompt": prompt,
            "start_image_url": presign_media(image_url),
            "duration": "5" if duration <= 5 else "10",
            # Negatives go in the endpoint's DEDICATED field, kept short and
            # specific per Kling prompting guidance — long "No ..." lists
            # inside the positive prompt can weaken Kling's result.
            "negative_prompt": KLING_NEGATIVE_PROMPT,
            # Ambient audio is real money per second and both AI tiers are
            # silent (music/VO are mixed in at assembly) — audio OFF.
            "generate_audio": False,
        }
    else:
        # Hailuo-02 standard — the engine for EVERY AI tier since the
        # 2026-10-21 unification (SOCIAL 512p, CINEMATIC 768p, PREMIUM 768p
        # gen → FlashVSR 1080p, BUDGET 512p/768p per config).
        model = HAILUO_MODEL
        fal_arguments = {
            "image_url": presign_media(image_url),
            "prompt": prompt,
            "num_frames": duration * 24,  # 24 fps
            # fal.ai expects "512P" or "768P" — Hailuo standard has NO 1080p
            # rung (Premium's 1080p delivery is FlashVSR's job; never pass a
            # 1080p resolution here).
            "resolution": "768P" if resolution not in ("512p", "512P") else "512P",
            "audio": False  # Audio OFF as requested
        }
    
    # Use fal_client.submit() for long-running tasks with polling
    handler = fal_client.submit(
        model,
        arguments=fal_arguments
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


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials")], timeout=900, retries=2)
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
#
# Amplitude: the first pass used ~10–13% zoom, which over a still frame reads
# as "the video hardly moves" (agent-reported). 2026-10-25: bands pushed to
# the EXTREME end per request — every style now traverses its whole band
# INSIDE one clip (ztravel/frames, not the old shared 0.09/frames which
# never reached its own cap), and the bands run 1.0 → 1.35. The lateral pan
# still sweeps edge-to-edge (that is its physical maximum — beyond it
# zoompan would expose black), but at 1.30 zoom the sweep covers ~23% more
# frame width per clip than the old 1.09 endpoint, so it reads visibly
# faster. Smoothness is unchanged: the 4x master keeps integer snapping at
# ±0.25 output px regardless of travel speed.
ESSENTIAL_MOTION_STYLES = [
    # A — fastest push-in from center: full 1.00 → 1.35 within the clip
    {"id": "A", "zoom": "min(zoom+{zrate},1.35)", "ztravel": 0.35,
     "x": "iw/2-(iw/zoom/2)", "y": "ih/2-(ih/zoom/2)"},
    # B — fastest REAL left-to-right pan: window sweeps the full frame width
    # (edge-to-edge = max travel) while zooming to 1.30 in the same clip
    {"id": "B", "zoom": "min(zoom+{zrate},1.30)", "ztravel": 0.30,
     # start at the frame's left edge, travel to its right edge over the clip
     "x": "(iw-iw/zoom)*on/({frames}-1)", "y": "ih/2-(ih/zoom/2)"},
    # C — fastest pull-back reveal: strongest zoom-out band (1.35 → 1.00,
    # explicit interpolation reaches 1.00 exactly) with the full
    # top-to-bottom tilt in the same clip.
    {"id": "C", "zoom": "if(eq(on,1),1.35,max(1.35-0.35*(on-1)/({frames}-1),1.0))",
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
    The image is cover-cropped to the canvas and upscaled to a 4x master so
    zoompan's integer sample window moves in sub-pixel steps at output size —
    see the note on the scale filter below."""
    import subprocess as _sp
    frames = max(int(round(seconds * fps)), 2)
    # Per-style zoom travel: rate = travel/frames so each style completes its
    # ENTIRE zoom band within this clip (extreme-motion pass 2026-10-25).
    zrate = float(style.get("ztravel", 0.35)) / frames
    style_fmt = {
        "id": style["id"],
        "zoom": style["zoom"].format(zrate=f"{zrate:.6f}", frames=frames),
        # The pan styles track on/frames-1 explicitly — a uniform velocity
        # sweep over the frame, not a curve.
        "x": style["x"].format(frames=frames) if "{frames}" in style["x"] else style["x"],
        "y": style["y"].format(frames=frames) if "{frames}" in style["y"] else style["y"],
    }
    vf = (
        # 4x master, output still s={width}x{height}. zoompan snaps its
        # sample window to INTEGER input pixels: on a 1x master a slow pan
        # degenerates into a sawtooth — the measured trace on a shipped
        # render drifted +0.36px/frame and snapped back -1.6px every ~6
        # frames (net ~0: the frame wobbles in place, agent-reported
        # "very shaky" 2026-10-16). That regression arrived with the
        # 2026-10-15 removal of the pre-upscale. On a 4x master the same
        # integer rounding is ±0.25 OUTPUT px — sub-perceptual. Framing
        # does NOT change: at z=1.0 zoompan's window is the whole master
        # (iw/zoom × ih/zoom), so the full photo — including the portrait
        # pillarbox bars — fills the frame exactly as before; the style
        # bands still run z 1.0 → ≤1.35.
        f"scale={width * 4}:{height * 4}:force_original_aspect_ratio=increase,crop={width * 4}:{height * 4},"
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

def _branding_geometry(width: int, height: int) -> dict:
    """ONE scale source for every burned-in branding element.

    Card (running overlay), end card and avatar overlay all derive their
    geometry from this dict — a future design tweak edits it here and all
    three stay in lockstep; nothing downstream may inline its own
    ``… * scale`` formula again (that duplication is what let the portrait
    canvas grow card text 1.78x and the avatar disc 78% oversized while
    landscape looked perfect).

    Scale derives from the SHORTER side against the 1080p reference design
    (photo Ø150, ring 5, margin 36, bar 96 / font 40, headshot Ø360, logo
    230, bar 200); the avatar keeps its own design size (~1.3x the static
    disc), even-rounded, because yuv420p cannot carry odd dims and the
    alphamerge mask must match the scaled frame exactly. Returns every
    element's pixel size at scale.
    """
    scale = min(width, height) / 1080.0
    # Card disc / logo by orientation — every value here was measured on
    # DELIVERED frames, never guessed. Third pass (2026-10-15): the agent
    # cropped its own renders and counted pixels against a grid.
    #   * Landscape disc Ø150 + ring = 161px outer = 14.9% of frame height
    #     — signed off, unchanged.
    #   * The logo was the real offender: at 108/150 it measured ~110px and
    #     read as a postage stamp, because the fitted tile was mostly dead
    #     space (see _trim_logo_padding — only ~30% of the agent's own logo
    #     art is the mark). It is now 200 AFTER the trim, so the fitted
    #     height means the artwork's height, not the file's.
    #   * Portrait grew the disc again (150 -> 250, ~23% of the 1080-wide
    #     canvas) — it read small next to the tall frame even after the
    #     second pass.
    # Fourth pass (2026-10-15, agent-supplied reference frames): 200 was still
    # ~15% under the mark in those frames, so the mark was measured off the
    # frames themselves — plate edges at 16..146px in the portrait frame
    # (scale 0.563, so 233 design) and 30..252px in the landscape one
    # (scale 0.998, so 223 design), with a colour-similarity flood fill
    # (200x131) and a blue-bias density box (203x128) landing inside the same
    # band on the portrait frame. The two frames disagree by ~4%, so this
    # takes the middle: 230 design = 21.3% of the frame's SHORT side, against
    # the 18.5% (200/1080) that read as "still too small". The photo disc and
    # the avatar are deliberately untouched — both already match the frames.
    portrait = height > width
    card_photo_design = 250 if portrait else 150
    # Corner-mark size (2026-10-16, client spec): the mark was measured at
    # ~33% of frame width / ~26% of frame height and read as oversized, so it
    # is now capped by an explicit WIDTH budget instead of only the free row
    # width. 340 design px = 17.7% of the 1920-wide 1080p frame; the tile is
    # capped at that width AND at 199 design px tall (18.5% of frame height)
    # with the pair scaling together inside _fit_logo_tile, so a wide mark
    # shrinks in height to stay inside 340 and is never distorted.
    card_logo_design = 230
    card_logo_max_design_w = 340
    # The avatar corner is deliberately NOT tied to the card disc any more:
    # its size was tuned (and reported as correct) independently, so growing
    # the static photo must not silently resize the talking head.
    avatar_photo_design = 190
    avatar_side = max(64, int(avatar_photo_design * scale * 1.3) & ~1)
    margin = int(36 * scale)
    card_ring = max(3, int(5 * scale))
    card_photo_d = int(card_photo_design * scale)
    logo_gap = int(24 * scale)
    avatar_ring = max(3, int(5 * scale))
    avatar_outer = avatar_side + 2 * avatar_ring
    # Width cap for the corner mark — DERIVED from the space that actually
    # exists in the top row, not a fixed share of the frame. Fifth pass
    # (2026-10-15): the flat "40% of the frame width" cap (432 px at 1080
    # wide) shrank every mark wider than 1.9:1 in PORTRAIT while the rest of
    # the row sat empty — the top-left occupant only reaches ~292 px there,
    # so ~730 px of the row is free and a 2.5:1 agency mark was capped to
    # 432x176 instead of rendering at its full 230 design height. The cap is
    # now "from the widest top-left occupant to the right margin, minus one
    # clearance gap", so a wide mark keeps its full height in BOTH
    # orientations for as long as the row can physically hold it (at 1080p:
    # portrait marks up to ~3.2:1 = 728 px beside the Ø250 disc, landscape up
    # to ~6.8:1 = 1568 px). Past that the mark is limited by the photo —
    # never by a percentage of the frame — and _fit_logo_tile still scales
    # width and height down together, so it is never distorted.
    #
    # The occupant is the WIDER of the two possible corner elements: the
    # card's photo disc (its ring included) or the avatar overlay video, which
    # replaces the disc when that add-on is on and is drawn into the same
    # corner by _apply_avatar_overlay at this same margin.
    corner_occupant_r = margin + max(card_photo_d + card_ring, avatar_outer)
    row_room_w = max(1, width - margin - corner_occupant_r - logo_gap)
    # Cap by BOTH the free row width (a mark must never collide with the
    # top-left disc/avatar) and the client's 340-design-px width budget.
    card_logo_max_w = max(1, min(row_room_w, int(card_logo_max_design_w * scale)))
    # Inset from the TOP and RIGHT edges so the mark reads as placed, not
    # glued to the frame. 2026-10-18: the logo was hard-flush (1px) by an
    # earlier spec and the agent reported it "too close to the boundaries",
    # while the photo disc it sits beside already honours the 36px design
    # margin. It now uses a real inset (16 design px ≈ 15% of the margin, so
    # it clearly clears the edge WITHOUT growing the dead top row enough to
    # crowd the disc beside it). The left/bottom clearance to the disc is
    # still enforced by logo_gap, so this cannot cause a collision.
    card_logo_inset_design = 16
    card_logo_top = max(2, int(card_logo_inset_design * scale))
    card_logo_right_gap = max(2, int(card_logo_inset_design * scale))
    return {
        "scale": scale,
        "margin": margin,
        "card_photo_d": card_photo_d,
        "card_ring": card_ring,
        "card_logo_h": int(card_logo_design * scale),
        "card_logo_max_w": card_logo_max_w,
        "card_logo_top": card_logo_top,
        "card_logo_right_gap": card_logo_right_gap,
        "card_bar_h": int(96 * scale),
        "card_font": int(40 * scale),
        # Longest contact lines must still fit a ~1080-wide portrait bar
        # (the font-shrink loop floor — text fits before it clips).
        "font_floor": max(10, int(14 * scale)),
        "end_photo_d": int(360 * scale),
        "end_ring": max(4, int(9 * scale)),
        # End-card logo tracks the running card's bigger mark so the brand
        # mark is the same size class on the closing frame — the same 0.95
        # ratio it has always carried (190/200), against the new 230.
        "end_logo_h": int(219 * scale),
        "end_bar_h": int(200 * scale),
        "end_name_size": int(64 * scale),
        "end_font": int(48 * scale),
        "logo_gap": logo_gap,                 # logo/headshot spacing
        "end_line_gap": int(40 * scale),      # headshot/logo -> name line
        "end_line_step": int(20 * scale),     # name line -> contact line
        "avatar_ring": avatar_ring,
        "avatar_side": avatar_side,
        "avatar_outer": avatar_outer,
        "avatar_margin": max(8, int(36 * scale)),
    }


def _trim_logo_padding(img, pad_frac: float = 0.04):
    """Crop to the mark's content box, then give it an EVEN margin of air.

    Two defects this replaces, both measured on the agent's own logo
    (8192x5113 JPEG, dark textured plate) on 2026-10-15:

    1. ASYMMETRIC crop. The old rule asked each row/column whether its
       luminance VARIANCE cleared 6.0, and a leather-textured, vignetted
       background clears that on one side and not the other, so it cut
       1367px off the RIGHT of this logo and 0px off the left. The tile it
       handed back therefore carried a 65px dead strip on its left and
       pushed the wordmark flush against its right edge — measured on the
       delivered card: gold pixels end at x=1884 of 1920, i.e. exactly the
       36px frame margin, with 65px of nothing to their left. That is "the
       words are cut off and not centered".
    2. FLUSH mark. Even a correct crop-to-content leaves the artwork
       touching all four tile edges, so the last glyph sits hard against
       the frame margin with no air.

    So detect content by distance from the BACKGROUND instead of by
    variance: background = median of the outer border ring, threshold
    scaled from the image's own luminance span and floored above the
    ring's texture. On the reference logo that gives 67 against a
    background that only wanders 38 and art sitting 197 above it, returning
    the true box (1368,425,6822,4835) symmetric to within 2px. Then keep
    `pad_frac` of the box as margin: if every side already has that much
    real padding the result is a pure crop (real pixels, so it cannot seam);
    if a side is short — a mark flush to its own file edge — the deficit is
    filled from THAT side's own neighbouring colour, so a top-to-bottom
    gradient in the plate continues rather than showing a flat band.

    Conservative on purpose: never removes more than 45% from one side,
    never leaves less than 25% of a dimension, skips tiny images, and hands
    back the original untouched whenever it cannot read a confident box — so
    an unusual logo degrades to today's behaviour rather than worse.
    Real transparency (PNG alpha) is exact and preferred when present.
    """
    from PIL import Image

    try:
        if img.width < 40 or img.height < 40:
            return img
        if img.mode in ("RGBA", "LA"):
            rgba = img.convert("RGBA")
            bbox = rgba.getchannel("A").getbbox()
            if bbox and (bbox[2] - bbox[0]) >= img.width * 0.25 and (bbox[3] - bbox[1]) >= img.height * 0.25:
                # Real transparency: the alpha box IS the artwork, so crop to
                # it. An image opaque everywhere (a JPEG re-saved as PNG) keeps
                # its full box and falls through to the luminance path below,
                # which is the case that mattered here.
                if (bbox[2] - bbox[0]) < img.width or (bbox[3] - bbox[1]) < img.height:
                    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
                    pad = max(2, int(round(pad_frac * max(cw, ch))))
                    out = Image.new("RGBA", (cw + 2 * pad, ch + 2 * pad), (0, 0, 0, 0))
                    out.alpha_composite(rgba.crop(bbox), (pad, pad))
                    return out

        import numpy as np
        rgba = np.asarray(img.convert("RGBA"), dtype=np.float32)
        lum = rgba[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        opaque = rgba[..., 3] >= 128
        img_h, img_w = lum.shape
        ring = max(1, min(img_h, img_w) // 40)
        border = np.concatenate((lum[:ring].ravel(), lum[-ring:].ravel(),
                                 lum[:, :ring].ravel(), lum[:, -ring:].ravel()))
        bg = float(np.median(border))
        # Percentile 75, NOT 99. When a mark runs right up to the file edge
        # — the flush case this function exists to repair — the ring holds
        # art as well as background, and a high percentile reads that art as
        # "background texture", inflates the threshold past the mark itself,
        # and the whole trim silently falls back to the original. p75 stays
        # inside the background for a ring that is mostly background (77%
        # on the flush fixture) while still clearing real texture.
        bg_texture = float(np.percentile(np.abs(border - bg), 75)) * 2.0
        span = float(np.percentile(lum, 99.5)) - float(np.percentile(lum, 0.5))
        # Must clear the background's own wander (38 on the reference logo)
        # and stay far under the art (197 above bg): span*0.30 = 67.
        thr = max(30.0, span * 0.30, bg_texture)
        content = (np.abs(lum - bg) >= thr) & opaque
        rows = np.flatnonzero(content.any(axis=1))
        cols = np.flatnonzero(content.any(axis=0))
        if rows.size == 0 or cols.size == 0:
            return img
        top, bottom = int(rows[0]), int(rows[-1]) + 1
        left, right = int(cols[0]), int(cols[-1]) + 1
        if top > img.height * 0.45 or (img.height - bottom) > img.height * 0.45:
            return img
        if left > img.width * 0.45 or (img.width - right) > img.width * 0.45:
            return img
        if (bottom - top) < img.height * 0.25 or (right - left) < img.width * 0.25:
            return img
        if (top, left, bottom, right) == (0, 0, img.height, img.width):
            return img

        cw, ch = right - left, bottom - top
        target = max(2, int(round(pad_frac * max(cw, ch))))
        room = min(left, top, img.width - right, img.height - bottom)
        if room >= target:
            # Every side already carries more padding than we want: keep
            # exactly `target` of the REAL pixels on all four sides, so the
            # margin is symmetric by construction and cannot seam.
            return img.crop((left - target, top - target, right + target, bottom + target))

        # A side is flush to its own file edge (room < target): crop to the
        # content and extend each side from ITS OWN neighbouring colour.
        band = max(1, min(cw, ch) // 25)

        def _side_colour(y0, y1, x0, x1, fallback):
            blk = rgba[y0:y1, x0:x1, :3].reshape(-1, 3)
            return np.median(blk, axis=0) if blk.size else fallback

        ring_c = np.median(rgba[np.r_[:ring, -ring:], :, :3].reshape(-1, 3), axis=0)
        top_c = _side_colour(max(0, top - band), top, left, right, ring_c)
        bot_c = _side_colour(bottom, min(img_h, bottom + band), left, right, ring_c)
        left_c = _side_colour(top, bottom, max(0, left - band), left, ring_c)
        right_c = _side_colour(top, bottom, right, min(img_w, right + band), ring_c)

        out = np.zeros((ch + 2 * target, cw + 2 * target, 4), dtype=np.uint8)
        out[..., 3] = 255
        out[:target, target:target + cw, :3] = top_c.astype(np.uint8)
        out[target + ch:, target:target + cw, :3] = bot_c.astype(np.uint8)
        out[target:target + ch, :target, :3] = left_c.astype(np.uint8)
        out[target:target + ch, target + cw:, :3] = right_c.astype(np.uint8)
        for cy in (slice(None, target), slice(target + ch, None)):
            for cx in (slice(None, target), slice(target + cw, None)):
                ysrc = top_c if cy.start in (None, 0) else bot_c
                xsrc = left_c if cx.start in (None, 0) else right_c
                out[cy, cx, :3] = np.mean([ysrc, xsrc], axis=0).astype(np.uint8)
        out[target:target + ch, target:target + cw] = rgba[top:bottom, left:right].astype(np.uint8)
        return Image.fromarray(out, "RGBA")
    except Exception as te:
        print(f"logo padding trim skipped: {te}")
        return img


def _fit_logo_tile(img, target_h: int, max_w: int):
    """Trim dead border, then fit the mark to target_h WITHOUT distortion.

    One implementation for the running overlay card and the end card — the
    end card used to clamp width while forcing height, which squashed wide
    marks. ``max_w`` is each caller's own discipline (the free space next to
    the top-left photo for the corner mark — see ``card_logo_max_w`` — and 80%
    of the frame for the centred end-card mark); when it binds, width AND
    height scale down together so the mark is never distorted.
    """
    from PIL import Image  # function-local, like the rest of this module

    logo = _trim_logo_padding(img)
    target_h = max(24, int(target_h))
    w = max(1, int(round(logo.width * target_h / max(logo.height, 1))))
    if w > max_w > 0:
        return logo.resize((max_w, max(1, int(round(target_h * max_w / w)))), Image.LANCZOS)
    return logo.resize((w, target_h), Image.LANCZOS)


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

    # Single geometry source shared with the end card and the avatar
    # overlay (see _branding_geometry) — they can no longer drift apart.
    g = _branding_geometry(width, height)
    scale = g["scale"]
    margin = g["margin"]
    photo_d = g["card_photo_d"]
    ring = g["card_ring"]
    logo_h = g["card_logo_h"]
    logo_max_w = g["card_logo_max_w"]
    bar_h = g["card_bar_h"]
    font_size = g["card_font"]
    font_floor = g["font_floor"]

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

    # 2) Agency logo — top-right, fitted height (after trimming dead padding).
    logo_url = (branding or {}).get("logo_url")
    logo_fetched = False
    if logo_url:
        try:
            from io import BytesIO
            logo = Image.open(BytesIO(fetch_media(logo_url, timeout=60))).convert("RGBA")
            # Width cap = min(free row width, 340 design px budget). It is
            # still derived from the photo disc / avatar beside it so a mark
            # can never collide with them, and _fit_logo_tile scales width
            # and height down together, so nothing is squashed.
            logo = _fit_logo_tile(logo, logo_h, logo_max_w)
            # Inset from the top/right edges (2026-10-18: was flush at 1px —
            # the agent reported it crowding the frame boundary). The inset
            # scales with the frame via card_logo_top/right_gap above.
            logo_x = width - g["card_logo_right_gap"] - logo.width
            logo_y = g["card_logo_top"]
            canvas.alpha_composite(logo, (logo_x, logo_y))
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
        # font — the unreadable-render root cause. Portrait floors the
        # shrink LOWER (14pt at 1080): long contact lines must still fit
        # the ~1000px-wide portrait bar instead of clipping at the frame.
        MIN_SCALE = 0.55
        floor_size = font_floor
        while font is not None and tw > max_w and font_size > floor_size:
            font_size = max(int(font_size * 0.9), floor_size)
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


def _branding_end_card_path(
    branding: dict,
    width: int,
    height: int,
    work_dir: str,
) -> str | None:
    """Full-frame branding END CARD (the conclusion page agents asked for).

    Layout (like the reference submit): dark gradient backdrop, agent photo
    LARGE and centered, agency logo beneath, agent name + contact line on a
    solid bottom bar. Composed with Pillow from the SAME branding payload the
    overlay card already uses — no new client fields, no extra round-trip.
    Returns the PNG path; the caller turns it into a video segment timed like
    any other clip and prepends/appends it in the assembly chain.
    """
    from PIL import Image, ImageDraw, ImageFont

    # Same single geometry source as the overlay card (portrait fix).
    g = _branding_geometry(width, height)
    scale = g["scale"]
    margin = g["margin"]
    photo_d = g["end_photo_d"]   # big centered headshot
    ring = g["end_ring"]
    logo_h = g["end_logo_h"]
    bar_h = g["end_bar_h"]
    name_size = g["end_name_size"]
    font_size = g["end_font"]
    font_floor = g["font_floor"]
    logo_gap = g["logo_gap"]
    line_y_gap = g["end_line_gap"]
    line_y_step = g["end_line_step"]

    photo_url = str((branding or {}).get("photo_url") or "").strip() or None
    logo_url = str((branding or {}).get("logo_url") or "").strip() or None
    contact = str((branding or {}).get("contact_line") or "").strip()
    name = contact.split(' \u00b7 ')[0].strip() if contact else None
    contact2 = ' \u00b7 '.join(contact.split(' \u00b7 ')[1:]) if contact and ' \u00b7 ' in contact else contact
    if not (photo_url or logo_url or name or contact2):
        return None

    # Vertical gradient backdrop: deep ink → near-black, subtle vignette feel
    top_c, bottom_c = (16, 10, 34, 255), (6, 4, 14, 255)
    canvas = Image.new("RGBA", (width, height), top_c)
    draw = ImageDraw.Draw(canvas)
    steps = 64
    for i in range(steps):
        t = i / (steps - 1)
        c = tuple(int(top_c[k] + (bottom_c[k] - top_c[k]) * t) for k in range(3)) + (255,)
        y0 = int(height * 0.52 * i / steps)
        y1 = int(height * 0.52 * (i + 1) / steps)
        draw.rectangle((0, y0, width, y1), fill=c)

    def _ttf(px):
        try:
            return ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", px)
        except Exception:
            return ImageFont.load_default()

    y = int(height * 0.22)
    # Photo — centered in a white ring
    if photo_url:
        try:
            from io import BytesIO
            img = Image.open(BytesIO(fetch_media(photo_url, timeout=60))).convert("RGBA")
            side = max(img.width, img.height)
            left, top = (img.width - side) // 2, (img.height - side) // 2
            img = img.crop((left, top, left + side, top + side)).resize((photo_d, photo_d), Image.LANCZOS)
            mask = Image.new("L", (photo_d, photo_d), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, photo_d - 1, photo_d - 1), fill=255)
            ring_img = Image.new("RGBA", (photo_d + 2 * ring, photo_d + 2 * ring), (0, 0, 0, 0))
            ImageDraw.Draw(ring_img).ellipse((0, 0, photo_d + 2 * ring - 1, photo_d + 2 * ring - 1), fill=(255, 255, 255, 240))
            cx = (width - ring_img.width) // 2
            canvas.alpha_composite(ring_img, (cx, y))
            canvas.paste(img, (cx + ring, y + ring), mask)
            y += ring_img.height
        except Exception as pe:
            print(f"end-card photo fetch failed (skipped): {pe}")

    # Logo — centered beneath the photo. Same trim+fit as the overlay card,
    # so the end card's mark matches the mark that ran over the reel (it used
    # to clamp width while forcing height, which squashed wide wordmarks).
    if logo_url:
        try:
            from io import BytesIO
            logo = Image.open(BytesIO(fetch_media(logo_url, timeout=60))).convert("RGBA")
            logo = _fit_logo_tile(logo, logo_h, max(1, int(width * 0.8)))
            canvas.alpha_composite(logo, ((width - logo.width) // 2, y + logo_gap))
            y += logo.height + logo_gap
        except Exception as le:
            print(f"end-card logo fetch failed (skipped): {le}")

    # Name + contact — one line each, centered, above the solid bottom bar
    def _fit(text, px):
        f = _ttf(px)
        b = draw.textbbox((0, 0), text, font=f)
        # Shrink further than the old 24pt floor — long contact lines must
        # stay inside the canvas on portrait (they clipped at both edges).
        while b[2] - b[0] > width - 2 * margin and px > font_floor:
            px = int(px * 0.92)
            f = _ttf(px)
            b = draw.textbbox((0, 0), text, font=f)
        return f, b
    line_y = y + line_y_gap
    if name:
        f, b = _fit(name, name_size)
        draw.text(((width - (b[2] - b[0])) // 2, line_y), name, font=f, fill=(255, 255, 255, 250))
        line_y += (b[3] - b[1]) + line_y_step
    if contact2:
        f, b = _fit(contact2, font_size)
        draw.text(((width - (b[2] - b[0])) // 2, line_y), contact2, font=f, fill=(196, 190, 220, 235))

    # Solid bottom bar (like the runtime overlay card, but thicker on the card)
    if contact:
        draw.rectangle((0, height - bar_h, width, height), fill=(8, 6, 18, 210))
        f, b = _fit(contact, font_size)
        th = b[3] - b[1]
        draw.text(((width - (b[2] - b[0])) // 2, height - bar_h + (bar_h - th) // 2 - b[1]),
                  contact, font=f, fill=(255, 255, 255, 245))

    out = os.path.join(work_dir, f"endcard_{width}x{height}.png")
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
    stretch_short_clips: bool = False,
) -> str:
    """Normalize every fal clip to the tier canvas and assemble the FULL reel.

    The old path shipped video_clips[0] — a ~1.9s 512p fal clip with the
    rest of the 3x-credit tier duration freeze-extended behind it ("stuck on
    the first image"), and no branding/avatar card could align on the off-
    canvas resolution. This stage:
      1. downloads each fal clip (they were paid for — always use them),
      2. pad/scales each to exactly width×height with LANCZOS (portrait
         canvases get contain+pad for portrait sources, landscape sources
         cover-crop; the flag matters because FlashVSR clips are being
         resampled 1.5× up to the 1080p delivery canvas),
      3. stretches each clip over an EVEN share of the tier duration
         (setpts+tpad clone-freeze the clip's motion frame tail, not none),
      4. stream-copy concats the uniform segments + faststart.

    stretch_short_clips (Premium/Kling): a 5s clip carrying a 6s share of
    the reel must fill its slot WITHOUT the stream-loop replay seam.
    When enabled, source clips SHORTER than their share are slow-stretched
    (setpts) to exactly the share first — a slow cinematic pan re-timed to
    ~0.83× reads as continuous motion; a mid-shot backwards loop does not.
    Longer sources stay on the loop/cut path (no change).
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
        # stretch_short_clips: probe the source's real length first; when it
        # SHORTER than its share, re-time it to exactly the share instead of
        # loop-replaying (which pastes a mid-shot seam). Probe failure
        # degrades to the historic loop path — never fatal.
        stretch = 1.0
        if stretch_short_clips:
            try:
                src_dur = _media_duration(raw_path)
                if src_dur and 0 < src_dur < seg_dur - 0.05:
                    stretch = seg_dur / src_dur
            except Exception as pe:
                print(f"segment {i + 1}: duration probe failed ({pe}) — loop path")
        retime = f"setpts=PTS*{stretch:.6f}," if stretch != 1.0 else ""
        # Portrait canvas: contain + pad (never amputate a vertical shot).
        # Landscape canvas: cover-crop, same convention as the Essential tier.
        if height > width:
            vf = (f"scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,"
                  f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
                  f"{retime}fps=24,format=yuv420p")
        else:
            vf = (f"scale={width}:{height}:force_original_aspect_ratio=increase:flags=lanczos,"
                  f"crop={width}:{height},{retime}fps=24,format=yuv420p")
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


def _append_branding_endcard(
    assembled_path: str,
    branding: dict | None,
    width: int,
    height: int,
    work: str,
    card_seconds: float = 3.0,
) -> str:
    """Append a full-frame branding END CARD as the final segment.

    The agent-facing ask (Oct-13): end every AI-tier reel like the reference
    video — a closing page with the agent's photo/logo/contact. The card is
    composed from the SAME branding payload (no new client fields), scaled
    to the tier canvas, and stream-copy concatenated behind the assembled
    reel. Cosmetic: any failure returns the input UNCHANGED — a render must
    never fail because its outro card could not be drawn.
    """
    if not branding:
        return assembled_path
    try:
        card_png = _branding_end_card_path(branding, width, height, work)
        if not card_png:
            return assembled_path
        import subprocess as _sp
        card_seg = os.path.join(work, "endcard.mp4")
        proc = _sp.run(
            ["ffmpeg", "-y", "-loop", "1", "-i", card_png,
             "-t", f"{card_seconds:.3f}", "-an",
             "-c:v", "libx264", "-preset", "medium", "-crf", "19",
             "-pix_fmt", "yuv420p", "-r", "24", card_seg],
            capture_output=True, timeout=120,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"endcard segment failed: {(proc.stderr or b'')[-200:]}")
        with_outro = os.path.join(work, "with_outro.mp4")
        concat_list = os.path.join(work, "outro_list.txt")
        with open(concat_list, "w") as f:
            f.write(f"file '{assembled_path}'\nfile '{card_seg}'\n")
        proc = _sp.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
             "-c", "copy", "-movflags", "+faststart", with_outro],
            capture_output=True, timeout=300,
        )
        if proc.returncode != 0:
            # any codec drift between segments → re-encode concat
            proc = _sp.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
                 "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                 "-pix_fmt", "yuv420p", "-movflags", "+faststart", with_outro],
                capture_output=True, timeout=600,
            )
            if proc.returncode != 0:
                raise RuntimeError(f"outro concat failed: {(proc.stderr or b'')[-200:]}")
        print(f"Branding end card appended (+{card_seconds:.1f}s)")
        try:
            os.unlink(card_png)
        except Exception:
            pass
        return with_outro
    except Exception as oe:
        print(f"end card skipped (shipping without outro): {oe}")
        return assembled_path


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
    "en-ZA": ["aletta", "charlize", "hilda", "riaan", "joanna", "sarah", "brian", "zach"],
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
                   music_url: str | None = None, music_volume: float = 0.22,
                   fill_overrun: str = "freeze") -> float:
    """One ffmpeg pass: narration + optional music bed over a silent render.

    If the narration runs longer than the video (AI-tier clips are 6 s while
    scripts target 30 s+), the overrun must be filled somehow so the
    voiceover is never cut off. Two modes:

      "freeze"  (default — ESSENTIAL tier's historic behaviour, unchanged):
                clone the last frame (tpad=stop_mode=clone) past the end.
      "stretch" (AI tiers): re-time the whole reel (setpts) up to the
                narration length instead, so camera motion runs through
                EVERY narrated second. A frozen tail reads as a dead
                player — the client caught a social 30s reel sitting on a
                still frame from 30-33 s (2026-10-16). The retime is capped
                at 1.20x: a script long enough to exceed that still lands
                on a short freeze rather than a sluggish crawl.

    A music fetch failure degrades to a narration-only mix; a mixing
    failure raises. Returns final duration (s).
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

    # How the overrun is filled (see docstring): stretch re-times the reel
    # to the narration (AI tiers); freeze keeps the clone-the-last-frame
    # behaviour (Essential default). frozen = any leftover after the
    # capped retime — 0.0 in the normal case where stretch covers it all.
    retimed, frozen = 1.0, extend
    if extend > 0.05 and fill_overrun == "stretch" and video_dur > 0:
        retimed = min(target / video_dur, 1.20)
        frozen = max(target - video_dur * retimed, 0.0)

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
            # setpts FIRST (re-time), then clone-fill any remainder, then
            # normalise the pixel format — order matters in the chain.
            head = "[0:v]"
            if retimed != 1.0:
                head += f"setpts=PTS*{retimed:.6f},"
            if frozen > 0.05:
                head += f"tpad=stop_mode=clone:stop_duration={frozen:.3f},"
            chains.append(f"{head}format=yuv420p[v]")
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
    fill_overrun: str = "freeze",
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
    standard 2-second fade. When the avatar's voiceover outruns the reel,
    fill_overrun picks how the gap is covered — identical semantics to
    _mix_narration (its docstring is the reference):

      "freeze"  (default — ESSENTIAL and PREMIUM keep their historic
                behaviour, unchanged): clone the reel's last frame.
      "stretch" (SOCIAL/CINEMATIC via the caller): re-time the whole reel
                to the avatar's voiceover so camera motion runs through
                every voiced second — an avatar reel can never dead-still
                behind its own narration (client-reported on the TTS path,
                2026-10-16; same defect existed here). Retime capped at
                1.20x; any leftover past the cap still freeze-fills.

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

        # Overrun fill (see docstring): stretch re-times the reel to the
        # voiceover; freeze keeps the clone-last-frame behaviour (default —
        # Essential's call site relies on it, Premium is guarded out).
        # frozen = leftover after the capped retime (0.0 normally).
        retimed, frozen = 1.0, max(0.0, target - video_dur)
        if target > video_dur + 0.05 and fill_overrun == "stretch" and video_dur > 0:
            retimed = min(target / video_dur, 1.20)
            frozen = max(target - video_dur * retimed, 0.0)

        # ── Geometry: the SAME single source the card and end card use
        # (_branding_geometry), so the avatar can never drift from them
        # again (short-side scale — the Oct-14 portrait fix). avatar_side
        # is even-rounded and ≥64 from the helper: the alphamerge mask
        # must match the scaled avatar frame exactly.
        g = _branding_geometry(width, height)
        scale_ref = g["scale"]
        ring_w = g["avatar_ring"]
        side = g["avatar_side"]
        outer = g["avatar_outer"]                     # ring outer diameter
        margin = g["avatar_margin"]
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
            # setpts FIRST (re-time), then clone-fill any capped remainder —
            # same chain order as _mix_narration's video build.
            head = "[0:v]"
            if retimed != 1.0:
                head += f"setpts=PTS*{retimed:.6f},"
            if frozen > 0.05:
                head += f"tpad=stop_mode=clone:stop_duration={frozen:.3f},"
            chains.append(f"{head}format=yuv420p[base]")
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


@app.function(image=image, secrets=[modal.Secret.from_name("narakeet")], timeout=300)
def tut_tts_one(text: str, voice: str = "charlize") -> tuple:
    """Synthesize ONE tutorial voiceover beat → (base64 mp3, billed seconds).

    Admin content production only: the /tutorial page's how-to videos are
    narrated with the product's own Narakeet narrator so they sound identical
    to in-app voiceovers. Text comes from trusted repo content
    (scripts/_tut_content.ts), never from an HTTP request, so this cannot be
    repaid into an arbitrary-spend lever. Returns base64 so the MP4 bytes
    survive Modal's JSON-ish result transport intact. No Fal involved.
    """
    mp3, tts_seconds = narakeet_tts(text, voice)
    return base64.b64encode(mp3).decode("ascii"), round(float(tts_seconds), 2)


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
    deck = _camera_move_deck(record_id)
    seg_duration = duration / n

    for i, image_url in enumerate(images):
        # Motion-style rotation: frontend payload (A/B/C) if provided,
        # otherwise round-robin by index — same contract as the AI tiers
        supplied = None
        if image_prompts:
            match = next((p for p in image_prompts if p.get("image_url") == image_url and p.get("prompt_id")), None)
            supplied = str(match.get("prompt_id", "")).upper() if match else None
        style_id = supplied if supplied in ("A", "B", "C") else deck[i % 3]
        style = next(s for s in ESSENTIAL_MOTION_STYLES if s["id"] == style_id)
        _write_job_status(record_id, "processing", {
            "tier": "ESSENTIAL", "progress": round(i / n * 90),
            "clip": i + 1, "clips": n, "prompt_id": style_id,
        })
        print(f"Segment {i+1}/{n}: style {style_id}")

        # Download image → normalize to the exact output canvas via the
        # codebase fit convention (_fit_image_bytes): PORTRAIT sources are
        # pillarboxed so the WHOLE photo survives the 16:9 frame. The old
        # inline cover-crop threw away the top and bottom of every 9:16
        # photo (only ~31% of its height survived) — that is the "zoomed
        # in" complaint. Landscape sources cover-crop as before.
        raw_path = os.path.join(work, f"raw_{i}.jpg")
        image_bytes = fetch_media(image_url, timeout=60)
        fitted = _fit_image_bytes(image_bytes, width, height)
        with open(raw_path, "wb") as f:
            f.write(fitted)

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

    # Closing branding page (the reference-style outro) — Essential ends on
    # the agent's card too. Skipped with the AI-avatar add-on (its clip owns
    # the closing frames) so the two never fight for the last frame.
    if branding and not use_avatar:
        output_path = _append_branding_endcard(output_path, branding, width, height, work, card_seconds=3.0)

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


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials"), modal.Secret.from_name("narakeet")], timeout=1800, retries=2, min_containers=0, max_containers=100,    scaledown_window=300, env={"FLASHVSR_UPSCALE": "1"})
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
    photo_meta: list[dict] | None = None,
    branding: dict | None = None,
    use_avatar: bool = False,
    review: bool = False,
    clips_override: list[str] | None = None,
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
        review: Pause after clip generation at status `clips_ready` with the
            per-clip S3 URLs stored in the job record, so the agent can watch
            each clip and re-roll bad ones before assembly (Option 2). Only
            the AI tiers honour it — ESSENTIAL renders in one FFmpeg pass.
        clips_override: Resume path (/assemble_reel): these clip URLs replace
            generation entirely — assembly, narration, branding and the rest
            of the tail run on exactly these clips. Also how a re-rolled clip
            re-enters the pipeline.
    
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
    # BUDGET's configs each name their own fal resolution (512p / 768p — the
    # one thing the agent picks on its studio tab); every other tier's configs
    # have no resolution key and inherit the tier default, as before.
    resolution = str(config.get("resolution") or tier_config["resolution"])
    
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
        # otherwise the per-render randomized deck (below).
        # Random camera moves: each image draws ZOOM / LEFT / RIGHT from a
        # shuffled per-render deck — no preset pattern across images.
        # Engine FIRST: the engine-aware deck below reads it (dad98cb had
        # this assignment AFTER the loop — every AI-tier render died with
        # UnboundLocalError: cannot access local variable 'engine',
        # agent-reported on social 30s 2026-10-16).
        engine = TIER_VIDEO_ENGINE.get(tier, ENG_HAILUO)
        deck = _camera_move_deck(record_id)
        prompts: list[str] = []
        for i, image_url in enumerate(images):
            supplied = None
            match = None
            if image_prompts:
                match = next((p for p in image_prompts if p.get("image_url") == image_url and p.get("prompt")), None)
                supplied = match.get("prompt") if match else None
            # Per-photo camera metadata (Photos step): map (roomType, move) to
            # the authoritative prompt baked into camera_prompts.py. Only the
            # AI tiers use this — Essential stays on its local Ken Burns path.
            if not supplied and photo_meta:
                mmatch = next((m for m in photo_meta if m.get("image_url") == image_url), None)
                if mmatch:
                    rt = str(mmatch.get("roomType") or "").lower()
                    mv = str(mmatch.get("move") or "").lower()
                    # Zoom-out is exterior-only; interior+out is rejected in
                    # the UI, so this guard only fires on a hand-edited draft.
                    if rt in CAMERA_PROMPTS and mv in CAMERA_PROMPTS[rt]:
                        supplied = CAMERA_PROMPTS[rt][mv]
            # Engine-aware deck: Premium (Kling 2.6 Pro) gets the Kling-tuned
            # prompt set; every other tier keeps the Hailuo-authored prompts
            # byte-identical. Same shuffled A/B/C deck either way, so camera
            # rotation and retry replays stay identical across engines.
            engine_prompt = KLING_PROMPTS[deck[i % 3]] if engine == ENG_KLING26 else VIDEO_PROMPTS[deck[i % 3]]
            prompts.append(supplied or engine_prompt)

        # Determine base resolution for AI generation (tier-engine map).
        # 2026-10-21: every AI tier runs Hailuo-02 standard, whose native
        # rungs are 512p and 768p — SOCIAL 512p and CINEMATIC 768p generate
        # at their delivery resolution directly; PREMIUM's 1080p delivery
        # has no Hailuo rung, so it generates at 768p and the FlashVSR hop
        # below upscales each clip (kill-switch: 768p content ships on the
        # 1080p canvas). BUDGET's per-config resolution (512p/768p) is
        # already in `resolution`. All Hailuo clips are 6s; the assembler
        # stretches/trims each to its even share of the reel.
        if engine == ENG_KLING26:
            # Dormant alternate: Kling 2.6 Pro generates native 1080p. Kling
            # only accepts 5s or 10s clips; 5s is the cheapest clip and the
            # assembler stretches each to its even share of the reel.
            ai_resolution = "1080p"
            clip_seconds = 5
        elif resolution == "1080p":
            # PREMIUM on Hailuo: no 1080p rung — generate 768p, FlashVSR
            # delivers 1080p (the upscale hop below falls back to the native
            # clip on failure, so a paid render never dies here).
            ai_resolution = "768p"
            clip_seconds = 6
        else:
            # SOCIAL (512p) / CINEMATIC (768p) / BUDGET (512p|768p per config)
            ai_resolution = resolution
            clip_seconds = 6

        _ensure_not_cancelled(record_id)  # stop before spending fal.ai credits
        _write_job_status(record_id, "processing", {
            "tier": tier, "progress": 0,
            "clip": 0, "clips": len(images),
            "prompt_id": deck[0],
            "note": "fanned out",
        })
        # .map fans one tuple out per Modal container (all run concurrently);
        # each clip still retries independently (retries=2 on the function).
        # ASSEMBLE-RESUME (/assemble_reel): clips_override carries the clips
        # the agent reviewed (and possibly re-rolled) — reuse exactly those,
        # skipping fal generation entirely.
        video_clips = list(clips_override) if clips_override is not None else list(generate_ai_video_clip.map(
            [
                (image_url, prompt, ai_resolution, clip_seconds, engine)
                for image_url, prompt in zip(images, prompts)
            ],
            order_outputs=True,
        ))
        for c in video_clips:
            if not c:
                raise RuntimeError("One or more AI clips came back empty — render aborted")

        # FlashVSR upscale hop — PREMIUM only (2026-10-21): Hailuo-02
        # standard has no 1080p rung, so Premium clips are generated at 768p
        # above and upscaled to the 1080p delivery resolution via the separate
        # propreel-flashvsr Modal app. Concurrent (.map). Per-clip fallback:
        # on ANY upscale failure keep the native 768p clip so a paid render
        # never dies here — the assembler's lanczos normalize lifts it onto
        # the 1080p canvas regardless of source resolution.
        if _flashvsr_enabled() and clips_override is None and engine != ENG_KLING26 and resolution == "1080p":
            portrait = (orientation == "PORTRAIT")
            try:
                _fv = modal.Function.from_name(FLASHVSR_APP, FLASHVSR_FN)
                # .map takes ONE ITERABLE PER POSITIONAL PARAMETER (zip
                # semantics — no tuple unpacking). A list of 3-tuples passes
                # the whole tuple as input_video_url and the endpoint dies
                # with "'tuple' object has no attribute 'decode'" (urlparse
                # on a tuple; seen live 2026-10-19 — both verification
                # renders silently fell back to native clips).
                # return_exceptions=True lets the per-clip merge below keep
                # native clips for individual failures without killing the
                # whole hop.
                upscaled = list(_fv.map(
                    video_clips,
                    [resolution] * len(video_clips),
                    [portrait] * len(video_clips),
                    order_outputs=True,
                    return_exceptions=True,
                ))
                merged = []
                for native, up in zip(video_clips, upscaled):
                    url = (up or {}).get("url") if isinstance(up, dict) else None
                    if url:
                        merged.append(url)
                    else:
                        print(f"FlashVSR upscale failed for a clip — keeping native 768p: {up}")
                        merged.append(native)
                video_clips = merged
                print(f"FlashVSR upscaled {sum(1 for u in video_clips if 'upscaled/' in u)}/{len(video_clips)} clips to {resolution}")
            except Exception as _fe:
                # Cross-app call itself failed (app not deployed, name typo,
                # Modal auth) — keep the native 768p clips and continue.
                print(f"FlashVSR upscale hop unavailable — using native 768p clips: {_fe}")

        # ── PER-CLIP REVIEW PAUSE (Option 2) ─────────────────────────────────
        # The agent asked to watch every generated clip before the reel is
        # stitched: a bad clip (fire on the chair, invented room, …) gets
        # re-rolled HERE instead of being discovered in the finished video.
        # Re-host each fal clip on OUR S3 first — fal media URLs expire and
        # the review can sit indefinitely (clips also fall under the 30-day
        # retention purge under renders/). The record stores everything the
        # resume needs: per-clip prompts (byte-identical re-rolls) plus the
        # full render context for /assemble_reel.
        if review and clips_override is None:
            import boto3 as _b3r
            _up = _b3r.client('s3', region_name=S3_REGION)
            clip_entries = []
            for i, u in enumerate(video_clips):
                _key = f"renders/{record_id}/clips/{i}.mp4"
                _up.put_object(
                    Bucket=S3_BUCKET, Key=_key,
                    Body=fetch_media(u, timeout=300),
                    ContentType='video/mp4',
                )
                clip_entries.append({
                    "index": i,
                    "image_url": images[i],
                    "clip_url": f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{_key}",
                    "prompt": prompts[i],
                })
            _write_job_status(record_id, "clips_ready", {
                "kind": "render",
                "tier": tier,
                "progress": 50,
                "clips": clip_entries,
                "review": {
                    "tier": tier,
                    "config_index": config_index,
                    "orientation": orientation,
                    "images": images,
                    "voiceover_text": voiceover_text,
                    "voice_id": voice_id,
                    "language": language,
                    "include_agent_branding": include_agent_branding,
                    "music_url": music_url,
                    "image_prompts": image_prompts,
                    "photo_meta": photo_meta,
                    "branding": branding,
                    "use_avatar": use_avatar,
                    "ai_resolution": ai_resolution,
                    "clip_seconds": clip_seconds,
                    "engine": engine,
                    "resolution": resolution,
                    "flashvsr": bool(_flashvsr_enabled() and engine != ENG_KLING26 and resolution == "1080p"),
                },
            })
            print(f"Review pause: {len(clip_entries)} clips ready for {record_id}")
            return {
                "record_id": record_id,
                "status": "clips_ready",
                "tier": tier,
                "clips": clip_entries,
                "credits_used": config['credits'],
            }

        # Concatenate video clips — the paid clips are ALWAYS used now.
        # Assembly runs on its own container (ffmpeg work, not fal spend) so
        # the fal clip calls above stay the only fal cost.
        import tempfile as _tfa
        with _tfa.TemporaryDirectory(prefix=f"assemble_{record_id}_") as awork:
            # The DELIVERY canvas: 1920×1080 landscape / 1080×1920 portrait
            # for every AI tier (Cinematic canvas decided 2026-10-19 — see
            # docs/flashvsr-upscale-integration.md). Every later stage
            # (avatar, branding, narration mix) composes on this SAME canvas
            # so cards align exactly.
            if orientation == "PORTRAIT":
                bw, bh = 1080, 1920
            else:
                # Cinematic keeps the 1080p landscape canvas even though its
                # FlashVSR clips stop at a crisp 1280×720: ESSENTIAL already
                # delivers 1920×1080 from the editor's 1080p photos, so a
                # 720p Cinematic file would sit BELOW the cheapest tier in
                # the nominal-resolution ladder — and the buyer's player/TV
                # would then upscale that 720p with its own (worse) scaler.
                # The 1.5× normalize here is lanczos (see _concat_ai_clips),
                # so the FlashVSR detail survives the resample. The former
                # tier-resolution branches (480p → 854×480, 720p → 1280×720)
                # were DEAD once every AI engine became wan-25 — the engine
                # check above always won — and were removed 2026-10-19.
                bw, bh = 1920, 1080
            try:
                # Kling clips arrive 5s against a 6s per-shot share — the
                # assembler slow-stretches them instead of stream-looping
                # (a replay seam mid-shot is unacceptable on the premium tier).
                # Hailuo clips are 6s and never need the stretch.
                assembled = _concat_ai_clips(
                    video_clips, config['duration'], bw, bh, awork,
                    stretch_short_clips=(engine == ENG_KLING26))
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

        # (2026-10-21) The old ffmpeg ai_upscaled stretch pass is gone: every
        # AI tier assembles on the 1920×1080 canvas above, Premium's 1080p
        # delivery is FlashVSR's job (hop above), and no tier config uses
        # processing_type "ai_upscaled" anymore.

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
                # Same tier guardrail as the TTS narration mix below: the
                # Hailuo tiers re-time the reel to the avatar's voiceover so
                # it never dead-stills; ESSENTIAL (own call site, default
                # freeze) and PREMIUM keep the historic freeze-fill.
                final_dur = _apply_avatar_overlay(
                    src, avatar_video_url, dst, bw, bh, music_url=music_url,
                    fill_overrun=("stretch" if tier in ("SOCIAL", "CINEMATIC")
                                  else "freeze"))
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
                # Overrun fill per the client guardrail (2026-10-16): the
                # Hailuo tiers (SOCIAL/CINEMATIC) re-time the reel to the
                # narration so it never dead-stills; ESSENTIAL (own call
                # site) and PREMIUM keep the historic freeze-fill untouched.
                final_dur = _mix_narration(src, narr_path, dst, music_url=music_url,
                                           fill_overrun=("stretch" if tier in ("SOCIAL", "CINEMATIC")
                                                         else "freeze"))
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
        elif music_url:
            # Silent AI reel — no avatar and no narration: BUDGET never
            # narrates by design, and a noNarration AI reel is the same case.
            # Neither branch above ever fired without a voice track, so the
            # agent's music selection was silently dropped even though the
            # client copy promises "background music still plays if selected
            # below". Mirror render_video_local's music-only path (Essential
            # has had this since day one); the video stream is copied, so the
            # duration is unchanged. Any failure ships the silent render
            # rather than failing a paid job.
            import tempfile as _tf
            import os as _os
            workdir = _tf.mkdtemp(prefix=f"mus_{record_id}_")
            try:
                src = os.path.join(workdir, "src.mp4")
                dst = os.path.join(workdir, "out.mp4")
                with open(src, "wb") as vf:
                    vf.write(fetch_media(video_url, timeout=300))
                _mix_music_bed(src, music_url, dst, video_duration=float(config["duration"]))
                s3 = boto3.client('s3', region_name=S3_REGION)
                s3_key = f"renders/{record_id}/video.mp4"
                s3.upload_file(dst, S3_BUCKET, s3_key,
                               ExtraArgs={'ContentType': 'video/mp4'})
                video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
                print(f"Music bed mixed in: {video_url}")
            except Exception as me:
                print(f"⚠️ Music bed failed: {me} — shipping silent render")
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

    # Closing branding page — the reference-style outro, the LAST thing on
    # the reel. Runs after every avatar/overlay/voiceover pass so the card's
    # frames get exactly one burn and no double-drawn artwork. Cosmetic:
    # failure ships without the outro rather than failing a paid job.
    if include_agent_branding and branding and processing_type != "local":
        try:
            import tempfile as _tf
            with _tf.TemporaryDirectory(prefix=f"outro_{record_id}_") as _ow:
                src = os.path.join(_ow, "src.mp4")
                with open(src, "wb") as ovf:
                    ovf.write(fetch_media(video_url, timeout=300))
                with_outro = _append_branding_endcard(
                    src, branding, bw, bh, _ow, card_seconds=3.0)
                if with_outro != src and os.path.exists(with_outro):
                    s3o = boto3.client('s3', region_name=S3_REGION)
                    s3_key = f"renders/{record_id}/video.mp4"
                    s3o.upload_file(with_outro, S3_BUCKET, s3_key,
                                    ExtraArgs={'ContentType': 'video/mp4'})
                    video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
                    print(f"Branding end card appended (AI tier): {video_url}")
        except Exception as oe:
            print(f"AI-tier end card skipped — shipping without outro: {oe}")

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
    nar_extra = {"voiceover_seconds": round(float(narakeet_seconds), 2)}
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


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=900, retries=0)
async def rerender_clip_job(record_id: str, clip_index: int, prompt: str | None = None) -> None:
    """Re-roll ONE clip of a review-paused render (Option 2).

    Regenerates clips[clip_index] with the prompt this call resolves: the
    agent's camera-move RESELECTION when one was sent (`prompt` — the review
    panel rebuilds it from the same gentle deck the render used), otherwise
    the SAME prompt the original render resolved for that photo (a fresh fal
    call is a fresh seed — same shot, better result). Optionally runs the
    FlashVSR hop when the review context
    says the reel is on the Premium delivery path, re-hosts the new clip on
    OUR S3 under the same key, and updates the record — WITHOUT ever leaving
    `clips_ready`. The record's `rerender` marker ({index, at, ok, error}) is
    what the client's bounded poll watches for; a failure keeps the OLD clip
    and records why, so a paid re-roll can never strand the review.

    Cancellation-safe: the final write re-reads the record and is dropped by
    _write_job_status if the agent cancelled (or assembled) meanwhile — no
    rewind of a terminal state.
    """
    status = _read_job_status(record_id)
    if not status or status.get("status") != "clips_ready":
        print(f"rerender {record_id}[{clip_index}]: not awaiting review — skipping")
        return
    clips = status.get("clips") or []
    review = status.get("review") or {}
    if not (0 <= clip_index < len(clips)) or not review:
        print(f"rerender {record_id}[{clip_index}]: bad index or missing review context")
        return
    entry = clips[clip_index]
    # Move reselection wins; blank/absent ⇒ replay the stored prompt exactly.
    new_prompt = (prompt or "").strip() or entry.get("prompt") or ""
    marker = {
        "index": clip_index,
        "at": __import__('datetime').datetime.utcnow().isoformat(),
    }
    try:
        _ensure_not_cancelled(record_id)  # never spend fal credits on a cancelled review
        if not new_prompt:
            raise RuntimeError("no prompt available for this clip")
        new_url = generate_ai_video_clip.remote(
            # ONE tuple arg — the same spec shape .map fans out per clip in
            # the main render (def generate_ai_video_clip(spec: tuple)); five
            # separate positionals raise "takes 1 positional argument but 5
            # were given" inside the target.
            (entry["image_url"], new_prompt,
             review["ai_resolution"], int(review["clip_seconds"]), review["engine"]),
        )
        if not new_url:
            raise RuntimeError("clip generation returned an empty URL")
        # Premium delivery path: the stored clips are upscaled — a re-rolled
        # clip must match, or the reel mixes 768p segments with 1080p ones.
        # Per-clip fallback on failure: ship the native clip (same contract
        # as the batch hop — a paid re-roll never dies on the upscale).
        if review.get("flashvsr"):
            try:
                _fv = modal.Function.from_name(FLASHVSR_APP, FLASHVSR_FN)
                # Sync .remote — the same proven cross-function call shape as
                # the clip call above (this single-purpose job has nothing
                # else occupying its event loop, so the blocking upscale is
                # free). Separate positionals match flashvsr_upscale_video's
                # (url, resolution, portrait) signature.
                up = _fv.remote(
                    new_url, review["resolution"],
                    review.get("orientation") == "PORTRAIT",
                )
                if isinstance(up, dict) and up.get("url"):
                    new_url = up["url"]
                else:
                    print(f"rerender {record_id}[{clip_index}]: upscale returned no URL — keeping native")
            except Exception as _fe:
                print(f"rerender {record_id}[{clip_index}]: upscale failed — keeping native: {_fe}")
        # Re-host on OUR S3 under the SAME key (falcon URLs expire; review
        # length is unbounded; retention purges renders/ nightly).
        _s3().put_object(
            Bucket=S3_BUCKET,
            Key=f"renders/{record_id}/clips/{clip_index}.mp4",
            Body=fetch_media(new_url, timeout=300),
            ContentType='video/mp4',
        )
        hosted = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/renders/{record_id}/clips/{clip_index}.mp4"
        latest = _read_job_status(record_id)  # re-check: review may have moved on
        if not latest or latest.get("status") != "clips_ready":
            print(f"rerender {record_id}[{clip_index}]: review ended mid-flight — dropping update")
            return
        clips[clip_index]["clip_url"] = hosted
        clips[clip_index]["prompt"] = new_prompt  # truthful for the next re-roll
        clips[clip_index]["rerendered_at"] = marker["at"]
        _write_job_status(record_id, "clips_ready", {
            **latest,
            "clips": clips,
            "rerender": {**marker, "ok": True},
        })
        print(f"rerender {record_id}: clip {clip_index} replaced → {hosted}")
    except Exception as e:
        print(f"rerender {record_id}[{clip_index}] failed: {type(e).__name__}: {e}")
        latest = _read_job_status(record_id)
        if latest and latest.get("status") == "clips_ready":
            # Keep the OLD clip — the review continues; the client refunds
            # the re-roll charge on this marker.
            _write_job_status(record_id, "clips_ready", {
                **latest,
                "rerender": {**marker, "ok": False, "error": str(e)[:200]},
            })


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
    photo_meta: list[dict] | None = None,
    branding: dict | None = None,
    use_avatar: bool = False,
    review: bool = False,
    clips_override: list[str] | None = None,
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
            photo_meta=photo_meta,
            branding=branding,
            use_avatar=use_avatar,
            review=review,
            clips_override=clips_override,
        )
    except Exception as e:
        print(f"❌ Render {record_id} failed after retries: {type(e).__name__}: {e}")
        render_video_failed(record_id, f"{type(e).__name__}: {e}")
# ───────────────────────────────────────────────────────────────────────────
# IMAGE EDITING FUNCTIONS
# ───────────────────────────────────────────────────────────────────────────

@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials"), modal.Secret.from_name("bria-credentials")], timeout=300, retries=2, max_containers=200, scaledown_window=300)
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
            guidance_scale=guidance_scale,
            # The edit body publishes pipeline progress under this id (the
            # engine-pass lines it publishes while editing) — it writes
            # nothing on its own. See _edit_progress.
            progress_id=edit_id,
        )
        _finish_edit_job(edit_id, "completed", {
            # The edit body hands back its last progress line; prefer it over
            # the record read inside _finish_edit_job.
            **({"progress": result["progress"]} if result.get("progress") else {}),
            "image_url": result.get("image_url"),
            "preset_id": result.get("preset_id"),
            "strength": result.get("strength"),
            "guidance_scale": result.get("guidance_scale"),
            "credits_used": result.get("credits_used"),
        })
    except Exception as e:
        _finish_edit_job(edit_id, "failed", {"error": _friendly_fal_error(e)})


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
            cls, detail = "billing_locked", "AI service account out of balance — ops: top up at the provider dashboard"
        elif "401" in msg or "Unauthorized" in msg or "invalid API key" in msg.lower():
            cls, detail = "auth_failed", "service key rejected (401) — ops: check the credentials secret"
        elif "timed out" in msg.lower() or "timeout" in msg.lower():
            cls, detail = "timeout", "AI service ping timed out after 120s"
        else:
            cls, detail = "provider_error", _scrub_models(msg[:300])
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
    protocol has no such cap — same pattern as _gpt_flare_edit."""
    import fal_client
    import time
    try:
        handler = fal_client.submit(endpoint, arguments=arguments)
    except Exception as e:
        # Convert provider errors to a plain exception so they deserialize
        # cleanly on the caller side (same reason _gpt_flare_edit does this).
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
        ("openrouter/router/openai/v1/chat/completions", {"model": "google/gemini-2.5-flash"}),
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
            err_text = str(e)
            # Some OpenRouter routes are hard-wired to reasoning (Groq-backed
            # models reject `reasoning: {enabled: false}` with HTTP 400
            # "Reasoning is mandatory for this endpoint and cannot be
            # disabled"). Retrying the SAME model without the param is cheap
            # and salvages the attempt instead of burning a fallback slot.
            if "reasoning is mandatory" in err_text.lower():
                try:
                    result = _fal_run_queued(
                        endpoint,
                        arguments={**extra, "messages": messages},
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
                except Exception as e2:
                    last_err = e2
                    continue
            else:
                last_err = e
            continue
    raise last_err or RuntimeError("LLM call failed")


def _trim_to_sentences_within(text: str, word_cap: int) -> str | None:
    """Trim a script to complete sentences within `word_cap` words.

    Splits on terminal punctuation (. ! ? …) including the quotes they may
    close, drops any dangling unfinished head (the 'this is the perfect'
    tail), and walks sentence-by-sentence until adding the next would exceed
    the cap. Returns None when the result would be empty (no complete
    sentence fits – caller keeps the raw text, the degenerate-cap case).
    """
    import re as _re

    src = (text or "").strip()
    if not src:
        return None
    # Sentences = text up to each terminal punct (. ! ? …) + any closing
    # quote/brace it carries, keeping the punctuation.
    parts = _re.findall(r"([\s\S]*?[.!?…]+[\"'”’)]*\s*|$)", src)
    sentences = [p.strip() for p in parts if p.strip()]
    if len(sentences) < 2:
        return None            # whole text is one sentence or no terminator
    kept: list[str] = []
    count = 0
    for s in sentences:
        n = len(_re.findall(r"\S+", s))
        if count + n > word_cap:
            break
        kept.append(s)
        count += n
    if not kept:
        return None
    return " ".join(kept)


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
        # Full social pack (audit §9): ONE generation covering every platform
        # the agency posts to. platform_brief lists each platform id with its
        # character limit and style rules; the reply is minified JSON mapping
        # platform id -> caption so the client can slot each one straight into
        # its preview card. JSON only — no fences, no commentary.
        "social_pack": (
            "You are a social media copywriter for a South African estate agency. Write ONE post "
            "caption for EACH platform listed in platform_brief, for the property described in the "
            "provided fields. Every caption must use the exact facts provided (beds, baths, price in "
            "ZAR with the decimal system, key features), mention what you can see in any attached "
            "photos, and never invent facts. Each caption MUST respect its platform's character limit "
            "and style rules from platform_brief. Reply with ONLY minified JSON mapping each platform "
            "id to its caption string — no code fences, no commentary, no extra keys: "
            "{\"instagram\":\"...\",\"facebook\":\"...\",\"whatsapp\":\"...\",\"linkedin\":\"...\","
            "\"twitter\":\"...\",\"tiktok\":\"...\",\"newsletter\":\"...\"}"
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
    # Property descriptions in any of SA's 11 official languages (audit §8):
    # the frontend sends `language` / `language_label` with description
    # requests. English keeps the stock prompt; anything else gets a hard
    # language rule like the video scripts have always had.
    if kind == "description":
        desc_lang_label = str(fields.get("language_label") or "").strip()
        if desc_lang_label and desc_lang_label.lower() != "english":
            system += (
                f" Write the ENTIRE description in {desc_lang_label} — every sentence including "
                f"the closing line. Keep property names, suburbs, street names, numbers and prices "
                f"exactly as written; never translate a proper noun."
            )
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
            # Above the cap a HALF-FINISHED sentence is the worst outcome: the
            # narration ends mid-thought ("this is the perfect"). The rule now
            # prioritizes COMPLETE sentences — the model must plan the count
            # and finish the thought, trimming facts instead of truncation.
            word_rule = (
                f"HARD LIMIT: {words} words or fewer — the script must fill {int(duration_s)} seconds of "
                f"narration and MUST NOT exceed {words} words. Aim for about 90% of that length "
                f"using short, complete sentences. THE SCRIPT MUST END ON A FINISHED SENTENCE: "
                f"never stop mid-sentence, never end on a comma or a half-thought — if your draft "
                f"is over {words} words, delete whole sentences or summarize longer, so every "
                f"sentence still ends with its punctuation. The closing call to action must be a "
                f"complete sentence too. Count your words BEFORE answering and drop content, "
                f"never cut a sentence short."
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
    # Sentence-safe final trim (deterministic, second layer behind the prompt
    # rule): an LLM that still exceeds the word budget must come back ending
    # on a COMPLETE sentence — narration ends mid-thought otherwise ("…this
    # is the perfect"). Falls back to the untrimmed text when no cap is
    # known, when the draft is already within it, or when no complete
    # sentence fits (degenerate tiny cap — ship the raw text rather than
    # nothing).
    try:
        if kind == "video_script":
            cap = fields.get("target_words")
            if cap and int(cap) > 0:
                trimmed = _trim_to_sentences_within(text, int(cap))
                if trimmed:
                    text = trimmed
    except Exception as te:
        print(f"sentence trim skipped: {te}")
    return text


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=120, schedule=modal.Cron("*/15 * * * *"))
def scheduled_fal_probe():
    """Runs every 15 minutes on Modal's scheduler; refreshes the S3 health record."""
    probe_fal_health.remote()


# ── Render watchdog ────────────────────────────────────────────────────────
# A render that dies without writing a terminal status (container evicted,
# Modal node loss, a fal poll loop wedged forever) sits at `processing` /
# `queued` in the jobs/ store forever: the live client polls to its own
# 25-minute deadline and refunds itself, but a tab that was closed mid-render
# has NO poller left — the project row would wait for the nightly reaper and
# no video ever lands. This cron sweeps the jobs/ store and flips any job
# that has gone silent past the safe horizon to `failed`, so whichever
# poller or reaper still touches it names the real cause and refunds.
#
# Safe horizon: silence past 45 minutes cannot come from a living job —
# the worst healthy silent stretch is one clip's ~9-minute fal poll, and
# every Modal retry attempt rewrites `processing / progress 0` at its
# start, refreshing the stamp (though attempts are capped: retries=2 on
# render_video means at most 3 attempts totalling well under an hour).
WATCHDOG_STALL_SECONDS = 45 * 60
WATCHDOG_MAX_KEYS = 2000  # sweep cap on the jobs/ store
WATCHDOG_MAX_FAILURES = 50  # safety cap per sweep

@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=900, schedule=modal.Cron("*/10 * * * *"))
def scheduled_render_watchdog():
    """Every 10 minutes: fail job records silent for 45+ minutes.

    Renders (video, avatar/flashhead) and image edits all share the
    jobs/{id}.json store, so all three stall-modes get covered here. No fal
    calls — this only reads S3 timestamps and writes terminal failure
    statuses that clients/refunds already understand."""
    import boto3
    import json as _json
    from datetime import datetime as _dt

    s3 = boto3.client('s3', region_name=S3_REGION)
    swept = failed = 0
    token = None
    while True:
        kwargs = {"Bucket": S3_BUCKET, "Prefix": "jobs/", "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        try:
            resp = s3.list_objects_v2(**kwargs)
        except Exception as e:
            print(f"Watchdog: jobs listing failed: {e}")
            return
        for item in resp.get("Contents", []):
            key = item["Key"]
            if not key.endswith(".json"):
                continue
            record_id = key[len("jobs/"):-len(".json")]
            if not record_id or "/" in record_id:
                # jobs/health/… and other subfolders are not job records
                continue
            swept += 1
            if swept > WATCHDOG_MAX_KEYS:
                break
            try:
                job = _json.loads(s3.get_object(Bucket=S3_BUCKET, Key=key)['Body'].read())
            except Exception:
                continue
            if job.get("status") not in ("queued", "processing"):
                continue  # terminal or cancelled — not ours to touch
            try:
                updated = _dt.fromisoformat(job.get("updatedAt"))
            except Exception:
                continue
            silent_s = (_dt.utcnow() - updated).total_seconds()
            if silent_s <= WATCHDOG_STALL_SECONDS:
                continue
            # One re-read right before flipping: a finisher that landed while
            # we read must not be failed by us — that would refund a delivered
            # video. (completed-overwrites-failed only lands for a render that
            # finishes AFTER our write; the reverse race is this check.)
            try:
                fresh = _json.loads(s3.get_object(Bucket=S3_BUCKET, Key=key)['Body'].read())
                if fresh.get("status") not in ("queued", "processing"):
                    continue
            except Exception:
                pass  # unreadable → the timestamp read above was our best signal
            silent_min = int(silent_s // 60)
            render_video_failed(
                record_id,
                f"Watchdog: the render went silent for {silent_min} minutes with no progress "
                "and was stopped as stalled — your credits are refunded. Please retry.",
            )
            failed += 1
            print(f"Watchdog: job {record_id} marked failed (silent {int(silent_s)}s, was {job.get('status')})")
            if failed >= WATCHDOG_MAX_FAILURES:
                print(f"Watchdog: per-sweep failure cap ({WATCHDOG_MAX_FAILURES}) reached — finishing")
                return
        token = resp.get("NextContinuationToken")
        if not token or swept >= WATCHDOG_MAX_KEYS:
            return



# # IMAGE EDITING FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def _gpt_flare_edit(image_url: str, prompt: str, quality: str = "high") -> bytes:
    """ONE whole-image edit call — the single engine for ALL image editing
    (2026-10-16): Photo Editor, Virtual Staging, Furniture Removal and
    Twilight presets, plus custom prompts.

    openai/gpt-image-2.5/flare/edit takes the WHOLE source image plus an
    instruction. History: it replaced the mask-based removal chain first
    (2026-10-15 — no mask upload, no polarity guessing, no two-pass
    erase/composite, no VQA gate eating the worker's 300s budget), then
    staging (2026-10-16 morning), and finally the Kontext fallback and the
    deterministic HDR Boost shortcut, which this call subsumes for every
    remaining category.

    The endpoint publishes no strength / guidance_scale / negative_prompt
    arguments, so it deliberately receives none; the preset's negative rides
    inside `prompt` as an explicit "Avoid:" clause, and the caller pins
    `quality` to bound cost and latency.

    `scripts/_fal_engine_schema_probe.py` re-checks this payload against the
    live published schema for free. Returns the output image bytes.
    """
    import fal_client
    try:
        # presign like every other fal call here: image_url is one of OUR
        # object URLs and fal has no credentials for the bucket.
        payload = {
            "image_urls": [presign_media(image_url)],
            "prompt": prompt,
            # Pinned, not defaulted: "high" is the endpoint's own default AND
            # the quality validated on fal.ai. Explicit so a future fal default
            # change cannot silently alter cost or latency.
            "quality": quality,
            # jpeg is ~10x smaller than the png default; _fit_image_bytes
            # re-encodes to jpeg anyway, so nothing is lost.
            "output_format": "jpeg",
        }
        # submit + poll with a per-job time bound in the loop. The
        # pinned image runs fal-client==1.0.3, whose subscribe() takes NO
        # timeout= kwarg — passing one raised TypeError at call time and
        # failed EVERY removal with "SyncClient.subscribe() got an unexpected
        # keyword argument 'timeout'" (agent-reported 2026-10-15). The
        # per-job time bound lives in the poll loop instead.
        handler = fal_client.submit("openai/gpt-image-2.5/flare/edit",
                                    arguments=payload)
    except Exception as e:
        # Convert provider errors to a plain exception: custom classes like
        # FalClientHTTPError fail to deserialize on the caller side and bury
        # the real cause (e.g. billing lock) in a deserialization blob.
        raise RuntimeError(_friendly_fal_error(e)) from None

    import time
    max_wait = 240  # 4 minutes per pass (leave 1 minute buffer before the 5 minute edit timeout)
    start_time = time.time()
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise Exception(f"Timeout: fal.ai removal task did not complete within {max_wait}s")

        status = handler.status()  # Queued / InProgress / Completed / Failed
        status_type = type(status).__name__

        if status_type == "Completed":
            result = handler.get()
            break
        elif status_type == "Failed":
            raise Exception(f"fal.ai removal task failed: {status.error}")
        elif status_type in ["Queued", "InProgress"]:
            print(f"fal.ai removal task {status_type}... ({int(elapsed)}s elapsed)")
            time.sleep(3)
        else:
            raise Exception(f"Unknown fal.ai status: {status_type}")

    # "or []" handles both a missing and an EMPTY images list, so this
    # reaches the explicit check below instead of raising IndexError at [0].
    images = (result or {}).get("images") or []
    url = (images[0] or {}).get("url") if images else None
    if not url:
        raise RuntimeError(f"no image url returned: {str(result)[:300]}")
    print(f"flare image url: {url}")
    return requests.get(url, timeout=120).content


def _store_edit(payload: bytes, image_url: str, preset_id: str,
                strength_value, guidance_value, final_progress: dict | None = None) -> dict:
    """Persist an edited frame at edited/<preset>_<source>.jpg and return the
    standard edit-response dict. Shared by the generative path and the
    deterministic HDR path so both store and answer identically.

    final_progress: the last live-progress line (see _edit_progress). It rides
    into the response so edit_image_job can publish it with the completed
    record — the verdict then survives for a poller that arrives after the
    render instead of being dropped with the processing record."""
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
        "credits_used": IMAGE_RENDER_CREDIT_COST,
        **({"progress": final_progress} if final_progress else {}),
    }


@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials"), modal.Secret.from_name("bria-credentials")], timeout=300, retries=2)
def edit_image(
    image_url: str,
    preset_id: str,
    custom_prompt: str | None = None,
    strength: float | None = None,
    guidance_scale: float | None = None,
    progress_id: str | None = None
) -> dict:
    """
    Edit an image using fal-ai with comprehensive prompt library
    
    Args:
        image_url: URL of the source image
        preset_id: ID of the preset to use (e.g., 'golden_sunset', 'luxury_modern')
        custom_prompt: Optional custom prompt (overrides preset)
        strength: Optional strength override (uses preset default if not provided)
        guidance_scale: Optional guidance scale override (uses preset default if not provided)
        progress_id: Optional job record id (edit_image_job passes its edit_id).
            Progress for the engine passes (removal / staging start and
            end lines) is published there for /edit_status pollers;
            None = publish nothing.
    
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

    # Use provided strength/guidance or preset defaults. The flare endpoint
    # takes neither — they stay response/UI metadata (the slider ranges in
    # imagePrompts.ts) so the agent-visible record keeps its shape.
    actual_strength = strength if strength is not None else preset['strength']['default']
    actual_guidance = guidance_scale if guidance_scale is not None else preset['guidanceScale']['default']
    
    print(f"Using strength: {actual_strength}, guidance: {actual_guidance}")

    # ── ONE engine for every preset (2026-10-16): gpt-image-2.5 flare ─────
    # Photo Editor, Virtual Staging, Furniture Removal and Twilight all run
    # the same whole-image openai/gpt-image-2.5/flare/edit call now. Gone
    # with this change: the Kontext fallback (and its strength→guidance
    # mapping) plus the deterministic HDR Boost tone-map shortcut — HDR
    # Boost has a real preset prompt and runs the generative path like every
    # other preset. A custom prompt takes the same engine; only the body
    # differs.
    # The endpoint publishes no strength / guidance_scale / negative_prompt
    # arguments, so this path sends none: the preset's negative rides inside
    # the prompt as an explicit "Avoid:" clause, and quality is pinned in
    # _gpt_flare_edit (high) to bound cost and latency.
    negative = preset.get("negative_prompt") or ""
    full_prompt = prompt + (f"\n\nAvoid: {negative}." if negative else "")
    _edit_progress(
        progress_id, "engines",
        {
            "removal": "Removing with gpt-image-2.5…",
            "staging": "Staging the room with gpt-image-2.5…",
            "twilight": "Applying twilight mood with gpt-image-2.5…",
        }.get(preset.get("category"), "Editing with gpt-image-2.5…"),
    )
    print(f"flare: prompt={len(full_prompt)} chars")
    payload = _fit_image_bytes(_gpt_flare_edit(image_url, full_prompt))

    # Brightness guards stay engine-agnostic: a style vocabulary that
    # outweighs the lighting instructions ("industrial", "night") can pull
    # any model's output cave-dark, and a pitch-black frame is a failed
    # render the agent already paid for.
    # Staging: relative floor against the source photo.
    if preset.get("category") == "staging":
        payload = _staging_brightness_floor(payload, fetch_media(image_url, timeout=60))
    # Twilight: bounded absolute luma targets per mood (blue_hour/night/
    # moody kept coming back unreadable even with hardened prompts).
    if preset.get("category") == "twilight":
        payload = _twilight_brightness_floor(
            payload, fetch_media(image_url, timeout=60), preset_id)

    final_progress = _edit_progress(progress_id, "done", "Edit complete", done=True)
    return _store_edit(payload, image_url, preset_id, actual_strength, actual_guidance,
                       final_progress=final_progress)


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
        "voice": nar_voice,
        "language": lang,
        "voiceover_seconds": round(float(nar_seconds), 2)
    }


@app.function(image=image)
def logo_geometry_probe() -> dict:
    """Operator probe: the LIVE deployed geometry for a 1080p Essential frame.

    Lets a deploy be verified from outside (the code_version_probe only checks
    concat) — reports the corner mark's size/position as the deployed container
    computes it, so a geometry change can be confirmed without a paid render.
    """
    g = _branding_geometry(1920, 1080)
    return {
        k: g[k]
        for k in (
            "scale", "margin", "card_logo_h", "card_logo_max_w",
            "card_logo_top", "card_logo_right_gap",
        )
    }


@app.local_entrypoint()
def _logo_probe_cli():
    """`modal run modal/app_propreel_minimax.py::_logo_probe_cli` — prints the
    live geometry for a 1080p Essential frame from the SAME source the render
    functions import, so a geometry change is verifiable without a paid render.
    """
    import json as _json
    print(_json.dumps(logo_geometry_probe.local(), indent=2))


def _health_payload() -> dict:
    """Shared health metadata, DERIVED from the live tier catalog so it can
    never drift from what the render path actually uses (it used to hardcode
    hailuo-02 / [512p,720p,1080p] after the wan-25-preview migration, which
    misreported the engine to operators)."""
    ai_tiers = [t for t in TIER_CONFIGS.values() if t["processing_type"] != "local"]
    ai_resolutions = sorted({t["resolution"] for t in ai_tiers})
    # Every AI tier runs Hailuo-02 standard since the 2026-10-21 engine
    # unification, so the single-value `model` field the frontend status
    # cards render is simply it; the full per-tier map rides in `engine`.
    # STEALTH (2026-10-27): /health is unauthenticated and must never name
    # engines, models or providers — the operator truth (which engine each
    # tier runs) lives in the tier catalog in this module.
    return {
        "status": "healthy",
        "service": "propreel-render",
        "version": "2.1.0",
        "engine": "standard",
        "model": "standard",
        # Hailuo-02 standard clips are 6s (the assembler stretches/trims each
        # to its even share of the reel); Kling's dormant 5s clips excepted.
        "clip_duration": 6,
        "resolutions": ai_resolutions,
        "audio": False,
        "avatar_video": True,
        # Live kill-switch state (upscale) — operators read this from
        # GET /health without digging through render logs.
        "upscale_enabled": _flashvsr_enabled(),
    }


@app.function(image=image, env={"FLASHVSR_UPSCALE": "1"})
def health_check() -> dict:
    """Health check endpoint"""
    return _health_payload()


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
    return _health_payload()

@web_app.post("/render_video")
async def api_render_video(request: RenderVideoRequest, raw_request: Request):
    """API endpoint to render video — SPAWNS the job and returns immediately.

    For 1000-concurrent-user scale, the HTTP request must not hold a connection
    for the full multi-minute render. Clients poll /render_status instead.
    Backward compatible: ?wait=true blocks like the old behaviour.
    """
    # Claim OUTSIDE the try: the blanket handler below would otherwise
    # re-wrap the 401/409/503 from _claim_job_token as a 500.
    _verify_paid_script_hash(
        _parse_token(raw_request.headers.get(_token_header))[0],
        request.voiceover_text,
    )
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
                    photo_meta=request.photo_meta,
                    branding=request.branding,
                    use_avatar=bool((request.branding or {}).get("use_avatar")),
                    review=bool(request.review),
                )
            except Exception as e:
                # Same contract as the async path: a crashed render must land
                # as `failed`, never freeze at `processing / progress 0`.
                render_video_failed(request.record_id, f"{type(e).__name__}: {e}")
                raise
            # Private buckets: the browser plays/shares this URL directly,
            # so hand it a long-lived presigned link, never the raw object.
            return presign_urls(result)

        # Async path: write initial job status to S3, then spawn.
        # Fail-CLOSED: the token is already burnt by the claim above, so if
        # this setup itself throws (S3 outage, spawn rejection), a silent
        # return 200 would strand a paid, unstartable job — the client would
        # poll a record that never exists until its 25-min deadline and the
        # refund would never run. Any failure here marks the job `failed`
        # (client refunds on terminal failed — the documented contract) AND
        # the endpoint returns 502 so the browser gets a real verdict now.
        try:
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
                photo_meta=request.photo_meta,
                branding=request.branding,
                use_avatar=bool((request.branding or {}).get("use_avatar")),
                review=bool(request.review),
            )
        except Exception as spawn_err:
            render_video_failed(request.record_id, f"spawn failed: {type(spawn_err).__name__}: {str(spawn_err)[:300]}")
            raise HTTPException(status_code=502, detail=f"Render could not be started after payment — the job is marked failed so the charge auto-refunds. ({type(spawn_err).__name__})")
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
    out = presign_urls(status)
    if isinstance(out, dict):
        # `review` is the server-only resume context for /assemble_reel (full
        # render args + prompts, ~tens of KB) — the browser only needs
        # `clips` + `rerender` + progress, so keep it out of every 5s poll.
        out.pop("review", None)
    return out

@web_app.post("/rerender_clip")
async def api_rerender_clip(request: RerenderClipRequest, raw_request: Request):
    """Re-roll ONE clip of a review-paused render (paid scope=rerender).

    Claims the paid single-use token FIRST (a real fal call is about to
    spend money), then spawns the re-roll and answers immediately — the
    client polls /render_status for the `rerender` marker / new clip_url.
    The job stays in `clips_ready` throughout, so the review never breaks.
    """
    # Claim outside the blanket try: 401/409/503 must not become a 500.
    _claim_job_token(raw_request)
    status = _read_job_status(request.record_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown record_id: {request.record_id}")
    if status.get("status") != "clips_ready":
        raise HTTPException(status_code=409, detail="This render is not awaiting clip review (already assembled, cancelled or failed).")
    clips = status.get("clips") or []
    if not (0 <= request.clip_index < len(clips)):
        raise HTTPException(status_code=400, detail=f"clip_index out of range (0..{len(clips) - 1}).")
    if not status.get("review"):
        raise HTTPException(status_code=409, detail="Review context missing — cannot re-roll this render.")
    # Optional move-reselection prompt: bounded and non-blank. The render
    # request already trusts client-built prompts (image_prompts), so this is
    # the same surface — only sanity limits apply.
    prompt_override = (request.prompt or "").strip()
    if request.prompt is not None and not prompt_override:
        raise HTTPException(status_code=400, detail="prompt must be non-empty when provided.")
    if len(prompt_override) > 4000:
        raise HTTPException(status_code=400, detail="prompt is too long (4000 chars max).")
    # Reserve the slot: one re-roll at a time per record (client serialises
    # too, but a double-submit must not run two fal calls on one token).
    in_flight = status.get("rerender")
    if in_flight and in_flight.get("at") and not in_flight.get("done", True):
        raise HTTPException(status_code=409, detail="A re-roll for this clip is already running.")
    _write_job_status(request.record_id, "clips_ready", {
        **status,
        "rerender": {"index": request.clip_index,
                     "at": __import__('datetime').datetime.utcnow().isoformat(),
                     "done": False},
    })
    try:
        await rerender_clip_job.spawn.aio(request.record_id, request.clip_index, prompt_override or None)
    except Exception as spawn_err:
        # Token burnt but no job — clear the reservation so review continues.
        _write_job_status(request.record_id, "clips_ready", {
            **(_read_job_status(request.record_id) or status),
            "rerender": None,
        })
        raise HTTPException(status_code=502, detail=f"Re-roll could not start — the charge will be refunded automatically. ({type(spawn_err).__name__})")
    return {
        "record_id": request.record_id,
        "clip_index": request.clip_index,
        "status": "rerendering",
        "poll_url": f"/render_status?record_id={request.record_id}",
    }

@web_app.post("/assemble_reel")
async def api_assemble_reel(request: AssembleReelRequest, raw_request: Request):
    """Finish a review-paused render — concat the CURRENT clips, run the full
    post pipeline (avatar, narration, music, branding, endcard, thumbnail),
    publish `completed`.

    FREE with a v1 worker token: the original /render_video claim already
    charged the full tier price for this exact reel — assembly is where that
    charge pays out. The gate is the job's `clips_ready` state (reachable
    only through a paid render) plus the record's review context.
    """
    status = _read_job_status(request.record_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown record_id: {request.record_id}")
    if status.get("status") != "clips_ready":
        raise HTTPException(status_code=409, detail="This render is not awaiting assembly (already assembled, cancelled or failed).")
    review = status.get("review")
    clips = sorted(status.get("clips") or [], key=lambda c: c.get("index", 0))
    if not review or not clips:
        raise HTTPException(status_code=409, detail="Review context missing — please render again.")
    if any(not c.get("clip_url") for c in clips):
        raise HTTPException(status_code=409, detail="A clip is still being re-rolled — wait for it to finish, then assemble.")
    # Flip out of clips_ready BEFORE spawning: the transition is the lock
    # against double-assembly (second caller reads `processing` → 409).
    _write_job_status(request.record_id, "processing", {
        "kind": "render", "tier": review["tier"], "progress": 60,
        "note": "assembling reviewed clips",
    })
    try:
        await render_video_job.spawn.aio(
            record_id=request.record_id,
            tier=review["tier"],
            config_index=review["config_index"],
            orientation=review["orientation"],
            images=review["images"],
            voiceover_text=review.get("voiceover_text") or "",
            voice_id=review.get("voice_id") or "Joanna",
            language=review.get("language") or "en-ZA",
            include_agent_branding=bool(review.get("include_agent_branding", True)),
            music_url=review.get("music_url"),
            image_prompts=review.get("image_prompts"),
            photo_meta=review.get("photo_meta"),
            branding=review.get("branding"),
            use_avatar=bool(review.get("use_avatar")),
            review=False,
            clips_override=[c["clip_url"] for c in clips],
        )
    except Exception as spawn_err:
        # Token for the ORIGINAL render was already spent long ago; if the
        # spawn fails the job must not freeze — mark failed (client refunds).
        render_video_failed(request.record_id, f"assemble spawn failed: {type(spawn_err).__name__}: {str(spawn_err)[:300]}")
        raise HTTPException(status_code=502, detail=f"Assembly could not be started — the job is marked failed so the charge auto-refunds. ({type(spawn_err).__name__})")
    return {
        "record_id": request.record_id,
        "status": "processing",
        "poll_url": f"/render_status?record_id={request.record_id}",
        "message": "Assembling reviewed clips — poll /render_status for completion.",
    }

@web_app.post("/generate_avatar_video")
# Deprecated path kept for stale cached bundles only — the current frontend
# never calls it (stealth 2026-10-27: feature paths must not name the model).
@web_app.post("/generate_flashhead_video")
async def api_generate_flashhead_video(request: FlashHeadRequest, raw_request: Request):
    """API endpoint to generate an avatar lip-sync video (legacy alias route)."""
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
            # Ops report: billed voiceover seconds per avatar video
            # (STEALTH 2026-10-27: job status is user-visible — never name
            # vendors or models in these keys.)
            "kind": "flashhead",
            "voiceover_seconds": round(float(nar_seconds), 2),
            "voiceover_voice": nar_voice,
            "voiceover_language": lang,
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
    kind: str  # description | social_caption | social_pack | video_script | language_check | translate
    fields: dict = {}
    images: list[str] = []  # optional photo URLs for Grok vision

@web_app.post("/avatar")
# Deprecated path kept for stale cached bundles only (see above).
@web_app.post("/flashhead")
async def api_flashhead(request: FlashHeadJobRequest, raw_request: Request):
    """Start an async avatar lip-sync job. Poll /avatar_status."""
    # Script-hash binding BEFORE the claim (same contract as /generate_flashhead_video).
    _verify_paid_script_hash(
        _parse_token(raw_request.headers.get(_token_header))[0],
        request.voiceover_text,
    )
    _claim_job_token(raw_request)  # paid + single-use before any work starts
    try:
        import time as _time, uuid as _uuid
        job_id = f"fh_{int(_time.time() * 1000)}_{_uuid.uuid4().hex[:6]}"
        _write_job_status(job_id, "queued", {"kind": "avatar"})
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
            "poll_url": f"/avatar_status?job_id={job_id}",
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=_friendly_fal_error(e, context="AI Avatar"))

@web_app.get("/avatar_status")
# Deprecated path kept for stale cached bundles only (see above).
@web_app.get("/flashhead_status")
async def api_flashhead_status(job_id: str):
    status = _read_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")
    return presign_urls(status)

# ── Per-user rate limit: language_check / translate ───────────────────────────
# These two kinds are the only /generate_text paths the browser can fire from a
# pause in typing, and the frontend verdict cache is a client-side courtesy —
# the hard brake belongs on the server. Sliding window per worker instance,
# keyed by the token's uid (the identity the API minted for the signed-in
# user); callers without a usable token fall back to their client host.
# 30 calls / 10 min comfortably covers a cached editing session (a handful of
# checks) while capping runaway clients. Best-effort per Modal web instance:
# containers scale independently, so this bounds each instance rather than a
# global total — the frontend cache is the volume control, this is the abuse
# guard. Fail-open for the caller either way: a 429 only skips the advisory
# language check, it never blocks a render.
_text_rate_buckets: dict = {}
_TEXT_RATE_LIMIT = 30        # calls per window, shared by both kinds
_TEXT_RATE_WINDOW_S = 600.0  # 10 minutes


def _text_rate_limited(key: str) -> bool:
    now = time.time()
    bucket = _text_rate_buckets.get(key)
    if bucket is None:
        # Bound memory: uid/host churn must not grow this map forever.
        if len(_text_rate_buckets) > 4096:
            _text_rate_buckets.clear()
        bucket = _text_rate_buckets.setdefault(key, [])
    bucket[:] = [t for t in bucket if now - t < _TEXT_RATE_WINDOW_S]
    if len(bucket) >= _TEXT_RATE_LIMIT:
        return True
    bucket.append(now)
    return False


@web_app.post("/generate_text")
async def api_generate_text(request: GenerateTextRequest, raw_request: Request):
    """Grok AI text generation for property descriptions, social captions,
    and video voiceover scripts (optional attached photos)."""
    if request.kind in ("language_check", "translate"):
        payload, _err = _parse_token(raw_request.headers.get(_token_header))
        uid = (payload or {}).get("uid") or (raw_request.client.host if raw_request.client else "anon")
        if _text_rate_limited(uid):
            raise HTTPException(
                status_code=429,
                detail="Too many language requests — please wait a few minutes and try again.",
            )
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
    tok_id = str(body.get("platform_token_id") or os.environ.get("MODAL_TOKEN_ID", ""))
    tok_sec = str(body.get("platform_token_secret") or os.environ.get("MODAL_TOKEN_SECRET", ""))
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
@app.function(image=image, secrets=[modal.Secret.from_name("edge-hosts"), modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("render-auth"), modal.Secret.from_name("narakeet"), modal.Secret.from_name("admin-api"), modal.Secret.from_name("modal-admin-creds")], env={"FLASHVSR_UPSCALE": "1"})
@modal.asgi_app()
def web():
    """Mount FastAPI app as Modal web endpoint"""
    return web_app


@app.local_entrypoint()
def main():
    """Local entrypoint for testing"""
    print("PropReel Modal Backend v2.2 (async image edits, health probe, LLM text)")

    print("Video Model: fal-ai/minimax/hailuo-02/standard (all AI tiers)")
    print("FlashHead Model: fal-ai/flashhead/v1/lip-sync")
    print("Clip Duration: 6 seconds")
    print("Resolutions: 512p, 768p (Premium 768p → FlashVSR 1080p)")
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
