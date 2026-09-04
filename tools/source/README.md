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

Alternatively, attach the full-resolution tiles to a **GitHub release** rather than
committing them: release assets allow 2 GB per file, stay out of the repo history, and are
not published to Pages. They can then be downloaded into this directory before the build.

Do **not** use Git LFS for the plates in `assets/`. GitHub Pages does not resolve LFS
pointers, so the site would serve a pointer file where the image should be.
