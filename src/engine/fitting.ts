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
 * Curve fitting, as Mathcad 14's: straight lines (slope, intercept, line, stderr, medfit), linear combinations
 * (linfit, regress and the interp of a regress vector), and the nonlinear fits (genfit, expfit, lgsfit, logfit,
 * lnfit, pwrfit, sinfit). Probed in Mathcad 14, and checked against the answers stored in Mathcad's own example sheets:
 *
 * - Every fit is ordinary least squares in y, converged fully: Mathcad's answers don't move with TOL.
 * - Straight lines work from sums about the means, which keep their digits when x is far from 0. (Mathcad's own
 *   line loses some there; its intercept doesn't.)
 * - medfit splits the points by x's range into thirds, ends inclusive: x ≤ min + (max − min)/3, and so on, which
 *   puts tied x in one group. The line runs through the median points of the outer thirds; the intercept is the
 *   mean of the medians' intercepts, of the outer two when the middle third is empty.
 * - regress returns 3, 3, the degree, then the coefficients. For one variable they run from the constant up;
 *   for several, in Mathcad's order (`termOrder`).
 * - genfit's F(x, u) returns f and then its partial derivatives in u, as Mathcad 14 requires. MathMath also takes
 *   an F that returns f alone and works out the derivatives itself, where Mathcad 14 says it doesn't converge.
 */
import { leastSquares } from './solve.js';
import { type Dim, EvalError, type Fn, type Mat, NODIM, type Value, dimDiv, isNoDim, newMat, num, requireMat } from './values.js';

type Impl = (...args: Value[]) => Value;

/** How many arguments each fitting function takes, at least and at most. */
export const FIT_ARITY: Record<string, [number, number]> = {
  slope: [2, 2], intercept: [2, 2], line: [2, 2], stderr: [2, 2], medfit: [2, 2], linfit: [3, 3], regress: [3, 3],
  genfit: [4, 4], expfit: [2, 3], lgsfit: [3, 3], logfit: [3, 3], lnfit: [2, 2], pwrfit: [3, 3], sinfit: [3, 3],
};

const column = (values: ArrayLike<number>, dim: Dim = NODIM): Mat => {
  const m = newMat(values.length, 1, dim);
  m.re.set(values);
  return m;
};

/** A real column vector's numbers and units. */
function vector(v: Value | undefined, fn: string, what: string): { re: Float64Array; dim: Dim } {
  const m = requireMat(v!, `${fn}'s ${what}`);
  if (m.cells || m.im) throw new EvalError('runtime', `${fn}'s ${what} must hold real numbers`);
  if (m.cols !== 1) throw new EvalError('runtime', `${fn}'s ${what} must be a column vector`);
  return { re: m.re, dim: m.dim };
}

interface Data { x: Float64Array; y: Float64Array; xDim: Dim; yDim: Dim }

/** The data: x and y vectors of the same length; without units unless the function keeps them. */
function data(vx: Value | undefined, vy: Value | undefined, fn: string, units = false): Data {
  const x = vector(vx, fn, 'x values');
  const y = vector(vy, fn, 'y values');
  if (x.re.length !== y.re.length) throw new EvalError('runtime', `${fn}'s x and y vectors must be the same length: ${x.re.length} and ${y.re.length} values`);
  if (!units && !(isNoDim(x.dim) && isNoDim(y.dim))) throw new EvalError('runtime', `${fn} takes numbers without units`);
  return { x: x.re, y: y.re, xDim: x.dim, yDim: y.dim };
}

const mean = (v: Float64Array): number => v.reduce((s, x) => s + x, 0) / v.length;

/** The least-squares straight line, from sums about the means. */
function straight(d: Data, fn: string): { a: number; b: number } {
  if (d.x.length < 2) throw new EvalError('runtime', `${fn} needs at least 2 points`);
  const [mx, my] = [mean(d.x), mean(d.y)];
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < d.x.length; k++) {
    sxx += (d.x[k]! - mx) ** 2;
    sxy += (d.x[k]! - mx) * (d.y[k]! - my);
  }
  if (sxx === 0) throw new EvalError('runtime', `${fn}: the x values are all the same, so no line fits`);
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * Least squares for A·c ≈ b by Householder QR, which keeps the digits normal equations lose. A is n × p, by
 * columns. Each column is scaled to length 1 first, so a constant column beside one of x⁴ at x ≈ 2000 still
 * counts; throws when a column adds nothing the others don't already give.
 */
function qrSolve(cols: Float64Array[], b: Float64Array, fn: string): Float64Array {
  const p = cols.length;
  const n = b.length;
  if (n < p) throw new EvalError('runtime', `${fn} needs at least ${p} points for ${p} coefficients`);
  const dependent = (): EvalError => new EvalError('runtime', `${fn}: the functions don't fit these points independently, so the coefficients aren't determined`);
  const norms = new Float64Array(p);
  const A = cols.map((c, j) => {
    let s = 0;
    for (const v of c) s += v * v;
    norms[j] = Math.sqrt(s);
    if (!(norms[j]! > 0) || !Number.isFinite(norms[j]!)) throw dependent();
    return Float64Array.from(c, (v) => v / norms[j]!);
  });
  const y = Float64Array.from(b);
  const R = new Float64Array(p);
  for (let j = 0; j < p; j++) {
    const a = A[j]!;
    let norm = 0;
    for (let i = j; i < n; i++) norm += a[i]! * a[i]!;
    norm = Math.sqrt(norm);
    // What's left of a unit column after the ones before it: next to nothing means it depends on them.
    if (norm <= 1e-12) throw dependent();
    const alpha = a[j]! > 0 ? -norm : norm;
    const v = new Float64Array(n);
    v[j] = a[j]! - alpha;
    for (let i = j + 1; i < n; i++) v[i] = a[i]!;
    let vv = 0;
    for (let i = j; i < n; i++) vv += v[i]! * v[i]!;
    const reflect = (c: Float64Array): void => {
      let s = 0;
      for (let i = j; i < n; i++) s += v[i]! * c[i]!;
      const f = (2 * s) / vv;
      for (let i = j; i < n; i++) c[i]! -= f * v[i]!;
    };
    for (let k = j; k < p; k++) reflect(A[k]!);
    reflect(y);
    R[j] = A[j]![j]!;
  }
  const c = new Float64Array(p);
  for (let j = p - 1; j >= 0; j--) {
    let s = y[j]!;
    for (let k = j + 1; k < p; k++) s -= A[k]![j]! * c[k]!;
    c[j] = s / R[j]!;
  }
  return c.map((v, j) => v / norms[j]!);
}

/** The median of some numbers. */
function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The median-median line: [intercept, slope]. */
function medfit(d: Data): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of d.x) [lo, hi] = [Math.min(lo, x), Math.max(hi, x)];
  // The thirds' ends, with a little room: 0.6/3 comes out just under 0.2, and Mathcad counts a point at 0.2 in.
  const room = 1e-12 * (hi - lo) + 4e-16 * Math.max(Math.abs(lo), Math.abs(hi));
  const [left, right] = [lo + (hi - lo) / 3 + room, hi - (hi - lo) / 3 - room];
  const groups: [number[], number[]][] = [[[], []], [[], []], [[], []]];
  d.x.forEach((x, k) => {
    const g = groups[x <= left ? 0 : x >= right ? 2 : 1]!;
    g[0].push(x);
    g[1].push(d.y[k]!);
  });
  if (groups[0]![0].length === 0 || groups[2]![0].length === 0 || hi === lo) throw new EvalError('runtime', 'medfit needs points spread across the x range: none fall in its first or last third');
  // With two points, or a gap in the middle, the middle third can be empty: then the intercept comes from the ends.
  const medians = groups.filter((g) => g[0].length > 0).map(([xs, ys]) => [median(xs), median(ys)] as const);
  const [[xl, yl], [xr, yr]] = [medians[0]!, medians[medians.length - 1]!];
  const b = (yr - yl) / (xr - xl);
  return [medians.reduce((s, [x, y]) => s + y - b * x, 0) / medians.length, b];
}

