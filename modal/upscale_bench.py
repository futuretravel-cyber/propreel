"""
Upscale benchmark (2026-10-19, v2 — objective quality matrix).

Question: fal's wan-25-preview charges $0.05/s @480p, $0.10/s @720p,
$0.15/s @1080p. Generating at the CHEAP resolution and upscaling on our own
Modal GPU with an open-source video restorer would arbitrage that ladder —
IF quality holds (now measured, not eyeballed) and GPU-seconds cost less than
the $0.05/video-s tier step.

Matrix (v2): 4 clips × 2 durations × 2 up-samples = 16 tasks per engine.
  clips    kitchen (768x1280 portrait real-estate photo, 4s, 24fps),
           land    (1920x1080 brand render, 33s, 24fps),
           logofit (1920x1080 motion graphics, 33s, 24fps),
           ab      (1920x1080 product A/B render, 5s, 30fps)
  durations 2s and 5s from non-overlapping segments (short sources clamp)

Metrics: VMAF + PSNR + SSIM of each engine output vs the NATIVE reference at
delivery resolution, one ffmpeg pass per pair:
  [0:v]split=3 → libvmaf(model=path=<vmaf_v0.6.1.json>) | psnr | ssim
Debian's ffmpeg has NO libvmaf, so metrics use imageio-ffmpeg's bundled
static ffmpeg 7.0.2 (johnvansickle build — verified to carry libvmaf).
ffmpeg 7 removed `model_path=`, so the syntax is `model=path=`.
Both sides are first trimmed to N=min(frames) with a lossless yuv420p
re-encode (x264 crf 0 — pixel-identical when already yuv420p) so frame
counts/dims/pixfmt always match: FlashVSR emits 8n+1 frames (>= input),
SeedVR2 trims to exactly the input length.

Engines (unchanged images — see v1 history for the build saga):
  * FlashVSR v1.1   — A100-80GB, $2.50/h. 1.5x delivery step, inputs padded
                      so the DiT's 128-multiple canvas lands exact
                      (854x480->512->768, 1280x720->768->1152), bars cropped
                      → pixel-exact 1280x720 / 1920x1080.
  * SeedVR2-3B      — H100, $3.95/h (ByteDance's apex wheel ships sm_90-only
                      cubins; A100 dies with 'no kernel image'). One torchrun
                      per task (per-task isolation; wall includes model load —
                      honest scale-to-zero cost).

Zero fal calls, zero credits. Usage:
  cd modal && PYTHONIOENCODING=utf-8 modal run upscale_bench.py
"""

import json
import os
import time
from pathlib import Path

import modal

app = modal.App("propreel-upscale-bench")

AWS_SECRET = modal.Secret.from_name("aws-credentials")
S3_BUCKET = "propreel-video-outputs-sa"
S3_REGION = "af-south-1"
# Browser-reviewable links; 7d is the SigV4 max for static IAM keys.
LINK_SECONDS = 7 * 24 * 3600

GPU = "A100-80GB"
A100_USD_PER_HOUR = 2.50
# SeedVR2 must run on H100: ByteDance's official apex wheel (fused rms-norm,
# modulation, softmax kernels) ships sm_90-only cubins — no PTX fallback — so
# the A100 (sm_80) dies at the first DiT block ('no kernel image' at
# dit_v2/modulation.py). flash_attn's wheel covers sm_80; apex is the blocker.
# Modal H100 = $0.001097/s = $3.95/h (modal.com/pricing).
H100 = "H100"
H100_USD_PER_HOUR = 3.95

# fal tier step we stop paying: 480->720 saves 0.10-0.05, 720->1080 saves
# 0.15-0.10 → $0.05/video-s either direction.
HEADROOM = 0.05

# clip id -> (mounted source path, {duration: segment start seconds}).
# land/logofit are 33s so the two durations sample NON-overlapping segments
# (d5 from 3s, d2 from 14s); short sources clamp to what exists.
CLIPS = {
    "kitchen": ("/bench/src_kitchen.mp4", {2: 0, 5: 0}),
    "land":    ("/bench/src_land.mp4",    {2: 14, 5: 3}),
    "logofit": ("/bench/src_logofit.mp4", {2: 14, 5: 3}),
    "ab":      ("/bench/src_ab.mp4",      {2: 0, 5: 0}),
}
DURATIONS = [2, 5]
# delivery test -> (input size, padded canvas, output size, ref key name)
TESTS = {
    # 854x480 -> pad 512 -> x1.5 = 768 (=6x128) -> crop bars -> 1280x720
    "480to720": {"in": (854, 480), "pad": (854, 512), "out": (1280, 720),
                 "ref": "ref720", "res": (720, 1280)},
    # 1280x720 -> pad 768 -> x1.5 = 1152 (=9x128) -> crop bars -> 1920x1080
    "720to1080": {"in": (1280, 720), "pad": (1280, 768), "out": (1920, 1080),
                  "ref": "ref1080", "res": (1080, 1920)},
}


