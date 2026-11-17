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
 * Vector field plots: an arrow at each point. As Mathcad 14 draws them (probed 2026-11-16): a matrix of complex
 * numbers, real part across and imaginary part up, with row i at x = i and column j at y = j, counted from ORIGIN;
 * or two matrices of the same size, the across and up parts, typed X, Y (or as a vector of the two). A real matrix points every arrow
 * across, and units are dropped. Each arrow is the vector divided by the longest, times the grid step, so the
 * longest reaches the next point; an arrow of length 0 is a dot. Mathcad refuses a function; MathMath also takes
 * F(x, y) giving a 2-vector or a complex number, sampled over the plot's x and y limits as a surface's function is,
 * and arrows in space from six arrays X, Y, Z, U, V, W: the points, then the parts of the arrow at each.
 */
import { EvalError, type Mat, type Value, getEl, num, requireNum } from './values.js';

export interface FieldData {
  /** 2 for arrows in the plane, 3 for arrows in space. */
  dims: 2 | 3;
  /** Each arrow's tail, and its parts as given; z and w are zero in the plane. */
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  u: Float64Array;
  v: Float64Array;
  w: Float64Array;
  /** What each part is multiplied by to draw it: the step between neighbouring points over the longest arrow. */
  scale: number;
  /** The points' spacing that set the scale. */
  step: number;
  /** A function sampled over the plot's limits, rather than data. */
  sampled: boolean;
  /** Rows or columns were skipped to keep the arrows readable: every this many are drawn. */
  every: number;
}

/** Arrows a side, at most: a bigger matrix draws every second row and column, or every third… */
export const MAX_SIDE = 40;
/** Points a side when a function of x and y is sampled. */
export const FIELD_SAMPLES = 15;
/** Arrows in space, at most. */
export const MAX_ARROWS = 4000;

const real = (x: Value, what: string): number => {
  const n = requireNum(x, what);
  if (n.im !== 0) throw new EvalError('runtime', `${what} must be real`);
  return n.re;
};

/** The longest arrow, for the scale; 0 when every arrow is. */
function longest(u: Float64Array, v: Float64Array, w: Float64Array): number {
  let big = 0;
  for (let k = 0; k < u.length; k++) {
    const l = Math.hypot(u[k]!, v[k]!, w[k]!);
    if (Number.isFinite(l) && l > big) big = l;
  }
  return big;
}

function finish(dims: 2 | 3, x: Float64Array, y: Float64Array, z: Float64Array, u: Float64Array, v: Float64Array, w: Float64Array, step: number, sampled: boolean, every: number): FieldData {
  const big = longest(u, v, w);
  return { dims, x, y, z, u, v, w, scale: big > 0 ? step / big : 0, step, sampled, every };
}

/** A grid of arrows from a matrix of complex numbers, or from the across and up parts as two matrices. */
function grid(across: Mat, up: Mat | null, origin: number): FieldData {
  const [rows, cols] = [across.rows, across.cols];
  if (up && (up.rows !== rows || up.cols !== cols)) throw new EvalError('runtime', 'X and Y must be the same size');
  if (across.cells && !up) throw new EvalError('runtime', 'A vector field needs a matrix of numbers, or two matrices X, Y of its parts');
  const every = Math.max(1, Math.ceil(Math.max(rows, cols) / MAX_SIDE));
  const [nr, nc] = [Math.ceil(rows / every), Math.ceil(cols / every)];
  const n = nr * nc;
  const [x, y, z, u, v, w] = [0, 0, 0, 0, 0, 0].map(() => new Float64Array(n)) as Float64Array[];
  let k = 0;
  for (let j = 0; j < cols; j += every) {
    for (let i = 0; i < rows; i += every) {
      x![k] = i + origin;
      y![k] = j + origin;
      if (up) {
        u![k] = real(getEl(across, i, j), 'each part of a vector field');
        v![k] = real(getEl(up, i, j), 'each part of a vector field');
      } else {
        const e = requireNum(getEl(across, i, j), 'each arrow');
        u![k] = e.re;
        v![k] = e.im;
      }
      k++;
    }
  }
  return finish(2, x!, y!, z!, u!, v!, w!, every, false, every);
}

