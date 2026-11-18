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
 * Local regression (loess), a port to TypeScript of netlib's dloess (Cleveland, Grosse and Shyu, AT&T, 1992),
 * with the LINPACK routines it calls (dqrdc, dqrsl, dsvdc) and the BLAS under them. The reference program's
 * `loess` returns exactly what dloess's driver `loess_` computes with its defaults, so this follows that
 * source step by step: fitted values come from local quadratic fits at the vertices of a k-d tree, blended
 * between vertices ("interpolate"); the statistics (trace of the hat matrix, delta 1 and 2) use the exact
 * trace below 500 points and dloess's approximation from 500 up, then its interpolation formulas.
 *
 * The vector returned is, as probed, the whole state of the fit, so that `interp` can rebuild the tree and
 * evaluate it later:
 *
 *   tag, length, fitted(n), residuals(n), parameter(7), a(nc), xi(nc), vert(2d), vval((d+1)·nv),
 *   robust(n), divisor(d), s, one_delta, two_delta, span
 *
 * where parameter is d, n, vc, nc, nv and two workspace sizes (derived the way dloess lays out its integer and
 * real workspaces), a and xi are the k-d tree's cut dimension (0 for a leaf) and cut value for each cell, vert
 * is the lower then the upper corner of the padded bounding box, and vval holds, for each vertex, the fitted
 * value then its d slopes. robust is all ones (the Gaussian family needs no robustness passes) and divisor is
 * each column's scale (1 for one variable; the 10%-trimmed standard deviation for several).
 *
 * What is ported: degree 2, the Gaussian family, surface "interpolate", statistics "approximate", cell 0.2,
 * normalized columns. Arithmetic is kept in dloess's order where it decides an integer (neighbour counts,
 * cell sizes) and wherever the sums can reasonably be kept the same. Fortran's one-based, column-major arrays
 * are kept as they are, with the index shifted by one at each access, so the port can be read next to the
 * source. Routines dloess has for other options (direct evaluation, explicit hat matrix, robustness
 * iterations) are not here.
 *
 * Where this differs from the netlib source as it is distributed now, because the reference, as probed, behaves like
 * the older code (all of it settled by probes with tied values and with three and four variables):
 *
 * - Ties at a cut go with the upper cell: the cut backs up to the first of a run of equal values, looking at the
 *   points in the order the selection left them. The current source instead searches outward for a gap.
 * - A point exactly on a cut belongs to the upper cell when the fitted surface is evaluated. The current source
 *   sends it to the lower cell. (Only visible with three or more variables, where the blend isn't continuous.)
 * - g1 in the approximate trace (500 points and up) is single precision, as the Fortran's implicit typing makes it.
 *
 * What stops a fit, as probed: dloess's own errors (a span with fewer points than terms, a zero-width neighbourhood) and
 * three of its warnings: a trace that the delta formulas can't use (at or above n, which is what an interpolating fit
 * gives, or negative or NaN, which ill-conditioned fits on heavily tied data give, or below the number of terms when
 * no local fit was singular), and a k-d tree that outgrew its workspace. The reference words these "does not
 * converge". A trace within 1e-10 of n counts, since an interpolating fit lands on either side of n by rounding.
 * A singular local fit (the pseudoinverse warning) does not stop it: repeated x values give these, and the fit
 * carries on with the pseudoinverse, as dloess does.
 *
 * The LINPACK and BLAS routines are the netlib ones; dqrdc and dqrsl are ported only as dloess uses them
 * (no pivoting; Qᵀy only). dnrm2 is the classic scaled-sum version.
 *
 * ---------------------------------------------------------------------------------------------------------
 * The dloess code is distributed under this notice, which must travel with any copy or modification:
 *
 * The authors of this software are Cleveland, Grosse, and Shyu.
 * Copyright (c) 1989, 1992 by AT&T.
 * Permission to use, copy, modify, and distribute this software for any
 * purpose without fee is hereby granted, provided that this entire notice
 * is included in all copies of any software which is or includes a copy
 * or modification of this software and in all copies of the supporting
 * documentation for such software.
 * THIS SOFTWARE IS BEING PROVIDED "AS IS", WITHOUT ANY EXPRESS OR IMPLIED
 * WARRANTY.  IN PARTICULAR, NEITHER THE AUTHORS NOR AT&T MAKE ANY
 * REPRESENTATION OR WARRANTY OF ANY KIND CONCERNING THE MERCHANTABILITY
 * OF THIS SOFTWARE OR ITS FITNESS FOR ANY PARTICULAR PURPOSE.
 * ---------------------------------------------------------------------------------------------------------
 */
import { EvalError } from './values.js';

const fail = (what: string): never => {
  throw new EvalError('runtime', what);
};

/** dloess's own refusals (its ehg182 codes), worded here. */
const REFUSE: Record<number, string> = {
  104: 'loess: the span is too small for this many points, so a neighbourhood has fewer points than the fit has terms. Make the span bigger',
  120: 'loess: a neighbourhood has no width, so make the span bigger',
  121: 'loess: a neighbourhood has no width, so make the span bigger',
  122: 'loess: a point lies outside the region the fit covers',
  180: 'loess: the k-d tree ran out of room',
  181: 'loess: the k-d tree is too deep',
  182: "loess: a local fit's singular value decomposition didn't converge",
  185: 'loess: the k-d tree is corrupted',
  187: 'loess: the k-d tree is too deep',
  193: 'loess: the saved fit is corrupted',
  194: 'loess: trouble inside the fit',
};
const refuse = (code: number): never => fail(REFUSE[code] ?? `loess failed (code ${code})`);

const WARN_TREE = 'loess: the k-d tree outgrew its workspace, so the fit is incomplete. Make the span bigger';
const WARN_TRACE = 'loess: the span is too small for this many points to estimate the fit, or the data have too few distinct values. Make the span bigger';

/** D1MACH(4): the relative spacing of doubles. */
const MACHEP = 2.220446049250313e-16;
/** D1MACH(2): the largest double. */
const MACHIN = Number.MAX_VALUE;

// ---------------------------------------------------------------------------------------------------------
// BLAS and LINPACK. Matrices are column-major with an explicit leading dimension; an offset o is the 0-based
// position of the Fortran element (1,1) of the part passed.
// ---------------------------------------------------------------------------------------------------------

function ddot(n: number, x: Float64Array, xo: number, incx: number, y: Float64Array, yo: number, incy: number): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += x[xo + i * incx]! * y[yo + i * incy]!;
  return t;
}

function daxpy(n: number, da: number, x: Float64Array, xo: number, incx: number, y: Float64Array, yo: number, incy: number): void {
  if (n <= 0 || da === 0) return;
  for (let i = 0; i < n; i++) y[yo + i * incy]! += da * x[xo + i * incx]!;
}

function dscal(n: number, da: number, x: Float64Array, xo: number, incx: number): void {
  for (let i = 0; i < n; i++) x[xo + i * incx]! *= da;
}

function dswap(n: number, x: Float64Array, xo: number, incx: number, y: Float64Array, yo: number, incy: number): void {
  for (let i = 0; i < n; i++) {
    const t = x[xo + i * incx]!;
    x[xo + i * incx] = y[yo + i * incy]!;
    y[yo + i * incy] = t;
  }
}

function drot(n: number, x: Float64Array, xo: number, incx: number, y: Float64Array, yo: number, incy: number, c: number, s: number): void {
  for (let i = 0; i < n; i++) {
    const t = c * x[xo + i * incx]! + s * y[yo + i * incy]!;
    y[yo + i * incy] = c * y[yo + i * incy]! - s * x[xo + i * incx]!;
    x[xo + i * incx] = t;
  }
}

/** The classic BLAS drotg: c, s and r (which replaces a) for the plane rotation that zeroes b. */
function drotg(da: number, db: number): { r: number; c: number; s: number } {
  const roe = Math.abs(da) > Math.abs(db) ? da : db;
  const scale = Math.abs(da) + Math.abs(db);
  if (scale === 0) return { r: 0, c: 1, s: 0 };
  let r = scale * Math.sqrt((da / scale) ** 2 + (db / scale) ** 2);
  r = (roe < 0 ? -1 : 1) * r;
  return { r, c: da / r, s: db / r };
}

