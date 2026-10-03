# PropReel — Resend DNS verification for `propreel.co.za`

**Created:** 3 October 2026 · **Goal:** branded sending from `PropReel <no-reply@propreel.co.za>`
to **all** recipients, replacing the onboarding-sender limitation.

## Where things stand today

| Fact | Detail |
|---|---|
| API key | `RESEND_API_KEY` — **send-only restricted** (it cannot read `/domains`; domain work happens in the Resend dashboard) |
| Sender used | `PropReel <no-reply@propreel.co.za>` (default in [lib/email.ts](../lib/email.ts); override with `EMAIL_FROM` env) |
| Current behaviour | API rejects the branded sender with a "domain is not verified" error → code **auto-falls back** to `PropReel <onboarding@resend.dev>`, which only delivers to the Resend account address (`futuretravel@gmail.com`) |
| DNS today | NS `ns17/ns18.zadns.co.za` · **no TXT records exist** (clean slate) · apex MX points at the domain itself (default, harmless) |
| After verification | Fallback stops firing automatically — no deploy, no code change |

---

## Step 1 — Add the domain in Resend

1. Sign in to the Resend dashboard → **Domains** → **Add Domain**.
2. Enter **`propreel.co.za`** (the root domain, matching our default sender).
   - *Alternative (deliverability best practice):* Resend recommends a subdomain
     like `mail.propreel.co.za`. If you choose that, you must also set
     `EMAIL_FROM='PropReel <no-reply@mail.propreel.co.za>'` in Vercel **and**
     locally, or the code will keep sending from the unverified root address.
3. Region: **US East (Virginia)** is Resend's default and fine for SA recipients.
   (Closest region to your recipients matters more for latency than deliverability.)
4. Leave the Return-Path custom subdomain at its default (`send.propreel.co.za`).
5. Click **Add Domain** → open the domain's **Records** tab.

## Step 2 — Copy the records exactly

Resend generates account-specific values — **copy them from your Records tab**;
do not use example values from blog posts. You will see roughly:

| # | Type | Host / Name | Value (example shape) | Purpose |
|---|------|-------------|------------------------|---------|
| 1 | **MX** | `send` (return-path) | a `feedback-smtp…` host with priority `10` | bounce/complaint routing (SPF for the envelope) |
| 2 | **TXT** | `resend._domainkey` (one or more selectors) | `v=DKIM1; k=rsa; p=MIIBIjAN…` | DKIM signing |
| 3 | **TXT** | `@` (root) | `v=spf1 include:… ~all` | SPF — authorises Resend to send for the domain |

Rules that cause most failures:

- **Host values are relative.** Enter `send`, `resend._domainkey`, or `@` —
  never `send.propreel.co.za` in a panel that already appends the domain.
- **Copy-paste, don't retype.** A single character difference in DKIM breaks verification.
- If Resend ever shows a **CNAME** instead of MX/TXT, make sure it is **not proxied**
  (no "orange cloud" style CDN proxy).
- The existing apex MX (`propreel.co.za`) does **not** conflict — Resend's MX lives
  on the `send` subdomain.

## Step 3 — Add them at the registrar (ZAdns)

Your NS is `ns17/ns18.zadns.co.za`, so records are edited in the **ZAdns / registrar DNS panel**
for `propreel.co.za` (the same panel where the Vercel `A @ → 76.76.21.21` and
`CNAME www → cname.vercel-dns.com` records live):

1. Log in to the registrar → manage `propreel.co.za` → **DNS records / zone editor**.
2. For each record from Step 2: **Add** → type (MX/TXT) → host → value → TTL **Auto**.
3. Save. Do **not** touch the existing `A @` or `CNAME www` records.
4. Wait ~5–15 minutes for the zone to propagate (worst case 72 h).

## Step 4 — Verify

1. Resend dashboard → your domain → **Verify DNS Records**.
   Typically passes within 15 minutes; if not after 72 h, hit **Restart verification**.
2. Confirm publicly visible (run locally):

   ```bash
   nslookup -type=TXT propriel.co.za      # SPF (+ DKIM if on root)
   nslookup -type=TXT resend._domainkey.propreel.co.za
   nslookup -type=MX send.propreel.co.za
   ```

   Or use https://dns.email to inspect what Resend sees.
3. Dashboard status must read **Verified** (green).

## Step 5 — DMARC (after the domain is verified)

Add one more TXT at the root, starting permissive and tightening later:

```
Host:  _dmarc
Type:  TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@propreel.co.za
```

`p=none` monitors without rejecting; once delivery is stable, consider `p=quarantine`.
(No DMARC record exists today — `nslookup` confirms zero TXT records.)

## Step 6 — Prove branded sending works end-to-end

1. No redeploy needed — [lib/email.ts](../lib/email.ts) retries the branded sender
   first on every send; the fallback only fires on "not verified".
2. **E2E test:** register a fresh account with a *non-account* email address
   (e.g. a second Gmail). The confirmation email must:
   - arrive in that inbox (not just the account address),
   - show **From: PropReel <no-reply@propreel.co.za>**,
   - contain a working `/confirm-email?token=…` link (tokens stay valid until expiry).
3. Also test `/forgot-password` → reset email arrives from the branded sender.
4. Check Vercel logs: no more
   `branded sender … rejected (domain unverified) — sent via onboarding@resend.dev`
   warnings.

---

## Quick reference

| Item | Value |
|---|---|
| Dashboard | https://resend.com/domains (account: futuretravel@gmail.com) |
| Records source of truth | Domain → **Records** tab (copy exactly) |
| Fallback behaviour | automatic in `lib/email.ts` — no code/env change needed after verification |
| `EMAIL_FROM` override | only needed if you verify a **subdomain** instead of the root |
| Free tier | 3,000 emails/month, 100/day — enough for transactional volume at launch |
