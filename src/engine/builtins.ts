import { eigenvalues } from './eigen.js';
import { type DecodedImage, type Files, NO_FILES, fileKey, isWebAddress } from './files.js';
import { MATHCAD_FILE_FUNCTIONS } from '../xmcd/names.js';
import { absV, addV, compareReal, det, identity, magnitude, mapMat, pow, sumV, transpose } from './ops.js';
import {
  type Dim, EvalError, type Fn, type Mat, NODIM, type Num, type Value, cloneMat, fromValues, getEl, isNoDim, newMat, num, numbersOf,
  requireMat, requireNum, requireReal, resized, setEl, str,
} from './values.js';

type Impl = (...args: Value[]) => Value;

const scalar = (f: (x: Num) => Value): Impl => {
  const g = (v: Value): Value => (v.t === 'mat' ? mapMat(v, g) : f(requireNum(v)));
  return g;
};

const real1 = (f: (x: number) => number): Impl =>
  scalar((x) => {
    if (!isNoDim(x.dim)) throw new EvalError('runtime', 'argument must be dimensionless');
    if (x.im !== 0) throw new EvalError('unsupported', 'complex argument to real function');
    return num(f(x.re));
  });

const keepDim1 = (f: (x: number) => number): Impl => scalar((x) => num(f(x.re), x.dim));

function complexLog(x: Num): Num {
  if (!isNoDim(x.dim)) throw new EvalError('runtime', 'argument must be dimensionless');
  if (x.re === 0 && x.im === 0) throw new EvalError('runtime', 'log of zero');
  if (x.im === 0 && x.re > 0) return num(Math.log(x.re));
  return num(Math.log(Math.hypot(x.re, x.im)), NODIM, Math.atan2(x.im, x.re));
}

/** Real inside [-1, 1]; outside it, the complex value. */
function inverseTrig(x: Num, f: (v: number) => number, kind: 'asin' | 'acos'): Num {
  if (!isNoDim(x.dim)) throw new EvalError('runtime', 'argument must be dimensionless');
  if (x.im === 0 && Math.abs(x.re) <= 1) return num(f(x.re));
  throw new EvalError('unsupported', `complex ${kind}`);
}

const flatten = (args: Value[]): Num[] =>
  args.flatMap((a) => {
    if (a.t !== 'mat') return [requireNum(a)];
    const out: Num[] = [];
    for (let n = 0; n < a.rows * a.cols; n++) out.push(...flatten([getEl(a, n % a.rows, Math.floor(n / a.rows))]));
    return out;
  });

function extreme(args: Value[], sign: number): Value {
  const items = flatten(args);
  if (items.length === 0) throw new EvalError('runtime', 'no elements');
  return items.reduce((best, x) => (compareReal(x, best) * sign > 0 ? x : best));
}

function interpolate(xs: Float64Array, ys: Float64Array, x: number): number {
  const n = xs.length;
  if (n < 2) throw new EvalError('runtime', 'linterp needs at least two points');
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const [x0, x1] = [xs[lo]!, xs[hi]!];
  return ys[lo]! + ((ys[hi]! - ys[lo]!) * (x - x0)) / (x1 - x0);
}

const sliceCol = (m: Mat, j: number): Float64Array => m.re.subarray(j * m.rows, (j + 1) * m.rows);

function sortRowsBy(m: Mat, key: Float64Array): Mat {
  const order = Array.from(key, (_, i) => i).sort((a, b) => key[a]! - key[b]!);
  const out = cloneMat(m);
  order.forEach((from, to) => {
    for (let j = 0; j < m.cols; j++) setEl(out, to, j, getEl(m, from, j));
  });
  return out;
}

/** An image as one matrix of 0 to 255, with red, green and blue blocks side by side. */
function imageMatrix(img: DecodedImage): Mat {
  const { width: w, height: h, rgba } = img;
  const m = newMat(h, w * 3);
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const p = (i * w + j) * 4;
      m.re[i + j * h] = rgba[p]!;
      m.re[i + (j + w) * h] = rgba[p + 1]!;
      m.re[i + (j + 2 * w) * h] = rgba[p + 2]!;
    }
  }
  return m;
}

