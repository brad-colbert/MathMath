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
import { eigenvectors } from '../src/engine/linalg.js';
import { type Mat, newMat } from '../src/engine/values.js';

/** Mathcad 14's eigenvals for twelve matrices, from a probe sheet: [name, matrix by rows, [re, im] in its order]. */
const REFERENCE = JSON.parse(readFileSync(new URL('./eigen-reference.json', import.meta.url), 'utf8')) as [string, number[][], [number, number][]][];

/** Mathcad 14's eigenvals and eigenvecs for 54 more invented matrices, from two probe sheets. */
const VECTORS = (JSON.parse(readFileSync(new URL('./eigenvecs-reference.json', import.meta.url), 'utf8')) as {
  cases: { name: string; a: number[][]; eigenvals: [number, number][]; eigenvecs: [number, number][][] }[];
}).cases;

const matrix = (rows: number[][]): Mat => {
  const n = rows.length;
  const m = newMat(n, n);
  rows.forEach((r, i) => r.forEach((x, j) => (m.re[i + j * n] = x)));
  return m;
};

const ours = (rows: number[][]): [number, number][] => {
  const e = eigenvalues(matrix(rows));
  return [...e.re].map((x, i) => [x, e.im ? e.im[i]! : 0]);
};

describe("eigenvals in Mathcad 14's order, which is LAPACK 3.0's", () => {
  test.each(REFERENCE)('%s', (_, rows, want) => {
    const got = ours(rows);
    got.forEach(([re, im], i) => {
      expect(re).toBeCloseTo(want[i]![0], 9);
      expect(im).toBeCloseTo(want[i]![1], 9);
    });
  });
  test.each(VECTORS.map((c) => [c.name, c] as const))('%s, from the eigenvecs probes', (_, c) => {
    ours(c.a).forEach(([re, im], i) => {
      const scale = Math.max(1, Math.abs(c.eigenvals[i]![0]), Math.abs(c.eigenvals[i]![1]));
      expect(Math.abs(re - c.eigenvals[i]![0]) / scale).toBeLessThan(1e-9);
      expect(Math.abs(im - c.eigenvals[i]![1]) / scale).toBeLessThan(1e-9);
    });
  });
  test('isolated eigenvalues of a triangular matrix come in the order the balancing leaves them, as in Mathcad', () => {
    expect(ours([[3, 0, 0], [1, -1, 0], [2, 4, 6]]).map(([re]) => +re.toFixed(9))).toEqual([6, -1, 3]);
  });
});

/**
 * rot2, an orthogonal matrix with every eigenvalue on the unit circle, is the one where the last bit of a norm decides
 * a vector's sign: Mathcad's BLAS rounds it differently, so two of its columns come out the other way round.
 */
const ROUNDING_SENSITIVE = new Set(['rot2']);

describe("eigenvecs as Mathcad 14 gives them, which is LAPACK 3.0's dgeev, signs included", () => {
  test.each(VECTORS.map((c) => [c.name, c] as const))('%s', (name, c) => {
    const n = c.a.length;
    const v = eigenvectors(matrix(c.a));
    for (let j = 0; j < n; j++) {
      let same = 0;
      let flipped = 0;
      for (let r = 0; r < n; r++) {
        const [wr, wi] = c.eigenvecs[r]![j]!;
        const [gr, gi] = [v.re[r + j * n]!, v.im ? v.im[r + j * n]! : 0];
        same = Math.max(same, Math.hypot(gr - wr, gi - wi));
        flipped = Math.max(flipped, Math.hypot(gr + wr, gi + wi));
      }
      if (ROUNDING_SENSITIVE.has(name)) expect(Math.min(same, flipped)).toBeLessThan(1e-9);
      else expect(same).toBeLessThan(1e-9);
    }
  });
});