# ── shared helpers (mirrors app_propreel_minimax.py; keep addressing_style
# 'virtual' — botocore's default 'auto' 400s against af-south-1) ─────────────
def _s3():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3", region_name=S3_REGION,
        config=Config(s3={"addressing_style": "virtual"}),
    )


def _upload(local_path: str, key: str, contentType: str = "video/mp4") -> dict:
    _s3().upload_file(local_path, S3_BUCKET, key, ExtraArgs={"ContentType": contentType})
    url = _s3().generate_presigned_url(
        "get_object", Params={"Bucket": S3_BUCKET, "Key": key}, ExpiresIn=LINK_SECONDS
    )
    return {"key": key, "url": url}


def _put_json(obj: dict, key: str) -> None:
    """Sidecar result cache: lets a rerun resume past completed GPU tasks."""
    p = Path("/tmp") / (key.replace("/", "_") + ".json")
    p.write_text(json.dumps(obj))
    _upload(str(p), key, "application/json")
    p.unlink(missing_ok=True)


def _get_json(key: str) -> dict:
    body = _s3().get_object(Bucket=S3_BUCKET, Key=key)["Body"].read()
    return json.loads(body)


# ── CPU image: cuts, metrics, comparisons ───────────────────────────────────
bench_image = (
    modal.Image.debian_slim(python_version="3.11")
    # fonts-dejavu-core: drawtext's fontfile=… needs a font (debian_slim has
    # none). imageio-ffmpeg: its bundled static ffmpeg 7.0.2 is the ONLY
    # binary here with libvmaf (Debian's ffmpeg lacks it — probed).
    .apt_install("ffmpeg", "fonts-dejavu-core")
    .pip_install("boto3", "requests", "imageio-ffmpeg")
    # VMAF model baked at build (assert guards a truncated download).
    .run_commands(
        "mkdir -p /bench && python -c \"import requests,pathlib;"
        "r=requests.get('https://raw.githubusercontent.com/Netflix/vmaf/master/"
        "model/vmaf_v0.6.1.json',timeout=120);r.raise_for_status();"
        "assert len(r.content)>10000,'vmaf model too small';"
        "pathlib.Path('/bench/vmaf_v0.6.1.json').write_bytes(r.content)\""
    )
    .add_local_file(
        str(Path(__file__).resolve().parent.parent / "public" / "media" / "kitchen-after.mp4"),
        "/bench/src_kitchen.mp4")
    .add_local_file(
        str(Path(__file__).resolve().parent.parent / ".tmp_brand" / "land_render.mp4"),
        "/bench/src_land.mp4")
    .add_local_file(
        str(Path(__file__).resolve().parent.parent / "out" / "test_logofit_ess_001.mp4"),
        "/bench/src_logofit.mp4")
    .add_local_file(
        str(Path(__file__).resolve().parent.parent / "out" / "ab_new.mp4"),
        "/bench/src_ab.mp4")
)


# ── CPU: cut the whole matrix (inputs + native references) ──────────────────
@app.function(image=bench_image, secrets=[AWS_SECRET], timeout=900, cpu=2)
def prepare_inputs() -> dict:
    """Cut every (clip, duration, file) and upload to S3.

    in480 / in720 = what fal would hand us at the cheap price points.
    ref720 / ref1080 = NATIVE bars (pure downscale of a 1080p+ source; for
    the portrait kitchen clip every panel shares the same 16:9 squeeze, so
    the comparison stays fair though the pixels are re-mapped). A reference
    is only produced when the source genuinely has those pixels.
    Returns {tasks: [...], sources: {...}}; each task carries both engine
    inputs and the matching reference key.
    """
    import subprocess

    work = Path("/tmp/bench"); work.mkdir(exist_ok=True)
    tasks, sources = [], {}

    def probe(p):
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,r_frame_rate:format=duration",
             "-of", "json", str(p)],
            capture_output=True, text=True, check=True)
        d = json.loads(out.stdout)
        s = d["streams"][0]
        num, _, den = s["r_frame_rate"].partition("/")
        fps = float(num) / float(den or 1)
        return s["width"], s["height"], fps, float(d["format"]["duration"])

    def cut(src, out, w, h, off, seconds):
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", str(off), "-t", str(seconds),
             "-i", str(src), "-vf", f"scale={w}:{h}", "-an",
             "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(out)],
            check=True)

    for clip, (src_path, offsets) in CLIPS.items():
        w, h, fps, src_dur = probe(src_path)
        sources[clip] = {"wh": f"{w}x{h}", "fps": fps, "dur_s": round(src_dur, 2)}
        print(f"source {clip}: {w}x{h} @ {fps:.2f}fps, {src_dur:.1f}s")
        if h < 480:
            print(f"  skip {clip}: too small ({w}x{h})")
            continue
        for dur in DURATIONS:
            off = offsets[dur]
            actual = min(dur, max(0.0, src_dur - off))
            if actual < 0.75:
                print(f"  skip {clip}_d{dur}: only {actual:.2f}s at offset {off}")
                continue
            keys = {}
            # explicit, readable cuts per role:
            files = {
                "in480": TESTS["480to720"]["in"],
                "in720": (1280, 720),
                "ref720": (1280, 720),
                "ref1080": (1920, 1080),
            }
            for fname, (tw, th) in files.items():
                if fname == "ref1080" and h < 1080:
                    continue
                if th > h and fname.startswith("ref"):
                    # never upscale a "native" bar
                    print(f"  {clip}: source {h}p < {th}p, skipping {fname}")
                    continue
                local = work / f"{clip}_d{dur}_{fname}.mp4"
                cut(src_path, local, tw, th, off, actual)
                up = _upload(str(local), f"bench/upscale/{clip}/d{dur}/{fname}.mp4")
                keys[fname] = up["key"]
            for test, cfg in TESTS.items():
                ref_key = keys.get(cfg["ref"])
                if "in480" not in keys or "in720" not in keys or not ref_key:
                    continue
                in_key = keys["in480"] if test == "480to720" else keys["in720"]
                pw, ph = cfg["pad"]
                ow, oh = cfg["out"]
                tasks.append({
                    "name": f"{clip}_d{dur}_{test}",
                    "clip": clip, "dur": dur, "actual": round(actual, 2),
                    "test": test, "in_key": in_key, "ref_key": ref_key,
                    "pw": pw, "ph": ph, "ow": ow, "oh": oh,
                })

    if not tasks:
        raise RuntimeError("no tasks built — check source availability")
    print(json.dumps({"tasks": len(tasks), "names": [t["name"] for t in tasks]}, indent=2))
    return {"tasks": tasks, "sources": sources}