/** The classic BLAS dnrm2, with its phases for tiny and huge elements, ported from its assigned-goto form. */
function dnrm2(n: number, dx: Float64Array, xo: number, incx: number): number {
  const cutlo = 8.232e-11;
  const cuthi = 1.304e19;
  if (!(n > 0 && incx > 0)) return 0;
  // The Fortran's labels: 30, 50, 70 and 110 are the phases ("next"); 100, 105, 115, 75, 85 and 200 are jump targets.
  let next = 30;
  let sum = 0;
  let xmax = 0;
  let i = xo;
  let ix = 1;
  type Label = 20 | 30 | 50 | 70 | 75 | 85 | 100 | 105 | 110 | 115 | 200;
  let pc: Label = 30;
  let jj = 0;
  for (;;) {
    switch (pc) {
      case 20:
        pc = next as Label;
        break;
      case 30:
        if (Math.abs(dx[i]!) > cutlo) { pc = 85; break; }
        next = 50;
        xmax = 0;
        pc = 50;
        break;
      case 50:
        if (dx[i] === 0) { pc = 200; break; }
        if (Math.abs(dx[i]!) > cutlo) { pc = 85; break; }
        next = 70;
        pc = 105;
        break;
      case 100:
        ix = jj;
        next = 110;
        sum = (sum / dx[i]!) / dx[i]!;
        pc = 105;
        break;
      case 105:
        xmax = Math.abs(dx[i]!);
        pc = 115;
        break;
      case 70:
        if (Math.abs(dx[i]!) > cutlo) { pc = 75; break; }
        pc = 110;
        break;
      case 110:
        if (Math.abs(dx[i]!) <= xmax) { pc = 115; break; }
        sum = 1 + sum * (xmax / dx[i]!) ** 2;
        xmax = Math.abs(dx[i]!);
        pc = 200;
        break;
      case 115:
        sum += (dx[i]! / xmax) ** 2;
        pc = 200;
        break;
      case 75:
        sum = (sum * xmax) * xmax;
        pc = 85;
        break;
      case 85: {
        const hitest = cuthi / Math.fround(n);
        let jumped = false;
        for (jj = ix; jj <= n; jj++) {
          if (Math.abs(dx[i]!) >= hitest) { jumped = true; break; }
          sum += dx[i]! ** 2;
          i += incx;
        }
        if (jumped) { pc = 100; break; }
        return Math.sqrt(sum);
      }
      case 200:
        ix += 1;
        i += incx;
        if (ix <= n) { pc = 20; break; }
        return xmax * Math.sqrt(sum);
    }
  }
}

/** Fortran SIGN: |a| with the sign of b. */
const dsign = (a: number, b: number): number => (b >= 0 ? Math.abs(a) : -Math.abs(a));

/**
 * LINPACK dqrdc without pivoting (job 0): Householder QR of the n × p matrix x (leading dimension ldx), R in the
 * upper triangle, the reflectors below it and in qraux.
 */
function dqrdc(x: Float64Array, ldx: number, n: number, p: number, qraux: Float64Array): void {
  const at = (i: number, j: number): number => i - 1 + (j - 1) * ldx;
  const lup = Math.min(n, p);
  for (let l = 1; l <= lup; l++) {
    qraux[l - 1] = 0;
    if (l === n) continue;
    let nrmxl = dnrm2(n - l + 1, x, at(l, l), 1);
    if (nrmxl === 0) continue;
    if (x[at(l, l)] !== 0) nrmxl = dsign(nrmxl, x[at(l, l)]!);
    dscal(n - l + 1, 1 / nrmxl, x, at(l, l), 1);
    x[at(l, l)] = 1 + x[at(l, l)]!;
    for (let j = l + 1; j <= p; j++) {
      const t = -ddot(n - l + 1, x, at(l, l), 1, x, at(l, j), 1) / x[at(l, l)]!;
      daxpy(n - l + 1, t, x, at(l, l), 1, x, at(l, j), 1);
    }
    qraux[l - 1] = x[at(l, l)]!;
    x[at(l, l)] = -nrmxl;
  }
}

/** LINPACK dqrsl, only dloess's use of it (job 1000): qty ← Qᵀ·qty, in place, for the first k reflectors. */
function dqrslQty(x: Float64Array, ldx: number, n: number, k: number, qraux: Float64Array, qty: Float64Array): void {
  const ju = Math.min(k, n - 1);
  for (let j = 1; j <= ju; j++) {
    if (qraux[j - 1] === 0) continue;
    const jj = j - 1 + (j - 1) * ldx;
    const temp = x[jj]!;
    x[jj] = qraux[j - 1]!;
    const t = -ddot(n - j + 1, x, jj, 1, qty, j - 1, 1) / x[jj]!;
    daxpy(n - j + 1, t, x, jj, 1, qty, j - 1, 1);
    x[jj] = temp;
  }
}

/**
 * LINPACK dsvdc with job 21 (left vectors u, n by min(n,p), and right vectors v). x and u may be the same array,
 * as dloess calls it. s, e and work are 1-based in the Fortran and are indexed here as s[l - 1]. Returns info.
 */
