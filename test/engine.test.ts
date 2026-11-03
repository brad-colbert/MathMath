import { describe, expect, test } from 'vitest';
import { type Outcome, runWorksheet } from '../src/engine/evaluate.js';
import { type Mat, type Num, type Value, getEl } from '../src/engine/values.js';

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
