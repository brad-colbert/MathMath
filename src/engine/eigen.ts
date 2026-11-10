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

import { EvalError, type Mat, newMat } from './values.js';

/**
 * Eigenvalues as Mathcad 14 finds them, which is LAPACK 3.0's dgeev: balance (dgebal, permuting to isolate
 * eigenvalues, then scaling by powers of 8), reduce to Hessenberg form by Householder reflections (dgehd2), then
 * the double-shift QR iteration of LAPACK 3.0's dlahqr, with dlanv2's 2 × 2 standardization. An eigenvalue's
 * place in the answer is where it converged in the matrix, so these steps decide the order, which Mathcad doesn't
 * sort. Later LAPACKs changed the balancing (3.5) and the QR iteration (3.1); they give another order now and then,
 * and other eigenvector signs. Probed: these give Mathcad's order on all 36 probe matrices, and its eigenvectors
 * to the last digit, signs included, on all 24.
 */
export function lapackEigenvalues(input: number[][]): { re: number[]; im: number[] } {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  if (n === 0) return { re, im };
  const { ilo, ihi } = balance(a);
  householderHessenberg(a, ilo, ihi);
  // Eigenvalues the balancing isolated sit on the diagonal outside ilo..ihi.
  for (let i = 0; i < ilo; i++) re[i] = a[i]![i]!;
  for (let i = ihi + 1; i < n; i++) re[i] = a[i]![i]!;
  dlahqr(a, ilo, ihi, re, im, null);
  return { re, im };
}

/**
 * Eigenvalues and right eigenvectors as LAPACK 3.0's dgeev gives them, which is how Mathcad 14's eigenvecs gives them: the
 * real Schur form T = Zᵀ·A·Z (dorghr, then dlahqr keeping T and Z), each eigenvector of T by back-substitution
 * from a fixed start (dtrevc), taken back through Z and the balancing (dgebak), then scaled to unit length.
 * `vr` holds the vectors as columns, LAPACK's way: a real eigenvalue's vector in its own column; for a complex
 * pair at columns j and j+1, the vector for the eigenvalue with positive imaginary part is vr[j] + i·vr[j+1],
 * and its conjugate belongs to the other.
 */
export function lapackEigenvectors(input: number[][]): { re: number[]; im: number[]; vr: number[][] } {
  const n = input.length;
  const t = input.map((row) => row.slice());
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  if (n === 0) return { re, im, vr: [] };
  const { ilo, ihi, scale } = balance(t);
  const reflectors = householderHessenberg(t, ilo, ihi);
  const z = formQ(n, ilo, ihi, reflectors);
  for (let i = 0; i < ilo; i++) re[i] = t[i]![i]!;
  for (let i = ihi + 1; i < n; i++) re[i] = t[i]![i]!;
  // Below the first subdiagonal is zero by construction; dhseqr clears it before the QR iteration.
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) t[i]![j] = 0;
  dlahqr(t, ilo, ihi, re, im, z);
  const vr = rightVectors(t, z);
  undoBalance(vr, ilo, ihi, scale);
  normalize(vr, im);
  return { re, im, vr };
}

/**
 * dgebal with job 'B', as LAPACK 3.0: permutes to isolate eigenvalues, then scales by powers of 8 to even out each
 * row's and column's 1-norm, leaving the diagonal out. Returns ilo..ihi, 0-based,
 * and `scale` as dgebal leaves it for dgebak: outside ilo..ihi, the row each was swapped with; inside, its factor.
 */