export function makeBuiltins(origin: number, files: Files = NO_FILES): Map<string, Fn> {
  const idx = (v: Value): number => Math.trunc(requireReal(v, 'index')) - origin;

  const table: Record<string, Impl> = {
    sin: real1(Math.sin), cos: real1(Math.cos), tan: real1(Math.tan),
    cot: real1((x) => 1 / Math.tan(x)), sec: real1((x) => 1 / Math.cos(x)), csc: real1((x) => 1 / Math.sin(x)),
    asin: scalar((x) => inverseTrig(x, Math.asin, 'asin')), acos: scalar((x) => inverseTrig(x, Math.acos, 'acos')),
    atan: real1(Math.atan), sinh: real1(Math.sinh), cosh: real1(Math.cosh), tanh: real1(Math.tanh),
    atan2: (a, b) => {
      const [x, y] = [requireNum(a), requireNum(b)];
      // Mathcad has no negative zero here: a stored result shows atan2(-1, -0) as +180 degrees.
      return num(Math.atan2(y.re + 0, x.re + 0));
    },
    angle: (a, b) => {
      const t = Math.atan2(requireReal(b), requireReal(a));
      return num(t < 0 ? t + 2 * Math.PI : t);
    },
    exp: real1(Math.exp),
    ln: scalar(complexLog),
    log: (a, b) => {
      const base = b ? Math.log(requireReal(b)) : Math.LN10;
      return scalar((x) => {
        const l = complexLog(x);
        return num(l.re / base, NODIM, l.im / base);
      })(a);
    },
    sqrt: scalar((x) => pow(x, num(0.5))),
    sign: keepDimless(Math.sign), floor: keepDim1(Math.floor), ceil: keepDim1(Math.ceil), trunc: keepDim1(Math.trunc),
    round: (a, b) => {
      const p = 10 ** (b ? requireReal(b) : 0);
      return keepDim1((x) => {
        const s = Math.sign(x);
        return (s * Math.round(Math.abs(x) * p)) / p;
      })(a);
    },
    mod: (a, b) => {
      const [x, y] = [requireNum(a), requireNum(b)];
      if (y.re === 0) throw new EvalError('runtime', 'mod by zero');
      return num(x.re % y.re, x.dim);
    },
    Re: scalar((x) => num(x.re, x.dim)), Im: scalar((x) => num(x.im, x.dim)), arg: scalar((x) => num(Math.atan2(x.im, x.re))),
    max: (...a) => extreme(a, 1), min: (...a) => extreme(a, -1),
    rows: (m) => num(requireMat(m).rows), cols: (m) => num(requireMat(m).cols),
    length: (m) => num(requireMat(m).rows),
    last: (m) => num(requireMat(m).rows - 1 + origin),
    identity: (n) => identity(requireReal(n), NODIM),
    tr: (m) => {
      const a = requireMat(m);
      let s = num(0, a.dim) as Value;
      for (let i = 0; i < a.rows; i++) s = addV(s, getEl(a, i, i));
      return s;
    },
    reverse: (m) => {
      const a = requireMat(m);
      const out = cloneMat(a);
      for (let i = 0; i < a.rows; i++) for (let j = 0; j < a.cols; j++) setEl(out, a.rows - 1 - i, j, getEl(a, i, j));
      return out;
    },
    submatrix: (m, ir, jr, ic, jc) => {
      const a = requireMat(m);
      const [r0, r1, c0, c1] = [idx(ir!), idx(jr!), idx(ic!), idx(jc!)];
      const [rlo, rhi, clo, chi] = [Math.min(r0, r1), Math.max(r0, r1), Math.min(c0, c1), Math.max(c0, c1)];
      if (rlo < 0 || clo < 0 || rhi >= a.rows || chi >= a.cols) throw new EvalError('runtime', 'submatrix out of bounds');
      const out = newMat(rhi - rlo + 1, chi - clo + 1, a.dim);
      for (let i = rlo; i <= rhi; i++) for (let j = clo; j <= chi; j++) setEl(out, i - rlo, j - clo, getEl(a, i, j));
      return out;
    },
    augment: (...parts) => {
      const ms = parts.map((p) => requireMat(p));
      const rows = ms[0]!.rows;
      if (ms.some((m) => m.rows !== rows)) throw new EvalError('runtime', 'augment needs equal rows');
      const out = newMat(rows, ms.reduce((c, m) => c + m.cols, 0), ms[0]!.dim);
      let at = 0;
      for (const m of ms) {
        for (let j = 0; j < m.cols; j++) for (let i = 0; i < rows; i++) setEl(out, i, at + j, getEl(m, i, j));
        at += m.cols;
      }
      return out;
    },
    stack: (...parts) => {
      const ms = parts.map((p) => requireMat(p));
      const cols = ms[0]!.cols;
      if (ms.some((m) => m.cols !== cols)) throw new EvalError('runtime', 'stack needs equal columns');
      const out = newMat(ms.reduce((c, m) => c + m.rows, 0), cols, ms[0]!.dim);
      let at = 0;
      for (const m of ms) {
        for (let i = 0; i < m.rows; i++) for (let j = 0; j < cols; j++) setEl(out, at + i, j, getEl(m, i, j));
        at += m.rows;
      }
      return out;
    },
    matrix: (r, c, f) => {
      if (f?.t !== 'fn') throw new EvalError('runtime', 'matrix needs a function');
      const [rows, cols] = [requireReal(r!), requireReal(c!)];
      const out = newMat(rows, cols);
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) setEl(out, i, j, f.call([num(i + origin), num(j + origin)]));
      return out;
    },
    sort: (v) => {
      const a = requireMat(v);
      return sortRowsBy(a, numbersOf(a).slice());
    },
    csort: (m, c) => {
      const a = requireMat(m);
      return sortRowsBy(a, sliceCol(a, idx(c!)));
    },
    rsort: (m, r) => {
      const a = transpose(requireMat(m));
      return transpose(sortRowsBy(a, sliceCol(a, idx(r!))));
    },
    linterp: (vx, vy, x) => {
      const [xs, ys] = [requireMat(vx), requireMat(vy)];
      if (xs.rows !== ys.rows) throw new EvalError('runtime', 'linterp vectors differ in length');
      return scalar((p) => {
        if (!isNoDim(xs.dim) || !isNoDim(p.dim)) compareReal(p, num(0, xs.dim));
        return num(interpolate(xs.re, ys.re, p.re), ys.dim);
      })(x!);
    },
    mean: (...a) => {
      const items = flatten(a);
      const s = items.reduce((t, x) => t + x.re, 0);
      return num(s / items.length, items[0]!.dim);
    },
    stdev: (...a) => {
      const items = flatten(a);
      const m = items.reduce((t, x) => t + x.re, 0) / items.length;
      return num(Math.sqrt(items.reduce((t, x) => t + (x.re - m) ** 2, 0) / items.length), items[0]!.dim);
    },
    Stdev: (...a) => {
      const items = flatten(a);
      const m = items.reduce((t, x) => t + x.re, 0) / items.length;
      return num(Math.sqrt(items.reduce((t, x) => t + (x.re - m) ** 2, 0) / (items.length - 1)), items[0]!.dim);
    },
    '°C': (x) => keepTemp(x, (c) => c + 273.15),
    '°F': (x) => keepTemp(x, (f) => ((f + 459.67) * 5) / 9),
    eigenvals: (m) => eigenvalues(requireMat(m)),
    readImage: (source) => {
      if (source?.t !== 'str') throw new EvalError('runtime', 'readImage needs a file name or web address in quotes');
      const name = source.v;
      if (!isWebAddress(name) && /[\\/]/.test(name)) {
        throw new EvalError('runtime', 'readImage takes the name of an attached file, or a web address, not a folder path');
      }
      const img = files.image(fileKey(name));
      if (!img) throw new EvalError('runtime', `${name} isn't attached to this worksheet. Load it with Files on the toolbar`);
      return imageMatrix(img);
    },
    concat: (...a) => str(a.map((s) => (s.t === 'str' ? s.v : '')).join('')),
    strlen: (s) => num(s.t === 'str' ? s.v.length : 0),
    num2str: (a) => str(String(requireReal(a))),
    rnd: () => { throw new EvalError('excluded', 'rnd'); },
    runif: () => { throw new EvalError('excluded', 'rnd'); },
    rnorm: () => { throw new EvalError('excluded', 'rnd'); },
    norme: (m) => absV(fromValues(requireMat(m).re.length, 1, flatten([m]))),
    normi: (m) => {
      const a = requireMat(m);
      let best = 0;
      for (let i = 0; i < a.rows; i++) {
        let s = 0;
        for (let j = 0; j < a.cols; j++) s += magnitude(requireNum(getEl(a, i, j))).re;
        best = Math.max(best, s);
      }
      return num(best, a.dim);
    },
    sum: (v) => sumV(v),
    det: (m) => det(requireMat(m)),
    resize: (m, r, c) => resized(requireMat(m), requireReal(r!), requireReal(c!)),
  };

  const out = new Map<string, Fn>();
  for (const [name, impl] of Object.entries(table)) out.set(name, { t: 'fn', name, call: (a) => impl(...a) });
  for (const name of MATHCAD_FILE_FUNCTIONS) {
    out.set(name, {
      t: 'fn',
      name,
      call: () => {
        throw new EvalError('mathcad', `${name} is Mathcad's, and reads a file on Mathcad's computer. Use Files on the toolbar to load the file instead: it adds readImage, assigned to a variable you name, to use here in its place.`);
      },
    });
  }
  return out;
}

const KELVIN: Dim = [0, 0, 0, 0, 1, 0, 0];

function keepTemp(v: Value, f: (x: number) => number): Value {
  return scalar((x) => num(f(x.re), KELVIN))(v);
}

function keepDimless(f: (x: number) => number): Impl {
  return scalar((x) => num(f(x.re)));
}
