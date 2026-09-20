/**
 * Generates assets/icon.ico and assets/icon.png from assets/icon.svg (AegisMark, WORK purple).
 * Run once before `npm run make`.
 *
 * Usage:  node scripts/gen-icon.mjs
 * Needs:  npm install --save-dev @resvg/resvg-js  (pure-JS SVG rasterizer, no native deps)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS    = path.resolve(__dirname, '..', 'assets');

// ── Source: assets/icon.svg ──────────────────────────────────────────────────
// The same file as mobile/assets/icons/icon-dark.svg (AegisMark, WORK purple —
// docs/DESIGN-SYSTEM.md). Keep the two in sync; this script only rasterizes.

const SRC_SVG = fs.readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8');

// ── Try to use @resvg/resvg-js if installed ──────────────────────────────────

async function tryResvg(sizes) {
  let Resvg;
  try {
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch {
    return null;
  }

  const pngs = {};
  for (const s of sizes) {
    const resvg = new Resvg(SRC_SVG, { fitTo: { mode: 'width', value: s }, font: { loadSystemFonts: false } });
    pngs[s] = resvg.render().asPng();
  }
  return pngs;
}

// ── Fallback: instruct user ───────────────────────────────────────────────────

function writeSVGFallback() {
  console.log('\nassets/icon.svg is the source. To convert to ICO, run ONE of:');
  console.log('  npx svgexport assets/icon.svg assets/icon.png 1024:1024');
  console.log('  # then use https://convertico.com to get icon.ico\n');
  console.log('OR install the rasterizer and re-run:');
  console.log('  npm install --save-dev @resvg/resvg-js && node scripts/gen-icon.mjs\n');
}

// ── ICO encoder (pure JS, no deps) ───────────────────────────────────────────
// Spec: https://en.wikipedia.org/wiki/ICO_(file_format)

function buildIco(pngBuffers) {
  // pngBuffers: array of { size, data: Buffer }
  const count  = pngBuffers.length;
  const dirSize = 6 + count * 16;
  let offset   = dirSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0,     0); // reserved
  header.writeUInt16LE(1,     2); // type: ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);  // width  (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1);  // height (0 = 256)
    entry.writeUInt8(0, 2);   // color count (0 = no palette)
    entry.writeUInt8(0, 3);   // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map(p => p.data)]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SIZES = [16, 32, 48, 64, 128, 256, 1024];

const pngs = await tryResvg(SIZES);

if (!pngs) {
  writeSVGFallback();
  process.exit(0);
}

// Save 1024 png for macOS icns / general use
const png1024Path = path.join(ASSETS, 'icon.png');
fs.writeFileSync(png1024Path, pngs[1024]);
console.log('✓ Wrote assets/icon.png  (1024×1024)');

// Build ICO with all sizes up to 256 (ICO's maximum).
const ICO_SIZES = SIZES.filter(s => s <= 256);
const icoBuffers = ICO_SIZES.map(s => ({ size: s, data: Buffer.from(pngs[s]) }));
const ico = buildIco(icoBuffers);
const icoPath = path.join(ASSETS, 'icon.ico');
fs.writeFileSync(icoPath, ico);
console.log(`✓ Wrote assets/icon.ico  (${ICO_SIZES.join(', ')} px)\n`);
console.log('Ready — run `npm run make` to build the installer.');
