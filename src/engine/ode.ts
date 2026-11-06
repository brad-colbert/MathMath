/**
 * Mathcad's ordinary differential equation solvers. Each takes the starting values y, the interval x1 to x2,
 * and D(x, y), the vector of derivatives, and gives a matrix: x in the first column, then one column for each
 * of y's values. Measured in Mathcad 14: D always receives y as a vector, even when the start is a single
 * number; x2 may be below x1; and the number of points must be a positive whole number.
 *
 * `rkfixed` is the classic fourth-order Runge–Kutta at fixed steps, with its arithmetic in the same order as
 * Mathcad's, so the answers agree to the last digit. The rest share two solvers: an adaptive Runge–Kutta
 * (Dormand–Prince 5(4)) for `Rkadapt`, `rkadapt`, `Bulstoer`, `bulstoer` and `Adams`, and a stiff solver
 * (Rosenbrock 4(3), Shampine's constants) for `Stiffb`, `Stiffr`, `stiffb`, `stiffr`, `Radau`, `BDF` and
 * `AdamsBDF`. Their answers agree with Mathcad's to each method's accuracy, not digit for digit.
 *
 * Units are MathMath's own (Mathcad 14 refuses them here): x may have one unit and each y its own, and D's
 * values must then be in y's units per x's.
 */
import { type Dim, EvalError, type Fn, type Mat, type Num, type Value, dimDiv, dimEq, dimMul, getEl, isNoDim, newMat, num, requireMat } from './values.js';

type Impl = (...args: Value[]) => Value;
type F = (x: number, y: Float64Array) => Float64Array;
type Vec = Float64Array<ArrayBufferLike>;

// ── Arguments ──────────────────────────────────────────────────────────────────────────────────────

interface Problem {
  n: number;
  y0: Float64Array;
  x1: number;
  x2: number;
  xDim: Dim;
  yDims: Dim[];
  f: F;
}

function realNum(v: Value, what: string): Num {
  if (v.t !== 'num') throw new EvalError('runtime', `${what} must be a number`);
  if (v.im !== 0) throw new EvalError('runtime', `${what} must be real`);
  return v;
}

function startValues(v: Value, fn: string): { y0: Float64Array; dims: Dim[] } {
  if (v.t === 'num') {
    const x = realNum(v, `${fn}'s starting value`);
    return { y0: Float64Array.of(x.re), dims: [x.dim] };
  }
  const m = requireMat(v, `${fn}'s starting values`);
  if (m.rows !== 1 && m.cols !== 1) throw new EvalError('runtime', `${fn}'s starting values must be a vector`);
  const n = m.rows * m.cols;
  const y0 = new Float64Array(n);
  const dims: Dim[] = [];
  for (let k = 0; k < n; k++) {
    const el = realNum(getEl(m, m.rows === 1 ? 0 : k, m.rows === 1 ? k : 0), `${fn}'s starting values`);
    y0[k] = el.re;
    dims.push(el.dim);
  }
  return { y0, dims };
}

function interval(a: Value, b: Value, fn: string): { x1: number; x2: number; dim: Dim } {
  const p = realNum(a, `${fn}'s start x1`);
  const q = realNum(b, `${fn}'s end x2`);
  // As in a range, a 0 goes with any unit.
  const dim = p.re === 0 ? q.dim : q.re === 0 ? p.dim : p.dim;
  if (p.re !== 0 && q.re !== 0 && !dimEq(p.dim, q.dim)) throw new EvalError('runtime', `${fn}'s x1 and x2 must have the same units`);
  if (p.re === q.re) throw new EvalError('runtime', `${fn}'s x1 and x2 must differ`);
  return { x1: p.re, x2: q.re, dim };
}

function count(v: Value, fn: string, what: string): number {
  const n = realNum(v, `${fn}'s ${what}`);
  if (!isNoDim(n.dim) || !Number.isInteger(n.re) || n.re < 1) throw new EvalError('runtime', `${fn}'s ${what} must be a positive whole number`);
  return n.re;
}

function tolerance(v: Value, fn: string, what: string): number {
  const t = realNum(v, `${fn}'s ${what}`);
  if (!isNoDim(t.dim) || !(t.re > 0)) throw new EvalError('runtime', `${fn}'s ${what} must be a plain number above 0`);
  return t.re;
}

