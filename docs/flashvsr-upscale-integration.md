# FlashVSR Upscale Integration

Self-hosted video upscaler wired into the render pipeline so the AI tiers
generate every `wan-25-preview` clip at **480p** (fal's cheapest rate) and
upscale it to the tier's delivery resolution with **FlashVSR v1.1 (tiny)**
instead of paying fal's 720p/1080p generation rate.

Background, cost/quality measurements and the engine verdict live in
[upscale-bench.md](upscale-bench.md). This doc covers the integration itself.

## Why

fal `wan-25-preview` is per-second priced by resolution: **$0.05/s @ 480p,
$0.10/s @ 720p, $0.15/s @ 1080p** (confirmed against fal's live schema —
`resolution` is a real enum, so 480p genuinely bills at the 480p rate). The
bench measured FlashVSR on an A100 at **~$0.0015/video-s (480→720)** and
**~$0.0033/video-s (480→1080)** — a **20–45× saving on the resolution line**.
SOCIAL (480p) is untouched; CINEMATIC (720p) and PREMIUM (1080p) are the
targets.

Quality trade-off, from the same bench: FlashVSR loses **~7–22 VMAF** to
SeedVR2-3B but is 13–18× cheaper and has no capacity wall (SeedVR2 OOMs at
1080p @ 96 frames on a single H100). FlashVSR runs on A100-80GB for the whole
matrix, so it's the default engine for the self-hosted path.

## Architecture

Two Modal apps, invoked cross-app:

- **`propreel-flashvsr`** (`modal/flashvsr_endpoint.py`) — the upscaler. Own
  app so the ~8 GB FlashVSR GPU image (CUDA devel + torch + BSA + baked
  weights) stays out of the main render image. Exposes
  `flashvsr_upscale_video(input_url, target_resolution, portrait)` and a
  sequential `flashvsr_upscale_batch`.
- **`propreel-render`** (`modal/app_propreel_minimax.py`) — the existing
  render worker. Its `render_video` calls the upscaler across apps via
  `modal.Function.from_name("propreel-flashvsr", "flashvsr_upscale_video")`
  and fans out one upscale per clip with `.map` (each container loads the
  pipeline once, all clips concurrent).

Flow inside `render_video` for a `wan-25` AI tier:

1. Generate every clip at `480p` (was: the tier's native resolution).
2. Upscale each clip to the delivery resolution via the cross-app `.map` hop.
3. Assemble on the unchanged tier canvas.

The upscaler itself: letterbox-pads the clip to a 128-multiple canvas, runs
FlashVSR at 1.5×, center-crops the delivery window, uploads to S3 under
`upscaled/…` and returns a 7-day presigned URL (same `MEDIA_LINK_SECONDS`
policy as every other reel).

### Fallback layers (a paid render never dies on an upscale failure)

- **Per-clip:** if one clip's upscale returns no `url`, keep the native 480p
  clip. The assembler's pad/scale normalizes it to the canvas regardless of
  source resolution, so the reel still ships.
- **Whole hop:** if the cross-app call itself fails (app not deployed, name
  typo, Modal auth), log and continue with the native 480p clips.

Both print a warning; neither raises.

## Deploy

1. **Deploy the upscaler app first** (the render worker resolves it by name at
   call time, so it must exist before the hop is exercised):
   ```
   modal deploy modal/flashvsr_endpoint.py
   ```
   First deploy bakes the image (~8 GB, one-time). Requires the
   `aws-credentials` Modal secret to already exist.

2. **Redeploy the render worker** with the FlashVSR hop compiled in:
   ```
   modal deploy modal/app_propreel_minimax.py
   ```

3. **Enable via env kill-switch** (off by default — see below). The flag is
   set with `env={"FLASHVSR_UPSCALE": "1"}` on the `render_video`, `web` and
   `health_check` function decorators (Modal 1.5.5 has no app-level env
   injection), so every container that reads the flag receives it. `GET
   /health` reports the live value as `flashvsr_upscale`.

## Kill-switch

`_flashvsr_enabled()` gates **both** the 480p generation and the upscale hop.
The env var `FLASHVSR_UPSCALE` must be `1`/`true`/`yes`/`on` (case-insensitive);
unset or `0` = off. When off, CINEMATIC/PREMIUM generate at their native
resolution and the upscale hop is skipped entirely — the exact pre-integration
behavior. The value rides in source (`env=` above), so a flip is: change the
literal and `modal deploy` (~6 s), or `modal app rollback` to instantly serve
the previous version again.

The hop is additionally gated on `engine == ENG_WAN25 and resolution != "480p"`,
so Essential (local FFmpeg), Hailuo and any 480p tier are unaffected even when
the switch is on.

## Cost thesis (per second of video)

| tier | delivery | before (fal gen) | after (fal 480p + FlashVSR) | net on the resolution line |
|------|----------|------------------|-----------------------------|--------|
| SOCIAL | 480p | $0.05 | $0.05 (unchanged) | — |
| CINEMATIC | 720p | $0.10 | $0.05 + ~$0.0033 | ~1.9× cheaper |
| PREMIUM | 1080p | $0.15 | $0.05 + ~$0.0033 | ~2.8× cheaper |

Since the 2026-10-19 parity change, a 720p target runs the identical
1080p-class pass, so Cinematic's upscale line is ~$0.0033/video-s — the
direct-720p rate ($0.0015, bench run 14's 480→720 step) no longer exists in
production. Both upscaled tiers cost the same to upscale.

FlashVSR figures are A100 GPU time only (bench run 14). Credit pricing
(`lib/videoTiers.ts`) is unchanged — this lowers COGS, not the customer price.

## Verification checklist

- [x] `modal deploy modal/flashvsr_endpoint.py` succeeds (image bakes).
- [x] `modal deploy modal/app_propreel_minimax.py` succeeds.
- [x] `FLASHVSR_UPSCALE=1` set on `propreel-render` (env= decorators; `GET
      /health` → `"flashvsr_upscale": true`, verified 2026-10-19).
- [x] **CINEMATIC 30s render** (landscape) — verified 2026-10-19
      (`pr_ops_flashvsr_cin_2`, scripts/_ops_flashvsr_verify.py): log
      `FlashVSR upscaled 6/6 clips to 720p`; the upscaled clip object
      measures 1280×720. Reel note: landscape AI reels assemble on the
      standard 1920×1080 canvas (see limitations), so the published file is
      1920×1080 carrying FlashVSR-720p content.
- [x] **PREMIUM 30s render** (portrait) — verified 2026-10-19
      (`pr_ops_flashvsr_pre_2`): log `FlashVSR upscaled 6/6 clips to 1080p`;
      upscaled clip AND published reel both measure 1080×1920.
- [ ] **Kill-switch off** (`FLASHVSR_UPSCALE=0`): a CINEMATIC render logs no
      FlashVSR lines and generates at 720p natively. Still open — the flip
      is edit-the-literal + redeploy, or `modal app rollback` in an
      emergency (see Kill-switch above).
- [x] **Failure fallback** — passed 2026-10-19 incidentally: the first
      verification run hit the `.map` bug below, both renders logged
      `FlashVSR upscale hop unavailable — using native 480p clips` and
      completed normally (no app-stop drill needed).
- [ ] Compare a FlashVSR-upscaled reel against a native-fal one for visual
      regression before flipping the switch for all customers. Still open.

## Known limitations

- **Frame contract:** `prepare_input_tensor` returns `F` = the frame count the
  pipeline *will emit* (the streaming loop drops 4 internal frames). We pass `F`
  straight through; the assembler's exact `-t seg_dur` trims any surplus tail.
  Verified against bench runs 14/15 (48-frame pad → 45 emitted).
- **Batch entrypoint is sequential** in one container (single model load) —
  use `flashvsr_upscale_video.map` for concurrency, which is what
  `render_video` does.
- **Deployed 2026-10-19, render-verified same day.** The upscaler app and
  the render worker (flag on) are live; `GET /health` reports
  `flashvsr_upscale: true`, and both paid verification renders passed after
  the `.map` fix below (total verification spend ≈ R110 across the failing
  first run and the passing second). Still open: the kill-switch-off drill
  and a visual A/B comparison.
- **`.map` zip semantics (bug fixed 2026-10-19).** Modal `.map` takes ONE
  ITERABLE PER POSITIONAL PARAMETER — no tuple unpacking. The hop originally
  passed `[(url, resolution, portrait), ...]`, delivering the whole tuple as
  `input_video_url`; the endpoint died inside `urlparse` with `"'tuple'
  object has no attribute 'decode'"` and every render silently fell back to
  native 480p clips. The first paid verification run caught it; the hop now
  passes three iterables plus `return_exceptions=True` so the per-clip merge
  can keep native clips for individual failures. (`generate_ai_video_clip
  .map` was always correct — its single parameter IS a tuple.)
- **Landscape AI reels assemble on 1920×1080 regardless of tier.** The
  tier-canvas branches (854×480 / 1280×720) sit behind `engine in (KLING,
  WAN)` and have been dead since every tier moved to wan (2026-10-18):
  CINEMATIC delivers a 1920×1080 file whose content is FlashVSR-720p, and
  SOCIAL delivers 1080p-canvas content upscaled from 480p clips. Pre-existing
  behavior — flagged for a product decision, not changed here.
