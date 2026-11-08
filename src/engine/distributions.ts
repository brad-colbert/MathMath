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
 * Probability distributions as Mathcad 14 has them: for each, a density d…, a cumulative probability p…, its
 * inverse q… and random numbers r…, as dnorm, pnorm, qnorm and rnorm. Also erf, erfc and cnorm, and the
 * statistics Mathcad has beside mean and stdev. Every value here was checked against Mathcad 14.
 *
 * Conventions, probed: gamma and Weibull take a shape only; a discrete distribution's density is 0 away from
 * a whole number and its cumulative counts up to the whole number below; a discrete inverse is the smallest
 * count whose cumulative probability reaches p. Random numbers come from the region's stream, so a sheet's
 * draws are the same each time it calculates, until the worksheet's seed changes.
 */
import { mapMat } from './ops.js';
import { EvalError, type Mat, type Num, type Value, getEl, newMat, num, requireNum } from './values.js';

type Impl = (...args: Value[]) => Value;

// ---------------------------------------------------------------- special functions

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** ln Γ(x) for x > 0, by Lanczos' approximation, to about 15 digits. */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** ln of the binomial coefficient C(n, k). */
const lnChoose = (n: number, k: number): number => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

/** The regularized lower incomplete gamma P(a, x) and its complement Q(a, x). */
export function gammaP(a: number, x: number): { p: number; q: number } {
  if (x <= 0) return { p: 0, q: 1 };
  const front = Math.exp(-x + a * Math.log(x) - lnGamma(a));
  if (x < a + 1) {
    // Series.
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
    }
    const p = Math.min(1, sum * front);
    return { p, q: 1 - p };
  }
  // Continued fraction, by Lentz's method.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-17) break;
  }
  const q = Math.min(1, front * h);
  return { p: 1 - q, q };
}

/** The continued fraction for the incomplete beta function, by Lentz's method. */
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b). */
export function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaFraction(a, b, x)) / a;
  return 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

/** erf, from the incomplete gamma function: erf(x) = P(½, x²). */
export function erf(x: number): number {
  if (x === 0) return 0;
  const g = gammaP(0.5, x * x);
  return x > 0 ? g.p : -g.p;
}

/** erfc, without losing the small tail to rounding. */
export function erfc(x: number): number {
  const g = gammaP(0.5, x * x);
  return x >= 0 ? g.q : 1 + g.p;
}

/** The standard normal cumulative probability. */
const phi = (z: number): number => 0.5 * erfc(-z / Math.SQRT2);

/** The standard normal inverse: Acklam's approximation, then two Halley steps, to full precision. */
function phiInverse(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  let x: number;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  for (let i = 0; i < 2; i++) {
    const e = phi(x) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x -= u / (1 + (x * u) / 2);
  }
  return x;
}

/** The x in [lo, hi] where an increasing f crosses p, by bisection to the last bit. */
function invert(f: (x: number) => number, p: number, lo: number, hi: number): number {
  for (let i = 0; i < 2000; i++) {
    const mid = lo + (hi - lo) / 2;
    if (mid <= lo || mid >= hi) break;
    if (f(mid) < p) lo = mid;
    else hi = mid;
  }
  return lo + (hi - lo) / 2;
}

/** An upper bound where f reaches p, doubling from `start`. */
function above(f: (x: number) => number, p: number, start: number): number {
  let hi = start;
  for (let i = 0; i < 2000 && f(hi) < p; i++) hi *= 2;
  return hi;
}

// ---------------------------------------------------------------- arguments

const real = (v: Value, what: string): number => {
  const n = requireNum(v, what);
  if (n.im !== 0) throw new EvalError('runtime', `${what} must be real`);
  if (!(n.dim.every((d) => d === 0))) throw new EvalError('runtime', `${what} takes a plain number, without units`);
  return n.re;
};
const positive = (v: Value, what: string): number => {
  const x = real(v, what);
  if (!(x > 0)) throw new EvalError('runtime', `${what} must be above 0`);
  return x;
};
const probability = (v: Value, what: string, open = false): number => {
  const x = real(v, what);
  if (!(x >= 0 && x <= 1) || (open && (x === 0 || x === 1))) throw new EvalError('runtime', `${what} must be a probability, ${open ? 'between' : 'from'} 0 ${open ? 'and' : 'to'} 1`);
  return x;
};
const whole = (v: Value, what: string, min = 0): number => {
  const x = real(v, what);
  if (!Number.isInteger(x) || x < min) throw new EvalError('runtime', `${what} must be a whole number, ${min} or more`);
  return x;
};

