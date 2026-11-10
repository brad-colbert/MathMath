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
 * Mathcad's special functions: Γ, the incomplete Γ and lnΓ; the classical orthogonal polynomials; the Gauss and
 * confluent hypergeometric functions; ibeta; sinc, ε and ln0; and the Bessel family for real arguments: J, Y, I, K
 * of any real order, the Hankel functions, Airy functions, Kelvin functions and spherical Bessel functions, with
 * Mathcad's scaled forms. Probed in Mathcad 14 at about 590 points and checked against mpmath at 40 digits.
 *
 * - lnΓ is the analytic log-gamma, not ln(Γ(z)): lnΓ(−0.5) is 1.2655 − iπ, as Mathcad's.
 * - Her is the physicists' Hermite polynomial: Her(2, x) = 4x² − 2.
 * - ibeta(a, x, y) is the regularized incomplete beta with a as its upper limit.
 * - At a negative real x, a Bessel function of fractional order is complex: J_ν(−x) = e^{iπν}·J_ν(x). Mathcad 14
 *   keeps only the real part there (Jn(0.5, −2) comes out 0; the value is 0.513i), and gives NaN for Y1(−2); MathMath
 *   gives the values. Likewise mhyper(0.5, 1, 100), which Mathcad's series gives as 0, and lnΓ(1e5), which it
 *   overflows on.
 * - Complex arguments to the Bessel family aren't here yet: Mathcad takes them, through Amos's library.
 */
import { type C, cadd, cmul, csub } from './complex.js';
import { cexp } from './elementary.js';
import { besselFns } from './bessel.js';
import { betaI, gammaP } from './distributions.js';
import { EvalError, NODIM, type Num, type Value, isNoDim, num } from './values.js';

type Impl = (...args: Value[]) => Value;

export const SPECIAL_ARITY: Record<string, [number, number]> = {
  'Γ': [1, 2], 'lnΓ': [1, 1], Her: [2, 2], Tcheb: [2, 2], Ucheb: [2, 2], Lag: [2, 2], Leg: [2, 2], Jac: [4, 4],
  fhyper: [4, 4], mhyper: [3, 3], ibeta: [3, 3], sinc: [1, 1], 'ε': [3, 3], ln0: [1, 1],
};

const undefinedAt = (fn: string): EvalError => new EvalError('runtime', `${fn} is undefined here: it has a singularity`);
const overflow = (fn: string): EvalError => new EvalError('runtime', `${fn} is too large to calculate here: over 10³⁰⁷`);

