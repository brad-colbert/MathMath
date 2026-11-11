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
 * Generalized eigenvalue problems A·x = λ·B·x as Mathcad 14 solves them, which is the Intel MKL of LAPACK 3.0's
 * era: a port of LAPACK 3.0's dggev and zggev and what they call, to give Mathcad's eigenvalue order and its
 * eigenvector signs and phases, which later LAPACKs change.
 *
 * Real pencils (dggev): dggbal (permutation only), dgeqr2, dorm2r and dorg2r (what dgeqrf, dormqr and dorgqr do for
 * small matrices), dgghrd, dhgeqz (with dlag2 and dlasv2), dtgevc (with dlaln2 and dladiv) and dggbak. Complex
 * pencils (zggev): zggbal, zgeqr2, zunm2r, zung2r, zgghrd, zhgeqz, ztgevc and zggbak, with zlartg, zlarfg and
 * zlarf. LAPACK 3.12 differs on the real path: it orders two of the probed pairs differently and turns the sign
 * of some eigenvectors, so this is not a rewrite of the reference routines; the arithmetic follows 3.0's. The
 * inner routines keep Fortran's one-based indexing and operation order, so they can be compared line by line with
 * the Fortran.
 */

/** A one-based matrix: row and column 0 are unused. */
type M = number[][];

const SAFMIN = 2 ** -1022;
const EPS = 2 ** -53; // dlamch('E')
const ULP = 2 ** -52; // dlamch('E') * dlamch('B')

/** Fortran's SIGN(a, b), as gfortran gives it: -0 counts as negative. */
const sign = (a: number, b: number): number => (b < 0 || Object.is(b, -0) ? -Math.abs(a) : Math.abs(a));

const mat = (n: number, m: number = n): M => Array.from({ length: n + 2 }, () => new Array<number>(m + 2).fill(0));
const ident = (n: number): M => {
  const q = mat(n);
  for (let i = 1; i <= n; i++) q[i]![i] = 1;
  return q;
};
const fromRows = (rows: number[][]): M => {
  const n = rows.length;
  const a = mat(n, rows[0]?.length ?? 0);
  for (let i = 0; i < n; i++) for (let j = 0; j < rows[i]!.length; j++) a[i + 1]![j + 1] = rows[i]![j]!;
  return a;
};
const toRows = (a: M, n: number): number[][] =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => a[i + 1]![j + 1]!));

/** dlapy2, as 3.0. */
function dlapy2(x: number, y: number): number {
  const w = Math.max(Math.abs(x), Math.abs(y));
  const z = Math.min(Math.abs(x), Math.abs(y));
  return z === 0 ? w : w * Math.sqrt(1 + (z / w) ** 2);
}

/** dlapy3. */
function dlapy3(x: number, y: number, z: number): number {
  const xa = Math.abs(x);
  const ya = Math.abs(y);
  const za = Math.abs(z);
  const w = Math.max(xa, ya, za);
  return w === 0 ? 0 : w * Math.sqrt((xa / w) ** 2 + (ya / w) ** 2 + (za / w) ** 2);
}

/** dnrm2 for values of ordinary size, as eigen.ts found MKL sums them: the square root of the sum of squares. */
function dnrm2(x: number[]): number {
  let sum = 0;
  for (const v of x) sum += v * v;
  return Math.sqrt(sum);
}

/** dlarfg: overwrites x with the tail of v; returns beta (the new alpha) and tau. */
function dlarfg(alpha: number, x: number[]): { beta: number; tau: number } {
  const xnorm = dnrm2(x);
  if (xnorm === 0) return { beta: alpha, tau: 0 };
  const beta = -sign(dlapy2(alpha, xnorm), alpha);
  const tau = (beta - alpha) / beta;
  const scal = 1 / (alpha - beta);
  for (let i = 0; i < x.length; i++) x[i] = x[i]! * scal;
  return { beta, tau };
}

/** dlarf from the left on the m × n block of c at (ic, jc): dgemv('T') then dger, in the reference BLAS's order. */
function dlarfL(c: M, v: number[], tau: number, ic: number, jc: number, m: number, n: number): void {
  if (tau === 0) return;
  for (let j = 0; j < n; j++) {
    let w = 0;
    for (let k = 0; k < m; k++) w += c[ic + k]![jc + j]! * v[k]!;
    const temp = -tau * w;
    if (temp !== 0) for (let k = 0; k < m; k++) c[ic + k]![jc + j] = c[ic + k]![jc + j]! + v[k]! * temp;
  }
}

