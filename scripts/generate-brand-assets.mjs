/**
 * Generate brand assets from the supplied logo banner (one-off, rerunnable):
 *   public/images/logo-full.png   — tight crop of the whole lockup (icon + wordmark)
 *   public/images/logo-icon.png   — square icon-only crop (badge used across the UI)
 *   public/favicon.png            — 48px favicon (referenced by index.html)
 *   public/favicon.svg            — same icon embedded as base64 PNG (link kept in index.html)
 *   public/icon-192.png           — manifest/sw icon (80% safe-zone for maskable)
 *   public/icon-512.png           — manifest/sw icon (80% safe-zone for maskable)
 *   public/apple-touch-icon.png   — 180px iOS touch icon
 *
 * The banner's icon is isolated by taking the bright/saturated bounding box of
 * the LEFT 37.5% of the image (everything right of that is the wordmark, whose
 * purple "reel" letters would pollute a full-width mask).
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const SRC = 'C:/Users/Ulric REMAX/Downloads/Gemini_Generated_Image_swzgz7swzgz7swzg.jpg';

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: ch } = info;
console.log(`source ${W}x${H} ch=${ch}`);

function bbox(x0, x1) {
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (sat > 36 || lum > 110) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Expand a box to a centred square with padding, clamped to the image. */
function square(box, padFrac) {
  const side = Math.ceil(Math.max(box.width, box.height) * (1 + padFrac * 2));
  const cx = box.left + box.width / 2;
  let left = Math.round(cx - side / 2);
  let top = Math.round(box.top + box.height / 2 - side / 2);
  left = Math.max(0, Math.min(left, W - side));
  top = Math.max(0, Math.min(top, H - side));
  return { left, top, width: side, height: side };
}

const fullBox = bbox(0, W);
const iconBox = square(bbox(0, Math.floor(W * 0.375)), 0.05);
console.log('full content box:', fullBox);
console.log('icon square box :', iconBox);

// Background colour sampled from the top-left corner (dark banner navy).
const bg = { r: data[0], g: data[1], b: data[2] };
console.log('bg colour:', bg);

await mkdir('public/images', { recursive: true });

// 1) Full lockup (tight crop, small pad) and icon badge
const fullCrop = {
  left: Math.max(0, fullBox.left - 16),
  top: Math.max(0, fullBox.top - 16),
  width: Math.min(W, fullBox.width + 32),
  height: Math.min(H, fullBox.height + 32),
};
await sharp(SRC).extract(fullCrop).resize({ width: 1600 }).png()
  .toFile('public/images/logo-full.png');

const iconBuf = await sharp(SRC).extract(iconBox).resize(512, 512).png().toBuffer();
await writeFile('public/images/logo-icon.png', iconBuf);

// 2) Favicon PNGs
await sharp(iconBuf).resize(48, 48).png().toFile('public/favicon.png');

// Maskable icons need the glyph inside the 80% safe zone.
const safe = async (size) => {
  const glyph = await sharp(iconBuf).resize(Math.round(size * 0.8), Math.round(size * 0.8)).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { ...bg, alpha: 1 } },
  }).composite([{ input: glyph, gravity: 'centre', blend: 'over' }]);
};

await (await safe(192)).png().toFile('public/icon-192.png');
await (await safe(512)).png().toFile('public/icon-512.png');
await sharp(iconBuf).resize(180, 180).png().toFile('public/apple-touch-icon.png');

// 3) SVG favicon = same PNG embedded (keeps the existing <link> valid)
const favicon32 = await sharp(iconBuf).resize(32, 32).png().toBuffer();
const b64 = favicon32.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32"><image width="32" height="32" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/></svg>\n`;
await writeFile('public/favicon.svg', svg);

console.log('written: logo-full.png, logo-icon.png, favicon.png, favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png');