/** A dimensionless number, real or complex. */
function plain(v: Value | undefined, fn: string, what = 'argument'): Num {
  if (v?.t !== 'num') throw new EvalError('runtime', `${fn}'s ${what} must be a number`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must have no units`);
  return v;
}
function realArg(v: Value | undefined, fn: string, what = 'argument'): number {
  const x = plain(v, fn, what);
  if (x.im !== 0) throw new EvalError('runtime', `${fn}'s ${what} must be real`);
  return x.re;
}
function degree(v: Value | undefined, fn: string): number {
  const n = realArg(v, fn, 'degree');
  if (!Number.isInteger(n) || n < 0) throw new EvalError('runtime', `${fn}'s degree must be a whole number, 0 or more`);
  return n;
}
const result = (re: number, im = 0, fn = ''): Num => {
  if (!Number.isFinite(re) || !Number.isFinite(im)) throw overflow(fn);
  return num(re, NODIM, im);
};

// ---------------------------------------------------------------- Γ

/** Lanczos coefficients for g = 607/128, 15 terms (Godfrey): about 1e−15 relative, real or complex. */
const LG = 607 / 128;
const LC = [0.99999999999999709182, 57.156235665862923517, -59.597960355475491248, 14.136097974741747174,
  -0.49191381609762019978, 0.33994649984811888699e-4, 0.46523628927048575665e-4, -0.98374475304879564677e-4,
  0.15808870322491248884e-3, -0.21026444172410488319e-3, 0.21743961811521264320e-3, -0.16431810653676389022e-3,
  0.84418223983852743293e-4, -0.26190838401581408670e-4, 0.36899182659531622704e-5];
const LN_SQRT_2PI = 0.91893853320467274178;

/** sin(πx), exact at whole and half numbers. */
function sinpi(x: number): number {
  const r = x - 2 * Math.round(x / 2);
  if (r === 0 || Math.abs(r) === 1) return 0;
  if (Math.abs(r) === 0.5) return Math.sign(r);
  return Math.sin(Math.PI * r);
}

/** Γ(x) for real x: Lanczos near the origin, Stirling's series beyond, and reflection below ½. */
export function gammaReal(x: number): number {
  if (x <= 0 && Number.isInteger(x)) return NaN;
  if (x < 0.5) return Math.PI / (sinpi(x) * gammaReal(1 - x));
  if (Number.isInteger(x) && x <= 23) {
    let f = 1;
    for (let k = 2; k < x; k++) f *= k;
    return f;
  }
  if (x > 171.7) return Infinity;
  if (x < 12) {
    const z = x - 1;
    let a = LC[0]!;
    for (let k = 1; k < 15; k++) a += LC[k]! / (z + k);
    const t = z + LG + 0.5;
    // t^(z+½)·e^(−t), split so that neither half overflows.
    const p = Math.pow(t, (z + 0.5) / 2);
    return Math.sqrt(2 * Math.PI) * p * (p * Math.exp(-t)) * a;
  }
  // Stirling: Γ(x) = √(2π) x^(x−½) e^(−x) exp(1/(12x) − 1/(360x³) + …).
  const y = 1 / (x * x);
  const s = (1 / x) * (1 / 12 + y * (-1 / 360 + y * (1 / 1260 + y * (-1 / 1680 + y * (1 / 1188 + y * (-691 / 360360 + y * (1 / 156 - y * 3617 / 122400)))))));
  const p = Math.pow(x, (x - 0.5) / 2);
  return Math.sqrt(2 * Math.PI) * p * (p * Math.exp(-x)) * Math.exp(s);
}

const clog = (z: C): C => [Math.log(Math.hypot(z[0], z[1])), Math.atan2(z[1] || 0, z[0])];

/** The analytic log-gamma, as mpmath's loggamma and Mathcad's lnΓ: continuous off the negative real axis. */
export function lnGammaComplex(z: C): C {
  if (z[1] === 0 && z[0] <= 0 && Number.isInteger(z[0])) throw undefinedAt('lnΓ');
  // The recurrence below takes a step for each unit below 7; past −10⁵, Γ is far below 10⁻³⁰⁷ in any case.
  if (z[0] < -1e5) throw new EvalError('runtime', 'lnΓ and Γ of a complex z are worked out only down to Re(z) = −100 000');
  // Shift right of ½ by the recurrence, taking off a principal log for each step: that is the analytic branch.
  let shift: C = [0, 0];
  let w: C = [z[0], z[1]];
  while (w[0] < 7) {
    shift = cadd(shift, clog(w));
    w = [w[0] + 1, w[1]];
  }
  // Stirling's series at w.
  const lw = clog(w);
  const inv = cdiv1(w);
  const inv2 = cmul(inv, inv);
  const B = [1 / 12, -1 / 360, 1 / 1260, -1 / 1680, 1 / 1188, -691 / 360360, 1 / 156, -3617 / 122400];
  let series: C = [0, 0];
  for (let k = B.length - 1; k >= 0; k--) series = cadd(cmul(series, inv2), [B[k]!, 0]);
  series = cmul(series, inv);
  const main = cadd(csub(cmul([w[0] - 0.5, w[1]], lw), w), [LN_SQRT_2PI, 0]);
  return csub(cadd(main, series), shift);
}
function cdiv1(z: C): C {
  const d = z[0] * z[0] + z[1] * z[1];
  return [z[0] / d, -z[1] / d];
}

function gammaFn(z: Num): Num {
  if (z.im === 0) {
    if (z.re <= 0 && Number.isInteger(z.re)) throw new EvalError('runtime', 'Γ is undefined at 0 and the negative whole numbers');
    return result(gammaReal(z.re), 0, 'Γ');
  }
  const l = lnGammaComplex([z.re, z.im]);
  if (l[0] > 709.78) throw overflow('Γ');
  const [re, im] = cexp(l);
  return result(re, im, 'Γ');
}

/** The upper incomplete gamma Γ(a, x) = ∫ₓ^∞ t^(a−1) e^(−t) dt, not regularized: Γ(a, 0) = Γ(a). */
function upperGamma(a: number, x: number): number {
  if (a < 0) throw new EvalError('runtime', "Γ(a, x)'s a must be 0 or more");
  if (x < 0) throw new EvalError('runtime', "Γ(a, x)'s x must be 0 or more");
  if (a === 0) throw undefinedAt('Γ(a, x) at a = 0');
  if (x === 0) return gammaReal(a);
  return gammaReal(a) * gammaP(a, x).q;
}

// ---------------------------------------------------------------- polynomials

/** The polynomials by their three-term recurrences, which keep their digits where the coefficients wouldn't. */
const POLYNOMIALS: Record<string, (n: number, x: number) => number> = {
  Her: (n, x) => recur(n, 1, 2 * x, (k, p, q) => 2 * x * p - 2 * k * q),
  Tcheb: (n, x) => recur(n, 1, x, (_, p, q) => 2 * x * p - q),
  Ucheb: (n, x) => recur(n, 1, 2 * x, (_, p, q) => 2 * x * p - q),
  Lag: (n, x) => recur(n, 1, 1 - x, (k, p, q) => ((2 * k + 1 - x) * p - k * q) / (k + 1)),
  Leg: (n, x) => recur(n, 1, x, (k, p, q) => ((2 * k + 1) * x * p - k * q) / (k + 1)),
};
/** p₀, p₁, and p_{k+1} from k, p_k and p_{k−1}. */
function recur(n: number, p0: number, p1: number, next: (k: number, p: number, q: number) => number): number {
  if (n === 0) return p0;
  let [q, p] = [p0, p1];
  for (let k = 1; k < n; k++) [q, p] = [p, next(k, p, q)];
  return p;
}
/** The Jacobi polynomial P_n^(a,b)(x), by DLMF 18.9.2. */
function jacobi(n: number, a: number, b: number, x: number): number {
  if (n === 0) return 1;
  let q = 1;
  let p = (a + 1) + ((a + b + 2) * (x - 1)) / 2;
  for (let k = 1; k < n; k++) {
    const s = 2 * k + a + b;
    const A = 2 * (k + 1) * (k + a + b + 1) * s;
    const B = (s + 1) * (a * a - b * b);
    const Cc = s * (s + 1) * (s + 2);
    const D = 2 * (k + a) * (k + b) * (s + 2);
    [q, p] = [p, (((B + Cc * x) * p) - D * q) / A];
  }
  return p;
}

// ---------------------------------------------------------------- hypergeometric

/** A power series Σ tₖ with t_{k+1} = tₖ·ratio(k), to full precision. */
function series(ratio: (k: number) => number, fn: string, limit = 2_000_000): number {
  let term = 1;
  let sum = 1;
  let largest = 1;
  for (let k = 0; k < limit; k++) {
    term *= ratio(k);
    sum += term;
    largest = Math.max(largest, Math.abs(term));
    if (term === 0 || Math.abs(term) <= 1e-17 * Math.abs(sum)) {
      // Terms far larger than the sum cancel, and their rounding swamps it: refuse rather than give a wrong number.
      if (largest > 1e5 * Math.abs(sum)) throw new EvalError('runtime', `${fn} can't be worked out to full precision here: its series cancels`);
      return sum;
    }
    if (!Number.isFinite(sum)) throw overflow(fn);
  }
  throw new EvalError('runtime', `${fn}'s series doesn't converge here`);
}
const nonPositiveInteger = (c: number): boolean => c <= 0 && Number.isInteger(c);

/** ₂F₁(a, b; c; x) for −1 < x < 1: the series, after Pfaff's transformation for negative x, where it converges faster. */
function fhyper(a: number, b: number, c: number, x: number): number {
  if (!(x > -1 && x < 1)) throw new EvalError('runtime', 'fhyper(a, b, c, x) needs x between −1 and 1');
  if (a === 0 || b === 0) return 1;
  // The series stops at a or b when either is a negative whole number; a c at or below 0 is a pole unless it stops first.
  const stop = Math.max(nonPositiveInteger(a) ? a : -Infinity, nonPositiveInteger(b) ? b : -Infinity);
  const terminates = stop > -Infinity;
  if (nonPositiveInteger(c) && !(stop > c)) throw undefinedAt('fhyper with c a negative whole number or 0');
  if (x < -0.5 && !terminates) {
    // ₂F₁(a, b; c; x) = (1 − x)^(−a) ₂F₁(a, c − b; c; x/(x − 1)).
    const y = x / (x - 1);
    return Math.pow(1 - x, -a) * series((k) => ((a + k) * (c - b + k) * y) / ((c + k) * (k + 1)), 'fhyper');
  }
  return series((k) => ((a + k) * (b + k) * x) / ((c + k) * (k + 1)), 'fhyper');
}

/** ₁F₁(a; b; x): the series, after Kummer's transformation for negative x, where the series would cancel. */
function mhyper(a: number, b: number, x: number): number {
  if (nonPositiveInteger(b) && !(nonPositiveInteger(a) && a > b)) throw undefinedAt('mhyper with b a negative whole number or 0');
  if (x < 0 && !nonPositiveInteger(a)) return Math.exp(x) * mhyper(b - a, b, -x);
  return series((k) => ((a + k) * x) / ((b + k) * (k + 1)), 'mhyper');
}

// ---------------------------------------------------------------- the table

export function specialFns(origin: () => number): Record<string, Impl> {
  const scalar = (f: (v: Num) => Value): Impl => (v) => {
    if (v?.t === 'mat') throw new EvalError('runtime', 'this function takes a single number, not an array');
    return f(plain(v, 'the function'));
  };
  return {
    'Γ': (a, b) => {
      if (b === undefined) return gammaFn(plain(a, 'Γ'));
      return result(upperGamma(realArg(a, 'Γ', 'a'), realArg(b, 'Γ', 'x')), 0, 'Γ');
    },
    'lnΓ': (z) => {
      const v = plain(z, 'lnΓ');
      if (v.im === 0 && v.re > 0) return result(lnGammaComplex([v.re, 0])[0]);
      const [re, im] = lnGammaComplex([v.re, v.im]);
      return result(re, im, 'lnΓ');
    },
    ...Object.fromEntries(Object.entries(POLYNOMIALS).map(([fn, p]) => [fn, (n: Value, x: Value) => result(p(degree(n, fn), realArg(x, fn, 'x')), 0, fn)])),
    Jac: (n, a, b, x) => {
      const [A, B] = [realArg(a, 'Jac', 'a'), realArg(b, 'Jac', 'b')];
      if (!(A > -1) || !(B > -1)) throw new EvalError('runtime', "Jac's a and b must be more than −1");
      return result(jacobi(degree(n, 'Jac'), A, B, realArg(x, 'Jac', 'x')), 0, 'Jac');
    },
    fhyper: (a, b, c, x) => result(fhyper(realArg(a, 'fhyper', 'a'), realArg(b, 'fhyper', 'b'), realArg(c, 'fhyper', 'c'), realArg(x, 'fhyper', 'x')), 0, 'fhyper'),
    mhyper: (a, b, x) => result(mhyper(realArg(a, 'mhyper', 'a'), realArg(b, 'mhyper', 'b'), realArg(x, 'mhyper', 'x')), 0, 'mhyper'),
    ibeta: (a, x, y) => {
      const [A, X, Y] = [realArg(a, 'ibeta', 'a'), realArg(x, 'ibeta', 'x'), realArg(y, 'ibeta', 'y')];
      if (!(A >= 0 && A <= 1)) throw new EvalError('runtime', "ibeta(a, x, y)'s a must be from 0 to 1");
      if (!(X > 0) || !(Y > 0)) throw new EvalError('runtime', "ibeta(a, x, y)'s x and y must be more than 0");
      return result(betaI(A, X, Y));
    },
    sinc: scalar((z) => {
      if (z.re === 0 && z.im === 0) return num(1);
      if (z.im === 0) return result(Math.sin(z.re) / z.re);
      const s: C = [Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im)];
      const d = z.re * z.re + z.im * z.im;
      return result((s[0] * z.re + s[1] * z.im) / d, (s[1] * z.re - s[0] * z.im) / d, 'sinc');
    }),
    'ε': (i, j, k) => {
      const o = origin();
      const idx = [i, j, k].map((v) => {
        const n = realArg(v, 'ε', 'index');
        if (!Number.isInteger(n)) throw new EvalError('runtime', "ε's indices must be whole numbers");
        if (n < o || n > o + 2) throw new EvalError('runtime', `ε's indices must be from ${o} to ${o + 2}`);
        return n - o;
      });
      const [a, b, c] = idx as [number, number, number];
      return num(((a - b) * (b - c) * (c - a)) / 2);
    },
    ln0: scalar((z) => {
      if (z.re === 0 && z.im === 0) return num(-1e307);
      if (z.im === 0 && z.re > 0) return num(Math.log(z.re));
      return num(Math.log(Math.hypot(z.re, z.im)), NODIM, Math.atan2(z.im || 0, z.re));
    }),
    ...besselFns(),
  };
}
