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
 * Mathcad 14's partial differential equation solvers (probed, 2026-11-11):
 *
 * - relax(a, b, c, d, e, f, u, rjac): Poisson's equation on a square grid by successive over-relaxation with
 *   Chebyshev acceleration, Numerical Recipes' sor: a·u(i+1,j) + b·u(i−1,j) + c·u(i,j+1) + d·u(i,j−1) + e·u(i,j) = f,
 *   the edges of u held, stopping when the residual's sum is under 1e−5 of the starting u's.
 * - multigrid(M, ncycle): ∇²u = M on the unit square, zero on the edges, by Numerical Recipes' full multigrid,
 *   mglin, on 2ⁿ + 1 points a side.
 * - numol(…): the method of lines (below).
 */
import { type Jacobian, cashKarp, radau } from './ode-methods.js';
import { EvalError, type Fn, type Mat, type Value, fromValues, getEl, isNoDim, newMat, num } from './values.js';

/** A square matrix of real numbers without units, as a 1-based array of rows, for the ports. */
function grid(v: Value | undefined, fn: string, what: string, n?: number): number[][] {
  if (v?.t !== 'mat' || v.cells || v.im?.some((x) => x !== 0) || !isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must be a matrix of real numbers without units`);
  if (v.rows !== v.cols) throw new EvalError('runtime', `${fn}'s ${what} must be square`);
  if (n !== undefined && v.rows !== n) throw new EvalError('runtime', `${fn}'s matrices must all be the same size`);
  const g: number[][] = [[]];
  for (let i = 0; i < v.rows; i++) {
    const row = [0];
    for (let j = 0; j < v.cols; j++) row.push(v.re[j * v.rows + i]!);
    g.push(row);
  }
  return g;
}

function matrixOf(g: number[][], n: number): Mat {
  const m = newMat(n, n);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) m.re[(j - 1) * n + (i - 1)] = g[i]![j]!;
  return m;
}

/** Numerical Recipes' sor, step for step. */
export function relax(args: Value[]): Mat {
  const fn = 'relax';
  const a = grid(args[0], fn, 'a');
  const n = a.length - 1;
  const [b, c, d, e, f] = [1, 2, 3, 4, 5].map((k) => grid(args[k], fn, 'abcdef'[k]!, n)) as [number[][], number[][], number[][], number[][], number[][]];
  const u = grid(args[6], fn, 'u', n);
  const rv = args[7];
  if (rv?.t !== 'num' || rv.im !== 0 || !isNoDim(rv.dim)) throw new EvalError('runtime', "relax's rjac must be a real number");
  const rjac = rv.re;
  if (!(rjac > 0 && rjac < 1)) throw new EvalError('runtime', "relax's rjac, the Jacobi iteration's spectral radius, must be between 0 and 1");
  const MAXITS = 1000;
  const EPS = 1e-5;
  // NR sums |f|; Mathcad sums the residual of the starting u instead (probed: Laplace's equation, where f = 0,
  // stops at the same sweep as Mathcad only so), which is the same when the starting u is 0 inside.
  let anormf = 0;
  for (let j = 2; j < n; j++) {
    for (let l = 2; l < n; l++) {
      anormf += Math.abs(a[j]![l]! * u[j + 1]![l]! + b[j]![l]! * u[j - 1]![l]! + c[j]![l]! * u[j]![l + 1]! + d[j]![l]! * u[j]![l - 1]! + e[j]![l]! * u[j]![l]! - f[j]![l]!);
    }
  }
  let omega = 1;
  for (let it = 1; it <= MAXITS; it++) {
    let anorm = 0;
    let jsw = 1;
    for (let ipass = 1; ipass <= 2; ipass++) {
      let lsw = jsw;
      for (let j = 2; j < n; j++) {
        for (let l = lsw + 1; l < n; l += 2) {
          const resid = a[j]![l]! * u[j + 1]![l]! + b[j]![l]! * u[j - 1]![l]! + c[j]![l]! * u[j]![l + 1]! + d[j]![l]! * u[j]![l - 1]! + e[j]![l]! * u[j]![l]! - f[j]![l]!;
          anorm += Math.abs(resid);
          u[j]![l] = u[j]![l]! - (omega * resid) / e[j]![l]!;
        }
        lsw = 3 - lsw;
      }
      jsw = 3 - jsw;
      omega = it === 1 && ipass === 1 ? 1 / (1 - 0.5 * rjac * rjac) : 1 / (1 - 0.25 * rjac * rjac * omega);
    }
    if (anorm < EPS * anormf) return matrixOf(u, n);
  }
  if (anormf === 0) return matrixOf(u, n);
  throw new EvalError('runtime', `relax didn't converge in ${MAXITS} sweeps: try another rjac, near 1 − π²/(2·n²)`);
}

