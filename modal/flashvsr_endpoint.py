"""
FlashVSR v1.1 (tiny) video-upscale Modal endpoint.

Reusable endpoint so the render pipeline (app_propreel_minimax.py) can
self-host the 768p→1080p upscaler for the PREMIUM tier instead of paying
for native-1080p generation. It lives in its OWN Modal app so the ~8 GB
FlashVSR GPU image (CUDA devel + torch + weights, baked once) stays out of
the main render image, and the worker invokes it across apps via:

    modal.Function.from_name("propreel-flashvsr", "flashvsr_upscale_video")

Why FlashVSR (bench: docs/upscale-bench.md):
  * ~$0.0033/video-s on an A100 vs $0.08/s for MiniMax Hailuo-02 Pro
    (the cheapest native-1080p rung) — and Hailuo-02 STANDARD, which
    serves every AI tier since the 2026-10-21 engine unification, has NO
    1080p rung at all, so Premium's 1080p delivery is FlashVSR's job.
  * Runs on A100-80GB (no capacity wall, no frame cap).

Since 2026-10-21 the only production caller is PREMIUM (768p Hailuo
clips → 1080p delivery). Social (512p) and Cinematic (768p) deliver
their native rungs on the 1080p canvas — the 480p/720p target keys below
are kept for the bench tooling and any manual runs.

Two quirks this module bakes in (traced to upstream source, not guessed):
  * F-frame contract — `prepare_input_tensor` returns F = the number of frames
    the pipeline WILL emit (internally F-4 after the streaming loop's
    `process_total_num = (num_frames-1)//8 - 2` windows), so we pass F straight
    to pipe() and save_video(). No over-cut, no trim. (Verified against the
    bench: a 48-frame padded clip reports "Target Frames (8n-3): 45" and the
    pipeline emits exactly 45 frames.) The assembler's exact `-t seg_dur`
    trims any surplus tail anyway.
  * 128-multiple canvas — FlashVSR tiles on a 128 grid. The input is letterbox-
    padded to the nearest 128-multiple canvas, upscaled at 1.5×, then the bars
    are cropped off → pixel-exact delivery resolution. Geometry is derived from
    the clip (no hardcoded per-task dict, unlike the bench).
  * 720p = the 1080p pass, downsampled — the direct 720p canvas pass looked
    visibly softer than the 1080p pass of the same source (client A/B
    2026-10-19), so target 720p runs the identical 1080p inference and the
    crop step lanczos-downsamples to 1280×720 in the same encode. Same method
    for both tiers; 720p costs the same GPU-seconds as 1080p.

Public entrypoints:
  * flashvsr_upscale_video(input_video_url, target_resolution) -> delivery URL
  * flashvsr_upscale_batch(urls, target_resolution) -> list of URLs (for
    render_video's Modal .map hop — every clip upscales concurrently).
"""

import modal

app = modal.App("propreel-flashvsr")

# ── secrets / constants ──────────────────────────────────────────────────────
AWS_SECRET = modal.Secret.from_name("aws-credentials")
S3_BUCKET = "propreel-video-outputs-sa"
S3_REGION = "af-south-1"
# 7-day presigned links — same policy as the render worker's MEDIA_LINK_SECONDS
# (SigV4 static-IAM max) so the delivered URL behaves like every other reel.
MEDIA_LINK_SECONDS = 7 * 24 * 3600
# Modal A100-80GB = $2.50/h (modal.com/pricing) — the bench's measured host.
GPU = "A100-80GB"

# Delivery target -> exact pixel height (the 1.5× canvas step is computed at
# runtime from the clip's real width; we scale to the nearest 128-multiple
# canvas that covers the target, then crop to the exact delivery resolution).
_TARGET_H = {"480p": 480, "720p": 720, "1080p": 1080}
_TARGET_W_LANDSCAPE = {"480p": 854, "720p": 1280, "1080p": 1920}
_TARGET_W_PORTRAIT = {"480p": 480, "720p": 720, "1080p": 1080}
_TARGET_H_PORTRAIT = {"480p": 854, "720p": 1280, "1080p": 1920}


