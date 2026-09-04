#!/usr/bin/env node
/*
 * Downloads source imagery from a GitHub release into tools/source/.
 *
 * Full-resolution Blue Marble tiles are ~250 MB each and cannot be committed:
 * GitHub caps a pushed file at 100 MB and a browser upload at 25 MB. Release
 * assets take 2 GB each, stay out of the repository history and are never
 * published to Pages, so they are the one place a 2 GB tile set can live
 * alongside the code without weighing anything down.
 *
 * Upload the tiles to a release, then:
 *
 *   npm run fetch:source            # from the default tag below
 *   npm run fetch:source -- --tag=whatever
 *
 * followed by the usual `npm run build:textures -- --max=16384`.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SOURCE_DIR = path.join(__dirname, 'source');
const DEFAULT_TAG = 'source-imagery';

/* Images only. A release may also carry notes or checksums, and pulling a
 * README into the source directory would confuse the tile grid parser. */
const IMAGE = /\.(jpg|jpeg|png|tif|tiff|webp)$/i;

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

/* The repository is read from the git remote rather than hard-coded, so a
 * fork does not have to edit this file. */
function currentRepo() {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'],
                           { cwd: __dirname, encoding: 'utf8' }).trim();
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!m) throw new Error(`Cannot read a GitHub repository out of "${url}". Pass --repo=owner/name.`);
  return m[1];
}

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

/* A complete JPEG ends with the end-of-image marker. Cheap to check and it is
 * the failure that actually happens with browser-uploaded release assets. */
function truncated(file) {
  if (!/\.(jpg|jpeg)$/i.test(file)) return false;
  const size = fs.statSync(file).size;
  if (size < 2) return true;
  const fd = fs.openSync(file, 'r');
  const tail = Buffer.alloc(2);
  fs.readSync(fd, tail, 0, 2, size - 2);
  fs.closeSync(fd);
  return !(tail[0] === 0xFF && tail[1] === 0xD9);
}

async function main() {
  const repo = arg('repo', currentRepo());
  const tag = arg('tag', DEFAULT_TAG);

  const api = `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
  /* curl rather than fetch() here too: node's fetch ignores HTTPS_PROXY, so
   * behind a proxy it bypasses it and the request comes back 403. */
  const body = execFileSync('curl', ['-sS', '-w', '\n%{http_code}', '-A', 'maptap-clone-tools', api],
                            { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const cut = body.lastIndexOf('\n');
  const status = Number(body.slice(cut + 1));
  if (status === 404) {
    throw new Error(`No release tagged "${tag}" in ${repo}.\n` +
                    `Create one at https://github.com/${repo}/releases/new and attach the tiles,\n` +
                    `or point at an existing tag with --tag=`);
  }
  if (status !== 200) throw new Error(`GitHub answered ${status} for ${api}`);

  const assets = JSON.parse(body.slice(0, cut)).assets.filter((a) => IMAGE.test(a.name));
  if (!assets.length) throw new Error(`Release "${tag}" has no image assets attached.`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  const total = assets.reduce((n, a) => n + a.size, 0);
  console.log(`${repo} @ ${tag}: ${assets.length} image${assets.length > 1 ? 's' : ''}, ${mb(total)}\n`);

  const bad = [];
  for (const a of assets) {
    const dest = path.join(SOURCE_DIR, a.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size === a.size) {
      console.log(`  have  ${a.name}  ${mb(a.size)}`);
      truncated(dest) && bad.push(a.name);
      continue;
    }
    console.log(`  get   ${a.name}  ${mb(a.size)}`);
    /* curl rather than fetch(): these are hundreds of megabytes each, and -C -
     * resumes a transfer that was cut off instead of starting the file again. */
    execFileSync('curl', ['-fL', '-C', '-', '--retry', '4', '--retry-delay', '2',
                          '-o', dest, a.browser_download_url],
                 { stdio: ['ignore', 'ignore', 'inherit'] });
    const got = fs.statSync(dest).size;
    if (got !== a.size) throw new Error(`${a.name} downloaded as ${got} bytes, expected ${a.size}.`);
    truncated(dest) && bad.push(a.name);
  }

  /* A size match only proves the transfer was faithful, not that the asset is
   * whole: a file cut short before it was uploaded arrives intact at its own
   * truncated length. Catching that here names the culprit in seconds, rather
   * than as a "premature end of JPEG image" partway through a long build. */
  if (bad.length) {
    throw new Error(`These assets are truncated on the release itself - the bytes here match ` +
                    `what GitHub holds, so they were cut before or during upload:\n` +
                    bad.map((n) => '  ' + n).join('\n') +
                    `\n\nCheck the originals before re-uploading; a whole JPEG ends with ` +
                    `ff d9:\n  for f in *.jpg; do [ "$(tail -c2 "$f" | od -An -tx1 | tr -d ' \\n')" ` +
                    `= ffd9 ] && echo "ok  $f" || echo "BAD $f"; done`);
  }

  console.log(`\nInto ${path.relative(path.join(__dirname, '..'), SOURCE_DIR)}/. ` +
              `Next: npm run build:textures -- --max=16384`);
}

main().catch((e) => { console.error('\n' + e.message); process.exit(1); });
