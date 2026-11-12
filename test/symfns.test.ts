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
import { type Num, num } from '../src/engine/values.js';
import type { Content, Expr } from '../src/model/ast.js';
import { Printer, buildRequest, readAnswer } from '../src/symbolic/giac.js';
import { readTex, tex } from '../src/latex/latex.js';

/** mpmath's values at 613 points (test/symfns-reference.py); a complex argument is [re, im]. */
type Point = [string, (number | [number, number])[], number, number];
const REF = JSON.parse(readFileSync(new URL('./symfns-reference.json', import.meta.url), 'utf8')) as Point[];
const B = makeBuiltins(0);
const call = (fn: string, ...args: (number | [number, number])[]): Num =>
  B.get(fn)!.call(args.map((a) => (Array.isArray(a) ? num(a[0], undefined, a[1]) : num(a)))) as Num;

describe('values, against mpmath', () => {
  test.each(REF.map((p) => [`${p[0]}(${p[1].join(', ')})`, p] as const))('%s', (_, [fn, args, re, im]) => {
    const v = call(fn, ...args);
    const err = Math.hypot(v.re - re, v.im - im);
    expect(err <= 1e-12 * Math.hypot(re, im) || err < 1e-15).toBe(true);
  });
});

describe('values, as Mathcad 14 gives them with float (probed 2026-11-11)', () => {
  const cases: [string, number[], number, number?][] = [
    ['Si', [2], 1.6054129768026948486], ['Ci', [2], 0.4229808287748649957], ['Ci', [-2], 0.4229808287748649957, Math.PI],
    ['Si', [100], 1.5622254668890562934], ['Ci', [0.001], -6.3305398640805937748],
    ['Ei', [1], 1.8951178163559367555], ['Ei', [-1], -0.21938393439552027368], ['Ei', [1, 1], 0.21938393439552027368], ['Ei', [2, 1], 0.14849550677592204792],
    ['FresnelS', [1], 0.43825914739035476608], ['FresnelC', [1], 0.77989340037682282947], ['FresnelS', [2.5], 0.61918175581959293611],
    ['dilog', [2], -0.82246703342411321824], ['dilog', [0.5], 0.5822405264650125059], ['dilog', [-1], 2.4674011002723396547, -2.177586090303602],
    ['Zeta', [3], 1.2020569031595942854], ['Zeta', [0.5], -1.4603545088095868129], ['Zeta', [-1], -1 / 12],
    ['Psi', [2.5], 0.70315664064524318723], ['Psi', [1, 2.5], 0.49035775610023486497], ['Psi', [2, 1], -2.4041138063191885708],
    ['LambertW', [1], 0.567143290409783873], ['LambertW', [-1, -0.2], -2.5426413577735264243], ['LambertW', [1, 2], -0.83431036663111001469, 4.5302659985550084],
    ['IsPrime', [97], 1], ['IsPrime', [91], 0],
  ];
  test.each(cases.map((c) => [`${c[0]}(${c[1].join(', ')})`, c] as const))('%s', (_, [fn, args, re, im = 0]) => {
    const v = call(fn, ...args);
    expect(v.re).toBeCloseTo(re, 14);
    expect(v.im).toBeCloseTo(im, 14);
  });
  test('LambertW(−0.2) is −0.2592, where Mathcad 14 gives 0', () => {
    expect(call('LambertW', -0.2).re).toBeCloseTo(-0.25917110181907374, 15);
  });
});

describe('IsPrime', () => {
  test.each([[0, 0], [1, 0], [2, 1], [-7, 0], [561, 0], [7919, 1], [1000003 * 1000003, 0], [9007199254740881, 1], [9007199254740991, 0], [3215031751, 0]])('IsPrime(%d) = %d', (n, want) => {
    expect(call('IsPrime', n).re).toBe(want);
  });
  test('refuses a fraction', () => {
    expect(() => call('IsPrime', 2.5)).toThrow(/whole number/);
  });
});

describe('refusals', () => {
  test.each([
    ['Ci', [0], /singularity/], ['Chi', [0], /singularity/], ['Ei', [0], /singularity/], ['Zeta', [1], /singularity/], ['Psi', [-2], /singularity/],
    ['Psi', [1.5, 2], /whole number/], ['Ei', [1, -1], /above 0/], ['LambertW', [-1, 0], /−∞/], ['Si', [[1, 1]], /real/],
  ] as [string, (number | [number, number])[], RegExp][])('%s(%j)', (fn, args, why) => {
    expect(() => call(fn, ...args)).toThrow(why);
  });
  test.each([['Shi', [800]], ['Chi', [800]], ['Ei', [718]], ['Psi', [200, 1]]] as [string, number[]][])('%s(%j) overflows, and says so', (fn, args) => {
    expect(() => call(fn, ...args)).toThrow(/too large/);
  });
  test('LambertW at the branch point, −1/e, is −1 on both branches that meet there', () => {
    expect(call('LambertW', -1 / Math.E).re).toBe(-1);
    expect(call('LambertW', -1, -1 / Math.E).re).toBe(-1);
  });
  test('numer and denom with = point to →', () => {
    expect(() => B.get('numer')!.call([num(3)])).toThrow(/→/);
    expect(() => B.get('denom')!.call([num(3)])).toThrow(/→/);
  });
  test('a wrong number of arguments', () => {
    expect(() => B.get('Si')!.call([num(1), num(2)])).toThrow(/takes 1 argument/);
  });
});

