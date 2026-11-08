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
 * Polynomials and linear systems: Mathcad's `polyroots`, and MathMath's own transfer-function tools.
 *
 * A system is (b; a), or a vector b alone (a = 1), with the constant term first, as `polyroots` and the
 * `coeffs` keyword list them. Units decide its kind, as they do for filter design: frequencies and times
 * with units treat it as analog, H(s) = Σ bₖsᵏ / Σ aₖsᵏ with s in radians per second; plain numbers treat
 * it as digital, H(z) = Σ bₖz⁻ᵏ / Σ aₖz⁻ᵏ, at fractions of the sample rate and at sample numbers.
 */
import { type C, cadd, cdiv, cmul, csub } from './complex.js';
import { type Dim, EvalError, type Mat, NODIM, type Num, type Value, dimEq, getEl, isNoDim, newMat, requireMat } from './values.js';

const PER_SECOND: Dim = [0, 0, -1, 0, 0, 0, 0];
const SECOND: Dim = [0, 0, 1, 0, 0, 0, 0];

// ── Roots ──────────────────────────────────────────────────────────────────────────────────────────

/** p(z) and p′(z) for coefficients constant term first, by Horner's rule. */
function horner(c: C[], z: C): [C, C] {
  let p = c[c.length - 1]!;
  let d: C = [0, 0];
  for (let i = c.length - 2; i >= 0; i--) {
    d = cadd(cmul(d, z), p);
    p = cadd(cmul(p, z), c[i]!);
  }
  return [p, d];
}

const size = (z: C): number => Math.hypot(z[0], z[1]);

/**
 * The roots of Σ cₖzᵏ (constant term first), by the Aberth–Ehrlich iteration with a Newton polish. Leading
 * zero coefficients are dropped; zero constant terms give roots at 0. Sorted by real part, then imaginary.
 */
export function polyRoots(coefficients: C[]): C[] {
  let c = coefficients.slice();
  while (c.length > 0 && size(c.at(-1)!) === 0) c.pop();
  const out: C[] = [];
  while (c.length > 1 && size(c[0]!) === 0) {
    c = c.slice(1);
    out.push([0, 0]);
  }
  const n = c.length - 1;
  if (n === 1) out.push(cdiv([-c[0]![0], -c[0]![1]], c[1]!));
  if (n >= 2) {
    // Start on a circle at the roots' geometric mean size, turned off the axes so no guess is symmetric.
    const r = (size(c[0]!) / size(c[n]!)) ** (1 / n);
    let z: C[] = Array.from({ length: n }, (_, k) => {
      const t = (2 * Math.PI * k) / n + 0.4;
      return [r * Math.cos(t), r * Math.sin(t)] as C;
    });
    for (let iter = 0; iter < 500; iter++) {
      let moved = 0;
      for (let k = 0; k < n; k++) {
        const [p, d] = horner(c, z[k]!);
        if (size(p) === 0) continue;
        const ratio = cdiv(p, d);
        let sum: C = [0, 0];
        for (let j = 0; j < n; j++) if (j !== k) sum = cadd(sum, cdiv([1, 0], csub(z[k]!, z[j]!)));
        const w = cdiv(ratio, csub([1, 0], cmul(ratio, sum)));
        if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) continue;
        z[k] = csub(z[k]!, w);
        moved = Math.max(moved, size(w) / Math.max(size(z[k]!), 1e-300));
      }
      if (moved < 1e-16) break;
    }
    // Newton steps where they help: Aberth stops at the noise level of its own corrections.
    z = z.map((q) => {
      let best = q;
      for (let s = 0; s < 3; s++) {
        const [p, d] = horner(c, best);
        if (size(d) === 0) break;
        const next = csub(best, cdiv(p, d));
        if (size(horner(c, next)[0]) < size(p)) best = next;
        else break;
      }
      return best;
    });
    // Real coefficients: a root within rounding of the real axis is real, and the rest come in exact
    // conjugate pairs, each upper root averaged with its nearest lower partner.
    if (c.every((x) => x[1] === 0)) {
      z = z.map((q) => (Math.abs(q[1]) <= 1e-12 * Math.max(1, size(q)) ? [q[0], 0] : q));
      const lower = z.filter((q) => q[1] < 0);
      for (const q of z.filter((x) => x[1] > 0)) {
        let best = -1;
        lower.forEach((l, i) => {
          if (best < 0 || size(csub(l, [q[0], -q[1]])) < size(csub(lower[best]!, [q[0], -q[1]]))) best = i;
        });
        if (best < 0) continue;
        const l = lower.splice(best, 1)[0]!;
        const re = (q[0] + l[0]) / 2;
        const im = (q[1] - l[1]) / 2;
        q[0] = re;
        q[1] = im;
        l[0] = re;
        l[1] = -im;
      }
    }
    out.push(...z);
  }
  return out.sort(byRealThenImaginary);
}

