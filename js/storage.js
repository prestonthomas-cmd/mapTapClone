/* Saved results and stats. Falls back to memory when localStorage is blocked
 * (private windows, embedded webviews) so the game still runs. */
(function (MT) {
  'use strict';

  var KEY = 'maptap-clone/v1';
  var memory = null;

  function backend() {
    try {
      var probe = '__mt__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  var store = backend();

  function blank() {
    return { dailies: {}, practiceCount: 0, practiceBest: 0, practiceTotal: 0 };
  }

  function read() {
    if (!store) return (memory = memory || blank());
    try {
      var raw = store.getItem(KEY);
      if (!raw) return blank();
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? Object.assign(blank(), parsed) : blank();
    } catch (e) {
      return blank();
    }
  }

  function write(state) {
    if (!store) { memory = state; return; }
    try { store.setItem(KEY, JSON.stringify(state)); } catch (e) { memory = state; }
  }

  function getDaily(number) {
    return read().dailies[String(number)] || null;
  }

  function saveResult(mode, number, result) {
    var state = read();
    if (mode === 'daily') {
      state.dailies[String(number)] = result;
    } else {
      state.practiceCount++;
      state.practiceTotal += result.total;
      if (result.total > state.practiceBest) state.practiceBest = result.total;
    }
    write(state);
    return state;
  }

  /* Streak counts back from the most recent daily actually played. */
  function stats() {
    var state = read();
    var numbers = Object.keys(state.dailies).map(Number).sort(function (a, b) { return a - b; });
    var played = numbers.length;
    var total = 0, best = 0;
    numbers.forEach(function (n) {
      var d = state.dailies[String(n)];
      total += d.total;
      if (d.total > best) best = d.total;
    });

    var today = MT.puzzle.todayNumber();
    var current = 0;
    if (played) {
      var last = numbers[numbers.length - 1];
      if (last === today || last === today - 1) {
        current = 1;
        for (var i = numbers.length - 2; i >= 0; i--) {
          if (numbers[i] === numbers[i + 1] - 1) current++;
          else break;
        }
      }
    }

    var max = 0, run = 0;
    for (var j = 0; j < numbers.length; j++) {
      run = (j > 0 && numbers[j] === numbers[j - 1] + 1) ? run + 1 : 1;
      if (run > max) max = run;
    }

    return {
      played: played,
      average: played ? Math.round(total / played) : 0,
      best: best,
      currentStreak: current,
      maxStreak: max,
      practiceCount: state.practiceCount,
      practiceBest: state.practiceBest,
      practiceAverage: state.practiceCount ? Math.round(state.practiceTotal / state.practiceCount) : 0
    };
  }

  function reset() { write(blank()); }

  MT.storage = { getDaily: getDaily, saveResult: saveResult, stats: stats, reset: reset, read: read };
})(window.MT = window.MT || {});
