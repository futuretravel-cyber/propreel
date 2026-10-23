# PropReel — Full-Site Product & UX Audit

_Status: the three P0s and the quick wins (§2–§4 nav/copy, §10 runway,
§14 Escape/aria-current) are implemented in the accompanying change set._

_Date: 23 October 2026. Covers the public site, the whole dashboard, the admin
panel and the Vercel API (`api/`, `lib/`). Priorities: **P0** = fix soon
(security, broken promises, money), **P1** = next sprint (real UX wins),
**P2** = consider (product direction, polish). This supersedes
`docs/ux-audit-2026-10-23.md`, whose items have been implemented._

---

## 1. Executive summary — the ten strongest recommendations

1. **P0 — Close the spoofable admin checks in `api/leads.ts`.** `review_queue`
   and `review_moderate` trust a client-supplied `?email=` / `email` field
   against a hardcoded admin list. Anyone can approve/reject reviews and read
   the pending queue (names + agencies); `agency_members` has no gate at all
   and returns agency rosters — with emails and credit balances — for any
   `user_id`. Route them through `requireAdminSession()` / `requireOwner()`
   like the rest of `api/users.ts` already does. (`api/music.ts` is already
   session-gated but duplicates the admin-email list — fold it into
   `isAdminActor`.)
2. **P0 — Make the plan feature lists true.** `PLANS` promises "Cinematic +
   Premium tiers", "Custom voice selection", "Priority/Fastest render queue"
   and "AI social captions for 7 platforms", but the app enforces none of
   these (any plan can pick any tier; every plan gets all 7 platforms and all
   voices). Either enforce the gates server-side at the job-token mint or
   rewrite the features around what actually differs (credits, seats, pool,
   support).
3. **P0 — One source of truth for admin identity.** `ADMIN_EMAILS` is
   duplicated in `lib/auth.ts`, `api/users.ts`, `api/leads.ts` and
   `api/music.ts`. Move it to a single module (or env var) and delete the
   copies.
4. **P1 — Split `App.tsx` (6,446 lines) into route modules and a UI kit.**
   The strongest structural recommendation in this audit: see §16.
5. **P1 — Unify the two video tools.** "Budget AI Video" and "Video
   Generator" are two sidebar entries, two wizards and two mental models for
   one job ("make my reel"). Make them one Studio whose Tier step includes the
   budget option, or rename + cross-link them clearly.
6. **P1 — Finish or drop light mode.** The theme toggle switches a `.dark`
   class, but `PublicLayout`, tooltips, scrollbars and many components are
   hardcoded dark. Half a theme is worse than one honest theme.
7. **P1 — Credits page: show expiry per grant and a runway forecast.**
   Credits now all last 365 days per grant (`lib/creditPolicy.ts`) but the UI
   can't answer "when do my credits expire?" or "how long will they last me?".
8. **P1 — Generate social copy for all platforms at once.** One 2-credit
   generation produces one platform's caption. A "full social pack" (all 7
   platforms for ~5 credits) matches how agents actually market a listing.
9. **P2 — Rename/repair marketing numbers so they can never drift:** the
   homepage hardcodes "27 AI Photo Presets" and "Starter plan" stats; plan
   copy says "All 7 Studio tools" while the homepage tool grid shows six cards.
   Derive every count from the data.
10. **P2 — Mobile navigation gaps** (agency owners lose Settings; most tools
    are unreachable from the bottom bar) — see §2.

---

## 2. Information architecture, layout & navigation

**Sidebar (`DashboardLayout`, `src/App.tsx`)**
- 12–14 flat items with no grouping. Group them: **Create** (Video, Budget
  Video, Photo Editor, Description, Social), **Manage** (Listings, Projects,
  Branding), **Grow** (Analytics, Tutorials), **Account** (Credits, Settings),
  **Admin**. Users scan for a job, not an alphabet.