/** Real part, then imaginary, with real parts within rounding of each other counted as equal. */
export function byRealThenImaginary(x: C, y: C): number {
  const tol = 1e-12 * Math.max(1, size(x), size(y));
  return Math.abs(x[0] - y[0]) > tol ? x[0] - y[0] : x[1] - y[1];
}

// ── Values in and out ──────────────────────────────────────────────────────────────────────────────

function vectorOf(v: Value, what: string): { re: Float64Array; im: Float64Array | null; dim: Dim } {
  const m = requireMat(v, what);
  if (m.cells) throw new EvalError('runtime', `${what} must hold numbers`);
  if (m.cols !== 1 && m.rows !== 1) throw new EvalError('runtime', `${what} must be a vector`);
  return { re: m.re, im: m.im && m.im.some((x) => x !== 0) ? m.im : null, dim: m.dim };
}

function column(xs: C[], dim: Dim): Mat {
  const m = newMat(xs.length, 1, dim);
  xs.forEach((x, i) => (m.re[i] = x[0]));
  if (xs.some((x) => x[1] !== 0)) m.im = Float64Array.from(xs, (x) => x[1]);
  return m;
}

/** Mathcad's polyroots: the roots of the polynomial whose coefficients are v, constant term first. */
export function polyroots(v: Value): Value {
  const s = vectorOf(v, "polyroots' coefficients");
  const c = Array.from(s.re, (re, i) => [re, s.im?.[i] ?? 0] as C);
  while (c.length > 0 && size(c.at(-1)!) === 0) c.pop();
  if (c.length < 2) throw new EvalError('runtime', 'polyroots needs a polynomial of degree 1 or more: give at least two coefficients, constant term first');
  return column(polyRoots(c), NODIM);
}

/**
 * A system's b and a, constant term first: (b; a), or a vector b alone with a = 1. Coefficients may carry
 * units as an analog system's do when written from its parts: the k-th in sᵏ, as (1; R·C; L·C), times one
 * common unit that cancels between b and a. `timed` says some did, which a digital filter can't have.
 */
export function systemOf(v: Value, fn: string): { b: Float64Array; a: Float64Array; timed: boolean } {
  const bad = (): never => {
    throw new EvalError('runtime', `${fn}'s system must be (b; a), two vectors of coefficients with the constant term first, or a vector b alone`);
  };
  /** A coefficient vector's numbers and units: a matrix, mixed units allowed, or a single number. */
  const terms = (x: Value, what: string): { v: number; dim: Dim }[] => {
    if (x.t === 'num') return [{ v: realPart(x, `${fn}'s ${what}`), dim: x.dim }];
    const m = requireMat(x, `${fn}'s ${what}`);
    if (m.cols !== 1 && m.rows !== 1) throw new EvalError('runtime', `${fn}'s ${what} must be a vector`);
    return Array.from({ length: m.rows * m.cols }, (_, k) => {
      const el = getEl(m, m.rows === 1 ? 0 : k, m.rows === 1 ? k : 0);
      if (el.t !== 'num') throw new EvalError('runtime', `${fn}'s ${what} must hold numbers`);
      return { v: realPart(el, `${fn}'s ${what}`), dim: el.dim };
    });
  };
  const m = requireMat(v, `${fn}'s system`);
  let bt: { v: number; dim: Dim }[];
  let at: { v: number; dim: Dim }[] = [{ v: 1, dim: NODIM }];
  // (b; a) holds at least one vector; two plain numbers side by side are a vector b with mixed units.
  if (m.cells && m.rows * m.cols === 2 && m.cells.some((c) => c.t === 'mat')) {
    bt = terms(m.cells[0]!, 'b coefficients');
    at = terms(m.cells[1]!, 'a coefficients');
  } else if (m.cells && m.cells.some((c) => c.t !== 'num')) {
    bt = bad();
  } else {
    bt = terms(m, 'coefficients');
  }
  // The unit left after taking sᵏ out of the k-th coefficient must be the same for every nonzero one.
  let common: Dim | null = null;
  for (const list of [bt, at]) {
    list.forEach((c, k) => {
      if (c.v === 0) return;
      // A plain number is taken as written in seconds already.
      const left = isNoDim(c.dim) ? NODIM : c.dim.map((x, i) => (i === 2 ? x - k : x));
      if (common === null) common = left;
      else if (!dimEq(common, left)) {
        throw new EvalError('runtime', `${fn}'s coefficients must be plain numbers, or for an analog system have units of s^k for the k-th (as R·C, L·C), times one unit common to all`);
      }
    });
  }
  const timed = [...bt, ...at].some((c) => c.v !== 0 && !isNoDim(c.dim));
  const b = Float64Array.from(bt, (c) => c.v);
  const a = Float64Array.from(at, (c) => c.v);
  if (a.every((x) => x === 0)) throw new EvalError('runtime', `${fn}'s a coefficients can't all be 0`);
  return { b, a, timed };
}