function balance(a: number[][]): { ilo: number; ihi: number; scale: number[] } {
  const n = a.length;
  let k = 0;
  let l = n - 1;
  const scale = new Array<number>(n).fill(1);
  const swap = (j: number, m: number): void => {
    if (j === m) return;
    for (let i = 0; i <= l; i++) [a[i]![j], a[i]![m]] = [a[i]![m]!, a[i]![j]!];
    for (let i = k; i < n; i++) [a[j]![i], a[m]![i]] = [a[m]![i]!, a[j]![i]!];
  };
  // Rows isolating an eigenvalue go to the bottom.
  rows: for (;;) {
    for (let j = l; j >= 0; j--) {
      let zero = true;
      for (let i = 0; i <= l; i++) if (i !== j && a[j]![i] !== 0) {
        zero = false;
        break;
      }
      if (!zero) continue;
      scale[l] = j;
      swap(j, l);
      if (l === 0) return { ilo: 0, ihi: 0, scale };
      l--;
      continue rows;
    }
    break;
  }
  // Columns isolating an eigenvalue go to the left.
  cols: for (;;) {
    for (let j = k; j <= l; j++) {
      let zero = true;
      for (let i = k; i <= l; i++) if (i !== j && a[i]![j] !== 0) {
        zero = false;
        break;
      }
      if (!zero) continue;
      scale[k] = j;
      swap(j, k);
      k++;
      continue cols;
    }
    break;
  }
  // Scaling, which changes no eigenvalue: 1-norms without the diagonal, in powers of 8. LAPACK 3.5 changed this
  // to 2-norms in powers of 2, which rounds differently and so can turn an eigenvector the other way.
  const factor = 8;
  const sfmin1 = 2 ** -1022 / 2 ** -52;
  const sfmax1 = 1 / sfmin1;
  const sfmin2 = sfmin1 * factor;
  const sfmax2 = 1 / sfmin2;
  for (let i = k; i <= l; i++) scale[i] = 1;
  let noconv = true;
  while (noconv) {
    noconv = false;
    for (let i = k; i <= l; i++) {
      let c = 0;
      let r = 0;
      for (let j = k; j <= l; j++) {
        if (j === i) continue;
        c += Math.abs(a[j]![i]!);
        r += Math.abs(a[i]![j]!);
      }
      // idamax: the first largest.
      let ica = 0;
      for (let j = 1; j <= l; j++) if (Math.abs(a[j]![i]!) > Math.abs(a[ica]![i]!)) ica = j;
      let ca = Math.abs(a[ica]![i]!);
      let ira = k;
      for (let j = k + 1; j < n; j++) if (Math.abs(a[i]![j]!) > Math.abs(a[i]![ira]!)) ira = j;
      let ra = Math.abs(a[i]![ira]!);
      if (c === 0 || r === 0) continue;
      let g = r / factor;
      let f = 1;
      const s = c + r;
      while (!(c >= g || Math.max(f, c, ca) >= sfmax2 || Math.min(r, g, ra) <= sfmin2)) {
        f *= factor;
        c *= factor;
        ca *= factor;
        r /= factor;
        g /= factor;
        ra /= factor;
      }
      g = c / factor;
      while (!(g < r || Math.max(r, ra) >= sfmax2 || Math.min(f, c, g, ca) <= sfmin2)) {
        f /= factor;
        c /= factor;
        g /= factor;
        ca /= factor;
        r *= factor;
        ra *= factor;
      }
      if (c + r >= 0.95 * s) continue;
      if (f < 1 && scale[i]! < 1 && f * scale[i]! <= sfmin1) continue;
      if (f > 1 && scale[i]! > 1 && scale[i]! >= sfmax1 / f) continue;
      const inverse = 1 / f;
      scale[i] = scale[i]! * f;
      noconv = true;
      for (let j = k; j < n; j++) a[i]![j] = a[i]![j]! * inverse;
      for (let j = 0; j <= l; j++) a[j]![i] = a[j]![i]! * f;
    }
  }
  return { ilo: k, ihi: l, scale };
}

/** dlapy2: √(x² + y²) as LAPACK computes it, so results round as LAPACK's do. */
function dlapy2(x: number, y: number): number {
  const w = Math.max(Math.abs(x), Math.abs(y));
  const z = Math.min(Math.abs(x), Math.abs(y));
  return z === 0 || w > Number.MAX_VALUE ? w : w * Math.sqrt(1 + (z / w) ** 2);
}

/** dnrm2 for values of ordinary size, as the reference BLAS sums them: the square root of the sum of squares. */
function dnrm2(x: number[]): number {
  let sum = 0;
  for (const v of x) sum += v * v;
  return Math.sqrt(sum);
}

/**
 * dlarfg: the reflector I − τ·v·vᵀ, v = (1, x), that takes (α, x) to (β, 0). Overwrites x with v's tail. Its
 * arithmetic follows LAPACK's to the last bit where it can, since near convergence of the QR iteration the sign
 * of a tiny entry, and so the sign of an eigenvector, can hang on it.
 */
function reflector(alpha: number, x: number[]): { beta: number; tau: number } {
  const xnorm = dnrm2(x);
  if (xnorm === 0) return { beta: alpha, tau: 0 };
  const beta = -sign(dlapy2(alpha, xnorm), alpha);
  const tau = (beta - alpha) / beta;
  const scal = 1 / (alpha - beta);
  for (let i = 0; i < x.length; i++) x[i] = x[i]! * scal;
  return { beta, tau };
}

