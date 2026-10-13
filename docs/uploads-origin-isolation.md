# Media origin isolation — `uploads.propreel.co.za` (design)

Audit follow-up to L-1 ("serve user-uploaded content from a separate subdomain").
Buckets are already private and all reads are presigned (M-5); what's missing is a
**first-party, cookieless, response-header-hardened origin** for everything the browser
loads, so the app never speaks `amazonaws.com` and even a file that slipped past
validation renders inert.

Status: **Phases 0–3 shipped (Phase 4 outstanding).** ACM wildcard issued + validation/CAA records; both distributions Deployed (raw `E2NM670HSO83KH`, cdn `E3U9UG2IMXG4RB`) with alias CNAMEs in Vercel DNS; Phase-1 probe 17/17 (`scripts/_phase1_probe.ts`); Phase-2 `toEdgeUrl` wired at every response boundary and live with `EDGE_RAW_HOST`/`EDGE_CDN_HOST` set in production + `edge-hosts` Modal secret — probe `scripts/_edge_probe.ts` 17/17, worker `media_selftest` edge 206. Phase-3 live walk (upload → render → invoice → P&L → share → admin music) confirmed **no `s3.af-south-1` hostname in any browser request**, and surfaced the frozen-presign defect below, fixed in the same pass: `parseObjectUrl` now also accepts the media origin, so `rawS3Url` writes the canonical unsigned bucket form and reads re-sign any edge URL a row happens to hold (`scripts/_edge_row_probe.ts` 19/19) — plus `safeUser` became the read boundary that re-signs `avatarUrl`/`agentProfiles` media. Remaining: Phase 4 (drop bucket hosts from CSP, tighten raw-bucket CORS).

---

## 1. Current state (facts this design builds on)

| Fact | Where |
|---|---|
| Two private buckets, `af-south-1`, BPA on, no bucket policies | `propreel-raw-assets` (user uploads `uploads/<uid>/`, audio `music/`, `reports/`, `invoices/`, P&L) · `propreel-video-outputs-sa` (renders, thumbnails) |
| Reads: presigned GET, 1h (app) / 7d (worker API boundary) / 15min (P&L) | [lib/s3Urls.ts](../lib/s3Urls.ts), Modal `presign_urls` |
| Writes: presigned PUT, 300s, contentType+size signed in | [api/music.ts](../api/music.ts) `?action=presign` |
| Server-side validation: magic-byte sniff, EXIF strip, ownership prefix | [api/music.ts](../api/music.ts) `?action=verify_upload` |
| Browser CSP allows both bucket hosts in `connect-src` (for the PUT), `img-src`/`media-src` are bare `https:` | [vercel.json](../vercel.json) |
| Session cookie is **host-only**: `Path=/; HttpOnly; SameSite=Lax; Secure`, no `Domain=` | [lib/auth.ts](../lib/auth.ts) `sessionCookie` |
| Raw bucket CORS is `AllowedOrigins: *`; output bucket is restricted to propreel origins | `aws s3api get-bucket-cors` |
| DNS zone lives on **Vercel DNS** (`ns1/ns2.vercel-dns.com`) | DoH lookup |
| `uploads.propreel.co.za` / `cdn.propreel.co.za` — nothing exists yet | DoH lookup (NXDOMAIN) |
| Rows store the **raw bucket URL**; signing/rehosting happens only at response boundaries | [lib/s3Urls.ts](../lib/s3Urls.ts) `rawS3Url` |

## 2. Decision: CloudFront, no OAC, presigned pass-through

**Chosen: CloudFront (two distributions). Rejected for now: Cloudflare.**

Why CloudFront:

1. **Zone is on Vercel DNS.** A proxied Cloudflare record requires the whole zone on
   Cloudflare (NS migration: every Vercel DNS record, mail, future subdomains). That blast
   radius is far larger than this change. CloudFront needs only two CNAMEs in the existing zone.
2. **No new credential family.** The pattern (validated write-up, and identical to what
   our signing already produces) is: CloudFront in front of S3 **without OAC**, every request
   carries the existing SigV4 presigned query, and **S3 validates it**. No RSA key pair, no
   Workers secrets, no edge signer — the browser keeps presenting the same capability URLs it
   does today, just under our hostname.
