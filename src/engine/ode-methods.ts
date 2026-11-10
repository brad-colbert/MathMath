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
 * The integration methods behind Mathcad's differential equation solvers, one for each family of names:
 *
 * - Cash–Karp Runge–Kutta 5(4) with step control (Numerical Recipes' rkqs): Rkadapt and rkadapt.
 * - Bulirsch–Stoer: modified midpoint steps, polynomial extrapolation, order and step chosen together
 *   (Numerical Recipes' bsstep): Bulstoer and bulstoer.
 * - Bader–Deuflhard semi-implicit extrapolation, the stiff counterpart (Numerical Recipes' stifbs): Stiffb and stiffb.
 * - Rosenbrock 4(3) with Shampine's constants (Numerical Recipes' stiff): Stiffr and stiffr.
 * - Radau IIA of order 5, implicit, with simplified Newton iterations (Hairer and Wanner's RADAU5): Radau.
 * - Backward differentiation formulas of orders 1 to 5, step and order varied together: BDF.
 * - Adams–Bashforth–Moulton, predict, evaluate, correct, evaluate, orders 1 to 12: Adams.
 * - Adams until the problem shows itself stiff, then BDF, and back when it no longer is: AdamsBDF.
 *
 * An Engine starts at (x1, y0) and is asked for y at successive targets; it lands on each exactly.
 */
import { EvalError } from './values.js';

type Vec = Float64Array<ArrayBufferLike>;

export type F = (x: number, y: Float64Array) => Float64Array;
/** ∂f/∂x and ∂f/∂y at (x, y), given f(x, y). */
export type Jacobian = (x: number, y: Float64Array, fy: Float64Array) => { dfdx: Float64Array; dfdy: Float64Array[] };

export interface Engine {
  /** y at `target`, which lies beyond the last target asked for; `visit` sees the end of each step taken. */
  to(target: number, visit?: (x: number, y: Float64Array) => void): Float64Array;
}

/** What each engine needs: the problem, its tolerances and a name for messages. */
export interface Setup {
  f: F;
  x1: number;
  y0: Float64Array;
  /** The last x the engine will be asked for, which a step never passes. */
  x2: number;
  rtol: number;
  atol: number;
  fn: string;
  /** For the stiff methods; finite differences when absent. */
  jac?: Jacobian;
}

const MAX_STEPS = 1_000_000;
const EPS = 2.220446049250313e-16;

// ── Small helpers ─────────────────────────────────────────────────────────────────────────────────

/** The root-mean-square of err measured against the tolerance: 1 is exactly at it. */
export function errNorm(err: Float64Array, y0: Float64Array, y1: Float64Array, rtol: number, atol: number): number {
  let s = 0;
  for (let i = 0; i < err.length; i++) {
    const sc = atol + rtol * Math.max(Math.abs(y0[i]!), Math.abs(y1[i]!));
    s += (err[i]! / sc) ** 2;
  }
  return Math.sqrt(s / err.length);
}

/** An LU factorization with partial pivoting, to solve with the same matrix many times. */
export class LU {
  private readonly m: Float64Array[];
  private readonly piv: Int32Array;
  constructor(a: Float64Array[], what: string) {
    const n = a.length;
    this.m = a.map((r) => r.slice());
    this.piv = new Int32Array(n);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(this.m[r]![c]!) > Math.abs(this.m[p]![c]!)) p = r;
      this.piv[c] = p;
      if (this.m[p]![c] === 0) throw new EvalError('runtime', `${what} is singular`);
      [this.m[c], this.m[p]] = [this.m[p]!, this.m[c]!];
      const d = this.m[c]![c]!;
      for (let r = c + 1; r < n; r++) {
        const l = this.m[r]![c]! / d;
        this.m[r]![c] = l;
        if (l !== 0) for (let k = c + 1; k < n; k++) this.m[r]![k] = this.m[r]![k]! - l * this.m[c]![k]!;
      }
    }
  }
  solve(b: Float64Array): Float64Array {
    const n = b.length;
    const x = b.slice();
    for (let c = 0; c < n; c++) {
      const p = this.piv[c]!;
      [x[c], x[p]] = [x[p]!, x[c]!];
      for (let r = c + 1; r < n; r++) x[r] = x[r]! - this.m[r]![c]! * x[c]!;
    }
    for (let r = n - 1; r >= 0; r--) {
      let s = x[r]!;
      for (let k = r + 1; k < n; k++) s -= this.m[r]![k]! * x[k]!;
      x[r] = s / this.m[r]![r]!;
    }
    return x;
  }
}

/** The same for a complex matrix, given as real and imaginary parts. */
class ComplexLU {
  private readonly re: Float64Array[];
  private readonly im: Float64Array[];
  private readonly piv: Int32Array;
  constructor(re: Float64Array[], im: Float64Array[], what: string) {
    const n = re.length;
    this.re = re.map((r) => r.slice());
    this.im = im.map((r) => r.slice());
    this.piv = new Int32Array(n);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.hypot(this.re[r]![c]!, this.im[r]![c]!) > Math.hypot(this.re[p]![c]!, this.im[p]![c]!)) p = r;
      this.piv[c] = p;
      if (this.re[p]![c] === 0 && this.im[p]![c] === 0) throw new EvalError('runtime', `${what} is singular`);
      [this.re[c], this.re[p]] = [this.re[p]!, this.re[c]!];
      [this.im[c], this.im[p]] = [this.im[p]!, this.im[c]!];
      const dr = this.re[c]![c]!;
      const di = this.im[c]![c]!;
      const dd = dr * dr + di * di;
      for (let r = c + 1; r < n; r++) {
        const ar = this.re[r]![c]!;
        const ai = this.im[r]![c]!;
        const lr = (ar * dr + ai * di) / dd;
        const li = (ai * dr - ar * di) / dd;
        this.re[r]![c] = lr;
        this.im[r]![c] = li;
        for (let k = c + 1; k < n; k++) {
          const ur = this.re[c]![k]!;
          const ui = this.im[c]![k]!;
          this.re[r]![k] = this.re[r]![k]! - (lr * ur - li * ui);
          this.im[r]![k] = this.im[r]![k]! - (lr * ui + li * ur);
        }
      }
    }
  }
  solve(br: Float64Array, bi: Float64Array): [Float64Array, Float64Array] {
    const n = br.length;
    const xr = br.slice();
    const xi = bi.slice();
    for (let c = 0; c < n; c++) {
      const p = this.piv[c]!;
      [xr[c], xr[p]] = [xr[p]!, xr[c]!];
      [xi[c], xi[p]] = [xi[p]!, xi[c]!];
      for (let r = c + 1; r < n; r++) {
        const lr = this.re[r]![c]!;
        const li = this.im[r]![c]!;
        xr[r] = xr[r]! - (lr * xr[c]! - li * xi[c]!);
        xi[r] = xi[r]! - (lr * xi[c]! + li * xr[c]!);
      }
    }
    for (let r = n - 1; r >= 0; r--) {
      let sr = xr[r]!;
      let si = xi[r]!;
      for (let k = r + 1; k < n; k++) {
        const ur = this.re[r]![k]!;
        const ui = this.im[r]![k]!;
        sr -= ur * xr[k]! - ui * xi[k]!;
        si -= ur * xi[k]! + ui * xr[k]!;
      }
      const dr = this.re[r]![r]!;
      const di = this.im[r]![r]!;
      const dd = dr * dr + di * di;
      xr[r] = (sr * dr + si * di) / dd;
      xi[r] = (si * dr - sr * di) / dd;
    }
    return [xr, xi];
  }
}

