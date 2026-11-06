import { describe, expect, test } from 'vitest';
import { Scope, runWorksheet } from '../src/engine/evaluate.js';
import { readRegion, regionLatex } from '../src/latex/region.js';
import type { Content, Expr } from '../src/model/ast.js';
import { Defs } from '../src/symbolic/defs.js';
import { NotSymbolic, expand } from '../src/symbolic/expand.js';
import { Printer, buildRequest, readAnswer } from '../src/symbolic/giac.js';
import { parse } from '../src/symbolic/text.js';
import { id, math, real, sheet, stat } from './helpers.js';

const R = (v: number): Expr => ({ k: 'real', v });
const V = (name: string): Expr => ({ k: 'id', name });
const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });
const sym = (expr: Expr, ...commands: { name: string; args: Expr[] }[]): Extract<Content, { k: 'sym' }> =>
  ({ k: 'sym', target: null, global: false, expr, commands, stored: null });
const scope = new Scope(null);
const define = (d: Defs, name: string, value: Expr): Defs => d.with({ k: 'var', name }, value, scope);

describe('sheet definitions', () => {
  test('substitute as expressions, so fractions stay exact', () => {
    const third = op('div', R(1), R(3));
    expect(expand(op('plus', V('c'), R(1)), define(new Defs(), 'c', third), new Set())).toEqual(op('plus', third, R(1)));
  });

  test('undefined names stay symbols', () => {
    expect(expand(V('x'), new Defs(), new Set())).toEqual(V('x'));
  });

  test('a redefinition below does not reach back', () => {
    const d = define(define(new Defs(), 'a', R(1)), 'b', V('a'));
    expect(expand(V('b'), define(d, 'a', R(2)), new Set())).toEqual(R(1));
  });

  test('functions inline', () => {
    const d = new Defs().with({ k: 'fn', name: 'f', params: ['u'] }, op('pow', V('u'), R(2)), scope);
    const call: Expr = { k: 'call', fn: V('f'), args: [op('plus', V('x'), R(1))] };
    expect(expand(call, d, new Set())).toEqual(op('pow', op('plus', V('x'), R(1)), R(2)));
  });

  test('a function argument named like a sheet variable is not substituted twice', () => {
    const d = define(new Defs(), 'u', R(5)).with({ k: 'fn', name: 'f', params: ['u'] }, V('u'), scope);
    expect(expand({ k: 'call', fn: V('f'), args: [V('x')] }, d, new Set())).toEqual(V('x'));
  });

  test('an integration variable shadows a sheet variable', () => {
    const e: Expr = { k: 'bigop', op: 'integral', varName: 'x', body: V('x'), lo: null, hi: null };
    expect(expand(e, define(new Defs(), 'x', R(9)), new Set())).toEqual(e);
  });

  test('a definition that calls itself stops, with a reason', () => {
    const d = new Defs();
    const self = d.add('f', { params: ['n'], body: null, env: d, scope });
    const looped = self.add('f', { params: ['n'], body: { k: 'call', fn: V('f'), args: [V('n')] }, env: self, scope });
    expect(() => expand({ k: 'call', fn: V('f'), args: [R(1)] }, looped.add('f', { params: ['n'], body: { k: 'call', fn: V('f'), args: [V('n')] }, env: looped, scope }), new Set())).toThrow(NotSymbolic);
  });

  test('strings and programs have no symbolic form', () => {
    expect(() => expand({ k: 'str', v: 'a' }, new Defs(), new Set())).toThrow(NotSymbolic);
    expect(() => expand({ k: 'program', body: [] }, new Defs(), new Set())).toThrow(NotSymbolic);
  });
});