function dsvdc(x: Float64Array, ldx: number, n: number, p: number, s: Float64Array, e: Float64Array, u: Float64Array, ldu: number, v: Float64Array, ldv: number, work: Float64Array): number {
  const X = (i: number, j: number): number => i - 1 + (j - 1) * ldx;
  const U = (i: number, j: number): number => i - 1 + (j - 1) * ldu;
  const V = (i: number, j: number): number => i - 1 + (j - 1) * ldv;
  const S = (i: number): number => s[i - 1]!;
  const E = (i: number): number => e[i - 1]!;
  const maxit = 30;
  const ncu = Math.min(n, p);
  let info = 0;
  const nct = Math.min(n - 1, p);
  const nrt = Math.max(0, Math.min(p - 2, n));
  const lu = Math.max(nct, nrt);
  for (let l = 1; l <= lu; l++) {
    const lp1 = l + 1;
    if (l <= nct) {
      s[l - 1] = dnrm2(n - l + 1, x, X(l, l), 1);
      if (s[l - 1] !== 0) {
        if (x[X(l, l)] !== 0) s[l - 1] = dsign(s[l - 1]!, x[X(l, l)]!);
        dscal(n - l + 1, 1 / s[l - 1]!, x, X(l, l), 1);
        x[X(l, l)] = 1 + x[X(l, l)]!;
      }
      s[l - 1] = -s[l - 1]!;
    }
    for (let j = lp1; j <= p; j++) {
      if (l <= nct && s[l - 1] !== 0) {
        const t = -ddot(n - l + 1, x, X(l, l), 1, x, X(l, j), 1) / x[X(l, l)]!;
        daxpy(n - l + 1, t, x, X(l, l), 1, x, X(l, j), 1);
      }
      e[j - 1] = x[X(l, j)]!;
    }
    if (l <= nct) for (let i = l; i <= n; i++) u[U(i, l)] = x[X(i, l)]!;
    if (l <= nrt) {
      e[l - 1] = dnrm2(p - l, e, lp1 - 1, 1);
      if (e[l - 1] !== 0) {
        if (e[lp1 - 1] !== 0) e[l - 1] = dsign(e[l - 1]!, e[lp1 - 1]!);
        dscal(p - l, 1 / e[l - 1]!, e, lp1 - 1, 1);
        e[lp1 - 1] = 1 + e[lp1 - 1]!;
      }
      e[l - 1] = -e[l - 1]!;
      if (lp1 <= n && e[l - 1] !== 0) {
        for (let i = lp1; i <= n; i++) work[i - 1] = 0;
        for (let j = lp1; j <= p; j++) daxpy(n - l, e[j - 1]!, x, X(lp1, j), 1, work, lp1 - 1, 1);
        for (let j = lp1; j <= p; j++) daxpy(n - l, -e[j - 1]! / e[lp1 - 1]!, work, lp1 - 1, 1, x, X(lp1, j), 1);
      }
      for (let i = lp1; i <= p; i++) v[V(i, l)] = e[i - 1]!;
    }
  }
  let m = Math.min(p, n + 1);
  const nctp1 = nct + 1;
  const nrtp1 = nrt + 1;
  if (nct < p) s[nctp1 - 1] = x[X(nctp1, nctp1)]!;
  if (n < m) s[m - 1] = 0;
  if (nrtp1 < m) e[nrtp1 - 1] = x[X(nrtp1, m)]!;
  e[m - 1] = 0;
  for (let j = nctp1; j <= ncu; j++) {
    for (let i = 1; i <= n; i++) u[U(i, j)] = 0;
    u[U(j, j)] = 1;
  }
  for (let ll = 1; ll <= nct; ll++) {
    const l = nct - ll + 1;
    if (s[l - 1] !== 0) {
      for (let j = l + 1; j <= ncu; j++) {
        const t = -ddot(n - l + 1, u, U(l, l), 1, u, U(l, j), 1) / u[U(l, l)]!;
        daxpy(n - l + 1, t, u, U(l, l), 1, u, U(l, j), 1);
      }
      dscal(n - l + 1, -1, u, U(l, l), 1);
      u[U(l, l)] = 1 + u[U(l, l)]!;
      for (let i = 1; i <= l - 1; i++) u[U(i, l)] = 0;
    } else {
      for (let i = 1; i <= n; i++) u[U(i, l)] = 0;
      u[U(l, l)] = 1;
    }
  }
  for (let ll = 1; ll <= p; ll++) {
    const l = p - ll + 1;
    const lp1 = l + 1;
    if (l <= nrt && e[l - 1] !== 0) {
      for (let j = lp1; j <= p; j++) {
        const t = -ddot(p - l, v, V(lp1, l), 1, v, V(lp1, j), 1) / v[V(lp1, l)]!;
        daxpy(p - l, t, v, V(lp1, l), 1, v, V(lp1, j), 1);
      }
    }
    for (let i = 1; i <= p; i++) v[V(i, l)] = 0;
    v[V(l, l)] = 1;
  }
  const mm = m;
  let iter = 0;
  for (;;) {
    if (m === 0) break;
    if (iter >= maxit) {
      info = m;
      break;
    }
    let l = 0;
    for (let ll = 1; ll <= m; ll++) {
      l = m - ll;
      if (l === 0) break;
      const test = Math.abs(S(l)) + Math.abs(S(l + 1));
      const ztest = test + Math.abs(E(l));
      if (ztest === test) {
        e[l - 1] = 0;
        break;
      }
    }
    let kase: number;
    if (l === m - 1) {
      kase = 4;
    } else {
      const lp1 = l + 1;
      const mp1 = m + 1;
      let ls = 0;
      for (let lls = lp1; lls <= mp1; lls++) {
        ls = m - lls + lp1;
        if (ls === l) break;
        let test = 0;
        if (ls !== m) test += Math.abs(E(ls));
        if (ls !== l + 1) test += Math.abs(E(ls - 1));
        const ztest = test + Math.abs(S(ls));
        if (ztest === test) {
          s[ls - 1] = 0;
          break;
        }
      }
      if (ls === l) kase = 3;
      else if (ls === m) kase = 1;
      else {
        kase = 2;
        l = ls;
      }
    }
    l += 1;
    if (kase === 1) {
      const mm1 = m - 1;
      let f = E(m - 1);
      e[m - 2] = 0;
      for (let kk = l; kk <= mm1; kk++) {
        const k = mm1 - kk + l;
        const g = drotg(S(k), f);
        s[k - 1] = g.r;
        if (k !== l) {
          f = -g.s * E(k - 1);
          e[k - 2] = g.c * E(k - 1);
        }
        drot(p, v, V(1, k), 1, v, V(1, m), 1, g.c, g.s);
      }
    } else if (kase === 2) {
      let f = E(l - 1);
      e[l - 2] = 0;
      for (let k = l; k <= m; k++) {
        const g = drotg(S(k), f);
        s[k - 1] = g.r;
        f = -g.s * E(k);
        e[k - 1] = g.c * E(k);
        drot(n, u, U(1, k), 1, u, U(1, l - 1), 1, g.c, g.s);
      }
    } else if (kase === 3) {
      const scale = Math.max(Math.abs(S(m)), Math.abs(S(m - 1)), Math.abs(E(m - 1)), Math.abs(S(l)), Math.abs(E(l)));
      const sm = S(m) / scale;
      const smm1 = S(m - 1) / scale;
      const emm1 = E(m - 1) / scale;
      const sl = S(l) / scale;
      const el = E(l) / scale;
      const b = ((smm1 + sm) * (smm1 - sm) + emm1 ** 2) / 2;
      const c = (sm * emm1) ** 2;
      let shift = 0;
      if (!(b === 0 && c === 0)) {
        shift = Math.sqrt(b ** 2 + c);
        if (b < 0) shift = -shift;
        shift = c / (b + shift);
      }
      let f = (sl + sm) * (sl - sm) + shift;
      let g = sl * el;
      const mm1 = m - 1;
      for (let k = l; k <= mm1; k++) {
        let r = drotg(f, g);
        f = r.r;
        if (k !== l) e[k - 2] = f;
        f = r.c * S(k) + r.s * E(k);
        e[k - 1] = r.c * E(k) - r.s * S(k);
        g = r.s * S(k + 1);
        s[k] = r.c * S(k + 1);
        drot(p, v, V(1, k), 1, v, V(1, k + 1), 1, r.c, r.s);
        r = drotg(f, g);
        f = r.r;
        s[k - 1] = f;
        f = r.c * E(k) + r.s * S(k + 1);
        s[k] = -r.s * E(k) + r.c * S(k + 1);
        g = r.s * E(k + 1);
        e[k] = r.c * E(k + 1);
        if (k < n) drot(n, u, U(1, k), 1, u, U(1, k + 1), 1, r.c, r.s);
      }
      e[m - 2] = f;
      iter += 1;
    } else {
      if (S(l) < 0) {
        s[l - 1] = -S(l);
        dscal(p, -1, v, V(1, l), 1);
      }
      while (l !== mm && S(l) < S(l + 1)) {
        const t = S(l);
        s[l - 1] = S(l + 1);
        s[l] = t;
        if (l < p) dswap(p, v, V(1, l), 1, v, V(1, l + 1), 1);
        if (l < n) dswap(n, u, U(1, l), 1, u, U(1, l + 1), 1);
        l += 1;
      }
      iter = 0;
      m -= 1;
    }
  }
  return info;
}

// ---------------------------------------------------------------------------------------------------------
// The k-d tree. Cells are numbered from 1, vertices from 1, as in the Fortran; the arrays are 0-based, so cell
// p is at index p - 1. c(i,p) is the vertex number of corner i of cell p; v(i,k) is coordinate k of vertex i;
// vval(i1,i) is the fitted value (i1 = 0) or slope i1 at vertex i.
// ---------------------------------------------------------------------------------------------------------

interface Tree {
  d: number;
  vc: number;
  nvmax: number;
  ncmax: number;
  nc: number;
  nv: number;
  a: Int32Array;
  xi: Float64Array;
  lo: Int32Array;
  hi: Int32Array;
  c: Int32Array;
  v: Float64Array;
  vval: Float64Array;
  /** Cut and descend as the 2006 netlib source does, rather than as the reference does (see LoessOptions.cutRule). */
  netlib2006: boolean;
}

function newTree(d: number, nvmax: number, ncmax: number): Tree {
  const vc = 2 ** d;
  return {
    d, vc, nvmax, ncmax, nc: 1, nv: vc,
    a: new Int32Array(ncmax + 2), xi: new Float64Array(ncmax + 2), lo: new Int32Array(ncmax + 2), hi: new Int32Array(ncmax + 2),
    c: new Int32Array(vc * (ncmax + 2)), v: new Float64Array(nvmax * d + 1), vval: new Float64Array((d + 1) * nvmax + 1), netlib2006: false,
  };
}