const fnOf = (v: Value | undefined, fn: string, what: string): Fn => {
  if (v?.t !== 'fn') throw new EvalError('runtime', `${fn}'s ${what} must be a function, as D(x, y)`);
  return v;
};

/** y as the vector D receives: one unit for all, or a matrix of mixed units. */
function yValue(y: Float64Array, dims: Dim[]): Mat {
  if (dims.every((d) => dimEq(d, dims[0]!))) {
    const m = newMat(y.length, 1, dims[0]!);
    m.re.set(y);
    return m;
  }
  return mixed(y.length, 1, Array.from(y, (x, k) => num(x, dims[k]!)));
}

/**
 * A matrix whose entries keep their own units. fromValues would let a 0 take the matrix's unit, as a 0 may,
 * which loses the unit of a start such as 0·A.
 */
const mixed = (rows: number, cols: number, items: Num[]): Mat =>
  ({ t: 'mat', rows, cols, re: Float64Array.from(items, (v) => v.re), im: null, dim: items[0]!.dim, cells: items });

/** D(x, y)'s n values, checked: real, and in y's units per x's. */
function derivatives(D: Fn, n: number, xDim: Dim, yDims: Dim[], fn: string, what = 'D'): F {
  const want = yDims.map((d) => dimDiv(d, xDim));
  return (x, y) => {
    const out = D.call([num(x, xDim), yValue(y, yDims)]);
    const items: Value[] = out.t === 'mat' ? Array.from({ length: out.rows * out.cols }, (_, k) => getEl(out, out.rows === 1 ? 0 : k, out.rows === 1 ? k : 0)) : [out];
    if (items.length !== n) throw new EvalError('runtime', `${fn}: ${what}(x, y) must give ${n} value${n === 1 ? '' : 's'}, one for each starting value, not ${items.length}`);
    const r = new Float64Array(n);
    items.forEach((it, k) => {
      const v = realNum(it, `${fn}: ${what}(x, y)'s values`);
      if (!dimEq(v.dim, want[k]!) && v.re !== 0) throw new EvalError('runtime', `${fn}: ${what}(x, y)'s value ${k} has the wrong units: it must be in y's units per x's`);
      r[k] = v.re;
    });
    return r;
  };
}

