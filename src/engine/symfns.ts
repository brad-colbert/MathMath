// MathMath: math on paper, in the browser.
// Copyright (C) 2026 Pelican Labs, LLC
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
// General Public License as published by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
// implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
// License for more details.
//
// You should have received a copy of the GNU Affero General Public License along with this program. If not,
// see <https://www.gnu.org/licenses/>.

/**
 * The functions Mathcad 14 has only symbolically (its "Symbolic Only" category), here also with =, as Mathcad can't:
 * Si, Ci, Shi, Chi, Ei and Ei(n, x), FresnelS, FresnelC, dilog, Zeta, Psi and Psi(n, x), LambertW and LambertW(n, x),
 * IsPrime, and numer and denom, which stay symbolic. Their conventions are Mathcad 14's, probed with its float
 * keyword (2026-11-11): FresnelS(x) = ∫₀ˣ sin(πt²/2) dt; dilog(x) = Li₂(1 − x), so dilog(2) = −π²/12 and dilog(−1)
 * = π²/4 − iπ·ln 2; Ei(n, x) = Eₙ(x); Ci and Chi of a negative x add iπ.
 *
 * The methods are the standard ones: Numerical Recipes' cisi, ei, expint and frenel (series and continued fractions),
 * Borwein's alternating series for ζ with the reflection formula below ½, recurrence and asymptotic series for the
 * polygamma functions, Halley's iteration for W, and Miller–Rabin for primes.
 */
import { type C, cdiv, cmul } from './complex.js';
import { gammaReal, lnGammaComplex } from './special.js';
import { EvalError, type Value, isNoDim, num } from './values.js';

type Impl = (...args: Value[]) => Value;

const EPS = 1e-16;
const FPMIN = 1e-300;
const MAXIT = 200;
const EULER = 0.5772156649015329;

export const SYMFN_ARITY: Record<string, [number, number]> = {
  Si: [1, 1], Ci: [1, 1], Shi: [1, 1], Chi: [1, 1], Ei: [1, 2], FresnelS: [1, 1], FresnelC: [1, 1], dilog: [1, 1],
  Zeta: [1, 1], Psi: [1, 2], LambertW: [1, 2], IsPrime: [1, 1], numer: [1, 1], denom: [1, 1],
};

