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
 * Mathcad 14's smoothing, correlation and wavelet functions, as probed (2026-11-11):
 *
 * - ksmooth(vx, vy, b): each point the average of vy weighted by a Gaussian of x − xᵢ with standard deviation
 *   b/2.696756, which Mathcad's Help rounds to 0.37·b. vx must ascend.
 * - supsmooth(vx, vy): Friedman's super smoother (Friedman 1984, "A variable span smoother", SLAC PUB-3477),
 *   following his supsmu and smooth routines step by step, as they are widely distributed: running-line smooths at spans of
 *   5%, 20% and 50% of the points, the best span chosen at each point by cross-validation and smoothed, then the
 *   smooths blended by it, with no bass enhancement. vx must strictly ascend.
 * - correl(vx, vy): the circular correlation of the two vectors padded with zeros to nx + ny − 1, with vy
 *   conjugated: element m is Σ vx(n+m) · conj(vy(n)), indices taken round the padded length. So lag 0 comes first,
 *   then the lags where vx leads, then those where vy does.
 * - correl2d(M, K): K's centre, at row and column floor(size/2), laid over each element of M, with zeros beyond
 *   M's edges; the result is M's size.
 * - wave and iwave: the Daubechies four-coefficient pyramid of Numerical Recipes (wt1 with daub4), but with each
 *   level's detail coefficients turned one place, so the one that wraps round the end comes first. A length of 2
 *   is left as it is; the length must be a power of 2.
 */
import { EvalError, type Mat, type Value, dimEq, fromValues, isNoDim, num } from './values.js';

type Impl = (...args: Value[]) => Value;

export const SMOOTHING_ARITY: Record<string, [number, number]> = {
  ksmooth: [3, 3], supsmooth: [2, 2], correl: [2, 2], correl2d: [2, 2], wave: [1, 1], iwave: [1, 1],
};

/** A column vector of real numbers, and its units. */
function realColumn(v: Value | undefined, fn: string, what: string): { xs: number[]; dim: Mat['dim'] } {
  if (v?.t !== 'mat' || v.cols !== 1 || v.cells) throw new EvalError('runtime', `${fn}'s ${what} must be a column vector of numbers`);
  if (v.im?.some((x) => x !== 0)) throw new EvalError('runtime', `${fn}'s ${what} must be real`);
  return { xs: Array.from(v.re), dim: v.dim };
}
const column = (xs: number[], dim?: Mat['dim']): Mat => fromValues(xs.length, 1, xs.map((x) => num(x + 0, dim)));

function ascending(xs: number[], fn: string, strict: boolean): void {
  for (let k = 1; k < xs.length; k++) {
    if (strict ? !(xs[k]! > xs[k - 1]!) : !(xs[k]! >= xs[k - 1]!)) throw new EvalError('runtime', `${fn}'s vx must be in ascending order${strict ? ', each value above the one before' : ''}`);
  }
}

function ksmooth(vx: Value | undefined, vy: Value | undefined, vb: Value | undefined): Value {
  const x = realColumn(vx, 'ksmooth', 'vx');
  const y = realColumn(vy, 'ksmooth', 'vy');
  if (x.xs.length !== y.xs.length) throw new EvalError('runtime', "ksmooth's vx and vy must be the same length");
  if (vb?.t !== 'num' || vb.im !== 0) throw new EvalError('runtime', "ksmooth's bandwidth b must be a real number");
  if (!dimEq(vb.dim, x.dim)) throw new EvalError('runtime', "ksmooth's bandwidth b must be in vx's units");
  if (!(vb.re > 0)) throw new EvalError('runtime', "ksmooth's bandwidth b must be positive");
  ascending(x.xs, 'ksmooth', false);
  // The kernel's constant cancels in the ratio, so only the exponent matters. σ is b/2.696756: Mathcad's Help rounds
  // it to 0.37·b, but its answers fit 1/2.696756 = 0.37081589… to the last digit at every bandwidth probed.
  const s = vb.re / 2.696756;
  const out = x.xs.map((xi) => {
    let [num, den] = [0, 0];
    x.xs.forEach((xj, j) => {
      const w = Math.exp(-(((xi - xj) / s) ** 2) / 2);
      num += w * y.xs[j]!;
      den += w;
    });
    return num / den;
  });
  return column(out, y.dim);
}