/** A function of a first argument, element by element, with the rest fixed. */
const overFirst = (f: (x: number) => number, what: string) => (v: Value): Value => {
  if (v.t === 'mat') return mapMat(v, (e) => num(f(real(e, what))));
  return num(f(real(v, what)));
};

// ---------------------------------------------------------------- distributions

interface Continuous {
  kind: 'continuous';
  /** Reads the parameters, checking them. */
  params: (args: Value[], fn: string) => number[];
  pdf: (x: number, ps: number[]) => number;
  cdf: (x: number, ps: number[]) => number;
  /** The inverse; by default found numerically between `support`'s ends. */
  inv?: (p: number, ps: number[]) => number;
  support: (ps: number[]) => [number, number];
  /** A random draw from a uniform u in (0, 1), or with more numbers from `next`. */
  draw?: (next: () => number, ps: number[]) => number;
  names: string[];
}

interface Discrete {
  kind: 'discrete';
  params: (args: Value[], fn: string) => number[];
  pmf: (k: number, ps: number[]) => number;
  cdf: (k: number, ps: number[]) => number;
  /** The largest possible count, or Infinity. */
  top: (ps: number[]) => number;
  names: string[];
}

type Family = Continuous | Discrete;

/** A parameter's name in a message: "dnorm's standard deviation, σ,", the symbol set off by commas. */
const shape = (fn: string, name: string) => `${fn}'s ${name}${name.includes(', ') ? ',' : ''}`;