# ── FlashVSR engine (torch 2.6+cu124, BSA compiled at image build) ──────────
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
    .pip_install("boto3", "modelscope")
)


@app.function(image=flashvsr_image, secrets=[AWS_SECRET], gpu=GPU, timeout=1800)
def flashvsr_engine(tasks: list) -> dict:
    """1.5x upscale of every task's cheap-tier input, timed per task.

    Pipeline loads ONCE; the 16 tasks loop through it. Inputs are padded
    (480->512, 720->768 high) BEFORE inference so the 128-multiple canvas
    math lands on exact multiples; bars are cropped off afterwards →
    pixel-exact 1280x720 / 1920x1080 deliverables.
    """
    import importlib.util
    import subprocess
    import sys

    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3", region_name=S3_REGION,
                      config=Config(s3={"addressing_style": "virtual"}))

    work = Path("/tmp/fv"); work.mkdir(exist_ok=True)

    def pad(src, dst, w, h):
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(src),
             "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                    f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
             "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(dst)],
            check=True)

    # Reuse the upstream example module VERBATIM (init_pipeline,
    # prepare_input_tensor, tensor2video, save_video) — load by path; chdir +
    # sys.path so its `from utils.utils import ...` resolves in examples/WanVSR.
    ex_dir = "/opt/FlashVSR/examples/WanVSR"
    os.chdir(ex_dir); sys.path.insert(0, ex_dir)
    spec = importlib.util.spec_from_file_location("fv_example", f"{ex_dir}/infer_flashvsr_v1.1_tiny.py")
    fv = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fv)

    import torch

    t0 = time.time()
    pipe = fv.init_pipeline()
    load_s = time.time() - t0
    print(f"[flashvsr] pipeline load: {load_s:.1f}s")

    results = {"engine": "flashvsr-v1.1-tiny", "gpu": GPU,
               "load_s": round(load_s, 1), "tests": {}}
    for t in tasks:
        name = t["name"]
        # Resume-skip: successful tasks leave a result sidecar; a rerun after
        # a partial failure must not pay for completed GPU work.
        try:
            results["tests"][name] = _get_json(f"bench/upscale/{name}/flashvsr.json")
            print(f"[flashvsr] {name}: resume-skip (cached)")
            continue
        except Exception:
            pass
        # Outputs from runs made BEFORE sidecars existed: skip on the mp4
        # itself (timings for those live in that run's report, not here).
        try:
            s3.head_object(Bucket=S3_BUCKET, Key=f"bench/upscale/{name}/flashvsr.mp4")
            results["tests"][name] = {"out_key": f"bench/upscale/{name}/flashvsr.mp4",
                                       "cached": True}
            print(f"[flashvsr] {name}: resume-skip (mp4 exists)")
            continue
        except Exception:
            pass
        torch.cuda.empty_cache(); torch.cuda.ipc_collect()
        try:
            in_path = work / f"in_{name}.mp4"
            s3.download_file(S3_BUCKET, t["in_key"], str(in_path))
            padded = work / f"pad_{name}.mp4"
            pad(in_path, padded, t["pw"], t["ph"])

            t1 = time.time()
            LQ, th, tw, F, fps = fv.prepare_input_tensor(
                str(padded), scale=1.5, dtype=torch.bfloat16, device="cuda")
            prep_s = time.time() - t1
            t2 = time.time()
            video = pipe(
                prompt="", negative_prompt="", cfg_scale=1.0, num_inference_steps=1, seed=0,
                LQ_video=LQ, num_frames=F, height=th, width=tw, is_full_block=False, if_buffer=True,
                # upstream formula: sparsity budget normalized to canvas area
                topk_ratio=2.0 * 768 * 1280 / (th * tw), kv_ratio=3.0, local_range=11,
                color_fix=True,
            )
            torch.cuda.synchronize()
            infer_s = time.time() - t2
            raw = work / f"raw_{name}.mp4"
            fv.save_video(fv.tensor2video(video), str(raw), fps=int(fps), quality=6)
            # Crop the letterbox bars: th = ph*1.5 exactly; bars occupy
            # (th-oh)/2 rows top and bottom. Exact integer math.
            bar_y = (th - t["oh"]) // 2
            out = work / f"out_{name}.mp4"
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", str(raw),
                 "-vf", f"crop={t['ow']}:{t['oh']}:0:{bar_y}", "-c:v", "libx264",
                 "-crf", "16", "-pix_fmt", "yuv420p", str(out)],
                check=True)
            up = _upload(str(out), f"bench/upscale/{name}/flashvsr.mp4")
            per_video_s = (prep_s + infer_s) / t["actual"]
            results["tests"][name] = {
                "out_key": up["key"], "out_url": up["url"],
                "canvas": f"{tw}x{th}", "frames": F,
                "prep_s": round(prep_s, 1), "infer_s": round(infer_s, 1),
                "gpu_s_per_video_s": round(per_video_s, 2),
                "usd_per_video_s": round(per_video_s * A100_USD_PER_HOUR / 3600, 5),
            }
            _put_json(results["tests"][name], f"bench/upscale/{name}/flashvsr.json")
            print(f"[flashvsr] {name}: canvas {tw}x{th}, {infer_s:.1f}s infer, "
                  f"{per_video_s:.2f} GPU-s per video-s")
            del video, LQ; torch.cuda.empty_cache()
        except Exception as e:
            print(f"[flashvsr] {name} FAILED: {e!r}")
            results["tests"][name] = {"error": repr(e)}
        for f in work.glob(f"*_{name}.mp4"):
            try:
                f.unlink()
            except OSError:
                pass

    print(json.dumps(results, indent=2))
    return results


