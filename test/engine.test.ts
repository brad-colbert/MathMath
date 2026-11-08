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
import { type Outcome, runWorksheet } from '../src/engine/evaluate.js';
import { makeBuiltins } from '../src/engine/builtins.js';
import { type Mat, type Num, type Value, fromValues, getEl, num, str } from '../src/engine/values.js';

const getElNum = (m: Mat, i: number, j: number): number => (getEl(m, i, j) as Num).re;
import type { Worksheet } from '../src/model/ast.js';
import { compareResult } from '../src/score/compare.js';
import { call, define, evaluate, fnDefine, id, math, op, real, sheet, stat, vec } from './helpers.js';

const results = (ws: Worksheet): Outcome[] => runWorksheet(ws).filter((o) => o.region.content.k === 'eval');
const value = (ws: Worksheet, n = 0): Value => {
  const o = results(ws)[n]!;
  if (o.error) throw o.error;
  return o.value!;
};
const scalar = (ws: Worksheet, n = 0): number => (value(ws, n) as Num).re;
const list = (ws: Worksheet, n = 0): number[] => [...(value(ws, n) as Mat).re];

describe('evaluation order', () => {
  test('a use above its definition is undefined', () => {
    const ws = sheet([evaluate(id('x')), define(id('x'), real(1))]);
    expect(results(ws)[0]!.error?.kind).toBe('undefined');
  });

  test('a redefinition applies below it', () => {
    const ws = sheet([define(id('x'), real(1)), evaluate(id('x')), define(id('x'), real(2)), evaluate(id('x'))]);
    expect([scalar(ws, 0), scalar(ws, 1)]).toEqual([1, 2]);
  });

  test('a function keeps the values from where it was defined', () => {
    // Checked in Mathcad 14: the redefinition of x doesn't reach f.
    const ws = sheet([
      define(id('x'), real(1)),
      fnDefine('f', ['a'], op('plus', id('a'), id('x'))),
      define(id('x'), real(2)),
      evaluate(call('f', real(0))),
    ]);
    expect(scalar(ws)).toBe(1);
  });

  test('a global definition is visible above where it sits', () => {
    const ws = sheet([evaluate(id('x')), math(`<ml:globalDefine>${id('x')}${real(5)}</ml:globalDefine>`)]);
    expect(scalar(ws)).toBe(5);
  });

  test('a subscripted name is a different variable', () => {
    const ws = sheet([define(id('x'), real(1)), define(id('x', 'a'), real(2)), evaluate(id('x'))]);
    expect(scalar(ws)).toBe(1);
  });

  test('disabled regions neither define nor evaluate', () => {
    const off = define(id('x'), real(2)).replace('<math>', '<math disable-calc="true">');
    const ws = sheet([define(id('x'), real(1)), off, evaluate(id('x'))]);
    expect(scalar(ws)).toBe(1);
  });
});

describe('sums and products, as measured in Mathcad 14', () => {
  const lam = (v: string, body: string) => `<ml:lambda><ml:boundVars>${id(v)}</ml:boundVars>${body}</ml:lambda>`;
  const big = (kind: string, v: string, body: string, lo?: string, hi?: string) =>
    `<ml:apply><ml:${kind}/>${lam(v, body)}${lo ? `<ml:bounds>${lo}${hi}</ml:bounds>` : ''}</ml:apply>`;
  const u = (v: number, unit: string) => op('mult', real(v), id(unit));
  const first = (...regions: string[]) => results(sheet(regions))[0]!;
  const i010 = define(id('i'), stat('range', real(0), real(10)));

  test('with no limits, they run over a range variable', () => {
    expect(first(i010, evaluate(big('summation', 'i', op('pow', id('i'), real(2))))).value).toMatchObject({ re: 385 });
    expect(first(i010, evaluate(big('product', 'i', op('plus', id('i'), real(1))))).value).toMatchObject({ re: 39916800 });
    const t = define(id('t'), stat('range', stat('sequence', u(0, 's'), u(1, 's')), u(3, 's')));
    expect(first(t, evaluate(big('summation', 't', id('t')))).value).toMatchObject({ re: 6, dim: [0, 0, 1, 0, 0, 0, 0] });
    expect(first(define(id('x'), real(3)), evaluate(big('summation', 'x', id('x')))).error?.reason).toContain('range variable');
    expect(first(i010, evaluate(big('summation', 'i', big('summation', 'i', id('i'))))).error?.kind).toBe('runtime');
  });

  test('reversed limits count down', () => {
    expect(first(evaluate(big('summation', 'k', id('k'), real(3), real(1)))).value).toMatchObject({ re: 6 });
    expect(first(evaluate(big('product', 'k', id('k'), real(4), real(1)))).value).toMatchObject({ re: 24 });
    expect(first(evaluate(big('summation', 'k', id('k'), real(-2), real(2)))).value).toMatchObject({ re: 0 });
  });

  test('limits are whole numbers without units, and ∞ is refused', () => {
    for (const [lo, hi] of [[real(0.5), real(3)], [real(1), real(3.5)], [u(1, 's'), u(3, 's')]]) {
      expect(first(evaluate(big('summation', 'k', id('k'), lo, hi))).error?.kind).toBe('runtime');
    }
    expect(first(evaluate(big('summation', 'k', op('div', real(1), op('pow', id('k'), real(2))), real(1), id('∞')))).error?.reason).toContain('→');
  });

  test('Σ of a single number, or of a range variable, is an error', () => {
    expect(first(evaluate(op('vectorSum', real(3)))).error?.reason).toContain('$');
    expect(first(i010, evaluate(op('vectorSum', id('i')))).error?.kind).toBe('runtime');
    expect(first(evaluate(op('vectorSum', vec(1, 2, 4)))).value).toMatchObject({ re: 7 });
  });
});

