/**
 * Mathcad's linear algebra functions beyond the basic operators, measured against Mathcad 14
 * (tools/matprobe.py; see DESIGN.md §8). lsolve, rank, rref, diag, the norms and condition numbers, svds,
 * geninv, cholesky and lu match it. Eigenvectors, svd and qr are unique only up to sign, and Mathcad's
 * signs come from routines not reproduced here, so they can differ from it in sign.
 */
import { eigenvalues } from './eigen.js';
import { type Dim, EvalError, type Mat, NODIM, type Num, dimDiv, dimPow, isNoDim, newMat } from './values.js';

type Rows = number[][];

export function rowsOf(m: Mat, what = 'the matrix'): Rows {
  if (m.cells || m.im) throw new EvalError('runtime', `${what} must hold real numbers`);
  return Array.from({ length: m.rows }, (_, i) => Array.from({ length: m.cols }, (_, j) => m.re[i + j * m.rows]!));
}

export function matOf(a: Rows, dim: Dim = NODIM): Mat {
  const rows = a.length;
  const cols = rows ? a[0]!.length : 0;
  const m = newMat(rows, cols, dim);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) m.re[i + j * rows] = a[i]![j]!;
  return m;
}

const unitless = (m: Mat, fn: string): void => {
  if (!isNoDim(m.dim)) throw new EvalError('runtime', `${fn} needs a matrix without units`);
};
const square = (a: Rows, fn: string): void => {
  if (a.length !== a[0]?.length) throw new EvalError('runtime', `${fn} needs a square matrix`);
};
const zeros = (r: number, c: number): Rows => Array.from({ length: r }, () => new Array<number>(c).fill(0));
const eye = (n: number): Rows => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const transposeRows = (a: Rows): Rows => a[0]!.map((_, j) => a.map((r) => r[j]!));
const times = (a: Rows, b: Rows): Rows => a.map((r) => b[0]!.map((_, j) => r.reduce((s, x, k) => s + x * b[k]![j]!, 0)));
const largest = (a: Rows): number => Math.max(...a.flat().map(Math.abs), 0);

/**
 * LU with implicit (scaled) partial pivoting, as in Numerical Recipes' ludcmp: each row is weighed by its
 * largest element. This is the pivoting Mathcad's lu shows. Returns P, L and U with P·M = L·U.
 */
export function luDecompose(m: Mat): { P: Rows; L: Rows; U: Rows } {
  const a = rowsOf(m);
  square(a, 'lu');
  const n = a.length;
  const scale = a.map((r) => {
    const big = Math.max(...r.map(Math.abs));
    if (big === 0) throw new EvalError('runtime', 'lu: the matrix is singular');
    return 1 / big;
  });
  const order = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = -1;
    for (let i = k; i < n; i++) {
      const v = scale[i]! * Math.abs(a[i]![k]!);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (p !== k) {
      [a[p], a[k]] = [a[k]!, a[p]!];
      [scale[p], scale[k]] = [scale[k]!, scale[p]!];
      [order[p], order[k]] = [order[k]!, order[p]!];
    }
    const pivot = a[k]![k]!;
    for (let i = k + 1; i < n; i++) {
      if (pivot === 0) continue;
      const f = (a[i]![k] = a[i]![k]! / pivot);
      for (let j = k + 1; j < n; j++) a[i]![j] = a[i]![j]! - f * a[k]![j]!;
    }
  }
  const P = zeros(n, n);
  order.forEach((from, to) => (P[to]![from] = 1));
  const L = a.map((r, i) => r.map((x, j) => (j < i ? x : j === i ? 1 : 0)));
  const U = a.map((r, i) => r.map((x, j) => (j >= i ? x : 0)));
  return { P, L, U };
}

/** Solves M·x = b. */
export function lsolve(m: Mat, b: Mat): Mat {
  const a = rowsOf(m);
  square(a, 'lsolve');
  const rhs = rowsOf(b, 'the right-hand side');
  if (rhs.length !== a.length || rhs[0]!.length !== 1) throw new EvalError('runtime', 'lsolve needs a vector as long as the matrix is square');
  const n = a.length;
  const aug = a.map((r, i) => [...r, rhs[i]![0]!]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(aug[i]![k]!) > Math.abs(aug[p]![k]!)) p = i;
    if (Math.abs(aug[p]![k]!) <= 1e-14 * largest(a)) throw new EvalError('runtime', 'lsolve: the matrix is singular');
    [aug[p], aug[k]] = [aug[k]!, aug[p]!];
    for (let i = k + 1; i < n; i++) {
      const f = aug[i]![k]! / aug[k]![k]!;
      for (let j = k; j <= n; j++) aug[i]![j] = aug[i]![j]! - f * aug[k]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = aug[i]![n]!;
    for (let j = i + 1; j < n; j++) s -= aug[i]![j]! * x[j]!;
    x[i] = s / aug[i]![i]!;
  }
  return matOf(x.map((v) => [v]), dimDiv(b.dim, m.dim));
}