/** dlartg as LAPACK 3.0 has it: r > 0 unless |f| > |g|. */
function dlartg(f: number, g: number): { cs: number; sn: number; r: number } {
  const safmn2 = 2 ** Math.trunc(Math.log(SAFMIN / EPS) / Math.log(2) / 2);
  const safmx2 = 1 / safmn2;
  if (g === 0) return { cs: 1, sn: 0, r: f };
  if (f === 0) return { cs: 0, sn: 1, r: g };
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

/** drot on `count` pairs (x(k), y(k)) = (a[r1][c1 + k], a[r2][c2 + k]), row-wise. */
function rotRows(a: M, r1: number, r2: number, c0: number, count: number, c: number, s: number): void {
  for (let k = 0; k < count; k++) {
    const x = a[r1]![c0 + k]!;
    const y = a[r2]![c0 + k]!;
    a[r1]![c0 + k] = c * x + s * y;
    a[r2]![c0 + k] = c * y - s * x;
  }
}

/** drot on the columns c1 (x) and c2 (y), rows r0 .. r0 + count - 1. */
function rotCols(a: M, c1: number, c2: number, r0: number, count: number, c: number, s: number): void {
  for (let k = 0; k < count; k++) {
    const x = a[r0 + k]![c1]!;
    const y = a[r0 + k]![c2]!;
    a[r0 + k]![c1] = c * x + s * y;
    a[r0 + k]![c2] = c * y - s * x;
  }
}

/**
 * dggbal (and zggbal) with job 'P', as LAPACK 3.0: permute to isolate eigenvalues. lscale and rscale hold the swaps.
 * The pencil is reached through `nz` (is a(i, j) or b(i, j) nonzero), `swapRows` (rows i and m of both, columns k..n)
 * and `swapCols` (columns j and m of both, rows 1..l), so real and complex pencils share this.
 */
function dggbalP(
  n: number,
  nz: (i: number, j: number) => boolean,
  swapRows: (i: number, m: number, k: number) => void,
  swapCols: (j: number, m: number, l: number) => void,
): { ilo: number; ihi: number; lscale: number[]; rscale: number[] } {
  const lscale = new Array<number>(n + 2).fill(1);
  const rscale = new Array<number>(n + 2).fill(1);
  let k = 1;
  let l = n;
  if (n === 0) return { ilo: 1, ihi: 0, lscale, rscale };
  if (k === l) return { ilo: 1, ihi: 1, lscale, rscale };
  const swap = (i: number, j: number, m: number): void => {
    lscale[m] = i;
    if (i !== m) swapRows(i, m, k);
    rscale[m] = j;
    if (j !== m) swapCols(j, m, l);
  };
  // Rows isolating an eigenvalue go to the bottom (label 30).
  search: for (;;) {
    const lm1 = l - 1;
    let found = false;
    for (let i = l; i >= 1; i--) {
      let j: number;
      let jp1 = 0;
      let hit = 0;
      for (let jj = 1; jj <= lm1; jj++) if (nz(i, jj)) {
        hit = jj;
        jp1 = jj + 1;
        break;
      }
      if (hit === 0) j = l;
      else {
        let two = false;
        for (let jj = jp1; jj <= l; jj++) if (nz(i, jj)) {
          two = true;
          break;
        }
        if (two) continue;
        j = jp1 - 1;
      }
      swap(i, j, l);
      found = true;
      l = lm1;
      if (l !== 1) continue search;
      rscale[1] = 1;
      lscale[1] = 1;
      return { ilo: k, ihi: l, lscale, rscale };
    }
    if (!found) break;
  }
  // Columns isolating an eigenvalue go to the left (label 100).
  colsearch: for (;;) {
    const lm1 = l - 1;
    for (let j = k; j <= l; j++) {
      let i: number;
      let hit = 0;
      let ip1 = 0;
      for (let ii = k; ii <= lm1; ii++) if (nz(ii, j)) {
        hit = ii;
        ip1 = ii + 1;
        break;
      }
      if (hit === 0) i = l;
      else {
        let two = false;
        for (let ii = ip1; ii <= l; ii++) if (nz(ii, j)) {
          two = true;
          break;
        }
        if (two) continue;
        i = ip1 - 1;
      }
      swap(i, j, k);
      k++;
      continue colsearch;
    }
    break;
  }
  return { ilo: k, ihi: l, lscale, rscale };
}

/** dgeqr2 on the m × n matrix x (one-based). Returns tau. */
function dgeqr2(x: M, m: number, n: number): number[] {
  const tau = new Array<number>(Math.min(m, n) + 2).fill(0);
  const k = Math.min(m, n);
  for (let i = 1; i <= k; i++) {
    const tail: number[] = [];
    for (let r = i + 1; r <= m; r++) tail.push(x[r]![i]!);
    const { beta, tau: t } = dlarfg(x[i]![i]!, tail);
    for (let r = i + 1; r <= m; r++) x[r]![i] = tail[r - i - 1]!;
    x[i]![i] = beta;
    tau[i] = t;
    if (i < n) dlarfL(x, [1, ...tail], t, i, i + 1, m - i + 1, n - i);
  }
  return tau;
}

/** dorm2r with side 'L', trans 'T': c ← Qᵀ·c, Q from the k reflectors held below the diagonal of q. c is m × n. */
function dorm2rLT(q: M, tau: number[], k: number, c: M, m: number, n: number): void {
  for (let i = 1; i <= k; i++) {
    const v = [1];
    for (let r = i + 1; r <= m; r++) v.push(q[r]![i]!);
    dlarfL(c, v, tau[i]!, i, 1, m - i + 1, n);
  }
}

/** dorg2r: forms the m × n matrix Q from k reflectors held in a. */
function dorg2r(a: M, m: number, n: number, k: number, tau: number[]): void {
  for (let j = k + 1; j <= n; j++) {
    for (let l = 1; l <= m; l++) a[l]![j] = 0;
    a[j]![j] = 1;
  }
  for (let i = k; i >= 1; i--) {
    if (i < n) {
      a[i]![i] = 1;
      const v: number[] = [];
      for (let r = i; r <= m; r++) v.push(a[r]![i]!);
      dlarfL(a, v, tau[i]!, i, i + 1, m - i + 1, n - i);
    }
    if (i < m) for (let l = i + 1; l <= m; l++) a[l]![i] = a[l]![i]! * -tau[i]!;
    a[i]![i] = 1 - tau[i]!;
    for (let l = 1; l <= i - 1; l++) a[l]![i] = 0;
  }
}

/** dgghrd on a, b (n × n). q and z are updated when given. */
function dgghrd(n: number, ilo: number, ihi: number, a: M, b: M, q: M | null, z: M | null): void {
  if (n <= 1) return;
  for (let jcol = 1; jcol <= n - 1; jcol++) for (let jrow = jcol + 1; jrow <= n; jrow++) b[jrow]![jcol] = 0;
  for (let jcol = ilo; jcol <= ihi - 2; jcol++) {
    for (let jrow = ihi; jrow >= jcol + 2; jrow--) {
      let g = dlartg(a[jrow - 1]![jcol]!, a[jrow]![jcol]!);
      a[jrow - 1]![jcol] = g.r;
      a[jrow]![jcol] = 0;
      rotRows(a, jrow - 1, jrow, jcol + 1, n - jcol, g.cs, g.sn);
      rotRows(b, jrow - 1, jrow, jrow - 1, n + 2 - jrow, g.cs, g.sn);
      if (q) rotCols(q, jrow - 1, jrow, 1, n, g.cs, g.sn);
      g = dlartg(b[jrow]![jrow]!, b[jrow]![jrow - 1]!);
      b[jrow]![jrow] = g.r;
      b[jrow]![jrow - 1] = 0;
      rotCols(a, jrow, jrow - 1, 1, ihi, g.cs, g.sn);
      rotCols(b, jrow, jrow - 1, 1, jrow - 1, g.cs, g.sn);
      if (z) rotCols(z, jrow, jrow - 1, 1, n, g.cs, g.sn);
    }
  }
}

/** dlag2 on the 2 × 2 pencil with a, b blocks at (r, r). */
function dlag2(a: M, b: M, r: number, safmin: number): { scale1: number; scale2: number; wr1: number; wr2: number; wi: number } {
  const fuzzy1 = 1 + 1e-5;
  const rtmin = Math.sqrt(safmin);
  const rtmax = 1 / rtmin;
  const safmax = 1 / safmin;
  const anorm = Math.max(Math.abs(a[r]![r]!) + Math.abs(a[r + 1]![r]!), Math.abs(a[r]![r + 1]!) + Math.abs(a[r + 1]![r + 1]!), safmin);
  const ascale = 1 / anorm;
  const a11 = ascale * a[r]![r]!;
  const a21 = ascale * a[r + 1]![r]!;
  const a12 = ascale * a[r]![r + 1]!;
  const a22 = ascale * a[r + 1]![r + 1]!;
  let b11 = b[r]![r]!;
  let b12 = b[r]![r + 1]!;
  let b22 = b[r + 1]![r + 1]!;
  const bmin = rtmin * Math.max(Math.abs(b11), Math.abs(b12), Math.abs(b22), rtmin);
  if (Math.abs(b11) < bmin) b11 = sign(bmin, b11);
  if (Math.abs(b22) < bmin) b22 = sign(bmin, b22);
  const bnorm = Math.max(Math.abs(b11), Math.abs(b12) + Math.abs(b22), safmin);
  const bsize = Math.max(Math.abs(b11), Math.abs(b22));
  const bscale = 1 / bsize;
  b11 *= bscale;
  b12 *= bscale;
  b22 *= bscale;
  const binv11 = 1 / b11;
  const binv22 = 1 / b22;
  const s1 = a11 * binv11;
  const s2 = a22 * binv22;
  let as12: number;
  let ss: number;
  let abi22: number;
  let pp: number;
  let shift: number;
  if (Math.abs(s1) <= Math.abs(s2)) {
    as12 = a12 - s1 * b12;
    const as22 = a22 - s1 * b22;
    ss = a21 * (binv11 * binv22);
    abi22 = as22 * binv22 - ss * b12;
    pp = 0.5 * abi22;
    shift = s1;
  } else {
    as12 = a12 - s2 * b12;
    const as11 = a11 - s2 * b11;
    ss = a21 * (binv11 * binv22);
    abi22 = -ss * b12;
    pp = 0.5 * (as11 * binv11 + abi22);
    shift = s2;
  }
  const qq = ss * as12;
  let discr: number;
  let rr: number;
  if (Math.abs(pp * rtmin) >= 1) {
    discr = (rtmin * pp) ** 2 + qq * safmin;
    rr = Math.sqrt(Math.abs(discr)) * rtmax;
  } else if (pp ** 2 + Math.abs(qq) <= safmin) {
    discr = (rtmax * pp) ** 2 + qq * safmax;
    rr = Math.sqrt(Math.abs(discr)) * rtmin;
  } else {
    discr = pp ** 2 + qq;
    rr = Math.sqrt(Math.abs(discr));
  }
  let wr1: number;
  let wr2: number;
  let wi: number;
  if (discr >= 0 || rr === 0) {
    const sum = pp + sign(rr, pp);
    const diff = pp - sign(rr, pp);
    const wbig = shift + sum;
    let wsmall = shift + diff;
    if (0.5 * Math.abs(wbig) > Math.max(Math.abs(wsmall), safmin)) {
      const wdet = (a11 * a22 - a12 * a21) * (binv11 * binv22);
      wsmall = wdet / wbig;
    }
    if (pp > abi22) {
      wr1 = Math.min(wbig, wsmall);
      wr2 = Math.max(wbig, wsmall);
    } else {
      wr1 = Math.max(wbig, wsmall);
      wr2 = Math.min(wbig, wsmall);
    }
    wi = 0;
  } else {
    wr1 = shift + pp;
    wr2 = wr1;
    wi = rr;
  }
  const c1 = bsize * (safmin * Math.max(1, ascale));
  const c2 = safmin * Math.max(1, bnorm);
  const c3 = bsize * safmin;
  const c4 = ascale <= 1 && bsize <= 1 ? Math.min(1, (ascale / safmin) * bsize) : 1;
  const c5 = ascale <= 1 || bsize <= 1 ? Math.min(1, ascale * bsize) : 1;
  const wabs = Math.abs(wr1) + Math.abs(wi);
  let wsize = Math.max(safmin, c1, fuzzy1 * (wabs * c2 + c3), Math.min(c4, 0.5 * Math.max(wabs, c5)));
  let scale1: number;
  let scale2 = 0;
  if (wsize !== 1) {
    const wscale = 1 / wsize;
    if (wsize > 1) scale1 = (Math.max(ascale, bsize) * wscale) * Math.min(ascale, bsize);
    else scale1 = (Math.min(ascale, bsize) * wscale) * Math.max(ascale, bsize);
    wr1 *= wscale;
    if (wi !== 0) {
      wi *= wscale;
      wr2 = wr1;
      scale2 = scale1;
    }
  } else {
    scale1 = ascale * bsize;
    scale2 = scale1;
  }
  if (wi === 0) {
    wsize = Math.max(safmin, c1, fuzzy1 * (Math.abs(wr2) * c2 + c3), Math.min(c4, 0.5 * Math.max(Math.abs(wr2), c5)));
    if (wsize !== 1) {
      const wscale = 1 / wsize;
      if (wsize > 1) scale2 = (Math.max(ascale, bsize) * wscale) * Math.min(ascale, bsize);
      else scale2 = (Math.min(ascale, bsize) * wscale) * Math.max(ascale, bsize);
      wr2 *= wscale;
    } else scale2 = ascale * bsize;
  }
  return { scale1, scale2, wr1, wr2, wi };
}

/** dlasv2: SVD of the triangular (f g; 0 h). Returns (ssmin, ssmax, snr, csr, snl, csl). */
function dlasv2(f: number, g: number, h: number): { ssmin: number; ssmax: number; snr: number; csr: number; snl: number; csl: number } {
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
      } else t = (m / (s + t) + m / (r + l)) * (1 + a);
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

/** dlassq folded over the columns of the upper Hessenberg block (rows and columns lo..lo+n-1): dlanhs('F'). */
function dlanhsF(a: M, lo: number, n: number): number {
  let scale = 0;
  let sum = 1;
  for (let j = 1; j <= n; j++) {
    const cnt = Math.min(n, j + 1);
    for (let i = 1; i <= cnt; i++) {
      const v = a[lo + i - 1]![lo + j - 1]!;
      if (v !== 0) {
        const absxi = Math.abs(v);
        if (scale < absxi) {
          sum = 1 + sum * (scale / absxi) ** 2;
          scale = absxi;
        } else sum += (absxi / scale) ** 2;
      }
    }
  }
  return n === 0 ? 0 : scale * Math.sqrt(sum);
}

/**
 * dhgeqz: the QZ iteration on the Hessenberg-triangular pencil (a, b), ilo..ihi. Leaves the (quasi-)Schur form in
 * a and b when schur, accumulates into q and z when given, and fills alphar, alphai and beta. Returns info.
 * Fortran's GO TOs become the `pc` state machine: the labels 70, 80, 110 and 200 of the source.
 */
function dhgeqz(
  schur: boolean,
  n: number,
  ilo: number,
  ihi: number,
  a: M,
  b: M,
  alphar: number[],
  alphai: number[],
  beta: number[],
  q: M | null,
  z: M | null,
): number {
  const safety = 100;
  if (n <= 0) return 0;
  const inn = ihi + 1 - ilo;
  const safmin = SAFMIN;
  const safmax = 1 / safmin;
  const anorm = dlanhsF(a, ilo, inn);
  const bnorm = dlanhsF(b, ilo, inn);
  const atol = Math.max(safmin, ULP * anorm);
  const btol = Math.max(safmin, ULP * bnorm);
  const ascale = 1 / Math.max(safmin, anorm);
  const bscale = 1 / Math.max(safmin, bnorm);
  const flip = (j: number, upto: number): void => {
    // Negate column j: rows 1..upto of a and b when schur, else just the diagonal; z always.
    if (schur) {
      for (let jr = 1; jr <= upto; jr++) {
        a[jr]![j] = -a[jr]![j]!;
        b[jr]![j] = -b[jr]![j]!;
      }
    } else {
      a[j]![j] = -a[j]![j]!;
      b[j]![j] = -b[j]![j]!;
    }
    if (z) for (let jr = 1; jr <= n; jr++) z[jr]![j] = -z[jr]![j]!;
  };
  for (let j = ihi + 1; j <= n; j++) {
    if (b[j]![j]! < 0) flip(j, j);
    alphar[j] = a[j]![j]!;
    alphai[j] = 0;
    beta[j] = b[j]![j]!;
  }
  const finish = (): number => {
    for (let j = 1; j <= ilo - 1; j++) {
      if (b[j]![j]! < 0) flip(j, j);
      alphar[j] = a[j]![j]!;
      alphai[j] = 0;
      beta[j] = b[j]![j]!;
    }
    return 0;
  };
  if (ihi < ilo) return finish();
  let ilast = ihi;
  let ifrstm: number;
  let ilastm: number;
  if (schur) {
    ifrstm = 1;
    ilastm = n;
  } else {
    ifrstm = ilo;
    ilastm = ihi;
  }
  let iiter = 0;
  let eshift = 0;
  const maxit = 30 * (ihi - ilo + 1);
  let ifirst = 0;
  let c = 0;
  let s = 0;
  for (let jiter = 1; jiter <= maxit; jiter++) {
    let pc: 'top' | 'l70' | 'l80' | 'l110' | 'l200' | 'next' = 'top';
    // Set by label 110 for label 200.
    let wr = 0;
    let wi = 0;
    let s1 = 0;
    for (;;) {
      if (pc === 'top') {
        if (ilast === ilo) pc = 'l80';
        else if (Math.abs(a[ilast]![ilast - 1]!) <= atol) {
          a[ilast]![ilast - 1] = 0;
          pc = 'l80';
        } else if (Math.abs(b[ilast]![ilast]!) <= btol) {
          b[ilast]![ilast] = 0;
          pc = 'l70';
        } else {
          let resolved = false;
          for (let j = ilast - 1; j >= ilo; j--) {
            let ilazro: boolean;
            if (j === ilo) ilazro = true;
            else if (Math.abs(a[j]![j - 1]!) <= atol) {
              a[j]![j - 1] = 0;
              ilazro = true;
            } else ilazro = false;
            if (Math.abs(b[j]![j]!) < btol) {
              b[j]![j] = 0;
              let ilazr2 = false;
              if (!ilazro) {
                let temp = Math.abs(a[j]![j - 1]!);
                let temp2 = Math.abs(a[j]![j]!);
                const tempr = Math.max(temp, temp2);
                if (tempr < 1 && tempr !== 0) {
                  temp /= tempr;
                  temp2 /= tempr;
                }
                if (temp * (ascale * Math.abs(a[j + 1]![j]!)) <= temp2 * (ascale * atol)) ilazr2 = true;
              }
              if (ilazro || ilazr2) {
                pc = 'l70';
                for (let jch = j; jch <= ilast - 1; jch++) {
                  const g = dlartg(a[jch]![jch]!, a[jch + 1]![jch]!);
                  c = g.cs;
                  s = g.sn;
                  a[jch]![jch] = g.r;
                  a[jch + 1]![jch] = 0;
                  rotRows(a, jch, jch + 1, jch + 1, ilastm - jch, c, s);
                  rotRows(b, jch, jch + 1, jch + 1, ilastm - jch, c, s);
                  if (q) rotCols(q, jch, jch + 1, 1, n, c, s);
                  if (ilazr2) a[jch]![jch - 1] = a[jch]![jch - 1]! * c;
                  ilazr2 = false;
                  if (Math.abs(b[jch + 1]![jch + 1]!) >= btol) {
                    if (jch + 1 >= ilast) pc = 'l80';
                    else {
                      ifirst = jch + 1;
                      pc = 'l110';
                    }
                    break;
                  }
                  b[jch + 1]![jch + 1] = 0;
                }
              } else {
                for (let jch = j; jch <= ilast - 1; jch++) {
                  let g = dlartg(b[jch]![jch + 1]!, b[jch + 1]![jch + 1]!);
                  c = g.cs;
                  s = g.sn;
                  b[jch]![jch + 1] = g.r;
                  b[jch + 1]![jch + 1] = 0;
                  if (jch < ilastm - 1) rotRows(b, jch, jch + 1, jch + 2, ilastm - jch - 1, c, s);
                  rotRows(a, jch, jch + 1, jch - 1, ilastm - jch + 2, c, s);
                  if (q) rotCols(q, jch, jch + 1, 1, n, c, s);
                  g = dlartg(a[jch + 1]![jch]!, a[jch + 1]![jch - 1]!);
                  c = g.cs;
                  s = g.sn;
                  a[jch + 1]![jch] = g.r;
                  a[jch + 1]![jch - 1] = 0;
                  rotCols(a, jch, jch - 1, ifrstm, jch + 1 - ifrstm, c, s);
                  rotCols(b, jch, jch - 1, ifrstm, jch - ifrstm, c, s);
                  if (z) rotCols(z, jch, jch - 1, 1, n, c, s);
                }
                pc = 'l70';
              }
              resolved = true;
              break;
            } else if (ilazro) {
              ifirst = j;
              pc = 'l110';
              resolved = true;
              break;
            }
          }
          if (!resolved) return n + 1;
        }
      } else if (pc === 'l70') {
        const g = dlartg(a[ilast]![ilast]!, a[ilast]![ilast - 1]!);
        c = g.cs;
        s = g.sn;
        a[ilast]![ilast] = g.r;
        a[ilast]![ilast - 1] = 0;
        rotCols(a, ilast, ilast - 1, ifrstm, ilast - ifrstm, c, s);
        rotCols(b, ilast, ilast - 1, ifrstm, ilast - ifrstm, c, s);
        if (z) rotCols(z, ilast, ilast - 1, 1, n, c, s);
        pc = 'l80';
      } else if (pc === 'l80') {
        if (b[ilast]![ilast]! < 0) {
          if (schur) {
            for (let j = ifrstm; j <= ilast; j++) {
              a[j]![ilast] = -a[j]![ilast]!;
              b[j]![ilast] = -b[j]![ilast]!;
            }
          } else {
            a[ilast]![ilast] = -a[ilast]![ilast]!;
            b[ilast]![ilast] = -b[ilast]![ilast]!;
          }
          if (z) for (let j = 1; j <= n; j++) z[j]![ilast] = -z[j]![ilast]!;
        }
        alphar[ilast] = a[ilast]![ilast]!;
        alphai[ilast] = 0;
        beta[ilast] = b[ilast]![ilast]!;
        ilast--;
        if (ilast < ilo) return finish();
        iiter = 0;
        eshift = 0;
        if (!schur) {
          ilastm = ilast;
          if (ifrstm > ilast) ifrstm = ilo;
        }
        pc = 'next';
      } else if (pc === 'l110') {
        iiter++;
        if (!schur) ifrstm = ifirst;
        let shift2 = false;
        if (Math.trunc(iiter / 10) * 10 === iiter) {
          if (maxit * safmin * Math.abs(a[ilast - 1]![ilast]!) < Math.abs(b[ilast - 1]![ilast - 1]!)) {
            eshift += a[ilast - 1]![ilast]! / b[ilast - 1]![ilast - 1]!;
          } else eshift += 1 / (safmin * maxit);
          s1 = 1;
          wr = eshift;
        } else {
          const g = dlag2(a, b, ilast - 1, safmin * safety);
          s1 = g.scale1;
          wr = g.wr1;
          wi = g.wi;
          if (wi !== 0) shift2 = true;
        }
        if (shift2) {
          pc = 'l200';
          continue;
        }
        let temp = Math.min(ascale, 1) * (0.5 * safmax);
        let scale = s1 > temp ? temp / s1 : 1;
        temp = Math.min(bscale, 1) * (0.5 * safmax);
        if (Math.abs(wr) > temp) scale = Math.min(scale, temp / Math.abs(wr));
        s1 = scale * s1;
        wr = scale * wr;
        let istart = ifirst;
        for (let j = ilast - 1; j >= ifirst + 1; j--) {
          istart = j;
          let t1 = Math.abs(s1 * a[j]![j - 1]!);
          let t2 = Math.abs(s1 * a[j]![j]! - wr * b[j]![j]!);
          const tempr = Math.max(t1, t2);
          if (tempr < 1 && tempr !== 0) {
            t1 /= tempr;
            t2 /= tempr;
          }
          if (Math.abs(ascale * a[j + 1]![j]! * t1) <= ascale * atol * t2) break;
          if (j === ifirst + 1) istart = ifirst;
        }
        {
          const t1 = s1 * a[istart]![istart]! - wr * b[istart]![istart]!;
          const t2 = s1 * a[istart + 1]![istart]!;
          const g = dlartg(t1, t2);
          c = g.cs;
          s = g.sn;
        }
        for (let j = istart; j <= ilast - 1; j++) {
          if (j > istart) {
            const g = dlartg(a[j]![j - 1]!, a[j + 1]![j - 1]!);
            c = g.cs;
            s = g.sn;
            a[j]![j - 1] = g.r;
            a[j + 1]![j - 1] = 0;
          }
          for (let jc = j; jc <= ilastm; jc++) {
            const t1 = c * a[j]![jc]! + s * a[j + 1]![jc]!;
            a[j + 1]![jc] = -s * a[j]![jc]! + c * a[j + 1]![jc]!;
            a[j]![jc] = t1;
            const t2 = c * b[j]![jc]! + s * b[j + 1]![jc]!;
            b[j + 1]![jc] = -s * b[j]![jc]! + c * b[j + 1]![jc]!;
            b[j]![jc] = t2;
          }
          if (q) {
            for (let jr = 1; jr <= n; jr++) {
              const t1 = c * q[jr]![j]! + s * q[jr]![j + 1]!;
              q[jr]![j + 1] = -s * q[jr]![j]! + c * q[jr]![j + 1]!;
              q[jr]![j] = t1;
            }
          }
          const g = dlartg(b[j + 1]![j + 1]!, b[j + 1]![j]!);
          c = g.cs;
          s = g.sn;
          b[j + 1]![j + 1] = g.r;
          b[j + 1]![j] = 0;
          for (let jr = ifrstm; jr <= Math.min(j + 2, ilast); jr++) {
            const t1 = c * a[jr]![j + 1]! + s * a[jr]![j]!;
            a[jr]![j] = -s * a[jr]![j + 1]! + c * a[jr]![j]!;
            a[jr]![j + 1] = t1;
          }
          for (let jr = ifrstm; jr <= j; jr++) {
            const t1 = c * b[jr]![j + 1]! + s * b[jr]![j]!;
            b[jr]![j] = -s * b[jr]![j + 1]! + c * b[jr]![j]!;
            b[jr]![j + 1] = t1;
          }
          if (z) {
            for (let jr = 1; jr <= n; jr++) {
              const t1 = c * z[jr]![j + 1]! + s * z[jr]![j]!;
              z[jr]![j] = -s * z[jr]![j + 1]! + c * z[jr]![j]!;
              z[jr]![j + 1] = t1;
            }
          }
        }
        pc = 'next';
      } else if (pc === 'l200') {
        if (ifirst + 1 === ilast) {
          const sv = dlasv2(b[ilast - 1]![ilast - 1]!, b[ilast - 1]![ilast]!, b[ilast]![ilast]!);
          let b22 = sv.ssmin;
          let b11 = sv.ssmax;
          let sr = sv.snr;
          let cr = sv.csr;
          const sl = sv.snl;
          const cl = sv.csl;
          if (b11 < 0) {
            cr = -cr;
            sr = -sr;
            b11 = -b11;
            b22 = -b22;
          }
          rotRows(a, ilast - 1, ilast, ilast - 1, ilastm + 1 - ifirst, cl, sl);
          rotCols(a, ilast - 1, ilast, ifrstm, ilast + 1 - ifrstm, cr, sr);
          if (ilast < ilastm) rotRows(b, ilast - 1, ilast, ilast + 1, ilastm - ilast, cl, sl);
          if (ifrstm < ilast - 1) rotCols(b, ilast - 1, ilast, ifrstm, ifirst - ifrstm, cr, sr);
          if (q) rotCols(q, ilast - 1, ilast, 1, n, cl, sl);
          if (z) rotCols(z, ilast - 1, ilast, 1, n, cr, sr);
          b[ilast - 1]![ilast - 1] = b11;
          b[ilast - 1]![ilast] = 0;
          b[ilast]![ilast - 1] = 0;
          b[ilast]![ilast] = b22;
          if (b22 < 0) {
            for (let j = ifrstm; j <= ilast; j++) {
              a[j]![ilast] = -a[j]![ilast]!;
              b[j]![ilast] = -b[j]![ilast]!;
            }
            if (z) for (let j = 1; j <= n; j++) z[j]![ilast] = -z[j]![ilast]!;
          }
          const g = dlag2(a, b, ilast - 1, safmin * safety);
          s1 = g.scale1;
          wr = g.wr1;
          wi = g.wi;
          if (wi !== 0) {
            const s1inv = 1 / s1;
            const a11 = a[ilast - 1]![ilast - 1]!;
            const a21 = a[ilast]![ilast - 1]!;
            const a12 = a[ilast - 1]![ilast]!;
            const a22 = a[ilast]![ilast]!;
            const c11r = s1 * a11 - wr * b11;
            const c11i = -wi * b11;
            const c12 = s1 * a12;
            const c21 = s1 * a21;
            const c22r = s1 * a22 - wr * b22;
            const c22i = -wi * b22;
            let cz: number;
            let szr: number;
            let szi: number;
            let t: number;
            if (Math.abs(c11r) + Math.abs(c11i) + Math.abs(c12) > Math.abs(c21) + Math.abs(c22r) + Math.abs(c22i)) {
              t = dlapy3(c12, c11r, c11i);
              cz = c12 / t;
              szr = -c11r / t;
              szi = -c11i / t;
            } else {
              cz = dlapy2(c22r, c22i);
              if (cz <= safmin) {
                cz = 0;
                szr = 1;
                szi = 0;
              } else {
                const tempr = c22r / cz;
                const tempi = c22i / cz;
                t = dlapy2(cz, c21);
                cz = cz / t;
                szr = (-c21 * tempr) / t;
                szi = (c21 * tempi) / t;
              }
            }
            const an = Math.abs(a11) + Math.abs(a12) + Math.abs(a21) + Math.abs(a22);
            const bn = Math.abs(b11) + Math.abs(b22);
            const wabs = Math.abs(wr) + Math.abs(wi);
            let cq: number;
            let sqr: number;
            let sqi: number;
            if (s1 * an > wabs * bn) {
              cq = cz * b11;
              sqr = szr * b22;
              sqi = -szi * b22;
            } else {
              const a1r = cz * a11 + szr * a12;
              const a1i = szi * a12;
              const a2r = cz * a21 + szr * a22;
              const a2i = szi * a22;
              cq = dlapy2(a1r, a1i);
              if (cq <= safmin) {
                cq = 0;
                sqr = 1;
                sqi = 0;
              } else {
                const tempr = a1r / cq;
                const tempi = a1i / cq;
                sqr = tempr * a2r + tempi * a2i;
                sqi = tempi * a2r - tempr * a2i;
              }
            }
            t = dlapy3(cq, sqr, sqi);
            cq /= t;
            sqr /= t;
            sqi /= t;
            const tempr = sqr * szr - sqi * szi;
            const tempi = sqr * szi + sqi * szr;
            const b1r = cq * cz * b11 + tempr * b22;
            const b1i = tempi * b22;
            const b1a = dlapy2(b1r, b1i);
            const b2r = cq * cz * b22 + tempr * b11;
            const b2i = -tempi * b11;
            const b2a = dlapy2(b2r, b2i);
            beta[ilast - 1] = b1a;
            beta[ilast] = b2a;
            alphar[ilast - 1] = (wr * b1a) * s1inv;
            alphai[ilast - 1] = (wi * b1a) * s1inv;
            alphar[ilast] = (wr * b2a) * s1inv;
            alphai[ilast] = -((wi * b2a) * s1inv);
            ilast = ifirst - 1;
            if (ilast < ilo) return finish();
            iiter = 0;
            eshift = 0;
            if (!schur) {
              ilastm = ilast;
              if (ifrstm > ilast) ifrstm = ilo;
            }
          } else {
            // Real eigenvalues after all: label 350 with the 2 x 2 block standardized but ilast unchanged.
          }
          pc = 'next';
        } else {
          const ad11 = (ascale * a[ilast - 1]![ilast - 1]!) / (bscale * b[ilast - 1]![ilast - 1]!);
          const ad21 = (ascale * a[ilast]![ilast - 1]!) / (bscale * b[ilast - 1]![ilast - 1]!);
          const ad12 = (ascale * a[ilast - 1]![ilast]!) / (bscale * b[ilast]![ilast]!);
          const ad22 = (ascale * a[ilast]![ilast]!) / (bscale * b[ilast]![ilast]!);
          const u12 = b[ilast - 1]![ilast]! / b[ilast]![ilast]!;
          const ad11l = (ascale * a[ifirst]![ifirst]!) / (bscale * b[ifirst]![ifirst]!);
          const ad21l = (ascale * a[ifirst + 1]![ifirst]!) / (bscale * b[ifirst]![ifirst]!);
          const ad12l = (ascale * a[ifirst]![ifirst + 1]!) / (bscale * b[ifirst + 1]![ifirst + 1]!);
          const ad22l = (ascale * a[ifirst + 1]![ifirst + 1]!) / (bscale * b[ifirst + 1]![ifirst + 1]!);
          const ad32l = (ascale * a[ifirst + 2]![ifirst + 1]!) / (bscale * b[ifirst + 1]![ifirst + 1]!);
          const u12l = b[ifirst]![ifirst + 1]! / b[ifirst + 1]![ifirst + 1]!;
          const v = [0, 0, 0, 0];
          v[1] = (ad11 - ad11l) * (ad22 - ad11l) - ad12 * ad21 + ad21 * u12 * ad11l + (ad12l - ad11l * u12l) * ad21l;
          v[2] = ((ad22l - ad11l) - ad21l * u12l - (ad11 - ad11l) - (ad22 - ad11l) + ad21 * u12) * ad21l;
          v[3] = ad32l * ad21l;
          const istart = ifirst;
          const tail0 = [v[2]!, v[3]!];
          let { beta: bt, tau } = dlarfg(v[1]!, tail0);
          v[1] = bt;
          v[2] = tail0[0]!;
          v[3] = tail0[1]!;
          v[1] = 1;
          for (let j = istart; j <= ilast - 2; j++) {
            if (j > istart) {
              v[1] = a[j]![j - 1]!;
              v[2] = a[j + 1]![j - 1]!;
              v[3] = a[j + 2]![j - 1]!;
              const tl = [v[2], v[3]] as number[];
              const r = dlarfg(a[j]![j - 1]!, tl);
              a[j]![j - 1] = r.beta;
              tau = r.tau;
              v[2] = tl[0]!;
              v[3] = tl[1]!;
              v[1] = 1;
              a[j + 1]![j - 1] = 0;
              a[j + 2]![j - 1] = 0;
            }
            for (let jc = j; jc <= ilastm; jc++) {
              const temp = tau * (a[j]![jc]! + v[2]! * a[j + 1]![jc]! + v[3]! * a[j + 2]![jc]!);
              a[j]![jc] = a[j]![jc]! - temp;
              a[j + 1]![jc] = a[j + 1]![jc]! - temp * v[2]!;
              a[j + 2]![jc] = a[j + 2]![jc]! - temp * v[3]!;
              const temp2 = tau * (b[j]![jc]! + v[2]! * b[j + 1]![jc]! + v[3]! * b[j + 2]![jc]!);
              b[j]![jc] = b[j]![jc]! - temp2;
              b[j + 1]![jc] = b[j + 1]![jc]! - temp2 * v[2]!;
              b[j + 2]![jc] = b[j + 2]![jc]! - temp2 * v[3]!;
            }
            if (q) {
              for (let jr = 1; jr <= n; jr++) {
                const temp = tau * (q[jr]![j]! + v[2]! * q[jr]![j + 1]! + v[3]! * q[jr]![j + 2]!);
                q[jr]![j] = q[jr]![j]! - temp;
                q[jr]![j + 1] = q[jr]![j + 1]! - temp * v[2]!;
                q[jr]![j + 2] = q[jr]![j + 2]! - temp * v[3]!;
              }
            }
            let ilpivt = false;
            let temp = Math.max(Math.abs(b[j + 1]![j + 1]!), Math.abs(b[j + 1]![j + 2]!));
            let temp2 = Math.max(Math.abs(b[j + 2]![j + 1]!), Math.abs(b[j + 2]![j + 2]!));
            let scale: number;
            let u1: number;
            let u2: number;
            // The block between "IF( MAX( TEMP, TEMP2 ).LT.SAFMIN )" and label 250 of the source.
            solve: {
              if (Math.max(temp, temp2) < safmin) {
                scale = 0;
                u1 = 1;
                u2 = 0;
                break solve;
              }
              let w11: number;
              let w21: number;
              let w12: number;
              let w22: number;
              if (temp >= temp2) {
                w11 = b[j + 1]![j + 1]!;
                w21 = b[j + 2]![j + 1]!;
                w12 = b[j + 1]![j + 2]!;
                w22 = b[j + 2]![j + 2]!;
                u1 = b[j + 1]![j]!;
                u2 = b[j + 2]![j]!;
              } else {
                w21 = b[j + 1]![j + 1]!;
                w11 = b[j + 2]![j + 1]!;
                w22 = b[j + 1]![j + 2]!;
                w12 = b[j + 2]![j + 2]!;
                u2 = b[j + 1]![j]!;
                u1 = b[j + 2]![j]!;
              }
              if (Math.abs(w12) > Math.abs(w11)) {
                ilpivt = true;
                temp = w12;
                temp2 = w22;
                w12 = w11;
                w22 = w21;
                w11 = temp;
                w21 = temp2;
              }
              temp = w21 / w11;
              u2 = u2 - temp * u1;
              w22 = w22 - temp * w12;
              w21 = 0;
              scale = 1;
              if (Math.abs(w22) < safmin) {
                scale = 0;
                u2 = 1;
                u1 = -w12 / w11;
                break solve;
              }
              if (Math.abs(w22) < Math.abs(u2)) scale = Math.abs(w22 / u2);
              if (Math.abs(w11) < Math.abs(u1)) scale = Math.min(scale, Math.abs(w11 / u1));
              u2 = (scale * u2) / w22;
              u1 = (scale * u1 - w12 * u2) / w11;
            }
            if (ilpivt) {
              const tt = u2;
              u2 = u1;
              u1 = tt;
            }
            const t = Math.sqrt(scale ** 2 + u1 ** 2 + u2 ** 2);
            tau = 1 + scale / t;
            const vs = -1 / (scale + t);
            v[1] = 1;
            v[2] = vs * u1;
            v[3] = vs * u2;
            for (let jr = ifrstm; jr <= Math.min(j + 3, ilast); jr++) {
              const tp = tau * (a[jr]![j]! + v[2]! * a[jr]![j + 1]! + v[3]! * a[jr]![j + 2]!);
              a[jr]![j] = a[jr]![j]! - tp;
              a[jr]![j + 1] = a[jr]![j + 1]! - tp * v[2]!;
              a[jr]![j + 2] = a[jr]![j + 2]! - tp * v[3]!;
            }
            for (let jr = ifrstm; jr <= j + 2; jr++) {
              const tp = tau * (b[jr]![j]! + v[2]! * b[jr]![j + 1]! + v[3]! * b[jr]![j + 2]!);
              b[jr]![j] = b[jr]![j]! - tp;
              b[jr]![j + 1] = b[jr]![j + 1]! - tp * v[2]!;
              b[jr]![j + 2] = b[jr]![j + 2]! - tp * v[3]!;
            }
            if (z) {
              for (let jr = 1; jr <= n; jr++) {
                const tp = tau * (z[jr]![j]! + v[2]! * z[jr]![j + 1]! + v[3]! * z[jr]![j + 2]!);
                z[jr]![j] = z[jr]![j]! - tp;
                z[jr]![j + 1] = z[jr]![j + 1]! - tp * v[2]!;
                z[jr]![j + 2] = z[jr]![j + 2]! - tp * v[3]!;
              }
            }
            b[j + 1]![j] = 0;
            b[j + 2]![j] = 0;
          }
          const j = ilast - 1;
          let g = dlartg(a[j]![j - 1]!, a[j + 1]![j - 1]!);
          c = g.cs;
          s = g.sn;
          a[j]![j - 1] = g.r;
          a[j + 1]![j - 1] = 0;
          for (let jc = j; jc <= ilastm; jc++) {
            const t1 = c * a[j]![jc]! + s * a[j + 1]![jc]!;
            a[j + 1]![jc] = -s * a[j]![jc]! + c * a[j + 1]![jc]!;
            a[j]![jc] = t1;
            const t2 = c * b[j]![jc]! + s * b[j + 1]![jc]!;
            b[j + 1]![jc] = -s * b[j]![jc]! + c * b[j + 1]![jc]!;
            b[j]![jc] = t2;
          }
          if (q) {
            for (let jr = 1; jr <= n; jr++) {
              const t1 = c * q[jr]![j]! + s * q[jr]![j + 1]!;
              q[jr]![j + 1] = -s * q[jr]![j]! + c * q[jr]![j + 1]!;
              q[jr]![j] = t1;
            }
          }
          g = dlartg(b[j + 1]![j + 1]!, b[j + 1]![j]!);
          c = g.cs;
          s = g.sn;
          b[j + 1]![j + 1] = g.r;
          b[j + 1]![j] = 0;
          for (let jr = ifrstm; jr <= ilast; jr++) {
            const t1 = c * a[jr]![j + 1]! + s * a[jr]![j]!;
            a[jr]![j] = -s * a[jr]![j + 1]! + c * a[jr]![j]!;
            a[jr]![j + 1] = t1;
          }
          for (let jr = ifrstm; jr <= ilast - 1; jr++) {
            const t1 = c * b[jr]![j + 1]! + s * b[jr]![j]!;
            b[jr]![j] = -s * b[jr]![j + 1]! + c * b[jr]![j]!;
            b[jr]![j + 1] = t1;
          }
          if (z) {
            for (let jr = 1; jr <= n; jr++) {
              const t1 = c * z[jr]![j + 1]! + s * z[jr]![j]!;
              z[jr]![j] = -s * z[jr]![j + 1]! + c * z[jr]![j]!;
              z[jr]![j + 1] = t1;
            }
          }
          pc = 'next';
        }
      }
      if (pc === 'next') break;
    }
  }
  return ilast; // no convergence
}

/** dladiv: (a + ib) / (c + id), as 3.0 (Smith's algorithm). */
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

const RSWAP = [false, false, true, false, true]; // one-based
const ZSWAP = [false, false, false, true, true];
// IPIVOT(4, 4), column-major data: IPIVOT(i, c) = IPIV[c][i]
const IPIV = [
  [],
  [0, 1, 2, 3, 4],
  [0, 2, 1, 4, 3],
  [0, 3, 4, 1, 2],
  [0, 4, 3, 2, 1],
];

/**
 * dlaln2: solves (ca·A − (wr + i·wi)·D)·X = scale·B for a 1 × 1 or 2 × 2 A (ca·A − wr·D is 2 × 2 with the diagonal
 * D = diag(d1, d2)). b and the result x are (na × nw) arrays, zero-based. `a` is the na × na block read from
 * (a[r][r]).
 */
function dlaln2(
  ltrans: boolean,
  na: number,
  nw: number,
  smin: number,
  ca: number,
  a: M,
  r: number,
  d1: number,
  d2: number,
  b: number[][],
  wr: number,
  wi: number,
): { x: number[][]; scale: number; xnorm: number } {
  const smlnum = 2 * SAFMIN;
  const bignum = 1 / smlnum;
  const smini = Math.max(smin, smlnum);
  let scale = 1;
  const x = [
    [0, 0],
    [0, 0],
  ];
  let xnorm: number;
  if (na === 1) {
    if (nw === 1) {
      let csr = ca * a[r]![r]! - wr * d1;
      let cnorm = Math.abs(csr);
      if (cnorm < smini) {
        csr = smini;
        cnorm = smini;
      }
      const bnorm = Math.abs(b[0]![0]!);
      if (cnorm < 1 && bnorm > 1) {
        if (bnorm > bignum * cnorm) scale = 1 / bnorm;
      }
      x[0]![0] = (b[0]![0]! * scale) / csr;
      xnorm = Math.abs(x[0]![0]!);
    } else {
      let csr = ca * a[r]![r]! - wr * d1;
      let csi = -wi * d1;
      let cnorm = Math.abs(csr) + Math.abs(csi);
      if (cnorm < smini) {
        csr = smini;
        csi = 0;
        cnorm = smini;
      }
      const bnorm = Math.abs(b[0]![0]!) + Math.abs(b[0]![1]!);
      if (cnorm < 1 && bnorm > 1) {
        if (bnorm > bignum * cnorm) scale = 1 / bnorm;
      }
      const [p, q] = dladiv(scale * b[0]![0]!, scale * b[0]![1]!, csr, csi);
      x[0]![0] = p;
      x[0]![1] = q;
      xnorm = Math.abs(p) + Math.abs(q);
    }
    return { x, scale, xnorm };
  }
  // CR and CI as the column-major vectors CRV and CIV (one-based): (1,1), (2,1), (1,2), (2,2).
  const crv = [0, ca * a[r]![r]! - wr * d1, 0, 0, ca * a[r + 1]![r + 1]! - wr * d2];
  if (ltrans) {
    crv[3] = ca * a[r + 1]![r]!; // CR(1,2)
    crv[2] = ca * a[r]![r + 1]!; // CR(2,1)
  } else {
    crv[2] = ca * a[r + 1]![r]!;
    crv[3] = ca * a[r]![r + 1]!;
  }
  if (nw === 1) {
    let cmax = 0;
    let icmax = 0;
    for (let j = 1; j <= 4; j++) if (Math.abs(crv[j]!) > cmax) {
      cmax = Math.abs(crv[j]!);
      icmax = j;
    }
    if (cmax < smini) {
      const bnorm = Math.max(Math.abs(b[0]![0]!), Math.abs(b[1]![0]!));
      if (smini < 1 && bnorm > 1) {
        if (bnorm > bignum * smini) scale = 1 / bnorm;
      }
      const temp = scale / smini;
      x[0]![0] = temp * b[0]![0]!;
      x[1]![0] = temp * b[1]![0]!;
      return { x, scale, xnorm: temp * bnorm };
    }
    const ur11 = crv[icmax]!;
    const cr21 = crv[IPIV[icmax]![2]!]!;
    const ur12 = crv[IPIV[icmax]![3]!]!;
    const cr22 = crv[IPIV[icmax]![4]!]!;
    const ur11r = 1 / ur11;
    const lr21 = ur11r * cr21;
    let ur22 = cr22 - ur12 * lr21;
    if (Math.abs(ur22) < smini) ur22 = smini;
    let br1: number;
    let br2: number;
    if (RSWAP[icmax]) {
      br1 = b[1]![0]!;
      br2 = b[0]![0]!;
    } else {
      br1 = b[0]![0]!;
      br2 = b[1]![0]!;
    }
    br2 = br2 - lr21 * br1;
    const bbnd = Math.max(Math.abs(br1 * (ur22 * ur11r)), Math.abs(br2));
    if (bbnd > 1 && Math.abs(ur22) < 1) {
      if (bbnd >= bignum * Math.abs(ur22)) scale = 1 / bbnd;
    }
    const xr2 = (br2 * scale) / ur22;
    const xr1 = (scale * br1) * ur11r - xr2 * (ur11r * ur12);
    if (ZSWAP[icmax]) {
      x[0]![0] = xr2;
      x[1]![0] = xr1;
    } else {
      x[0]![0] = xr1;
      x[1]![0] = xr2;
    }
    xnorm = Math.max(Math.abs(xr1), Math.abs(xr2));
    if (xnorm > 1 && cmax > 1) {
      if (xnorm > bignum / cmax) {
        const temp = cmax / bignum;
        x[0]![0] = temp * x[0]![0]!;
        x[1]![0] = temp * x[1]![0]!;
        xnorm = temp * xnorm;
        scale = temp * scale;
      }
    }
    return { x, scale, xnorm };
  }
  const civ = [0, -wi * d1, 0, 0, -wi * d2];
  let cmax = 0;
  let icmax = 0;
  for (let j = 1; j <= 4; j++) if (Math.abs(crv[j]!) + Math.abs(civ[j]!) > cmax) {
    cmax = Math.abs(crv[j]!) + Math.abs(civ[j]!);
    icmax = j;
  }
  if (cmax < smini) {
    const bnorm = Math.max(Math.abs(b[0]![0]!) + Math.abs(b[0]![1]!), Math.abs(b[1]![0]!) + Math.abs(b[1]![1]!));
    if (smini < 1 && bnorm > 1) {
      if (bnorm > bignum * smini) scale = 1 / bnorm;
    }
    const temp = scale / smini;
    x[0]![0] = temp * b[0]![0]!;
    x[1]![0] = temp * b[1]![0]!;
    x[0]![1] = temp * b[0]![1]!;
    x[1]![1] = temp * b[1]![1]!;
    return { x, scale, xnorm: temp * bnorm };
  }
  const ur11 = crv[icmax]!;
  const ui11 = civ[icmax]!;
  const cr21 = crv[IPIV[icmax]![2]!]!;
  const ci21 = civ[IPIV[icmax]![2]!]!;
  const ur12 = crv[IPIV[icmax]![3]!]!;
  const ui12 = civ[IPIV[icmax]![3]!]!;
  const cr22 = crv[IPIV[icmax]![4]!]!;
  const ci22 = civ[IPIV[icmax]![4]!]!;
  let ur11r: number;
  let ui11r: number;
  let lr21: number;
  let li21: number;
  let ur12s: number;
  let ui12s: number;
  let ur22: number;
  let ui22: number;
  if (icmax === 1 || icmax === 4) {
    if (Math.abs(ur11) > Math.abs(ui11)) {
      const temp = ui11 / ur11;
      ur11r = 1 / (ur11 * (1 + temp ** 2));
      ui11r = -temp * ur11r;
    } else {
      const temp = ur11 / ui11;
      ui11r = -1 / (ui11 * (1 + temp ** 2));
      ur11r = -temp * ui11r;
    }
    lr21 = cr21 * ur11r;
    li21 = cr21 * ui11r;
    ur12s = ur12 * ur11r;
    ui12s = ur12 * ui11r;
    ur22 = cr22 - ur12 * lr21;
    ui22 = ci22 - ur12 * li21;
  } else {
    ur11r = 1 / ur11;
    ui11r = 0;
    lr21 = cr21 * ur11r;
    li21 = ci21 * ur11r;
    ur12s = ur12 * ur11r;
    ui12s = ui12 * ur11r;
    ur22 = cr22 - ur12 * lr21 + ui12 * li21;
    ui22 = -ur12 * li21 - ui12 * lr21;
  }
  const u22abs = Math.abs(ur22) + Math.abs(ui22);
  if (u22abs < smini) {
    ur22 = smini;
    ui22 = 0;
  }
  let br1: number;
  let br2: number;
  let bi1: number;
  let bi2: number;
  if (RSWAP[icmax]) {
    br2 = b[0]![0]!;
    br1 = b[1]![0]!;
    bi2 = b[0]![1]!;
    bi1 = b[1]![1]!;
  } else {
    br1 = b[0]![0]!;
    br2 = b[1]![0]!;
    bi1 = b[0]![1]!;
    bi2 = b[1]![1]!;
  }
  br2 = br2 - lr21 * br1 + li21 * bi1;
  bi2 = bi2 - li21 * br1 - lr21 * bi1;
  const bbnd = Math.max((Math.abs(br1) + Math.abs(bi1)) * (u22abs * (Math.abs(ur11r) + Math.abs(ui11r))), Math.abs(br2) + Math.abs(bi2));
  if (bbnd > 1 && u22abs < 1) {
    if (bbnd >= bignum * u22abs) {
      scale = 1 / bbnd;
      br1 = scale * br1;
      bi1 = scale * bi1;
      br2 = scale * br2;
      bi2 = scale * bi2;
    }
  }
  const [xr2, xi2] = dladiv(br2, bi2, ur22, ui22);
  const xr1 = ur11r * br1 - ui11r * bi1 - ur12s * xr2 + ui12s * xi2;
  const xi1 = ui11r * br1 + ur11r * bi1 - ui12s * xr2 - ur12s * xi2;
  if (ZSWAP[icmax]) {
    x[0]![0] = xr2;
    x[1]![0] = xr1;
    x[0]![1] = xi2;
    x[1]![1] = xi1;
  } else {
    x[0]![0] = xr1;
    x[1]![0] = xr2;
    x[0]![1] = xi1;
    x[1]![1] = xi2;
  }
  xnorm = Math.max(Math.abs(xr1) + Math.abs(xi1), Math.abs(xr2) + Math.abs(xi2));
  if (xnorm > 1 && cmax > 1) {
    if (xnorm > bignum / cmax) {
      const temp = cmax / bignum;
      x[0]![0] = temp * x[0]![0]!;
      x[1]![0] = temp * x[1]![0]!;
      x[0]![1] = temp * x[0]![1]!;
      x[1]![1] = temp * x[1]![1]!;
      xnorm = temp * xnorm;
      scale = temp * scale;
    }
  }
  return { x, scale, xnorm };
}

/**
 * dtgevc with howmny 'B': the eigenvectors of the quasi-triangular pencil (a, b), multiplied into vl and/or vr
 * (which hold the Schur vectors q and z) and scaled so the largest |re| + |im| is 1. Returns info.
 */
function dtgevc(n: number, a: M, b: M, vl: M | null, vr: M | null): number {
  const safmin = SAFMIN;
  const ulp = ULP;
  const small = (safmin * n) / ulp;
  const big0 = 1 / small;
  const bignum = 1 / (safmin * n);
  const safety = 100;
  const w = new Array<number>(8 * n + 8).fill(0);
  let anorm = Math.abs(a[1]![1]!);
  if (n > 1) anorm += Math.abs(a[2]![1]!);
  let bnorm = Math.abs(b[1]![1]!);
  w[1] = 0;
  w[n + 1] = 0;
  for (let j = 2; j <= n; j++) {
    let temp = 0;
    let temp2 = 0;
    const iend = a[j]![j - 1] === 0 ? j - 1 : j - 2;
    for (let i = 1; i <= iend; i++) {
      temp += Math.abs(a[i]![j]!);
      temp2 += Math.abs(b[i]![j]!);
    }
    w[j] = temp;
    w[n + j] = temp2;
    for (let i = iend + 1; i <= Math.min(j + 1, n); i++) {
      temp += Math.abs(a[i]![j]!);
      temp2 += Math.abs(b[i]![j]!);
    }
    anorm = Math.max(anorm, temp);
    bnorm = Math.max(bnorm, temp2);
  }
  const ascale = 1 / Math.max(anorm, safmin);
  const bscale = 1 / Math.max(bnorm, safmin);
  /** The scalar (real) eigenvalue coefficients shared by both sides. */
  const realCoefs = (je: number): { acoef: number; bcoefr: number } => {
    const temp = 1 / Math.max(Math.abs(a[je]![je]!) * ascale, Math.abs(b[je]![je]!) * bscale, safmin);
    const salfar = temp * a[je]![je]! * ascale;
    const sbeta = temp * b[je]![je]! * bscale;
    let acoef = sbeta * ascale;
    let bcoefr = salfar * bscale;
    let scale = 1;
    const lsa = Math.abs(sbeta) >= safmin && Math.abs(acoef) < small;
    const lsb = Math.abs(salfar) >= safmin && Math.abs(bcoefr) < small;
    if (lsa) scale = (small / Math.abs(sbeta)) * Math.min(anorm, big0);
    if (lsb) scale = Math.max(scale, (small / Math.abs(salfar)) * Math.min(bnorm, big0));
    if (lsa || lsb) {
      scale = Math.min(scale, 1 / (safmin * Math.max(1, Math.abs(acoef), Math.abs(bcoefr))));
      acoef = lsa ? ascale * (scale * sbeta) : scale * acoef;
      bcoefr = lsb ? bscale * (scale * salfar) : scale * bcoefr;
    }
    return { acoef, bcoefr };
  };
  /** The complex pair's coefficients from dlag2, rescaled; null when dlag2 finds real eigenvalues (info). */
  const pairCoefs = (j0: number, negate: boolean): { acoef: number; bcoefr: number; bcoefi: number; acoefa: number; bcoefa: number } | null => {
    const g = dlag2(a, b, j0, safmin * safety);
    let acoef = g.scale1;
    let bcoefr = g.wr1;
    let bcoefi = negate ? -g.wi : g.wi;
    if (bcoefi === 0) return null;
    let acoefa = Math.abs(acoef);
    let bcoefa = Math.abs(bcoefr) + Math.abs(bcoefi);
    let scale = 1;
    if (acoefa * ulp < safmin && acoefa >= safmin) scale = safmin / ulp / acoefa;
    if (bcoefa * ulp < safmin && bcoefa >= safmin) scale = Math.max(scale, safmin / ulp / bcoefa);
    if (safmin * acoefa > ascale) scale = ascale / (safmin * acoefa);
    if (safmin * bcoefa > bscale) scale = Math.min(scale, bscale / (safmin * bcoefa));
    if (scale !== 1) {
      acoef = scale * acoef;
      acoefa = Math.abs(acoef);
      bcoefr = scale * bcoefr;
      bcoefi = scale * bcoefi;
      bcoefa = Math.abs(bcoefr) + Math.abs(bcoefi);
    }
    return { acoef, bcoefr, bcoefi, acoefa, bcoefa };
  };

  if (vl) {
    let ieig = 0;
    let ilcplx = false;
    for (let je = 1; je <= n; je++) {
      if (ilcplx) {
        ilcplx = false;
        continue;
      }
      let nw = 1;
      if (je < n && a[je + 1]![je] !== 0) {
        ilcplx = true;
        nw = 2;
      }
      if (!ilcplx && Math.abs(a[je]![je]!) <= safmin && Math.abs(b[je]![je]!) <= safmin) {
        ieig++;
        for (let jr = 1; jr <= n; jr++) vl[jr]![ieig] = 0;
        vl[ieig]![ieig] = 1;
        continue;
      }
      for (let jr = 1; jr <= nw * n; jr++) w[2 * n + jr] = 0;
      let acoef: number;
      let bcoefr: number;
      let bcoefi = 0;
      let acoefa: number;
      let bcoefa: number;
      let xmax: number;
      if (!ilcplx) {
        ({ acoef, bcoefr } = realCoefs(je));
        acoefa = Math.abs(acoef);
        bcoefa = Math.abs(bcoefr);
        w[2 * n + je] = 1;
        xmax = 1;
      } else {
        const pc = pairCoefs(je, true);
        if (!pc) return je;
        ({ acoef, bcoefr, bcoefi, acoefa, bcoefa } = pc);
        const temp = acoef * a[je + 1]![je]!;
        const temp2r = acoef * a[je]![je]! - bcoefr * b[je]![je]!;
        const temp2i = -bcoefi * b[je]![je]!;
        if (Math.abs(temp) > Math.abs(temp2r) + Math.abs(temp2i)) {
          w[2 * n + je] = 1;
          w[3 * n + je] = 0;
          w[2 * n + je + 1] = -temp2r / temp;
          w[3 * n + je + 1] = -temp2i / temp;
        } else {
          w[2 * n + je + 1] = 1;
          w[3 * n + je + 1] = 0;
          const t = acoef * a[je]![je + 1]!;
          w[2 * n + je] = (bcoefr * b[je + 1]![je + 1]! - acoef * a[je + 1]![je + 1]!) / t;
          w[3 * n + je] = (bcoefi * b[je + 1]![je + 1]!) / t;
        }
        xmax = Math.max(Math.abs(w[2 * n + je]!) + Math.abs(w[3 * n + je]!), Math.abs(w[2 * n + je + 1]!) + Math.abs(w[3 * n + je + 1]!));
      }
      const dmin = Math.max(ulp * acoefa * anorm, ulp * bcoefa * bnorm, safmin);
      let il2by2 = false;
      for (let j = je + nw; j <= n; j++) {
        if (il2by2) {
          il2by2 = false;
          continue;
        }
        let na = 1;
        const bdiag = [0, b[j]![j]!, 0];
        if (j < n && a[j + 1]![j] !== 0) {
          il2by2 = true;
          bdiag[2] = b[j + 1]![j + 1]!;
          na = 2;
        }
        const xscale = 1 / Math.max(1, xmax);
        let temp = Math.max(w[j]!, w[n + j]!, acoefa * w[j]! + bcoefa * w[n + j]!);
        if (il2by2) temp = Math.max(temp, w[j + 1]!, w[n + j + 1]!, acoefa * w[j + 1]! + bcoefa * w[n + j + 1]!);
        if (temp > bignum * xscale) {
          for (let jw = 0; jw <= nw - 1; jw++) for (let jr = je; jr <= j - 1; jr++) w[(jw + 2) * n + jr] = xscale * w[(jw + 2) * n + jr]!;
          xmax *= xscale;
        }
        const suma = [[0, 0], [0, 0]];
        const sumb = [[0, 0], [0, 0]];
        for (let jw = 1; jw <= nw; jw++) {
          for (let ja = 1; ja <= na; ja++) {
            let sa = 0;
            let sb = 0;
            for (let jr = je; jr <= j - 1; jr++) {
              sa += a[jr]![j + ja - 1]! * w[(jw + 1) * n + jr]!;
              sb += b[jr]![j + ja - 1]! * w[(jw + 1) * n + jr]!;
            }
            suma[ja - 1]![jw - 1] = sa;
            sumb[ja - 1]![jw - 1] = sb;
          }
        }
        const sum = [[0, 0], [0, 0]];
        for (let ja = 0; ja < na; ja++) {
          if (ilcplx) {
            sum[ja]![0] = -acoef * suma[ja]![0]! + bcoefr * sumb[ja]![0]! - bcoefi * sumb[ja]![1]!;
            sum[ja]![1] = -acoef * suma[ja]![1]! + bcoefr * sumb[ja]![1]! + bcoefi * sumb[ja]![0]!;
          } else sum[ja]![0] = -acoef * suma[ja]![0]! + bcoefr * sumb[ja]![0]!;
        }
        const sol = dlaln2(true, na, nw, dmin, acoef, a, j, bdiag[1]!, bdiag[2]!, sum, bcoefr, bcoefi);
        if (sol.scale < 1) {
          for (let jw = 0; jw <= nw - 1; jw++) for (let jr = je; jr <= j - 1; jr++) w[(jw + 2) * n + jr] = sol.scale * w[(jw + 2) * n + jr]!;
          xmax = sol.scale * xmax;
        }
        for (let jw = 0; jw < nw; jw++) for (let ja = 0; ja < na; ja++) w[(jw + 2) * n + j + ja] = sol.x[ja]![jw]!;
        xmax = Math.max(xmax, sol.xnorm);
      }
      ieig++;
      // Back-transform: dgemv('N') of vl(:, je..n) by the solved vector, then copy to columns je, je+1.
      const out: number[][] = [];
      for (let jw = 0; jw <= nw - 1; jw++) {
        const y = new Array<number>(n + 1).fill(0);
        for (let c = je; c <= n; c++) {
          const xv = w[(jw + 2) * n + c]!;
          if (xv !== 0) for (let i = 1; i <= n; i++) y[i] = y[i]! + xv * vl[i]![c]!;
        }
        out.push(y);
      }
      for (let jw = 0; jw < nw; jw++) for (let i = 1; i <= n; i++) vl[i]![je + jw] = out[jw]![i]!;
      const ibeg = 1;
      xmax = 0;
      if (ilcplx) for (let j = ibeg; j <= n; j++) xmax = Math.max(xmax, Math.abs(vl[j]![ieig]!) + Math.abs(vl[j]![ieig + 1]!));
      else for (let j = ibeg; j <= n; j++) xmax = Math.max(xmax, Math.abs(vl[j]![ieig]!));
      if (xmax > safmin) {
        const xscale = 1 / xmax;
        for (let jw = 0; jw <= nw - 1; jw++) for (let jr = ibeg; jr <= n; jr++) vl[jr]![ieig + jw] = xscale * vl[jr]![ieig + jw]!;
      }
      ieig += nw - 1;
    }
  }

  if (vr) {
    let ieig = n + 1;
    let ilcplx = false;
    for (let je = n; je >= 1; je--) {
      if (ilcplx) {
        ilcplx = false;
        continue;
      }
      let nw = 1;
      if (je > 1 && a[je]![je - 1] !== 0) {
        ilcplx = true;
        nw = 2;
      }
      if (!ilcplx && Math.abs(a[je]![je]!) <= safmin && Math.abs(b[je]![je]!) <= safmin) {
        ieig--;
        for (let jr = 1; jr <= n; jr++) vr[jr]![ieig] = 0;
        vr[ieig]![ieig] = 1;
        continue;
      }
      for (let jw = 0; jw <= nw - 1; jw++) for (let jr = 1; jr <= n; jr++) w[(jw + 2) * n + jr] = 0;
      let acoef: number;
      let bcoefr: number;
      let bcoefi = 0;
      let acoefa: number;
      let bcoefa: number;
      let xmax: number;
      if (!ilcplx) {
        ({ acoef, bcoefr } = realCoefs(je));
        acoefa = Math.abs(acoef);
        bcoefa = Math.abs(bcoefr);
        w[2 * n + je] = 1;
        xmax = 1;
        for (let jr = 1; jr <= je - 1; jr++) w[2 * n + jr] = bcoefr * b[jr]![je]! - acoef * a[jr]![je]!;
      } else {
        const pc = pairCoefs(je - 1, false);
        if (!pc) return je - 1;
        ({ acoef, bcoefr, bcoefi, acoefa, bcoefa } = pc);
        const temp = acoef * a[je]![je - 1]!;
        const temp2r = acoef * a[je]![je]! - bcoefr * b[je]![je]!;
        const temp2i = -bcoefi * b[je]![je]!;
        if (Math.abs(temp) >= Math.abs(temp2r) + Math.abs(temp2i)) {
          w[2 * n + je] = 1;
          w[3 * n + je] = 0;
          w[2 * n + je - 1] = -temp2r / temp;
          w[3 * n + je - 1] = -temp2i / temp;
        } else {
          w[2 * n + je - 1] = 1;
          w[3 * n + je - 1] = 0;
          const t = acoef * a[je - 1]![je]!;
          w[2 * n + je] = (bcoefr * b[je - 1]![je - 1]! - acoef * a[je - 1]![je - 1]!) / t;
          w[3 * n + je] = (bcoefi * b[je - 1]![je - 1]!) / t;
        }
        xmax = Math.max(Math.abs(w[2 * n + je]!) + Math.abs(w[3 * n + je]!), Math.abs(w[2 * n + je - 1]!) + Math.abs(w[3 * n + je - 1]!));
        const creala = acoef * w[2 * n + je - 1]!;
        const cimaga = acoef * w[3 * n + je - 1]!;
        const crealb = bcoefr * w[2 * n + je - 1]! - bcoefi * w[3 * n + je - 1]!;
        const cimagb = bcoefi * w[2 * n + je - 1]! + bcoefr * w[3 * n + je - 1]!;
        const cre2a = acoef * w[2 * n + je]!;
        const cim2a = acoef * w[3 * n + je]!;
        const cre2b = bcoefr * w[2 * n + je]! - bcoefi * w[3 * n + je]!;
        const cim2b = bcoefi * w[2 * n + je]! + bcoefr * w[3 * n + je]!;
        for (let jr = 1; jr <= je - 2; jr++) {
          w[2 * n + jr] = -creala * a[jr]![je - 1]! + crealb * b[jr]![je - 1]! - cre2a * a[jr]![je]! + cre2b * b[jr]![je]!;
          w[3 * n + jr] = -cimaga * a[jr]![je - 1]! + cimagb * b[jr]![je - 1]! - cim2a * a[jr]![je]! + cim2b * b[jr]![je]!;
        }
      }
      const dmin = Math.max(ulp * acoefa * anorm, ulp * bcoefa * bnorm, safmin);
      let il2by2 = false;
      for (let j = je - nw; j >= 1; j--) {
        if (!il2by2 && j > 1 && a[j]![j - 1] !== 0) {
          il2by2 = true;
          continue;
        }
        const bdiag = [0, b[j]![j]!, 0];
        let na: number;
        if (il2by2) {
          na = 2;
          bdiag[2] = b[j + 1]![j + 1]!;
        } else na = 1;
        const bb = [[0, 0], [0, 0]];
        for (let jw = 0; jw < nw; jw++) for (let ja = 0; ja < na; ja++) bb[ja]![jw] = w[(jw + 2) * n + j + ja]!;
        const sol = dlaln2(false, na, nw, dmin, acoef, a, j, bdiag[1]!, bdiag[2]!, bb, bcoefr, bcoefi);
        if (sol.scale < 1) {
          for (let jw = 0; jw <= nw - 1; jw++) for (let jr = 1; jr <= je; jr++) w[(jw + 2) * n + jr] = sol.scale * w[(jw + 2) * n + jr]!;
        }
        xmax = Math.max(sol.scale * xmax, sol.xnorm);
        for (let jw = 1; jw <= nw; jw++) for (let ja = 1; ja <= na; ja++) w[(jw + 1) * n + j + ja - 1] = sol.x[ja - 1]![jw - 1]!;
        if (j > 1) {
          const xscale = 1 / Math.max(1, xmax);
          let temp = acoefa * w[j]! + bcoefa * w[n + j]!;
          if (il2by2) temp = Math.max(temp, acoefa * w[j + 1]! + bcoefa * w[n + j + 1]!);
          temp = Math.max(temp, acoefa, bcoefa);
          if (temp > bignum * xscale) {
            for (let jw = 0; jw <= nw - 1; jw++) for (let jr = 1; jr <= je; jr++) w[(jw + 2) * n + jr] = xscale * w[(jw + 2) * n + jr]!;
            xmax *= xscale;
          }
          for (let ja = 1; ja <= na; ja++) {
            if (ilcplx) {
              const creala = acoef * w[2 * n + j + ja - 1]!;
              const cimaga = acoef * w[3 * n + j + ja - 1]!;
              const crealb = bcoefr * w[2 * n + j + ja - 1]! - bcoefi * w[3 * n + j + ja - 1]!;
              const cimagb = bcoefi * w[2 * n + j + ja - 1]! + bcoefr * w[3 * n + j + ja - 1]!;
              for (let jr = 1; jr <= j - 1; jr++) {
                w[2 * n + jr] = w[2 * n + jr]! - creala * a[jr]![j + ja - 1]! + crealb * b[jr]![j + ja - 1]!;
                w[3 * n + jr] = w[3 * n + jr]! - cimaga * a[jr]![j + ja - 1]! + cimagb * b[jr]![j + ja - 1]!;
              }
            } else {
              const creala = acoef * w[2 * n + j + ja - 1]!;
              const crealb = bcoefr * w[2 * n + j + ja - 1]!;
              for (let jr = 1; jr <= j - 1; jr++) w[2 * n + jr] = w[2 * n + jr]! - creala * a[jr]![j + ja - 1]! + crealb * b[jr]![j + ja - 1]!;
            }
          }
        }
        il2by2 = false;
      }
      ieig -= nw;
      const out: number[][] = [];
      for (let jw = 0; jw <= nw - 1; jw++) {
        const y = new Array<number>(n + 1).fill(0);
        for (let jr = 1; jr <= n; jr++) y[jr] = w[(jw + 2) * n + 1]! * vr[jr]![1]!;
        for (let jc = 2; jc <= je; jc++) for (let jr = 1; jr <= n; jr++) y[jr] = y[jr]! + w[(jw + 2) * n + jc]! * vr[jr]![jc]!;
        out.push(y);
      }
      for (let jw = 0; jw <= nw - 1; jw++) for (let jr = 1; jr <= n; jr++) vr[jr]![ieig + jw] = out[jw]![jr]!;
      const iend = n;
      xmax = 0;
      if (ilcplx) for (let j = 1; j <= iend; j++) xmax = Math.max(xmax, Math.abs(vr[j]![ieig]!) + Math.abs(vr[j]![ieig + 1]!));
      else for (let j = 1; j <= iend; j++) xmax = Math.max(xmax, Math.abs(vr[j]![ieig]!));
      if (xmax > safmin) {
        const xscale = 1 / xmax;
        for (let jw = 0; jw <= nw - 1; jw++) for (let jr = 1; jr <= iend; jr++) vr[jr]![ieig + jw] = xscale * vr[jr]![ieig + jw]!;
      }
    }
  }
  return 0;
}

/** dggbak with job 'P': undo the permutation on the rows of v (n × m). */
function dggbakP(n: number, ilo: number, ihi: number, scale: number[], m: number, v: M): void {
  if (n === 0 || m === 0) return;
  const swapRows = (i: number, k: number): void => {
    for (let c = 1; c <= m; c++) [v[i]![c], v[k]![c]] = [v[k]![c]!, v[i]![c]!];
  };
  if (ilo !== 1) {
    for (let i = ilo - 1; i >= 1; i--) {
      const k = scale[i]!;
      if (k !== i) swapRows(i, k);
    }
  }
  if (ihi !== n) {
    for (let i = ihi + 1; i <= n; i++) {
      const k = scale[i]!;
      if (k !== i) swapRows(i, k);
    }
  }
}

/** What ggev returns: alpha and beta, and the eigenvectors as complex columns when asked for. */
export interface GgevResult {
  alphaRe: number[];
  alphaIm: number[];
  betaRe: number[];
  betaIm: number[];
  /** Eigenvectors as columns, normalized as dggev and zggev do (the largest |re| + |im| component is 1). */
  vre?: number[][];
  vim?: number[][];
}

/**
 * dggev as LAPACK 3.0, in the order Mathcad 14 is probed to follow. a and b are n × n row arrays, whole. Returns
 * alpha = alphar + i·alphai, beta, and for 'right' or 'left' the vectors, complex pairs unpacked into v and conj(v).
 */
function dggev(are: number[][], bre: number[][], want: 'none' | 'right' | 'left'): GgevResult {
  const n = are.length;
  const a = fromRows(are);
  const b = fromRows(bre);
  const ilvl = want === 'left';
  const ilvr = want === 'right';
  const ilv = ilvl || ilvr;
  const alphar = new Array<number>(n + 2).fill(0);
  const alphai = new Array<number>(n + 2).fill(0);
  const beta = new Array<number>(n + 2).fill(0);
  const out: GgevResult = { alphaRe: [], alphaIm: [], betaRe: [], betaIm: [] };
  if (n === 0) return out;
  const { ilo, ihi, lscale, rscale } = dggbalP(
    n,
    (i, j) => a[i]![j] !== 0 || b[i]![j] !== 0,
    (i, m, k) => {
      for (let c = k; c <= n; c++) {
        [a[i]![c], a[m]![c]] = [a[m]![c]!, a[i]![c]!];
        [b[i]![c], b[m]![c]] = [b[m]![c]!, b[i]![c]!];
      }
    },
    (j, m, l) => {
      for (let r = 1; r <= l; r++) {
        [a[r]![j], a[r]![m]] = [a[r]![m]!, a[r]![j]!];
        [b[r]![j], b[r]![m]] = [b[r]![m]!, b[r]![j]!];
      }
    },
  );
  const irows = ihi + 1 - ilo;
  const icols = ilv ? n + 1 - ilo : irows;
  // dgeqrf of B(ilo.., ilo..) (irows × icols), applied to A's rows: dgeqr2 and dorm2r.
  const bs = mat(irows, icols);
  const as = mat(irows, icols);
  for (let i = 1; i <= irows; i++) {
    for (let j = 1; j <= icols; j++) {
      bs[i]![j] = b[ilo + i - 1]![ilo + j - 1]!;
      as[i]![j] = a[ilo + i - 1]![ilo + j - 1]!;
    }
  }
  const tau = dgeqr2(bs, irows, icols);
  dorm2rLT(bs, tau, irows, as, irows, icols);
  for (let i = 1; i <= irows; i++) {
    for (let j = 1; j <= icols; j++) {
      b[ilo + i - 1]![ilo + j - 1] = bs[i]![j]!;
      a[ilo + i - 1]![ilo + j - 1] = as[i]![j]!;
    }
  }
  let vl: M | null = null;
  let vr: M | null = null;
  if (ilvl) {
    vl = ident(n);
    // dlacpy 'L' of the reflectors below the diagonal, then dorgqr (dorg2r).
    const blk = mat(irows);
    // The block of VL at (ilo, ilo) is identity apart from that copy.
    for (let i = 1; i <= irows; i++) blk[i]![i] = 1;
    // dlacpy puts B(ilo+i, ilo+j-1) at VL(ilo+i, ilo+j-1): the strictly lower part of the block.
    for (let j = 1; j <= irows - 1; j++) for (let i = j + 1; i <= irows; i++) blk[i]![j] = b[ilo + i - 1]![ilo + j - 1]!;
    dorg2r(blk, irows, irows, irows, tau);
    for (let i = 1; i <= irows; i++) for (let j = 1; j <= irows; j++) vl[ilo + i - 1]![ilo + j - 1] = blk[i]![j]!;
  }
  if (ilvr) vr = ident(n);
  if (ilv) dgghrd(n, ilo, ihi, a, b, vl, vr);
  else {
    const a2 = mat(irows);
    const b2 = mat(irows);
    for (let i = 1; i <= irows; i++) {
      for (let j = 1; j <= irows; j++) {
        a2[i]![j] = a[ilo + i - 1]![ilo + j - 1]!;
        b2[i]![j] = b[ilo + i - 1]![ilo + j - 1]!;
      }
    }
    dgghrd(irows, 1, irows, a2, b2, null, null);
    for (let i = 1; i <= irows; i++) {
      for (let j = 1; j <= irows; j++) {
        a[ilo + i - 1]![ilo + j - 1] = a2[i]![j]!;
        b[ilo + i - 1]![ilo + j - 1] = b2[i]![j]!;
      }
    }
  }
  const info = dhgeqz(ilv, n, ilo, ihi, a, b, alphar, alphai, beta, vl, vr);
  if (info !== 0) throw new Error(`dhgeqz failed to converge (info ${info})`);
  if (ilv) {
    const ti = dtgevc(n, a, b, vl, vr);
    if (ti !== 0) throw new Error(`dtgevc failed (info ${ti})`);
    const finish = (v: M, side: 'L' | 'R'): void => {
      dggbakP(n, ilo, ihi, side === 'L' ? lscale : rscale, n, v);
      for (let jc = 1; jc <= n; jc++) {
        if (alphai[jc]! < 0) continue;
        let temp = 0;
        if (alphai[jc] === 0) for (let jr = 1; jr <= n; jr++) temp = Math.max(temp, Math.abs(v[jr]![jc]!));
        else for (let jr = 1; jr <= n; jr++) temp = Math.max(temp, Math.abs(v[jr]![jc]!) + Math.abs(v[jr]![jc + 1]!));
        if (temp < Math.sqrt(SAFMIN) / ULP) continue;
        temp = 1 / temp;
        if (alphai[jc] === 0) for (let jr = 1; jr <= n; jr++) v[jr]![jc] = v[jr]![jc]! * temp;
        else
          for (let jr = 1; jr <= n; jr++) {
            v[jr]![jc] = v[jr]![jc]! * temp;
            v[jr]![jc + 1] = v[jr]![jc + 1]! * temp;
          }
      }
    };
    const v = (ilvl ? vl : vr)!;
    finish(v, ilvl ? 'L' : 'R');
    const vre: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const vim: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let jc = 1; jc <= n; jc++) {
      if (alphai[jc] === 0) {
        for (let jr = 1; jr <= n; jr++) vre[jr - 1]![jc - 1] = v[jr]![jc]!;
      } else if (alphai[jc]! > 0) {
        for (let jr = 1; jr <= n; jr++) {
          vre[jr - 1]![jc - 1] = v[jr]![jc]!;
          vim[jr - 1]![jc - 1] = v[jr]![jc + 1]!;
          vre[jr - 1]![jc] = v[jr]![jc]!;
          vim[jr - 1]![jc] = -v[jr]![jc + 1]!;
        }
      }
    }
    out.vre = vre;
    out.vim = vim;
  }
  for (let i = 1; i <= n; i++) {
    out.alphaRe.push(alphar[i]!);
    out.alphaIm.push(alphai[i]!);
    out.betaRe.push(beta[i]!);
    out.betaIm.push(0);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Complex pencils: zggev and what it calls.
// ---------------------------------------------------------------------------------------------------------------

/** A complex number, [re, im]. */
type C = [number, number];
/** A one-based complex matrix. */
type CM = C[][];

const cmat = (n: number, m: number = n): CM => Array.from({ length: n + 2 }, () => Array.from({ length: m + 2 }, (): C => [0, 0]));
const cident = (n: number): CM => {
  const q = cmat(n);
  for (let i = 1; i <= n; i++) q[i]![i] = [1, 0];
  return q;
};
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const crmul = (r: number, a: C): C => [r * a[0], r * a[1]];
const cconj = (a: C): C => [a[0], -a[1]];
const cneg = (a: C): C => [-a[0], -a[1]];
const cabs = (a: C): number => Math.hypot(a[0], a[1]);
/** ABS1 of zhgeqz and ztgevc: |re| + |im|. */
const abs1 = (a: C): number => Math.abs(a[0]) + Math.abs(a[1]);
const isZero = (a: C): boolean => a[0] === 0 && a[1] === 0;
/** Complex division as gfortran does it by default (Smith's algorithm). */
function cdiv(a: C, b: C): C {
  if (Math.abs(b[0]) >= Math.abs(b[1])) {
    const r = b[1] / b[0];
    const den = b[0] + b[1] * r;
    return [(a[0] + a[1] * r) / den, (a[1] - a[0] * r) / den];
  }
  const r = b[0] / b[1];
  const den = b[0] * r + b[1];
  return [(a[0] * r + a[1]) / den, (a[1] * r - a[0]) / den];
}
/** Principal square root. */
function csqrt(a: C): C {
  const [x, y] = a;
  if (x === 0 && y === 0) return [0, y];
  const t = Math.sqrt((Math.abs(x) + Math.hypot(x, y)) / 2);
  if (x >= 0) return [t, y / (2 * t)];
  return [Math.abs(y) / (2 * t), sign(t, y)];
}
/** zladiv: dladiv on the parts. */
function zladiv(x: C, y: C): C {
  const [r, i] = dladiv(x[0], x[1], y[0], y[1]);
  return [r, i];
}

/** zlartg: the rotation [cs sn; -conj(sn) cs] taking (f, g) to (r, 0). cs is real. */
function zlartg(f: C, g: C): { cs: number; sn: C; r: C } {
  const safmn2 = 2 ** Math.trunc(Math.log(SAFMIN / EPS) / Math.log(2) / 2);
  const safmx2 = 1 / safmn2;
  const abs1m = (z: C): number => Math.max(Math.abs(z[0]), Math.abs(z[1]));
  const abssq = (z: C): number => z[0] ** 2 + z[1] ** 2;
  let scale = Math.max(abs1m(f), abs1m(g));
  let fs: C = f;
  let gs: C = g;
  let count = 0;
  if (scale >= safmx2) {
    do {
      count++;
      fs = crmul(safmn2, fs);
      gs = crmul(safmn2, gs);
      scale *= safmn2;
    } while (scale >= safmx2);
  } else if (scale <= safmn2) {
    if (isZero(g)) return { cs: 1, sn: [0, 0], r: f };
    do {
      count--;
      fs = crmul(safmx2, fs);
      gs = crmul(safmx2, gs);
      scale *= safmx2;
    } while (scale <= safmn2);
  }
  const f2 = abssq(fs);
  const g2 = abssq(gs);
  if (f2 <= Math.max(g2, 1) * SAFMIN) {
    if (isZero(f)) {
      const d = dlapy2(gs[0], gs[1]);
      return { cs: 0, r: [dlapy2(g[0], g[1]), 0], sn: [gs[0] / d, -gs[1] / d] };
    }
    const f2s = dlapy2(fs[0], fs[1]);
    const g2s = Math.sqrt(g2);
    const cs = f2s / g2s;
    let ff: C;
    if (abs1m(f) > 1) {
      const d = dlapy2(f[0], f[1]);
      ff = [f[0] / d, f[1] / d];
    } else {
      const dr = safmx2 * f[0];
      const di = safmx2 * f[1];
      const d = dlapy2(dr, di);
      ff = [dr / d, di / d];
    }
    const sn = cmul(ff, [gs[0] / g2s, -gs[1] / g2s]);
    const r = cadd(crmul(cs, f), cmul(sn, g));
    return { cs, sn, r };
  }
  const f2s = Math.sqrt(1 + g2 / f2);
  let r: C = [f2s * fs[0], f2s * fs[1]];
  const cs = 1 / f2s;
  const d = f2 + g2;
  let sn: C = [r[0] / d, r[1] / d];
  sn = cmul(sn, cconj(gs));
  if (count > 0) for (let i = 0; i < count; i++) r = crmul(safmx2, r);
  else if (count < 0) for (let i = 0; i < -count; i++) r = crmul(safmn2, r);
  return { cs, sn, r };
}

/** zrot on the pairs (x, y) = (m[r1][c1 + k], m[r2][c2 + k]), row-wise: x' = c·x + s·y, y' = c·y − conj(s)·x. */
function zrotRows(a: CM, r1: number, r2: number, c0: number, count: number, c: number, s: C): void {
  for (let k = 0; k < count; k++) {
    const x = a[r1]![c0 + k]!;
    const y = a[r2]![c0 + k]!;
    a[r1]![c0 + k] = cadd(crmul(c, x), cmul(s, y));
    a[r2]![c0 + k] = csub(crmul(c, y), cmul(cconj(s), x));
  }
}
/** zrot on the columns c1 (x) and c2 (y), rows r0 .. r0 + count − 1. */
function zrotCols(a: CM, c1: number, c2: number, r0: number, count: number, c: number, s: C): void {
  for (let k = 0; k < count; k++) {
    const x = a[r0 + k]![c1]!;
    const y = a[r0 + k]![c2]!;
    a[r0 + k]![c1] = cadd(crmul(c, x), cmul(s, y));
    a[r0 + k]![c2] = csub(crmul(c, y), cmul(cconj(s), x));
  }
}

/** dznrm2 as MKL sums it, like dnrm2 above: the square root of the sum of squares. */
function dznrm2(x: C[]): number {
  let sum = 0;
  for (const v of x) sum += v[0] * v[0] + v[1] * v[1];
  return Math.sqrt(sum);
}

/** zlarfg: overwrites x with the tail of v; returns beta (real, the new alpha) and tau. */
function zlarfg(alpha: C, x: C[]): { beta: C; tau: C } {
  const xnorm = dznrm2(x);
  const alphr = alpha[0];
  const alphi = alpha[1];
  if (xnorm === 0 && alphi === 0) return { beta: alpha, tau: [0, 0] };
  const beta = -sign(dlapy3(alphr, alphi, xnorm), alphr);
  const tau: C = [(beta - alphr) / beta, -alphi / beta];
  const sc = zladiv([1, 0], [alphr - beta, alphi]);
  for (let i = 0; i < x.length; i++) x[i] = cmul(sc, x[i]!);
  return { beta: [beta, 0], tau };
}

/** zlarf from the left on the m × n block of c at (ic, jc): zgemv('C') then zgerc. */
function zlarfL(c: CM, v: C[], tau: C, ic: number, jc: number, m: number, n: number): void {
  if (isZero(tau)) return;
  for (let j = 0; j < n; j++) {
    let w: C = [0, 0];
    for (let k = 0; k < m; k++) w = cadd(w, cmul(cconj(c[ic + k]![jc + j]!), v[k]!));
    if (isZero(w)) continue;
    const temp = cmul(cneg(tau), cconj(w));
    for (let k = 0; k < m; k++) c[ic + k]![jc + j] = cadd(c[ic + k]![jc + j]!, cmul(v[k]!, temp));
  }
}

/** zgeqr2 on the m × n matrix x. Returns tau. */
function zgeqr2(x: CM, m: number, n: number): C[] {
  const tau: C[] = Array.from({ length: Math.min(m, n) + 2 }, (): C => [0, 0]);
  const k = Math.min(m, n);
  for (let i = 1; i <= k; i++) {
    const tail: C[] = [];
    for (let r = i + 1; r <= m; r++) tail.push(x[r]![i]!);
    const { beta, tau: t } = zlarfg(x[i]![i]!, tail);
    for (let r = i + 1; r <= m; r++) x[r]![i] = tail[r - i - 1]!;
    x[i]![i] = beta;
    tau[i] = t;
    if (i < n) zlarfL(x, [[1, 0], ...tail], cconj(t), i, i + 1, m - i + 1, n - i);
  }
  return tau;
}

/** zunm2r with side 'L', trans 'C': c ← Qᴴ·c. */
function zunm2rLC(q: CM, tau: C[], k: number, c: CM, m: number, n: number): void {
  for (let i = 1; i <= k; i++) {
    const v: C[] = [[1, 0]];
    for (let r = i + 1; r <= m; r++) v.push(q[r]![i]!);
    zlarfL(c, v, cconj(tau[i]!), i, 1, m - i + 1, n);
  }
}

/** zung2r: forms the m × n matrix Q from k reflectors held in a. */
function zung2r(a: CM, m: number, n: number, k: number, tau: C[]): void {
  for (let j = k + 1; j <= n; j++) {
    for (let l = 1; l <= m; l++) a[l]![j] = [0, 0];
    a[j]![j] = [1, 0];
  }
  for (let i = k; i >= 1; i--) {
    if (i < n) {
      a[i]![i] = [1, 0];
      const v: C[] = [];
      for (let r = i; r <= m; r++) v.push(a[r]![i]!);
      zlarfL(a, v, tau[i]!, i, i + 1, m - i + 1, n - i);
    }
    if (i < m) for (let l = i + 1; l <= m; l++) a[l]![i] = cmul(cneg(tau[i]!), a[l]![i]!);
    a[i]![i] = csub([1, 0], tau[i]!);
    for (let l = 1; l <= i - 1; l++) a[l]![i] = [0, 0];
  }
}

/** zgghrd on a, b (n × n). q and z are updated when given. */
function zgghrd(n: number, ilo: number, ihi: number, a: CM, b: CM, q: CM | null, z: CM | null): void {
  if (n <= 1) return;
  for (let jcol = 1; jcol <= n - 1; jcol++) for (let jrow = jcol + 1; jrow <= n; jrow++) b[jrow]![jcol] = [0, 0];
  for (let jcol = ilo; jcol <= ihi - 2; jcol++) {
    for (let jrow = ihi; jrow >= jcol + 2; jrow--) {
      let g = zlartg(a[jrow - 1]![jcol]!, a[jrow]![jcol]!);
      a[jrow - 1]![jcol] = g.r;
      a[jrow]![jcol] = [0, 0];
      zrotRows(a, jrow - 1, jrow, jcol + 1, n - jcol, g.cs, g.sn);
      zrotRows(b, jrow - 1, jrow, jrow - 1, n + 2 - jrow, g.cs, g.sn);
      if (q) zrotCols(q, jrow - 1, jrow, 1, n, g.cs, cconj(g.sn));
      g = zlartg(b[jrow]![jrow]!, b[jrow]![jrow - 1]!);
      b[jrow]![jrow] = g.r;
      b[jrow]![jrow - 1] = [0, 0];
      zrotCols(a, jrow, jrow - 1, 1, ihi, g.cs, g.sn);
      zrotCols(b, jrow, jrow - 1, 1, jrow - 1, g.cs, g.sn);
      if (z) zrotCols(z, jrow, jrow - 1, 1, n, g.cs, g.sn);
    }
  }
}

/** zlanhs('F') over the block of a at (lo, lo), n × n, upper Hessenberg part. */
function zlanhsF(a: CM, lo: number, n: number): number {
  let scale = 0;
  let sum = 1;
  const add = (v: number): void => {
    if (v === 0) return;
    const t = Math.abs(v);
    if (scale < t) {
      sum = 1 + sum * (scale / t) ** 2;
      scale = t;
    } else sum += (t / scale) ** 2;
  };
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= Math.min(n, j + 1); i++) {
      const z = a[lo + i - 1]![lo + j - 1]!;
      add(z[0]);
      add(z[1]);
    }
  }
  return n === 0 ? 0 : scale * Math.sqrt(sum);
}