function real(v: Value | undefined, fn: string, what = 'x'): number {
  if (v?.t !== 'num' || !isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must be a number without units`);
  if (v.im !== 0) throw new EvalError('runtime', `${fn} takes a real ${what} here`);
  return v.re;
}

function whole(v: Value | undefined, fn: string, what: string, min: number): number {
  const n = real(v, fn, what);
  if (!Number.isInteger(n) || n < min) throw new EvalError('runtime', `${fn}'s ${what} must be a whole number, ${min} or more`);
  return n;
}

const pole = (fn: string, x: number): EvalError => new EvalError('runtime', `${fn} has a singularity at ${x}`);

// ── Sine and cosine integrals, Numerical Recipes' cisi ───────────────────────────────────────────────

function cisi(x: number): { si: number; ci: number } {
  const t = Math.abs(x);
  if (t === 0) return { si: 0, ci: -Infinity };
  let si: number;
  let ci: number;
  if (t > 2) {
    let b: C = [1, t];
    let c: C = [1 / FPMIN, 0];
    let d = cdiv([1, 0], b);
    let h = d;
    for (let i = 2; i <= MAXIT; i++) {
      const a = -(i - 1) * (i - 1);
      b = [b[0] + 2, b[1]];
      d = cdiv([1, 0], [a * d[0] + b[0], a * d[1] + b[1]]);
      c = [b[0] + cdiv([a, 0], c)[0], b[1] + cdiv([a, 0], c)[1]];
      const del = cmul(c, d);
      h = cmul(h, del);
      if (Math.abs(del[0] - 1) + Math.abs(del[1]) < EPS) break;
    }
    h = cmul([Math.cos(t), -Math.sin(t)], h);
    ci = -h[0];
    si = Math.PI / 2 + h[1];
  } else {
    let sum = 0;
    let sums = 0;
    let sumc = 0;
    let sign = 1;
    let fact = 1;
    let odd = true;
    for (let k = 1; k <= MAXIT; k++) {
      fact *= t / k;
      const term = fact / k;
      sum += sign * term;
      const err = term / Math.abs(sum);
      if (odd) {
        sign = -sign;
        sums = sum;
        sum = sumc;
      } else {
        sumc = sum;
        sum = sums;
      }
      if (err < EPS) break;
      odd = !odd;
    }
    si = sums;
    ci = sumc + Math.log(t) + EULER;
  }
  return { si: x < 0 ? -si : si, ci };
}

// ── Exponential integrals, Numerical Recipes' ei and expint ──────────────────────────────────────────

/** Ei(x) for x > 0. */
function eiPositive(x: number): number {
  if (x < FPMIN) return Math.log(x) + EULER;
  if (x <= -Math.log(EPS)) {
    let sum = 0;
    let fact = 1;
    for (let k = 1; k <= MAXIT; k++) {
      fact *= x / k;
      const term = fact / k;
      sum += term;
      if (term < EPS * sum) break;
    }
    return sum + Math.log(x) + EULER;
  }
  let sum = 0;
  let term = 1;
  for (let k = 1; k <= MAXIT; k++) {
    const prev = term;
    term *= k / x;
    if (term < EPS) break;
    if (term < prev) sum += term;
    else {
      sum -= prev;
      break;
    }
  }
  // eˣ/x as one exponential, so it holds up to x of about 717, where Ei itself passes 10³⁰⁸.
  return Math.exp(x - Math.log(x)) * (1 + sum);
}

/** Eₙ(x) for whole n ≥ 0 and x ≥ 0. */
function expint(n: number, x: number): number {
  const nm1 = n - 1;
  if (n === 0) return Math.exp(-x) / x;
  if (x === 0) {
    if (nm1 === 0) return Infinity;
    return 1 / nm1;
  }
  if (x > 1) {
    let b = x + n;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= MAXIT; i++) {
      const a = -i * (nm1 + i);
      b += 2;
      d = 1 / (a * d + b);
      c = b + a / c;
      const del = c * d;
      h *= del;
      if (Math.abs(del - 1) < EPS) return h * Math.exp(-x);
    }
    return h * Math.exp(-x);
  }
  let ans = nm1 !== 0 ? 1 / nm1 : -Math.log(x) - EULER;
  let fact = 1;
  for (let i = 1; i <= MAXIT; i++) {
    fact *= -x / i;
    let del: number;
    if (i !== nm1) del = -fact / (i - nm1);
    else {
      let psi = -EULER;
      for (let ii = 1; ii <= nm1; ii++) psi += 1 / ii;
      del = fact * (-Math.log(x) + psi);
    }
    ans += del;
    if (Math.abs(del) < Math.abs(ans) * EPS) break;
  }
  return ans;
}

/** Ei(x), the Cauchy principal value: −E₁(−x) below 0. */
function ei(x: number): number {
  if (x === 0) throw pole('Ei', 0);
  return x > 0 ? eiPositive(x) : -expint(1, -x);
}

/** Shi and Chi: their series up to 40, and (Ei ± E₁)/2 beyond; Chi of a negative x adds iπ. */
function shichi(x: number): { shi: number; chi: number } {
  const t = Math.abs(x);
  if (t === 0) return { shi: 0, chi: -Infinity };
  let shi: number;
  let chi: number;
  if (t <= 40) {
    let s = 0;
    let c = 0;
    let fact = 1;
    for (let k = 1; k <= 400; k++) {
      fact *= t / k;
      const term = fact / k;
      if (k % 2) s += term;
      else c += term;
      if (term < EPS * Math.max(s, c, 1e-300)) break;
    }
    shi = s;
    chi = c + Math.log(t) + EULER;
  } else {
    const [a, b] = [eiPositive(t), expint(1, t)];
    shi = (a + b) / 2;
    chi = (a - b) / 2;
  }
  return { shi: x < 0 ? -shi : shi, chi };
}

// ── Fresnel integrals, Numerical Recipes' frenel ──────────────────────────────────────────────────