/** A standard normal draw, by the Box–Muller transform. */
function gaussian(next: () => number): number {
  let u = 0;
  while (u === 0) u = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

/** A Γ(s, 1) draw, by Marsaglia and Tsang's method. */
function gammaDraw(next: () => number, s: number): number {
  if (s < 1) {
    let u = 0;
    while (u === 0) u = next();
    return gammaDraw(next, s + 1) * u ** (1 / s);
  }
  const d = s - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = gaussian(next);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = next();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (u > 0 && Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

const tCdf = (x: number, d: number): number => {
  const tail = 0.5 * betaI(d / (d + x * x), d / 2, 0.5);
  return x > 0 ? 1 - tail : tail;
};

/** The chance of k successes in a sample of n, drawn without replacement from a successes and b failures. */
const hypergeomPmf = (k: number, [a, b, n]: number[]): number =>
  k < Math.max(0, n! - b!) || k > Math.min(a!, n!) ? 0 : Math.exp(lnChoose(a!, k) + lnChoose(b!, n! - k) - lnChoose(a! + b!, n!));

const FAMILIES: Record<string, Family> = {
  beta: {
    kind: 'continuous', names: ['s1', 's2'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'first shape, s1')), positive(a[1]!, shape(fn, 'second shape, s2'))],
    pdf: (x, [a, b]) => (x < 0 || x > 1 ? 0 : x === 0 ? (a! < 1 ? Infinity : a === 1 ? b! : 0) : x === 1 ? (b! < 1 ? Infinity : b === 1 ? a! : 0)
      : Math.exp((a! - 1) * Math.log(x) + (b! - 1) * Math.log1p(-x) - (lnGamma(a!) + lnGamma(b!) - lnGamma(a! + b!)))),
    cdf: (x, [a, b]) => betaI(x, a!, b!),
    support: () => [0, 1],
    draw: (next, [a, b]) => {
      const x = gammaDraw(next, a!);
      return x / (x + gammaDraw(next, b!));
    },
  },
  cauchy: {
    kind: 'continuous', names: ['l', 's'],
    params: (a, fn) => [real(a[0]!, shape(fn, 'location, l')), positive(a[1]!, shape(fn, 'scale, s'))],
    pdf: (x, [l, s]) => 1 / (Math.PI * s! * (1 + ((x - l!) / s!) ** 2)),
    cdf: (x, [l, s]) => 0.5 + Math.atan((x - l!) / s!) / Math.PI,
    inv: (p, [l, s]) => l! + s! * Math.tan(Math.PI * (p - 0.5)),
    support: () => [-Infinity, Infinity],
  },
  chisq: {
    kind: 'continuous', names: ['d'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'degrees of freedom, d'))],
    pdf: (x, [d]) => (x < 0 ? 0 : x === 0 ? (d! < 2 ? Infinity : d === 2 ? 0.5 : 0)
      : Math.exp((d! / 2 - 1) * Math.log(x) - x / 2 - (d! / 2) * Math.LN2 - lnGamma(d! / 2))),
    cdf: (x, [d]) => gammaP(d! / 2, x / 2).p,
    support: () => [0, Infinity],
    draw: (next, [d]) => 2 * gammaDraw(next, d! / 2),
  },
  exp: {
    kind: 'continuous', names: ['r'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'rate, r'))],
    pdf: (x, [r]) => (x < 0 ? 0 : r! * Math.exp(-r! * x)),
    cdf: (x, [r]) => (x < 0 ? 0 : -Math.expm1(-r! * x)),
    inv: (p, [r]) => -Math.log1p(-p) / r!,
    support: () => [0, Infinity],
  },
  F: {
    kind: 'continuous', names: ['d1', 'd2'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'first degrees of freedom, d1')), positive(a[1]!, shape(fn, 'second degrees of freedom, d2'))],
    pdf: (x, [a, b]) => (x < 0 ? 0 : x === 0 ? (a! < 2 ? Infinity : a === 2 ? 1 : 0)
      : Math.exp((a! / 2) * Math.log(a! / b!) + (a! / 2 - 1) * Math.log(x) - ((a! + b!) / 2) * Math.log1p((a! * x) / b!)
        - (lnGamma(a! / 2) + lnGamma(b! / 2) - lnGamma((a! + b!) / 2)))),
    cdf: (x, [a, b]) => (x <= 0 ? 0 : betaI((a! * x) / (a! * x + b!), a! / 2, b! / 2)),
    support: () => [0, Infinity],
    draw: (next, [a, b]) => (gammaDraw(next, a! / 2) / a!) / (gammaDraw(next, b! / 2) / b!),
  },
  gamma: {
    kind: 'continuous', names: ['s'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'shape, s'))],
    pdf: (x, [s]) => (x < 0 ? 0 : x === 0 ? (s! < 1 ? Infinity : s === 1 ? 1 : 0) : Math.exp((s! - 1) * Math.log(x) - x - lnGamma(s!))),
    cdf: (x, [s]) => gammaP(s!, x).p,
    support: () => [0, Infinity],
    draw: (next, [s]) => gammaDraw(next, s!),
  },
  lnorm: {
    kind: 'continuous', names: ['μ', 'σ'],
    params: (a, fn) => [real(a[0]!, shape(fn, 'log mean, μ')), positive(a[1]!, shape(fn, 'log standard deviation, σ'))],
    pdf: (x, [m, s]) => (x <= 0 ? 0 : Math.exp(-((Math.log(x) - m!) ** 2) / (2 * s! * s!)) / (x * s! * Math.sqrt(2 * Math.PI))),
    cdf: (x, [m, s]) => (x <= 0 ? 0 : phi((Math.log(x) - m!) / s!)),
    inv: (p, [m, s]) => Math.exp(m! + s! * phiInverse(p)),
    support: () => [0, Infinity],
  },
  logis: {
    kind: 'continuous', names: ['l', 's'],
    params: (a, fn) => [real(a[0]!, shape(fn, 'location, l')), positive(a[1]!, shape(fn, 'scale, s'))],
    pdf: (x, [l, s]) => {
      const e = Math.exp(-Math.abs(x - l!) / s!);
      return e / (s! * (1 + e) ** 2);
    },
    cdf: (x, [l, s]) => 1 / (1 + Math.exp(-(x - l!) / s!)),
    inv: (p, [l, s]) => l! + s! * Math.log(p / (1 - p)),
    support: () => [-Infinity, Infinity],
  },
  norm: {
    kind: 'continuous', names: ['μ', 'σ'],
    params: (a, fn) => [real(a[0]!, shape(fn, 'mean, μ')), positive(a[1]!, shape(fn, 'standard deviation, σ'))],
    pdf: (x, [m, s]) => Math.exp(-(((x - m!) / s!) ** 2) / 2) / (s! * Math.sqrt(2 * Math.PI)),
    cdf: (x, [m, s]) => phi((x - m!) / s!),
    inv: (p, [m, s]) => m! + s! * phiInverse(p),
    support: () => [-Infinity, Infinity],
  },
  t: {
    kind: 'continuous', names: ['d'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'degrees of freedom, d'))],
    pdf: (x, [d]) => Math.exp(lnGamma((d! + 1) / 2) - lnGamma(d! / 2) - 0.5 * Math.log(d! * Math.PI) - ((d! + 1) / 2) * Math.log1p((x * x) / d!)),
    cdf: (x, [d]) => tCdf(x, d!),
    support: () => [-Infinity, Infinity],
    draw: (next, [d]) => gaussian(next) / Math.sqrt((2 * gammaDraw(next, d! / 2)) / d!),
  },
  unif: {
    kind: 'continuous', names: ['a', 'b'],
    params: (a, fn) => {
      const [lo, hi] = [real(a[0]!, shape(fn, 'lower end, a')), real(a[1]!, shape(fn, 'upper end, b'))];
      if (!(hi > lo)) throw new EvalError('runtime', `${fn}'s upper end, b, must be above its lower end, a`);
      return [lo, hi];
    },
    pdf: (x, [a, b]) => (x < a! || x > b! ? 0 : 1 / (b! - a!)),
    cdf: (x, [a, b]) => (x <= a! ? 0 : x >= b! ? 1 : (x - a!) / (b! - a!)),
    inv: (p, [a, b]) => a! + p * (b! - a!),
    support: ([a, b]) => [a!, b!],
  },
  weibull: {
    kind: 'continuous', names: ['s'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'shape, s'))],
    pdf: (x, [s]) => (x < 0 ? 0 : x === 0 ? (s! < 1 ? Infinity : s === 1 ? 1 : 0) : s! * x ** (s! - 1) * Math.exp(-(x ** s!))),
    cdf: (x, [s]) => (x <= 0 ? 0 : -Math.expm1(-(x ** s!))),
    inv: (p, [s]) => (-Math.log1p(-p)) ** (1 / s!),
    support: () => [0, Infinity],
  },
  binom: {
    kind: 'discrete', names: ['n', 'p'],
    params: (a, fn) => [whole(a[0]!, shape(fn, 'number of trials, n'), 1), probability(a[1]!, shape(fn, 'probability of success, p'))],
    pmf: (k, [n, p]) => (p === 0 ? (k === 0 ? 1 : 0) : p === 1 ? (k === n ? 1 : 0)
      : Math.exp(lnChoose(n!, k) + k * Math.log(p!) + (n! - k) * Math.log1p(-p!))),
    cdf: (k, [n, p]) => (k >= n! ? 1 : p === 0 ? 1 : p === 1 ? 0 : betaI(1 - p!, n! - k, k + 1)),
    top: ([n]) => n!,
  },
  geom: {
    kind: 'discrete', names: ['p'],
    params: (a, fn) => {
      const p = probability(a[0]!, shape(fn, 'probability of success, p'));
      if (p === 0) throw new EvalError('runtime', `${fn}'s probability of success, p, must be above 0`);
      return [p];
    },
    pmf: (k, [p]) => p! * (1 - p!) ** k,
    cdf: (k, [p]) => -Math.expm1((k + 1) * Math.log1p(-p!)),
    top: () => Infinity,
  },
  hypergeom: {
    kind: 'discrete', names: ['a', 'b', 'n'],
    params: (a, fn) => {
      const [s, f, n] = [whole(a[0]!, shape(fn, 'number of successes, a')), whole(a[1]!, shape(fn, 'number of failures, b')), whole(a[2]!, shape(fn, 'sample size, n'))];
      if (n > s + f) throw new EvalError('runtime', `${fn}'s sample size, n, can't be more than a + b`);
      return [s, f, n];
    },
    pmf: (k, ps) => hypergeomPmf(k, ps),
    cdf: (k, ps) => {
      let s = 0;
      for (let j = Math.max(0, ps[2]! - ps[1]!); j <= k; j++) s += hypergeomPmf(j, ps);
      return Math.min(1, s);
    },
    top: ([a, , n]) => Math.min(a!, n!),
  },
  nbinom: {
    kind: 'discrete', names: ['n', 'p'],
    params: (a, fn) => {
      const n = whole(a[0]!, shape(fn, 'number of successes, n'), 1);
      const p = probability(a[1]!, shape(fn, 'probability of success, p'));
      if (p === 0) throw new EvalError('runtime', `${fn}'s probability of success, p, must be above 0`);
      return [n, p];
    },
    pmf: (k, [n, p]) => Math.exp(lnChoose(n! + k - 1, k) + n! * Math.log(p!) + k * Math.log1p(-p!)),
    cdf: (k, [n, p]) => (p === 1 ? 1 : betaI(p!, n!, k + 1)),
    top: () => Infinity,
  },
  pois: {
    kind: 'discrete', names: ['λ'],
    params: (a, fn) => [positive(a[0]!, shape(fn, 'mean, λ'))],
    pmf: (k, [l]) => Math.exp(k * Math.log(l!) - l! - lnGamma(k + 1)),
    cdf: (k, [l]) => gammaP(k + 1, l!).q,
    top: () => Infinity,
  },
};