/** Arrows in space: six arrays of the same size, the points and then the parts. */
function space(cells: Value[]): FieldData {
  const arrays = cells.map((c) => {
    if (c.t === 'num') return [c];
    if (c.t !== 'mat' || c.cells) throw new EvalError('runtime', 'Arrows in space need six arrays of numbers X, Y, Z, U, V, W: the points, then each arrow\'s parts');
    return Array.from({ length: c.rows * c.cols }, (_, k) => getEl(c, k % c.rows, Math.floor(k / c.rows)));
  });
  const n = arrays[0]!.length;
  if (arrays.some((a) => a.length !== n)) throw new EvalError('runtime', 'The six arrays of arrows in space must be the same size');
  if (n > MAX_ARROWS) throw new EvalError('runtime', `That is ${n} arrows; a plot draws up to ${MAX_ARROWS}`);
  const [x, y, z, u, v, w] = arrays.map((a) => Float64Array.from(a, (e) => real(e, 'each value'))) as Float64Array[];
  return finish(3, x!, y!, z!, u!, v!, w!, typicalSpacing(x!, y!, z!), false, 1);
}

/**
 * How far apart neighbouring points typically are: the median distance from a point to its nearest other, over up to
 * 500 points spread through the list. On a grid, that is the grid step, so scattered points get the scale a grid would.
 */
export function typicalSpacing(x: Float64Array, y: Float64Array, z: Float64Array): number {
  const n = x.length;
  if (n < 2) return 1;
  const near: number[] = [];
  // The median needs only an even sample of points, each against all the others.
  const every = Math.max(1, Math.ceil(n / 500));
  for (let a = 0; a < n; a += every) {
    let best = Infinity;
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const d = Math.hypot(x[a]! - x[b]!, y[a]! - y[b]!, z[a]! - z[b]!);
      if (d > 0 && d < best) best = d;
    }
    if (Number.isFinite(best)) near.push(best);
  }
  if (near.length === 0) return 1;
  near.sort((p, q) => p - q);
  return near[Math.floor(near.length / 2)]!;
}

/** A function of x and y, giving a 2-vector or a complex number, sampled over [x0, x1] × [y0, y1]. */
function sampled(f: (x: number, y: number) => Value, x0: number, x1: number, y0: number, y1: number): FieldData {
  const g = FIELD_SAMPLES;
  const n = g * g;
  const [x, y, z, u, v, w] = [0, 0, 0, 0, 0, 0].map(() => new Float64Array(n)) as Float64Array[];
  const [dx, dy] = [(x1 - x0) / (g - 1), (y1 - y0) / (g - 1)];
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      const k = i + j * g;
      x![k] = x0 + dx * i;
      y![k] = y0 + dy * j;
      const out = f(x![k]!, y![k]!);
      if (out.t === 'num') {
        u![k] = out.re;
        v![k] = out.im;
      } else if (out.t === 'mat' && out.rows * out.cols === 2) {
        u![k] = real(getEl(out, 0, 0), 'the function\'s value');
        v![k] = real(out.rows === 2 ? getEl(out, 1, 0) : getEl(out, 0, 1), 'the function\'s value');
      } else {
        throw new EvalError('runtime', 'A vector field\'s function must give a vector of two parts, or a complex number');
      }
    }
  }
  // Arrows are drawn in the plot's own units, so the step that fits both ways is the smaller.
  return finish(2, x!, y!, z!, u!, v!, w!, Math.min(dx, dy), true, 1);
}

/**
 * The arrows a vector field plot of `value` draws. `limits` give where a function of x and y is sampled, and
 * `origin` is ORIGIN, where a matrix's rows and columns are counted from.
 */
export function fieldOf(value: Value, origin: number, limits: { x0: number; x1: number; y0: number; y1: number }): FieldData {
  if (value.t === 'fn') {
    const { x0, x1, y0, y1 } = limits;
    if (!(x1 > x0) || !(y1 > y0)) throw new EvalError('runtime', 'Each axis needs its upper limit above its lower one');
    return sampled((x, y) => value.call([num(x), num(y)]), x0, x1, y0, y1);
  }
  if (value.t === 'mat' && value.cells && value.rows * value.cols === 2) {
    const [a, b] = value.cells as [Value, Value];
    if (a.t !== 'mat' || b.t !== 'mat') throw new EvalError('runtime', 'A vector field from two parts needs two matrices X, Y');
    return grid(a, b, origin);
  }
  if (value.t === 'mat' && value.cells && value.rows * value.cols === 6) return space(value.cells);
  if (value.t === 'mat') return grid(value, null, origin);
  throw new EvalError('runtime', 'A vector field needs a matrix of complex numbers, two matrices X, Y of its parts, a function of x and y giving two parts, or six arrays X, Y, Z, U, V, W for arrows in space');
}
