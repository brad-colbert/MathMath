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

import { eigenvalues } from './eigen.js';
import { ELEMENTARY, csgn, signum } from './elementary.js';
import { FIT_ARITY, fitFns, interpRegress } from './fitting.js';
import { FINANCE_ARITY, financeFns } from './finance.js';
import { GRAPHING_ARITY, graphingFns } from './graphing.js';
import { SMOOTHING_ARITY, smoothingFns } from './smoothing.js';
import { SCALING_ARITY, scalingFns } from './scaling.js';
import { gesvd } from './svd.js';
import { ggev } from './qz.js';
import { BVP_ARITY, bvpFns } from './bvp.js';
import { LOOKUP_ARITY, lookupFns } from './lookup.js';
import { BESSEL_ARITY } from './bessel.js';
import { SPECIAL_ARITY, specialFns } from './special.js';
import { STRING_ARITY, stringFns } from './strings.js';
import { type DecodedImage, type Files, NO_FILES, fileKey, isWebAddress } from './files.js';
import type { DecodedAudio } from './wav.js';
import { SPLINE_KINDS, type SplineKind, bsplineAt, bsplineFit, medianSmooth, secondDerivatives, secondDerivatives2, spline2At, splineAt } from './splines.js';
import {
  cholesky, eigenvector, eigenvectors, geninv, lsolve, luDecompose, matOf, norm1, norm2, norme, normi, qr, rowsOf, rref, singular, singularValues,
} from './linalg.js';
import { complexTransform, realForward, realInverse } from './fourier.js';
import { normal } from './random.js';
import { convolve, correlate, filterFns, firFns, windowFns } from './signal.js';
import { IIR_ARITY, iirFns } from './iir.js';
import { SYSTEM_ARITY, systemFns } from './systems.js';
import { ODE_ARITY, odeFns } from './ode.js';
import { IMAGE_ARITY, type Pixels, type Written, imageFns, writeImage } from './image.js';
import { CIRCUIT_ARITY, circuitFns } from './circuit.js';
import { ELECTRICAL_ARITY, electricalFns } from './electrical.js';
import { RF_ARITY, rfFns } from './rf.js';
import { DISTRIBUTION_ARITY, distributionFns } from './distributions.js';
import { parseTable } from './table.js';
import { MATHCAD_FILE_FUNCTIONS, MATHCAD_WRITES } from '../xmcd/names.js';
import { absV, addV, compareReal, det, identity, inverse, magnitude, mapMat, pow, sumV, transpose } from './ops.js';
import {
  type Dim, EvalError, type Fn, type Mat, NODIM, type Num, type Value, cloneMat, dimDiv, fromValues, getEl, isNoDim, newMat, num, numbersOf,
  needsFile, requireMat, requireNum, requireReal, resized, setEl, str,
} from './values.js';

type Impl = (...args: Value[]) => Value;

/** How many arguments each signal function takes, at least and at most, so a missing one is named. Image functions list theirs in image.ts. */
const SIGNAL_ARITY: Record<string, [number, number]> = {
  convolve: [2, 2], correlate: [2, 2], hannWindow: [1, 1], hammingWindow: [1, 1], blackmanWindow: [1, 1], kaiserWindow: [2, 2],
  firLowpass: [2, 3], firHighpass: [2, 3], firBandpass: [3, 4], firBandstop: [3, 4],
  applyFilter: [2, 2], zeroPhaseFilter: [2, 2], freqResponse: [2, 2],
};

function withArity(fns: Record<string, Impl>): Record<string, Impl> {
  return Object.fromEntries(Object.entries(fns).map(([name, f]) => {
    const [lo, hi] = SIGNAL_ARITY[name] ?? IIR_ARITY[name] ?? SYSTEM_ARITY[name] ?? ODE_ARITY[name] ?? IMAGE_ARITY[name] ?? ELECTRICAL_ARITY[name] ?? CIRCUIT_ARITY[name] ?? RF_ARITY[name] ?? DISTRIBUTION_ARITY[name] ?? FIT_ARITY[name] ?? STRING_ARITY[name] ?? LOOKUP_ARITY[name] ?? FINANCE_ARITY[name] ?? GRAPHING_ARITY[name] ?? SMOOTHING_ARITY[name] ?? SCALING_ARITY[name] ?? BVP_ARITY[name] ?? SPECIAL_ARITY[name] ?? BESSEL_ARITY[name] ?? [0, Infinity];
    const say = lo === hi ? `${lo}` : hi === Infinity ? `at least ${lo}` : `${lo} or ${hi}`;
    return [name, (...args: Value[]) => {
      if (args.length < lo || args.length > hi) throw new EvalError('runtime', `${name} takes ${say} argument${hi === 1 ? '' : 's'}, not ${args.length}`);
      return f(...args);
    }];
  }));
}

