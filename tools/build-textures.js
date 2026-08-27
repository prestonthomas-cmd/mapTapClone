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

/* Any image dropped in tools/source/ wins - no renaming needed, so files
 * straight off NASA can be used as downloaded.
 *
 * A single 2:1 image is used directly. Several images are treated as a tile
 * grid: NASA publishes the full-resolution Blue Marble as eight 5400x5400
 * tiles named A1..D2, where the letter is the column running west to east and
 * the digit is the row running north to south. A1 is the northwest corner.
 */
function findSource() {
  if (!fs.existsSync(SOURCE_DIR)) {
    return fs.existsSync(BUNDLED) ? { tiles: [{ path: BUNDLED, col: 0, row: 0 }], cols: 1, rows: 1, custom: false } : null;
  }
  const images = fs.readdirSync(SOURCE_DIR)
    .filter((f) => /\.(jpe?g|png|webp|tiff?)$/i.test(f))
    .sort();

  if (images.length === 0) {
    return fs.existsSync(BUNDLED) ? { tiles: [{ path: BUNDLED, col: 0, row: 0 }], cols: 1, rows: 1, custom: false } : null;
  }
  if (images.length === 1) {
    return { tiles: [{ path: path.join(SOURCE_DIR, images[0]), col: 0, row: 0 }], cols: 1, rows: 1, custom: true };
  }
  return asTileGrid(images);
}