/** zhgeqz: the single-shift QZ iteration on the triangular-Hessenberg pencil, as in 3.0. Returns info. */
function zhgeqz(
  schur: boolean,
  n: number,
  ilo: number,
  ihi: number,
  a: CM,
  b: CM,
  alpha: C[],
  beta: C[],
  q: CM | null,
  z: CM | null,
): number {
  if (n <= 0) return 0;
  const inn = ihi + 1 - ilo;
  const safmin = SAFMIN;
  const anorm = zlanhsF(a, ilo, inn);
  const bnorm = zlanhsF(b, ilo, inn);
  const atol = Math.max(safmin, ULP * anorm);
  const btol = Math.max(safmin, ULP * bnorm);
  const ascale = 1 / Math.max(safmin, anorm);
  const bscale = 1 / Math.max(safmin, bnorm);
  /** Makes b(j, j) real and nonnegative by a unit scale of column j (labels 10, 60 and 200 of the source). */
  const phase = (j: number, aRows: number, bRows: number): void => {
    const absb = cabs(b[j]![j]!);
    if (absb > safmin) {
      const signbc = cconj([b[j]![j]![0] / absb, b[j]![j]![1] / absb]);
      b[j]![j] = [absb, 0];
      if (schur) {
        for (let r = 1; r <= bRows; r++) b[r]![j] = cmul(signbc, b[r]![j]!);
        for (let r = 1; r <= aRows; r++) a[r]![j] = cmul(signbc, a[r]![j]!);
      } else a[j]![j] = cmul(a[j]![j]!, signbc);
      if (z) for (let r = 1; r <= n; r++) z[r]![j] = cmul(signbc, z[r]![j]!);
    } else b[j]![j] = [0, 0];
    alpha[j] = a[j]![j]!;
    beta[j] = b[j]![j]!;
  };
  for (let j = ihi + 1; j <= n; j++) phase(j, j, j - 1);
  const finish = (): number => {
    for (let j = 1; j <= ilo - 1; j++) phase(j, j, j - 1);
    return 0;
  };
  if (ihi < ilo) return finish();
  let ilast = ihi;
  let ifrstm: number;
  let ilastm: number;
  if (schur) {
    ifrstm = 1;
    ilastm = n;
  } else {
    ifrstm = ilo;
    ilastm = ihi;
  }
  let iiter = 0;
  let eshift: C = [0, 0];
  const maxit = 30 * (ihi - ilo + 1);
  let ifirst = 0;
  let c = 0;
  let s: C = [0, 0];
  for (let jiter = 1; jiter <= maxit; jiter++) {
    let pc: 'top' | 'l50' | 'l60' | 'l70' | 'next' = 'top';
    for (;;) {
      if (pc === 'top') {
        if (ilast === ilo) pc = 'l60';
        else if (abs1(a[ilast]![ilast - 1]!) <= atol) {
          a[ilast]![ilast - 1] = [0, 0];
          pc = 'l60';
        } else if (cabs(b[ilast]![ilast]!) <= btol) {
          b[ilast]![ilast] = [0, 0];
          pc = 'l50';
        } else {
          let resolved = false;
          for (let j = ilast - 1; j >= ilo; j--) {
            let ilazro: boolean;
            if (j === ilo) ilazro = true;
            else if (abs1(a[j]![j - 1]!) <= atol) {
              a[j]![j - 1] = [0, 0];
              ilazro = true;
            } else ilazro = false;
            if (cabs(b[j]![j]!) < btol) {
              b[j]![j] = [0, 0];
              let ilazr2 = false;
              if (!ilazro) {
                if (abs1(a[j]![j - 1]!) * (ascale * abs1(a[j + 1]![j]!)) <= abs1(a[j]![j]!) * (ascale * atol)) ilazr2 = true;
              }
              if (ilazro || ilazr2) {
                pc = 'l50';
                for (let jch = j; jch <= ilast - 1; jch++) {
                  const g = zlartg(a[jch]![jch]!, a[jch + 1]![jch]!);
                  c = g.cs;
                  s = g.sn;
                  a[jch]![jch] = g.r;
                  a[jch + 1]![jch] = [0, 0];
                  zrotRows(a, jch, jch + 1, jch + 1, ilastm - jch, c, s);
                  zrotRows(b, jch, jch + 1, jch + 1, ilastm - jch, c, s);
                  if (q) zrotCols(q, jch, jch + 1, 1, n, c, cconj(s));
                  if (ilazr2) a[jch]![jch - 1] = crmul(c, a[jch]![jch - 1]!);
                  ilazr2 = false;
                  if (abs1(b[jch + 1]![jch + 1]!) >= btol) {
                    if (jch + 1 >= ilast) pc = 'l60';
                    else {
                      ifirst = jch + 1;
                      pc = 'l70';
                    }
                    break;
                  }
                  b[jch + 1]![jch + 1] = [0, 0];
                }
              } else {
                for (let jch = j; jch <= ilast - 1; jch++) {
                  let g = zlartg(b[jch]![jch + 1]!, b[jch + 1]![jch + 1]!);
                  c = g.cs;
                  s = g.sn;
                  b[jch]![jch + 1] = g.r;
                  b[jch + 1]![jch + 1] = [0, 0];
                  if (jch < ilastm - 1) zrotRows(b, jch, jch + 1, jch + 2, ilastm - jch - 1, c, s);
                  zrotRows(a, jch, jch + 1, jch - 1, ilastm - jch + 2, c, s);
                  if (q) zrotCols(q, jch, jch + 1, 1, n, c, cconj(s));
                  g = zlartg(a[jch + 1]![jch]!, a[jch + 1]![jch - 1]!);
                  c = g.cs;
                  s = g.sn;
                  a[jch + 1]![jch] = g.r;
                  a[jch + 1]![jch - 1] = [0, 0];
                  zrotCols(a, jch, jch - 1, ifrstm, jch + 1 - ifrstm, c, s);
                  zrotCols(b, jch, jch - 1, ifrstm, jch - ifrstm, c, s);
                  if (z) zrotCols(z, jch, jch - 1, 1, n, c, s);
                }
                pc = 'l50';
              }
              resolved = true;
              break;
            } else if (ilazro) {
              ifirst = j;
              pc = 'l70';
              resolved = true;
              break;
            }
          }
          if (!resolved) return 2 * n + 1;
        }
      } else if (pc === 'l50') {
        const g = zlartg(a[ilast]![ilast]!, a[ilast]![ilast - 1]!);
        c = g.cs;
        s = g.sn;
        a[ilast]![ilast] = g.r;
        a[ilast]![ilast - 1] = [0, 0];
        zrotCols(a, ilast, ilast - 1, ifrstm, ilast - ifrstm, c, s);
        zrotCols(b, ilast, ilast - 1, ifrstm, ilast - ifrstm, c, s);
        if (z) zrotCols(z, ilast, ilast - 1, 1, n, c, s);
        pc = 'l60';
      } else if (pc === 'l60') {
        // ifrstm is 1 whenever schur, so rows ifrstm.. of the source are rows 1.. here.
        phase(ilast, ilast, ilast - 1);
        ilast--;
        if (ilast < ilo) return finish();
        iiter = 0;
        eshift = [0, 0];
        if (!schur) {
          ilastm = ilast;
          if (ifrstm > ilast) ifrstm = ilo;
        }
        pc = 'next';
      } else if (pc === 'l70') {
        iiter++;
        if (!schur) ifrstm = ifirst;
        let shift: C;
        if (Math.trunc(iiter / 10) * 10 !== iiter) {
          const u12 = cdiv(crmul(bscale, b[ilast - 1]![ilast]!), crmul(bscale, b[ilast]![ilast]!));
          const ad11 = cdiv(crmul(ascale, a[ilast - 1]![ilast - 1]!), crmul(bscale, b[ilast - 1]![ilast - 1]!));
          const ad21 = cdiv(crmul(ascale, a[ilast]![ilast - 1]!), crmul(bscale, b[ilast - 1]![ilast - 1]!));
          const ad12 = cdiv(crmul(ascale, a[ilast - 1]![ilast]!), crmul(bscale, b[ilast]![ilast]!));
          const ad22 = cdiv(crmul(ascale, a[ilast]![ilast]!), crmul(bscale, b[ilast]![ilast]!));
          const abi22 = csub(ad22, cmul(u12, ad21));
          const t = crmul(0.5, cadd(ad11, abi22));
          const rtdisc = csqrt(csub(cadd(cmul(t, t), cmul(ad12, ad21)), cmul(ad11, ad22)));
          const tmd = csub(t, abi22);
          const temp = tmd[0] * rtdisc[0] + tmd[1] * rtdisc[1];
          shift = temp <= 0 ? cadd(t, rtdisc) : csub(t, rtdisc);
        } else {
          eshift = cadd(eshift, cconj(cdiv(crmul(ascale, a[ilast - 1]![ilast]!), crmul(bscale, b[ilast - 1]![ilast - 1]!))));
          shift = eshift;
        }
        let istart = ifirst;
        let ctemp: C = [0, 0];
        let found = false;
        for (let j = ilast - 1; j >= ifirst + 1; j--) {
          istart = j;
          ctemp = csub(crmul(ascale, a[j]![j]!), cmul(shift, crmul(bscale, b[j]![j]!)));
          let temp = abs1(ctemp);
          let temp2 = ascale * abs1(a[j + 1]![j]!);
          const tempr = Math.max(temp, temp2);
          if (tempr < 1 && tempr !== 0) {
            temp /= tempr;
            temp2 /= tempr;
          }
          if (abs1(a[j]![j - 1]!) * temp2 <= temp * atol) {
            found = true;
            break;
          }
        }
        if (!found) {
          istart = ifirst;
          ctemp = csub(crmul(ascale, a[ifirst]![ifirst]!), cmul(shift, crmul(bscale, b[ifirst]![ifirst]!)));
        }
        {
          const ctemp2 = crmul(ascale, a[istart + 1]![istart]!);
          const g = zlartg(ctemp, ctemp2);
          c = g.cs;
          s = g.sn;
        }
        for (let j = istart; j <= ilast - 1; j++) {
          if (j > istart) {
            const g = zlartg(a[j]![j - 1]!, a[j + 1]![j - 1]!);
            c = g.cs;
            s = g.sn;
            a[j]![j - 1] = g.r;
            a[j + 1]![j - 1] = [0, 0];
          }
          for (let jc = j; jc <= ilastm; jc++) {
            const t1 = cadd(crmul(c, a[j]![jc]!), cmul(s, a[j + 1]![jc]!));
            a[j + 1]![jc] = cadd(cmul(cneg(cconj(s)), a[j]![jc]!), crmul(c, a[j + 1]![jc]!));
            a[j]![jc] = t1;
            const t2 = cadd(crmul(c, b[j]![jc]!), cmul(s, b[j + 1]![jc]!));
            b[j + 1]![jc] = cadd(cmul(cneg(cconj(s)), b[j]![jc]!), crmul(c, b[j + 1]![jc]!));
            b[j]![jc] = t2;
          }
          if (q) {
            for (let jr = 1; jr <= n; jr++) {
              const t1 = cadd(crmul(c, q[jr]![j]!), cmul(cconj(s), q[jr]![j + 1]!));
              q[jr]![j + 1] = cadd(cmul(cneg(s), q[jr]![j]!), crmul(c, q[jr]![j + 1]!));
              q[jr]![j] = t1;
            }
          }
          const g = zlartg(b[j + 1]![j + 1]!, b[j + 1]![j]!);
          c = g.cs;
          s = g.sn;
          b[j + 1]![j + 1] = g.r;
          b[j + 1]![j] = [0, 0];
          for (let jr = ifrstm; jr <= Math.min(j + 2, ilast); jr++) {
            const t1 = cadd(crmul(c, a[jr]![j + 1]!), cmul(s, a[jr]![j]!));
            a[jr]![j] = cadd(cmul(cneg(cconj(s)), a[jr]![j + 1]!), crmul(c, a[jr]![j]!));
            a[jr]![j + 1] = t1;
          }
          for (let jr = ifrstm; jr <= j; jr++) {
            const t1 = cadd(crmul(c, b[jr]![j + 1]!), cmul(s, b[jr]![j]!));
            b[jr]![j] = cadd(cmul(cneg(cconj(s)), b[jr]![j + 1]!), crmul(c, b[jr]![j]!));
            b[jr]![j + 1] = t1;
          }
          if (z) {
            for (let jr = 1; jr <= n; jr++) {
              const t1 = cadd(crmul(c, z[jr]![j + 1]!), cmul(s, z[jr]![j]!));
              z[jr]![j] = cadd(cmul(cneg(cconj(s)), z[jr]![j + 1]!), crmul(c, z[jr]![j]!));
              z[jr]![j + 1] = t1;
            }
          }
        }
        pc = 'next';
      }
      if (pc === 'next') break;
    }
  }
  return ilast;
}

