#!/usr/bin/env node
/*
 * Generates assets/earth-1k.jpg and assets/earth-4k.jpg from NASA's Blue Marble
 * Next Generation plate (public domain), shipped inside the three-globe package.
 *
 * Two sizes: the small one paints almost immediately, the large one replaces it
 * once decoded.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// three-globe's "exports" map does not expose its example assets, so the file
// is reached through node_modules directly rather than via require.resolve.
const SRC = path.join(__dirname, 'node_modules', 'three-globe',
                      'example', 'img', 'earth-blue-marble.jpg');
const OUT = path.join(__dirname, '..', 'assets');

// The renderer darkens the limb, and the raw plate reads very dark once that
// is applied on top of a dark page.
const tone = (img) => img.modulate({ brightness: 1.10, saturation: 1.14 }).linear(1.04, -4);

const SIZES = [
  { name: 'earth-4k.jpg', width: 4096, quality: 82, chroma: '4:4:4' },
  { name: 'earth-1k.jpg', width: 1024, quality: 80, chroma: '4:2:0' },
];

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Source plate not found at ' + SRC + '\nRun `npm install` in tools/ first.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of SIZES) {
    const dest = path.join(OUT, s.name);
    await tone(sharp(SRC).resize(s.width, s.width / 2, { kernel: 'lanczos3' }))
      .jpeg({ quality: s.quality, mozjpeg: true, chromaSubsampling: s.chroma })
      .toFile(dest);
    console.log(`${s.name.padEnd(14)} ${s.width}x${s.width / 2}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
  }
})();
