#!/usr/bin/env node
/*
 * Cuts the detail tile pyramid in assets/tiles/ from the source imagery.
 *
 * The plates in assets/ carry the whole globe in one texture, which puts a
 * hard floor under how sharp a zoomed-in globe can be: 8192 wide is 4.9 km per
 * pixel at the equator, and the budget is spent mostly on ocean and on the
 * half of the planet facing away. Going wider does not work either - a 16384
 * plate needs about 1.2 GB to upload and takes the tab down.
 *
 * Tiles fix both ends of that. Only the visible region is resident, so a level
 * far beyond any single plate costs less memory than the 8192 plate does, and
 * the source already has the detail: the Blue Marble set is 86400x43200, of
 * which the 8192 plate keeps about 1%.
 *
 * Levels are the plate widths they continue: LEVELS below are the full-globe
 * width each pyramid level would have. The plates cover everything below.
 *
 * 65536 is the last level worth cutting from this source. It is 611 m per
 * pixel against the source's own 464, so the next level up would mostly be
 * resampling detail that is not there. It is also where the cost lands: 8192
 * of the 10752 tiles and most of the bytes, because each level quadruples.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'tiles');
const SOURCE_DIR = path.join(__dirname, 'source');

const TILE = 512;
const LEVELS = [16384, 32768, 65536];
const QUALITY = 82;

/* Tiles are square and the globe is 2:1, so a level of width W is W/TILE by
 * W/2/TILE tiles. Longitude runs west to east from -180, latitude north to
 * south from +90, matching the source's own A1..D2 lettering. */
const open = (f) => sharp(f, { limitInputPixels: false, sequentialRead: true });

function findTiles() {
  const images = fs.readdirSync(SOURCE_DIR).filter((n) => /\.(jpe?g|png)$/i.test(n));
  const tiles = [];
  for (const name of images) {
    const m = name.replace(/\.[^.]+$/, '').match(/(?:^|[^A-Za-z0-9])([A-Za-z])([0-9])(?:[^A-Za-z0-9]|$)/g);
    if (!m) throw new Error(`Cannot place "${name}" in the grid - needs an A1-style marker.`);
    const last = m[m.length - 1].replace(/[^A-Za-z0-9]/g, '');
    tiles.push({ path: path.join(SOURCE_DIR, name),
                 col: last[0].toUpperCase().charCodeAt(0) - 65,
                 row: parseInt(last.slice(1), 10) - 1 });
  }
  const cols = Math.max(...tiles.map((t) => t.col)) + 1;
  const rows = Math.max(...tiles.map((t) => t.row)) + 1;
  if (tiles.length !== cols * rows) {
    throw new Error(`${tiles.length} tiles describe a ${cols}x${rows} grid, which needs ${cols * rows}.`);
  }
  return { tiles, cols, rows };
}

/* Each source tile is resized once per level and then sliced, rather than
 * re-decoding a 21600x21600 JPEG for every 512px tile cut out of it. At the
 * largest level that intermediate is 8192x8192 - 200 MB raw, which is worth
 * spending to avoid thousands of full decodes. */
