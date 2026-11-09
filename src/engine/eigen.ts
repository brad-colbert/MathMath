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
 * Eigenvalues as LAPACK's dgeev finds them, which gives Mathcad 14's order: balance (dgebal, permuting to isolate
 * eigenvalues, then scaling by powers of 2), reduce to Hessenberg form by Householder reflections (dgehd2), then
 * the double-shift QR iteration of dlahqr with dlanv2's 2 × 2 standardization. An eigenvalue's place in the
 * answer is where it converged in the matrix, so these steps decide the order, which Mathcad doesn't sort.
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
  dlahqr(a, ilo, ihi, re, im);
  return { re, im };
}

/** dgebal with job 'B': permutes to isolate eigenvalues, then scales by powers of 2. Returns ilo..ihi, 0-based. */
function balance(a: number[][]): { ilo: number; ihi: number } {
  const n = a.length;
  let k = 0;
  let l = n - 1;
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
      swap(j, l);
      if (l === 0) return { ilo: 0, ihi: 0 };
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
      swap(j, k);
      k++;
      continue cols;
    }
    break;
  }
  // Scaling, as LAPACK 3.5 and later: by 2-norms, in powers of 2, which changes no eigenvalue.
  const sfmin1 = 2 ** -1022 / 2 ** -52;
  const sfmax1 = 1 / sfmin1;
  const sfmin2 = sfmin1 * 2;
  const sfmax2 = 1 / sfmin2;
  let noconv = true;
  const scale = new Array<number>(n).fill(1);
  while (noconv) {
    noconv = false;
    for (let i = k; i <= l; i++) {
      let c = 0;
      let r = 0;
      for (let j = k; j <= l; j++) {
        c += a[j]![i]! ** 2;
        r += a[i]![j]! ** 2;
      }
      [c, r] = [Math.sqrt(c), Math.sqrt(r)];
      let ca = 0;
      for (let j = 0; j <= l; j++) ca = Math.max(ca, Math.abs(a[j]![i]!));
      let ra = 0;
      for (let j = k; j < n; j++) ra = Math.max(ra, Math.abs(a[i]![j]!));
      if (c === 0 || r === 0) continue;
      let g = r / 2;
      let f = 1;
      const s = c + r;
      while (!(c >= g || Math.max(f, c, ca) >= sfmax2 || Math.min(r, g, ra) <= sfmin2)) {
        f *= 2;
        c *= 2;
        ca *= 2;
        r /= 2;
        g /= 2;
        ra /= 2;
      }
      g = c / 2;
      while (!(g < r || Math.max(r, ra) >= sfmax2 || Math.min(f, c, g, ca) <= sfmin2)) {
        f /= 2;
        c /= 2;
        g /= 2;
        ca /= 2;
        r *= 2;
        ra *= 2;
      }
      if (c + r >= 0.95 * s) continue;
      if (f < 1 && scale[i]! < 1 && f * scale[i]! <= sfmin1) continue;
      if (f > 1 && scale[i]! > 1 && scale[i]! >= sfmax1 / f) continue;
      scale[i] = scale[i]! * f;
      noconv = true;
      for (let j = k; j < n; j++) a[i]![j] = a[i]![j]! / f;
      for (let j = 0; j <= l; j++) a[j]![i] = a[j]![i]! * f;
    }
  }
  return { ilo: k, ihi: l };
}

/** dlarfg: the reflector I − τ·v·vᵀ, v = (1, x), that takes (α, x) to (β, 0). Overwrites x with v's tail. */
function reflector(alpha: number, x: number[]): { beta: number; tau: number } {
  let xnorm = 0;
  for (const v of x) xnorm = Math.hypot(xnorm, v);
  if (xnorm === 0) return { beta: alpha, tau: 0 };
  const beta = -Math.sign(alpha || 1) * Math.hypot(alpha, xnorm);
  const tau = (beta - alpha) / beta;
  for (let i = 0; i < x.length; i++) x[i] = x[i]! / (alpha - beta);
  return { beta, tau };
}

/** dgehd2: Householder reduction of rows and columns ilo..ihi to upper Hessenberg form. */
function householderHessenberg(a: number[][], ilo: number, ihi: number): void {
  const n = a.length;
  for (let i = ilo; i < ihi - 1; i++) {
    const x: number[] = [];
    for (let r = i + 2; r <= ihi; r++) x.push(a[r]![i]!);
    const { beta, tau } = reflector(a[i + 1]![i]!, x);
    const v = [1, ...x];
    // From the right, on rows 0..ihi and columns i+1..ihi.
    if (tau !== 0) {
      for (let r = 0; r <= ihi; r++) {
        let w = 0;
        for (let c = 0; c < v.length; c++) w += a[r]![i + 1 + c]! * v[c]!;
        for (let c = 0; c < v.length; c++) a[r]![i + 1 + c] = a[r]![i + 1 + c]! - tau * w * v[c]!;
      }
      // From the left, on rows i+1..ihi and columns i+1..n−1.
      for (let c = i + 1; c < n; c++) {
        let w = 0;
        for (let r = 0; r < v.length; r++) w += a[i + 1 + r]![c]! * v[r]!;
        for (let r = 0; r < v.length; r++) a[i + 1 + r]![c] = a[i + 1 + r]![c]! - tau * w * v[r]!;
      }
    }
    a[i + 1]![i] = beta;
    for (let r = i + 2; r <= ihi; r++) a[r]![i] = 0;
  }
}

