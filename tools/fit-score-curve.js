#!/usr/bin/env node
/*
 * Fits the scoring curve to observations from MapTap itself.
 *
 * MapTap reports, after every guess, a distance in kilometres and a score as a
 * percentage. That percentage is the 0-100 round score before the round
 * multiplier - confirmed against game #803, whose five rounds reconstruct its
 * published total of 752 exactly under multipliers 1,1,2,3,3. So the numbers
 * can be read straight off the screen, no multiplier arithmetic needed.
 *
 * Usage:
 *   node tools/fit-score-curve.js 13:100:same 219:95 6:100:same 3440:53 2895:66:same
 *
 * Each argument is <kilometres>:<percent>, with ":same" appended when the guess
 * landed inside the answer's own country. That flag matters: MapTap awards a
 * same-country bonus, and without it no distance curve can fit - four families
 * were tried and every one of them missed 219 km -> 95 by five points. With it,
 * game #803 is reproduced to a tenth of a point.
 *
 * Four families are fitted and ranked, because if the real curve is not the
 * shape assumed here the residuals should say so rather than be absorbed.
 */
const obs = process.argv.slice(2).map((arg) => {
  const m = arg.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)%?(:same)?$/);
  if (!m) {
    console.error(`Cannot read "${arg}". Expected <km>:<percent>[:same], e.g. 2895:66:same`);
    process.exit(1);
  }
  return { km: Number(m[1]), score: Number(m[2]), same: !!m[3] };
});

if (obs.length < 3) {
  console.error('Need at least three observations; more, and spread out, is much better.');
  process.exit(1);
}

const FAMILIES = [
  { name: 'rational   100 / (1 + (km/K)^p)', f: (d, K, p) => 100 / (1 + Math.pow(d / K, p)) },
  { name: 'stretched  100 * exp(-(km/K)^p)', f: (d, K, p) => 100 * Math.exp(-Math.pow(d / K, p)) },
  { name: 'bounded    100 * (1 - (km/K)^p)', f: (d, K, p) => 100 * Math.max(0, 1 - Math.pow(d / K, p)) },
  { name: 'offset     100 - (km/K)^p',       f: (d, K, p) => Math.max(0, 100 - Math.pow(d / K, p)) },
];

const anySame = obs.some((o) => o.same);
const results = FAMILIES.map(({ name, f }) => {
  let best = null;
  for (let K = 50; K <= 40000; K *= 1.01) {
    for (let p = 0.3; p <= 5; p += 0.01) {
      for (let B = 0; B <= (anySame ? 25 : 0); B += 0.5) {
        let err = 0;
        for (const o of obs) {
          const v = Math.min(100, f(o.km, K, p) + (o.same ? B : 0));
          err += (v - o.score) * (v - o.score);
        }
        if (!best || err < best.err) best = { K, p, B, err };
      }
    }
  }
  return { name, f, ...best, rms: Math.sqrt(best.err / obs.length) };
}).sort((a, b) => a.rms - b.rms);

console.log('\nfamily                          K       p    bonus     RMS');
for (const r of results) {
  console.log('  ' + r.name.padEnd(30) + r.K.toFixed(0).padStart(6) + '  ' +
              r.p.toFixed(2).padStart(5) + '  ' + r.B.toFixed(1).padStart(6) + '  ' +
              r.rms.toFixed(2).padStart(6));
}

const top = results[0];
console.log(`\nBest: score = ` +
  (top.name.startsWith('rational') ? `100 / (1 + (km / ${top.K.toFixed(0)}) ^ ${top.p.toFixed(2)})` : top.name));
console.log('\n     km   same?   observed   fitted    diff');
for (const o of obs) {
  const v = Math.min(100, top.f(o.km, top.K, top.p) + (o.same ? top.B : 0));
  console.log('  ' + String(o.km).padStart(6) + '   ' + (o.same ? 'yes ' : 'no  ') + '   ' +
              o.score.toFixed(0).padStart(7) + '   ' + v.toFixed(0).padStart(6) + '   ' +
              (v - o.score).toFixed(1).padStart(6));
}

// Unsampled span matters more than unsampled ratio: it is the middle of the
// curve, where the families disagree most, that needs observations.
const gaps = obs.map((o) => o.km).sort((a, b) => a - b);
let widest = 0, lo = 0;
for (let i = 1; i < gaps.length; i++) {
  if (gaps[i] - gaps[i - 1] > widest) { widest = gaps[i] - gaps[i - 1]; lo = i; }
}
if (widest > 800) {
  console.log(`\nNothing observed between ${gaps[lo - 1]} km and ${gaps[lo]} km - the curve through`);
  console.log('that range is interpolation. Observations in the gap would be worth more');
  console.log('than more of the same at the ends.');
}
if (top.rms > 3) {
  console.log('\nRMS above 3 points: either an observation is mistyped, or the real curve is');
  console.log('not this shape. Check which observation carries the large residual above.');
}
console.log('\nTo adopt: set HALF_MARKS_KM, FALLOFF and SAME_COUNTRY_BONUS in js/puzzle.js.');