function fresnel(x: number): { s: number; c: number } {
  const ax = Math.abs(x);
  let s: number;
  let c: number;
  if (ax < Math.sqrt(FPMIN)) {
    s = 0;
    c = ax;
  } else if (ax > 1e100) {
    // Both are ½ to within 1/(πx); past 10⁸ the phase πx²/2 is lost in x's own rounding anyway.
    s = 0.5;
    c = 0.5;
  } else if (ax <= 1.5) {
    let sum = 0;
    let sums = 0;
    let sumc = ax;
    let sign = 1;
    const fact = (Math.PI / 2) * ax * ax;
    let odd = true;
    let term = ax;
    let n = 3;
    for (let k = 1; k <= MAXIT; k++) {
      term *= fact / k;
      sum += (sign * term) / n;
      const test = Math.abs(sum) * EPS;
      if (odd) {
        sign = -sign;
        sums = sum;
        sum = sumc;
      } else {
        sumc = sum;
        sum = sums;
      }
      if (term < test) break;
      odd = !odd;
      n += 2;
    }
    s = sums;
    c = sumc;
  } else {
    const pix2 = Math.PI * ax * ax;
    let b: C = [1, -pix2];
    let cc: C = [1 / FPMIN, 0];
    let d = cdiv([1, 0], b);
    let h = d;
    let n = -1;
    for (let k = 2; k <= MAXIT; k++) {
      n += 2;
      const a = -n * (n + 1);
      b = [b[0] + 4, b[1]];
      d = cdiv([1, 0], [a * d[0] + b[0], a * d[1] + b[1]]);
      const q = cdiv([a, 0], cc);
      cc = [b[0] + q[0], b[1] + q[1]];
      const del = cmul(cc, d);
      h = cmul(h, del);
      if (Math.abs(del[0] - 1) + Math.abs(del[1]) < EPS) break;
    }
    h = cmul([ax, -ax], h);
    const e = cmul(h, [Math.cos(0.5 * pix2), Math.sin(0.5 * pix2)]);
    const cs = cmul([0.5, 0.5], [1 - e[0], -e[1]]);
    c = cs[0];
    s = cs[1];
  }
  return x < 0 ? { s: -s, c: -c } : { s, c };
}

// ── The dilogarithm ────────────────────────────────────────────────────────────────────────────────

/** Bernoulli numbers B₀ … B₄₀, for the series below. */
const BERNOULLI: number[] = (() => {
  const b: number[] = [1];
  for (let m = 1; m <= 40; m++) {
    let s = 0;
    let binom = 1;
    for (let k = 0; k < m; k++) {
      s += binom * b[k]!;
      binom = (binom * (m + 1 - k)) / (k + 1);
    }
    b.push(m > 1 && m % 2 ? 0 : -s / (m + 1)); // the odd ones past B₁ are 0, exactly
  }
  return b;
})();

/** Li₂(z) for −1 ≤ z ≤ ½, by its Bernoulli series in −ln(1 − z). */
function li2Near(z: number): number {
  const u = -Math.log1p(-z);
  let sum = 0;
  let pow = u;
  let fact = 1;
  for (let k = 0; k <= 40; k++) {
    fact *= k + 1;
    const term = (BERNOULLI[k]! * pow) / fact;
    sum += term;
    if (k > 2 && k % 2 === 0 && Math.abs(term) < EPS * Math.abs(sum)) break; // B₃, B₅, … are 0
    pow *= u;
  }
  return sum;
}

/** Li₂(z) for real z ≤ 1. */
function li2Real(z: number): number {
  if (z === 1) return (Math.PI * Math.PI) / 6;
  if (z === 0) return 0;
  if (z < -1) return -(Math.PI * Math.PI) / 6 - 0.5 * Math.log(-z) ** 2 - li2Real(1 / z);
  if (z <= 0.5) return li2Near(z);
  return (Math.PI * Math.PI) / 6 - Math.log(z) * Math.log1p(-z) - li2Near(1 - z);
}

/** dilog(x) = Li₂(1 − x), complex for x < 0, with Mathcad's sign of the imaginary part (probed: dilog(−1)). */
function dilog(x: number): C {
  const z = 1 - x;
  if (z <= 1) return [li2Real(z), 0];
  const lz = Math.log(z);
  return [(Math.PI * Math.PI) / 3 - 0.5 * lz * lz - li2Real(1 / z), -Math.PI * lz];
}

// ── ζ ──────────────────────────────────────────────────────────────────────────────────────────────

/** Borwein's coefficients d₀ … dₙ for n = 40, scaled by 1/n (only their ratios matter). */
const ZN = 40;
const ZD: number[] = (() => {
  // dₖ = n Σᵢ₌₀ᵏ (n+i−1)! 4ⁱ / ((n−i)! (2i)!), each term from the one before.
  const d: number[] = [];
  let term = 1;
  let sum = 0;
  for (let i = 0; i <= ZN; i++) {
    if (i > 0) term *= (4 * (ZN + i - 1) * (ZN - i + 1)) / ((2 * i - 1) * (2 * i));
    sum += term;
    d.push(sum);
  }
  return d;
})();