describe('arrays', () => {
  test('range variables iterate implicitly', () => {
    const range = stat('range', real(1), real(3));
    const ws = sheet([define(id('i'), range), evaluate(op('pow', id('i'), real(2)))]);
    expect(list(ws)).toEqual([1, 4, 9]);
  });

  test('ranges with units follow Mathcad 14', () => {
    // Measured: a second value is required, units must match, and a 0 goes with any unit.
    const u = (v: number, unit: string) => op('mult', real(v), id(unit));
    const seq = (a: string, b: string) => stat('sequence', a, b);
    const run = (range: string) => results(sheet([define(id('q'), range), evaluate(id('q'))]))[0]!;
    expect(run(stat('range', seq(real(0), u(0.5, 's')), u(2, 's'))).value).toMatchObject({ rows: 5, dim: [0, 0, 1, 0, 0, 0, 0] });
    expect(list(sheet([define(id('q'), stat('range', seq(u(0, 'cm'), u(1, 'cm')), u(3, 'cm'))), evaluate(id('q'))]))).toEqual([0, 0.01, 0.02, 0.03]);
    for (const bad of [
      stat('range', u(0, 'cm'), u(3, 'cm')),
      stat('range', real(0), u(3, 'm')),
      stat('range', seq(real(1), u(1.5, 'm')), u(2, 'm')),
      stat('range', seq(u(0, 's'), u(0.5, 's')), real(2)),
      stat('range', seq(u(0, 's'), real(0.5)), u(2, 's')),
      stat('range', seq(u(0, 'm'), u(1, 's')), u(3, 'm')),
    ]) expect(run(bad).error?.kind).toBe('runtime');
  });

  test('defining a plain variable from a range variable is an error', () => {
    // Checked in Mathcad 14: it marks both `y := i^2` and later uses of y as errors.
    const ws = sheet([
      define(id('i'), stat('range', real(0), real(2))),
      define(id('y'), op('pow', id('i'), real(2))),
      evaluate(id('y')),
    ]);
    expect(results(ws)[0]!.error?.kind).toBe('runtime');
  });

  test('an indexed definition fills a vector across a range', () => {
    const range = stat('range', real(0), real(2));
    const ws = sheet([define(id('i'), range), define(op('indexer', id('v'), id('i')), op('mult', id('i'), real(2))), evaluate(id('v'))]);
    expect(list(ws)).toEqual([0, 2, 4]);
  });

  test('two vectors multiply to a dot product, and vectorize multiplies elements', () => {
    const product = op('mult', vec(1, 2), vec(3, 4));
    const ws = sheet([evaluate(product), evaluate(op('vectorize', product))]);
    expect(scalar(ws, 0)).toBe(11);
    expect(list(ws, 1)).toEqual([3, 8]);
  });

  test('a vector to a non-integer power works element by element', () => {
    const ws = sheet([evaluate(op('pow', vec(4, 9), real(0.5)))]);
    expect(list(ws)).toEqual([2, 3]);
  });

  test('a matrix is stored column by column', () => {
    const m = `<ml:matrix rows="2" cols="2">${[1, 2, 3, 4].map(real).join('')}</ml:matrix>`;
    const ws = sheet([evaluate(op('indexer', m, `<ml:sequence>${real(0)}${real(1)}</ml:sequence>`))]);
    expect(scalar(ws)).toBe(3);
  });

  test('array origin comes from the worksheet', () => {
    const ws = sheet([evaluate(op('indexer', vec(7, 8), real(1)))], 'array-origin="1" convergence-tolerance="0.001"');
    expect(scalar(ws)).toBe(7);
  });

  test('eigenvalues of a rotation form a complex pair', () => {
    const m = `<ml:matrix rows="2" cols="2">${[0, 1, -1, 0].map(real).join('')}</ml:matrix>`;
    const v = value(sheet([evaluate(call('eigenvals', m))])) as Mat;
    expect([...v.im!].map(Math.abs)).toEqual([1, 1]);
  });
});