interface Reflector {
  /** The reflector acts on rows and columns i+1..ihi. */
  i: number;
  /** v, with its leading 1. */
  v: number[];
  tau: number;
}

/**
 * dlarf from the left on rows r0.. and columns c0..c1 of a: C ← C − τ·v·(Cᵀ·v)ᵀ, in the reference BLAS's order:
 * w = Cᵀ·v by dgemv, then C(i, j) += v(i)·(−τ·w(j)) by dger.
 */
function dlarfLeft(a: number[][], v: number[], tau: number, r0: number, c0: number, c1: number): void {
  if (tau === 0) return;
  for (let j = c0; j <= c1; j++) {
    let w = 0;
    for (let k = 0; k < v.length; k++) w += a[r0 + k]![j]! * v[k]!;
    const temp = -tau * w;
    if (temp !== 0) for (let k = 0; k < v.length; k++) a[r0 + k]![j] = a[r0 + k]![j]! + v[k]! * temp;
  }
}

/** dlarf from the right on rows r0..r1 and columns c0.. of a: C ← C − τ·(C·v)·vᵀ, w = C·v by dgemv, then dger. */
function dlarfRight(a: number[][], v: number[], tau: number, r0: number, r1: number, c0: number): void {
  if (tau === 0) return;
  const w = new Array<number>(r1 - r0 + 1).fill(0);
  for (let k = 0; k < v.length; k++) {
    const temp = v[k]!;
    for (let r = r0; r <= r1; r++) w[r - r0] = w[r - r0]! + temp * a[r]![c0 + k]!;
  }
  for (let k = 0; k < v.length; k++) {
    if (v[k] === 0) continue;
    const temp = -tau * v[k]!;
    for (let r = r0; r <= r1; r++) a[r]![c0 + k] = a[r]![c0 + k]! + w[r - r0]! * temp;
  }
}

/** dgehd2: Householder reduction of rows and columns ilo..ihi to upper Hessenberg form. Returns the reflectors. */
function householderHessenberg(a: number[][], ilo: number, ihi: number): Reflector[] {
  const n = a.length;
  const out: Reflector[] = [];
  for (let i = ilo; i < ihi - 1; i++) {
    const x: number[] = [];
    for (let r = i + 2; r <= ihi; r++) x.push(a[r]![i]!);
    const { beta, tau } = reflector(a[i + 1]![i]!, x);
    const v = [1, ...x];
    out.push({ i, v, tau });
    dlarfRight(a, v, tau, 0, ihi, i + 1);
    dlarfLeft(a, v, tau, i + 1, i + 1, n - 1);
    a[i + 1]![i] = beta;
    for (let r = i + 2; r <= ihi; r++) a[r]![i] = 0;
  }
  return out;
}

/**
 * dorghr: Q = H(ilo)·H(ilo+1)⋯, the orthogonal matrix of the Hessenberg reduction. Identity outside rows and
 * columns ilo+1..ihi; inside, built as dorg2r builds it, a column at a time from the last reflector back.
 */
function formQ(n: number, ilo: number, ihi: number, reflectors: Reflector[]): number[][] {
  const q = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
  const nh = ihi - ilo;
  const at = ilo + 1;
  for (let ii = nh - 1; ii >= 0; ii--) {
    const r = reflectors.find((x) => x.i === ilo + ii);
    const tau = r?.tau ?? 0;
    const tail = r ? r.v.slice(1) : [];
    const col = at + ii;
    if (ii < nh - 1) dlarfLeft(q, [1, ...tail], tau, col, col + 1, at + nh - 1);
    for (let k = 0; k < nh - 1 - ii; k++) q[col + 1 + k]![col] = -tau * (tail[k] ?? 0);
    q[col]![col] = 1 - tau;
    for (let k = at; k < col; k++) q[k]![col] = 0;
  }
  return q;
}

/** Fortran's SIGN(a, b), as gfortran gives it: −0 counts as negative. */
const sign = (a: number, b: number): number => (b < 0 || Object.is(b, -0) ? -Math.abs(a) : Math.abs(a));

interface Standard2x2 {
  /** The standardized block (a, b; c, d): upper triangular for real eigenvalues, equal diagonal for a complex pair. */
  a: number;
  b: number;
  c: number;
  d: number;
  rt1r: number;
  rt1i: number;
  rt2r: number;
  rt2i: number;
  /** The rotation (cs, sn) that standardized it. */
  cs: number;
  sn: number;
}