3. OAC (the usual CloudFront↔S3 wiring) is **incompatible with presigned URLs**: OAC signs the
   origin request in the `Authorization` header while the presign authenticates via query
   string → S3 `400 Only one auth mechanism allowed`. OAC would force a migration to
   CloudFront signed URLs (new key pair, new signer in TS *and* Python) — deliberately not doing that.

Why not other alternatives:

- **Cloudflare Workers edge-signer**: strongest endgame (arbitrary TTL → permanent share
  links) but needs the zone on Cloudflare → defer; revisit only if the zone ever moves.
- **S3 website endpoints / public buckets**: no security-header control, undoes M-5.
- **Vercel rewrites/proxy**: no response-header injection on proxied media, Hobby limits. No.

### How the pass-through keeps signatures valid (the core trick)

SigV4 presigns sign `host: <bucket>.s3.af-south-1.amazonaws.com` plus path+query.
CloudFront, when the origin is configured as an **S3 origin**, rewrites the `Host` header back
to the origin domain on the origin fetch. So:

```
browser  GET https://uploads.propreel.co.za/uploads/42/x.jpg?<presign-for-bucket-host>
   → CloudFront (origin = propreel-raw-assets.s3.af-south-1.amazonaws.com)
   → S3 sees Host: propreel-raw-assets.s3.af-south-1.amazonaws.com + the original query
   → signature covers exactly that host/path/query → 200 ✓
```

We therefore **mint presigns exactly as today (for the bucket host) and rewrite only the
hostname in the URL handed to the browser**. One helper, one line per boundary.

## 3. Architecture

```
                                     ┌──────────────────────────────────────────┐
 Browser (www.propreel.co.za)        │  CloudFront distribution A              │
   uploads: PUT  ──────────────────► │  alias: uploads.propreel.co.za          │
   photos/video: GET ──────────────► │  origin (S3, NO OAC):                   │
   (host-only session cookie stays   │   propreel-raw-assets.s3.af-south-1     │
    on www — never sent here)        │  cache: DISABLED (v1)                   │
                                     │  response headers: hardened (§6)        │
                                     └───────────────┬──────────────────────────┘
                                                     │ presigned query validated BY S3
                                                     ▼
                                              private S3 buckets
                                                     ▲
                                     ┌───────────────┴──────────────────────────┐
                                     │  CloudFront distribution B              │
                                     │  alias: cdn.propreel.co.za              │
                                     │  origin: propreel-video-outputs-sa      │
                                     │  (renders, thumbnails)                  │
                                     └──────────────────────────────────────────┘

 Vercel API  ── signs for bucket host, rewrites host → edge host (reads + PUT presigns)
 Modal worker ── same rewrite at its API boundary; vendor/internal fetches stay DIRECT to S3
 Rows/DB     ── unchanged: raw bucket URLs only
```

- Two distributions because CloudFront cannot map one hostname onto two buckets without
  path rewriting (needs Lambda@Edge); per-bucket hostnames are simpler and self-documenting.
- Server-to-server traffic (worker downloads, fal.ai/MiniMax inputs, reaper, verify_upload)
  stays **direct S3** — no browser, no benefit from the edge.

## 4. Edge configuration spec (per distribution)

| Setting | Value | Why |
|---|---|---|
| Origin | S3 bucket, domain **regional virtual-hosted**: `<bucket>.s3.af-south-1.amazonaws.com` | SigV4 covers `host` — must byte-match what we sign. Selecting the bucket in the console may yield the global endpoint (`bucket.s3.amazonaws.com`) → `403`; **same bug family we already hit in the Modal worker** |
| Origin access | **None — do NOT grant CloudFront bucket access, no OAC** | Presigns must be validated by S3, not by CF |
| Origin type | must be recognized as **S3 origin** | A "custom" origin gets `x-amz-cf-id` appended → S3 rejects: *"headers present which were not signed"* |
| Alternate domain | `uploads.propreel.co.za` / `cdn.propreel.co.za` | |
| TLS cert | One ACM wildcard `*.propreel.co.za` in **us-east-1**, DNS validation (CNAMEs in Vercel DNS) | Covers both hosts + future subdomains |
| Allowed HTTP methods | `GET, HEAD, OPTIONS, PUT, POST, DELETE` | PUTs (uploads) and OPTIONS preflight go through the edge |
| Cache policy | Managed **CachingDisabled** (v1) | Correctness: with caching, an expired presign could be served from cache; TTL 0 means every request reaches S3 and expiry is enforced exactly (§7) |
| Origin request policy | Custom: **query strings: all**; headers: `Range`, `Origin`, `Access-Control-Request-Method`, `Access-Control-Request-Headers` | Query = the signature (must reach S3). Range = video seeking. The three CORS headers = S3 must answer the browser's PUT preflight with the right `Access-Control-Allow-*` |
| Response headers policy | Custom (§6) | The actual security payload |
| Price class | default | ZA viewers; optional PriceClass_100 later |