function problem(args: Value[], fn: string): Problem {
  const { y0, dims } = startValues(args[0]!, fn);
  const { x1, x2, dim } = interval(args[1]!, args[2]!, fn);
  const D = fnOf(args[4], fn, 'derivative function');
  // A 0 goes with any unit, so a start such as (0·V; 0·A) may be stored in one unit. A zero start takes its
  // unit from D at the start instead: D's value's unit times x's.
  // Each pass can depend on another zero's unit, so this repeats until nothing changes.
  for (let pass = 0; pass <= y0.length && y0.some((v) => v === 0); pass++) {
    const first = D.call([num(x1, dim), yValue(y0, dims)]);
    const items = first.t === 'mat' ? Array.from({ length: first.rows * first.cols }, (_, k) => getEl(first, first.rows === 1 ? 0 : k, first.rows === 1 ? k : 0)) : [first];
    let changed = false;
    items.forEach((it, k) => {
      if (k >= y0.length || y0[k] !== 0 || it.t !== 'num' || isNoDim(it.dim)) return;
      const d = dimMul(it.dim, dim);
      if (!dimEq(d, dims[k]!)) {
        dims[k] = d;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return { n: y0.length, y0, x1, x2, xDim: dim, yDims: dims, f: derivatives(D, y0.length, dim, dims, fn) };
}

/** The answer: x, then each y, a row per point. */
function table(p: Problem, xs: number[], ys: Vec[]): Mat {
  const rows = xs.length;
  const dims = [p.xDim, ...p.yDims];
  if (dims.every((d) => dimEq(d, dims[0]!))) {
    const m = newMat(rows, p.n + 1, dims[0]!);
    xs.forEach((x, i) => {
      m.re[i] = x;
      for (let k = 0; k < p.n; k++) m.re[i + (k + 1) * rows] = ys[i]![k]!;
    });
    return m;
  }
  const items: Num[] = [];
  for (let j = 0; j <= p.n; j++) for (let i = 0; i < rows; i++) items.push(num(j === 0 ? xs[i]! : ys[i]![j - 1]!, dims[j]!));
  return mixed(rows, p.n + 1, items);
}

// ── Fixed-step Runge–Kutta ─────────────────────────────────────────────────────────────────────────

/** Numerical Recipes' rk4 and rkdumb, as Mathcad's rkfixed: the same operations in the same order. */
function rkfixed(p: Problem, steps: number): Mat {
  const { n, f } = p;
  const h = (p.x2 - p.x1) / steps;
  const hh = h * 0.5;
  const h6 = h / 6;
  let x = p.x1;
  let y: Vec = p.y0.slice();
  const xs = [x];
  const ys: Vec[] = [y];
  const yt = new Float64Array(n);
  for (let s = 0; s < steps; s++) {
    const dydx = f(x, y);
    const xh = x + hh;
    for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * dydx[i]!;
    const dyt = f(xh, yt);
    for (let i = 0; i < n; i++) yt[i] = y[i]! + hh * dyt[i]!;
    const dym = f(xh, yt);
    for (let i = 0; i < n; i++) {
      yt[i] = y[i]! + h * dym[i]!;
      dym[i] = dym[i]! + dyt[i]!;
    }
    const dyt2 = f(x + h, yt);
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) next[i] = y[i]! + h6 * (dydx[i]! + dyt2[i]! + 2 * dym[i]!);
    x += h;
    y = next;
    xs.push(x);
    ys.push(y);
  }
  return table(p, xs, ys);
}

// ── Adaptive steppers ──────────────────────────────────────────────────────────────────────────────

interface Stepper {
  /** One attempted step from (x, y) by h: the new y and the error measured against the tolerance (≤ 1 passes). */
  step(x: number, y: Float64Array, h: number): { y: Float64Array; err: number };
  order: number;
}

const norm = (err: Float64Array, y0: Float64Array, y1: Float64Array, rtol: number, atol: number): number => {
  let s = 0;
  for (let i = 0; i < err.length; i++) {
    const sc = atol + rtol * Math.max(Math.abs(y0[i]!), Math.abs(y1[i]!));
    s += (err[i]! / sc) ** 2;
  }
  return Math.sqrt(s / err.length);
};

/** Dormand–Prince 5(4), the method of SciPy's RK45 and MATLAB's ode45. */
function dopri(f: F, rtol: number, atol: number): Stepper {
  const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const a = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
  const b = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  const e = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
  return {
    order: 5,
    step(x, y, h) {
      const n = y.length;
      const k: Float64Array[] = [];
      const yt = new Float64Array(n);
      for (let s = 0; s < 7; s++) {
        for (let i = 0; i < n; i++) {
          let acc = y[i]!;
          for (let j = 0; j < s; j++) acc += h * a[s]![j]! * k[j]![i]!;
          yt[i] = acc;
        }
        k.push(f(x + c[s]! * h, yt));
      }
      const y1 = new Float64Array(n);
      const err = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let s1 = y[i]!;
        let se = 0;
        for (let s = 0; s < 7; s++) {
          s1 += h * b[s]! * k[s]![i]!;
          se += h * e[s]! * k[s]![i]!;
        }
        y1[i] = s1;
        err[i] = se;
      }
      return { y: y1, err: norm(err, y, y1, rtol, atol) };
    },
  };
}

/** Solves A·x = b in place by Gaussian elimination with partial pivoting; throws if A is singular. */
function solveInPlace(A: Float64Array[], b: Float64Array, what: string): Float64Array {
  const n = b.length;
  const M = A.map((r) => r.slice());
  const x = b.slice();
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (M[p]![c] === 0) throw new EvalError('runtime', `${what} is singular`);
    [M[c], M[p]] = [M[p]!, M[c]!];
    [x[c], x[p]] = [x[p]!, x[c]!];
    for (let r = c + 1; r < n; r++) {
      const m = M[r]![c]! / M[c]![c]!;
      if (m === 0) continue;
      for (let k = c; k < n; k++) M[r]![k]! -= m * M[c]![k]!;
      x[r]! -= m * x[c]!;
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r]!;
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

/** ∂f/∂x and ∂f/∂y at (x, y): from the sheet's Jacobian if given, else by finite differences. */
type Jacobian = (x: number, y: Float64Array, fy: Float64Array) => { dfdx: Float64Array; dfdy: Float64Array[] };

function numericJacobian(f: F): Jacobian {
  return (x, y, fy) => {
    const n = y.length;
    const dfdy = Array.from({ length: n }, () => new Float64Array(n));
    const yp = y.slice();
    for (let j = 0; j < n; j++) {
      const d = Math.sqrt(2.2e-16) * Math.max(Math.abs(y[j]!), 1);
      yp[j] = y[j]! + d;
      const fp = f(x, yp);
      for (let i = 0; i < n; i++) dfdy[i]![j] = (fp[i]! - fy[i]!) / d;
      yp[j] = y[j]!;
    }
    const dx = Math.sqrt(2.2e-16) * Math.max(Math.abs(x), 1);
    const fx = f(x + dx, y);
    return { dfdx: fx.map((v, i) => (v - fy[i]!) / dx), dfdy };
  };
}

/**
 * The sheet's Jacobian J(x, y). With `withX`, as Stiffb and Stiffr take it: n × (n+1), ∂D/∂x in the first
 * column, then ∂Dᵢ/∂yⱼ. Without, as Radau, BDF and AdamsBDF take it (probed): n × n, ∂Dᵢ/∂yⱼ only, and ∂D/∂x
 * by a finite difference.
 */
function sheetJacobian(J: Fn, n: number, xDim: Dim, yDims: Dim[], withX: boolean, f: F, fn: string): Jacobian {
  const cols = withX ? n + 1 : n;
  return (x, y, fy) => {
    const out = J.call([num(x, xDim), yValue(y, yDims)]);
    const m = out.t === 'mat' ? out : null;
    if (!m || m.rows !== n || m.cols !== cols) {
      throw new EvalError('runtime', `${fn}: the Jacobian J(x, y) must be ${n} × ${cols}${withX ? ', with ∂D/∂x in its first column' : ''}`);
    }
    const at = (i: number, j: number): number => realNum(getEl(m, i, j), `${fn}: J(x, y)'s values`).re;
    const dfdy = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => at(i, withX ? j + 1 : j)));
    let dfdx: Float64Array;
    if (withX) dfdx = Float64Array.from({ length: n }, (_, i) => at(i, 0));
    else {
      const dx = Math.sqrt(2.2e-16) * Math.max(Math.abs(x), 1);
      const fx = f(x + dx, y);
      dfdx = fx.map((v, i) => (v - fy[i]!) / dx);
    }
    return { dfdx, dfdy };
  };
}

/** Rosenbrock 4(3) with Shampine's constants (Numerical Recipes' `stiff`), for stiff systems. */
function rosenbrock(f: F, jac: Jacobian, rtol: number, atol: number): Stepper {
  const GAM = 1 / 2, A21 = 2, A31 = 48 / 25, A32 = 6 / 25, C21 = -8, C31 = 372 / 25, C32 = 12 / 5;
  const C41 = -112 / 125, C42 = -54 / 125, C43 = -2 / 5, B1 = 19 / 9, B2 = 1 / 2, B3 = 25 / 108, B4 = 125 / 108;
  const E1 = 17 / 54, E2 = 7 / 36, E3 = 0, E4 = 125 / 108, C1X = 1 / 2, C2X = -3 / 2, C3X = 121 / 50, C4X = 29 / 250;
  const A2X = 1, A3X = 3 / 5;
  return {
    order: 4,
    step(x, y, h) {
      const n = y.length;
      const dydx = f(x, y);
      const { dfdx, dfdy } = jac(x, y, dydx);
      const A = dfdy.map((row, i) => row.map((v, j) => -v + (i === j ? 1 / (GAM * h) : 0)));
      const solve = (b: Float64Array): Float64Array => solveInPlace(A, b, 'the step matrix');
      const g1 = solve(dydx.map((v, i) => v + h * C1X * dfdx[i]!));
      let yt = y.map((v, i) => v + A21 * g1[i]!);
      let dy = f(x + A2X * h, yt);
      const g2 = solve(dy.map((v, i) => v + h * C2X * dfdx[i]! + (C21 * g1[i]!) / h));
      yt = y.map((v, i) => v + A31 * g1[i]! + A32 * g2[i]!);
      dy = f(x + A3X * h, yt);
      const g3 = solve(dy.map((v, i) => v + h * C3X * dfdx[i]! + (C31 * g1[i]! + C32 * g2[i]!) / h));
      const g4 = solve(dy.map((v, i) => v + h * C4X * dfdx[i]! + (C41 * g1[i]! + C42 * g2[i]! + C43 * g3[i]!) / h));
      const y1 = new Float64Array(n);
      const err = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        y1[i] = y[i]! + B1 * g1[i]! + B2 * g2[i]! + B3 * g3[i]! + B4 * g4[i]!;
        err[i] = E1 * g1[i]! + E2 * g2[i]! + E3 * g3[i]! + E4 * g4[i]!;
      }
      return { y: y1, err: norm(err, y, y1, rtol, atol) };
    },
  };
}