- The sidebar upgrade card hardcodes `price=1270` in its link
  (`/payment?plan=PREMIUM&cycle=MONTHLY&price=1270`). Read it from `PLANS`
  so a price change can't strand the CTA.
- "Upgrade to **Pro**" everywhere vs the plan named "**Premium**" — pick one
  word. Same for the button on `EnhancedBilling`.
- "Budget AI Video" sits directly above "Video Generator" — two video entries
  with no explanation of which to pick. At minimum add a one-line subtitle to
  each ("gentle motion, no voiceover" vs "cinematic, narrated").

**Mobile**
- `MobileNav` (bottom bar) offers Dashboard / Create / Projects / Credits /
  Profile — but agency owners get "Agency" **instead of** Profile, so they
  cannot reach Settings on the bottom bar at all. Keep both (5 items + More).
- Photo Editor, Description, Social, Listings, Branding, Analytics and
  Tutorials are only reachable via the hamburger. A "More" sheet with the full
  list (the sidebar already exists) fixes this cheaply.
- `GlobalSearch` action "AI Avatar Video" links to `/dashboard/video` with no
  deep link; give it `?step=avatar` (the wizard already keeps step state in
  the URL via `useToolTab`-style params).

**Public chrome (`PublicLayout`)**
- Top nav: Pricing, Blog, Reviews, About, Contact — **FAQ is missing** even
  though `/faq` exists and the footer links it. Add it to the top nav (it is
  the second-highest-intent page for a cautious buyer).
- Footer "Agency Login" points at `/dashboard/agency`, which requires an
  account and an agency. Rename to "For Agencies" and point at
  `/agency/signup`.
- Footer "Dashboard"/"Video Studio" links are dead ends for logged-out
  visitors; route them through `/login?next=…`.

---

## 3. Theme, colours & visual system

- **The brand ramp mixes two hues.** `--color-brand-500…600` are violet
  (`#a855f7`, `#9333ea`), `700–800` are pure purple (`#800080`, `#6b006b`),
  and `900` jumps back to violet (`#581c87`). Pick one family (the purple
  `#800080` is the brand mark) and generate a monotone ramp from it.
- **The primary gradient is copy-pasted** (`#800080 → #9a35a6 → #b252bd`) in
  `.btn-primary`, `.tab-pill-active`, `.brand-text-gradient` and inline
  shadows. Extract it to one custom property.
- **Light mode is half-built.** `ThemeProvider` toggles `.dark`, but
  `PublicLayout` hardcodes `bg-ink-950 text-white`, and `.tooltip-content`,
  the scrollbar, selection colour and many `text-white` literals ignore the
  theme. Either commit to light mode (audit every `dark:`-less literal) or
  remove the toggle until it is real.
- **Hardcoded purples instead of tokens:** `text-purple-400`,
  `bg-purple-700`, `from-purple-700 to-purple-500` appear across HomePage,
  MobileNav, the sidebar and wizard steps. Route them through `brand-*`.
- **Radius scale is inconsistent:** `rounded-lg`, `xl`, `2xl`, `3xl`,
  `[2.5rem]`, `[2rem]` all appear on cards and pills within one page. Define
  three radii (control / card / pill) and stick to them.
- **Icon set is consistent (lucide-react) — good.** Emoji icons appear in
  `SOCIAL_PLATFORMS`, `TONES` and EnhancedAgency onboarding; fine for warmth,
  but they render differently per platform. Consider lucide equivalents in
  dense UI, emoji only in marketing/onboarding.
- Ink ramp and helper-text contrast are now AA-clean (ink-500 ≈ 4.6:1) — keep
  the token comments that document why.

---

## 4. Homepage & marketing copy

- **Numbers that can drift:** `HomePage` hardcodes `'27'` AI Photo Presets and
  `'4'` AI Video Tiers; `PLANS[0]` features say "All 7 Studio tools" while the
  homepage tool grid shows six cards and the sidebar shows seven tools +
  budget video. Compute counts (`PHOTO_PRESETS.length`, `TIERS.length`) and
  define once what a "Studio tool" is.