# ── SeedVR2 engine (torch 2.3.0; apex + flash_attn as prebuilt wheels) ──────
seedvr_image = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "ffmpeg")
    .pip_install(
        "torch==2.3.0", "torchvision==0.18.0",
        # cp310 / torch2.3 / cu12 — exact ABI match. The model imports
        # flash_attn unconditionally (models/dit_v2/attention.py).
        "flash_attn @ https://github.com/Dao-AILab/flash-attention/releases/download/v2.5.9.post1/flash_attn-2.5.9.post1+cu122torch2.3cxx11abiFALSE-cp310-cp310-linux_x86_64.whl",
        # ByteDance's apex wheel (their config uses fusedrms/fusedln norms).
        # NOTE: sm_90-only — the reason this engine runs on H100.
        "apex @ https://huggingface.co/ByteDance-Seed/SeedVR2-3B/resolve/main/apex-0.1-cp310-cp310-linux_x86_64.whl",
        # torchvision read_video needs the pyav backend; upstream forgets it.
        "av",
    )
    .run_commands(
        "git clone https://github.com/ByteDance-Seed/SeedVR /opt/SeedVR",
        "cd /opt/SeedVR && pip install -r requirements.txt",
        # ckpts/ next to repo root: config + script hardcode ./ckpts/*.pth.
        "cd /opt/SeedVR && python -c \""
        "from huggingface_hub import snapshot_download; "
        "snapshot_download('ByteDance-Seed/SeedVR2-3B', local_dir='/opt/SeedVR/ckpts', "
        "allow_patterns=['*.safetensors','*.pth','*.pt','*.json'])\"",
    )
    .pip_install("boto3")
    # VAE-decode OOM fix: >~90 frames @1080p OOMs on H100-80GB
    # (torch.cuda.OutOfMemoryError in an up-block silu during vae_decode).
    # vae.memory_limit budgets conv/norm chunk planning as a fraction of
    # device memory; 0.5 lets a 3.93GiB activation through once free memory is
    # fragmented. 0.2 = smaller chunks/activations, same math sliced.
    # Guarded so the layer FAILS if the config's wording ever drifts.
    .run_commands(
        "sed -i 's/conv_max_mem: 0.5/conv_max_mem: 0.2/; s/norm_max_mem: 0.5/norm_max_mem: 0.2/' "
        "/opt/SeedVR/configs_3b/main.yaml "
        "&& grep -q 'conv_max_mem: 0.2' /opt/SeedVR/configs_3b/main.yaml "
        "&& grep -q 'norm_max_mem: 0.2' /opt/SeedVR/configs_3b/main.yaml"
    )
)


