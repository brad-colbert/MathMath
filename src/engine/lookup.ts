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
 * Lookup, number theory and rounding to a step, as probed in Mathcad 14.
 *
 * - lookup, hlookup, vlookup and match compare numbers within TOL, absolutely (2.0019 doesn't match 2 at TOL 0.001,
 *   and 1000.5 doesn't match 1000), and strings exactly. Matches come back as a column, in column order, even
 *   when there's one; none is an error. match gives indices from ORIGIN: for a matrix, a vector of (row, column).
 * - gcd and lcm take positive whole numbers, or arrays of them; 0 is refused, as in Mathcad.
 * - combin and permut take whole numbers 0 or more, with k ≤ n. (Mathcad 14's permut gives 0 once the answer is
 *   large, as permut(60, 30); MathMath gives the number.)
 * - Ceil, Floor, Round and Trunc(z, y) step by |y|, in z's units, and part by part for a complex z. Unlike
 *   ceil, floor, round and trunc, they read z/y to 15 significant digits first, so Floor(0.3, 0.1) is 0.3 though
 *   0.3/0.1 is 2.9999999999999996, and give the answer to 15 digits.
 */
import { EvalError, type Mat, type Num, type Value, dimEq, fromValues, getEl, isNoDim, newMat, num, requireMat } from './values.js';

type Impl = (...args: Value[]) => Value;

export const LOOKUP_ARITY: Record<string, [number, number]> = {
  lookup: [3, 3], hlookup: [3, 3], vlookup: [3, 3], match: [2, 2], gcd: [1, Infinity], lcm: [1, Infinity], combin: [2, 2], permut: [2, 2],
  Ceil: [2, 2], Floor: [2, 2], Round: [2, 2], Trunc: [2, 2],
};

/** Whether an element matches z: strings exactly, numbers within tol and in the same units. */
function same(z: Value, a: Value, tol: number): boolean {
  if (z.t === 'str' || a.t === 'str') return z.t === 'str' && a.t === 'str' && z.v === a.v;
  if (z.t !== 'num' || a.t !== 'num' || !dimEq(z.dim, a.dim)) return false;
  return Math.hypot(z.re - a.re, z.im - a.im) <= tol;
}

const NONE = (): EvalError => new EvalError('runtime', 'No matching values found.');

/** The values found, as a column vector. */
function found(items: Value[]): Mat {
  if (items.length === 0) throw NONE();
  return fromValues(items.length, 1, items);
}

function matrix(v: Value | undefined, fn: string, what: string): Mat {
  return requireMat(v!, `${fn}'s ${what}`);
}

function index(v: Value | undefined, fn: string, what: string, origin: number, size: number): number {
  const k = v?.t === 'num' && v.im === 0 && isNoDim(v.dim) ? v.re : NaN;
  if (!Number.isInteger(k) || k < origin || k >= origin + size) throw new EvalError('runtime', `${fn}'s ${what} must be a whole number from ${origin} to ${origin + size - 1}`);
  return k - origin;
}

/** Positive whole numbers, from scalars and arrays alike. */
function positives(args: Value[], fn: string): number[] {
  const out: number[] = [];
  const one = (v: Value): void => {
    if (v.t === 'mat') {
      for (let i = 0; i < v.rows; i++) for (let j = 0; j < v.cols; j++) one(getEl(v, i, j));
      return;
    }
    if (v.t !== 'num' || v.im !== 0) throw new EvalError('runtime', `${fn} takes whole numbers`);
    if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn} takes numbers without units`);
    if (!Number.isInteger(v.re) || v.re < 1) throw new EvalError('runtime', `${fn} takes positive whole numbers: 1, 2, 3…`);
    out.push(v.re);
  };
  args.forEach(one);
  return out;
}

const gcd2 = (a: number, b: number): number => {
  while (b) [a, b] = [b, a % b];
  return a;
};

function counts(n: Value | undefined, k: Value | undefined, fn: string): [number, number] {
  const get = (v: Value | undefined): number => {
    const x = v?.t === 'num' && v.im === 0 && isNoDim(v.dim) ? v.re : NaN;
    if (!Number.isInteger(x) || x < 0) throw new EvalError('runtime', `${fn} takes whole numbers, 0 or more`);
    return x;
  };
  const [N, K] = [get(n), get(k)];
  if (K > N) throw new EvalError('runtime', `${fn}(n, k) needs k no more than n`);
  return [N, K];
}

/** Rounds to 15 significant digits, as Mathcad reads z/y and writes the answer for the stepped rounding functions. */
const digits15 = (x: number): number => (Number.isFinite(x) && x !== 0 ? Number(x.toPrecision(15)) : x);

const ROUNDERS: Record<string, (q: number) => number> = {
  Ceil: Math.ceil,
  Floor: Math.floor,
  Trunc: Math.trunc,
  // Halves away from 0, as round.
  Round: (q) => Math.sign(q) * Math.round(Math.abs(q)),
};

/** Ceil, Floor, Round or Trunc(z, y): element by element for arrays, part by part for complex numbers. */
function stepped(fn: string, z: Value, y: Value): Value {
  const r = ROUNDERS[fn]!;
  const one = (a: Num, b: Num): Num => {
    if (b.im !== 0) throw new EvalError('runtime', `${fn}'s step must be real`);
    if (b.re === 0) throw new EvalError('runtime', `${fn}'s step can't be 0`);
    if (!dimEq(a.dim, b.dim)) throw new EvalError('runtime', `${fn}(z, y) needs y in z's units, as Ceil(x, ft) for a length`);
    const step = Math.abs(b.re);
    const part = (v: number): number => (v === 0 ? 0 : digits15(r(digits15(v / step)) * step));
    return num(part(a.re), a.dim, part(a.im));
  };
  const asNum = (v: Value, what: string): Num => {
    if (v.t !== 'num') throw new EvalError('runtime', `${fn}'s ${what} must be a number or an array of numbers`);
    return v;
  };
  if (z.t !== 'mat' && y.t !== 'mat') return one(asNum(z, 'value'), asNum(y, 'step'));
  const [zm, ym] = [z.t === 'mat' ? z : null, y.t === 'mat' ? y : null];
  const [rows, cols] = zm ? [zm.rows, zm.cols] : [ym!.rows, ym!.cols];
  if (zm && ym && (zm.rows !== ym.rows || zm.cols !== ym.cols)) throw new EvalError('runtime', `${fn}'s value and step arrays must be the same size`);
  const items: Value[] = [];
  for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) items.push(one(asNum(zm ? getEl(zm, i, j) : z, 'value'), asNum(ym ? getEl(ym, i, j) : y, 'step')));
  return fromValues(rows, cols, items);
}