describe('programs', () => {
  const lessThan = (a: string, b: string): string => op('lessThan', a, b);
  const local = (name: string, v: string): string => stat('localDefine', id(name), v);
  const ifThen = (cond: string, then: string): string => stat('ifThen', cond, then);
  const program = (...lines: string[]): string => stat('program', ...lines);

  test('otherwise is skipped after a taken if with a nested block', () => {
    const body = program(
      ifThen(lessThan(real(0), real(1)), program(local('a', real(1)))),
      stat('otherwise', program(local('a', real(2)))),
      id('a'),
    );
    expect(scalar(sheet([evaluate(body)]))).toBe(1);
  });

  test('consecutive ifs each run', () => {
    const yes = lessThan(real(0), real(1));
    const body = program(
      local('a', real(0)),
      ifThen(yes, local('a', op('plus', id('a'), real(1)))),
      ifThen(yes, local('a', op('plus', id('a'), real(1)))),
      id('a'),
    );
    expect(scalar(sheet([evaluate(body)]))).toBe(2);
  });

  test('otherwise is skipped if any earlier if in the run was taken', () => {
    // Checked in Mathcad 14. Pairing with the nearest `if` alone would give 101.
    const body = program(
      local('a', real(0)),
      ifThen(lessThan(real(0), real(1)), local('a', op('plus', id('a'), real(1)))),
      ifThen(lessThan(real(1), real(0)), local('a', op('plus', id('a'), real(10)))),
      stat('otherwise', local('a', op('plus', id('a'), real(100)))),
      id('a'),
    );
    expect(scalar(sheet([evaluate(body)]))).toBe(1);
  });

  test('otherwise runs when no earlier if did', () => {
    const no = lessThan(real(1), real(0));
    const body = program(ifThen(no, stat('return', real(1))), ifThen(no, stat('return', real(2))), stat('otherwise', real(3)));
    expect(scalar(sheet([evaluate(body)]))).toBe(3);
  });

  test('writing to a parameter leaves the caller unchanged', () => {
    const set = stat('localDefine', op('indexer', id('p'), real(0)), real(9));
    const ws = sheet([
      define(id('v'), vec(1, 2)),
      fnDefine('f', ['p'], stat('program', set, id('p'))),
      evaluate(call('f', id('v'))),
      evaluate(id('v')),
    ]);
    expect(list(ws, 0)).toEqual([9, 2]);
    expect(list(ws, 1)).toEqual([1, 2]);
  });

  test('a copy does not follow later writes', () => {
    const body = stat(
      'program',
      local('a', vec(1, 2)),
      stat('localDefine', op('indexer', id('a'), real(0)), real(5)),
      local('b', id('a')),
      stat('localDefine', op('indexer', id('a'), real(0)), real(6)),
      id('b'),
    );
    expect(list(sheet([evaluate(body)]))).toEqual([5, 2]);
  });

  test('a one-line program has no program wrapper', () => {
    const ws = sheet([fnDefine('f', ['x'], stat('return', op('plus', id('x'), real(1)))), evaluate(call('f', real(1)))]);
    expect(scalar(ws)).toBe(2);
  });

  test('a for loop can iterate a vector', () => {
    const body = stat('program', local('s', real(0)), stat('for', id('x'), vec(1, 2, 3), local('s', op('plus', id('s'), id('x')))), id('s'));
    expect(scalar(sheet([evaluate(body)]))).toBe(6);
  });
});

describe('names and numbers', () => {
  test('min is a unit as a value and a function when called', () => {
    const ws = sheet([evaluate(op('div', real(120), id('s'))), evaluate(id('min')), evaluate(call('min', real(3), real(4)))]);
    expect(scalar(ws, 1)).toBe(60);
    expect(scalar(ws, 2)).toBe(3);
  });

  test('atan2 treats negative zero as zero', () => {
    const negativeZero = op('div', real(0), real(-1));
    expect(scalar(sheet([evaluate(call('atan2', real(-1), negativeZero))]))).toBeCloseTo(Math.PI);
  });

  test('sheet definitions shadow units and built-ins', () => {
    expect(scalar(sheet([define(id('m'), real(3)), evaluate(id('m'))]))).toBe(3);
  });

  test('an integral carries the units of its bound', () => {
    const lambda = `<ml:lambda><ml:boundVars>${id('x')}</ml:boundVars>${real(2)}</ml:lambda>`;
    const bounds = `<ml:bounds>${real(0)}${op('mult', real(3), id('m'))}</ml:bounds>`;
    const v = value(sheet([evaluate(`<ml:apply><ml:integral/>${lambda}${bounds}</ml:apply>`)])) as Num;
    expect(v.re).toBeCloseTo(6);
    expect(v.dim[0]).toBe(1);
  });

  test('a limit or an indefinite integral needs symbolic evaluation', () => {
    const lambda = `<ml:lambda><ml:boundVars>${id('x')}</ml:boundVars>${id('x')}</ml:lambda>`;
    const o = results(sheet([evaluate(`<ml:apply><ml:integral/>${lambda}</ml:apply>`)]))[0]!;
    expect(o.error?.reason).toContain('symbolic');
  });

  test('provenance wrappers are transparent', () => {
    const meta = '<ml:originRef/><ml:parentRef/><ml:comment/><ml:originComment/><ml:contentHash/>';
    const wrap = (x: string): string => `<ml:provenance>${meta}${x}</ml:provenance>`;
    const ws = sheet([
      math(wrap(`<ml:define>${wrap(id('x'))}${wrap(real(4))}</ml:define>`)),
      math(`<ml:eval>${wrap(id('x'))}</ml:eval>`),
    ]);
    expect(scalar(ws)).toBe(4);
  });
});

describe('importing', () => {
  test('text regions keep their position and words', () => {
    const ws = sheet(['<text><p>Some  <b>notes</b></p></text>']);
    expect(ws.texts[0]).toMatchObject({ top: 0, text: 'Some notes' });
    expect(ws.regions).toEqual([]);
  });
});

