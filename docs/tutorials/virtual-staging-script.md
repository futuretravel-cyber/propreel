# Tutorial script — Virtual Staging (90s)

Source outline: `docs/tutorial-videos-guide.md` §2 (per-service scripts).
Prices verified against `lib/renderPricing.ts`.
Narration is **149 words ≈ 62s at Narakeet's 2.4 words/sec** — inside the
FlashHead 90s / ~216-word cap, **cost 14 credits** per avatar render.

## Beats

| # | Beat | On screen | VO time |
|---|---|---|---|
| 1 | Hook | Empty living room → furnished, wipe transition | 0:00–0:07 |
| 2 | Start state | Photo Editor (Staging), one empty-room photo loaded | 0:07–0:13 |
| 3 | Action | Brush-mask the room, pick preset, render | 0:13–1:00 |
| 4 | Result | Before/after slider, fullscreen hold | 1:00–1:15 |
| 5 | CTA | Badge + "staged in ~1 min" callout | 1:15–1:25 |

## Narration (paste into AI Writer verbatim, then into FlashHead)

> Stage an empty room for four credits — no furniture rental, no photographer.
> Here's an empty living room from a real listing. Open it in the Photo
> Editor's Staging tool. The first step is painting the mask: hold the brush
> and cover exactly what you want furnished — the floor, the back wall,
> around the window frame. Take the brush outside the room and it's refused,
> because only masked areas change anything. Now choose the style: we'll use
> Luxury Modern — warm walnut, brass, glass, the look buyers pay for. Every
> staging preset is four credits, and this is the only step that actually
> spends them. Click generate, give it a minute, and the same photo comes
> back fully furnished — sofa, rug, lighting, art. Drag the before-and-after
> slider so your client sees exactly what changed. Four credits, one photo,
> a room that books more viewings. Try Virtual Staging in the Studio —
> propreel.co.za.
>
> (149 words ≈ 62s narration at 2.4 w/s — inside the 90s cap.)

## Shot list (OBS, 1080p, 125% zoom, dark mode)

1. 3s b-roll: the furnished room from a previous staging result, playing
   before the reveal (any Staging history item).
2. Photo Editor → Staging tab, upload the empty-room photo (3s hold).
3. Brush mask: paint floor + back wall, ~15s real-time — this is the part
   agents need most, keep it un-cut so the cursor is readable.
4. Mis-mask demo (1 beat): brush a spot outside the window — UI refuses /
   nothing changes — then undo. Shows the guardrail, costs nothing.
5. Preset picker: row of style cards, highlight **Luxury Modern — 4 credits**.
6. Generate click → progress ring; cut immediately.
7. Result step: drag the before/after slider slowly left→right twice.
8. End card: "4 credits · staged in ~1 min" badge + propreel.co.za.

## Fact-check notes (already verified against the code)

- Staging presets (`luxury_modern`, `scandinavian_minimal`, `coastal_relaxed`,
  `family_comfortable`, `luxury_bedroom`, `home_office`, `industrial_loft`)
  run the masked Fill-Pro path and price **4 credits**
  (`STAGING_EDIT_CREDITS`); removal/twilight/HDR presets stay at 2.
- The mis-mask guardrail wording in VO #3 matches `useBrushMask`'s
  mask-summary flow (no render charged on an empty mask).

## Publish checklist

- Says credit price ✅ (4, plus 14 for this video's own avatar render —
  grips note: the tutorial itself is a FlashHead job)
- Captioned (review "credits", "ZAR", preset names)
- ≤100MB, thumbnail from beat 4 result frame
- Link from Photo Editor header, HelpModal FAQ, onboarding step 4