const realPart = (x: Num, what: string): number => {
  if (x.im !== 0) throw new EvalError('runtime', `${what} must be real`);
  return x.re;
};

const noUnits = (timed: boolean, fn: string): void => {
  if (timed) throw new EvalError('runtime', `${fn}: a digital filter's coefficients are plain numbers; these have units, as an analog system's do`);
};

// ── Frequency response ─────────────────────────────────────────────────────────────────────────────

/** H(s) at s = i·2πf, f in hertz, for coefficients constant term first. */
export function analogAt(b: Float64Array, a: Float64Array, f: number): C {
  const s: C = [0, 2 * Math.PI * f];
  const at = (c: Float64Array): C => horner(Array.from(c, (x) => [x, 0] as C), s)[0];
  return cdiv(at(b), at(a));
}

// ── Poles and zeros ────────────────────────────────────────────────────────────────────────────────

/** Roots of a polynomial in s, constant term first, in 1/s (radians per second). */
function sRoots(c: Float64Array, fn: string, what: string): Value {
  const roots = polyRoots(Array.from(c, (x) => [x, 0] as C));
  if (roots.length === 0) throw new EvalError('runtime', `${fn}: this system has no ${what} (that polynomial is a constant)`);
  return column(roots, PER_SECOND);
}

/** Roots in z of Σ cₖz⁻ᵏ, after both polynomials are brought to the same length (multiplying through by zᴺ). */
function zRoots(c: Float64Array, length: number, fn: string, what: string): Value {
  const padded = new Float64Array(length);
  padded.set(c);
  const roots = polyRoots(Array.from(padded, (x) => [x, 0] as C).reverse());
  if (roots.length === 0) throw new EvalError('runtime', `${fn}: this filter has no ${what}`);
  return column(roots, NODIM);
}

// ── Step and impulse responses ─────────────────────────────────────────────────────────────────────

type Matrix = number[][];
const zerosM = (n: number, m = n): Matrix => Array.from({ length: n }, () => new Array<number>(m).fill(0));
const eye = (n: number): Matrix => zerosM(n).map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
const mmul = (x: Matrix, y: Matrix): Matrix => x.map((r) => y[0]!.map((_, j) => r.reduce((s, v, k) => s + v * y[k]![j]!, 0)));
const madd = (x: Matrix, y: Matrix, f = 1): Matrix => x.map((r, i) => r.map((v, j) => v + f * y[i]![j]!));
const mscale = (x: Matrix, f: number): Matrix => x.map((r) => r.map((v) => v * f));

/** Solves D·X = N by Gaussian elimination with partial pivoting. */
function solve(d: Matrix, n: Matrix): Matrix {
  const size = d.length;
  const A = d.map((r) => r.slice());
  const B = n.map((r) => r.slice());
  for (let c = 0; c < size; c++) {
    let p = c;
    for (let r = c + 1; r < size; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!];
    [B[c], B[p]] = [B[p]!, B[c]!];
    for (let r = c + 1; r < size; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k < size; k++) A[r]![k]! -= f * A[c]![k]!;
      for (let k = 0; k < B[0]!.length; k++) B[r]![k]! -= f * B[c]![k]!;
    }
  }
  for (let r = size - 1; r >= 0; r--) {
    for (let k = 0; k < B[0]!.length; k++) {
      let s = B[r]![k]!;
      for (let j = r + 1; j < size; j++) s -= A[r]![j]! * B[j]![k]!;
      B[r]![k] = s / A[r]![r]!;
    }
  }
  return B;
}

