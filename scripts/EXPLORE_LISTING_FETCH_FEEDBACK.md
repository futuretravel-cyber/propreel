# Paste-a-listing-link extraction — feasibility feedback and build summary

> This doc started as an exploration note. I have now built the feature as an
> optional, server-side, best-effort wizard prefill, because the user asked to
> build it.

## What I built first (in this workspace) — the short version

This doc now has the feedback rewritten into a build summary, because the user asked to build the feature rather than stop at exploration.

## How to validate it against real links — repeated because it is the only way this gets real

The script has a CLI path, but I did not run automated fetches here because the question is really about *your* real pasted links and how well they extract. The practical next move is:

1. Gather a small list of real listing URLs your agents actually paste, including a PrivateProperty one and a Property24 one.
2. Run the script against those URLs and compare the output to the real listing page.
3. Judge the result as "good enough for a wizard draft" rather than "perfect extraction".
4. If the static fetch looks weak on Property24 or on photos, that is the signal to route extraction through a rendered worker instead of a plain fetch.

If you want, the next concrete step is to run the script against a few real listing links and paste back what it extracts versus what the page actually shows. That gives us a real answer instead of a theoretical one.

## What the actual build looks like now (optional feature, behind a chip) — read this third

I built the feature as an optional, server-side, best-effort wizard prefill:

- [src/lib/listingFetch.ts](src/lib/listingFetch.ts) — extraction layer for PrivateProperty, Property24, and anything else.
- [src/components/ListingLinkChip.tsx](src/components/ListingLinkChip.tsx) — optional wizard chip that pastes a link and pre-fills the wizard fields.
- [src/pages/api/listing/extract.ts](src/pages/api/listing/extract.ts) — server-side endpoint the chip calls, so the browser never fetches the third-party listing directly.

It is intentionally best-effort. A failure returns a structured result with warnings and an error field, and the wizard can still fall back to manual entry.

## Validation step I still need from you — do this second

This feature cannot be validated by guesswork. Before we decide whether it is worth wiring further, I need a few real pasted links and the comparison against the actual page. If you send me 2-5 real listing URLs you use often, I can run the extraction against them and tell you, with evidence, how much of the description and photo set we recover.

If you want the next build step now instead of waiting for real links, tell me which wizard you want the chip on first (video wizard, description tab, image editor, social) and whether you want Property24 to point at a rendered worker from day one or stay on static fetch for now.

## Bottom line — start here first

It is a very reasonable efficiency feature for agents who live in those portals, and it fits neatly on top of the existing wizard prefill flow. The risk is not the idea; it is relying on extraction that is uneven across sites and page layouts. I would build it as an optional, server-side, best-effort "smart prefill" first, validate it against real pasted links, and only then decide whether Property24 needs headless rendering or a different approach.