function zeta(s: number): number {
  if (s === 1) throw pole('Zeta', 1);
  if (s < 0 && Number.isInteger(s) && s % 2 === 0) return 0;
  // Near 0, where 1 − s rounds to 1: ζ(s) = −½ − s·ln(2π)/2 + O(s²), the s² term under 10⁻¹⁸ here.
  if (Math.abs(s) < 1e-8) return -0.5 - s * 0.9189385332046728;
  if (s < 0.5) {
    // The reflection formula: ζ(s) = 2^s π^(s−1) sin(πs/2) Γ(1−s) ζ(1−s), its size in logarithms below −20,
    // where Γ(1−s) alone overflows long before ζ(s) does.
    const sine = Math.sin((Math.PI * s) / 2);
    if (s > -20) return 2 ** s * Math.PI ** (s - 1) * sine * gammaReal(1 - s) * zeta(1 - s);
    const size = s * Math.LN2 + (s - 1) * Math.log(Math.PI) + Math.log(Math.abs(sine)) + lnGammaComplex([1 - s, 0])[0] + Math.log(zeta(1 - s));
    return Math.sign(sine) * Math.exp(size);
  }
  if (s > 60) return 1 + 2 ** -s + 3 ** -s;
  const dn = ZD[ZN]!;
  let sum = 0;
  for (let k = 0; k < ZN; k++) sum += ((k % 2 ? -1 : 1) * (ZD[k]! - dn)) / (k + 1) ** s;
  // 1 − 2^(1−s) as −expm1, which keeps its digits near the pole at 1.
  return sum / (dn * Math.expm1((1 - s) * Math.LN2));
}

// ── ψ and the polygamma functions ──────────────────────────────────────────────────────────────────

/** cot(πx), exactly 0 at the half-integers, with x reduced first so πx loses nothing. */
function cotPi(x: number): number {
  const r = x - Math.round(x);
  return Math.abs(r) === 0.5 ? 0 : 1 / Math.tan(Math.PI * r);
}

function digamma(x: number): number {
  if (x <= 0 && Number.isInteger(x)) throw pole('Psi', x);
  if (x < 0) return digamma(1 - x) - Math.PI * cotPi(x);
  let r = 0;
  while (x < 10) {
    r -= 1 / x;
    x += 1;
  }
  const y = 1 / (x * x);
  let series = 0;
  for (let k = 7; k >= 1; k--) series = series * y + BERNOULLI[2 * k]! / (2 * k);
  return r + Math.log(x) - 0.5 / x - series * y;
}

/** ψ⁽ⁿ⁾(x) for n ≥ 1: steps up to x ≥ 20 + n, then the asymptotic series. */
function polygamma(n: number, x: number): number {
  if (n === 0) return digamma(x);
  if (x <= 0 && Number.isInteger(x)) throw pole('Psi', x);
  if (x < 0) {
    // The reflection formula, as stepping up from below 0 cancels away the answer:
    // ψ⁽ⁿ⁾(x) = (−1)ⁿ⁺¹ [(−1)ⁿ πⁿ⁺¹ Pₙ(cot πx) − ψ⁽ⁿ⁾(1 − x)], with dⁿ/dxⁿ cot x = Pₙ(cot x).
    let poly = [0, 1]; // P₀(c) = c; Pₖ₊₁(c) = −(1 + c²) Pₖ′(c)
    for (let k = 0; k < n; k++) {
      const d = poly.slice(1).map((a, i) => a * (i + 1));
      const next = new Array<number>(d.length + 2).fill(0);
      d.forEach((a, i) => {
        next[i]! -= a;
        next[i + 2]! -= a;
      });
      poly = next;
    }
    const c = cotPi(x);
    const pn = poly.reduceRight((acc, a) => acc * c + a, 0);
    const sgn = n % 2 ? -1 : 1;
    return -sgn * (sgn * Math.PI ** (n + 1) * pn - polygamma(n, 1 - x));
  }
  let nfact = 1;
  for (let k = 2; k <= n; k++) nfact *= k;
  const sign = n % 2 ? 1 : -1;
  let r = 0;
  while (x < 20 + n) {
    r += (sign * nfact) / x ** (n + 1);
    x += 1;
  }
  // (−1)^(n+1) [ (n−1)!/xⁿ + n!/(2x^(n+1)) + Σ B₂ₖ (2k+n−1)!/((2k)! x^(2k+n)) ]
  let s = nfact / n / x ** n + nfact / (2 * x ** (n + 1));
  let ratio = nfact / n; // (2k+n−1)!/(2k)! built up
  for (let k = 1; k <= 15; k++) {
    ratio *= ((2 * k + n - 2) * (2 * k + n - 1)) / ((2 * k - 1) * (2 * k));
    const term = (BERNOULLI[2 * k]! * ratio) / x ** (2 * k + n);
    s += term;
    if (Math.abs(term) < EPS * Math.abs(s)) break;
  }
  return r + sign * s;
}