@app.function(image=seedvr_image, secrets=[AWS_SECRET], gpu=H100, timeout=3600)
def seedvr2_engine(tasks: list) -> dict:
    """One torchrun per task (per-task isolation; a failure can't kill siblings).

    The script ingests a whole directory — one file per dir. Output keeps the
    input basename and is trimmed to exactly ori_length, so metrics pair
    frame-for-frame. wall_s includes torchrun launch + model load + inference:
    load is a one-off per container, but scale-to-zero makes it REAL
    production cost for small batches, so don't hide it.
    """
    import subprocess

    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3", region_name=S3_REGION,
                      config=Config(s3={"addressing_style": "virtual"}))

    work = Path("/tmp/svr"); work.mkdir(exist_ok=True)
    results = {"engine": "seedvr2-3b", "gpu": H100, "tests": {}}
    for t in tasks:
        name = t["name"]
        # Resume-skip via result sidecar (failures are NOT cached → retried).
        try:
            results["tests"][name] = _get_json(f"bench/upscale/{name}/seedvr2.json")
            print(f"[seedvr2] {name}: resume-skip (cached)")
            continue
        except Exception:
            pass
        try:
            s3.head_object(Bucket=S3_BUCKET, Key=f"bench/upscale/{name}/seedvr2.mp4")
            results["tests"][name] = {"out_key": f"bench/upscale/{name}/seedvr2.mp4",
                                       "cached": True}
            print(f"[seedvr2] {name}: resume-skip (mp4 exists)")
            continue
        except Exception:
            pass
        rh, rw = TESTS[t["test"]]["res"]
        in_dir = work / f"in_{name}"; out_dir = work / f"out_{name}"
        in_dir.mkdir(parents=True, exist_ok=True)
        try:
            s3.download_file(S3_BUCKET, t["in_key"], str(in_dir / f"{name}.mp4"))

            # PYTHONPATH: torchrun puts the SCRIPT's dir (projects/) on
            # sys.path, not the repo root — `from data.image...` /
            # `from common...` need the root on the path.
            env = {**os.environ,
                   "PYTHONPATH": "/opt/SeedVR" +
                   ((os.pathsep + os.environ["PYTHONPATH"]) if os.environ.get("PYTHONPATH") else "")}
            t0 = time.time()
            proc = subprocess.run(
                ["torchrun", "--nproc-per-node=1", "projects/inference_seedvr2_3b.py",
                 "--video_path", str(in_dir), "--output_dir", str(out_dir),
                 "--res_h", str(rh), "--res_w", str(rw), "--sp_size", "1", "--seed", "666"],
                cwd="/opt/SeedVR", capture_output=True, text=True, env=env,
            )
            wall_s = time.time() - t0
            if proc.returncode != 0:
                (work / f"{name}_child.log").write_text(
                    proc.stdout + "\n--- stderr ---\n" + proc.stderr)
                tail = (proc.stdout + proc.stderr)[-8000:]
                print(f"[seedvr2] {name} FAILED rc={proc.returncode} after {wall_s:.0f}s:\n{tail}")
                results["tests"][name] = {"error": f"rc={proc.returncode}",
                                          "wall_s": round(wall_s, 1)}
                continue

            outs = sorted(out_dir.glob("*.mp4"))
            if not outs:
                results["tests"][name] = {"error": "no output mp4",
                                          "wall_s": round(wall_s, 1)}
                continue
            up = _upload(str(outs[0]), f"bench/upscale/{name}/seedvr2.mp4")
            per_video_s = wall_s / t["actual"]
            results["tests"][name] = {
                "out_key": up["key"], "out_url": up["url"],
                "wall_s": round(wall_s, 1),
                "gpu_s_per_video_s": round(per_video_s, 2),
                "usd_per_video_s": round(per_video_s * H100_USD_PER_HOUR / 3600, 5),
            }
            _put_json(results["tests"][name], f"bench/upscale/{name}/seedvr2.json")
            print(f"[seedvr2] {name}: {wall_s:.0f}s wall, {per_video_s:.2f} GPU-s per video-s")
        except Exception as e:
            print(f"[seedvr2] {name} FAILED: {e!r}")
            results["tests"][name] = {"error": repr(e)}
        for d in (in_dir, out_dir):
            import shutil
            shutil.rmtree(d, ignore_errors=True)

    print(json.dumps(results, indent=2))
    return results


