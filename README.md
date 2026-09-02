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

```
score = 100 / (1 + (km / 3000) ^ 2)
```

| you were | score | |
| --- | --- | --- |
| within 50 km | **100** | right city |
| 250 km | 99 | still the right area |
| 500 km | 97 | right country |
| 1 000 km | 90 | |
| 2 000 km | 69 | |
| 3 000 km | 50 | half marks |
| 8 000 km+ | ~12 | wrong part of the planet |

Squaring gives a plateau rather than a slope. On a globe, being a little wrong still means
you knew where the place was, so landing in the right country should cost a couple of points
rather than a fifth of the round. The fall comes later, once a guess is genuinely in the
wrong part of the world.

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
assets/earth-*.jpg  satellite plates, smallest first
assets/plates.js    generated list of which plates exist
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
the vector globe stands in, so there is never an empty disc — it is a fallback, not a style
choice, and there is no way to select it.

The globe shows the imagery alone — no country borders, since they are not on the real
planet, and coastlines are already legible in the plate.

### The imagery

The shipped plate is the **8192x4096 Solar System Scope Earth day map** (CC BY 4.0, derived
from NASA Blue Marble, cloudless). Provenance and the exact source URL are recorded in
`tools/source/README.md`.

It replaced a 4096x2048 Blue Marble Next Generation plate, doubling land resolution — which
is what you actually zoom into. The trade is the ocean: BMNG carries topography *and
bathymetry*, so the sea floor is shaded, while this day map has a flatter blue. Land detail
won because the game is about finding cities.

To change it, drop a different equirectangular plate in `tools/source/`:

- [NASA Blue Marble Next Generation, topography and bathymetry](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/)
  — the original, one plate per month, up to 21600x10800. Either a single 2:1 image or the
  full-resolution **eight-tile set**; both work.
- [Solar System Scope](https://www.solarsystemscope.com/textures/) — 8K and 16K, CC BY 4.0,
  single files.

Then:

```bash
cp ~/Downloads/world.topo.bathy.*.jpg tools/source/
npm run build:textures
```

Any image in `tools/source/` is picked up, whatever it is called, so files straight off NASA
work as downloaded.

**You do not need full-resolution tiles.** Output tiers stop at 8192 wide by default, and an
8192x4096 plate needs each tile at exactly **2048x2048** — a quarter of the width, half the
height. Resizing each tile to 2048x2048 before you do anything else therefore costs nothing
at all, and takes each file from tens of megabytes to one or two. That matters if you are
uploading through GitHub's web interface, which caps at 25 MB per file (a `git push` allows
100 MB, but committing hundreds of megabytes of source imagery you will never use again is
not worth the history). Going past 8192 needs `--max=16384` and full-resolution tiles.

**Tiles.** Drop all eight in together and they are stitched automatically. NASA names them
`A1`..`D2`, where the letter is the column running west to east and the digit is the row
running north to south — so `A1` is the northwest corner and `D2` the southeast. The build
reads that marker off the filename (ignoring the `3x21600x21600` part, which looks
deceptively similar), and checks the grid is complete. Tiles need not match pixel for
pixel — each is resampled into its cell, so hand-resized tiles that differ by a pixel or two
are fine and only produce a note. A tile of a different *shape* is rejected, because that
means the wrong file is in the set.

Tiles are resized straight into their cell rather than being stitched at full resolution
first — eight 5400x5400 tiles would be a 700 MB intermediate for an output most of which is
then thrown away. Cell sizes divide exactly at every tier width, and tone and sharpening are
applied to the assembled plate, so no seam appears at a tile edge. This is measured, not
assumed: across a reconstructed plate, the pixel step at each tile boundary is no larger than
at an ordinary column 200 px away. The script never upscales, generates each tier the source can support,
and writes `assets/plates.js` so the page only requests plates that exist. Nothing else
changes — commit the regenerated `assets/` and push.

Tiers stop at 8192 by default: roughly 4 MB, and within the `MAX_TEXTURE_SIZE` of
essentially every GPU that reports more than 4096. Pass `--max=16384` to opt into the
largest tier. Plates above 4096 wide are fetched only once you zoom past 2.5x, and are
skipped entirely on GPUs that cannot hold them — plenty of phones still cap at 4096.
`tools/source/` is gitignored; the generated plates are what ship.

Every tier that is ever magnified is encoded 4:4:4. Chroma subsampling halves the resolution
of colour, and on this plate the colour *is* the coastline: a green-to-blue edge carries
almost no luminance step, so it survives 4:2:0 badly. The large tiers are also encoded at
high quality — at q78 the 8K tier came out at 2 MB from a 4.35 MB source, discarding a third
of what the source had. They sit behind a zoom, so those bytes are only spent by players who
have zoomed far enough to see them.

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

**The city pool** is deliberately small — about 480 places — because every entry has to be
one a player could reasonably attempt. An ordinary city of 200 000 is not a hard question,
it is an unanswerable one: nobody can place Kultali or Dadukou, and rounds 3–5 carry 80% of
the scoring weight, so filling them with anonymous cities makes the game feel unfair rather
than difficult. The pool is national capitals, a curated list of places people have heard
of, and cities big enough to be famous for their size — restricted to sovereign states plus
a handful of well-known territories. Dependencies fill the hard end with trivia rather than
geography: Pitcairn has forty residents and South Georgia about twenty.

**Recognisability, not population, sets the order.** Population is a poor proxy for whether
a player can place a city — Kinshasa has more people than Rome, and São Paulo more than New
York, but that is not how the difficulty of a geography question works. Ranking on
population put Conakry and Mogadishu in round one and left New York out of it entirely.
`tools/famous-cities.js` therefore carries two graded lists — places a general audience can
place without hesitation, and places they have merely heard of — and those dominate the
ranking, with population left as a tiebreaker and a penalty for countries small enough that
a near miss still costs you.

Round 1 now draws from the 48 easiest (London, Paris, New York, Tokyo, Sydney); round 5 from
the 136 hardest, which is where the small island states live — Tonga, Cape Verde, Vanuatu,
São Tomé. Five tiers of 48/77/96/125/136 still give some 6 billion distinct games.

## Deployment

Live at **https://prestonthomas-cmd.github.io/mapTapClone/**

Every push to `main` runs `.github/workflows/pages.yml`, which publishes the repository root
as-is. There is no build step — the deployed files are exactly the files in the repo.

The only manual setup is turning Pages on once: Settings → Pages → *Build and deployment* →
**Source: GitHub Actions**. Creating a Pages site is an owner-level action that the
workflow's own token cannot perform.

One wrinkle worth knowing, since it costs an afternoon if you hit it blind: the job
deliberately has **no `environment: github-pages` block**. Naming that environment puts the
job behind the environment's deployment-branch policy, which GitHub pins to whichever branch
was default at the moment Pages was first enabled — and it does *not* follow later changes to
the default branch. When that policy points at a branch you have since renamed or retired,
the job is rejected before it executes a single step: a few seconds, no logs, nothing to
debug. Omitting the block skips the job-level gate; the deploy still targets `github-pages`.

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

The satellite plates rebuild separately:

```bash
npm run build:textures
```

Their source image is not committed — `tools/source/README.md` records where it came from
and its licence. Running the build without it falls back to the 4096x2048 plate bundled with
`three-globe`, which would silently discard the 8K tier, so the build refuses and writes
nothing unless given `--force`.

Imagery is the 8K Earth day map from
[Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0, derived from
NASA Blue Marble). That attribution is also shown in the game's How to play panel.

## Not affiliated with MapTap

This is an independent reimplementation written from the game's public description, for
practice. It shares no code or data with the original.