/**
 * The terms of a polynomial in m variables of degree k, as exponents, in the order Mathcad's regress gives its
 * coefficients: for two variables of degree 2, xy, y², y, 1, x, x². Built recursively: the terms of degree k − 1
 * with the last variable's power raised by one, then those without the last variable.
 */
export function termOrder(m: number, k: number): number[][] {
  const terms = (nvar: number, deg: number): number => {
    let t = 1;
    for (let i = 1; i <= nvar; i++) t = (t * (deg + i)) / i;
    return Math.round(t);
  };
  const step = (v: number[][], nvar: number, deg: number): number[][] => {
    if (nvar === 1) {
      for (let i = 0; i <= deg; i++) v[i]![0]! += i;
      return v;
    }
    if (deg === 1) {
      for (let i = 0; i < nvar; i++) v[i]![i]! += 1;
      return v;
    }
    const inc = terms(nvar, deg - 1);
    for (let i = 0; i < inc; i++) v[i]![nvar - 1]! += 1;
    return [...step(v.slice(0, inc), nvar, deg - 1), ...step(v.slice(inc), nvar - 1, deg)];
  };
  return step(Array.from({ length: terms(m, k) }, () => new Array<number>(m).fill(0)), m, k);
}

const power = (x: number, e: number): number => (e === 0 ? 1 : x ** e);

