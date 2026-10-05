# PropReel Website — Improvement Suggestions

> **Status: largely implemented.** This document was rewritten in October 2026
> to reflect what is actually in the codebase. The original March 2025 version
> described a Supabase/realtime stack that no longer exists and listed shipped
> features (code splitting, 2FA, referrals) as "to do". Anything still open is
> listed under **Open items** at the bottom.

## Stack (for context)

- **Frontend**: React 18 + Vite 6 + Tailwind 4 + TypeScript (`src/`)
- **API**: Vercel serverless functions in `api/` — **Hobby plan, hard cap of
  12 functions**. New endpoints must be added as `?action=` routes on existing
  functions (`api/users.ts`, `api/leads.ts`, `api/projects.ts`, …).
- **Worker**: Modal (`modal/app_propreel_minimax.py`) for renders, fal.ai for images
- **DB**: DynamoDB (`af-south-1`), Paystack for payments, Resend for email
- **Deploy**: push to `main` → Vercel project `propreel` → https://www.propreel.co.za

## Verification ritual (before every push)

```bash
npx tsc --noEmit
npx tsc --noEmit -p api/tsconfig.json
npm run build        # the 500 kB chunk warning on index is expected
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"  # Vercel refuses to deploy invalid JSON (e.g. an unterminated header string) and the site silently keeps serving the old bundle
```

---

## Shipped ✅

### Studio UX pass (5 Oct 2026)
- **Homepage badges swapped**: "AI Motion — Hailuo-02 engine" → "AI Motion —
  Generate AI Video from Images"; "Auto Upscale — 720p → 1080p" → "AI Avatar
  Video — Generate an AI-powered avatar video".
- **"AI Talking Profile" renamed to "AI Avatar Video"** everywhere users can
  see it (Studio add-on label, toasts, modal docs).
- **Talking Head can use your branding photo**: both the Video-tab avatar
  add-on and the Talking Head tab offer "Use my branding profile image"
  (default Agent Branding profile photo, falling back to the account avatar).
  `useFlashHead` accepts an already-hosted `imageUrl` and skips the presigned
  upload — the worker fetches the URL directly.
- **Uploads survive tab switches**: all eight Studio panels stay mounted
  (inactive ones `display:none`), so an image, draft or in-flight render
  remains until the user deletes it (new ✕ on the workbench preview) or the
  render completes.
- **Upload zone moved to the top** of Photo Editor, Virtual Staging, Furniture
  Removal and Twilight — the drop zone is now the first thing after the
  heading, before the option grids.
- **Social generator is a 4-step wizard** like New Listing: ① Property
  Details → ② Key Features → ③ Photos → ④ Platform, with numbered circles,
  connectors, Back/Next (step 1 needs a suburb/city) and the Generate button
  only on the final step — the post can't be generated before the form is
  completed.

### Data honesty & UX fixes (5 Oct 2026)
- **Profile menu moved to the top-right** of the dashboard header (avatar,
  name, chevron now sit after search/notifications/credits; the dropdown
  anchors right). Sidebar profile card unchanged.
- **Notification badge now actually clears.** `useActivity` read-state is
  shared across every mounted instance (header bell + NotificationCenter)
  through a window event and the native `storage` event — previously each
  copy of the hook kept its own stale `readIds`, so marking everything read
  left the badge stuck. Ledger notifications also key on the real
  `creditTransactions.id` (the old timestamp+amount key collided and
  re-surfaced as unread), the low-credit warning has a stable id, and
  deduction rows finally render (they read `t.reason`, which the API never
  sent — now `t.description`). Deleting a notification persists the
  dismissal and marks it read.
- **No fake notifications anywhere** — the seeded `legacyItems` demo list
  ("Luxury Villa in Constantia", "Monthly Report Ready", …) is gone;
  `/dashboard/notifications` is fed only by the credit ledger + project rows.
- **Credits expire in 365 days, not one month** — one rule, one place:
  `creditTtlIso()` in `lib/userService.ts`. Applied to signup bonus,
  referral friend/payout bonuses, auto top-ups, plan-upgrade carry-overs and
  subscription allocations (monthly grants no longer die at month end).
  `addCredits` now records `bonus` expiries too (it silently dropped them).
  Existing rows: `scripts/extend-credit-expiry.ts` (dry-run, `--apply`).
- **Active Sessions is real** — `GET /api/users?action=sessions` reads the
  sessions table (IP + user-agent captured at sign-in via `clientMeta`),
  shows device/signed-in/expires, and `POST ?action=sessions_revoke`
  revokes one session or all others for real.
- **Audit Log is real** — `GET /api/users?action=audit_log` merges sign-in
  rows, credit-ledger entries and the new `passwordChangedAt` /
  `twoFactorChangedAt` timestamps. The dead "Export Log" button now
  downloads that data as CSV. No invented events: the log is just shorter
  when nothing happened.
- **Google Maps lookup fixed for Listings + Property Description** —
  geocoding and nearby-amenities now proxy through
  `/api/projects?action=geocode|amenities` (server-side Nominatim → Photon,
  three Overpass mirrors, 8s upstream cap) so browser extensions / CORS /
  corporate filters can't break the call; the client falls back to a direct
  lookup only if the proxy itself is unreachable. Verified server-side:
  Constantia address → coordinates, no-match → "address not found",
  10 nearby amenities.