/** The smallest count whose cumulative probability reaches p, as Mathcad's discrete inverses give. */
function discreteInverse(f: Discrete, p: number, ps: number[]): number {
  const reach = p * (1 - 1e-12);
  if (f.cdf(0, ps) >= reach) return 0;
  const top = f.top(ps);
  let hi = 1;
  while (hi < top && f.cdf(hi, ps) < reach) hi = Math.min(top, hi * 2);
  if (hi >= top) hi = top;
  let lo = 0;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (f.cdf(mid, ps) >= reach) hi = mid;
    else lo = mid;
  }
  return hi;
}

function continuousInverse(f: Continuous, p: number, ps: number[]): number {
  if (f.inv) return f.inv(p, ps);
  const [lo, hi] = f.support(ps);
  const cdf = (x: number): number => f.cdf(x, ps);
  if (p === 0) return lo;
  if (p === 1) return hi;
  const top = Number.isFinite(hi) ? hi : above(cdf, p, 1);
  const bottom = Number.isFinite(lo) ? lo : -above((x) => 1 - cdf(-x), 1 - p, 1);
  return invert(cdf, p, bottom, top);
}

/** The four functions of a family: d…, p…, q… and r…. `next` draws a uniform number in [0, 1). */
function family(name: string, f: Family, next: () => number): Record<string, Impl> {
  const [d, p, q, r] = ['d', 'p', 'q', 'r'].map((x) => x + name) as [string, string, string, string];
  const at = (fn: string, args: Value[], one: (x: number, ps: number[]) => number, what: string): Value => {
    const ps = f.params(args.slice(1), fn);
    return overFirst((x) => one(x, ps), `${fn}'s ${what}`)(args[0]!);
  };
  if (f.kind === 'continuous') {
    return {
      [d]: (...a) => at(d, a, (x, ps) => f.pdf(x, ps), 'x'),
      [p]: (...a) => at(p, a, (x, ps) => f.cdf(x, ps), 'x'),
      [q]: (...a) => {
        const ps = f.params(a.slice(1), q);
        return overFirst((pr) => {
          if (!(pr >= 0 && pr <= 1)) throw new EvalError('runtime', `${q}'s probability must be from 0 to 1`);
          return continuousInverse(f, pr, ps);
        }, `${q}'s probability`)(a[0]!);
      },
      [r]: (...a) => {
        const m = whole(a[0]!, `${r}'s count, m`, 1);
        const ps = f.params(a.slice(1), r);
        const out = newMat(m, 1);
        for (let i = 0; i < m; i++) {
          if (f.draw) out.re[i] = f.draw(next, ps);
          else {
            let u = next();
            while (u === 0) u = next();
            out.re[i] = continuousInverse(f, u, ps);
          }
        }
        return out;
      },
    };
  }
  // A count that isn't whole has no probability; the cumulative counts up to the whole number below.
  return {
    [d]: (...a) => at(d, a, (k, ps) => (Number.isInteger(k) && k >= 0 && k <= f.top(ps) ? f.pmf(k, ps) : 0), 'count'),
    [p]: (...a) => at(p, a, (k, ps) => (k < 0 ? 0 : f.cdf(Math.min(Math.floor(k), f.top(ps)), ps)), 'count'),
    [q]: (...a) => {
      const ps = f.params(a.slice(1), q);
      return overFirst((pr) => {
        if (!(pr >= 0 && pr <= 1)) throw new EvalError('runtime', `${q}'s probability must be from 0 to 1`);
        return pr === 1 && !Number.isFinite(f.top(ps)) ? Infinity : discreteInverse(f, pr, ps);
      }, `${q}'s probability`)(a[0]!);
    },
    [r]: (...a) => {
      const m = whole(a[0]!, `${r}'s count, m`, 1);
      const ps = f.params(a.slice(1), r);
      const out = newMat(m, 1);
      for (let i = 0; i < m; i++) out.re[i] = discreteInverse(f, next(), ps);
      return out;
    },
  };
}

