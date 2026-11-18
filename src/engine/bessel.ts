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
 * Bessel functions of real argument and any real order, for Mathcad's J0 … Kn, H1, H2, Ai … DBi, ber, bei, js and
 * ys, with their scaled .sc forms. The core is Steed's method with Temme's series (Numerical Recipes' bessjy and
 * bessik), which gives J, Y, I and K of order ν ≥ 0 at x > 0 to about 1e−15. Negative orders come by reflection,
 * negative x by DLMF 10.11.1 and 10.34.1–2: a fractional order gives a complex value there, as it should.
 */
import { airy, besh, besi, besj, besk, besy, biry } from './amos.js';
import { cdiv, csqrt } from './complex.js';
import { EvalError, NODIM, type Num, type Value, isNoDim, num } from './values.js';

type Impl = (...args: Value[]) => Value;

const EPS = 1e-16;
// The smallest normal double over EPS, as Numerical Recipes 3 takes it: 1/FPMIN must still fit.
const FPMIN = 2.2250738585072014e-308 / EPS;
const MAXIT = 1_000_000;
const XMIN = 2;

/** Chebyshev series, by Clenshaw's recurrence, on [−1, 1]. */
function chebev(c: number[], y: number): number {
  let d = 0;
  let dd = 0;
  for (let j = c.length - 1; j >= 1; j--) [d, dd] = [2 * y * d - dd + c[j]!, d];
  return y * d - dd + 0.5 * c[0]!;
}
/** Γ₁(μ) and Γ₂(μ) for |μ| ≤ ½, and 1/Γ(1 + μ), 1/Γ(1 − μ), as Temme's series needs them (NR beschb). */
function beschb(x: number): { gam1: number; gam2: number; gampl: number; gammi: number } {
  const c1 = [-1.142022680371168e0, 6.5165112670737e-3, 3.087090173086e-4, -3.4706269649e-6, 6.9437664e-9, 3.67795e-11, -1.356e-13];
  const c2 = [1.843740587300905e0, -7.68528408447867e-2, 1.2719271366546e-3, -4.9717367042e-6, -3.31261198e-8, 2.423096e-10, -1.702e-13, -1.49e-15];
  const xx = 8 * x * x - 1;
  const gam1 = chebev(c1, xx);
  const gam2 = chebev(c2, xx);
  return { gam1, gam2, gampl: gam2 - x * gam1, gammi: gam2 + x * gam1 };
}