/** dlanv2, as LAPACK 3.0: the Schur factorization of a real 2 × 2 block, and its eigenvalues in the order that form gives them. */
function dlanv2(a0: number, b0: number, c0: number, d0: number): Standard2x2 {
  let [a, b, c, d] = [a0, b0, c0, d0];
  const eps = 2 ** -52;
  let cs = 1;
  let sn = 0;
  if (c === 0) {
    // Already upper triangular.
  } else if (b === 0) {
    cs = 0;
    sn = 1;
    [a, d] = [d, a];
    b = -c;
    c = 0;
  } else if (a - d === 0 && sign(1, b) !== sign(1, c)) {
    // A standard complex pair already.
  } else {
    let temp = a - d;
    let p = 0.5 * temp;
    const bcmax = Math.max(Math.abs(b), Math.abs(c));
    const bcmis = Math.min(Math.abs(b), Math.abs(c)) * sign(1, b) * sign(1, c);
    let scale = Math.max(Math.abs(p), bcmax);
    let z = (p / scale) * p + (bcmax / scale) * bcmis;
    if (z >= 4 * eps) {
      // Real eigenvalues.
      z = p + sign(Math.sqrt(scale) * Math.sqrt(z), p);
      a = d + z;
      d -= (bcmax / z) * bcmis;
      const tau = dlapy2(c, z);
      cs = z / tau;
      sn = c / tau;
      b -= c;
      c = 0;
    } else {
      // Complex, or two nearly equal real eigenvalues: make the diagonal equal.
      const sigma = b + c;
      let tau = dlapy2(sigma, temp);
      cs = Math.sqrt(0.5 * (1 + Math.abs(sigma) / tau));
      sn = -(p / (tau * cs)) * sign(1, sigma);
      const aa = a * cs + b * sn;
      const bb = -a * sn + b * cs;
      const cc = c * cs + d * sn;
      const dd = -c * sn + d * cs;
      a = aa * cs + cc * sn;
      b = bb * cs + dd * sn;
      c = -aa * sn + cc * cs;
      d = -bb * sn + dd * cs;
      temp = 0.5 * (a + d);
      a = temp;
      d = temp;
      if (c !== 0) {
        if (b !== 0) {
          if (sign(1, b) === sign(1, c)) {
            // Real after all: make it upper triangular.
            const sab = Math.sqrt(Math.abs(b));
            const sac = Math.sqrt(Math.abs(c));
            p = sign(sab * sac, c);
            tau = 1 / Math.sqrt(Math.abs(b + c));
            a = temp + p;
            d = temp - p;
            b -= c;
            c = 0;
            const cs1 = sab * tau;
            const sn1 = sac * tau;
            const t = cs * cs1 - sn * sn1;
            sn = cs * sn1 + sn * cs1;
            cs = t;
          }
        } else {
          b = -c;
          c = 0;
          const t = cs;
          cs = -sn;
          sn = t;
        }
      }
    }
  }
  const rt1i = c === 0 ? 0 : Math.sqrt(Math.abs(b)) * Math.sqrt(Math.abs(c));
  return { a, b, c, d, rt1r: a, rt1i, rt2r: d, rt2i: -rt1i, cs, sn };
}

/** drot on two equal-length runs given by accessors: (x, y) ← (cs·x + sn·y, cs·y − sn·x). */
function rotate(count: number, get: (k: number) => [number, number], set: (k: number, x: number, y: number) => void, cs: number, sn: number): void {
  for (let k = 0; k < count; k++) {
    const [x, y] = get(k);
    set(k, cs * x + sn * y, cs * y - sn * x);
  }
}

/**
 * dlahqr as LAPACK 3.0: double-shift QR on the Hessenberg rows and columns ilo..ihi, with the shifts taken
 * straight from the trailing 2 × 2 block and exceptional shifts at the 10th and 20th iteration. With z, it keeps
 * the whole matrix as the real Schur form (LAPACK's wantt) and accumulates the transformations into z's rows
 * ilo..ihi (wantz); without, it finds the eigenvalues only.
 */