// ---------------------------------------------------------------- statistics

/** Every number in the arguments, matrices read down their columns. Real, sharing one unit. */
function data(args: Value[], fn: string): { xs: number[]; dim: Num['dim'] } {
  const xs: number[] = [];
  let dim: Num['dim'] | null = null;
  const take = (v: Value): void => {
    if (v.t === 'mat') {
      for (let n = 0; n < v.rows * v.cols; n++) take(getEl(v, n % v.rows, Math.floor(n / v.rows)));
      return;
    }
    const x = requireNum(v, fn);
    if (x.im !== 0) throw new EvalError('runtime', `${fn} takes real numbers`);
    if (dim && !dim.every((d, i) => d === x.dim[i])) throw new EvalError('runtime', `${fn}: the values must all have the same units`);
    dim ??= x.dim;
    xs.push(x.re);
  };
  args.forEach(take);
  if (xs.length === 0) throw new EvalError('runtime', `${fn} needs at least one value`);
  return { xs, dim: dim! };
}

const meanOf = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const squared = (dim: Num['dim']): Num['dim'] => dim.map((d) => d * 2);

/** The covariance of two arrays of the same size, over n or n − 1. */
function covariance(a: Value, b: Value, fn: string, sample: boolean): { c: number; dims: [Num['dim'], Num['dim']]; xs: number[]; ys: number[] } {
  const [x, y] = [data([a], fn), data([b], fn)];
  const [ma, mb] = [a as Mat, b as Mat];
  if (x.xs.length !== y.xs.length || (ma.t === 'mat' && mb.t === 'mat' && (ma.rows !== mb.rows || ma.cols !== mb.cols))) {
    throw new EvalError('runtime', `${fn} takes two arrays of the same size`);
  }
  const [mx, my] = [meanOf(x.xs), meanOf(y.xs)];
  const s = x.xs.reduce((t, v, i) => t + (v - mx) * (y.xs[i]! - my), 0);
  return { c: s / (x.xs.length - (sample ? 1 : 0)), dims: [x.dim, y.dim], xs: x.xs, ys: y.xs };
}

