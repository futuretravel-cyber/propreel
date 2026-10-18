# Tutorial videos for every PropReel service — tools + production guide

There are two voices in these videos: the **tools** that record and edit them, and the **workflow** that makes 8 of them consistent without 8x the work. PropReel is unusual here: most of the "production stack" you need already exists inside your own product.

## 1. The tool stack (Windows, since you're on Windows)

| Job | Tool | Cost | Why |
|---|---|---|---|
| Screen recording | **OBS Studio** | Free | Gold standard; 60fps, per-window capture, cursor highlighting (Windows 10+), no watermark |
| Quick recordings / shareable links | **Loom** (free 25-video tier) | Freemium | Fastest path screen→URL; use for drafts, not final product |
| Editing | **CapCut Desktop** | Free | Trim, zoom-pan onto clicks, auto-captions, export 1080p |
| Auto-captions (SA English + others) | CapCut or **Descript** | Freemium | Subtitles matter more than VO for social-cut videos |
| Voiceover | **Your own product** (Narakeet voices via the Studio narrator) | ~R3/min | On-brand, consistent, and it demos AI Writer tangentially |
| Scriptwriting | **Your own AI Writer** | 1 credit | Feed it the feature bullet list, ask for a 120-word Tutorial-video script |
| AI avatar presenter | **Your own FlashHead** | per-10s pricing | A talking head intro on the dashboard makes tutorials feel branded, not stock |
| Music bed | **Your own Admin Music Library** (Instrumental) | Free | Keep all 8 videos on a consistent, licensed bed |

Total fixed cost: **R0 software**. Everything paid is just your own credits.

## 2. The per-video recipe (same every time — that's the point)

Each tutorial is a fixed 5-beat structure (~90s for dashboard features, ~60s for AI Writer/Social):

1. **Hook (5s)** — one sentence of the outcome, not the feature: "Stage an empty room in 30 seconds for 4 credits."
2. **Start state (5s)** — show where it lives in the dashboard, on a real-looking property.
3. **Action, narrated step-by-step (30–45s)** — do ONE realistic flow, no detours. Zoom (CapCut keyframe 130%) onto each click. Speak the credit price as you go: "…charges 2 credits, refunded if it fails."
4. **Result (10s)** — the payoff artifact (video/photo/copy), fullscreen, hold 2s.
5. **CTA (5s)** — "Try it in the Studio → propreel.co.za" + the credit badge.

**Per-service scripts** (bullet outlines to paste into AI Writer, then lightly edit):
- **AI Video Generator** — 8-step wizard; demo a 3-photo Social-tier 30s reel; end on Tier pricing table.
- **Photo Editor** — pick one preset (HDR tone-map), strength slider story, before/after.
- **Virtual Staging** — brush-mask luxury_modern; two-stage screen: empty → furnished; brush tutorial is the part agents need most.
- **Furniture Removal** — upload a photo, single click → the room empties (no mask to paint since 2026-10-15); note 2-credit price.
- **Twilight** — preset pick, single click, sky shift.
- **AI Avatar (FlashHead)** — profile photo pitch + language/voice pick + per-10s pricing callout.
- **Property Description** — address verify → amenities auto-fill → generate copy.
- **Social Media** — 4-step wizard per platform output; show all 7 platform tabs in a 5s montage.
- **AI Writer** — duration-fit script with the live words-remaining counter as the visual centerpiece.
- **Billing/Credits** — bundle purchase → agency transfer (the renamed "Transfer Credits" tab) → plan change.

## 3. Recording settings that avoid re-shoots

- Browser at **1920×1080**, 110–125% zoom on the UI so text is legible after CapCut zoom-crops; dark mode ON (matches brand).
- OBS: 60fps, `format=yuv420p` (default), 8000kbps+, **screen capture with cursor**; record in short takes per step — never one 5-minute take.
- Fresh demo account per scene (the 5-credit signup bonus is literally enough for a Photo Edit + snippet) so balances look real; seed 200 fictional credits on the brand demo account so pricing badges don't show "insufficient" states.
- Use the `/dashboard` **draft-state (studioDrafts)** feature: preload the Property Description and photos before recording so step 1 never wastes tape.

## 4. Assembly line

1. Write all 10 scripts in one sitting (AI Writer + manual edit, ~1 hour).
2. Record all videos in one session (voices/settings constant — ~3 hours including reshoots).
3. Edit via the same CapCut template: intro sting (2s), zoom-on-click style, same caption style, same music bed (~4 hours for all).
4. Export 1080p MP4 (S3-ready naming: `tutorials/<service>_<lang>.mp4`).
5. Host on **CloudFront CDN you already have** (`cdn.propreel.co.za`) — do NOT embed from YouTube (ad churn + branding).
6. Surface them where users stall: the Studio tool headers (Play icon → in-app modal player), the OnboardingTutorial cards, and the HelpModal FAQ answers.

## 5. A differentiator worth trying first

Record the whole thing using **AI Writer for script → FlashHead avatar as presenter → Narakeet voiceover → own music**. Then every tutorial literally advertises three tools at once, and reshooting a changed feature means re-running one credit-cheap avatar render rather than re-recording a human.

**Fastest possible version** (if you want one by tomorrow): Loom + Narakeet VO + one PassSocial-style zoom in CapCut, export, upload to CDN. ~30 min per video; upgrade to OBS + FlashHead presenter later.

## 6. Publishing checklist per video

- [ ] Says the credit price (captures conversion objections)
- [ ] Captioned (CapCut auto-captions reviewed for ZAR amounts and plan names)
- [ ] ≤100MB (S3 + CDN-friendly), thumbnail 1280×720 from the result frame
- [ ] Linked from: tool header, HelpModal FAQ, onboarding step, and the Pricing page's per-service explainer
- [ ] Refund/failure note if relevant (charge only lands on success — say it)
- [ ] Language: start English; Afrikaans VO track later if analytics show ZA split
