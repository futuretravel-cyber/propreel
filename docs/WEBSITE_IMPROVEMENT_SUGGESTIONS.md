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
