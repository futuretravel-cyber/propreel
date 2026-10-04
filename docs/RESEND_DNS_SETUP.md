# PropReel — Resend DNS verification for `propreel.co.za`

**Created:** 3 October 2026 · **Goal:** branded sending from `PropReel <no-reply@propreel.co.za>`
to **all** recipients, replacing the onboarding-sender limitation.

## Where things stand today

**✅ DONE (4 Oct 2026)** — domain shows **Verified** at resend.com/domains;
E2E-tested: confirmation + reset emails Delivered FROM
`PropReel <no-reply@propreel.co.za>` (fallback never fires). Details below kept
for reference / re-verification.

| Fact | Detail |
|---|---|
| API key | `RESEND_API_KEY` — **send-only restricted** (it cannot read `/domains`; domain work happens in the Resend dashboard) |
| Sender used | `PropReel <no-reply@propreel.co.za>` (default in [lib/email.ts](../lib/email.ts); override with `EMAIL_FROM` env) |
| Verified | **Yes — 4 Oct 2026**. Records published on zone `ns1/ns2.vercel-dns.com` (NS moved from zadns): MX `send` → `feedback-smtp.eu-west-1.amazonses.com` (10), TXT `send` → `v=spf1 include:amazonses.com ~all`, TXT `resend._domainkey` → `p=MIGf…` |
| Note on SPF | Resend puts SPF on the **`send`** subdomain (their Route53 guide), not the root — a root TXT SPF is *not* required for verification |
| After verification | Fallback stops firing automatically — no deploy, no code change (confirmed) |

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

## Step 3 — Add them at the DNS host

**⚠️ Updated 4 Oct 2026:** the zone now delegates to **`ns1/ns2.vercel-dns.com`**
(NOT zadns anymore), so records are edited in the **Vercel DNS panel**:
`vercel.com → team → Domains → propreel.co.za → DNS Records`
(the page linked from the project's Domains → *View DNS Records & More*).
The registrar only holds the NS delegation itself.

1. Open the Vercel DNS panel for `propreel.co.za`.
2. For each record from Step 2: **Add** → type (MX/TXT) → Name (relative:
   `send`, `resend._domainkey`) → value → TTL 3600.
3. Save. Do **not** touch the existing `A @` or `CNAME www` records.
4. Propagation from Vercel's own nameservers is near-instant (observed <1 min
   on Google + Cloudflare DoH; worst case 72 h anywhere else).

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

## Step 5 — DMARC ✅ DONE (4 Oct 2026)

Added in the Vercel DNS panel and confirmed live on Google **and** Cloudflare DoH
minutes later:

```
Host:  _dmarc
Type:  TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@propreel.co.za   (TTL 60)
```

`p=none` monitors without rejecting — reports land at `dmarc@propreel.co.za`
(create that mailbox or point `rua` elsewhere if you want to read them).
Once delivery is stable, consider tightening to `p=quarantine`.
Verify any time with: `nslookup -type=TXT _dmarc.propreel.co.za`

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
| DNS panel (current) | Vercel: `vercel.com/…/~/domains/propreel.co.za` — zone NS `ns1/ns2.vercel-dns.com` |
| DMARC | `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@propreel.co.za` — live 4 Oct 2026 |