/** Reduced row echelon form, by Gauss-Jordan elimination with partial pivoting. */
export function rref(a: Rows): { r: Rows; rank: number } {
  const m = a.map((r) => [...r]);
  const rows = m.length;
  const cols = m[0]!.length;
  const tol = 1e-12 * Math.max(1, largest(a)) * Math.max(rows, cols);
  let lead = 0;
  for (let c = 0; c < cols && lead < rows; c++) {
    let p = lead;
    for (let i = lead + 1; i < rows; i++) if (Math.abs(m[i]![c]!) > Math.abs(m[p]![c]!)) p = i;
    if (Math.abs(m[p]![c]!) <= tol) {
      for (let i = lead; i < rows; i++) m[i]![c] = 0;
      continue;
    }
    [m[p], m[lead]] = [m[lead]!, m[p]!];
    const piv = m[lead]![c]!;
    for (let j = 0; j < cols; j++) m[lead]![j] = m[lead]![j]! / piv;
    for (let i = 0; i < rows; i++) {
      if (i === lead) continue;
      const f = m[i]![c]!;
      if (f === 0) continue;
      for (let j = 0; j < cols; j++) m[i]![j] = m[i]![j]! - f * m[lead]![j]!;
    }
    lead++;
  }
  // Tidy rounding dust, so exact zeros show as 0.
  for (const r of m) for (let j = 0; j < cols; j++) if (Math.abs(r[j]!) <= tol) r[j] = 0;
  return { r: m, rank: lead };
}

/**
 * Singular values by one-sided Jacobi, for m ≥ n: U (m×n), the values in descending order, and V (n×n),
 * with A = U·diag(s)·Vᵀ. Each column of U is signed so its first nonzero element is positive, which matches
 * Mathcad's svd in the cases measured.
 */
export function singular(a: Rows): { U: Rows; s: number[]; V: Rows } {
  const m = a.length;
  const n = a[0]!.length;
  if (m < n) throw new EvalError('runtime', 'svd needs at least as many rows as columns');
  const U = a.map((r) => [...r]);
  const V = eye(n);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let i = 0; i < m; i++) {
          alpha += U[i]![p]! ** 2;
          beta += U[i]![q]! ** 2;
          gamma += U[i]![p]! * U[i]![q]!;
        }
        if (gamma === 0 || Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta)) continue;
        off = Math.max(off, Math.abs(gamma) / Math.sqrt(alpha * beta));
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const sn = c * t;
        for (const M of [U, V]) {
          for (const r of M) {
            const [x, y] = [r[p]!, r[q]!];
            r[p] = c * x - sn * y;
            r[q] = sn * x + c * y;
          }
        }
      }
    }
    if (off <= 1e-15) break;
  }
  const s = Array.from({ length: n }, (_, j) => Math.sqrt(U.reduce((t, r) => t + r[j]! ** 2, 0)));
  const order = s.map((_, j) => j).sort((x, y) => s[y]! - s[x]!);
  const Us = U.map((r) => order.map((j) => (s[j]! > 0 ? r[j]! / s[j]! : 0)));
  const Vs = V.map((r) => order.map((j) => r[j]!));
  for (let k = 0; k < n; k++) {
    const first = Us.find((r) => Math.abs(r[k]!) > 1e-12)?.[k] ?? 1;
    if (first < 0) {
      for (const r of Us) r[k] = -r[k]!;
      for (const r of Vs) r[k] = -r[k]!;
    }
  }
  return { U: Us, s: order.map((j) => s[j]!), V: Vs };
}

/** Singular values, largest first, for any shape. */
export function singularValues(a: Rows): number[] {
  return singular(a.length >= a[0]!.length ? a : transposeRows(a)).s;
}

/** The pseudo-inverse V·diag(1/s)·Uᵀ: a left inverse for a tall matrix of full column rank. */
export function geninv(m: Mat): Mat {
  const a = rowsOf(m);
  if (a.length < a[0]!.length) throw new EvalError('runtime', 'geninv needs at least as many rows as columns');
  const { U, s, V } = singular(a);
  const tol = 1e-13 * (s[0] ?? 0) * Math.max(a.length, a[0]!.length);
  const n = s.length;
  const out = zeros(n, a.length);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < a.length; j++) {
      let t = 0;
      for (let k = 0; k < n; k++) if (s[k]! > tol) t += (V[i]![k]! * U[j]![k]!) / s[k]!;
      out[i]![j] = t;
    }
  }
  return matOf(out, dimPow(m.dim, -1));
}

