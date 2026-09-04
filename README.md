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
score = 100 / (1 + (km / 3867) ^ 1.05)
```

| you were | score |
| --- | --- |
| within 100 km | 98 |
| 500 km | 90 |
| 1 000 km | 81 |
| 2 000 km | 67 |
| 3 867 km | 50 |
| 8 000 km | 32 |
| opposite side of the world | 15 |

**This is fitted to MapTap, not chosen.**

MapTap reports a distance and a percentage after every guess. Ten rounds have been read off
two games, and both reconstruct under multipliers ×1,×1,×2,×3,×3 — which is how those
multipliers were confirmed rather than assumed.

| game | rounds | total |
| --- | --- | --- |
| #803 | 13 km → 100, 219 km → 95, 6 km → 100, 3440 km → 53, 2895 km → 66 | 752 |
| #804 | 66 km → 99, 190 km → 96, 912 km → 82, 105 km → 98, 3 km → 100 | 953 |

Nine of those ten rounds are reproduced **exactly** by the curve above. The 912 km reading is
the one that carries the most weight: it fell in a range between 219 km and 2895 km that had
never been sampled, and the curve — fitted before it existed — predicted 81.6 against the 82
observed. Refitting over the nine clean rounds moved the constants only from
3865/1.03 to 3867/1.05, and centred residuals that had all been leaning one way.

The exponent landing near 1 means the shape is essentially `100 · K/(K + km)`, which is the
kind of formula someone actually writes.

### There is no same-country bonus

This carried one for a while, worth +8.6. It was inferred from a single round of #803 — Urumqi,
which scored 66 at 2895 km where the curve says 57 — and the bonus closed that gap precisely.

Game #804 refutes it. Four of its rounds would have scored 100 with a bonus and did not:
Dundee 99 at 66 km, Valparaíso 98 at 105 km, Liberec 96 at 190 km, and #803's Gothenburg 95 at
219 km. Sampling the circle at each of those radii against the country polygons, 71% of the
ground 66 km from Dundee is UK land even when a sea tap is counted as no country at all. For
the bonus to survive, every one of those four guesses has to have left its own country — about
a 4% coincidence — while the one round that needs the bonus had only a 21% chance of being
inside China. Dropping it takes the rounds reproduced exactly from six to nine.

That leaves Urumqi unexplained. Its *score* is not in doubt, since #803 only totals 752 if that
round scored 66, so it is the 2895 km reading that would have to be wrong — the curve wants
2029 km for 66. No curve of this family can pass through it and its neighbours anyway: 912 km →
82 and 3440 km → 53 both sit on the curve, and reaching 66 between them needs a local slope
3.6× the steepest this family can be anywhere.

One caveat is carried in the code rather than smoothed over: nothing was observed past
3440 km, so the tail is extrapolation, and an exponent near 1 implies a fat one — a guess on
the wrong side of the planet still scores in the teens. A single observation from a badly
missed round would settle it.

To refine:

```bash
node tools/fit-score-curve.js 13:100:same 219:95 6:100:same 3440:53 2895:66:same
```

Each argument is `<km>:<percent>`, with `:same` when the guess landed in the answer's own
country. The fitter searches curve *and* bonus across four families, ranks them by residual,
and points at the widest unsampled span.

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

Imagery is NASA's [Blue Marble Next Generation](https://visibleearth.nasa.gov/collection/1484/blue-marble)
with topography and bathymetry — June 2004, stitched from the eight 21600x21600 tiles, so
the oceans carry real seafloor relief rather than a flat colour. NASA imagery is in the
public domain; the credit is shown in the game's How to play panel.

## Not affiliated with MapTap

This is an independent reimplementation written from the game's public description, for
practice. It shares no code or data with the original.