# ── image: CUDA devel + FlashVSR + weights, baked once ───────────────────────
# Mirrors upscale_bench.flashvsr_image (kept byte-compatible so a bench change
# and this endpoint can be diffed). See upscale_bench for the full rationale on
# the clang++/BSA build flags.
flashvsr_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "ffmpeg")
    # FlashVSR's setup.py imports pkg_resources, which setuptools >= 81 no
    # longer ships. Pin the old setuptools in the main env AND export a
    # PIP_CONSTRAINT so any NESTED pip bootstraps that same old setuptools.
    .run_commands("pip install 'setuptools==80.9.0' wheel "
                  "&& echo 'setuptools==80.9.0' > /opt/pip-constraint.txt")
    .run_commands(
        "git clone https://github.com/OpenImagingLab/FlashVSR /opt/FlashVSR",
        "cd /opt/FlashVSR && pip install --extra-index-url https://download.pytorch.org/whl/cu124 -r requirements.txt "
        # Plain (non-editable) wheel install: -e nests an ISOLATED pip that
        # ignores --no-build-isolation. A wheel build runs setup.py in THIS env.
        "&& PIP_CONSTRAINT=/opt/pip-constraint.txt pip install --no-build-isolation .",
        # clang: Modal's add_python CPython bakes LDSHARED='clang++ ...' but
        # the CUDA devel image ships only g++ — all 25 .cu/.cpp objects
        # compile, the final link needs clang++ present. Installed inside THIS
        # (already-failed) layer so cached layers above survive.
        # BLOCK_SPARSE_ATTN_CUDA_ARCHS='80;90': upstream's default emits a
        # compute_120 PTX target that CUDA 12.4's nvcc rejects; we only need
        # sm_80 (A100). MAX_JOBS caps build RAM, per upstream's note.
        "apt-get update && apt-get install -y clang "
        "&& { command -v clang++ >/dev/null 2>&1 || "
        "ln -sf \"$(ls /usr/bin/clang++-* | head -n1)\" /usr/local/bin/clang++; } "
        "&& git clone https://github.com/mit-han-lab/Block-Sparse-Attention /opt/BSA "
        "&& cd /opt/BSA && pip install packaging ninja "
        "&& BLOCK_SPARSE_ATTN_CUDA_ARCHS='80;90' PIP_CONSTRAINT=/opt/pip-constraint.txt "
        "MAX_JOBS=4 pip install --no-build-isolation .",
        # Weights baked into the image layer (~8GB once).
        "pip install 'huggingface_hub==0.34.4' && python -c \""
        "from huggingface_hub import snapshot_download; "
        "snapshot_download('JunhaoZhuang/FlashVSR-v1.1', "
        "local_dir='/opt/FlashVSR/examples/WanVSR/FlashVSR-v1.1')\"",
    )
    # boto3 for S3; modelscope because FlashVSR's vendored diffsynth imports
    # it unguarded at diffsynth/models/downloader.py without declaring it.
    # requests: _fetch's HTTP fallback for external (non-S3) clip URLs.
    .pip_install("boto3", "modelscope", "requests")
)


def _s3():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3", region_name=S3_REGION,
        config=Config(s3={"addressing_style": "virtual"}),
    )


def _presign_get(key: str, expires_in: int = MEDIA_LINK_SECONDS) -> str:
    return _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key, "ResponseContentType": "video/mp4"},
        ExpiresIn=expires_in,
    )


def _fetch(url: str) -> bytes:
    """Download a clip. Handles both our own S3 objects (private bucket — go
    through the S3 API so a presigned or raw URL both work) and external URLs
    (fal.ai) via plain HTTP."""
    from urllib.parse import urlparse
    import boto3
    p = urlparse(url)
    if p.netloc.endswith(f"s3.{S3_REGION}.amazonaws.com") or S3_BUCKET in p.netloc:
        key = p.path.lstrip("/")
        return _s3().get_object(Bucket=S3_BUCKET, Key=key)["Body"].read()
    import requests
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    return r.content


