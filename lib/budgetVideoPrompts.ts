/**
 * Budget AI Video — camera-move prompt library (lib/budgetVideoPrompts.ts).
 *
 * Budget reels run on fal-ai/minimax/hailuo-02/standard with DELIBERATELY
 * GENTLER motion than the cinematic deck in lib/videoPrompts.ts — slower
 * pace, less dramatic camera travel — and that gentleness lives in this copy.
 * 2026-10-21: this library is now the motion standard for EVERY AI tier (the
 * engine unification removed wan-25; the client's A/B verdict made the
 * Budget prompts canonical) — the worker's camera_prompts.py table is
 * generated from here, and the main Video Tab sends the same text via the
 * render request's `image_prompts` payload (the worker's highest-precedence
 * prompt source), so the exact text here is what the model sees.
 *
 * Same (roomType, move) taxonomy as the main Video Generator's Photos step —
 * interior/exterior × in/left/right, plus zoom-out on exterior only — so the
 * tagging UI is shared vocabulary; only the wording differs. Unlike the main
 * deck these are NOT size-capped: they were authored well under Hailuo's
 * 2000-char clip ceiling (fal silently clips longer Hailuo prompts, cutting
 * the negative block that rides the tail), so keep additions short.
 *
 * Source: the client's prompt set of 2026-10-20, verbatim. One repair: the
 * Exterior/Right text arrived starting "he camera sweeps…" (dropped capital
 * — Hailuo reads the head of a prompt hardest, so a broken first word is
 * worth fixing); every other quirk of the original copy is preserved as-is.
 *
 * 2026-10-21 WINDOW-PRESERVATION PATCH (client-reported bug): an Interior
 * Zoom In render made the trees outside a window VANISH mid-clip — frames
 * extracted from the delivered reel (local ffmpeg, no fal spend) show green
 * foliage through the glass at the clip start turning into plain sky ~4s
 * in. Two causes in this copy: (1) the only outdoor description anywhere in
 * the prompt was "leaves shift in the breeze and clouds drift slowly across
 * the sky" — the model is told the outdoor world is leaves + sky + clouds,
 * with no trees — and (2) unlike the retired cinematic deck's frozen-
 * architecture tail, nothing licensed keeping the window view intact. The
 * patch rewords each outside clause (trees/foliage stay exactly as pictured,
 * only their leaves shift) and adds one window-preservation sentence. Motion
 * pace wording is untouched; ~620 → 875-958 chars (measured per prompt),
 * still far under Hailuo's 2000-char clip ceiling.
 * Do not silently "improve" this copy — motion-pace changes are the USER's
 * product decision (budget = calm, main deck = cinematic).
 *
 * 2026-10-21 INTERIOR-TRAVEL PATCH (client-reported): right after the window
 * patch, Interior Zoom In clips barely crept — measured on the delivered
 * reel (local ffmpeg + OpenCV, no fal spend) the interior clips expanded
 * only 1.02-1.12x while Exterior Zoom In on the SAME reel travelled 1.65x
 * (lawn to deep in the driveway). The motion directive was NOT the cause —
 * interior-in and exterior-in carry byte-identical camera sentences. The
 * dampener was the window clause's FREEZE semantics: "the view … stays
 * exactly as in the source photo" contradicts a push-in (a camera that
 * advances MUST scale the window view), and Hailuo resolves that conflict
 * by barely moving — worst on interiors where glass fills much of the frame.
 * Corroborating A/B: the PRE-fix kitchen clip (same photo, same move) of
 * video (7).mp4 travelled visibly deeper than the post-fix one — it just
 * also hallucinated the window content away (the original bug).
 * The patch keeps the tree-preservation guarantee but pins window CONTENT
 * (same trees/garden, may grow with the camera) instead of freezing the
 * region, and gives Interior Zoom In an explicit travel expectation.
 * Exterior prompts are untouched — they measure fine.
 *
 * 2026-10-21 INTERIOR-ALIVE PATCH (client-requested): exteriors read alive
 * (leaves shift, clouds drift) while interiors read as stills — the interior
 * "scene comes alive" block licensed only two timid motions (curtains, light
 * patterns). The client picked clauses 1-4 of the proposed menu: conditional
 * FIRELIGHT (fireplace flames / candle flicker, if in view), INDOOR GREENERY
 * (plants/flowers rustle), SUN-DRIFT (sunlight patches cross the floor,
 * reflections follow — the interior equivalent of passing clouds), and WATER
 * through the windows (pool/fountain ripples, if visible). All conditional
 * so one prompt still serves any interior photo; dust-motes/lamp-breath and
 * golden-hour drift were offered and deliberately NOT taken (boundary-drift
 * risk on the latter). Exterior prompts untouched. Interior-in 1190 → 1528
 * chars (left/right 1304-1305), still far under the 2000-char Hailuo clip
 * ceiling.
 *
 * 2026-10-23 FIRE-PLACEMENT PATCH (client-reported defect): a delivered
 * 30s reel's 4th clip showed the fire burning ON A CHAIR next to the
 * fireplace instead of inside it — the FIRELIGHT clause licensed fire
 * without saying WHERE, and Hailuo placed it on the nearest plausible
 * surface. The patch anchors flames to the hearth ("burn only inside the
 * fireplace opening … never on furniture or floors") and adds fire to the
 * negative tail ("no fire or flames anywhere except inside a fireplace").
 * Only the three interior prompts carry the firelight clause, so only they
 * are patched; interiors 1528 → ~1640 / 1304 → ~1420 chars, still well
 * under Hailuo's 2000-char clip ceiling.
 *
 * 2026-10-23 LIVELINESS RESTORATION PATCH (client-reported regression on
 * the first post-hardening reel - Videos 0-4): every clip came back slower
 * and deader than the reels before it - the fireplace fire rendered as a
 * STATIC decal (Videos 1/3), the sunburst/golden-hour life was gone and
 * dusk never lit the home's windows (Video 0), the interior push-in barely
 * travelled (Video 2), and Video 4 read almost as a still. Frames pulled
 * from the delivered clips (local ffmpeg + OpenCV, no fal spend) confirm
 * all of it. Cause: this deck carried no continuous-MOTION mandate and no
 * golden-hour / dusk-lights licensing (the retired cinematic tail had
 * both), and the fire patch's restriction-forward phrasing ("burn only
 * ... never on furniture or floors" + a flame-ban tail) reads as
 * suppression - the model froze the one thing it was warned about. The
 * patch borrows the proven cinematic tail's motion mandate + momentum
 * pacing, rephrases the fire clause MOTION-forward ("flicker and dance
 * with living motion inside the fireplace opening") while keeping flame
 * SCOPE in one compact tail line ("no flames outside a fireplace" - the
 * placement lesson stands), and adds conditional golden-hour drift, dusk
 * interior-lights and sunburst clauses. Every new clause is conditional or
 * light-anchored so one prompt still serves any photo. Lengths ~1260
 * exterior / ~1700 interior-in, still under Hailuo's 2000-char clip
 * ceiling. The camera sentences' own pace wording is untouched -
 * liveliness comes from the mandate and the effects, not faster moves.
 *
 * Keep this module dependency-free (pure data + pure functions).
 */

