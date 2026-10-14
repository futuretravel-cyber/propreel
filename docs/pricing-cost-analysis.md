# Cost vs Price = Profit — per-service rundown (Oct 2026)

**Assumption: 1 credit = R1** (credit packs sell at parity; plans at R129/130 ≈ R0.99/credit).

## Source prices (verified from vendor pages, 13 Oct 2026)

| Provider | Model / service | Price |
|---|---|---:|
| fal.ai | FLUX.1 Kontext [pro] (`flux-pro/kontext`) | $0.04/image |
| fal.ai | FLUX.1 Fill [pro] (`flux-pro/v1/fill`) — billed per megapixel, rounded up | $0.05/MP |
| fal.ai | Flux Pro Erase (`flux-pro/v1/erase`) | $0.03 first MP + $0.004/extra MP |
| fal.ai | MiniMax Hailuo-02 [standard] image-to-video — 512p | ~$0.017/sec |
| fal.ai | MiniMax Hailuo-02 [standard] image-to-video — 768p ("720p" in our UI) | $0.045/sec |
| fal.ai | FlashHead lip-sync (`flashhead/audio-to-video`) | $0.005/sec of output |
| fal.ai | Mouse-1 OpenRouter route (Grok 4.7 via OpenRouter) | differ: $2/M in, $6/M out |
| Narakeet | TTS narration audio | $0.20/audio-minute ($6/30 min pack) |
| Modal | CPU compute | $0.0236/vCPU-hour (FFmpeg renders are pennies) |

FX: **$1 = R16.55** (Xe mid-market, 13 Oct 2026). Provider prices can change — recheck quarterly.

## Unit-cost drivers

- **Kontext edit**: $0.04 = **R0.66**
- **Fill Pro at 1920×1080** (brush staging path): rounds to 3 MP = $0.15 = **R2.48**
- **Erase Pro** (brush removal): ~$0.035 = **R0.58**
- **Two-stage staging**: 2 × Kontext = $0.08 = **R1.32**
- **Gro text call**: plain description ≈ 3k in + 700 out tokens ≈ $0.010 = **R0.17**; with ~5 vision photos ≈ 10k in ≈ $0.025 = **R0.42** (photos ≈ 1–2k input tokens each)
- **Narakeet**: $0.20/min = **R3.31/min** ($0.0033/sec)
- **FlashHead + TTS**: $0.005 + $0.0033 per sec of narration = $0.0083/sec = **R0.137/sec**
- **Modal FFmpeg (local render + upscale + branding)**: call it **R0.30–R0.60** per render at most
- **Caveat**: text calls route through fal's OpenRouter integration — fal may add a markup on top of list token prices (not published); treat text costs as ±50%.

## Price vs cost vs profit (current catalog)

### Video Generator (per render)

| Tier | Render | Price (R) | Provider cost (R) | Profit (R) | Margin |
|---|---|---:|---:|---:|---:|
| Essential | 30s, 6 imgs | 5 | ~2.0 (mostly Narakeet) | 3.0 | 60% |
| Essential | 60s, 12 imgs | 10 | ~3.6 | 6.4 | 64% |
| Social (512p) | 30s | 30 | 8.4 | 21.6 | 72% |
| Social (512p) | 50s | 50 | 16.9 | 33.1 | 66% |
| Social (512p) | 90s | 80 | 30.3 | 49.7 | 62% |
| Cinematic (768p) | 30s | 40 | 22.3 | 17.7 | **44%** |
| Cinematic (768p) | 60s | 75 | 44.7 | 30.3 | **40%** ← repriced 2026-10-13 |
| Cinematic (768p) | 90s | 105 | 67.0 | 38.0 | **36%** ← repriced 2026-10-13 |
| Premium — Kling 2.6 Pro (engine changed 2026-10-14; see below) | 30s | 85 | 28.9 | 56.1 | **54%** |
| Premium — Kling 2.6 Pro | 60s | 170 | 57.9 | 112.1 | **55%** |
| Premium — Kling 2.6 Pro | 90s | 250 | 86.8 | 163.2 | **54%** |