/** ehg125: cut cell p across dimension k at t, making the new corners (reusing a vertex already there). Returns the new vertex count. */
function ehg125(T: Tree, p: number, nv: number, k: number, t: number, r: number, s: number, fb: number, lb: number, ub: number): number {
  const { v, nvmax, d, c } = T;
  const ix = (base: number, i: number, b: number, j: number): number => base + (i - 1) + r * b + 2 * r * (j - 1);
  const V = (i: number, kk: number): number => i - 1 + nvmax * (kk - 1);
  let h = nv;
  for (let i = 1; i <= r; i++) {
    for (let j = 1; j <= s; j++) {
      h += 1;
      for (let i3 = 1; i3 <= d; i3++) v[V(h, i3)] = v[V(c[ix(fb, i, 0, j)]!, i3)]!;
      v[V(h, k)] = t;
      // Is there a vertex here already?
      let match = false;
      let m = 1;
      while (!match && m <= nv) {
        match = v[V(m, 1)] === v[V(h, 1)];
        let mm = 2;
        while (match && mm <= d) {
          match = v[V(m, mm)] === v[V(h, mm)];
          mm += 1;
        }
        m += 1;
      }
      m -= 1;
      if (match) h -= 1;
      else m = h;
      c[ix(lb, i, 0, j)] = c[ix(fb, i, 0, j)]!;
      c[ix(lb, i, 1, j)] = m;
      c[ix(ub, i, 0, j)] = m;
      c[ix(ub, i, 1, j)] = c[ix(fb, i, 1, j)]!;
    }
  }
  if (!(h <= nvmax)) refuse(180);
  void p;
  return h;
}

/** ehg106: Floyd and Rivest's selection: rearrange pi(il..ir) so that the k-th by value P[poff + pi - 1] is in place. */
function ehg106(il: number, ir: number, k: number, P: Float64Array, poff: number, pi: Int32Array): void {
  const val = (j: number): number => P[poff + pi[j - 1]! - 1]!;
  const swap = (a: number, b: number): void => {
    const t = pi[a - 1]!;
    pi[a - 1] = pi[b - 1]!;
    pi[b - 1] = t;
  };
  let l = il;
  let r = ir;
  while (l < r) {
    const t = val(k);
    let i = l;
    let j = r;
    swap(l, k);
    if (t < val(r)) swap(l, r);
    while (i < j) {
      swap(i, j);
      i += 1;
      j -= 1;
      while (val(i) < t) i += 1;
      while (t < val(j)) j -= 1;
    }
    if (val(l) === t) {
      swap(l, j);
    } else {
      j += 1;
      swap(r, j);
    }
    if (j <= k) l = j + 1;
    if (k <= j) r = j - 1;
  }
}

/** ehg126: the padded bounding box of x (n × d) and the other corners of it. */
function ehg126(T: Tree, n: number, x: Float64Array): void {
  const { d, vc, nvmax, v } = T;
  for (let k = 1; k <= d; k++) {
    let alpha = MACHIN;
    let beta = -MACHIN;
    for (let i = 1; i <= n; i++) {
      const t = x[i - 1 + n * (k - 1)]!;
      alpha = Math.min(alpha, t);
      beta = Math.max(beta, t);
    }
    const mu = 0.005 * Math.max(beta - alpha, 1e-10 * Math.max(Math.abs(alpha), Math.abs(beta)) + 1e-30);
    alpha -= mu;
    beta += mu;
    v[0 + nvmax * (k - 1)] = alpha;
    v[vc - 1 + nvmax * (k - 1)] = beta;
  }
  fillCorners(T);
}

/** The vertices between the first and the last corner, from those two (shared by ehg126 and ehg169). */
function fillCorners(T: Tree): void {
  const { d, vc, nvmax, v } = T;
  for (let i = 2; i <= vc - 1; i++) {
    let j = i - 1;
    for (let k = 1; k <= d; k++) {
      v[i - 1 + nvmax * (k - 1)] = v[(j % 2) * (vc - 1) + nvmax * (k - 1)]!;
      j = Math.floor(j / 2);
    }
  }
}

/** ehg129: the range of each of the first d coordinates over the points pi(l..u). */
function ehg129(l: number, u: number, d: number, x: Float64Array, pi: Int32Array, n: number, sigma: Float64Array): void {
  for (let k = 1; k <= d; k++) {
    let alpha = MACHIN;
    let beta = -MACHIN;
    for (let i = l; i <= u; i++) {
      const t = x[pi[i - 1]! - 1 + n * (k - 1)]!;
      alpha = Math.min(alpha, t);
      beta = Math.max(beta, t);
    }
    sigma[k - 1] = beta - alpha;
  }
}

/** ehg124: build the k-d tree over the points, cutting a cell at the median of its widest side until it holds at most fc points. */
function ehg124(T: Tree, n: number, x: Float64Array, pi: Int32Array, fc: number, fd: number, dd: number): void {
  const { d, vc, nvmax, ncmax, c, v, a, xi, lo, hi } = T;
  const V = (i: number, k: number): number => v[i - 1 + nvmax * (k - 1)]!;
  const sigma = new Float64Array(8);
  let p = 1;
  let l = 1;
  let u = n;
  lo[0] = l;
  hi[0] = u;
  while (p <= T.nc) {
    let diam = 0;
    for (let i = 1; i <= dd; i++) {
      const diag = V(c[vc - 1 + vc * (p - 1)]!, i) - V(c[vc * (p - 1)]!, i);
      diam += diag ** 2;
    }
    diam = Math.sqrt(diam);
    let leaf = u - l + 1 <= fc || diam <= fd;
    if (!leaf) leaf = ncmax < T.nc + 2 || nvmax < T.nv + vc / 2;
    let k = 0;
    let m = 0;
    if (!leaf) {
      ehg129(l, u, dd, x, pi, n, sigma);
      k = 1;
      for (let i = 2; i <= dd; i++) if (Math.abs(sigma[i - 1]!) > Math.abs(sigma[k - 1]!)) k = i;
      m = Math.floor((l + u) / 2);
      const xk = (j: number): number => x[pi[j - 1]! - 1 + n * (k - 1)]!;
      ehg106(l, u, m, x, n * (k - 1), pi);
      if (T.netlib2006) {
        // The 2006 netlib source: don't cut between equal values; look for the nearest gap, alternately above and below m.
        let offset = 0;
        for (;;) {
          if (m + offset >= u || m + offset < l) break;
          let lower: number;
          let check: number;
          let upper: number;
          if (offset < 0) {
            lower = l;
            check = m + offset;
            upper = check;
          } else {
            lower = m + offset + 1;
            check = lower;
            upper = u;
          }
          ehg106(lower, upper, check, x, n * (k - 1), pi);
          if (xk(m + offset) === xk(m + offset + 1)) {
            offset = -offset;
            if (offset >= 0) offset += 1;
          } else {
            m += offset;
            break;
          }
        }
      } else {
        // As probed: ties go with the upper cell, so back up to the first of a run of equal values. (The run is looked for
        // in the order ehg106 left the points in, which is only partly sorted.)
        while (1 < m && xk(m - 1) === xk(m)) m -= 1;
      }
      leaf = V(c[vc * (p - 1)]!, k) === xk(m) || V(c[vc - 1 + vc * (p - 1)]!, k) === xk(m);
    }
    if (leaf) {
      a[p - 1] = 0;
    } else {
      a[p - 1] = k;
      xi[p - 1] = x[pi[m - 1]! - 1 + n * (k - 1)]!;
      T.nc += 1;
      lo[p - 1] = T.nc;
      lo[T.nc - 1] = l;
      hi[T.nc - 1] = m;
      T.nc += 1;
      hi[p - 1] = T.nc;
      lo[T.nc - 1] = m + 1;
      hi[T.nc - 1] = u;
      T.nv = ehg125(T, p, T.nv, k, xi[p - 1]!, 2 ** (k - 1), 2 ** (d - k), vc * (p - 1), vc * (lo[p - 1]! - 1), vc * (hi[p - 1]! - 1));
    }
    p += 1;
    l = lo[p - 1]!;
    u = hi[p - 1]!;
  }
}

/** ehg169: rebuild the cells and the interior vertices of a tree from its cut dimensions and values and its two corner vertices. */
function ehg169(T: Tree, nc: number, nv: number): void {
  const { d, vc, c, a, xi, lo, hi } = T;
  fillCorners(T);
  let mc = 1;
  let mv = vc;
  for (let j = 1; j <= vc; j++) c[j - 1] = j;
  for (let p = 1; p <= nc; p++) {
    if (a[p - 1] !== 0) {
      const k = a[p - 1]!;
      mc += 1;
      lo[p - 1] = mc;
      mc += 1;
      hi[p - 1] = mc;
      mv = ehg125(T, p, mv, k, xi[p - 1]!, 2 ** (k - 1), 2 ** (d - k), vc * (p - 1), vc * (lo[p - 1]! - 1), vc * (hi[p - 1]! - 1));
    }
  }
  if (mc !== nc || mv !== nv) refuse(193);
}

