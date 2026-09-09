(function (root) {
  'use strict';
  var F = root.AD_FIGURES = root.AD_FIGURES || {};
  var PI = Math.PI, TAU = Math.PI * 2;
  var TABLE = 512;
  var FLATTEN = 96;
  var SEED_STARS = 0x243f6a88, MIX_STARS = 0x9e3779b9;
  var SEED_COLORS = 0xa4093822, MIX_COLORS = 0x299f31d0;
  var SEED_CORE = 0xb7e15162, SEED_CORE_COLORS = 0xc0ac29b7;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function smootherstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function fract(x) { return x - Math.floor(x); }
  function pmod(x, m) { return ((x % m) + m) % m; }
  function hash2(a, b, ka, kb) { var s = 43758.5453 * Math.sin(a * ka + b * kb); return s - Math.floor(s); }
  function seedOf(base, mix, k, seed) { return (base ^ ((k + 1) * mix) ^ seed) >>> 0; }

  function parsePath(d) {
    var tk = d.match(/[MC]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    var segs = [], cmd = null, cur = null, i = 0;
    while (i < tk.length) {
      if (tk[i] === 'M' || tk[i] === 'C') { cmd = tk[i]; i++; continue; }
      if (cmd === 'M') { cur = [+tk[i], +tk[i + 1]]; i += 2; cmd = 'L'; continue; }
      if (cmd === 'C') {
        segs.push([cur[0], cur[1], +tk[i], +tk[i + 1], +tk[i + 2], +tk[i + 3], +tk[i + 4], +tk[i + 5]]);
        cur = [+tk[i + 4], +tk[i + 5]]; i += 6; continue;
      }
      i++;
    }
    return segs;
  }

  function bez(a, b, c, d, t) {
    var u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  function armTable(arm, k, p) {
    var segs = parsePath(arm.d);
    var sc = p.glyphHeight / p.svgBox[1];
    var cx = p.svgCenter[0], cy = p.svgCenter[1];
    var fx = [], fy = [], cum = [];
    var i, j, s;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      for (j = (i === 0 ? 0 : 1); j <= FLATTEN; j++) {
        var t = j / FLATTEN;
        var x = bez(s[0], s[2], s[4], s[6], t), y = bez(s[1], s[3], s[5], s[7], t);
        if (fx.length) {
          var dx = x - fx[fx.length - 1], dy = y - fy[fy.length - 1];
          cum.push(cum[cum.length - 1] + Math.sqrt(dx * dx + dy * dy));
        } else cum.push(0);
        fx.push(x); fy.push(y);
      }
    }
    var L = cum[cum.length - 1];
    var pts = new Float32Array(TABLE * 4);
    var depthPhase = p.depthPhaseStep * k;
    var q = 0;
    for (i = 0; i < TABLE; i++) {
      var u = i / (TABLE - 1), target = L * u;
      while (q < cum.length - 2 && cum[q + 1] < target) q++;
      var seg = cum[q + 1] - cum[q];
      var f = seg > 0 ? (target - cum[q]) / seg : 0;
      var sx = fx[q] + (fx[q + 1] - fx[q]) * f, sy = fy[q] + (fy[q + 1] - fy[q]) * f;
      pts[i * 4] = (sx - cx) * sc;
      pts[i * 4 + 1] = (cy - sy) * sc;
      pts[i * 4 + 2] = Math.sin(u * PI * p.depthWave + depthPhase) * arm.depth * p.rotationDepth * Math.sin(u * PI);
      pts[i * 4 + 3] = 0;
    }
    var r0 = pts[0] * pts[0] + pts[1] * pts[1];
    var e = (TABLE - 1) * 4, r1 = pts[e] * pts[e] + pts[e + 1] * pts[e + 1];
    var endNearer = r1 < r0;
    var dir = p.flowInward ? (endNearer ? 1 : -1) : (endNearer ? -1 : 1);
    return { pts: pts, length: L * sc, size: TABLE, dir: dir, speed: Math.abs(arm.speed) * dir,
             strong: !!arm.strong, depth: arm.depth };
  }

  function armTables(p) {
    return p.arms.map(function (arm, k) { return armTable(arm, k, p); });
  }

  function samplePath(tab, progress, out) {
    var sp = clamp(progress, 0, 1) * (tab.size - 1);
    var lo = Math.floor(sp), hi = Math.min(lo + 1, tab.size - 1), f = sp - lo;
    var a = lo * 4, b = hi * 4, q = tab.pts;
    out[0] = q[a] + (q[b] - q[a]) * f;
    out[1] = q[a + 1] + (q[b + 1] - q[a + 1]) * f;
    out[2] = q[a + 2] + (q[b + 2] - q[a + 2]) * f;
    return out;
  }


  function densityProgress(i, u) {
    var r = pmod(i, 1);
    return r + u * Math.sin(r * TAU) / TAU;
  }

  function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  function paletteColor(p, u) {
    var th = p.paletteThresholds, c = p.palette;
    var idx = c.length - 1;
    for (var i = 0; i < th.length; i++) if (u < th[i]) { idx = i; break; }
    return [srgbToLinear(c[idx][0] / 255), srgbToLinear(c[idx][1] / 255), srgbToLinear(c[idx][2] / 255)];
  }

  function build(p) {
    var tabs = armTables(p);
    var out = [];
    var density = Math.max(p.starDensity, 0.25);
    var k, o;
    for (k = 0; k < tabs.length; k++) {
      var tab = tabs[k];
      var n = Math.max(8, Math.round((tab.strong ? p.strongStars : p.weakStars) * density));
      var l = Math.ceil(p.backgroundShare * n / (1 - p.backgroundShare));
      var m = n + l;
      var B = new root.AD_Rng(seedOf(SEED_STARS, MIX_STARS, k, p.seed));
      var I = new root.AD_Rng(seedOf(SEED_COLORS, MIX_COLORS, k, p.seed));
      var heroChance = tab.strong ? p.heroChanceStrong : p.heroChanceWeak;
      var best = -Infinity, bestIdx = -1, first = out.length;
      for (o = 0; o < m; o++) {
        var i = B.next();
        var s = densityProgress(i, clamp(p.densityFalloff, 0, 1));
        var mid = Math.sin(clamp(s, 0, 1) * PI);
        var width = clamp(p.scatter, 0, 0.45) * lerp(0.3, 1, mid) * (0.22 + 0.78 * B.next());
        var d = (B.next() + B.next() - 1) * width;
        var dz = (B.next() + B.next() - 1) * width * p.scatterDepth;
        var chance = lerp(heroChance * p.heroEndFactor, heroChance, mid);
        var hero = B.next() < chance;
        var scale = (hero ? 0.85 + 1.25 * B.next() : 0.12 + Math.pow(B.next(), 2.4) * 0.68) * p.starSize;
        var bright = (hero ? 2 + 1.5 * B.next() : 0.56 + 0.78 * B.next()) * (tab.strong ? 1 : p.weakBrightness);
        var col = paletteColor(p, I.next());
        var opacity = 0.82 + 0.16 * B.next();
        var twP = B.next() * TAU;
        var twR = 0.65 + 0.7 * B.next();
        var q = { kind: o < n ? 0 : 1, arm: k, prog: i, off: d, depth: dz,
                  bright: bright, scale: scale, opacity: opacity, col: col, hero: 0,
                  twP: twP, twR: twR, px: 0, py: 0, pz: 0 };
        q.sx = hash2(i, twP, 127.1, 311.7);
        q.sy = hash2(twP, scale, 269.5, 183.3);
        q.sz = hash2(i, bright, 419.2, 371.9);
        out.push(q);
        if (o < n && scale > best) { best = scale; bestIdx = first + o; }
      }
      if (bestIdx >= 0) {
        var h = out[bestIdx];
        h.scale = Math.max(h.scale, (tab.strong ? p.flareScaleStrong : p.flareScaleWeak) * p.starSize);
        h.bright = Math.max(h.bright, tab.strong ? p.flareBrightStrong : p.flareBrightWeak);
        h.hero = 1;
        h.col = paletteColor(p, p.flareColorSeeds[k % p.flareColorSeeds.length]);
      }
    }

    var nc = p.showCore ? Math.max(p.coreStarsMin, Math.round(p.coreStars * density)) : 0;
    if (nc > 0) {
      var G = new root.AD_Rng((SEED_CORE ^ p.seed) >>> 0);
      var Pc = new root.AD_Rng((SEED_CORE_COLORS ^ p.seed) >>> 0);
      var cbest = -Infinity, cIdx = -1, cfirst = out.length;
      for (o = 0; o < nc; o++) {
        var a = Math.pow(G.next(), 2.4) * p.coreRadius;
        var ang = G.next() * TAU;
        var px = Math.cos(ang) * a, py = Math.sin(ang) * a * p.coreFlatten, pz = (G.next() - 0.5) * p.coreDepth;
        var v = 1 - a / p.coreRadius;
        var cb = 1.2 + 2.8 * v + 0.6 * G.next();
        var ccol = paletteColor(p, v > 0.74 ? 0.99 : Pc.next());
        var cop = 0.62 + 0.38 * v;
        var cs = (0.28 + 1.45 * v + 0.45 * G.next()) * p.starSize * 0.8;
        var ctp = G.next() * TAU, ctr = 0.55 + 0.45 * G.next();
        var cq = { kind: 2, arm: 0, prog: 0, off: 0, depth: 0, bright: cb, scale: cs, opacity: cop, col: ccol,
                   hero: 0, twP: ctp, twR: ctr, px: px, py: py, pz: pz };
        cq.sx = hash2(0, ctp, 127.1, 311.7);
        cq.sy = hash2(ctp, cs, 269.5, 183.3);
        cq.sz = hash2(0, cb, 419.2, 371.9);
        out.push(cq);
        if (cb * cs > cbest) { cbest = cb * cs; cIdx = cfirst + o; }
      }
      if (cIdx >= 0) out[cIdx].hero = 1;
    }
    return out;
  }

  function derived(p) {
    var tabs = armTables(p);
    var density = Math.max(p.starDensity, 0.25);
    var counts = tabs.map(function (t) { return Math.max(8, Math.round((t.strong ? p.strongStars : p.weakStars) * density)); });
    var bg = counts.map(function (n) { return Math.ceil(p.backgroundShare * n / (1 - p.backgroundShare)); });
    var core = p.showCore ? Math.max(p.coreStarsMin, Math.round(p.coreStars * density)) : 0;
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    var flow = p.flowSpeed;
    return {
      armCount: tabs.length,
      armLength: tabs.map(function (t) { return t.length; }),
      armStars: counts,
      backgroundStars: sum(bg),
      coreStars: core,
      totalStars: sum(counts) + sum(bg) + core,
      crossing: tabs.map(function (t) { return flow > 0 ? 1 / (Math.abs(t.speed) * flow) : Infinity; }),
      linearSpeed: tabs.map(function (t) { return t.length * Math.abs(t.speed) * flow; }),
      corePeriod: flow > 0 && p.coreSpin > 0 ? TAU / (p.coreSpin * flow) : Infinity,
      glyphSpan: p.glyphHeight / p.frameHeight,
      introEnd: p.introDelay + p.introDuration,
      flowStart: p.introDelay + p.introDuration * p.flowGateStart
    };
  }


  function introProgress(p, t) { return clamp((t - p.introDelay) / p.introDuration, 0, 1); }

  function flowGate(p, A) { return smoothstep(p.flowGateStart, 1, A); }

  function flowTime(p, t) {
    var T = p.introDuration, a = p.flowGateStart;
    var t0 = p.introDelay + a * T, t1 = p.introDelay + T;
    if (t <= t0) return 0;
    var w = (1 - a) * T;
    if (t >= t1) return w * 0.5 + (t - t1);
    var x = (t - t0) / w;
    return w * (x * x * x - 0.5 * x * x * x * x);
  }

  function frameHeight(p, aspect) { return aspect < p.narrowAspect ? p.frameHeightNarrow : p.frameHeight; }

  function revealProgress(p, A, seed) {
    var delay = seed * p.revealDelayScale;
    return smoothstep(delay, p.revealWindow + delay, A) * lerp(p.revealFloor, 1, smoothstep(p.revealFloor, 1, A));
  }

  function introMotion(pos, sc, A, seed, travelSeed, p) {
    if (A >= 1) return;
    var start = p.pullStart + seed * p.pullStartSpread;
    var dur = p.pullDuration + travelSeed * p.pullDurationSpread;
    var local = clamp((A - start) / dur, 0, 1);
    var sp = local * local * local * (local * (local * 6 - 15) + 10);
    var pull = lerp(sp, Math.sin(sp * PI * 0.5), 0.5);
    var ang = Math.sin(pull * PI) * (p.swirl + seed * p.swirlSpread);
    var c = Math.cos(ang), s = Math.sin(ang);
    var ox = sc[0] * c - sc[1] * s, oy = sc[0] * s + sc[1] * c;
    pos[0] = lerp(ox, pos[0], pull);
    pos[1] = lerp(oy, pos[1], pull);
    pos[2] = lerp(sc[2], pos[2], pull);
  }

  var _P = [0, 0, 0], _Pa = [0, 0, 0], _Pb = [0, 0, 0], _SC = [0, 0, 0];

  function evolve(q, p, t, tabs, aspect, out) {
    var A = introProgress(p, t);
    var tt = flowGate(p, A);
    var ft = flowTime(p, t);
    var fh = frameHeight(p, aspect);
    var SX = fh * aspect * p.scatterMargin, SY = fh * p.scatterMargin;
    var tw = 1 - p.twinkleAmp + p.twinkleAmp * Math.sin(q.twP + t * p.twinkleSpeed * tt * q.twR);
    var sizeEnv = 1, endVis = 1, bright, size;
    var pos = _P;
    if (q.kind === 2) {
      var rx = p.coreWobble[0] * Math.sin(p.coreWobble[1] * t) * tt;
      var ry = p.coreWobble[2] * Math.cos(p.coreWobble[3] * t) * tt;
      var rz = p.coreSpin * p.flowSpeed * ft * (p.flowInward ? 1 : -1);
      var cz = Math.cos(rz), sz = Math.sin(rz);
      var x1 = q.px * cz - q.py * sz, y1 = q.px * sz + q.py * cz, z1 = q.pz;
      var cy = Math.cos(ry), sy = Math.sin(ry);
      var x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
      var cx = Math.cos(rx), sx = Math.sin(rx);
      pos[0] = x2; pos[1] = y2 * cx - z2 * sx; pos[2] = y2 * sx + z2 * cx;
      bright = p.starIntensity * p.coreIntensityMul * q.bright * tw;
      size = (p.pointBase + q.scale * p.pointScale) * (1 - p.pointTwinkle + p.pointTwinkle * tw);
    } else {
      var tab = tabs[q.arm];
      var off = pmod(tab.speed * p.flowSpeed * ft, 1);
      var phase = fract(q.prog + off);
      var prog = densityProgress(phase, clamp(p.densityFalloff, 0, 0.98));
      var mid = Math.sin(clamp(prog, 0, 1) * PI);
      sizeEnv = lerp(1, p.sizeEnvFloor + (1 - p.sizeEnvFloor) * Math.pow(Math.max(mid, 0), p.sizeEnvPower), clamp(p.sizeFalloff, 0, 1));
      endVis = smoothstep(0, p.endFade, prog) * (1 - smoothstep(1 - p.endFade, 1, prog));
      if (q.kind === 0) {
        var step = 1 / (tab.size - 1);
        samplePath(tab, prog, pos);
        samplePath(tab, Math.max(prog - step, 0), _Pb);
        samplePath(tab, Math.min(prog + step, 1), _Pa);
        var tx = _Pa[0] - _Pb[0], ty = _Pa[1] - _Pb[1], tz = _Pa[2] - _Pb[2];
        var tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
        tx /= tl; ty /= tl;
        var al = Math.sqrt(tx * tx + ty * ty) || 1;
        pos[0] += (-ty / al) * q.off;
        pos[1] += (tx / al) * q.off;
        pos[2] += q.depth;
      } else {
        pos[0] = (q.sx - 0.5) * SX; pos[1] = (fract(q.sy) - 0.5) * SY; pos[2] = (q.sz - 0.5) * 0.5;
      }
      bright = p.starIntensity * q.bright * tw;
      size = (p.pointBase + q.scale * sizeEnv * endVis * p.pointScale) * (1 - p.pointTwinkle + p.pointTwinkle * tw);
    }
    _SC[0] = (q.sx - 0.5) * SX; _SC[1] = (fract(q.sy) - 0.5) * SY; _SC[2] = (q.sz - 0.5) * 0.5;
    var Ai = q.kind === 1 ? 1 : A;
    introMotion(pos, _SC, Ai, q.sz, q.sy, p);
    var rl = revealProgress(p, A, q.sz);
    if (q.kind === 1) rl = Math.min(rl, p.revealFloor);
    var opacity = q.opacity * endVis * (1 - p.opacityTwinkle + p.opacityTwinkle * tw) * smoothstep(0, p.opacityRevealEnd, rl);
    size *= Math.sqrt(rl);
    out[0] = pos[0]; out[1] = pos[1]; out[2] = pos[2];
    out[3] = size;
    out[4] = bright;
    out[5] = opacity;
    out[6] = smoothstep(p.rayStart, p.rayFull, q.bright);
    return out;
  }

  function flareVisibility(q, p, t, tabs) {
    var A = introProgress(p, t), rl = revealProgress(p, A, q.sz);
    var v = Math.sqrt(rl) * smoothstep(0, p.opacityRevealEnd, rl);
    if (q.kind === 0) {
      var tab = tabs[q.arm];
      var prog = densityProgress(fract(q.prog + pmod(tab.speed * p.flowSpeed * flowTime(p, t), 1)), clamp(p.densityFalloff, 0, 0.98));
      var mid = Math.sin(clamp(prog, 0, 1) * PI);
      v *= smoothstep(0, p.endFade, prog) * (1 - smoothstep(1 - p.endFade, 1, prog))
         * lerp(1, p.sizeEnvFloor + (1 - p.sizeEnvFloor) * Math.pow(Math.max(mid, 0), p.sizeEnvPower), clamp(p.sizeFalloff, 0, 1));
    }
    return clamp(v, 0, 1);
  }


  function cubicCoverage(x) {
    x = Math.abs(x);
    if (x < 1) return (4 - 6 * x * x + 3 * x * x * x) / 6;
    var tail = Math.max(2 - x, 0);
    return tail * tail * tail / 6;
  }

  function pointProfile(px, py, diam, rays, bright, p, out) {
    var qd = Math.max(diam, p.pointMinQuad);
    var nx = px * 2 / Math.max(diam, 1e-4), ny = py * 2 / Math.max(diam, 1e-4);
    var dist = Math.sqrt(nx * nx + ny * ny);
    var disc = 1 - smoothstep(p.discInner, 1, dist);
    var core = Math.pow(disc, p.discPower);
    var hr = Math.exp(-Math.abs(ny) * p.raySharpness) * (1 - smoothstep(p.rayInner, 1, Math.abs(nx)));
    var vr = Math.exp(-Math.abs(nx) * p.raySharpness) * (1 - smoothstep(p.rayInner, 1, Math.abs(ny)));
    var ray = Math.max(hr, vr) * p.rayAmount * rays;
    var resolved = smoothstep(p.pointMinQuad * 0.5, p.pointMinQuad, diam);
    var filtered = cubicCoverage(px) * cubicCoverage(py) * p.filterArea * diam * diam;
    var alpha = lerp(filtered, Math.max(core, ray), resolved);
    var white = lerp(p.filterWhite, core, resolved) * smoothstep(p.whiteStart, p.whiteFull, bright) * p.whiteAmount;
    out[0] = alpha; out[1] = white;
    if (Math.abs(px) > qd * 0.5 || Math.abs(py) > qd * 0.5) { out[0] = 0; out[1] = 0; }
    return out;
  }

  function acesChannel(v) {
    return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  }
  function tonemap(r, g, b, exposure, out) {
    var s = exposure / 0.6;
    r *= s; g *= s; b *= s;
    var x = 0.59719 * r + 0.35458 * g + 0.04823 * b;
    var y = 0.07600 * r + 0.90834 * g + 0.01566 * b;
    var z = 0.02840 * r + 0.13383 * g + 0.83777 * b;
    x = acesChannel(x); y = acesChannel(y); z = acesChannel(z);
    out[0] = clamp(1.60475 * x - 0.53108 * y - 0.07367 * z, 0, 1);
    out[1] = clamp(-0.10208 * x + 1.10813 * y - 0.00605 * z, 0, 1);
    out[2] = clamp(-0.00327 * x - 0.07276 * y + 1.07602 * z, 0, 1);
    return out;
  }
  function srgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

  var STRUCTURAL = ['seed', 'arms', 'glyphHeight', 'svgBox', 'svgCenter', 'depthWave', 'depthPhaseStep', 'rotationDepth',
                    'flowInward', 'starDensity', 'strongStars', 'weakStars', 'backgroundShare', 'densityFalloff', 'scatter',
                    'scatterDepth', 'heroChanceStrong', 'heroChanceWeak', 'heroEndFactor', 'starSize', 'weakBrightness',
                    'palette', 'paletteThresholds', 'flareScaleStrong', 'flareScaleWeak', 'flareBrightStrong', 'flareBrightWeak',
                    'flareColorSeeds', 'showCore', 'coreStars', 'coreStarsMin', 'coreRadius', 'coreFlatten', 'coreDepth'];

  function needsRebuild(prev, next) {
    return STRUCTURAL.some(function (k) {
      return k in next && JSON.stringify(next[k]) !== JSON.stringify(prev[k]);
    });
  }

  function pixelRatio(p, dpr, cssW, cssH) {
    var n = Math.min(p.maxPixelRatio, Math.max(0.5, Math.sqrt(p.pixelBudget / (cssW * cssH))));
    return Math.min(n, Math.max(0.1, dpr));
  }

  function view(p, w, h, bufferScale) {
    var aspect = w / h;
    var fh = frameHeight(p, aspect);
    var S = h / fh;
    return { w: w, h: h, aspect: aspect, scale: S, cx: w * 0.5, cy: h * 0.5 + p.cameraY * S, px: bufferScale };
  }

  function Spin(p) {
    this.p = p; this.tx = 0; this.ty = 0; this.returning = true;
    this.arms = p.arms.map(function (a, k) { return { x: 0, y: 0, lag: p.orbitLagBase + p.orbitLagStep * k }; });
    this.core = { x: 0, y: 0 };
  }
  Spin.prototype.drag = function (dx, dy) {
    var m = this.p.maxTilt;
    this.ty = clamp(this.ty + dx * this.p.dragSensitivity, -m, m);
    this.tx = clamp(this.tx + dy * this.p.dragSensitivity, -m, m);
    this.returning = false;
  };
  Spin.prototype.release = function () { this.tx = 0; this.ty = 0; this.returning = true; };
  Spin.prototype.step = function (dt, tt) {
    var p = this.p, base = this.returning ? p.returnDamping : p.followDamping;
    var k = 1 - Math.exp(-base * dt);
    this.core.x = lerp(this.core.x, this.tx, k); this.core.y = lerp(this.core.y, this.ty, k);
    for (var i = 0; i < this.arms.length; i++) {
      var a = this.arms[i], ka = 1 - Math.exp(-(base / (1 + a.lag * p.rotationLag * 2.5)) * dt);
      a.x = lerp(a.x, this.tx, ka); a.y = lerp(a.y, this.ty, ka);
    }
    this.tt = tt;
  };
  Spin.prototype.apply = function (q, pos) {
    var r = q.kind === 0 || q.kind === 1 ? this.arms[q.arm] : this.core;
    var rx = r.x * (this.tt || 0), ry = r.y * (this.tt || 0);
    if (rx === 0 && ry === 0) return pos;
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var x1 = pos[0] * cy + pos[2] * sy, z1 = -pos[0] * sy + pos[2] * cy;
    var cx = Math.cos(rx), sx = Math.sin(rx);
    pos[0] = x1; var y1 = pos[1] * cx - z1 * sx; pos[2] = pos[1] * sx + z1 * cx; pos[1] = y1;
    return pos;
  };


  function create(canvas, params, opts) {
    opts = opts || {};
    if (!opts.force2d && typeof root.AD_astraGL === 'function') {
      try {
        var glCtrl = root.AD_astraGL(canvas, params, opts, F.astra);
        if (glCtrl) return glCtrl;
      } catch (e) {
        console.warn('astra: WebGL backend unavailable, falling back to Canvas 2D', e);
      }
    }
    return create2d(canvas, params, opts);
  }

  function create2d(canvas, params, opts) {
    var ctx = canvas.getContext('2d');
    var p = Object.assign({}, params);
    var tabs = armTables(p);
    var parts = build(p);
    var spin = new Spin(p);
    var acc = document.createElement('canvas'), accCtx = acc.getContext('2d');
    var mips = [], w = 0, h = 0, V = null;
    var sprites = {};
    var t0 = performance.now(), last = t0, raf = 0, running = false, previewing = false;
    var pointer = null, prevPointer = null;
    var pos = [0, 0, 0, 0, 0, 0, 0], prof = [0, 0], tm = [0, 0, 0];

    function steadyTime() { return p.introDelay + p.introDuration + 1; }

    function resize() {
      var box = canvas.getBoundingClientRect();
      var cssW = Math.max(320, box.width), cssH = Math.max(240, box.height);
      var pr = pixelRatio(p, Math.min(root.devicePixelRatio || 1, 2), cssW, cssH);
      w = Math.max(2, Math.round(cssW * pr)); h = Math.max(2, Math.round(cssH * pr));
      canvas.width = w; canvas.height = h; acc.width = w; acc.height = h;
      V = view(p, w, h, pr);
      mips = [];
      var mw = w, mh = h;
      for (var i = 0; i < p.bloomLevels; i++) {
        mw = Math.max(1, Math.round(mw / 2)); mh = Math.max(1, Math.round(mh / 2));
        var c = document.createElement('canvas'); c.width = mw; c.height = mh;
        mips.push({ c: c, g: c.getContext('2d') });
      }
      sprites = {};
    }

    function sprite(diam, rays, bright, col) {
      var di = Math.min(64, Math.round(diam * 2)), ri = Math.round(rays * 4), bi = Math.round(Math.min(bright, 4) * 4);
      var key = di + ':' + ri + ':' + bi + ':' + col.join(',');
      var hit = sprites[key];
      if (hit) return hit;
      var d = Math.max(di / 2, 0.5), qd = Math.max(d, p.pointMinQuad), rad = Math.ceil(qd / 2) + 1, n = rad * 2 + 1;
      var c = document.createElement('canvas'); c.width = c.height = n;
      var g = c.getContext('2d'), img = g.createImageData(n, n), data = img.data, o = 0;
      var energy = 1 + (1 - Math.min(col[0], col[1], col[2])) * p.colorEnergy;
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++, o += 4) {
        pointProfile(x - rad, y - rad, d, ri / 4, bi / 4, p, prof);
        var a = prof[0], wc = prof[1];
        var r = lerp(col[0], 1, wc) * bright * energy * a, gg = lerp(col[1], 1, wc) * bright * energy * a, b = lerp(col[2], 1, wc) * bright * energy * a;
        tonemap(r, gg, b, p.exposure, tm);
        data[o] = Math.round(255 * srgb(tm[0])); data[o + 1] = Math.round(255 * srgb(tm[1])); data[o + 2] = Math.round(255 * srgb(tm[2])); data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      hit = { c: c, rad: rad };
      sprites[key] = hit;
      return hit;
    }

    function frame(now) {
      var t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      draw(t, dt);
      if (running) raf = requestAnimationFrame(frame);
    }

    function draw(t, dt) {
      var A = introProgress(p, t), tt = flowGate(p, A);
      spin.step(dt, tt);
      var g = accCtx;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        evolve(q, p, t, tabs, V.aspect, pos);
        if (pos[5] <= 0.002 || pos[3] <= 0) continue;
        spin.apply(q, pos);
        var x = V.cx + pos[0] * V.scale, y = V.cy - pos[1] * V.scale;
        var diam = pos[3] * V.px;
        var sp = sprite(diam, pos[6], pos[4], q.col);
        if (x + sp.rad < 0 || y + sp.rad < 0 || x - sp.rad > w || y - sp.rad > h) continue;
        g.globalAlpha = Math.min(1, pos[5]);
        g.drawImage(sp.c, Math.round(x) - sp.rad, Math.round(y) - sp.rad);
      }
      g.globalAlpha = 1;
      var src = acc;
      for (var m = 0; m < mips.length; m++) {
        var mp = mips[m]; mp.g.globalCompositeOperation = 'source-over'; mp.g.globalAlpha = 1;
        mp.g.clearRect(0, 0, mp.c.width, mp.c.height);
        mp.g.drawImage(src, 0, 0, mp.c.width, mp.c.height); src = mp.c;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(acc, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      for (m = 0; m < mips.length; m++) {
        ctx.globalAlpha = p.bloomIntensity * Math.pow(p.bloomRadius, m + 1) * 0.5;
        ctx.drawImage(mips[m].c, 0, 0, w, h);
      }
      var grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.sqrt(w * w + h * h) / 2);
      var ac = p.ambientColor;
      grad.addColorStop(0, 'rgba(' + ac.join(',') + ',0)');
      grad.addColorStop(0.5, 'rgba(' + ac.join(',') + ',' + (0.25 * p.ambientOpacity) + ')');
      grad.addColorStop(1, 'rgba(' + ac.join(',') + ',' + p.ambientOpacity + ')');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    return {
      backend: 'canvas2d',
      start: function () { if (running) return; running = true; resize(); last = performance.now(); raf = requestAnimationFrame(frame); },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      resize: resize,
      setParams: function (next) {
        var rebuild = needsRebuild(p, next);
        p = Object.assign({}, p, next);
        spin.p = p;
        if (rebuild) {
          tabs = armTables(p); parts = build(p); spin = new Spin(p);
        }
        if (w) { V = view(p, w, h, V.px); sprites = {}; }
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
      derived: function () { return derived(p); },
      seek: function (seconds) { t0 = performance.now() - seconds * 1000; },
      replay: function () { t0 = performance.now(); }
    };
  }

  F.astra = { build: build, derived: derived, create: create, create2d: create2d,
              armTables: armTables, samplePath: samplePath, evolve: evolve, flareVisibility: flareVisibility,
              introProgress: introProgress, flowGate: flowGate, flowTime: flowTime, frameHeight: frameHeight,
              pointProfile: pointProfile, tonemap: tonemap, srgb: srgb, pixelRatio: pixelRatio, view: view, Spin: Spin,
              needsRebuild: needsRebuild, parsePath: parsePath, TABLE: TABLE };
})(typeof window !== 'undefined' ? window : globalThis);