#### Premium engine change (2026-10-14) — margin simulation of 85/170/250

The tier moved off Hailuo-02 standard 768p + ffmpeg upscale onto
**Kling 2.6 Pro image-to-video** (`fal-ai/kling-video/v2.6/pro/image-to-video`) —
a different flagship family with **native 1080p** output, so the 768p→1080p
ffmpeg stretch stage is gone entirely. Kling's schema takes **5s or 10s clips
only** (no 6s), and its price is flat per-second across resolutions
($0.07/s no-audio; there is no cheaper Kling "Standard" tier, and
Kling 2.5 Turbo Pro is also flat at $0.07/s), so 720p Kling would cost the
same as 1080p Kling — that is exactly why Cinematic stays on Hailuo at
$0.045/s rather than paying a premium engine's premium price for 720p.

Simulation inputs: FX $1 = R16.55, credit retail ≈ R0.99 (pack parity),
COGS units at ~$0.0605 ≈ 1 credit (same convention as the Cinematic rows).

| Length (clips) | Ring 5s clips ($0.35/clip) | 10s clips cut to 6s ($0.70/clip) |
|---|---|---|
| 30s (5 clips) | COGS R28.2 → **28.6 ⚡ → margin 54%** at 85 ⚡ | COGS R56.3 → 57.3 ⚡ → **9%** at 85 ⚡ (below floor) |
| 60s (10 clips) | COGS R56.3 → 57.3 ⚡ → **55%** at 170 ⚡ | R112.7 → 114.7 ⚡ → 9% |
| 90s (15 clips) | COGS R84.5 → 85.9 ⚡ → **54%** at 250 ⚡ | R169.0 → 172.0 ⚡ → 7% |

Decision: ship **5s Kling clips** with the assembler slow-stretching each
5s source to its 6s share of the reel (a slow cinematic dolly re-timed to
~0.83× reads as continuous motion; a `-stream_loop` replay would paste a
mid-shot backwards seam) — that keeps COGS at $0.35/clip and makes the
85/170/250 reprice honest. If a 10s Kling clip is ever preferred (no
stretch), the honest prices are ~130/260/390 ⚡, not 85/170/250.

### AI Avatar (FlashHead) — priced flat at 8 credits

**Superseded on 2026-10-13**: the avatar is no longer flat — see suggestion 1 below. The following table documents why the change was made.

| Narration length | Price (R) | Cost (R) | Profit (R) | Margin |
|---|---:|---:|---:|---:|
| 30s | 8 | 4.1 | 3.9 | 49% |
| 60s | 8 | 8.3 | **−0.3** | breakeven |
| 90s | 8 | 12.4 | **−4.4** | **LOSS** |

The billing is flat but cost is per-second (fal $0.005/s + Narakeet $0.0033/s). Anything past ~58s of narration loses money.

### Image editing (priced server-side by preset)

| Path | fal calls | Price (R) | Cost (R) | Profit (R) | Margin |
|---|---|---:|---:|---:|---:|
| Photo-editor / removal / twilight / HDR presets (Kontext) | 1× Kontext | 2 | 0.66 | 1.34 | 67% |
| Virtual staging, preset (2-stage clear + furnish) | 2× Kontext | 4 | 1.32 | 2.68 | 67% |
| Brush-mask staging (Fill Pro) | 1× Fill @3MP | 4 | 2.48 | 1.52 | 38% |
| Brush removal (Erase Pro) | 1× Erase | 2 | 0.58 | 1.42 | 71% |

### AI text (Grok 4.7 via fal/OpenRouter)

| Service | Price (R) | Cost (R) | Profit (R) | Margin |
|---|---:|---:|---:|---:|
| Property Description (no photos) | 1 | 0.17 | 0.83 | 83% |
| Property Description (photos) | 1 | ~0.42 | 0.58 | 58% |
| Social Media Post | 2 | ~0.3 | 1.7 | 85% |
| AI Writer voiceover script — priced per duration since 2026-10-13: `ceil(duration/30)` ⚡ (flat 1⚡ was a LOSS at 90s) | see below | see below | — | ≥56% |

