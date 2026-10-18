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
 * the frozen-asset rule, the "property is the hero" rule, the continuous-motion
 * mandate, the Architectural-Digest quality bar, and the full negative block.
 * The single copy keeps all eight prompts byte-identical where they must agree.
 */
const WALK_TAIL =
  'The move stays strictly inside the space already visible - image edges are hard walls the camera never approaches and the move never leaves the room shown. ' +
  'Source image is an unalterable, frozen 3D architectural asset: every wall, window, fixture, texture and object stays exactly as pictured - all animation is pure camera travel through the visible scene. ' +
  'The property is the absolute hero of every frame - always in focus, always the center of attention, never drifting away. ' +
  'Continuous, clearly visible movement for the ENTIRE clip is mandatory - never a still frame. ' +
  'Architectural Digest editorial quality: hyper-realistic reflections, soft natural light, immaculate finishes, perfectly straight vertical lines, zero lens distortion. ' +
  'Motion must be fluid and unbroken - one constant-speed showcase move at a purposeful pace. ' +
  'No whip pans, snap zooms, speed ramps, or stop-start jitter. ' +
  'No object, wall, fixture, texture or architectural element is added, removed, replaced or altered. ' +
  'No new rooms or spaces - no added kitchen, bathroom, hallway, driveway, parking lot, street, extension, furniture, appliances, counters, cabinetry, cars or vehicles; no exiting through walls, image boundaries or border-crossing, no revealing exterior spaces. ' +
  'No geometry warping, slanted walls, curved vertical lines, fisheye lens or extreme distortion. ' +
  'No flicker, shake, blur, out-of-focus, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures or unrealistic reflections. ' +
  'No text, watermarks, logos, people, animals, clutter or dirty surfaces.';

/** The one leading camera directive per (roomType, move). */
const HEADS: Record<RoomType, Record<CameraMove, string>> = {
  exterior: {
    in: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera pushes forward in a slow decisive push toward the property\'s primary architectural focal point, closing the distance with steady confident momentum, making the space feel deep, grand and immersive. Near objects grow larger as far walls draw closer - a true 3D push-in, never a flat digital zoom. ',
    left: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera sweeps decisively LEFT with steady momentum, a long smooth gimbal lateral dolly across the full width of the property at a confident showcase walking pace: near elements glide fast across the locked background while far walls ease slowly - a true 3D camera journey, never a flat photo pan. ',
    right: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera sweeps decisively RIGHT with steady momentum, a long smooth gimbal lateral dolly across the full width of the property at a confident showcase walking pace: near elements glide fast across the locked background while far walls ease slowly - a true 3D camera journey, never a flat photo pan. ',
    out: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera pulls back in a slow decisive zoom out from the property\'s primary focal point, revealing the grandeur, scale and spatial depth of the exterior as it retreats. Far elements widen and more of the scene enters the frame as the camera eases back - a true 3D pull-out, never a flat digital zoom. ',
  },
  interior: {
    in: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera creeps purposefully into the room\'s hero architectural detail - a statement material, feature surface, or design centerpiece - closing in with slow controlled momentum that draws the viewer deeper into the space. Near textures sharpen as the camera advances - a true 3D creep-in, never a flat digital zoom. ',
    left: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera drifts decisively LEFT along the room\'s primary feature wall at a confident showcase walking pace, a smooth gimbal drift that hugs the architectural surface and reveals the full length of the space - near foreground elements slide past while the feature wall fills the frame with its material richness. ',
    right: 'Cinematic real estate walkthrough - bold, unmistakable camera motion from the first frame. The camera tracks decisively RIGHT past the room\'s furnishings at a confident showcase walking pace, a smooth gimbal track that moves through the space revealing each curated piece in sequence - near furniture passes through frame as far architectural elements remain locked and stationary, creating natural cinematic parallax. ',
    out: '', // unreachable: interior never offers zoom-out
  },
};

/** Build the full prompt for one (roomType, move). Throws on an invalid pair. */
export function cameraPrompt(roomType: RoomType, move: CameraMove): string {
  if (roomType === 'interior' && move === 'out') {
    throw new Error('Zoom out is only available for exterior photos');
  }
  const head = HEADS[roomType][move];
  if (!head) throw new Error(`Unknown camera move "${move}" for ${roomType}`);
  return `${head}${WALK_TAIL}`;
}

/**
 * The single negative prompt (the tail's negative block, on its own) — for
 * endpoints that take a dedicated negative_prompt field.
 */
export const CAMERA_NEGATIVE_PROMPT =
  'Whip pans, snap zooms, speed ramps, or stop-start jitter. Object, wall, fixture, texture or architectural element is added, removed, replaced or altered. ' +
  'New rooms or spaces - added kitchen, bathroom, hallway, driveway, parking lot, street, extension, furniture, appliances, counters, cabinetry, cars or vehicles; exiting through walls, image boundaries or border-crossing, revealing exterior spaces. ' +
  'Geometry warping, slanted walls, curved vertical lines, fisheye lens or extreme distortion. ' +
  'Flicker, shake, blur, out-of-focus, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures or unrealistic reflections. ' +
  'Text, watermarks, logos, people, animals, clutter, or dirty surfaces.';

/** Upper bound on any single prompt, in characters (fal truncates past this). */
export const MAX_PROMPT_CHARS = 2000;

/**
 * Build the per-photo prompt payload the render worker consumes:
 * [{image_url, prompt}] — one entry per image, in image order.
 *
 * A photo with no tags gets no prompt entry, so the worker falls back to its
 * built-in A/B/C deck (graceful degradation for drafts saved before tagging
 * existed). The render also clamps any prompt to MAX_PROMPT_CHARS.
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
      out.push({ image_url: url, prompt: prompt.slice(0, MAX_PROMPT_CHARS) });
    } catch {
      // Invalid pair (e.g. interior+out from a hand-edited draft) — skip, so
      // the worker's deck handles this photo rather than failing the render.
    }
  }
  return out;
}

/**
 * Python-literal form of the eight prompts + negative prompt, for embedding
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
  lines.push('');
  lines.push(`MAX_PROMPT_CHARS = ${MAX_PROMPT_CHARS}`);
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
