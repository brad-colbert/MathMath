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

import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import { makeBuiltins } from '../src/engine/builtins.js';
import { type Mat, type Value, getEl } from '../src/engine/values.js';
import { WHOLE_NAMES } from '../src/engine/vectorize.js';
import { readRegion } from '../src/latex/region.js';
import { emptyWorksheet } from '../src/format/native.js';
import { ENTRIES } from '../src/help/index.js';

/** The last region's value, or its error as a thrown Error. */
function last(...lines: string[]): Value {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  const out = runWorksheet(ws).at(-1)!;
  if (out.error) throw new Error(out.error.reason);
  return out.value!;
}
/** A value as plain numbers, nested arrays as nested lists, rounded to 12 places. */
const plain = (v: Value): unknown => {
  if (v.t === 'num') return Math.round(v.re * 1e12) / 1e12;
  if (v.t !== 'mat') return v.t;
  const m = v as Mat;
  return Array.from({ length: m.rows }, (_, i) => Array.from({ length: m.cols }, (_, j) => plain(getEl(m, i, j))));
};
const call = (f: string, ...a: string[]): string => `\\mathrm{${f}}\\left(${a.join(',')}\\right)`;
const col = (...a: number[]): string => `\\begin{pmatrix}${a.join('\\\\')}\\end{pmatrix}`;
const vec = (e: string): string => `\\overrightarrow{${e}}=`;
const V = `v\\coloneq ${col(1, -2, 3)}`;
const A = `a\\coloneq ${col(1, 2, 3)}`;
const B = `b\\coloneq ${col(4, 5, 6)}`;
const W = `w\\coloneq ${col(4, 5)}`;
const F = 'f\\left(x,y\\right)\\coloneq \\mathrm{augment}\\left(x,y\\right)';

describe('the vectorize arrow', () => {
  test('a built-in that takes an array takes it whole: →(v / max(v)) divides by the largest', () => {
    expect(plain(last(V, vec(`\\frac{v}{${call('max', 'v')}}`)))).toEqual([[0.333333333333], [-0.666666666667], [1]]);
    expect(plain(last(V, vec(`\\left|v-${call('mean', 'v')}\\right|`)))).toEqual([[0.333333333333], [2.666666666667], [2.333333333333]]);
    expect(plain(last(V, vec(call('length', 'v'))))).toBe(3);
  });

  test('as the older format saved them: →reverse, →A/reverse(A) and →augment(a, b)', () => {
    expect(plain(last(A, vec(call('reverse', 'a'))))).toEqual([[3], [2], [1]]);
    expect(plain(last(A, vec(`\\frac{a}{${call('reverse', 'a')}}`)))).toEqual([[0.333333333333], [1], [3]]);
    expect(plain(last(A, B, vec(call('augment', 'a', 'b'))))).toEqual([[1, 4], [2, 5], [3, 6]]);
    expect(() => last(B, vec(call('augment', '2', 'b')))).toThrow(/rows/);
  });

  test("the sheet's own functions go element by element, a number beside an array going to each", () => {
    expect(plain(last(A, B, F, vec('f\\left(a,b\\right)')))).toEqual([[[[1, 4]]], [[[2, 5]]], [[[3, 6]]]]);
    expect(plain(last(B, F, vec('f\\left(2,b\\right)')))).toEqual([[[[2, 4]]], [[[2, 5]]], [[[2, 6]]]]);
  });

  test('functions of numbers go element by element, and arrays under the arrow must be one size', () => {
    expect(plain(last(B, vec(call('mod', 'b', '4'))))).toEqual([[0], [1], [2]]);
    expect(() => last(A, W, F, vec('f\\left(a,w\\right)'))).toThrow(/sizes do not match/);
  });

  test('the point looked up or interpolated at goes element by element, the table whole', () => {
    expect(plain(last(A, B, vec(call('linterp', 'a', 'b', col(1.5, 2.5)))))).toEqual([[4.5], [5.5]]);
    expect(plain(last(A, B, vec(call('lookup', col(2, 3), 'a', 'b'))))).toEqual([[[[5]]], [[[6]]]]);
  });

  test('a coordinate change takes one vector whole, or numbers element by element', () => {
    expect(plain(last(vec(call('xy2pol', col(3, 4)))))).toEqual([[5], [0.927295218002]]);
    expect((plain(last(A, B, vec(call('xy2pol', 'a', 'b')))) as unknown[])[0]).toEqual([[[4.123105625618], [1.325817663668]]]);
  });
});

describe('which built-ins take arrays whole', () => {
  // Help groups whose functions work on arrays: each one's arguments go in whole, unless the list says which.
  const ARRAY_GROUPS = new Set(['Vectors and matrices', 'Linear algebra', 'Statistics', 'Interpolation and fitting', 'Solving',
    'Differential equations', 'Plots and coordinates', 'Fourier transforms', 'Signal processing', 'Filters and systems', 'Images', 'Files', 'Circuits']);
  // Functions in the other groups that take an array all the same.
  const ARRAYS_ELSEWHERE = ['sum', 'gcd', 'lcm', 'IsArray', 'IsScalar', 'IsString', 'SIUnitsOf', 'UnitsOf', 'error', 'trace', 'pause', 'DMS',
    'vec2str', 'npv', 'irr', 'mirr', 'fvadj', 'fvc', 'sToZ', 'zToS', 'sToY', 'yToS', 'zToY', 'yToZ', 'sToAbcd', 'abcdToS', 'zToAbcd', 'abcdToZ',
    'yToAbcd', 'abcdToY'];

  test('every function in an array group is listed, and nothing else but the known few', () => {
    const want = new Set(ARRAYS_ELSEWHERE);
    for (const e of ENTRIES) if (ARRAY_GROUPS.has(e.group)) for (const n of [e.name, ...(e.also ?? [])]) want.add(n);
    expect([...WHOLE_NAMES].sort()).toEqual([...want].sort());
  });

  test('every name listed is a built-in, or a form the evaluator works out itself', () => {
    const builtins = makeBuiltins(() => 0);
    const forms = new Set(['until', 'Find', 'Minerr', 'Maximize', 'Minimize', 'Odesolve', 'root', 'Pdesolve', 'Jacob', 'SaveColormap', 'LoadColormap']);
    expect(WHOLE_NAMES.filter((n) => !builtins.has(n) && !forms.has(n))).toEqual([]);
  });
});
