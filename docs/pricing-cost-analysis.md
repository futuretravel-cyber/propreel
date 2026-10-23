# Cost vs Price = Profit — per-service rundown (Oct 2026)

**Assumption: 1 credit = R1.50 retail (list value)** since the 2026-10-19 reprice (top-up packs charge R1.50/credit cash via `CREDIT_PACK_RAND` in `lib/renderPricing.ts` since the 2026-10-21 parity reprice; plans bundle ≈R1.10–1.17/credit since the final 2026-10-21 ladder — Starter 110, Professional 520, Premium 1 150, Agency 4 300 credits at unchanged prices).

## Source prices (verified from vendor pages, 13 Oct 2026)

| Provider | Model / service | Price |
|---|---|---:|
| fal.ai | FLUX.1 Kontext [pro] (`flux-pro/kontext`) | $0.04/image |
| fal.ai | FLUX.1 Fill [pro] (`flux-pro/v1/fill`) — billed per megapixel, rounded up | $0.05/MP |
| fal.ai | Flux Pro Erase (`flux-pro/v1/erase`) | $0.03 first MP + $0.004/extra MP |
| fal.ai | MiniMax Hailuo-02 [standard] image-to-video — 512p | ~$0.017/sec |
| fal.ai | MiniMax Hailuo-02 [standard] image-to-video — 768p | $0.045/sec |
| Modal | A100-80GB running FlashVSR (self-hosted upscale, Premium only) | $2.50/h ≈ **$0.0033 per upscaled video-second** (bench run 14) |
| fal.ai | FlashHead lip-sync (`flashhead/audio-to-video`) | $0.005/sec of output |
| fal.ai | Mouse-1 OpenRouter route (Grok 4.7 via OpenRouter) | differ: $2/M in, $6/M out |
| Narakeet | TTS narration audio | $0.20/audio-minute ($6/30 min pack) |
| Modal | CPU compute | $0.0236/vCPU-hour (FFmpeg renders are pennies) |

FX: **$1 = R16.55** (Xe mid-market, 13 Oct 2026). Provider prices can change — recheck quarterly.

Engine note (2026-10-21): **wan-25-preview is gone** — its reels warped
geometry and invented rooms (client A/B against the Budget reels), so all
AI tiers generate on MiniMax Hailuo-02 standard, the Budget engine (see
the engine unification below). Kling 2.6 Pro stays a dormant alternate.
Wan's rates are dropped from this table.

## Unit-cost drivers

- **Kontext edit**: $0.04 = **R0.66**
- **Fill Pro at 1920×1080** (brush staging path): rounds to 3 MP = $0.15 = **R2.48**
- **Furniture Removal — `openai/gpt-image-2.5/flare/edit`, quality=high**: $0.0361–0.1001 per output size = **R0.60–R1.66** (1920×1080 = $0.0396 = R0.66; `image_size: auto` follows the source photo, so output size is THE cost driver — list prices fetched from fal 15 Oct 2026)
- **Two-stage staging**: 2 × Kontext = $0.08 = **R1.32**
- **Gro text call**: plain description ≈ 3k in + 700 out tokens ≈ $0.010 = **R0.17**; with ~5 vision photos ≈ 10k in ≈ $0.025 = **R0.42** (photos ≈ 1–2k input tokens each)
- **Narakeet**: $0.20/min = **R3.31/min** ($0.0033/sec)
- **Hailuo-02 standard 512p generation**: ~$0.017/sec = **R0.28/sec** (Social; worst case $0.02/s = R0.33/s — fal only publishes ~$0.017/s)
- **Hailuo-02 standard 768p generation**: $0.045/sec = **R0.75/sec** (Cinematic, Premium gen, Budget 768p)
- **FlashVSR upscale (Premium only)**: ~$0.0033/video-sec = **R0.055/sec** — Hailuo has no 1080p rung, so Premium's 768p clips upscale to 1080p; Social and Cinematic deliver native (no hop)
- **FlashHead + TTS**: $0.005 + $0.0033 per sec of narration = $0.0083/sec = **R0.137/sec**
- **Modal FFmpeg (local render + upscale + branding)**: call it **R0.30–R0.60** per render at most
- **Caveat**: text calls route through fal's OpenRouter integration — fal may add a markup on top of list token prices (not published); treat text costs as ±50%.

## Price vs cost vs profit (current catalog)

### Video Generator (per render)