import type { CameraMove, PhotoMeta, RoomType } from './videoPrompts';

/** The gentle prompt per (roomType, move). Zoom-out is EXTERIOR-ONLY, same
 *  rule the tagging UI enforces (retreating out of an interior exits it). */
export const BUDGET_CAMERA_PROMPTS: Record<RoomType, Partial<Record<CameraMove, string>>> = {
  exterior: {
    in: 'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, deep blue sky with soft fluffy clouds, pristine landscaping, perfect symmetry, no lens distortion. The camera smoothly dollies forward and pushes into the property for a seamless first-person walking tour. Near objects grow larger as far walls draw closer, a true 3D push-in, never a flat digital zoom. Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame; motion is fluid and unbroken at a confident purposeful pace with clear momentum, with no whip pans, snap zooms, speed ramps or stop-start jitter. The scene comes alive: outside, the trees, foliage and landscaping stay exactly as pictured and only their leaves shift gently in the breeze while clouds drift slowly across the sky and the light drifts naturally toward warm golden hour, and as dusk falls the home\'s interior lights glow on warmly through the windows; indoor curtains sway gently and light patterns shift subtly across polished floors, wood, and metal. The view through every window and glass door stays exactly as in the source photo - trees, foliage and landscaping outside remain fully visible and unchanged, never turning into blank light or plain sky. No text, watermarks, logos, people, animals, or clutter.',
    left: 'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, deep blue sky with soft fluffy clouds, pristine landscaping, perfect symmetry, no lens distortion. The camera sweeps in a wide, graceful arc to the LEFT around the property. Near objects grow larger as far walls ease slowly, a true 3D push-in, never a flat digital zoom. Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame; motion is fluid and unbroken at a confident purposeful pace with clear momentum, with no whip pans, snap zooms, speed ramps or stop-start jitter. The scene comes alive: outside, the trees, foliage and landscaping stay exactly as pictured and only their leaves shift gently in the breeze while clouds drift slowly across the sky and the light drifts naturally toward warm golden hour, and as dusk falls the home\'s interior lights glow on warmly through the windows; indoor curtains sway gently and light patterns shift subtly across polished floors, wood, and metal. The view through every window and glass door stays exactly as in the source photo - trees, foliage and landscaping outside remain fully visible and unchanged, never turning into blank light or plain sky. No text, watermarks, logos, people, animals, or clutter.',
    right: 'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, deep blue sky with soft fluffy clouds, pristine landscaping, perfect symmetry, no lens distortion. The camera sweeps in a wide, graceful arc to the RIGHT around the property. Near objects grow larger as far walls ease slowly, a true 3D push-in, never a flat digital zoom. Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame; motion is fluid and unbroken at a confident purposeful pace with clear momentum, with no whip pans, snap zooms, speed ramps or stop-start jitter. The scene comes alive: outside, the trees, foliage and landscaping stay exactly as pictured and only their leaves shift gently in the breeze while clouds drift slowly across the sky and the light drifts naturally toward warm golden hour, and as dusk falls the home\'s interior lights glow on warmly through the windows; indoor curtains sway gently and light patterns shift subtly across polished floors, wood, and metal. The view through every window and glass door stays exactly as in the source photo - trees, foliage and landscaping outside remain fully visible and unchanged, never turning into blank light or plain sky. No text, watermarks, logos, people, animals, or clutter.',
    out: 'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, deep blue sky with soft fluffy clouds, pristine landscaping, perfect symmetry, no lens distortion. The camera glides backward in a smooth, controlled retreat for a seamless exit shot. Near objects shrink as far walls recede, an authentic 3D recession, never a flat digital zoom-out. Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame; motion is fluid and unbroken at a confident purposeful pace with clear momentum, with no whip pans, snap zooms, speed ramps or stop-start jitter. The scene comes alive: outside, the trees, foliage and landscaping stay exactly as pictured and only their leaves shift gently in the breeze while clouds drift slowly across the sky and the light drifts naturally toward warm golden hour, and as dusk falls the home\'s interior lights glow on warmly through the windows; indoor curtains sway gently and light patterns shift subtly across polished floors, wood, and metal. The view through every window and glass door stays exactly as in the source photo - trees, foliage and landscaping outside remain fully visible and unchanged, never turning into blank light or plain sky. No text, watermarks, logos, people, animals, or clutter.',
  },
  interior: {
    in: 'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, flawless staging, no clutter or personal items. The camera smoothly dollies forward and pushes into the property for a seamless first-person walking tour. Near objects grow larger as far walls draw closer, a true 3D push-in, never a flat digital zoom. The camera travels a long way - by the end of the clip the room reads dramatically closer, with near furniture, counters and decor growing large and passing close by the camera. Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame; motion is fluid and unbroken at a confident purposeful pace with clear momentum, with no whip pans, snap zooms, speed ramps or stop-start jitter. The scene comes alive: inside, curtains sway gently in a light draft, if a fireplace is in view its flames flicker and dance with living motion inside the fireplace opening, any candles glow with a soft living flicker, potted plants, flowers and greenery rustle gently, and sunlight bursts through the windows in warm rays while sunlit patches drift slowly across the floor, wood and marble and the polished reflections shift with them; if a pool, fountain or garden water feature is visible through the windows its water ripples with softly dancing reflections; outside, the trees, foliage and garden visible through the windows keep the exact shape and place they have in the source photo and only their leaves shift gently in the breeze while clouds drift slowly across the sky and the light drifts naturally toward warm golden hour. The view through every window and glass door always shows the same trees, foliage and garden as the source photo, growing naturally larger as the camera approaches - windows never turn into blank light or plain sky and the greenery never vanishes. No text, watermarks, logos, people, animals, clutter, or any flames outside a fireplace.',
    left: 'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, flawless staging, no clutter or personal items. The camera sweeps in a wide, graceful arc to the LEFT inside the room. Near objects grow larger as far walls ease slowly, a true 3D push-in, never a flat digital zoom. Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame; motion is fluid and unbroken at a confident purposeful pace with clear momentum, with no whip pans, snap zooms, speed ramps or stop-start jitter. The scene comes alive: inside, curtains sway gently in a light draft, if a fireplace is in view its flames flicker and dance with living motion inside the fireplace opening, any candles glow with a soft living flicker, potted plants, flowers and greenery rustle gently, and sunlight bursts through the windows in warm rays while sunlit patches drift slowly across the floor, wood and marble and the polished reflections shift with them; if a pool, fountain or garden water feature is visible through the windows its water ripples with softly dancing reflections; outside, the trees, foliage and garden visible through the windows keep the exact shape and place they have in the source photo and only their leaves shift gently in the breeze while clouds drift slowly across the sky and the light drifts naturally toward warm golden hour. The view through every window and glass door always shows the same trees, foliage and garden as the source photo, shifting naturally as the camera moves - windows never turn into blank light or plain sky and the greenery never vanishes. No text, watermarks, logos, people, animals, clutter, or any flames outside a fireplace.',
    right: 'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, flawless staging, no clutter or personal items. The camera sweeps in a wide, graceful arc to the RIGHT inside the room. Near objects grow larger as far walls ease slowly, a true 3D push-in, never a flat digital zoom. Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame; motion is fluid and unbroken at a confident purposeful pace with clear momentum, with no whip pans, snap zooms, speed ramps or stop-start jitter. The scene comes alive: inside, curtains sway gently in a light draft, if a fireplace is in view its flames flicker and dance with living motion inside the fireplace opening, any candles glow with a soft living flicker, potted plants, flowers and greenery rustle gently, and sunlight bursts through the windows in warm rays while sunlit patches drift slowly across the floor, wood and marble and the polished reflections shift with them; if a pool, fountain or garden water feature is visible through the windows its water ripples with softly dancing reflections; outside, the trees, foliage and garden visible through the windows keep the exact shape and place they have in the source photo and only their leaves shift gently in the breeze while clouds drift slowly across the sky and the light drifts naturally toward warm golden hour. The view through every window and glass door always shows the same trees, foliage and garden as the source photo, shifting naturally as the camera moves - windows never turn into blank light or plain sky and the greenery never vanishes. No text, watermarks, logos, people, animals, clutter, or any flames outside a fireplace.',
    // unreachable: interior never offers zoom-out (movesForRoomType enforces it)
    out: '',
  },
};

