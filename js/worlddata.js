/* Decodes the generated country polygons into a form the renderer can chew
 * through 60 times a second, and answers "which country is this point in?". */
(function (MT) {
  'use strict';

  var geo = MT.geo;

  /* Inverse of the encoder in tools/build-data.js. Returns a flat
   * [lon, lat, lon, lat, ...] Float64Array. */
  function decodeRing(str, factor) {
    var len = str.length, i = 0, px = 0, py = 0;
    var coords = [];
    while (i < len) {
      var shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      px += (result & 1) ? ~(result >>> 1) : (result >>> 1);
      shift = 0; result = 0;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      py += (result & 1) ? ~(result >>> 1) : (result >>> 1);
      coords.push(px / factor, py / factor);
    }
    return Float64Array.from(coords);
  }

  /* Smallest spherical cap containing the ring, used to reject geometry that
   * is behind the globe or outside the viewport without projecting it. */
  function boundingCap(pts) {
    var sx = 0, sy = 0, sz = 0, n = pts.length / 2, i;
    for (i = 0; i < n; i++) {
      var v = geo.toVec3(pts[i * 2], pts[i * 2 + 1]);
      sx += v[0]; sy += v[1]; sz += v[2];
    }
    var len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (len < 1e-9) return { c: [0, 0, 1], r: Math.PI };  // wraps the sphere; never cull
    var c = [sx / len, sy / len, sz / len];
    var maxAngle = 0;
    for (i = 0; i < n; i++) {
      var a = geo.angleBetween(c, geo.toVec3(pts[i * 2], pts[i * 2 + 1]));
      if (a > maxAngle) maxAngle = a;
    }
    return { c: c, r: maxAngle };
  }

  /* Unit vectors for every vertex. Projecting from these is pure arithmetic,
   * which keeps the render loop free of trigonometry. Float32 is far more
   * precision than a screen pixel needs. */
  function unitVectors(pts) {
    var n = pts.length / 2;
    var vec = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var lo = pts[i * 2] * geo.DEG, la = pts[i * 2 + 1] * geo.DEG;
      var c = Math.cos(la);
      vec[i * 3] = c * Math.cos(lo);
      vec[i * 3 + 1] = c * Math.sin(lo);
      vec[i * 3 + 2] = Math.sin(la);
    }
    return vec;
  }

  function buildLod(features, factor) {
    var rings = [];
    for (var f = 0; f < features.length; f++) {
      var feat = features[f];
      for (var p = 0; p < feat.g.length; p++) {
        for (var r = 0; r < feat.g[p].length; r++) {
          var pts = decodeRing(feat.g[p][r], factor);
          if (pts.length < 6) continue;      // degenerate after quantisation
          var cap = boundingCap(pts);
          rings.push({
            pts: pts,
            vec: unitVectors(pts),
            cap: cap.c,
            capR: cap.r,
            cc: feat.c,
            name: feat.n,
            poly: f * 1000 + p
          });
        }
      }
    }
    return rings;
  }

  var world = null;

  function load() {
    if (world) return world;
    var raw = window.MT_WORLD;
    world = {
      low: buildLod(raw.low, raw.precision),
      high: buildLod(raw.high, raw.precision)
    };
    return world;
  }

  /* Even-odd ray cast in lon/lat space. Natural Earth already splits polygons
   * at the antimeridian, so no wrapping special case is needed. */
  function ringContains(pts, lon, lat) {
    var inside = false, n = pts.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = pts[i * 2], yi = pts[i * 2 + 1];
      var xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi > lat) !== (yj > lat) &&
          lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /* Country at a point, or null over open water.
   *
   * Natural Earth at 50m generalises coastlines by a few kilometres, so a
   * genuinely coastal point (Manhattan, Rio) can land just outside the
   * polygon. When nothing contains the point we fall back to the nearest
   * shoreline within COASTAL_TOLERANCE_KM and report that country instead.
   */
  var COASTAL_TOLERANCE_KM = 75;

  function countryAt(lon, lat) {
    var rings = load().high;
    var v = geo.toVec3(lon, lat);
    var polys = Object.create(null);
    var i, ring;

    for (i = 0; i < rings.length; i++) {
      ring = rings[i];
      if (geo.angleBetween(ring.cap, v) > ring.capR) continue;
      if (!ringContains(ring.pts, lon, lat)) continue;
      var entry = polys[ring.poly];
      if (entry) entry.count++;
      else polys[ring.poly] = { count: 1, ring: ring };
    }

    // An odd number of containing rings within one polygon means inside;
    // an even number means the point sits in a hole (Lesotho inside ZA).
    for (var key in polys) {
      if (polys[key].count % 2 === 1) {
        return { cc: polys[key].ring.cc, name: polys[key].ring.name, offshore: false };
      }
    }

    var toleranceRad = COASTAL_TOLERANCE_KM / geo.EARTH_RADIUS_KM;
    var best = null, bestKm = Infinity;
    for (i = 0; i < rings.length; i++) {
      ring = rings[i];
      if (geo.angleBetween(ring.cap, v) - ring.capR > toleranceRad) continue;
      var pts = ring.pts;
      for (var k = 0; k < pts.length; k += 2) {
        var dLat = pts[k + 1] - lat;
        if (dLat > 1 || dLat < -1) continue;           // cheap reject before the trig
        var km = geo.distanceKm(lat, lon, pts[k + 1], pts[k]);
        if (km < bestKm) { bestKm = km; best = ring; }
      }
    }
    if (best && bestKm <= COASTAL_TOLERANCE_KM) {
      return { cc: best.cc, name: best.name, offshore: true, offshoreKm: bestKm };
    }
    return null;
  }

  MT.world = { load: load, countryAt: countryAt, decodeRing: decodeRing };
})(window.MT = window.MT || {});