/** ∂f/∂y and ∂f/∂x by forward differences. */
export function numericJacobian(f: F): Jacobian {
  return (x, y, fy) => {
    const n = y.length;
    const dfdy = Array.from({ length: n }, () => new Float64Array(n));
    const yp = y.slice();
    for (let j = 0; j < n; j++) {
      const d = Math.sqrt(EPS) * Math.max(Math.abs(y[j]!), 1);
      yp[j] = y[j]! + d;
      const fp = f(x, yp);
      for (let i = 0; i < n; i++) dfdy[i]![j] = (fp[i]! - fy[i]!) / d;
      yp[j] = y[j]!;
    }
    const dx = Math.sqrt(EPS) * Math.max(Math.abs(x), 1);
    const fx = f(x + dx, y);
    return { dfdx: fx.map((v, i) => (v - fy[i]!) / dx), dfdy };
  };
}

/** A first step size, from the scale of y and its derivative (Hairer and Wanner's estimate). */
export function firstStep(f: F, x: number, y: Float64Array, span: number, rtol: number, atol: number, order: number): number {
  const n = y.length;
  const sc = (i: number): number => atol + rtol * Math.abs(y[i]!);
  const f0 = f(x, y);
  const d0 = Math.sqrt(y.reduce((s, v, i) => s + (v / sc(i)) ** 2, 0) / n);
  const d1 = Math.sqrt(f0.reduce((s, v, i) => s + (v / sc(i)) ** 2, 0) / n);
  const dir = Math.sign(span);
  let h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * (d0 / d1);
  h0 = Math.min(h0, Math.abs(span));
  const f1 = f(x + dir * h0, y.map((v, i) => v + dir * h0 * f0[i]!));
  const d2 = Math.sqrt(f1.reduce((s, v, i) => s + ((v - f0[i]!) / sc(i)) ** 2, 0) / n) / h0;
  const h1 = d1 <= 1e-15 && d2 <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / (order + 1));
  return Math.min(100 * h0, h1, Math.abs(span)) || Math.abs(span) / 100;
}

const tooSmall = (fn: string, x: number): EvalError =>
  new EvalError('runtime', `${fn}: the step size became too small at x = ${x.toPrecision(6)}. The equations may be stiff: try Radau, BDF or Stiffr`);
const tooMany = (fn: string): EvalError =>
  new EvalError('runtime', `${fn} took over ${MAX_STEPS} steps without reaching x2. The equations may be stiff: try Radau, BDF or Stiffr`);

// ── One-step methods ──────────────────────────────────────────────────────────────────────────────

/** A method that tries a step, judges it and picks the next size itself. */
interface SelfStepper {
  /** From (x, y), try steps no longer than |h| until one passes: the new y, the step taken, and the next to try. */
  advance(x: number, y: Float64Array, h: number): { y: Float64Array; hdid: number; hnext: number };
}

/**
 * Drives a one-step method from x1, landing exactly on each target. The step size carries over from one target
 * to the next; a step cut short to land on a target leaves it as it was.
 */
function oneStep(s: Setup, method: SelfStepper, order: number): Engine {
  let x = s.x1;
  let y: Vec = s.y0.slice();
  let h = firstStep(s.f, s.x1, s.y0, s.x2 - s.x1, s.rtol, s.atol, order);
  let steps = 0;
  return {
    to(target, visit) {
      const dir = Math.sign(target - x);
      while ((target - x) * dir > 0) {
        const left = Math.abs(target - x);
        let hv = Math.min(Math.abs(h), left);
        // A step that would stop a rounding error short of the target goes all the way.
        const last = hv >= left * (1 - 1e-12) || left - hv < 1e-12 * Math.max(Math.abs(x), 1);
        if (last) hv = left;
        if (hv < 1e-14 * Math.max(Math.abs(x), 1)) throw tooSmall(s.fn, x);
        if (++steps > MAX_STEPS) throw tooMany(s.fn);
        const r = method.advance(x, y, hv * dir);
        const landed = last && Math.abs(r.hdid) >= hv * (1 - 1e-12);
        x = landed ? target : x + r.hdid;
        y = r.y;
        visit?.(x, y);
        if (!landed || Math.abs(r.hdid) >= Math.abs(h)) h = Math.abs(r.hnext);
      }
      return y.slice();
    },
  };
}

/** An embedded Runge–Kutta pair, or another method that estimates its own error, under a standard step controller. */
function controlled(step: (x: number, y: Float64Array, h: number) => { y: Float64Array; err: Float64Array }, order: number, rtol: number, atol: number, fn: string): SelfStepper {
  return {
    advance(x, y, h0) {
      let h = h0;
      for (;;) {
        const r = step(x, y, h);
        const err = errNorm(r.err, y, r.y, rtol, atol);
        if (Number.isFinite(err) && err <= 1) {
          const grow = err === 0 ? 5 : Math.min(5, 0.9 * err ** (-1 / order));
          return { y: r.y, hdid: h, hnext: h * grow };
        }
        h *= Number.isFinite(err) ? Math.max(0.1, 0.9 * err ** (-1 / (order - 1))) : 0.1;
        if (Math.abs(h) < 1e-14 * Math.max(Math.abs(x), 1)) throw tooSmall(fn, x);
      }
    },
  };
}