/** ztgevc with howmny 'B': eigenvectors of the triangular pencil, multiplied into vl and/or vr, scaled to max ABS1 = 1. */
function ztgevc(n: number, a: CM, b: CM, vl: CM | null, vr: CM | null): void {
  const safmin = SAFMIN;
  const ulp = ULP;
  const small = (safmin * n) / ulp;
  const big = 1 / small;
  const bignum = 1 / (safmin * n);
  let anorm = abs1(a[1]![1]!);
  let bnorm = abs1(b[1]![1]!);
  const rw = new Array<number>(2 * n + 2).fill(0);
  for (let j = 2; j <= n; j++) {
    rw[j] = 0;
    rw[n + j] = 0;
    for (let i = 1; i <= j - 1; i++) {
      rw[j] = rw[j]! + abs1(a[i]![j]!);
      rw[n + j] = rw[n + j]! + abs1(b[i]![j]!);
    }
    anorm = Math.max(anorm, rw[j]! + abs1(a[j]![j]!));
    bnorm = Math.max(bnorm, rw[n + j]! + abs1(b[j]![j]!));
  }
  const ascale = 1 / Math.max(anorm, safmin);
  const bscale = 1 / Math.max(bnorm, safmin);
  /** The scaled coefficients (acoeff real, bcoeff complex) for eigenvalue je, as both sides compute them. */
  const coefs = (je: number): { acoeff: number; bcoeff: C; acoefa: number; bcoefa: number; dmin: number } => {
    const ajj = a[je]![je]!;
    const bjj = b[je]![je]![0];
    const temp = 1 / Math.max(abs1(ajj) * ascale, Math.abs(bjj) * bscale, safmin);
    const salpha: C = crmul(ascale, crmul(temp, ajj));
    const sbeta = temp * bjj * bscale;
    let acoeff = sbeta * ascale;
    let bcoeff: C = crmul(bscale, salpha);
    const lsa = Math.abs(sbeta) >= safmin && Math.abs(acoeff) < small;
    const lsb = abs1(salpha) >= safmin && abs1(bcoeff) < small;
    let scale = 1;
    if (lsa) scale = (small / Math.abs(sbeta)) * Math.min(anorm, big);
    if (lsb) scale = Math.max(scale, (small / abs1(salpha)) * Math.min(bnorm, big));
    if (lsa || lsb) {
      scale = Math.min(scale, 1 / (safmin * Math.max(1, Math.abs(acoeff), abs1(bcoeff))));
      acoeff = lsa ? ascale * (scale * sbeta) : scale * acoeff;
      bcoeff = lsb ? crmul(bscale, crmul(scale, salpha)) : crmul(scale, bcoeff);
    }
    const acoefa = Math.abs(acoeff);
    const bcoefa = abs1(bcoeff);
    return { acoeff, bcoeff, acoefa, bcoefa, dmin: Math.max(ulp * acoefa * anorm, ulp * bcoefa * bnorm, safmin) };
  };
  const tiny = (je: number): boolean => abs1(a[je]![je]!) <= safmin && Math.abs(b[je]![je]![0]) <= safmin;

  if (vl) {
    for (let je = 1; je <= n; je++) {
      if (tiny(je)) {
        for (let jr = 1; jr <= n; jr++) vl[jr]![je] = [0, 0];
        vl[je]![je] = [1, 0];
        continue;
      }
      const { acoeff, bcoeff, acoefa, bcoefa, dmin } = coefs(je);
      let xmax = 1;
      const w: C[] = Array.from({ length: n + 2 }, (): C => [0, 0]);
      w[je] = [1, 0];
      for (let j = je + 1; j <= n; j++) {
        let temp = 1 / xmax;
        if (acoefa * rw[j]! + bcoefa * rw[n + j]! > bignum * temp) {
          for (let jr = je; jr <= j - 1; jr++) w[jr] = crmul(temp, w[jr]!);
          xmax = 1;
        }
        let suma: C = [0, 0];
        let sumb: C = [0, 0];
        for (let jr = je; jr <= j - 1; jr++) {
          suma = cadd(suma, cmul(cconj(a[jr]![j]!), w[jr]!));
          sumb = cadd(sumb, cmul(cconj(b[jr]![j]!), w[jr]!));
        }
        let sum = csub(crmul(acoeff, suma), cmul(cconj(bcoeff), sumb));
        let d = cconj(csub(crmul(acoeff, a[j]![j]!), cmul(bcoeff, b[j]![j]!)));
        if (abs1(d) <= dmin) d = [dmin, 0];
        if (abs1(d) < 1) {
          if (abs1(sum) >= bignum * abs1(d)) {
            temp = 1 / abs1(sum);
            for (let jr = je; jr <= j - 1; jr++) w[jr] = crmul(temp, w[jr]!);
            xmax = temp * xmax;
            sum = crmul(temp, sum);
          }
        }
        w[j] = zladiv(cneg(sum), d);
        xmax = Math.max(xmax, abs1(w[j]!));
      }
      // zgemv('N'): y = VL(:, je..n) · w(je..n).
      const y: C[] = Array.from({ length: n + 2 }, (): C => [0, 0]);
      for (let c = je; c <= n; c++) {
        if (isZero(w[c]!)) continue;
        for (let i = 1; i <= n; i++) y[i] = cadd(y[i]!, cmul(w[c]!, vl[i]![c]!));
      }
      let ibeg = 1;
      xmax = 0;
      for (let jr = ibeg; jr <= n; jr++) xmax = Math.max(xmax, abs1(y[jr]!));
      if (xmax > safmin) {
        const temp = 1 / xmax;
        for (let jr = ibeg; jr <= n; jr++) vl[jr]![je] = crmul(temp, y[jr]!);
      } else ibeg = n + 1;
      for (let jr = 1; jr <= ibeg - 1; jr++) vl[jr]![je] = [0, 0];
    }
  }
  if (vr) {
    for (let je = n; je >= 1; je--) {
      if (tiny(je)) {
        for (let jr = 1; jr <= n; jr++) vr[jr]![je] = [0, 0];
        vr[je]![je] = [1, 0];
        continue;
      }
      const { acoeff, bcoeff, acoefa, bcoefa, dmin } = coefs(je);
      const w: C[] = Array.from({ length: n + 2 }, (): C => [0, 0]);
      w[je] = [1, 0];
      for (let jr = 1; jr <= je - 1; jr++) w[jr] = csub(crmul(acoeff, a[jr]![je]!), cmul(bcoeff, b[jr]![je]!));
      w[je] = [1, 0];
      for (let j = je - 1; j >= 1; j--) {
        let d = csub(crmul(acoeff, a[j]![j]!), cmul(bcoeff, b[j]![j]!));
        if (abs1(d) <= dmin) d = [dmin, 0];
        if (abs1(d) < 1) {
          if (abs1(w[j]!) >= bignum * abs1(d)) {
            const temp = 1 / abs1(w[j]!);
            for (let jr = 1; jr <= je; jr++) w[jr] = crmul(temp, w[jr]!);
          }
        }
        w[j] = zladiv(cneg(w[j]!), d);
        if (j > 1) {
          if (abs1(w[j]!) > 1) {
            const temp = 1 / abs1(w[j]!);
            if (acoefa * rw[j]! + bcoefa * rw[n + j]! >= bignum * temp) for (let jr = 1; jr <= je; jr++) w[jr] = crmul(temp, w[jr]!);
          }
          const ca = crmul(acoeff, w[j]!);
          const cb = cmul(bcoeff, w[j]!);
          for (let jr = 1; jr <= j - 1; jr++) w[jr] = csub(cadd(w[jr]!, cmul(ca, a[jr]![j]!)), cmul(cb, b[jr]![j]!));
        }
      }
      const y: C[] = Array.from({ length: n + 2 }, (): C => [0, 0]);
      for (let c = 1; c <= je; c++) {
        if (isZero(w[c]!)) continue;
        for (let i = 1; i <= n; i++) y[i] = cadd(y[i]!, cmul(w[c]!, vr[i]![c]!));
      }
      let iend = n;
      let xmax = 0;
      for (let jr = 1; jr <= iend; jr++) xmax = Math.max(xmax, abs1(y[jr]!));
      if (xmax > safmin) {
        const temp = 1 / xmax;
        for (let jr = 1; jr <= iend; jr++) vr[jr]![je] = crmul(temp, y[jr]!);
      } else iend = 0;
      for (let jr = iend + 1; jr <= n; jr++) vr[jr]![je] = [0, 0];
    }
  }
}