/** A plain degree: a whole number from 1 up. */
function degree(v: Value | undefined, fn: string): number {
  const k = v?.t === 'num' && v.im === 0 && isNoDim(v.dim) ? v.re : NaN;
  if (!Number.isInteger(k) || k < 1) throw new EvalError('runtime', `${fn}'s degree must be a whole number, 1 or more`);
  return k;
}

/** regress(vx, vy, k), or regress(Mx, vy, k) with a column of Mx for each variable. */
function regress(vx: Value | undefined, vy: Value | undefined, vk: Value | undefined): Mat {
  const k = degree(vk, 'regress');
  const X = requireMat(vx!, "regress's x values");
  const y = vector(vy, 'regress', 'y values');
  if (X.cells || X.im) throw new EvalError('runtime', "regress's x values must hold real numbers");
  if (!isNoDim(X.dim) || !isNoDim(y.dim)) throw new EvalError('runtime', 'regress takes numbers without units');
  if (X.rows !== y.re.length) throw new EvalError('runtime', `regress's x values and y vector must have the same number of rows: ${X.rows} and ${y.re.length}`);
  const order = termOrder(X.cols, k);
  const cols = order.map((e) => Float64Array.from({ length: X.rows }, (_, i) => e.reduce((p, ej, j) => p * power(X.re[i + j * X.rows]!, ej), 1)));
  return column([3, 3, k, ...qrSolve(cols, y.re, 'regress')]);
}

/** interp of a regress vector: the polynomial at x, or at the point x for several variables. */
export function interpRegress(s: Mat, vx: Value, x: Value): Value {
  const X = requireMat(vx, 'the x values');
  const k = s.re[2]!;
  const order = termOrder(X.cols, k);
  if (s.rows !== 3 + order.length) throw new EvalError('runtime', "interp: this regress vector doesn't match these x values");
  const c = s.re.subarray(3);
  const at = (p: ArrayLike<number>): number => order.reduce((sum, e, t) => sum + c[t]! * e.reduce((q, ej, j) => q * power(p[j]!, ej), 1), 0);
  if (X.cols > 1) {
    const p = requireMat(x, 'the point');
    if (p.rows * p.cols !== X.cols) throw new EvalError('runtime', `interp needs a point with ${X.cols} coordinates`);
    return num(at(p.re));
  }
  const one = (v: Value): Value => {
    if (v.t === 'mat') {
      const m = newMat(v.rows, v.cols);
      v.re.forEach((xv, i) => (m.re[i] = at([xv])));
      return m;
    }
    if (v.t !== 'num' || v.im !== 0) throw new EvalError('runtime', 'interp takes a real x');
    return num(at([v.re]));
  };
  return one(x);
}

/** A guess vector of n real numbers. */
function guess(v: Value | undefined, n: number, fn: string): Float64Array {
  const g = vector(v, fn, 'guess');
  if (g.re.length !== n) throw new EvalError('runtime', `${fn}'s guess must have ${n} values, one for each parameter`);
  return Float64Array.from(g.re);
}

const NO_CONVERGE = (fn: string): EvalError =>
  new EvalError('runtime', `${fn} doesn't converge from this guess: try another, closer to the answer`);