/** Cash–Karp Runge–Kutta 5(4), Numerical Recipes' rkck: six evaluations, a fifth-order answer and its error. */
function cashKarpStep(f: F) {
  const a2 = 0.2, a3 = 0.3, a4 = 0.6, a5 = 1, a6 = 0.875;
  const b21 = 0.2, b31 = 3 / 40, b32 = 9 / 40, b41 = 0.3, b42 = -0.9, b43 = 1.2;
  const b51 = -11 / 54, b52 = 2.5, b53 = -70 / 27, b54 = 35 / 27;
  const b61 = 1631 / 55296, b62 = 175 / 512, b63 = 575 / 13824, b64 = 44275 / 110592, b65 = 253 / 4096;
  const c1 = 37 / 378, c3 = 250 / 621, c4 = 125 / 594, c6 = 512 / 1771;
  const dc1 = c1 - 2825 / 27648, dc3 = c3 - 18575 / 48384, dc4 = c4 - 13525 / 55296, dc5 = -277 / 14336, dc6 = c6 - 0.25;
  return (x: number, y: Float64Array, h: number): { y: Float64Array; err: Float64Array } => {
    const n = y.length;
    const k1 = f(x, y);
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = y[i]! + h * b21 * k1[i]!;
    const k2 = f(x + a2 * h, t);
    for (let i = 0; i < n; i++) t[i] = y[i]! + h * (b31 * k1[i]! + b32 * k2[i]!);
    const k3 = f(x + a3 * h, t);
    for (let i = 0; i < n; i++) t[i] = y[i]! + h * (b41 * k1[i]! + b42 * k2[i]! + b43 * k3[i]!);
    const k4 = f(x + a4 * h, t);
    for (let i = 0; i < n; i++) t[i] = y[i]! + h * (b51 * k1[i]! + b52 * k2[i]! + b53 * k3[i]! + b54 * k4[i]!);
    const k5 = f(x + a5 * h, t);
    for (let i = 0; i < n; i++) t[i] = y[i]! + h * (b61 * k1[i]! + b62 * k2[i]! + b63 * k3[i]! + b64 * k4[i]! + b65 * k5[i]!);
    const k6 = f(x + a6 * h, t);
    const out = new Float64Array(n);
    const err = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = y[i]! + h * (c1 * k1[i]! + c3 * k3[i]! + c4 * k4[i]! + c6 * k6[i]!);
      err[i] = h * (dc1 * k1[i]! + dc3 * k3[i]! + dc4 * k4[i]! + dc5 * k5[i]! + dc6 * k6[i]!);
    }
    return { y: out, err };
  };
}

/** Rosenbrock 4(3) with Shampine's constants, Numerical Recipes' stiff. Its own error estimate is third order. */
export function rosenbrockStep(f: F, jac: Jacobian) {
  const GAM = 1 / 2, A21 = 2, A31 = 48 / 25, A32 = 6 / 25, C21 = -8, C31 = 372 / 25, C32 = 12 / 5;
  const C41 = -112 / 125, C42 = -54 / 125, C43 = -2 / 5, B1 = 19 / 9, B2 = 1 / 2, B3 = 25 / 108, B4 = 125 / 108;
  const E1 = 17 / 54, E2 = 7 / 36, E3 = 0, E4 = 125 / 108, C1X = 1 / 2, C2X = -3 / 2, C3X = 121 / 50, C4X = 29 / 250;
  const A2X = 1, A3X = 3 / 5;
  return (x: number, y: Float64Array, h: number): { y: Float64Array; err: Float64Array } => {
    const n = y.length;
    const dydx = f(x, y);
    const { dfdx, dfdy } = jac(x, y, dydx);
    const lu = new LU(dfdy.map((row, i) => row.map((v, j) => -v + (i === j ? 1 / (GAM * h) : 0))), 'the step matrix');
    const g1 = lu.solve(dydx.map((v, i) => v + h * C1X * dfdx[i]!));
    let yt = y.map((v, i) => v + A21 * g1[i]!);
    let dy = f(x + A2X * h, yt);
    const g2 = lu.solve(dy.map((v, i) => v + h * C2X * dfdx[i]! + (C21 * g1[i]!) / h));
    yt = y.map((v, i) => v + A31 * g1[i]! + A32 * g2[i]!);
    dy = f(x + A3X * h, yt);
    const g3 = lu.solve(dy.map((v, i) => v + h * C3X * dfdx[i]! + (C31 * g1[i]! + C32 * g2[i]!) / h));
    const g4 = lu.solve(dy.map((v, i) => v + h * C4X * dfdx[i]! + (C41 * g1[i]! + C42 * g2[i]! + C43 * g3[i]!) / h));
    const out = new Float64Array(n);
    const err = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = y[i]! + B1 * g1[i]! + B2 * g2[i]! + B3 * g3[i]! + B4 * g4[i]!;
      err[i] = E1 * g1[i]! + E2 * g2[i]! + E3 * g3[i]! + E4 * g4[i]!;
    }
    return { y: out, err };
  };
}

/**
 * Extrapolation in the step size: Numerical Recipes' bsstep (with the modified midpoint rule) and stifbs (with
 * the semi-implicit midpoint rule). Each step tries 2, 4, 6… substeps (or stifbs's longer sequence), fits a
 * polynomial in (h/n)² through the answers and takes its value at 0; it stops at the column where the estimated
 * error passes, and picks the next column and step from the work each would cost.
 */