function dlahqr(h: number[][], ilo: number, ihi: number, wr: number[], wi: number[], z: number[][] | null): void {
  const wantt = z !== null;
  const n = h.length;
  if (ilo === ihi) {
    wr[ilo] = h[ilo]![ilo]!;
    wi[ilo] = 0;
    return;
  }
  const nh = ihi - ilo + 1;
  const ulp = 2 ** -52;
  const smlnum = 2 ** -1022 * (nh / ulp);
  let [i1, i2] = [0, n - 1];
  // The iterations allowed, shared by all the eigenvalues.
  let itn = 30 * nh;
  const v = [0, 0, 0];
  let i = ihi;
  while (i >= ilo) {
    let l = ilo;
    let converged = false;
    let its = 0;
    for (; its <= itn; its++) {
      // A small subdiagonal entry splits the matrix.
      let k: number;
      for (k = i; k > l; k--) {
        let tst1 = Math.abs(h[k - 1]![k - 1]!) + Math.abs(h[k]![k]!);
        if (tst1 === 0) {
          // dlanhs '1': the largest column sum of rows and columns l..i.
          for (let c = l; c <= i; c++) {
            let sum = 0;
            for (let r = l; r <= Math.min(i, c + 1); r++) sum += Math.abs(h[r]![c]!);
            tst1 = Math.max(tst1, sum);
          }
        }
        if (Math.abs(h[k]![k - 1]!) <= Math.max(ulp * tst1, smlnum)) break;
      }
      l = k;
      if (l > ilo) h[l]![l - 1] = 0;
      if (l >= i - 1) {
        converged = true;
        break;
      }
      if (!wantt) [i1, i2] = [l, i];
      let h44: number;
      let h33: number;
      let h43h34: number;
      if (its === 10 || its === 20) {
        const s = Math.abs(h[i]![i - 1]!) + Math.abs(h[i - 1]![i - 2]!);
        h44 = 0.75 * s + h[i]![i]!;
        h33 = h44;
        h43h34 = -0.4375 * s * s;
      } else {
        // The trailing 2 × 2 block's eigenvalues; two real ones become a double shift at the nearer.
        h44 = h[i]![i]!;
        h33 = h[i - 1]![i - 1]!;
        h43h34 = h[i]![i - 1]! * h[i - 1]![i]!;
        let disc = (h33 - h44) * 0.5;
        disc = disc * disc + h43h34;
        if (disc > 0) {
          disc = Math.sqrt(disc);
          const ave = 0.5 * (h33 + h44);
          if (Math.abs(h33) - Math.abs(h44) > 0) {
            h33 = h33 * h44 - h43h34;
            h44 = h33 / (sign(disc, ave) + ave);
          } else {
            h44 = sign(disc, ave) + ave;
          }
          h33 = h44;
          h43h34 = 0;
        }
      }
      // Two consecutive small subdiagonal entries let the sweep start lower.
      let m: number;
      for (m = i - 2; m >= l; m--) {
        const h11 = h[m]![m]!;
        const h22 = h[m + 1]![m + 1]!;
        const h21 = h[m + 1]![m]!;
        const h12 = h[m]![m + 1]!;
        const h44s = h44 - h11;
        const h33s = h33 - h11;
        let v1 = (h33s * h44s - h43h34) / h21 + h12;
        let v2 = h22 - h11 - h33s - h44s;
        let v3 = h[m + 2]![m + 1]!;
        const s = Math.abs(v1) + Math.abs(v2) + Math.abs(v3);
        v1 /= s;
        v2 /= s;
        v3 /= s;
        [v[0], v[1], v[2]] = [v1, v2, v3];
        if (m === l) break;
        const tst1 = Math.abs(v1) * (Math.abs(h[m - 1]![m - 1]!) + Math.abs(h11) + Math.abs(h22));
        if (Math.abs(h[m]![m - 1]!) * (Math.abs(v2) + Math.abs(v3)) <= ulp * tst1) break;
      }
      // The double-shift sweep, a reflector at a time.
      for (let k2 = m; k2 <= i - 1; k2++) {
        const nr = Math.min(3, i - k2 + 1);
        if (k2 > m) for (let r = 0; r < nr; r++) v[r] = h[k2 + r]![k2 - 1]!;
        const tail = v.slice(1, nr);
        const { beta, tau: t1 } = reflector(v[0]!, tail);
        for (let r = 1; r < nr; r++) v[r] = tail[r - 1]!;
        v[0] = beta;
        if (k2 > m) {
          h[k2]![k2 - 1] = v[0];
          h[k2 + 1]![k2 - 1] = 0;
          if (k2 < i - 1) h[k2 + 2]![k2 - 1] = 0;
        } else if (m > l) {
          h[k2]![k2 - 1] = -h[k2]![k2 - 1]!;
        }
        const v2 = v[1]!;
        const t2 = t1 * v2;
        if (nr === 3) {
          const v3 = v[2]!;
          const t3 = t1 * v3;
          for (let j = k2; j <= i2; j++) {
            const sum = h[k2]![j]! + v2 * h[k2 + 1]![j]! + v3 * h[k2 + 2]![j]!;
            h[k2]![j] = h[k2]![j]! - sum * t1;
            h[k2 + 1]![j] = h[k2 + 1]![j]! - sum * t2;
            h[k2 + 2]![j] = h[k2 + 2]![j]! - sum * t3;
          }
          for (let j = i1; j <= Math.min(k2 + 3, i); j++) {
            const sum = h[j]![k2]! + v2 * h[j]![k2 + 1]! + v3 * h[j]![k2 + 2]!;
            h[j]![k2] = h[j]![k2]! - sum * t1;
            h[j]![k2 + 1] = h[j]![k2 + 1]! - sum * t2;
            h[j]![k2 + 2] = h[j]![k2 + 2]! - sum * t3;
          }
          if (z) for (let j = ilo; j <= ihi; j++) {
            const sum = z[j]![k2]! + v2 * z[j]![k2 + 1]! + v3 * z[j]![k2 + 2]!;
            z[j]![k2] = z[j]![k2]! - sum * t1;
            z[j]![k2 + 1] = z[j]![k2 + 1]! - sum * t2;
            z[j]![k2 + 2] = z[j]![k2 + 2]! - sum * t3;
          }
        } else if (nr === 2) {
          for (let j = k2; j <= i2; j++) {
            const sum = h[k2]![j]! + v2 * h[k2 + 1]![j]!;
            h[k2]![j] = h[k2]![j]! - sum * t1;
            h[k2 + 1]![j] = h[k2 + 1]![j]! - sum * t2;
          }
          for (let j = i1; j <= i; j++) {
            const sum = h[j]![k2]! + v2 * h[j]![k2 + 1]!;
            h[j]![k2] = h[j]![k2]! - sum * t1;
            h[j]![k2 + 1] = h[j]![k2 + 1]! - sum * t2;
          }
          if (z) for (let j = ilo; j <= ihi; j++) {
            const sum = z[j]![k2]! + v2 * z[j]![k2 + 1]!;
            z[j]![k2] = z[j]![k2]! - sum * t1;
            z[j]![k2 + 1] = z[j]![k2 + 1]! - sum * t2;
          }
        }
      }
    }
    if (!converged) throw new EvalError('runtime', 'eigenvalues did not converge');
    if (l === i) {
      wr[i] = h[i]![i]!;
      wi[i] = 0;
    } else if (l === i - 1) {
      const s2 = dlanv2(h[i - 1]![i - 1]!, h[i - 1]![i]!, h[i]![i - 1]!, h[i]![i]!);
      h[i - 1]![i - 1] = s2.a;
      h[i - 1]![i] = s2.b;
      h[i]![i - 1] = s2.c;
      h[i]![i] = s2.d;
      wr[i - 1] = s2.rt1r;
      wi[i - 1] = s2.rt1i;
      wr[i] = s2.rt2r;
      wi[i] = s2.rt2i;
      const { cs, sn } = s2;
      if (wantt) {
        // The rest of rows i−1 and i, and of columns i−1 and i, turn with the block.
        rotate(i2 - i, (k) => [h[i - 1]![i + 1 + k]!, h[i]![i + 1 + k]!], (k, x, y) => {
          h[i - 1]![i + 1 + k] = x;
          h[i]![i + 1 + k] = y;
        }, cs, sn);
        rotate(i - i1 - 1, (k) => [h[i1 + k]![i - 1]!, h[i1 + k]![i]!], (k, x, y) => {
          h[i1 + k]![i - 1] = x;
          h[i1 + k]![i] = y;
        }, cs, sn);
      }
      if (z) {
        rotate(ihi - ilo + 1, (k) => [z[ilo + k]![i - 1]!, z[ilo + k]![i]!], (k, x, y) => {
          z[ilo + k]![i - 1] = x;
          z[ilo + k]![i] = y;
        }, cs, sn);
      }
    }
    itn -= its;
    i = l - 1;
  }
}

