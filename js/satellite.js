/* WebGL layer that paints the Blue Marble plate onto the sphere.
 *
 * The globe is a 1-degree UV sphere projected orthographically in the vertex
 * shader, so texture coordinates come from the mesh and hardware mipmapping
 * works normally - no antimeridian seam, no manual level-of-detail. At the
 * game's maximum zoom the error from interpolating across a 1-degree triangle
 * stays under a pixel.
 */
(function (MT) {
  'use strict';

  var LAT_STEPS = 180;
  var LON_STEPS = 360;

  var VERT = [
    'attribute vec3 aPos;',
    'attribute vec2 aUv;',
    'uniform vec3 uEast;',
    'uniform vec3 uNorth;',
    'uniform vec3 uView;',
    'uniform vec2 uCentre;',
    'uniform vec2 uViewport;',
    'uniform float uRadius;',
    'varying vec2 vUv;',
    'varying vec3 vPos;',
    'void main() {',
    '  float x = dot(aPos, uEast);',
    '  float y = dot(aPos, uNorth);',
    '  vec2 px = uCentre + vec2(x * uRadius, -y * uRadius);',
    '  gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0,',
    '                     1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);',
    '  vUv = aUv;',
    '  vPos = aPos;',
    '}'
  ].join('\n');

  /* Shared so a detail tile and the plate underneath it cannot shade
   * differently - the seam between them has to be invisible, and the only way
   * to guarantee that is for both to run the same arithmetic. */
  var SHADE = [
    '  vec3 n = normalize(vPos);',
    '  float c = dot(n, uView);',
    // Exact limb: everything on the far side of the sphere is dropped.
    '  if (c <= 0.0) discard;',
    // Limb darkening, plus a soft lift toward the upper left so the disc
    // reads as a sphere rather than a sticker.
    '  float shade = 0.62 + 0.38 * pow(c, 0.45);',
    '  float lift = 0.10 * clamp(dot(n, normalize(-uEast + uNorth + uView * 0.6)), 0.0, 1.0);',
    '  colour = colour * (shade + lift);',
    // Thin haze where the surface turns away from the camera.
    '  float haze = pow(1.0 - c, 3.0);',
    '  colour = mix(colour, vec3(0.42, 0.60, 0.82), haze * 0.42);'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec3 uView;',
    'uniform vec3 uEast;',
    'uniform vec3 uNorth;',
    'varying vec2 vUv;',
    'varying vec3 vPos;',
    'void main() {',
    '  vec3 colour = texture2D(uTex, vUv).rgb;',
    SHADE,
    '  gl_FragColor = vec4(colour, 1.0);',
    '}'
  ].join('\n');

  /* Detail tiles reuse one small patch mesh whose uv runs 0..1, and are placed
   * on the sphere by uRect - the tile's rectangle in global uv. So a tile costs
   * a uniform and a texture bind, not a mesh. */
  var TILE_VERT = [
    'attribute vec2 aUv;',
    'uniform vec4 uRect;',
    'uniform vec3 uEast;',
    'uniform vec3 uNorth;',
    'uniform vec2 uCentre;',
    'uniform vec2 uViewport;',
    'uniform float uRadius;',
    'varying vec2 vUv;',
    'varying vec3 vPos;',
    'void main() {',
    '  vec2 g = uRect.xy + aUv * uRect.zw;',
    '  float lon = (g.x - 0.5) * 6.28318530718;',
    '  float lat = (0.5 - g.y) * 3.14159265359;',
    '  float cosLat = cos(lat);',
    '  vec3 p = vec3(cosLat * cos(lon), cosLat * sin(lon), sin(lat));',
    '  float x = dot(p, uEast);',
    '  float y = dot(p, uNorth);',
    '  vec2 px = uCentre + vec2(x * uRadius, -y * uRadius);',
    '  gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0,',
    '                     1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);',
    '  vUv = aUv;',
    '  vPos = p;',
    '}'
  ].join('\n');

  var TILE_FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec3 uView;',
    'uniform vec3 uEast;',
    'uniform vec3 uNorth;',
    'varying vec2 vUv;',
    'varying vec3 vPos;',
    'void main() {',
    '  vec3 colour = texture2D(uTex, vUv).rgb;',
    SHADE,
    '  gl_FragColor = vec4(colour, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, source) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function buildSphere() {
    var vCount = (LON_STEPS + 1) * (LAT_STEPS + 1);
    var pos = new Float32Array(vCount * 3);
    var uv = new Float32Array(vCount * 2);
    var i = 0, j = 0, ix, iy;

    for (iy = 0; iy <= LAT_STEPS; iy++) {
      var v = iy / LAT_STEPS;
      var lat = (0.5 - v) * Math.PI;               // +pi/2 at v=0 (north pole)
      var cosLat = Math.cos(lat), sinLat = Math.sin(lat);
      for (ix = 0; ix <= LON_STEPS; ix++) {
        var u = ix / LON_STEPS;
        var lon = (u - 0.5) * 2 * Math.PI;
        pos[i++] = cosLat * Math.cos(lon);
        pos[i++] = cosLat * Math.sin(lon);
        pos[i++] = sinLat;
        uv[j++] = u;
        uv[j++] = v;
      }
    }

    // The column at u=1 duplicates u=0, so triangles never interpolate
    // backwards across the antimeridian.
    var idx = new Uint16Array(LON_STEPS * LAT_STEPS * 6);
    var k = 0;
    for (iy = 0; iy < LAT_STEPS; iy++) {
      for (ix = 0; ix < LON_STEPS; ix++) {
        var a = iy * (LON_STEPS + 1) + ix;
        var b = a + LON_STEPS + 1;
        idx[k++] = a; idx[k++] = b; idx[k++] = a + 1;
        idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1;
      }
    }
    return { pos: pos, uv: uv, idx: idx, count: idx.length };
  }

  /* A tile spans a few degrees, so a coarse grid is plenty: at the largest
   * level a 512px tile is 5.6 degrees across and 8 quads put a vertex every
   * 0.7 degrees, finer than the base sphere's 1. */
  var PATCH_STEPS = 8;

  function buildPatch() {
    var n = PATCH_STEPS, side = n + 1;
    var uv = new Float32Array(side * side * 2);
    var i = 0, x, y;
    for (y = 0; y <= n; y++) {
      for (x = 0; x <= n; x++) { uv[i++] = x / n; uv[i++] = y / n; }
    }
    var idx = new Uint16Array(n * n * 6), k = 0;
    for (y = 0; y < n; y++) {
      for (x = 0; x < n; x++) {
        var a = y * side + x, b = a + side;
        idx[k++] = a; idx[k++] = b; idx[k++] = a + 1;
        idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1;
      }
    }
    return { uv: uv, idx: idx, count: idx.length };
  }

  /* Tiles resident at once. Each is 512px - 1 MB of RGBA, 1.4 with mipmaps -
   * so 56 is about 75 MB, well under what one large plate costs and bounded
   * however far the player zooms.
   *
   * TILE_BUDGET caps how many one view may ask for, and is the reason the
   * bound holds. Two things push the count up badly without it: a view sitting
   * at the bottom of a level's octave needs four times the tiles of one at the
   * top, and a near-polar view crosses most columns of an equirectangular grid
   * however small the cap actually is. Measured over 1168 random cameras the
   * uncapped count ran to a median of 36 and a maximum of 576. */
  var MAX_TILES_CAP = 56;
  var TILE_BUDGET_CAP = 32;
  var MAX_INFLIGHT = 6;
  var TILE_BYTES = 512 * 512 * 4 * (1 + 4 / 3);   // one tile, mipmapped

  /* The cache is sized from the same budget the plate is chosen against, so a
   * phone does not end up carrying the largest plate it can afford and then a
   * further 75 MB of tiles on top of it. */
  function tileCacheSize(budget) {
    var n = Math.round(budget * 0.20 / TILE_BYTES);
    return Math.max(12, Math.min(MAX_TILES_CAP, n));
  }

  /* What one view may ask for. Kept below the cache so a single view cannot
   * evict tiles it is still using - that thrashes, refetching the same tiles
   * every frame. The cap comes from measurement: over 1168 random cameras a
   * budget of 32 held the median at 19 tiles. */
  function tileBudget(cacheSize) {
    return Math.max(8, Math.min(TILE_BUDGET_CAP, Math.floor(cacheSize * 0.7)));
  }

  function SatelliteLayer(canvas, options) {
    this.canvas = canvas;
    this.opts = options || {};
    this.ready = false;
    this.failed = false;
    this.resolution = 0;
    this.maxTextureSize = 0;
    this._deferred = null;

    var attrs = { alpha: true, antialias: true, depth: false, premultipliedAlpha: false };
    var gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) { this.failed = true; return; }
    this.gl = gl;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { this.failed = true; return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.failed = true; return; }
    this.prog = prog;
    gl.useProgram(prog);

    var mesh = buildSphere();
    this.count = mesh.count;

    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);

    this.uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
    this.aUv = gl.getAttribLocation(prog, 'aUv');
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);

    this.idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);

    this.u = {};
    ['uEast', 'uNorth', 'uView', 'uCentre', 'uViewport', 'uRadius', 'uTex']
      .forEach(function (n) { this.u[n] = gl.getUniformLocation(prog, n); }, this);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // One dark pixel stands in until the first plate decodes.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([16, 32, 56, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.u.uTex, 0);

    gl.clearColor(0, 0, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    this._basis = new Float64Array(9);

    /* Detail tiles are optional: if the second program will not build, or no
     * manifest was served, the globe is exactly what it was before. */
    this.tiles = null;
    this._setupTiles(gl);
  }

  SatelliteLayer.prototype._setupTiles = function (gl) {
    var vs = compile(gl, gl.VERTEX_SHADER, TILE_VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, TILE_FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    var patch = buildPatch();
    this.tileProg = prog;
    this.tileCount = patch.count;

    this.patchUvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.patchUvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, patch.uv, gl.STATIC_DRAW);
    this.patchIdxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.patchIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, patch.idx, gl.STATIC_DRAW);

    this.tAUv = gl.getAttribLocation(prog, 'aUv');
    this.tu = {};
    ['uRect', 'uEast', 'uNorth', 'uView', 'uCentre', 'uViewport', 'uRadius', 'uTex']
      .forEach(function (n) { this.tu[n] = gl.getUniformLocation(prog, n); }, this);

    this._cache = {};       // key -> { tex, used, loading }
    this._live = 0;
    this._inflight = 0;
    this._frame = 0;
  };

  /* The manifest lists the levels the build produced. Without it the layer
   * simply never asks for a tile. */
  SatelliteLayer.prototype.useTiles = function (manifest) {
    if (!this.tileProg || !manifest || !manifest.levels || !manifest.levels.length) return;
    this.tiles = manifest.levels.slice().sort(function (a, b) { return a.width - b.width; });
  };

  /* Peak bytes to put a 2:1 plate of this width on the GPU: the decoded copy
   * and the mipmapped texture exist at the same time during the upload. */
  function peakBytes(width) {
    return width * (width / 2) * 4 * (1 + 4 / 3);
  }

  /* MAX_TEXTURE_SIZE is what the GPU can address, not what the device can
   * afford, and the difference is the whole problem: an iPhone reports 16384
   * and is then killed by the OS partway through a 16384 plate, which peaks
   * around 1.2 GB. So plates are also checked against a memory budget.
   *
   * navigator.deviceMemory is Chromium-only, so Safari - every iPhone - takes
   * the conservative branch by default rather than the optimistic one. */
  function memoryBudgetBytes() {
    var MB = 1048576;
    if (navigator.deviceMemory) return navigator.deviceMemory * 1024 * 0.10 * MB;
    var coarse = typeof matchMedia === 'function' &&
                 matchMedia('(pointer: coarse)').matches;
    return (coarse ? 384 : 512) * MB;
  }

  /* Loads the small plate for an immediate picture, then progressively larger
   * ones. Plates the GPU cannot address, or the device cannot afford, are
   * skipped rather than failing at upload time or taking the tab down. */
  SatelliteLayer.prototype.loadTextures = function (sources) {
    var max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 4096;
    this.maxTextureSize = max;
    var budget = memoryBudgetBytes();
    this.memoryBudget = budget;
    this.maxTiles = tileCacheSize(budget);
    this.tileBudget = tileBudget(this.maxTiles);

    var usable = (sources || []).filter(function (s) {
      return s.width <= max && peakBytes(s.width) <= budget;
    });
    usable.sort(function (a, b) { return a.width - b.width; });
    this.plateWidth = usable.length ? usable[usable.length - 1].width : 0;

    this._deferred = usable.filter(function (s) { return s.defer; });
    this._runChain(usable.filter(function (s) { return !s.defer; }));
  };

  /* Large plates are worth several megabytes, so they wait until the player
   * actually zooms in far enough to see the difference. Each carries its own
   * gate: the 8K plate is worth fetching well before the 16K one, and a player
   * who never zooms past the 8K plate's range should never pay for the 16K. */
  SatelliteLayer.prototype.loadDeferred = function (zoom) {
    if (!this._deferred || !this._deferred.length) return;
    var z = zoom || 0;
    var ready = [], waiting = [];
    this._deferred.forEach(function (s) {
      ((s.minZoom || 0) <= z ? ready : waiting).push(s);
    });
    if (!ready.length) return;
    this._deferred = waiting;
    this._runChain(ready);
  };

  /* Appends to the running chain rather than starting a new one, so plates
   * released by separate zoom gates still decode one at a time and in order. */
  SatelliteLayer.prototype._runChain = function (list) {
    var self = this;
    var chain = this._chain || Promise.resolve();
    list.forEach(function (src) {
      chain = chain.then(function () { return self._loadOne(src.url, src.width); });
    });
    this._chain = chain.catch(function () { /* a missing plate leaves the last good one */ });
  };

  /* Decoding is the part that freezes the page. texImage2D decodes on the spot
   * if the image is not already decoded, and a 34-megapixel JPEG takes long
   * enough to do that on the main thread to drop the tab into a visible stall.
   * `decoding = 'async'` is only a hint and does not cover this, so the pixels
   * are decoded off-thread first and only then handed to the GPU:
   * createImageBitmap where it exists, img.decode() as the fallback. */
  function decodeOffThread(url) {
    // fetch() cannot read a file:// URL - the request is refused as cross
    // origin - so from disk go straight to the Image path rather than logging
    // a CORS failure for every plate on the way to the same place.
    var canFetch = typeof fetch === 'function' &&
                   !(typeof location !== 'undefined' && location.protocol === 'file:');
    if (typeof createImageBitmap === 'function' && canFetch) {
      return fetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error('texture failed: ' + url);
          return r.blob();
        })
        .then(function (b) { return createImageBitmap(b); })
        .catch(function () { return decodeViaImage(url); });
    }
    return decodeViaImage(url);
  }

  function decodeViaImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        if (typeof img.decode === 'function') {
          img.decode().then(function () { resolve(img); }, function () { resolve(img); });
        } else {
          resolve(img);
        }
      };
      img.onerror = function () { reject(new Error('texture failed: ' + url)); };
      img.src = url;
    });
  }

  SatelliteLayer.prototype._loadOne = function (url, width) {
    var self = this;
    return decodeOffThread(url).then(function (img) {
      return new Promise(function (resolve) {
        // never downgrade - a smaller plate released later must not replace a
        // larger one already uploaded
        if (width <= self.resolution) {
          if (img.close) img.close();
          resolve();
          return;
        }
        var gl = self.gl;
        gl.bindTexture(gl.TEXTURE_2D, self.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        var aniso = gl.getExtension('EXT_texture_filter_anisotropic') ||
                    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
        if (aniso) {
          // The globe is mostly seen at a slant - every part of the disc away
          // from its centre is foreshortened, and near the limb severely so.
          // That is exactly what anisotropic filtering is for, so take all of
          // it the driver offers rather than an arbitrary 8.
          gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT,
                           gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
        }
        // The GPU has its own copy now. Release the decoded one rather than
        // waiting for a collection - at this size it is hundreds of megabytes.
        if (img.close) img.close();

        self.resolution = width;
        self.ready = true;
        if (self.opts.onReady) self.opts.onReady();
        resolve();
      });
    });
  };

  SatelliteLayer.prototype.resize = function (width, height, dpr) {
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.width = width;
    this.height = height;
    this.dpr = dpr;   // the detail level is chosen against device pixels
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  SatelliteLayer.prototype.clear = function () {
    if (!this.gl || this.failed) return;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  };

  /* Picks the level to draw and the tiles to draw it with, or null for the
   * plate alone.
   *
   * A level of width W puts W/2 texels across the visible hemisphere; at zoom z
   * the viewport spans 1/z of that over `discPx` device pixels, so W = 2 z
   * discPx is the level that lands texel for pixel. The nearest level to that
   * in log space is taken rather than the next one up: rounding up always lands
   * at the bottom of an octave, where the texture is twice as fine as the
   * screen can show and needs four times the tiles to say the same thing.
   *
   * Then the count is capped. If the chosen level wants more tiles than the
   * budget, a coarser one is tried, which needs a quarter as many; if even the
   * coarsest does not fit - a view over a pole, where every column of an
   * equirectangular grid crosses the cap - the plate carries it alone. Softer,
   * but bounded, and the poles are ice. */
  SatelliteLayer.prototype._select = function (camera) {
    if (!this.tiles) return null;
    var discPx = camera.radius * (this.dpr || 1) * 2;
    var want = discPx * 2;                       // texels needed across the globe
    // Measured against the largest plate this device will end up with, not the
    // one currently uploaded: during startup `resolution` is still the 1K
    // placeholder, and comparing against that asks for tiles the plate on its
    // way is about to make pointless.
    var plate = this.plateWidth || this.resolution;
    if (plate >= want) return null;

    var best = 0, i;
    for (i = 1; i < this.tiles.length; i++) {
      if (Math.abs(Math.log(this.tiles[i].width / want)) <
          Math.abs(Math.log(this.tiles[best].width / want))) best = i;
    }
    for (i = best; i >= 0; i--) {
      if (this.tiles[i].width <= plate) break;   // the plate is finer than this
      var list = this._visibleTiles(camera, this.tiles[i]);
      if (list.length <= (this.tileBudget || TILE_BUDGET_CAP)) {
        return { level: this.tiles[i], list: list };
      }
    }
    return null;
  };

  /* The tiles overlapping the visible cap, as [x, y] index pairs. Near a pole
   * the longitude span degenerates, so every column is taken there rather than
   * trying to invert a wrap that has no answer. */
  SatelliteLayer.prototype._visibleTiles = function (camera, level) {
    var half = Math.sqrt(this.width * this.width + this.height * this.height) / 2;
    // Padded proportionally rather than by a fixed degree: a degree is a tenth
    // of a tile at the coarsest level and over a third at the finest, so a
    // fixed pad quietly fetches a whole extra ring of tiles as levels get
    // finer. The margin covers the small-angle approximation in the longitude
    // span below and the patch mesh's straight edges.
    var ang = camera.visibleAngle(half) * 180 / Math.PI * 1.1 + 0.2;
    var lat0 = camera.centreLat - ang, lat1 = camera.centreLat + ang;
    var y0 = Math.floor((90 - Math.min(90, lat1)) / 180 * level.rows);
    var y1 = Math.ceil((90 - Math.max(-90, lat0)) / 180 * level.rows);

    var out = [], x, y, cols = level.cols;
    // Every column, but only when the cap really reaches over the pole. Testing
    // at 89 fired a degree early and took all 128 columns at the finest level
    // for a view whose true span is a few dozen degrees.
    var wide = Math.abs(camera.centreLat) + ang >= 90;
    var xs;
    if (wide) {
      xs = null;                                  // all columns
    } else {
      var k = Math.cos(Math.min(89.99, Math.max(Math.abs(lat0), Math.abs(lat1))) * Math.PI / 180);
      var dLon = k > 1e-6 ? Math.min(180, ang / k) : 180;
      xs = [Math.floor((camera.centreLon - dLon + 180) / 360 * cols),
            Math.ceil((camera.centreLon + dLon + 180) / 360 * cols)];
    }
    for (y = Math.max(0, y0); y < Math.min(level.rows, y1); y++) {
      if (xs === null) {
        for (x = 0; x < cols; x++) out.push([x, y]);
      } else {
        for (x = xs[0]; x < xs[1]; x++) out.push([((x % cols) + cols) % cols, y]);
      }
    }
    return out;
  };

  SatelliteLayer.prototype._tile = function (level, tx, ty) {
    var key = level.width + '/' + tx + '/' + ty;
    var hit = this._cache[key];
    if (hit) { hit.used = this._frame; return hit; }
    if (this._inflight >= MAX_INFLIGHT) return null;

    var self = this, gl = this.gl;
    var entry = { tex: null, used: this._frame, loading: true };
    this._cache[key] = entry;
    this._inflight++;
    decodeOffThread('assets/tiles/' + key + '.jpg').then(function (img) {
      self._inflight--;
      entry.loading = false;
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (img.close) img.close();
      entry.tex = tex;
      self._live++;
      self._evict();
      if (self.opts.onReady) self.opts.onReady();
    }, function () {
      self._inflight--;
      // A tile that will not load is simply never drawn: the plate shows
      // through, which is the same picture at lower detail.
      delete self._cache[key];
    });
    return null;
  };

  /* Least recently drawn wins. Without this the cache grows with every place
   * the player visits, which is the memory problem the tiles exist to avoid. */
  SatelliteLayer.prototype._evict = function () {
    var cap = this.maxTiles || MAX_TILES_CAP;
    if (this._live <= cap) return;
    var keys = [], k;
    for (k in this._cache) {
      if (this._cache[k].tex) keys.push(k);
    }
    keys.sort(function (a, b) { return this._cache[a].used - this._cache[b].used; }.bind(this));
    while (this._live > cap && keys.length) {
      var key = keys.shift();
      this.gl.deleteTexture(this._cache[key].tex);
      delete this._cache[key];
      this._live--;
    }
  };

  SatelliteLayer.prototype.render = function (camera) {
    var gl = this.gl;
    if (!gl || this.failed) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.ready) return;
    this._frame++;

    var B = camera.basis(this._basis);
    gl.useProgram(this.prog);
    // Attribute state is global in WebGL 1, and the tile pass rebinds it, so
    // the base pass has to set its own up every frame rather than once.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

    gl.uniform3f(this.u.uEast, B[0], B[1], B[2]);
    gl.uniform3f(this.u.uNorth, B[3], B[4], B[5]);
    gl.uniform3f(this.u.uView, B[6], B[7], B[8]);
    gl.uniform2f(this.u.uCentre, camera.cx, camera.cy);
    gl.uniform2f(this.u.uViewport, this.width, this.height);
    gl.uniform1f(this.u.uRadius, camera.radius);
    gl.uniform1i(this.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);

    var sel = this._select(camera);
    if (!sel) return;
    var level = sel.level;

    gl.useProgram(this.tileProg);
    if (this.aPos !== this.tAUv) gl.disableVertexAttribArray(this.aPos);
    if (this.aUv !== this.tAUv) gl.disableVertexAttribArray(this.aUv);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.patchUvBuf);
    gl.enableVertexAttribArray(this.tAUv);
    gl.vertexAttribPointer(this.tAUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.patchIdxBuf);

    gl.uniform3f(this.tu.uEast, B[0], B[1], B[2]);
    gl.uniform3f(this.tu.uNorth, B[3], B[4], B[5]);
    gl.uniform3f(this.tu.uView, B[6], B[7], B[8]);
    gl.uniform2f(this.tu.uCentre, camera.cx, camera.cy);
    gl.uniform2f(this.tu.uViewport, this.width, this.height);
    gl.uniform1f(this.tu.uRadius, camera.radius);
    gl.uniform1i(this.tu.uTex, 0);

    var want = sel.list;
    var du = 1 / level.cols, dv = 1 / level.rows;
    for (var i = 0; i < want.length; i++) {
      var t = this._tile(level, want[i][0], want[i][1]);
      if (!t || !t.tex) continue;
      gl.uniform4f(this.tu.uRect, want[i][0] * du, want[i][1] * dv, du, dv);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.drawElements(gl.TRIANGLES, this.tileCount, gl.UNSIGNED_SHORT, 0);
    }
  };

  MT.SatelliteLayer = SatelliteLayer;
})(window.MT = window.MT || {});
