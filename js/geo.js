/* Spherical geometry and the orthographic (globe) projection.
 * Angles are degrees at the API boundary, radians internally. */
(function (MT) {
  'use strict';

  var DEG = Math.PI / 180;
  var EARTH_RADIUS_KM = 6371.0088;

  function toRadians(d) { return d * DEG; }
  function toDegrees(r) { return r / DEG; }

  /* Wrap a longitude difference into [-180, 180]. */
  function wrapLon(lon) {
    var x = (lon + 180) % 360;
    if (x < 0) x += 360;
    return x - 180;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* Unit vector on the sphere. Used for culling and interpolation. */
  function toVec3(lon, lat) {
    var la = lat * DEG, lo = lon * DEG;
    var c = Math.cos(la);
    return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)];
  }

  function fromVec3(v) {
    return [toDegrees(Math.atan2(v[1], v[0])), toDegrees(Math.asin(clamp(v[2], -1, 1)))];
  }

  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /* Angular separation in radians. */
  function angleBetween(a, b) {
    return Math.acos(clamp(dot3(a, b), -1, 1));
  }

  /* Great-circle distance in kilometres. */
  function distanceKm(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * DEG, p2 = lat2 * DEG;
    var dp = (lat2 - lat1) * DEG, dl = (lon2 - lon1) * DEG;
    var s = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* Initial bearing from point 1 to point 2, in degrees clockwise from north. */
  function bearing(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  function compassPoint(deg) {
    return COMPASS[Math.round(deg / 22.5) % 16];
  }

  /* Points along the great circle from a to b, as [lon, lat] pairs. */
  function greatCircle(lon1, lat1, lon2, lat2, steps) {
    var a = toVec3(lon1, lat1), b = toVec3(lon2, lat2);
    var omega = angleBetween(a, b);
    var out = [];
    if (omega < 1e-9) return [[lon1, lat1], [lon2, lat2]];
    var sinOmega = Math.sin(omega);
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var s1 = Math.sin((1 - t) * omega) / sinOmega;
      var s2 = Math.sin(t * omega) / sinOmega;
      out.push(fromVec3([a[0] * s1 + b[0] * s2, a[1] * s1 + b[1] * s2, a[2] * s1 + b[2] * s2]));
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Orthographic projection
   *
   * The camera is described by the geographic point at the centre of the
   * disc (centreLon/centreLat) plus a radius in pixels. Anything on the far
   * side of the sphere has cosC < 0 and is hidden.
   * ------------------------------------------------------------------ */
  function Camera() {
    this.centreLon = 0;
    this.centreLat = 20;
    this.radius = 300;      // globe radius in CSS pixels
    this.cx = 0;
    this.cy = 0;
    this._sinLat = Math.sin(20 * DEG);
    this._cosLat = Math.cos(20 * DEG);
  }

  Camera.prototype.setCentre = function (lon, lat) {
    this.centreLat = clamp(lat, -89.9, 89.9);
    this.centreLon = wrapLon(lon);
    this._sinLat = Math.sin(this.centreLat * DEG);
    this._cosLat = Math.cos(this.centreLat * DEG);
  };

  /* Projects into `out` as [x, y, cosC]. cosC < 0 means the point faces away. */
  Camera.prototype.project = function (lon, lat, out) {
    var dl = (lon - this.centreLon) * DEG;
    var la = lat * DEG;
    var cosLa = Math.cos(la), sinLa = Math.sin(la);
    var cosDl = Math.cos(dl);
    var cosC = this._sinLat * sinLa + this._cosLat * cosLa * cosDl;
    var x = cosLa * Math.sin(dl);
    var y = this._cosLat * sinLa - this._sinLat * cosLa * cosDl;
    out[0] = this.cx + this.radius * x;
    out[1] = this.cy - this.radius * y;
    out[2] = cosC;
    return out;
  };

  /* Screen pixel -> [lon, lat], or null when the pixel misses the globe. */
  Camera.prototype.unproject = function (px, py) {
    var x = (px - this.cx) / this.radius;
    var y = (this.cy - py) / this.radius;
    var rho = Math.sqrt(x * x + y * y);
    if (rho > 1) return null;
    if (rho < 1e-12) return [this.centreLon, this.centreLat];
    var c = Math.asin(clamp(rho, -1, 1));
    var sinC = Math.sin(c), cosC = Math.cos(c);
    var lat = Math.asin(clamp(cosC * this._sinLat + (y * sinC * this._cosLat) / rho, -1, 1));
    var lon = this.centreLon * DEG +
              Math.atan2(x * sinC, rho * cosC * this._cosLat - y * sinC * this._sinLat);
    return [wrapLon(toDegrees(lon)), toDegrees(lat)];
  };

  /* Unit vector the camera is looking at - the centre of the visible cap. */
  Camera.prototype.viewVector = function () {
    return toVec3(this.centreLon, this.centreLat);
  };

  /* Orthonormal basis for the current view, written into `out` as
   * [east(3), north(3), view(3)]. For a point's unit vector p:
   *   x = p.east, y = p.north, cosC = p.view
   * which is the orthographic projection with no trigonometry per point. */
  Camera.prototype.basis = function (out) {
    var lo = this.centreLon * DEG;
    var sinLo = Math.sin(lo), cosLo = Math.cos(lo);
    var sinLa = this._sinLat, cosLa = this._cosLat;
    out[0] = -sinLo;             out[1] = cosLo;              out[2] = 0;
    out[3] = -sinLa * cosLo;     out[4] = -sinLa * sinLo;     out[5] = cosLa;
    out[6] = cosLa * cosLo;      out[7] = cosLa * sinLo;      out[8] = sinLa;
    return out;
  };

  /* Angular radius (radians) of the region actually inside the viewport.
   * Used to skip geometry that is on the near side but off-screen. */
  Camera.prototype.visibleAngle = function (halfDiagonalPx) {
    var r = halfDiagonalPx / this.radius;
    if (r >= 1) return Math.PI / 2;
    return Math.asin(r);
  };

  MT.geo = {
    DEG: DEG,
    EARTH_RADIUS_KM: EARTH_RADIUS_KM,
    Camera: Camera,
    angleBetween: angleBetween,
    bearing: bearing,
    clamp: clamp,
    compassPoint: compassPoint,
    distanceKm: distanceKm,
    dot3: dot3,
    fromVec3: fromVec3,
    greatCircle: greatCircle,
    toDegrees: toDegrees,
    toRadians: toRadians,
    toVec3: toVec3,
    wrapLon: wrapLon
  };
})(window.MT = window.MT || {});
