import {
  type Dim, EvalError, type Mat, NODIM, type Num, type Value, dimDiv, dimEq, dimMul, dimPow, fromValues, getEl,
  isNoDim, newMat, num, requireNum,
} from './values.js';

const unitError = (): EvalError => new EvalError('runtime', 'units do not match');

function sameDim(a: Num, b: Num): Dim {
  if (dimEq(a.dim, b.dim)) return a.dim;
  if (a.re === 0 && a.im === 0) return b.dim;
  if (b.re === 0 && b.im === 0) return a.dim;
  throw unitError();
}

export const add = (a: Num, b: Num): Num => num(a.re + b.re, sameDim(a, b), a.im + b.im);
export const sub = (a: Num, b: Num): Num => num(a.re - b.re, sameDim(a, b), a.im - b.im);

export function mul(a: Num, b: Num): Num {
  const dim = dimMul(a.dim, b.dim);
  if (a.im === 0 && b.im === 0) return num(a.re * b.re, dim);
  return num(a.re * b.re - a.im * b.im, dim, a.re * b.im + a.im * b.re);
}

export function div(a: Num, b: Num): Num {
  const dim = dimDiv(a.dim, b.dim);
  if (b.re === 0 && b.im === 0) throw new EvalError('runtime', 'division by zero');
  if (a.im === 0 && b.im === 0) return num(a.re / b.re, dim);
  const d = b.re * b.re + b.im * b.im;
  return num((a.re * b.re + a.im * b.im) / d, dim, (a.im * b.re - a.re * b.im) / d);
}

export function pow(a: Num, b: Num): Num {
  if (!isNoDim(b.dim)) throw new EvalError('runtime', 'exponent must be dimensionless');
  if (b.im === 0 && a.im === 0 && (a.re >= 0 || Number.isInteger(b.re))) {
    if (a.re === 0 && b.re === 0) throw new EvalError('runtime', '0^0 is undefined');
    return num(a.re ** b.re, dimPow(a.dim, b.re));
  }
  const r = Math.hypot(a.re, a.im);
  if (r === 0) return num(0, dimPow(a.dim, b.re));
  const theta = Math.atan2(a.im, a.re);
  const logR = Math.log(r);
  const mag = Math.exp(b.re * logR - b.im * theta);
  const ang = b.im * logR + b.re * theta;
  return num(mag * Math.cos(ang), dimPow(a.dim, b.re), mag * Math.sin(ang));
}

export const scalarOf = (v: Value): Num => requireNum(v);

export function mapMat(m: Mat, f: (v: Value) => Value): Mat {
  const out: Value[] = [];
  for (let n = 0; n < m.rows * m.cols; n++) out.push(f(getEl(m, n % m.rows, Math.floor(n / m.rows))));
  return fromValues(m.rows, m.cols, out);
}

/** Apply `f` to two values, element by element, with scalars extended over arrays. */
export function zip(a: Value, b: Value, f: (x: Value, y: Value) => Value): Value {
  if (a.t === 'mat' && b.t === 'mat') {
    if (a.rows !== b.rows || a.cols !== b.cols) throw new EvalError('runtime', 'array sizes do not match');
    const out: Value[] = [];
    for (let n = 0; n < a.rows * a.cols; n++) {
      const i = n % a.rows;
      const j = Math.floor(n / a.rows);
      out.push(f(getEl(a, i, j), getEl(b, i, j)));
    }
    return fromValues(a.rows, a.cols, out);
  }
  if (a.t === 'mat') return mapMat(a, (x) => f(x, b));
  if (b.t === 'mat') return mapMat(b, (y) => f(a, y));
  return f(a, b);
}

const scalarZip = (f: (x: Num, y: Num) => Value) => (a: Value, b: Value): Value =>
  zip(a, b, (x, y) => (x.t === 'mat' || y.t === 'mat' ? scalarZip(f)(x, y) : f(requireNum(x), requireNum(y))));

const plainMat = (v: Value): v is Mat => v.t === 'mat' && v.cells === null && v.im === null;
const realNum = (v: Value): v is Num => v.t === 'num' && v.im === 0;

/**
 * `scalarZip` with a fast path for real numbers and real arrays, working on their numbers directly. One
 * call of `f` on a sample gives the result's unit, and checks the units agree. A division by zero takes
 * the general path, so it still reports, or follows the zero-over-zero option.
 */
