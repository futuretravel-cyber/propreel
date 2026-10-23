# FlashVSR Upscale Integration

Self-hosted video upscaler wired into the render pipeline so the PREMIUM
tier can deliver **1080p** from MiniMax Hailuo-02 standard — which has no
1080p rung — by generating at **768p** (its top native rung) and upscaling
each clip with **FlashVSR v1.1 (tiny)** instead of paying for native-1080p
generation (Hailuo-02 Pro at $0.08/s, or wan's retired $0.15/s 1080p).

Background, cost/quality measurements and the engine verdict live in
[upscale-bench.md](upscale-bench.md). This doc covers the integration itself.

## Why

Since the 2026-10-21 engine unification every AI tier generates on MiniMax
Hailuo-02 standard (**$0.017/s @ 512p, $0.045/s @ 768p**) — wan-25-preview
was removed (warped geometry, invented rooms; client A/B same day). Hailuo
standard has **no 1080p rung**, so PREMIUM is the one tier that still needs
an upscale to hit its delivery resolution, and FlashVSR makes it cheap:
**~$0.0033/video-s on an A100** (bench run 14) on top of the 768p rate =
**≈$0.048/s all-in**, vs $0.08/s for native-1080p Hailuo Pro. SOCIAL (512p)
and CINEMATIC (768p) deliver their native rungs on the 1080p canvas —
normalizing up adds no real detail, so the hop would be pure cost for them.

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

Flow inside `render_video` for PREMIUM (the only tier with the hop):

1. Generate every clip at **768p** (Hailuo standard's top native rung).
2. Upscale each clip to **1080p** via the cross-app `.map` hop.
3. Assemble on the 1080p delivery canvas (lanczos normalize — see
   [Delivery canvas](#delivery-canvas-decided-2026-10-19) below).

SOCIAL/CINEMATIC/BUDGET skip steps 1–2's upscale: they generate at their
tier/config resolution (512p/768p) and land straight on the canvas.

The upscaler itself: letterbox-pads the clip to a 128-multiple canvas, runs
FlashVSR at 1.5×, center-crops the delivery window, uploads to S3 under
`upscaled/…` and returns a 7-day presigned URL (same `MEDIA_LINK_SECONDS`
policy as every other reel).

### Fallback layers (a paid render never dies on an upscale failure)

- **Per-clip:** if one clip's upscale returns no `url`, keep the native 768p
  clip. The assembler's pad/scale normalizes it to the canvas regardless of
  source resolution, so the reel still ships.
- **Whole hop:** if the cross-app call itself fails (app not deployed, name
  typo, Modal auth), log and continue with the native 768p clips.

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

`_flashvsr_enabled()` gates the upscale hop.
The env var `FLASHVSR_UPSCALE` must be `1`/`true`/`yes`/`on` (case-insensitive);
unset or `0` = off. When off, PREMIUM generates at 768p and ships that
content on the 1080p delivery canvas (the assembler's lanczos normalize) —
no hop, no upscale cost. The value rides in source (`env=` above), so a flip
is: change the literal and `modal deploy` (~6 s), or `modal app rollback` to
instantly serve the previous version again.

The hop is additionally gated on `engine != ENG_KLING26 and resolution ==
"1080p"`, so Essential (local FFmpeg), SOCIAL, CINEMATIC, BUDGET and the
dormant Kling path are unaffected even when the switch is on.

## Cost thesis (per second of video, since 2026-10-21)

| tier | delivery | fal gen | + FlashVSR | net |
|------|----------|---------|-----------|-----|
| SOCIAL | 512p native | ~$0.017 | — | — |
| CINEMATIC | 768p native | $0.045 | — | — |
| PREMIUM | 1080p | $0.045 (768p) | ~$0.0033 | **≈$0.048 vs $0.08** native-108p Pro |

Only Premium pays the upscale line, and it saves ≈40% against the cheapest
native-1080p alternative. FlashVSR figures are A100 GPU time only (bench
run 14). Credit pricing (`lib/videoTiers.ts`) is unchanged — this is COGS,
not the customer price.

Historical (2026-10-18→21, wan era): all tiers generated 480p @ $0.05/s
and CINEMATIC/PREMIUM upscaled — the hop's geometry and fallbacks were
proven in that period and are unchanged.

## Delivery canvas (decided 2026-10-19)

Every AI reel is assembled on the **delivery** canvas — 1920×1080
landscape / 1080×1920 portrait — whatever the tier. Since 2026-10-21 that
means: SOCIAL's 512p and CINEMATIC's 768p native clips are lanczos-
normalized onto the 1080p canvas (no upscale hop — see Why above), and
PREMIUM's FlashVSR clips arrive at a crisp 1920×1080. Cinematic-on-1080p
was the open question (assemble at a pixel-exact native master vs keep the
1080p canvas) and stays on **1080p** because:

- **Tier ladder:** ESSENTIAL already delivers 1920×1080 from the editor's
  1080p photos — a 768p Cinematic file would sit BELOW the cheapest tier
  in the nominal-resolution ladder agents compare.
- **The buyer's player would upscale anyway:** a sub-1080p deliverable gets
  resampled by whatever TV/laptop/player decodes it. The assembler's 1.5×
  normalize is **lanczos** now (upgraded from ffmpeg's default bicubic
  with this decision), so the source detail survives the resample under
  our control instead of a player's scaler.
- **Cost-neutral:** ffmpeg-only; generation and upscale rates unchanged.

The dead tier-resolution branches (`480p → 854×480`, `720p → 1280×720`)
that once implemented per-tier canvases were **removed** with this
decision — they had been unreachable since the engine checks moved, and
the 2026-10-21 wan removal finished the cleanup.

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
- [x] **Kill-switch off drill** — passed 2026-10-19
      (`pr_ops_killswitch_drill`, modal/_run_killswitch_drill.py): deployed
      with the three `env=` literals at `0` (`GET /health` →
      `flashvsr_upscale: false`), ran a CINEMATIC 30s render — logs contain
      ZERO FlashVSR lines, the clips come back as raw fal.media URLs
      (native 720p generation, billed at the 720p rate), the reel assembles
      on the 1920×1080 canvas, and `upscaled/` in S3 gained no new objects
      during the window. Flag restored to `1` and redeployed;
      `flashvsr_upscale: true` again.
- [x] **Failure fallback** — passed 2026-10-19 incidentally: the first
      verification run hit the `.map` bug below, both renders logged
      `FlashVSR upscale hop unavailable — using native 480p clips` and
      completed normally (no app-stop drill needed).
- [x] **Delivery-canvas normalize** — the real `_concat_ai_clips` run in
      the render image on synthetic 1280×720 (CINEMATIC upscaled), 854×480
      (SOCIAL fallback) and 720×1280 (portrait) clips
      (`modal/_probe_canvas.py`, 2026-10-19): the lanczos filter is accepted
      and every case measures exactly the 1920×1080 / 1080×1920 delivery
      canvas. CPU-only probe — no fal spend.
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
- **Landscape AI reels deliver 1920×1080 regardless of tier.** RESOLVED
  2026-10-19 — this is now the decided delivery canvas (see Delivery
  canvas above), not an accident: CINEMATIC ships a 1920×1080 file whose
  content is FlashVSR-720p, SOCIAL ships 1080p-canvas content upscaled
  from 480p clips. The dead per-tier-canvas branches were removed.