const MAX_STEPS = 1_000_000;

/**
 * Integrates from x to the target with step control, calling `visit` after each accepted step. `h` is the
 * size to try first and comes back as the size to try next, so a run through several outputs keeps it.
 */
function integrate(st: Stepper, x: number, y: Float64Array, target: number, h: { v: number }, fn: string, visit?: (x: number, y: Float64Array) => void): Float64Array {
  const dir = Math.sign(target - x);
  let steps = 0;
  while ((target - x) * dir > 0) {
    let hv = Math.min(Math.abs(h.v), Math.abs(target - x)) * dir;
    // A step that would stop a rounding error short of the target goes all the way: the sliver left over
    // would be too small to take.
    const last = Math.abs(hv) >= Math.abs(target - x) * (1 - 1e-12) || Math.abs(target - x) - Math.abs(hv) < 1e-12 * Math.max(Math.abs(x), 1);
    if (last) hv = target - x;
    if (Math.abs(hv) < 1e-14 * Math.max(Math.abs(x), 1)) throw new EvalError('runtime', `${fn}: the step size became too small at x = ${x.toPrecision(6)}. The equations may be stiff: try Radau or Stiffr`);
    if (++steps > MAX_STEPS) throw new EvalError('runtime', `${fn} took over ${MAX_STEPS} steps without reaching x2. The equations may be stiff: try Radau or Stiffr`);
    const { y: y1, err } = st.step(x, y, hv);
    if (!Number.isFinite(err) || err > 1) {
      // Rejected: try again smaller.
      const factor = Number.isFinite(err) ? Math.max(0.2, 0.9 * err ** (-1 / st.order)) : 0.2;
      h.v = Math.abs(hv) * factor;
      continue;
    }
    x = last ? target : x + hv;
    y = y1;
    visit?.(x, y);
    const grow = err === 0 ? 5 : Math.min(5, 0.9 * err ** (-1 / st.order));
    // A step cut short to land on the target says nothing about the next step's size.
    if (!last || Math.abs(hv) >= Math.abs(h.v)) h.v = Math.abs(hv) * grow;
  }
  return y;
}