/** e^M by scaling and squaring with a degree-6 Padé approximant, accurate to rounding once ‖M‖ ≤ ½. */
export function expm(m: Matrix): Matrix {
  const n = m.length;
  const norm = Math.max(...m.map((r) => r.reduce((s, v) => s + Math.abs(v), 0)));
  const squarings = norm > 0.5 ? Math.ceil(Math.log2(norm / 0.5)) : 0;
  const a = mscale(m, 2 ** -squarings);
  const coefficients = [1, 1 / 2, 5 / 44, 1 / 66, 1 / 792, 1 / 15840, 1 / 665280];
  let power = eye(n);
  let num = eye(n);
  let den = eye(n);
  for (let k = 1; k < coefficients.length; k++) {
    power = mmul(power, a);
    num = madd(num, power, coefficients[k]!);
    den = madd(den, power, (k % 2 ? -1 : 1) * coefficients[k]!);
  }
  let e = solve(den, num);
  for (let s = 0; s < squarings; s++) e = mmul(e, e);
  return e;
}

/**
 * The controllable canonical state space of H(s), as SciPy's `tf2ss`: x′ = Ax + Bu, y = Cx + Du. Refuses an
 * improper H, whose numerator is of higher degree than its denominator.
 */
function stateSpace(b: Float64Array, a: Float64Array, fn: string): { A: Matrix; B: Matrix; C: number[]; D: number } {
  const trim = (c: Float64Array): number[] => {
    const x = Array.from(c);
    while (x.length > 1 && x.at(-1) === 0) x.pop();
    return x;
  };
  const den = trim(a);
  const num = trim(b);
  const n = den.length - 1;
  if (num.length - 1 > n) throw new EvalError('runtime', `${fn}: the numerator's degree is above the denominator's, so this system has no step or impulse response`);
  const lead = den[n]!;
  const alpha = den.map((x) => x / lead);
  const beta = Array.from({ length: n + 1 }, (_, k) => (num[k] ?? 0) / lead);
  const D = beta[n]!;
  const A = zerosM(n);
  for (let j = 0; j < n; j++) A[0]![j] = -alpha[n - 1 - j]!;
  for (let i = 1; i < n; i++) A[i]![i - 1] = 1;
  const B = zerosM(n, 1);
  if (n > 0) B[0]![0] = 1;
  const C = Array.from({ length: n }, (_, j) => beta[n - 1 - j]! - alpha[n - 1 - j]! * D);
  return { A, B, C, D };
}

/** y(t) for an analog system started at rest at t = 0: the step response, or the impulse response (whose
 *  impulse at t = 0 from a direct term D is left out, as SciPy's `impulse` does). */
function analogResponse(b: Float64Array, a: Float64Array, times: Float64Array, step: boolean, fn: string): Float64Array {
  const { A, B, C, D } = stateSpace(b, a, fn);
  const n = A.length;
  return times.map((t) => {
    if (t < 0) return 0;
    if (n === 0) return step ? D : 0;
    if (step) {
      // e^([[A, B], [0, 0]]·t) holds ∫₀ᵗ e^(Aτ) dτ·B in its last column.
      const m = zerosM(n + 1);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) m[i]![j] = A[i]![j]! * t;
        m[i]![n] = B[i]![0]! * t;
      }
      const e = expm(m);
      return C.reduce((s, c, i) => s + c * e[i]![n]!, 0) + D;
    }
    const e = expm(mscale(A, t));
    return C.reduce((s, c, i) => s + c * e[i]!.reduce((x, v, j) => x + v * B[j]![0]!, 0), 0);
  });
}

