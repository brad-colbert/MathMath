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
 * Mathcad's interpolating splines and median smoothing, as measured in Mathcad 14 (see DESIGN.md §8).
 *
 * A cubic spline is kept as its second derivatives at the data points. The three kinds differ only at
 * the ends: lspline is natural (zero curvature), pspline parabolic (the end interval's curvature is its
 * neighbor's), and cspline cubic (curvature runs on linearly). Outside the data, the end cubic continues.
 */
import { EvalError } from './values.js';

export const SPLINE_KINDS = { lspline: 0, pspline: 1, cspline: 2 } as const;
export type SplineKind = 0 | 1 | 2;

/** Second derivatives of the spline through (xs, ys). */
export function secondDerivatives(xs: ArrayLike<number>, ys: ArrayLike<number>, kind: SplineKind): Float64Array {
  const n = xs.length;
  if (n < 3) throw new EvalError('runtime', 'a spline needs at least 3 points');
  const h = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1]! - xs[i]!;
    if (!(h[i]! > 0)) throw new EvalError('runtime', 'spline x values must be strictly increasing');
  }
  const slope = (i: number): number => (ys[i + 1]! - ys[i]!) / h[i]!;
  // Each end's second derivative as a combination of the next two: M0 = a·M1 + b·M2.
  const ends = (outer: number, inner: number): [number, number] => {
    if (kind === 0) return [0, 0];
    if (kind === 1) return [1, 0];
    // Linear in x through the next two.
    return [1 + outer / inner, -outer / inner];
  };
  const M = new Float64Array(n);
  if (n === 3) {
    // One interior equation, with both ends written in terms of M1.
    const [a0] = ends(h[0]!, h[1]!);
    const [a2] = ends(h[1]!, h[0]!);
    if (kind === 2) {
      // Both runout conditions are the same line here, so the curvature is constant.
      M[1] = (6 * (slope(1) - slope(0))) / (h[0]! + 2 * (h[0]! + h[1]!) + h[1]!);
      M[0] = M[1];
      M[2] = M[1];
      return M;
    }
    M[1] = (6 * (slope(1) - slope(0))) / (h[0]! * a0 + 2 * (h[0]! + h[1]!) + h[1]! * a2);
    M[0] = a0 * M[1]!;
    M[2] = a2 * M[1]!;
    return M;
  }
  // Interior unknowns M1 … M(n-2), tridiagonal once the ends are substituted.
  const m = n - 2;
  const sub = new Float64Array(m);
  const diag = new Float64Array(m);
  const sup = new Float64Array(m);
  const rhs = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const i = k + 1;
    sub[k] = h[i - 1]!;
    diag[k] = 2 * (h[i - 1]! + h[i]!);
    sup[k] = h[i]!;
    rhs[k] = 6 * (slope(i) - slope(i - 1));
  }
  const [a0, b0] = ends(h[0]!, h[1]!);
  diag[0] += h[0]! * a0;
  sup[0] += h[0]! * b0;
  const [an, bn] = ends(h[n - 2]!, h[n - 3]!);
  diag[m - 1] += h[n - 2]! * an;
  sub[m - 1] += h[n - 2]! * bn;
  // Thomas algorithm.
  for (let k = 1; k < m; k++) {
    const w = sub[k]! / diag[k - 1]!;
    diag[k] -= w * sup[k - 1]!;
    rhs[k] -= w * rhs[k - 1]!;
  }
  M[m] = rhs[m - 1]! / diag[m - 1]!;
  for (let k = m - 2; k >= 0; k--) M[k + 1] = (rhs[k]! - sup[k]! * M[k + 2]!) / diag[k]!;
  M[0] = a0 * M[1]! + b0 * M[2]!;
  M[n - 1] = an * M[n - 2]! + bn * M[n - 3]!;
  return M;
}

/** The spline's value at x. Past either end, the end interval's cubic continues. */
export function splineAt(xs: ArrayLike<number>, ys: ArrayLike<number>, M: ArrayLike<number>, x: number): number {
  const n = xs.length;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const [x0, x1] = [xs[lo]!, xs[hi]!];
  const h = x1 - x0;
  const a = (x1 - x) / h;
  const b = (x - x0) / h;
  return a * ys[lo]! + b * ys[hi]! + (((a ** 3 - a) * M[lo]! + (b ** 3 - b) * M[hi]!) * h * h) / 6;
}

/** A 2-D spline on a square grid: each row of z (one per x1) splined along x2, rows one after another. */
export function secondDerivatives2(x2: ArrayLike<number>, z: (i: number, j: number) => number, rows: number, kind: SplineKind): Float64Array {
  const n = x2.length;
  const out = new Float64Array(rows * n);
  for (let i = 0; i < rows; i++) out.set(secondDerivatives(x2, Array.from({ length: n }, (_, j) => z(i, j)), kind), i * n);
  return out;
}