function extrapolation(
  sub: (x: number, y: Float64Array, dydx: Float64Array, htot: number, nstep: number, prep: unknown) => Float64Array,
  prepare: (x: number, y: Float64Array, dydx: Float64Array) => unknown,
  nseq: number[], f: F, rtol: number, atol: number, fn: string,
): SelfStepper {
  const SAFE1 = 0.25, SAFE2 = 0.7, REDMAX = 1e-5, REDMIN = 0.7, SCALMX = 0.1;
  const kmaxx = nseq.length - 1;
  // Work per column, and the ratios that decide moving between columns, from the accuracy wanted.
  const eps = Math.max(rtol, 1e-14);
  const eps1 = SAFE1 * eps;
  const a: number[] = [nseq[0]! + 1];
  for (let k = 0; k < kmaxx; k++) a[k + 1] = a[k]! + nseq[k + 1]!;
  const alf: number[][] = Array.from({ length: kmaxx + 1 }, () => new Array<number>(kmaxx + 1).fill(0));
  for (let iq = 1; iq < kmaxx; iq++) {
    for (let k = 0; k < iq; k++) alf[k]![iq] = eps1 ** ((a[k + 1]! - a[iq + 1]!) / ((a[iq + 1]! - a[0]! + 1) * (2 * k + 3)));
  }
  let kopt = 1;
  for (; kopt < kmaxx - 1; kopt++) if (a[kopt + 1]! > a[kopt]! * alf[kopt - 1]![kopt]!) break;
  const kmax = kopt;
  let first = true;
  return {
    advance(x, y, htry) {
      const n = y.length;
      const dydx = f(x, y);
      const prep = prepare(x, y, dydx);
      let h = htry;
      let reduct = false;
      const err = new Array<number>(kmaxx).fill(0);
      let km = 0;
      let red = 1;
      let k = 0;
      let accepted = false;
      let out = y;
      for (;;) {
        // Polynomial extrapolation (Neville in columns), Numerical Recipes' pzextr.
        const xs: number[] = [];
        const d: Float64Array[] = [];
        let yest: Float64Array = y;
        let yerr = new Float64Array(n);
        let exit = false;
        for (k = 0; k <= kmax; k++) {
          const yseq = sub(x, y, dydx, h, nseq[k]!, prep);
          const xest = (h / nseq[k]!) ** 2;
          xs.push(xest);
          if (k === 0) {
            yest = yseq.slice();
            yerr = yseq.slice();
            d.push(yseq.slice());
          } else {
            const ny = yseq.slice();
            const dy = yseq.slice();
            const c = yseq.slice();
            for (let k1 = 0; k1 < k; k1++) {
              const delta = 1 / (xs[k - k1 - 1]! - xest);
              const f1 = xest * delta;
              const f2 = xs[k - k1 - 1]! * delta;
              for (let j = 0; j < n; j++) {
                const q = d[k1]![j]!;
                d[k1]![j] = dy[j]!;
                const del = c[j]! - q;
                dy[j] = f1 * del;
                c[j] = f2 * del;
                ny[j] = ny[j]! + dy[j]!;
              }
            }
            d.push(dy);
            yest = ny;
            yerr = dy;
          }
          if (k !== 0) {
            let errmax = 1e-300;
            for (let i = 0; i < n; i++) errmax = Math.max(errmax, Math.abs(yerr[i]! / (atol + rtol * Math.abs(y[i]!))));
            errmax /= SAFE1 > 0 ? 1 : 1;
            km = k - 1;
            err[km] = (errmax / SAFE1) ** (1 / (2 * km + 3));
            if (k >= kopt - 1 || first) {
              if (errmax < 1) {
                exit = true;
                break;
              }
              if (k === kmax || k === kopt + 1) {
                red = SAFE2 / err[km]!;
                break;
              } else if (k === kopt && alf[kopt - 1]![kopt]! < err[km]!) {
                red = 1 / err[km]!;
                break;
              } else if (kopt === kmax && alf[km]![kmax - 1]! < err[km]!) {
                red = (alf[km]![kmax - 1]! * SAFE2) / err[km]!;
                break;
              } else if (alf[km]![kopt]! < err[km]!) {
                red = alf[km]![kopt - 1]! / err[km]!;
                break;
              }
            }
          }
        }
        if (exit) {
          accepted = true;
          out = yest;
          break;
        }
        red = Math.max(Math.min(red, REDMIN), REDMAX);
        h *= red;
        reduct = true;
        if (Math.abs(h) < 1e-14 * Math.max(Math.abs(x), 1)) throw tooSmall(fn, x);
      }
      if (!accepted) throw tooSmall(fn, x);
      first = false;
      // The column, and so the step, that costs least per unit of x.
      let wrkmin = 1e35;
      let scale = 1;
      for (let kk = 0; kk <= km; kk++) {
        const fact = Math.max(err[kk]!, SCALMX);
        const work = fact * a[kk + 1]!;
        if (work < wrkmin) {
          scale = fact;
          wrkmin = work;
          kopt = kk + 1;
        }
      }
      let hnext = h / scale;
      if (kopt >= k && kopt !== kmax && !reduct) {
        const fact = Math.max(scale / alf[kopt - 1]![kopt]!, SCALMX);
        if (a[kopt + 1]! * fact <= wrkmin) {
          hnext = h / fact;
          kopt++;
        }
      }
      return { y: out, hdid: h, hnext };
    },
  };
}

/** The modified midpoint rule over htot in nstep substeps, Numerical Recipes' mmid. */
function modifiedMidpoint(f: F) {
  return (x: number, y: Float64Array, dydx: Float64Array, htot: number, nstep: number): Float64Array => {
    const n = y.length;
    const h = htot / nstep;
    let ym = y.slice();
    let yn = y.map((v, i) => v + h * dydx[i]!);
    let xx = x + h;
    let yout = f(xx, yn);
    const h2 = 2 * h;
    for (let s = 1; s < nstep; s++) {
      const next = new Float64Array(n);
      for (let i = 0; i < n; i++) next[i] = ym[i]! + h2 * yout[i]!;
      ym = yn;
      yn = next;
      xx += h;
      yout = f(xx, yn);
    }
    const res = new Float64Array(n);
    for (let i = 0; i < n; i++) res[i] = 0.5 * (ym[i]! + yn[i]! + h * yout[i]!);
    return res;
  };
}

/** The semi-implicit midpoint rule over htot in nstep substeps, Numerical Recipes' simpr. */
function semiImplicitMidpoint(f: F) {
  return (x: number, y: Float64Array, dydx: Float64Array, htot: number, nstep: number, prep: unknown): Float64Array => {
    const { dfdx, dfdy } = prep as { dfdx: Float64Array; dfdy: Float64Array[] };
    const n = y.length;
    const h = htot / nstep;
    const lu = new LU(dfdy.map((row, i) => row.map((v, j) => -h * v + (i === j ? 1 : 0))), 'the step matrix');
    let yout = lu.solve(dydx.map((v, i) => h * (v + h * dfdx[i]!)));
    let del: Vec = yout.slice();
    const ytemp = y.map((v, i) => v + del[i]!);
    let xx = x + h;
    yout = f(xx, ytemp);
    for (let s = 1; s < nstep; s++) {
      yout = lu.solve(yout.map((v, i) => h * v - del[i]!));
      for (let i = 0; i < n; i++) {
        del[i] = del[i]! + 2 * yout[i]!;
        ytemp[i] = ytemp[i]! + del[i]!;
      }
      xx += h;
      yout = f(xx, ytemp);
    }
    yout = lu.solve(yout.map((v, i) => h * v - del[i]!));
    del = yout;
    return ytemp.map((v, i) => v + del[i]!);
  };
}

export const cashKarp = (s: Setup): Engine => oneStep(s, controlled(cashKarpStep(s.f), 5, s.rtol, s.atol, s.fn), 5);

export const rosenbrock = (s: Setup): Engine =>
  oneStep(s, controlled(rosenbrockStep(s.f, s.jac ?? numericJacobian(s.f)), 4, s.rtol, s.atol, s.fn), 4);

export const bulirschStoer = (s: Setup): Engine =>
  oneStep(s, extrapolation(modifiedMidpoint(s.f), () => null, [2, 4, 6, 8, 10, 12, 14, 16, 18], s.f, s.rtol, s.atol, s.fn), 7);

export const semiImplicitExtrapolation = (s: Setup): Engine => {
  const jac = s.jac ?? numericJacobian(s.f);
  return oneStep(s, extrapolation(semiImplicitMidpoint(s.f), (x, y, dydx) => jac(x, y, dydx), [2, 6, 10, 14, 22, 34, 50, 70], s.f, s.rtol, s.atol, s.fn), 5);
};

// ── Radau IIA ─────────────────────────────────────────────────────────────────────────────────────

