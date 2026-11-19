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
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/** The last region's error, or '' when it calculated. */
function failure(...lines: string[]): string {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).at(-1)!.error?.reason ?? '';
}
const P = (...lines: string[]): string => `\\begin{array}{|l}${lines.join('\\\\')}\\end{array}`;

describe('a worksheet can\'t run the page out of memory', () => {
  test('an array of more than 10 million elements is refused before it is made', () => {
    expect(failure('\\mathrm{identity}\\left(100000\\right)=')).toMatch(/at most 10,000,000 elements, and this one would have 10,000,000,000/);
    expect(failure('f\\left(i,j\\right)\\coloneq i', 'M\\coloneq \\mathrm{matrix}\\left(5000,5000,f\\right)')).toMatch(/at most 10,000,000 elements/);
    expect(failure('v_{20000000}\\coloneq 1')).toMatch(/at most 10,000,000 elements/);
    expect(failure('\\mathrm{runif}\\left(10^{9},0,1\\right)=')).toMatch(/number of values can be at most 10,000,000/);
  });

  test('range variables giving more than 10 million values are refused at once', () => {
    expect(failure('x\\coloneq 0..10^{8}', 'x=')).toMatch(/range variable x gives 100,000,001 values here/);
    expect(failure('i\\coloneq 0..5000', 'j\\coloneq 0..5000', 'M_{i,j}\\coloneq i+j')).toMatch(/range variables i, j give 25,010,001 values/);
    // Summing over them keeps nothing, so it's only slow, which Esc stops: not refused.
    expect(failure('i\\coloneq 1..1.1\\cdot 10^{7}', '\\sum_{i}1=')).toBe('');
  });

  test('solvers\' numbers of points', () => {
    const D = 'D\\left(x,y\\right)\\coloneq -y';
    expect(failure(D, '\\mathrm{rkfixed}\\left(1,0,1,10^{9},D\\right)=')).toMatch(/rkfixed's number of points can be at most 10,000,000, not 1,000,000,000/);
    expect(failure('\\mathrm{Given}', 'y\'\\left(t\\right)=-y\\left(t\\right)', 'y\\left(0\\right)=1', 'Y\\coloneq \\mathrm{Odesolve}\\left(t,1,10^{9}\\right)')).toMatch(/Odesolve's number of steps can be at most/);
  });

  test('a string doubled in a loop stops at 10 million characters', () => {
    const f = `f\\left(n\\right)\\coloneq ${P('s\\gets \\text{"ab"}', `\\mathbf{for}\\ i\\in 1..n\\ ${P('s\\gets \\mathrm{concat}\\left(s,s\\right)')}`, '\\mathrm{strlen}\\left(s\\right)')}`;
    expect(failure(f, 'f\\left(10\\right)=')).toBe('');
    expect(failure(f, 'f\\left(40\\right)=')).toMatch(/A string can have at most 10,000,000 characters, and this one would have 16,777,216/);
  });

  test('arrays of strings, arrays or mixed units stop at a million, as each element is an object', () => {
    expect(failure('i\\coloneq 0..9999999', '\\mathrm{num2str}\\left(i\\right)=')).toMatch(/holding strings, arrays or values in different units can have at most 1,000,000 elements, and this one would have 10,000,000/);
    expect(failure('i\\coloneq 0..9999999', '\\begin{pmatrix}i\\\\i\\end{pmatrix}=')).toMatch(/at most 1,000,000 elements/);
    expect(failure('v_{9999999}\\coloneq 1', 'v_{0}\\coloneq \\text{"a"}')).toMatch(/at most 1,000,000 elements, and this one would have 10,000,000/);
    expect(failure('i\\coloneq 0..999', '\\mathrm{num2str}\\left(i\\right)=')).toBe('');
  });

  test('a derivative at a range variable, and grids from two counts', () => {
    expect(failure('x\\coloneq 0..10^{9}', '\\frac{\\mathrm{d}}{\\mathrm{d}x}x^{2}=')).toMatch(/range variable x gives 1,000,000,001 values/);
    expect(failure('F\\left(s,t\\right)\\coloneq \\begin{pmatrix}s\\\\t\\\\0\\end{pmatrix}', '\\mathrm{CreateMesh}\\left(F,0,1,0,1,10000,10000\\right)=')).toMatch(/CreateMesh's grid, sgrid × tgrid, can have at most 1,000,000 points, not 100,000,000/);
  });

  test('a function that calls itself forever is an error, not a crash', () => {
    expect(failure('f\\left(n\\right)\\coloneq f\\left(n-1\\right)+1', 'f\\left(1\\right)=')).not.toBe('');
  });
});