/**
 * One running-line smooth (Friedman's `smooth`): a least-squares line through the ibw points either side of each,
 * the window sliding along; with `acvr`, the cross-validated residual at each point too.
 */
function runningLine(x: number[], y: number[], span: number, vsmlsq: number, acvr: number[] | null): number[] {
  const n = x.length;
  let [xm, ym, v, cv, fbw] = [0, 0, 0, 0, 0];
  let ibw = Math.trunc(0.5 * span * n + 0.5);
  if (ibw < 2) ibw = 2;
  const it = Math.min(2 * ibw + 1, n);
  const add = (xi: number, yi: number): void => {
    const fbo = fbw;
    fbw += 1;
    xm = (fbo * xm + xi) / fbw;
    ym = (fbo * ym + yi) / fbw;
    const t = fbo > 0 ? (fbw * (xi - xm)) / fbo : 0;
    v += t * (xi - xm);
    cv += t * (yi - ym);
  };
  for (let i = 0; i < it; i++) add(x[i]!, y[i]!);
  const smo = new Array<number>(n);
  for (let j = 0; j < n; j++) {
    const [out, inn] = [j - ibw - 1, j + ibw];
    if (out >= 0 && inn < n) {
      // Take the point leaving the window out, then the one entering in.
      const fbo = fbw;
      fbw -= 1;
      const xo = x[out]!;
      const t = fbw > 0 ? (fbo * (xo - xm)) / fbw : 0;
      v -= t * (xo - xm);
      cv -= t * (y[out]! - ym);
      if (fbw > 0) {
        xm = (fbo * xm - xo) / fbw;
        ym = (fbo * ym - y[out]!) / fbw;
      }
      add(x[inn]!, y[inn]!);
    }
    const a = v > vsmlsq ? cv / v : 0;
    smo[j] = a * (x[j]! - xm) + ym;
    if (acvr) {
      let h = fbw > 0 ? 1 / fbw : 0;
      if (v > vsmlsq) h += (x[j]! - xm) ** 2 / v;
      const d = 1 - h;
      acvr[j] = d > 0 ? Math.abs(y[j]! - smo[j]!) / d : j > 0 ? acvr[j - 1]! : 0;
    }
  }
  return smo;
}

/** Friedman's super smoother, as his supsmu with weights 1, no periodicity and no bass enhancement. */
export function superSmoother(x: number[], y: number[]): number[] {
  const n = x.length;
  const SPANS = [0.05, 0.2, 0.5];
  if (!(x[n - 1]! > x[0]!)) {
    const mean = y.reduce((s, v) => s + v, 0) / n;
    return y.map(() => mean);
  }
  let i = Math.trunc(n / 4);
  let j = 3 * i;
  // Friedman's indices count from 1.
  let scale = x[j - 1]! - x[i - 1]!;
  while (!(scale > 0)) {
    if (j < n) j++;
    if (i > 1) i--;
    scale = x[j - 1]! - x[i - 1]!;
  }
  const vsmlsq = (1e-3 * scale) ** 2;
  const smooths: number[][] = [];
  const residuals: number[][] = [];
  for (const span of SPANS) {
    const cv = new Array<number>(n);
    smooths.push(runningLine(x, y, span, vsmlsq, cv));
    residuals.push(runningLine(x, cv, SPANS[1]!, vsmlsq, null));
  }
  // At each point the span whose smoothed residual is least, then smoothed itself.
  const best = Array.from({ length: n }, (_, k) => {
    let [rmin, pick] = [Infinity, SPANS[0]!];
    for (let s = 0; s < 3; s++) {
      if (residuals[s]![k]! < rmin) [rmin, pick] = [residuals[s]![k]!, SPANS[s]!];
    }
    return pick;
  });
  const spanAt = runningLine(x, best, SPANS[1]!, vsmlsq, null);
  const blend = spanAt.map((s0, k) => {
    const s = Math.min(Math.max(s0, SPANS[0]!), SPANS[2]!);
    const f = s - SPANS[1]!;
    if (f >= 0) {
      const g = f / (SPANS[2]! - SPANS[1]!);
      return (1 - g) * smooths[1]![k]! + g * smooths[2]![k]!;
    }
    const g = -f / (SPANS[1]! - SPANS[0]!);
    return (1 - g) * smooths[1]![k]! + g * smooths[0]![k]!;
  });
  return runningLine(x, blend, SPANS[0]!, vsmlsq, null);
}

