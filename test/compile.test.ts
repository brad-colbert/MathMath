import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import type { Mat, Num, Value } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';
import type { Stmt, Expr } from '../src/model/ast.js';

// Programs run as compiled closures (src/engine/compile.ts). These check the meanings they must keep.
const P = (...lines: string[]): string => `\\begin{array}{|l}${lines.join("\\\\")}\\end{array}`;

/** Runs regions top to bottom, with optional sheet settings; gives each outcome's value or error. */
function run(lines: (string | { k: 'define'; target: unknown; value: Expr })[], settings: Record<string, unknown> = {}) {
  const ws = { ...emptyWorksheet(), ...settings };
  ws.regions = lines.map((l, i) => ({
    id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false,
    content: typeof l === 'string' ? readRegion(l) : (l as never),
  }));
  return runWorksheet(ws).map((o) => (o.error ? { error: o.error } : { value: o.value as Value }));
}
const re = (v: Value | undefined): number => (v as Num).re;

// Programs are easier to build as trees than to type as LaTeX.
const id = (name: string): Expr => ({ k: 'id', name });
const R = (v: number): Expr => ({ k: 'real', v });
const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });
const program = (...body: Stmt[]): Expr => ({ k: 'program', body });
const set = (name: string, value: Expr): Stmt => ({ k: 'assign', target: { k: 'var', name }, value });
const setAt = (name: string, index: Expr[], value: Expr): Stmt => ({ k: 'assign', target: { k: 'index', name, index }, value });
const define = (name: string, params: string[] | null, value: Expr) => ({
  k: 'define' as const, target: params ? { k: 'fn', name, params } : { k: 'var', name }, value, global: false, stored: null, unit: null, shown: false,
});
const range = (first: Expr, last: Expr): Expr => ({ k: 'range', first, second: null, last });

describe('compiled programs', () => {
  test("a program that changes its argument's elements leaves the caller's matrix alone", () => {
    const out = run([
      'M\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}',
      define('f', ['A'], program(setAt('A', [R(0)], R(99)), { k: 'expr', e: id('A') })),
      'f\\left(M\\right)=',
      'M=',
    ]);
    expect([...(out[2]!.value as Mat).re]).toEqual([99, 2, 3]);
    expect([...(out[3]!.value as Mat).re]).toEqual([1, 2, 3]);
  });

  test('indexed assignment grows a vector, in a loop', () => {
    const body = program(
      { k: 'for', varName: 'i', iter: range(R(0), R(4)), body: setAt('v', [id('i')], op('pow', id('i'), R(2))) },
      { k: 'expr', e: id('v') },
    );
    const out = run([define('g', ['n'], body), 'g\\left(1\\right)=']);
    expect([...(out[1]!.value as Mat).re]).toEqual([0, 1, 4, 9, 16]);
  });

  test('units carry through, and mismatched ones are refused', () => {
    const out = run([
      define('h', ['x'], program(set('y', op('mult', id('x'), id('m'))), { k: 'expr', e: op('plus', id('y'), op('mult', R(2), id('m'))) })),
      'h\\left(3\\right)=',
      define('k', ['x'], program({ k: 'expr', e: op('plus', id('x'), id('m')) })),
      'k\\left(3\\right)=',
    ]);
    expect(re(out[1]!.value)).toBe(5);
    expect([...(out[1]!.value as Num).dim]).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(out[3]!.error?.reason).toMatch(/units do not match/);
  });

  test('return leaves a loop at once; if and otherwise follow the run', () => {
    const find = program(
      { k: 'for', varName: 'i', iter: range(R(0), R(100)), body: { k: 'if', cond: op('greaterThan', op('pow', id('i'), R(2)), id('x')), then: { k: 'return', value: id('i') } } },
      { k: 'expr', e: R(-1) },
    );
    const sign = program(
      { k: 'if', cond: op('lessThan', id('x'), R(0)), then: set('s', R(-1)) },
      { k: 'if', cond: op('equal', id('x'), R(0)), then: set('s', R(0)) },
      { k: 'otherwise', then: set('s', R(1)) },
      { k: 'expr', e: id('s') },
    );
    const out = run([define('first', ['x'], find), 'first\\left(50\\right)=', define('sg', ['x'], sign), 'sg\\left(-4\\right)=', 'sg\\left(0\\right)=', 'sg\\left(7\\right)=']);
    expect(re(out[1]!.value)).toBe(8);
    // −4 takes the first if, so otherwise, which follows a second if not taken, still doesn't run.
    expect([re(out[3]!.value), re(out[4]!.value), re(out[5]!.value)]).toEqual([-1, 0, 1]);
  });

  test('while runs until its condition fails', () => {
    const halve = program({ k: 'while', cond: op('greaterThan', id('x'), R(1)), body: set('x', op('div', id('x'), R(2))) }, { k: 'expr', e: id('x') });
    expect(re(run([define('hv', ['x'], halve), 'hv\\left(40\\right)='])[1]!.value)).toBe(0.625);
  });

  test("the sheet's comparison and zero-over-zero settings apply inside programs", () => {
    const eq = program({ k: 'expr', e: op('equal', op('plus', R(0.1), R(0.2)), R(0.3)) });
    const zz = program({ k: 'expr', e: op('div', R(0), id('x')) });
    expect(re(run([define('q', ['x'], eq), 'q\\left(0\\right)='])[1]!.value)).toBe(0);
    expect(re(run([define('q', ['x'], eq), 'q\\left(0\\right)='], { exactCompare: false })[1]!.value)).toBe(1);
    expect(run([define('z', ['x'], zz), 'z\\left(0\\right)='])[1]!.error?.reason).toMatch(/division by zero/);
    expect(re(run([define('z', ['x'], zz), 'z\\left(0\\right)='], { zeroOverZero: true })[1]!.value)).toBe(0);
  });

  test('an undefined name inside a program is reported by name', () => {
    const out = run([define('u', ['x'], program({ k: 'expr', e: op('plus', id('x'), id('nowhere')) })), 'u\\left(1\\right)=']);
    expect(out[1]!.error?.kind).toBe('undefined');
    expect(out[1]!.error?.reason).toMatch(/nowhere/);
  });

  test('a typed program calculates', () => {
    const out = run([`w\\left(x\\right)\\coloneq ${P('y\\gets x+1', 'y\\cdot 2')}`, 'w\\left(4\\right)=']);
    expect(out[1]!.error ?? re(out[1]!.value)).toBe(10);
  });
});