/** Least squares for a model f(x, p), from a guess; df gives ∂f/∂p when known. */
function nonlinear(d: Data, f: (x: number, p: Float64Array) => number, p0: Float64Array, fn: string, df?: (x: number, p: Float64Array) => ArrayLike<number>): Float64Array {
  const res = (p: Float64Array): Float64Array => Float64Array.from(d.x, (x, i) => f(x, p) - d.y[i]!);
  const start = res(p0);
  if (!start.every(Number.isFinite)) throw NO_CONVERGE(fn);
  const jac = df ? (p: Float64Array): number[][] => Array.from(d.x, (x) => Array.from(df(x, p))) : undefined;
  const { x, r } = leastSquares(res, p0, 1000, jac);
  if (!x.every(Number.isFinite) || !r.every(Number.isFinite)) throw NO_CONVERGE(fn);
  if (!stationary(res, x, r, d.y, jac)) throw NO_CONVERGE(fn);
  return x;
}

/**
 * Whether the fit stopped at a least-squares minimum: there, the residuals are at right angles to how the model
 * moves with each parameter. A search that stalled short of one is an error, as in Mathcad, not an answer.
 */
function stationary(res: (p: Float64Array) => Float64Array, x: Float64Array, r: Float64Array, y: Float64Array, jac?: (p: Float64Array) => number[][]): boolean {
  const norm = (v: ArrayLike<number>): number => {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
    return Math.sqrt(s);
  };
  const rn = norm(r);
  if (rn <= 1e-10 * Math.max(norm(y), 1e-300)) return true;
  for (let j = 0; j < x.length; j++) {
    let col: Float64Array;
    if (jac) col = Float64Array.from(jac(x), (row) => row[j]!);
    else {
      const h = 1e-6 * Math.max(Math.abs(x[j]!), 1e-3);
      const [up, down] = [x.slice(), x.slice()];
      up[j]! += h;
      down[j]! -= h;
      const [ru, rd] = [res(up), res(down)];
      col = Float64Array.from(ru, (v, i) => (v - rd[i]!) / (2 * h));
    }
    const cn = norm(col);
    if (cn === 0) continue;
    const dot = col.reduce((s, v, i) => s + v * r[i]!, 0);
    if (!(Math.abs(dot) <= 1e-5 * cn * rn)) return false;
  }
  return true;
}

const MODELS: Record<string, { n: number; f: (x: number, p: Float64Array) => number }> = {
  expfit: { n: 3, f: (x, p) => p[0]! * Math.exp(p[1]! * x) + p[2]! },
  lgsfit: { n: 3, f: (x, p) => p[0]! / (1 + p[1]! * Math.exp(-p[2]! * x)) },
  logfit: { n: 3, f: (x, p) => p[0]! * Math.log(x + p[1]!) + p[2]! },
  pwrfit: { n: 3, f: (x, p) => p[0]! * x ** p[1]! + p[2]! },
  sinfit: { n: 3, f: (x, p) => p[0]! * Math.sin(x + p[1]!) + p[2]! },
};

const sse = (d: Data, f: (x: number, p: Float64Array) => number, p: Float64Array): number => d.x.reduce((s, x, i) => s + (f(x, p) - d.y[i]!) ** 2, 0);

/** expfit without a guess: starts from straight lines through ln|y − c|, with c just below and just above the data, and keeps the better fit. */
function expfitNoGuess(d: Data): Float64Array {
  const { f } = MODELS.expfit!;
  let lo = Infinity;
  let hi = -Infinity;
  for (const y of d.y) [lo, hi] = [Math.min(lo, y), Math.max(hi, y)];
  const span = hi - lo || Math.abs(hi) || 1;
  let best: Float64Array | null = null;
  for (const c of [lo - 0.1 * span, hi + 0.1 * span, 0]) {
    const z = Float64Array.from(d.y, (y) => Math.log(Math.abs(y - c)));
    if (!z.every(Number.isFinite)) continue;
    let line: { a: number; b: number };
    try {
      line = straight({ x: d.x, y: z, xDim: NODIM, yDim: NODIM }, 'expfit');
    } catch {
      continue;
    }
    const sign = c < lo ? 1 : c > hi ? -1 : Math.sign(d.y[0]!) || 1;
    try {
      const p = nonlinear(d, f, Float64Array.of(sign * Math.exp(line.a), line.b, c), 'expfit');
      if (!best || sse(d, f, p) < sse(d, f, best)) best = p;
    } catch {
      // Another start may still work.
    }
  }
  if (!best) throw new EvalError('runtime', "expfit can't find a start for these points: give it a guess, a, b and c for a·e^(b·x) + c");
  return best;
}

