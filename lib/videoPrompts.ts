/**
 * Camera-move metadata + the eight authoritative AI-video camera prompts.
 *
 * Per photo the agent now tags (a) room type — interior or exterior — and
 * (b) the camera move they want for that photo. The render picks the exact
 * prompt from those two tags, so the walk-through wording is fixed here
 * (one place) rather than living only in the Modal worker.
 *
 * Zoom-out is EXTERIOR-ONLY: retreating out of an interior space exits the
 * room, which the prompts' boundary rules forbid. The UI enforces that (the
 * move list a photo offers depends on its room type); this module is the
 * shared vocabulary both sides speak.
 *
 * Keep this dependency-free (pure data + pure functions): it is imported by
 * the Vite bundle AND (via buildCameraPayload) embedded as a Python literal
 * by the worker deploy script, so it must stay free of imports.
 */

export type RoomType = 'interior' | 'exterior';
export type CameraMove = 'in' | 'left' | 'right' | 'out';

export interface PhotoMeta {
  roomType: RoomType;
  move: CameraMove;
}

/** Moves offered for a room type. Zoom-out is EXTERIOR-only. */
export function movesForRoomType(roomType: RoomType): CameraMove[] {
  return roomType === 'exterior'
    ? ['in', 'left', 'right', 'out']
    : ['in', 'left', 'right'];
}

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  interior: 'Interior',
  exterior: 'Exterior',
};

export const CAMERA_MOVE_LABEL: Record<CameraMove, string> = {
  in: 'Zoom in',
  left: 'Left',
  right: 'Right',
  out: 'Zoom out',
};

/**
 * One shared closing tail. Every prompt ends with this verbatim; only the
 * leading camera directive (which encodes the move) differs. The tail carries
 * the frozen-ARCHITECTURE rule (geometry locked, but ambient nature licensed
 * — 2026-10-20, from the client's Budget deck: "The scene comes alive" is
 * what produced the drifting clouds / golden-hour shift / living fireplace /
 * rippling water the Budget reels are loved for), the "property is the hero"
 * rule, the continuous-motion mandate, the Architectural-Digest quality bar,
 * and the full negative block.
 * The single copy keeps all seven prompts byte-identical where they must agree.
 *
 * `verb` fills the one variable slot: glide / creep / drift / track. This is
 * the client's original wording, restored verbatim during the wan era (which
 * had no prompt-length limit).
 *
 * 2026-10-23 FIRE HARDENING (mirrors the budget deck's FIRE-PLACEMENT
 * PATCH): the shared tail licensed a living fireplace without saying WHERE
 * the fire lives, which is what put flames on a chair in a delivered reel.
 * Even though this deck is dormant, the clause is anchored to the hearth and
 * the negative block bans flames outside it — so reviving this deck later
 * cannot reintroduce the fire-on-furniture defect class.
 *
 * 2026-10-21 STATUS: these cinematic prompts are DORMANT for rendering — the
 * engine unification made the gentle Budget deck (lib/budgetVideoPrompts.ts)
 * the motion standard for every AI tier, and the worker's fallback A/B/C
 * deck now holds that gentle text too. What this module still serves live is
 * the taxonomy: RoomType/CameraMove, movesForRoomType, the labels and the
 * PhotoMeta type the Photos-step tagging UI shares with the worker.
 */
