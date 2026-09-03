/* Game numbering, puzzle generation and scoring. */
(function (MT) {
  'use strict';

  var ROUNDS = 5;
  var MULTIPLIERS = [1, 1, 2, 3, 3];        // sums to 10 -> 1000 points a game
  var MAX_SCORE = 1000;
  var HALF_MARKS_KM = 2000;                 // the distance worth exactly 50
  var FALLOFF = 2;                          // squared: a plateau, then a fall
  var BULLSEYE_KM = 50;                     // found the city, take the 100

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
   *     score = 100 / (1 + (km / 2000) ^ 2)
   *
   * Squaring gives a plateau rather than a slope: being a little wrong should
   * cost almost nothing, because on a globe "a little wrong" still means you
   * knew where the place was. Landing in the right country is a couple of
   * points, not a fifth of the round. The fall comes later, once the guess is
   * genuinely in the wrong part of the world.
   *
   *   right city    (<50 km)     100
   *   250 km                      98      still the right area
   *   500 km                      94      right country
   *   1000 km                     80
   *   2000 km                     50      half marks
   *   3000 km                     31
   *   5000 km                     14
   *   8000 km+                     6      wrong part of the planet
   *
   * The half-marks distance is the one number worth arguing about, and it is
   * calibrated rather than chosen: MapTap's own players describe anything over
   * 900 as a good game, so a strong game here should approach 900 without
   * sailing past it. At 2000 km it lands on 893. tools/fit-score-curve.js
   * refits both constants from real observed (distance, points) pairs.
   */
  function baseScore(distanceKm) {
    if (distanceKm <= BULLSEYE_KM) return 100;
    var v = 100 / (1 + Math.pow(distanceKm / HALF_MARKS_KM, FALLOFF));
    return v < 1 ? 0 : Math.round(v);
  }

  function scoreRound(round, guessLat, guessLon) {
    var d = MT.geo.distanceKm(round.lat, round.lon, guessLat, guessLon);
    var base = baseScore(d);
    return {
      distanceKm: d,
      base: base,
      multiplier: round.multiplier,
      points: base * round.multiplier
    };
  }

  /* Emoji band used in the shared result. */
  function band(base) {
    if (base >= 90) return 0;
    if (base >= 70) return 1;
    if (base >= 40) return 2;
    if (base >= 15) return 3;
    return 4;
  }

  function grade(total) {
    if (total >= 920) return 'Cartographer';
    if (total >= 830) return 'Navigator';
    if (total >= 690) return 'Globetrotter';
    if (total >= 520) return 'Tourist';
    if (total >= 330) return 'Lost luggage';
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