// ── Numerical Recipes' full multigrid, mglin, with its helpers, 1-based ────────────────────────────

const square = (n: number): number[][] => Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));

function rstrct(uc: number[][], uf: number[][], nc: number): void {
  const ncc = 2 * nc - 1;
  for (let jf = 3, jc = 2; jc < nc; jc++, jf += 2) {
    for (let iif = 3, ic = 2; ic < nc; ic++, iif += 2) {
      uc[ic]![jc] = 0.5 * uf[iif]![jf]! + 0.125 * (uf[iif + 1]![jf]! + uf[iif - 1]![jf]! + uf[iif]![jf + 1]! + uf[iif]![jf - 1]!);
    }
  }
  for (let jc = 1, ic = 1; ic <= nc; ic++, jc += 2) {
    uc[ic]![1] = uf[jc]![1]!;
    uc[ic]![nc] = uf[jc]![ncc]!;
  }
  for (let jc = 1, ic = 1; ic <= nc; ic++, jc += 2) {
    uc[1]![ic] = uf[1]![jc]!;
    uc[nc]![ic] = uf[ncc]![jc]!;
  }
}

function interp(uf: number[][], uc: number[][], nf: number): void {
  const nc = Math.floor(nf / 2) + 1;
  for (let jc = 1, jf = 1; jc <= nc; jc++, jf += 2) for (let ic = 1; ic <= nc; ic++) uf[2 * ic - 1]![jf] = uc[ic]![jc]!;
  for (let jf = 1; jf <= nf; jf += 2) for (let iif = 2; iif < nf; iif += 2) uf[iif]![jf] = 0.5 * (uf[iif + 1]![jf]! + uf[iif - 1]![jf]!);
  for (let jf = 2; jf < nf; jf += 2) for (let iif = 1; iif <= nf; iif++) uf[iif]![jf] = 0.5 * (uf[iif]![jf + 1]! + uf[iif]![jf - 1]!);
}

function addint(uf: number[][], uc: number[][], res: number[][], nf: number): void {
  interp(res, uc, nf);
  for (let j = 1; j <= nf; j++) for (let i = 1; i <= nf; i++) uf[i]![j] = uf[i]![j]! + res[i]![j]!;
}

function fill0(u: number[][], n: number): void {
  for (let j = 1; j <= n; j++) for (let i = 1; i <= n; i++) u[i]![j] = 0;
}

function slvsml(u: number[][], rhs: number[][]): void {
  const h = 0.5;
  fill0(u, 3);
  u[2]![2] = (-h * h * rhs[2]![2]!) / 4;
}

function gaussSeidel(u: number[][], rhs: number[][], n: number): void {
  const h = 1 / (n - 1);
  const h2 = h * h;
  for (let ipass = 1, jsw = 1; ipass <= 2; ipass++, jsw = 3 - jsw) {
    let isw = jsw;
    for (let j = 2; j < n; j++, isw = 3 - isw) {
      for (let i = isw + 1; i < n; i += 2) u[i]![j] = 0.25 * (u[i + 1]![j]! + u[i - 1]![j]! + u[i]![j + 1]! + u[i]![j - 1]! - h2 * rhs[i]![j]!);
    }
  }
}

function resid(res: number[][], u: number[][], rhs: number[][], n: number): void {
  const h = 1 / (n - 1);
  const h2i = 1 / (h * h);
  for (let j = 2; j < n; j++) for (let i = 2; i < n; i++) res[i]![j] = -h2i * (u[i + 1]![j]! + u[i - 1]![j]! + u[i]![j + 1]! + u[i]![j - 1]! - 4 * u[i]![j]!) + rhs[i]![j]!;
  for (let i = 1; i <= n; i++) res[i]![1] = res[i]![n] = res[1]![i] = res[n]![i] = 0;
}

