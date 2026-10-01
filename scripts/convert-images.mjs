/**
 * One-off: convert downloaded source PNGs into responsive WebP sets.
 * Usage: node scripts/convert-images.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'scripts/tmp-media';
const OUT = 'public/images';

const MAP = [
  ['330c07e5-35d8-4349-bd85-5605d525a579', 'hero-cape-town'],
  ['67414a7a-ff1d-4510-af4c-59211019fb32', 'before-after'],
  ['cd3adc6f-f45e-4f36-b943-c549ba1431d6', 'virtual-staging'],
  ['f93ec3da-ca3f-4ff4-89ec-4b91c591a1cf', 'apartment'],
  ['e91d91fe-28c8-458d-8327-c7c2fc755fe0', 'waterfront-villa'],
  ['223f517b-9d46-4b71-b47c-05dc2cb2c888', 'family-estate'],
  ['c0dcca61-ae6d-40e4-8245-342302d04087', 'townhouse'],
  ['1bee03b0-4e73-4143-935f-8a2306bb368b', 'ai-editor'],
];

mkdirSync(OUT, { recursive: true });

for (const [id, name] of MAP) {
  const src = join(SRC, `${id}.png`);
  for (const width of [1200, 800, 480]) {
    const out = join(OUT, `${name}-${width}.webp`);
    await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
    const kb = Math.round((await import('node:fs')).statSync(out).size / 1024);
    console.log(`${name}-${width}.webp  ${kb} KB`);
  }
}
console.log('done');
