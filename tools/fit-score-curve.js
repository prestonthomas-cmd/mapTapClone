#!/usr/bin/env node
/*
 * Fits the scoring curve to real observations from MapTap.
 *
 * The shape is assumed to be
 *
 *     score = 100 / (1 + (km / K) ^ p)
 *
 * and this searches K and p for the pair that best reproduces what MapTap
 * actually awarded. Two constants means a handful of observations pins it;
 * eight or ten spread from a near miss to a wrong continent pins it well.
 *
 * Usage:
 *   node tools/fit-score-curve.js 120:97 480:88 1350:52 3100:19 7400:4
 *
 * Each argument is <kilometres>:<points>. MapTap shows both after every guess.
 * Points must be the 0-100 round score, so rounds 1 and 2 can be read straight
 * off; for a multiplied round append the multiplier and it is divided out:
 *
 *   node tools/fit-score-curve.js 900:132x2 2600:66x3
 */
const obs = process.argv.slice(2).map((arg) => {
  const m = arg.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)(?:[xX](\d+))?$/);
  if (!m) {
    console.error(`Cannot read "${arg}". Expected <km>:<points> or <km>:<points>x<multiplier>.`);
    process.exit(1);
  }
  return { km: Number(m[1]), score: Number(m[2]) / (m[3] ? Number(m[3]) : 1) };
});

if (obs.length < 3) {
  console.error('Need at least three observations; five or more spread across the range is better.');
  process.exit(1);
}

const model = (km, K, p) => 100 / (1 + Math.pow(km / K, p));

let best = null;
for (let K = 200; K <= 12000; K += 10) {
  for (let p = 0.6; p <= 4.0; p += 0.01) {
    let err = 0;
    for (const o of obs) {
      const d = model(o.km, K, p) - o.score;
      err += d * d;
    }
    if (!best || err < best.err) best = { K, p, err };
  }
}

const rms = Math.sqrt(best.err / obs.length);
console.log(`\nBest fit:  score = 100 / (1 + (km / ${best.K}) ^ ${best.p.toFixed(2)})`);
console.log(`RMS error: ${rms.toFixed(2)} points over ${obs.length} observations\n`);
console.log('  km      observed   fitted   diff');
for (const o of obs) {
  const f = model(o.km, best.K, best.p);
  console.log('  ' + String(o.km).padStart(6) + '   ' + o.score.toFixed(1).padStart(7) +
              '   ' + f.toFixed(1).padStart(6) + '   ' + (f - o.score).toFixed(1).padStart(5));
}
if (rms > 3) {
  console.log('\nRMS above 3 points suggests the real curve is not this shape, or that an');
  console.log('observation was mistyped. Worth adding more points before trusting it.');
}
console.log('\nTo adopt: set HALF_MARKS_KM and FALLOFF in js/puzzle.js to K and p above.');
