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
import { runWorksheet } from '../src/engine/evaluate.js';
import { termOrder } from '../src/engine/fitting.js';
import type { Num, Value } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/** Mathcad 14's answers for the fitting functions on invented data, from two probe sheets. */
const REF = JSON.parse(readFileSync(new URL('./fitting-reference.json', import.meta.url), 'utf8')) as {
  defs: string[];
  cases: { label: string; latex: string; want?: number[]; tol?: number; mathcadError?: string }[];
};

/** Runs some definitions, then the regions, and gives each region's answer or error. */
function run(defs: string[], lines: string[]): (Value | string)[] {
  const ws = emptyWorksheet();
  [...defs, ...lines].forEach((l, n) => ws.regions.push({ id: String(n), left: 0, top: n * 30, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).slice(defs.length).map((o) => (o.error ? o.error.reason : o.value!));
}
const numbers = (v: Value | string): number[] => (typeof v === 'string' ? [] : v.t === 'num' ? [v.re] : v.t === 'mat' ? Array.from(v.re) : []);

describe("curve fitting, against Mathcad 14's answers", () => {
  const cases = REF.cases.filter((c) => c.want);
  const got = run(REF.defs, cases.map((c) => c.latex));
  test.each(cases.map((c, k) => [c.label, c, k] as const))('%s', (_, c, k) => {
    const g = numbers(got[k]!);
    expect(g, String(got[k])).toHaveLength(c.want!.length);
    g.forEach((v, i) => expect(Math.abs(v - c.want![i]!), `element ${i}: ${v} against ${c.want![i]}`).toBeLessThanOrEqual(c.tol! * Math.max(Math.abs(c.want![i]!), 1e-12)));
  });

  test("genfit takes an F that gives the value alone, which Mathcad 14 can't fit, and finds the same answer", () => {
    const [scalar, full] = run(REF.defs, REF.cases.filter((c) => c.label.startsWith('genfit exact')).map((c) => c.latex));
    numbers(scalar!).forEach((v, i) => expect(v).toBeCloseTo(numbers(full!)[i]!, 12));
  });
});

describe('errors and edge cases, as in Mathcad 14', () => {
  const X = 'x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}';
  const f = (fn: string, a = 'x,y'): string => `\\mathrm{${fn}}\\left(${a}\\right)=`;
  test('two points: a line through them, but no standard error', () => {
    const out = run(['x\\coloneq \\begin{pmatrix}1\\\\2\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}3\\\\5\\end{pmatrix}'], [f('line'), f('medfit'), f('stderr')]);
    expect(numbers(out[0]!)).toEqual([1, 2]);
    expect(numbers(out[1]!)).toEqual([1, 2]);
    expect(out[2]).toMatch(/at least 3 points/);
  });
  test('x and y of different lengths', () => {
    expect(run([X, 'y\\coloneq \\begin{pmatrix}1\\\\2\\end{pmatrix}'], [f('slope')])[0]).toMatch(/same length/);
  });
  test('all the x values the same', () => {
    expect(run(['x\\coloneq \\begin{pmatrix}3\\\\3\\\\3\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}1\\\\2\\\\4\\end{pmatrix}'], [f('slope')])[0]).toMatch(/all the same/);
  });
  test('slope and intercept keep units; line, like Mathcad\'s, takes none', () => {
    const out = run([X, 'y\\coloneq \\begin{pmatrix}2\\\\4\\\\6\\end{pmatrix}'], [
      '\\frac{\\mathrm{slope}\\left(x\\cdot \\mathrm{s},y\\cdot \\mathrm{m}\\right)}{\\frac{\\mathrm{m}}{\\mathrm{s}}}=', '\\frac{\\mathrm{intercept}\\left(x\\cdot \\mathrm{s},y\\cdot \\mathrm{m}+1\\cdot \\mathrm{m}\\right)}{\\mathrm{m}}=',
      f('line', 'x\\cdot \\mathrm{s},y'),
    ]);
    expect(numbers(out[0]!)[0]).toBeCloseTo(2, 14);
    expect(numbers(out[1]!)[0]).toBeCloseTo(1, 14);
    expect(out[2]).toMatch(/without units/);
  });
  test('a guess too far off is an error, not a wrong answer', () => {
    const out = run(['x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\end{pmatrix}'], [f('logfit', 'x,y,\\begin{pmatrix}1\\\\-5\\\\0\\end{pmatrix}')]);
    expect(out[0]).toMatch(/doesn't converge/);
  });
  test("a sheet's own slope, line or stderr wins over the built-in", () => {
    const out = run(['\\mathrm{slope}\\coloneq 3', '\\mathrm{line}\\left(x\\right)\\coloneq 2\\cdot x'], ['\\mathrm{slope}=', '\\mathrm{line}\\left(4\\right)=']);
    expect(numbers(out[0]!)).toEqual([3]);
    expect(numbers(out[1]!)).toEqual([8]);
  });
});

describe('regress and interp', () => {
  const col = (v: number[]): string => `\\begin{pmatrix}${v.join('\\\\')}\\end{pmatrix}`;
  test("two variables, degree 2: the coefficients in Mathcad's order (xy, y², y, 1, x, x²), and interp at a point", () => {
    // Values made from known coefficients, so regress must give them back, each in its place.
    const a = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
    const b = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3];
    const z = a.map((x, k) => 0.5 * x * b[k]! - 0.25 * b[k]! ** 2 + 2 * b[k]! + 3 - x + 0.1 * x * x);
    const out = run([`A\\coloneq ${col(a)}`, `B\\coloneq ${col(b)}`, `V\\coloneq ${col(z)}`, 'M\\coloneq \\mathrm{augment}\\left(A,B\\right)', 'R\\coloneq \\mathrm{regress}\\left(M,V,2\\right)'],
      ['R=', '\\mathrm{interp}\\left(R,M,V,\\begin{pmatrix}1.5\\\\2.5\\end{pmatrix}\\right)=']);
    numbers(out[0]!).forEach((v, i) => expect(v).toBeCloseTo([3, 3, 2, 0.5, -0.25, 2, 3, -1, 0.1][i]!, 12));
    expect(numbers(out[1]!)[0]).toBeCloseTo(0.5 * 1.5 * 2.5 - 0.25 * 2.5 ** 2 + 2 * 2.5 + 3 - 1.5 + 0.1 * 1.5 ** 2, 12);
  });
  test('a polynomial far from 0, of degree 4 at x = 2000 to 2020, still fits', () => {
    const x = Array.from({ length: 21 }, (_, k) => 2000 + k);
    const y = x.map((t) => 1 + 0.5 * (t - 2010) - 0.02 * (t - 2010) ** 2);
    const out = run([`x\\coloneq ${col(x)}`, `y\\coloneq ${col(y)}`], ['\\mathrm{interp}\\left(\\mathrm{regress}\\left(x,y,4\\right),x,y,2015.5\\right)=']);
    expect(numbers(out[0]!)[0]).toBeCloseTo(1 + 0.5 * 5.5 - 0.02 * 5.5 ** 2, 5);
  });
  test("term order: Mathcad's, as its regress returns the coefficients", () => {
    expect(termOrder(2, 2).map((e) => e.join(''))).toEqual(['11', '02', '01', '00', '10', '20']);
    expect(termOrder(1, 3).map((e) => e.join(''))).toEqual(['0', '1', '2', '3']);
    expect(termOrder(3, 2).map((e) => e.join(''))).toEqual(['101', '011', '002', '001', '110', '020', '010', '000', '100', '200']);
  });
  test('one variable: 3, 3, k, then the coefficients from the constant up; interp evaluates the polynomial', () => {
    const out = run(['x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}1\\\\2\\\\5\\\\10\\end{pmatrix}', 'R\\coloneq \\mathrm{regress}\\left(x,y,2\\right)'],
      ['R=', '\\mathrm{interp}\\left(R,x,y,1.5\\right)=']);
    numbers(out[0]!).forEach((v, i) => expect(v).toBeCloseTo([3, 3, 2, 1, 0, 1][i]!, 12));
    expect(numbers(out[1]!)[0]).toBeCloseTo(3.25, 12);
  });
  test('a spline vector still goes to the spline', () => {
    const out = run(['x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}0\\\\1\\\\4\\\\9\\end{pmatrix}'], ['\\mathrm{interp}\\left(\\mathrm{lspline}\\left(x,y\\right),x,y,2\\right)=']);
    expect(numbers(out[0]!)[0]).toBeCloseTo(4, 12);
  });
});
