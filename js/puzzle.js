/* Game numbering, puzzle generation and scoring. */
(function (MT) {
  'use strict';

  var ROUNDS = 5;
  var MULTIPLIERS = [1, 1, 2, 3, 3];        // sums to 10 -> 1000 points a game
  var MAX_SCORE = 1000;
  var HALF_MARKS_KM = 1500;                 // the distance worth exactly 50
  var FALLOFF = 1.6;                        // >1 keeps near misses cheap
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
      tiers[c[4] - 1].push({ name: c[0], cc: c[1], lat: c[2], lon: c[3], tier: c[4] });
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
        for (var j = 0; j < chosen.length; j++) {
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
   *     score = 100 / (1 + (km / 1500) ^ 1.6)
   *
   * A plain exponential decay reads wrong to players: it punishes a near miss
   * about as steeply as a wild one, so landing in the right city still costs
   * you marks while landing on the wrong continent is oddly well paid. This
   * curve is deliberately flat near zero and steepest through the middle,
   * which matches how people actually judge a guess:
   *
   *   right city   (<50 km)     100      you found it
   *   right region (~250 km)     95
   *   right country(~500 km)     85
   *   half marks   (1500 km)     50
   *   right continent (~3000)    25
   *   wrong continent (8000+)     6      and fading to nothing
   *
   * It also puts a strong game in the 900s, which is where MapTap's own
   * players describe a good score sitting.
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
    var pct = total / MAX_SCORE;
    if (pct >= 0.92) return 'Cartographer';
    if (pct >= 0.80) return 'Navigator';
    if (pct >= 0.65) return 'Globetrotter';
    if (pct >= 0.48) return 'Tourist';
    if (pct >= 0.30) return 'Lost luggage';
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