describe('with →, through Giac', () => {
  const R = (v: number): Expr => ({ k: 'real', v });
  const V = (name: string): Expr => ({ k: 'id', name });
  const F = (name: string, ...args: Expr[]): Expr => ({ k: 'call', fn: V(name), args });
  const op2 = (o: string, a: Expr, b: Expr): Expr => ({ k: 'op', op: o, args: [a, b] });
  const sym = (expr: Expr, ...names: string[]): Extract<Content, { k: 'sym' }> =>
    ({ k: 'sym', target: null, global: false, expr, commands: names.map((name) => ({ name, args: [] })), stored: null });
  const request = (c: Extract<Content, { k: 'sym' }>): { p: Printer; command: string; req: ReturnType<typeof buildRequest> } => {
    const p = new Printer();
    const req = buildRequest(c.expr, c.commands, p);
    return { p, command: req.command, req };
  };

  test('Psi, Ei and LambertW go to Giac with their two arguments the other way round, and come back', () => {
    const c = sym(F('Psi', R(2), V('x')));
    const { p, command, req } = request(c);
    expect(command).toBe('regroup(Psi(v0,2))');
    expect(request(sym(F('LambertW', R(-1), V('x')))).command).toBe('regroup(LambertW(v0,(-1)))');
    expect(request(sym(F('Ei', R(2), V('x')))).command).toBe('regroup(Ei(v0,2))');
    // Giac's derivative of Psi(x, 2) is Psi(x, 3): Mathcad's Psi(3, x).
    expect(tex((readAnswer('Psi(v0,3)', c, req, p) as { result: Expr }).result)).toBe('\\mathrm{Psi}\\left(3,x\\right)');
  });

  test('IsPrime is Giac\'s isprime, true and false coming back as 1 and 0; Euler\'s constant is γ', () => {
    const c = sym(F('IsPrime', R(97)));
    const { p, command, req } = request(c);
    expect(command).toBe('regroup(isprime(97))');
    expect((readAnswer('true', c, req, p) as { result: Expr }).result).toEqual(R(1));
    expect((readAnswer('false', c, req, p) as { result: Expr }).result).toEqual(R(0));
    expect(tex((readAnswer('-euler_gamma', c, req, p) as { result: Expr }).result)).toBe('-\\gamma');
  });

  test('exact arguments stay exact, for Giac\'s closed forms, as Zeta(2) → π²/6', () => {
    expect(request(sym(F('Zeta', R(2)))).command).toBe('regroup(Zeta(2))');
    expect(request(sym(F('Si', R(2)), 'float')).command).toBe('evalf(Si(2),22)');
  });

  test('decimal arguments are worked out by MathMath, to 16 digits', () => {
    expect(request(sym(F('Psi', R(1), R(2.5)))).command).toBe('regroup(0.4903577561002349)');
  });

  test('under float, what Giac can\'t evaluate is worked out by MathMath, as an exact fraction of its 16 digits', () => {
    expect(request(sym(F('FresnelS', R(1)), 'float')).command).toBe('evalf((4382591473903548/10^16),22)');
    expect(request(sym(F('Psi', R(2), R(1)), 'float')).command).toBe('evalf((-(2404113806319188/10^15)),22)');
    expect(request(sym(F('Ci', { k: 'op', op: 'neg', args: [R(2)] }), 'float')).command)
      .toBe('evalf(((4229808287748648/10^16)+((3141592653589793/10^15)*(1*i))),22)');
    // Without float, a whole-number argument is left for Giac: Mathcad leaves FresnelS(1) as it is.
    expect(request(sym(F('FresnelS', R(1)))).command).toBe('regroup(f0(1))');
    // And so is a name.
    expect(request(sym(F('Shi', V('x')), 'float')).command).toBe('evalf(f0(v0),22)');
  });

  test('the answer is then rounded to those 16 digits', () => {
    const c = sym({ k: 'op', op: 'plus', args: [F('FresnelC', R(1)), R(1)] }, 'float');
    const { p, req } = request(c);
    expect(tex((readAnswer('1.7798934003768226000', c, req, p) as { result: Expr }).result)).toBe('1.779893400376823');
  });

  test('derivatives of the functions Giac doesn\'t know are written in, and the answer asked for again', () => {
    const c = sym({ k: 'derivative', body: F('FresnelS', { k: 'op', op: 'pow', args: [V('x'), R(2)] }), varName: 'x' } as Expr);
    const { p, req } = request(c);
    expect(req.command).toBe('regroup(diff(f0((v0^2)),v0))');
    expect(readAnswer("2*v0*f0'(v0^2)", c, req, p)).toEqual({ retry: 'regroup(2*v0*sin(pi*(v0^2)^2/2))' });
    const d = sym({ k: 'derivative', body: F('dilog', V('x')), varName: 'x' } as Expr);
    const r = request(d);
    expect(readAnswer('diff(f0(v0),v0)', d, r.req, r.p)).toEqual({ retry: 'regroup((-ln(v0)/((v0)-1)))' });
    // Asked again, what's still unworked is unevaluated, not asked a third time.
    expect(readAnswer('diff(f0(v0),v0,2)', d, r.req, r.p)).toEqual({ unevaluated: true });
  });

  test('higher derivatives, as Giac writes them, are written in too, and Giac asked for the rest', () => {
    const c = sym({ k: 'derivative', body: F('FresnelS', V('x')), varName: 'x', degree: R(2) } as Expr);
    const { p, req } = request(c);
    expect(readAnswer('diff(f0(v0),v0,2)', c, req, p)).toEqual({ retry: 'regroup(subst(diff(sin(pi*(mmt)^2/2),mmt,1),mmt=v0))' });
    const c2 = sym({ k: 'derivative', body: F('FresnelS', op2('pow', V('x'), R(2))), varName: 'x', degree: R(2) } as Expr);
    const r2 = request(c2);
    expect(readAnswer("4*v0^2*(f0')'(v0^2)+2*f0'(v0^2)", c2, r2.req, r2.p))
      .toEqual({ retry: 'regroup(4*v0^2*subst(diff(sin(pi*(mmt)^2/2),mmt,1),mmt=v0^2)+2*sin(pi*(v0^2)^2/2))' });
  });

  test('a derivative of a function of your own with no definition has no closed form, and no generated name shows', () => {
    const c = sym({ k: 'derivative', body: op2('mult', F('g', op2('pow', V('x'), R(2))), F('FresnelS', op2('pow', V('x'), R(2)))), varName: 'x' } as Expr);
    const { p, req } = request(c);
    const g = [...p.back].find(([, sheet]) => sheet === 'g')![0];
    const f = [...p.back].find(([, sheet]) => sheet === 'FresnelS')![0];
    // FresnelS's derivative is written in, g's left, as Giac answered.
    expect(readAnswer(`2*v0*${g}(v0^2)*${f}'(v0^2)+2*v0*${f}(v0^2)*${g}'(v0^2)`, c, req, p))
      .toEqual({ retry: `regroup(2*v0*${g}(v0^2)*sin(pi*(v0^2)^2/2)+2*v0*${f}(v0^2)*${g}'(v0^2))` });
    expect(readAnswer(`2*v0*(function_diff(${g}))(v0^2)`, c, req, p)).toEqual({ unevaluated: true });
  });

  test('with a keyword, Giac works out such a derivative first, and the keyword applies to it afterwards', () => {
    const c: Extract<Content, { k: 'sym' }> = { ...sym({ k: 'derivative', body: F('FresnelS', V('x')), varName: 'x' } as Expr), commands: [{ name: 'substitute', args: [op2('equal', V('x'), R(1))] }] };
    const { p, req } = request(c);
    expect(req.command).toBe('regroup(diff(f0(v0),v0))');
    expect(readAnswer('diff(f0(v0),v0)', c, req, p)).toEqual({ retry: 'subst(sin(pi*(v0)^2/2),(v0=1))' });
  });

  test('a wrong number of arguments is refused before Giac sees it', () => {
    expect(() => request(sym(F('Si', R(1), R(2))))).toThrow(/Si takes 1 argument, not 2/);
    expect(() => request(sym(F('Si', R(1.5), R(2))))).toThrow(/Si takes 1 argument, not 2/);
  });

  test('the functions Giac doesn\'t know keep their exact values, as dilog(1) → 0 and dilog(2) → −π²/12', () => {
    expect(request(sym(F('dilog', R(1)))).command).toBe('regroup(0)');
    expect(request(sym(F('dilog', R(2)))).command).toBe('regroup((-((pi^2)/12)))');
    expect(request(sym(F('dilog', R(3)))).command).toBe('regroup(f0(3))');
  });
});

describe('typing', () => {
  test('Psi typed as a call is the function; Psi on its own, or \\Psi, is still the Greek letter', () => {
    expect(readTex('Psi\\left(1\\right)')).toEqual({ k: 'call', fn: { k: 'id', name: 'Psi' }, args: [{ k: 'real', v: 1 }] });
    expect(readTex('Psi')).toEqual({ k: 'id', name: 'Ψ' });
    expect(readTex('\\Psi\\left(x\\right)')).toEqual({ k: 'call', fn: { k: 'id', name: 'Ψ' }, args: [{ k: 'id', name: 'x' }] });
  });
});
