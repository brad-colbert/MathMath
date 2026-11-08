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
 * The numerical methods behind solve blocks and root: least squares for Find and Minerr, a quasi-Newton
 * search for Maximize and Minimize, and Brent's method and the secant method for root. Each works on plain
 * numbers; the evaluator turns a sheet's variables and constraints into the functions these take.
 */

type Vec = Float64Array;
const EPS = 2.220446049250313e-16;

/** Solves the n × n system A·x = b by Gaussian elimination with partial pivoting; null if A is singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r) => r.slice());
  const x = b.slice();
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-300) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    [x[c], x[p]] = [x[p]!, x[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k < n; k++) M[r]![k]! -= f * M[c]![k]!;
      x[r]! -= f * x[c]!;
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r]!;
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

const sumSq = (r: Vec): number => r.reduce((s, v) => s + v * v, 0);

/** A step for a central difference in x: relative to its size, or absolute near 0. */
const delta = (x: number): number => Math.cbrt(EPS) * Math.max(Math.abs(x), 1e-3);

/** ∂rᵢ/∂xⱼ by central differences. */
function jacobian(res: (x: Vec) => Vec, x: Vec, m: number): number[][] {
  const J = Array.from({ length: m }, () => new Array<number>(x.length).fill(0));
  for (let j = 0; j < x.length; j++) {
    const h = delta(x[j]!);
    const up = x.slice();
    const down = x.slice();
    up[j] = x[j]! + h;
    down[j] = x[j]! - h;
    const ru = res(up);
    const rd = res(down);
    for (let i = 0; i < m; i++) J[i]![j] = (ru[i]! - rd[i]!) / (2 * h);
  }
  return J;
}

export interface Fit {
  x: Vec;
  /** The residuals at x. */
  r: Vec;
}

/**
 * Levenberg–Marquardt: x making the residuals as near 0 as it can, in the least-squares sense, starting at
 * x0. Stops when a step no longer improves them, or the residuals vanish. jac gives ∂rᵢ/∂xⱼ when the caller
 * can work it out more cheaply than by differences of every residual.
 */
export function leastSquares(res: (x: Vec) => Vec, x0: Vec, maxIter = 500, jac?: (x: Vec) => number[][]): Fit {
  let x = x0.slice();
  let r = res(x);
  let cost = sumSq(r);
  let lambda = 1e-3;
  const n = x.length;
  for (let iter = 0; iter < maxIter && cost > 0; iter++) {
    const J = jac ? jac(x) : jacobian(res, x, r.length);
    // (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀr
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a]! * row[b]!, 0)));
    const Jtr = Array.from({ length: n }, (_, a) => J.reduce((s, row, i) => s + row[a]! * r[i]!, 0));
    let improved = false;
    for (let tries = 0; tries < 30; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-12) : v)));
      const step = solveLinear(A, Jtr.map((v) => -v));
      if (!step) {
        lambda *= 10;
        continue;
      }
      const next = x.map((v, j) => v + step[j]!);
      const rn = res(next);
      const cn = sumSq(rn);
      if (Number.isFinite(cn) && cn < cost) {
        const small = step.every((s, j) => Math.abs(s) <= 4 * EPS * Math.max(Math.abs(next[j]!), 1e-300));
        x = next;
        r = rn;
        const gain = cost - cn;
        cost = cn;
        lambda = Math.max(lambda / 10, 1e-15);
        improved = true;
        if (small || gain <= EPS * EPS * cost) return { x, r };
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  return { x, r };
}

/**
 * Newton's method on a square system, keeping the Jacobian while its steps still cut the residuals well, and
 * Levenberg–Marquardt steps from a fresh one when a Newton step doesn't help: a singular system, or a guess
 * too far out. A linear system takes one Jacobian. Stops when done says the residuals are small enough, when
 * no step makes them smaller, or when they're already good enough and fresh Jacobians barely help.
 */
