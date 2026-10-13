# Tutorial script — AI Video Generator (90s)

Source outline: `docs/tutorial-videos-guide.md` §2 (per-service scripts).
Prices verified against `lib/renderPricing.ts` (single source of truth).
Narration is **172 words ≈ 72s at Narakeet's 2.4 words/sec** — inside the
FlashHead 90s / ~216-word cap, **cost 16 credits** per avatar render.

## Beats

| # | Beat | On screen | VO time |
|---|---|---|---|
| 1 | Hook | Result reel playing fullscreen | 0:00–0:07 |
| 2 | Start state | Studio → Start a Video, fresh listing loaded | 0:07–0:13 |
| 3 | Action | 8-step wizard walkthrough, zoom-on-click | 0:13–1:00 |
| 4 | Result | Rendered 30s Social reel, fullscreen hold | 1:00–1:15 |
| 5 | CTA | Pricing table + badge | 1:15–1:25 |

## Narration (paste into AI Writer verbatim, then into FlashHead)

> Turn five listing photos into a finished marketing reel — about a minute
> of AI work, thirty credits, and you never leave your dashboard. Here in
> the Studio, start a new video and load a real listing: five photos —
> three of the house, one kitchen, one view of the garden. Choose the
> Social tier at 512p — that's the one for WhatsApp, Instagram and the
> property portals, and a thirty-second reel costs thirty credits. The
> wizard asks for a property description — let the AI Writer draft it for
> one credit, or type your own. Then pick your style, set the pacing for
> each photo, and choose a narration voice. Click generate: our render
> farm zooms, pans and scores the whole reel in four to six minutes — and
> your credits are only charged if it succeeds, because any failed render
> refunds automatically. The finished reel lands in your Projects list,
> ready to download and send to the client. A full listing video, in
> under ten minutes. Try the AI Video Generator in the Studio —
> propreel.co.za.
>
> (172 words ≈ 72s narration at 2.4 w/s — inside the 90s cap.)

## Shot list (OBS, 1080p, 125% zoom, dark mode)

1. 3s b-roll: previous finished reel playing (any Projects item).
2. Studio list → "Start a Video" click.
3. Step 2 photo upload: drop 5 files (hold 3s on uploaded grid).
4. Tier select: highlight **Social 512p — 30s · 30 credits** row ONLY.
5. Description step: click "Use AI Writer" (1-credit badge visible).
6. Structure/pacing step: drag one pacing slider.
7. Voiceover step: play 3s of the VO preview.
8. Generate click → progress bar; cut immediately, don't wait on tape.
9. Jump-cut: finished reel in Projects → play to 10s.
10. End card: plan pricing table + "30 credits · 4–6 min render" badge.

## Publish checklist

- Says credit price ✅ (30 / 1 / AVATAR 2-per-10s if avatar used)
- Captioned (review "credits", "ZAR", tier names)
- ≤100MB, thumbnail from beat 4 result frame
- Link from Studio video header, HelpModal FAQ, onboarding step 3
