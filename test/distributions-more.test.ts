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
import { type Mat, type Num, type Value, num } from '../src/engine/values.js';

const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Value => B.get(fn)!.call(args);
const n = (fn: string, ...args: number[]): number => (call(fn, ...args.map((x) => num(x))) as Num).re;
const thrown = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
};

/**
 * SciPy 1.18's answers, [function, arguments, answer], made with the parameters mapped to its own: gumbel_r(loc μ,
 * scale β), laplace(loc μ, scale b), maxwell(scale a), pareto(b α, scale m), rayleigh(scale σ), rice(b ν/σ, scale σ),
 * triang(c (c − a)/(b − a), loc a, scale b − a). Von Mises is from integrating its density with mpmath at 30
 * digits, since SciPy's cumulative is a normal approximation for κ above 50, off by 10⁻⁷.
 */
const REFERENCE = JSON.parse(readFileSync(new URL('./distributions-more-reference.json', import.meta.url), 'utf8')) as [string, number[], number][];

const FAMILIES: [string, number[]][] = [
  ['gumbel', [1, 2]], ['laplace', [-1, 0.5]], ['maxwell', [2]], ['pareto', [1.5, 2.5]], ['rayleigh', [3]],
  ['rice', [2, 0.7]], ['tri', [-1, 3, 0]], ['vonmises', [0.4, 3]],
];

describe('the distributions MathMath adds', () => {
  test.each(REFERENCE)('%s(%j)', (fn, args, want) => {
    expect(Math.abs(n(fn, ...args) - want)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(want)));
  });

  test('each inverse undoes its cumulative', () => {
    for (const [f, ps] of FAMILIES) {
      for (const p of [0.001, 0.3, 0.9, 0.999]) expect(n(`p${f}`, n(`q${f}`, p, ...ps), ...ps)).toBeCloseTo(p, 11);
    }
  });

  test('random draws stay in range, and their mean is near the distribution\'s', () => {
    const means: Record<string, number> = {
      gumbel: 1 + 2 * 0.5772156649, laplace: -1, maxwell: 2 * 2 * Math.sqrt(2 / Math.PI), pareto: (2.5 * 1.5) / 1.5, rayleigh: 3 * Math.sqrt(Math.PI / 2),
      tri: (-1 + 3 + 0) / 3, vonmises: 0.4,
    };
    for (const [f, ps] of FAMILIES) {
      const draws = call(`r${f}`, num(4000), ...ps.map((x) => num(x))) as Mat;
      expect(draws.rows).toBe(4000);
      const xs = [...draws.re];
      const [lo, hi] = [n(`q${f}`, 0, ...ps), n(`q${f}`, 1, ...ps)];
      expect(xs.every((x) => x >= lo && x <= hi)).toBe(true);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      if (means[f] !== undefined) expect(Math.abs(mean - means[f]!)).toBeLessThan(0.15 * Math.max(1, Math.abs(means[f]!)));
    }
  });

  test('each density integrates to its cumulative: 98% between the 1% and 99% points', () => {
    for (const [f, ps] of FAMILIES) {
      const [lo, hi] = [n(`q${f}`, 0.01, ...ps), n(`q${f}`, 0.99, ...ps)];
      const steps = 20000;
      let sum = 0;
      for (let k = 0; k < steps; k++) sum += n(`d${f}`, lo + ((k + 0.5) * (hi - lo)) / steps, ...ps);
      expect(sum * ((hi - lo) / steps)).toBeCloseTo(0.98, 6);
    }
  });

  test('special cases: Rice with ν = 0 is Rayleigh, and von Mises with κ = 0 is uniform on the turn', () => {
    for (const x of [0.3, 1, 2.5]) {
      expect(n('price', x, 0, 1.3)).toBeCloseTo(n('prayleigh', x, 1.3), 14);
      expect(n('drice', x, 0, 1.3)).toBeCloseTo(n('drayleigh', x, 1.3), 14);
    }
    expect(n('dvonmises', 2, 1, 0)).toBeCloseTo(1 / (2 * Math.PI), 14);
    expect(n('pvonmises', 1, 1, 0)).toBeCloseTo(0.5, 14);
    expect([n('dvonmises', 5, 1, 2), n('pvonmises', 5, 1, 2), n('pvonmises', -3, 1, 2)]).toEqual([0, 1, 0]);
    // A triangle with its peak at an end.
    expect([n('dtri', 1, 1, 4, 1), n('ptri', 2.5, 1, 4, 4), n('qtri', 0.25, 1, 4, 4)]).toEqual([2 / 3, 0.25, 2.5]);
  });

  test('arguments are checked', () => {
    expect(thrown(() => n('dgumbel', 1, 0, 0))).toMatch(/dgumbel's scale, β, must be above 0/);
    expect(thrown(() => n('drice', 1, -1, 1))).toMatch(/drice's distance, ν, must be 0 or more/);
    expect(thrown(() => n('dtri', 1, 0, 4, 5))).toMatch(/dtri's peak, c, must be from a to b/);
    expect(thrown(() => n('dtri', 1, 4, 0, 1))).toMatch(/upper end, b, must be above its lower end, a/);
    expect(thrown(() => n('qvonmises', 1.5, 0, 1))).toMatch(/probability must be from 0 to 1/);
    expect(thrown(() => n('dvonmises', 1, 0, -1))).toMatch(/concentration, κ, must be 0 or more/);
    expect(thrown(() => n('dpareto', 1, 0, 1))).toMatch(/least value, m, must be above 0/);
    // A huge κ would need a huge series: above 10⁶ it is refused, pointing to the normal distribution.
    expect(thrown(() => n('pvonmises', 0, 0, 1e9))).toMatch(/can be up to 10⁶; above that, use the normal distribution/);
  });
});
