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
 * The singular value decomposition as Mathcad 14's svd2 computes it, which is LAPACK 3.0's dgesvd (real) and
 * zgesvd (complex) with JOBU = 'S' and JOBVT = 'A', for m ≥ n. Ported from the 3.0 sources routine by routine:
 * dgeqr2, dgebd2, dorg2r, dorgl2, dorgbr, dbdsqr, dlasv2, dlas2, dlartg, dlasr and their complex counterparts
 * zgeqr2, zgebd2, zung2r, zungl2, zungbr, zlarfg, zbdsqr. The arithmetic follows the reference BLAS operation by
 * operation (dgemv/dger inside dlarf, the plain sum of squares for the norms, LAPACK 3.0's dlartg), because the
 * signs of singular vectors, and the phases of complex ones, hang on the last bit of such steps. Later LAPACKs
 * changed dlartg and dlarfg, and so some signs.
 *
 * The driver's path depends on m against MNTHR = int(1.6·n). From MNTHR up it takes QR first and bidiagonalizes
 * R (dgesvd path 6/9 with workspace to spare: the form of Q·Q_b is built by a matrix product); below it, it
 * bidiagonalizes A directly (path 10). Blocked code in LAPACK only starts above 128 columns, so only the
 * unblocked routines are ported. Reflectors whose norm would underflow are not rescaled (dlarfg's safmin loop).
 */

/** A complex matrix by rows, as separate real and imaginary parts. Real input keeps its imaginary part zero. */
interface CM {
  re: number[][];
  im: number[][];
}

const EPS = 2 ** -53; // dlamch('E')
const SAFMIN = 2.2250738585072014e-308; // dlamch('S')

const zeros = (m: number, n: number): number[][] =>
  Array.from({ length: m }, () => new Array<number>(n).fill(0));
const newCM = (m: number, n: number): CM => ({
  re: zeros(m, n),
  im: zeros(m, n),
});

/** Fortran's SIGN(a, b), as gfortran gives it: −0 counts as negative. */
const sign = (a: number, b: number): number =>
  b < 0 || Object.is(b, -0) ? -Math.abs(a) : Math.abs(a);

function dlapy2(x: number, y: number): number {
  const w = Math.max(Math.abs(x), Math.abs(y));
  const z = Math.min(Math.abs(x), Math.abs(y));
  return z === 0 || w > Number.MAX_VALUE ? w : w * Math.sqrt(1 + (z / w) ** 2);
}

function dlapy3(x: number, y: number, z: number): number {
  const xa = Math.abs(x);
  const ya = Math.abs(y);
  const za = Math.abs(z);
  const w = Math.max(xa, ya, za);
  return w === 0
    ? 0
    : w * Math.sqrt((xa / w) ** 2 + (ya / w) ** 2 + (za / w) ** 2);
}

/** dnrm2 / dznrm2 as Mathcad's library sums them: the square root of the plain sum of squares. */
function nrm2(xr: number[], xi: number[], complex: boolean): number {
  let sum = 0;
  for (let k = 0; k < xr.length; k++) {
    sum += xr[k]! * xr[k]!;
    if (complex) sum += xi[k]! * xi[k]!;
  }
  return Math.sqrt(sum);
}

/** dladiv: (a + ib) / (c + id). */
function dladiv(a: number, b: number, c: number, d: number): [number, number] {
  if (Math.abs(d) < Math.abs(c)) {
    const e = d / c;
    const f = c + d * e;
    return [(a + b * e) / f, (b - a * e) / f];
  }
  const e = c / d;
  const f = d + c * e;
  return [(b + a * e) / f, (-a + b * e) / f];
}

interface Tau {
  re: number;
  im: number;
}

/**
 * dlarfg / zlarfg: the reflector H = I − τ·v·vᴴ, v = (1, x), with Hᴴ·(α, x) = (β, 0) and β real. Overwrites x
 * with v's tail and returns β (the new α) and τ. The real routine returns at once for a vector of length 1; the
 * complex one does not, because α may still have an imaginary part to remove.
 */
function larfg(
  complex: boolean,
  aRe: number,
  aIm: number,
  xr: number[],
  xi: number[],
): { alpha: number; tau: Tau } {
  const none: Tau = { re: 0, im: 0 };
  if (!complex) {
    if (xr.length === 0) return { alpha: aRe, tau: none };
    const xnorm = nrm2(xr, xi, false);
    if (xnorm === 0) return { alpha: aRe, tau: none };
    const beta = -sign(dlapy2(aRe, xnorm), aRe);
    const tau = (beta - aRe) / beta;
    const scal = 1 / (aRe - beta);
    for (let i = 0; i < xr.length; i++) xr[i] = xr[i]! * scal;
    return { alpha: beta, tau: { re: tau, im: 0 } };
  }
  const xnorm = nrm2(xr, xi, true);
  if (xnorm === 0 && aIm === 0) return { alpha: aRe, tau: none };
  const beta = -sign(dlapy3(aRe, aIm, xnorm), aRe);
  const tau: Tau = { re: (beta - aRe) / beta, im: -aIm / beta };
  const [cr, ci] = dladiv(1, 0, aRe - beta, aIm);
  for (let i = 0; i < xr.length; i++) {
    const r = xr[i]!;
    const m = xi[i]!;
    xr[i] = cr * r - ci * m;
    xi[i] = cr * m + ci * r;
  }
  return { alpha: beta, tau };
}

/**
 * zlarf from the left on the block of a with rows r0.. (as many as v has) and columns c0..c1:
 * C ← C − τ·v·(Cᴴ·v)ᴴ, with w = Cᴴ·v by zgemv and the rank-one update by zgerc, in the reference BLAS's order.
 */
function larfLeft(
  a: CM,
  vr: number[],
  vi: number[],
  tr: number,
  ti: number,
  r0: number,
  c0: number,
  c1: number,
): void {
  if (tr === 0 && ti === 0) return;
  const nv = vr.length;
  const alr = -tr;
  const ali = -ti;
  for (let j = c0; j <= c1; j++) {
    let wr = 0;
    let wi = 0;
    for (let k = 0; k < nv; k++) {
      const ar = a.re[r0 + k]![j]!;
      const ai = -a.im[r0 + k]![j]!;
      wr = wr + (ar * vr[k]! - ai * vi[k]!);
      wi = wi + (ar * vi[k]! + ai * vr[k]!);
    }
    if (wr === 0 && wi === 0) continue;
    const cwi = -wi;
    const sr = alr * wr - ali * cwi;
    const si = alr * cwi + ali * wr;
    for (let k = 0; k < nv; k++) {
      a.re[r0 + k]![j] = a.re[r0 + k]![j]! + (vr[k]! * sr - vi[k]! * si);
      a.im[r0 + k]![j] = a.im[r0 + k]![j]! + (vr[k]! * si + vi[k]! * sr);
    }
  }
}

/** zlarf from the right on rows r0..r1 and the columns c0.. of a (as many as v has): C ← C − τ·(C·v)·vᴴ. */
function larfRight(
  a: CM,
  vr: number[],
  vi: number[],
  tr: number,
  ti: number,
  r0: number,
  r1: number,
  c0: number,
): void {
  if (tr === 0 && ti === 0) return;
  const nv = vr.length;
  const wr = new Array<number>(r1 - r0 + 1).fill(0);
  const wi = new Array<number>(r1 - r0 + 1).fill(0);
  for (let k = 0; k < nv; k++) {
    if (vr[k] === 0 && vi[k] === 0) continue;
    for (let r = r0; r <= r1; r++) {
      const ar = a.re[r]![c0 + k]!;
      const ai = a.im[r]![c0 + k]!;
      wr[r - r0] = wr[r - r0]! + (vr[k]! * ar - vi[k]! * ai);
      wi[r - r0] = wi[r - r0]! + (vr[k]! * ai + vi[k]! * ar);
    }
  }
  const alr = -tr;
  const ali = -ti;
  for (let k = 0; k < nv; k++) {
    if (vr[k] === 0 && vi[k] === 0) continue;
    const cvi = -vi[k]!;
    const sr = alr * vr[k]! - ali * cvi;
    const si = alr * cvi + ali * vr[k]!;
    for (let r = r0; r <= r1; r++) {
      a.re[r]![c0 + k] =
        a.re[r]![c0 + k]! + (wr[r - r0]! * sr - wi[r - r0]! * si);
      a.im[r]![c0 + k] =
        a.im[r]![c0 + k]! + (wr[r - r0]! * si + wi[r - r0]! * sr);
    }
  }
}

/** The part of column c of a in rows r0..r1, as separate arrays. */
function colOf(a: CM, r0: number, r1: number, c: number): [number[], number[]] {
  const re: number[] = [];
  const im: number[] = [];
  for (let r = r0; r <= r1; r++) {
    re.push(a.re[r]![c]!);
    im.push(a.im[r]![c]!);
  }
  return [re, im];
}

/** The part of row r of a in columns c0..c1. */
function rowOf(a: CM, r: number, c0: number, c1: number): [number[], number[]] {
  return [a.re[r]!.slice(c0, c1 + 1), a.im[r]!.slice(c0, c1 + 1)];
}

function setCol(
  a: CM,
  r0: number,
  c: number,
  xr: number[],
  xi: number[],
): void {
  for (let k = 0; k < xr.length; k++) {
    a.re[r0 + k]![c] = xr[k]!;
    a.im[r0 + k]![c] = xi[k]!;
  }
}

function setRow(
  a: CM,
  r: number,
  c0: number,
  xr: number[],
  xi: number[],
): void {
  for (let k = 0; k < xr.length; k++) {
    a.re[r]![c0 + k] = xr[k]!;
    a.im[r]![c0 + k] = xi[k]!;
  }
}

/** zlacgv on row r, columns c0..c1. */
function conjRow(a: CM, r: number, c0: number, c1: number): void {
  for (let j = c0; j <= c1; j++) a.im[r]![j] = -a.im[r]![j]!;
}

/** zgeqr2: QR by Householder reflections, R above the diagonal and the reflectors below it. */
function geqr2(a: CM, m: number, n: number, complex: boolean): Tau[] {
  const tau: Tau[] = [];
  for (let i = 0; i < Math.min(m, n); i++) {
    const [xr, xi] = colOf(a, i + 1, m - 1, i);
    const { alpha, tau: t } = larfg(
      complex,
      a.re[i]![i]!,
      a.im[i]![i]!,
      xr,
      xi,
    );
    setCol(a, i + 1, i, xr, xi);
    a.re[i]![i] = alpha;
    a.im[i]![i] = 0;
    tau.push(t);
    if (i < n - 1) {
      a.re[i]![i] = 1;
      a.im[i]![i] = 0;
      const [vr, vi] = colOf(a, i, m - 1, i);
      larfLeft(a, vr, vi, t.re, -t.im, i, i + 1, n - 1);
      a.re[i]![i] = alpha;
    }
  }
  return tau;
}

/** zung2r on the m × n block of a at (r0, c0): the first n columns of Q = H(1)⋯H(k). */
function org2r(
  a: CM,
  r0: number,
  c0: number,
  m: number,
  n: number,
  k: number,
  tau: Tau[],
): void {
  for (let j = k; j < n; j++) {
    for (let l = 0; l < m; l++) {
      a.re[r0 + l]![c0 + j] = 0;
      a.im[r0 + l]![c0 + j] = 0;
    }
    a.re[r0 + j]![c0 + j] = 1;
  }
  for (let i = k - 1; i >= 0; i--) {
    const t = tau[i]!;
    if (i < n - 1) {
      a.re[r0 + i]![c0 + i] = 1;
      a.im[r0 + i]![c0 + i] = 0;
      const [vr, vi] = colOf(a, r0 + i, r0 + m - 1, c0 + i);
      larfLeft(a, vr, vi, t.re, t.im, r0 + i, c0 + i + 1, c0 + n - 1);
    }
    for (let l = i + 1; l < m; l++) {
      const xr = a.re[r0 + l]![c0 + i]!;
      const xi = a.im[r0 + l]![c0 + i]!;
      a.re[r0 + l]![c0 + i] = -t.re * xr - -t.im * xi;
      a.im[r0 + l]![c0 + i] = -t.re * xi + -t.im * xr;
    }
    a.re[r0 + i]![c0 + i] = 1 - t.re;
    a.im[r0 + i]![c0 + i] = -t.im;
    for (let l = 0; l < i; l++) {
      a.re[r0 + l]![c0 + i] = 0;
      a.im[r0 + l]![c0 + i] = 0;
    }
  }
}

/** zungl2 on the m × n block of a at (r0, c0), m ≤ n: the first m rows of Q = H(k)ᴴ⋯H(1)ᴴ. */
function orgl2(
  a: CM,
  r0: number,
  c0: number,
  m: number,
  n: number,
  k: number,
  tau: Tau[],
  complex: boolean,
): void {
  if (m <= 0) return;
  if (k < m) {
    for (let j = 0; j < n; j++) {
      for (let l = k; l < m; l++) {
        a.re[r0 + l]![c0 + j] = 0;
        a.im[r0 + l]![c0 + j] = 0;
      }
      if (j >= k && j < m) {
        a.re[r0 + j]![c0 + j] = 1;
        a.im[r0 + j]![c0 + j] = 0;
      }
    }
  }
  for (let i = k - 1; i >= 0; i--) {
    const t = tau[i]!;
    if (i < n - 1) {
      if (complex) conjRow(a, r0 + i, c0 + i + 1, c0 + n - 1);
      if (i < m - 1) {
        a.re[r0 + i]![c0 + i] = 1;
        a.im[r0 + i]![c0 + i] = 0;
        const [vr, vi] = rowOf(a, r0 + i, c0 + i, c0 + n - 1);
        larfRight(a, vr, vi, t.re, -t.im, r0 + i + 1, r0 + m - 1, c0 + i);
      }
      for (let j = i + 1; j < n; j++) {
        const xr = a.re[r0 + i]![c0 + j]!;
        const xi = a.im[r0 + i]![c0 + j]!;
        a.re[r0 + i]![c0 + j] = -t.re * xr - -t.im * xi;
        a.im[r0 + i]![c0 + j] = -t.re * xi + -t.im * xr;
      }
      if (complex) conjRow(a, r0 + i, c0 + i + 1, c0 + n - 1);
    }
    a.re[r0 + i]![c0 + i] = 1 - t.re;
    a.im[r0 + i]![c0 + i] = t.im;
    for (let l = 0; l < i; l++) {
      a.re[r0 + i]![c0 + l] = 0;
      a.im[r0 + i]![c0 + l] = 0;
    }
  }
}

/** dgebd2 / zgebd2 for m ≥ n: reduce to upper bidiagonal form. Returns d, e and the reflector scalars. */
function gebd2(
  a: CM,
  m: number,
  n: number,
  complex: boolean,
): { d: number[]; e: number[]; tauq: Tau[]; taup: Tau[] } {
  const d: number[] = [];
  const e: number[] = [];
  const tauq: Tau[] = [];
  const taup: Tau[] = [];
  for (let i = 0; i < n; i++) {
    const [xr, xi] = colOf(a, Math.min(i + 1, m - 1), m - 1, i);
    const tail = i + 1 <= m - 1 ? [xr, xi] : [[], []];
    const { alpha, tau } = larfg(
      complex,
      a.re[i]![i]!,
      a.im[i]![i]!,
      tail[0]!,
      tail[1]!,
    );
    if (i + 1 <= m - 1) setCol(a, i + 1, i, tail[0]!, tail[1]!);
    d.push(alpha);
    tauq.push(tau);
    a.re[i]![i] = 1;
    a.im[i]![i] = 0;
    const [vr, vi] = colOf(a, i, m - 1, i);
    larfLeft(a, vr, vi, tau.re, -tau.im, i, i + 1, n - 1);
    a.re[i]![i] = alpha;
    a.im[i]![i] = 0;
    if (i < n - 1) {
      if (complex) conjRow(a, i, i + 1, n - 1);
      const [rr, ri] = rowOf(a, i, Math.min(i + 2, n - 1), n - 1);
      const rowTail = i + 2 <= n - 1 ? [rr, ri] : [[], []];
      const g = larfg(
        complex,
        a.re[i]![i + 1]!,
        a.im[i]![i + 1]!,
        rowTail[0]!,
        rowTail[1]!,
      );
      if (i + 2 <= n - 1) setRow(a, i, i + 2, rowTail[0]!, rowTail[1]!);
      e.push(g.alpha);
      taup.push(g.tau);
      a.re[i]![i + 1] = 1;
      a.im[i]![i + 1] = 0;
      const [pr, pi] = rowOf(a, i, i + 1, n - 1);
      larfRight(a, pr, pi, g.tau.re, g.tau.im, i + 1, m - 1, i + 1);
      if (complex) conjRow(a, i, i + 1, n - 1);
      a.re[i]![i + 1] = g.alpha;
      a.im[i]![i + 1] = 0;
    } else {
      taup.push({ re: 0, im: 0 });
    }
  }
  return { d, e, tauq, taup };
}

/** dorgbr/zungbr 'P' for an n × n matrix with k = n: shift the reflector rows right, then zungl2 on the rest. */
function orgbrP(a: CM, n: number, taup: Tau[], complex: boolean): void {
  a.re[0]![0] = 1;
  a.im[0]![0] = 0;
  for (let i = 1; i < n; i++) {
    a.re[i]![0] = 0;
    a.im[i]![0] = 0;
  }
  for (let j = 1; j < n; j++) {
    for (let i = j - 1; i >= 1; i--) {
      a.re[i]![j] = a.re[i - 1]![j]!;
      a.im[i]![j] = a.im[i - 1]![j]!;
    }
    a.re[0]![j] = 0;
    a.im[0]![j] = 0;
  }
  if (n > 1) orgl2(a, 1, 1, n - 1, n - 1, n - 1, taup, complex);
}

/** dlartg as LAPACK 3.0 has it: r is positive unless |f| > |g| and f < 0. */
function dlartg(f: number, g: number): { cs: number; sn: number; r: number } {
  if (g === 0) return { cs: 1, sn: 0, r: f };
  if (f === 0) return { cs: 0, sn: 1, r: g };
  const safmn2 = 2 ** -484;
  const safmx2 = 2 ** 484;
  let f1 = f;
  let g1 = g;
  let scale = Math.max(Math.abs(f1), Math.abs(g1));
  let cs: number;
  let sn: number;
  let r: number;
  if (scale >= safmx2) {
    let count = 0;
    do {
      count++;
      f1 *= safmn2;
      g1 *= safmn2;
      scale = Math.max(Math.abs(f1), Math.abs(g1));
    } while (scale >= safmx2);
    r = Math.sqrt(f1 ** 2 + g1 ** 2);
    cs = f1 / r;
    sn = g1 / r;
    for (let i = 0; i < count; i++) r *= safmx2;
  } else if (scale <= safmn2) {
    let count = 0;
    do {
      count++;
      f1 *= safmx2;
      g1 *= safmx2;
      scale = Math.max(Math.abs(f1), Math.abs(g1));
    } while (scale <= safmn2);
    r = Math.sqrt(f1 ** 2 + g1 ** 2);
    cs = f1 / r;
    sn = g1 / r;
    for (let i = 0; i < count; i++) r *= safmn2;
  } else {
    r = Math.sqrt(f1 ** 2 + g1 ** 2);
    cs = f1 / r;
    sn = g1 / r;
  }
  if (Math.abs(f) > Math.abs(g) && cs < 0) {
    cs = -cs;
    sn = -sn;
    r = -r;
  }
  return { cs, sn, r };
}

/** dlas2: the singular values of the 2 × 2 triangular matrix (f g; 0 h). Returns [ssmin, ssmax]. */
function dlas2(f: number, g: number, h: number): [number, number] {
  const fa = Math.abs(f);
  const ga = Math.abs(g);
  const ha = Math.abs(h);
  const fhmn = Math.min(fa, ha);
  const fhmx = Math.max(fa, ha);
  if (fhmn === 0) {
    if (fhmx === 0) return [0, ga];
    const mx = Math.max(fhmx, ga);
    return [0, mx * Math.sqrt(1 + (Math.min(fhmx, ga) / mx) ** 2)];
  }
  if (ga < fhmx) {
    const as = 1 + fhmn / fhmx;
    const at = (fhmx - fhmn) / fhmx;
    const au = (ga / fhmx) ** 2;
    const c = 2 / (Math.sqrt(as * as + au) + Math.sqrt(at * at + au));
    return [fhmn * c, fhmx / c];
  }
  const au = fhmx / ga;
  if (au === 0) return [(fhmn * fhmx) / ga, ga];
  const as = 1 + fhmn / fhmx;
  const at = (fhmx - fhmn) / fhmx;
  const c = 1 / (Math.sqrt(1 + (as * au) ** 2) + Math.sqrt(1 + (at * au) ** 2));
  let ssmin = fhmn * c * au;
  ssmin = ssmin + ssmin;
  return [ssmin, ga / (c + c)];
}

/** dlasv2: SVD of the 2 × 2 triangular matrix (f g; 0 h): singular values and the left and right rotations. */
function dlasv2(
  f: number,
  g: number,
  h: number,
): {
  ssmin: number;
  ssmax: number;
  snr: number;
  csr: number;
  snl: number;
  csl: number;
} {
  let ft = f;
  let fa = Math.abs(ft);
  let ht = h;
  let ha = Math.abs(h);
  let pmax = 1;
  const swap = ha > fa;
  if (swap) {
    pmax = 3;
    [ft, ht] = [ht, ft];
    [fa, ha] = [ha, fa];
  }
  const gt = g;
  const ga = Math.abs(gt);
  let ssmin: number;
  let ssmax: number;
  let clt: number;
  let crt: number;
  let slt: number;
  let srt: number;
  if (ga === 0) {
    ssmin = ha;
    ssmax = fa;
    clt = 1;
    crt = 1;
    slt = 0;
    srt = 0;
  } else {
    let gasmal = true;
    ssmin = 0;
    ssmax = 0;
    clt = 0;
    crt = 0;
    slt = 0;
    srt = 0;
    if (ga > fa) {
      pmax = 2;
      if (fa / ga < EPS) {
        gasmal = false;
        ssmax = ga;
        ssmin = ha > 1 ? fa / (ga / ha) : (fa / ga) * ha;
        clt = 1;
        slt = ht / gt;
        srt = 1;
        crt = ft / gt;
      }
    }
    if (gasmal) {
      const d = fa - ha;
      let l = d === fa ? 1 : d / fa;
      const m = gt / ft;
      let t = 2 - l;
      const mm = m * m;
      const tt = t * t;
      const s = Math.sqrt(tt + mm);
      const r = l === 0 ? Math.abs(m) : Math.sqrt(l * l + mm);
      const a = 0.5 * (s + r);
      ssmin = ha / a;
      ssmax = fa * a;
      if (mm === 0) {
        if (l === 0) t = sign(2, ft) * sign(1, gt);
        else t = gt / sign(d, ft) + m / t;
      } else {
        t = (m / (s + t) + m / (r + l)) * (1 + a);
      }
      l = Math.sqrt(t * t + 4);
      crt = 2 / l;
      srt = t / l;
      clt = (crt + srt * m) / a;
      slt = ((ht / ft) * srt) / a;
    }
  }
  let csl: number;
  let snl: number;
  let csr: number;
  let snr: number;
  if (swap) {
    csl = srt;
    snl = crt;
    csr = slt;
    snr = clt;
  } else {
    csl = clt;
    snl = slt;
    csr = crt;
    snr = srt;
  }
  let tsign = 1;
  if (pmax === 1) tsign = sign(1, csr) * sign(1, csl) * sign(1, f);
  if (pmax === 2) tsign = sign(1, snr) * sign(1, csl) * sign(1, g);
  if (pmax === 3) tsign = sign(1, snr) * sign(1, snl) * sign(1, h);
  ssmax = sign(ssmax, tsign);
  ssmin = sign(ssmin, tsign * sign(1, f) * sign(1, h));
  return { ssmin, ssmax, snr, csr, snl, csl };
}

/** dlasr('L','V',dir) on rows r0..r0+count-1 of m, every column: rotations (c[j], s[j]) between rows j and j+1. */
function lasrLeft(
  a: CM,
  r0: number,
  count: number,
  c: number[],
  s: number[],
  forward: boolean,
): void {
  const cols = a.re[0]!.length;
  const step = (j: number): void => {
    const ct = c[j]!;
    const st = s[j]!;
    if (ct === 1 && st === 0) return;
    for (let i = 0; i < cols; i++) {
      for (const p of [a.re, a.im]) {
        const temp = p[r0 + j + 1]![i]!;
        p[r0 + j + 1]![i] = ct * temp - st * p[r0 + j]![i]!;
        p[r0 + j]![i] = st * temp + ct * p[r0 + j]![i]!;
      }
    }
  };
  if (forward) for (let j = 0; j < count - 1; j++) step(j);
  else for (let j = count - 2; j >= 0; j--) step(j);
}

/** dlasr('R','V',dir) on columns c0..c0+count-1 of a, every row. */
function lasrRight(
  a: CM,
  c0: number,
  count: number,
  c: number[],
  s: number[],
  forward: boolean,
): void {
  const rows = a.re.length;
  const step = (j: number): void => {
    const ct = c[j]!;
    const st = s[j]!;
    if (ct === 1 && st === 0) return;
    for (let i = 0; i < rows; i++) {
      for (const p of [a.re, a.im]) {
        const temp = p[i]![c0 + j + 1]!;
        p[i]![c0 + j + 1] = ct * temp - st * p[i]![c0 + j]!;
        p[i]![c0 + j] = st * temp + ct * p[i]![c0 + j]!;
      }
    }
  };
  if (forward) for (let j = 0; j < count - 1; j++) step(j);
  else for (let j = count - 2; j >= 0; j--) step(j);
}

/** drot on rows p and q of a (every column). */
function rotRows(a: CM, p: number, q: number, c: number, s: number): void {
  for (const part of [a.re, a.im]) {
    for (let j = 0; j < part[p]!.length; j++) {
      const x = part[p]![j]!;
      const y = part[q]![j]!;
      part[p]![j] = c * x + s * y;
      part[q]![j] = c * y - s * x;
    }
  }
}

/** drot on columns p and q of a (every row). */
function rotCols(a: CM, p: number, q: number, c: number, s: number): void {
  for (const part of [a.re, a.im]) {
    for (let i = 0; i < part.length; i++) {
      const x = part[i]![p]!;
      const y = part[i]![q]!;
      part[i]![p] = c * x + s * y;
      part[i]![q] = c * y - s * x;
    }
  }
}

/**
 * dbdsqr / zbdsqr for an upper bidiagonal matrix (d, e), with the left rotations accumulated into the rows of vt
 * and the right rotations into the columns of u. d and e are 1-based here (index 0 is unused), as in the Fortran.
 */
function bdsqr(n: number, d: number[], e: number[], vt: CM, u: CM): void {
  const maxitr = 6;
  const tolmul = Math.max(10, Math.min(100, EPS ** -0.125));
  const tol = tolmul * EPS;
  const unfl = SAFMIN;
  if (n > 1) {
    let smax = 0;
    for (let i = 1; i <= n; i++) smax = Math.max(smax, Math.abs(d[i]!));
    for (let i = 1; i <= n - 1; i++) smax = Math.max(smax, Math.abs(e[i]!));
    let sminl = 0;
    let sminoa = Math.abs(d[1]!);
    if (sminoa !== 0) {
      let mu = sminoa;
      for (let i = 2; i <= n; i++) {
        mu = Math.abs(d[i]!) * (mu / (mu + Math.abs(e[i - 1]!)));
        sminoa = Math.min(sminoa, mu);
        if (sminoa === 0) break;
      }
    }
    sminoa = sminoa / Math.sqrt(n);
    const thresh = Math.max(tol * sminoa, maxitr * n * n * unfl);
    const maxit = maxitr * n * n;
    let iter = 0;
    let oldll = -1;
    let oldm = -1;
    let idir = 0;
    let m = n;
    let ll = 0;
    // Work arrays, indexed from 0: cosr, sinr, cosl, sinl of the sweep.
    const w1 = new Array<number>(n).fill(0);
    const w2 = new Array<number>(n).fill(0);
    const w3 = new Array<number>(n).fill(0);
    const w4 = new Array<number>(n).fill(0);
    main: while (true) {
      if (m <= 1) break;
      if (iter > maxit)
        throw new Error("svd: the QR iteration did not converge");
      smax = Math.abs(d[m]!);
      let found = false;
      for (let lll = 1; lll <= m - 1; lll++) {
        ll = m - lll;
        const abss = Math.abs(d[ll]!);
        const abse = Math.abs(e[ll]!);
        if (abse <= thresh) {
          found = true;
          break;
        }
        smax = Math.max(smax, abss, abse);
      }
      if (found) {
        e[ll] = 0;
        if (ll === m - 1) {
          m = m - 1;
          continue main;
        }
      } else {
        ll = 0;
      }
      ll = ll + 1;
      if (ll === m - 1) {
        const r = dlasv2(d[m - 1]!, e[m - 1]!, d[m]!);
        d[m - 1] = r.ssmax;
        e[m - 1] = 0;
        d[m] = r.ssmin;
        rotRows(vt, m - 2, m - 1, r.csr, r.snr);
        rotCols(u, m - 2, m - 1, r.csl, r.snl);
        m = m - 2;
        continue main;
      }
      if (ll > oldm || m < oldll)
        idir = Math.abs(d[ll]!) >= Math.abs(d[m]!) ? 1 : 2;
      if (idir === 1) {
        if (Math.abs(e[m - 1]!) <= Math.abs(tol) * Math.abs(d[m]!)) {
          e[m - 1] = 0;
          continue main;
        }
        let mu = Math.abs(d[ll]!);
        sminl = mu;
        for (let lll = ll; lll <= m - 1; lll++) {
          if (Math.abs(e[lll]!) <= tol * mu) {
            e[lll] = 0;
            continue main;
          }
          mu = Math.abs(d[lll + 1]!) * (mu / (mu + Math.abs(e[lll]!)));
          sminl = Math.min(sminl, mu);
        }
      } else {
        if (Math.abs(e[ll]!) <= Math.abs(tol) * Math.abs(d[ll]!)) {
          e[ll] = 0;
          continue main;
        }
        let mu = Math.abs(d[m]!);
        sminl = mu;
        for (let lll = m - 1; lll >= ll; lll--) {
          if (Math.abs(e[lll]!) <= tol * mu) {
            e[lll] = 0;
            continue main;
          }
          mu = Math.abs(d[lll]!) * (mu / (mu + Math.abs(e[lll]!)));
          sminl = Math.min(sminl, mu);
        }
      }
      oldll = ll;
      oldm = m;
      let shift: number;
      if (n * tol * (sminl / smax) <= Math.max(EPS, 0.01 * tol)) {
        shift = 0;
      } else {
        let sll: number;
        if (idir === 1) {
          sll = Math.abs(d[ll]!);
          shift = dlas2(d[m - 1]!, e[m - 1]!, d[m]!)[0];
        } else {
          sll = Math.abs(d[m]!);
          shift = dlas2(d[ll]!, e[ll]!, d[ll + 1]!)[0];
        }
        if (sll > 0 && (shift / sll) ** 2 < EPS) shift = 0;
      }
      iter = iter + m - ll;
      const cnt = m - ll + 1;
      if (shift === 0) {
        if (idir === 1) {
          let cs = 1;
          let oldcs = 1;
          let oldsn = 0;
          for (let i = ll; i <= m - 1; i++) {
            const g1 = dlartg(d[i]! * cs, e[i]!);
            cs = g1.cs;
            const sn = g1.sn;
            if (i > ll) e[i - 1] = oldsn * g1.r;
            const g2 = dlartg(oldcs * g1.r, d[i + 1]! * sn);
            oldcs = g2.cs;
            oldsn = g2.sn;
            d[i] = g2.r;
            w1[i - ll] = cs;
            w2[i - ll] = sn;
            w3[i - ll] = oldcs;
            w4[i - ll] = oldsn;
          }
          const h = d[m]! * cs;
          d[m] = h * oldcs;
          e[m - 1] = h * oldsn;
          lasrLeft(vt, ll - 1, cnt, w1, w2, true);
          lasrRight(u, ll - 1, cnt, w3, w4, true);
          if (Math.abs(e[m - 1]!) <= thresh) e[m - 1] = 0;
        } else {
          let cs = 1;
          let oldcs = 1;
          let oldsn = 0;
          for (let i = m; i >= ll + 1; i--) {
            const g1 = dlartg(d[i]! * cs, e[i - 1]!);
            cs = g1.cs;
            const sn = g1.sn;
            if (i < m) e[i] = oldsn * g1.r;
            const g2 = dlartg(oldcs * g1.r, d[i - 1]! * sn);
            oldcs = g2.cs;
            oldsn = g2.sn;
            d[i] = g2.r;
            w1[i - ll - 1] = cs;
            w2[i - ll - 1] = -sn;
            w3[i - ll - 1] = oldcs;
            w4[i - ll - 1] = -oldsn;
          }
          const h = d[ll]! * cs;
          d[ll] = h * oldcs;
          e[ll] = h * oldsn;
          lasrLeft(vt, ll - 1, cnt, w3, w4, false);
          lasrRight(u, ll - 1, cnt, w1, w2, false);
          if (Math.abs(e[ll]!) <= thresh) e[ll] = 0;
        }
      } else if (idir === 1) {
        let f = (Math.abs(d[ll]!) - shift) * (sign(1, d[ll]!) + shift / d[ll]!);
        let g = e[ll]!;
        for (let i = ll; i <= m - 1; i++) {
          const r1 = dlartg(f, g);
          const cosr = r1.cs;
          const sinr = r1.sn;
          if (i > ll) e[i - 1] = r1.r;
          f = cosr * d[i]! + sinr * e[i]!;
          e[i] = cosr * e[i]! - sinr * d[i]!;
          g = sinr * d[i + 1]!;
          d[i + 1] = cosr * d[i + 1]!;
          const r2 = dlartg(f, g);
          const cosl = r2.cs;
          const sinl = r2.sn;
          d[i] = r2.r;
          f = cosl * e[i]! + sinl * d[i + 1]!;
          d[i + 1] = cosl * d[i + 1]! - sinl * e[i]!;
          if (i < m - 1) {
            g = sinl * e[i + 1]!;
            e[i + 1] = cosl * e[i + 1]!;
          }
          w1[i - ll] = cosr;
          w2[i - ll] = sinr;
          w3[i - ll] = cosl;
          w4[i - ll] = sinl;
        }
        e[m - 1] = f;
        lasrLeft(vt, ll - 1, cnt, w1, w2, true);
        lasrRight(u, ll - 1, cnt, w3, w4, true);
        if (Math.abs(e[m - 1]!) <= thresh) e[m - 1] = 0;
      } else {
        let f = (Math.abs(d[m]!) - shift) * (sign(1, d[m]!) + shift / d[m]!);
        let g = e[m - 1]!;
        for (let i = m; i >= ll + 1; i--) {
          const r1 = dlartg(f, g);
          const cosr = r1.cs;
          const sinr = r1.sn;
          if (i < m) e[i] = r1.r;
          f = cosr * d[i]! + sinr * e[i - 1]!;
          e[i - 1] = cosr * e[i - 1]! - sinr * d[i]!;
          g = sinr * d[i - 1]!;
          d[i - 1] = cosr * d[i - 1]!;
          const r2 = dlartg(f, g);
          const cosl = r2.cs;
          const sinl = r2.sn;
          d[i] = r2.r;
          f = cosl * e[i - 1]! + sinl * d[i - 1]!;
          d[i - 1] = cosl * d[i - 1]! - sinl * e[i - 1]!;
          if (i > ll + 1) {
            g = sinl * e[i - 2]!;
            e[i - 2] = cosl * e[i - 2]!;
          }
          w1[i - ll - 1] = cosr;
          w2[i - ll - 1] = -sinr;
          w3[i - ll - 1] = cosl;
          w4[i - ll - 1] = -sinl;
        }
        e[ll] = f;
        if (Math.abs(e[ll]!) <= thresh) e[ll] = 0;
        lasrLeft(vt, ll - 1, cnt, w3, w4, false);
        lasrRight(u, ll - 1, cnt, w1, w2, false);
      }
    }
  }
  // Make the singular values positive, then sort them into decreasing order.
  for (let i = 1; i <= n; i++) {
    if (d[i]! < 0) {
      d[i] = -d[i]!;
      for (let j = 0; j < vt.re[i - 1]!.length; j++) {
        vt.re[i - 1]![j] = -vt.re[i - 1]![j]!;
        vt.im[i - 1]![j] = -vt.im[i - 1]![j]!;
      }
    }
  }
  for (let i = 1; i <= n - 1; i++) {
    let isub = 1;
    let smin = d[1]!;
    for (let j = 2; j <= n + 1 - i; j++) {
      if (d[j]! <= smin) {
        isub = j;
        smin = d[j]!;
      }
    }
    const last = n + 1 - i;
    if (isub !== last) {
      d[isub] = d[last]!;
      d[last] = smin;
      for (const part of [vt.re, vt.im])
        [part[isub - 1], part[last - 1]] = [part[last - 1]!, part[isub - 1]!];
      for (const part of [u.re, u.im]) {
        for (const row of part)
          [row[isub - 1], row[last - 1]] = [row[last - 1]!, row[isub - 1]!];
      }
    }
  }
}

/** dgemm('N','N') with alpha = 1, beta = 0, in the reference order: C(:, j) accumulates A(:, l)·B(l, j) over l. */
function gemm(a: CM, b: CM, m: number, n: number, k: number): CM {
  const c = newCM(m, n);
  for (let j = 0; j < n; j++) {
    for (let l = 0; l < k; l++) {
      const tr = b.re[l]![j]!;
      const ti = b.im[l]![j]!;
      if (tr === 0 && ti === 0) continue;
      for (let i = 0; i < m; i++) {
        const ar = a.re[i]![l]!;
        const ai = a.im[i]![l]!;
        c.re[i]![j] = c.re[i]![j]! + (tr * ar - ti * ai);
        c.im[i]![j] = c.im[i]![j]! + (tr * ai + ti * ar);
      }
    }
  }
  return c;
}

/** dlascl('G'): multiply every entry by cto / cfrom without over- or underflow. */
function lascl(cfrom: number, cto: number, apply: (mul: number) => void): void {
  const smlnum = SAFMIN;
  const bignum = 1 / smlnum;
  let cfromc = cfrom;
  let ctoc = cto;
  let done = false;
  while (!done) {
    const cfrom1 = cfromc * smlnum;
    const cto1 = ctoc / bignum;
    let mul: number;
    if (Math.abs(cfrom1) > Math.abs(ctoc) && ctoc !== 0) {
      mul = smlnum;
      cfromc = cfrom1;
    } else if (Math.abs(cto1) > Math.abs(cfromc)) {
      mul = bignum;
      ctoc = cto1;
    } else {
      mul = ctoc / cfromc;
      done = true;
    }
    apply(mul);
  }
}

/**
 * dgesvd / zgesvd as LAPACK 3.0, JOBU = 'S', JOBVT = 'A', for m ≥ n. A is m × n by rows: its real parts, and its
 * imaginary parts or null for a real matrix. Returns the n singular values in decreasing order, U (m × n) and
 * Vᵀ (n × n; for a complex matrix this is LAPACK's VT, that is Vᴴ). Throws for m < n and when the QR iteration
 * fails to converge.
 */
export function gesvd(
  are: number[][],
  aim: number[][] | null,
): {
  s: number[];
  Ure: number[][];
  Uim: number[][] | null;
  VTre: number[][];
  VTim: number[][] | null;
} {
  const m = are.length;
  const n = m > 0 ? are[0]!.length : 0;
  if (m < n) throw new Error("gesvd needs at least as many rows as columns");
  const complex = aim !== null;
  if (n === 0) {
    return {
      s: [],
      Ure: are.map(() => []),
      Uim: complex ? are.map(() => []) : null,
      VTre: [],
      VTim: complex ? [] : null,
    };
  }
  const a: CM = {
    re: are.map((r) => r.slice()),
    im: aim ? aim.map((r) => r.slice()) : zeros(m, n),
  };

  // Scale A into the safe range when its largest entry is tiny or huge.
  const eps = EPS * 2; // dlamch('P')
  const smlnum = Math.sqrt(SAFMIN) / eps;
  const bignum = 1 / smlnum;
  let anrm = 0;
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      anrm = Math.max(anrm, Math.hypot(a.re[i]![j]!, a.im[i]![j]!));
  let scaled = false;
  const scaleA = (mul: number): void => {
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        a.re[i]![j] = a.re[i]![j]! * mul;
        a.im[i]![j] = a.im[i]![j]! * mul;
      }
    }
  };
  if (anrm > 0 && anrm < smlnum) {
    scaled = true;
    lascl(anrm, smlnum, scaleA);
  } else if (anrm > bignum) {
    scaled = true;
    lascl(anrm, bignum, scaleA);
  }

  // ILAENV(6): int(1.6·min(m, n)), in single precision.
  const mnthr = Math.trunc(Math.fround(n * Math.fround(1.6)));
  const d1: number[] = [0];
  const e1: number[] = [0];
  let u: CM;
  let vt: CM;
  if (m >= mnthr) {
    // Path 6 (path 9 for the complex routine), workspace sufficient: QR, bidiagonalize R, then U = Q·Q_b.
    const tau = geqr2(a, m, n, complex);
    const r = newCM(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i <= j; i++) {
        r.re[i]![j] = a.re[i]![j]!;
        r.im[i]![j] = a.im[i]![j]!;
      }
    }
    org2r(a, 0, 0, m, n, n, tau);
    const bd = gebd2(r, n, n, complex);
    vt = newCM(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i <= j; i++) {
        vt.re[i]![j] = r.re[i]![j]!;
        vt.im[i]![j] = r.im[i]![j]!;
      }
    }
    org2r(r, 0, 0, n, n, n, bd.tauq);
    orgbrP(vt, n, bd.taup, complex);
    d1.push(...bd.d);
    e1.push(...bd.e);
    bdsqr(n, d1, e1, vt, r);
    u = gemm(a, r, m, n, n);
  } else {
    // Path 10: bidiagonalize A directly.
    const bd = gebd2(a, m, n, complex);
    u = newCM(m, n);
    for (let j = 0; j < n; j++) {
      for (let i = j; i < m; i++) {
        u.re[i]![j] = a.re[i]![j]!;
        u.im[i]![j] = a.im[i]![j]!;
      }
    }
    org2r(u, 0, 0, m, n, n, bd.tauq);
    vt = newCM(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i <= j; i++) {
        vt.re[i]![j] = a.re[i]![j]!;
        vt.im[i]![j] = a.im[i]![j]!;
      }
    }
    orgbrP(vt, n, bd.taup, complex);
    d1.push(...bd.d);
    e1.push(...bd.e);
    bdsqr(n, d1, e1, vt, u);
  }
  const s = d1.slice(1);
  if (scaled) {
    if (anrm > bignum)
      lascl(bignum, anrm, (mul) => s.forEach((x, i) => (s[i] = x * mul)));
    if (anrm < smlnum)
      lascl(smlnum, anrm, (mul) => s.forEach((x, i) => (s[i] = x * mul)));
  }
  return {
    s,
    Ure: u.re,
    Uim: complex ? u.im : null,
    VTre: vt.re,
    VTim: complex ? vt.im : null,
  };
}
