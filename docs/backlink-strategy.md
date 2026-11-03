# Backlink & authority strategy — propreel.co.za

Goal: earn **25 quality referring domains in 6 months** (≈4–5/month) so the SEO
work already shipped (canonical URLs, sitemap, schema, single H1, OG image) can
actually rank. A brand-new domain with perfect on-page signals and zero links
ranks for its own name and little else.

Rules of engagement:

- **Relevance over volume.** One link from a South African property publication
  is worth more than 50 generic directory links.
- **No paid link networks, PBNs, guest-post farms, or reciprocal "link exchange"
  schemes.** They are the fastest way to a manual action and are impossible to
  unwind cleanly.
- **Anchor text stays natural.** Mostly brand ("PropReel", "propreel.co.za"),
  sometimes descriptive ("AI property video tool for SA agents"). Never the same
  keyword anchor repeated across many domains.
- **Every link points at a real, canonical URL** from `public/sitemap.xml` — not
  at a redirect, not at `/signup` (which canonicalises to `/register`).

---

## 0. Prerequisites (do before any outreach)

| Item | Why | Status |
| --- | --- | --- |
| Google Search Console verified + sitemap submitted | The Links report is the only free, complete view of who links to you | **Blocked** — needs the owner's Google account (see §7) |
| Bing Webmaster Tools verified | Bing/ChatGPT-style crawlers use it; free backlink data | Not done |
| Google Business Profile (service-area business, South Africa) | Local pack + a citation every SA competitor has | Not done |
| Consistent NAP (name, address/area, phone, email) everywhere | Citation consistency is the cheapest authority signal | Not done |
| Working `hello@propreel.co.za`-style contact address on site | Publishers need someone to reply to | Confirm |
| OG image + favicon live | Links get shared as cards; a broken card kills click-through | Done |

---

## 1. Foundation links (weeks 1–2, work through the list)

These are low-value individually but they establish the entity. Every one is a
legitimate profile the business would own anyway.

**SaaS / product directories**
- Product Hunt — launch once the demo video is public; a real launch can pull
  10–30 referring domains in a day.
- AlternativeTo, SaaSHub, Startup Stash, BetaList, Indie Hackers (product page).
- G2 / Capterra / GetApp — only list if you can support reviews; an empty
  listing is worse than none.

**South African business listings**
- Brabys, Yellow Pages South Africa, Snupit, Cylex ZA.
- SA tech/proptech roundups: Ventureburn, TechCentral startup directories,
  SA Startup Network listings.

**Social profiles** (add to `Organization.sameAs` in `index.html` JSON-LD *as
they go live* — never list a profile before it exists)
- LinkedIn company page, Facebook page, Instagram, YouTube channel, X/Twitter.

**Property-industry memberships** — a member-directory link from an industry body
(IEASA, or a regional institute) is the single highest-relevance link available
to this business. Worth the membership fee on SEO grounds alone.

---

## 2. Content that earns links (weeks 2–8)

Nothing attracts editorial links like a free thing a journalist or an agent can
cite. Build these as public pages on the site, then pitch them:

1. **"Listing video length calculator"** — input platform (Reels, TikTok,
   YouTube Shorts, portal) + property type → recommended duration and shot list.
   Cheap to build, endlessly quotable, agents share it in WhatsApp groups.
2. **The SA listing-photo checklist** (printable PDF + web version) — a lead
   magnet that also gets cited in training material.
3. **Property marketing benchmark report** (quarterly) — aggregate, anonymised
   Studio data: average reel length, most-used languages, photo counts, render
   turnaround. Original data is the only content class that reliably earns links
   from publications. *Only publish aggregates, never per-customer data, and say
   so in the methodology note.*
4. **Before/after gallery** — the existing kitchen before/after is exactly the
   asset publications embed with attribution. Give each example a stable,
   canonical gallery URL.

Each asset needs: a real URL, an embeddable image with the "Source:
propreel.co.za" line baked into the image, and a one-paragraph pitch email.

---

## 3. Outreach targets (weeks 3–12)

Ordered by realistic hit rate for a new domain:

| Target type | Examples (verify each is still active) | Angle |
| --- | --- | --- |
| SA property news/blogs | Property24 news, Private Property blog, IOL Property, Moneyweb Property | Data from the benchmark report; "AI in SA listings" comment |
| Property Professional / estate-agent trade press | Trade magazines and agency association newsletters | Educational piece: how agents cut video cost without an editor |
| Proptech & startup media | Ventureburn, TechCentral, htxt.africa | Funding/product launch story |
| Podcasts (property + small business) | SA property and agency-owner podcasts | Founder interview; always ask for show notes with a link |
| Training providers / estate-agent academies | Course providers needing tool recommendations | Free seats/tool access in exchange for a resource-page listing |
| Regional agency blogs | Mid-size agencies publishing "our marketing stack" posts | Tool mention with a real review |
| Journalist request services | Featured, Qwoted, SourceBottle | Answer SA property-marketing queries weekly |

Outreach discipline: one personalised email per target, referencing a specific
recent article, with the asset linked (not attached). 10 emails/week beats a
500-address blast. Track every send in a sheet with date, target, angle, reply.

---

## 4. Digital PR plays (months 2–6)

- **Seasonal data drop:** "What SA agents spend on listing video, by province"
  (survey 50 agents; publish findings). Survey-driven stories get syndicated.
- **Free audit offer:** "We'll re-cut one listing video free for 20 agencies" —
  the resulting case studies are linkable proof, and each agency publishes the
  result on their own site.
- **Speaking/teaching:** guest lectures at estate-agent training providers,
  webinars with agency groups; request a speaker page or recording page link.
- **Awards:** enter SA proptech / small-business award programmes. Nominee and
  winner pages are strong, permanent links. (Check entry fees against value.)

---

## 5. Link hygiene & maintenance

- Audit referring domains monthly (Search Console → Links; Ahrefs Webmaster
  Tools is free for your own site). Watch for sudden spikes from unrelated
  domains — that's usually a scraper or a spam network.
- Do **not** disavow reactively. Only disavow for a manual action or an obvious
  attack, and document the reasoning.
- Redirect hygiene: any URL that ever earns a link must keep working. `/signup`
  and `/payment/callback` are canonicalised today — keep those redirects forever.
- Keep `robots.txt` free of `Crawl-delay` (removed already): Google ignores it
  and it blocks nothing useful.

---

## 6. Measurement

Tracked monthly in one sheet:

- Referring domains (target: +4/month, 25 total by month 6)
- Search Console clicks / impressions / average position for the money queries
  ("property video South Africa", "AI real estate video", "listing video maker")
- Organic sign-ups (UTM-tagged from any earned link where possible)
- Branded search volume (a leading indicator that links + PR are working)

Do not judge anything in the first 8 weeks: new-domain links take 4–12 weeks to
be crawled and reflected.

---

## 7. Search Console verification (owner action required)

The site has **no verification token yet** — `index.html` contains no
`google-site-verification` meta tag and `public/` contains no Google HTML
verification file. Verification cannot be completed by an agent: it requires
signing in to the Google account that will own the property.

Two supported paths, either is fine on Vercel:

1. **DNS (recommended, survives redeploys)** — Search Console → add property
   `propreel.co.za` (domain property) → copy the `TXT` record → add it in the
   domain's DNS panel (currently the registrar/host that serves
   `www.propreel.co.za`).
2. **HTML tag** — Search Console → URL-prefix property `https://www.propreel.co.za/`
   → copy `<meta name="google-site-verification" content="…">` → it goes in
   `index.html` under the existing `<meta name="theme-color">` line. The token is
   not a secret; it only proves control of the domain.

Then: submit `https://www.propreel.co.za/sitemap.xml`, request indexing for
`/`, `/pricing`, `/faq`, `/blog`, and confirm Coverage reports no "Excluded by
noindex" rows for public pages (the only legitimate noindex areas are the
signed-in app routes and unknown paths).

Also add the same verification to **Bing Webmaster Tools** — it accepts the
Google Search Console import in one click once GSC is verified.

---

## 8. First 30 days, concretely

- Week 1: GSC + Bing verification, sitemap submitted; Google Business Profile
  created; NAP written down and reused verbatim everywhere.
- Week 2: 10 foundation listings live (Product Hunt draft prepared);
  LinkedIn + Instagram + YouTube profiles created, added to `sameAs`.
- Week 3: ship the listing-video length calculator; write the pitch email.
- Week 4: first 10 outreach emails (3 SA property publications, 3 podcasts,
  2 training providers, 2 regional agencies); start the agent survey for the
  benchmark report.