/** The gentle budget prompt for one tagged photo, or null on an invalid pair
 *  (e.g. a hand-edited draft with interior+out) so callers degrade instead of
 *  throwing mid-render-request. */
export function budgetCameraPrompt(roomType: RoomType, move: CameraMove): string | null {
  if (roomType !== 'exterior' && roomType !== 'interior') return null;
  return BUDGET_CAMERA_PROMPTS[roomType][move] || null;
}

/**
 * Reverse lookup: which deck entry a resolved prompt IS.
 *
 * Prompts are byte-identical everywhere they travel (the render payload, the
 * job's stored clip entry, this table), so `===` is the correct match — no
 * fuzzy/contains heuristics that could misread one move for another. Returns
 * null for anything else (hand-edited text, a future deck revision), so the
 * per-clip review hides its camera-move row instead of guessing.
 *
 * Used by the 2026-10-23 review gate: identify each clip's current move so
 * the agent can reselect a different one before a paid re-roll.
 */
export function matchBudgetPrompt(prompt: string): { roomType: RoomType; move: CameraMove } | null {
  if (!prompt) return null;
  for (const roomType of ['exterior', 'interior'] as const) {
    for (const [move, text] of Object.entries(BUDGET_CAMERA_PROMPTS[roomType])) {
      if (text === prompt) return { roomType, move: move as CameraMove };
    }
  }
  return null;
}

/**
 * Build the per-photo prompt payload the Budget render consumes:
 * `image_prompts: [{image_url, prompt}]` — the field the worker's AI-tier
 * path reads with precedence over its baked-in deck (photo_meta in that
 * request model carries roomType/move, NOT prompt text — see
 * modal/app_propreel_minimax.py's RenderVideoRequest).
 *
 * A photo with no tags (or an invalid pair) gets no entry, so the worker
 * falls back to its built-in A/B/C deck — graceful degradation, same
 * contract as buildCameraPayload in videoPrompts.ts.
 */
export function buildBudgetCameraPayload(
  imageUrls: string[],
  meta: Record<string, PhotoMeta>,
): Array<{ image_url: string; prompt: string }> {
  const out: Array<{ image_url: string; prompt: string }> = [];
  for (const url of imageUrls) {
    const m = meta[url];
    if (!m || !m.roomType || !m.move) continue;
    const prompt = budgetCameraPrompt(m.roomType, m.move);
    if (prompt) out.push({ image_url: url, prompt });
  }
  return out;
}