- **Hero stats are weak selling:** "Starter plan — 110 credits/mo · R129" is a
  price, not a proof point. Replace with something outcome-shaped (e.g.
  "Renders in ~10 min", "11 SA languages", "Used by agents in 9 provinces").
- **Duration claims disagree:** the demo reel caption says "a real 65-second
  reel", the hero promises "a full Essential 30-second reel", and the mock
  player shows "0:20 / 0:30". Keep each claim accurate to its artefact.
- **Awkward sub-labels in `EditorDemo`:** "AI Motion — Generate AI Video from
  Images" and "AI Avatar Video — Generate an AI-powered avatar video" say the
  label twice. Write the benefit ("Camera motion from one still",
  "A talking presenter in your brand").
- "Social tier reel · 512p" is an internal spec used as marketing. Sell the
  outcome ("Made for Reels & TikTok"), keep specs for the pricing table.
- **CTA wording** is consistent ("Start Free — 5 Credits") — good. The
  FinalCta "Cancel anytime" refers to subscriptions but sits under a free
  signup CTA; tie the sentence to the offer above it.
- **Video weight:** the hero autoplays a ~2.6 MB showreel and DemoReel lazy
  loads a ~864 KB reel — good practice; add `poster` images so slow mobile
  connections see something instantly.
- **SEO/structured data:** blog + `seo.tsx` exist. Add `RealEstateAgent` /
  `SoftwareApplication` JSON-LD, FAQ schema on `/faq` (it is literally a Q&A
  list), and a sitemap if missing.

---

## 5. Pricing & plans

- **Feature lists don't differentiate (P0, see §1):** Starter says "All 7
  Studio tools"; Professional adds "AI social captions for 7 platforms" which
  Starter already has. The only honest deltas today are credits, price and
  (claimed) queue priority/seats. Rewrite around real deltas or build the
  gates.
