(function (root) {
  'use strict';

  function Rng(seed) {
    this.a = seed >>> 0;
  }

  Rng.prototype.next = function () {
    this.a = (this.a + 0x6D2B79F5) >>> 0;
    var a = this.a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };

  Rng.prototype.range = function (lo, hi) {
    return lo + (hi - lo) * this.next();
  };

  Rng.prototype.gauss = function () {
    var u1 = Math.max(this.next(), 1e-12);
    var u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  root.AD_Rng = Rng;
})(typeof window !== 'undefined' ? window : globalThis);