const statistics: Record<string, Impl> = {
  /** Variance over n, as Mathcad's var; Var divides by n − 1. */
  var: (...a) => {
    const { xs, dim } = data(a, 'var');
    const m = meanOf(xs);
    return num(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length, squared(dim));
  },
  Var: (...a) => {
    const { xs, dim } = data(a, 'Var');
    if (xs.length < 2) throw new EvalError('runtime', 'Var needs at least two values');
    const m = meanOf(xs);
    return num(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1), squared(dim));
  },
  median: (...a) => {
    const { xs, dim } = data(a, 'median');
    const s = [...xs].sort((p, q) => p - q);
    const h = s.length >> 1;
    return num(s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2, dim);
  },
  mode: (...a) => {
    const { xs, dim } = data(a, 'mode');
    const counts = new Map<number, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    const most = Math.max(...counts.values());
    const tops = [...counts].filter(([, c]) => c === most);
    // As Mathcad 14: no value repeated, or two values tied for most often, is an error.
    if (most < 2) throw new EvalError('runtime', 'mode: no value appears more than once');
    if (tops.length > 1) throw new EvalError('runtime', 'mode: more than one value appears most often');
    return num(tops[0]![0], dim);
  },
  gmean: (...a) => {
    const { xs, dim } = data(a, 'gmean');
    if (xs.some((x) => !(x > 0))) throw new EvalError('runtime', 'gmean takes values above 0');
    return num(Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length), dim);
  },
  hmean: (...a) => {
    const { xs, dim } = data(a, 'hmean');
    if (xs.some((x) => !(x > 0))) throw new EvalError('runtime', 'hmean takes values above 0');
    return num(xs.length / xs.reduce((s, x) => s + 1 / x, 0), dim);
  },
  /** Sample skewness, as Mathcad: n/((n − 1)(n − 2)) Σ((x − mean)/Stdev)³. */
  skew: (...a) => {
    const { xs } = data(a, 'skew');
    const n = xs.length;
    if (n < 3) throw new EvalError('runtime', 'skew needs at least three values');
    const m = meanOf(xs);
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
    return num((n / ((n - 1) * (n - 2))) * xs.reduce((s, x) => s + ((x - m) / sd) ** 3, 0));
  },
  /** Sample excess kurtosis, as Mathcad. */
  kurt: (...a) => {
    const { xs } = data(a, 'kurt');
    const n = xs.length;
    if (n < 4) throw new EvalError('runtime', 'kurt needs at least four values');
    const m = meanOf(xs);
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
    const sum = xs.reduce((s, x) => s + ((x - m) / sd) ** 4, 0);
    return num(((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)));
  },
  /** Covariance over n, as Mathcad's cvar. */
  cvar: (a, b) => {
    const c = covariance(a!, b!, 'cvar', false);
    return num(c.c, c.dims[0].map((d, i) => d + c.dims[1][i]!));
  },
  corr: (a, b) => {
    const c = covariance(a!, b!, 'corr', false);
    const sd = (v: number[]): number => {
      const m = meanOf(v);
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
    };
    const den = sd(c.xs) * sd(c.ys);
    if (den === 0) throw new EvalError('runtime', "corr: an array that doesn't vary has no correlation");
    // Rounding can carry a perfect correlation just past 1.
    return num(Math.max(-1, Math.min(1, c.c / den)));
  },
};

