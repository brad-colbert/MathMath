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
import type { NumberFormat } from '../src/model/ast.js';
import { NODIM, newMat, num } from '../src/engine/values.js';
import { formatNumber, formatValue } from '../src/ui/format.js';

const f = (precision: number, exponent: number, trailingZeros = false): NumberFormat => ({ precision, exponent, trailingZeros });

// Expected values were read from Mathcad 14.
describe('number display', () => {
  test.each<[number, NumberFormat, string]>([
    [1234.5678, f(3, 3), '1.235\\times10^{3}'],
    [1234.5678, f(3, 5), '1234.568'],
    [999.9996, f(3, 3), '1000'],
    [999.9996, f(6, 3), '999.9996'],
    [999.9996, f(3, 3, true), '1000.000'],
    [1000, f(3, 3), '1\\times10^{3}'],
    [1000, f(3, 3, true), '1.000\\times10^{3}'],
    [1000, f(3, 4), '1000'],
    [0.1234, f(3, 3), '0.123'],
    [0.001234, f(3, 3), '1.234\\times10^{-3}'],
    [0.001234, f(3, 5), '0.001'],
    [0.0001234, f(3, 5), '0'],
    [0.0009996, f(3, 3), '9.996\\times10^{-4}'],
    [1.5, f(3, 3, true), '1.500'],
    [0.30000000000000004, f(3, 3), '0.3'],
    [-1234.5678, f(3, 3), '-1.235\\times10^{3}'],
    [1e-16, f(3, 3), '0'],
    [1e-16, f(3, 3, true), '0.000'],
    [1.0000000000000001e-15, f(3, 3), '1\\times10^{-15}'],
  ])('%s', (x, format, want) => expect(formatNumber(x, format)).toBe(want));

  test.each<[number, number, string]>([
    [0.1, 2, '0.1'],
    [0.099, 2, '9.9\\times10^{-2}'],
    [0.01, 3, '0.01'],
    [0.0099, 3, '9.9\\times10^{-3}'],
    [0.001, 4, '0.001'],
    [0.00099, 4, '9.9\\times10^{-4}'],
    [0.0001, 5, '0.0001'],
    [0.00009, 5, '9\\times10^{-5}'],
    [99, 2, '99'],
    [100, 2, '1\\times10^{2}'],
    [999, 3, '999'],
    [9999, 4, '9999'],
    [10000, 4, '1\\times10^{4}'],
    [99999, 5, '99999'],
    [100000, 5, '1\\times10^{5}'],
  ])('the exponent threshold: %s at %s', (x, t, want) => expect(formatNumber(x, f(7, t))).toBe(want));
});

describe("Mathcad's complex threshold, probed in Mathcad 14 at its default of 10", () => {
  const c = (re: number, im: number, threshold?: number): string =>
    formatValue(num(re, NODIM, im), { ...f(3, 3), ...(threshold === undefined ? {} : { complexThreshold: threshold }) });
  test('a part under 10⁻¹⁰ of the other shows as 0', () => {
    expect(c(25, -2.296e-15)).toBe('25');
    expect(c(1, 1e-11)).toBe('1');
    expect(c(1000, 1e-8)).toBe('1\\times10^{3}');
    expect(c(1e-11, 1)).toBe('1\\mathrm{i}');
    expect(c(1e-3, 1e-14)).toBe('1\\times10^{-3}');
  });
  test('one above it still shows', () => {
    expect(c(1, 1e-9)).toBe('1+1\\times10^{-9}\\mathrm{i}');
    expect(c(1, 2e-10)).toBe('1+2\\times10^{-10}\\mathrm{i}');
    expect(c(1000, 1e-6)).toBe('1\\times10^{3}+1\\times10^{-6}\\mathrm{i}');
  });
  test("a sheet's own threshold applies", () => expect(c(1, 1e-11, 20)).toBe('1+1\\times10^{-11}\\mathrm{i}'));
  test('elements of a matrix each follow it', () => {
    const m = newMat(2, 1);
    m.re.set([25, 3]);
    m.im = Float64Array.of(1e-14, 4);
    expect(formatValue(m, f(3, 3))).toBe('\\begin{pmatrix}25\\\\3+4\\mathrm{i}\\end{pmatrix}');
  });
});