export function newtonSystem(res: (x: Vec) => Vec, x0: Vec, jac: (x: Vec) => number[][], done: (x: Vec, r: Vec) => boolean, good: (x: Vec, r: Vec) => boolean, maxIter = 100): Fit {
  let x = x0.slice();
  let r = res(x);
  let cost = sumSq(r);
  let J: number[][] | null = null;
  let fresh = false;
  // Steps from fresh Jacobians that barely help, in a row: the residuals are down to the noise in them.
  let poor = 0;
  const take = (step: number[]): boolean => {
    const next = x.map((v, j) => v + step[j]!);
    const rn = res(next);
    const cn = sumSq(rn);
    if (!(Number.isFinite(cn) && cn < cost)) return false;
    const small = step.every((s, j) => Math.abs(s) <= 4 * EPS * Math.max(Math.abs(next[j]!), 1e-300));
    const gain = cost - cn;
    if (fresh) poor = cn > 0.01 * cost && good(next, rn) ? poor + 1 : 0;
    if (cn > 0.01 * cost) J = null;
    x = next;
    r = rn;
    cost = cn;
    fresh = false;
    if (small || gain <= EPS * EPS * cost || poor >= 2) maxIter = 0;
    return true;
  };
  for (let iter = 0; iter < maxIter && cost > 0 && !done(x, r); iter++) {
    if (!J) {
      J = jac(x);
      fresh = true;
    }
    const step = solveLinear(J, Array.from(r, (v) => -v));
    if (step && step.every(Number.isFinite) && take(step)) continue;
    if (!fresh) {
      J = null;
      continue;
    }
    // Damped Newton: part of the way along the step, which still points downhill.
    let damped = false;
    if (step && step.every(Number.isFinite)) {
      for (let t = 0.5; t >= 1 / 1024 && !damped; t /= 2) {
        damped = take(step.map((v) => v * t));
        // A step cut short says the system is far from linear here: work out the Jacobian afresh.
        if (damped) J = null;
      }
    }
    if (damped) continue;
    const n = x.length;
    const Jm = J!;
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => Jm.reduce((s, row) => s + row[a]! * row[b]!, 0)));
    const Jtr = Array.from({ length: n }, (_, a) => Jm.reduce((s, row, i) => s + row[a]! * r[i]!, 0));
    let took = false;
    for (let lambda = 1e-6; lambda <= 1e12 && !took; lambda *= 10) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-12) : v)));
      const lm = solveLinear(A, Jtr.map((v) => -v));
      took = !!lm && lm.every(Number.isFinite) && take(lm);
    }
    if (!took) break;
  }
  return { x, r };
}

/**
 * The minimum of f near x0, by BFGS with a central-difference gradient and a backtracking line search. null
 * when f keeps falling without bound.
 */
export function minimize(f: (x: Vec) => number, x0: Vec, maxIter = 1000): Vec | null {
  const n = x0.length;
  let x = x0.slice();
  let fx = f(x);
  const grad = (p: Vec): Vec => p.map((v, j) => {
    const h = delta(v);
    const up = p.slice();
    const down = p.slice();
    up[j] = v + h;
    down[j] = v - h;
    return (f(up) - f(down)) / (2 * h);
  });
  let g = grad(x);
  let H: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let iter = 0; iter < maxIter; iter++) {
    const d = H.map((row) => -row.reduce((s, v, j) => s + v * g[j]!, 0));
    let slope = d.reduce((s, v, j) => s + v * g[j]!, 0);
    if (!(slope < 0)) {
      // Not a descent direction: start the curvature estimate again, down the gradient.
      H = H.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
      for (let j = 0; j < n; j++) d[j] = -g[j]!;
      slope = -g.reduce((s, v) => s + v * v, 0);
      if (slope === 0) return x;
    }
    let t = 1;
    let next = x;
    let fn = fx;
    for (let k = 0; k < 60; k++) {
      next = x.map((v, j) => v + t * d[j]!);
      fn = f(next);
      if (Number.isFinite(fn) && fn <= fx + 1e-4 * t * slope) break;
      t /= 2;
    }
    if (!(fn < fx)) return x;
    if (next.some((v) => Math.abs(v) > 1e150) || fn < -1e300) return null;
    const gn = grad(next);
    const s = next.map((v, j) => v - x[j]!);
    const y = gn.map((v, j) => v - g[j]!);
    const sy = s.reduce((acc, v, j) => acc + v * y[j]!, 0);
    const done = s.every((v, j) => Math.abs(v) <= 4 * EPS * Math.max(Math.abs(next[j]!), 1)) || Math.abs(fx - fn) <= EPS * Math.abs(fn);
    x = next;
    fx = fn;
    g = gn;
    if (done) return x;
    if (sy > 1e-300) {
      // The BFGS update of the inverse Hessian.
      const Hy = H.map((row) => row.reduce((acc, v, j) => acc + v * y[j]!, 0));
      const yHy = y.reduce((acc, v, j) => acc + v * Hy[j]!, 0);
      H = H.map((row, i) => row.map((v, j) => v + ((sy + yHy) * s[i]! * s[j]!) / (sy * sy) - (Hy[i]! * s[j]! + s[i]! * Hy[j]!) / sy));
    }
  }
  return x;
}

/** The minimum of f subject to residuals that must vanish: a quadratic penalty, raised until they're within ctol. */
export function minimizeWithin(f: (x: Vec) => number, res: (x: Vec) => Vec, x0: Vec, ctol: number): Vec | null {
  let x = x0;
  for (let mu = 1; mu <= 1e14; mu *= 10) {
    const found = minimize((p) => f(p) + mu * sumSq(res(p)), x);
    if (!found) return null;
    x = found;
    if (res(x).every((v) => Math.abs(v) <= ctol)) return x;
  }
  return x;
}