/** The 2-D spline's value: each row at p2, then a spline down the column of those values at p1. */
export function spline2At(
  x1: ArrayLike<number>, x2: ArrayLike<number>, z: (i: number, j: number) => number, M: ArrayLike<number>, kind: SplineKind, p1: number, p2: number,
): number {
  const n = x2.length;
  const col = Array.from(x1, (_, i) => splineAt(x2, Array.from({ length: n }, (_, j) => z(i, j)), (M as Float64Array).subarray(i * n, (i + 1) * n), p2));
  return splineAt(x1, col, secondDerivatives(x1, col, kind), p1);
}

/**
 * Mathcad's bspline: the piecewise polynomial of degree `deg` with breaks at `u` that passes through every
 * data point, with deg − 1 continuous derivatives at each inner break. Returned as Mathcad shows it: each
 * interval's coefficients in powers of x, lowest first, and each interval's ends.
 */
export function bsplineFit(xs: ArrayLike<number>, ys: ArrayLike<number>, u: ArrayLike<number>, deg: number): { coef: Float64Array; ends: Float64Array } {
  if (!Number.isInteger(deg) || deg < 1 || deg > 3) throw new EvalError('runtime', 'bspline degree must be 1, 2 or 3');
  const m = u.length - 1;
  if (m < 1 || xs.length !== m + deg) {
    throw new EvalError('runtime', `bspline needs ${deg - 1} fewer break points than data points`);
  }
  for (let j = 0; j < m; j++) if (!(u[j + 1]! > u[j]!)) throw new EvalError('runtime', 'bspline break points must be strictly increasing');
  const k = deg + 1;
  const size = m * k;
  const A: Float64Array[] = Array.from({ length: size }, () => new Float64Array(size));
  const b = new Float64Array(size);
  let row = 0;
  // Each data point lies on its interval's polynomial, written in t = x − (interval start).
  for (let p = 0; p < xs.length; p++) {
    const j = intervalOf(u, xs[p]!);
    const t = xs[p]! - u[j]!;
    for (let q = 0; q < k; q++) A[row]![j * k + q] = t ** q;
    b[row++] = ys[p]!;
  }
  // Value and derivatives up to deg − 1 agree across each inner break.
  for (let j = 1; j < m; j++) {
    const h = u[j]! - u[j - 1]!;
    for (let d = 0; d < deg; d++) {
      for (let q = d; q < k; q++) A[row]![(j - 1) * k + q] = (falling(q, d) * h ** (q - d));
      A[row]![j * k + d] = -falling(d, d);
      b[row++] = 0;
    }
  }
  const local = solve(A, b);
  // From powers of (x − a) to powers of x.
  const coef = new Float64Array(size);
  const ends = new Float64Array(2 * m);
  for (let j = 0; j < m; j++) {
    const a = u[j]!;
    for (let q = 0; q < k; q++) {
      let s = 0;
      for (let p = q; p < k; p++) s += local[j * k + p]! * choose(p, q) * (-a) ** (p - q);
      coef[j * k + q] = s;
    }
    ends[2 * j] = u[j]!;
    ends[2 * j + 1] = u[j + 1]!;
  }
  return { coef, ends };
}

/** A bspline's value at x. Past either end, the end polynomial continues. */
export function bsplineAt(coef: ArrayLike<number>, ends: ArrayLike<number>, x: number): number {
  const m = ends.length / 2;
  const k = coef.length / m;
  let j = 0;
  while (j < m - 1 && x >= ends[2 * j + 1]!) j++;
  let s = 0;
  for (let q = k - 1; q >= 0; q--) s = s * x + coef[j * k + q]!;
  return s;
}

/**
 * Running median over a window of n (odd), centered. Near the ends the window is cut short rather than
 * padded, and a window with an even count takes the mean of its two middle values.
 */
export function medianSmooth(ys: ArrayLike<number>, n: number): Float64Array {
  if (!Number.isInteger(n) || n < 1 || n % 2 === 0) throw new EvalError('runtime', 'medsmooth needs an odd window size, such as 3 or 5');
  const half = (n - 1) / 2;
  const out = new Float64Array(ys.length);
  for (let i = 0; i < ys.length; i++) {
    const w = Array.prototype.slice.call(ys, Math.max(0, i - half), Math.min(ys.length, i + half + 1)) as number[];
    w.sort((a, b) => a - b);
    const mid = w.length >> 1;
    out[i] = w.length % 2 ? w[mid]! : (w[mid - 1]! + w[mid]!) / 2;
  }
  return out;
}

function intervalOf(u: ArrayLike<number>, x: number): number {
  const m = u.length - 1;
  let j = 0;
  while (j < m - 1 && x >= u[j + 1]!) j++;
  return j;
}

/** q(q−1)…(q−d+1): the d-th derivative's factor for t^q. */
function falling(q: number, d: number): number {
  let f = 1;
  for (let i = 0; i < d; i++) f *= q - i;
  return f;
}

function choose(n: number, k: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

/** Gaussian elimination with partial pivoting. */
function solve(A: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-300) throw new EvalError('runtime', 'bspline: the data points and break points leave the spline undetermined');
    [A[c], A[p]] = [A[p]!, A[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r]![k] -= f * A[c]![k]!;
      b[r] -= f * b[c]!;
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let k = r + 1; k < n; k++) s -= A[r]![k]! * x[k]!;
    x[r] = s / A[r]![r]!;
  }
  return x;
}
