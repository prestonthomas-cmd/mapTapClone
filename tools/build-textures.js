#!/usr/bin/env node
/*
 * Generates the satellite plates in assets/, plus assets/plates.js listing
 * what was produced so the page only ever requests files that exist.
 *
 * Source, in order of preference:
 *   1. tools/source/earth.(jpg|png)  - drop your own plate here
 *   2. NASA Blue Marble Next Generation at 4096x2048, bundled with three-globe
 *
 * The bundled plate is the highest resolution available offline. For sharper
 * imagery when zoomed in, download an 8K or 16K equirectangular Earth (Solar
 * System Scope publishes CC BY 4.0 ones, NASA Visible Earth the originals),
 * save it as tools/source/earth.jpg and re-run this script - the extra tiers
 * are generated and wired up automatically.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets');
const SOURCE_DIR = path.join(__dirname, 'source');
const BUNDLED = path.join(__dirname, 'node_modules', 'three-globe',
                          'example', 'img', 'earth-blue-marble.jpg');

// The renderer darkens the limb, and the raw plate reads very dark once that
// is applied on top of a dark page.
const tone = (img) => img.modulate({ brightness: 1.10, saturation: 1.14 }).linear(1.04, -4);

/* 8192 is the practical ceiling for a web game: about 3-4 MB, and within the
 * MAX_TEXTURE_SIZE of essentially every GPU that reports more than 4096. A
 * 16384 tier is a 12 MB+ download, so it is opt-in via --max=16384. */
const DEFAULT_MAX_WIDTH = 8192;
const maxArg = process.argv.find((a) => a.startsWith('--max='));
const MAX_WIDTH = maxArg ? Number(maxArg.split('=')[1]) : DEFAULT_MAX_WIDTH;

/* Any image dropped in tools/source/ wins - no renaming needed, so a file
 * straight off NASA (world.topo.bathy.200407.3x21600x10800.jpg and friends)
 * can be used as downloaded. */
function findSource() {
  if (fs.existsSync(SOURCE_DIR)) {
    const images = fs.readdirSync(SOURCE_DIR)
      .filter((f) => /\.(jpe?g|png|webp|tiff?)$/i.test(f))
      .sort();
    if (images.length) {
      if (images.length > 1) {
        console.warn(`tools/source/ holds ${images.length} images; using ${images[0]}`);
      }
      return { path: path.join(SOURCE_DIR, images[0]), custom: true };
    }
  }
  if (fs.existsSync(BUNDLED)) return { path: BUNDLED, custom: false };
  return null;
}

/* BMNG plates run to 21600x10800 - well past sharp's default input guard, and
 * far too much to hold in memory all at once. */
function open(file) {
  return sharp(file, { limitInputPixels: false, sequentialRead: true });
}

/* Only widths the source can actually support are emitted - upscaling would
 * add bytes and no detail. */
const TIERS = [
  { width: 1024, quality: 80, chroma: '4:2:0', sharpen: 0,   defer: false },
  { width: 4096, quality: 82, chroma: '4:4:4', sharpen: 0.7, defer: false },
  { width: 8192, quality: 78, chroma: '4:2:0', sharpen: 0.7, defer: true },
  { width: 16384, quality: 76, chroma: '4:2:0', sharpen: 0.6, defer: true },
];

(async () => {
  const src = findSource();
  if (!src) {
    console.error('No source plate. Run `npm install` in tools/, or drop one at tools/source/earth.jpg');
    process.exit(1);
  }

  const meta = await open(src.path).metadata();
  console.log(`source: ${path.relative(path.join(__dirname, '..'), src.path)} ` +
              `(${meta.width}x${meta.height})${src.custom ? '' : ' [bundled Blue Marble]'}`);
  if (meta.width < meta.height * 2) {
    console.warn('warning: source is not 2:1, so it is probably not a full ' +
                 'equirectangular world plate - the globe will be wrong.');
  }
  if (!src.custom) {
    console.log('note: drop an 8K/16K equirectangular plate in tools/source/ for sharper zoom.');
  }

  fs.mkdirSync(OUT, { recursive: true });

  const produced = [];
  for (const tier of TIERS) {
    if (tier.width > meta.width) continue;          // never upscale
    if (tier.width > MAX_WIDTH) continue;           // opt in with --max=
    const name = `earth-${tier.width >= 1024 ? (tier.width / 1024) + 'k' : tier.width}.jpg`;
    const dest = path.join(OUT, name);
    let pipe = tone(open(src.path).resize(tier.width, tier.width / 2, { kernel: 'lanczos3' }));
    // A little unsharp on the big tiers pushes back against the softness of
    // magnifying a plate well past its native resolution.
    if (tier.sharpen) pipe = pipe.sharpen({ sigma: tier.sharpen });
    await pipe.jpeg({ quality: tier.quality, mozjpeg: true, chromaSubsampling: tier.chroma })
              .toFile(dest);
    const kb = fs.statSync(dest).size / 1024;
    produced.push({ url: 'assets/' + name, width: tier.width, defer: tier.defer });
    console.log(`  ${name.padEnd(14)} ${tier.width}x${tier.width / 2}  ${kb.toFixed(0)} KB` +
                (tier.defer ? '  (loaded on zoom)' : ''));
  }

  // Remove tiers from a previous, larger source so the page never 404s.
  for (const f of fs.readdirSync(OUT)) {
    if (/^earth-\d+k\.jpg$/.test(f) && !produced.some((p) => p.url.endsWith(f))) {
      fs.unlinkSync(path.join(OUT, f));
      console.log(`  removed stale ${f}`);
    }
  }

  const js =
    '/* Generated by tools/build-textures.js - do not edit by hand.\n' +
    '   Satellite plates available to the page, smallest first. */\n' +
    'window.MT_PLATES = ' + JSON.stringify(produced) + ';\n';
  fs.writeFileSync(path.join(OUT, 'plates.js'), js);
  console.log(`  plates.js      ${produced.length} tier(s)`);
})();
