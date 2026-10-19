# Video Upscale Benchmark — FlashVSR vs SeedVR2-3B

**Purpose:** decide which open upscaler to wire into production (as a self-hosted
alternative to fal's upscale tier). Two engines, one matrix, scored against the
**native** (never-downsampled) reference.

- **FlashVSR** (tiny, streaming) — A100-80GB
- **SeedVR2-3B** (diffusion, DiT+VAE) — H100 (apex sm_90 wheels; A100 dies at the
  first DiT block — no PTX fallback)

Reference: fal upscale tier step ≈ **$0.05 / video-s**. Both engines beat it on
cost; the question is quality and capacity.

## Matrix

4 clips × 2 durations (d2 = ~48 f, d5 = ~96–120 f) × 2 scale steps × 2 engines =
32 tasks. Each task: downscale the native clip to the step's input, upscale it
back, and score the result against the native crop (paired, ref-length aligned).
3 s per clip keeps a single-GPU run in the $0.10–0.50 range.

## Cost (run 14 — fresh execution, all 32 tasks)

$/video-s (GPU time only; excludes model load amortized over a batch):

| step | FlashVSR (A100) | SeedVR2-3B (H100) | fal |
|------|-----------------|-------------------|-----|
| 480→720 | **$0.0015** mean (min 0.0014 / max 0.0019) | **$0.0270** mean (min 0.0168 / max 0.0404) | $0.05 |
| 720→1080 | **$0.0033** mean (min 0.0031 / max 0.0041) | **$0.0434** mean (d2 only; d5 OOMs) | $0.05 |

GPU-s per video-s (wall ÷ clip length):

| step | FlashVSR | SeedVR2-3B |
|------|----------|------------|
| 480→720 | 2.06–2.68 | 15–37 (d5 amortizes better than d2) |
| 720→1080 | 4.45–5.85 | 38–41 |

FlashVSR is **~18× cheaper at 720p, ~13× at 1080p** than SeedVR2, and both are
under fal. FlashVSR also runs on the cheaper A100.

## Quality vs native (run 15 — ref-crop-corrected pairing)

`VMAF | PSNR dB | SSIM`, scored on the paired prefix (native ref trimmed to the
engine's output length — see FlashVSR F−4 finding below).

### 480→720

| clip | FlashVSR | SeedVR2-3B |
|------|----------|------------|
| kitchen_d2 | 56.82 \| 24.91 \| 0.8369 | **78.97** \| 24.30 \| 0.8902 |
| kitchen_d5 | 58.10 \| 25.61 \| 0.8476 | **80.71** \| 24.95 \| 0.8949 |
| land_d2 | 67.13 \| 28.17 \| 0.9729 | **73.93** \| 31.27 \| 0.9823 |
| land_d5 | 68.76 \| 28.85 \| 0.9754 | **78.92** \| 32.35 \| 0.9831 |
| logofit_d2 | 58.29 \| 24.90 \| 0.8433 | **72.37** \| 25.01 \| 0.8636 |
| logofit_d5 | 58.86 \| 26.57 \| 0.8877 | **77.15** \| 26.07 \| 0.9164 |
| ab_d2 | 72.87 \| 29.71 \| 0.8851 | **80.99** \| 29.46 \| 0.9097 |
| ab_d5 | 69.93 \| 29.96 \| 0.8898 | **81.81** \| 29.67 \| 0.9132 |

### 720→1080

| clip | FlashVSR | SeedVR2-3B |
|------|----------|------------|
| kitchen_d2 | 64.08 \| 26.96 \| 0.8825 | **79.04** \| 26.66 \| 0.9139 |
| kitchen_d5 | 65.13 \| 27.41 \| 0.8852 | — (OOM) |
| land_d2 | 76.62 \| 31.28 \| 0.9721 | **78.84** \| 32.98 \| 0.9838 |
| land_d5 | 77.53 \| 32.08 \| 0.9814 | — (OOM) |
| logofit_d2 | 64.44 \| 26.85 \| 0.8668 | **77.30** \| 26.22 \| 0.8913 |
| logofit_d5 | 63.10 \| 28.90 \| 0.9114 | — (OOM) |
| ab_d2 | 79.81 \| 30.62 \| 0.8994 | **85.63** \| 30.73 \| 0.9246 |
| ab_d5 | 79.13 \| 30.55 \| 0.8983 | — (OOM) |

**SeedVR2 wins every comparable cell on VMAF/SSIM** (+7 to +22 VMAF over
FlashVSR), at ~13–18× the cost. FlashVSR's PSNR is occasionally higher on smooth
content (it denoises rather than hallucinate detail) but its VMAF/SSIM lag
consistently — the classic "sharp but sometimes wrong" streaming-upscaler
signature vs diffusion's perceptually-consistent output.

## Findings that shape the integration

1. **FlashVSR emits F−4 frames** (upstream, not our pipeline). Its streaming
   loop is `process_total_num = (num_frames − 1) // 8 − 2`
   (`diffsynth/pipelines/flashvsr_tiny.py:339`) — it skips the last 2 chunk
   windows, so the output is always 4 frames shorter than the requested
   `num_frames`. To fully cover a source of `in_len` frames, feed
   `num_frames ≥ 8 × (ceil(in_len/8) + 2) + 1` (e.g. **65** for a 48-frame
   source). Scored region stays aligned via paired-prefix trimming.

2. **SeedVR2-3B cannot decode 1080p @ 96 frames on a single H100-80GB.** The
   VAE decode OOMs (3.93 GiB silu in an up-block). This is *not* fixable by
   config:
   - `vae.memory_limit.conv_max_mem/norm_max_mem` (tried 0.5→0.2) only chunk
     `InflatedCausalConv3d` and norms — the OOM op is a `SiLU` *activation*, an
     elementwise op on the full tensor, untouched by those knobs.
   - `slicing_up_num` (up-block slicing) only halves the **temporal dim of
     `upscale_conv`** (`Upsample3D.forward`); the silu runs before any upsample
     on the full input, so it doesn't help either.
   - The real fix (spatial tiling) is `tiled_decode`, which **raises
     `NotImplementedError`** in this VAE version.
   d2 (48 f) @ 1080p passes; d5 (96 f) @ 1080p and everything @ 720p pass. So
   SeedVR2 is capped at **≤48 frames @1080p** (or tiling, if upstream ships it).

3. **`ref-crop` pairing bug (fixed).** Run ≤14 scored the full native ref against
   the shorter engine output, producing `n=45` vs ref-48 mismatches and, for
   seedvr cells with the +4 pad, zero-length pairs.   Fixed: score the paired prefix — `n = min(ref, out)` frames, both ref and
   engine re-encoded with `-frames:v n` so counts match exactly; when the engine
   floors delivery dims (SeedVR2 → /16), the native ref is center-cropped to the
   delivered size (`crop_ref` in `modal/upscale_bench.py`) rather than rescaled.
   Run 15's quality numbers are the corrected ones.

## Verdict & integration plan

- **Default engine: FlashVSR.** 13–18× cheaper, runs on A100 (no capacity wall,
  no frame cap), and covers the full matrix including 5 s @ 1080p. Over-cut the
  input by the F−4 margin (feed `num_frames ≥ 8×(ceil(in/8)+2)+1`) and trim the
  tail on return.
- **Premium tier: SeedVR2-3B** where quality justifies the cost and the clip is
  within capacity (≤48 f @1080p, or ≤~120 f @720p). Route to H100. Reject or
  downscale-detect requests beyond the capacity envelope rather than OOM.
- Both undercut fal's $0.05/video-s, so either is a cost win; the choice is a
  quality-vs-cost dial, not a feasibility one.

## Reproducing

- Harness: [`modal/upscale_bench.py`](../modal/upscale_bench.py). Resume-safe:
  existing `bench/upscale/<name>/<engine>.mp4` on S3 are skipped; metrics are
  rescored each run. Run with `modal run modal/upscale_bench.py` (needs
  `AWS_SECRET`, and the FlashVSR/SeedVR images build on first use).
- Raw logs: run 14 (fresh cost + quality), run 15 (corrected quality + resume).
  Comparison videos (`compare.mp4`, side-by-side NATIVE | FlashVSR | SeedVR2)
  are on S3 under `bench/upscale/<clip>_<step>/` with 7-day presigned links
  (regenerate via the harness; they expire).