/* Pulls an A1-style token off each name and turns it into grid coordinates. */
function asTileGrid(images) {
  const tiles = [];
  for (const name of images) {
    const base = name.replace(/\.[^.]+$/, '');
    const m = base.match(/(?:^|[^A-Za-z0-9])([A-Za-z])([0-9]{1,2})(?:[^A-Za-z0-9]|$)/g);
    if (!m) {
      throw new Error(`Cannot tell where "${name}" sits in the grid. Tiles need an ` +
                      `A1-style marker in the filename (letter = column west to east, ` +
                      `digit = row north to south), as NASA names them.`);
    }
    // The last such token wins: "world.topo.bathy.200407.3x21600x21600.A1.jpg"
    // has a bare "3x" earlier that must not be mistaken for the marker.
    const last = m[m.length - 1].replace(/[^A-Za-z0-9]/g, '');
    tiles.push({
      path: path.join(SOURCE_DIR, name),
      col: last[0].toUpperCase().charCodeAt(0) - 65,
      row: parseInt(last.slice(1), 10) - 1,
    });
  }

  const cols = Math.max(...tiles.map((t) => t.col)) + 1;
  const rows = Math.max(...tiles.map((t) => t.row)) + 1;
  if (tiles.length !== cols * rows) {
    throw new Error(`Found ${tiles.length} tiles but they describe a ${cols}x${rows} grid, ` +
                    `which needs ${cols * rows}. Some tiles are missing or misnamed.`);
  }
  const seen = new Set(tiles.map((t) => t.col + ',' + t.row));
  if (seen.size !== tiles.length) throw new Error('Two tiles claim the same grid position.');

  return { tiles, cols, rows, custom: true };
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

/* Builds the whole plate at exactly the requested size.
 *
 * Each tile is resized straight to its cell rather than stitching at full
 * resolution first - eight 5400x5400 tiles would be a 700 MB intermediate for
 * an output we then throw most of away. Cell sizes divide exactly for every
 * tier width, so the tiles abut with no seam, and tone and sharpening are
 * applied to the assembled plate so they cannot differ across a tile edge.
 */
async function plateAt(src, width, height) {
  if (src.tiles.length === 1) {
    return open(src.tiles[0].path).resize(width, height, { kernel: 'lanczos3' });
  }
  const cellW = Math.round(width / src.cols);
  const cellH = Math.round(height / src.rows);
  const layers = [];
  for (const t of src.tiles) {
    layers.push({
      input: await open(t.path)
        .resize(cellW, cellH, { kernel: 'lanczos3' })
        .removeAlpha()
        .raw()
        .toBuffer(),
      raw: { width: cellW, height: cellH, channels: 3 },
      left: t.col * cellW,
      top: t.row * cellH,
    });
  }
  return sharp({
    create: { width: cellW * src.cols, height: cellH * src.rows, channels: 3,
              background: { r: 0, g: 0, b: 0 } },
  }).composite(layers);
}

(async () => {
  let src;
  try {
    src = findSource();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!src) {
    console.error('No source plate. Run `npm install` in tools/, or drop one at tools/source/earth.jpg');
    process.exit(1);
  }

  const root = path.join(__dirname, '..');
  const metas = await Promise.all(src.tiles.map((t) => open(t.path).metadata()));

  // Each tile is resized into its cell anyway, so tiles need not match pixel
  // for pixel - only in shape. Hand-resized tiles (the practical way to get a
  // 21600x10800 set under an upload limit) often differ by a pixel or two.
  // A tile of the wrong shape, though, means the wrong file is in the set.
  const aspects = metas.map((m) => m.width / m.height);
  const oddOne = aspects.findIndex((a) => Math.abs(a - aspects[0]) > 0.01);
  if (oddOne !== -1) {
    console.error('Tiles are not all the same shape, so they are not one set:');
    src.tiles.forEach((t, i) => console.error(`  ${path.basename(t.path)} ${metas[i].width}x${metas[i].height}`));
    process.exit(1);
  }

  const tileW = Math.max(...metas.map((m) => m.width));
  const tileH = Math.max(...metas.map((m) => m.height));
  if (metas.some((m) => m.width !== tileW || m.height !== tileH)) {
    console.warn(`note: tiles vary in size (up to ${tileW}x${tileH}); each is resampled ` +
                 'into its cell, so the grid still lines up.');
  }

  const meta = { width: tileW * src.cols, height: tileH * src.rows };
  if (src.tiles.length === 1) {
    console.log(`source: ${path.relative(root, src.tiles[0].path)} ` +
                `(${meta.width}x${meta.height})${src.custom ? '' : ' [bundled Blue Marble]'}`);
  } else {
    console.log(`source: ${src.tiles.length} tiles in a ${src.cols}x${src.rows} grid, ` +
                `${tileW}x${tileH} each => ${meta.width}x${meta.height}`);
    src.tiles.slice().sort((a, b) => a.row - b.row || a.col - b.col)
      .forEach((t) => console.log(`  [${t.col},${t.row}] ${path.basename(t.path)}`));
  }
  if (meta.width < meta.height * 2) {
    console.warn('warning: source is not 2:1, so it is probably not a full ' +
                 'equirectangular world plate - the globe will be wrong.');
  }
  if (!src.custom) {
    console.log('note: drop an 8K/16K plate - or NASA\'s A1..D2 tiles - in tools/source/ for sharper zoom.');
  }

  fs.mkdirSync(OUT, { recursive: true });

  const plan = TIERS.filter((t) => t.width <= meta.width && t.width <= MAX_WIDTH);

  // Check before writing anything: rebuilding without the source plate present
  // silently falls back to the bundled 4096 one, which would quietly discard
  // the larger tiers and leave assets/ half from one source and half another.
  const willProduce = plan.map((t) => `earth-${t.width / 1024}k.jpg`);
  const wouldDrop = fs.existsSync(OUT)
    ? fs.readdirSync(OUT).filter((f) => /^earth-\d+k\.jpg$/.test(f) && !willProduce.includes(f))
    : [];
  if (wouldDrop.length && !src.custom && !process.argv.includes('--force')) {
    console.error(`\nRefusing to drop ${wouldDrop.join(', ')} - nothing has been written.`);
    console.error('Those were built from a larger source than the bundled plate. Put the');
    console.error('source back in tools/source/ (see the README there), or pass --force to');
    console.error('rebuild at the smaller size anyway.');
    process.exit(1);
  }

  const produced = [];
  for (const tier of plan) {
    const name = `earth-${tier.width >= 1024 ? (tier.width / 1024) + 'k' : tier.width}.jpg`;
    const dest = path.join(OUT, name);
    let pipe = tone(await plateAt(src, tier.width, tier.width / 2));
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

  // Tiers a previous, larger source produced must go, or the page would list
  // plates that no longer exist.
  for (const f of wouldDrop) {
    fs.unlinkSync(path.join(OUT, f));
    console.log(`  removed stale ${f}`);
  }

  const js =
    '/* Generated by tools/build-textures.js - do not edit by hand.\n' +
    '   Satellite plates available to the page, smallest first. */\n' +
    'window.MT_PLATES = ' + JSON.stringify(produced) + ';\n';
  fs.writeFileSync(path.join(OUT, 'plates.js'), js);
  console.log(`  plates.js      ${produced.length} tier(s)`);
})();