export function multigrid(args: Value[]): Mat {
  const fn = 'multigrid';
  const u = grid(args[0], fn, 'M');
  const n = u.length - 1;
  const cv = args[1];
  if (cv?.t !== 'num' || !Number.isInteger(cv.re) || cv.re < 1) throw new EvalError('runtime', "multigrid's ncycle must be a whole number, 1 or more");
  const ncycle = cv.re;
  let ng = 0;
  for (let nn = n; (nn >>= 1); ) ng++;
  if (n !== 1 + (1 << ng) || n < 5) throw new EvalError('runtime', "multigrid's M must have 2ⁿ + 1 rows, as 5, 9, 17 or 33: the number of rows − 1 must be a power of 2");
  const irho: number[][][] = [];
  const iu: number[][][] = [];
  const irhs: number[][][] = [];
  const ires: number[][][] = [];
  let nn = Math.floor(n / 2) + 1;
  let ngrid = ng - 1;
  irho[ngrid] = square(nn);
  rstrct(irho[ngrid]!, u, nn);
  while (nn > 3) {
    nn = Math.floor(nn / 2) + 1;
    irho[--ngrid] = square(nn);
    rstrct(irho[ngrid]!, irho[ngrid + 1]!, nn);
  }
  nn = 3;
  iu[1] = square(nn);
  irhs[1] = square(nn);
  slvsml(iu[1], irho[1]!);
  ngrid = ng;
  for (let j = 2; j <= ngrid; j++) {
    nn = 2 * nn - 1;
    iu[j] = square(nn);
    irhs[j] = square(nn);
    ires[j] = square(nn);
    interp(iu[j]!, iu[j - 1]!, nn);
    const src = j !== ngrid ? irho[j]! : u;
    for (let a = 1; a <= nn; a++) for (let b = 1; b <= nn; b++) irhs[j]![a]![b] = src[a]![b]!;
    for (let jcycle = 1; jcycle <= ncycle; jcycle++) {
      let nf = nn;
      for (let jj = j; jj >= 2; jj--) {
        gaussSeidel(iu[jj]!, irhs[jj]!, nf);
        resid(ires[jj]!, iu[jj]!, irhs[jj]!, nf);
        nf = Math.floor(nf / 2) + 1;
        rstrct(irhs[jj - 1]!, ires[jj]!, nf);
        fill0(iu[jj - 1]!, nf);
      }
      slvsml(iu[1]!, irhs[1]!);
      nf = 3;
      for (let jj = 2; jj <= j; jj++) {
        nf = 2 * nf - 1;
        addint(iu[jj]!, iu[jj - 1]!, ires[jj]!, nf);
        gaussSeidel(iu[jj]!, irhs[jj]!, nf);
      }
    }
  }
  return matrixOf(iu[ngrid]!, n);
}

// ── numol: the method of lines ───────────────────────────────────────────────────────────────────

/**
 * ∂²u/∂x² at node i, Mathcad's default "r-5-pt-diff" (probed: it reproduces Mathcad's heat equation to 4e−8): the
 * five-point central difference inside, and fourth-order one-sided six-point differences next to and at the ends.
 */
function d2(u: Float64Array, i: number, h: number): number {
  const n = u.length;
  const h2 = 12 * h * h;
  if (i >= 2 && i <= n - 3) return (-u[i + 2]! + 16 * u[i + 1]! - 30 * u[i]! + 16 * u[i - 1]! - u[i - 2]!) / h2;
  if (i === 1) return (10 * u[0]! - 15 * u[1]! - 4 * u[2]! + 14 * u[3]! - 6 * u[4]! + u[5]!) / h2;
  if (i === n - 2) return (10 * u[n - 1]! - 15 * u[n - 2]! - 4 * u[n - 3]! + 14 * u[n - 4]! - 6 * u[n - 5]! + u[n - 6]!) / h2;
  if (i === 0) return (45 * u[0]! - 154 * u[1]! + 214 * u[2]! - 156 * u[3]! + 61 * u[4]! - 10 * u[5]!) / h2;
  return (45 * u[n - 1]! - 154 * u[n - 2]! + 214 * u[n - 3]! - 156 * u[n - 4]! + 61 * u[n - 5]! - 10 * u[n - 6]!) / h2;
}