const scalar = (f: (x: Num) => Value): Impl => {
  const g = (v: Value): Value => (v.t === 'mat' ? mapMat(v, g) : f(requireNum(v)));
  return g;
};

/** An elementary function of a dimensionless number, real or complex (elementary.ts). */
const elementary = (fn: string): Impl => {
  const e = ELEMENTARY[fn]!;
  return scalar((x) => {
    if (!isNoDim(x.dim)) throw new EvalError('runtime', 'argument must be dimensionless');
    const r = x.im === 0 ? e.real?.(x.re) : undefined;
    if (r !== undefined) return num(r);
    const [re, im] = e.complex([x.re, x.im], fn);
    return num(re, NODIM, im);
  });
};

const realOf = (x: Num, fn: string): number => {
  if (x.im !== 0) throw new EvalError('runtime', `${fn} takes a real argument`);
  return x.re;
};

const keepDim1 = (f: (x: number) => number): Impl => scalar((x) => num(f(x.re), x.dim));

function complexLog(x: Num): Num {
  if (!isNoDim(x.dim)) throw new EvalError('runtime', 'argument must be dimensionless');
  if (x.re === 0 && x.im === 0) throw new EvalError('runtime', 'log of zero');
  if (x.im === 0 && x.re > 0) return num(Math.log(x.re));
  return num(Math.log(Math.hypot(x.re, x.im)), NODIM, Math.atan2(x.im, x.re));
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

const column = (values: ArrayLike<number>, dim: Dim = NODIM): Mat => {
  const m = newMat(values.length, 1, dim);
  m.re.set(values);
  return m;
};

/** A plain numeric vector's numbers, for the spline functions. */
function vectorOf(v: Value, what: string): Mat {
  const m = requireMat(v, what);
  if (m.cells || m.im) throw new EvalError('runtime', `${what} must hold real numbers`);
  if (m.cols !== 1) throw new EvalError('runtime', `${what} must be a column vector`);
  return m;
}

/**
 * Mathcad's spline vector: 0, 3 and the kind (0 lspline, 1 pspline, 2 cspline), then the second
 * derivatives. A 2-D spline takes an n×2 matrix of grid coordinates and an n×n matrix of values.
 */
function splineVector(kind: SplineKind, vx: Value, vy: Value): Mat {
  const xs = requireMat(vx, 'the x values');
  const ys = requireMat(vy, 'the y values');
  let M: Float64Array;
  if (xs.cols === 2) {
    const n = xs.rows;
    if (ys.rows !== n || ys.cols !== n) throw new EvalError('runtime', 'a 2-D spline needs an n×2 matrix of grid points and an n×n matrix of values');
    M = secondDerivatives2(sliceCol(xs, 1), (i, j) => ys.re[i + j * n]!, n, kind);
  } else {
    const [x, y] = [vectorOf(vx, 'the x values'), vectorOf(vy, 'the y values')];
    if (x.rows !== y.rows) throw new EvalError('runtime', 'the x and y vectors differ in length');
    M = secondDerivatives(x.re, y.re, kind);
  }
  return column([0, 3, kind, ...M]);
}

/** A bspline as Mathcad returns it: the code 4 (whatever the degree), each interval's coefficients, and each interval's ends. */
function bsplineValue(vx: Value, vy: Value, u: Value, n: Value): Mat {
  const [x, y, b] = [vectorOf(vx, 'the x values'), vectorOf(vy, 'the y values'), vectorOf(u, 'the break points')];
  if (x.rows !== y.rows) throw new EvalError('runtime', 'the x and y vectors differ in length');
  const deg = requireReal(n, 'the degree');
  const { coef, ends } = bsplineFit(x.re, y.re, b.re, deg);
  return fromValues(3, 1, [num(4), column(coef), column(ends)]);
}

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

/** Lets an integral learn where an interpolated table has corners, so it can split there. */
export interface Hooks {
  interpolated?(xs: Float64Array, at: number): void;
  /** The next number in [0, 1) from the stream of the region being calculated. */
  random?(): number;
  /** A file the region being calculated wrote, to offer for saving. */
  wrote?(file: Written): void;
  /** The worksheet's TOL, which lookup and match compare within. */
  tol?(): number;
}

/**
 * Why a Mathcad file function is refused, and the MathMath expression that gives the same numbers (as Convert
 * writes it, src/engine/convert.ts), or what to do instead.
 */
function mathcadFileHint(name: string): string {
  const read = `${name} is Mathcad's, and reads a file on Mathcad's computer. In MathMath, attach the file with Files and use`;
  const convert = 'Convert, on the bar above the paper, changes it for you, or says why it can\'t yet.';
  const same: Record<string, string> = {
    READRGB: 'readImage("name"), which packs red, green and blue side by side the same way',
    READBMP: 'round(toGray(readImage("name"))): the same gray levels, rounded to whole numbers',
    READ_IMAGE: 'round(toGray(readImage("name"))): the same gray levels, rounded to whole numbers',
    READ_RED: 'imageChannels(readImage("name"), 0): channel 0, counted from ORIGIN, is red',
    READ_GREEN: 'imageChannels(readImage("name"), 1): channel 1, counted from ORIGIN, is green',
    READ_BLUE: 'imageChannels(readImage("name"), 2): channel 2, counted from ORIGIN, is blue',
    READ_HSV: 'rgbToHsv(readImage("name"), 360): hue in degrees, saturation and value 0 to 255, packed as Mathcad packs them',
    READ_HSV_HUE: 'imageChannels(rgbToHsv(readImage("name"), 360), 0): the hue, in degrees',
    READ_HSV_SAT: 'imageChannels(rgbToHsv(readImage("name"), 360), 1): the saturation, 0 to 255',
    READ_HSV_VALUE: 'imageChannels(rgbToHsv(readImage("name"), 360), 2): the value, 0 to 255',
    READ_HLS: 'rgbToHls(readImage("name"), 360): hue in degrees, lightness and saturation 0 to 255, packed as Mathcad packs them',
    READ_HLS_HUE: 'imageChannels(rgbToHls(readImage("name"), 360), 0): the hue, in degrees',
    READ_HLS_LIGHT: 'imageChannels(rgbToHls(readImage("name"), 360), 1): the lightness, 0 to 255',
    READ_HLS_SAT: 'imageChannels(rgbToHls(readImage("name"), 360), 2): the saturation, 0 to 255',
    READPRN: 'readTable("name"), which reads the same numbers when they are separated one way throughout, all by commas or all by spaces',
    GETWAVINFO: 'wavInfo("name"): channels, samples a second, bits per sample and bytes a second, the same four',
    READWAV: 'readWav("name"), which gives samples from −1 to 1: 32768·readWav("name") is Mathcad\'s numbers for a 16-bit file, and 128·readWav("name") + 128 for an 8-bit one',
  };
  if (same[name]) return `${read} ${same[name]}. ${convert}`;
  if (name === 'READFILE' || name === 'READ') return `${read} readTable("name") in its place.`;
  if (name === 'READBIN') return `${name} is Mathcad's, and reads a binary file on Mathcad's computer. MathMath can't read binary data files: save the data as text (CSV) and load it with Files on the toolbar, which adds readTable.`;
  if (MATHCAD_WRITES.has(name)) return `${name} writes a file when it's defined, as in Mathcad: ${name}("name")${name === 'WRITEWAV' ? ', with the samples a second and bits,' : ''} := M. The region then offers the file to save.`;
  return `${name} is Mathcad's, and writes a file on Mathcad's computer. MathMath doesn't write data files: copy the results from the sheet instead.`;
}

/** A vector for length and last: a column, as Mathcad requires. */
function columnOf(v: Value, fn: string): Mat {
  const m = requireMat(v, `${fn}'s argument`);
  if (m.cols !== 1) throw new EvalError('runtime', `${fn} takes a vector, one column: this has ${m.cols} columns`);
  return m;
}

/** The two square matrices of a generalized eigenproblem, as rows of numbers, with their units. */
function pencil(m: Value, n: Value, fn: string): { size: number; are: number[][]; aim: number[][] | null; bre: number[][]; bim: number[][] | null; mdim: Dim; ndim: Dim } {
  const a = requireMat(m, `${fn}'s M`);
  const b = requireMat(n, `${fn}'s N`);
  if (a.cells || b.cells) throw new EvalError('runtime', `${fn} takes matrices of numbers`);
  if (a.rows !== a.cols || b.rows !== b.cols) throw new EvalError('runtime', `${fn} needs square matrices`);
  if (a.rows !== b.rows) throw new EvalError('runtime', `${fn}'s M and N must be the same size`);
  const rows = (x: Mat, xs: Float64Array) => Array.from({ length: x.rows }, (_, i) => Array.from({ length: x.cols }, (_, j) => xs[j * x.rows + i]!));
  const complex = (x: Mat) => (x.im?.some((v) => v !== 0) ? rows(x, x.im) : null);
  const [aim, bim] = [complex(a), complex(b)];
  const both = aim || bim;
  const zero = () => rows(a, new Float64Array(a.rows * a.cols));
  return { size: a.rows, are: rows(a, a.re), aim: both ? aim ?? zero() : null, bre: rows(b, b.re), bim: both ? bim ?? zero() : null, mdim: a.dim, ndim: b.dim };
}

export function makeBuiltins(origin: number, files: Files = NO_FILES, hooks: Hooks = {}): Map<string, Fn> {
  const idx = (v: Value): number => Math.trunc(requireReal(v, 'index')) - origin;
  const next = (): number => (hooks.random ?? Math.random)();
  const count = (m: Value, fn: string): number => {
    const n = requireReal(m, `${fn}'s count`);
    if (!Number.isInteger(n) || n < 1) throw new EvalError('runtime', `${fn} needs a whole number of values, 1 or more`);
    return n;
  };

  const wavFile = (source: Value | undefined, fn: string): DecodedAudio => {
    if (source?.t !== 'str') throw new EvalError('runtime', `${fn} needs a file name in quotes`);
    const name = source.v;
    if (/[\\/]/.test(name)) throw new EvalError('runtime', `${fn} takes the name of an attached file, not a folder path`);
    const audio = files.audio(fileKey(name));
    if (audio === undefined) throw needsFile(name);
    if (typeof audio === 'string') throw new EvalError('runtime', `${name} can't be read: ${audio}`);
    return audio;
  };

  const table: Record<string, Impl> = {
    ...Object.fromEntries(Object.keys(ELEMENTARY).map((fn) => [fn, elementary(fn)])),
    csgn: scalar((x) => num(csgn([x.re, x.im]))),
    signum: scalar((x) => {
      const [re, im] = signum([x.re, x.im]);
      return num(re, NODIM, im);
    }),
    atan2: (a, b) => {
      const [x, y] = [requireNum(a), requireNum(b)];
      // Mathcad has no negative zero here: a stored result shows atan2(-1, -0) as +180 degrees.
      return num(Math.atan2(y.re + 0, x.re + 0));
    },
    angle: (a, b) => {
      const t = Math.atan2(requireReal(b), requireReal(a));
      return num(t < 0 ? t + 2 * Math.PI : t);
    },
    ln: scalar(complexLog),
    log: (a, b) => {
      const base = b ? Math.log(requireReal(b)) : Math.LN10;
      return scalar((x) => {
        const l = complexLog(x);
        return num(l.re / base, NODIM, l.im / base);
      })(a);
    },
    sqrt: scalar((x) => pow(x, num(0.5))),
    // Mathcad's Heaviside step, with Φ(0) = 1; Kronecker's δ(m, n); and Δ(x), Dirac's impulse as Mathcad 14
    // writes it in inverse Laplace transforms: 0 away from 0, infinite at 0.
    'Φ': scalar((x) => num(realOf(x, 'Φ') < 0 ? 0 : 1)),
    'δ': (m, n) => {
      if (n === undefined) throw new EvalError('runtime', "δ(m, n) is Kronecker's delta and takes two arguments. Dirac's impulse is Δ(x)");
      return num(requireReal(m!, "δ's first argument") === requireReal(n, "δ's second argument") ? 1 : 0);
    },
    'Δ': scalar((x) => num(realOf(x, 'Δ') === 0 ? Infinity : 0)),
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
    // A column vector only, as in Mathcad 14, which refuses a matrix or a row.
    length: (m) => num(columnOf(m, 'length').rows),
    last: (m) => num(columnOf(m, 'last').rows - 1 + origin),
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
        hooks.interpolated?.(xs.re, p.re);
        return num(interpolate(xs.re, ys.re, p.re), ys.dim);
      })(x!);
    },
    lsolve: (m, v) => lsolve(requireMat(m!), requireMat(v!)),
    rank: (m) => num(rref(rowsOf(requireMat(m!))).rank),
    rref: (m) => matOf(rref(rowsOf(requireMat(m!))).r),
    diag: (v) => {
      const d = vectorOf(v!, 'diag\'s argument');
      const out = newMat(d.rows, d.rows, d.dim);
      for (let i = 0; i < d.rows; i++) out.re[i + i * d.rows] = d.re[i]!;
      return out;
    },
    norm1: (m) => num(norm1(rowsOf(requireMat(m!))), requireMat(m!).dim),
    norm2: (m) => num(norm2(rowsOf(requireMat(m!))), requireMat(m!).dim),
    // The condition number in each norm: ‖M‖·‖M⁻¹‖, and for the 2-norm the ratio of extreme singular values.
    cond1: (m) => num(norm1(rowsOf(requireMat(m!))) * norm1(rowsOf(inverse(requireMat(m!))))),
    conde: (m) => num(norme(rowsOf(requireMat(m!))) * norme(rowsOf(inverse(requireMat(m!))))),
    condi: (m) => num(normi(rowsOf(requireMat(m!))) * normi(rowsOf(inverse(requireMat(m!))))),
    cond2: (m) => {
      const s = singularValues(rowsOf(requireMat(m!)));
      return num(s[0]! / s[s.length - 1]!);
    },
    svds: (m) => {
      const a = requireMat(m!);
      const out = newMat(Math.min(a.rows, a.cols), 1, a.dim);
      out.re.set(singularValues(rowsOf(a)));
      return out;
    },
    // U stacked on V, as Mathcad returns it.
    svd: (m) => {
      const { U, V } = singular(rowsOf(requireMat(m!)));
      return matOf([...U, ...V]);
    },
    // The generalized eigenproblem M·x = λ·N·x, as LAPACK 3.0's dggev or zggev solves it (qz.ts): Mathcad's order,
    // and vectors scaled so the largest |re| + |im| is 1. An infinite λ is the largest number, signed, as Mathcad gives it.
    genvals: (m, n) => {
      const p = pencil(m!, n!, 'genvals');
      const r = ggev(p.are, p.aim, p.bre, p.bim, 'none');
      return fromValues(p.size, 1, r.alphaRe.map((ar, k) => {
        const [ai, br, bi] = [r.alphaIm[k]!, r.betaRe[k]!, r.betaIm[k]!];
        const dim = dimDiv(p.mdim, p.ndim);
        // Probed: a real pencil's infinite λ is the largest number with α's sign, and 0/0 is 0; a complex pencil's is NaN.
        if (br === 0 && bi === 0) {
          if (p.aim) return num(NaN, dim, NaN);
          return num(ar === 0 ? 0 : Math.sign(ar) * Number.MAX_VALUE, dim);
        }
        const d = br * br + bi * bi;
        return num((ar * br + ai * bi) / d, dim, (ai * br - ar * bi) / d);
      }));
    },
    genvecs: (m, n, side) => {
      if (side !== undefined && (side.t !== 'str' || (side.v !== 'L' && side.v !== 'R'))) {
        throw new EvalError('runtime', 'genvecs\'s third argument is "L" for the left eigenvectors or "R" for the right ones');
      }
      const p = pencil(m!, n!, 'genvecs');
      const r = ggev(p.are, p.aim, p.bre, p.bim, side?.t === 'str' && side.v === 'L' ? 'left' : 'right');
      const items: Value[] = [];
      for (let j = 0; j < p.size; j++) for (let i = 0; i < p.size; i++) items.push(num(r.vre![i]![j]!, NODIM, r.vim?.[i]?.[j] ?? 0));
      return fromValues(p.size, p.size, items);
    },
    // s, U and Vᵀ as LAPACK 3.0's dgesvd or zgesvd gives them, signs included (svd.ts). Mathcad puts A's units on
    // all three; only the singular values carry them here, since U and V are rotations.
    svd2: (m) => {
      const a = requireMat(m!, "svd2's argument");
      if (a.cells) throw new EvalError('runtime', 'svd2 takes a matrix of numbers');
      if (a.rows < a.cols) throw new EvalError('runtime', 'svd2 needs at least as many rows as columns');
      const part = (xs: Float64Array) => Array.from({ length: a.rows }, (_, i) => Array.from({ length: a.cols }, (_, j) => xs[j * a.rows + i]!));
      const r = gesvd(part(a.re), a.im?.some((x) => x !== 0) ? part(a.im) : null);
      const matrix = (re: number[][], im: number[][] | null): Mat => {
        const items: Value[] = [];
        for (let j = 0; j < re[0]!.length; j++) for (let i = 0; i < re.length; i++) items.push(num(re[i]![j]!, NODIM, im ? im[i]![j]! : 0));
        return fromValues(re.length, re[0]!.length, items);
      };
      const s = fromValues(r.s.length, 1, r.s.map((x) => num(x, a.dim)));
      return fromValues(3, 1, [s, matrix(r.Ure, r.Uim), matrix(r.VTre, r.VTim)]);
    },
    geninv: (m) => geninv(requireMat(m!)),
    // P, L and U side by side, with P·M = L·U.
    lu: (m) => {
      const a = requireMat(m!);
      if (!isNoDim(a.dim)) throw new EvalError('runtime', 'lu needs a matrix without units');
      const { P, L, U } = luDecompose(a);
      return matOf(P.map((r, i) => [...r, ...L[i]!, ...U[i]!]));
    },
    qr: (m) => qr(requireMat(m!)),
    cholesky: (m) => cholesky(requireMat(m!)),
    eigenvecs: (m) => eigenvectors(requireMat(m!)),
    eigenvec: (m, z) => eigenvector(requireMat(m!), requireNum(z!)),
    lspline: (vx, vy) => splineVector(SPLINE_KINDS.lspline, vx!, vy!),
    pspline: (vx, vy) => splineVector(SPLINE_KINDS.pspline, vx!, vy!),
    cspline: (vx, vy) => splineVector(SPLINE_KINDS.cspline, vx!, vy!),
    bspline: (vx, vy, u, n) => bsplineValue(vx!, vy!, u!, n!),
    interp: (vs, vx, vy, x) => {
      const s = requireMat(vs!, 'the spline');
      // A regress vector: 3, 3, the degree, then the coefficients.
      if (!s.cells && s.rows > 3 && s.re[0] === 3 && s.re[1] === 3) return interpRegress(s, vx!, x!);
      const xs = requireMat(vx!, 'the x values');
      const ys = requireMat(vy!, 'the y values');
      // A bspline: its coefficients and interval ends are the second and third elements.
      if (s.cells) {
        const [coef, ends] = [requireMat(s.cells[1]!), requireMat(s.cells[2]!)];
        return scalar((p) => {
          // Its breaks are corners when the degree is low, so an integral splits there.
          hooks.interpolated?.(ends.re, p.re);
          return num(bsplineAt(coef.re, ends.re, p.re), ys.dim);
        })(x!);
      }
      const kind = s.re[2] as SplineKind;
      if (s.rows < 4 || ![0, 1, 2].includes(kind)) throw new EvalError('runtime', 'interp needs a vector from lspline, pspline, cspline, bspline or regress');
      const M = s.re.subarray(3);
      if (xs.cols === 2) {
        const n = xs.rows;
        const p = requireMat(x!, 'the point');
        if (p.rows * p.cols !== 2) throw new EvalError('runtime', 'a 2-D interp needs a point with two coordinates');
        if (M.length !== n * n) throw new EvalError('runtime', "the spline doesn't match these grid points");
        return num(spline2At(sliceCol(xs, 0), sliceCol(xs, 1), (i, j) => ys.re[i + j * n]!, M, kind, p.re[0]!, p.re[1]!), ys.dim);
      }
      if (M.length !== xs.rows || ys.rows !== xs.rows) throw new EvalError('runtime', "the spline doesn't match these x and y values");
      return scalar((p) => num(splineAt(xs.re, ys.re, M, p.re), ys.dim))(x!);
    },
    medsmooth: (vy, n) => {
      const y = vectorOf(vy!, 'the values');
      return column(medianSmooth(y.re, requireReal(n!, 'the window')), y.dim);
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
      // A missing file, as for readWav and readTable: the region waits for it, and the bar above the paper asks for it.
      if (!img) throw isWebAddress(name) ? new EvalError('runtime', `${name} isn't loaded in this worksheet. Load it with Files on the toolbar`) : needsFile(name);
      return imageMatrix(img);
    },
    // Mathcad's Fourier transforms, with its scaling and signs (see fourier.ts).
    fft: (v) => realForward(v!, 'fft'), FFT: (v) => realForward(v!, 'FFT'),
    ifft: (v) => realInverse(v!, 'ifft'), IFFT: (v) => realInverse(v!, 'IFFT'),
    cfft: (v) => complexTransform(v!, 'cfft'), icfft: (v) => complexTransform(v!, 'icfft'),
    CFFT: (v) => complexTransform(v!, 'CFFT'), ICFFT: (v) => complexTransform(v!, 'ICFFT'),
    // MathMath's own signal processing (see signal.ts).
    ...withArity({ convolve, correlate, ...windowFns, ...firFns, ...filterFns } as unknown as Record<string, Impl>),
    ...withArity({ ...iirFns, ...systemFns }),
    // Differential equations (see ode.ts).
    ...withArity(odeFns),
    ...withArity(fitFns),
    ...withArity(stringFns),
    ...withArity(lookupFns(() => origin, () => hooks.tol?.() ?? 0.001)),
    // Finance, as Mathcad's (see finance.ts).
    ...withArity(financeFns),
    // Coordinate conversions, log-spaced points and plot grids, as Mathcad's (see graphing.ts).
    ...withArity(graphingFns),
    // Smoothing, correlation and wavelets, as Mathcad's (see smoothing.ts).
    ...withArity(smoothingFns),
    ...withArity(scalingFns),
    ...withArity(bvpFns),
    ...withArity(specialFns(() => origin)),
    // Image processing (see image.ts).
    ...withArity({ ...imageFns, writeImage: (n, m) => writeImage(n!, m!, hooks.wrote) }),
    // One channel, counted from ORIGIN like a subscript, so imageChannels(M, 0) is the red of a color image.
    imageChannels: (m, k, ...rest) => {
      if (m === undefined || rest.length > 0) throw new EvalError('runtime', 'imageChannels takes an image and, if you want one channel, its number');
      const all = imageFns.imageChannels!(m);
      if (k === undefined) return all;
      const parts = all.t === 'mat' && all.cells ? all : fromValues(1, 1, [all]);
      const n = idx(k);
      if (!Number.isInteger(n) || n < 0 || n >= parts.rows) throw new EvalError('runtime', `imageChannels: this image has ${parts.rows} channel${parts.rows === 1 ? '' : 's'}, numbered from ${origin}`);
      return getEl(parts, n, 0);
    },
    // Channels, samples a second, bits per sample and bytes a second, as Mathcad's GETWAVINFO gives them.
    wavInfo: (source) => {
      const audio = wavFile(source, 'wavInfo');
      const bytes = audio.rate * audio.channels.length * (audio.bits / 8);
      return fromValues(4, 1, [num(audio.channels.length), num(audio.rate), num(audio.bits), num(bytes)]);
    },
    // Electrical engineering (see electrical.ts).
    ...withArity(electricalFns),
    // Circuit analysis of a netlist (see circuit.ts).
    ...withArity(circuitFns(origin)),
    // RF: reflection, lines and network parameters (see rf.ts).
    ...withArity(rfFns),
    // Probability distributions and the statistics beside mean and stdev (see distributions.ts).
    ...withArity(distributionFns(next)),
    readWav: (source) => {
      const audio = wavFile(source, 'readWav');
      const frames = audio.channels[0]?.length ?? 0;
      const m = newMat(frames, audio.channels.length);
      audio.channels.forEach((c, j) => m.re.set(c, j * frames));
      return m;
    },
    wavRate: (source) => num(wavFile(source, 'wavRate').rate, PER_SECOND),
    readTable: (source) => {
      if (source?.t !== 'str') throw new EvalError('runtime', 'readTable needs a file name in quotes');
      const name = source.v;
      if (/[\\/]/.test(name)) throw new EvalError('runtime', 'readTable takes the name of an attached file, not a folder path');
      const text = files.table(fileKey(name));
      if (text === undefined) throw needsFile(name);
      if (/\.xlsx?$/i.test(name)) throw new EvalError('unsupported', 'readTable reads text: save the spreadsheet as CSV and load that');
      return parseTable(text);
    },
    // A value on a boundary counts in the interval to its left; with a count of intervals, the smallest
    // value counts in the first. Mathcad 14's rules.
    hist: (bounds, data) => {
      const edges = flatten([requireMat(bounds)]).map((x) => x.re);
      const counts = new Float64Array(Math.max(0, edges.length - 1));
      for (const v of flatten([data!])) {
        for (let i = 0; i + 1 < edges.length; i++) {
          if (v.re > edges[i]! && v.re <= edges[i + 1]!) {
            counts[i]!++;
            break;
          }
        }
      }
      const out = newMat(counts.length, 1);
      out.re.set(counts);
      return out;
    },
    histogram: (count, data) => {
      const n = Math.trunc(requireReal(count, 'number of intervals'));
      if (n < 1) throw new EvalError('runtime', 'histogram needs at least one interval');
      const values = flatten([data!]);
      const xs = values.map((v) => v.re);
      let lo = Infinity;
      let hi = -Infinity;
      for (const x of xs) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      const width = (hi - lo) / n;
      const counts = new Array<number>(n).fill(0);
      for (const x of xs) counts[width > 0 ? Math.min(n - 1, Math.max(0, Math.ceil((x - lo) / width) - 1)) : 0]!++;
      const dim = values[0]?.dim;
      const cells: Value[] = [];
      for (let i = 0; i < n; i++) cells.push(num(lo + (i + 0.5) * width, dim));
      for (let i = 0; i < n; i++) cells.push(num(counts[i]!));
      return fromValues(n, 2, cells);
    },
    concat: (...a) => str(a.map((s) => (s.t === 'str' ? s.v : '')).join('')),
    strlen: (s) => num(s.t === 'str' ? s.v.length : 0),
    // A uniform number in [0, x), in x's units. On a vector, one for each element.
    rnd: (x) => scalar((v) => num(next() * requireReal(v, "rnd's argument"), v.dim))(x!),
    // m uniform numbers in [a, b), and m normal numbers with mean mu and standard deviation sigma.
    runif: (m, a, b) => {
      const [lo, hi] = [requireNum(a!), requireNum(b!)];
      compareReal(lo, hi);
      return column(Array.from({ length: count(m!, 'runif') }, () => lo.re + next() * (hi.re - lo.re)), lo.dim);
    },
    rnorm: (m, mu, sigma) => {
      const [mean, sd] = [requireNum(mu!), requireNum(sigma!)];
      if (sd.re < 0) throw new EvalError('runtime', "rnorm's standard deviation can't be negative");
      compareReal(mean, sd);
      return column(Array.from({ length: count(m!, 'rnorm') }, () => mean.re + sd.re * normal(next)), mean.dim);
    },
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
        throw new EvalError('mathcad', mathcadFileHint(name));
      },
    });
  }
  return out;
}

const KELVIN: Dim = [0, 0, 0, 0, 1, 0, 0];
const PER_SECOND: Dim = [0, 0, -1, 0, 0, 0, 0];

function keepTemp(v: Value, f: (x: number) => number): Value {
  return scalar((x) => num(f(x.re), KELVIN))(v);
}

function keepDimless(f: (x: number) => number): Impl {
  return scalar((x) => num(f(x.re)));
}