/** J_ν(x), Y_ν(x) and their derivatives, for ν ≥ 0 and x > 0 (NR bessjy). */
export function bessjy(x: number, xnu: number): { j: number; y: number; jp: number; yp: number } {
  const nl = x < XMIN ? Math.trunc(xnu + 0.5) : Math.max(0, Math.trunc(xnu - x + 1.5));
  const xmu = xnu - nl;
  const xmu2 = xmu * xmu;
  const xi = 1 / x;
  const xi2 = 2 * xi;
  const w = xi2 / Math.PI;
  let isign = 1;
  let h = xnu * xi;
  if (h < FPMIN) h = FPMIN;
  let b = xi2 * xnu;
  let d = 0;
  let c = h;
  let i = 1;
  for (; i <= MAXIT; i++) {
    b += xi2;
    d = b - d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b - 1 / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = c * d;
    h *= del;
    if (d < 0) isign = -isign;
    if (Math.abs(del - 1) < EPS) break;
  }
  if (i > MAXIT) throw new EvalError('runtime', 'Bessel function: x is too large');
  let rjl = isign * FPMIN;
  let rjpl = h * rjl;
  let rjl1 = rjl;
  let rjp1 = rjpl;
  let fact = xnu * xi;
  for (let l = nl; l >= 1; l--) {
    const rjtemp = fact * rjl + rjpl;
    fact -= xi;
    rjpl = fact * rjtemp - rjl;
    rjl = rjtemp;
    // Keep the recurrence in range; the starting values scale with it.
    if (Math.abs(rjl) > 1e250) {
      rjl *= 1e-250;
      rjpl *= 1e-250;
      rjl1 *= 1e-250;
      rjp1 *= 1e-250;
    }
  }
  if (rjl === 0) rjl = EPS;
  const f = rjpl / rjl;
  let rjmu: number;
  let rymu: number;
  let ry1: number;
  if (x < XMIN) {
    const x2 = 0.5 * x;
    const pimu = Math.PI * xmu;
    const fct = Math.abs(pimu) < EPS ? 1 : pimu / Math.sin(pimu);
    let dd = -Math.log(x2);
    let e = xmu * dd;
    const fact2 = Math.abs(e) < EPS ? 1 : Math.sinh(e) / e;
    const { gam1, gam2, gampl, gammi } = beschb(xmu);
    let ff = (2 / Math.PI) * fct * (gam1 * Math.cosh(e) + gam2 * fact2 * dd);
    e = Math.exp(e);
    let p = e / (gampl * Math.PI);
    let q = 1 / (e * Math.PI * gammi);
    const pimu2 = 0.5 * pimu;
    const fact3 = Math.abs(pimu2) < EPS ? 1 : Math.sin(pimu2) / pimu2;
    const r = Math.PI * pimu2 * fact3 * fact3;
    let cc = 1;
    dd = -x2 * x2;
    let sum = ff + r * q;
    let sum1 = p;
    let k = 1;
    for (; k <= MAXIT; k++) {
      ff = (k * ff + p + q) / (k * k - xmu2);
      cc *= dd / k;
      p /= k - xmu;
      q /= k + xmu;
      const del = cc * (ff + r * q);
      sum += del;
      sum1 += cc * p - k * del;
      if (Math.abs(del) < (1 + Math.abs(sum)) * EPS) break;
    }
    rymu = -sum;
    ry1 = -sum1 * xi2;
    const rymup = xmu * xi * rymu - ry1;
    rjmu = w / (rymup - f * rymu);
  } else {
    let a = 0.25 - xmu2;
    let p = -0.5 * xi;
    let q = 1;
    const br = 2 * x;
    let bi = 2;
    let fct = (a * xi) / (p * p + q * q);
    let cr = br + q * fct;
    let ci = bi + p * fct;
    let den = br * br + bi * bi;
    let dr = br / den;
    let di = -bi / den;
    let dlr = cr * dr - ci * di;
    let dli = cr * di + ci * dr;
    let temp = p * dlr - q * dli;
    q = p * dli + q * dlr;
    p = temp;
    let k = 2;
    for (; k <= MAXIT; k++) {
      a += 2 * (k - 1);
      bi += 2;
      dr = a * dr + br;
      di = a * di + bi;
      if (Math.abs(dr) + Math.abs(di) < FPMIN) dr = FPMIN;
      fct = a / (cr * cr + ci * ci);
      cr = br + cr * fct;
      ci = bi - ci * fct;
      if (Math.abs(cr) + Math.abs(ci) < FPMIN) cr = FPMIN;
      den = dr * dr + di * di;
      dr /= den;
      di /= -den;
      dlr = cr * dr - ci * di;
      dli = cr * di + ci * dr;
      temp = p * dlr - q * dli;
      q = p * dli + q * dlr;
      p = temp;
      if (Math.abs(dlr - 1) + Math.abs(dli) < EPS) break;
    }
    const gam = (p - f) / q;
    rjmu = Math.sqrt(w / ((p - f) * gam + q));
    rjmu = rjl < 0 ? -rjmu : rjmu;
    rymu = rjmu * gam;
    const rymup = rymu * (p + q / gam);
    ry1 = xmu * xi * rymu - rymup;
  }
  const scale = rjmu / rjl;
  const j = rjl1 * scale;
  const jp = rjp1 * scale;
  for (let k = 1; k <= nl; k++) {
    const rytemp = (xmu + k) * xi2 * ry1 - rymu;
    rymu = ry1;
    ry1 = rytemp;
  }
  return { j, y: rymu, jp, yp: xnu * xi * rymu - ry1 };
}