// ---------------------------------------------------------------- the functions

export function distributionFns(next: () => number): Record<string, Impl> {
  const out: Record<string, Impl> = {};
  for (const [name, f] of Object.entries(FAMILIES)) Object.assign(out, family(name, f, next));
  // rnorm and runif keep their own draws, which sheets already depend on: builtins.ts has them.
  delete out.rnorm;
  delete out.runif;
  out.erf = overFirst(erf, "erf's argument");
  out.erfc = overFirst(erfc, "erfc's argument");
  out.cnorm = overFirst(phi, "cnorm's argument");
  return { ...out, ...statistics };
}

const ARITY: Record<string, [number, number]> = {};
for (const [name, f] of Object.entries(FAMILIES)) {
  const k = f.names.length + 1;
  for (const prefix of ['d', 'p', 'q', 'r']) ARITY[prefix + name] = [k, k];
}
delete ARITY.rnorm;
delete ARITY.runif;
Object.assign(ARITY, {
  erf: [1, 1], erfc: [1, 1], cnorm: [1, 1], var: [1, Infinity], Var: [1, Infinity], median: [1, Infinity], mode: [1, Infinity],
  gmean: [1, Infinity], hmean: [1, Infinity], skew: [1, Infinity], kurt: [1, Infinity], cvar: [2, 2], corr: [2, 2],
});
export const DISTRIBUTION_ARITY = ARITY;

/** Every random-number function, for the scoreboard, which can't compare Mathcad's draws. */
export const RANDOM_FUNCTIONS = ['rnd', 'runif', 'rnorm', ...Object.keys(FAMILIES).map((n) => `r${n}`).filter((n) => n !== 'rnorm' && n !== 'runif')];