const walkTail = (verb: string) =>
  'The move stays strictly inside the space already visible — image edges are hard walls the camera never approaches and the move never leaves the room shown. ' +
  'The source image’s architecture is frozen: every wall, window, door, fixture, texture and built element stays exactly as pictured — no geometry is added, removed, replaced or rearranged, and the layout never changes. ' +
  'The scene comes alive with gentle natural motion: outdoors, trees, foliage and leaves sway and rustle in a light breeze while clouds drift slowly across the sky and the light may drift naturally toward warm golden hour; if a fireplace is in view its flames burn only inside the fireplace opening and flicker and dance there, never on furniture or floors; visible water — pool, fountain or sea — ripples with softly dancing reflections; indoors, curtains sway gently and light patterns shift subtly across polished floors, wood and metal. ' +
  'The property is the absolute hero of every frame — always in focus, always the center of attention, never drifting away. ' +
  'Continuous, clearly visible movement for the ENTIRE clip is mandatory — never a still frame. ' +
  'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, flawless imperceptible finishes, perfectly straight vertical lines, zero lens distortion. ' +
  `Motion must be fluid, smooth and unbroken — one constant-speed showcase ${verb} at a confident purposeful pace with clear momentum. ` +
  'No whip pans, snap zooms, speed ramps, or stop-start jitter. ' +
  'No man-made object, wall, fixture or architectural element is added, removed, replaced or rearranged — only the ambient natural motion licensed above may animate the scene. ' +
  'No new rooms or spaces — no added kitchen, bathroom, hallway, doorway, door, driveway, parking lot, street, extension, furniture, appliances, counters, cabinetry, stairs, windows, cars or vehicles; no exiting through walls, image boundaries or border-crossing, no revealing exterior spaces. ' +
  'No geometry warping, slanted walls, curved vertical lines, fisheye lens or extreme distortion — mirrors, glass and reflective surfaces stay exactly as photographed; no warped, melted, bent or deformed beds, furniture, vases, décor or architecture. ' +
  'No global flicker or strobing, shake, blur, out-of-focus, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures or unrealistic reflections. ' +
  'No text, watermarks, logos, people, animals, clutter, dirty surfaces, or fire or flames anywhere except inside a fireplace.';

/** The one leading camera directive per (roomType, move). */
const HEADS: Record<RoomType, Record<CameraMove, string>> = {
  exterior: {
    in: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera pushes forward in a slow decisive push toward the room’s primary architectural focal point, closing the distance with steady confident momentum, making the space feel deep, grand and immersive. Near objects grow larger as far walls draw closer — a true 3D push-in, never a flat digital zoom. ',
    left: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera sweeps decisively LEFT with steady momentum, a long smooth gimbal lateral dolly across the full width of the room at a confident showcase walking pace: near furniture glides fast across the locked background while far walls ease slowly — a true 3D camera journey, never a flat photo pan. ',
    right: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera sweeps decisively RIGHT with steady momentum, a long smooth gimbal lateral dolly across the full width of the room at a confident showcase walking pace: near furniture glides fast across the locked background while far walls ease slowly — a true 3D camera journey, never a flat photo pan. ',
    out: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera pulls back in a slow decisive zoom out from the room’s primary architectural focal point, revealing the full grandeur, scale and spatial depth of the interior as it retreats, making the room feel expansive, open and impressive. Far walls widen and more of the space enters the frame as the camera eases back — a true 3D pull-out, never a flat digital zoom. ',
  },
  interior: {
    in: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera creeps purposefully toward the room’s hero architectural detail — a statement material, feature surface, or design centerpiece — closing in with slow controlled momentum that makes every premium finish unmissable, advancing only toward what is already in frame and never travelling past it. Near textures sharpen and grow as the camera advances — a true 3D creep-in, never a flat digital zoom. ',
    left: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera drifts decisively LEFT along the room’s primary feature wall at a confident showcase walking pace, a smooth gimbal drift that hugs the architectural surface and showcases the full length of the feature wall already in frame — near foreground elements slide past while the feature wall fills the frame with its material richness. ',
    right: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera tracks decisively RIGHT past the room’s furnishings at a confident showcase walking pace, a smooth gimbal track gliding along them so each curated piece passes through frame in sequence — near furniture slides past while far architectural elements remain locked and stationary, creating natural cinematic parallax. ',
    out: '', // unreachable: interior never offers zoom-out
  },
};

/** The move-specific verb that fills the tail's one variable slot. */
const MOVE_VERB: Record<RoomType, Record<CameraMove, string>> = {
  exterior: { in: 'glide', left: 'glide', right: 'glide', out: 'drift' },
  interior: { in: 'creep', left: 'drift', right: 'track', out: '' },
};

