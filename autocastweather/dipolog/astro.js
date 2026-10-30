// Sun and Moon rise/set for one place. Times in UTC ms. Accurate to about a minute.
var Astro = (function () {
  var R = Math.PI / 180, ARC = 206264.8062;
  function frac(x) { return x - Math.floor(x); }
  function jd(ms) { return ms / 86400000 + 2440587.5; }
  function eclToEq(lam, bet, T) {
    var e = (23.43929111 - 0.0130042 * T) * R;
    var ra = Math.atan2(Math.sin(lam) * Math.cos(e) - Math.tan(bet) * Math.sin(e), Math.cos(lam));
    var dec = Math.asin(Math.sin(bet) * Math.cos(e) + Math.cos(bet) * Math.sin(e) * Math.sin(lam));
    return [ra, dec];
  }
  function sun(T) {
    var M = 2 * Math.PI * frac(0.993133 + 99.997361 * T);
    var L = 2 * Math.PI * frac(0.7859453 + M / (2 * Math.PI) + (6893 * Math.sin(M) + 72 * Math.sin(2 * M) + 6191.2 * T) / 1296e3);
    return eclToEq(L, 0, T);
  }
  // Montenbruck & Pfleger "MiniMoon", plus main distance terms (Meeus)
  function moon(T) {
    var L0 = frac(0.606433 + 1336.855225 * T);
    var l = 2 * Math.PI * frac(0.374897 + 1325.552410 * T);
    var ls = 2 * Math.PI * frac(0.993133 + 99.997361 * T);
    var D = 2 * Math.PI * frac(0.827361 + 1236.853086 * T);
    var F = 2 * Math.PI * frac(0.259086 + 1342.227825 * T);
    var s = Math.sin;
    var dL = 22640 * s(l) - 4586 * s(l - 2 * D) + 2370 * s(2 * D) + 769 * s(2 * l) - 668 * s(ls) - 412 * s(2 * F)
      - 212 * s(2 * l - 2 * D) - 206 * s(l + ls - 2 * D) + 192 * s(l + 2 * D) - 165 * s(ls - 2 * D) - 125 * s(D)
      - 110 * s(l + ls) + 148 * s(l - ls) - 55 * s(2 * F - 2 * D);
    var S = F + (dL + 412 * s(2 * F) + 541 * s(ls)) / ARC, h = F - 2 * D;
    var N = -526 * s(h) + 44 * s(l + h) - 31 * s(-l + h) - 23 * s(ls + h) + 11 * s(-ls + h) - 25 * s(-2 * l + F) + 21 * s(-l + F);
    var lam = 2 * Math.PI * frac(L0 + dL / 1296e3), bet = (18520 * s(S) + N) / ARC;
    var c = Math.cos;
    var dist = 385000.56 - 20905.36 * c(l) - 3699.11 * c(2 * D - l) - 2955.97 * c(2 * D) - 569.93 * c(2 * l)
      + 48.89 * c(ls) - 3.15 * c(2 * F) + 246.16 * c(2 * l - 2 * D) - 152.14 * c(l + ls - 2 * D) - 170.73 * c(l + 2 * D)
      - 204.59 * c(ls - 2 * D) - 129.62 * c(l - ls) + 108.74 * c(D) + 104.76 * c(l + ls);
    var eq = eclToEq(lam, bet, T);
    eq.push(Math.asin(6378.14 / dist));
    return eq;
  }
  function alt(body, ms, lat, lon) {
    var J = jd(ms), T = (J - 2451545) / 36525, p = body === 'sun' ? sun(T) : moon(T);
    var gmst = (280.46061837 + 360.98564736629 * (J - 2451545)) * R;
    var H = gmst + lon * R - p[0], phi = lat * R;
    var a = Math.asin(Math.sin(phi) * Math.sin(p[1]) + Math.cos(phi) * Math.cos(p[1]) * Math.cos(H));
    var h0 = body === 'sun' ? -0.8333 * R : 0.7275 * p[2] - 0.5667 * R; // standard rise/set altitudes
    return a - h0;
  }
  // First rise ('rise') or set ('set') after fromMs, searched up to 2 days ahead.
  function next(body, kind, fromMs, lat, lon) {
    var step = 10 * 60000, t = fromMs, a = alt(body, t, lat, lon);
    for (var i = 0; i < 2 * 144; i++) {
      var t2 = t + step, a2 = alt(body, t2, lat, lon);
      if ((kind === 'rise' && a < 0 && a2 >= 0) || (kind === 'set' && a >= 0 && a2 < 0)) {
        var lo = t, hi = t2;
        for (var k = 0; k < 30; k++) {
          var m = (lo + hi) / 2, am = alt(body, m, lat, lon);
          if ((kind === 'rise') === (am < 0)) lo = m; else hi = m;
        }
        return (lo + hi) / 2;
      }
      t = t2; a = a2;
    }
    return null;
  }
  return { next: next };
})();
if (typeof module !== 'undefined') module.exports = Astro;
