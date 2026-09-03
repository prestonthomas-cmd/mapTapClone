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
score = 100 / (1 + (km / 3575) ^ 3.13)
```

| you were | score | |
| --- | --- | --- |
| within 500 km | **100** | |
| 1 000 km | 98 | |
| 2 000 km | 86 | |
| 3 000 km | 64 | |
| 3 575 km | 50 | half marks |
| 5 000 km | 26 | |
| 8 000 km+ | ~7 | wrong part of the planet |

**This is fitted to MapTap, not chosen.** MapTap reports a distance and a percentage after
every guess. Game #803 gave 13 km → 100%, 219 km → 95%, 6 km → 100%, 3440 km → 53% and
2895 km → 66%, totalling 752 — which reconstructs *exactly* under multipliers ×1,×1,×2,×3,×3.
That confirms two things at once: the percentage shown is the 0–100 round score, and the
multipliers here were already right.

The shape is a long plateau and then a fall, and it is far more forgiving through the middle
than anything guessed here previously. At 2000 km MapTap pays 86 where this game had been
paying 50; that same game would have scored 570 on the old curve against the 752 MapTap
actually awarded. The game was harder than MapTap, not easier.

Two caveats are worth keeping in view. Every curve family tried reproduces the two far
points almost exactly and none explains 219 km → 95 — they all predict 99 or 100 there — so
either the near range has a rule of its own or that reading is noise. And nothing at all was
observed between 219 km and 2895 km, so the middle is interpolation; the four families
disagree by up to 7 points through it.

To refine with more observations:

```bash
node tools/fit-score-curve.js 13:100 219:95 6:100 3440:53 2895:66
```

Each argument is `<km>:<percent>`, read straight off MapTap. It fits four families, ranks
them by residual, names the observation carrying the largest error, and points at the widest
unsampled span — because a reading in the gap is worth more than another at the ends.

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