/** Brent's method on [a, b], where f changes sign: to full precision. */
export function brent(f: (x: number) => number, a: number, b: number): number {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let iter = 0; iter < 200; iter++) {
    if (Math.sign(fb) === Math.sign(fc)) {
      c = a;
      fc = fa;
      d = e = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      [a, b, c] = [b, c, b];
      [fa, fb, fc] = [fb, fc, fb];
    }
    const tol = 2 * EPS * Math.abs(b);
    const m = (c - b) / 2;
    if (Math.abs(m) <= tol || fb === 0) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      // Interpolation: secant, or inverse quadratic with three points.
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol ? d : Math.sign(m) * tol;
    fb = f(b);
  }
  return b;
}

/** The secant method from a guess, to full precision; null if it doesn't settle. */
export function secant(f: (x: number) => number, x0: number): number | null {
  let a = x0;
  let b = x0 + delta(x0) * 1e3;
  let fa = f(a);
  let fb = f(b);
  for (let iter = 0; iter < 200; iter++) {
    if (fb === 0) return b;
    if (fb === fa) return Math.abs(fb) < Math.abs(fa) * 1e-12 ? b : null;
    const next = b - (fb * (b - a)) / (fb - fa);
    if (!Number.isFinite(next)) return null;
    [a, fa] = [b, fb];
    b = next;
    fb = f(b);
    if (Math.abs(b - a) <= 4 * EPS * Math.max(Math.abs(b), 1e-300)) return b;
  }
  return null;
}

/**
 * Whether the far conditions of a boundary value problem fix the free starting values well. J holds each
 * condition's response to each free value; S the largest response of the condition's quantity anywhere
 * along the way. y'' + y = 0 with y(0) = 0 and y(π) = 1 moves y everywhere but leaves y(π) at 0, so no
 * amplitude meets it. A starting value that nothing depends on is left alone, as Mathcad leaves it at its guess.
 */
export function wellPosed(J: number[][], S: number[][]): boolean {
  const n = J[0]?.length ?? 0;
  // Scale each starting value, then each condition, by its largest response, leaving out those with none.
  const cols = [...Array(n).keys()].filter((j) => S.some((row) => row[j]! > 0));
  const colScale = cols.map((j) => 1 / Math.max(...S.map((row) => row[j]!)));
  const rows = [...S.keys()].filter((i) => cols.some((j) => S[i]![j]! > 0));
  if (rows.length !== cols.length || rows.length === 0) return true;
  const A = rows.map((i) => {
    const rowScale = 1 / Math.max(...cols.map((j, c) => S[i]![j]! * colScale[c]!));
    return cols.map((j, c) => J[i]![j]! * colScale[c]! * rowScale);
  });
  // Its smallest singular value is at least 1/‖A⁻¹‖ and at most √k/‖A⁻¹‖, in the Frobenius norm.
  let sum = 0;
  for (let c = 0; c < A.length; c++) {
    const col = solveLinear(A, A.map((_, r) => (r === c ? 1 : 0)));
    if (!col) return false;
    sum += col.reduce((acc, v) => acc + v * v, 0);
  }
  return 1 / Math.sqrt(sum) > 1e-6;
}

export interface BoundaryProblem {
  /** The state at the start; the free entries are unknown. */
  y0: Vec;
  free: number[];
  /** Conditions on the state at the far point, as many as there are free entries. */
  targets: { i: number; value: number }[];
  /** The segments' ends, from the start to the far point. */
  nodes: number[];
  /** The state at x2 from the state y at x1. */
  flow(x1: number, x2: number, y: Vec): Vec;
}

/**
 * A boundary value problem by multiple shooting: the free starting values and the state at each node
 * between, solved together so each segment ends where the next begins and the far conditions hold. Short
 * segments keep a solution that grows fast, as e^(10 t), from swamping the one that decays. Gives each
 * segment's starting state and the state at the far point, or why it failed.
 */