const sign = (a: number, b: number): number => (b >= 0 || Object.is(b, 0) ? Math.abs(a) : -Math.abs(a));

/** dlanv2: a 2 × 2 block's eigenvalues, in the order its standardized Schur form gives them. */
function dlanv2(a0: number, b0: number, c0: number, d0: number): [number, number, number, number] {
  let [a, b, c, d] = [a0, b0, c0, d0];
  const eps = 2 ** -52;
  if (c === 0) {
    // Already upper triangular.
  } else if (b === 0) {
    [a, d] = [d, a];
    b = -c;
    c = 0;
  } else if (a - d === 0 && sign(1, b) !== sign(1, c)) {
    // A standard complex pair already.
  } else {
    const temp = a - d;
    let p = 0.5 * temp;
    const bcmax = Math.max(Math.abs(b), Math.abs(c));
    const bcmis = Math.min(Math.abs(b), Math.abs(c)) * sign(1, b) * sign(1, c);
    const scale = Math.max(Math.abs(p), bcmax);
    let z = (p / scale) * p + (bcmax / scale) * bcmis;
    if (z >= 4 * eps) {
      // Real eigenvalues.
      z = p + sign(Math.sqrt(scale) * Math.sqrt(z), p);
      a = d + z;
      d -= (bcmax / z) * bcmis;
      b -= c;
      c = 0;
    } else {
      // Complex, or two nearly equal real eigenvalues: make the diagonal equal.
      const sigma = b + c;
      const tau = Math.hypot(sigma, temp);
      const cs = Math.sqrt(0.5 * (1 + Math.abs(sigma) / tau));
      const sn = -(p / (tau * cs)) * sign(1, sigma);
      const aa = a * cs + b * sn;
      const bb = -a * sn + b * cs;
      const cc = c * cs + d * sn;
      const dd = -c * sn + d * cs;
      a = aa * cs + cc * sn;
      b = bb * cs + dd * sn;
      c = -aa * sn + cc * cs;
      d = -bb * sn + dd * cs;
      const mid = 0.5 * (a + d);
      a = mid;
      d = mid;
      if (c !== 0) {
        if (b !== 0) {
          if (sign(1, b) === sign(1, c)) {
            // Real after all: make it upper triangular.
            const sab = Math.sqrt(Math.abs(b));
            const sac = Math.sqrt(Math.abs(c));
            p = sign(sab * sac, c);
            a = mid + p;
            d = mid - p;
            b -= c;
            c = 0;
          }
        } else {
          b = -c;
          c = 0;
        }
      }
    }
  }
  if (c === 0) return [a, 0, d, 0];
  const i = Math.sqrt(Math.abs(b)) * Math.sqrt(Math.abs(c));
  return [a, i, d, -i];
}