/** ∂u/∂x at node i: the five-point central difference inside, fourth-order one-sided five-point near the ends. */
function d1(u: Float64Array, i: number, h: number): number {
  const n = u.length;
  const h12 = 12 * h;
  if (i >= 2 && i <= n - 3) return (-u[i + 2]! + 8 * u[i + 1]! - 8 * u[i - 1]! + u[i - 2]!) / h12;
  if (i === 1) return (-3 * u[0]! - 10 * u[1]! + 18 * u[2]! - 6 * u[3]! + u[4]!) / h12;
  if (i === n - 2) return (3 * u[n - 1]! + 10 * u[n - 2]! - 18 * u[n - 3]! + 6 * u[n - 4]! - u[n - 5]!) / h12;
  if (i === 0) return (-25 * u[0]! + 48 * u[1]! - 36 * u[2]! + 16 * u[3]! - 3 * u[4]!) / h12;
  return (25 * u[n - 1]! - 48 * u[n - 2]! + 36 * u[n - 3]! - 16 * u[n - 4]! + 3 * u[n - 5]!) / h12;
}

/** One end of a function's line: a value (or, Neumann, a slope) at each t, or free for a first-order equation. */
export type Side = { kind: 'value'; f: (t: number) => number; neumann?: boolean } | { kind: 'free' };
export interface Boundary { left: Side; right: Side; neumann: boolean }

const realOf = (v: Value, fn: string, what: string): number => {
  if (v.t !== 'num' || v.im !== 0 || !isNoDim(v.dim)) throw new EvalError('runtime', `${fn}: ${what} must be a real number without units`);
  return v.re;
};

const column = (xs: ArrayLike<number>): Mat => fromValues(xs.length, 1, Array.from(xs, (x) => num(x)));

/** A vector's elements, as numbers; a single number counts as a vector of one. */
function realsOf(v: Value, fn: string, what: string): number[] {
  if (v.t === 'num') return [realOf(v, fn, what)];
  if (v.t !== 'mat' || v.cells || (v.cols !== 1 && v.rows !== 1)) throw new EvalError('runtime', `${fn}: ${what} must be a vector of real numbers`);
  return Array.from({ length: v.rows * v.cols }, (_, k) => realOf(getEl(v, v.cols === 1 ? k : 0, v.cols === 1 ? 0 : k), fn, what));
}

/**
 * The solution of n PDEs u_t = F(x, t, u, u_x, u_xx) on a line, as Mathcad's numol: xpts points across, the values
 * at tpts times, the functions side by side, a row per point. Space is discretized as Mathcad does (d1, d2), and
 * time integrated to 1e−8 (Radau IIA when diffusion makes it stiff, adaptive Runge–Kutta otherwise), Mathcad's to
 * its own fixed tolerance: the probed answers agree to about 1e−6.
 * Dirichlet ends take bc's values; a Neumann end takes the value that makes the one-sided derivative bc's; "NA",
 * for a first-order equation, leaves that end to the equation. Mathcad 14's Neumann answers aren't consistent
 * (they gain heat through two insulated ends), so MathMath's differ there.
 */