/** genfit's F(x, u): f and its partial derivatives in u, as Mathcad 14 takes it, or f alone. */
function genfit(d: Data, vg: Value | undefined, vF: Value | undefined): Float64Array {
  const g = vector(vg, 'genfit', 'guess');
  const n = g.re.length;
  if (vF?.t !== 'fn') throw new EvalError('runtime', "genfit's last argument must be a function F(x, u) of x and the parameter vector u");
  const F = vF as Fn;
  const call = (x: number, p: Float64Array): number[] => {
    const out = F.call([num(x), column(p)]);
    if (out.t === 'num') return [out.re];
    if (out.t === 'mat' && !out.cells && out.cols === 1) return Array.from(out.re);
    throw new EvalError('runtime', `genfit: F(x, u) must give f, or a vector of f and its ${n} partial derivatives in u`);
  };
  const first = call(d.x[0]!, Float64Array.from(g.re));
  if (first.length !== 1 && first.length !== n + 1) throw new EvalError('runtime', `genfit: F(x, u) gives ${first.length} values: it must give f, or f and its ${n} partial derivatives in u, ${n + 1} in all`);
  const f = (x: number, p: Float64Array): number => call(x, p)[0]!;
  const df = first.length > 1 ? (x: number, p: Float64Array): number[] => call(x, p).slice(1) : undefined;
  return nonlinear(d, f, Float64Array.from(g.re), 'genfit', df);
}

export const fitFns: Record<string, Impl> = {
  slope: (vx, vy) => {
    const d = data(vx, vy, 'slope', true);
    return num(straight(d, 'slope').b, dimDiv(d.yDim, d.xDim));
  },
  intercept: (vx, vy) => {
    const d = data(vx, vy, 'intercept', true);
    return num(straight(d, 'intercept').a, d.yDim);
  },
  line: (vx, vy) => {
    const { a, b } = straight(data(vx, vy, 'line'), 'line');
    return column([a, b]);
  },
  stderr: (vx, vy) => {
    const d = data(vx, vy, 'stderr', true);
    if (d.x.length < 3) throw new EvalError('runtime', 'stderr needs at least 3 points: a line through 2 fits them exactly');
    const { b } = straight(d, 'stderr');
    // Residuals about the means, which keep their digits when x is far from 0.
    const [mx, my] = [mean(d.x), mean(d.y)];
    const s = d.x.reduce((t, x, i) => t + (d.y[i]! - my - b * (x - mx)) ** 2, 0);
    return num(Math.sqrt(s / (d.x.length - 2)), d.yDim);
  },
  medfit: (vx, vy) => column(medfit(data(vx, vy, 'medfit'))),
  linfit: (vx, vy, vF) => {
    const d = data(vx, vy, 'linfit');
    if (vF?.t !== 'fn') throw new EvalError('runtime', "linfit's last argument must be a function F(x) giving a vector of the functions to combine");
    const rows = Array.from(d.x, (x) => {
      const out = (vF as Fn).call([num(x)]);
      if (out.t === 'num') return [out.re];
      if (out.t !== 'mat' || out.cells || out.im || out.cols !== 1) throw new EvalError('runtime', 'linfit: F(x) must give a column vector of numbers');
      return Array.from(out.re);
    });
    const p = rows[0]!.length;
    if (rows.some((r) => r.length !== p)) throw new EvalError('runtime', 'linfit: F(x) must give the same number of values at every x');
    return column(qrSolve(Array.from({ length: p }, (_, j) => Float64Array.from(rows, (r) => r[j]!)), d.y, 'linfit'));
  },
  regress,
  lnfit: (vx, vy) => {
    const d = data(vx, vy, 'lnfit');
    if (d.x.some((x) => !(x > 0))) throw new EvalError('runtime', 'lnfit needs x values above 0, for ln(x)');
    const { a, b } = straight({ ...d, x: d.x.map(Math.log) }, 'lnfit');
    return column([b, a]);
  },
  genfit: (vx, vy, vg, F) => column(genfit(data(vx, vy, 'genfit'), vg, F)),
  ...Object.fromEntries(Object.entries(MODELS).map(([fn, { n, f }]) => [fn, (vx: Value, vy: Value, vg?: Value) => {
    const d = data(vx, vy, fn);
    if (fn === 'expfit' && vg === undefined) return column(expfitNoGuess(d));
    return column(nonlinear(d, f, guess(vg, n, fn), fn));
  }])),
};