**Methodology (rebuilt 2026-10-19, engine rows refreshed 2026-10-21).**
COGS = full variable cost per reel: fal generation + FlashVSR upscale
(Premium only) + Narakeet voiceover (≈ reel length at 2.4 words/sec) +
Modal assembly (R0.45, midpoint of R0.30–0.60). Every row is the
like-for-like full variable cost. FX $1 = R16.55. **1 credit = R1.50
retail** (repriced 2026-10-19) — the Price column below is credits ×
R1.50; credits are the live catalog (`lib/videoTiers.ts`, mirrored in the
worker's `TIER_CONFIGS`), a Rand-anchored ladder rounded up to the next
whole credit.

| Tier | Render | Price (R) | COGS (R) | Profit (R) | Margin |
|---|---|---:|---:|---:|---:|
| Essential (local FFmpeg 1080p) | 30s, 6 imgs | 7.50 (5 ⚡) | 2.10 | 5.40 | 72% |
| Essential | 60s, 12 imgs | 15.00 (10 ⚡) | 3.76 | 11.24 | 75% |
| Social (Hailuo 512p, native) | 30s, 6 imgs | 51.00 (34 ⚡) | 10.55 | 40.45 | **79%** |
| Social | 60s, 12 imgs | 90.00 (60 ⚡) | 20.64 | 69.36 | **77%** |
| Social | 90s, 18 imgs | 133.50 (89 ⚡) | 30.74 | 102.76 | **77%** |
| Cinematic (Hailuo 768p, native) | 30s, 6 imgs | 70.50 (47 ⚡) | 24.45 | 46.05 | **65%** |
| Cinematic | 60s, 12 imgs | 94.50 (63 ⚡) | 48.45 | 46.05 | **49%** |
| Cinematic | 90s, 18 imgs | 142.50 (95 ⚡) | 72.45 | 70.05 | **49%** |
| Premium (Hailuo 768p + FlashVSR → 1080p) | 30s, 6 imgs | 90.00 (60 ⚡) | 26.10 | 63.90 | **71%** |
| Premium | 60s, 12 imgs | 120.00 (80 ⚡) | 51.75 | 68.25 | **57%** |
| Premium | 90s, 18 imgs | 150.00 (100 ⚡) | 77.40 | 72.60 | **48%** |

**Every video SKU clears the 40% floor with room to spare** — and the
2026-10-21 engine unification IMPROVED every AI margin versus the wan
ladder (Social 47/41/40% → 79/77/77%, Cinematic 60/40/41% → 65/49/49%,
Premium 68/53/43% → 71/57/48%): Hailuo's per-second rates sit below
wan's at every rung ($0.017/s vs $0.05/s; $0.045/s vs $0.10/s), and
Cinematic no longer pays an upscale hop at all. Credit prices are
UNCHANGED — the whole gain drops to margin. Caveat: the Social 512p rate
is fal's approximate ~$0.017/s; at a worst case $0.02/s, Social's 30s
rung is 76% — still far clear of the floor.

#### Engine unification (2026-10-21) — Hailuo-02 standard serves every AI tier

wan-25-preview is gone: its reels warped geometry and invented rooms
(client A/B against the Budget reels, same day), so every AI tier now
generates on **MiniMax Hailuo-02 standard** with the Budget deck's gentle
per-photo prompts (`lib/budgetVideoPrompts.ts`, byte-identical text):

| tier | fal gen rate | delivery | upscale |
|---|---|---|---|
| Social | 512p @ ~$0.017/s | 512p native on the 1080p canvas | — |
| Cinematic | 768p @ $0.045/s | 768p native on the 1080p canvas | — |
| Premium | 768p @ $0.045/s | FlashVSR → 1080p (~$0.0033/video-s) | only tier with a hop |
| Budget | 512p/768p per config | same 1080p canvas | — |

Hailuo standard has no 1080p rung, so Premium is the one tier that still
justifies the self-hosted upscale: 768p gen + FlashVSR = **≈$0.048/s
all-in**, versus $0.08/s for native-1080p Hailuo Pro (≈40% cheaper) and
far below wan's retired $0.15/s 1080p. Social and Cinematic deliver
their native rungs on the standard 1080p canvas (lanczos normalize) —
normalizing 768p up adds no real detail, so the hop would be pure cost.
All reels assemble on 1920×1080 / 1080×1920. Kill-switch
(`FLASHVSR_UPSCALE=0`) ships Premium 768p content on the 1080p canvas.

History: the catalog ran Hailuo 512p/768p (Social/Cinematic) and Kling
2.6 Pro (Premium) until 2026-10-18, then wan-25-preview at 480p +
FlashVSR for all three tiers 2026-10-18→21. The Budget tier (2026-10-20)
is what proved the gentle Hailuo prompts superior; the 2026-10-21 A/B
made them the standard for every tier. Catalog repriced three times on
2026-10-19 (flat 1 ⚡/sec, then the R1.50 ladder 34/47/67, 47/60/80,
60/80/100, then the same-day floor raise: Social 60/90s → 60/89,
Cinematic 60/90s → 63/95; Essential unchanged 5/10).

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
| Photo-editor / twilight / HDR presets (Kontext) | 1× Kontext | 2 | 0.66 | 1.34 | 67% |
| Virtual staging, preset (2-stage clear + furnish) | 2× Kontext | 4 | 1.32 | 2.68 | 67% |
| Brush-mask staging (Fill Pro) | 1× Fill @3MP | 4 | 2.48 | 1.52 | 38% |
| Furniture Removal (gpt-image-2.5 flare @high, `image_size: auto`) | 1× flare | 2 | 0.66–1.66 | 0.34–1.34 | **17%–67%** |

#### Furniture Removal moved to gpt-image-2.5 (2026-10-15)

Furniture Removal no longer runs the FLUX Erase two-pass mask, BRIA,
nano-banana, the leftover-sweep loop or the VQA gate — all of that ran
BEFORE fal was called and is what blew the client's 8-minute wait. It is
now **one** `openai/gpt-image-2.5/flare/edit` call over the whole photo
(`quality: high`, `image_size` left at `auto` so the source aspect is
preserved; the endpoint takes no mask, no strength and no guidance_scale).

Pricing is per output size, not flat. List price at quality=high (fetched
from fal 15 Oct 2026; FX $1 = R16.55, price 2 ⚡ = R2.00):

| Output size | USD | R | Margin at 2 ⚡ |
|---|---:|---:|---:|
| 1024×768 | 0.0361 | 0.60 | 70% |
| 1024×1536 | 0.0412 | 0.68 | 66% |
| 1920×1080 | 0.0396 | 0.66 | 67% |
| 1024×1024 | 0.0527 | 0.87 | 57% |
| 2560×1440 | 0.0553 | 0.91 | 55% |
| 3840×2160 | 0.1001 | 1.66 | **17%** ← under the 40% floor |

Prompt text is on top: the removal prompt + its "Avoid:" negative is
~600 tokens ≈ $0.003 ≈ **R0.05**.

`image_size: auto` derives the output from the source photo, so a large
upload can land on the 4K row. Levers, best first:

1. Pin `image_size` to the source aspect at ≤1920 long side — that is
   already the canvas `_fit_image_bytes` produces, so no visible loss, and
   it caps COGS at ≈ R0.66–0.87 (57–70%). Only do this once a render has
   been observed: fal's resize behaviour on a non-canonical size is
   unverified here.
2. Drop `quality` to `medium`: $0.0103–0.0260 = R0.17–0.43 at EVERY size
   (78–91%), at an unknown fidelity cost.

Until one of those lands, treat 2 ⚡ as **17%–67%**. Do not drop to 1 ⚡:
at 4K a single render is already R1.66 of a R2.00 price.

### BUDGET tier (added 2026-10-20) — gentle Hailuo-02 motion

A deliberate "calmer motion" product (slower pace, less dramatic camera travel — the client's prompt library in `lib/budgetVideoPrompts.ts` says so explicitly) at fal's cheapest AI rates — and since the 2026-10-21 engine unification its engine AND prompts serve every AI tier (see above); Budget remains the only tier whose CONFIGS pick the fal resolution (512p/768p). One length only — **30s from 5 photos** (5 × 6s clips, the assembler's exact share) — no voiceover (no Narakeet cost), no avatar, no FlashVSR hop; clips pad/scale onto the standard 1080p AI delivery canvas by lanczos.

FX $1=R16.55; assembly/infra ≈R0.45/render (Modal ffmpeg share); no voiceover/avatar line items.

| Config | fal rate | fal cost (30s) | COGS (R) | Floor price (40%) | Shipped price | Margin |
|---|---:|---:|---:|---:|---:|---:|
| 512p | ~$0.017/s | $0.51 | ~8.89 | 10⚡ | **20⚡** (R30.00) | 70.4% |
| 768p | $0.045/s | $1.35 | ~22.79 | 26⚡ | **34⚡** (R51.00) | 55.3% |

Launched 2026-10-20 on the floor (10/26⚡) and repriced the same day on the client's call to **20⚡ / 34⚡** — both now sit well clear of the floor, which also absorbs the 512p-rate uncertainty (fal only publishes ~$0.017/s for Hailuo 512p; at a worst-case $0.02/s the 20⚡ rung still clears 65%). Ladder position: Essential 5⚡ < **Budget 20/34⚡** ≤ Social 34⚡ (the 768p rung now matches Social 30s' price — budget's differentiator there is the calm motion and no voiceover, not the price).

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

1. **Avatar is back above the floor** — repriced 2026-10-19 to **2 credits per 10s**: at R1.50/credit that is R3.00 against R1.37 of FlashHead + TTS (~55% margin). The R1.50 ladder's brief 1cr rate sat at ~9%, under the floor; restored the same day, matching what the client copy always said.
2. **Cinematic floored 2026-10-19 (resolved)** — the R70/90/120 ladder briefly priced 60s/90s at 37%/29%; the same-day floor raise moved them to the floor prices **63cr / 95cr** (R94.50/R142.50) — now 40/41%.
3. **Premium is the healthiest AI tier** (68/53/43%) — leave as-is; best absolute profit per render (R61–65).
4. **Social floored 2026-10-19 (resolved)** — 30s healed at 47% by the R1.50 ladder; 60/90s briefly sat at 24%/21% until the same-day floor raise moved them to **60cr / 89cr** (R90.00/R133.50) — now 41/40%.
5. **Text services are profitable but fragile margins on vision calls** — Description's 58% (photos attached) is acceptable; if Grok rates or fal markup rise, 1→1.5 credits for photo-descriptions is the lever.
6. **Cut Fill Pro cost 5×**: request ~1MP output (1024×768) instead of 1920×1080 in `_fill_pro`, cranking the brush-staging margin from 38% to ~83%; the browser upscales nothing — editors take the gradient well. OR price brush staging at 5 credits instead. **→ Changed 2026-10-13 (shipped differently): `image_size` is now 1280×720 (~0.92MP → billed 1MP) in `_fill_pro` — deployed and e2e-verified: two masked fill calls ran at $0.10 total, the stored frame is still 1920×1080 via `_fit_image_bytes`, and texture quality holds at 4× zoom on a real Unsplash interior (scripts/fill_1mp_test.py).**
7. **Blended-margin floor**: keep every SKU ≥ 40% gross margin. After the 2026-10-19 fixes (avatar back to 2cr/10s, long reels floored) **no core catalog SKU breaches it**. Watch items outside the core ladder: 4K Furniture Removal (17%) and Fill Pro brush staging (38%).
8. **Worst-case plan economics (rebuilt after the 2026-10-19 floor raise + Starter trim)** — worst single-SKU spend per plan/billing mode, at the floored catalog: Professional annual **+4.6%** (100% Social 60s), Premium annual **+5.5%** (100% Cinematic 60s), Agency **+10.4%**, and Starter **+22.9%** annual / +34.3% monthly after trimming it 130 → **115 credits** (the trim fixed the one below-cost cell: 130⚡ annual Starter spent entirely on Cinematic 60s sold 2 reels for R113.38 against R110 — −3.1%). No cell sells below cost anymore; the thin annual cells assume 100% of credits burned on one mid-tier SKU, which no real mix does — trim Professional/Premium allotments if that corner ever matters.

   **REBUILT 2026-10-21 — the numbers above are wan-era COGS** (computed 2026-10-19, before the engine unification; the "R113.38 for 2 reels" = 2 × R56.69 wan Cinematic 60s — on Hailuo that burn costs R96.90). Against the FINAL 2026-10-21 allotments (110/520/1150/4300, prices unchanged), worst single-SKU burns (fractional Premium-90s R0.774/credit, (revenue−COGS)/COGS): Starter annual 110⚡ → R85.1 vs R110 → **+29%** (monthly +51%); Professional annual 520⚡ → R402.5 vs R560 → **+39%** (monthly +46%); Premium annual 1150⚡ → R890 vs R1200 → **+35%** (monthly +43%); Agency 4300⚡ → R3328 vs R5000 → **+50%**. Blended realistic mixes (edits/text/Social/Budget ≈ R0.45/credit) clear ~55–62%. Plan rates ≈R1.10–1.17 sit 22–26% under the R1.50 list value **and** the R1.50 top-up pack cash rate (packs repriced to parity 2026-10-21) — see the pack-vs-plan note in credit-pricing-runbook.md. An interim ladder the same day (130/650/1400/5500) was superseded by these numbers.
9. **Budget tier repriced above the floor on launch day (2026-10-20)** — launched at the floor (10⚡/26⚡, 40.7%/41.6%) and moved to **20⚡ (512p) / 34⚡ (768p)** on the client's call the same day: 70.4%/55.3% at retail, and the cushion means the ~$0.017/s 512p-rate uncertainty (worst case ~$0.02/s → R10.38 COGS) can no longer breach the floor. At plan rates (≈R0.99/credit) the rungs run ~41%/~27% — above where the rest of the ladder sits at plan rate. Confirm the 512p rate on the first post-launch fal statement anyway; only a >$0.03/s surprise would force a reprice at these prices.
