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
import { eigenvalues } from '../src/engine/eigen.js';
import { newMat } from '../src/engine/values.js';

/** Mathcad 14's eigenvals for twelve matrices, from a probe sheet: [name, matrix by rows, [re, im] in its order]. */
const REFERENCE = JSON.parse(readFileSync(new URL('./eigen-reference.json', import.meta.url), 'utf8')) as [string, number[][], [number, number][]][];

const ours = (rows: number[][]): [number, number][] => {
  const n = rows.length;
  const m = newMat(n, n);
  rows.forEach((r, i) => r.forEach((x, j) => (m.re[i + j * n] = x)));
  const e = eigenvalues(m);
  return [...e.re].map((x, i) => [x, e.im ? e.im[i]! : 0]);
};

describe("eigenvals in Mathcad 14's order, which is LAPACK's", () => {
  // K, symmetric and tridiagonal, is the one where Mathcad's order differs from LAPACK's, and so from ours.
  test.each(REFERENCE.filter(([name]) => name !== 'K'))('%s', (_, rows, want) => {
    const got = ours(rows);
    got.forEach(([re, im], i) => {
      expect(re).toBeCloseTo(want[i]![0], 9);
      expect(im).toBeCloseTo(want[i]![1], 9);
    });
  });
  test('K has the same eigenvalues, in another order', () => {
    const [, rows, want] = REFERENCE.find(([name]) => name === 'K')!;
    const sorted = (v: [number, number][]) => v.map(([re]) => re).sort((a, b) => a - b);
    sorted(ours(rows)).forEach((x, i) => expect(x).toBeCloseTo(sorted(want)[i]!, 9));
  });
  test('isolated eigenvalues of a triangular matrix come in the order the balancing leaves them, as in Mathcad', () => {
    expect(ours([[3, 0, 0], [1, -1, 0], [2, 4, 6]]).map(([re]) => +re.toFixed(9))).toEqual([6, -1, 3]);
  });
});
