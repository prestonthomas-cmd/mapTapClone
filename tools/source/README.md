# Source imagery

The plates in `assets/` are generated from whatever image (or tile set) sits in this
directory. Image files here are gitignored — they are large, and only the generated plates
ship. This note records where the committed plates came from so they can be rebuilt.

## Current source

**Solar System Scope, 8K Earth day map** — 8192x4096 equirectangular, derived from NASA
Blue Marble, cloudless.

- Original: <https://www.solarsystemscope.com/textures/>
- Licence: **CC BY 4.0** — attribution is required and is given in the README and in the
  game's How-to-play panel.
- Mirror used when the original was unreachable:
  <https://raw.githubusercontent.com/Siqister/files/master/8k_earth_daymap.jpg>
  (4 565 076 bytes, verified 8192x4096)

Save it here under any name and run `npm run build:textures`.

## Going further

NASA's Blue Marble Next Generation reaches 21600x10800, with topography and bathymetry
shading — the ocean-floor relief this day map does not have. It is published as eight
5400x5400 tiles named A1..D2; drop all eight in here and they are stitched automatically.

- <https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/>

## Getting the tiles here

The full tiles are 21600x21600 each, which is far past both GitHub's upload limits and
anything that can be displayed. **Resize them before uploading.** Each tile is resampled
straight into its cell of the output plate, so any resolution above its cell size is
discarded by the build anyway:

| Output plate      | Tile size needed | Roughly per tile | Eight tiles |
|-------------------|------------------|------------------|-------------|
| 8192x4096         | 2048x2048        | ~1 MB            | ~8 MB       |
| 16384x8192 (max)  | 4096x4096        | ~4 MB            | ~35 MB      |

4096x4096 is the largest that is ever useful: 16384 is the widest tier, and it is already
past the MAX_TEXTURE_SIZE of most phones. Every file at that size clears GitHub's 25 MB
web-upload cap with room to spare.

On macOS, with the tiles in a folder:

    sips -Z 4096 -s format jpeg -s formatOptions 90 *.png --out resized/

They are gitignored, so add them with `git add -f tools/source/`, or upload them anywhere
in the repo and move them here.

## Full resolution, via a GitHub release

Release assets take 2 GB per file, stay out of the repository history and are never
published to Pages, so the whole 21600x21600 tile set can live alongside the code without
being resized and without weighing the repo down.

1. Go to <https://github.com/prestonthomas-cmd/mapTapClone/releases/new>.
2. Tag it `source-imagery` (any tag works; pass `--tag=` to use another) and give it a
   title. The tag is created by publishing, so it need not exist yet.
3. Drag all eight tiles into the attachment box and wait for each to finish uploading.
   Do not publish until every one shows as uploaded.
4. Publish.

Then, here:

    npm run fetch:source
    npm run build:textures -- --max=16384

`fetch-source.js` reads the repository from the git remote, pulls every image attached to
that tag into this directory, skips anything already downloaded at the right size, and
resumes a transfer that was cut off rather than restarting it. Non-image assets are
ignored, so release notes or a checksum file attached alongside will not confuse the tile
grid parser.

Upload one tile first and run `npm run fetch:source` against it before committing to the
whole set - it proves the path end to end in a couple of minutes rather than after 2 GB.

**Verify the files before uploading.** A browser upload that is cut short still produces a
release asset, just a shorter one, and it downloads perfectly at its own truncated length -
the size check cannot see it. `fetch-source.js` therefore also checks that each JPEG ends
with its end-of-image marker and names any file that does not, but catching it locally
first is quicker:

    for f in *.jpg; do [ "$(tail -c2 "$f" | od -An -tx1 | tr -d ' \n')" = ffd9 ] \
      && echo "ok  $f" || echo "BAD $f"; done

Do **not** use Git LFS for the plates in `assets/`. GitHub Pages does not resolve LFS
pointers, so the site would serve a pointer file where the image should be.