#### AI Writer per duration (repriced 2026-10-13)

Cost per call = Grok 4.6 vision: ~1.6k base prompt tokens + ~2k/image + ~1.36 tok/word of script, at $2/M in / $6/M out (both rates verified against a billed 12-image response: 25,590×$2/M + 11,381×$6/M = $0.1195 ≈ the $0.119274 billed — that call had ~11k reasoning tokens; reasoning is now requested OFF, trimming each call to seconds and ~2¢ of output tokens). Words ≈ 2.4/s × duration. FX $1=R16.55.

| Duration | Images (tier max) | Cost (R) | Old price | Old margin | New price `ceil(duration/30)` | New margin |
|---|---:|---:|---:|---:|---:|---:|
| 30s | 5–6 | ~0.46 | 1 ⚡ | 54% | **1 ⚡** | 54% |
| 50s | 10 | ~0.73 | 1 ⚡ | 27% | **2 ⚡** | 63% |
| 60s | 10–12 | ~0.87 | 1 ⚡ | **13%** | **2 ⚡** | 56% |
| 90s | 15 | ~1.08 | 1 ⚡ | **−8% LOSS** | **3 ⚡** | 64% |

Caveat retained: fal may add an unlisted markup on OpenRouter token prices (treat ±50%); at +50% cost the 2⚡ rungs sit at ~32–42% and the 90s rung at 46% — still above the 40% blended floor at catalog maxima, and rounding up per 30s keeps headroom if image counts grow.

### Fixed infra (not per-unit, but real)

S3+CloudFront media (30-day retention), Vercel functions, Modal idle (~free at scale-to-zero), DDB — low single-digit rand per user-month; covered by any active plan.

## Pricing suggestions

1. **Fix the Avatar pricing first** — it is the only service that can lose money. Price it per 10s of narration (TTS output duration already measured in `narakeet_seconds`): **2 credits per 10s** ⇒ cost ≈R0.137/s = R1.37/10s against R2/10s ⇒ ~31% margin minimum, or **1.5→2 rounded** and a **90s hard cap** as belt-and-braces.
2. **Cinematic 90s is the worst large-ticket margin (26%)** — bump 90s from 90 → **105** and 60s from 70 → **75**, or re-price to a clean "R7.5 per 10s of 768p video" rule (30s→45, 60s→90, 90s→135 to keep round numbers with Premium at +15). **→ Changed 2026-10-13: 60s = 75, 90s = 105 (lib/renderPricing TIERS; margins 40% / 36%).**
3. **Premium margins are healthy (55–62%)** — leave as-is; it's your best upsell.
4. **Social 512p margins are fat (62–72%)** — leaves room for promo/growth; keep.
5. **Text services are profitable but fragile margins on vision calls** — Description's 58% (photos attached) is acceptable; if Grok rates or fal markup rise, 1→1.5 credits for photo-descriptions is the lever.
6. **Cut Fill Pro cost 5×**: request ~1MP output (1024×768) instead of 1920×1080 in `_fill_pro`, cranking the brush-staging margin from 38% to ~83%; the browser upscales nothing — editors take the gradient well. OR price brush staging at 5 credits instead. **→ Changed 2026-10-13 (shipped differently): `image_size` is now 1280×720 (~0.92MP → billed 1MP) in `_fill_pro` — deployed and e2e-verified: two masked fill calls ran at $0.10 total, the stored frame is still 1920×1080 via `_fit_image_bytes`, and texture quality holds at 4× zoom on a real Unsplash interior (scripts/fill_1mp_test.py).**
7. **Blended-margin floor**: keep every SKU ≥ 40% gross margin; today only Cinematic 90s (26%) and long-narration Avatar breach it.
8. **Worst-case plan economics**: a Professional (600 credits/month, R589) spent exclusively on Cinematic 90s costs you 600 × 74c = R445 (COGS 76% of revenue — survivable but tight); a typical mix (Social + Essential + edits) runs COGS ~25–35%. Consider the Cinematic bump above to keep worst-case below 70%.