/** ehg137: the leaf cells a point touches (more than one when it lies on a cut). */
function ehg137(T: Tree, z: ArrayLike<number>): number[] {
  const { a, xi, lo, hi } = T;
  const leaf: number[] = [];
  const stack: number[] = [];
  let p = 1;
  while (p > 0) {
    if (a[p - 1] === 0) {
      leaf.push(p);
      p = stack.length >= 1 ? stack.pop()! : 0;
    } else if (z[a[p - 1]! - 1] === xi[p - 1]) {
      stack.push(hi[p - 1]!);
      if (stack.length > 20) refuse(187);
      p = lo[p - 1]!;
    } else if (z[a[p - 1]! - 1]! <= xi[p - 1]!) {
      p = lo[p - 1]!;
    } else {
      p = hi[p - 1]!;
    }
  }
  return leaf;
}

/** ehg128: the blended cubic Hermite interpolant at z, from the values and slopes at the vertices (vval, d + 1 per vertex). */
function ehg128(T: Tree, z: ArrayLike<number>, vval: Float64Array): number {
  const { d, vc, nvmax, c, a, xi, lo, hi, v } = T;
  const C = (i: number, j: number): number => c[i - 1 + vc * (j - 1)]!;
  const V = (i: number, k: number): number => v[i - 1 + nvmax * (k - 1)]!;
  const VV = (i1: number, i: number): number => vval[i1 + (d + 1) * (i - 1)]!;
  // A point on a cut goes to the upper cell, as probed (the 2006 netlib source sends it to the lower).
  const below = (zv: number, cut: number): boolean => (T.netlib2006 ? zv <= cut : zv < cut);
  // Find the leaf cell, remembering the path.
  const t: number[] = [0, 1];
  let nt = 1;
  let j = 1;
  while (a[j - 1] !== 0) {
    nt += 1;
    t[nt] = below(z[a[j - 1]! - 1]!, xi[j - 1]!) ? lo[j - 1]! : hi[j - 1]!;
    if (!(nt < 20)) refuse(181);
    j = t[nt]!;
  }
  // The tensor product over the cell's corners.
  const g = new Float64Array(9 * 256);
  const G = (i1: number, i2: number): number => i1 + 9 * (i2 - 1);
  for (let i12 = 1; i12 <= vc; i12++) for (let i11 = 0; i11 <= d; i11++) g[G(i11, i12)] = VV(i11, C(i12, j));
  let lg = vc;
  const ll = C(1, j);
  const ur = C(vc, j);
  for (let i = d; i >= 1; i--) {
    const h = (z[i - 1]! - V(ll, i)) / (V(ur, i) - V(ll, i));
    if (!(-0.001 <= h && h <= 1.001)) refuse(122);
    lg = Math.floor(lg / 2);
    for (let ig = 1; ig <= lg; ig++) {
      const phi0 = (1 - h) * (1 - h) * (1 + 2 * h);
      const phi1 = h * h * (3 - 2 * h);
      const psi0 = h * ((1 - h) * (1 - h));
      const psi1 = h * h * (h - 1);
      g[G(0, ig)] = phi0 * g[G(0, ig)]! + phi1 * g[G(0, ig + lg)]! + (psi0 * g[G(i, ig)]! + psi1 * g[G(i, ig + lg)]!) * (V(ur, i) - V(ll, i));
      for (let ii = 1; ii <= i - 1; ii++) g[G(ii, ig)] = phi0 * g[G(ii, ig)]! + phi1 * g[G(ii, ig + lg)]!;
    }
  }
  let s = g[G(0, 1)]!;
  if (d === 2) {
    const hermite = (h: number): [number, number, number, number] => [(1 - h) * (1 - h) * (1 + 2 * h), h * h * (3 - 2 * h), h * ((1 - h) * (1 - h)), h * h * (h - 1)];
    /**
     * One edge of the cell, blended in: the Hermite cubic along it, between its two corner vertices, or between the
     * nearer vertices of a finer neighbouring cell across the edge. Returns the value on the edge and the slope across.
     * `along` is the coordinate the edge runs along (1 or 2), `cut` the dimension a neighbour's split has to be in,
     * `side` which child of the neighbour touches this edge.
     */
    const edge = (along: number, ca: number, cb: number, xibar: number, cut: number, side: 'hi' | 'lo', na: number, nb: number): [number, number] => {
      let v0 = V(ll, along);
      let v1 = V(ur, along);
      let g0 = Array.from({ length: d + 1 }, (_, i1) => VV(i1, C(ca, j)));
      let g1 = Array.from({ length: d + 1 }, (_, i1) => VV(i1, C(cb, j)));
      let m = nt - 1;
      while (!(m === 0 || (a[t[m]! - 1] === cut && xi[t[m]! - 1] === xibar))) m -= 1;
      if (m >= 1) {
        m = side === 'hi' ? hi[t[m]! - 1]! : lo[t[m]! - 1]!;
        while (a[m - 1] !== 0) m = below(z[a[m - 1]! - 1]!, xi[m - 1]!) ? lo[m - 1]! : hi[m - 1]!;
        if (v0 < V(C(na, m), along)) {
          v0 = V(C(na, m), along);
          g0 = Array.from({ length: d + 1 }, (_, i1) => VV(i1, C(na, m)));
        }
        if (V(C(nb, m), along) < v1) {
          v1 = V(C(nb, m), along);
          g1 = Array.from({ length: d + 1 }, (_, i1) => VV(i1, C(nb, m)));
        }
      }
      const h = (z[along - 1]! - v0) / (v1 - v0);
      const [phi0, phi1, psi0, psi1] = hermite(h);
      const other = 3 - along;
      return [phi0 * g0[0]! + phi1 * g1[0]! + (psi0 * g0[along]! + psi1 * g1[along]!) * (v1 - v0), phi0 * g0[other]! + phi1 * g1[other]!];
    };
    const [gn, gpn] = edge(1, 3, 4, V(ur, 2), 2, 'hi', 1, 2);
    const [gs, gps] = edge(1, 1, 2, V(ll, 2), 2, 'lo', 3, 4);
    const [ge, gpe] = edge(2, 2, 4, V(ur, 1), 1, 'hi', 1, 3);
    const [gw, gpw] = edge(2, 1, 3, V(ll, 1), 1, 'lo', 2, 4);
    let h = (z[1]! - V(ll, 2)) / (V(ur, 2) - V(ll, 2));
    let [phi0, phi1, psi0, psi1] = hermite(h);
    const sns = phi0 * gs + phi1 * gn + (psi0 * gps + psi1 * gpn) * (V(ur, 2) - V(ll, 2));
    h = (z[0]! - V(ll, 1)) / (V(ur, 1) - V(ll, 1));
    [phi0, phi1, psi0, psi1] = hermite(h);
    const sew = phi0 * gw + phi1 * ge + (psi0 * gpw + psi1 * gpe) * (V(ur, 1) - V(ll, 1));
    s = sns + sew - s;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------
// The statistics: the interpolation formulas dloess uses for delta 1 and delta 2 (ehg141, ehg176, lowesa, ehg196).
// ---------------------------------------------------------------------------------------------------------

/** The small fixed tree ehg176 evaluates, for the correction factor in ehg141. */
const EHG176 = (() => {
  const T = newTree(1, 10, 17);
  T.nc = 17;
  T.nv = 10;
  const a = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0];
  const hi = [3, 5, 7, 9, 11, 13, 15, 0, 0, 0, 0, 0, 0, 0, 17, 0, 0];
  const lo = [2, 4, 6, 8, 10, 12, 14, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0];
  const xi = [0.3705, 0.2017, 0.5591, 0.1204, 0.2815, 0.4536, 0.7132, 0, 0, 0, 0, 0, 0, 0, 0.8751, 0, 0];
  const c = [[1, 2], [1, 3], [3, 2], [1, 4], [4, 3], [3, 5], [5, 2], [1, 6], [6, 4], [4, 7], [7, 3], [3, 8], [8, 5], [5, 9], [9, 2], [9, 10], [10, 2]];
  for (let p = 0; p < 17; p++) {
    T.a[p] = a[p]!;
    T.hi[p] = hi[p]!;
    T.lo[p] = lo[p]!;
    T.xi[p] = xi[p]!;
    T.c[2 * p] = c[p]![0]!;
    T.c[2 * p + 1] = c[p]![1]!;
  }
  T.v.set([-5e-3, 1.005, 0.3705, 0.2017, 0.5591, 0.1204, 0.2815, 0.4536, 0.7132, 0.8751]);
  const vval = [[-9.0572e-2, 4.4844], [-1.0856e-2, -0.7736], [-5.3718e-2, -0.3495], [2.6152e-2, -0.7286], [-5.8387e-2, 0.1611], [9.5807e-2, -0.7978], [-3.1926e-2, -0.4457], [-6.417e-2, 3.2813e-2], [-2.0636e-2, 0.335], [4.0172e-2, -4.1032e-2]];
  vval.forEach(([f, s], i) => {
    T.vval[2 * i] = f!;
    T.vval[2 * i + 1] = s!;
  });
  return T;
})();

const EHG141_C = [
  0.297162, 0.380266, 0.5886043, 0.4263766, 0.3346498, 0.6271053, 0.5241198, 0.3484836, 0.6687687, 0.6338795, 0.4076457, 0.7207693,
  0.1611761, 0.3091323, 0.4401023, 0.2939609, 0.3580278, 0.5555741, 0.397239, 0.4171278, 0.6293196, 0.4675173, 0.469907, 0.6674802,
  0.2848308, 0.2254512, 0.2914126, 0.5393624, 0.251723, 0.389897, 0.7603231, 0.2969113, 0.474013, 0.9664956, 0.3629838, 0.5348889,
  0.207567, 0.2822574, 0.2369957, 0.3911566, 0.2981154, 0.3623232, 0.5508869, 0.3501989, 0.4371032, 0.7002667, 0.4291632, 0.493037,
];

/** ehg141: delta 1 and delta 2 for local degree deg, from the trace of the hat matrix (k terms in the local fit). */
function ehg141(trl: number, n: number, deg: number, k: number, d: number, nsing: number, warn: (m: string) => void): { dk: number; delta1: number; delta2: number } {
  let dk = 0;
  if (deg === 0) dk = 1;
  if (deg === 1) dk = d + 1;
  if (deg === 2) dk = ((d + 2) * (d + 1)) / 2;
  const corx = Math.sqrt(k / n);
  let z = (Math.sqrt(k / trl) - corx) / (1 - corx);
  if (nsing === 0 && 1 < z) warn(WARN_TRACE);
  // dloess warns when z < 0 (the trace above n). A trace of n exactly (the fit interpolates) comes out either side of n by
  // rounding, so a hair above zero counts too: the reference, as probed, fails there.
  // A negative trace makes z NaN; that fails too (it is where the four-variable fits on heavily tied data fail).
  if (!(z >= 1e-10)) warn(WARN_TRACE);
  z = Math.min(1, Math.max(0, z));
  const c4 = Math.exp(ehg128(EHG176, [z], EHG176.vval));
  const coef = (i: number): [number, number, number] => {
    const c = EHG141_C;
    if (d <= 4) return [c[i - 1]!, c[i]!, c[i + 1]!];
    return [
      c[i - 1]! + (d - 4) * (c[i - 1]! - c[i - 4]!),
      c[i]! + (d - 4) * (c[i]! - c[i - 3]!),
      c[i + 1]! + (d - 4) * (c[i + 1]! - c[i - 2]!),
    ];
  };
  let i = 1 + 3 * (Math.min(d, 4) - 1 + 4 * (deg - 1));
  let [c1, c2, c3] = coef(i);
  const delta1 = n - trl * Math.exp(c1 * z ** c2 * (1 - z) ** c3 * c4);
  i += 24;
  [c1, c2, c3] = coef(i);
  const delta2 = n - trl * Math.exp(c1 * z ** c2 * (1 - z) ** c3 * c4);
  return { dk, delta1, delta2 };
}

/** lowesa: delta 1 and delta 2 by interpolating between the degree 1 and degree 2 formulas. */
function lowesa(trl: number, n: number, d: number, tau: number, nsing: number, warn: (m: string) => void): { delta1: number; delta2: number } {
  const A = ehg141(trl, n, 1, tau, d, nsing, warn);
  const B = ehg141(trl, n, 2, tau, d, nsing, warn);
  const alpha = (tau - A.dk) / (B.dk - A.dk);
  return { delta1: (1 - alpha) * A.delta1 + alpha * B.delta1, delta2: (1 - alpha) * A.delta2 + alpha * B.delta2 };
}

/** ehg196/ehg197: dloess's approximation to the trace of the hat matrix, used from 500 points up. */
function ehg196(tau: number, d: number, f: number, doubleG1: boolean): number {
  const part = (deg: number): { dk: number; trl: number } => {
    let dk = 0;
    if (deg === 1) dk = d + 1;
    if (deg === 2) dk = ((d + 2) * (d + 1)) / 2;
    // g1 is an implicitly typed REAL in the Fortran: single precision (as probed: the reference's statistics at 600 points need it).
    const g1 = doubleG1 ? (-0.08125 * d + 0.13) * d + 1.05 : Math.fround((-0.08125 * d + 0.13) * d + 1.05);
    return { dk, trl: dk * (1 + Math.max(0, (g1 - f) / f)) };
  };
  const A = part(1);
  const B = part(2);
  const alpha = (tau - A.dk) / (B.dk - A.dk);
  return (1 - alpha) * A.trl + alpha * B.trl;
}

// ---------------------------------------------------------------------------------------------------------
// The fit: ehg127 (one local regression), ehg139 and ehg131 (all the vertices, and the diagonal of the hat
// matrix), and the driver (loess_, loess_raw).
// ---------------------------------------------------------------------------------------------------------

export interface LoessOptions {
  /** Refuse, as the reference does, when dloess would only warn (a singular local fit, an implausible trace). Default true. */
  strict?: boolean;
  /** Collects what dloess warned about. */
  warnings?: string[];
  /**
   * Where a cut falls among equal x values, and which cell a point exactly on a cut belongs to. The default is what the
   * reference does, as probed: ties go with the upper cell. 'netlib-2006' is the rule in the netlib source as it is now
   * (and in scikit-misc), which the tests use to check the rest of the port against scikit-misc with ties.
   */
  cutRule?: 'probed' | 'netlib-2006';
  /** Compute the approximate trace (used from 500 points) with g1 in double precision, as scikit-misc does; the reference's is single. */
  doubleG1?: boolean;
}

interface FitState {
  n: number;
  d: number;
  x: Float64Array;
  y: Float64Array;
  rw: Float64Array;
  nf: number;
  f: number;
  k: number;
  sing: number;
}

/**
 * ehg127: the local quadratic fit at q, by weighted least squares through a QR and a singular value
 * decomposition. Leaves the neighbours in psi, and the pieces a vertex influence needs in the workspace; returns
 * the fitted value and its d slopes in s.
 */
class Local {
  readonly psi: Int32Array;
  readonly dist: Float64Array;
  readonly eta: Float64Array;
  readonly b: Float64Array;
  readonly w: Float64Array;
  readonly sigma = new Float64Array(15);
  readonly u = new Float64Array(15 * 15);
  readonly e = new Float64Array(15 * 15);
  readonly g = new Float64Array(15);
  readonly dgamma = new Float64Array(15);
  readonly qraux = new Float64Array(15);
  readonly work = new Float64Array(16);
  readonly colnor = new Float64Array(15);
  tol = 0;
  rcond = 1;
  constructor(readonly S: FitState, private readonly warn: (m: string) => void, readonly note?: (m: string) => void) {
    this.psi = new Int32Array(S.n);
    for (let i = 0; i < S.n; i++) this.psi[i] = i + 1;
    this.dist = new Float64Array(S.n);
    this.eta = new Float64Array(S.nf);
    this.b = new Float64Array(S.nf * S.k);
    this.w = new Float64Array(S.nf);
  }

  /** The fit at q; s receives the value and d slopes (s[0..d]). */
  fit(q: ArrayLike<number>, s: Float64Array, so: number): void {
    const { n, d, nf, f, x, y, rw } = this.S;
    const k = this.S.k;
    const { psi, dist, eta, b, w, sigma, u, e, g, dgamma, qraux, work, colnor } = this;
    // Sort by distance.
    for (let i3 = 0; i3 < n; i3++) dist[i3] = 0;
    for (let j = 1; j <= d; j++) {
      const i4 = q[j - 1]!;
      for (let i3 = 0; i3 < n; i3++) dist[i3]! += (x[i3 + n * (j - 1)]! - i4) ** 2;
    }
    ehg106(1, n, nf, dist, 0, psi);
    const rho = dist[psi[nf - 1]! - 1]! * Math.max(1, f);
    if (!(0 < rho)) refuse(120);
    // Neighbourhood weights (the tricube kernel, with the square root of the robustness weight folded in).
    for (let i = 1; i <= nf; i++) w[i - 1] = Math.sqrt(dist[psi[i - 1]! - 1]! / rho);
    for (let i = 1; i <= nf; i++) {
      const t = 1 - w[i - 1]! * w[i - 1]! * w[i - 1]!;
      w[i - 1] = Math.sqrt(rw[psi[i - 1]! - 1]! * (t * t * t));
    }
    let wmax = 0;
    for (let i = 0; i < nf; i++) wmax = Math.max(wmax, Math.abs(w[i]!));
    if (wmax === 0) refuse(121);
    // The design matrix: 1, the x - q, then the squares and cross products.
    let column = 1;
    const B = (i: number, j: number): number => i - 1 + nf * (j - 1);
    for (let i3 = 1; i3 <= nf; i3++) b[B(i3, column)] = w[i3 - 1]!;
    for (let j = 1; j <= d; j++) {
      column += 1;
      const i5 = q[j - 1]!;
      for (let i3 = 1; i3 <= nf; i3++) b[B(i3, column)] = w[i3 - 1]! * (x[psi[i3 - 1]! - 1 + n * (j - 1)]! - i5);
    }
    for (let j = 1; j <= d; j++) {
      column += 1;
      const i6 = q[j - 1]!;
      for (let i3 = 1; i3 <= nf; i3++) b[B(i3, column)] = w[i3 - 1]! * (x[psi[i3 - 1]! - 1 + n * (j - 1)]! - i6) ** 2;
      for (let jj = j + 1; jj <= d; jj++) {
        column += 1;
        const i7 = q[j - 1]!;
        const i8 = q[jj - 1]!;
        for (let i3 = 1; i3 <= nf; i3++) b[B(i3, column)] = w[i3 - 1]! * (x[psi[i3 - 1]! - 1 + n * (j - 1)]! - i7) * (x[psi[i3 - 1]! - 1 + n * (jj - 1)]! - i8);
      }
    }
    for (let i3 = 1; i3 <= nf; i3++) eta[i3 - 1] = w[i3 - 1]! * y[psi[i3 - 1]! - 1]!;
    // Equilibrate the columns.
    for (let j = 1; j <= k; j++) {
      let scal = 0;
      for (let i = 1; i <= nf; i++) scal += b[B(i, j)]! ** 2;
      scal = Math.sqrt(scal);
      if (0 < scal) {
        for (let i3 = 1; i3 <= nf; i3++) b[B(i3, j)] = b[B(i3, j)]! / scal;
        colnor[j - 1] = scal;
      } else {
        colnor[j - 1] = 1;
      }
    }
    // QR, then the SVD of R.
    dqrdc(b, nf, nf, k, qraux);
    dqrslQty(b, nf, nf, k, qraux, eta);
    u.fill(0);
    for (let i = 1; i <= k; i++) for (let j = i; j <= k; j++) u[i - 1 + 15 * (j - 1)] = b[B(i, j)]!;
    const info = dsvdc(u, 15, k, k, sigma, g, u, 15, e, 15, work);
    if (info !== 0) refuse(182);
    this.tol = sigma[0]! * (100 * MACHEP);
    this.rcond = Math.min(this.rcond, sigma[k - 1]! / sigma[0]!);
    if (sigma[k - 1]! <= this.tol) {
      // dloess only warns here and carries on with the pseudoinverse, and so does the reference (as probed).
      this.S.sing += 1;
      this.note?.('singular');
    }
    // Compensate for the equilibration, then solve.
    for (let j = 1; j <= k; j++) {
      const i10 = colnor[j - 1]!;
      for (let i3 = 1; i3 <= k; i3++) e[j - 1 + 15 * (i3 - 1)] = e[j - 1 + 15 * (i3 - 1)]! / i10;
    }
    for (let j = 1; j <= k; j++) {
      dgamma[j - 1] = this.tol < sigma[j - 1]! ? ddot(k, u, 15 * (j - 1), 1, eta, 0, 1) / sigma[j - 1]! : 0;
    }
    for (let j = 0; j <= d; j++) s[so + j] = j < k ? ddot(k, e, j, 15, dgamma, 0, 1) : 0;
  }
}

interface Built {
  T: Tree;
  fitted: Float64Array;
  diagl: Float64Array;
  sing: number;
}

/** ehg131 and ehg139: build the tree, fit at every vertex, and (when asked) the diagonal of the hat matrix. */
function buildFit(S: FitState, fc: number, wantDiag: boolean, warn: (m: string) => void, netlib2006: boolean, note?: (m: string) => void): Built {
  const { n, d, nf, k } = S;
  const nvmax = Math.max(200, n);
  const T = newTree(d, nvmax, nvmax);
  T.netlib2006 = netlib2006;
  const { vc } = T;
  ehg126(T, n, S.x);
  T.nv = vc;
  T.nc = 1;
  for (let j = 1; j <= vc; j++) T.c[j - 1] = j;
  const pi = new Int32Array(n);
  for (let i = 0; i < n; i++) pi[i] = i + 1;
  // fd is 0 in dloess's workspace (the cut-off diameter is never used).
  ehg124(T, n, S.x, pi, fc, 0, d);
  const local = new Local(S, warn, note);
  const diagl = new Float64Array(n);
  const vval2 = new Float64Array((d + 1) * T.nv);
  const phi = new Int32Array(n);
  const q = new Float64Array(8);
  const z = new Float64Array(8);
  const { psi, eta, b, w, sigma, u, e, dgamma, qraux } = local;
  for (let l = 1; l <= T.nv; l++) {
    for (let i5 = 1; i5 <= d; i5++) q[i5 - 1] = T.v[l - 1 + nvmax * (i5 - 1)]!;
    local.fit(q, T.vval, (d + 1) * (l - 1));
    if (!wantDiag) continue;
    // Invert psi: where each neighbour sits in it.
    phi.fill(0);
    for (let i = 1; i <= nf; i++) phi[psi[i - 1]! - 1] = i;
    for (let i5 = 1; i5 <= d; i5++) z[i5 - 1] = T.v[l - 1 + nvmax * (i5 - 1)]!;
    for (const leaf of ehg137(T, z)) {
      for (let ii = T.lo[leaf - 1]!; ii <= T.hi[leaf - 1]!; ii++) {
        const i = phi[pi[ii - 1]! - 1]!;
        if (i === 0) continue;
        if (psi[i - 1] !== pi[ii - 1]) refuse(194);
        eta.fill(0);
        eta[i - 1] = w[i - 1]!;
        dqrslQty(b, nf, nf, k, qraux, eta);
        for (let j = 1; j <= k; j++) {
          dgamma[j - 1] = local.tol < sigma[j - 1]! ? ddot(k, u, 15 * (j - 1), 1, eta, 0, 1) / sigma[j - 1]! : 0;
        }
        for (let j = 1; j <= d + 1; j++) vval2[j - 1 + (d + 1) * (l - 1)] = j <= k ? ddot(k, e, j - 1, 15, dgamma, 0, 1) : 0;
        for (let i5 = 1; i5 <= d; i5++) z[i5 - 1] = S.x[pi[ii - 1]! - 1 + n * (i5 - 1)]!;
        diagl[pi[ii - 1]! - 1]! += ehg128(T, z, vval2);
        for (let i5 = 0; i5 <= d; i5++) vval2[i5 + (d + 1) * (l - 1)] = 0;
      }
    }
  }
  // lowese: evaluate the surface at the data.
  const fitted = new Float64Array(n);
  const row = new Float64Array(8);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < d; c++) row[c] = S.x[i + n * c]!;
    fitted[i] = ehg128(T, row, T.vval);
  }
  return { T, fitted, diagl, sing: S.sing };
}

