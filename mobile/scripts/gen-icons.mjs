/**
 * Generates PNG app icon assets from SVG sources.
 * Run: node scripts/gen-icons.mjs
 *
 * Requires: npm install -D @resvg/resvg-js
 */

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'assets', 'icons');
const assetsDir = join(root, 'assets');

const VARIANTS = ['dark', 'light', 'tinted'];

// Sizes needed for each variant (main icon: 1024, app store source)
const MAIN_SIZE = 1024;

function renderSvgToPng(svgPath, size) {
  const svg = readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

console.log('Generating app icon PNGs...\n');

for (const variant of VARIANTS) {
  const svgPath = join(iconsDir, `icon-${variant}.svg`);
  const outPath = join(assetsDir, `icon-${variant}.png`);
  try {
    const png = renderSvgToPng(svgPath, MAIN_SIZE);
    writeFileSync(outPath, png);
    console.log(`✓  icon-${variant}.png  (${MAIN_SIZE}x${MAIN_SIZE})`);
  } catch (e) {
    console.error(`✗  icon-${variant}.png — ${e.message}`);
  }
}

// AegisLink Work: the mark colour is the WORK accent (docs/DESIGN-SYSTEM.md).
const WORK_ACCENT = '#8b5cf6';

/** The AegisMark alone on a transparent canvas, in the given colour. */
function markSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <path d="M50 6 L86 25 L86 75 L50 94 L14 75 L14 25 Z"
        stroke="${color}" stroke-width="5.5" fill="none" stroke-linejoin="round"/>
  <rect x="32" y="38" width="36" height="8" rx="1" fill="${color}"/>
  <rect x="32" y="54" width="36" height="8" rx="1" fill="${color}" opacity="0.55"/>
</svg>`;
}

function renderStringToPng(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } });
  return resvg.render().asPng();
}

const derived = [
  // Main store/app icon = the dark variant.
  ['icon.png',              () => renderSvgToPng(join(iconsDir, 'icon-dark.svg'), MAIN_SIZE)],
  // Android adaptive foreground: mark only, transparent (background colour lives in app.json).
  ['adaptive-icon.png',     () => renderStringToPng(markSvg(WORK_ACCENT), 1024)],
  // Splash: mark only on transparent; app.json paints the background (#0b0a12).
  ['splash-icon.png',       () => renderStringToPng(markSvg(WORK_ACCENT), 400)],
  ['favicon.png',           () => renderSvgToPng(join(iconsDir, 'icon-dark.svg'), 48)],
  // Android notification icon: white silhouette on transparent, 96×96 (xxxhdpi);
  // the system tints it with android.notification.color.
  ['notification-icon.png', () => renderStringToPng(markSvg('#ffffff'), 96)],
];

for (const [name, render] of derived) {
  try {
    writeFileSync(join(assetsDir, name), render());
    console.log(`✓  ${name}`);
  } catch (e) {
    console.error(`✗  ${name} — ${e.message}`);
  }
}

console.log('\nDone. Then run `node scripts/gen-icons.js` for the Android mipmaps and `eas build`.');