const S6 = Math.sqrt(6);
const RC = [(4 - S6) / 10, (4 + S6) / 10, 1];
const RE = [(-13 - 7 * S6) / 3, (-13 + 7 * S6) / 3, -1 / 3];
const MU_REAL = 3 + 3 ** (2 / 3) - 3 ** (1 / 3);
const MU_C_RE = 3 + 0.5 * (3 ** (1 / 3) - 3 ** (2 / 3));
const MU_C_IM = -0.5 * (3 ** (5 / 6) + 3 ** (7 / 6));
const RT = [
  [0.09443876248897524, -0.14125529502095421, 0.03002919410514742],
  [0.25021312296533332, 0.20412935229379994, -0.38294211275726192],
  [1, 1, 0],
];
const RTI = [
  [4.17871859155190428, 0.32768282076106237, 0.52337644549944951],
  [-4.17871859155190428, -0.32768282076106237, 0.47662355450055044],
  [0.50287263494578682, -2.57192694985560522, 0.59603920482822492],
];
const RP = [
  [13 / 3 + (7 * S6) / 3, -23 / 3 - (22 * S6) / 3, 10 / 3 + 5 * S6],
  [13 / 3 - (7 * S6) / 3, -23 / 3 + (22 * S6) / 3, 10 / 3 - 5 * S6],
  [1 / 3, -8 / 3, 10 / 3],
];
const NEWTON_MAXITER = 6;

const rms = (v: Float64Array, scale: Float64Array): number => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i]! / scale[i]!) ** 2;
  return Math.sqrt(s / v.length);
};

/**
 * Radau IIA of order 5, three stages, as SciPy's Radau (after Hairer and Wanner's RADAU5): the stage equations
 * solved by simplified Newton iterations on the transformed system, one real and one complex linear system per
 * iteration; a step error estimate from an embedded formula; and a predictive step-size controller. The Jacobian
 * is reused across steps until the iterations slow.
 */
export function radau(s: Setup): Engine {
  const { f, rtol, atol, fn } = s;
  const n = s.y0.length;
  const jac = s.jac ?? numericJacobian(f);
  const newtonTol = Math.max((10 * EPS) / rtol, Math.min(0.03, Math.sqrt(rtol)));
  let x = s.x1;
  let y = s.y0.slice();
  let fx = f(x, y);
  let J = jac(x, y, fx).dfdy;
  let currentJac = true;
  let hAbs = firstStep(f, x, y, s.x2 - s.x1, rtol, atol, 3);
  let hAbsOld: number | null = null;
  let errOld: number | null = null;
  let luReal: LU | null = null;
  let luComplex: ComplexLU | null = null;
  // The last step's collocation polynomial, to predict the next step's stages.
  let dense: { x0: number; h: number; y0: Float64Array; Q: Float64Array[] } | null = null;
  let steps = 0;
  const factorise = (h: number): void => {
    luReal = new LU(J.map((row, i) => row.map((v, j) => (i === j ? MU_REAL / h : 0) - v)), 'the Radau iteration matrix');
    const d = MU_C_RE * MU_C_RE + MU_C_IM * MU_C_IM;
    const [cr, ci] = [(MU_C_RE / h) * (h * h) / (h * h), 0];
    void cr;
    void ci;
    // MU_COMPLEX / h, as a complex number.
    const mr = MU_C_RE / h;
    const mi = MU_C_IM / h;
    void d;
    luComplex = new ComplexLU(
      J.map((row, i) => row.map((v, j) => (i === j ? mr : 0) - v)),
      J.map((row, i) => row.map((_, j) => (i === j ? mi : 0))),
      'the Radau iteration matrix',
    );
  };
  const predict = (factorHAbs: number, err: number): number => {
    const multiplier = errOld === null || hAbsOld === null || err === 0 ? 1 : (factorHAbs / hAbsOld) * (errOld / err) ** 0.25;
    return Math.min(1, multiplier) * err ** -0.25;
  };
  const stepToward = (bound: number): void => {
    const dir = Math.sign(bound - x);
    let rejected = false;
    for (;;) {
      if (hAbs < 10 * EPS * Math.max(Math.abs(x), 1)) throw tooSmall(fn, x);
      if (++steps > MAX_STEPS) throw tooMany(fn);
      let h = hAbs * dir;
      let xNew = x + h;
      const lands = dir * (xNew - bound) >= -1e-12 * Math.max(Math.abs(bound), 1);
      if (lands) xNew = bound;
      h = xNew - x;
      hAbs = Math.abs(h);
      // Starting stages: zero, or the last step's polynomial carried forward.
      const Z0: Float64Array[] = RC.map((c) => {
        if (!dense) return new Float64Array(n);
        const t = (x + h * c - dense.x0) / dense.h;
        const p = [t, t * t, t * t * t];
        const z = new Float64Array(n);
        for (let i = 0; i < n; i++) z[i] = dense.y0[i]! + dense.Q[i]![0]! * p[0]! + dense.Q[i]![1]! * p[1]! + dense.Q[i]![2]! * p[2]! - y[i]!;
        return z;
      });
      const scale = y.map((v) => atol + Math.abs(v) * rtol);
      let converged = false;
      let nIter = 0;
      let Z = Z0;
      let rate = 0;
      for (;;) {
        if (!luReal || !luComplex) factorise(h);
        const r = collocation(f, x, y, h, Z0, scale, newtonTol, luReal!, luComplex!);
        converged = r.converged;
        nIter = r.iterations;
        Z = r.Z;
        rate = r.rate;
        if (converged || currentJac) break;
        J = jac(x, y, fx).dfdy;
        currentJac = true;
        luReal = null;
        luComplex = null;
      }
      if (!converged) {
        hAbs *= 0.5;
        luReal = null;
        luComplex = null;
        continue;
      }
      const yNew = y.map((v, i) => v + Z[2]![i]!);
      const ZE = new Float64Array(n);
      for (let i = 0; i < n; i++) ZE[i] = (Z[0]![i]! * RE[0]! + Z[1]![i]! * RE[1]! + Z[2]![i]! * RE[2]!) / h;
      let error = luReal!.solve(fx.map((v, i) => v + ZE[i]!));
      const scale2 = y.map((v, i) => atol + Math.max(Math.abs(v), Math.abs(yNew[i]!)) * rtol);
      let errNormV = rms(error, scale2);
      const safety = (0.9 * (2 * NEWTON_MAXITER + 1)) / (2 * NEWTON_MAXITER + nIter);
      if (rejected && errNormV > 1) {
        error = luReal!.solve(f(x, y.map((v, i) => v + error[i]!)).map((v, i) => v + ZE[i]!));
        errNormV = rms(error, scale2);
      }
      if (errNormV > 1) {
        hAbs *= Math.max(0.2, safety * predict(hAbs, errNormV));
        luReal = null;
        luComplex = null;
        rejected = true;
        continue;
      }
      // Accepted.
      const recompute = nIter > 2 && rate > 1e-3;
      let factor = Math.min(10, safety * predict(hAbs, errNormV));
      if (!recompute && factor < 1.2) factor = 1;
      else {
        luReal = null;
        luComplex = null;
      }
      const fNew = f(xNew, yNew);
      if (recompute) {
        J = jac(xNew, yNew, fNew).dfdy;
        currentJac = true;
      } else currentJac = false;
      // Q = Zᵀ·P, the collocation polynomial's coefficients, for the next prediction.
      const Q = Array.from({ length: n }, (_, i) => Float64Array.from([0, 1, 2], (c) => Z[0]![i]! * RP[0]![c]! + Z[1]![i]! * RP[1]![c]! + Z[2]![i]! * RP[2]![c]!));
      dense = { x0: x, h, y0: y, Q };
      hAbsOld = hAbs;
      errOld = errNormV;
      hAbs *= factor;
      x = xNew;
      y = yNew;
      fx = fNew;
      return;
    }
  };
  return {
    to(target, visit) {
      while (x !== target) {
        stepToward(target);
        visit?.(x, y);
      }
      return y.slice();
    },
  };
}