/** loess_workspace's sizes, which end up in the saved vector as parameter(6) and parameter(7). */
function workspaceSizes(d: number, n: number): { liv: number; lv: number } {
  const nvmax = Math.max(200, n);
  const vc = 2 ** d;
  const iv8 = 50 + nvmax;
  const iv9 = iv8 + vc * nvmax;
  const iv10 = iv9 + nvmax;
  const iv22 = iv10 + nvmax;
  const iv13 = 50 + nvmax * d;
  const iv12 = iv13 + (d + 1) * nvmax;
  const iv15 = iv12 + nvmax;
  return { liv: iv22 - 1, lv: iv15 - 1 };
}

/**
 * The loess vector for the columns of x (one array per variable, 1 to 4 of them), the responses y, and the span.
 * Throws EvalError for the cases dloess refuses (and the reference fails on).
 */
export function loessVector(columns: Float64Array[], y: Float64Array, span: number, options: LoessOptions = {}): Float64Array {
  const d = columns.length;
  const n = y.length;
  const strict = options.strict ?? true;
  const warn = (m: string): void => {
    options.warnings?.push(m);
    if (strict) fail(m);
  };
  // Normalize several variables by their trimmed standard deviations (loess_).
  const divisor = new Float64Array(d).fill(1);
  const xs = new Float64Array(n * d);
  for (let c = 0; c < d; c++) xs.set(columns[c]!, c * n);
  if (d > 1) {
    const cut = Math.ceil(0.1 * n);
    for (let i = 0; i < d; i++) {
      const temp = Float64Array.from(columns[i]!).sort();
      let sum = 0;
      for (let j = cut; j <= n - cut - 1; j++) sum += temp[j]!;
      const mean = sum / (n - 2 * cut);
      sum = 0;
      for (let j = cut; j <= n - cut - 1; j++) {
        temp[j] = temp[j]! - mean;
        sum += temp[j]! * temp[j]!;
      }
      divisor[i] = Math.sqrt(sum / (n - 2 * cut - 1));
      if (!(divisor[i]! > 0)) fail('loess: a column of x values has no spread');
      for (let j = 0; j < n; j++) xs[i * n + j] = columns[i]![j]! / divisor[i]!;
    }
  }
  // lowesd: neighbourhood size and the number of terms.
  const nf = Math.min(n, Math.floor(n * span));
  const k = ((d + 2) * (d + 1)) / 2;
  if (!(k <= nf - 1)) refuse(104);
  const newCell = span * 0.2;
  const fc = Math.floor(n * newCell);
  const S: FitState = { n, d, x: xs, y, rw: new Float64Array(n).fill(1), nf, f: span, k, sing: 0 };
  const exactTrace = n < 500;
  const built = buildFit(S, fc, exactTrace, warn, options.cutRule === 'netlib-2006', (m) => options.warnings?.push(m));
  let trL = 0;
  if (exactTrace) for (let i = 0; i < n; i++) trL += built.diagl[i]!;
  else trL = ehg196(k, d, span, options.doubleG1 ?? false);
  const { delta1, delta2 } = lowesa(trL, n, d, k, built.sing, warn);
  const T = built.T;
  // dloess warns when the tree outgrew its workspace.
  if (T.nvmax < T.nv + T.vc / 2 || T.ncmax < T.nc + 2) warn(WARN_TREE);
  const residuals = Float64Array.from(y, (v, i) => v - built.fitted[i]!);
  let sumSquares = 0;
  for (let i = 0; i < n; i++) sumSquares += residuals[i]! * residuals[i]!;
  const s = Math.sqrt(sumSquares / delta1);
  const { liv, lv } = workspaceSizes(d, n);
  const { nc, nv, vc } = T;
  // The tag is 1 in every vector probed, of one to four variables.
  const out: number[] = [1, 0];
  const push = (a: ArrayLike<number>, count = a.length): void => {
    for (let i = 0; i < count; i++) out.push(a[i]!);
  };
  push(built.fitted);
  push(residuals);
  push([d, n, vc, nc, nv, liv, lv]);
  push(T.a, nc);
  push(T.xi, nc);
  for (let i = 0; i < d; i++) out.push(T.v[T.nvmax * i]!);
  for (let i = 0; i < d; i++) out.push(T.v[vc - 1 + T.nvmax * i]!);
  push(T.vval, (d + 1) * nv);
  for (let i = 0; i < n; i++) out.push(1);
  push(divisor);
  out.push(s, delta1, delta2, span);
  out[1] = out.length;
  return Float64Array.from(out);
}

