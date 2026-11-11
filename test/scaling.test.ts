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
import { makeBuiltins } from '../src/engine/builtins.js';
import { scaledDisplay, showDMS, showFIF, showHhmmss } from '../src/engine/scaling.js';
import { type Value, fromValues, num, str } from '../src/engine/values.js';

// Mathcad 14's answers, probed 2026-11-10 (probe inputs were written to 15 significant digits, as here).
const B = makeBuiltins(0);
const call = (name: string, ...args: Value[]): Value => B.get(name)!.call(args);
const col = (xs: number[]): Value => fromValues(xs.length, 1, xs.map((x) => num(x)));
const n = (x: number): Value => num(x);
const value = (v: Value): number => (v.t === 'num' ? v.re : NaN);
const FT = 0.3048;
const IN = 0.0254;

describe('DMS, FIF and hhmmss', () => {
  test('DMS adds its parts as they are, in radians', () => {
    expect(value(call('DMS', col([10, 30, 0])))).toBeCloseTo(0.183259571459405, 14);
    expect(value(call('DMS', n(10), n(30), n(36))) - 0.183434104384604).toBeLessThan(1e-15);
    expect(value(call('DMS', n(-10), n(30), n(0)))).toBeCloseTo(-0.165806278939461, 14);
    expect(value(call('DMS', n(-10), n(-30), n(0)))).toBeCloseTo(-0.183259571459405, 14);
    expect(value(call('DMS', n(10.5)))).toBeCloseTo(0.183259571459405, 14);
    expect(value(call('DMS', col([10, 30])))).toBeCloseTo(0.183259571459405, 14);
    expect(value(call('DMS', n(0), n(90), n(0)))).toBeCloseTo(0.0261799387799149, 14);
    expect(() => call('DMS', col([1, 2, 3, 4]))).toThrow(/three elements/);
    expect(value(call('DMS', n(10), n(30)))).toBeCloseTo(0.1832595714594046, 15);
    expect(() => call('DMS', str('10'))).toThrow(/real numbers/);
  });

  test('FIF reads feet, inches and fractions, as a length', () => {
    const cases: [string, number][] = [
      ["9' 6-1/4\"", 2.90195], ["9' 6-1/4", 2.90195], ["9'", 2.7432], ['6-1/4', 0.15875], ["9' 6", 2.8956], ["-9' 6", -2.8956],
      ['1/2', 0.0127], ["9'6", 2.8956], ['6', 0.1524], ['6 1/4', 0.15875], ["0' 0-3/8\"", 0.009525], ['-6-1/4', -0.15875], ['6"', 0.1524],
    ];
    for (const [s, m] of cases) {
      const v = call('FIF', str(s));
      expect(v.t === 'num' && v.dim[0] === 1, s).toBe(true);
      expect(value(v), s).toBeCloseTo(m, 12);
    }
    expect(value(call('FIF', n(9), n(6), n(0.25)))).toBeCloseTo(2.90195, 12);
    expect(value(call('FIF', n(1), n(2), n(3)))).toBeCloseTo(0.4318, 12);
    expect(value(call('FIF', n(-9), n(6), n(0)))).toBeCloseTo(-2.5908, 12);
    for (const bad of ['3.5', "9.5'"]) expect(() => call('FIF', str(bad)), bad).toThrow(/n' n-n\/n/);
    expect(() => call('FIF', num(1, [1, 0, 0, 0, 0, 0, 0]), n(0), n(0))).toThrow(/without units/);
  });

  test('hhmmss reads hours, minutes and seconds, as a time', () => {
    const cases: [string, number][] = [['00:02:03', 123], ['1:02:03.5', 3723.5], ['25:61:70', 93730], ['-1:00:00', -3600], ['-1:30:00', -5400]];
    for (const [s, t] of cases) expect(value(call('hhmmss', str(s))), s).toBe(t);
    expect(value(call('hhmmss', n(0), n(2), n(3)))).toBe(123);
    expect(value(call('hhmmss', n(1.5), n(0), n(0)))).toBe(5400);
    expect(value(call('hhmmss', n(-1), n(30), n(0)))).toBe(-1800);
    for (const bad of ['2:03', '7', '1:-30:00', ' 1 : 30 : 00 ']) expect(() => call('hhmmss', str(bad)), bad).toThrow(/hh:mm:ss/);
  });

  test('time is seconds since 1970, without units', () => {
    const t = call('time', n(0));
    expect(t.t === 'num' && t.dim.every((d) => d === 0)).toBe(true);
    expect(Math.abs(value(t) - Date.now() / 1000)).toBeLessThan(5);
  });
});

describe('the formats in the unit placeholder', () => {
  test('FIF picks the last continued-fraction convergent with a denominator up to 256', () => {
    const inches: [number, string][] = [
      [4 + 1 / 3, "0' 4-1/3\""], [3.14159265358979, "0' 3-16/113\""], [0.1, "0' 1/10\""], [0.015625, "0' 1/64\""], [0.999, "0' 1\""],
      [12, "1' 0\""], [11.9999, "1' 0\""], [2.71828182845905, "0' 2-51/71\""], [0.142857142857143, "0' 1/7\""], [0.3, "0' 3/10\""],
      [0.001, "0' 0\""], [0.123456, "0' 10/81\""], [5.5, "0' 5-1/2\""], [7.875, "0' 7-7/8\""], [0.0078125, "0' 1/128\""],
      [0.00390625, "0' 1/256\""], [0.0001, "0' 0\""], [23.99, "1' 11-99/100\""], [-0.5, "-0' 1/2\""], [1e-9, "0' 0\""], [0.333, "0' 1/3\""],
      [0.3333, "0' 1/3\""], [0.666666666666667, "0' 2/3\""], [0.17, "0' 17/100\""], [0.002, "0' 0\""], [0.00389, "0' 0\""],
      [0.0039, "0' 1/256\""], [0.5009765625, "0' 1/2\""], [0.414213562373095, "0' 70/169\""], [0.9995, "0' 1\""], [0.997, "0' 1\""],
      [5.0035, "0' 5\""], [0.2525, "0' 25/99\""], [0.252, "0' 63/250\""], [0.2515, "0' 42/167\""], [0, "0' 0\""],
      [0.335833333333333, "0' 45/134\""], [0.336333333333333, "0' 75/223\""], [0.12, "0' 3/25\""],
    ];
    for (const [x, s] of inches) expect(showFIF(x * IN), String(x)).toBe(s);
    const feet: [number, string][] = [[9.52083333333333, "9' 6-1/4\""], [-2.3, "-2' 3-3/5\""], [0.01, "0' 3/25\""], [100, "100' 0\""]];
    for (const [x, s] of feet) expect(showFIF(x * FT), String(x)).toBe(s);
  });

  test('hhmmss rounds the seconds to 3 decimals, without carrying', () => {
    const cases: [number, string][] = [
      [123, '0:2:3'], [3723.5, '1:2:3.5'], [-5400, '-1:30:0'], [100000.25, '27:46:40.25'], [1 / 3, '0:0:0.333'], [59.9999, '0:0:60'],
      [0.001, '0:0:0.001'], [1e-5, '0:0:0'], [3600, '1:0:0'], [259200.5, '72:0:0.5'], [3.14159265358979, '0:0:3.142'], [0, '0:0:0'],
      [0.0004, '0:0:0'], [0.12345678, '0:0:0.123'], [59.99999999, '0:0:60'], [7.5e-7, '0:0:0'],
    ];
    for (const [t, s] of cases) expect(showHhmmss(t), String(t)).toBe(s);
  });

  test('DMS gives degrees, minutes and seconds, each signed', () => {
    const cases: [number, number[]][] = [
      [10.51 * Math.PI / 180, [10, 30, 36]], [-10.51 * Math.PI / 180, [-10, -30, -36]], [0.5, [28, 38, 52.4031235482]],
      [1, [57, 17, 44.80624709636322]], [-0.0001, [0, 0, -20.626480624709636]], [1.04719737666367, [59, 59, 59.96399999948335]],
      [0, [0, 0, 0]], [3.14159265358979, [179, 59, 59.99999999930151]], [4.84813681109536e-6, [0, 0, 1]],
    ];
    for (const [x, want] of cases) {
      const got = showDMS(x);
      expect(got.slice(0, 2), String(x)).toEqual(want.slice(0, 2));
      expect(Math.abs(got[2]! - want[2]!), String(x)).toBeLessThan(2e-9);
    }
  });

  test('a value of the wrong kind is refused', () => {
    expect(() => scaledDisplay('FIF', num(3, [0, 0, 1, 0, 0, 0, 0]))).toThrow(/length/);
    expect(() => scaledDisplay('hhmmss', num(3))).toThrow(/time/);
    expect(scaledDisplay('m', num(3))).toBeNull();
  });
});