/** The simplified Newton iterations for Radau's three stages, as SciPy's solve_collocation_system. */
function collocation(f: F, x: number, y: Float64Array, h: number, Z0: Float64Array[], scale: Float64Array, tol: number, luReal: LU, luComplex: ComplexLU):
  { converged: boolean; iterations: number; Z: Float64Array[]; rate: number } {
  const n = y.length;
  const mr = MU_REAL / h;
  const mcr = MU_C_RE / h;
  const mci = MU_C_IM / h;
  // W = TI·Z
  const W = [0, 1, 2].map((r) => Float64Array.from({ length: n }, (_, i) => RTI[r]![0]! * Z0[0]![i]! + RTI[r]![1]! * Z0[1]![i]! + RTI[r]![2]! * Z0[2]![i]!));
  let Z = Z0;
  let dwOld: number | null = null;
  let rate = 0;
  let k = 0;
  for (; k < NEWTON_MAXITER; k++) {
    const F = RC.map((c, s) => f(x + h * c, y.map((v, i) => v + Z[s]![i]!)));
    if (F.some((v) => v.some((e) => !Number.isFinite(e)))) break;
    const fReal = new Float64Array(n);
    const fcRe = new Float64Array(n);
    const fcIm = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      fReal[i] = F[0]![i]! * RTI[0]![0]! + F[1]![i]! * RTI[0]![1]! + F[2]![i]! * RTI[0]![2]! - mr * W[0]![i]!;
      const tr = F[0]![i]! * RTI[1]![0]! + F[1]![i]! * RTI[1]![1]! + F[2]![i]! * RTI[1]![2]!;
      const ti = F[0]![i]! * RTI[2]![0]! + F[1]![i]! * RTI[2]![1]! + F[2]![i]! * RTI[2]![2]!;
      // f_complex = F·TI_COMPLEX − MU_COMPLEX/h · (W1 + i·W2)
      fcRe[i] = tr - (mcr * W[1]![i]! - mci * W[2]![i]!);
      fcIm[i] = ti - (mcr * W[2]![i]! + mci * W[1]![i]!);
    }
    const dReal = luReal.solve(fReal);
    const [dRe, dIm] = luComplex.solve(fcRe, fcIm);
    const dW = [dReal, dRe, dIm];
    let s2 = 0;
    for (const row of dW) for (let i = 0; i < n; i++) s2 += (row[i]! / scale[i]!) ** 2;
    const dwNorm = Math.sqrt(s2 / (3 * n));
    if (dwOld !== null) rate = dwNorm / dwOld;
    if (dwOld !== null && (rate >= 1 || (rate ** (NEWTON_MAXITER - k) / (1 - rate)) * dwNorm > tol)) break;
    for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) W[r]![i] = W[r]![i]! + dW[r]![i]!;
    Z = [0, 1, 2].map((r) => Float64Array.from({ length: n }, (_, i) => RT[r]![0]! * W[0]![i]! + RT[r]![1]! * W[1]![i]! + RT[r]![2]! * W[2]![i]!));
    if (dwNorm === 0 || (dwOld !== null && (rate / (1 - rate)) * dwNorm < tol)) return { converged: true, iterations: k + 1, Z, rate };
    dwOld = dwNorm;
  }
  return { converged: false, iterations: k + 1, Z, rate };
}

// ── Multistep methods: BDF and Adams ──────────────────────────────────────────────────────────────

/**
 * Rescales a table of backward differences of values at equal spacing when the spacing changes by `factor`, as
 * SciPy's change_D: the polynomial through the last order+1 values, sampled again at the new spacing.
 */
function rescale(D: Float64Array[], order: number, factor: number): void {
  const R = (fac: number): number[][] => {
    const M = Array.from({ length: order + 1 }, () => new Array<number>(order + 1).fill(0));
    M[0]!.fill(1);
    for (let i = 1; i <= order; i++) for (let j = 1; j <= order; j++) M[i]![j] = (i - 1 - fac * j) / i;
    for (let i = 1; i <= order; i++) for (let j = 0; j <= order; j++) M[i]![j] = M[i]![j]! * M[i - 1]![j]!;
    return M;
  };
  const r = R(factor);
  const u = R(1);
  // RU = R·U; D[0..order] ← RUᵀ·D[0..order].
  const ru = r.map((row) => u[0]!.map((_, j) => row.reduce((s, v, k) => s + v * u[k]![j]!, 0)));
  const n = D[0]!.length;
  const out = Array.from({ length: order + 1 }, (_, i) => {
    const v = new Float64Array(n);
    for (let k = 0; k <= order; k++) {
      const c = ru[k]![i]!;
      if (c !== 0) for (let e = 0; e < n; e++) v[e] = v[e]! + c * D[k]![e]!;
    }
    return v;
  });
  for (let i = 0; i <= order; i++) D[i] = out[i]!;
}

interface Multistep {
  x: number;
  y: Float64Array;
  /** One accepted step, not past `bound`, landing on it when it comes within reach. */
  step(bound: number): void;
  /** |h|·(an estimate of the largest |∂f/∂y|) for the last step: how close it came to the method's stability limit. */
  stiffness: number;
}

/**
 * Backward differentiation formulas of orders 1 to 5 with quasi-constant steps, as SciPy's BDF with κ = 0 (pure
 * BDF, not its default NDF): y kept as a table of backward differences, rescaled when the step changes; each step
 * a predictor from the table and Newton iterations on the BDF equation; the order and step chosen together from
 * the error estimates for orders k−1, k and k+1 once k+1 equal steps have passed.
 */