/** A first step size, from the scale of y and its derivative (Hairer's estimate). */
function firstStep(f: F, x: number, y: Float64Array, span: number, rtol: number, atol: number): number {
  const d0 = Math.sqrt(y.reduce((s, v) => s + (v / (atol + rtol * Math.abs(v))) ** 2, 0) / y.length);
  const f0 = f(x, y);
  const d1 = Math.sqrt(f0.reduce((s, v, i) => s + (v / (atol + rtol * Math.abs(y[i]!))) ** 2, 0) / y.length);
  const h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * (d0 / d1);
  return Math.min(Math.abs(span), h0) || Math.abs(span) / 100;
}

/** Answers at npoints + 1 evenly spaced x, as Rkadapt, Radau and the rest give them. */
function evenly(p: Problem, points: number, st: Stepper, rtol: number, atol: number, fn: string): Mat {
  const step = (p.x2 - p.x1) / points;
  const xs = [p.x1];
  const ys: Vec[] = [p.y0.slice()];
  const h = { v: firstStep(p.f, p.x1, p.y0, p.x2 - p.x1, rtol, atol) };
  let y: Vec = p.y0.slice();
  let x = p.x1;
  for (let k = 1; k <= points; k++) {
    const target = k === points ? p.x2 : p.x1 + k * step;
    y = integrate(st, x, y, target, h, fn);
    x = target;
    xs.push(x);
    ys.push(y);
  }
  return table(p, xs, ys);
}