function realZip(f: (x: Num, y: Num) => Num, k: (x: number, y: number) => number, divides = false) {
  const general = scalarZip(f);
  return (a: Value, b: Value): Value => {
    const am = plainMat(a);
    const bm = plainMat(b);
    if (!(am || bm) || !(am || realNum(a)) || !(bm || realNum(b))) return general(a, b);
    const shape = (am ? a : b) as Mat;
    if (am && bm && (a.rows !== b.rows || a.cols !== b.cols)) throw new EvalError('runtime', 'array sizes do not match');
    const n = shape.rows * shape.cols;
    const xs = am ? a.re : null;
    const ys = bm ? b.re : null;
    const x0 = am ? 0 : (a as Num).re;
    const y0 = bm ? 0 : (b as Num).re;
    if (divides && (ys ? ys.includes(0) : y0 === 0)) return general(a, b);
    const unit = f(num(1, a.dim), num(1, b.dim)).dim;
    const out = newMat(shape.rows, shape.cols, unit);
    const r = out.re;
    for (let i = 0; i < n; i++) r[i] = k(xs ? xs[i]! : x0, ys ? ys[i]! : y0);
    return out;
  };
}

export const addV = realZip(add, (x, y) => x + y);
export const subV = realZip(sub, (x, y) => x - y);
export const mulE = realZip(mul, (x, y) => x * y);
export const divE = realZip(div, (x, y) => x / y, true);

/** Division with Mathcad's zero-over-zero option on: 0/0 is 0, measured in Mathcad 14. */
export const divZeroE = scalarZip((a: Num, b: Num): Num =>
  a.re === 0 && a.im === 0 && b.re === 0 && b.im === 0 ? num(0, dimDiv(a.dim, b.dim)) : div(a, b));
export const powE = scalarZip(pow);

export function neg(v: Value): Value {
  if (v.t === 'mat') return mapMat(v, neg);
  const n = requireNum(v);
  return num(-n.re, n.dim, -n.im);
}

export function matMul(a: Mat, b: Mat): Value {
  if (a.cols !== b.rows) throw new EvalError('runtime', 'array sizes do not match');
  const hasIm = a.im !== null || b.im !== null || a.cells !== null || b.cells !== null;
  if (!hasIm) {
    const out = newMat(a.rows, b.cols, dimMul(a.dim, b.dim));
    for (let j = 0; j < b.cols; j++) {
      for (let k = 0; k < a.cols; k++) {
        const s = b.re[k + j * b.rows]!;
        for (let i = 0; i < a.rows; i++) out.re[i + j * a.rows] = out.re[i + j * a.rows]! + a.re[i + k * a.rows]! * s;
      }
    }
    return out.rows === 1 && out.cols === 1 ? num(out.re[0]!, out.dim) : out;
  }
  const items: Value[] = [];
  for (let j = 0; j < b.cols; j++) {
    for (let i = 0; i < a.rows; i++) {
      let sum: Num | null = null;
      for (let k = 0; k < a.cols; k++) {
        const term = mul(requireNum(getEl(a, i, k)), requireNum(getEl(b, k, j)));
        sum = sum ? add(sum, term) : term;
      }
      items.push(sum!);
    }
  }
  return fromValues(a.rows, b.cols, items);
}

export function dot(a: Mat, b: Mat): Num {
  let sum: Num = num(0);
  for (let i = 0; i < a.rows; i++) {
    const y = requireNum(getEl(b, i, 0));
    sum = add(sum, mul(requireNum(getEl(a, i, 0)), num(y.re, y.dim, -y.im)));
  }
  return sum;
}

export function mulV(a: Value, b: Value): Value {
  if (a.t === 'mat' && b.t === 'mat') {
    if (a.cols === 1 && b.cols === 1 && a.rows === b.rows) return dot(a, b);
    return matMul(a, b);
  }
  return mulE(a, b);
}

/** LU decomposition with partial pivoting of a real square array. */
function lu(m: Mat): { a: Float64Array; perm: number[]; sign: number } {
  const n = m.rows;
  const a = m.re.slice();
  const perm = Array.from({ length: n }, (_, i) => i);
  let sign = 1;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i + k * n]!) > Math.abs(a[p + k * n]!)) p = i;
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = a[k + j * n]!;
        a[k + j * n] = a[p + j * n]!;
        a[p + j * n] = t;
      }
      [perm[k], perm[p]] = [perm[p]!, perm[k]!];
      sign = -sign;
    }
    const d = a[k + k * n]!;
    if (d === 0) continue;
    for (let i = k + 1; i < n; i++) {
      a[i + k * n] = a[i + k * n]! / d;
      const f = a[i + k * n]!;
      for (let j = k + 1; j < n; j++) a[i + j * n] = a[i + j * n]! - f * a[k + j * n]!;
    }
  }
  return { a, perm, sign };
}