/** dlahqr, eigenvalues only: double-shift QR on the Hessenberg rows and columns ilo..ihi. */
function dlahqr(h: number[][], ilo: number, ihi: number, wr: number[], wi: number[]): void {
  if (ilo === ihi) {
    wr[ilo] = h[ilo]![ilo]!;
    wi[ilo] = 0;
    return;
  }
  for (let j = ilo; j <= ihi - 3; j++) {
    h[j + 2]![j] = 0;
    h[j + 3]![j] = 0;
  }
  if (ilo <= ihi - 2) h[ihi]![ihi - 2] = 0;
  const nh = ihi - ilo + 1;
  const ulp = 2 ** -52;
  const smlnum = 2 ** -1022 * (nh / ulp);
  const itmax = 30 * Math.max(10, nh);
  let kdefl = 0;
  let i = ihi;
  while (i >= ilo) {
    let l = ilo;
    let converged = false;
    for (let its = 0; its <= itmax; its++) {
      let k: number;
      for (k = i; k > l; k--) {
        if (Math.abs(h[k]![k - 1]!) <= smlnum) break;
        let tst = Math.abs(h[k - 1]![k - 1]!) + Math.abs(h[k]![k]!);
        if (tst === 0) {
          if (k - 2 >= ilo) tst += Math.abs(h[k - 1]![k - 2]!);
          if (k + 1 <= ihi) tst += Math.abs(h[k + 1]![k]!);
        }
        if (Math.abs(h[k]![k - 1]!) <= ulp * tst) {
          const ab = Math.max(Math.abs(h[k]![k - 1]!), Math.abs(h[k - 1]![k]!));
          const ba = Math.min(Math.abs(h[k]![k - 1]!), Math.abs(h[k - 1]![k]!));
          const aa = Math.max(Math.abs(h[k]![k]!), Math.abs(h[k - 1]![k - 1]! - h[k]![k]!));
          const bb = Math.min(Math.abs(h[k]![k]!), Math.abs(h[k - 1]![k - 1]! - h[k]![k]!));
          const s = aa + ab;
          if (ba * (ab / s) <= Math.max(smlnum, ulp * (bb * (aa / s)))) break;
        }
      }
      l = k;
      if (l > ilo) h[l]![l - 1] = 0;
      if (l >= i - 1) {
        converged = true;
        break;
      }
      kdefl++;
      const [i1, i2] = [l, i];
      let h11: number;
      let h12: number;
      let h21: number;
      let h22: number;
      if (kdefl % 20 === 0) {
        const s = Math.abs(h[i]![i - 1]!) + Math.abs(h[i - 1]![i - 2]!);
        h11 = 0.75 * s + h[i]![i]!;
        h12 = -0.4375 * s;
        h21 = s;
        h22 = h11;
      } else if (kdefl % 10 === 0) {
        const s = Math.abs(h[l + 1]![l]!) + Math.abs(h[l + 2]![l + 1]!);
        h11 = 0.75 * s + h[l]![l]!;
        h12 = -0.4375 * s;
        h21 = s;
        h22 = h11;
      } else {
        h11 = h[i - 1]![i - 1]!;
        h21 = h[i]![i - 1]!;
        h12 = h[i - 1]![i]!;
        h22 = h[i]![i]!;
      }
      const s0 = Math.abs(h11) + Math.abs(h12) + Math.abs(h21) + Math.abs(h22);
      let [rt1r, rt1i, rt2r, rt2i] = [0, 0, 0, 0];
      if (s0 !== 0) {
        h11 /= s0;
        h21 /= s0;
        h12 /= s0;
        h22 /= s0;
        const tr = (h11 + h22) / 2;
        const det = (h11 - tr) * (h22 - tr) - h12 * h21;
        const rtdisc = Math.sqrt(Math.abs(det));
        if (det >= 0) {
          rt1r = tr * s0;
          rt2r = rt1r;
          rt1i = rtdisc * s0;
          rt2i = -rt1i;
        } else {
          rt1r = tr + rtdisc;
          rt2r = tr - rtdisc;
          if (Math.abs(rt1r - h22) <= Math.abs(rt2r - h22)) {
            rt1r *= s0;
            rt2r = rt1r;
          } else {
            rt2r *= s0;
            rt1r = rt2r;
          }
        }
      }
      let m: number;
      const v = [0, 0, 0];
      for (m = i - 2; m >= l; m--) {
        let h21s = h[m + 1]![m]!;
        let s = Math.abs(h[m]![m]! - rt2r) + Math.abs(rt2i) + Math.abs(h21s);
        h21s = h[m + 1]![m]! / s;
        v[0] = h21s * h[m]![m + 1]! + (h[m]![m]! - rt1r) * ((h[m]![m]! - rt2r) / s) - rt1i * (rt2i / s);
        v[1] = h21s * (h[m]![m]! + h[m + 1]![m + 1]! - rt1r - rt2r);
        v[2] = h21s * h[m + 2]![m + 1]!;
        s = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
        v[0] /= s;
        v[1] /= s;
        v[2] /= s;
        if (m === l) break;
        const h00 = Math.abs(h[m]![m - 1]!) * (Math.abs(v[1]) + Math.abs(v[2]));
        const h01 = Math.abs(v[0]) * (Math.abs(h[m - 1]![m - 1]!) + Math.abs(h[m]![m]!) + Math.abs(h[m + 1]![m + 1]!));
        if (h00 <= ulp * h01) break;
      }
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
          h[k2]![k2 - 1] = h[k2]![k2 - 1]! * (1 - t1);
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
        }
      }
    }
    if (!converged) throw new EvalError('runtime', 'eigenvalues did not converge');
    if (l === i) {
      wr[i] = h[i]![i]!;
      wi[i] = 0;
    } else if (l === i - 1) {
      const [a1, b1, a2, b2] = dlanv2(h[i - 1]![i - 1]!, h[i - 1]![i]!, h[i]![i - 1]!, h[i]![i]!);
      wr[i - 1] = a1;
      wi[i - 1] = b1;
      wr[i] = a2;
      wi[i] = b2;
    }
    kdefl = 0;
    i = l - 1;
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