/** Direct form II transposed: y for input x through b/a, a normalized so a₀ = 1. */
function lfilter(b: Float64Array, a: Float64Array, x: Float64Array): Float64Array {
  const n = Math.max(a.length, b.length);
  const bb = new Float64Array(n);
  const aa = new Float64Array(n);
  bb.set(b.map((v) => v / a[0]!));
  aa.set(a.map((v) => v / a[0]!));
  const z = new Float64Array(n);
  return x.map((xi) => {
    const yi = bb[0]! * xi + z[0]!;
    for (let k = 0; k < n - 1; k++) z[k] = bb[k + 1]! * xi + z[k + 1]! - aa[k + 1]! * yi;
    return yi;
  });
}

/** Times with units: an analog response at those times. Plain numbers: a digital one at those sample numbers. */
function response(vh: Value, vt: Value, step: boolean, fn: string): Value {
  const { b, a, timed } = systemOf(vh, fn);
  const scalar = vt.t === 'num';
  const t = scalar ? { re: Float64Array.of((vt as Num).re), dim: (vt as Num).dim } : vectorOf(vt, `${fn}'s times`);
  let y: Float64Array;
  if (dimEq(t.dim, SECOND)) {
    y = analogResponse(b, a, t.re, step, fn);
  } else if (isNoDim(t.dim)) {
    noUnits(timed, fn);
    if (t.re.some((k) => !Number.isInteger(k) || k < 0)) {
      throw new EvalError('runtime', `${fn}: plain numbers are sample numbers (0, 1, 2 …) for a digital filter. For an analog H(s), give times with units, such as t·s`);
    }
    if (a[0] === 0) throw new EvalError('runtime', `${fn}'s first a coefficient can't be 0 for a digital filter`);
    const count = Math.max(...t.re) + 1;
    const x = new Float64Array(count);
    if (step) x.fill(1);
    else x[0] = 1;
    const all = lfilter(b, a, x);
    y = t.re.map((k) => all[k]!);
  } else {
    throw new EvalError('runtime', `${fn}'s times must be in seconds (or another time unit) for an analog system, or sample numbers for a digital one`);
  }
  if (scalar) return { t: 'num', re: y[0]!, im: 0, dim: NODIM };
  const out = newMat(y.length, 1);
  out.re.set(y);
  return out;
}

// ── Phase ──────────────────────────────────────────────────────────────────────────────────────────

/** Removes jumps of more than π between neighbors by adding multiples of 2π, as NumPy's `unwrap`. */
export function unwrap(p: Float64Array): Float64Array {
  const out = Float64Array.from(p);
  let correction = 0;
  for (let i = 1; i < p.length; i++) {
    const dd = p[i]! - p[i - 1]!;
    let mod = ((((dd + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    if (mod === -Math.PI && dd > 0) mod = Math.PI;
    if (Math.abs(dd) >= Math.PI) correction += mod - dd;
    out[i] = p[i]! + correction;
  }
  return out;
}

export const systemFns: Record<string, (...v: Value[]) => Value> = {
  polyroots: (v) => polyroots(v!),
  analogPoles: (h) => sRoots(systemOf(h!, 'analogPoles').a, 'analogPoles', 'poles'),
  analogZeros: (h) => sRoots(systemOf(h!, 'analogZeros').b, 'analogZeros', 'zeros'),
  digitalPoles: (h) => {
    const { b, a, timed } = systemOf(h!, 'digitalPoles');
    noUnits(timed, 'digitalPoles');
    return zRoots(a, Math.max(a.length, b.length), 'digitalPoles', 'poles');
  },
  digitalZeros: (h) => {
    const { b, a, timed } = systemOf(h!, 'digitalZeros');
    noUnits(timed, 'digitalZeros');
    return zRoots(b, Math.max(a.length, b.length), 'digitalZeros', 'zeros');
  },
  stepResponse: (h, t) => response(h!, t!, true, 'stepResponse'),
  impulseResponse: (h, t) => response(h!, t!, false, 'impulseResponse'),
  unwrapPhase: (v) => {
    const s = vectorOf(v!, "unwrapPhase's phases");
    if (s.im) throw new EvalError('runtime', "unwrapPhase's phases must be real (use arg of the response)");
    const out = newMat(s.re.length, 1);
    out.re.set(unwrap(s.re));
    return out;
  },
};

export const SYSTEM_ARITY: Record<string, [number, number]> = {
  polyroots: [1, 1], analogPoles: [1, 1], analogZeros: [1, 1], digitalPoles: [1, 1], digitalZeros: [1, 1],
  stepResponse: [2, 2], impulseResponse: [2, 2], unwrapPhase: [1, 1],
};