describe('comparing with stored results', () => {
  const check = (region: string, setup: string[] = []): boolean => {
    const ws = sheet([...setup, region]);
    const o = runWorksheet(ws).at(-1)!;
    const c = o.region.content;
    if ((c.k !== 'define' && c.k !== 'eval') || !c.stored || !o.value) throw new Error('no result');
    return compareResult(o.value, c.stored, 1e-9, o.unit).ok;
  };
  const united = (v: number, unit: string): string =>
    `<ml:unitedValue>${real(v)}<ml:unitMonomial><ml:unitReference unit="${unit}"/></ml:unitMonomial></ml:unitedValue>`;

  test('a near miss fails', () => {
    expect(check(evaluate(real(2), real(2)))).toBe(true);
    expect(check(evaluate(real(2), real(2.00000001)))).toBe(false);
  });

  test('stored numbers are in display units', () => {
    const length = op('mult', real(2), id('m'));
    expect(check(evaluate(length, united(200, 'centimeter')))).toBe(true);
    expect(check(evaluate(length, united(2, 'centimeter')))).toBe(false);
  });

  test('stored temperatures carry their offset', () => {
    expect(check(evaluate(call('°C', real(20)), united(20, 'degC')))).toBe(true);
  });

  test('wrong dimensions fail', () => {
    expect(check(evaluate(op('mult', real(2), id('s')), united(2, 'meter')))).toBe(false);
  });

  test('a sheet-defined display unit divides the value', () => {
    const setup = [define(id('Q'), real(4))];
    expect(check(evaluate(real(8), real(2), id('Q')), setup)).toBe(true);
  });
});

describe('comparison with exact equality off', () => {
  const cmp = (a: number, b: number, exact: boolean) => {
    const ws = sheet([evaluate(op('lessThan', real(a), real(b))), evaluate(op('equal', real(a), real(b)))]);
    ws.exactCompare = exact;
    return runWorksheet(ws).map((o) => (o.value as { re: number }).re);
  };

  test('is exact by default', () => {
    expect(cmp(1, 1 + 1e-13, true)).toEqual([1, 0]);
  });

  test('takes numbers within a relative 1e-12 as equal, as Mathcad 14 does', () => {
    expect(cmp(1, 1.00000000000099, false)).toEqual([0, 1]);
    expect(cmp(1, 1.00000000000101, false)).toEqual([1, 0]);
    expect(cmp(-3.7e5, -370000.00000036636, false)).toEqual([0, 1]);
    expect(cmp(0, 1e-300, false)).toEqual([1, 0]);
  });

  test('is read from the sheet', () => {
    const on = sheet([]);
    expect(on.exactCompare).toBe(true);
  });
});

describe('global definitions', () => {
  test('a call written as a function with bound variables, as Mathcad saves some, is a call', () => {
    const rhs = `<ml:function>${id('max')}<ml:boundVars>${real(2)}${real(7)}</ml:boundVars></ml:function>`;
    const ws = sheet([math(`<ml:globalDefine>${id('m')}${rhs}</ml:globalDefine>`), evaluate(id('m'))]);
    expect((results(ws)[0]!.value as Num).re).toBe(7);
  });
});