/** A loess vector taken apart. */
export interface LoessLayout {
  d: number;
  n: number;
  vc: number;
  nc: number;
  nv: number;
  a: Int32Array;
  xi: Float64Array;
  lower: number[];
  upper: number[];
  vval: Float64Array;
  divisor: number[];
}

/** Whether v is a loess vector (as loessVector lays it out), and if so its parts; null when it is anything else. */
export function readLoess(v: ArrayLike<number>): LoessLayout | null {
  const L = v.length;
  if (L < 40 || (v[0] !== 1 && v[0] !== 2) || v[1] !== L) return null;
  for (let n = 4; 2 + 2 * n + 7 <= L; n++) {
    const o = 2 + 2 * n;
    const [d, nn, vc, nc, nv] = [v[o]!, v[o + 1]!, v[o + 2]!, v[o + 3]!, v[o + 4]!];
    if (nn !== n || !Number.isInteger(d) || d < 1 || d > 4 || vc !== 2 ** d || !(nc >= 1) || !(nv >= vc)) continue;
    if (L !== 2 + 2 * n + 7 + 2 * nc + 2 * d + (d + 1) * nv + n + d + 4) continue;
    let p = o + 7;
    const a = Int32Array.from({ length: nc }, (_, i) => v[p + i]!);
    p += nc;
    const xi = Float64Array.from({ length: nc }, (_, i) => v[p + i]!);
    p += nc;
    const lower = Array.from({ length: d }, (_, i) => v[p + i]!);
    const upper = Array.from({ length: d }, (_, i) => v[p + d + i]!);
    p += 2 * d;
    const vval = Float64Array.from({ length: (d + 1) * nv }, (_, i) => v[p + i]!);
    p += (d + 1) * nv + n;
    const divisor = Array.from({ length: d }, (_, i) => v[p + i]!);
    return { d, n, vc, nc, nv, a, xi, lower, upper, vval, divisor };
  }
  return null;
}