/** I_ν(x)·e^(−x) and K_ν(x)·e^x, scaled so that neither overflows, for ν ≥ 0 and x > 0 (NR bessik). */
export function bessikScaled(x: number, xnu: number): { i: number; k: number; ip: number; kp: number } {
  const nl = Math.trunc(xnu + 0.5);
  const xmu = xnu - nl;
  const xmu2 = xmu * xmu;
  const xi = 1 / x;
  const xi2 = 2 * xi;
  let h = xnu * xi;
  if (h < FPMIN) h = FPMIN;
  let b = xi2 * xnu;
  let d = 0;
  let c = h;
  let i = 1;
  for (; i <= MAXIT; i++) {
    b += xi2;
    d = 1 / (b + d);
    c = b + 1 / c;
    const del = c * d;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  if (i > MAXIT) throw new EvalError('runtime', 'Bessel function: x is too large');
  let ril = FPMIN;
  let ripl = h * ril;
  let ril1 = ril;
  let rip1 = ripl;
  let fact = xnu * xi;
  for (let l = nl; l >= 1; l--) {
    const ritemp = fact * ril + ripl;
    fact -= xi;
    ripl = fact * ritemp + ril;
    ril = ritemp;
    if (Math.abs(ril) > 1e250) {
      ril *= 1e-250;
      ripl *= 1e-250;
      ril1 *= 1e-250;
      rip1 *= 1e-250;
    }
  }
  const f = ripl / ril;
  let rkmu: number;
  let rk1: number;
  if (x < XMIN) {
    const x2 = 0.5 * x;
    const pimu = Math.PI * xmu;
    const fct = Math.abs(pimu) < EPS ? 1 : pimu / Math.sin(pimu);
    let dd = -Math.log(x2);
    let e = xmu * dd;
    const fact2 = Math.abs(e) < EPS ? 1 : Math.sinh(e) / e;
    const { gam1, gam2, gampl, gammi } = beschb(xmu);
    let ff = fct * (gam1 * Math.cosh(e) + gam2 * fact2 * dd);
    let sum = ff;
    e = Math.exp(e);
    let p = (0.5 * e) / gampl;
    let q = 0.5 / (e * gammi);
    let cc = 1;
    dd = x2 * x2;
    let sum1 = p;
    for (let k = 1; k <= MAXIT; k++) {
      ff = (k * ff + p + q) / (k * k - xmu2);
      cc *= dd / k;
      p /= k - xmu;
      q /= k + xmu;
      const del = cc * ff;
      sum += del;
      sum1 += cc * (p - k * ff);
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    // Scaled by e^x here, so the two branches agree.
    const ex = Math.exp(x);
    rkmu = sum * ex;
    rk1 = sum1 * xi2 * ex;
  } else {
    let bb = 2 * (1 + x);
    let dd = 1 / bb;
    let hh = dd;
    let delh = dd;
    let q1 = 0;
    let q2 = 1;
    const a1 = 0.25 - xmu2;
    let q = a1;
    let cc = a1;
    let a = -a1;
    let s = 1 + q * delh;
    for (let k = 2; k <= MAXIT; k++) {
      a -= 2 * (k - 1);
      cc = (-a * cc) / k;
      const qnew = (q1 - bb * q2) / a;
      q1 = q2;
      q2 = qnew;
      q += cc * qnew;
      bb += 2;
      dd = 1 / (bb + a * dd);
      delh = (bb * dd - 1) * delh;
      hh += delh;
      const dels = q * delh;
      s += dels;
      if (Math.abs(dels / s) < EPS) break;
    }
    hh = a1 * hh;
    rkmu = Math.sqrt(Math.PI / (2 * x)) / s;
    rk1 = rkmu * (xmu + x + 0.5 - hh) * xi;
  }
  const rkmup = xmu * xi * rkmu - rk1;
  // The Wronskian, with K scaled by e^x, gives I scaled by e^(−x).
  const rimu = xi / (f * rkmu - rkmup);
  const iv = (rimu * ril1) / ril;
  const ip = (rimu * rip1) / ril;
  for (let k = 1; k <= nl; k++) {
    const rktemp = (xmu + k) * xi2 * rk1 + rkmu;
    rkmu = rk1;
    rk1 = rktemp;
  }
  return { i: iv, k: rkmu, ip, kp: xnu * xi * rkmu - rk1 };
}

type Cx = [number, number];
const cexpi = (t: number): Cx => [Math.cos(t), Math.sin(t)];
const mulC = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const scaleC = (a: Cx, k: number): Cx => [a[0] * k, a[1] * k];
const addC = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
/** cos(πν) and sin(πν), exact at whole and half orders. */
function cospi(v: number): number {
  const r = Math.abs(v) % 2;
  if (r === 0.5 || r === 1.5) return 0;
  if (r === 0) return 1;
  if (r === 1) return -1;
  return Math.cos(Math.PI * v);
}
function sinpi(v: number): number {
  const r = ((v % 2) + 2) % 2;
  if (r === 0 || r === 1) return 0;
  if (r === 0.5) return 1;
  if (r === 1.5) return -1;
  return Math.sin(Math.PI * v);
}
const eipi = (v: number): Cx => [cospi(v), sinpi(v)];

/**
 * J_ν(x) and Y_ν(x) for large x by Hankel's expansion (DLMF 10.17.3–4), where the continued fractions would gather
 * rounding: null unless its terms fall to full precision before they start to grow.
 */
function jyAsymptotic(x: number, nu: number): { j: number; y: number } | null {
  if (x < 25) return null;
  const mu = 4 * nu * nu;
  let p = 0;
  let q = 0;
  let term = 1;
  for (let k = 0; k < 400; k++) {
    if (k % 2 === 0) p += (k % 4 === 0 ? 1 : -1) * term;
    else q += (k % 4 === 1 ? 1 : -1) * term;
    const next = (term * (mu - (2 * k + 1) ** 2)) / ((k + 1) * 8 * x);
    if (Math.abs(next) <= 1e-17 * Math.max(Math.abs(p), Math.abs(q), 1e-300)) {
      // χ = x − (ν/2 + ¼)π, taken apart so that a large x keeps its digits.
      const [c, s] = [Math.cos(x), Math.sin(x)];
      const [cf, sf] = [cospi(nu / 2 + 0.25), sinpi(nu / 2 + 0.25)];
      const [cosChi, sinChi] = [c * cf + s * sf, s * cf - c * sf];
      const front = Math.sqrt(2 / (Math.PI * x));
      return { j: front * (p * cosChi - q * sinChi), y: front * (p * sinChi + q * cosChi) };
    }
    if (Math.abs(next) >= Math.abs(term) && k > 2) return null;
    term = next;
  }
  return null;
}

/** J_ν and Y_ν at real x and any real ν; complex where x < 0 and ν isn't whole, and Y wherever x < 0. */
export function jy(nu: number, x: number, fn: string): { j: Cx; y: Cx } {
  if (x === 0 && fn.startsWith('Y')) {
    // Y_−ν = sin(νπ)·J_ν + cos(νπ)·Y_ν is finite at 0 when cos(νπ) is 0, a negative half-whole order: there it's 0.
    if (nu < 0 && cospi(-nu) === 0) return { j: [NaN, 0], y: [0, 0] };
    throw new EvalError('runtime', `${fn} is undefined at 0: it has a singularity`);
  }
  if (x === 0) {
    const whole = Number.isInteger(nu);
    let j: Cx;
    if (nu === 0) j = [1, 0];
    else if (nu > 0 || whole) j = [0, 0];
    else throw new EvalError('runtime', `${fn} is undefined at 0 for a negative order that isn't whole`);
    return { j, y: [NaN, 0] };
  }
  const ax = Math.abs(x);
  const v = Math.abs(nu);
  const r = jyAsymptotic(ax, v) ?? bessjy(ax, v);
  let J = r.j;
  let Y = r.y;
  if (nu < 0) {
    // DLMF 10.4.7–8: J_−ν = cos(νπ) J_ν − sin(νπ) Y_ν, Y_−ν = sin(νπ) J_ν + cos(νπ) Y_ν.
    const [c, s] = [cospi(v), sinpi(v)];
    [J, Y] = [c * r.j - s * r.y, s * r.j + c * r.y];
  }
  if (x > 0) return { j: [J, 0], y: [Y, 0] };
  // DLMF 10.11.1: J_ν(−x) = e^(iπν) J_ν(x); Y_ν(−x) = e^(−iπν) Y_ν(x) + 2i cos(πν) J_ν(x).
  const j = scaleC(eipi(nu), J);
  const y = addC(scaleC(eipi(-nu), Y), [0, 2 * cospi(nu) * J]);
  return { j, y };
}

/** I_ν and K_ν at real x and any real ν, each with its scale (I·e^(−|x|), K·e^x), so huge and tiny values survive. */
function ik(nu: number, x: number, fn: string): { i: Cx; k: Cx; iScale: number; kScale: number } {
  if (x === 0) {
    let i: Cx;
    if (nu === 0) i = [1, 0];
    else if (nu > 0 || Number.isInteger(nu)) i = [0, 0];
    else throw new EvalError('runtime', `${fn} is undefined at 0 for a negative order that isn't whole`);
    return { i, k: [NaN, 0], iScale: 0, kScale: 0 };
  }
  const ax = Math.abs(x);
  const v = Math.abs(nu);
  const r = bessikScaled(ax, v);
  // Scaled: I = Is·e^ax, K = Ks·e^(−ax).
  let Is = r.i;
  const Ks = r.k;
  if (nu < 0 && !Number.isInteger(nu)) {
    // DLMF 10.27.2: I_−ν = I_ν + (2/π) sin(νπ) K_ν; in scaled form K brings e^(−2ax).
    Is += (2 / Math.PI) * sinpi(v) * Ks * Math.exp(-2 * ax);
  }
  if (x > 0) return { i: [Is, 0], k: [Ks, 0], iScale: ax, kScale: -ax };
  // DLMF 10.34.1–2: I_ν(−x) = e^(iπν) I_ν(x); K_ν(−x) = e^(−iπν) K_ν(x) − iπ I_ν(x). With x < 0, e^x is e^(−ax):
  // K's scale is then e^(+ax)·… and I's part grows as e^(ax); both are written in I's scale.
  const i = scaleC(eipi(nu), Is);
  const kInIScale = addC(scaleC(eipi(-nu), Ks * Math.exp(-2 * ax)), [0, -Math.PI * Is]);
  return { i, k: kInIScale, iScale: ax, kScale: ax };
}

const tooBig = (fn: string): EvalError => new EvalError('runtime', `${fn} is too large to calculate here: over 10³⁰⁷`);
function scaled(v: Cx, logScale: number, fn: string): Cx {
  const s = Math.exp(logScale);
  const out: Cx = [v[0] * s, v[1] * s];
  if (!Number.isFinite(out[0]) || !Number.isFinite(out[1])) throw tooBig(fn);
  // A product of a huge scale and an exact 0 is 0, not NaN.
  return [Number.isNaN(out[0]) ? 0 : out[0], Number.isNaN(out[1]) ? 0 : out[1]];
}
const answer = (v: Cx, fn: string): Num => {
  if (Number.isNaN(v[0]) || Number.isNaN(v[1])) throw new EvalError('runtime', `${fn} is undefined here: it has a singularity`);
  if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) throw tooBig(fn);
  return num(v[0] + 0, NODIM, v[1] + 0);
};

/** A number without units, as [re, im]. */
function plain(v: Value | undefined, fn: string, what: string): Cx {
  if (v?.t !== 'num') throw new EvalError('runtime', `${fn}'s ${what} must be a number`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must have no units`);
  return [v.re, v.im];
}
/** A real argument or order, as Mathcad 14 asks for the orders and for ber and bei. */
function realX(v: Value | undefined, fn: string, what = 'argument'): number {
  const [re, im] = plain(v, fn, what);
  if (im !== 0) throw new EvalError('runtime', `${fn}'s ${what} must be real`);
  return re;
}

/**
 * What an Amos routine's error code means here. 1 is a bad input, which the callers rule out first; 2 is an
 * answer too large to hold; 3 is an argument or order so large that half the digits may be lost, which Amos still
 * computes and Mathcad 14 shows (probed at |z| = 5e4 and 1e8), so it's kept; 4 is one so large that none are left; 5 is no convergence.
 */
function amosCheck(ierr: number, fn: string): void {
  if (ierr === 2) throw tooBig(fn);
  if (ierr === 4) throw new EvalError('runtime', `${fn} can't be calculated this far out: the argument or order is too large to give any digits`);
  if (ierr === 5) throw new EvalError('runtime', `${fn} didn't converge here`);
  if (ierr === 1) throw new EvalError('runtime', `${fn} is undefined here`);
}
const kode = (sc: boolean): number => (sc ? 2 : 1);
/** cos(πν)·a − sin(πν)·b: J_−ν from J_ν and Y_ν, and, with −ν, Y_−ν from Y_ν and J_ν (DLMF 10.4.7–8). */
function rotateJY(a: Cx, b: Cx, v: number): Cx {
  const [c, s] = [cospi(v), sinpi(v)];
  // At a half-whole order c is 0: c·a is 0 even if a overflowed.
  if (c === 0) return scaleC(b, -s);
  return [c * a[0] - s * b[0], c * a[1] - s * b[1]];
}
function amosJ(nu: number, z: Cx, sc: boolean, fn: string): Cx {
  const v = Math.abs(nu);
  const j = besj(z, v, kode(sc), 1);
  amosCheck(j.ierr, fn);
  if (nu >= 0) return j.cy[0]!;
  if (Number.isInteger(v)) return v % 2 === 1 ? scaleC(j.cy[0]!, -1) : j.cy[0]!;
  const y = besy(z, v, kode(sc), 1);
  amosCheck(y.ierr, fn);
  return rotateJY(j.cy[0]!, y.cy[0]!, v);
}
function amosY(nu: number, z: Cx, sc: boolean, fn: string): Cx {
  const v = Math.abs(nu);
  const y = besy(z, v, kode(sc), 1);
  amosCheck(y.ierr, fn);
  if (nu >= 0) return y.cy[0]!;
  if (Number.isInteger(v)) return v % 2 === 1 ? scaleC(y.cy[0]!, -1) : y.cy[0]!;
  const j = besj(z, v, kode(sc), 1);
  amosCheck(j.ierr, fn);
  return rotateJY(y.cy[0]!, j.cy[0]!, -v);
}
function amosI(nu: number, z: Cx, sc: boolean, fn: string): Cx {
  const v = Math.abs(nu);
  const i = besi(z, v, kode(sc), 1);
  amosCheck(i.ierr, fn);
  if (nu >= 0 || Number.isInteger(v)) return i.cy[0]!;
  // DLMF 10.27.2: I_−ν = I_ν + (2/π) sin(νπ) K_ν.
  const k = besk(z, v, kode(sc), 1);
  amosCheck(k.ierr, fn);
  let kv = k.cy[0]!;
  // Scaled, K comes as K·e^z: turn it into I's scale, e^(−|Re z|), as SciPy does.
  if (sc) kv = scaleC(mulC(kv, cexpi(-z[1])), z[0] > 0 ? Math.exp(-2 * z[0]) : 1);
  const f = (2 / Math.PI) * Math.sin(v * Math.PI);
  return [i.cy[0]![0] + f * kv[0], i.cy[0]![1] + f * kv[1]];
}
/** One Bessel function at order nu and complex z, by Amos's routines: DLMF 10.4.7–8, 10.27.2–3 and 10.4.6 for negative orders. */
function complexBessel(kind: Kind, nu: number, z: Cx, sc: boolean, fn: string): Num {
  if (kind === 'J') return answer(amosJ(nu, z, sc, fn), fn);
  if (kind === 'Y') return answer(amosY(nu, z, sc, fn), fn);
  if (kind === 'I') return answer(amosI(nu, z, sc, fn), fn);
  if (kind === 'K') {
    const k = besk(z, Math.abs(nu), kode(sc), 1);
    amosCheck(k.ierr, fn);
    return answer(k.cy[0]!, fn);
  }
  // H1_−ν = e^(iπν) H1_ν, H2_−ν = e^(−iπν) H2_ν.
  const m = kind === 'H1' ? 1 : 2;
  const h = besh(z, Math.abs(nu), kode(sc), m, 1);
  amosCheck(h.ierr, fn);
  const v = h.cy[0]!;
  return answer(nu >= 0 ? v : mulC(v, eipi(m === 1 ? -nu : nu)), fn);
}
/** The Airy functions at complex z, by Amos's zairy and zbiry. Scaled, Ai and Ai′ by e^ζ, Bi and Bi′ by e^(−|Re ζ|), ζ = ⅔·z^(3/2). */
function complexAiry(name: 'Ai' | 'Bi' | 'DAi' | 'DBi', z: Cx, sc: boolean, fn: string): Num {
  const id = name.startsWith('D') ? 1 : 0;
  if (name.endsWith('Ai')) {
    const r = airy(z, id, kode(sc));
    amosCheck(r.ierr, fn);
    return answer(r.v, fn);
  }
  const r = biry(z, id, kode(sc));
  amosCheck(r.ierr, fn);
  return answer(r.v, fn);
}

type Kind = 'J' | 'Y' | 'I' | 'K' | 'H1' | 'H2';
/** One Bessel function, scaled or not, at order nu and real x. */
function bessel(kind: Kind, nu: number, x: number, sc: boolean, fn: string): Num {
  if (kind === 'J' || kind === 'Y') {
    const { j, y } = jy(nu, x, fn);
    return answer(kind === 'J' ? j : y, fn);
  }
  if (kind === 'H1' || kind === 'H2') {
    if (x === 0) throw new EvalError('runtime', `${fn} is undefined at 0: it has a singularity`);
    const { j, y } = jy(nu, x, fn);
    const iy: Cx = [-y[1], y[0]];
    let h = kind === 'H1' ? addC(j, iy) : [j[0] - iy[0], j[1] - iy[1]] as Cx;
    // Scaled: H1·e^(−ix), H2·e^(ix).
    if (sc) h = mulC(h, cexpi(kind === 'H1' ? -x : x));
    return answer(h, fn);
  }
  if (kind === 'K' && x === 0) throw new EvalError('runtime', `${fn} is undefined at 0: it has a singularity`);
  const r = ik(nu, x, fn);
  if (kind === 'I') return answer(sc ? r.i : scaled(r.i, r.iScale, fn), fn);
  // K: scaled is K·e^x.
  if (x > 0) return answer(sc ? r.k : scaled(r.k, r.kScale, fn), fn);
  return answer(sc ? scaled(r.k, r.kScale + x, fn) : scaled(r.k, r.kScale, fn), fn);
}

/** Airy functions at real x, from Bessel functions of order ⅓ and ⅔ (NR airy). Scaled as Mathcad's Help gives it. */
function realAiry(x: number, sc: boolean): { ai: number; bi: number; aip: number; bip: number } {
  const ONOVRT = 1 / Math.sqrt(3);
  if (x === 0) {
    const ai = 0.35502805388781723926;
    const aip = -0.25881940379280679840;
    return { ai, bi: ai / ONOVRT, aip, bip: -aip / ONOVRT };
  }
  const ax = Math.abs(x);
  const rootx = Math.sqrt(ax);
  const z = (2 / 3) * ax * rootx;
  if (x > 0) {
    const a = bessikScaled(z, 1 / 3);
    const b = bessikScaled(z, 2 / 3);
    // Scaled: Ai·e^ζ and Bi·e^(−ζ), with ζ = z here. Unscaled: K brings e^(−z), I brings e^z.
    const [kS, iS] = sc ? [1, Math.exp(-2 * z)] : [Math.exp(-z), Math.exp(z)];
    const [iF, kF] = sc ? [1, Math.exp(-2 * z)] : [Math.exp(z), Math.exp(-z)];
    return {
      ai: (rootx * ONOVRT * a.k * kS) / Math.PI,
      bi: rootx * ((a.k * kF) / Math.PI + 2 * ONOVRT * a.i * iF),
      aip: (-x * ONOVRT * b.k * kS) / Math.PI,
      bip: x * ((b.k * kF) / Math.PI + 2 * ONOVRT * b.i * iF),
    };
  }
  const a = jyAsymptotic(z, 1 / 3) ?? bessjy(z, 1 / 3);
  const b = jyAsymptotic(z, 2 / 3) ?? bessjy(z, 2 / 3);
  // For x < 0, ζ is imaginary: Mathcad scales Ai and DAi by Re(e^ζ) = cos(z), and Bi and DBi by e^(−|Re ζ|) = 1.
  const s = sc ? Math.cos(z) : 1;
  return {
    ai: 0.5 * rootx * (a.j - ONOVRT * a.y) * s,
    bi: -0.5 * rootx * (a.y + ONOVRT * a.j),
    aip: 0.5 * ax * (ONOVRT * b.y + b.j) * s,
    bip: 0.5 * ax * (ONOVRT * b.j - b.y),
  };
}

/** Where ber and bei turn from the power series, which cancels as x grows, to the asymptotic expansion. */
const KELVIN_SWITCH = 26;
/** ber_n(x) and bei_n(x) for whole n ≥ 0: the power series, or the asymptotic expansion beyond |x| = KELVIN_SWITCH. */
function kelvin(n: number, x: number): { ber: number; bei: number } {
  const ax = Math.abs(x);
  const sign = x < 0 && n % 2 === 1 ? -1 : 1;
  if (ax > KELVIN_SWITCH) {
    // DLMF 10.67.8–9, dropping the part of relative size e^(−√2·x).
    const mu = 4 * n * n;
    let ber = 0;
    let bei = 0;
    let term = 1;
    for (let k = 0; k < 60; k++) {
      const arg = ax / Math.SQRT2 + (n / 2 - 1 / 8 + (3 * k) / 4) * Math.PI;
      ber += term * Math.cos(arg);
      bei += term * Math.sin(arg);
      const next = (term * (mu - (2 * k + 1) ** 2)) / ((k + 1) * 8 * ax);
      if (Math.abs(next) > Math.abs(term) || Math.abs(next) < 1e-17) break;
      term = next;
    }
    const front = Math.exp(ax / Math.SQRT2) / Math.sqrt(2 * Math.PI * ax);
    return { ber: sign * front * ber, bei: sign * front * bei };
  }
  // ber_n(x) + i·bei_n(x) = Σ e^(i(3n/4 + k/2)π) (x/2)^(n+2k) / (k! (n+k)!).
  const half = ax / 2;
  let term = 1;
  for (let k = 1; k <= n; k++) term *= half / k;
  let ber = 0;
  let bei = 0;
  const q = half * half;
  for (let k = 0; k < 500; k++) {
    const angle = ((3 * n) / 4 + k / 2) % 2;
    const [c, s] = [cospi(angle), sinpi(angle)];
    ber += term * c;
    bei += term * s;
    const next = (term * q) / ((k + 1) * (n + k + 1));
    if (next === 0 || (Math.abs(next) < 1e-17 * Math.max(Math.abs(ber), Math.abs(bei)) && k > 2)) break;
    term = next;
  }
  return { ber: sign * ber, bei: sign * bei };
}

/** The spherical Bessel functions j_m and y_m: √(π/2x)·J and Y of order m + ½, with x^(−½) on its principal branch. */
function spherical(kind: 'js' | 'ys', m: number, x: number): Num {
  const fn = kind;
  if (x === 0) {
    if (kind === 'ys') throw new EvalError('runtime', 'ys is undefined at 0: it has a singularity');
    // js(m, x) runs as x^m near 0: 1 for m = 0, 0 above, infinite below.
    if (m === 0) return num(1);
    if (m > 0) return num(0);
    throw new EvalError('runtime', 'js is undefined at 0 for a negative order: it has a singularity');
  }
  const { j, y } = jy(m + 0.5, x, fn);
  const front = Math.sqrt(Math.PI / (2 * Math.abs(x)));
  // For x < 0: a whole order takes x^(−½) = −i·|x|^(−½), which gives the true values, j_m(−x) = (−1)^m j_m(x);
  // another order takes √(π/2x) on its principal branch, +i·√(π/2|x|), as Mathcad and mpmath do.
  const root: Cx = x > 0 ? [front, 0] : Number.isInteger(m) ? [0, -front] : [0, front];
  return answer(mulC(root, kind === 'js' ? j : y), fn);
}

/** js and ys at complex z: √(π/2z)·J and Y of order m + ½, with the root on its principal branch, as mpmath and Mathcad take it. */
function complexSpherical(kind: 'js' | 'ys', m: number, z: Cx): Num {
  const f = kind === 'js' ? amosJ(m + 0.5, z, false, kind) : amosY(m + 0.5, z, false, kind);
  return answer(mulC(csqrt(cdiv([Math.PI / 2, 0], z)), f), kind);
}

export const BESSEL_ARITY: Record<string, [number, number]> = {};
const ORDER0: Record<string, [Kind, number]> = { J0: ['J', 0], J1: ['J', 1], Y0: ['Y', 0], Y1: ['Y', 1], I0: ['I', 0], I1: ['I', 1], K0: ['K', 0], K1: ['K', 1] };
const ORDERN: Record<string, Kind> = { Jn: 'J', Yn: 'Y', In: 'I', Kn: 'K', H1: 'H1', H2: 'H2' };

export function besselFns(): Record<string, Impl> {
  const out: Record<string, Impl> = {};
  for (const [name, [kind, nu]] of Object.entries(ORDER0)) {
    for (const sc of [false, true]) {
      const fn = sc ? `${name}.sc` : name;
      out[fn] = (x) => {
        const z = plain(x, fn, 'argument');
        return z[1] === 0 ? bessel(kind, nu, z[0], sc, fn) : complexBessel(kind, nu, z, sc, fn);
      };
      BESSEL_ARITY[fn] = [1, 1];
    }
  }
  for (const [name, kind] of Object.entries(ORDERN)) {
    for (const sc of [false, true]) {
      const fn = sc ? `${name}.sc` : name;
      out[fn] = (m, x) => {
        const nu = realX(m, fn, 'order');
        const z = plain(x, fn, 'argument');
        return z[1] === 0 ? bessel(kind, nu, z[0], sc, fn) : complexBessel(kind, nu, z, sc, fn);
      };
      BESSEL_ARITY[fn] = [2, 2];
    }
  }
  for (const name of ['Ai', 'Bi', 'DAi', 'DBi'] as const) {
    for (const sc of [false, true]) {
      const fn = sc ? `${name}.sc` : name;
      out[fn] = (x) => {
        const z = plain(x, fn, 'argument');
        if (z[1] !== 0) return complexAiry(name, z, sc, fn);
        const a = realAiry(z[0], sc);
        return answer([{ Ai: a.ai, Bi: a.bi, DAi: a.aip, DBi: a.bip }[name], 0], fn);
      };
      BESSEL_ARITY[fn] = [1, 1];
    }
  }
  for (const name of ['ber', 'bei'] as const) {
    out[name] = (m, x) => {
      const n = realX(m, name, 'order');
      if (!Number.isInteger(n) || n < 0) throw new EvalError('runtime', `${name}'s order must be a whole number, 0 or more`);
      return answer([kelvin(n, realX(x, name))[name], 0], name);
    };
    BESSEL_ARITY[name] = [2, 2];
  }
  for (const name of ['js', 'ys'] as const) {
    out[name] = (m, x) => {
      const order = realX(m, name, 'order');
      const z = plain(x, name, 'argument');
      return z[1] === 0 ? spherical(name, order, z[0]) : complexSpherical(name, order, z);
    };
    BESSEL_ARITY[name] = [2, 2];
  }
  return out;
}
