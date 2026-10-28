/**
 * The render worker's origin AS THE BROWSER SEES IT: the first-party
 * `api.propreel.co.za/w` proxy (vercel.json rewrite → the worker). No vendor
 * hostname may appear in the client bundle, the CSP header, or devtools.
 *
 * `import.meta.env.*` is INLINED at build time — whatever VITE_MODAL_ENDPOINT
 * holds lands in dist/ verbatim — so the fallback below is first-party on
 * purpose and local dev runs through the same proxy (its CORS allows
 * http://localhost:3000). The stealth guard (scripts/check-bundle-stealth.mjs)
 * fails the build if a vendor URL ever reaches the bundle, whether it came
 * from this file or from a VITE_* env var.
 *
 * One definition for every render-path caller (the video wizards, clip
 * re-roll, assembly, cancel, image edit, language check). Server-to-server
 * callers (api routes, crons, reaper) keep talking to the worker directly.
 */
export const RENDER_ENDPOINT =
  import.meta.env.VITE_MODAL_ENDPOINT || 'https://api.propreel.co.za/w';
