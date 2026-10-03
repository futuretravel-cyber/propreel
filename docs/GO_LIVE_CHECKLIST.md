# PropReel — Go-Live Verification Checklist

**Created:** 3 October 2026
**Production:** https://propreel-xi.vercel.app (alias) · https://www.propreel.co.za (custom domain, DNS live)
**Status legend:** `[x]` verified done · `[ ]` pending manual action

> **Secret hygiene:** never paste live secret keys into chat. Put them in an
> untracked `.env.live` file (git-ignored) or set them directly in the
> Vercel / Paystack dashboards.

---

## 1. Paystack: test → live

Current state: **test mode everywhere** (`sk_test_` in Vercel production,
8 test plan codes `PAYSTACK_PLAN_*`). The code reads
`PAYSTACK_SECRET_KEY` for every API call — going live is a value swap, no code change.

- [ ] In Paystack dashboard, open the **Live** environment (toggle top-right)
- [ ] Complete live KYC (business info, bank settlement account) — payouts require it
- [ ] Create **8 live plans** matching `settings/pricing_config` exactly
      (source of truth — read amounts from the DB, not from memory):
      `STARTER | PROFESSIONAL | PREMIUM | AGENCY` × `MONTHLY | ANNUAL`
      - Amounts must be in **kobo** (amount × 100) and intervals must match the cycle
      - Plan names should match the plan id so the webhook mapping is readable
- [ ] Set Vercel production env (values via `.env.live`, not chat):

      npx vercel env add PAYSTACK_SECRET_KEY production        # paste sk_live_…
      npx vercel env add PAYSTACK_PLAN_STARTER_MONTHLY production
      npx vercel env add PAYSTACK_PLAN_STARTER_ANNUAL production
      npx vercel env add PAYSTACK_PLAN_PROFESSIONAL_MONTHLY production
      npx vercel env add PAYSTACK_PLAN_PROFESSIONAL_ANNUAL production
      npx vercel env add PAYSTACK_PLAN_PREMIUM_MONTHLY production
      npx vercel env add PAYSTACK_PLAN_PREMIUM_ANNUAL production
      npx vercel env add PAYSTACK_PLAN_AGENCY_MONTHLY production
      npx vercel env add PAYSTACK_PLAN_AGENCY_ANNUAL production

- [ ] Swap local `.env` `PAYSTACK_SECRET_KEY` to `sk_live_…` (dev testing against live is optional; keeping test locally is acceptable **as long as** local never points at production data)
- [ ] **Redeploy production** after env changes (`git push` to `main` → Vercel)
- [ ] Enable payment channels in live mode: cards (primary), EFT, SnapScan
- [ ] Decide pricing display: frontend prices come from `settings/pricing_config`
      — update the row **before** flipping plans so UI and Paystack agree

### Webhook (live environment → Settings → Webhooks)

- [ ] URL: **`https://www.propreel.co.za/api/paystack/webhook`**
      - ⚠️ Use **`www`** — the apex (`propreel.co.za`) issues a `308` redirect to
        `www`, and webhook POSTs should never depend on redirect-following
      - ✅ Endpoint verified live: unsigned POST → `401 {"error":"Invalid signature"}`
        (signature check via `verifyPaystackSignature` in `lib/paystack.ts`)
- [ ] Enable events: `charge.success`, `charge.failed`, `subscription.create`,
      `subscription.renewal`, `subscription.disable`, `invoice.payment_failed`
- [ ] Hit **Test webhook** from the Paystack dashboard and confirm HTTP 200
      in Vercel → Project → Logs → `api/paystack/webhook`

---

## 2. Payments E2E (live smoke test)

- [ ] Buy the smallest credit bundle with a real card →
      credits credited **exactly once** (webhook + `/api/paystack/verify` share the
      `pay_<reference>` idempotency marker)