- **Plan names vs UI:** "Upgrade to Pro" (sidebar) vs `PREMIUM` "Premium" vs
  the earlier "Professional" tier naming collision — "Professional" is both a
  **plan** and (in users' heads) a video tier they never see. Consider plan
  names that can't collide with tiers (e.g. Starter / Plus / Pro / Agency).
- Annual billing now states "Billed R1 320 once a year" etc. — good; keep the
  per-month "equivalent" secondary.
- Add a **monthly↔annual toggle with savings badge** on the homepage pricing
  teaser too, not only `/pricing`.
- The `bundleSavingPct` "up to X% below the top-up rate" copy is computed from
  the table — good pattern (keep deriving copy from data like this).

---

## 6. Video generation

- **Two entry points for one job (P1).** Budget AI Video (5 steps, gentle
  motion, no voiceover) vs Video Generator (8 steps, narrated, avatar). Merge
  into one Studio with the budget option as a Tier/Style choice, or rename
  ("Calm Reel — Budget") and cross-link as they already do in prose.
- The 8-step wizard is long but well-structured; the cost summary above
  Generate (tier + avatar = total ≈ rand) is exactly right. Extend the same
  idea to a **Review step**: every choice, the duration, the total cost and an
  ETA before the money is spent.
- **Queue feedback:** `RenderProgressBar` shows elapsed-vs-typical. Add queue
  position when the worker reports it, and a "we'll email you" fallback for
  long renders (email infra exists in `lib/email.ts`).
- **Resumability:** renders survive navigation (`renderPoll`, `studioDrafts`)
  — good. Surface "1 render in progress" globally (the header bell exists) so
  users can leave the page confidently.
- Voiceover language guardrails (11 SA languages, per-language voices,
  mismatch banner) are a genuine differentiator — market them on the homepage
  ("Your reel speaks isiZulu") rather than only in the wizard.
- The AI Avatar cap warning (script over 90 s) is clear. Consider pre-sizing
  the script to the avatar cap automatically when the avatar is on.

## 7. Photo editor & image tools

- **All four tools cost a flat 2 credits** (`useImageEdit` mints a 2-credit
  job token; the tabs show ⚡2). A stale comment in `App.tsx` still says
  "Virtual Staging 4⚡" — fix the comment or the price. If staging costs more
  to render than a sky fix, price it accordingly and say so on the tab.
- **Before/After mismatch:** "Before" shows the natural aspect; "After" is a
  fixed `aspect-square` placeholder, so the columns don't align until the
  render lands. Match the placeholder to the preview aspect.
- The strength/guidance knobs exist as props (`strength`, `guidanceScale`) but
  aren't exposed. An "Advanced: intensity" slider would give users control
  when a result is too subtle or too aggressive — and reduce "credits wasted"
  complaints (which the AI notice currently apologises for instead).
- **Batch mode:** agents have 20 photos per listing. Let them queue the same
  preset across multiple photos (the upload queue infra already exists).
- "27 presets" claims must derive from `PHOTO_PRESETS.length` (see §4).
- Add a per-preset one-liner of what actually changes ("warms the light,
  keeps the structure") — preset names alone invite trial-and-error spending.

## 8. Property description

- Strong form (address → geocode pin → amenities, features, 4 photos,
  server-priced generation, refund-on-failure, distinct Property24 vs Private
  Property exports). Remaining gaps:
- **Character counters for portal limits** on each export (Property24 and
  Private Property truncate at different lengths) with a "trim to fit" hint.
- **Link the description to the Listing record** so a listing holds photos +
  description + video in one place (Listings and this tool are currently
  separate worlds).
- **Multi-language descriptions** (Afrikaans, isiZulu, isiXhosa…) — the
  voiceover already covers 11 languages; the copy does not. Huge for the SA
  market and consistent with the brand.
- Wording: "Top up in Billing" — billing now lives in Credits
  (`?tab=billing`); say "Top up in Credits" or link straight to the tab.

## 9. Social media & sharing

- **One platform per 2-credit generation.** Add a **"Full social pack"**
  (captions for all 7 platforms in one generation for a bundled price), since
  the tool already collects everything the model needs.
- Per-platform **preview cards** (avatar, handle, truncation with "…more")
  would beat the plain textarea + counter, which users must imagine.
- `SOCIAL_PLATFORMS` limits are now real (IG 2,200; X 280; LinkedIn 3,000;
  TikTok 2,200; FB 63,206; WhatsApp ~400; Newsletter 1,000) with
  model-facing rules — good pattern. Note WhatsApp **Status** (720 chars) and
  WhatsApp **broadcast** are different products; the copy currently assumes
  broadcast.
- `ShareSheet` supports WhatsApp/Facebook/X/LinkedIn/Telegram/Email + native
  share. Instagram and TikTok can't be shared via web intents — add a
  **"Copy caption + link"** fallback button with a hint ("paste into your
  Instagram caption"), and "Download video" prominence for those two.
- Generated posts save to My Projects (kind SOCIAL) — good; let users re-open
  and edit them from there instead of regenerating.

## 10. Credits, billing & payments

- **Expiry visibility (P1):** every grant now lasts 365 days and plan credits
  roll over (`lib/creditPolicy.ts`). The Credits page already lists per-grant
  expiries ("Your Expiring Credits"), but the list is unsorted and unbounded —
  sort soonest-first and cap it at the next few. Pair it with a runway line
  ("at your pace your balance lasts ~9 weeks") from the 30-day usage the
  activity feed already computes.
- **Runway forecast:** the sidebar already computes 7d/30d usage. Turn it into
  "At your pace (~40/mo) you have ~9 weeks of credits left" on the Credits
  page.
- Auto-top-up exists and handles the no-card case with a prompt — good.
  Surface it in the low-credit nudge itself ("or enable auto top-up") rather
  than only on the Credits page.
- **Invoices:** PDFs are generated per payment and streamed with a proper
  session gate (`requireOwner`) — good. Show all invoices with a year filter
  (currently capped at the last 8), and make sure the PDF carries the VAT
  number + "VAT inclusive" (the site promises "All prices include VAT").
- **Referrals are buried** inside Billing (share links for "5 free credits").
  Give referrals/gifting their own "Rewards" tab; agents share these.
- **Card management:** dunning now links to payment — add an explicit
  "Update card" action on Billing that opens Paystack's customer/authorization
  flow, so a failed renewal is one click from fixed.
- Trial copy ("rendering locked until you subscribe", 7-day clock) is clear
  and honest — keep the tone as the template for other notices.
- PaymentPage now shows real receipts (`credits × R1.50`, "subscription
  active") and doesn't force-redirect — good.

## 11. Admin panel

- Tab structure (Business: Overview / P&L / Render ops; People: Users /
  Agencies / Reviews; Content: Prompts / Tutorials / Music; System: Settings /
  API keys / Update mode) is sensible. Improvements:
- **P0 security (see §1):** `api/leads.ts` admin actions accept a spoofed
  `email`/`?email=` (and `agency_members` accepts any `user_id`). Standardise
  on `requireAdminSession(req)` / `requireOwner(req, …)` everywhere and drop
  the `?email=` parameters from the admin UI fetches entirely (they are
  vestigial where the server already gates on the session).
- **Bug:** `FalHealthCard` renders `className="text-sm font-medium {c.color}"`
  — a literal `{c.color}` inside the class string (the inner span saves the
  colour). Fix the template literal.
- **Admin audit log:** credit grants, role changes, review moderation and
  update-mode toggles should land in a queryable log (SecuritySettings already
  promises "Audit Logs — retained 2 years"; make it true for admin actions).
- **CSV exports** for Users, Agencies, P&L and Render ops (the tables are
  already there; finance will ask).
- Users table: add filters (plan, status, trial), sorting by credits/spend,
  and a "last active" column — `admin_stats` already has the activity data.
- `update-mode` is powerful (site-wide lock) — add a countdown/"this locks the
  site for N minutes" confirm and an automatic expiry so it can't be left on.

## 12. Backend & API (`api/`, `lib/`)

- **Auth model is good:** opaque server-side sessions, HttpOnly+Secure+Lax
  cookies, scrypt hashes, `requireOwner`/`requireAdminSession` gates, and
  server-priced job tokens the client can't tamper with. The remaining
  stragglers are `api/leads.ts` and `api/music.ts` (§1).
- **`scanItems` hotspots:** `deleteSessionsForUser` scans the sessions table;
  admin stats/ledger scan their tables. Fine at today's size, O(table) at
  scale. Add a `userId` GSI on sessions and paginate admin scans.
- **`crypto.scryptSync`** blocks the serverless event loop (~100 ms per
  login). Use the async `crypto.scrypt` and await it.
- **RPC-style routing** (`?action=…` across `users.ts` 3,000+ lines) works but
  concentrates risk. Split handlers into per-domain modules (auth, credits,
  billing, admin) behind the same routes; keep the action names so clients
  don't break.
- **Rate limiting:** `lib/rateLimit.ts` exists — ensure it wraps the
  expensive public endpoints (signup, login, review submit, geocode proxy) if
  it doesn't already; those are the abusable ones.
- **Idempotency:** Paystack `verify`/webhook paths should be idempotent on
  `reference` (double webhooks = double credits). Confirm and add a guard if
  missing.
- **Error shape:** some endpoints return `{ error }`, others `{ success,
  message }`. Standardise `{ ok, error, code }` so the client can branch on
  codes (e.g. `insufficient_credits`, `trial_locked`) instead of message text.
- Cron self-test + maintenance + project reaper + media retention crons are
  good operational hygiene — the `docs/` runbooks match them.

## 13. Trust, compliance & support

- POPIA-era coverage is strong: PAIA manual, DPA, Privacy, Cookies, Refund
  policy, AI notice, retention single-sourced from `RETENTION_DAYS`. Keep the
  practice of deriving legal copy from constants.
- Add the **refund policy link next to every "credits are non-refundable"**
  warning (already in `ToolPageHeader` — mirror it on the render button
  itself).
- Support: email + bug-report mailto exist. For SA agents, a **WhatsApp
  support link** (even a chat-to link) beats email; `SupportWidgets` is the
  natural home.
- `/status` page with real checks is excellent; link it from the render-error
  states ("something wrong? check Status").

## 14. Accessibility

- Reduced-motion and ink contrast are handled; skip link exists on public
  pages. Remaining gaps:
- **Modals need focus traps + Escape** (`HelpModal`, confirm dialogs,
  `ShareSheet`) — currently click-outside only in some.
- **Wizard steppers** (Social 4-step, New Listing, video wizard) should carry
  `aria-current="step"` and a proper ordered-list structure.
- **Tables** (admin, billing history) need `<th scope>` and caption for
  screen readers.
- Video previews: captions are burned into the reel (good); the raw `<video>`
  elements need `aria-label` (some have it) and a text alternative for the
  demo.
- All icon-only buttons should have `aria-label` (most do — sweep for the
  remaining `✕`/`×` ones).

## 15. Performance

- **Code-split the dashboard.** `App.tsx` is one giant eagerly-parsed module
  containing the video wizard, admin panel and every tool. `React.lazy` the
  route components (public pages already are) — the admin panel alone pulls
  recharts into every session.
- Lazy-load **recharts** only on Analytics/Admin pages.
- `PropertyListings` is already kept out of the main bundle — good; apply the
  same to `EnhancedAgency`/`EnhancedAnalytics` (they're only used on one
  route each).
- Homepage images use `srcSet`/`sizes`/`lazy` — good; extend `srcSet` to the
  bento cards.
- Debounce the GlobalSearch input and admin user search (currently filter
  per keystroke over a full user list — fine client-side, but debounce for
  polish).
- The sessions/settings tables in DynamoDB are fine; the client `fetch`es have
  no request cancellation — add `AbortController` on unmount to avoid state
  updates on unmounted components (React warnings).

---

## 16. The strongest structural recommendation

**Split `App.tsx` into route modules and extract the design system.**

At 6,446 lines `src/App.tsx` contains: the router, the dashboard shell, the
8-step video wizard, the budget wizard, all four photo tool tabs, the
description and social tools, the settings pages, and the entire admin panel.
Every change risks every feature; typechecks take seconds; nobody can find a
string; and code-splitting is impossible without surgery. Concretely:

1. `src/routes/` — one folder per route (`video/`, `photo-editor/`,
   `description/`, `social/`, `admin/`, `settings/`), each exporting its page
   component. Keep `App.tsx` as router + providers only (~200 lines).
2. `src/ui/` — the primitives already living in `index.css` (`.btn`, `.input`,
   `.card-dark`, `.tab-pill`, `Tooltip`, `ErrorBoundary`, `Skeleton`) as real
   components with consistent props. This is also where the colour/radius
   cleanup (§3) lands.
3. `src/api/` client wrappers for `api/users.ts` actions, typed per action —
   every component currently hand-builds `fetch('/api/users?action=…&email=…')`
   strings (including the vestigial `email` params that should die with §1).
4. Keep behaviour identical throughout (this is a move, not a rewrite) and let
   the typechecker guide each extraction.

Do this **after** the P0s — they are small, surgical diffs — and before any
large feature work (scheduling, multi-language copy, multi-photo batch) so the
new code lands in clean modules.
