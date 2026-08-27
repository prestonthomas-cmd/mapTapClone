/* Builds the copy-and-paste result block. */
(function (MT) {
  'use strict';

  var SQUARES = ['🟩', '🟨', '🟧', '🟥', '⬛'];

  function gameLabel(mode, number) {
    return (mode === 'daily' ? 'Daily #' : 'Practice #') + number;
  }

  /* Empty when the page was opened from the filesystem - a bare "?p=12" in a
   * shared message would be no use to anyone. */
  function linkFor(mode, number) {
    if (location.protocol === 'file:') return '';
    if (!location.origin || location.origin === 'null') return '';
    return location.origin + location.pathname +
           '?' + (mode === 'daily' ? 'd=' : 'p=') + number;
  }

  function buildText(game, results) {
    var total = results.reduce(function (s, r) { return s + r.points; }, 0);
    var squares = results.map(function (r) { return SQUARES[MT.puzzle.band(r.base)]; }).join('');
    var lines = [
      'MapTap Clone — ' + gameLabel(game.mode, game.number),
      total + '/' + MT.puzzle.MAX_SCORE + '  ' + MT.puzzle.grade(total),
      squares
    ];
    var link = linkFor(game.mode, game.number);
    if (link) lines.push(link);
    return lines.join('\n');
  }

  /* Clipboard API needs a secure context; fall back to a hidden textarea. */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  MT.share = { SQUARES: SQUARES, buildText: buildText, copy: copy, gameLabel: gameLabel, linkFor: linkFor };
})(window.MT = window.MT || {});