### Performance
- **Route-level code splitting** — dashboard-only components (`PropertyListings`,
  `EnhancedProjects`, `SecuritySettings`, …) and all public/auth pages are
  `React.lazy`-loaded behind Suspense boundaries in `src/App.tsx`. Main chunk
  went from **1,261 kB → 947 kB** (gzip 336 → 268 kB).
- Images are WebP with `srcSet`/`sizes` and `loading="lazy"` on the homepage;
  the below-the-fold demo reel (`/media/kitchen-after.mp4`, 864 KB) only loads
  once scrolled near (`useInView` in `HomePage.tsx`).

### SEO
- Per-route `<title>` / description / canonical / OG tags via `RouteSEO`
  (`src/lib/seo.tsx`) — dashboard areas emit `noindex`.
- `sitemap.xml` + `robots.txt` use the canonical `www.propreel.co.za` host with
  current `lastmod` dates; `robots.txt` no longer blocks `*.js` (that prevented
  Googlebot from rendering the SPA).
- Static OG/Twitter tags with absolute image URLs in `index.html`.

### Security
- Google OAuth: `state` carries a one-time CSRF nonce bound to an HttpOnly
  cookie; Google-asserted emails are marked `emailVerified` (password login
  no longer dead-ends for Google-created users).
- Security headers in `vercel.json`: `Referrer-Policy`, `Permissions-Policy`,
  and a **report-only CSP** (safe to observe console violations before
  enforcing).
- Existing: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, scrypt passwords,
  TOTP 2FA, Paystack webhook signature verification.

### Conversion & product
- Homepage: demo reel section below the hero (real 65-second render in a
  phone frame, with CTA), testimonial strip near the final CTA (auto-hides
  while the reviews table is empty — add real reviews via the app's review
  flow to activate it).
- `Forgot Password` link beside the password field on sign-in.
- **Give 5, get 5 referral program** (`lib/referral.ts`): server-side `?ref=`
  attribution during `auth_register`; friend gets +5 at signup, referrer gets
  +5 once — when the friend makes their **first purchase** (Paystack
  verify/webhook/subscription paths). Copyable link card on Billing → Overview.
- WhatsApp float + live-chat widget exist (`src/components/SupportWidgets.tsx`)
  and are toggled from **Admin → Integrations** (feature flags) — set a real
  WhatsApp number there to switch it on. No work remains in code.
- Contact page shows email + office only (placeholder phone number removed).
- **POPIA compliance pass** — cookie consent banner (`CookieConsent.tsx` +
  `lib/consent.ts`: Essential-only / Accept-all, persisted, re-openable from
  `/cookies`), analytics gated on consent in `lib/analytics.ts`, **real**
  data export (`POST api/users?action=data_export`, session-authed JSON →
  Settings → Privacy downloads full/projects/CSV), the existing password-
  confirmed deletion flow surfaced in the Privacy Policy rights section, and
  policy pages aligned with what the app actually does.
- **7-day temporary accounts** (`lib/trial.ts` + signup opt-in checkbox):
  uncommitted visitors can test the app with the 5-credit signup bonus for 7
  days, no card. Daily "days left" email (9am cron) + dashboard banner;
  day 7 without a subscription → soft delete (sessions revoked, sign-in
  locked, one "trial ended" email), reactivates on password re-login
  (browse-only until they subscribe); upgrading wipes the trial fields and a
  30-day retention purge removes never-converted accounts.

### Housekeeping
- This document rewritten to match reality.
- 30-day media retention, listings/projects/captions batches, profile menu,
  URL-driven settings tabs — shipped earlier (see git history).

---

## Open items

### Blocked on external dashboards (owner action, no code needed)
1. ~~**Resend is in TEST MODE**~~ — **RESOLVED 4 Oct 2026**: DNS records live
   (NS moved to `ns1/ns2.vercel-dns.com`), domain shows **Verified** at
   resend.com/domains. E2E-tested: register → confirmation, forgot → reset,
   all sent **FROM `PropReel <no-reply@propreel.co.za>`** and **Delivered**,
   no onboarding fallback; confirm + reset links both work end-to-end.
   DMARC (`_dmarc`, `p=none`) also live in the Vercel DNS panel.
2. **Paystack live keys** — see `docs/GO_LIVE_CHECKLIST.md`.

### Nice-to-have (not started)
3. **CSP enforcement** — after watching report-only violations for a while,
   drop `-Report-Only` in `vercel.json`.
4. **Blog / content marketing** — long-tail SEO ("property video cost South
   Africa", "Property24 video requirements") has no landing page today.
5. **Referral share stats** — the Billing card shows the link; a count of
   signups/payouts per referrer would need a `referredBy` GSI query (watch the
   12-function cap: extend `api/users?action=referral_stats`).
6. **Service worker strategy** — `sw.js` exists; review its caching rules so
   new deploys are never stale (Vercel asset hashing makes `cache-first` risky).
7. **Sentry / error tracking** — ErrorBoundary catches render errors but
   nothing reports them server-side yet.

### Measuring results
- Plausible is wired (`src/lib/analytics.ts`) — funnel events:
  `cta_clicked`, `signup_completed`, `pricing_toggle`, `google_login`.
- Watch: signup conversion from `/`, referral link copies vs. referred
  signups, LCP on the homepage (hero is an image, should be fast).
