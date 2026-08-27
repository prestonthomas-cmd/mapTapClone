# MapTap Clone

A playable clone of [MapTap](https://maptap.gg), the daily geography game. You get five
cities, one at a time, on a satellite globe you can spin and zoom. Tap where you think each
one is; the closer you are, the more points you keep.

Runs entirely in the browser. No build step, no bundler, no framework, no third-party
requests.

**Play it: https://prestonthomas-cmd.github.io/mapTapClone/**

## Play it locally

```bash
npm start          # then open http://localhost:8080
```

Or just open `index.html` directly — everything is plain `<script>` tags and inline data,
so it works straight off the filesystem with no server at all.

## How the game works

- **Five rounds**, each harder than the last.
- Each round scores **0–100** by distance, then a round multiplier: **×1, ×1, ×2, ×3, ×3**.
  A perfect game is **1000**.
- Within 25 km is a clean 100. Roughly: 100 km → 94, 500 km → 72, 1000 km → 51,
  2000 km → 26, past 5000 km there is nothing left.

Scores decay as `100 · e^(−km/1500)`.

## Game numbers

Every game has a number, and a number always produces exactly the same five cities on
every device, forever. Send a friend a number and you are playing the same puzzle.

- **Daily #N** — one per day, the same for everyone. Day 1 is 27 August 2026;
  the number rolls over at your local midnight. A daily can only be played once —
  reopening it shows what you scored.
- **Practice #N** — unlimited, replayable, and numbered in a **separate namespace** from
  the dailies, so browsing practice games can never spoil a daily that has not happened yet.

Both are shareable as links: `?d=12` opens Daily #12, `?p=4821` opens Practice #4821.
Future dailies are clamped back to today.

## Controls

| Action | Mouse / trackpad | Touch |
| --- | --- | --- |
| Rotate | drag | drag |
| Zoom | scroll wheel, double-click, or `+` / `−` | pinch, or the on-screen buttons |
| Guess | click | tap |
| Lock in / next round | `Enter` | the button |
| Satellite / outline view | the 🛰 button | the 🛰 button |

## Layout

```
index.html          markup and script order
css/style.css
js/geo.js           spherical maths and the orthographic projection
js/satellite.js     WebGL layer that paints the Blue Marble plate on the sphere
js/globe.js         canvas renderer, camera, drag/zoom/tap handling
js/worlddata.js     polygon decoding, culling metadata, point-in-country lookup
js/rng.js           seeded PRNG (xmur3 + mulberry32)
js/puzzle.js        game numbering, puzzle generation, scoring
js/storage.js       localStorage results and stats
js/share.js         the copy-and-paste result block
js/app.js           screen flow and DOM
data/world.js       generated country polygons
data/cities.js      generated city pool
assets/earth-*.jpg  satellite plates (1k placeholder, 4k full)
tools/build-data.js regenerates both data files
tools/build-textures.js regenerates the satellite plates
server.js           zero-dependency static server
.github/workflows/pages.yml  deploys to GitHub Pages on push to main
```

## Notes on the implementation

**The satellite view** draws NASA's Blue Marble plate onto a 1-degree UV sphere in WebGL,
projected orthographically in the vertex shader. Taking texture coordinates from the mesh
rather than computing them per pixel means hardware mipmapping just works — no antimeridian
seam and no hand-rolled level-of-detail — and at the game's maximum zoom the error from
interpolating across a 1-degree triangle stays under a pixel. The exact limb comes from the
fragment shader instead, which discards anything on the far side of the sphere.

The plate loads in two steps: a 75 KB 1024x512 version paints almost immediately, then the
1 MB 4096x2048 one replaces it. Until a plate decodes — and on any device without WebGL —
the vector globe stands in, so there is never an empty disc. The 🛰 button switches between
the two views and the choice is remembered.

Country outlines stay vector even in satellite view. Imagery inevitably goes soft when you
magnify a 4096-pixel-wide plate 20x, so the crisp overlay is what carries the precision when
you are placing a pin.

**The globe** is a real orthographic projection rather than an image or a map library.
Dragging changes the geographic point at the centre of the disc; a tap is unprojected back
to latitude and longitude, so the guess is a true position on the sphere, not a pixel offset.

**Rendering** draws every country into a single path and fills it once with the even-odd
rule, which gets enclaves right for free (Lesotho inside South Africa, San Marino inside
Italy). Vertices behind the horizon are slid onto the limb so shapes hug the edge instead of
cutting a chord across the disc; rings entirely on the far side are dropped before they can
flip the fill.

Three things keep it at 60 fps with ~100k outline vertices:

- Every vertex is stored as a precomputed **unit vector**, so projection in the render loop
  is nine multiplies and no trigonometry at all.
- Each ring carries a **bounding spherical cap**, so anything behind the globe or outside the
  viewport is rejected without being projected.
- Detail follows scale: coarse outlines below 2.4× zoom, and above it vertices are **thinned
  until the skipped detail is under a pixel**.

Worst-case settled frame at 1280×810 @2x measured 8 ms; dragging holds 60 fps.

**Difficulty tiers** come from a blend of population, capital status, a curated list of
places most players can place without hesitation, and a penalty for countries small enough
that a near miss still costs you. Round 1 draws from the 80 easiest, round 5 from the 840
hardest — which is where the island capitals live.

## Deployment

Pushing to `main` triggers `.github/workflows/pages.yml`, which publishes the repository
root as-is. There is no build step — the deployed files are exactly the files in the repo.

**One-time setup:** GitHub Pages has to be turned on by the repository owner before the
workflow can deploy. Creating a Pages site is an owner-level action, so the workflow's own
token cannot do it — the first run fails with
`Create Pages site failed: Resource not accessible by integration` until it is done.

> Settings → Pages → **Build and deployment → Source: GitHub Actions**

Then re-run the workflow (Actions → *Deploy to GitHub Pages* → **Run workflow**), or just
push again. After that the site is at
`https://prestonthomas-cmd.github.io/mapTapClone/` and every push to `main` redeploys it.

## Regenerating the data

`data/world.js` and `data/cities.js` are generated and checked in. To rebuild:

```bash
npm run build:data
```

Sources: [Natural Earth](https://www.naturalearthdata.com/) country polygons via
[world-atlas](https://github.com/topojson/world-atlas) (public domain),
[GeoNames](https://www.geonames.org/) cities via
[all-the-cities](https://github.com/zeke/all-the-cities) (CC BY 4.0), and country metadata
from [world-countries](https://github.com/mledoze/countries) (ODbL).

Polygons are stored as encoded polylines at 0.001° precision — 438 KB for two levels of
detail, versus about 4 MB as raw GeoJSON.

## Not affiliated with MapTap

This is an independent reimplementation written from the game's public description, for
practice. It shares no code or data with the original.