export function lookupFns(origin: () => number, tol: () => number): Record<string, Impl> {
  return {
    lookup: (z, a, b) => {
      const [A, B] = [matrix(a, 'lookup', 'search array'), matrix(b, 'lookup', 'result array')];
      if (B.rows < A.rows || B.cols < A.cols) throw new EvalError('runtime', "lookup's result array must be at least as big as the array it searches");
      const items: Value[] = [];
      for (let j = 0; j < A.cols; j++) for (let i = 0; i < A.rows; i++) if (same(z!, getEl(A, i, j), tol())) items.push(getEl(B, i, j));
      return found(items);
    },
    hlookup: (z, a, r) => {
      const A = matrix(a, 'hlookup', 'matrix');
      const row = index(r, 'hlookup', 'row', origin(), A.rows);
      const items: Value[] = [];
      for (let j = 0; j < A.cols; j++) if (same(z!, getEl(A, 0, j), tol())) items.push(getEl(A, row, j));
      return found(items);
    },
    vlookup: (z, a, c) => {
      const A = matrix(a, 'vlookup', 'matrix');
      const col = index(c, 'vlookup', 'column', origin(), A.cols);
      const items: Value[] = [];
      for (let i = 0; i < A.rows; i++) if (same(z!, getEl(A, i, 0), tol())) items.push(getEl(A, i, col));
      return found(items);
    },
    match: (z, a) => {
      const A = matrix(a, 'match', 'array');
      const o = origin();
      const items: Value[] = [];
      for (let j = 0; j < A.cols; j++) {
        for (let i = 0; i < A.rows; i++) {
          if (!same(z!, getEl(A, i, j), tol())) continue;
          if (A.cols === 1) items.push(num(i + o));
          else {
            const at = newMat(2, 1);
            at.re.set([i + o, j + o]);
            items.push(at);
          }
        }
      }
      return found(items);
    },
    gcd: (...args) => num(positives(args, 'gcd').reduce(gcd2)),
    lcm: (...args) => num(positives(args, 'lcm').reduce((a, b) => (a / gcd2(a, b)) * b)),
    combin: (n, k) => {
      const [N, K] = counts(n, k, 'combin');
      const r = Math.min(K, N - K);
      let c = 1;
      for (let i = 1; i <= r; i++) c = (c * (N - r + i)) / i;
      return num(Math.round(c) === c || c > 2 ** 53 ? c : Math.round(c));
    },
    permut: (n, k) => {
      const [N, K] = counts(n, k, 'permut');
      let p = 1;
      for (let i = 0; i < K; i++) p *= N - i;
      return num(p);
    },
    ...Object.fromEntries(Object.keys(ROUNDERS).map((fn) => [fn, (z: Value, y: Value) => stepped(fn, z, y)])),
  };
}