def _nearest_128(n: int) -> int:
    """Round UP to the nearest 128-multiple (FlashVSR tiles on a 128 grid)."""
    return ((n + 127) // 128) * 128


def _upscale_one(input_video_url: str, target_resolution: str = "1080p",
                 portrait: bool = False) -> dict:
    """Upscale one clip to the delivery resolution. Shared by the single-video
    entrypoint and the batch entrypoint (both run inside a GPU container).

    Returns a dict with the delivery URL, the exact output dims and timings.
    """
    import importlib.util
    import os
    import subprocess
    import sys
    import time

    from urllib.parse import urlparse

    if target_resolution not in _TARGET_H:
        raise ValueError(f"target_resolution must be one of {list(_TARGET_H)}, got {target_resolution!r}")

    work = "/tmp/fv"; os.makedirs(work, exist_ok=True)
    s3 = _s3()

    # ── fetch + probe the real clip ─────────────────────────────────────────
    in_path = os.path.join(work, "in.mp4")
    with open(in_path, "wb") as f:
        f.write(_fetch(input_video_url))
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,nb_frames,r_frame_rate",
         "-of", "csv=p=0", in_path], capture_output=True, text=True, check=True)
    _w, _h, _nb, _fps = (probe.stdout.strip().split(",") + ["0", "24"])[:4]
    src_w, src_h = int(_w), int(_h)
    try:
        fps = float(eval(_fps)) if "/" in _fps else float(_fps or 24)
    except Exception:
        fps = 24.0
    if not _nb.isdigit():  # N/A — count real frames
        _c = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-count_frames", "-show_entries", "stream=nb_read_frames",
             "-of", "csv=p=0", in_path], capture_output=True, text=True, check=True)
        _nb = _c.stdout.strip()
    in_len = int(_nb) if _nb.isdigit() and int(_nb) > 0 else int(round(fps * 5))

    # ── delivery target + 128-multiple canvas ───────────────────────────────
    if portrait:
        out_w, out_h = _TARGET_W_PORTRAIT[target_resolution], _TARGET_H_PORTRAIT[target_resolution]
    else:
        out_w, out_h = _TARGET_W_LANDSCAPE[target_resolution], _TARGET_H[target_resolution]

    # 720p parity (2026-10-19 client A/B): the direct 720p pass (512-tall
    # canvas → sparse budget over half the pixels of the 1080p pass) rendered
    # visibly softer than the 1080p pass of the SAME source — client called
    # the gap "big" and asked for 720p on par. So a 720p target now runs the
    # EXACT 1080p pass (identical canvas, identical inference) and is
    # downsampled to 720p delivery inside the same ffmpeg crop hop — one
    # encode, same framing, and the two tiers can never drift apart again.
    # Cost note: a 720p target now costs the same GPU-seconds as 1080p.
    proc_w, proc_h = out_w, out_h
    if target_resolution == "720p":
        if portrait:
            proc_w, proc_h = _TARGET_W_PORTRAIT["1080p"], _TARGET_H_PORTRAIT["1080p"]
        else:
            proc_w, proc_h = _TARGET_W_LANDSCAPE["1080p"], _TARGET_H["1080p"]
    # FlashVSR upscales at 1.5×; the canvas is the PROCESS height rounded UP
    # to the nearest 128-multiple (tiles divide evenly), width kept to the
    # source aspect. After upscale we center-crop the process window, then
    # (when delivery ≠ process) downsample to the exact out_w×out_h.
    canvas_h = _nearest_128(int(round(proc_h / 1.5)))
    canvas_w = _nearest_128(int(round(canvas_h * (src_w / src_h))))

    def _pad(src, dst, w, h):
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", src,
             "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                    f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
             "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", dst],
            check=True)

    padded = os.path.join(work, "pad.mp4")
    _pad(in_path, padded, canvas_w, canvas_h)

    # ── load FlashVSR pipeline (reused across warm calls in this container) ─
    ex_dir = "/opt/FlashVSR/examples/WanVSR"
    os.chdir(ex_dir); sys.path.insert(0, ex_dir)
    spec = importlib.util.spec_from_file_location("fv_example", f"{ex_dir}/infer_flashvsr_v1.1_tiny.py")
    fv = importlib.util.module_from_spec(spec); spec.loader.exec_module(fv)
    import torch

    t0 = time.time()
    pipe = fv.init_pipeline()
    load_s = time.time() - t0

    # ── inference (byte-for-byte the bench's proven call) ───────────────────
    torch.cuda.empty_cache(); torch.cuda.ipc_collect()
    LQ, th, tw, F, fps = fv.prepare_input_tensor(
        padded, scale=1.5, dtype=torch.bfloat16, device="cuda")
    # prepare_input_tensor returns F = the number of frames the pipeline WILL
    # EMIT (verified in the bench: a 48-frame padded clip reports
    # "Target Frames (8n-3): 45" and pipe() emits exactly 45 frames at
    # num_frames=F). Pass F straight through — no over-cut, no trim. The
    # assembler's exact -t seg_dur trims any surplus tail anyway.
    t1 = time.time()
    video = pipe(
        prompt="", negative_prompt="", cfg_scale=1.0, num_inference_steps=1, seed=0,
        LQ_video=LQ, num_frames=F, height=th, width=tw,
        is_full_block=False, if_buffer=True,
        # upstream formula: sparsity budget normalized to canvas area
        topk_ratio=2.0 * 768 * 1280 / (th * tw), kv_ratio=3.0, local_range=11,
        color_fix=True,
    )
    torch.cuda.synchronize()
    infer_s = time.time() - t1
    raw = os.path.join(work, "raw.mp4")
    fv.save_video(fv.tensor2video(video), raw, fps=int(fps), quality=6)

    # ── crop letterbox bars → delivery dims (one encode; 720p also
    # downsampled from the 1080p-class process window, lanczos) ───────────────
    scaled_h = int(round(canvas_h * 1.5))
    scaled_w = int(round(canvas_w * 1.5))
    crop_x = max(0, (scaled_w - proc_w) // 2)
    crop_y = max(0, (scaled_h - proc_h) // 2)
    vf = f"crop={proc_w}:{proc_h}:{crop_x}:{crop_y}"
    if (proc_w, proc_h) != (out_w, out_h):
        vf += f",scale={out_w}:{out_h}:flags=lanczos"
    out_path = os.path.join(work, "out.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", raw,
         "-vf", vf,
         "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", out_path],
        check=True)

    # ── upload + presigned delivery link ────────────────────────────────────
    base = os.path.basename(urlparse(input_video_url).path) or "clip.mp4"
    if base.endswith(".mp4"):
        base = base[:-4]
    key = f"upscaled/{base}_{target_resolution}.mp4"
    s3.upload_file(out_path, S3_BUCKET, key, ExtraArgs={"ContentType": "video/mp4"})
    url = _presign_get(key)

    return {
        "url": url,
        "key": key,
        "width": out_w,
        "height": out_h,
        "load_s": round(load_s, 1),
        "infer_s": round(infer_s, 1),
        "wall_s": round(time.time() - t0, 1),
        "engine": "flashvsr-v1.1-tiny",
    }


@app.function(
    image=flashvsr_image,
    secrets=[AWS_SECRET],
    gpu=GPU,
    timeout=900,
    retries=2,
    min_containers=0,
    # 2026-10-23 QUOTA FIX: the render fans this function out ONE CALL PER
    # CLIP (.map), and the workspace cap is 10 GPUs — the old 20-container
    # ceiling meant two overlapping reels (or one 12-photo reel plus idle
    # stragglers) tripped Modal's GPU-limit email and throttling. Six is a
    # deliberate ceiling under the cap: a 12-clip reel upscaling in two
    # waves costs ~one extra inference of wall-clock instead of a quota
    # breach, and calls beyond the ceiling QUEUE (they never fail).
    max_containers=6,
    # Idle A100s still count against the GPU quota AND bill per second —
    # 120s (was 300s) releases them right after a reel's last clip.
    scaledown_window=120,
)
def flashvsr_upscale_video(input_video_url: str, target_resolution: str = "1080p",
                           portrait: bool = False) -> dict:
    """Upscale one clip to the delivery resolution (public entrypoint).

    render_video uses flashvsr_upscale_video.map so N clips upscale
    concurrently (bounded by max_containers=6), each container loading the
    pipeline once.
    """
    return _upscale_one(input_video_url, target_resolution, portrait)


@app.function(
    image=flashvsr_image,
    secrets=[AWS_SECRET],
    gpu=GPU,
    timeout=1800,
    min_containers=0,
    # Same quota posture as the per-clip entrypoint above: at most two batch
    # containers alive at once (one render ≈ one GPU), fast release after.
    max_containers=2,
    scaledown_window=120,
)
def flashvsr_upscale_batch(input_video_urls: list, target_resolution: str = "1080p",
                           portrait: bool = False) -> list:
    """Upscale N clips sequentially in ONE container (single model load).

    For a full render fan-out, render_video calls flashvsr_upscale_video.map
    so each clip is concurrent; this batch entrypoint amortizes one model load
    across many clips when latency is not the bottleneck.
    """
    out = []
    for u in input_video_urls:
        try:
            out.append(_upscale_one(u, target_resolution, portrait))
        except Exception as e:
            out.append({"error": f"{type(e).__name__}: {e}", "input": u})
    return out
