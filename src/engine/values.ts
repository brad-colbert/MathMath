/** Exponents of length, mass, time, current, temperature, substance, luminous intensity. */
export type Dim = readonly number[];
export const NODIM: Dim = [0, 0, 0, 0, 0, 0, 0];

/** `mathcad`: a Mathcad feature that needs replacing, such as a file function, not a mistake. */
export type ErrorKind = 'unsupported' | 'undefined' | 'undefined-function' | 'runtime' | 'excluded' | 'mathcad';

/** A failed evaluation. `reason` is what the scoreboard groups by, so keep it stable and short. */
export class EvalError extends Error {
  constructor(public kind: ErrorKind, public reason: string) {
    super(`${kind}: ${reason}`);
  }
}

export interface Num { t: 'num'; re: number; im: number; dim: Dim }
export interface Str { t: 'str'; v: string }
export interface Mat {
  t: 'mat';
  rows: number;
  cols: number;
  /** Column-major. Unused when `cells` is set. */
  re: Float64Array;
  im: Float64Array | null;
  dim: Dim;
  /** Set for nested arrays, strings, or mixed units. */
  cells: Value[] | null;
  /** The scope allowed to change this matrix in place. */
  owner?: unknown;
}
export interface Range { t: 'range'; first: number; step: number; last: number; dim: Dim }
export interface Fn { t: 'fn'; name: string; call: (args: Value[]) => Value; arity?: number }
export interface Failed { t: 'failed'; error: EvalError }
export type Value = Num | Str | Mat | Range | Fn | Failed;

export const num = (re: number, dim: Dim = NODIM, im = 0): Num => ({ t: 'num', re, im, dim });
export const str = (v: string): Str => ({ t: 'str', v });

export const newMat = (rows: number, cols: number, dim: Dim = NODIM): Mat => ({
  t: 'mat', rows, cols, re: new Float64Array(rows * cols), im: null, dim, cells: null,
});

export const dimEq = (a: Dim, b: Dim): boolean => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);
export const isNoDim = (d: Dim): boolean => d === NODIM || dimEq(d, NODIM);
export const dimMul = (a: Dim, b: Dim): Dim => (a === NODIM ? b : b === NODIM ? a : a.map((v, i) => v + b[i]!));
export const dimDiv = (a: Dim, b: Dim): Dim => (b === NODIM ? a : a.map((v, i) => v - b[i]!));
export const dimPow = (a: Dim, p: number): Dim => (a === NODIM ? a : a.map((v) => v * p));

export function getEl(m: Mat, i: number, j: number): Value {
  const n = i + j * m.rows;
  if (m.cells) return m.cells[n]!;
  return num(m.re[n]!, m.dim, m.im ? m.im[n]! : 0);
}

function toCells(m: Mat): void {
  if (m.cells) return;
  const cells: Value[] = [];
  for (let n = 0; n < m.rows * m.cols; n++) cells.push(num(m.re[n]!, m.dim, m.im ? m.im[n]! : 0));
  m.cells = cells;
}

export function setEl(m: Mat, i: number, j: number, v: Value): void {
  const n = i + j * m.rows;
  if (v.t !== 'num' || m.cells) {
    toCells(m);
    m.cells![n] = v;
    return;
  }
  if (!dimEq(v.dim, m.dim)) {
    if (isNoDim(m.dim) && m.re.every((x) => x === 0)) m.dim = v.dim;
    else if (v.re !== 0 || v.im !== 0) {
      toCells(m);
      m.cells![n] = v;
      return;
    }
  }
  m.re[n] = v.re;
  if (v.im !== 0 && !m.im) m.im = new Float64Array(m.re.length);
  if (m.im) m.im[n] = v.im;
}

export function cloneMat(m: Mat): Mat {
  const c: Mat = { t: 'mat', rows: m.rows, cols: m.cols, re: m.re.slice(), im: m.im ? m.im.slice() : null, dim: m.dim, cells: null };
  if (m.cells) c.cells = m.cells.slice();
  return c;
}

/** A copy with the given size, keeping existing elements. New elements are zero. */
export function resized(m: Mat, rows: number, cols: number): Mat {
  const c = newMat(rows, cols, m.dim);
  if (m.im) c.im = new Float64Array(rows * cols);
  if (m.cells) c.cells = Array.from({ length: rows * cols }, () => num(0));
  for (let j = 0; j < Math.min(cols, m.cols); j++) {
    for (let i = 0; i < Math.min(rows, m.rows); i++) {
      const to = i + j * rows;
      const from = i + j * m.rows;
      if (m.cells) c.cells![to] = m.cells[from]!;
      else {
        c.re[to] = m.re[from]!;
        if (m.im) c.im![to] = m.im[from]!;
      }
    }
  }
  return c;
}

export function fromValues(rows: number, cols: number, items: Value[]): Mat {
  const m = newMat(rows, cols);
  items.forEach((v, n) => setEl(m, n % rows, Math.floor(n / rows), v));
  return m;
}

export function requireNum(v: Value, what = 'value'): Num {
  if (v.t === 'num') return v;
  if (v.t === 'mat' && v.rows === 1 && v.cols === 1) return requireNum(getEl(v, 0, 0), what);
  throw new EvalError('runtime', `${what} must be scalar`);
}

export function requireMat(v: Value, what = 'value'): Mat {
  if (v.t === 'mat') return v;
  if (v.t === 'num') return fromValues(1, 1, [v]);
  throw new EvalError('runtime', `${what} must be an array`);
}

export function requireReal(v: Value, what = 'value'): number {
  const n = requireNum(v, what);
  if (n.im !== 0) throw new EvalError('runtime', `${what} must be real`);
  return n.re;
}

/** Every element of an all-numeric array, flattened column-major. */
export function numbersOf(m: Mat): Float64Array {
  if (!m.cells) return m.re;
  return Float64Array.from(m.cells, (c) => requireReal(c, 'element'));
}