describe('talking to the engine', () => {
  test('names from a worksheet never reach it as text', () => {
    const p = new Printer();
    const crafted = V('x);system("rm -rf /");(');
    const call: Expr = { k: 'call', fn: V('evil("code")'), args: [crafted] };
    const { command } = buildRequest(call, [], p);
    expect(command).toBe('regroup(f0(v0))');
    expect(p.back.get('v0')).toBe('x);system("rm -rf /");(');
  });

  test('known functions keep their names, and log is base 10', () => {
    const { command } = buildRequest({ k: 'call', fn: V('log'), args: [V('x')] }, [], new Printer());
    expect(command).toContain('log10(');
  });

  test('a keyword whose variable has a value', () => {
    const solve = { name: 'solve', args: [R(5)] };
    expect(() => buildRequest(V('x'), [solve], new Printer())).toThrow('no value on the sheet');
    expect(() => buildRequest(V('x'), [{ name: 'series', args: [R(5)] }], new Printer())).toThrow('no value on the sheet');
    const coeffs = buildRequest(R(35), [{ name: 'coeffs', args: [R(5)] }], new Printer());
    expect(coeffs.command).toBe('35');
    const substitute = buildRequest(R(25), [{ name: 'substitute', args: [op('equal', R(5), R(3))] }], new Printer());
    expect(substitute.command).toBe('25');
  });

  test('assumptions are cleared afterwards', () => {
    const p = new Printer();
    const req = buildRequest(V('x'), [{ name: 'assume', args: [op('greaterThan', V('x'), R(0))] }], p);
    expect(req.setup).toEqual(['assume((v0>0))']);
    expect(req.cleanup).toEqual(['purge(v0)']);
  });

  test('a sheet name comes back, and so do constants', () => {
    const p = new Printer();
    p.name('speed');
    const req = buildRequest(V('speed'), [], p);
    expect(readAnswer('2*pi*v0', sym(V('speed')), req, p)).toEqual({
      result: op('mult', op('mult', R(2), V('π')), V('speed')),
    });
  });

  test('the approximation on an exact result is dropped', () => {
    const p = new Printer();
    const req = buildRequest(R(8), [], p);
    expect(readAnswer('2*sqrt(2)=2.82842712475', sym(R(8)), req, p)).toEqual({ result: op('mult', R(2), op('sqrt', R(2))) });
  });

  test('division by zero is an error, but a limit can be infinite', () => {
    const p = new Printer();
    const req = buildRequest(R(1), [], p);
    expect(readAnswer('infinity', sym(R(1)), req, p)).toHaveProperty('error');
    const limit: Expr = { k: 'limit', varName: 'x', body: V('x'), to: V('∞'), side: null };
    expect(readAnswer('infinity', sym(limit), req, p)).toEqual({ result: V('∞') });
  });

  test('no closed form is not an error, and not a made-up answer', () => {
    const p = new Printer();
    const req = buildRequest(R(1), [], p);
    expect(readAnswer('integrate(exp(1/2*ln(x)),x)', sym(R(1)), req, p)).toEqual({ unevaluated: true });
  });

  test('an unreadable exact form asks for a number', () => {
    const p = new Printer();
    const req = buildRequest(R(1), [], p);
    expect(readAnswer('list[rootof([1,2])]', sym(R(1)), req, p)).toEqual({ retry: `evalf(${req.command})` });
  });

  test('one solution shows alone, and none is an error', () => {
    const p = new Printer();
    const solve = sym(V('x'), { name: 'solve', args: [V('x')] });
    const req = buildRequest(R(1), [], p);
    expect(readAnswer('list[3]', solve, req, p)).toEqual({ result: R(3) });
    expect(readAnswer('list[]', solve, req, p)).toHaveProperty('error');
  });

  test('engine output reads as math', () => {
    expect(parse('[[1,2],[3,4]]')).toEqual({ k: 'matrix', rows: 2, cols: 2, items: [R(1), R(3), R(2), R(4)] });
    expect(parse('poly1[3,2]')).toEqual({ k: 'matrix', rows: 2, cols: 1, items: [R(3), R(2)] });
  });
});

describe('the text form', () => {
  const both = (c: Content): void => expect(readRegion(regionLatex(c))).toEqual(c);

  test('a plain arrow', () => both(sym(op('plus', V('x'), R(1)))));
  test('a keyword', () => both(sym(V('x'), { name: 'expand', args: [] })));
  test('a keyword with an argument', () => both(sym(op('equal', V('x'), R(2)), { name: 'solve', args: [V('x')] })));
  test('a chain of keywords', () => both(sym(V('x'), { name: 'expand', args: [] }, { name: 'factor', args: [] })));
  test('two arguments', () => both(sym(V('x'), { name: 'series', args: [V('x'), R(4)] })));
  test('on a definition', () => both({ ...sym(V('x')), target: { k: 'fn', name: 'h', params: ['x'] } }));
  test('an indefinite integral', () => both(sym({ k: 'bigop', op: 'integral', varName: 'x', body: V('x'), lo: null, hi: null })));
  test('a limit', () => both(sym({ k: 'limit', varName: 'x', body: V('x'), to: R(0), side: null })));
  test('a one-sided limit', () => both(sym({ k: 'limit', varName: 'x', body: V('x'), to: V('a'), side: 'right' })));
  test('a program with an if is not read as a keyword', () => {
    expect(readRegion('\\left|\\begin{array}{l}a\\ \\mathbf{if}\\ 1\\\\a\\end{array}\\right.\\to ').k).toBe('sym');
  });
});

