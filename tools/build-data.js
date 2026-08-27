#!/usr/bin/env node
/*
 * Generates data/world.js and data/cities.js from open datasets:
 *   world-atlas    - Natural Earth country polygons (public domain)
 *   all-the-cities - GeoNames cities >= 1000 people (CC BY 4.0)
 *   world-countries - country metadata (ODbL)
 *
 * Both outputs are plain <script>-able files so the game runs off file://
 * with no bundler and no server.
 */
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');
const allCities = require('all-the-cities');
const countries = require('world-countries');
const FAMOUS = require('./famous-cities');

const OUT = path.join(__dirname, '..', 'data');
const PRECISION = 1000; // coordinate quantisation: 0.001 deg ~= 110 m

/* ------------------------------------------------------------------ *
 * Encoded-polyline compression (Google's algorithm, lon emitted first)
 * ------------------------------------------------------------------ */
function encodeSigned(value, out) {
  let v = value < 0 ? ~(value << 1) : (value << 1);
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

function encodeRing(ring) {
  const out = [];
  let px = 0, py = 0;
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * PRECISION);
    const y = Math.round(lat * PRECISION);
    encodeSigned(x - px, out);
    encodeSigned(y - py, out);
    px = x; py = y;
  }
  return out.join('');
}

/* ------------------------------------------------------------------ *
 * World polygons, at two levels of detail
 * ------------------------------------------------------------------ */
// Natural Earth numeric ids -> ISO 3166-1 alpha-2, so a tapped polygon can be
// named in the result panel.
const numericToAlpha2 = new Map(countries.map((c) => [String(Number(c.ccn3)), c.cca2]));

function buildLod(resolution) {
  const topo = require(`world-atlas/countries-${resolution}.json`);
  const fc = topojson.feature(topo, topo.objects.countries);
  const features = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const encoded = polys.map((poly) => poly.map(encodeRing));
    features.push({
      c: numericToAlpha2.get(String(Number(f.id))) || '',
      n: f.properties.name || '',
      g: encoded,
    });
  }
  return features;
}

/* ------------------------------------------------------------------ *
 * City pool
 * ------------------------------------------------------------------ */
// GeoNames stores a few well-known places under their local name; the prompt
// reads better in English.
const RENAME = {
  'Köln': 'Cologne', 'München': 'Munich', 'Nürnberg': 'Nuremberg',
  'Frankfurt am Main': 'Frankfurt', 'Sevilla': 'Seville', 'Göteborg': 'Gothenburg',
  'Venezia': 'Venice', 'Napoli': 'Naples', 'Firenze': 'Florence', 'Milano': 'Milan',
  'Roma': 'Rome', 'Torino': 'Turin', 'Genova': 'Genoa', 'Praha': 'Prague',
  'Warszawa': 'Warsaw', 'Wien': 'Vienna', 'Moskva': 'Moscow', 'København': 'Copenhagen',
  'Lisboa': 'Lisbon', 'Bruxelles': 'Brussels', 'Brussel': 'Brussels',
  'Antwerpen': 'Antwerp', 'Brugge': 'Bruges', 'Gent': 'Ghent',
  "'s-Gravenhage": 'The Hague', 'Den Haag': 'The Hague', 'Genève': 'Geneva',
  'Zürich': 'Zurich', 'Athina': 'Athens', 'Iraklion': 'Heraklion',
  'Thera': 'Santorini', 'Makkah': 'Mecca', 'Al Madinah': 'Medina',
  'Marrakech': 'Marrakesh', 'Kiev': 'Kyiv', 'Odessa': 'Odesa',
  'Nur-Sultan': 'Astana', 'Beograd': 'Belgrade', 'Bucuresti': 'Bucharest',
  'Chisinau': 'Chisinau', 'Ho Chi Minh City': 'Ho Chi Minh City',
  'New York City': 'New York', 'Washington, D. C.': 'Washington, D.C.',
  'Washington': 'Washington, D.C.', 'Habana': 'Havana', 'La Habana': 'Havana',
  'Ciudad de Mexico': 'Mexico City', 'Sao Paulo': 'Sao Paulo',
};

const famousKeys = new Set(FAMOUS);
const countryByAlpha2 = new Map(countries.map((c) => [c.cca2, c]));

function isFamous(city) {
  return famousKeys.has(`${city.name}|${city.country}`) ||
         famousKeys.has(`${RENAME[city.name] || city.name}|${city.country}`);
}

// A country's size drives how punishing a miss is: a capital on a 20 km island
// is far harder to tap than one in the middle of Kazakhstan.
function tapPenalty(area) {
  if (!area || area <= 0) return 1.0;
  if (area < 500) return 2.0;
  if (area < 5000) return 1.2;
  if (area < 50000) return 0.6;
  if (area < 500000) return 0.2;
  return 0;
}

