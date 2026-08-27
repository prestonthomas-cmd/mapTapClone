/* Canvas globe: renders the sphere and handles drag-to-rotate, zoom and taps. */
(function (MT) {
  'use strict';

  var geo = MT.geo;

  var THEME = {
    space: 'rgba(0,0,0,0)',
    ocean: '#12243d',
    oceanRim: '#1b3557',
    land: '#2f4f43',
    landLit: '#3c6354',
    border: 'rgba(180,214,198,0.35)',
    graticule: 'rgba(150,190,220,0.10)',
    equator: 'rgba(150,190,220,0.22)',
    limb: 'rgba(126,183,231,0.55)',
    guess: '#f4a259',
    answer: '#5fd6a0',
    arc: 'rgba(244,162,89,0.85)',
    pin: '#ffd166',
    satGraticule: 'rgba(255,255,255,0.055)',
    satEquator: 'rgba(255,255,255,0.11)'
  };

  var MAX_ZOOM = 45;
  var TAP_SLOP_PX = 7;
  var HIGH_DETAIL_DELAY_MS = 140;
  var HIGH_DETAIL_MIN_ZOOM = 2.4;

  function Globe(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = options || {};
    this.camera = new geo.Camera();
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.baseRadius = 200;
    this.zoom = 1;

    this.satellite = null;
    if (this.opts.glCanvas && MT.SatelliteLayer) {
      var self0 = this;
      var layer = new MT.SatelliteLayer(this.opts.glCanvas, {
        onReady: function () { self0.requestRender(); }
      });
      if (!layer.failed) {
        this.satellite = layer;
        if (this.opts.textures) layer.loadTextures(this.opts.textures);
      }
    }

    this.markers = [];        // {lon, lat, kind, label}
    this.arc = null;          // {from:[lon,lat], to:[lon,lat]}
    this.interacting = false;
    this.spin = 0;            // degrees/second of idle rotation, 0 = off

    this._pointers = new Map();
    this._dragMoved = 0;
    this._dragStart = null;
    this._velocity = { lon: 0, lat: 0 };
    this._lastMoveTime = 0;
    this._frame = null;
    this._detailTimer = null;
    this._useHighDetail = true;
    this._anim = null;
    this._lastFrameTime = 0;
    this._scratch = [0, 0, 0];
    this._pinch = null;
    this._multiTouch = false;
    this._buf = null;
    this._basis = null;

    this._bindEvents();
    this.resize();
  }

  /* ------------------------------------------------------------------ *
   * Sizing
   * ------------------------------------------------------------------ */
  Globe.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.width = w;
    this.height = h;
    this.baseRadius = Math.min(w, h) / 2 - Math.min(28, Math.min(w, h) * 0.05);
    this.camera.cx = w / 2;
    this.camera.cy = h / 2;
    this.camera.radius = this.baseRadius * this.zoom;
    if (this.satellite) this.satellite.resize(w, h, this.dpr);
    this.requestRender();
  };

  var DEFERRED_PLATE_ZOOM = 2.5;

  Globe.prototype.setZoom = function (z) {
    this.zoom = geo.clamp(z, 1, MAX_ZOOM);
    this.camera.radius = this.baseRadius * this.zoom;
    if (this.satellite && this.zoom >= DEFERRED_PLATE_ZOOM) this.satellite.loadDeferred();
    this.requestRender();
  };

  /* The globe is always satellite. The vector renderer is kept purely as the
   * stand-in for the two cases where there is no imagery to draw: a plate that
   * has not decoded yet, and a device without WebGL. Without it those would be
   * an empty disc rather than a playable game. */
  Globe.prototype.usingSatellite = function () {
    return !!this.satellite && this.satellite.ready;
  };

  Globe.prototype.halfDiagonal = function () {
    return Math.sqrt(this.width * this.width + this.height * this.height) / 2;
  };

  /* ------------------------------------------------------------------ *
   * Camera moves
   * ------------------------------------------------------------------ */
  Globe.prototype.lookAt = function (lon, lat, zoom) {
    this.camera.setCentre(lon, lat);
    if (zoom != null) this.setZoom(zoom);
    this.requestRender();
  };

  /* Eased flight to a new camera position. Longitude takes the short way. */
  Globe.prototype.flyTo = function (lon, lat, zoom, durationMs, done) {
    var self = this;
    var from = { lon: this.camera.centreLon, lat: this.camera.centreLat, zoom: this.zoom };
    var dLon = geo.wrapLon(lon - from.lon);
    var to = { lon: from.lon + dLon, lat: geo.clamp(lat, -85, 85), zoom: geo.clamp(zoom, 1, MAX_ZOOM) };
    this._velocity.lon = this._velocity.lat = 0;
    this._anim = {
      start: performance.now(),
      duration: Math.max(1, durationMs || 900),
      from: from,
      to: to,
      done: done
    };
    this.requestRender();
  };

  Globe.prototype._stepAnimation = function (now) {
    var a = this._anim;
    if (!a) return false;
    var t = geo.clamp((now - a.start) / a.duration, 0, 1);
    var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;  // easeInOutCubic
    this.camera.setCentre(a.from.lon + (a.to.lon - a.from.lon) * e,
                          a.from.lat + (a.to.lat - a.from.lat) * e);
    // Zoom is interpolated geometrically so the rate of change feels even.
    this.zoom = a.from.zoom * Math.pow(a.to.zoom / a.from.zoom, e);
    this.camera.radius = this.baseRadius * this.zoom;
    if (t >= 1) {
      this._anim = null;
      if (a.done) a.done();
      return false;
    }
    return true;
  };

  /* Frames both points with enough margin that the labels are readable. */
  Globe.prototype.frameBoth = function (a, b, durationMs, done) {
    var mid = geo.fromVec3((function () {
      var va = geo.toVec3(a[0], a[1]), vb = geo.toVec3(b[0], b[1]);
      var s = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
      var len = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
      if (len < 1e-6) return va;                       // antipodal: keep one end
      return [s[0] / len, s[1] / len, s[2] / len];
    })());
    var half = geo.angleBetween(geo.toVec3(a[0], a[1]), geo.toVec3(b[0], b[1])) / 2;
    var minPx = Math.min(this.width, this.height) / 2;
    // Choose a radius so the pair spans ~62% of the smaller viewport axis.
    var wanted = half < 1e-4 ? MAX_ZOOM : (minPx * 0.62) / (this.baseRadius * Math.sin(half));
    this.flyTo(mid[0], mid[1], geo.clamp(wanted, 1, MAX_ZOOM), durationMs, done);
  };

  /* ------------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------------ */
  Globe.prototype._bindEvents = function () {
    var self = this;
    var c = this.canvas;

    c.addEventListener('pointerdown', function (e) {
      c.setPointerCapture(e.pointerId);
      self._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      self._anim = null;
      self._velocity.lon = self._velocity.lat = 0;
      self.interacting = true;
      self._dragMoved = 0;
      self._dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (self._pointers.size >= 2) { self._pinch = self._pinchState(); self._multiTouch = true; }
      self._setDetail(false);
    });

    c.addEventListener('pointermove', function (e) {
      var prev = self._pointers.get(e.pointerId);
      if (!prev) return;
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      self._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      self._dragMoved += Math.abs(dx) + Math.abs(dy);

      if (self._pointers.size >= 2) {
        self._applyPinch();
      } else {
        // One pixel at the centre of the disc is 1/radius radians of rotation.
        var k = geo.toDegrees(1 / self.camera.radius);
        var dLon = -dx * k, dLat = dy * k;
        self.camera.setCentre(self.camera.centreLon + dLon, self.camera.centreLat + dLat);
        var now = performance.now();
        var dt = Math.max(8, now - self._lastMoveTime);
        self._velocity.lon = dLon / dt * 16;
        self._velocity.lat = dLat / dt * 16;
        self._lastMoveTime = now;
      }
      self.requestRender();
    });

    function endPointer(e) {
      if (!self._pointers.has(e.pointerId)) return;
      self._pointers.delete(e.pointerId);
      if (self._pointers.size < 2) self._pinch = null;
      if (self._pointers.size > 0) return;

      self.interacting = false;
      var moved = self._dragMoved;
      var held = self._dragStart ? performance.now() - self._dragStart.t : 0;
      // Lifting the last finger of a pinch must not drop a pin.
      var wasSingle = !self._multiTouch;
      self._multiTouch = false;
      if (wasSingle && moved < TAP_SLOP_PX && held < 600) {
        self._velocity.lon = self._velocity.lat = 0;
        self._handleTap(e);
      }
      self._scheduleDetail();
      self.requestRender();
    }

    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', endPointer);

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
      self.zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    c.addEventListener('dblclick', function (e) {
      e.preventDefault();
      self.zoomAt(e.clientX, e.clientY, 2);
    });

    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  Globe.prototype._pinchState = function () {
    var pts = [...this._pointers.values()];
    var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return { dist: Math.max(1, Math.hypot(dx, dy)), zoom: this.zoom };
  };

  Globe.prototype._applyPinch = function () {
    if (!this._pinch) { this._pinch = this._pinchState(); return; }
    var pts = [...this._pointers.values()];
    if (pts.length < 2) return;
    var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    var dist = Math.max(1, Math.hypot(dx, dy));
    var midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
    var target = this._pinch.zoom * (dist / this._pinch.dist);
    this.zoomAt(midX, midY, target / this.zoom);
  };

  /* Zooms by `factor`, keeping whatever is under (clientX, clientY) put. */
  Globe.prototype.zoomAt = function (clientX, clientY, factor) {
    var rect = this.canvas.getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var anchor = this.camera.unproject(px, py);
    this.setZoom(this.zoom * factor);
    if (!anchor) return;
    // Two corrective passes converge well within a pixel.
    for (var i = 0; i < 2; i++) {
      var after = this.camera.unproject(px, py);
      if (!after) break;
      this.camera.setCentre(this.camera.centreLon + geo.wrapLon(anchor[0] - after[0]),
                            this.camera.centreLat + (anchor[1] - after[1]));
    }
    this._setDetail(false);
    this._scheduleDetail();
    this.requestRender();
  };

  Globe.prototype._handleTap = function (e) {
    if (!this.opts.onTap) return;
    var rect = this.canvas.getBoundingClientRect();
    var p = this.camera.unproject(e.clientX - rect.left, e.clientY - rect.top);
    if (p) this.opts.onTap(p[0], p[1]);
  };

  /* ------------------------------------------------------------------ *
   * Level of detail: coarse outlines while moving, fine ones once settled.
   * ------------------------------------------------------------------ */
  Globe.prototype._setDetail = function (high) {
    if (this._useHighDetail === high) return;
    this._useHighDetail = high;
    this.requestRender();
  };

  Globe.prototype._scheduleDetail = function () {
    var self = this;
    clearTimeout(this._detailTimer);
    this._detailTimer = setTimeout(function () { self._setDetail(true); }, HIGH_DETAIL_DELAY_MS);
  };

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */
  Globe.prototype.requestRender = function () {
    if (this._frame) return;
    var self = this;
    this._frame = requestAnimationFrame(function (t) {
      self._frame = null;
      self._render(t);
    });
  };

  Globe.prototype._render = function (now) {
    var dt = this._lastFrameTime ? Math.min(64, now - this._lastFrameTime) : 16;
    this._lastFrameTime = now;

    var busy = this._stepAnimation(now);

    // Inertia after a flick.
    if (!this.interacting && !this._anim &&
        (Math.abs(this._velocity.lon) > 0.004 || Math.abs(this._velocity.lat) > 0.004)) {
      this.camera.setCentre(this.camera.centreLon + this._velocity.lon,
                            this.camera.centreLat + this._velocity.lat);
      var decay = Math.pow(0.94, dt / 16);
      this._velocity.lon *= decay;
      this._velocity.lat *= decay;
      busy = true;
      this._setDetail(false);
      this._scheduleDetail();
    }

    if (this.spin && !this.interacting && !this._anim) {
      this.camera.setCentre(this.camera.centreLon + this.spin * dt / 1000, this.camera.centreLat);
      busy = true;
    }

    this._paint();
    if (busy) this.requestRender();
  };

  Globe.prototype._paint = function () {
    var ctx = this.ctx, cam = this.camera;
    var R = cam.radius, cx = cam.cx, cy = cam.cy;
    var satellite = this.usingSatellite();

    // Clearing keeps a stale hemisphere from showing through the transparent
    // overlay when the vector style is selected or the plate has not decoded.
    if (this.satellite) {
      if (satellite) this.satellite.render(cam);
      else this.satellite.clear();
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Atmosphere halo, only worth drawing when the limb is on screen.
    if (R < this.halfDiagonal() * 1.4) {
      var halo = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.13);
      halo.addColorStop(0, satellite ? 'rgba(120,180,235,0.38)' : 'rgba(96,158,214,0.30)');
      halo.addColorStop(1, 'rgba(96,158,214,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.13, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!satellite) {
      // Ocean.
      var sea = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R);
      sea.addColorStop(0, THEME.oceanRim);
      sea.addColorStop(1, THEME.ocean);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = sea;
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    this._drawGraticule(ctx, satellite);
    // Satellite view is the imagery alone. Coastlines are already visible in
    // the plate, and country borders are not on the real planet.
    if (!satellite) this._drawLand(ctx);

    ctx.restore();

    // Limb.
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = THEME.limb;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    this._drawArc(ctx);
    this._drawMarkers(ctx);
  };

  Globe.prototype._drawGraticule = function (ctx, satellite) {
    var step = this.zoom > 8 ? 5 : this.zoom > 3 ? 10 : 15;
    var out = this._scratch;
    var lon, lat;

    ctx.lineWidth = 1;
    ctx.strokeStyle = satellite ? THEME.satGraticule : THEME.graticule;
    ctx.beginPath();
    for (lon = -180; lon < 180; lon += step) {
      this._polyline(ctx, function (i) {
        return [lon, -90 + i * 3];
      }, 61, out);
    }
    for (lat = -75; lat <= 75; lat += step) {
      if (lat === 0) continue;
      this._polyline(ctx, function (i) {
        return [-180 + i * 3, lat];
      }, 121, out);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = satellite ? THEME.satEquator : THEME.equator;
    this._polyline(ctx, function (i) { return [-180 + i * 3, 0]; }, 121, out);
    ctx.stroke();
  };

  /* Adds an open polyline, breaking the path wherever it goes behind the globe. */
  Globe.prototype._polyline = function (ctx, at, count, out) {
    var pen = false;
    for (var i = 0; i < count; i++) {
      var p = at(i);
      this.camera.project(p[0], p[1], out);
      if (out[2] <= 0) { pen = false; continue; }
      if (!pen) { ctx.moveTo(out[0], out[1]); pen = true; }
      else ctx.lineTo(out[0], out[1]);
    }
  };

  /* Coarse outlines are indistinguishable from fine ones until the globe is
   * blown up past a couple of screen-widths, and filling a 100k-point path
   * every frame is the single most expensive thing here - so detail follows
   * zoom, and drops to coarse again while the globe is actually moving. */
  Globe.prototype._wantHighDetail = function () {
    if (this.zoom < HIGH_DETAIL_MIN_ZOOM) return false;
    return this._useHighDetail;
  };

  Globe.prototype._drawLand = function (ctx) {
    var world = MT.world.load();
    var rings = this._wantHighDetail() ? world.high : world.low;
    var cam = this.camera;
    var view = cam.viewVector();
    var visible = cam.visibleAngle(this.halfDiagonal()) + 0.03;
    var R = cam.radius, cx = cam.cx, cy = cam.cy;

    // Outline vertices sit a few kilometres apart; there is no point drawing
    // more of them than the current scale can resolve, so thin them until the
    // skipped detail is under about a pixel.
    var kmPerPixel = geo.EARTH_RADIUS_KM / R;
    var stride = Math.max(1, Math.min(4, Math.round(kmPerPixel / 4)));

    var B = this._basis || (this._basis = new Float64Array(9));
    cam.basis(B);
    var ex = B[0], ey = B[1], ez = B[2];
    var nx = B[3], ny = B[4], nz = B[5];
    var vx = B[6], vy = B[7], vz = B[8];

    if (!this._buf) {
      var longest = 0;
      for (var q = 0; q < world.high.length; q++) longest = Math.max(longest, world.high[q].pts.length);
      this._buf = new Float64Array(longest);
    }
    var buf = this._buf;

    ctx.beginPath();
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      // Reject rings whose bounding cap cannot intersect what is on screen.
      if (geo.angleBetween(ring.cap, view) - ring.capR > visible) continue;

      var vec = ring.vec;
      var n = vec.length / 3;
      var anyFront = false;
      var lastDirX = 1, lastDirY = 0;
      var step = stride;
      // Keep small rings (islands) intact however far out we are.
      while (step > 1 && n / step < 12) step--;
      var count = 0;

      for (var i = 0; i < n; i += step) {
        var px = vec[i * 3], py = vec[i * 3 + 1], pz = vec[i * 3 + 2];
        var cosC = px * vx + py * vy + pz * vz;
        var dirX = px * ex + py * ey + pz * ez;
        var dirY = px * nx + py * ny + pz * nz;
        var x, y;
        if (cosC <= 0) {
          // Behind the horizon: slide the vertex onto the limb so the filled
          // shape hugs the edge instead of cutting a chord across the disc.
          var len = Math.sqrt(dirX * dirX + dirY * dirY);
          if (len < 1e-9) { dirX = lastDirX; dirY = lastDirY; len = 1; }
          lastDirX = dirX / len; lastDirY = dirY / len;
          x = cx + lastDirX * R;
          y = cy - lastDirY * R;
        } else {
          anyFront = true;
          var dl = Math.sqrt(dirX * dirX + dirY * dirY);
          if (dl > 1e-9) { lastDirX = dirX / dl; lastDirY = dirY / dl; }
          x = cx + dirX * R;
          y = cy - dirY * R;
        }
        buf[count * 2] = x;
        buf[count * 2 + 1] = y;
        count++;
      }

      // A ring entirely on the far side would collapse to a sliver along the
      // limb and flip the even-odd fill, so it must not enter the path at all.
      if (!anyFront) continue;

      ctx.moveTo(buf[0], buf[1]);
      for (var k = 1; k < count; k++) ctx.lineTo(buf[k * 2], buf[k * 2 + 1]);
      ctx.closePath();
    }

    var lit = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.36, R * 0.04, cx, cy, R * 1.05);
    lit.addColorStop(0, THEME.landLit);
    lit.addColorStop(1, THEME.land);
    ctx.fillStyle = lit;
    ctx.fill('evenodd');

    ctx.lineWidth = this.zoom > 6 ? 0.9 : 0.6;
    ctx.strokeStyle = THEME.border;
    ctx.stroke();
  };

  Globe.prototype._drawArc = function (ctx) {
    if (!this.arc) return;
    var pts = geo.greatCircle(this.arc.from[0], this.arc.from[1],
                              this.arc.to[0], this.arc.to[1], 128);
    var out = this._scratch;
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < pts.length; i++) {
      this.camera.project(pts[i][0], pts[i][1], out);
      if (out[2] <= 0) { pen = false; continue; }
      if (!pen) { ctx.moveTo(out[0], out[1]); pen = true; }
      else ctx.lineTo(out[0], out[1]);
    }
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = THEME.arc;
    ctx.stroke();
    ctx.setLineDash([]);
  };

  Globe.prototype._drawMarkers = function (ctx) {
    var out = this._scratch;
    for (var i = 0; i < this.markers.length; i++) {
      var m = this.markers[i];
      this.camera.project(m.lon, m.lat, out);
      if (out[2] <= 0) continue;
      var x = out[0], y = out[1];
      var colour = m.kind === 'answer' ? THEME.answer : m.kind === 'guess' ? THEME.guess : THEME.pin;

      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(8,14,24,0.9)';
      ctx.stroke();

      if (m.kind === 'pin') {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,209,102,0.6)';
        ctx.stroke();
      }

      if (m.label) this._drawLabel(ctx, x, y - 16, m.label, colour);
    }
  };

  Globe.prototype._drawLabel = function (ctx, x, y, text, colour) {
    ctx.font = '600 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    var w = ctx.measureText(text).width + 14;
    var h = 20;
    var left = geo.clamp(x - w / 2, 4, Math.max(4, this.width - w - 4));
    var top = y - h;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(left, top, w, h, 6);
    else ctx.rect(left, top, w, h);
    ctx.fillStyle = 'rgba(9,16,28,0.88)';
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#eaf2ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, top + h / 2 + 0.5);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  };

  /* ------------------------------------------------------------------ *
   * Public helpers
   * ------------------------------------------------------------------ */
  Globe.prototype.clearOverlays = function () {
    this.markers = [];
    this.arc = null;
    this.requestRender();
  };

  Globe.prototype.setPin = function (lon, lat) {
    this.markers = [{ lon: lon, lat: lat, kind: 'pin' }];
    this.arc = null;
    this.requestRender();
  };

  Globe.prototype.showResult = function (guess, answer, answerLabel) {
    this.markers = [
      { lon: guess[0], lat: guess[1], kind: 'guess', label: 'Your tap' },
      { lon: answer[0], lat: answer[1], kind: 'answer', label: answerLabel }
    ];
    this.arc = { from: guess, to: answer };
    this.requestRender();
  };

  MT.Globe = Globe;
  MT.GLOBE_THEME = THEME;
  MT.MAX_ZOOM = MAX_ZOOM;
})(window.MT = window.MT || {});