describe('importing', () => {
  const fragment = (body: string): string => math(body);
  test('an arrow with its keyword and stored answer', () => {
    const c = sheet([fragment(`<ml:symEval>${id('x')}${stat('command', id('solve'), id('x'))}<symResult>${real(3)}</symResult></ml:symEval>`)]).regions[0]!.content;
    expect(c).toMatchObject({ k: 'sym', commands: [{ name: 'solve', args: [V('x')] }], stored: R(3) });
  });

  test('a stored answer stands in without the engine, and defines its target', () => {
    const ws = sheet([
      math(`<ml:define>${id('q')}<ml:symEval>${id('w')}<symResult>${real(5)}</symResult></ml:symEval></ml:define>`),
      math(`<ml:eval>${id('q')}</ml:eval>`),
    ]);
    const out = runWorksheet(ws);
    expect((out[1]!.value as { re: number }).re).toBe(5);
  });

  test('an arrow with no stored answer says so', () => {
    const out = runWorksheet(sheet([math(`<ml:symEval>${id('x')}</ml:symEval>`)]));
    expect(out[0]!.error?.reason).toContain('symbolic');
  });
});

describe('Laplace and z-transforms, as Mathcad keywords', () => {
  const t = V('t');
  const decay = op('pow', V('e'), op('mult', R(-2), t));
  test('laplace, t gives a function of s, and invlaplace, s one of t', () => {
    const p = new Printer();
    const req = buildRequest(decay, [{ name: 'laplace', args: [t] }], p);
    expect(req.command).toBe('laplace((e^((-2)*v0)),v0,v1)');
    expect(p.back.get('v1')).toBe('s');
    expect(readAnswer('1/(v1+2)', sym(decay, { name: 'laplace', args: [t] }), req, p)).toEqual({
      result: op('div', R(1), op('plus', V('s'), R(2))),
    });
    const inv = buildRequest(op('div', R(1), V('s')), [{ name: 'invlaplace', args: [V('s')] }], new Printer());
    expect(inv.command).toBe('ilaplace((1/v0),v0,v1)');
  });
  test('a second argument names the result variable', () => {
    const p = new Printer();
    const req = buildRequest(decay, [{ name: 'laplace', args: [t, V('p')] }], p);
    expect(req.command).toBe('laplace((e^((-2)*v0)),v0,v1)');
    expect(p.back.get('v1')).toBe('p');
  });
  test('decimals go to the engine as exact fractions, for transforms only', () => {
    expect(buildRequest(op('pow', R(0.5), V('n')), [{ name: 'ztrans', args: [V('n')] }], new Printer()).command).toBe('ztrans((exact(0.5)^v0),v0,v1)');
    expect(buildRequest(op('pow', R(0.5), V('n')), [], new Printer()).command).toBe('regroup((0.5^v0))');
  });
  test('ztrans, n and invztrans, z', () => {
    expect(buildRequest(op('pow', R(2), V('n')), [{ name: 'ztrans', args: [V('n')] }], new Printer()).command).toBe('ztrans((2^v0),v0,v1)');
    expect(buildRequest(V('z'), [{ name: 'invztrans', args: [V('z')] }], new Printer()).command).toBe('invztrans(v0,v0,v1)');
  });
  test("Giac's step and impulse come back as Mathcad's Φ and δ", () => {
    const p = new Printer();
    p.name('t');
    const req = buildRequest(t, [], p);
    expect(readAnswer('Heaviside(v0-1)', sym(t), req, p)).toEqual({
      result: { k: 'call', fn: V('Φ'), args: [op('minus', V('t'), R(1))] },
    });
    expect(readAnswer('Dirac(v0)', sym(t), req, p)).toEqual({ result: { k: 'call', fn: V('δ'), args: [V('t')] } });
  });
  test('a transform the engine can’t do says so', () => {
    const c = sym(t, { name: 'laplace', args: [t] });
    const p = new Printer();
    const req = buildRequest(t, c.commands, p);
    expect(readAnswer('undef', c, req, p)).toEqual({ error: 'No laplace transform was found for this' });
    expect(readAnswer('laplace(f0(v0),v0,v1)', c, req, p)).toEqual({ unevaluated: true });
  });
  test('the variable must be free', () => {
    expect(() => buildRequest(t, [{ name: 'laplace', args: [R(3)] }], new Printer())).toThrow('no value on the sheet');
    // A vector of times with units, as a sheet's t_j := j·ms, is no plain name either.
    const times = { k: 'matrix', rows: 1, cols: 1, items: [op('mult', R(0.001), V('s'))] } as Expr;
    expect(() => buildRequest(t, [{ name: 'laplace', args: [times] }], new Printer())).toThrow('no value on the sheet');
  });
});