# ── CPU: objective quality — VMAF / PSNR / SSIM vs native, one pass per pair ─
@app.function(image=bench_image, secrets=[AWS_SECRET], timeout=3600, cpu=4)
def compute_metrics(tasks: list, flash: dict, seed: dict) -> dict:
    """Grade every engine output against its NATIVE reference.

    VMAF via imageio-ffmpeg's static ffmpeg (Debian's has no libvmaf),
    `model=path=` syntax (ffmpeg 7 removed model_path), PSNR + SSIM in the
    same graph. Both sides are losslessly trimmed to the common frame count
    first so pairing is exact from frame 0.
    """
    import re
    import subprocess

    import boto3
    import imageio_ffmpeg
    from botocore.config import Config
    s3 = boto3.client("s3", region_name=S3_REGION,
                      config=Config(s3={"addressing_style": "virtual"}))

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    model = "/bench/vmaf_v0.6.1.json"
    work = Path("/tmp/m"); work.mkdir(exist_ok=True)

    def probe(p):
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,r_frame_rate,nb_frames,pix_fmt:format=duration",
             "-of", "json", str(p)],
            capture_output=True, text=True, check=True)
        d = json.loads(out.stdout)
        s = d["streams"][0]
        num, _, den = (s.get("r_frame_rate") or "0/1").partition("/")
        fps = float(num) / float(den or 1)
        frames = s.get("nb_frames")
        if not frames or frames == "N/A":
            frames = round(float(d["format"]["duration"]) * fps)
        return {"w": s["width"], "h": s["height"], "fps": fps,
                "frames": int(frames), "pix_fmt": s.get("pix_fmt")}

    pairs = {}
    for t in tasks:
        name = t["name"]
        pairs[name] = {}
        ref_p = work / f"{name}_ref.mp4"
        try:
            s3.download_file(S3_BUCKET, t["ref_key"], str(ref_p))
            ref_m = probe(ref_p)
        except Exception as e:
            print(f"[metrics] {name}: ref probe failed: {e!r}")
            continue

        for eng_name, eng in (("flashvsr", flash), ("seedvr2", seed)):
            entry: dict = {}
            pairs[name][eng_name] = entry
            t_res = eng.get("tests", {}).get(name, {})
            out_key = t_res.get("out_key") or f"bench/upscale/{name}/{eng_name}.mp4"
            try:
                s3.head_object(Bucket=S3_BUCKET, Key=out_key)
            except Exception:
                entry["error"] = t_res.get("error", "no output")
                continue
            try:
                eng_p = work / f"{name}_{eng_name}.mp4"
                s3.download_file(S3_BUCKET, out_key, str(eng_p))
                eng_m = probe(eng_p)
                entry["eng_pix_fmt"] = eng_m["pix_fmt"]
                crop_ref = None
                if (eng_m["w"], eng_m["h"]) != (ref_m["w"], ref_m["h"]):
                    dw = ref_m["w"] - eng_m["w"]
                    dh = ref_m["h"] - eng_m["h"]
                    if 0 <= dw <= 32 and 0 <= dh <= 32:
                        # SeedVR2 floors delivery dims to a multiple of 16
                        # (1080 -> 1072): center-crop the REF to what the
                        # engine actually delivered — judge that region,
                        # never rescale (rescaling would flatter the engine).
                        crop_ref = (eng_m["w"], eng_m["h"])
                        entry["dim_note"] = (f"engine {eng_m['w']}x{eng_m['h']}, "
                                             f"ref center-cropped from "
                                             f"{ref_m['w']}x{ref_m['h']}")
                    else:
                        entry["error"] = (f"dim mismatch {eng_m['w']}x{eng_m['h']} "
                                          f"vs ref {ref_m['w']}x{ref_m['h']}")
                        continue
                if eng_m["fps"] != ref_m["fps"]:
                    entry["fps_note"] = f"eng {eng_m['fps']} vs ref {ref_m['fps']}"

                n = min(eng_m["frames"], ref_m["frames"])
                entry["frames"] = n
                trimmed = {}
                for tag, p in (("ref", ref_p), ("eng", eng_p)):
                    tp = work / f"{name}_{eng_name}_{tag}_t.mp4"
                    # lossless x264 (crf 0) + forced 420 → pixel-identical
                    # when already yuv420p; guarantees equal counts/dims/fmt.
                    vf = (f"crop={crop_ref[0]}:{crop_ref[1]}:"
                          f"(iw-{crop_ref[0]})/2:(ih-{crop_ref[1]})/2") if (tag == "ref" and crop_ref) else None
                    cmd = [ff, "-y", "-v", "error", "-i", str(p)]
                    if vf:
                        cmd += ["-vf", vf]
                    cmd += ["-frames:v", str(n),
                            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0",
                            "-pix_fmt", "yuv420p", str(tp)]
                    subprocess.run(cmd, check=True)
                    trimmed[tag] = tp

                log = work / f"{name}_{eng_name}_vmaf.json"
                if log.exists():
                    log.unlink()
                lavfi = (
                    "[0:v]split=3[e0][e1][e2];"
                    "[1:v]split=3[r0][r1][r2];"
                    f"[e0][r0]libvmaf=model=path={model}:log_fmt=json:"
                    f"log_path={log}[v];"
                    "[e1][r1]psnr[p];"
                    "[e2][r2]ssim[s]"
                )
                r = subprocess.run(
                    [ff, "-y", "-v", "info", "-i", str(trimmed["eng"]),
                     "-i", str(trimmed["ref"]), "-lavfi", lavfi,
                     "-map", "[v]", "-f", "null", "-",
                     "-map", "[p]", "-f", "null", "-",
                     "-map", "[s]", "-f", "null", "-"],
                    capture_output=True, text=True)
                if r.returncode != 0:
                    entry["error"] = f"ffmpeg rc={r.returncode}"
                    entry["stderr_tail"] = r.stderr[-600:]
                    continue
                j = json.load(open(log))
                vm = j["pooled_metrics"]["vmaf"]
                entry["vmaf"] = round(vm["mean"], 2)
                entry["vmaf_min"] = round(vm["min"], 2)
                m = re.search(r"average:([\d.]+)", r.stderr)
                if m:
                    entry["psnr"] = round(float(m.group(1)), 2)
                m = re.search(r"All:([\d.]+)", r.stderr)
                if m:
                    entry["ssim"] = round(float(m.group(1)), 4)
                print(f"[metrics] {name} {eng_name}: vmaf={entry.get('vmaf')} "
                      f"psnr={entry.get('psnr')} ssim={entry.get('ssim')} n={n}")
                for p in work.glob(f"{name}_{eng_name}*.mp4"):
                    try:
                        p.unlink()
                    except OSError:
                        pass
            except Exception as e:
                entry["error"] = repr(e)
                print(f"[metrics] {name} {eng_name} FAILED: {e!r}")

    try:
        ref_p.unlink()
    except Exception:
        pass
    return {"pairs": pairs, "vmaf_model": model, "binary": ff}


