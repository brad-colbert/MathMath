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

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { type Dim, type Mat, type Value, fromValues, getEl, num, str } from '../src/engine/values.js';

// genvals, genvecs and svd2 as a worksheet calls them, against Mathcad 14's answers (the same reference files the
// LAPACK ports are tested on, test/genvals.test.ts and test/svd2.test.ts).
type Entry = number | [number, number];
const GEN = JSON.parse(readFileSync(new URL('./genvals-reference.json', import.meta.url), 'utf8')) as { cases: { label: string; M: Entry[][]; N: Entry[][]; genvals: Entry[][]; genvecs: Entry[][]; genvecsL?: Entry[][] }[] };
const SVD = JSON.parse(readFileSync(new URL('./svd2-reference.json', import.meta.url), 'utf8')) as { cases: { label: string; A: Entry[][]; s: Entry[][]; U: Entry[][]; VT: Entry[][] }[] };
const B = makeBuiltins(0);
const call = (name: string, ...args: Value[]): Value => B.get(name)!.call(args);
const LENGTH: Dim = [1, 0, 0, 0, 0, 0, 0];
const TIME: Dim = [0, 0, 1, 0, 0, 0, 0];
const parts = (e: Entry): [number, number] => (typeof e === 'number' ? [e, 0] : e);
const mat = (rows: Entry[][], dim?: Dim): Mat => {
  const items: Value[] = [];
  for (let j = 0; j < rows[0]!.length; j++) for (let i = 0; i < rows.length; i++) items.push(num(parts(rows[i]![j]!)[0], dim, parts(rows[i]![j]!)[1]));
  return fromValues(rows.length, rows[0]!.length, items);
};
function same(got: Value, want: Entry[][], what: string, rel = false): void {
  expect(got.t, what).toBe('mat');
  const m = got as Mat;
  expect([m.rows, m.cols], what).toEqual([want.length, want[0]!.length]);
  for (let i = 0; i < m.rows; i++) {
    for (let j = 0; j < m.cols; j++) {
      const v = getEl(m, i, j) as { re: number; im: number };
      const [re, im] = parts(want[i]![j]!);
      const tol = rel ? 1e-11 * Math.max(1, Math.abs(re), Math.abs(im)) : 1e-9;
      expect(Math.abs(v.re - re) <= tol && Math.abs(v.im - im) <= tol, `${what} [${i},${j}]: ${v.re}${v.im ? `+${v.im}i` : ''} vs ${re}${im ? `+${im}i` : ''}`).toBe(true);
    }
  }
}

describe('genvals and genvecs as Mathcad 14 gives them', () => {
  for (const c of GEN.cases) {
    test(c.label, () => {
      same(call('genvals', mat(c.M), mat(c.N)), c.genvals, 'genvals', true);
      same(call('genvecs', mat(c.M), mat(c.N)), c.genvecs, 'genvecs');
      same(call('genvecs', mat(c.M), mat(c.N), str('R')), c.genvecs, 'genvecs R');
      if (c.genvecsL) same(call('genvecs', mat(c.M), mat(c.N), str('L')), c.genvecsL, 'genvecs L');
    });
  }
  test('the values are in M\'s units over N\'s, and the vectors have none', () => {
    const c = GEN.cases[0]!;
    const v = call('genvals', mat(c.M, LENGTH), mat(c.N, TIME)) as Mat;
    expect(v.dim).toEqual([1, 0, -1, 0, 0, 0, 0]);
    same(v, c.genvals, 'genvals with units', true);
    expect((call('genvecs', mat(c.M, LENGTH), mat(c.N, TIME)) as Mat).dim.every((d) => d === 0)).toBe(true);
  });
  test('a complex pencil\'s infinite eigenvalue is NaN, as Mathcad gives it', () => {
    const N = mat([[1, 0], [0, 0]]);
    for (const [M, first] of [[mat([[[1, 1], 2], [0, [3, -1]]]), [1, 1]], [mat([[[0, 2], 1], [0, [0, -3]]]), [0, 2]]] as const) {
      const v = call('genvals', M, N) as Mat;
      const [a, b] = [getEl(v, 0, 0) as { re: number; im: number }, getEl(v, 1, 0) as { re: number; im: number }];
      expect([a.re, a.im]).toEqual(first);
      expect(Number.isNaN(b.re) && Number.isNaN(b.im)).toBe(true);
    }
    same(call('genvecs', mat([[[1, 1], 2], [0, [3, -1]]]), N), [[1, 0], [0, 1]], 'genvecs');
  });
  test('what is refused', () => {
    const sq = mat([[1, 2], [3, 4]]);
    expect(() => call('genvals', mat([[1, 2, 3], [4, 5, 6]]), sq)).toThrow(/square/);
    expect(() => call('genvals', sq, mat([[1, 0, 0], [0, 1, 0], [0, 0, 1]]))).toThrow(/same size/);
    expect(() => call('genvecs', sq, sq, str('x'))).toThrow(/"L"/);
    expect(() => call('genvecs', sq, sq, str('l'))).toThrow(/"L"/);
  });
});

describe('svd2 as Mathcad 14 gives it', () => {
  for (const c of SVD.cases) {
    test(c.label, () => {
      const r = call('svd2', mat(c.A)) as Mat;
      expect([r.rows, r.cols]).toEqual([3, 1]);
      same(getEl(r, 0, 0), c.s, 's', true);
      same(getEl(r, 1, 0), c.U, 'U');
      same(getEl(r, 2, 0), c.VT, 'Vᵀ');
    });
  }
  test('the singular values take A\'s units, and U and Vᵀ none', () => {
    const r = call('svd2', mat(SVD.cases[0]!.A, LENGTH)) as Mat;
    expect((getEl(r, 0, 0) as Mat).dim).toEqual(LENGTH);
    expect((getEl(r, 1, 0) as Mat).dim.every((d) => d === 0)).toBe(true);
    expect((getEl(r, 2, 0) as Mat).dim.every((d) => d === 0)).toBe(true);
  });
  test('a matrix wider than tall is refused', () => {
    expect(() => call('svd2', mat([[1, 2, 3], [4, 5, 6]]))).toThrow(/rows/);
  });
});