type Cx = [number, number];
const cdiv = (a: Cx, b: Cx): Cx => {
  // dladiv's job, Smith's way: no overflow for the sizes met here.
  if (Math.abs(b[1]) <= Math.abs(b[0])) {
    const r = b[1] / b[0];
    const d = b[0] + b[1] * r;
    return [(a[0] + a[1] * r) / d, (a[1] - a[0] * r) / d];
  }
  const r = b[0] / b[1];
  const d = b[0] * r + b[1];
  return [(a[0] * r + a[1]) / d, (a[1] * r - a[0]) / d];
};
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const csub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]];

/**
 * dlaln2's job for dtrevc: solves (T_block − w·I)·x = rhs for a 1 × 1 or 2 × 2 diagonal block of T, w = wr + i·wi.
 * A pivot smaller than smin is taken as smin, so a repeated eigenvalue still gives a vector.
 */
function smallSolve(block: number[][], w: Cx, rhs: Cx[], smin: number): Cx[] {
  if (block.length === 1) {
    let c: Cx = [block[0]![0]! - w[0], -w[1]];
    if (Math.abs(c[0]) + Math.abs(c[1]) < smin) c = [smin, 0];
    return [cdiv(rhs[0]!, c)];
  }
  // 2 × 2, by elimination with complete pivoting, as dlaln2.
  const m: Cx[][] = [
    [[block[0]![0]! - w[0], -w[1]], [block[0]![1]!, 0]],
    [[block[1]![0]!, 0], [block[1]![1]! - w[0], -w[1]]],
  ];
  const size = (c: Cx): number => Math.abs(c[0]) + Math.abs(c[1]);
  let pr = 0;
  let pc = 0;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) if (size(m[r]![c]!) > size(m[pr]![pc]!)) [pr, pc] = [r, c];
  if (size(m[pr]![pc]!) < smin) return rhs.map((b) => cdiv(b, [smin, 0]));
  const [or, oc] = [1 - pr, 1 - pc];
  const l = cdiv(m[or]![pc]!, m[pr]![pc]!);
  let u = csub(m[or]![oc]!, cmul(l, m[pr]![oc]!));
  if (size(u) < smin) u = [smin, 0];
  const b2 = csub(rhs[or]!, cmul(l, rhs[pr]!));
  const x: Cx[] = [[0, 0], [0, 0]];
  x[oc] = cdiv(b2, u);
  x[pc] = cdiv(csub(rhs[pr]!, cmul(m[pr]![oc]!, x[oc]!)), m[pr]![pc]!);
  return x;
}