/** zggev as LAPACK 3.0. */
function zggev(are: number[][], aim: number[][], bre: number[][], bim: number[][], want: 'none' | 'right' | 'left'): GgevResult {
  const n = are.length;
  const out: GgevResult = { alphaRe: [], alphaIm: [], betaRe: [], betaIm: [] };
  if (n === 0) return out;
  const a = cmat(n);
  const b = cmat(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      a[i + 1]![j + 1] = [are[i]![j]!, aim[i]![j]!];
      b[i + 1]![j + 1] = [bre[i]![j]!, bim[i]![j]!];
    }
  }
  const ilvl = want === 'left';
  const ilvr = want === 'right';
  const ilv = ilvl || ilvr;
  const alpha: C[] = Array.from({ length: n + 2 }, (): C => [0, 0]);
  const beta: C[] = Array.from({ length: n + 2 }, (): C => [0, 0]);
  const { ilo, ihi, lscale, rscale } = dggbalP(
    n,
    (i, j) => !isZero(a[i]![j]!) || !isZero(b[i]![j]!),
    (i, m, k) => {
      for (let c = k; c <= n; c++) {
        [a[i]![c], a[m]![c]] = [a[m]![c]!, a[i]![c]!];
        [b[i]![c], b[m]![c]] = [b[m]![c]!, b[i]![c]!];
      }
    },
    (j, m, l) => {
      for (let r = 1; r <= l; r++) {
        [a[r]![j], a[r]![m]] = [a[r]![m]!, a[r]![j]!];
        [b[r]![j], b[r]![m]] = [b[r]![m]!, b[r]![j]!];
      }
    },
  );
  const irows = ihi + 1 - ilo;
  const icols = ilv ? n + 1 - ilo : irows;
  const bs = cmat(irows, icols);
  const as = cmat(irows, icols);
  for (let i = 1; i <= irows; i++) {
    for (let j = 1; j <= icols; j++) {
      bs[i]![j] = b[ilo + i - 1]![ilo + j - 1]!;
      as[i]![j] = a[ilo + i - 1]![ilo + j - 1]!;
    }
  }
  const tau = zgeqr2(bs, irows, icols);
  zunm2rLC(bs, tau, irows, as, irows, icols);
  for (let i = 1; i <= irows; i++) {
    for (let j = 1; j <= icols; j++) {
      b[ilo + i - 1]![ilo + j - 1] = bs[i]![j]!;
      a[ilo + i - 1]![ilo + j - 1] = as[i]![j]!;
    }
  }
  let vl: CM | null = null;
  let vr: CM | null = null;
  if (ilvl) {
    vl = cident(n);
    const blk = cmat(irows);
    for (let i = 1; i <= irows; i++) blk[i]![i] = [1, 0];
    for (let j = 1; j <= irows - 1; j++) for (let i = j + 1; i <= irows; i++) blk[i]![j] = b[ilo + i - 1]![ilo + j - 1]!;
    zung2r(blk, irows, irows, irows, tau);
    for (let i = 1; i <= irows; i++) for (let j = 1; j <= irows; j++) vl[ilo + i - 1]![ilo + j - 1] = blk[i]![j]!;
  }
  if (ilvr) vr = cident(n);
  if (ilv) zgghrd(n, ilo, ihi, a, b, vl, vr);
  else {
    const a2 = cmat(irows);
    const b2 = cmat(irows);
    for (let i = 1; i <= irows; i++) {
      for (let j = 1; j <= irows; j++) {
        a2[i]![j] = a[ilo + i - 1]![ilo + j - 1]!;
        b2[i]![j] = b[ilo + i - 1]![ilo + j - 1]!;
      }
    }
    zgghrd(irows, 1, irows, a2, b2, null, null);
    for (let i = 1; i <= irows; i++) {
      for (let j = 1; j <= irows; j++) {
        a[ilo + i - 1]![ilo + j - 1] = a2[i]![j]!;
        b[ilo + i - 1]![ilo + j - 1] = b2[i]![j]!;
      }
    }
  }
  const info = zhgeqz(ilv, n, ilo, ihi, a, b, alpha, beta, vl, vr);
  if (info !== 0) throw new Error(`zhgeqz failed to converge (info ${info})`);
  if (ilv) {
    ztgevc(n, a, b, vl, vr);
    const v = (ilvl ? vl : vr)!;
    // zggbak 'P' then the final scaling of each column to ABS1 = 1.
    const scale = ilvl ? lscale : rscale;
    const swapRows = (i: number, k: number): void => {
      for (let c = 1; c <= n; c++) [v[i]![c], v[k]![c]] = [v[k]![c]!, v[i]![c]!];
    };
    if (ilo !== 1) for (let i = ilo - 1; i >= 1; i--) if (scale[i] !== i) swapRows(i, scale[i]!);
    if (ihi !== n) for (let i = ihi + 1; i <= n; i++) if (scale[i] !== i) swapRows(i, scale[i]!);
    const smlnum = Math.sqrt(SAFMIN) / ULP;
    out.vre = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    out.vim = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let jc = 1; jc <= n; jc++) {
      let temp = 0;
      for (let jr = 1; jr <= n; jr++) temp = Math.max(temp, abs1(v[jr]![jc]!));
      if (temp >= smlnum) {
        temp = 1 / temp;
        for (let jr = 1; jr <= n; jr++) v[jr]![jc] = crmul(temp, v[jr]![jc]!);
      }
      for (let jr = 1; jr <= n; jr++) {
        out.vre[jr - 1]![jc - 1] = v[jr]![jc]![0];
        out.vim[jr - 1]![jc - 1] = v[jr]![jc]![1];
      }
    }
  }
  for (let i = 1; i <= n; i++) {
    out.alphaRe.push(alpha[i]![0]);
    out.alphaIm.push(alpha[i]![1]);
    out.betaRe.push(beta[i]![0]);
    out.betaIm.push(beta[i]![1]);
  }
  return out;
}

/**
 * Generalized eigenvalues, and with `want` the right or the left eigenvectors, of A·x = λ·B·x, as LAPACK 3.0's
 * dggev (both matrices real, so `aim` and `bim` are null) or zggev gives them. a, b: n × n arrays of rows.
 * Eigenvalue k is alpha[k] / beta[k], an infinite one when beta is 0. Vectors are columns, normalized as the drivers
 * do: the largest |re| + |im| is 1. A complex pair of real-pencil eigenvalues comes as v and conj(v).
 */
export function ggev(
  are: number[][],
  aim: number[][] | null,
  bre: number[][],
  bim: number[][] | null,
  want: 'none' | 'right' | 'left',
): GgevResult {
  if (!aim && !bim) return dggev(are, bre, want);
  const zero = are.map((r) => r.map(() => 0));
  return zggev(are, aim ?? zero, bre, bim ?? zero, want);
}