// ── Lambert's W ────────────────────────────────────────────────────────────────────────────────────

const cexp = (z: C): C => [Math.exp(z[0]) * Math.cos(z[1]), Math.exp(z[0]) * Math.sin(z[1])];
const clog = (z: C): C => [Math.log(Math.hypot(z[0], z[1])), Math.atan2(z[1], z[0])];

/** W on branch k at x, by Halley's iteration from the branch-point or asymptotic series. */
function lambertW(k: number, x: C): C {
  if (x[0] === 0 && x[1] === 0) {
    if (k === 0) return [0, 0];
    throw new EvalError('runtime', 'LambertW(n, 0) is −∞ on every branch but 0');
  }
  const e = Math.E;
  let w: C;
  const nearBranch = Math.hypot(x[0] + 1 / e, x[1]) < 0.3;
  // The branch point −1/e joins branch 0 to branch −1 from above the real axis (and on it), and to branch 1 from below.
  const joined = k === 0 || (k === -1 && x[1] >= 0) || (k === 1 && x[1] < 0);
  if (nearBranch && joined) {
    // p = √(2(e·x + 1)): W ≈ −1 ± p − p²/3 ± 11p³/72, with + on branch 0 and − on the other.
    const q: C = [2 * (e * x[0] + 1), 2 * e * x[1]];
    const r = Math.hypot(q[0], q[1]);
    let p: C = [Math.sqrt((r + q[0]) / 2), (q[1] < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (r - q[0]) / 2))];
    if (k !== 0) p = [-p[0], -p[1]];
    const p2 = cmul(p, p);
    const p3 = cmul(p2, p);
    w = [-1 + p[0] - p2[0] / 3 + (11 * p3[0]) / 72, p[1] - p2[1] / 3 + (11 * p3[1]) / 72];
  } else if (k === 0 && Math.hypot(x[0], x[1]) <= 3) {
    // ln(1 + x) is close enough for Halley's from here; near x = −1 it isn't defined, and W(−1) is near −0.3 + 1.3i.
    const onePlus: C = [1 + x[0], x[1]];
    w = Math.hypot(onePlus[0], onePlus[1]) > 0.2 ? clog(onePlus) : [-0.3, x[1] < 0 ? -1.3 : 1.3];
  } else {
    const l1 = clog(x);
    const L1: C = [l1[0], l1[1] + 2 * Math.PI * k];
    const L2 = clog(L1);
    const r = cdiv(L2, L1);
    w = [L1[0] - L2[0] + r[0], L1[1] - L2[1] + r[1]];
  }
  // Halley's iteration on F(w) = w − x·e^(−w), which has W's roots without overflowing as w·eʷ would for a large x:
  // with r = x·e^(−w), F′ = 1 + r and F″ = −r, so the step is 2F·F′ / (2F′² + F·r).
  const start = w;
  for (let it = 0; it < 100; it++) {
    const r = cmul(x, cexp([-w[0], -w[1]]));
    const F: C = [w[0] - r[0], w[1] - r[1]];
    const d1: C = [1 + r[0], r[1]];
    const den = cmul([2, 0], cmul(d1, d1));
    const fr = cmul(F, r);
    const denom: C = [den[0] + fr[0], den[1] + fr[1]];
    // At the branch point itself F and F′ are both 0, and the start is already W.
    if ((F[0] === 0 && F[1] === 0) || (denom[0] === 0 && denom[1] === 0)) break;
    const step = cdiv(cmul([2 * F[0], 2 * F[1]], d1), denom);
    w = [w[0] - step[0], w[1] - step[1]];
    if (Math.hypot(step[0], step[1]) <= 4 * EPS * Math.max(1, Math.hypot(w[0], w[1]))) break;
  }
  if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) w = start;
  // On branches 0 and −1, W of a real x where it is real comes back real.
  if (x[1] === 0 && ((k === 0 && x[0] >= -1 / e) || (k === -1 && x[0] >= -1 / e && x[0] < 0))) w = [w[0], 0];
  return w;
}

