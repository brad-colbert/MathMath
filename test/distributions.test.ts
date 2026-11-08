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
import { type Mat, type Num, type Value, fromValues, num } from '../src/engine/values.js';
import { emptyWorksheet, loadWorksheet, saveWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Value => B.get(fn)!.call(args);
const n = (fn: string, ...args: number[]): number => (call(fn, ...args.map((x) => num(x))) as Num).re;
const vec = (...xs: number[]): Mat => fromValues(xs.length, 1, xs.map((x) => num(x)));
const thrown = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
};

/** Mathcad 14's answers, from two probe sheets: [function, arguments, answer]. */
const REFERENCE = JSON.parse(readFileSync(new URL('./distributions-reference.json', import.meta.url), 'utf8')) as [string, number[], number][];

describe('distributions, against Mathcad 14', () => {
  test.each(REFERENCE)('%s(%j)', (fn, args, want) => {
    const got = n(fn, ...args);
    // Mathcad's qnorm far in the tail is the less accurate of the two: Φ⁻¹(10⁻¹⁰) is −6.3613409024040…
    const tolerance = fn === 'qnorm' && args[0]! < 1e-6 ? 1e-9 : 1e-11;
    expect(Math.abs(got - want)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(want)));
  });
  test("a discrete count that isn't whole has no probability, and the cumulative floors it", () => {
    expect(n('dbinom', 3.5, 10, 0.3)).toBe(0);
    expect(n('pbinom', 3.5, 10, 0.3)).toBe(n('pbinom', 3, 10, 0.3));
  });
  test('a discrete inverse is the smallest count reaching p, and covers the ends', () => {
    expect([n('qbinom', 0, 10, 0.3), n('qbinom', 1, 10, 0.3), n('qgeom', 0.3, 0.3)]).toEqual([0, 10, 0]);
  });
  test('each continuous inverse undoes its cumulative', () => {
    for (const [fn, ps] of [['norm', [0.5, 2]], ['t', [4]], ['gamma', [3]], ['beta', [2, 5]], ['F', [4, 7]], ['chisq', [3]], ['lnorm', [0.2, 0.8]], ['weibull', [2]]] as const) {
      for (const p of [0.001, 0.3, 0.9, 0.999]) expect(n(`p${fn}`, n(`q${fn}`, p, ...ps), ...ps)).toBeCloseTo(p, 12);
    }
  });
  test('arguments are checked, as Mathcad refuses them', () => {
    expect(thrown(() => n('dnorm', 1, 0, 0))).toMatch(/standard deviation, σ, must be above 0/);
    expect(thrown(() => n('qbinom', 0.5, 0, 0.3))).toMatch(/whole number, 1 or more/);
    expect(thrown(() => n('qnorm', 1.5, 0, 1))).toMatch(/probability must be from 0 to 1/);
    expect(thrown(() => n('dunif', 1, 4, 1))).toMatch(/upper end/);
    expect(thrown(() => call('dnorm', num(1, [1, 0, 0, 0, 0, 0, 0]), num(0), num(1)))).toMatch(/without units/);
  });
  test('a vector of values gives a vector', () => {
    expect([...(call('pnorm', vec(-1, 0, 1), num(0), num(1)) as Mat).re].map((x) => +x.toFixed(6))).toEqual([0.158655, 0.5, 0.841345]);
  });
});

describe('random draws', () => {
  /** A sheet's value for a typed expression, with a seed. */
  function draws(latex: string, seed?: number): number[] {
    const ws = emptyWorksheet();
    if (seed !== undefined) ws.seed = seed;
    ws.regions = [{ id: 'r', left: 0, top: 0, alignX: 0, alignY: 8, disabled: false, content: readRegion(latex) }];
    const v = runWorksheet(ws)[0]!.value!;
    return v.t === 'mat' ? [...v.re] : [(v as Num).re];
  }
  test('they follow their distribution', () => {
    const x = draws('\\mathrm{rgamma}\\left(4000,3\\right)=');
    const mean = x.reduce((s, v) => s + v, 0) / x.length;
    expect(mean).toBeGreaterThan(2.85);
    expect(mean).toBeLessThan(3.15);
    const k = draws('\\mathrm{rbinom}\\left(4000,10,0.3\\right)=');
    expect(k.every((v) => Number.isInteger(v) && v >= 0 && v <= 10)).toBe(true);
    expect(k.reduce((s, v) => s + v, 0) / k.length).toBeCloseTo(3, 0);
    expect(draws('\\mathrm{rbeta}\\left(500,2,5\\right)=').every((v) => v > 0 && v < 1)).toBe(true);
  });
  test('the same seed gives the same draws; a new seed, new ones', () => {
    const a = draws('\\mathrm{rpois}\\left(20,3.5\\right)=');
    expect(draws('\\mathrm{rpois}\\left(20,3.5\\right)=')).toEqual(a);
    expect(draws('\\mathrm{rpois}\\left(20,3.5\\right)=', 1)).toEqual(a);
    expect(draws('\\mathrm{rpois}\\left(20,3.5\\right)=', 7)).not.toEqual(a);
    expect(draws('\\mathrm{rnd}\\left(1\\right)=', 7)).not.toEqual(draws('\\mathrm{rnd}\\left(1\\right)='));
  });
  test('the seed is saved with the worksheet, and left out when it is the default', () => {
    const ws = emptyWorksheet();
    expect(saveWorksheet(ws)).not.toContain('"seed"');
    ws.seed = 12345;
    expect(loadWorksheet(saveWorksheet(ws)).seed).toBe(12345);
  });
});

describe('statistics, against Mathcad 14', () => {
  const V = vec(2, 4, 4, 5, 9);
  test.each<[string, number]>([
    ['var', 5.3599999999999994], ['Var', 6.6999999999999993], ['median', 4], ['mode', 4], ['gmean', 4.2822547366766477],
    ['hmean', 3.8135593220338984], ['kurt', 2.3991980396524841], ['skew', 1.2281952102833771],
  ])('%s', (fn, want) => expect((call(fn, V) as Num).re).toBeCloseTo(want, 12));
  test('over a matrix, every element counts', () => {
    const M = fromValues(3, 2, [1, 2, 7, 4, 6, 1].map((x) => num(x)));
    const N = fromValues(3, 2, [2, 3, 1, 1, 5, 0].map((x) => num(x)));
    expect((call('var', M) as Num).re).toBeCloseTo(5.583333333333333, 12);
    expect((call('cvar', M, N) as Num).re).toBeCloseTo(1.1666666666666667, 12);
    expect((call('corr', M, N) as Num).re).toBeCloseTo(0.30235394895347606, 12);
    expect((call('kurt', M) as Num).re).toBeCloseTo(-2.0026732011583874, 11);
  });
  test('mode refuses no repeats and a tie, as Mathcad does', () => {
    expect(thrown(() => call('mode', vec(1, 2, 3)))).toMatch(/no value appears more than once/);
    expect(thrown(() => call('mode', vec(1, 2, 2, 3, 3)))).toMatch(/more than one value/);
  });
  test('variance keeps squared units', () => {
    const m = fromValues(2, 1, [num(1, [1, 0, 0, 0, 0, 0, 0]), num(3, [1, 0, 0, 0, 0, 0, 0])]);
    expect((call('var', m) as Num).dim).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });
});
