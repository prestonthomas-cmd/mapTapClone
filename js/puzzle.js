/* Game numbering, puzzle generation and scoring. */
(function (MT) {
  'use strict';

  var ROUNDS = 5;
  var MULTIPLIERS = [1, 1, 2, 3, 3];        // sums to 10 -> 1000 points a game
  var MAX_SCORE = 1000;
  var HALF_MARKS_KM = 3867;                 // the distance worth exactly 50
  var FALLOFF = 1.05;                       // very close to a plain 1/(1+d/K)
  // Display only: the curve already gives a close guess a clean 100, so this
  // just decides the wording.
  var BULLSEYE_KM = 50;

  /* Day 1 is the day the clone went live. Games are numbered from there. */
  var EPOCH = { y: 2026, m: 7, d: 27 };     // 27 Aug 2026, month is 0-based
  var DAY_MS = 86400000;

  /* Local midnight, so "today's game" follows the player's own calendar. */
  function dayNumber(date) {
    var now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var epoch = Date.UTC(EPOCH.y, EPOCH.m, EPOCH.d);
    return Math.floor((now - epoch) / DAY_MS) + 1;
  }

  function todayNumber() { return dayNumber(new Date()); }

  function msUntilNextDaily() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return next.getTime() - now.getTime();
  }

  /* ------------------------------------------------------------------ *
   * Puzzle construction
   * ------------------------------------------------------------------ */
  var tiers = null;

  function indexCities() {
    if (tiers) return tiers;
    var data = window.MT_CITIES;
    tiers = [[], [], [], [], []];
    for (var i = 0; i < data.cities.length; i++) {
      var c = data.cities[i];
      // `rank` is the city's position in the pool, hardest last. Tiers are
      // contiguous rank bands, so it doubles as an absolute difficulty score
      // that is comparable across tier boundaries.
      tiers[c[4] - 1].push({ name: c[0], cc: c[1], lat: c[2], lon: c[3], tier: c[4], rank: i });
    }
    return tiers;
  }

  function countryName(cc) {
    return (window.MT_CITIES.countries[cc]) || cc;
  }

  /* Practice and daily games are numbered independently so that browsing
   * practice puzzles can never leak a future daily. */
  function seedFor(mode, number) {
    return 'maptap-clone|v1|' + mode + '|' + number;
  }

  /* Tiers are adjacent rank bands, so a round can sit a handful of ranks above
   * the last one and the game stops feeling like it is getting harder - a
   * round 2 of San Jose followed by a round 3 of Port Moresby, five ranks
   * apart, or a round 5 of Zurich at triple points. Requiring a real step
   * between consecutive rounds keeps the ramp honest. It is a preference, not
   * a rule: like the other constraints it relaxes if the draw is awkward. */
  var MIN_RANK_STEP = 45;

  function generate(mode, number) {
    var pools = indexCities();
    var rand = MT.rng.create(seedFor(mode, number));
    var chosen = [];

    for (var r = 0; r < ROUNDS; r++) {
      var pool = pools[r];
      var pick = null;
      // Prefer a city that is not a near neighbour of, or in the same country
      // as, one already drawn; give up gracefully rather than loop forever.
      for (var attempt = 0; attempt < 60; attempt++) {
        var cand = pool[rand.int(pool.length)];
        var ok = true;
        if (attempt < 45 && chosen.length &&
            cand.rank - chosen[chosen.length - 1].rank < MIN_RANK_STEP) ok = false;
        for (var j = 0; ok && j < chosen.length; j++) {
          var prev = chosen[j];
          if (prev.name === cand.name && prev.cc === cand.cc) { ok = false; break; }
          if (attempt < 40 && prev.cc === cand.cc) { ok = false; break; }
          if (attempt < 50 &&
              MT.geo.distanceKm(prev.lat, prev.lon, cand.lat, cand.lon) < 600) { ok = false; break; }
        }
        if (ok) { pick = cand; break; }
      }
      if (!pick) pick = pool[rand.int(pool.length)];
      chosen.push(pick);
    }

    return {
      mode: mode,
      number: number,
      rounds: chosen.map(function (c, i) {
        return {
          index: i,
          city: c.name,
          cc: c.cc,
          country: countryName(c.cc),
          lat: c.lat,
          lon: c.lon,
          multiplier: MULTIPLIERS[i]
        };
      })
    };
  }

  /* ------------------------------------------------------------------ *
   * Scoring
   * ------------------------------------------------------------------ */
  /* 0-100 per round, before the round multiplier.
   *
   *     score = 100 / (1 + (km / 3867) ^ 1.05)
   *
   * Fitted to MapTap, not chosen. Refit over nine clean observations, which
   * moved it barely at all from the five it was first fitted to - and centred
   * the residuals, which had all been leaning one way.
   *
   *     observed                            this curve pays
   *       3 km   100      219 km    95        100 km   98
   *      13 km   100      912 km    82        500 km   90
   *      66 km    99     3440 km    53       2000 km   67
   *     105 km    98                         3867 km   50   half marks
   *     190 km    96                         8000 km   32
   *
   * The exponent sitting near 1 means the underlying shape is essentially
   * 100 * K / (K + km), which is the kind of thing someone actually writes.
   * The 912 km reading matters most: it landed in what had been a completely
   * unsampled gap between 219 km and 2895 km, and the curve - fitted without
   * it - predicted 81.6 against the 82 observed.
   *
   * Ten observed rounds across MapTap #803 and #804; nine reproduce exactly.
   *
   * There is no same-country bonus, though this carried one for a while. It
   * was inferred from #803's Urumqi round, which scored 66 at 2895 km where
   * the curve says 57, and a bonus of 8.6 closed that gap precisely. #804
   * refutes it. Dundee scored 99 at 66 km, and 71% of the circle at that
   * radius is UK land even counting a sea tap as no country - so a bonus would
   * almost certainly have made it 100. The same holds for Valparaiso (98 at
   * 105 km), Gothenburg (95 at 219 km) and Liberec (96 at 190 km): all four
   * would have been 100. For the bonus to survive, every one of those four
   * guesses has to have left its own country, which is about a 4% coincidence,
   * while the round that needs the bonus had only a 21% chance of being inside
   * China. Dropping it takes the rounds reproduced exactly from six to nine
   * and makes #804 total 953 on the nose.
   *
   * Urumqi is therefore an outlier with no explanation. Its score is not in
   * doubt - #803's published total of 752 only works if that round scored 66 -
   * so it is the 2895 km reading that would have to be wrong; the curve wants
   * 2029 km for 66. Worth re-reading if that screenshot resurfaces. No curve
   * of this family can pass through it and its neighbours: 912 km -> 82 and
   * 3440 km -> 53 both sit on the curve, and reaching 66 at 2895 km between
   * them needs a local slope 3.6x the steepest this family can be anywhere.
   *
   * Caveat: nothing was observed past 3440 km, so the tail is extrapolation,
   * and an exponent near 1 implies a fat one - a guess on the wrong side of
   * the planet still scores in the teens. One observation from a badly missed
   * round would settle it. tools/fit-score-curve.js refits from more data.
   */
  function baseScore(distanceKm) {
    var v = 100 / (1 + Math.pow(distanceKm / HALF_MARKS_KM, FALLOFF));
    if (v > 100) v = 100;
    return v < 1 ? 0 : Math.round(v);
  }

  /* `guessCC` is the ISO code the tap landed in, or null over open water. */
  function scoreRound(round, guessLat, guessLon, guessCC) {
    var d = MT.geo.distanceKm(round.lat, round.lon, guessLat, guessLon);
    var same = !!guessCC && guessCC === round.cc;   // reported, but not scored
    var base = baseScore(d);
    return {
      distanceKm: d,
      base: base,
      sameCountry: same,
      multiplier: round.multiplier,
      points: base * round.multiplier
    };
  }

  /* Emoji band used in the shared result. */
  /* Bands for the shared result. The curve bottoms out near 16 rather than 0 -
   * an exponent this close to 1 leaves a fat tail - so the thresholds are set
   * against the range that actually occurs, or the darkest square would never
   * be reached. Roughly: green is within 500 km, black is the wrong side of
   * the world. */
  function band(base) {
    if (base >= 90) return 0;
    if (base >= 75) return 1;
    if (base >= 55) return 2;
    if (base >= 35) return 3;
    return 4;
  }

  function grade(total) {
    // Anchored to MapTap's own numbers: its players call anything over 900 a
    // good game, and the observed #803 - two easy rounds nailed, both hard
    // rounds badly missed - scored 752.
    if (total >= 940) return 'Cartographer';
    if (total >= 860) return 'Navigator';
    if (total >= 760) return 'Globetrotter';
    if (total >= 620) return 'Tourist';
    if (total >= 450) return 'Lost luggage';
    return 'Off the map';
  }

  function formatDistance(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    if (km < 10) return km.toFixed(1) + ' km';
    return Math.round(km).toLocaleString() + ' km';
  }

  MT.puzzle = {
    ROUNDS: ROUNDS,
    BULLSEYE_KM: BULLSEYE_KM,
    HALF_MARKS_KM: HALF_MARKS_KM,
    MULTIPLIERS: MULTIPLIERS,
    MAX_SCORE: MAX_SCORE,
    EPOCH: EPOCH,
    band: band,
    baseScore: baseScore,
    countryName: countryName,
    dayNumber: dayNumber,
    formatDistance: formatDistance,
    generate: generate,
    grade: grade,
    msUntilNextDaily: msUntilNextDaily,
    scoreRound: scoreRound,
    todayNumber: todayNumber
  };
})(window.MT = window.MT || {});