/**
 * The solver's own points, as rkadapt, bulstoer, stiffb and stiffr give them (Numerical Recipes' `odeint`):
 * the start, then a point whenever x has moved more than `save` since the last one kept, up to `kmax` points,
 * and always the end.
 */
function ownPoints(p: Problem, kmax: number, save: number, st: Stepper, tol: number, fn: string): Mat {
  const xs = [p.x1];
  const ys: Vec[] = [p.y0.slice()];
  const h = { v: firstStep(p.f, p.x1, p.y0, p.x2 - p.x1, tol, tol) };
  const yEnd = integrate(st, p.x1, p.y0.slice(), p.x2, h, fn, (x, y) => {
    // The end is added after, as the last step lands on it exactly.
    if (x === p.x2) return;
    if (xs.length < kmax - 1 && Math.abs(x - xs.at(-1)!) > Math.abs(save)) {
      xs.push(x);
      ys.push(y.slice());
    }
  });
  xs.push(p.x2);
  ys.push(yEnd);
  return table(p, xs, ys);
}

// ── The sheet's functions ─────────────────────────────────────────────────────────────────────────

/** The tolerance the fixed-output solvers use when none is given: tighter than Mathcad's, which the probe put near 10⁻⁶. */
const DEFAULT_TOL = 1e-9;

/** Radau, BDF and AdamsBDF's optional arguments, told apart by kind: a function is J, a matrix M, a number tol. */
function optionals(args: Value[], fn: string, allowMass: boolean): { J: Fn | undefined; M: Mat | undefined; tol: number } {
  let J: Fn | undefined;
  let M: Mat | undefined;
  let tol = DEFAULT_TOL;
  for (const a of args) {
    if (a.t === 'fn' && !J && !M) J = a;
    else if (a.t === 'mat' && allowMass && !M) M = a;
    else if (a.t === 'num') tol = tolerance(a, fn, 'tolerance');
    else throw new EvalError('runtime', `${fn}'s optional arguments are ${allowMass ? 'a Jacobian J(x, y), a mass matrix M and a tolerance' : 'a Jacobian J(x, y) and a tolerance'}, in that order`);
  }
  return { J, M, tol };
}

/** y′ = M⁻¹·D for a constant, invertible mass matrix M. */
function withMass(f: F, M: Mat, n: number, fn: string): F {
  if (M.rows !== n || M.cols !== n) throw new EvalError('runtime', `${fn}'s mass matrix must be ${n} × ${n}`);
  const A = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => realNum(getEl(M, i, j), `${fn}'s mass matrix`).re));
  solveInPlace(A, new Float64Array(n), `${fn}'s mass matrix (a singular one makes a differential-algebraic system, which isn't supported)`);
  return (x, y) => solveInPlace(A, f(x, y), `${fn}'s mass matrix`);
}

const nonstiffEvenly = (fn: string, withTol: boolean): Impl => (...args) => {
  const p = problem(args, fn);
  const points = count(args[3]!, fn, 'number of points');
  const tol = withTol && args[5] ? tolerance(args[5], fn, 'tolerance') : DEFAULT_TOL;
  return evenly(p, points, dopri(p.f, tol, tol), tol, tol, fn);
};

const nonstiffOwn = (fn: string): Impl => (...args) => {
  const p = problem(args, fn);
  const acc = tolerance(args[3]!, fn, 'accuracy');
  const kmax = count(args[5]!, fn, 'most points kmax');
  const save = realNum(args[6]!, `${fn}'s spacing save`).re;
  return ownPoints(p, kmax, save, dopri(p.f, acc, acc), acc, fn);
};