Note: cache-policy query strings and origin-request-policy query strings are **mutually
exclusive** — all query strings live in the origin request policy while caching is disabled.

## 5. URL & signing model

**Rule: rows and signatures change zero; only the hostname the browser sees changes.**

```ts
// lib/s3Urls.ts (or a tiny sibling lib/mediaOrigin.ts)
const EDGE_HOSTS: Record<string, string | undefined> = {
  [process.env.AWS_S3_RAW_BUCKET    || 'propreel-raw-assets']:      process.env.EDGE_RAW_HOST,    // uploads.propreel.co.za
  [process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa']: process.env.EDGE_CDN_HOST,    // cdn.propreel.co.za
};

/** Rewrite a bucket-host presigned URL to its edge hostname. Empty env → no-op (rollback). */
export function toEdgeUrl(url: string): string { /* parseObjectUrl → https://edgeHost/key?same-query */ }
```

Applied at every **response boundary** (nowhere else):

| Boundary | File | What |
|---|---|---|
| Project/agency/music reads | [lib/s3Urls.ts](../lib/s3Urls.ts) `signS3Url` | sign, then `toEdgeUrl` — covers list/POST/PUT/agency_history/music list |
| Upload presign response | [api/music.ts](../api/music.ts) `?action=presign` | `uploadUrl` (PUT) + `publicUrl` (preview GET) rehosted; presign itself still minted for the bucket host |
| Audio upload response | [api/music.ts](../api/music.ts) `?action=upload` | same |
| Agency report URL | [lib/agencyReport.ts](../lib/agencyReport.ts) | 7d signed → rehosted |
| P&L PDF link | [lib/pnl.ts](../lib/pnl.ts) `pln_pdf` | 15min signed → rehosted |
| Worker API boundary | `modal/app_propreel_minimax.py` `presign_urls` | `video_url`, thumbnails, `image_url` rehosted via `EDGE_*_HOST` env; **vendor submits + internal fetches unchanged (direct)** |
| Invoice PDF | — | already streamed through our origin (`?action=invoice_pdf`) — no change |

Fallbacks: `signS3Url`'s "signing failed → raw URL" path keeps returning bucket URLs
(rendering survives; CSP still lists bucket hosts until Phase 4).

## 6. Response header hardening (the security payload)

Applied by the response headers policy to **every** response, including 4xx:

| Header | Value | Effect |
|---|---|---|
| `Content-Security-Policy` | `sandbox; default-src 'none'; frame-ancestors 'none'` | Even if hostile HTML/SVG/JS were served (defense in depth on top of the sharp sniff), a top-level open (`window.open(videoUrl)` happens today) renders in an opaque origin: **no scripts, no forms, no network, no framing** |
| `X-Content-Type-Options` | `nosniff` | Bytes are what the (server-normalized) Content-Type says, or the browser refuses |
| `Strict-Transport-Security` | `max-age=31536000` | HTTPS on the media host itself |
| `Referrer-Policy` | `no-referrer` | Media fetches/opens leak nothing outward |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Belt & braces |

Why this is genuine isolation (not cosmetic):

- The session cookie is **host-only** → the browser never sends `propreel_session` to
  `uploads.propreel.co.za`. No cookie → no session on that origin, ever.
- The API sends no `Access-Control-Allow-Origin` for the media origin → script running
  there cannot read `www.propreel.co.za` responses.
- `sandbox` + `nosniff` make served bytes inert at the document layer.
- The origin has nothing to steal: no app state, no cookies, no same-origin app pages.

