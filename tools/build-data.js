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
const { household: HOUSEHOLD, known: KNOWN } = require('./famous-cities');

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
  'Palikir - National Government Center': 'Palikir',
};

const householdKeys = new Set(HOUSEHOLD);
const knownKeys = new Set(KNOWN);
const countryByAlpha2 = new Map(countries.map((c) => [c.cca2, c]));

function inList(set, city) {
  return set.has(`${city.name}|${city.country}`) ||
         set.has(`${RENAME[city.name] || city.name}|${city.country}`);
}

/* 2 = everyone can place it, 1 = widely heard of, 0 = neither. */
function familiarity(city) {
  if (inList(householdKeys, city)) return 2;
  if (inList(knownKeys, city)) return 1;
  return 0;
}

/* Dependencies and overseas territories fill the hard end with trivia rather
 * than geography - Pitcairn has forty residents, South Georgia about twenty.
 * Sovereign states are the game; a few territories are famous enough to earn
 * their place alongside them. */
const KEEP_TERRITORIES = new Set(['HK', 'MO', 'PR', 'GL', 'BM', 'GI', 'FO', 'IM',
                                  'AW', 'CW', 'KY', 'PF', 'NC', 'GU', 'TW', 'PS', 'XK']);

function isEligibleCountry(meta) {
  return meta.unMember || KEEP_TERRITORIES.has(meta.cca2);
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
    if (!isEligibleCountry(meta)) return;
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
      familiarity: familiarity(city),
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
    else if (familiarity(city) && city.population >= 500) consider(city); // known by name
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

  // Recognisability dominates. Population is kept only as a tiebreaker within a
  // grade: weighting it heavily is what used to rank Kinshasa above Rome and
  // leave New York out of the easiest tier altogether, because it is a capital
  // of nowhere and merely the size of a capital.
  for (const c of kept) {
    const fame =
      0.55 * Math.log10(Math.max(1000, c.pop)) +
      [0, 3.0, 6.0][c.familiarity] +
      (c.capital ? (c.meta.unMember ? 1.2 : 0.5) : 0);
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

/* ------------------------------------------------------------------ *
 * Continents
 * ------------------------------------------------------------------ */

/* The practice-by-continent sets. UN membership is the line for "a country",
 * which is defensible and checkable, and keeps out the territories the city
 * pool deliberately allows (Hong Kong is a fine place to tap for, and not a
 * country to be asked for).
 *
 * world-countries lumps the Americas into one region, which is not how anyone
 * learns them, so the subregion splits it back into two. */
const CONTINENT_ORDER = ['Africa', 'Asia', 'Europe', 'North America',
                         'South America', 'Oceania'];

function continentOf(meta) {
  if (meta.region !== 'Americas') return meta.region;
  return meta.subregion === 'South America' ? 'South America' : 'North America';
}

/* A point to fly to when the answer is revealed, and the fallback the score
 * falls back on for a country with no polygon. world-countries' own latlng is
 * usually inside the country but is a bounding-box centre, so it lands in the
 * sea for a crescent like Vietnam; where that happens the largest ring's
 * vertex average is tried instead, and whichever lands inside wins. */
function representativePoint(meta, rings) {
  const candidates = [];
  if (meta.latlng && meta.latlng.length === 2) {
    candidates.push([meta.latlng[1], meta.latlng[0]]);
  }
  if (rings && rings.length) {
    let biggest = rings[0];
    for (const r of rings) if (r.length > biggest.length) biggest = r;
    let sx = 0, sy = 0;
    for (const p of biggest) { sx += p[0]; sy += p[1]; }
    candidates.push([sx / biggest.length, sy / biggest.length]);
  }
  for (const c of candidates) {
    if (rings && rings.length && pointInRings(c[0], c[1], rings)) return c;
  }
  // Neither lands inside for an archipelago - the Bahamas' centre is open sea
  // between the islands, and so is the Marshall Islands'. Sweep the largest
  // ring's own box for a point that is genuinely on land.
  if (rings && rings.length) {
    let biggest = rings[0];
    for (const r of rings) if (r.length > biggest.length) biggest = r;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of biggest) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    const N = 24;
    for (let iy = 1; iy < N; iy++) {
      for (let ix = 1; ix < N; ix++) {
        const lon = x0 + ((x1 - x0) * ix) / N;
        const lat = y0 + ((y1 - y0) * iy) / N;
        if (pointInRings(lon, lat, rings)) return [lon, lat];
      }
    }
  }
  return candidates[0] || null;
}

/* Even-odd, matching how the game itself resolves a tap. */
function pointInRings(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) &&
          lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/* Raw (unencoded) 50m rings per country code, for the point-in-country work
 * that picking a representative point needs. */
function rawRingsByCc() {
  const topo = require('world-atlas/countries-50m.json');
  const fc = topojson.feature(topo, topo.objects.countries);
  const out = new Map();
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const cc = numericToAlpha2.get(String(Number(f.id)));
    if (!cc) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = out.get(cc) || [];
    for (const poly of polys) for (const ring of poly) rings.push(ring);
    out.set(cc, rings);
  }
  return out;
}

function buildContinents() {
  const rings = rawRingsByCc();
  const groups = {};
  const noPolygon = [];
  for (const meta of countries) {
    if (!meta.unMember) continue;
    const name = continentOf(meta);
    if (!CONTINENT_ORDER.includes(name)) continue;
    const r = rings.get(meta.cca2);
    if (!r || !r.length) noPolygon.push(meta.cca2);
    const pt = representativePoint(meta, r);
    if (!pt) continue;
    (groups[name] = groups[name] || []).push({
      cc: meta.cca2,
      n: meta.name.common,
      lat: round(pt[1], 3),
      lon: round(pt[0], 3),
    });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => a.n.localeCompare(b.n));
  }
  return { groups, noPolygon };
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

  const { groups, noPolygon } = buildContinents();
  const continentsJs =
    '/* Generated by tools/build-data.js - do not edit by hand.\n' +
    '   UN member states grouped by continent, each with a point inside it.\n' +
    '   Country metadata from world-countries (ODbL). */\n' +
    'window.MT_CONTINENTS = ' + JSON.stringify({ order: CONTINENT_ORDER, groups: groups }) + ';\n';
  fs.writeFileSync(path.join(OUT, 'continents.js'), continentsJs);

  const byTier = [1, 2, 3, 4, 5].map((t) => cities.filter((c) => c.tier === t).length);
  console.log(`world.js   ${(worldJs.length / 1024).toFixed(0)} KB  (${world.low.length} low-detail / ${world.high.length} high-detail features)`);
  console.log(`cities.js  ${(citiesJs.length / 1024).toFixed(0)} KB  ${cities.length} cities across ${Object.keys(countryNames).length} countries`);
  console.log(`tiers      ${byTier.join(' / ')}`);
  const total = CONTINENT_ORDER.reduce((n, k) => n + (groups[k] ? groups[k].length : 0), 0);
  console.log(`continents ${(continentsJs.length / 1024).toFixed(0)} KB  ${total} countries: ` +
              CONTINENT_ORDER.map((k) => `${k} ${groups[k] ? groups[k].length : 0}`).join(', '));
  if (noPolygon.length) {
    console.log(`note: no polygon at 50m for ${noPolygon.join(', ')} - scored by ` +
                'distance to their point rather than to their border.');
  }
}

main();
