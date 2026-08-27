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

Tiles need not be full resolution: output tiers stop at 8192 wide by default, and an
8192x4096 plate needs each tile at exactly 2048x2048, so resizing them first costs nothing.