function supsmooth(vx: Value | undefined, vy: Value | undefined): Value {
  const x = realColumn(vx, 'supsmooth', 'vx');
  const y = realColumn(vy, 'supsmooth', 'vy');
  if (x.xs.length !== y.xs.length) throw new EvalError('runtime', "supsmooth's vx and vy must be the same length");
  if (x.xs.length === 0) throw new EvalError('runtime', 'supsmooth needs at least one point');
  ascending(x.xs, 'supsmooth', true);
  // Three points or fewer come back as they are, as in Mathcad: there's too little to smooth.
  if (x.xs.length < 4) return column(y.xs, y.dim);
  return column(superSmoother(x.xs, y.xs), y.dim);
}

/** A column vector of complex numbers without units, as [re, im] lists. */
function complexColumn(v: Value | undefined, fn: string, what: string): { re: number[]; im: number[] } {
  if (v?.t !== 'mat' || v.cols !== 1 || v.cells) throw new EvalError('runtime', `${fn}'s ${what} must be a column vector of numbers`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must have no units`);
  return { re: Array.from(v.re), im: v.im ? Array.from(v.im) : new Array<number>(v.rows).fill(0) };
}

function correl(vx: Value | undefined, vy: Value | undefined): Value {
  const a = complexColumn(vx, 'correl', 'vx');
  const b = complexColumn(vy, 'correl', 'vy');
  const [na, nb] = [a.re.length, b.re.length];
  const N = na + nb - 1;
  const out: Value[] = [];
  for (let m = 0; m < N; m++) {
    let [re, im] = [0, 0];
    for (let k = 0; k < nb; k++) {
      // vx at (k + m) round the padded length, times conj(vy at k).
      const i = (k + m) % N;
      if (i >= na) continue;
      re += a.re[i]! * b.re[k]! + a.im[i]! * b.im[k]!;
      im += a.im[i]! * b.re[k]! - a.re[i]! * b.im[k]!;
    }
    out.push(num(re + 0, undefined, im + 0));
  }
  return fromValues(N, 1, out);
}

function realMatrix(v: Value | undefined, fn: string, what: string): Mat {
  if (v?.t !== 'mat' || v.cells) throw new EvalError('runtime', `${fn}'s ${what} must be a matrix of numbers`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must have no units`);
  if (v.im?.some((x) => x !== 0)) throw new EvalError('runtime', `${fn}'s ${what} must be real`);
  return v;
}

function correl2d(vm: Value | undefined, vk: Value | undefined): Value {
  const M = realMatrix(vm, 'correl2d', 'M');
  const K = realMatrix(vk, 'correl2d', 'K');
  const [cr, cc] = [Math.floor(K.rows / 2), Math.floor(K.cols / 2)];
  const at = (m: Mat, r: number, c: number): number => m.re[r + c * m.rows]!;
  const out: Value[] = [];
  for (let c = 0; c < M.cols; c++) {
    for (let r = 0; r < M.rows; r++) {
      let sum = 0;
      for (let b = 0; b < K.cols; b++) {
        for (let a = 0; a < K.rows; a++) {
          const [i, j] = [r + a - cr, c + b - cc];
          if (i >= 0 && i < M.rows && j >= 0 && j < M.cols) sum += at(K, a, b) * at(M, i, j);
        }
      }
      out.push(num(sum + 0));
    }
  }
  return fromValues(M.rows, M.cols, out);
}

const SQ3 = Math.sqrt(3);
const D4 = [(1 + SQ3) / (4 * Math.SQRT2), (3 + SQ3) / (4 * Math.SQRT2), (3 - SQ3) / (4 * Math.SQRT2), (1 - SQ3) / (4 * Math.SQRT2)];

/** One level of the Daubechies-4 filter on the first n values, forward or back, as Numerical Recipes' daub4. */
function daub4(a: number[], n: number, forward: boolean): void {
  const nh = n >> 1;
  const w = new Array<number>(n).fill(0);
  const [C0, C1, C2, C3] = D4 as [number, number, number, number];
  if (forward) {
    for (let i = 0, j = 0; j < n; j += 2, i++) {
      const [p, q, r, s] = [a[j]!, a[j + 1]!, a[(j + 2) % n]!, a[(j + 3) % n]!];
      w[i] = C0 * p + C1 * q + C2 * r + C3 * s;
      w[i + nh] = C3 * p - C2 * q + C1 * r - C0 * s;
    }
  } else {
    w[0] = C2 * a[nh - 1]! + C1 * a[n - 1]! + C0 * a[0]! + C3 * a[nh]!;
    w[1] = C3 * a[nh - 1]! - C0 * a[n - 1]! + C1 * a[0]! - C2 * a[nh]!;
    for (let i = 0, j = 2; i < nh - 1; i++) {
      w[j++] = C2 * a[i]! + C1 * a[i + nh]! + C0 * a[i + 1]! + C3 * a[i + nh + 1]!;
      w[j++] = C3 * a[i]! - C0 * a[i + nh]! + C1 * a[i + 1]! - C2 * a[i + nh + 1]!;
    }
  }
  for (let k = 0; k < n; k++) a[k] = w[k]!;
}

/** Mathcad's detail blocks are Numerical Recipes' turned one place right: the wrap-round coefficient first. */
function turn(a: number[], n: number, right: boolean): void {
  const nh = n >> 1;
  const d = a.slice(nh, n);
  const t = right ? [d[nh - 1]!, ...d.slice(0, nh - 1)] : [...d.slice(1), d[0]!];
  for (let k = 0; k < nh; k++) a[nh + k] = t[k]!;
}

function wavelet(v: Value | undefined, forward: boolean): Value {
  const fn = forward ? 'wave' : 'iwave';
  const { xs, dim } = realColumn(v, fn, 'vector');
  if (!isNoDim(dim)) throw new EvalError('runtime', `${fn}'s vector must have no units`);
  const n = xs.length;
  if (n < 2) throw new EvalError('runtime', `${fn}'s vector needs at least 2 elements`);
  if ((n & (n - 1)) !== 0) throw new EvalError('runtime', `${fn}'s vector must have a power of 2 elements: 2, 4, 8, 16…`);
  const a = xs.slice();
  if (forward) {
    for (let nn = n; nn >= 4; nn >>= 1) {
      daub4(a, nn, true);
      turn(a, nn, true);
    }
  } else {
    for (let nn = 4; nn <= n; nn <<= 1) {
      turn(a, nn, false);
      daub4(a, nn, false);
    }
  }
  return column(a);
}

export const smoothingFns: Record<string, Impl> = {
  ksmooth, supsmooth, correl, correl2d,
  wave: (v) => wavelet(v, true),
  iwave: (v) => wavelet(v, false),
};