function buildCities() {
  const candidates = new Map(); // key -> record

  const consider = (city) => {
    const meta = countryByAlpha2.get(city.country);
    if (!meta) return;
    if (!city.loc || !city.loc.coordinates) return;
    const name = RENAME[city.name] || city.name;
    const key = `${name}|${city.country}`;
    const prev = candidates.get(key);
    if (prev && prev.pop >= city.population) return;
    candidates.set(key, {
      name,
      cc: city.country,
      lon: city.loc.coordinates[0],
      lat: city.loc.coordinates[1],
      pop: city.population,
      capital: city.featureCode === 'PPLC',
      famous: isFamous(city),
      meta,
    });
  };

  // Every entry has to be a place a player could reasonably attempt. An
  // ordinary city of 200k is not a hard question, it is an unanswerable one -
  // nobody can place Kultali or Dadukou, and rounds 3-5 carry 80% of the
  // scoring weight. So the pool is capitals, places people have heard of, and
  // cities big enough to be famous for their size. Nothing else.
  const MEGACITY = 2500000;
  for (const city of allCities) {
    if (city.featureCode === 'PPLC') consider(city);                     // national capitals
    else if (isFamous(city) && city.population >= 500) consider(city);   // known by name
    else if (city.population >= MEGACITY) consider(city);                // known by size
  }

  const pool = [...candidates.values()];

  // Two GeoNames entries can describe the same place under different names
  // (a city and its municipality). Drop near-duplicates inside one country.
  pool.sort((a, b) => b.pop - a.pop);
  const kept = [];
  for (const c of pool) {
    const dup = kept.some((k) =>
      k.cc === c.cc &&
      Math.abs(k.lat - c.lat) < 0.22 &&
      Math.abs(k.lon - c.lon) < 0.22 / Math.max(0.2, Math.cos(c.lat * Math.PI / 180)));
    if (!dup) kept.push(c);
  }

  for (const c of kept) {
    const fame =
      1.05 * Math.log10(Math.max(1000, c.pop)) +
      (c.famous ? 3.0 : 0) +
      (c.capital ? (c.meta.unMember ? 1.7 : 0.7) : 0);
    c.difficulty = tapPenalty(c.meta.area) - fame;
  }

  kept.sort((a, b) => a.difficulty - b.difficulty);

  const pooled = kept.slice();

  // Round 1 should feel free; round 5 should hurt - but every round should
  // still be answerable. The hard tiers are where the island capitals live.
  const SHARES = [0.10, 0.16, 0.20, 0.26, 0.28];
  let i = 0;
  for (let tier = 0; tier < SHARES.length; tier++) {
    const end = tier === SHARES.length - 1
      ? pooled.length
      : Math.min(pooled.length, i + Math.round(SHARES[tier] * pooled.length));
    for (; i < end; i++) pooled[i].tier = tier + 1;
  }
  return pooled;
}

/* ------------------------------------------------------------------ *
 * Emit
 * ------------------------------------------------------------------ */
function round(n, dp) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const world = {
    precision: PRECISION,
    low: buildLod('110m'),
    high: buildLod('50m'),
  };
  const worldJs =
    '/* Generated by tools/build-data.js - do not edit by hand.\n' +
    '   Country polygons from Natural Earth via world-atlas (public domain).\n' +
    '   Rings are encoded polylines at 0.001 degree precision, lon before lat. */\n' +
    'window.MT_WORLD = ' + JSON.stringify(world) + ';\n';
  fs.writeFileSync(path.join(OUT, 'world.js'), worldJs);

  const cities = buildCities();
  const countryNames = {};
  for (const c of cities) countryNames[c.cc] = c.meta.name.common;

  const payload = {
    countries: countryNames,
    // [name, countryCode, lat, lon, tier]
    cities: cities.map((c) => [c.name, c.cc, round(c.lat, 4), round(c.lon, 4), c.tier]),
  };
  const citiesJs =
    '/* Generated by tools/build-data.js - do not edit by hand.\n' +
    '   City locations from GeoNames via all-the-cities (CC BY 4.0).\n' +
    '   Each entry is [name, ISO-3166-1 alpha-2, lat, lon, difficultyTier]. */\n' +
    'window.MT_CITIES = ' + JSON.stringify(payload) + ';\n';
  fs.writeFileSync(path.join(OUT, 'cities.js'), citiesJs);

  const byTier = [1, 2, 3, 4, 5].map((t) => cities.filter((c) => c.tier === t).length);
  console.log(`world.js   ${(worldJs.length / 1024).toFixed(0)} KB  (${world.low.length} low-detail / ${world.high.length} high-detail features)`);
  console.log(`cities.js  ${(citiesJs.length / 1024).toFixed(0)} KB  ${cities.length} cities across ${Object.keys(countryNames).length} countries`);
  console.log(`tiers      ${byTier.join(' / ')}`);
}

main();