export function numol(args: Value[]): Mat {
  const fn = 'numol';
  const [xe, xp, te, tp, np, na, pde, init, bcv] = args as [Value, Value, Value, Value, Value, Value, Value, Value, Value];
  const [xa, xb] = realsOf(xe, fn, 'x_endpts');
  const [ta, tb] = realsOf(te, fn, 't_endpts');
  if (xa === undefined || xb === undefined || realsOf(xe, fn, 'x_endpts').length !== 2) throw new EvalError('runtime', "numol's x_endpts must be a vector of two values");
  if (ta === undefined || tb === undefined || realsOf(te, fn, 't_endpts').length !== 2) throw new EvalError('runtime', "numol's t_endpts must be a vector of two values");
  if (!(xb > xa)) throw new EvalError('runtime', "numol's x_endpts must go from left to right: the first below the second");
  if (!(tb > ta)) throw new EvalError('runtime', "numol's t_endpts must go forward in time: the first below the second");
  const count = (v: Value, what: string, min: number): number => {
    const x = realOf(v, fn, what);
    if (!Number.isInteger(x) || x < min) throw new EvalError('runtime', `numol's ${what} must be a whole number, ${min} or more`);
    return x;
  };
  const xpts = count(xp, 'xpts', 6);
  const tpts = count(tp, 'tpts', 2);
  const npde = count(np, 'num_pde', 1);
  if (count(na, 'num_pae', 0) > 0) throw new EvalError('unsupported', 'numol: algebraic equations (num_pae above 0) aren\'t supported yet');
  const fnOf = (v: Value, what: string): Fn => {
    if (v.t !== 'fn') throw new EvalError('runtime', `numol's ${what} must be a function, defined above`);
    return v;
  };
  const F = fnOf(pde, 'pde_func');
  const P = fnOf(init, 'pinit');
  const BC = bcv.t === 'fn' ? bcv : null;
  if (!BC && bcv.t !== 'mat') throw new EvalError('runtime', "numol's bc_func must be a function of t giving a num_pde × 3 matrix");
  const bcAt = (t: number): Mat => {
    const m = BC ? BC.call([num(t)]) : bcv;
    if (m.t !== 'mat' || m.rows !== npde || m.cols !== 3) throw new EvalError('runtime', `numol's bc_func must give a ${npde} × 3 matrix: left, right, and "D" or "N"`);
    return m;
  };
  const sides: Boundary[] = Array.from({ length: npde }, (_, k) => {
    const m = bcAt(ta);
    const kind = getEl(m, k, 2);
    if (kind.t !== 'str' || (kind.v !== 'D' && kind.v !== 'N')) throw new EvalError('runtime', `numol's bc_func row ${k}: the third entry must be "D" or "N"`);
    const side = (j: number): Side => {
      const v = getEl(m, k, j);
      if (v.t === 'str') {
        if (v.v !== 'NA') throw new EvalError('runtime', `numol's bc_func row ${k}: a boundary is a value, or "NA" for none`);
        return { kind: 'free' };
      }
      return { kind: 'value', f: (t) => realOf(getEl(bcAt(t), k, j), fn, 'a boundary value') };
    };
    return { left: side(0), right: side(1), neumann: kind.v === 'N' };
  });
  const rate = (x: number, t: number, u: number[], ux: number[], uxx: number[]): number[] => {
    const r = realsOf(F.call([num(x), num(t), column(u), column(ux), column(uxx)]), fn, 'pde_func');
    if (r.length !== npde) throw new EvalError('runtime', `numol's pde_func must give ${npde} value${npde === 1 ? '' : 's'}, one for each equation`);
    return r;
  };
  const start = (x: number): number[] => {
    const v = realsOf(P.call([num(x)]), fn, 'pinit');
    if (v.length !== npde) throw new EvalError('runtime', `numol's pinit must give ${npde} value${npde === 1 ? '' : 's'}, one for each equation`);
    return v;
  };
  const grids = methodOfLines({ xa, xb, xpts, ta, tb, tpts, sides, rate, start, fn });
  const out = newMat(xpts, tpts * npde);
  grids.forEach((g, k) => out.re.set(g, k * tpts * xpts));
  return out;
}

/** A line of PDEs to solve: the boundary conditions of each function, its rate F(x, t, u, u_x, u_xx) and start. */
export interface Lines {
  xa: number; xb: number; xpts: number;
  ta: number; tb: number; tpts: number;
  sides: Boundary[];
  rate: (x: number, t: number, u: number[], ux: number[], uxx: number[]) => number[];
  start: (x: number) => number[];
  fn: string;
}