async function cutLevel(src, width, report) {
  const gx = width / TILE, gy = width / 2 / TILE;
  const perX = gx / src.cols, perY = gy / src.rows;
  if (!Number.isInteger(perX) || !Number.isInteger(perY)) {
    throw new Error(`Level ${width} does not divide evenly into a ${src.cols}x${src.rows} source grid.`);
  }
  const cellW = perX * TILE, cellH = perY * TILE;
  const ROW = TILE * 3, STRIDE = cellW * 3;
  let written = 0, bytes = 0;

  for (const t of src.tiles) {
    const raw = await open(t.path).resize(cellW, cellH, { kernel: 'lanczos3' })
                                  .removeAlpha().raw().toBuffer();
    // limitInputPixels again: the cell for the 65536 level is 16384 square,
    // which is 268435456 pixels against sharp's default ceiling of 268402689.
    // It clears it by 0.01%, so the level fails on its very first tile.
    /* The cut copies rows out of the raw buffer rather than asking sharp to
     * extract a window from it. An extract costs a pass over the whole cell,
     * which at the 65536 level is 768 MB for every one of 1024 tiles and put
     * the build on a five hour pace. Copying 512 rows is the same picture for
     * a thousandth of the memory traffic. */
    const jobs = [];
    for (let ly = 0; ly < perY; ly++) {
      for (let lx = 0; lx < perX; lx++) {
        const buf = Buffer.allocUnsafe(TILE * ROW);
        for (let row = 0; row < TILE; row++) {
          const from = (ly * TILE + row) * STRIDE + lx * ROW;
          raw.copy(buf, row * ROW, from, from + ROW);
        }
        const tx = t.col * perX + lx, ty = t.row * perY + ly;
        const dir = path.join(OUT, String(width), String(tx));
        fs.mkdirSync(dir, { recursive: true });
        jobs.push({ buf: buf, file: path.join(dir, ty + '.jpg') });
      }
    }
    // Encoding is what is left, and sharp releases the loop while it works, so
    // run a few at a time instead of one after another.
    const LANES = 4;
    for (let i = 0; i < jobs.length; i += LANES) {
      const infos = await Promise.all(jobs.slice(i, i + LANES).map(function (j) {
        return sharp(j.buf, { raw: { width: TILE, height: TILE, channels: 3 } })
          .jpeg({ quality: QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true })
          .toFile(j.file);
      }));
      infos.forEach(function (info) { written++; bytes += info.size; });
    }
    report(t, written);
  }
  return { written, bytes, gx, gy };
}

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

/* What a level directory already holds, so a rerun after a failure further up
 * the pyramid does not recut the levels that already succeeded. */
function countTiles(dir) {
  let n = 0, bytes = 0;
  for (const x of fs.readdirSync(dir)) {
    const sub = path.join(dir, x);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub)) {
      if (!/\.jpg$/i.test(f)) continue;
      n++; bytes += fs.statSync(path.join(sub, f)).size;
    }
  }
  return { n: n, bytes: bytes };
}

(async () => {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error('No tools/source/. Run `npm run fetch:source` first.');
    process.exit(1);
  }
  let src;
  try { src = findTiles(); } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`source: ${src.tiles.length} tiles in a ${src.cols}x${src.rows} grid`);

  const levels = [];
  for (const width of LEVELS) {
    const gx = width / TILE, gy = width / 2 / TILE;
    const dir = path.join(OUT, String(width));
    const have = fs.existsSync(dir) ? countTiles(dir) : { n: 0, bytes: 0 };
    if (have.n === gx * gy) {
      console.log(`level ${width}: already complete, ${have.n} tiles, ${mb(have.bytes)}`);
      levels.push({ width: width, cols: gx, rows: gy, tile: TILE, bytes: have.bytes });
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    process.stdout.write(`level ${width}: `);
    const r = await cutLevel(src, width, () => process.stdout.write('.'));
    console.log(` ${r.written} tiles, ${mb(r.bytes)}`);
    levels.push({ width: width, cols: r.gx, rows: r.gy, tile: TILE, bytes: r.bytes });
  }

  const total = levels.reduce((n, l) => n + l.bytes, 0);
  const manifest = '/* Generated by tools/build-tiles.js - do not edit by hand.\n' +
    '   Detail tiles, equirectangular, lon west to east and lat north to south.\n' +
    '   URL: assets/tiles/<width>/<x>/<y>.jpg */\n' +
    'window.MT_TILES = ' + JSON.stringify({
      levels: levels.map((l) => ({ width: l.width, cols: l.cols, rows: l.rows, tile: l.tile }))
    }) + ';\n';
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'tiles.js'), manifest);
  console.log(`\ntotal ${mb(total)} across ${levels.reduce((n, l) => n + l.cols * l.rows, 0)} tiles`);
  console.log('wrote assets/tiles.js');
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
