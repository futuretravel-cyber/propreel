# PropReel Website & Product Improvement Plan

**Audited:** 1 October 2026 — live site (propreel-xi.vercel.app), desktop 1440px + mobile 375px, plus source review.

---

## P0 — Fix before marketing the site (broken/risky today)

### 1. Homepage images are hotlinked from an AI generator (≈6 MB of PNGs)
All 9 homepage images point at `image.qwenlm.ai/generated-images/…/_result.png` —
ephemeral URLs that can 404 any time, each **0.9–1.4 MB uncompressed PNG**
(measured: 1.4 MB + 0.95 MB on the first two alone). If Qwen rotates the links,
the homepage fills with broken images. **Fix:** download all 9 into `public/images/`,
convert to WebP at sensible widths (hero ~1200px, cards ~600px → ~60–120 KB each),
and reference locally. Homepage image weight drops from ~6 MB to ~700 KB.

### 2. A video product's homepage has zero video
No `<video>` anywhere on the public site — the strongest proof of an AI video
product is missing. **Fix:** add a hero showreel (muted, autoplay, loop, playsinline,
`poster` fallback, <3 MB, 9:16 + 16:9 variants) and 2–3 before/after clips in the
features section, mirroring what the old Clerk app did (`/kitchen-video.mp4`).
Any video the Studio has already rendered can be the source material.

### 3. `loading="lazy"` / `srcset` used nowhere
All images load eagerly, competing with first paint. Fix alongside #1:
`loading="lazy"` + `decoding="async"` on everything below the fold, explicit
`width`/`height` to stop layout shift (CLS), and `srcset` for the responsive sizes.

---

## P1 — Homepage conversion & responsiveness

### 4. Hero: tighten the first-screen story (desktop)
The H1 ("Create Stunning Property Videos Instantly with AI") is good, but the
hero is text+gradient only. Recommended structure:
- Left: H1 + one-line subhead + dual CTA ("Generate your video" primary,
  "Watch 60-sec demo" secondary opening a modal with the showreel).
- Right: looping property-video reel in a phone-frame mockup (9:16) — product proof
  in the first viewport.
- Social proof strip directly under hero: "Trusted by 1 000+ SA agents" + agency
  logos + 3 metric badges (videos rendered, avg. render time, agent rating).

### 5. Mobile touch targets are too small
Measured on 375px: "Try it free" is **85×20px**, nav links 20px tall — under the
44–48px accessibility minimum, and thumb-unfriendly. Fix: `min-h-[44px]` on all
nav/CTA elements, larger tap padding on footer links, and make the sticky CTA
bottom bar on mobile (appears after scrolling past hero).

### 6. Small text on mobile
Caption text renders at 12px ("Cinematic property reel created in 2 min") —
bump minimum body text to 14px mobile / 16px desktop.

### 7. Pricing page (mobile) needs work
- **No monthly/annual toggle** — the PLANS data has annual pricing but the page
  can't show it; add a toggle (default monthly, "save ~15%" badge on annual).
- "Popular" card uses `scale-105`, which is disabled on mobile (no transform found)
  — use a "Most popular" ribbon instead so it survives responsive reflow.
- CTAs all say "Get Started" — make them plan-specific ("Choose Starter") and
  deep-link into `/register?plan=STARTER&cycle=MONTHLY`.
- Cards stack 1-per-row at 334px width — fine, but feature lists collapse to
  very tall cards; show first 4 features + "Show all" expander.

### 8. Add the missing trust/SEO blocks
- FAQ section on homepage (accordion, 6–8 Qs) — biggest SEO win for "property
  video AI South Africa" searches; also feeds Google rich results.
- Testimonials exist in code (`mockData.ts`) but only render on /reviews — surface
  3 on the homepage.
- Footer: add quick links to Pricing/FAQ, ABN/Company reg, POPIA compliance note
  (you already have the PAIA/DPA pages — link them prominently).

---

## P2 — Product/feature improvements

### 9. Demo without signup (top growth lever)
Let visitors paste a Zillow/Property24 URL on the homepage and get a watermarked
360p preview render without an account (1 free anonymous render per IP/day via
the existing Modal endpoint). Converts curiosity → signup far better than copy.

### 10. Before/after slider component
For the features section: draggable comparison slider between original listing
photo and AI-enhanced/staged frame. Cheap to build, extremely shareable.

### 11. Voice/branding personalization preview
The Studio supports FlashHead lip-sync and voice — surface a "hear the AI voice"
widget on the homepage (3 sample clips: male/female/accented EN-ZA).

### 12. Dashboard activation loop
- Post-render share sheet: one-click "Post to Instagram/Facebook/WhatsApp
  Business" (pre-filled caption + hashtags per platform — the AI captions
  feature already generates these).
- Referral credits: give 20 credits when an invited agent signs up (agency
  table infrastructure already exists to track this).

### 13. Performance
- JS bundle is 338 KB gzipped (1.34 MB raw) — code-split with React.lazy:
  Studio/Billing/Admin load on demand; recharts + framer-motion out of the
  critical path. Expected initial load <120 KB gzipped.
- Add `Cache-Control: immutable` (already configured in vercel.json for
  /assets) — keep asset filenames hashed.

### 14. Analytics & SEO plumbing
- No analytics found: add Plausible or GA4 + conversion events (signup started,
  render completed, plan selected).
- `robots.txt`/`sitemap.xml` exist ✓ — add OG/Twitter meta tags per page
  (og:video for the showreel) and JSON-LD `SoftwareApplication` + `FAQPage`.

---

## Quick wins checklist (can ship in one session)

1. Download + convert 9 Qwen PNGs → local WebP, add lazy/srcset (P0-1, P0-3)
2. Record/collect 2–3 real renders → hero showreel `<video>` (P0-2)
3. `min-h-[44px]` touch targets + 12px→14px mobile text (P1-5, P1-6)
4. Pricing toggle + plan-specific CTAs (P1-7)
5. FAQ accordion + 3 testimonials on homepage (P1-8)
6. Code-split Studio/Billing/Admin (P2-13)

## Bigger bets (separate sessions)

- Anonymous free render demo (P2-9)
- Before/after slider + share sheet + referrals (P2-10, P2-12)
- Full analytics + JSON-LD rollout (P2-14)
