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
| Premium (upscaled) | 30s | 60 | ~22.7 | 37.3 | 62% |
| Premium | 60s | 100 | ~45.1 | 54.9 | 55% |
| Premium | 90s | 150 | ~67.5 | 82.5 | 55% |

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
| AI Writer voiceover script | 1 | 0.10–0.25 | 0.75–0.90 | 75–90% |

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