## 7. Caching strategy

- **v1: caching disabled (TTL 0).** CloudFront is a pass-through proxy that injects
  headers. Correctness first: S3 enforces exact presign expiry; an expired URL can never be
  served from a cache. Zero changes to signing code.
- **v2 (when traffic justifies it):** rounded signatures + bounded cache —
  freeze the signing clock to the last 30 min (one URL per object per 30-min window, the
  `timekeeper` trick from the CloudFront+S3 presigned literature), set cache TTL to 30 min,
  keep query strings **in the cache key**. Guarantees: (a) garbage/forged queries miss cache
  and get rejected by S3 (never serve cache without a signature-shaped key), (b) stale-beyond-
  expiry window ≤ 30 min. Report keys (`reports/`, `invoices/`, `pnl/`) get their own
  behavior with a short TTL (they are overwritten in place); media keys are
  content-unique (`uploads/<uid>/<ts>-<rand>.jpg`) and safe for long TTLs.
- Explicitly rejected: "cache without query in cache key" — any request with a
  garbage query would hit a cached copy → private bucket effectively public.

## 8. CSP / CORS deltas

[vercel.json](../vercel.json) `connect-src` (one deploy ahead of the code flip):

1. Phase 2: **add** `https://uploads.propreel.co.za https://cdn.propreel.co.za`.
2. Phase 4 (after live verification): **remove**
   `https://propreel-raw-assets.s3.af-south-1.amazonaws.com` and
   `https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com`.
   End state: the browser never contacts `amazonaws.com`.
   `img-src`/`media-src` stay `https:` (external listing photos from portals require it).

Bucket CORS:

- Output bucket: unchanged (already `propreel.co.za` origins + localhost + `*.vercel.app`).
- Raw bucket: tighten `AllowedOrigins: *` → the same five-origin list (Phase 4).
  The browser still sends `Origin: https://www.propreel.co.za`; CloudFront forwards it
  (origin request policy), S3 evaluates it — tightening does not break the edge path.

## 9. Rollout plan (deploy-safe order, rollback at every step)

**Phase 0 — DNS + cert (no traffic change)**
1. ACM wildcard `*.propreel.co.za` in us-east-1; add the two validation CNAMEs to Vercel DNS.
2. Add `uploads` and `cdn` CNAME records pointing at the (not-yet-used) distributions.

**Phase 1 — distributions, verified before any code touches them**
3. Create both distributions per §4 (watch the three gotchas in §13).
4. Probe with a fresh presign (pattern: `scripts/_m5_sign_check.ts`):
   - `GET https://uploads.propreel.co.za/<key>?<valid presign>` → **200** with §6 headers;
   - same path with no/forged query → **403** (from S3, sandboxed error response);
   - `OPTIONS` preflight + a full **PUT round-trip** through the edge → 200;
   - `Range` GET → 206.

**Phase 2 — code (env-gated, instant rollback)**
5. `EDGE_RAW_HOST` / `EDGE_CDN_HOST` empty in prod → behavior identical to today.
6. Implement `toEdgeUrl` + wire the boundaries in §5 (Vercel) and `presign_urls` (worker).
7. CSP: add both edge hosts (keep bucket hosts).
8. Ritual: `tsc` ×2, `vercel.json` parse, `npm run build`, `py_compile` worker.
9. Push; `modal deploy`.

**Phase 3 — live verification (real account, real flows)**
10. Photo: presign → PUT → verify_upload (EXIF strip) → preview → project grid → share copy.
11. Render: paid job → worker returns edge-hosted `video_url` → playback + `window.open`.
12. Invoice link, P&L link, agency report URL (manual webhook dry-run).
13. Admin music upload + `<audio>` playback.
14. Confirm **no** `s3.af-south-1` hostname appears anywhere in DevTools.

**Phase 4 — close the door**
15. Remove both bucket hosts from CSP `connect-src`; tighten raw-bucket CORS.
16. Re-run step 14 (now failures would hard-fail → proves the browser needs only the edge).

**Rollback**: unset the two env vars (all minting reverts to bucket URLs — CSP still allows
both during Phases 2–4) or point them back; distributions can stay up idle. Bucket config
untouched throughout.