const stiffEvenly = (fn: string): Impl => (...args) => {
  const p = problem(args, fn);
  const points = count(args[3]!, fn, 'number of points');
  const J = fnOf(args[5], fn, 'Jacobian');
  const jac = sheetJacobian(J, p.n, p.xDim, p.yDims, true, p.f, fn);
  return evenly(p, points, rosenbrock(p.f, jac, DEFAULT_TOL, DEFAULT_TOL), DEFAULT_TOL, DEFAULT_TOL, fn);
};

const stiffOwn = (fn: string): Impl => (...args) => {
  const p = problem(args, fn);
  const acc = tolerance(args[3]!, fn, 'accuracy');
  const J = fnOf(args[5], fn, 'Jacobian');
  const kmax = count(args[6]!, fn, 'most points kmax');
  const save = realNum(args[7]!, `${fn}'s spacing save`).re;
  const jac = sheetJacobian(J, p.n, p.xDim, p.yDims, true, p.f, fn);
  return ownPoints(p, kmax, save, rosenbrock(p.f, jac, acc, acc), acc, fn);
};

const implicit = (fn: string, allowMass: boolean): Impl => (...args) => {
  const p = problem(args, fn);
  const points = count(args[3]!, fn, 'number of points');
  const { J, M, tol } = optionals(args.slice(5), fn, allowMass);
  const f = M ? withMass(p.f, M, p.n, fn) : p.f;
  const jac = J && !M ? sheetJacobian(J, p.n, p.xDim, p.yDims, false, f, fn) : numericJacobian(f);
  return evenly({ ...p, f }, points, rosenbrock(f, jac, tol, tol), tol, tol, fn);
};

export const odeFns: Record<string, Impl> = {
  rkfixed: (...args) => rkfixed(problem(args, 'rkfixed'), count(args[3]!, 'rkfixed', 'number of points')),
  Rkadapt: nonstiffEvenly('Rkadapt', false),
  Bulstoer: nonstiffEvenly('Bulstoer', false),
  Adams: nonstiffEvenly('Adams', true),
  rkadapt: nonstiffOwn('rkadapt'),
  bulstoer: nonstiffOwn('bulstoer'),
  Stiffb: stiffEvenly('Stiffb'),
  Stiffr: stiffEvenly('Stiffr'),
  stiffb: stiffOwn('stiffb'),
  stiffr: stiffOwn('stiffr'),
  Radau: implicit('Radau', true),
  BDF: implicit('BDF', false),
  AdamsBDF: implicit('AdamsBDF', false),
};

export const ODE_ARITY: Record<string, [number, number]> = {
  rkfixed: [5, 5], Rkadapt: [5, 5], Bulstoer: [5, 5], Adams: [5, 6], rkadapt: [7, 7], bulstoer: [7, 7],
  Stiffb: [6, 6], Stiffr: [6, 6], stiffb: [8, 8], stiffr: [8, 8], Radau: [5, 8], BDF: [5, 7], AdamsBDF: [5, 7],
};


/**
 * y at evenly spaced points from x1 to x2, with the derivative there: for Odesolve, which interpolates
 * between them. The adaptive Runge–Kutta first; if the system proves stiff, the stiff solver.
 */
export function odeGrid(f: F, x1: number, x2: number, y0: Float64Array, points: number, fn: string): { xs: number[]; ys: Vec[]; dys: Vec[] } {
  const run = (st: Stepper): { xs: number[]; ys: Vec[]; dys: Vec[] } => {
    const step = (x2 - x1) / points;
    const xs = [x1];
    const ys: Vec[] = [y0.slice()];
    const h = { v: firstStep(f, x1, y0, x2 - x1, DEFAULT_TOL, DEFAULT_TOL) };
    let y: Vec = y0.slice();
    let x = x1;
    for (let k = 1; k <= points; k++) {
      const target = k === points ? x2 : x1 + k * step;
      y = integrate(st, x, y, target, h, fn);
      x = target;
      xs.push(x);
      ys.push(y);
    }
    return { xs, ys, dys: xs.map((xi, i) => f(xi, ys[i]!)) };
  };
  try {
    return run(dopri(f, DEFAULT_TOL, DEFAULT_TOL));
  } catch (err) {
    if (!(err instanceof EvalError) || !/stiff/.test(err.message)) throw err;
    return run(rosenbrock(f, numericJacobian(f), DEFAULT_TOL, DEFAULT_TOL));
  }
}
