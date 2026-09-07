/* Screen flow, round logic and everything that touches the DOM. */
(function (MT) {
  'use strict';

  var puzzle = MT.puzzle;
  var geo = MT.geo;

  var el = {};
  var globe = null;
  var countdownTimer = null;

  var state = {
    game: null,
    roundIndex: 0,
    results: [],
    pending: null,
    phase: 'menu'      // menu | guessing | revealed | done
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Natural Earth spells some countries formally ("United States of America");
   * the city dataset's names read better in a sentence. */
  function friendlyCountry(cc, fallback) {
    return (window.MT_CITIES.countries[cc]) || fallback || cc;
  }

  var toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2200);
  }

  /* ------------------------------------------------------------------ *
   * Overlay panels
   * ------------------------------------------------------------------ */
  function openPanel(html) {
    el.panel.innerHTML = html;
    el.overlay.hidden = false;
    el.panel.scrollTop = 0;
  }

  function closePanel() {
    el.overlay.hidden = true;
    el.panel.innerHTML = '';
    stopCountdown();
  }

  function stopCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }

  function startCountdown(node) {
    stopCountdown();
    function tick() {
      if (!node.isConnected) { stopCountdown(); return; }
      var ms = puzzle.msUntilNextDaily();
      var h = Math.floor(ms / 3600000);
      var m = Math.floor(ms / 60000) % 60;
      var s = Math.floor(ms / 1000) % 60;
      node.textContent = 'Next daily in ' + h + 'h ' +
        String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ------------------------------------------------------------------ *
   * Start screen
   * ------------------------------------------------------------------ */
  function showStart() {
    state.phase = 'menu';
    var today = puzzle.todayNumber();
    var stats = MT.storage.stats();
    var playedToday = MT.storage.getDaily(today);
    globe.spin = 6;
    globe.clearOverlays();
    globe.lookAt(10, 18, 1);
    el.prompt.hidden = true;
    el.actionbar.hidden = true;
    el.roundSheet.hidden = true;
    setRunningScore(0);
    setRunningMax(puzzle.MAX_SCORE);
    setGameChip('Daily #' + today);

    openPanel(
      '<h2>MapTap Clone</h2>' +
      '<p class="panel__sub">Five cities. One globe. Tap as close as you can.</p>' +
      (stats.played || stats.practiceCount
        ? '<div class="statgrid">' +
            '<div><b>' + stats.played + '</b><span>DAILIES</span></div>' +
            '<div><b>' + stats.average + '</b><span>AVG</span></div>' +
            '<div><b>' + stats.best + '</b><span>BEST</span></div>' +
            '<div><b>' + stats.currentStreak + '</b><span>STREAK</span></div>' +
          '</div>'
        : '') +
      '<div class="panel__actions">' +
        '<button class="btn btn--primary" data-act="daily">' +
          (playedToday ? 'See today’s result — Daily #' + today
                       : 'Play Daily #' + today) + '</button>' +
        '<button class="btn" data-act="practice-random">Practice — random game</button>' +
        '<button class="btn" data-act="continents">Practice a continent</button>' +
        '<button class="btn btn--ghost" data-act="choose">Play a specific game number</button>' +
        '<button class="btn btn--ghost" data-act="help">How to play</button>' +
      '</div>'
    );
  }

  function showHelp(backToMenu) {
    openPanel(
      '<h2>How to play</h2>' +
      '<ol>' +
        '<li>You get <strong>five cities</strong>, one at a time. Each is harder than the last.</li>' +
        '<li>Drag to spin the globe, scroll or pinch to zoom, then <strong>tap where you think it is</strong>.</li>' +
        '<li>Lock in your guess. The closer you are, the more of the <strong>100 points</strong> you keep.</li>' +
        '<li>Later rounds are worth more: <strong>×1, ×1, ×2, ×3, ×3</strong> — a perfect game is <strong>1000</strong>.</li>' +
      '</ol>' +
      '<h3>Scoring</h3>' +
      '<p>Being a little wrong costs almost nothing. Being in the wrong part ' +
        'of the world costs everything.</p>' +
      '<ul>' +
        '<li>Within 100 km — <strong>98</strong> or better</li>' +
        '<li>500 km — <strong>90</strong></li>' +
        '<li>1000 km — <strong>81</strong></li>' +
        '<li>2000 km — <strong>67</strong></li>' +
        '<li>3867 km — half marks, <strong>50</strong></li>' +
        '<li>Wrong side of the world — the mid teens</li>' +
      '</ul>' +
      '<p>Fitted to MapTap\u2019s own reported scores, so a round here is worth ' +
        'what the same guess is worth there.</p>' +
      '<h3>Continents</h3>' +
      '<p><strong>Practice a continent</strong> runs every UN member state in it — ' +
        'all 54 of Africa, 46 of Asia — one at a time, in a shuffled order. ' +
        'These ask for a country rather than a city, so tapping anywhere inside it ' +
        'scores a full 100; miss and you are scored on how far outside its border ' +
        'you landed. Every country is worth the same.</p>' +
      '<h3>Daily and practice</h3>' +
      '<p>Every game has a number. <strong>Daily #' + puzzle.todayNumber() + '</strong> is the same for ' +
        'everyone today, so scores are comparable. <strong>Practice</strong> games are numbered separately ' +
        'and never run out — share a practice number with a friend and you both get exactly the same five cities.</p>' +
      '<h3>Credits</h3>' +
      '<p>Satellite imagery: ' +
        '<a href="https://visibleearth.nasa.gov/collection/1484/blue-marble" target="_blank" rel="noopener">' +
        'Blue Marble Next Generation</a> with topography and bathymetry, ' +
        'NASA Earth Observatory. Coastlines from Natural Earth; ' +
        'city locations from GeoNames.</p>' +
      '<p>Not affiliated with MapTap.</p>' +
      '<div class="panel__actions">' +
        '<button class="btn btn--primary" data-act="' + (backToMenu ? 'menu' : 'close') + '">Got it</button>' +
      '</div>'
    );
  }

  function showStats() {
    var s = MT.storage.stats();
    openPanel(
      '<h2>Stats</h2>' +
      '<h3>Daily</h3>' +
      '<div class="statgrid">' +
        '<div><b>' + s.played + '</b><span>PLAYED</span></div>' +
        '<div><b>' + s.average + '</b><span>AVERAGE</span></div>' +
        '<div><b>' + s.best + '</b><span>BEST</span></div>' +
        '<div><b>' + s.currentStreak + '</b><span>STREAK</span></div>' +
      '</div>' +
      '<h3>Practice</h3>' +
      '<div class="statgrid">' +
        '<div><b>' + s.practiceCount + '</b><span>PLAYED</span></div>' +
        '<div><b>' + s.practiceAverage + '</b><span>AVERAGE</span></div>' +
        '<div><b>' + s.practiceBest + '</b><span>BEST</span></div>' +
        '<div><b>' + s.maxStreak + '</b><span>MAX STREAK</span></div>' +
      '</div>' +
      '<div class="panel__actions">' +
        '<button class="btn btn--primary" data-act="close">Close</button>' +
        '<button class="btn btn--ghost" data-act="reset-stats">Reset all stats</button>' +
      '</div>'
    );
  }

  /* One run per continent, every UN member of it, in a shuffled order. */
  function showContinents() {
    var buttons = puzzle.continents().map(function (name) {
      var n = puzzle.continentCountries(name).length;
      return '<button class="btn" data-act="continent:' + esc(name) + '">' +
             esc(name) + '<small> · ' + n + ' countries</small></button>';
    }).join('');
    openPanel(
      '<h2>Practice a continent</h2>' +
      '<p class="panel__sub">Every country in it, one at a time. Tap inside the ' +
        'country to score full marks; otherwise you are scored on how far outside ' +
        'it you landed.</p>' +
      '<div class="panel__actions">' + buttons +
        '<button class="btn btn--ghost" data-act="' + (state.game ? 'close' : 'menu') + '">Back</button>' +
      '</div>'
    );
  }

  function showChooser() {
    var today = puzzle.todayNumber();
    openPanel(
      '<h2>Pick a game</h2>' +
      '<p class="panel__sub">Every game number always produces the same five cities — ' +
        'send a friend the number and you are playing the same puzzle.</p>' +
      '<div class="panel__actions">' +
        '<button class="btn btn--primary" data-act="daily">Today — Daily #' + today + '</button>' +
        '<button class="btn" data-act="practice-random">Random practice game</button>' +
      '</div>' +
      '<h3>Jump to a number</h3>' +
      '<div class="field">' +
        '<input id="gotoNumber" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 4821">' +
        '<button class="btn" data-act="goto-practice">Practice</button>' +
        '<button class="btn" data-act="goto-daily">Daily</button>' +
      '</div>' +
      '<p style="font-size:12.5px;margin-top:10px">Daily numbers run from 1 to ' + today +
        '. Practice numbers are unlimited and never spoil a daily.</p>' +
      '<div class="panel__actions">' +
        '<button class="btn btn--ghost" data-act="' + (state.game ? 'close' : 'menu') + '">Back</button>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------------ *
   * Game flow
   * ------------------------------------------------------------------ */
  function setGameChip(text) { el.gameChip.textContent = text; }

  function setRunningScore(v) { el.runningScore.textContent = v; }

  /* A continent run is out of 100 a country, so the scoreboard cannot assume
   * the daily's 1000. */
  function setRunningMax(max) {
    if (el.runningMax) el.runningMax.textContent = '/ ' + (max || puzzle.MAX_SCORE);
  }

  function roundCount() {
    return state.game ? state.game.rounds.length : puzzle.ROUNDS;
  }

  function totalSoFar() {
    return state.results.reduce(function (sum, r) { return sum + r.points; }, 0);
  }

  function startContinent(name, number) {
    closePanel();
    if (!Number.isFinite(number)) number = randomPracticeNumber();
    state.game = puzzle.generateContinent(name, number);
    if (!state.game.rounds.length) { toast('No countries for ' + name); showStart(); return; }
    state.roundIndex = 0;
    state.results = [];
    state.pending = null;
    globe.spin = 0;
    setGameChip(name + ' — ' + state.game.rounds.length);
    setRunningScore(0);
    setRunningMax(puzzle.maxScore(state.game));
    writeUrl('continent', name + '.' + number);
    beginRound();
  }

  function startGame(mode, number) {
    closePanel();
    var played = mode === 'daily' ? MT.storage.getDaily(number) : null;

    state.game = puzzle.generate(mode, number);
    state.roundIndex = 0;
    state.results = [];
    state.pending = null;
    globe.spin = 0;
    setGameChip(MT.share.gameLabel(mode, number));
    setRunningScore(0);
    setRunningMax(puzzle.maxScore(state.game));
    writeUrl(mode, number);

    if (played) {
      // A daily is played once; opening it again just shows what happened.
      state.results = played.rounds.map(function (r, i) {
        return {
          base: r.base,
          multiplier: state.game.rounds[i].multiplier,
          points: r.base * state.game.rounds[i].multiplier,
          distanceKm: r.distanceKm,
          guess: r.guess
        };
      });
      setRunningScore(totalSoFar());
      showSummary(true);
      return;
    }

    beginRound();
  }

  function beginRound() {
    state.phase = 'guessing';
    state.pending = null;
    var round = state.game.rounds[state.roundIndex];

    globe.clearOverlays();
    // Each round opens on a neutral, seeded view so nobody starts the round
    // already looking at the answer, and everyone starts from the same place.
    var spin = MT.rng.create('view|' + state.game.mode + '|' + state.game.number + '|' + state.roundIndex);
    globe.lookAt(geo.wrapLon(spin() * 360 - 180), 12, 1);

    el.roundSheet.hidden = true;
    el.prompt.hidden = false;
    el.actionbar.hidden = false;
    el.promptRound.textContent = 'Round ' + (state.roundIndex + 1) + ' of ' + roundCount();
    // Every country in a continent run is worth the same, so there is no
    // multiplier to show.
    el.promptMult.hidden = round.multiplier === 1 && state.game.mode === 'continent';
    el.promptMult.textContent = '×' + round.multiplier;
    el.promptCity.textContent = round.city;
    el.promptCountry.textContent = round.kind === 'country'
      ? round.country
      : friendlyCountry(round.cc, round.country);
    el.actionHint.textContent = round.kind === 'country'
      ? 'Tap the globe inside this country'
      : 'Tap the globe where you think it is';
    el.btnSubmit.disabled = true;

    // Re-trigger the drop-in animation.
    el.prompt.style.animation = 'none';
    void el.prompt.offsetWidth;
    el.prompt.style.animation = '';
  }

  function onTap(lon, lat) {
    if (state.phase !== 'guessing') return;
    state.pending = [lon, lat];
    globe.setPin(lon, lat);
    el.btnSubmit.disabled = false;
    el.actionHint.textContent = 'Tap again to move it, or lock it in';
  }

  function submitGuess() {
    if (state.phase !== 'guessing' || !state.pending) return;
    state.phase = 'revealed';

    var round = state.game.rounds[state.roundIndex];
    var guess = state.pending;
    // Where the tap landed, for the result line. It does not affect the
    // score - see the scoring note in puzzle.js.
    var where = MT.world.countryAt(guess[0], guess[1]);
    var scored = puzzle.scoreRound(round, guess[1], guess[0], where && where.cc);
    scored.guess = guess;
    scored.where = where;
    state.results.push(scored);
    setRunningScore(totalSoFar());

    el.actionbar.hidden = true;
    el.prompt.hidden = true;
    globe.showResult(guess, [round.lon, round.lat], round.city);
    globe.frameBoth(guess, [round.lon, round.lat], 950);

    el.resultCity.textContent = round.city;
    el.resultCountry.textContent = round.kind === 'country'
      ? round.country
      : friendlyCountry(round.cc, round.country);
    el.resultPoints.textContent = '+' + scored.points;
    el.resultBreakdown.textContent = scored.multiplier > 1
      ? scored.base + ' × ' + scored.multiplier
      : scored.base + ' / 100';
    el.resultDistance.innerHTML = describeMiss(guess, round, scored);
    el.btnNext.textContent = state.roundIndex === roundCount() - 1 ? 'See results' : 'Next round';
    el.roundSheet.hidden = false;
  }

  function describeMiss(guess, round, scored) {
    // A country round is scored against the whole country, so the distance is
    // to its border and zero means the tap was inside it.
    if (round.kind === 'country') {
      if (scored.distanceKm === 0) {
        return 'Inside <strong>' + esc(round.city) + '</strong>.';
      }
      var toward = geo.compassPoint(geo.bearing(round.lat, round.lon, guess[1], guess[0]));
      return 'You tapped ' + toward + ' of it — <strong>' +
             esc(puzzle.formatDistance(scored.distanceKm)) + '</strong> from the ' +
             esc(round.city) + ' border.';
    }
    if (scored.distanceKm <= puzzle.BULLSEYE_KM) {
      return 'Bullseye — <strong>' + esc(puzzle.formatDistance(scored.distanceKm)) + '</strong> away.';
    }
    var dir = geo.compassPoint(geo.bearing(round.lat, round.lon, guess[1], guess[0]));
    var where = scored.where;
    var place = where
      ? (where.offshore ? 'just off the coast of ' : 'in ') + esc(friendlyCountry(where.cc, where.name))
      : 'in open water';
    return 'You tapped ' + place + ' — <strong>' +
           esc(puzzle.formatDistance(scored.distanceKm)) + '</strong> ' + dir + ' of ' +
           esc(round.city) + '.';
  }

  function nextRound() {
    el.roundSheet.hidden = true;
    if (state.roundIndex < roundCount() - 1) {
      state.roundIndex++;
      beginRound();
      return;
    }
    finishGame();
  }

  function finishGame() {
    state.phase = 'done';
    var record = {
      total: totalSoFar(),
      playedAt: Date.now(),
      rounds: state.results.map(function (r) {
        return { base: r.base, distanceKm: Math.round(r.distanceKm), guess: r.guess };
      })
    };
    // Continent runs are deliberately not recorded. The stats panel averages
    // scores out of 1000, and a 54-country run out of 5400 would land in the
    // practice best and average and make both meaningless.
    if (state.game.mode !== 'continent' &&
        !(state.game.mode === 'daily' && MT.storage.getDaily(state.game.number))) {
      MT.storage.saveResult(state.game.mode, state.game.number, record);
    }
    showSummary(false);
  }

  function showSummary(replay) {
    var total = totalSoFar();
    var max = puzzle.maxScore(state.game);
    var isDaily = state.game.mode === 'daily';
    var squares = state.results.map(function (r) { return MT.share.SQUARES[puzzle.band(r.base)]; }).join('');

    var rows = state.results.map(function (r, i) {
      var round = state.game.rounds[i];
      return '<div class="breakdown__row">' +
        '<span class="breakdown__sq">' + MT.share.SQUARES[puzzle.band(r.base)] + '</span>' +
        '<span class="breakdown__city">' + esc(round.city) +
          '<small>' + esc(round.kind === 'country'
              ? round.country
              : friendlyCountry(round.cc, round.country)) + '</small></span>' +
        '<span class="breakdown__km">' + esc(puzzle.formatDistance(r.distanceKm)) + '</span>' +
        '<span class="breakdown__pts">' + r.points + '</span>' +
      '</div>';
    }).join('');

    openPanel(
      '<h2>' + esc(MT.share.gameLabel(state.game.mode, state.game.number, state.game)) + '</h2>' +
      (replay ? '<p class="panel__sub">You have already played this one.</p>' : '') +
      '<div class="total"><span class="total__value">' + total + '</span>' +
        '<span class="total__max">/ ' + max + '</span></div>' +
      '<div class="total__grade">' + esc(puzzle.grade(total, max)) + '</div>' +
      '<div class="squares">' + squares + '</div>' +
      '<div class="breakdown">' + rows + '</div>' +
      '<div class="panel__actions">' +
        '<button class="btn btn--primary" data-act="share">Copy result</button>' +
        '<button class="btn" data-act="practice-random">Play another — random practice</button>' +
        (isDaily ? '' : '<button class="btn btn--ghost" data-act="daily">Today’s daily</button>') +
        '<button class="btn btn--ghost" data-act="choose">Pick a game number</button>' +
        '<button class="btn btn--ghost" data-act="menu">Main menu</button>' +
      '</div>' +
      (isDaily ? '<div class="countdown" id="countdown"></div>' : '')
    );

    var cd = $('countdown');
    if (cd) startCountdown(cd);
  }

  /* ------------------------------------------------------------------ *
   * URL handling
   * ------------------------------------------------------------------ */
  function writeUrl(mode, number) {
    if (!window.history || !history.replaceState) return;
    var key = mode === 'daily' ? 'd=' : (mode === 'continent' ? 'c=' : 'p=');
    var q = '?' + key + encodeURIComponent(number);
    try { history.replaceState(null, '', location.pathname + q); } catch (e) { /* file:// */ }
  }

  function readUrl() {
    var params = new URLSearchParams(location.search);
    var d = parseInt(params.get('d'), 10);
    var p = parseInt(params.get('p'), 10);
    if (Number.isFinite(d) && d >= 1) {
      return { mode: 'daily', number: Math.min(d, puzzle.todayNumber()) };
    }
    if (Number.isFinite(p) && p >= 1) return { mode: 'practice', number: p };
    // A continent run is "<continent>.<number>", so a shared link reopens the
    // same continent in the same order.
    var c = params.get('c');
    if (c) {
      var dot = c.lastIndexOf('.');
      var name = dot > 0 ? c.slice(0, dot) : c;
      var n = dot > 0 ? parseInt(c.slice(dot + 1), 10) : 1;
      if (puzzle.continentCountries(name).length) {
        return { mode: 'continent', continent: name, number: Number.isFinite(n) ? n : 1 };
      }
    }
    return null;
  }

  function randomPracticeNumber() {
    return 1 + Math.floor(Math.random() * 900000);
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */
  function handleAction(act) {
    if (act.indexOf('continent:') === 0) { startContinent(act.slice(10)); return; }
    switch (act) {
      case 'daily': startGame('daily', puzzle.todayNumber()); break;
      case 'practice-random': startGame('practice', randomPracticeNumber()); break;
      case 'choose': showChooser(); break;
      case 'continents': showContinents(); break;
      case 'help': showHelp(true); break;
      case 'menu': showStart(); break;
      case 'close':
        if (state.game && state.phase !== 'menu') closePanel();
        else showStart();
        break;
      case 'share': doShare(); break;
      case 'reset-stats':
        MT.storage.reset();
        toast('Stats cleared');
        showStats();
        break;
      case 'goto-daily':
      case 'goto-practice': {
        var input = $('gotoNumber');
        var n = parseInt(input && input.value, 10);
        if (!Number.isFinite(n) || n < 1) { toast('Enter a game number'); return; }
        if (act === 'goto-daily') {
          var today = puzzle.todayNumber();
          if (n > today) { toast('Daily #' + n + ' has not happened yet'); return; }
          startGame('daily', n);
        } else {
          startGame('practice', n);
        }
        break;
      }
    }
  }

  function doShare() {
    var text = MT.share.buildText(state.game, state.results);
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () { copyFallback(text); });
      return;
    }
    copyFallback(text);
  }

  function copyFallback(text) {
    MT.share.copy(text).then(function () {
      toast('Result copied');
    }, function () {
      window.prompt('Copy your result:', text);
    });
  }

  function init() {
    ['gameChip', 'runningScore', 'runningMax', 'btnStats', 'btnHelp', 'prompt', 'promptRound', 'promptMult',
     'promptCity', 'promptCountry', 'actionbar', 'actionHint', 'btnSubmit', 'roundSheet',
     'resultCity', 'resultCountry', 'resultPoints', 'resultBreakdown', 'resultDistance',
     'btnNext', 'overlay', 'panel', 'toast', 'btnZoomIn', 'btnZoomOut', 'btnReset']
      .forEach(function (id) { el[id] = $(id); });

    globe = new MT.Globe($('globe'), {
      onTap: onTap,
      glCanvas: $('globeGL'),
      // Generated by tools/build-textures.js: smallest plate first, so a
      // picture appears immediately and sharpens as the larger ones arrive.
      textures: window.MT_PLATES || [],
      // Generated by tools/build-tiles.js: detail beyond what one plate can
      // hold, fetched only for the part of the globe actually on screen.
      tiles: window.MT_TILES || null
    });
    MT.world.load();
    globe.requestRender();

    window.addEventListener('resize', function () { globe.resize(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { globe.resize(); }, 180);
    });

    el.btnSubmit.addEventListener('click', submitGuess);
    el.btnNext.addEventListener('click', nextRound);
    el.btnHelp.addEventListener('click', function () { showHelp(state.phase === 'menu'); });
    el.btnStats.addEventListener('click', showStats);
    el.gameChip.addEventListener('click', showChooser);

    el.btnZoomIn.addEventListener('click', function () {
      globe.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.7);
    });
    el.btnZoomOut.addEventListener('click', function () {
      globe.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.7);
    });
    el.btnReset.addEventListener('click', function () { globe.flyTo(globe.camera.centreLon, 12, 1, 420); });

    el.panel.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (btn) handleAction(btn.getAttribute('data-act'));
    });

    el.overlay.addEventListener('click', function (e) {
      // Click-outside closes only when there is a game to go back to.
      if (e.target === el.overlay && state.game && state.phase !== 'menu' && state.phase !== 'done') {
        closePanel();
      }
    });

    el.panel.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id === 'gotoNumber') {
        e.preventDefault();
        handleAction('goto-practice');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.overlay.hidden &&
          state.game && state.phase !== 'menu' && state.phase !== 'done') {
        closePanel();
      }
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'Enter') {
        if (state.phase === 'guessing' && !el.btnSubmit.disabled) submitGuess();
        else if (state.phase === 'revealed') nextRound();
      }
      if (e.key === '+' || e.key === '=') globe.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.5);
      if (e.key === '-' || e.key === '_') globe.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.5);
    });

    var fromUrl = readUrl();
    if (fromUrl && fromUrl.mode === 'continent') startContinent(fromUrl.continent, fromUrl.number);
    else if (fromUrl) startGame(fromUrl.mode, fromUrl.number);
    else showStart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.MT = window.MT || {});
