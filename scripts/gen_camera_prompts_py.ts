/**
 * Regenerate modal/camera_prompts.py from the GENTLE Budget prompt library
 * (lib/budgetVideoPrompts.ts) — the worker's authoritative (roomType, move)
 * → prompt table.
 *
 * 2026-10-21 ENGINE UNIFICATION: every AI tier renders on MiniMax Hailuo-02
 * standard with the Budget deck's gentle motion. The table the worker reads
 * for per-photo `photo_meta` mappings therefore holds the gentle text,
 * byte-identical to lib/budgetVideoPrompts.ts. That module is the single
 * source of truth and is NEVER written by this script — the old cinematic
 * deck (lib/videoPrompts.ts / the former camera_prompts.py) warped geometry
 * and invented rooms; the client's A/B verdict (2026-10-21) made the Budget
 * prompts the standard for every tier.
 *
 * The generated file carries only CAMERA_PROMPTS (the one name the worker
 * imports — the wan-era CAMERA_NEGATIVE_PROMPT went with the wan engine).
 *
 * Run: npx tsx scripts/gen_camera_prompts_py.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { BUDGET_CAMERA_PROMPTS, budgetCameraPrompt } from '../lib/budgetVideoPrompts';
import { movesForRoomType } from '../lib/videoPrompts';

/** Escape a string as a single-line Python string literal. */
function pyStringLiteral(s: string): string {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
  return `"${escaped}"`;
}

const lines: string[] = [
  '# AUTO-GENERATED from lib/budgetVideoPrompts.ts — do not edit by hand.',
  '# (Re-generate with: npx tsx scripts/gen_camera_prompts_py.ts)',
  '#',
  '# 2026-10-21: holds the GENTLE Budget deck, byte-identical to',
  '# lib/budgetVideoPrompts.ts — the motion standard for EVERY AI tier since',
  '# the engine unification (Hailuo-02 standard everywhere; the cinematic',
  "# deck warped geometry and invented rooms and is gone). The worker reads",
  '# this table for per-photo (roomType, move) mappings; the browser sends',
  "# the same gentle text directly via the request's image_prompts field.",
  'CAMERA_PROMPTS: dict = {',
];
for (const roomType of ['exterior', 'interior'] as const) {
  lines.push(`    "${roomType}": {`);
  for (const move of movesForRoomType(roomType)) {
    const prompt = budgetCameraPrompt(roomType, move);
    if (!prompt) continue; // interior+out is invalid by taxonomy
    lines.push(`        "${move}": ${pyStringLiteral(prompt)},`);
  }
  lines.push('    },');
}
lines.push('}');
lines.push('');

const outPath = join(__dirname, '..', 'modal', 'camera_prompts.py');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${outPath}`);
// Sanity: every non-null (roomType, move) in the budget library made it in,
// and every emitted string is byte-identical to the source text.
let count = 0;
for (const roomType of ['exterior', 'interior'] as const) {
  for (const move of movesForRoomType(roomType)) {
    const p = budgetCameraPrompt(roomType, move);
    if (p === null) continue;
    count++;
    if (!lines.some(l => l.includes(pyStringLiteral(p)))) {
      console.error(`VERIFY FAIL: ${roomType}/${move} prompt not emitted verbatim`);
      process.exit(1);
    }
  }
}
if (count !== Object.keys(BUDGET_CAMERA_PROMPTS).length * 4 - 1) {
  // 4 exterior + 3 interior (interior has no zoom-out)
  console.error(`VERIFY FAIL: expected 7 prompts, emitted ${count}`);
  process.exit(1);
}
console.log('Verified: 7/7 gentle prompts emitted byte-identical to lib/budgetVideoPrompts.ts');