const requireSquare = (m: Mat): void => {
  if (m.rows !== m.cols) throw new EvalError('runtime', 'array must be square');
  if (m.cells || m.im) throw new EvalError('unsupported', 'complex or nested array in linear algebra');
};

export function det(m: Mat): Num {
  requireSquare(m);
  const { a, sign } = lu(m);
  let d = sign;
  for (let i = 0; i < m.rows; i++) d *= a[i + i * m.rows]!;
  return num(d, dimPow(m.dim, m.rows));
}

export function inverse(m: Mat): Mat {
  requireSquare(m);
  const n = m.rows;
  const { a, perm } = lu(m);
  const out = newMat(n, n, dimPow(m.dim, -1));
  for (let c = 0; c < n; c++) {
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = perm[i] === c ? 1 : 0;
      for (let k = 0; k < i; k++) s -= a[i + k * n]! * x[k]!;
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i]!;
      for (let k = i + 1; k < n; k++) s -= a[i + k * n]! * x[k]!;
      const d = a[i + i * n]!;
      if (d === 0) throw new EvalError('runtime', 'matrix is singular');
      x[i] = s / d;
    }
    out.re.set(x, c * n);
  }
  return out;
}

export function matPow(m: Mat, p: number): Value {
  if (!Number.isInteger(p)) throw new EvalError('runtime', 'array power must be an integer');
  const base = p < 0 ? inverse(m) : m;
  let out: Value = identity(m.rows, NODIM);
  for (let i = 0; i < Math.abs(p); i++) out = matMul(out as Mat, base);
  return out;
}

export function identity(n: number, dim: Dim): Mat {
  const m = newMat(n, n, dim);
  for (let i = 0; i < n; i++) m.re[i + i * n] = 1;
  return m;
}

export function transpose(m: Mat): Mat {
  const out = newMat(m.cols, m.rows, m.dim);
  if (m.im) out.im = new Float64Array(m.re.length);
  if (m.cells) out.cells = new Array(m.re.length);
  for (let i = 0; i < m.rows; i++) {
    for (let j = 0; j < m.cols; j++) {
      const from = i + j * m.rows;
      const to = j + i * m.cols;
      if (m.cells) out.cells![to] = m.cells[from]!;
      else {
        out.re[to] = m.re[from]!;
        if (m.im) out.im![to] = m.im[from]!;
      }
    }
  }
  return out;
}

export const magnitude = (v: Num): Num => num(Math.hypot(v.re, v.im), v.dim);

export function absV(v: Value): Value {
  if (v.t !== 'mat') return magnitude(requireNum(v));
  if (v.cols === 1 || v.rows === 1) {
    let s = 0;
    for (let n = 0; n < v.rows * v.cols; n++) {
      const x = requireNum(getEl(v, n % v.rows, Math.floor(n / v.rows)));
      s += x.re * x.re + x.im * x.im;
    }
    return num(Math.sqrt(s), v.dim);
  }
  // On a square matrix, |M| is the determinant, sign and all, as in Mathcad 14 (|[[1,2],[3,4]]| is −2).
  return det(v);
}

export function sumV(v: Value): Num {
  if (v.t !== 'mat') return requireNum(v);
  let s: Num = num(0, v.dim);
  for (let n = 0; n < v.rows * v.cols; n++) s = add(s, requireNum(getEl(v, n % v.rows, Math.floor(n / v.rows))));
  return s;
}

export function cross(a: Mat, b: Mat): Mat {
  if (a.rows !== 3 || b.rows !== 3) throw new EvalError('runtime', 'cross product needs 3-element vectors');
  const dim = dimMul(a.dim, b.dim);
  const [x, y] = [a.re, b.re];
  const out = newMat(3, 1, dim);
  out.re.set([x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!]);
  return out;
}

export function compareReal(a: Num, b: Num): number {
  sameDim(a, b);
  return a.re - b.re;
}

/** Mathcad's comparison with exact equality off: equal within a relative 10⁻¹², measured in Mathcad 14. */
export function compareClose(a: Num, b: Num): number {
  sameDim(a, b);
  const d = a.re - b.re;
  return Math.abs(d) <= 1e-12 * Math.max(Math.abs(a.re), Math.abs(b.re)) ? 0 : d;
}