class Bdf implements Multistep {
  x: number;
  y: Float64Array;
  stiffness = 0;
  private D: Float64Array[];
  private order = 1;
  private hAbs: number;
  private equalSteps = 0;
  private J: Float64Array[];
  private lu: LU | null = null;
  private readonly gamma: number[];
  private readonly errConst: number[];
  private readonly newtonTol: number;
  private readonly jac: Jacobian;
  private steps = 0;
  constructor(private readonly s: Setup, x: number, y: Float64Array, h?: number) {
    this.x = x;
    this.y = y.slice();
    const f0 = s.f(x, y);
    this.jac = s.jac ?? numericJacobian(s.f);
    this.J = this.jac(x, y, f0).dfdy;
    this.hAbs = h ?? firstStep(s.f, x, y, s.x2 - x, s.rtol, s.atol, 1);
    this.newtonTol = Math.max((10 * EPS) / s.rtol, Math.min(0.03, Math.sqrt(s.rtol)));
    this.gamma = [0];
    for (let k = 1; k <= 5; k++) this.gamma.push(this.gamma[k - 1]! + 1 / k);
    this.errConst = Array.from({ length: 7 }, (_, k) => 1 / (k + 1));
    const dir = Math.sign(s.x2 - x) || 1;
    this.D = Array.from({ length: 8 }, () => new Float64Array(y.length));
    this.D[0] = y.slice();
    this.D[1] = f0.map((v) => v * this.hAbs * dir);
  }
  step(bound: number): void {
    const { f, rtol, atol, fn } = this.s;
    const n = this.y.length;
    const dir = Math.sign(bound - this.x);
    const D = this.D;
    let order = this.order;
    let currentJac = false;
    for (;;) {
      if (this.hAbs < 10 * EPS * Math.max(Math.abs(this.x), 1)) throw tooSmall(fn, this.x);
      if (++this.steps > MAX_STEPS) throw tooMany(fn);
      let h = this.hAbs * dir;
      let xNew = this.x + h;
      if (dir * (xNew - bound) >= -1e-12 * Math.max(Math.abs(bound), 1)) {
        xNew = bound;
        rescale(D, order, Math.abs(xNew - this.x) / this.hAbs);
        this.equalSteps = 0;
        this.lu = null;
      }
      h = xNew - this.x;
      this.hAbs = Math.abs(h);
      const yPred = new Float64Array(n);
      for (let k = 0; k <= order; k++) for (let i = 0; i < n; i++) yPred[i] = yPred[i]! + D[k]![i]!;
      const scale = yPred.map((v) => atol + rtol * Math.abs(v));
      const psi = new Float64Array(n);
      for (let k = 1; k <= order; k++) for (let i = 0; i < n; i++) psi[i] = psi[i]! + (D[k]![i]! * this.gamma[k]!) / this.gamma[order]!;
      const c = h / this.gamma[order]!;
      let converged = false;
      let nIter = 0;
      let yNew: Vec = yPred;
      let d: Vec = new Float64Array(n);
      for (;;) {
        if (!this.lu) this.lu = new LU(this.J.map((row, i) => row.map((v, j) => (i === j ? 1 : 0) - c * v)), 'the BDF iteration matrix');
        const r = this.newton(xNew, yPred, c, psi, scale);
        converged = r.converged;
        nIter = r.iterations;
        yNew = r.y;
        d = r.d;
        if (converged || currentJac) break;
        this.J = this.jac(xNew, yPred, f(xNew, yPred)).dfdy;
        this.lu = null;
        currentJac = true;
      }
      if (!converged) {
        this.hAbs *= 0.5;
        rescale(D, order, 0.5);
        this.equalSteps = 0;
        this.lu = null;
        continue;
      }
      const safety = (0.9 * (2 * 4 + 1)) / (2 * 4 + nIter);
      const scaleNew = yNew.map((v) => atol + rtol * Math.abs(v));
      const errNormV = rms(d.map((v) => this.errConst[order]! * v), scaleNew);
      if (errNormV > 1) {
        const factor = Math.max(0.2, safety * errNormV ** (-1 / (order + 1)));
        this.hAbs *= factor;
        rescale(D, order, factor);
        this.equalSteps = 0;
        continue;
      }
      // Accepted: the new point extends the difference table.
      this.equalSteps++;
      this.x = xNew;
      this.y = yNew;
      this.stiffness = this.hAbs * Math.max(...this.J.map((row) => row.reduce((s2, v) => s2 + Math.abs(v), 0)));
      D[order + 2] = d.map((v, i) => v - D[order + 1]![i]!);
      D[order + 1] = d.slice();
      for (let k = order; k >= 0; k--) for (let i = 0; i < n; i++) D[k]![i] = D[k]![i]! + D[k + 1]![i]!;
      if (this.equalSteps < order + 1) return;
      const em = order > 1 ? rms(D[order]!.map((v) => this.errConst[order - 1]! * v), scaleNew) : Infinity;
      const ep = order < 5 ? rms(D[order + 2]!.map((v) => this.errConst[order + 1]! * v), scaleNew) : Infinity;
      const factors = [em, errNormV, ep].map((e, k) => e ** (-1 / (order + k)));
      const best = factors.indexOf(Math.max(...factors));
      order += best - 1;
      this.order = order;
      const factor = Math.min(10, safety * Math.max(...factors));
      this.hAbs *= factor;
      rescale(D, order, factor);
      this.equalSteps = 0;
      this.lu = null;
      return;
    }
  }
  private newton(xNew: number, yPred: Float64Array, c: number, psi: Float64Array, scale: Float64Array): { converged: boolean; iterations: number; y: Float64Array; d: Float64Array } {
    const y = yPred.slice();
    const d = new Float64Array(y.length);
    let old: number | null = null;
    let k = 0;
    for (; k < 4; k++) {
      const fv = this.s.f(xNew, y);
      if (fv.some((v) => !Number.isFinite(v))) break;
      const dy = this.lu!.solve(fv.map((v, i) => c * v - psi[i]! - d[i]!));
      const norm = rms(dy, scale);
      const rate = old === null ? null : norm / old;
      if (rate !== null && (rate >= 1 || (rate ** (4 - k) / (1 - rate)) * norm > this.newtonTol)) break;
      for (let i = 0; i < y.length; i++) {
        y[i] = y[i]! + dy[i]!;
        d[i] = d[i]! + dy[i]!;
      }
      if (norm === 0 || (rate !== null && (rate / (1 - rate)) * norm < this.newtonTol)) return { converged: true, iterations: k + 1, y, d };
      old = norm;
    }
    return { converged: false, iterations: k + 1, y, d };
  }
}

/** Adams–Bashforth coefficients γⱼ and Adams–Moulton γ*ⱼ for backward differences, j = 0…13. */
const AB: number[] = [1];
const AM: number[] = [1];
for (let j = 1; j <= 13; j++) {
  let sb = 0;
  let sm = 0;
  for (let i = 0; i < j; i++) {
    sb += AB[i]! / (j + 1 - i);
    sm += AM[i]! / (j + 1 - i);
  }
  AB.push(1 - sb);
  AM.push(-sm);
}
const ADAMS_MAX = 12;