- [ ] SA tax invoice PDF generated → S3 (`generateInvoicePdf`, non-blocking)
- [ ] Subscribe to PROFESSIONAL monthly → plan credits allocated, `subscription.create` mapped via `PAYSTACK_PLAN_*`
- [ ] `charge.success` also captured the card authorization (`paystackAuthorizationCode`) → auto-top-up/dunning can work
- [ ] Cancel from Billing → `subscription.disable` → status `CANCELLED` at period end
- [ ] Check Vercel logs for the day: no `Paystack webhook error`, no double-credit lines
- [ ] **Data caveat:** all existing subscription codes in DynamoDB are **test-mode**
      (`SUB_*` from test). Test subs will not renew in live mode. Decide before launch:
      cancel test subs and have existing customers re-subscribe, or treat existing
      accounts as grandfathered until their test period ends

---

## 3. Email (Resend)

> Step-by-step guide: [`docs/RESEND_DNS_SETUP.md`](RESEND_DNS_SETUP.md)

- [ ] Add & verify domain `propreel.co.za` at resend.com/domains
      (DKIM + SPF TXT records at registrar zadns: ns17/ns18.zadns.co.za)
- [ ] Verify `no-reply@propreel.co.za` shows **Verified** → branded sender active
      (code auto-falls back to `onboarding@resend.dev` → account address only until then)
- [ ] E2E: register with a **non-account** address → confirmation email arrives
- [ ] E2E: `/forgot-password` → reset email arrives, link sets new password, kills old sessions
- [ ] Confirm link works when clicked **later** (tokens valid until expiry — Gmail
      scanners don't burn them)

---

## 4. Domain & DNS

- [x] `propreel.co.za` → resolves (apex `308` → `https://www.propreel.co.za`, site 200)
- [x] Domain attached to Vercel project (appears under account Domains)
- [ ] Decide canonical host: currently everything redirects to **www** — set
      `www.propreel.co.za` as primary in Vercel → Project → Domains (avoids the redirect hop)
- [ ] HTTPS valid on both apex and www (Vercel-managed cert — spot-check)
- [ ] Old links (propreel-xi.vercel.app) either kept as alias or redirected to www

---

## 5. Platform & infra

- [ ] **Vercel Hobby → Pro** before commercial launch (docs/DEPLOYMENT_STATUS.md):
      crons are clamped to daily, and the 12-function cap blocks new API functions
- [ ] AWS PITR (point-in-time recovery) enabled on **all** runtime DynamoDB tables
      (per-table setting; `propreel-users` at minimum)
- [ ] Rotate any secret that ever appeared in chat (checklist item from earlier audits)
- [ ] Modal render worker healthy: `VITE_MODAL_ENDPOINT` responds; run one real
      video render end-to-end (Studio → project READY)
- [ ] Cron endpoint: without `CRON_SECRET` → 401, with it → 200 (already verified — recheck after env swaps)
- [ ] Plausible analytics receiving events (`/api` + SPA pageviews)
- [ ] Archive local backups (`admin-row-backup.json`, `supabase-final-backup.json`)
      somewhere safe, then remove from workspace root

---

## 6. Final verification ritual (run before every launch-impacting push)

```bash
npx tsc --noEmit                      # root: src + lib + scripts
npx tsc --noEmit -p api/tsconfig.json # Vercel functions
npm run build                         # vite production bundle

set -a; source .env; set +a
npx tsx scripts/test_auth_flow.ts     # 18 checks (auth E2E)
npx tsx scripts/livetest_ledger_v2.ts # 11 checks (credits/ledger)
npx tsx scripts/livetest_agency.ts    # 17 checks (agency pool)
```

Live smoke after deploy:

- [ ] `GET /` → 200, bundle loads, no console errors
- [ ] `GET /api/subscriptions?action=pricing` → plans from `settings/pricing_config`
- [ ] `GET /api/users?action=auth_session` → `{user:null}` when logged out
- [ ] Full human path: signup → email → confirm → payment → welcome → dashboard tour