describe('Mathcad calling conventions', () => {
  test('fewer arguments than parameters give a function of the rest', () => {
    const ws = sheet([
      fnDefine('f', ['a', 'b', 'c'], op('plus', op('mult', real(100), id('a')), op('plus', op('mult', real(10), id('b')), id('c')))),
      define(id('g'), call('f', real(1), real(2))),
      evaluate(call('g', real(3))),
      evaluate(call('f', real(1), real(2))),
    ]);
    const out = results(ws);
    expect((out[0]!.value as Num).re).toBe(123);
    expect(out[1]!.value?.t).toBe('fn');
  });

  test('a derivative at a range is taken at each value', () => {
    const d = `<ml:apply><ml:derivative/><ml:lambda><ml:boundVars>${id('x')}</ml:boundVars><ml:apply><ml:pow/>${id('x')}${real(2)}</ml:apply></ml:lambda></ml:apply>`;
    const ws = sheet([math(`<ml:define>${id('x')}<ml:range>${real(1)}${real(3)}</ml:range></ml:define>`), evaluate(d)]);
    const m = results(ws)[0]!.value as Mat;
    expect(m.rows).toBe(3);
    expect([...m.re].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([2, 4, 6]);
  });
});

describe('the nth derivative', () => {
  // Mathcad 14's dⁿ/dxⁿ (Ctrl+Shift+/), saved as a derivative with a <degree>.
  const nth = (v: string, body: string, n: string) =>
    `<ml:apply><ml:derivative/><ml:lambda><ml:boundVars>${id(v)}</ml:boundVars>${body}</ml:lambda><ml:degree>${n}</ml:degree></ml:apply>`;
  const at = (x: string, ...rest: string[]) => results(sheet([math(`<ml:define>${id('x')}${x}</ml:define>`), ...rest]));
  const exp = `<ml:apply>${id('exp')}${id('x')}</ml:apply>`;
  test('of eˣ at 1, orders 0 to 5, as close as Mathcad 14', () => {
    // Mathcad 14 was off from e by 0, 1·10⁻¹⁴, 3·10⁻¹³, 3·10⁻¹¹, 3·10⁻⁹ and 9·10⁻⁸ relative.
    const out = at(real(1), ...[0, 1, 2, 3, 4, 5].map((n) => evaluate(nth('x', exp, real(n)))));
    const digits = [15, 12, 11, 9, 8, 6];
    out.forEach((o, n) => expect((o.value as Num).re).toBeCloseTo(Math.E, digits[n]));
  });
  test('orders past 5, or not whole, are refused, as in Mathcad', () => {
    const out = at(real(1), evaluate(nth('x', exp, real(6))), evaluate(nth('x', exp, real(2.5))));
    expect(out[0]!.error?.reason).toMatch(/whole number from 0 to 5, not 6/);
    expect(out[1]!.error?.reason).toMatch(/not 2\.5/);
  });
  test('an order from a variable, and a polynomial', () => {
    const out = at(real(2), math(`<ml:define>${id('n')}${real(3)}</ml:define>`), evaluate(nth('x', exp, id('n'))),
      evaluate(nth('x', `<ml:apply><ml:pow/>${id('x')}${real(5)}</ml:apply>`, real(5))));
    expect((out[0]!.value as Num).re).toBeCloseTo(Math.exp(2), 9);
    expect((out[1]!.value as Num).re).toBeCloseTo(120, 8);
  });
  test('far from 0, where the step must shrink well below the point', () => {
    // d³/dz³ ln z at 1000 is 2·10⁻⁹ (Mathcad 14: 2.0000000002·10⁻⁹); d²/dx² sin x at 1000 is −sin 1000.
    const out = at(real(1000), evaluate(nth('x', `<ml:apply>${id('ln')}${id('x')}</ml:apply>`, real(3))),
      evaluate(nth('x', `<ml:apply>${id('sin')}${id('x')}</ml:apply>`, real(2))));
    expect((out[0]!.value as Num).re / 2e-9).toBeCloseTo(1, 8);
    expect((out[1]!.value as Num).re).toBeCloseTo(-Math.sin(1000), 9);
  });
  test('in units: d²/dw² w³ at 2 m is 12 m', () => {
    const v = at(`<ml:apply><ml:mult/>${real(2)}${id('m')}</ml:apply>`, evaluate(nth('x', `<ml:apply><ml:pow/>${id('x')}${real(3)}</ml:apply>`, real(2))))[0]!.value as Num;
    expect(v.re).toBeCloseTo(12, 10);
    expect(v.dim).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  test('at a range, at each value', () => {
    const m = at(`<ml:range>${real(1)}${real(3)}</ml:range>`, evaluate(nth('x', `<ml:apply><ml:pow/>${id('x')}${real(3)}</ml:apply>`, real(2))))[0]!.value as Mat;
    expect([...m.re].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([6, 12, 18]);
  });
});

describe("Mathcad's zero-over-zero option", () => {
  const run = (on: boolean, a: string, b: string) => {
    const ws = sheet([evaluate(op('div', a, b))]);
    ws.zeroOverZero = on;
    return results(ws)[0]!;
  };

  test('is off by default, so 0/0 is an error', () => {
    expect(sheet([]).zeroOverZero).toBe(false);
    expect(run(false, real(0), real(0)).error?.reason).toContain('division by zero');
  });

  test('makes 0/0 zero, element by element, and leaves 1/0 an error', () => {
    expect((run(true, real(0), real(0)).value as Num).re).toBe(0);
    expect([...(run(true, vec(0, 4), vec(0, 2)).value as Mat).re]).toEqual([0, 2]);
    expect(run(true, real(1), real(0)).error?.reason).toContain('division by zero');
  });
});

describe('histograms', () => {
  test('histogram(n, data) gives midpoints and counts; the smallest value counts in the first interval', () => {
    const ws = sheet([evaluate(call('histogram', real(2), vec(0, 1, 2, 3, 4)))]);
    const m = results(ws)[0]!.value as Mat;
    expect([m.rows, m.cols]).toEqual([2, 2]);
    expect([0, 1].map((i) => (getElNum(m, i, 0)))).toEqual([1, 3]);
    expect([0, 1].map((i) => (getElNum(m, i, 1)))).toEqual([3, 2]);
  });

  test('hist(bounds, data) counts a boundary value in the interval to its left', () => {
    const ws = sheet([evaluate(call('hist', vec(0, 2, 4), vec(0, 1, 2, 3, 4)))]);
    expect([...(results(ws)[0]!.value as Mat).re]).toEqual([2, 2]);
  });
});

describe('scoring', () => {
  test('a result that depends on an integral, at any remove, gets the looser tolerance', async () => {
    const { scoreSheet } = await import('../src/score/sheet.js');
    const integral = `<ml:apply><ml:integral/><ml:lambda><ml:boundVars>${id('x')}</ml:boundVars>${id('x')}</ml:lambda><ml:bounds>${real(0)}${real(1)}</ml:bounds></ml:apply>`;
    const ws = sheet([
      define(id('a'), integral),
      define(id('b'), op('mult', real(2), id('a'))),
      evaluate(id('b'), real(1.001)),
      evaluate(op('mult', real(2), real(0.5)), real(1.001)),
    ]);
    const s = scoreSheet(ws);
    expect([s.match, s.mismatch]).toEqual([1, 1]);
  });
});

describe('determinant', () => {
  test('|M| on a square matrix is the signed determinant, as in Mathcad 14', () => {
    const A = '<ml:matrix rows="2" cols="2">' + [1, 3, 2, 4].map(real).join('') + '</ml:matrix>';
    expect(results(sheet([evaluate(op('absval', A))]))[0]!.value).toMatchObject({ re: -2 });
    expect(results(sheet([evaluate(op('determinant', A))]))[0]!.value).toMatchObject({ re: -2 });
    expect(results(sheet([evaluate(op('absval', vec(3, -4)))]))[0]!.value).toMatchObject({ re: 5 });
  });
});

describe('splines and smoothing, as measured in Mathcad 14', () => {
  const vx = vec(0, 1, 2, 3, 4, 5);
  const vy = vec(0, 1, 0, 2, 1, 3);
  const xs = vec(-0.5, 0.3, 2.5, 4.7, 5, 6);
  const run = (expr: string) => results(sheet([evaluate(expr)]))[0]!;
  const nums = (expr: string): number[] => {
    const o = run(expr);
    if (o.error) throw new Error(o.error.reason);
    const v = o.value!;
    return v.t === 'num' ? [v.re] : [...(v as Mat).re];
  };
  const close = (got: number[], want: number[]) => {
    expect(got.length).toBe(want.length);
    got.forEach((g, i) => expect(Math.abs(g - want[i]!)).toBeLessThan(1e-12 * Math.max(1, Math.abs(want[i]!))));
  };

  test('lspline, pspline and cspline differ at the ends, and interp continues the end cubic', () => {
    close(nums(call('lspline', vx, vy)), [0, 3, 0, 0, -4.937799043062201, 7.751196172248805, -8.066985645933015, 6.516746411483254, 0]);
    close(nums(call('pspline', vx, vy)), [0, 3, 1, -3.875, -3.875, 7.375, -7.625, 5.125, 5.125]);
    close(nums(call('cspline', vx, vy)), [0, 3, 2, -10.733333333333334, -2, 6.733333333333333, -6.933333333333334, 3, 12.933333333333334]);
    close(nums(call('interp', call('lspline', vx, vy), vx, vy, xs)), [-0.80861244019138745, 0.52466985645933006, 1.0197368421052631, 2.1034880382775123, 3, 5]);
    close(nums(call('interp', call('cspline', vx, vy), vx, vy, xs)), [-3.979166666666667, 1.0296333333333334, 1.0125, 1.4939666666666673, 3, 17.933333333333337]);
  });

  test('cspline runs the curvature on linearly in x, when points are uneven', () => {
    const ux = vec(0, 0.5, 2, 3, 4.5, 7);
    const m = nums(call('cspline', ux, vy)).slice(3);
    expect(m[0]! - m[1]!).toBeCloseTo(((m[1]! - m[2]!) * 0.5) / 1.5, 12);
  });

  test('bspline passes through the data with breaks where asked, stored as Mathcad stores it', () => {
    const u2 = vec(0, 1.25, 2.5, 3.75, 5);
    const b = run(call('bspline', vx, vy, u2, real(2))).value as Mat;
    expect([b.rows, b.cols, (b.cells![0] as { re: number }).re]).toEqual([3, 1, 4]);
    close([...(b.cells![2] as Mat).re], [0, 1.25, 1.25, 2.5, 2.5, 3.75, 3.75, 5]);
    close(nums(call('interp', call('bspline', vx, vy, u2, real(2)), vx, vy, xs)), [-2.1857954545454557, 0.77202272727272758, 1.0028409090909136, 1.7800227272727085, 3, 10.904545454545456]);
    close(nums(call('interp', call('bspline', vx, vy, vx, real(1)), vx, vy, xs)), [-0.5, 0.3, 1, 2.4, 3, 5]);
    expect(run(call('bspline', vx, vy, vx, real(2))).error?.reason).toContain('fewer break points');
  });

  test('medsmooth takes running medians, with the window cut short at the ends', () => {
    const w = vec(5, 1, 4, 2, 8, 3, 7, 6, 0, 9);
    close(nums(call('medsmooth', w, real(3))), [3, 4, 2, 4, 3, 7, 6, 6, 6, 4.5]);
    close(nums(call('medsmooth', w, real(5))), [4, 3, 4, 3, 4, 6, 6, 6, 6.5, 6]);
    expect(run(call('medsmooth', w, real(4))).error?.reason).toContain('odd');
  });

  test('2-D splines interpolate on a grid', () => {
    const grid = '<ml:matrix rows="4" cols="2">' + [0, 1, 2, 3, 0, 1, 2, 3].map(real).join('') + '</ml:matrix>';
    const z = '<ml:matrix rows="4" cols="4">' + [0, 1, 4, 9, 1, 2, 5, 10, 4, 5, 8, 13, 9, 10, 13, 18.5].map(real).join('') + '</ml:matrix>';
    close(nums(call('interp', call('lspline', grid, z), grid, z, vec(1.5, 2.25))), [7.31265625]);
    close(nums(call('interp', call('pspline', grid, z), grid, z, vec(0.4, 2.9))), [8.58265625]);
    close(nums(call('interp', call('cspline', grid, z), grid, z, vec(1.5, 2.25))), [7.308837890625]);
  });
});

describe('matrix functions, as measured in Mathcad 14', () => {
  const m = (rows: number[][]) => `<ml:matrix rows="${rows.length}" cols="${rows[0]!.length}">${rows[0]!.map((_, j) => rows.map((r) => real(r[j]!)).join('')).join('')}</ml:matrix>`;
  const A = m([[1, 2], [3, 4]]);
  const S = m([[4, 1, 2], [1, 3, 0], [2, 0, 5]]);
  const R = m([[1, 2], [3, 4], [5, 6]]);
  const Z = m([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  const P = m([[2, 1, 1], [4, -6, 0], [-2, 7, 2]]);
  const get = (expr: string): number[] => {
    const o = results(sheet([evaluate(expr)]))[0]!;
    if (o.error) throw new Error(o.error.reason);
    const v = o.value!;
    return v.t === 'num' ? [v.re] : [...(v as Mat).re];
  };
  const close = (got: number[], want: number[], tol = 1e-12) => {
    expect(got.length).toBe(want.length);
    got.forEach((g, i) => expect(Math.abs(g - want[i]!)).toBeLessThan(tol * Math.max(1, Math.abs(want[i]!))));
  };

  test('solving, rank and reduced row echelon form', () => {
    close(get(call('lsolve', S, vec(1, 2, 3))), [-0.302325581395349, 0.767441860465116, 0.72093023255814]);
    close(get(call('rank', Z)), [2]);
    close(get(call('rref', Z)), [1, 0, 0, 0, 1, 0, -1, 2, 0]);
    close(get(call('diag', vec(1, 2, 3))), [1, 0, 0, 0, 2, 0, 0, 0, 3]);
  });

  test('norms and condition numbers', () => {
    close(['norm1', 'norm2', 'norme', 'normi'].flatMap((f) => get(call(f, A))), [6, 5.4649857042190435, 5.477225575051661, 7]);
    close(['cond1', 'cond2', 'conde', 'condi'].flatMap((f) => get(call(f, A))), [21, 14.933034373659259, 15, 21]);
  });

  test('singular values, svd as U over V, and the generalized inverse', () => {
    close(get(call('svds', R)), [9.525518091565107, 0.514300580658644]);
    close(get(call('svd', A)), [0.40455358483375703, 0.91451429567730447, 0.57604843676632056, 0.81741556047036334, 0.91451429567730447, -0.40455358483375703, -0.81741556047036334, 0.57604843676632056]);
    close(get(call('geninv', R)), [-1.3333333333333326, 1.0833333333333333, -0.33333333333333404, 0.33333333333333409, 0.666666666666667, -0.41666666666666707]);
  });

  test('lu pivots as Mathcad does, weighing each row by its largest element', () => {
    close(get(call('lu', A)), [0, 1, 1, 0, 1, 1 / 3, 0, 1, 3, 0, 4, 2 / 3]);
    // P's first row wins on its own scale, though 4 is larger than 2.
    expect(get(call('lu', P)).slice(0, 9)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    close(get(call('cholesky', S)), [2, 0.5, 1, 0, 1.6583123951777, -0.30151134457776363, 0, 0, 1.9771421064483223]);
  });

  test('eigenvectors are unit columns in eigenvals order, with Mathcad\'s signs where measured', () => {
    close(get(call('eigenvecs', A)), [-0.824564840132394, 0.565767464968992, -0.415973557919284, -0.909376709132124], 1e-10);
    close(get(call('eigenvecs', S)), [-0.631179, -0.172027, -0.75632, -0.679313, 0.593233, 0.431981, -0.374362, -0.786436, 0.491296], 1e-5);
    close(get(call('eigenvec', A, real(5.37228132326901))), [0.415973557919284, 0.909376709132124], 1e-9);
    expect(results(sheet([evaluate(call('eigenvec', S, real(2)))]))[0]!.error?.reason).toContain("isn't an eigenvalue");
  });

  test('qr gives Q·R = M with an orthogonal Q', () => {
    const qrA = get(call('qr', R));
    const Q = [0, 1, 2].map((i) => [0, 1, 2].map((j) => qrA[i + 3 * j]!));
    const Rr = [0, 1, 2].map((i) => [0, 1].map((j) => qrA[i + 3 * (3 + j)]!));
    const back = [0, 1, 2].map((i) => [0, 1].map((j) => Q[i]!.reduce((t, q, k) => t + q * Rr[k]![j]!, 0)));
    close(back.flat(), [1, 2, 3, 4, 5, 6]);
  });
});

describe('speed-ups that must not change answers', () => {
  test('a vector filled one element at a time over a range comes out whole', () => {
    const ws = sheet([
      define(id('i'), stat('range', real(0), real(999))),
      define(op('indexer', id('v'), id('i')), op('mult', id('i'), real(2))),
      evaluate(id('v')),
    ]);
    const v = results(ws)[0]!.value as Mat;
    expect([v.rows, v.re[0], v.re[500], v.re[999]]).toEqual([1000, 0, 1000, 1998]);
  });

  test('a recurrence reads the elements filled before it', () => {
    const ws = sheet([
      define(id('i'), stat('range', real(1), real(20))),
      define(op('indexer', id('f'), real(0)), real(1)),
      define(op('indexer', id('f'), id('i')), op('mult', op('indexer', id('f'), op('minus', id('i'), real(1))), real(2))),
      evaluate(op('indexer', id('f'), real(20))),
    ]);
    expect(results(ws)[0]!.value).toMatchObject({ re: 2 ** 20 });
  });

  test('a column taken again after the matrix changes sees the change', () => {
    const M = '<ml:matrix rows="2" cols="2">' + [1, 2, 3, 4].map(real).join('') + '</ml:matrix>';
    const col0 = op('matcol', id('M'), real(0));
    const ws = sheet([
      define(id('M'), M),
      define(id('a'), col0),
      define(op('indexer', id('M'), real(1), real(0)), real(9)),
      evaluate(col0),
      evaluate(id('a')),
    ]);
    const [after, before] = results(ws).map((o) => [...(o.value as Mat).re]);
    expect(after).toEqual([1, 9]);
    expect(before).toEqual([1, 2]);
  });

  test('a later definition hides an earlier one, and a function sees only what was above it', () => {
    const ws = sheet([
      define(id('k'), real(1)),
      fnDefine('f', ['x'], op('plus', id('x'), id('k'))),
      define(id('k'), real(100)),
      evaluate(call('f', real(1))),
      evaluate(id('k')),
    ]);
    expect(results(ws).map((o) => (o.value as { re: number }).re)).toEqual([2, 100]);
  });
});

describe('random numbers', () => {
  const values = (ws: Worksheet, n = 0): number[] => {
    const v = results(ws)[n]!.value!;
    return v.t === 'num' ? [v.re] : [...(v as Mat).re];
  };
  const filled = () => sheet([
    define(id('i'), stat('range', real(0), real(99))),
    define(op('indexer', id('x'), id('i')), call('rnd', real(10))),
    evaluate(id('x')),
    evaluate(call('rnd', real(10))),
  ]);

  test('rnd(x) is uniform in [0, x), different for each element and each region', () => {
    const x = values(filled());
    expect(x.length).toBe(100);
    expect(x.every((v) => v >= 0 && v < 10)).toBe(true);
    expect(new Set(x).size).toBe(100);
    expect(values(filled(), 1)[0]).not.toBe(x[0]);
  });

  test('a sheet draws the same numbers every time it calculates', () => {
    expect(values(filled())).toEqual(values(filled()));
  });

  test("rnd keeps its argument's units", () => {
    const v = results(sheet([evaluate(call('rnd', op('mult', real(5), id('m'))))]))[0]!.value as Num;
    expect(v.dim).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(v.re >= 0 && v.re < 5).toBe(true);
  });

  test('runif and rnorm give m values with about the right spread', () => {
    const u = values(sheet([evaluate(call('runif', real(4000), real(2), real(4)))]));
    expect(u.length).toBe(4000);
    expect(u.every((v) => v >= 2 && v < 4)).toBe(true);
    expect(Math.abs(u.reduce((a, b) => a + b, 0) / u.length - 3)).toBeLessThan(0.05);
    const g = values(sheet([evaluate(call('rnorm', real(4000), real(5), real(2)))]));
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length);
    expect(Math.abs(mean - 5)).toBeLessThan(0.15);
    expect(Math.abs(sd - 2)).toBeLessThan(0.15);
    expect(results(sheet([evaluate(call('runif', real(2.5), real(0), real(1)))]))[0]!.error?.reason).toContain('whole number');
  });

  test('the scoreboard leaves out answers that depend on random numbers', async () => {
    const { scoreSheet } = await import('../src/score/sheet.js');
    const ws = sheet([
      define(id('r'), call('rnd', real(1))),
      define(id('s'), op('plus', id('r'), real(1))),
      evaluate(id('s'), real(1.5)),
      evaluate(op('mult', id('r'), real(0)), real(0)),
      evaluate(real(2), real(2)),
    ]);
    const s = scoreSheet(ws);
    // The draw misses Mathcad's, so it's left out; an answer that doesn't hang on the draw still counts.
    expect([s.excluded, s.match]).toEqual([1, 2]);
  });
});

describe('length, last and the file functions, as Mathcad 14 has them', () => {
  const B = makeBuiltins(0);
  const call1 = (fn: string, v: Value): Value => B.get(fn)!.call([v]);
  const column = fromValues(3, 1, [num(1), num(2), num(3)]);
  test('length and last take a column vector', () => {
    expect((call1('length', column) as Num).re).toBe(3);
    expect((call1('last', column) as Num).re).toBe(2);
  });
  test('a matrix or a row is refused, as Mathcad refuses it', () => {
    expect(() => call1('length', fromValues(2, 3, [1, 2, 3, 4, 5, 6].map((v) => num(v))))).toThrow(/one column: this has 3 columns/);
    expect(() => call1('last', fromValues(1, 3, [num(1), num(2), num(3)]))).toThrow(/one column/);
  });
  test("each of Mathcad's file functions names what to use instead", () => {
    const why = (fn: string): string => {
      try {
        B.get(fn)!.call([str('a.prn')]);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    };
    expect(why('READPRN')).toMatch(/adds readTable/);
    expect(why('READRGB')).toMatch(/adds readImage/);
    expect(why('READ_RED')).toMatch(/adds readImage/);
    expect(why('READBIN')).toMatch(/can't read binary/);
    expect(why('WRITEBMP')).toMatch(/writeImage/);
    expect(why('WRITEPRN')).toMatch(/doesn't write data files/);
  });
});