/** Build the full prompt for one (roomType, move). Throws on an invalid pair. */
export function cameraPrompt(roomType: RoomType, move: CameraMove): string {
  if (roomType === 'interior' && move === 'out') {
    throw new Error('Zoom out is only available for exterior photos');
  }
  const head = HEADS[roomType][move];
  if (!head) throw new Error(`Unknown camera move "${move}" for ${roomType}`);
  return `${head}${walkTail(MOVE_VERB[roomType][move])}`;
}

/**
 * The single negative prompt (the tail's negative block, on its own) — for
 * endpoints that take a dedicated negative_prompt field.
 */
export const CAMERA_NEGATIVE_PROMPT =
  'Whip pans, snap zooms, speed ramps, or stop-start jitter. Man-made object, wall, fixture or architectural element added, removed, replaced or rearranged; scene geometry changed from the source photo. ' +
  'New rooms or spaces - added kitchen, bathroom, hallway, doorway, door, driveway, parking lot, street, extension, furniture, appliances, counters, cabinetry, stairs, windows, cars or vehicles; exiting through walls, image boundaries or border-crossing, revealing exterior spaces. ' +
  'Geometry warping, slanted walls, curved vertical lines, fisheye lens or extreme distortion; mirrors, glass and reflective surfaces warped; melted, bent or deformed beds, furniture, vases, décor or architecture. ' +
  'Global flicker or strobing, shake, blur, out-of-focus, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures or unrealistic reflections. Static, lifeless scene with no ambient motion. ' +
  'Text, watermarks, logos, people, animals, clutter, or dirty surfaces.';

/**
 * PROMPT-LENGTH NOTE (updated 2026-10-21): every AI tier is back on Hailuo,
 * which silently clips prompts past 2000 chars — and the dormant cinematic
 * prompts above exceed that. The live gentle prompts (lib/budgetVideoPrompts.ts)
 * were authored well under the ceiling (~700–800 chars), so nothing shipped
 * today truncates. If the cinematic deck is ever revived, it must be re-trimmed
 * under 2000 chars first (the worker also hard-truncates at 2000 for Hailuo).
 */

/**
 * Build the per-photo prompt payload the render worker consumes:
 * [{image_url, prompt}] — one entry per image, in image order.
 *
 * A photo with no tags gets no prompt entry, so the worker falls back to its
 * built-in A/B/C deck (graceful degradation for drafts saved before tagging
 * existed).
 */
export function buildCameraPayload(
  imageUrls: string[],
  meta: Record<string, PhotoMeta>,
): Array<{ image_url: string; prompt: string }> {
  const out: Array<{ image_url: string; prompt: string }> = [];
  for (const url of imageUrls) {
    const m = meta[url];
    if (!m || !m.roomType || !m.move) continue;
    try {
      const prompt = cameraPrompt(m.roomType, m.move);
      out.push({ image_url: url, prompt });
    } catch {
      // Invalid pair (e.g. interior+out from a hand-edited draft) — skip, so
      // the worker's deck handles this photo rather than failing the render.
    }
  }
  return out;
}

/**
 * Python-literal form of the seven prompts + negative prompt, for embedding
 * in the Modal worker's source. The worker imports this dict, so both sides
 * render byte-identical prompts from the same origin (this file).
 *
 * The deploy script modal/deploy.ps1 embeds this at ${PROMPTS_PY} inside
 * modal/app_propreel_minimax.py (see the <<PROMPTS_PY>> marker there).
 */
export function buildPromptsPythonLiteral(): string {
  const lines: string[] = [];
  lines.push('CAMERA_PROMPTS: dict = {');
  for (const roomType of ['exterior', 'interior'] as RoomType[]) {
    lines.push(`    "${roomType}": {`);
    for (const move of movesForRoomType(roomType)) {
      const prompt = cameraPrompt(roomType, move);
      lines.push(`        "${move}": ${pyStringLiteral(prompt)},`);
    }
    lines.push('    },');
  }
  lines.push('}');
  lines.push('');
  lines.push(`CAMERA_NEGATIVE_PROMPT = ${pyStringLiteral(CAMERA_NEGATIVE_PROMPT)}`);
  return lines.join('\n');
}

/** Escape a string as a Python string literal (single line). */
function pyStringLiteral(s: string): string {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
  return `"${escaped}"`;
}
