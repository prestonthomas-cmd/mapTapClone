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

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec3 uView;',
    'uniform vec3 uEast;',
    'uniform vec3 uNorth;',
    'varying vec2 vUv;',
    'varying vec3 vPos;',
    'void main() {',
    '  vec3 n = normalize(vPos);',
    '  float c = dot(n, uView);',
    // Exact limb: everything on the far side of the sphere is dropped.
    '  if (c <= 0.0) discard;',
    '  vec3 colour = texture2D(uTex, vUv).rgb;',
    // Limb darkening, plus a soft lift toward the upper left so the disc
    // reads as a sphere rather than a sticker.
    '  float shade = 0.62 + 0.38 * pow(c, 0.45);',
    '  float lift = 0.10 * clamp(dot(n, normalize(-uEast + uNorth + uView * 0.6)), 0.0, 1.0);',
    '  colour = colour * (shade + lift);',
    // Thin haze where the surface turns away from the camera.
    '  float haze = pow(1.0 - c, 3.0);',
    '  colour = mix(colour, vec3(0.42, 0.60, 0.82), haze * 0.42);',
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
  }

  /* Loads the small plate for an immediate picture, then progressively larger
   * ones. Plates wider than the GPU can hold are skipped rather than failing
   * at upload time - plenty of mobile GPUs still cap out at 4096. */
  SatelliteLayer.prototype.loadTextures = function (sources) {
    var max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 4096;
    this.maxTextureSize = max;

    var usable = (sources || []).filter(function (s) { return s.width <= max; });
    usable.sort(function (a, b) { return a.width - b.width; });

    this._deferred = usable.filter(function (s) { return s.defer; });
    this._runChain(usable.filter(function (s) { return !s.defer; }));
  };

  /* Large plates are worth several megabytes, so they wait until the player
   * actually zooms in far enough to see the difference. */
  SatelliteLayer.prototype.loadDeferred = function () {
    if (!this._deferred || !this._deferred.length) return;
    var pending = this._deferred;
    this._deferred = null;
    this._runChain(pending);
  };

  SatelliteLayer.prototype._runChain = function (list) {
    var self = this;
    var chain = Promise.resolve();
    list.forEach(function (src) {
      chain = chain.then(function () { return self._loadOne(src.url, src.width); });
    });
    chain.catch(function () { /* a missing plate just leaves the last good one */ });
  };

  SatelliteLayer.prototype._loadOne = function (url, width) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        if (width <= self.resolution) { resolve(); return; }   // never downgrade
        var gl = self.gl;
        gl.bindTexture(gl.TEXTURE_2D, self.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        var aniso = gl.getExtension('EXT_texture_filter_anisotropic') ||
                    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
        if (aniso) {
          gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT,
                           Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        }
        self.resolution = width;
        self.ready = true;
        if (self.opts.onReady) self.opts.onReady();
        resolve();
      };
      img.onerror = function () { reject(new Error('texture failed: ' + url)); };
      img.src = url;
    });
  };

  SatelliteLayer.prototype.resize = function (width, height, dpr) {
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.width = width;
    this.height = height;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  SatelliteLayer.prototype.clear = function () {
    if (!this.gl || this.failed) return;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  };

  SatelliteLayer.prototype.render = function (camera) {
    var gl = this.gl;
    if (!gl || this.failed) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.ready) return;

    var B = camera.basis(this._basis);
    gl.useProgram(this.prog);
    gl.uniform3f(this.u.uEast, B[0], B[1], B[2]);
    gl.uniform3f(this.u.uNorth, B[3], B[4], B[5]);
    gl.uniform3f(this.u.uView, B[6], B[7], B[8]);
    gl.uniform2f(this.u.uCentre, camera.cx, camera.cy);
    gl.uniform2f(this.u.uViewport, this.width, this.height);
    gl.uniform1f(this.u.uRadius, camera.radius);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  };

  MT.SatelliteLayer = SatelliteLayer;
})(window.MT = window.MT || {});