// ── Primes ─────────────────────────────────────────────────────────────────────────────────────────

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) {
    if (n === p) return true;
    if (n % p === 0) return false;
  }
  const N = BigInt(n);
  let d = N - 1n;
  let r = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    r++;
  }
  const pow = (b: bigint, e: bigint): bigint => {
    let out = 1n;
    b %= N;
    while (e > 0n) {
      if (e & 1n) out = (out * b) % N;
      b = (b * b) % N;
      e >>= 1n;
    }
    return out;
  };
  // These bases decide every n below 3.3·10²⁴.
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n]) {
    let x = pow(a, d);
    if (x === 1n || x === N - 1n) continue;
    let composite = true;
    for (let i = 1; i < r; i++) {
      x = (x * x) % N;
      if (x === N - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

// ── The table ──────────────────────────────────────────────────────────────────────────────────────

const cnum = (z: C): Value => num(z[0], undefined, z[1]);
/** A real answer, or an error when it overflowed, as Shi(800) does: the poles are refused before this. */
const finite = (fn: string, v: number): Value => {
  if (!Number.isFinite(v)) throw new EvalError('runtime', `${fn}: the answer is too large to hold, over 10³⁰⁸`);
  return num(v);
};
const symbolicOnly = (fn: string): Impl => () => {
  throw new EvalError('runtime', `${fn} works on expressions: evaluate it symbolically, with → (Ctrl+.)`);
};

export const symFns: Record<string, Impl> = {
  Si: (x) => num(cisi(real(x, 'Si')).si),
  Ci: (x) => {
    const v = real(x, 'Ci');
    if (v === 0) throw pole('Ci', 0);
    return num(cisi(v).ci, undefined, v < 0 ? Math.PI : 0);
  },
  Shi: (x) => finite('Shi', shichi(real(x, 'Shi')).shi),
  Chi: (x) => {
    const v = real(x, 'Chi');
    if (v === 0) throw pole('Chi', 0);
    const chi = shichi(v).chi;
    if (!Number.isFinite(chi)) return finite('Chi', chi);
    return num(chi, undefined, v < 0 ? Math.PI : 0);
  },
  Ei: (a, b) => {
    if (b === undefined) return finite('Ei', ei(real(a, 'Ei')));
    const n = whole(a, 'Ei', 'n', 0);
    const x = real(b, 'Ei');
    if (x < 0 || (x === 0 && n <= 1)) throw new EvalError('runtime', `Ei(${n}, x) is worked out for x above 0${n > 1 ? ', or 0' : ''} here`);
    return finite('Ei', expint(n, x));
  },
  FresnelS: (x) => num(fresnel(real(x, 'FresnelS')).s),
  FresnelC: (x) => num(fresnel(real(x, 'FresnelC')).c),
  dilog: (x) => cnum(dilog(real(x, 'dilog'))),
  Zeta: (s) => finite('Zeta', zeta(real(s, 'Zeta', 's'))),
  Psi: (a, b) => finite('Psi', b === undefined ? digamma(real(a, 'Psi')) : polygamma(whole(a, 'Psi', 'n', 0), real(b, 'Psi'))),
  LambertW: (a, b) => {
    const k = b === undefined ? 0 : whole(a, 'LambertW', 'n', -Infinity);
    const xv = b === undefined ? a : b;
    if (xv?.t !== 'num' || !isNoDim(xv.dim)) throw new EvalError('runtime', "LambertW's x must be a number without units");
    return cnum(lambertW(k, [xv.re, xv.im]));
  },
  IsPrime: (n) => {
    const v = real(n, 'IsPrime', 'n');
    if (!Number.isInteger(v)) throw new EvalError('runtime', 'IsPrime takes a whole number');
    if (Math.abs(v) > Number.MAX_SAFE_INTEGER) throw new EvalError('runtime', 'IsPrime works for whole numbers up to 2⁵³ here');
    return num(isPrime(v) ? 1 : 0);
  },
  numer: symbolicOnly('numer'),
  denom: symbolicOnly('denom'),
};
