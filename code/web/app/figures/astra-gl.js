(function (root) {
  'use strict';

  var COMMON = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'precision highp sampler2D;'
  ].join('\n');

  var VS_STAR = COMMON + `
  layout(location=0) in vec2 aCorner;      // [-1,1]^2
  layout(location=1) in vec4 aA;           // kind, arm, prog, off
  layout(location=2) in vec4 aB;           // depth, bright, scale, opacity
  layout(location=3) in vec4 aC;           // twP, twR, hero, -
  layout(location=4) in vec4 aD;           // color rgb, -
  layout(location=5) in vec4 aE;           // sx, sy, sz, -
  layout(location=6) in vec4 aF;           // core base position, -

  uniform sampler2D uArms;
  uniform int   uTableSize;
  uniform float uArmOffset[8];
  uniform vec2  uArmSpin[8];
  uniform vec2  uCoreSpin;
  uniform vec3  uCoreRot;
  uniform float uTime, uIntro, uGate;
  uniform vec2  uScatter;
  uniform float uTwinkleSpeed, uTwinkleAmp, uPointTwinkle, uOpacityTwinkle;
  uniform float uDensityFalloff, uSizeFalloff, uSizeEnvFloor, uSizeEnvPower, uEndFade;
  uniform float uIntensity, uCoreIntensityMul, uPointBase, uPointScale, uPointMinQuad;
  uniform float uRevealDelayScale, uRevealWindow, uRevealFloor, uOpacityRevealEnd;
  uniform float uPullStart, uPullStartSpread, uPullDuration, uPullDurationSpread, uSwirl, uSwirlSpread;
  uniform float uRayStart, uRayFull;
  uniform vec4  uView;                     // cx, cy, scale, bufferScale
  uniform vec2  uResolution;

  out vec2  vLocal;
  out float vDiam;
  out float vBright;
  out float vOpacity;
  out float vRays;
  out vec3  vColor;

  const float PI = 3.14159265358979;
  const float TAU = 6.28318530717959;

  float lerp(float a, float b, float t) { return a + (b - a) * t; }

  vec3 samplePath(int arm, float progress) {
    float sp = clamp(progress, 0.0, 1.0) * float(uTableSize - 1);
    int lo = int(floor(sp));
    int hi = min(lo + 1, uTableSize - 1);
    float f = sp - float(lo);
    vec3 a = texelFetch(uArms, ivec2(lo, arm), 0).xyz;
    vec3 b = texelFetch(uArms, ivec2(hi, arm), 0).xyz;
    return mix(a, b, f);
  }

  vec3 rotXYZ(vec3 v, vec3 r) {   // three.js XYZ Euler: v' = Rx * Ry * Rz * v
    float cz = cos(r.z), sz = sin(r.z);
    vec3 a = vec3(v.x * cz - v.y * sz, v.x * sz + v.y * cz, v.z);
    float cy = cos(r.y), sy = sin(r.y);
    vec3 b = vec3(a.x * cy + a.z * sy, a.y, -a.x * sy + a.z * cy);
    float cx = cos(r.x), sx = sin(r.x);
    return vec3(b.x, b.y * cx - b.z * sx, b.y * sx + b.z * cx);
  }

  void main() {
    int kind = int(aA.x + 0.5);
    int arm = int(aA.y + 0.5);
    float A = uIntro, tt = uGate;
    float tw = 1.0 - uTwinkleAmp + uTwinkleAmp * sin(aC.x + uTime * uTwinkleSpeed * tt * aC.y);
    float sizeEnv = 1.0, endVis = 1.0, bright, size;
    vec3 pos;
    if (kind == 2) {
      pos = rotXYZ(aF.xyz, uCoreRot);
      bright = uIntensity * uCoreIntensityMul * aB.y * tw;
      size = (uPointBase + aB.z * uPointScale) * (1.0 - uPointTwinkle + uPointTwinkle * tw);
    } else {
      float phase = fract(aA.z + uArmOffset[arm]);
      float prog = phase + uDensityFalloff * sin(phase * TAU) / TAU;
      float mid = sin(clamp(prog, 0.0, 1.0) * PI);
      sizeEnv = lerp(1.0, uSizeEnvFloor + (1.0 - uSizeEnvFloor) * pow(max(mid, 0.0), uSizeEnvPower), uSizeFalloff);
      endVis = smoothstep(0.0, uEndFade, prog) * (1.0 - smoothstep(1.0 - uEndFade, 1.0, prog));
      if (kind == 0) {
        float step1 = 1.0 / float(uTableSize - 1);
        pos = samplePath(arm, prog);
        vec3 pb = samplePath(arm, max(prog - step1, 0.0));
        vec3 pa = samplePath(arm, min(prog + step1, 1.0));
        vec3 tg = normalize(pa - pb);
        vec3 across = normalize(vec3(-tg.y, tg.x, 0.0));
        pos += across * aA.w + vec3(0.0, 0.0, aB.x);
      } else {
        pos = vec3((aE.x - 0.5) * uScatter.x, (fract(aE.y) - 0.5) * uScatter.y, (aE.z - 0.5) * 0.5);
      }
      bright = uIntensity * aB.y * tw;
      size = (uPointBase + aB.z * sizeEnv * endVis * uPointScale) * (1.0 - uPointTwinkle + uPointTwinkle * tw);
    }
    // intro: scattered -> pulled onto the arm while swinging around the centre
    vec3 sc = vec3((aE.x - 0.5) * uScatter.x, (fract(aE.y) - 0.5) * uScatter.y, (aE.z - 0.5) * 0.5);
    float Ai = kind == 1 ? 1.0 : A;
    if (Ai < 1.0) {
      float start = uPullStart + aE.z * uPullStartSpread;
      float dur = uPullDuration + aE.y * uPullDurationSpread;
      float local = clamp((Ai - start) / dur, 0.0, 1.0);
      float sp = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
      float pull = lerp(sp, sin(sp * PI * 0.5), 0.5);
      float ang = sin(pull * PI) * (uSwirl + aE.z * uSwirlSpread);
      float c = cos(ang), s = sin(ang);
      vec3 orbiting = vec3(sc.x * c - sc.y * s, sc.x * s + sc.y * c, sc.z);
      pos = mix(orbiting, pos, pull);
    }
    float delay = aE.z * uRevealDelayScale;
    float rl = smoothstep(delay, uRevealWindow + delay, A) * lerp(uRevealFloor, 1.0, smoothstep(uRevealFloor, 1.0, A));
    if (kind == 1) rl = min(rl, uRevealFloor);
    float opacity = aB.w * endVis * (1.0 - uOpacityTwinkle + uOpacityTwinkle * tw) * smoothstep(0.0, uOpacityRevealEnd, rl);
    size *= sqrt(rl);

    // drag rotation: each arm follows with its own lag, the core follows directly
    vec2 spin = kind == 2 ? uCoreSpin : uArmSpin[arm];
    pos = rotXYZ(pos, vec3(spin.x * tt, spin.y * tt, 0.0));

    float diam = size * uView.w;                 // drawing-buffer pixels
    float quad = max(diam, uPointMinQuad);
    vec2 px = vec2(uView.x + pos.x * uView.z, uView.y - pos.y * uView.z) + aCorner * quad * 0.5;
    vLocal = aCorner * quad * 0.5;
    vDiam = diam;
    vBright = bright;
    vOpacity = opacity;
    vRays = smoothstep(uRayStart, uRayFull, aB.y);
    vColor = aD.rgb;
    vec2 clip = (px / uResolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, opacity > 0.0005 ? 1.0 : 0.0);
  }`;

  var FS_STAR = COMMON + `
  in vec2  vLocal;
  in float vDiam;
  in float vBright;
  in float vOpacity;
  in float vRays;
  in vec3  vColor;
  uniform float uPointMinQuad, uDiscInner, uDiscPower, uRaySharpness, uRayInner, uRayAmount;
  uniform float uFilterArea, uFilterWhite, uWhiteStart, uWhiteFull, uWhiteAmount, uColorEnergy;
  out vec4 outColor;

  float cubic(float x) {
    x = abs(x);
    if (x < 1.0) return (4.0 - 6.0 * x * x + 3.0 * x * x * x) / 6.0;
    float tail = max(2.0 - x, 0.0);
    return tail * tail * tail / 6.0;
  }

  void main() {
    vec2 pn = vLocal * 2.0 / max(vDiam, 0.0001);
    float dist = length(pn);
    float disc = 1.0 - smoothstep(uDiscInner, 1.0, dist);
    float core = pow(disc, uDiscPower);
    float hr = exp(-abs(pn.y) * uRaySharpness) * (1.0 - smoothstep(uRayInner, 1.0, abs(pn.x)));
    float vr = exp(-abs(pn.x) * uRaySharpness) * (1.0 - smoothstep(uRayInner, 1.0, abs(pn.y)));
    float ray = max(hr, vr) * uRayAmount * vRays;
    float resolved = smoothstep(uPointMinQuad * 0.5, uPointMinQuad, vDiam);
    float filtered = cubic(vLocal.x) * cubic(vLocal.y) * uFilterArea * vDiam * vDiam;
    float alpha = mix(filtered, max(core, ray), resolved) * vOpacity;
    if (alpha <= 0.0) discard;
    float white = mix(uFilterWhite, core, resolved) * smoothstep(uWhiteStart, uWhiteFull, vBright) * uWhiteAmount;
    float energy = 1.0 + (1.0 - min(vColor.r, min(vColor.g, vColor.b))) * uColorEnergy;
    vec3 emission = mix(vColor, vec3(1.0), white) * vBright * energy;
    outColor = vec4(emission * alpha, alpha);
  }`;

  var VS_QUAD = COMMON + `
  layout(location=0) in vec2 aCorner;
  out vec2 vUv;
  void main() { vUv = aCorner * 0.5 + 0.5; gl_Position = vec4(aCorner, 0.0, 1.0); }`;

  // bloom prefilter: 4-tap average at half resolution, gated by luminance
  var FS_PREFILTER = COMMON + `
  in vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uThreshold, uSmoothing;
  out vec4 outColor;
  void main() {
    vec2 o = uTexel * 0.5;
    vec4 c = (texture(uSource, vUv + vec2(-o.x, -o.y)) + texture(uSource, vUv + vec2(o.x, -o.y))
            + texture(uSource, vUv + vec2(-o.x, o.y)) + texture(uSource, vUv + vec2(o.x, o.y))) * 0.25;
    float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    outColor = vec4(c.rgb * smoothstep(uThreshold, uThreshold + uSmoothing, lum), 1.0);
  }`;

  var FS_DOWN = COMMON + `
  in vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  out vec4 outColor;
  void main() {
    vec2 t = uTexel;
    vec3 A = texture(uSource, vUv + t * vec2(-1.0, -1.0)).rgb;
    vec3 B = texture(uSource, vUv + t * vec2(0.0, -1.0)).rgb;
    vec3 C = texture(uSource, vUv + t * vec2(1.0, -1.0)).rgb;
    vec3 D = texture(uSource, vUv + t * vec2(-0.5, -0.5)).rgb;
    vec3 E = texture(uSource, vUv + t * vec2(0.5, -0.5)).rgb;
    vec3 F = texture(uSource, vUv + t * vec2(-1.0, 0.0)).rgb;
    vec3 G = texture(uSource, vUv).rgb;
    vec3 H = texture(uSource, vUv + t * vec2(1.0, 0.0)).rgb;
    vec3 I = texture(uSource, vUv + t * vec2(-0.5, 0.5)).rgb;
    vec3 J = texture(uSource, vUv + t * vec2(0.5, 0.5)).rgb;
    vec3 K = texture(uSource, vUv + t * vec2(-1.0, 1.0)).rgb;
    vec3 L = texture(uSource, vUv + t * vec2(0.0, 1.0)).rgb;
    vec3 M = texture(uSource, vUv + t * vec2(1.0, 1.0)).rgb;
    vec3 o = (D + E + I + J) * 0.125 + (A + B + G + F) * 0.03125 + (B + C + H + G) * 0.03125
           + (F + G + L + K) * 0.03125 + (G + H + M + L) * 0.03125;
    outColor = vec4(o, 1.0);
  }`;

  var FS_UP = COMMON + `
  in vec2 vUv;
  uniform sampler2D uSource;      // smaller (blurrier) level
  uniform sampler2D uCurrent;     // this level
  uniform vec2 uTexel;
  uniform float uRadius;
  out vec4 outColor;
  void main() {
    vec2 t = uTexel;
    vec3 o = texture(uSource, vUv + t * vec2(-1.0, -1.0)).rgb + texture(uSource, vUv + t * vec2(0.0, -1.0)).rgb * 2.0
           + texture(uSource, vUv + t * vec2(1.0, -1.0)).rgb + texture(uSource, vUv + t * vec2(-1.0, 0.0)).rgb * 2.0
           + texture(uSource, vUv).rgb * 4.0 + texture(uSource, vUv + t * vec2(1.0, 0.0)).rgb * 2.0
           + texture(uSource, vUv + t * vec2(-1.0, 1.0)).rgb + texture(uSource, vUv + t * vec2(0.0, 1.0)).rgb * 2.0
           + texture(uSource, vUv + t * vec2(1.0, 1.0)).rgb;
    outColor = vec4(mix(texture(uCurrent, vUv).rgb, o / 16.0, uRadius), 1.0);
  }`;

  var FS_GAUSS = COMMON + `
  in vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uStep;
  out vec4 outColor;
  void main() {
    vec3 c = texture(uSource, vUv).rgb * 0.2270270270;
    c += (texture(uSource, vUv + uStep * 1.3846153846).rgb + texture(uSource, vUv - uStep * 1.3846153846).rgb) * 0.3162162162;
    c += (texture(uSource, vUv + uStep * 3.2307692308).rgb + texture(uSource, vUv - uStep * 3.2307692308).rgb) * 0.0702702703;
    outColor = vec4(c, 1.0);
  }`;

  var FS_COMPOSITE = COMMON + `
  in vec2 vUv;
  uniform sampler2D uScene, uBloom;
  uniform float uBloomIntensity, uExposure, uAspect, uTime, uGrain;
  uniform float uFlareOn, uFlareIntensity, uHalo, uStreaks, uGhosts, uSecondaryIntensity, uStreakLength, uVertical;
  uniform vec2  uCenter;
  uniform float uCenterVis;
  uniform vec2  uSecondary[5];
  uniform float uSecondaryVis[5];
  uniform vec3  uAmbient;
  uniform float uAmbientOpacity;
  out vec4 outColor;

  float softDisc(vec2 p, float radius, float softness) { return 1.0 - smoothstep(radius - softness, radius + softness, length(p)); }
  float softRing(vec2 p, float radius, float width) { return 1.0 - smoothstep(width, width * 2.0, abs(length(p) - radius)); }
  vec2 ac(vec2 p) { p.x *= uAspect; return p; }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  float secondaryFlare(vec2 center, vec2 uv) {
    vec2 p = ac(uv - center);
    float d = length(p);
    float nearHalo = exp(-d * d * 520.0) * 0.1;
    float halo = exp(-d * 17.0) * 0.055;
    float hw = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(p.x));
    float vw = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(p.y));
    hw = mix(hw, 1.0, step(0.99, uStreakLength));
    vw = mix(vw, 1.0, step(0.99, uStreakLength));
    float hs = exp(-abs(p.y) * 360.0) * exp(-abs(p.x) * 10.0) * hw * 0.24;
    float vs = exp(-abs(p.x) * 360.0) * exp(-abs(p.y) * 10.0) * vw * 0.24 * uVertical;
    return nearHalo + halo + hs + vs;
  }

  vec3 aces(vec3 c) {
    c *= uExposure / 0.6;
    vec3 x = vec3(0.59719 * c.r + 0.35458 * c.g + 0.04823 * c.b,
                  0.07600 * c.r + 0.90834 * c.g + 0.01566 * c.b,
                  0.02840 * c.r + 0.13383 * c.g + 0.83777 * c.b);
    vec3 a = x * (x + 0.0245786) - 0.000090537;
    vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
    x = a / b;
    return clamp(vec3(1.60475 * x.r - 0.53108 * x.g - 0.07367 * x.b,
                      -0.10208 * x.r + 1.10813 * x.g - 0.00605 * x.b,
                      -0.00327 * x.r - 0.07276 * x.g + 1.07602 * x.b), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }

  void main() {
    vec3 base = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomIntensity;
    // lens flare of the core
    vec2 s = ac(vUv - uCenter);
    float sd = length(s);
    float core = exp(-sd * sd * 480.0) * 0.18;
    float halo = exp(-sd * 11.5) * uHalo + softRing(s, 0.105, 0.006) * 0.05 * uHalo;
    float hw = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(s.x));
    float vw = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(s.y));
    hw = mix(hw, 1.0, step(0.99, uStreakLength));
    vw = mix(vw, 1.0, step(0.99, uStreakLength));
    float streak = (exp(-abs(s.y) * 310.0) * exp(-abs(s.x) * 7.5) * hw
                  + exp(-abs(s.y) * 78.0) * exp(-abs(s.x) * 5.2) * hw * 0.16
                  + (exp(-abs(s.x) * 310.0) * exp(-abs(s.y) * 7.5) * vw
                  + exp(-abs(s.x) * 78.0) * exp(-abs(s.y) * 5.2) * vw * 0.16) * uVertical) * uStreaks;
    vec2 axis = vec2(0.5) - uCenter;
    float ghosts = softDisc(ac(vUv - (uCenter + axis * 0.82)), 0.016, 0.014) * 0.18
                 + softRing(ac(vUv - (uCenter + axis * 1.38)), 0.046, 0.006) * 0.11
                 + softDisc(ac(vUv - (uCenter + axis * 1.82)), 0.025, 0.02) * 0.08;
    float flare = (core + halo + streak + ghosts * uGhosts) * uFlareIntensity * uCenterVis;
    float secondary = 0.0;
    for (int i = 0; i < 5; i++) secondary += secondaryFlare(uSecondary[i], vUv) * uSecondaryVis[i];
    secondary *= uFlareIntensity * uSecondaryIntensity;
    vec3 color = base + vec3(0.956) * (flare + secondary) * uFlareOn;
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    float reveal = smoothstep(0.025, 0.72, lum);
    float grain = hash(floor(vUv * vec2(1536.0, 1024.0)));
    color += vec3((grain - 0.5) * uGrain) * (0.18 + reveal * 0.82);
    color = toSrgb(aces(max(color, vec3(0.0))));
    // ambient light: a radial gradient towards the corners, added like CSS plus-lighter
    vec2 e = (vUv - 0.5) * vec2(uAspect, 1.0);
    float t = length(e) / length(vec2(uAspect, 1.0) * 0.5);
    color = min(color + uAmbient * (uAmbientOpacity * t * t), vec3(1.0));
    outColor = vec4(color, 1.0);
  }`;

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
    return s;
  }

  function program(gl, vs, fs) {
    var pr = gl.createProgram();
    gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    var u = {}, n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(pr, i), name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(pr, info.name);
    }
    return { p: pr, u: u };
  }

  root.AD_astraGL = function (canvas, params, opts, fig) {
    var gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'high-performance'
    });
    if (!gl) return null;
    if (!gl.getExtension('EXT_color_buffer_float')) return null;

    var p = Object.assign({}, params);
    var tabs = fig.armTables(p);
    var parts = fig.build(p);
    var spin = new fig.Spin(p);
    var progs;
    try {
      progs = {
        star: program(gl, VS_STAR, FS_STAR),
        pre: program(gl, VS_QUAD, FS_PREFILTER),
        down: program(gl, VS_QUAD, FS_DOWN),
        up: program(gl, VS_QUAD, FS_UP),
        gauss: program(gl, VS_QUAD, FS_GAUSS),
        comp: program(gl, VS_QUAD, FS_COMPOSITE)
      };
    } catch (e) {
      console.warn('astra: shader compilation failed, falling back to Canvas 2D', e);
      return null;
    }

    var quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var instBuf = gl.createBuffer(), vao = gl.createVertexArray(), quadVao = gl.createVertexArray();
    var armTex = gl.createTexture();
    var heroes = [];
    var coreHero = null;

    function makeTarget(w, h, linear) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return { tex: tex, fbo: fbo, w: w, h: h };
    }
    function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } }

    function uploadArms() {
      var K = tabs.length, M = fig.TABLE;
      var data = new Float32Array(K * M * 4);
      for (var k = 0; k < K; k++) data.set(tabs[k].pts, k * M * 4);
      gl.bindTexture(gl.TEXTURE_2D, armTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, M, K, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    var STRIDE = 28;
    function uploadInstances() {
      var n = parts.length, data = new Float32Array(n * STRIDE);
      heroes = []; coreHero = null;
      for (var i = 0; i < n; i++) {
        var q = parts[i], o = i * STRIDE;
        data[o] = q.kind; data[o + 1] = q.arm; data[o + 2] = q.prog; data[o + 3] = q.off;
        data[o + 4] = q.depth; data[o + 5] = q.bright; data[o + 6] = q.scale; data[o + 7] = q.opacity;
        data[o + 8] = q.twP; data[o + 9] = q.twR; data[o + 10] = q.hero; data[o + 11] = 0;
        data[o + 12] = q.col[0]; data[o + 13] = q.col[1]; data[o + 14] = q.col[2]; data[o + 15] = 0;
        data[o + 16] = q.sx; data[o + 17] = q.sy; data[o + 18] = q.sz; data[o + 19] = 0;
        data[o + 20] = q.px; data[o + 21] = q.py; data[o + 22] = q.pz; data[o + 23] = 0;
        if (q.hero && q.kind === 0 && heroes.length < 5) heroes.push(q);
        if (q.hero && q.kind === 2) coreHero = q;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      for (var a = 1; a <= 6; a++) {
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 4, gl.FLOAT, false, STRIDE * 4, (a - 1) * 16);
        gl.vertexAttribDivisor(a, 1);
      }
      gl.bindVertexArray(null);
      gl.bindVertexArray(quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }
    uploadArms();
    uploadInstances();

    var w = 0, h = 0, V = null;
    var scene = null, pre = null, mips = [], ups = [], blurA = null, blurB = null;
    var pointer = null, prevPointer = null;
    var t0 = performance.now(), last = t0, raf = 0, running = false, previewing = false;
    var pos = [0, 0, 0, 0, 0, 0, 0];

    function steadyTime() { return p.introDelay + p.introDuration + 1; }

    function resize() {
      var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var box = canvas.getBoundingClientRect();
      var cssW = Math.max(320, box.width), cssH = Math.max(240, box.height);
      var pr = fig.pixelRatio(p, root.devicePixelRatio || 1, cssW, cssH);
      w = Math.min(maxTex, Math.max(2, Math.round(cssW * pr)));
      h = Math.min(maxTex, Math.max(2, Math.round(cssH * pr)));
      canvas.width = w; canvas.height = h;
      V = fig.view(p, w, h, pr);
      freeTarget(scene); mips.forEach(freeTarget); ups.forEach(freeTarget); freeTarget(blurA); freeTarget(blurB);
      scene = makeTarget(w, h, true);
      mips = []; ups = [];
      // bloom runs at half resolution; the mip chain then halves `bloomLevels` more times
      var mw = Math.max(1, Math.round(w / 2)), mh = Math.max(1, Math.round(h / 2));
      freeTarget(pre);
      pre = makeTarget(mw, mh, true);
      blurA = makeTarget(mw, mh, true); blurB = makeTarget(mw, mh, true);
      for (var i = 0; i < Math.max(1, p.bloomLevels | 0); i++) {
        mw = Math.max(1, Math.round(mw / 2)); mh = Math.max(1, Math.round(mh / 2));
        mips.push(makeTarget(mw, mh, true));
        ups.push(makeTarget(mw, mh, true));
      }
    }

    function drawQuad(prog, target, source, extra) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, target ? target.w : w, target ? target.h : h);
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.tex);
      gl.uniform1i(prog.u.uSource, 0);
      if (extra) extra(prog.u);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }

    var armOffset = new Float32Array(8), armSpin = new Float32Array(16), secUv = new Float32Array(10), secVis = new Float32Array(5);

    function screenUv(q, t) {
      fig.evolve(q, p, t, tabs, V.aspect, pos);
      spin.apply(q, pos);
      var X = V.cx + pos[0] * V.scale, Y = V.cy - pos[1] * V.scale;
      return [X / w, 1 - Y / h];
    }
    function edgeFade(uv) {
      var m = Math.max(Math.abs(uv[0] * 2 - 1), Math.abs(uv[1] * 2 - 1));
      var t = Math.min(1, Math.max(0, (m - 0.88) / 0.2));
      return 1 - t * t * (3 - 2 * t);
    }

    function frame(now) {
      var t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      draw(t, dt);
      if (running) raf = requestAnimationFrame(frame);
    }

    function draw(t, dt) {
      var A = fig.introProgress(p, t), tt = fig.flowGate(p, A), ft = fig.flowTime(p, t);
      spin.step(dt, tt);
      var k;
      for (k = 0; k < 8; k++) {
        armOffset[k] = k < tabs.length ? ((tabs[k].speed * p.flowSpeed * ft) % 1 + 1) % 1 : 0;
        armSpin[k * 2] = k < spin.arms.length ? spin.arms[k].x : 0;
        armSpin[k * 2 + 1] = k < spin.arms.length ? spin.arms[k].y : 0;
      }
      var fh = fig.frameHeight(p, V.aspect);

      // 1 stars -> HDR scene
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      var s = progs.star, u = s.u;
      gl.useProgram(s.p);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, armTex);
      gl.uniform1i(u.uArms, 1);
      gl.uniform1i(u.uTableSize, fig.TABLE);
      gl.uniform1fv(u.uArmOffset, armOffset);
      gl.uniform2fv(u.uArmSpin, armSpin);
      gl.uniform2f(u.uCoreSpin, spin.core.x, spin.core.y);
      gl.uniform3f(u.uCoreRot, p.coreWobble[0] * Math.sin(p.coreWobble[1] * t) * tt,
                   p.coreWobble[2] * Math.cos(p.coreWobble[3] * t) * tt,
                   p.coreSpin * p.flowSpeed * ft * (p.flowInward ? 1 : -1));
      gl.uniform1f(u.uTime, t); gl.uniform1f(u.uIntro, A); gl.uniform1f(u.uGate, tt);
      gl.uniform2f(u.uScatter, fh * V.aspect * p.scatterMargin, fh * p.scatterMargin);
      gl.uniform1f(u.uTwinkleSpeed, p.twinkleSpeed); gl.uniform1f(u.uTwinkleAmp, p.twinkleAmp);
      gl.uniform1f(u.uPointTwinkle, p.pointTwinkle); gl.uniform1f(u.uOpacityTwinkle, p.opacityTwinkle);
      gl.uniform1f(u.uDensityFalloff, Math.min(Math.max(p.densityFalloff, 0), 0.98));
      gl.uniform1f(u.uSizeFalloff, Math.min(Math.max(p.sizeFalloff, 0), 1));
      gl.uniform1f(u.uSizeEnvFloor, p.sizeEnvFloor); gl.uniform1f(u.uSizeEnvPower, p.sizeEnvPower);
      gl.uniform1f(u.uEndFade, p.endFade);
      gl.uniform1f(u.uIntensity, p.starIntensity); gl.uniform1f(u.uCoreIntensityMul, p.coreIntensityMul);
      gl.uniform1f(u.uPointBase, p.pointBase); gl.uniform1f(u.uPointScale, p.pointScale); gl.uniform1f(u.uPointMinQuad, p.pointMinQuad);
      gl.uniform1f(u.uRevealDelayScale, p.revealDelayScale); gl.uniform1f(u.uRevealWindow, p.revealWindow);
      gl.uniform1f(u.uRevealFloor, p.revealFloor); gl.uniform1f(u.uOpacityRevealEnd, p.opacityRevealEnd);
      gl.uniform1f(u.uPullStart, p.pullStart); gl.uniform1f(u.uPullStartSpread, p.pullStartSpread);
      gl.uniform1f(u.uPullDuration, p.pullDuration); gl.uniform1f(u.uPullDurationSpread, p.pullDurationSpread);
      gl.uniform1f(u.uSwirl, p.swirl); gl.uniform1f(u.uSwirlSpread, p.swirlSpread);
      gl.uniform1f(u.uRayStart, p.rayStart); gl.uniform1f(u.uRayFull, p.rayFull);
      gl.uniform4f(u.uView, V.cx, V.cy, V.scale, V.px);
      gl.uniform2f(u.uResolution, w, h);
      gl.uniform1f(u.uDiscInner, p.discInner); gl.uniform1f(u.uDiscPower, p.discPower);
      gl.uniform1f(u.uRaySharpness, p.raySharpness); gl.uniform1f(u.uRayInner, p.rayInner); gl.uniform1f(u.uRayAmount, p.rayAmount);
      gl.uniform1f(u.uFilterArea, p.filterArea); gl.uniform1f(u.uFilterWhite, p.filterWhite);
      gl.uniform1f(u.uWhiteStart, p.whiteStart); gl.uniform1f(u.uWhiteFull, p.whiteFull); gl.uniform1f(u.uWhiteAmount, p.whiteAmount);
      gl.uniform1f(u.uColorEnergy, p.colorEnergy);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, parts.length);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);

      // 2 bloom
      drawQuad(progs.pre, pre, scene, function (uu) {
        gl.uniform2f(uu.uTexel, 1 / w, 1 / h);
        gl.uniform1f(uu.uThreshold, p.bloomThreshold); gl.uniform1f(uu.uSmoothing, p.bloomSmoothing);
      });
      var i;
      for (i = 0; i < mips.length; i++) {
        (function (src) {
          drawQuad(progs.down, mips[i], src, function (uu) { gl.uniform2f(uu.uTexel, 1 / src.w, 1 / src.h); });
        })(i === 0 ? pre : mips[i - 1]);
      }
      var lastUp = mips[mips.length - 1];
      for (i = mips.length - 2; i >= 0; i--) {
        (function (small, cur, dst) {
          drawQuad(progs.up, dst, small, function (uu) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, cur.tex);
            gl.uniform1i(uu.uCurrent, 1);
            gl.uniform2f(uu.uTexel, 1 / small.w, 1 / small.h);
            gl.uniform1f(uu.uRadius, p.bloomRadius);
          });
        })(lastUp, mips[i], ups[i]);
        lastUp = ups[i];
      }
      drawQuad(progs.gauss, blurA, lastUp, function (uu) { gl.uniform2f(uu.uStep, 1 / blurA.w, 0); });
      drawQuad(progs.gauss, blurB, blurA, function (uu) { gl.uniform2f(uu.uStep, 0, 1 / blurB.h); });

      // 3 composite: flare sources
      var centerUv = [0.5, 0.5], centerVis = 0;
      if (coreHero) {
        centerUv = screenUv(coreHero, t);
        var rl = fig.flareVisibility(coreHero, p, t, tabs);
        centerVis = rl * edgeFade(centerUv);
      }
      for (i = 0; i < 5; i++) {
        if (i < heroes.length) {
          var uv = screenUv(heroes[i], t);
          secUv[i * 2] = uv[0]; secUv[i * 2 + 1] = uv[1];
          secVis[i] = fig.flareVisibility(heroes[i], p, t, tabs) * edgeFade(uv);
        } else { secUv[i * 2] = -2; secUv[i * 2 + 1] = -2; secVis[i] = 0; }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      var c = progs.comp, cu = c.u;
      gl.useProgram(c.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex); gl.uniform1i(cu.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blurB.tex); gl.uniform1i(cu.uBloom, 1);
      gl.uniform1f(cu.uBloomIntensity, p.bloomIntensity); gl.uniform1f(cu.uExposure, p.exposure);
      gl.uniform1f(cu.uAspect, V.aspect); gl.uniform1f(cu.uTime, t); gl.uniform1f(cu.uGrain, p.grain);
      gl.uniform1f(cu.uFlareOn, p.flareEnabled ? 1 : 0); gl.uniform1f(cu.uFlareIntensity, p.flareIntensity);
      gl.uniform1f(cu.uHalo, p.flareHalo); gl.uniform1f(cu.uStreaks, p.flareStreaks); gl.uniform1f(cu.uGhosts, p.flareGhosts);
      gl.uniform1f(cu.uSecondaryIntensity, p.flareSecondary); gl.uniform1f(cu.uStreakLength, p.flareStreakLength);
      gl.uniform1f(cu.uVertical, p.flareVertical);
      gl.uniform2f(cu.uCenter, centerUv[0], centerUv[1]); gl.uniform1f(cu.uCenterVis, centerVis);
      gl.uniform2fv(cu.uSecondary, secUv); gl.uniform1fv(cu.uSecondaryVis, secVis);
      gl.uniform3f(cu.uAmbient, p.ambientColor[0] / 255, p.ambientColor[1] / 255, p.ambientColor[2] / 255);
      gl.uniform1f(cu.uAmbientOpacity, p.ambientOpacity);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }

    return {
      backend: 'webgl2',
      start: function () { if (running) return; running = true; resize(); last = performance.now(); raf = requestAnimationFrame(frame); },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      resize: resize,
      setParams: function (next) {
        var rebuild = fig.needsRebuild(p, next);
        p = Object.assign({}, p, next);
        spin.p = p;
        if (rebuild) {
          tabs = fig.armTables(p); parts = fig.build(p); spin = new fig.Spin(p);
          uploadArms(); uploadInstances();
        }
        if (w && (next.bloomLevels !== undefined || next.pixelBudget !== undefined || next.maxPixelRatio !== undefined)) resize();
        else if (w) V = fig.view(p, w, h, V.px);
        if (previewing) t0 = performance.now() - steadyTime() * 1000;
      },
      preview: function (on) {
        if (on) {
          if (!previewing) { previewing = true; t0 = performance.now() - steadyTime() * 1000; }
        } else if (previewing) {
          previewing = false; t0 = performance.now();
        }
      },
      setPointer: function (pt) {
        if (pt && pt.pressed && prevPointer && prevPointer.pressed) spin.drag(pt.x - prevPointer.x, pt.y - prevPointer.y);
        else if (!pt || !pt.pressed) { if (prevPointer && prevPointer.pressed) spin.release(); }
        prevPointer = pt ? { x: pt.x, y: pt.y, pressed: !!pt.pressed } : null;
        pointer = pt;
      },
      derived: function () { return fig.derived(p); },
      seek: function (seconds) { t0 = performance.now() - seconds * 1000; },
      replay: function () { t0 = performance.now(); }
    };
  };
})(window);