export function multipleShooting(bp: BoundaryProblem): { starts: Vec[]; end: Vec } | 'unmet' | 'ill-posed' {
  const { y0, free, targets, nodes, flow } = bp;
  const N = y0.length;
  const nf = free.length;
  const M = nodes.length - 1;
  const U = nf + (M - 1) * N;
  const state = (z: Vec, k: number): Vec => {
    if (k > 0) return z.slice(nf + (k - 1) * N, nf + k * N);
    const y = y0.slice();
    free.forEach((i, j) => (y[i] = z[j]!));
    return y;
  };
  const residual = (z: Vec): Vec => {
    const F = new Float64Array(U);
    try {
      for (let k = 0; k < M; k++) {
        const e = flow(nodes[k]!, nodes[k + 1]!, state(z, k));
        if (k < M - 1) for (let i = 0; i < N; i++) F[k * N + i] = e[i]! - z[nf + k * N + i]!;
        else targets.forEach((t, j) => (F[(M - 1) * N + j] = e[t.i]! - t.value));
      }
    } catch {
      F.fill(NaN);
    }
    return F;
  };
  // ∂(state at the end of segment k)/∂(its starting state), by central differences: the first segment's
  // by the free values only.
  const segment = (z: Vec, k: number): number[][] => {
    const s = state(z, k);
    const cols = k === 0 ? free : [...Array(N).keys()];
    const G = Array.from({ length: N }, () => new Array<number>(cols.length).fill(0));
    cols.forEach((c, j) => {
      const h = delta(s[c]!);
      const up = s.slice();
      const down = s.slice();
      up[c] = s[c]! + h;
      down[c] = s[c]! - h;
      const eu = flow(nodes[k]!, nodes[k + 1]!, up);
      const ed = flow(nodes[k]!, nodes[k + 1]!, down);
      for (let i = 0; i < N; i++) G[i]![j] = (eu[i]! - ed[i]!) / (2 * h);
    });
    return G;
  };
  const jac = (z: Vec): number[][] => {
    const J = Array.from({ length: U }, () => new Array<number>(U).fill(0));
    for (let k = 0; k < M; k++) {
      const G = segment(z, k);
      const col0 = k === 0 ? 0 : nf + (k - 1) * N;
      const out = k < M - 1 ? [...Array(N).keys()].map((i) => ({ row: k * N + i, i })) : targets.map((t, j) => ({ row: (M - 1) * N + j, i: t.i }));
      for (const { row, i } of out) G[i]!.forEach((v, j) => (J[row]![col0 + j] = v));
      if (k < M - 1) for (let i = 0; i < N; i++) J[k * N + i]![nf + k * N + i] = -1;
    }
    return J;
  };
  // The guesses: the free values 0, and each node where the solution from there reaches it.
  const z0 = new Float64Array(U);
  try {
    let y = state(z0, 0);
    for (let k = 1; k < M; k++) {
      y = flow(nodes[k - 1]!, nodes[k]!, y);
      if (!y.every(Number.isFinite)) break;
      z0.set(y, nf + (k - 1) * N);
    }
  } catch {
    // The rest of the nodes start at 0.
  }
  // Each quantity's size, from the nodes, and whether every joint and condition is out by no more than a
  // hair of it.
  const sizes = (z: Vec): number[] => Array.from({ length: N }, (_, i) => Math.max(...Array.from({ length: M }, (_, k) => Math.abs(state(z, k)[i]!))));
  const within = (z: Vec, r: Vec, tol: number, end?: Vec): boolean => {
    const size = sizes(z).map((v, i) => Math.max(v, end ? Math.abs(end[i]!) : 0));
    const near = (v: number, i: number, also = 0): boolean => Math.abs(v) <= tol * Math.max(size[i]!, Math.abs(also), 1e-300);
    for (let k = 0; k < M - 1; k++) for (let i = 0; i < N; i++) if (!near(r[k * N + i]!, i)) return false;
    return targets.every((t, j) => near(r[(M - 1) * N + j]!, t.i, t.value));
  };
  let fit: Fit;
  let G: number[][][];
  try {
    fit = newtonSystem(residual, z0, jac, (z, r) => within(z, r, 1e-12), (z, r) => within(z, r, 1e-9));
    G = Array.from({ length: M }, (_, k) => segment(fit.x, k));
  } catch {
    return 'unmet';
  }
  const starts = Array.from({ length: M }, (_, k) => state(fit.x, k));
  let end: Vec;
  try {
    end = flow(nodes[M - 1]!, nodes[M]!, starts[M - 1]!);
  } catch {
    return 'unmet';
  }
  if (!within(fit.x, fit.r, 1e-8, end)) return 'unmet';
  // The far conditions' responses to the free values, by chaining the segments: at each node, and at the far point.
  let phi = G[0]!;
  const S = targets.map((t) => phi[t.i]!.map((v, j) => Math.max(Math.abs(v), free[j] === t.i ? 1 : 0)));
  for (let k = 1; k < M; k++) {
    phi = G[k]!.map((row) => free.map((_, j) => row.reduce((acc, v, c) => acc + v * phi[c]![j]!, 0)));
    targets.forEach((t, r) => phi[t.i]!.forEach((v, j) => (S[r]![j] = Math.max(S[r]![j]!, Math.abs(v)))));
  }
  const J = targets.map((t) => phi[t.i]!.slice());
  return wellPosed(J, S) ? { starts, end } : 'ill-posed';
}