/**
 * Adams–Bashforth–Moulton in PECE form with quasi-constant steps, orders 1 to 12: f kept as a table of backward
 * differences, rescaled when the step changes. Each step predicts with Adams–Bashforth, evaluates f, corrects with
 * Adams–Moulton and evaluates f again; Milne's device estimates the error from the corrector minus the predictor,
 * and the order and step are chosen from the estimates for orders k−1, k and k+1, as for BDF. Being explicit, it
 * slows to a crawl on stiff problems, where |h·∂f/∂y| must stay below about 1.
 */
class Adams implements Multistep {
  x: number;
  y: Float64Array;
  stiffness = 0;
  private Df: Float64Array[];
  private order = 1;
  private hAbs: number;
  private equalSteps = 0;
  private steps = 0;
  constructor(private readonly s: Setup, x: number, y: Float64Array, h?: number) {
    this.x = x;
    this.y = y.slice();
    this.hAbs = h ?? firstStep(s.f, x, y, s.x2 - x, s.rtol, s.atol, 1);
    this.Df = Array.from({ length: ADAMS_MAX + 2 }, () => new Float64Array(y.length));
    this.Df[0] = s.f(x, y);
  }
  step(bound: number): void {
    const { f, rtol, atol, fn } = this.s;
    const n = this.y.length;
    const dir = Math.sign(bound - this.x);
    const Df = this.Df;
    let k = this.order;
    let fails = 0;
    for (;;) {
      if (this.hAbs < 10 * EPS * Math.max(Math.abs(this.x), 1)) throw tooSmall(fn, this.x);
      if (++this.steps > MAX_STEPS) throw tooMany(fn);
      let h = this.hAbs * dir;
      let xNew = this.x + h;
      if (dir * (xNew - bound) >= -1e-12 * Math.max(Math.abs(bound), 1)) {
        xNew = bound;
        rescale(Df, k, Math.abs(xNew - this.x) / this.hAbs);
        this.equalSteps = 0;
      }
      h = xNew - this.x;
      this.hAbs = Math.abs(h);
      // Predict, evaluate.
      const yp = this.y.slice();
      for (let j = 0; j < k; j++) for (let i = 0; i < n; i++) yp[i] = yp[i]! + h * AB[j]! * Df[j]![i]!;
      const fp = f(xNew, yp);
      // The differences of f at the new point, with the predicted value.
      const E: Float64Array[] = [fp];
      for (let j = 1; j <= k; j++) E.push(E[j - 1]!.map((v, i) => v - Df[j - 1]![i]!));
      // Correct.
      const yc = this.y.slice();
      for (let j = 0; j < k; j++) for (let i = 0; i < n; i++) yc[i] = yc[i]! + h * AM[j]! * E[j]![i]!;
      const scale = yc.map((v, i) => atol + rtol * Math.max(Math.abs(v), Math.abs(this.y[i]!)));
      // Milne's device: the corrector's error is γ*ₖ/(γₖ − γ*ₖ) of corrector minus predictor.
      const milne = AM[k]! / (AB[k]! - AM[k]!);
      const err = rms(yc.map((v, i) => milne * (v - yp[i]!)), scale);
      if (!Number.isFinite(err) || err > 1) {
        // Rejected: smaller, and after repeated failures a lower order, as LSODE does: rescaling a high-order
        // table again and again amplifies its rounding until no step passes. After four, start over at order 1.
        fails++;
        const factor = Number.isFinite(err) ? Math.max(0.2, 0.9 * err ** (-1 / (k + 1))) : 0.2;
        this.hAbs *= factor;
        if (fails >= 4) {
          k = 1;
          Df[0] = f(this.x, this.y);
          for (let j = 1; j < Df.length; j++) Df[j] = new Float64Array(n);
        } else {
          if (fails >= 2 && k > 1) k--;
          rescale(Df, k, factor);
        }
        this.order = k;
        this.equalSteps = 0;
        continue;
      }
      // Evaluate again, and extend the table.
      const fc = f(xNew, yc);
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (fc[i]! - fp[i]!) ** 2;
        den += (yc[i]! - yp[i]!) ** 2;
      }
      this.stiffness = den > 0 ? this.hAbs * Math.sqrt(num / den) : 0;
      const N: Float64Array[] = [fc];
      for (let j = 1; j <= k + 1; j++) N.push(N[j - 1]!.map((v, i) => v - Df[j - 1]![i]!));
      for (let j = 0; j <= k + 1; j++) Df[j] = N[j]!;
      this.x = xNew;
      this.y = yc;
      this.equalSteps++;
      if (this.equalSteps < k + 1) return;
      // Order and step from the error each order would have made: about h·γ*ⱼ·∇ʲf.
      const est = (j: number): number => rms(Df[j]!.map((v) => this.hAbs * Math.abs(AM[j]!) * v), scale);
      const em = k > 1 ? est(k - 1) : Infinity;
      const ep = k < ADAMS_MAX ? est(k + 1) : Infinity;
      const factors = [em, err, ep].map((e, i) => (e === 0 ? 10 : e ** (-1 / (k + i))));
      const best = factors.indexOf(Math.max(...factors));
      this.order = Math.min(ADAMS_MAX, Math.max(1, k + best - 1));
      const factor = Math.max(0.2, Math.min(10, 0.9 * Math.max(...factors)));
      this.hAbs *= factor;
      rescale(Df, this.order, factor);
      this.equalSteps = 0;
      return;
    }
  }
}

function multistep(make: () => Multistep): Engine {
  const m = make();
  return {
    to(target, visit) {
      while (m.x !== target) {
        m.step(target);
        visit?.(m.x, m.y);
      }
      return m.y.slice();
    },
  };
}

export const bdf = (s: Setup): Engine => multistep(() => new Bdf(s, s.x1, s.y0));
export const adams = (s: Setup): Engine => multistep(() => new Adams(s, s.x1, s.y0));

/**
 * Adams while the problem isn't stiff, BDF while it is, as LSODA switches: after 10 Adams steps in a row held near
 * the edge of its stability (|h·∂f/∂y| above 0.9) it goes over to BDF, and after 20 BDF steps that Adams could
 * have taken stably (below 0.5) it comes back.
 */
export function adamsBdf(s: Setup): Engine {
  let m: Multistep = new Adams(s, s.x1, s.y0);
  let isAdams = true;
  let run = 0;
  return {
    to(target, visit) {
      while (m.x !== target) {
        m.step(target);
        visit?.(m.x, m.y);
        if (isAdams) {
          run = m.stiffness > 0.9 ? run + 1 : 0;
          if (run >= 10) {
            m = new Bdf(s, m.x, m.y);
            isAdams = false;
            run = 0;
          }
        } else {
          run = m.stiffness < 0.5 ? run + 1 : 0;
          if (run >= 20) {
            m = new Adams(s, m.x, m.y);
            isAdams = true;
            run = 0;
          }
        }
      }
      return m.y.slice();
    },
  };
}