/** loess_grow and lowese: rebuild the tree from a loess vector and evaluate the fit at the point z (one value per variable). */
export function loessAt(layout: LoessLayout, z: ArrayLike<number>, netlib2006 = false): number {
  const { d, vc, nc, nv } = layout;
  const T = newTree(d, nv, Math.max(nc, nv));
  T.netlib2006 = netlib2006;
  T.nc = nc;
  T.nv = nv;
  for (let k = 0; k < d; k++) {
    T.v[nv * k] = layout.lower[k]!;
    T.v[vc - 1 + nv * k] = layout.upper[k]!;
  }
  T.a.set(layout.a);
  T.xi.set(layout.xi);
  ehg169(T, nc, nv);
  const point = Float64Array.from({ length: d }, (_, i) => z[i]! / layout.divisor[i]!);
  return ehg128(T, point, layout.vval);
}

/**
 * interp of a loess vector: the fit at the point z (one value per variable). The point must lie within the range of the
 * x values interp is given (their data range, not the padded box the tree covers), as probed.
 */
export function loessInterp(vec: ArrayLike<number>, columns: Float64Array[], z: ArrayLike<number>, cutRule: 'probed' | 'netlib-2006' = 'probed'): number | null {
  const layout = readLoess(vec);
  if (!layout) return null;
  if (columns.length !== layout.d) fail(`interp: this loess fit has ${layout.d} ${layout.d === 1 ? 'variable' : 'variables'}, so the x values need ${layout.d} ${layout.d === 1 ? 'column' : 'columns'}`);
  if (z.length !== layout.d) fail(`interp: this loess fit needs a point with ${layout.d} ${layout.d === 1 ? 'coordinate' : 'coordinates'}`);
  for (let c = 0; c < layout.d; c++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of columns[c]!) {
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    if (!(z[c]! >= lo && z[c]! <= hi)) fail("interp: loess can't extrapolate: the point lies outside the range of the x values");
  }
  return loessAt(layout, z, cutRule === 'netlib-2006');
}