# ── CPU: side-by-side videos (native bar | each engine) ─────────────────────
@app.function(image=bench_image, secrets=[AWS_SECRET], timeout=1800, cpu=2)
def make_comparisons(tasks: list, flash: dict, seed: dict) -> dict:
    """hstack: NATIVE reference | FlashVSR | SeedVR2 at delivery resolution."""
    import subprocess

    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3", region_name=S3_REGION,
                      config=Config(s3={"addressing_style": "virtual"}))

    work = Path("/tmp/cmp"); work.mkdir(exist_ok=True)
    urls = {}
    for t in tasks:
        name = t["name"]
        tw, th = t["ow"], t["oh"]
        panels = []
        try:
            rp = work / f"{name}_ref.mp4"
            s3.download_file(S3_BUCKET, t["ref_key"], str(rp))
            panels.append(("NATIVE (quality bar)", rp))
            for label, eng in (("FlashVSR", flash), ("SeedVR2", seed)):
                tr = eng.get("tests", {}).get(name, {})
                out_key = tr.get("out_key") or f"bench/upscale/{name}/{'flashvsr' if label == 'FlashVSR' else 'seedvr2'}.mp4"
                try:
                    s3.head_object(Bucket=S3_BUCKET, Key=out_key)
                except Exception:
                    continue
                p = work / f"{name}_{label}.mp4"
                s3.download_file(S3_BUCKET, out_key, str(p))
                panels.append((label, p))
        except Exception as e:
            print(f"[cmp] {name}: download failed {e!r}")
            continue
        if len(panels) < 2:
            print(f"[cmp] {name}: only {len(panels)} panel(s), skipping")
            continue

        inputs, filters = [], []
        for i, (label, p) in enumerate(panels):
            inputs += ["-i", str(p)]
            filters.append(
                f"[{i}:v]scale={tw}:{th},"
                f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
                f"text='{label}':x=20:y=20:fontsize=42:fontcolor=white:box=1:boxcolor=black@0.6[p{i}]")
        # Independent chains must be ';' joined (bare concat makes ffmpeg read
        # the next [i:v] where a filter name belongs).
        chain = (";".join(filters)
                 + ";" + "".join(f"[p{i}]" for i in range(len(panels)))
                 + f"hstack=inputs={len(panels)}[v]")
        out = work / f"compare_{name}.mp4"
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", chain,
                 "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(out)],
                check=True)
            up = _upload(str(out), f"bench/upscale/{name}/compare.mp4")
            urls[name] = up["url"]
            print(f"[cmp] {name}: {up['url']}")
        except Exception as e:
            print(f"[cmp] {name}: encode failed {e!r}")
        for p in work.glob(f"{name}_*.mp4"):
            try:
                p.unlink()
            except OSError:
                pass

    return urls