/** Lower-triangular L with L·Lᵀ = M, for a symmetric positive definite M. */
export function cholesky(m: Mat): Mat {
  unitless(m, 'cholesky');
  const a = rowsOf(m);
  square(a, 'cholesky');
  const n = a.length;
  const L = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (s <= 0) throw new EvalError('runtime', 'cholesky needs a symmetric positive definite matrix');
        L[i]![i] = Math.sqrt(s);
      } else L[i]![j] = s / L[j]![j]!;
    }
  }
  return matOf(L);
}

/** Q (m×m) and R (m×n) side by side, with M = Q·R, by Householder reflections; R's diagonal is non-negative. */
export function qr(m: Mat): Mat {
  unitless(m, 'qr');
  const a = rowsOf(m);
  const rows = a.length;
  const cols = a[0]!.length;
  const R = a.map((r) => [...r]);
  const Q = eye(rows);
  for (let k = 0; k < Math.min(rows - 1, cols); k++) {
    const x = R.slice(k).map((r) => r[k]!);
    const norm = Math.hypot(...x);
    if (norm === 0) continue;
    const v = [...x];
    v[0] = v[0]! + (x[0]! >= 0 ? norm : -norm);
    const vv = v.reduce((t, e) => t + e * e, 0);
    for (let j = 0; j < cols; j++) {
      const f = (2 * v.reduce((t, e, i) => t + e * R[k + i]![j]!, 0)) / vv;
      v.forEach((e, i) => (R[k + i]![j] = R[k + i]![j]! - f * e));
    }
    for (let i = 0; i < rows; i++) {
      const f = (2 * v.reduce((t, e, l) => t + e * Q[i]![k + l]!, 0)) / vv;
      v.forEach((e, l) => (Q[i]![k + l] = Q[i]![k + l]! - f * e));
    }
  }
  // Make R's diagonal non-negative, flipping the matching column of Q.
  for (let k = 0; k < Math.min(rows, cols); k++) {
    if (R[k]![k]! < 0) {
      for (let j = 0; j < cols; j++) R[k]![j] = -R[k]![j]!;
      for (let i = 0; i < rows; i++) Q[i]![k] = -Q[i]![k]!;
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < Math.min(i, cols); j++) R[i]![j] = 0;
  return matOf(Q.map((r, i) => [...r, ...R[i]!]));
}

export const norm1 = (a: Rows): number => Math.max(...a[0]!.map((_, j) => a.reduce((s, r) => s + Math.abs(r[j]!), 0)));
export const normi = (a: Rows): number => Math.max(...a.map((r) => r.reduce((s, x) => s + Math.abs(x), 0)));
export const norme = (a: Rows): number => Math.sqrt(a.flat().reduce((s, x) => s + x * x, 0));
export const norm2 = (a: Rows): number => singularValues(a)[0]!;

/** A complex number as [re, im]. */
type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** Solves (A − λI)·x = b in complex arithmetic, nudging zero pivots so inverse iteration can proceed. */
function shiftedSolve(a: Rows, lambda: C, b: C[]): C[] {
  const n = a.length;
  const scaleA = Math.max(largest(a), 1e-300);
  const M: C[][] = a.map((r, i) => r.map((x, j): C => (i === j ? [x - lambda[0], -lambda[1]] : [x, 0])));
  const y = b.map((c): C => [c[0], c[1]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.hypot(...M[i]![k]!) > Math.hypot(...M[p]![k]!)) p = i;
    [M[p], M[k]] = [M[k]!, M[p]!];
    [y[p], y[k]] = [y[k]!, y[p]!];
    if (Math.hypot(...M[k]![k]!) < 1e-14 * scaleA) M[k]![k] = [1e-14 * scaleA, 0];
    for (let i = k + 1; i < n; i++) {
      const f = cdiv(M[i]![k]!, M[k]![k]!);
      for (let j = k; j < n; j++) {
        const t = cmul(f, M[k]![j]!);
        M[i]![j] = [M[i]![j]![0] - t[0], M[i]![j]![1] - t[1]];
      }
      const t = cmul(f, y[k]!);
      y[i] = [y[i]![0] - t[0], y[i]![1] - t[1]];
    }
  }
  const x: C[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s: C = [y[i]![0], y[i]![1]];
    for (let j = i + 1; j < n; j++) {
      const t = cmul(M[i]![j]!, x[j]!);
      s = [s[0] - t[0], s[1] - t[1]];
    }
    x[i] = cdiv(s, M[i]![i]!);
  }
  return x;
}

/** Unit eigenvector for eigenvalue λ by inverse iteration; null when λ isn't an eigenvalue. */
function eigenvectorFor(a: Rows, lambda: C, start: number): C[] | null {
  const n = a.length;
  let x: C[] = Array.from({ length: n }, (_, i): C => [1 + ((i + start) % n) * 0.1, 0]);
  for (let it = 0; it < 8; it++) {
    const y = shiftedSolve(a, lambda, x);
    const norm = Math.sqrt(y.reduce((s, c) => s + c[0] * c[0] + c[1] * c[1], 0));
    if (!Number.isFinite(norm) || norm === 0) return null;
    x = y.map((c): C => [c[0] / norm, c[1] / norm]);
  }
  // Check A·x ≈ λ·x.
  const scale = Math.max(largest(a), Math.hypot(...lambda), 1e-300);
  let resid = 0;
  for (let i = 0; i < n; i++) {
    let s: C = [0, 0];
    for (let j = 0; j < n; j++) s = [s[0] + a[i]![j]! * x[j]![0], s[1] + a[i]![j]! * x[j]![1]];
    const lx = cmul(lambda, x[i]!);
    resid = Math.max(resid, Math.hypot(s[0] - lx[0], s[1] - lx[1]));
  }
  return resid <= 1e-8 * scale ? x : null;
}

/** Turns x so its first element that isn't zero is real, with the given sign. */
function phase(x: C[], sign: 1 | -1): C[] {
  const first = x.find((c) => Math.hypot(...c) > 1e-12) ?? [1, 0];
  const r = Math.hypot(...first);
  const turn: C = [(sign * first[0]) / r, (-sign * first[1]) / r];
  return x.map((c) => cmul(c, turn));
}

function complexColumns(cols: C[][]): Mat {
  const n = cols[0]!.length;
  const m = newMat(n, cols.length);
  const im = new Float64Array(n * cols.length);
  cols.forEach((col, j) => {
    // Parts far below the vector's own size are rounding left by the iteration; show them as 0.
    const dust = 1e-13 * Math.max(...col.map((c) => Math.hypot(...c)));
    col.forEach((c, i) => {
      m.re[i + j * n] = Math.abs(c[0]) < dust ? 0 : c[0];
      im[i + j * n] = Math.abs(c[1]) < dust ? 0 : c[1];
    });
  });
  if (im.some((v) => Math.abs(v) > 0)) m.im = im;
  return m;
}

/**
 * Eigenvectors as columns, unit length, in the order eigenvals gives the values. A real vector's first
 * nonzero element is negative, a complex one's real and positive: Mathcad's signs in most cases measured.
 */
export function eigenvectors(m: Mat): Mat {
  unitless(m, 'eigenvecs');
  const a = rowsOf(m);
  square(a, 'eigenvecs');
  const vals = eigenvalues(m);
  const cols = Array.from(vals.re, (re, k): C[] => {
    const lambda: C = [re, vals.im ? vals.im[k]! : 0];
    const x = eigenvectorFor(a, lambda, k);
    if (!x) throw new EvalError('runtime', 'eigenvecs: an eigenvector did not converge');
    return phase(x, lambda[1] === 0 ? -1 : 1);
  });
  // A repeated real eigenvalue gets independent vectors: orthonormalize each group against the ones before.
  const scale = Math.max(largest(a), 1e-300);
  for (let k = 1; k < cols.length; k++) {
    if (vals.im?.[k]) continue;
    const same = cols.slice(0, k).filter((_, j) => !vals.im?.[j] && Math.abs(vals.re[j]! - vals.re[k]!) <= 1e-9 * scale);
    if (same.length === 0) continue;
    let x = cols[k]!.map((c) => c[0]);
    for (const q of same) {
      const d = x.reduce((t, v, i) => t + v * q[i]![0], 0);
      x = x.map((v, i) => v - d * q[i]![0]);
    }
    const norm = Math.hypot(...x);
    if (norm > 1e-8) cols[k] = phase(x.map((v): C => [v / norm, 0]), -1);
  }
  return complexColumns(cols);
}

/** The unit eigenvector for eigenvalue z, first nonzero element positive. Mathcad errors when z isn't one. */
export function eigenvector(m: Mat, z: Num): Mat {
  unitless(m, 'eigenvec');
  const a = rowsOf(m);
  square(a, 'eigenvec');
  const x = eigenvectorFor(a, [z.re, z.im], 0);
  if (!x) throw new EvalError('runtime', `eigenvec: ${z.re}${z.im ? ` + ${z.im}i` : ''} isn't an eigenvalue of this matrix`);
  return complexColumns([phase(x, 1)]);
}
