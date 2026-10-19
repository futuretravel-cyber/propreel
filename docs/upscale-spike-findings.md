# Upscale Engine Spike — Findings

Field notes from the self-hosted video-upscaler spike (runs 14–15, A100 +
H100 on Modal, 2026-10-19). Scope: the two open upscalers evaluated to
replace fal's per-resolution generation rate — **FlashVSR v1.1 (tiny)** and
**SeedVR2-3B**.

The full decision doc — quality tables, the F−4 frame finding, the SeedVR2
capacity limit and the FlashVSR integration plan — is in
[upscale-bench.md](upscale-bench.md). This page is the durable spike record:
the measured cost table, the hard GPU constraint that shaped the matrix, and
where the artifacts live.

## Cost table

Per-second-of-video GPU cost, measured across 4 clips × 2 durations × 2 scale
steps = 32 tasks (run 14, fresh execution). Reference: fal's upscale tier step
≈ **$0.05/video-s**; `wan-25-preview` generation bills **$0.05/s @ 480p,
$0.10/s @ 720p, $0.15/s @ 1080p**.

| scale step | FlashVSR (A100-80GB) | SeedVR2-3B (H100) | fal tier step |
|------------|----------------------|-------------------|---------------|
| 480→720 | **$0.0015** mean (min 0.0014 / max 0.0019) | **$0.0270** mean (min 0.0168 / max 0.0404) | $0.05 |
| 720→1080 | **$0.0033** mean (min 0.0031 / max 0.0041) | **$0.0434** mean (d2 only — d5 OOMs, see below) | $0.05 |

GPU-seconds per video-second (wall ÷ clip length):

| scale step | FlashVSR | SeedVR2-3B |
|------------|----------|------------|
| 480→720 | 2.06–2.68 | 15–37 (d5 amortizes better than d2) |
| 720→1080 | 4.45–5.85 | 38–41 |

Both engines beat fal on cost. FlashVSR is **~18× cheaper at 720p and ~13×
cheaper at 1080p** than SeedVR2, and runs on the cheaper A100.

## Constraint: SeedVR2 needs H100 (apex sm_90-only)

SeedVR2-3B **cannot run on the A100**. ByteDance's official apex wheel ships
sm_90-only cubins with no PTX fallback, so the A100 (sm_80) dies at the first
DiT block with `no kernel image is available for execution on the device`,
traced to `dit_v2/modulation.py`. The fused kernels that block it are the
rms-norm / modulation / softmax ops.

The apex wheel is the *sole* blocker — `flash_attn`'s own wheel does cover
sm_80. So:

- **FlashVSR → A100-80GB** ($2.50/h). Block-Sparse-Attention builds from
  source at image bake (`BLOCK_SPARSE_ATTN_CUDA_ARCHS='80;90'`).
- **SeedVR2-3B → H100** ($3.95/h, modal.com/pricing). The apex wheel is
  pinned in the image from ByteDance's HF repo.

Separately, SeedVR2 hits a **capacity wall** on a single H100-80GB: its VAE
decode OOMs (3.93 GiB activation in an up-block) at **1080p @ 96 frames**.
This is not fixable by config — `conv_max_mem`/`norm_max_mem` only chunk
convs and norms, not the offending `SiLU` activation, and the real fix
(spatial tiling, `tiled_decode`) raises `NotImplementedError` in this VAE
version. SeedVR2 is capped at ≤48 frames @1080p. FlashVSR covers the full
matrix with no capacity wall.

## Artifacts

Everything lives in S3 under `propreel-video-outputs-sa` (af-south-1) in the
`bench/upscale/<task>/` prefix, where `<task>` is
`<clip>_d<duration>_<step>` (e.g. `kitchen_d2_480to720`). Per task there are
three objects:

- `flashvsr.mp4` — FlashVSR output
- `seedvr2.mp4` — SeedVR2-3B output
- `compare.mp4` — side-by-side **NATIVE | FlashVSR | SeedVR2** for eyeballing

The bucket is private and the objects are served only via 7-day presigned
GET links (SigV4 static-IAM maximum), so the spike run's URLs are **not
committed here** — they expire, and a raw presigned URL embeds a credential
and signature.

To get fresh links, just re-run the harness:

```
modal run modal/upscale_bench.py
```

The comparison stage re-runs on every invocation (only the GPU inference
stages skip on resume, keyed off the cached `flashvsr.mp4` / `seedvr2.mp4`),
so a rerun re-uploads `compare.mp4` and prints a freshly signed 7-day link for
every task as `[cmp] <task>: <url>` in the log — **without paying for GPU
inference again**.

## Reproducing

Harness: [`modal/upscale_bench.py`](../modal/upscale_bench.py). Requires the
`aws-credentials` Modal secret; the FlashVSR and SeedVR2 images build on
first use (~8 GB and larger, one-time). Quality metrics (VMAF / PSNR / SSIM)
are recomputed against the native reference each run using paired-prefix
alignment — see the F−4 note in [upscale-bench.md](upscale-bench.md).
