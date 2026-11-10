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
import { runWorksheet } from '../src/engine/evaluate.js';
import { type Mat, NODIM, type Num, num } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/** Mathcad 14's answers for 29 functions at 18 arguments each, from a probe sheet: [re, im], or its error. */
const CASES = (JSON.parse(readFileSync(new URL('./elementary-reference.json', import.meta.url), 'utf8')) as {
  cases: { fn: string; z: [number, number]; want?: [number, number]; error?: string }[];
}).cases;

const B = makeBuiltins(0);
const call = (fn: string, z: [number, number]): Num => B.get(fn)!.call([num(z[0], NODIM, z[1])]) as Num;

describe("elementary functions on real and complex numbers, with Mathcad 14's branches", () => {
  test.each(CASES.filter((c) => c.want).map((c) => [`${c.fn}(${c.z[0]}${c.z[1] < 0 ? '' : '+'}${c.z[1]}i)`, c] as const))('%s', (_, c) => {
    const got = call(c.fn, c.z);
    const [re, im] = c.want!;
    const scale = Math.max(1, Math.hypot(re, im));
    expect(Math.abs(got.re - re), `re ${got.re} against ${re}`).toBeLessThanOrEqual(1e-14 * scale);
    expect(Math.abs(got.im - im), `im ${got.im} against ${im}`).toBeLessThanOrEqual(1e-14 * scale);
  });

  test.each(CASES.filter((c) => c.error).map((c) => [`${c.fn}(${c.z[0]}${c.z[1] < 0 ? '' : '+'}${c.z[1]}i)`, c] as const))('%s is an error, as in Mathcad', (_, c) => {
    expect(() => call(c.fn, c.z)).toThrow(c.fn === 'ln' || c.fn === 'log' ? /log of zero/ : /singularity/);
  });

  // Far from the probed range, Mathcad's own formulas lose digits: asin(1e−10 + 1e−10i) comes back with no
  // imaginary part, and acsch(−3e7 − 2i) is 12% out. These keep them; the values are Python's cmath, off every cut.
  test.each<[string, [number, number], [number, number]]>([
    ['asin', [1, 1000000000.0], [1e-09, 21.416413017506354]],
    ['asin', [-1000000000.0, 1], [-1.5707963257948967, 21.416413017506354]],
    ['asin', [1e-10, 1e-10], [1e-10, 1e-10]],
    ['asin', [1e-08, -3e-09], [1e-08, -3.0000000000000004e-09]],
    ['asin', [-30000000.0, -2], [-1.57079626012823, -17.909855120186375]],
    ['asin', [3e-12, 2e-12], [3.0000000000000005e-12, 2e-12]],
    ['acos', [1, 1000000000.0], [1.5707963257948967, -21.416413017506354]],
    ['acos', [-1000000000.0, 1], [3.141592652589793, -21.416413017506354]],
    ['acos', [1e-10, 1e-10], [1.5707963266948965, -1e-10]],
    ['acos', [1e-08, -3e-09], [1.5707963167948966, 3.0000000000000004e-09]],
    ['acos', [-30000000.0, -2], [3.1415925869231267, 17.909855120186375]],
    ['acos', [3e-12, 2e-12], [1.5707963267918967, -2e-12]],
    ['atan', [1, 1000000000.0], [1.5707963267948966, 9.999999999999999e-10]],
    ['atan', [-1000000000.0, 1], [-1.5707963257948967, 1e-18]],
    ['atan', [1e-10, 1e-10], [1e-10, 1e-10]],
    ['atan', [1e-08, -3e-09], [1e-08, -2.9999999999999996e-09]],
    ['atan', [-30000000.0, -2], [-1.5707962934615634, -2.2222222222222098e-15]],
    ['atan', [3e-12, 2e-12], [3e-12, 2e-12]],
    ['asinh', [1, 1000000000.0], [21.416413017506354, 1.5707963257948967]],
    ['asinh', [-1000000000.0, 1], [-21.416413017506354, 1e-09]],
    ['asinh', [1e-10, 1e-10], [1e-10, 1e-10]],
    ['asinh', [1e-08, -3e-09], [9.999999999999999e-09, -3.0000000000000004e-09]],
    ['asinh', [-30000000.0, -2], [-17.90985512018638, -6.666666666666654e-08]],
    ['asinh', [3e-12, 2e-12], [3e-12, 2.0000000000000004e-12]],
    ['acosh', [1, 1000000000.0], [21.416413017506354, 1.5707963257948967]],
    ['acosh', [-1000000000.0, 1], [21.416413017506354, 3.141592652589793]],
    ['acosh', [1e-10, 1e-10], [1e-10, 1.5707963266948965]],
    ['acosh', [1e-08, -3e-09], [3.0000000000000004e-09, -1.5707963167948966]],
    ['acosh', [-30000000.0, -2], [17.909855120186375, -3.1415925869231267]],
    ['acosh', [3e-12, 2e-12], [2e-12, 1.5707963267918967]],
    ['atanh', [1, 1000000000.0], [1e-18, 1.5707963257948967]],
    ['atanh', [-1000000000.0, 1], [-9.999999999999999e-10, 1.5707963267948966]],
    ['atanh', [1e-10, 1e-10], [1e-10, 1e-10]],
    ['atanh', [1e-08, -3e-09], [1e-08, -3.000000000000001e-09]],
    ['atanh', [-30000000.0, -2], [-3.3333333333333195e-08, -1.5707963267948943]],
    ['atanh', [3e-12, 2e-12], [3.0000000000000005e-12, 2e-12]],
    ['acot', [1, 1000000000.0], [0.0, -9.999999999999999e-10]],
    ['acot', [-1000000000.0, 1], [3.141592652589793, -1e-18]],
    ['acot', [1e-10, 1e-10], [1.5707963266948965, -1e-10]],
    ['acot', [1e-08, -3e-09], [1.5707963167948966, 2.9999999999999996e-09]],
    ['acot', [-30000000.0, -2], [3.1415926202564597, 2.2222222222222098e-15]],
    ['acot', [3e-12, 2e-12], [1.5707963267918965, -2e-12]],
    ['acoth', [1, 1000000000.0], [1e-18, -1e-09]],
    ['acoth', [-1000000000.0, 1], [-9.999999999999999e-10, -1e-18]],
    ['acoth', [1e-10, 1e-10], [1e-10, -1.5707963266948965]],
    ['acoth', [1e-08, -3e-09], [9.999999999999999e-09, 1.5707963237948965]],
    ['acoth', [-30000000.0, -2], [-3.333333333333319e-08, 2.2222222222222145e-15]],
    ['acoth', [3e-12, 2e-12], [2.9999999999999997e-12, -1.5707963267928966]],
    ['asec', [1, 1000000000.0], [1.5707963267948966, 1e-09]],
    ['asec', [-1000000000.0, 1], [1.5707963277948966, 1e-18]],
    ['asec', [1e-10, 1e-10], [0.7853981633974483, 23.372424520220427]],
    ['asec', [1e-08, -3e-09], [0.2914567944778671, -19.070739076391785]],
    ['asec', [-30000000.0, -2], [1.57079636012823, -2.2222222222222133e-15]],
    ['asec', [3e-12, 2e-12], [0.5880026035475675, 27.041693617757723]],
    ['acsc', [1, 1000000000.0], [1e-18, -1e-09]],
    ['acsc', [-1000000000.0, 1], [-1e-09, -1e-18]],
    ['acsc', [1e-10, 1e-10], [0.7853981633974483, -23.372424520220427]],
    ['acsc', [1e-08, -3e-09], [1.2793395323170296, 19.070739076391785]],
    ['acsc', [-30000000.0, -2], [-3.333333333333319e-08, 2.2222222222222133e-15]],
    ['acsc', [3e-12, 2e-12], [0.9827937232473292, -27.041693617757723]],
    ['asech', [1, 1000000000.0], [1e-09, -1.5707963267948966]],
    ['asech', [-1000000000.0, 1], [1e-18, -1.5707963277948966]],
    ['asech', [1e-10, 1e-10], [23.372424520220427, -0.7853981633974483]],
    ['asech', [1e-08, -3e-09], [19.070739076391785, 0.2914567944778671]],
    ['asech', [-30000000.0, -2], [2.2222222222222133e-15, 1.57079636012823]],
    ['asech', [3e-12, 2e-12], [27.041693617757723, -0.5880026035475675]],
    ['acsch', [1, 1000000000.0], [1e-18, -1e-09]],
    ['acsch', [-1000000000.0, 1], [-1e-09, -1e-18]],
    ['acsch', [1e-10, 1e-10], [23.372424520220427, -0.7853981633974483]],
    ['acsch', [1e-08, -3e-09], [19.070739076391785, 0.29145679447786704]],
    ['acsch', [-30000000.0, -2], [-3.3333333333333175e-08, 2.222222222222211e-15]],
    ['acsch', [3e-12, 2e-12], [27.041693617757723, -0.5880026035475675]],
  ])('%s(%s) keeps its digits', (fn, z, want) => {
    const got = call(fn, z);
    expect(Math.abs(got.re - want[0])).toBeLessThanOrEqual(1e-14 * Math.max(Math.abs(want[0]), 1e-300) + 4e-16 * Math.abs(want[1]));
    expect(Math.abs(got.im - want[1])).toBeLessThanOrEqual(1e-14 * Math.max(Math.abs(want[1]), 1e-300) + 4e-16 * Math.abs(want[0]));
  });

  test('asin(−1e9) is a number, as in Mathcad, not a singularity', () => {
    const got = call('asin', [-1e9, 0]);
    expect(got.re).toBeCloseTo(-Math.PI / 2, 14);
    expect(got.im).toBeCloseTo(21.416413017506358, 12);
  });

  test('a real argument inside the domain gives a real answer, exactly as Math does', () => {
    expect(call('asin', [0.5, 0])).toEqual(num(Math.asin(0.5)));
    expect(call('atanh', [0.5, 0])).toEqual(num(Math.atanh(0.5)));
    expect(call('sin', [2, 0])).toEqual(num(Math.sin(2)));
  });

  test('element by element, a vector of reals can give complex answers', () => {
    const ws = emptyWorksheet();
    const lines = ['v\\coloneq \\begin{pmatrix}0.5\\\\2\\end{pmatrix}', '\\mathrm{asin}\\left(v\\right)=', '\\mathrm{exp}\\left(v\\cdot 1\\mathrm{i}\\right)='];
    lines.forEach((l, n) => ws.regions.push({ id: String(n), left: 0, top: n * 40, alignX: 0, alignY: n * 40, disabled: false, content: readRegion(l) }));
    const [, a, e] = runWorksheet(ws).map((o) => o.value as Mat);
    expect([a.re[0], a.im?.[0] ?? 0]).toEqual([Math.asin(0.5), 0]);
    expect(a.re[1]).toBeCloseTo(Math.PI / 2, 14);
    expect(a.im![1]).toBeCloseTo(-Math.acosh(2), 14);
    expect(e.re[1]).toBeCloseTo(Math.cos(2), 14);
    expect(e.im![1]).toBeCloseTo(Math.sin(2), 14);
  });

  test('typed on a sheet, with i and units', () => {
    const ws = emptyWorksheet();
    const lines = [
      'e^{1\\mathrm{i}}-\\exp\\left(1\\mathrm{i}\\right)=', '\\sin\\left(1+2\\mathrm{i}\\right)=', '\\mathrm{acosh}\\left(0.5\\right)=',
      '\\mathrm{asin}\\left(2\\right)=', '\\sin\\left(90\\cdot \\mathrm{deg}\\right)=', '\\cos\\left(2\\cdot \\mathrm{m}\\right)=',
      '\\mathrm{csgn}\\left(-3\\mathrm{i}\\right)=', '\\mathrm{signum}\\left(3+4\\mathrm{i}\\right)=',
    ];
    lines.forEach((l, n) => ws.regions.push({ id: String(n), left: 0, top: n * 30, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(l) }));
    const out = runWorksheet(ws).map((o) => (o.error ? o.error.reason : [(o.value as Num).re, (o.value as Num).im]));
    expect(out[0]).toEqual([0, 0]);
    expect(out[1]![0]).toBeCloseTo(Math.sin(1) * Math.cosh(2), 14);
    expect(out[2]![0]).toBe(0);
    expect(out[2]![1]).toBeCloseTo(Math.acos(0.5), 14);
    expect(out[3]![0]).toBeCloseTo(Math.PI / 2, 14);
    expect(out[3]![1]).toBeCloseTo(-Math.acosh(2), 14);
    expect(out[4]).toEqual([1, 0]);
    expect(out[5]).toMatch(/dimensionless/);
    expect(out[6]).toEqual([-1, 0]);
    expect(out[7]).toEqual([0.6, 0.8]);
  });
});