/** Each function's values on the grid, point i at time j at [j·xpts + i]. */
export function methodOfLines(p: Lines): Float64Array[] {
  const { xa, xb, xpts, ta, tb, tpts, sides, fn } = p;
  const h = (xb - xa) / (xpts - 1);
  const xs = Array.from({ length: xpts }, (_, i) => (i === xpts - 1 ? xb : xa + i * h));
  // Which nodes evolve: the ones in between, and an end left free.
  const evolving = sides.map((sd) => xs.map((_, i) => (i > 0 && i < xpts - 1) || (i === 0 && sd.left.kind === 'free') || (i === xpts - 1 && sd.right.kind === 'free')));
  const index: [number, number][] = [];
  evolving.forEach((e, k) => e.forEach((on, i) => on && index.push([k, i])));
  /** Each function's values along the line at time t from the state, its ends filled in from the boundary conditions. */
  const fill = (t: number, y: Float64Array): Float64Array[] => {
    const us = sides.map(() => new Float64Array(xpts));
    index.forEach(([k, i], s) => (us[k]![i] = y[s]!));
    sides.forEach((sd, k) => {
      const u = us[k]!;
      const n = xpts;
      if (sd.left.kind === 'value') u[0] = (sd.left.neumann ?? sd.neumann) ? (48 * u[1]! - 36 * u[2]! + 16 * u[3]! - 3 * u[4]! - 12 * h * sd.left.f(t)) / 25 : sd.left.f(t);
      if (sd.right.kind === 'value') u[n - 1] = (sd.right.neumann ?? sd.neumann) ? (12 * h * sd.right.f(t) + 48 * u[n - 2]! - 36 * u[n - 3]! + 16 * u[n - 4]! - 3 * u[n - 5]!) / 25 : sd.right.f(t);
    });
    return us;
  };
  const f = (t: number, y: Float64Array): Float64Array => {
    const us = fill(t, y);
    const ux = us.map((u) => Float64Array.from(u, (_, i) => d1(u, i, h)));
    const uxx = us.map((u) => Float64Array.from(u, (_, i) => d2(u, i, h)));
    const out = new Float64Array(y.length);
    const rates = new Map<number, number[]>();
    index.forEach(([k, i], s) => {
      let r = rates.get(i);
      if (!r) {
        r = p.rate(xs[i]!, t, us.map((u) => u[i]!), ux.map((u) => u[i]!), uxx.map((u) => u[i]!));
        rates.set(i, r);
      }
      out[s] = r[k]!;
    });
    return out;
  };
  const starts = xs.map((x) => p.start(x));
  const y0 = Float64Array.from(index, ([k, i]) => starts[i]![k]!);
  // The Jacobian by differences, many states at once: a node's rate reads nodes at most five away (the one-sided
  // stencils, and a Neumann end worked out from four), so states eleven or more nodes apart never share a rate, and
  // can be nudged together. 11 rates per function per Jacobian, rather than one per state.
  const STRIDE = 11;
  const near = (i: number, j: number) => Math.abs(i - j) <= 5;
  const jac: Jacobian = (t, y, fy) => {
    const n = y.length;
    const dfdy = Array.from({ length: n }, () => new Float64Array(n));
    for (let k = 0; k < sides.length; k++) {
      for (let c = 0; c < STRIDE; c++) {
        const group = index.flatMap(([kk, i], s) => (kk === k && i % STRIDE === c ? [s] : []));
        if (group.length === 0) continue;
        const z = y.slice();
        const steps = group.map((s) => Math.sqrt(2.2e-16) * Math.max(1, Math.abs(y[s]!)));
        group.forEach((s, g) => (z[s] = y[s]! + steps[g]!));
        const fz = f(t, z);
        group.forEach((s, g) => {
          const node = index[s]![1];
          index.forEach(([, i], r) => {
            if (near(i, node)) dfdy[r]![s] = (fz[r]! - fy[r]!) / steps[g]!;
          });
        });
      }
    }
    return { dfdx: new Float64Array(n), dfdy };
  };
  // Diffusion makes a stiff system, its fastest rate growing as 1/h², and wants Radau; waves and slow diffusion don't,
  // and Radau, refactoring at nearly every step on an oscillation, is many times slower there than adaptive
  // Runge–Kutta. The largest rate, by power iteration on differences, decides.
  const f0 = f(ta, y0);
  let w = Float64Array.from(y0, (_, k) => 1 + ((k * 7919) % 13) / 13);
  let rho = 0;
  for (let it = 0; it < 30; it++) {
    const norm = Math.hypot(...w) || 1;
    const eps = 1e-7 * Math.max(1, Math.hypot(...y0)) / norm;
    const fw = f(ta, Float64Array.from(y0, (v, k) => v + eps * w[k]!));
    const next = Float64Array.from(fw, (v, k) => (v - f0[k]!) / eps);
    rho = Math.hypot(...next) / norm;
    w = next;
    if (!(rho > 0) || !Number.isFinite(rho)) break;
  }
  const setup = { f, x1: ta, y0, x2: tb, rtol: 1e-8, atol: 1e-10, fn, jac };
  const engine = rho * (tb - ta) > 200 ? radau(setup) : cashKarp(setup);
  const grids = sides.map(() => new Float64Array(xpts * tpts));
  for (let j = 0; j < tpts; j++) {
    const t = j === tpts - 1 ? tb : ta + ((tb - ta) * j) / (tpts - 1);
    const y = j === 0 ? y0 : engine.to(t);
    fill(t, y).forEach((u, k) => grids[k]!.set(u, j * xpts));
  }
  return grids;
}

type Impl = (...args: Value[]) => Value;
export const PDE_ARITY: Record<string, [number, number]> = { relax: [8, 8], multigrid: [2, 2], numol: [9, 9] };
export const pdeFns: Record<string, Impl> = {
  relax: (...a) => relax(a),
  multigrid: (...a) => multigrid(a),
  numol: (...a) => numol(a),
};
