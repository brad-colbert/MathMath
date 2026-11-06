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
 * x0. Stops when a step no longer improves them, or the residuals vanish.
 */
export function leastSquares(res: (x: Vec) => Vec, x0: Vec, maxIter = 500): Fit {
  let x = x0.slice();
  let r = res(x);
  let cost = sumSq(r);
  let lambda = 1e-3;
  const n = x.length;
  for (let iter = 0; iter < maxIter && cost > 0; iter++) {
    const J = jacobian(res, x, r.length);
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