/**
 * dtrevc, right eigenvectors, back-transformed: for each eigenvalue of the quasi-triangular T, from the last
 * down, a vector x with T·x = λ·x by back-substitution from dtrevc's start, then z·x. A real eigenvalue's start
 * is 1 at its own row; a complex pair's is 1 in the row whose off-diagonal entry of the 2 × 2 block is the
 * larger. The start fixes the vector's sign, which is why this matches dgeev where inverse iteration can't.
 */
function rightVectors(t: number[][], z: number[][]): number[][] {
  const n = t.length;
  const ulp = 2 ** -52;
  const smlnum = 2 ** -1022 * (n / ulp);
  const vr = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const backTransform = (x: number[], col: number): void => {
    for (let r = 0; r < n; r++) {
      let s = 0;
      for (let k = 0; k < x.length; k++) s += z[r]![k]! * x[k]!;
      vr[r]![col] = s;
    }
  };
  for (let ki = n - 1; ki >= 0; ki--) {
    const pair = ki > 0 && t[ki]![ki - 1] !== 0;
    const wr = t[ki]![ki]!;
    const wi = pair ? Math.sqrt(Math.abs(t[ki]![ki - 1]!)) * Math.sqrt(Math.abs(t[ki - 1]![ki]!)) : 0;
    const smin = Math.max(ulp * (Math.abs(wr) + Math.abs(wi)), smlnum);
    // x as complex numbers over rows 0..ki; the rows above the start are solved upwards.
    const x: Cx[] = Array.from({ length: ki + 1 }, (): Cx => [0, 0]);
    let top: number;
    if (!pair) {
      x[ki] = [1, 0];
      for (let k = 0; k < ki; k++) x[k] = [-t[k]![ki]!, 0];
      top = ki - 1;
    } else {
      if (Math.abs(t[ki - 1]![ki]!) >= Math.abs(t[ki]![ki - 1]!)) {
        x[ki - 1] = [1, 0];
        x[ki] = [0, wi / t[ki - 1]![ki]!];
      } else {
        x[ki - 1] = [-wi / t[ki]![ki - 1]!, 0];
        x[ki] = [0, 1];
      }
      for (let k = 0; k < ki - 1; k++) x[k] = [-x[ki - 1]![0] * t[k]![ki - 1]!, -x[ki]![1] * t[k]![ki]!];
      top = ki - 2;
    }
    const w: Cx = [wr, wi];
    for (let j = top; j >= 0;) {
      const two = j > 0 && t[j]![j - 1] !== 0;
      const j1 = two ? j - 1 : j;
      const block = two ? [[t[j1]![j1]!, t[j1]![j]!], [t[j]![j1]!, t[j]![j]!]] : [[t[j]![j]!]];
      const sol = smallSolve(block, w, two ? [x[j1]!, x[j]!] : [x[j]!], smin);
      sol.forEach((v, r) => {
        x[j1 + r] = v;
      });
      for (let k = 0; k < j1; k++) {
        for (let r = 0; r < sol.length; r++) {
          x[k] = [x[k]![0] - sol[r]![0] * t[k]![j1 + r]!, x[k]![1] - sol[r]![1] * t[k]![j1 + r]!];
        }
      }
      j = j1 - 1;
    }
    if (!pair) {
      backTransform(x.map((c) => c[0]), ki);
    } else {
      backTransform(x.map((c) => c[0]), ki - 1);
      backTransform(x.map((c) => c[1]), ki);
      ki--;
    }
  }
  return vr;
}

