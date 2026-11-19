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

/** Exponents of length, mass, time, current, temperature, substance, luminous intensity. */
export type Dim = readonly number[];
export const NODIM: Dim = [0, 0, 0, 0, 0, 0, 0];

/** `mathcad`: a Mathcad feature to replace. `needs-file`: a file the sheet reads isn't attached. */
export type ErrorKind = 'unsupported' | 'undefined' | 'undefined-function' | 'runtime' | 'excluded' | 'mathcad' | 'needs-file';

/** A failed evaluation. `reason` is what the scoreboard groups by, so keep it stable and short. */
export class EvalError extends Error {
  constructor(public kind: ErrorKind, public reason: string, public needs: string[] = []) {
    super(`${kind}: ${reason}`);
  }
}

/** A file to load, named so a reference can list everything its sheet still needs. */
export const needsFile = (name: string): EvalError =>
  new EvalError('needs-file', `${name} isn't attached to this worksheet. Load it with Files on the toolbar`, [name]);

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
  /** Counts changes made in place, so anything cached from the matrix can tell it's out of date. */
  version?: number;
}
export interface Range { t: 'range'; first: number; step: number; last: number; dim: Dim }
export interface Fn { t: 'fn'; name: string; call: (args: Value[]) => Value; arity?: number }
export interface Failed { t: 'failed'; error: EvalError }
export type Value = Num | Str | Mat | Range | Fn | Failed;

export const num = (re: number, dim: Dim = NODIM, im = 0): Num => ({ t: 'num', re, im, dim });
/** A string, held to MAX_ELEMENTS characters: built up in a loop, one would soon fill the page's memory. */
export function checkString(length: number): void {
  if (length > MAX_ELEMENTS) throw new EvalError('runtime', `A string can have at most ${countText(MAX_ELEMENTS)} characters, and this one would have ${countText(length)}. MathMath stops there to keep within the page's memory`);
}
export const str = (v: string): Str => {
  checkString(v.length);
  return { t: 'str', v };
};

/**
 * The most elements an array may have, and the most values range variables may give a region at once: 80 MB of
 * numbers. A worksheet asking for more, as one shared from anywhere might, would run the page out of memory, which
 * ends the tab, on a phone especially, before Esc can stop the calculation.
 */
export const MAX_ELEMENTS = 10_000_000;
/** A count as written in a message: 10,000,000, or 1.2e+15 when it's far past that. */
export const countText = (n: number): string => (n < 1e15 ? Math.round(n).toLocaleString('en-US') : n.toExponential(1));
/** Refuses an array of more than MAX_ELEMENTS elements, before any memory is taken for it. */
export function checkElements(n: number): void {
  if (n > MAX_ELEMENTS) throw new EvalError('runtime', `An array can have at most ${countText(MAX_ELEMENTS)} elements, and this one would have ${countText(n)}. MathMath stops there to keep within the page's memory`);
}
/**
 * The most elements an array may have when it holds strings, arrays, or numbers in different units: each is an
 * object of its own, about ten times the memory of a plain number.
 */
export const MAX_CELLS = 1_000_000;
function checkCells(n: number): void {
  if (n > MAX_CELLS) throw new EvalError('runtime', `An array holding strings, arrays or values in different units can have at most ${countText(MAX_CELLS)} elements, and this one would have ${countText(n)}. MathMath stops there to keep within the page's memory`);
}

/** Refuses a number of points or steps past MAX_ELEMENTS, as each is a row of the answer. */
export function checkPoints(n: number, fn: string, what: string): void {
  if (n > MAX_ELEMENTS) throw new EvalError('runtime', `${fn}'s ${what} can be at most ${countText(MAX_ELEMENTS)}, not ${countText(n)}, to keep within the page's memory`);
}

export const newMat = (rows: number, cols: number, dim: Dim = NODIM): Mat => {
  checkElements(rows * cols);
  return { t: 'mat', rows, cols, re: new Float64Array(rows * cols), im: null, dim, cells: null };
};

export const dimEq = (a: Dim, b: Dim): boolean => a === b || a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);
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
  checkCells(m.rows * m.cols);
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

/**
 * A column vector built a value at a time, as fromValues builds one from them all, without keeping each value as
 * an object till the end: ten million numbers are 80 MB here, and a gigabyte as separate values.
 */
export class ColumnBuilder {
  private m: Mat = newMat(16, 1);
  length = 0;

  /** `expected`, when known, is how many values will come, for a refusal to give the whole size. */
  constructor(private expected?: number) {}

  push(v: Value): void {
    if (this.length === this.m.rows) this.grow();
    setEl(this.m, this.length++, 0, v);
  }

  private grow(): void {
    const m = this.m;
    const rows = Math.max(m.rows + 1, Math.min(2 * m.rows, MAX_ELEMENTS));
    const re = new Float64Array(rows);
    re.set(m.re);
    m.re = re;
    if (m.im) {
      const im = new Float64Array(rows);
      im.set(m.im);
      m.im = im;
    }
    if (m.cells) {
      checkCells(Math.max(this.length + 1, this.expected ?? 0));
      for (let n = m.rows; n < rows; n++) m.cells.push(num(0, m.dim));
    }
    m.rows = rows;
  }

  /** The vector of the values pushed. */
  build(): Mat {
    const { m, length } = this;
    return { t: 'mat', rows: length, cols: 1, re: m.re.slice(0, length), im: m.im ? m.im.slice(0, length) : null, dim: m.dim, cells: m.cells ? m.cells.slice(0, length) : null };
  }
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
  if (m.cells) {
    checkCells(rows * cols);
    c.cells = Array.from({ length: rows * cols }, () => num(0));
  }
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

const ROOMY = new WeakSet<ArrayBufferLike>();

/**
 * Lengthens a column vector in place, to `rows`. Its numbers sit at the start of a buffer with room to spare,
 * which doubles when it fills, so filling a vector one element at a time costs about as much as filling it at
 * once rather than copying it every time. New elements are zero.
 */
export function growColumn(m: Mat, rows: number): void {
  if (m.cols !== 1 || rows <= m.rows) throw new Error('growColumn lengthens a column vector');
  checkElements(rows);
  const grow = (a: Float64Array): Float64Array => {
    // Only room this made: a buffer from anywhere else might hold another array's numbers past this one's.
    if (ROOMY.has(a.buffer) && a.byteOffset === 0 && a.buffer.byteLength >= rows * 8) return new Float64Array(a.buffer, 0, rows);
    const buffer = new ArrayBuffer(Math.max(rows, 2 * a.length, 16) * 8);
    ROOMY.add(buffer);
    const room = new Float64Array(buffer, 0, rows);
    room.set(a);
    return room;
  };
  if (m.cells) {
    for (let i = m.rows; i < rows; i++) m.cells.push(num(0));
  }
  m.re = grow(m.re);
  if (m.im) m.im = grow(m.im);
  m.rows = rows;
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
