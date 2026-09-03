/* Game numbering, puzzle generation and scoring. */
(function (MT) {
  'use strict';

  var ROUNDS = 5;
  var MULTIPLIERS = [1, 1, 2, 3, 3];        // sums to 10 -> 1000 points a game
  var MAX_SCORE = 1000;
  var HALF_MARKS_KM = 3865;                 // the distance worth exactly 50
  var FALLOFF = 1.03;                       // very close to a plain 1/(1+d/K)
  var SAME_COUNTRY_BONUS = 8.6;             // for landing in the right country
  // Display only: the fitted curve plus the same-country bonus already gives a
  // clean 100 for a close guess, so this just decides the wording.
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
   *     score = 100 / (1 + (km / 3865) ^ 1.03)      + 8.6 if the guess landed
   *                                                   in the right country
   *
   * Fitted to MapTap, not chosen. Game #803 reported 13 km -> 100%,
   * 219 km -> 95%, 6 km -> 100%, 3440 km -> 53%, 2895 km -> 66%, totalling 752.
   *
   * No pure distance curve explains that set. Four families were tried and all
   * four reproduce the far points while predicting 99 or 100 at 219 km, where
   * MapTap gave 95 - a stubborn five-point miss. A same-country bonus explains
   * it, and the geography agrees: Copenhagen is 229 km from Gothenburg and
   * Kristiansand 239 km, so a 219 km miss lands abroad and forfeits the bonus,
   * while 2895 km from Urumqi is still comfortably inside China (Beijing is
   * 2411 km, Shanghai 3268 km) and keeps it.
   *
   * The data confirms this rather than merely tolerating it. Fitting all four
   * assignments of the two uncertain flags, only those putting the Urumqi
   * guess inside China fit at all: RMS 0.03 against 2.23 for the alternatives.
   * With the bonus every observation is reproduced to a tenth of a point.
   *
   *   right country, any distance  +8.6
   *   within 500 km                 100
   *   1000 km                        79
   *   2000 km                        66
   *   3865 km                        50      half marks
   *   8000 km                        33
   *
   * The exponent sitting on 1.03 means the underlying shape is essentially
   * 100 * K / (K + km), which is the kind of thing someone actually writes.
   *
   * Caveat: nothing was observed past 3440 km, so the tail is extrapolation,
   * and an exponent near 1 implies a fat one - a guess on the wrong side of
   * the planet still scores in the teens. One observation from a badly missed
   * round would settle it. tools/fit-score-curve.js refits from more data.
   */
  function baseScore(distanceKm, sameCountry) {
    var v = 100 / (1 + Math.pow(distanceKm / HALF_MARKS_KM, FALLOFF));
    if (sameCountry) v += SAME_COUNTRY_BONUS;
    if (v > 100) v = 100;
    return v < 1 ? 0 : Math.round(v);
  }

  /* `guessCC` is the ISO code the tap landed in, or null over open water. */
  function scoreRound(round, guessLat, guessLon, guessCC) {
    var d = MT.geo.distanceKm(round.lat, round.lon, guessLat, guessLon);
    var same = !!guessCC && guessCC === round.cc;
    var base = baseScore(d, same);
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
    SAME_COUNTRY_BONUS: SAME_COUNTRY_BONUS,
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