/** dgebak with job 'B' for right vectors: undoes the balancing's scaling, then its permutations. */
function undoBalance(v: number[][], ilo: number, ihi: number, scale: number[]): void {
  const n = v.length;
  if (ilo !== ihi) for (let i = ilo; i <= ihi; i++) v[i] = v[i]!.map((x) => x * scale[i]!);
  for (let ii = 0; ii < n; ii++) {
    let i = ii;
    if (i >= ilo && i <= ihi) continue;
    if (i < ilo) i = ilo - 1 - ii;
    const k = scale[i]!;
    if (k !== i) [v[i], v[k]] = [v[k]!, v[i]!];
  }
}

/**
 * dgeev's last step: each real vector to unit length; each complex pair to unit length together, then turned so
 * its largest component is real (LAPACK 3.0's dlartg).
 */
function normalize(v: number[][], wi: number[]): void {
  const n = v.length;
  const col = (j: number): number[] => v.map((row) => row[j]!);
  const scaleCol = (j: number, s: number): void => v.forEach((row) => {
    row[j] = row[j]! * s;
  });
  for (let i = 0; i < n; i++) {
    if (wi[i] === 0) {
      scaleCol(i, 1 / dnrm2(col(i)));
    } else if (wi[i]! > 0) {
      const scl = 1 / dlapy2(dnrm2(col(i)), dnrm2(col(i + 1)));
      scaleCol(i, scl);
      scaleCol(i + 1, scl);
      let k = 0;
      let best = -1;
      for (let r = 0; r < n; r++) {
        const m = v[r]![i]! ** 2 + v[r]![i + 1]! ** 2;
        if (m > best) [best, k] = [m, r];
      }
      const f = v[k]![i]!;
      const g = v[k]![i + 1]!;
      // dlartg as LAPACK 3.0: r = √(f² + g²), made to share f's sign only when |f| > |g|.
      let cs = 1;
      let sn = 0;
      if (g !== 0 && f === 0) {
        cs = 0;
        sn = 1;
      } else if (g !== 0) {
        const r = Math.sqrt(f * f + g * g);
        cs = f / r;
        sn = g / r;
        if (Math.abs(f) > Math.abs(g) && cs < 0) {
          cs = -cs;
          sn = -sn;
        }
      }
      rotate(n, (r) => [v[r]![i]!, v[r]![i + 1]!], (r, x, y) => {
        v[r]![i] = x;
        v[r]![i + 1] = y;
      }, cs, sn);
      v[k]![i + 1] = 0;
    }
  }
}

export function eigenvalues(m: Mat): Mat {
  if (m.rows !== m.cols) throw new EvalError('runtime', 'array must be square');
  if (m.cells || m.im) throw new EvalError('unsupported', 'complex or nested array in eigenvals');
  const n = m.rows;
  const a = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => m.re[i + j * n]!));
  const { re, im } = lapackEigenvalues(a);
  const out = newMat(n, 1, m.dim);
  out.re.set(re);
  if (im.some((x) => x !== 0)) out.im = Float64Array.from(im);
  return out;
}