@app.function(image=bench_image, timeout=7200)
def run_all() -> dict:
    """Orchestrate: cut matrix → engines → metrics → comparisons → tables."""
    prepared = prepare_inputs.remote()
    tasks = prepared["tasks"]

    # Sequential on purpose: each engine wants its own GPU slot, and serial
    # runs keep peak spend == one GPU while we watch for failures.
    flash = flashvsr_engine.remote(tasks)
    seed = seedvr2_engine.remote(tasks)
    metrics = compute_metrics.remote(tasks, flash, seed)
    comparisons = make_comparisons.remote(tasks, flash, seed)

    report = {
        "matrix": {"clips": list(CLIPS), "durations_s": DURATIONS,
                   "tasks": len(tasks), "sources": prepared["sources"]},
        "gpus": {"flashvsr": {"gpu": GPU, "usd_per_hour": A100_USD_PER_HOUR},
                 "seedvr2": {"gpu": H100, "usd_per_hour": H100_USD_PER_HOUR}},
        "headroom_usd_per_video_s": HEADROOM,
        "engines": {"flashvsr": flash, "seedvr2": seed},
        "quality": metrics,
        "comparisons": comparisons,
    }

    print("\n================ COST: $/video-s vs fal tier step ($0.05) ================")
    for test in TESTS:
        tt = [t for t in tasks if t["test"] == test]
        print(f"\n{test}  ({len(tt)} tasks: clips x durations)")
        for eng_name, eng in (("flashvsr", flash), ("seedvr2", seed)):
            vals = [eng["tests"][t["name"]]["usd_per_video_s"]
                    for t in tt if t["name"] in eng.get("tests", {})
                    and "usd_per_video_s" in eng["tests"][t["name"]]]
            errs = [t["name"] for t in tt
                    if "error" in eng.get("tests", {}).get(t["name"], {})]
            if vals:
                mean = sum(vals) / len(vals)
                verdict = "BEATS fal" if mean < HEADROOM else "LOSES to fal"
                print(f"  {eng_name:9s} mean ${mean:.4f}  "
                      f"(min ${min(vals):.4f} / max ${max(vals):.4f}) on "
                      f"{eng.get('gpu', '?')} -> {verdict}")
            if errs:
                print(f"  {eng_name:9s} errors: {errs}")

    print("\n================ QUALITY vs NATIVE (VMAF | PSNR dB | SSIM) ================")
    pairs = metrics.get("pairs", {})
    for test in TESTS:
        print(f"\n{test}")
        for t in [x for x in tasks if x["test"] == test]:
            row = [f"  {t['name']:24s}"]
            for eng_name in ("flashvsr", "seedvr2"):
                e = pairs.get(t["name"], {}).get(eng_name, {})
                if e.get("vmaf") is not None:
                    row.append(f"{eng_name} {e['vmaf']:6.2f} | "
                               f"{e.get('psnr', float('nan')):6.2f} | "
                               f"{e.get('ssim', float('nan')):.4f}   ")
                else:
                    row.append(f"{eng_name} ERROR({e.get('error', '?')})   ")
            print("".join(row))

    print("\ncomparison videos (NATIVE | FlashVSR | SeedVR2):")
    for k, v in comparisons.items():
        print(f"  {k}: {v}")
    print("\n================ RUN COMPLETE ================")
    return report


# ── CPU: prep one arbitrary clip for the FlashVSR endpoint ─────────────────
# One Modal .run() per target size. Cuts the source to a chosen scale, pads to
# a 128-multiple canvas, and uploads to the upscaled/ prefix so the deployed
# propreel-flashvsr endpoint can ingest it via its S3 branch. 480p and 720p
# only: FlashVSR upscales 1.5x from a canvas whose area it normalizes against,
# so 1080p-in is a no-op that burns GPU for identical pixels, and a >1080p
# canvas is far past the largest size the bench ever proved.
@app.function(image=bench_image, secrets=[AWS_SECRET], timeout=900, cpu=2)
def prep_for_upscale(src_key: str, out_w: int, out_h: int) -> dict:
    """Cut `src_key` to out_w x out_h and upload to upscaled/ for upscaling."""
    import subprocess

    work = Path("/tmp/prep"); work.mkdir(exist_ok=True)
    src = work / "src.mp4"
    _s3().download_file(S3_BUCKET, src_key, str(src))
    cut = work / f"cut_{out_w}x{out_h}.mp4"
    # scale + force_original_aspect_ratio=decrease + pad: keeps the source
    # aspect and letterboxes the remainder, so a non-16:9 source never gets
    # geometrically distorted before the upscaler sees it.
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(src),
         "-vf", f"scale={out_w}:{out_h}:force_original_aspect_ratio=decrease,"
                f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2",
         "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
         str(cut)], check=True)
    base = Path(src_key).stem
    up = _upload(str(cut), f"upscaled/src_{base}_{out_w}x{out_h}.mp4")
    return {"key": up["key"], "w": out_w, "h": out_h}


@app.local_entrypoint()
def main():
    run_all.remote()