**Backlog (v2)**: rounded signatures + caching (§7); `Content-Disposition: attachment`
behavior for `reports/`, `invoices/`, `pnl/`; permanent share links (Lambda@Edge HMAC —
solves the 7-day presign ceiling without leaving AWS); CloudFront access logs; bucket CORS
tightening already in Phase 4.

## 10. Cost

- No distribution fixed fee; v1 has **cache off**, so the bill is viewer-request fees plus
  data out (S3 → CloudFront transfer is free). At current volume: low single-digit USD/month;
  Phase-2 caching reduces origin/S3 request costs and latency. CloudFront WAF ($5/mo + rules)
  is deliberately out of scope.

## 11. Security analysis (honest)

**Fixes / improves:**
- Browser-facing media origin becomes first-party, cookieless, script-sandboxed (closes the
  residual half of audit L-1 — subdomain isolation).
- CSP `connect-src` shrinks: no `amazonaws.com` in the app's CSP at all.
- Bucket names disappear from every client-visible URL (rows keep them server-side only).
- Uniform security headers on every media response, including errors — something S3 alone
  cannot do.
- Raw bucket CORS `*` gets tightened as part of the cutover.

**Does NOT change:**
- Presigned URLs remain bearer capabilities with their existing TTLs (1h/7d/15min);
  ShareSheet's 7-day external-link ceiling is untouched (backlog item).
- Server-to-server paths (vendors, reaper, verification) still speak direct S3 — by design.
- Upload validation itself (sharp sniff, EXIF strip, size/type pinned in the signature) —
  unchanged; the edge is the *second* line of defense, not a replacement.

## 12. Risks / gotchas register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Origin domain signed for the wrong host (global vs regional endpoint) → 403 | §4 row 1; Phase-1 probe catches it before code ships. Same bug already hit and fixed in the Modal worker (`addressing_style='virtual'`) |
| 2 | Distribution treats origin as *custom* → `x-amz-cf-id` unsigned → `403 HeadersNotSigned` | Confirm origin type shows as S3 in console; Phase-1 probe |
| 3 | Query strings not forwarded → S3 sees no signature → 403 | Origin request policy explicitly forwards all query strings; Phase-1 probe |
| 4 | PUT preflight fails through the edge | `OPTIONS` allowed + `Origin`/`Access-Control-Request-*` forwarded; Phase-1 PUT round-trip |
| 5 | Cache serves expired URLs | v1 cache disabled; v2 design bounds staleness (§7) |
| 6 | Rehosted URL handed to a *server-side* consumer (worker vendor fetch) | Rewrite only at client response boundaries; vendor submits keep raw URLs (§5) |
| 7 | `verify_upload` EXIF re-encode overwrites object after initial PUT | Client only receives the URL after verification; keys are content-unique; cache off in v1 anyway |
| 8 | Env var typo → host rewrite no-ops or points wrong | `parseObjectUrl` validates bucket allowlist; probe in Phase 1/3; unset = legacy behavior |
| 9 | **Client echoes a rehosted URL back into a row → the row freezes an expiring presign** (Phase-3 finding: photos died after 1 h, videos after 7 d; reads returned the stored bytes, so nothing could renew them) | `parseObjectUrl` accepts the media origin too: `rawS3Url` normalises to the unsigned bucket form on write, and every read re-signs whatever form the row holds — polluted rows self-heal. Probe `scripts/_edge_row_probe.ts` |
| 10 | Tabs open across the deploy keep the OLD CSP `connect-src` (no edge hosts) until reload → `fetch` to the media origin fails, images still come from the bucket host | One-time, self-heals on reload; worth a release note whenever the CSP gains a host |

## 13. Open questions (defaults chosen, override if you disagree)

1. **Hostnames**: `uploads.propreel.co.za` (raw bucket) + `cdn.propreel.co.za` (outputs).
   Alternative: `media.` instead of `cdn.`.
2. **PDF links**: keep inline (today's behavior) vs `Content-Disposition: attachment`
   (downloads instead of tab preview). Default: keep inline in v1, attachment in backlog.
3. **Cache**: v1 disabled (default) vs jumping straight to rounded signatures + caching.
   Default: disabled — correctness first, traffic is small.
