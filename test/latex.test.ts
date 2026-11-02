import { describe, expect, test } from 'vitest';
import { exprToTarget, readTex, target, tex } from '../src/latex/latex.js';
import { isEditable, readRegion, regionLatex } from '../src/latex/region.js';
import type { Content, Expr, Target } from '../src/model/ast.js';

const R = (v: number): Expr => ({ k: 'real', v });
const V = (name: string): Expr => ({ k: 'id', name });
const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });
const both = (e: Expr): void => expect(readTex(tex(e))).toEqual(e);

describe('printing and reading keep the tree', () => {
  test.each<[string, Expr]>([
    ['sum order', op('minus', op('plus', V('a'), V('b')), V('c'))],
    ['right-nested difference', op('minus', V('a'), op('minus', V('b'), V('c')))],
    ['fraction in a power', op('pow', op('div', V('a'), V('b')), R(2))],
    ['negative of a product', op('neg', op('mult', V('a'), V('b')))],
    ['small number', R(1.5e-11)],
    ['imaginary number', { k: 'imag', v: 0.5 }],
    ['imaginary number in a product', op('mult', V('a'), { k: 'imag', v: 1 })],
    ['long multi-letter name', V('Total')],
    ['name with a subscript', V('x.max')],
    ['Greek name', V('λ')],
    ['indexed subscripted name', op('indexer', V('P.first'), V('i'))],
    ['nested index', op('indexer', op('indexer', V('a'), R(0)), R(1))],
    ['matrix index', op('indexer', V('M'), V('i'), V('j'))],
    ['matrix column', op('matcol', V('M'), R(0))],
    ['vectorize', op('vectorize', op('mult', V('a'), V('b')))],
    ['call', { k: 'call', fn: V('f'), args: [V('a'), R(2)] }],
    ['range', { k: 'range', first: R(0), second: R(0.5), last: V('n') }],
    ['matrix', { k: 'matrix', rows: 2, cols: 2, items: [R(1), R(2), R(3), R(4)] }],
    ['integral', { k: 'bigop', op: 'integral', varName: 'x', body: op('pow', V('x'), R(2)), lo: R(0), hi: V('b') }],
    ['sum to a bound', { k: 'bigop', op: 'summation', varName: 'k', body: V('k'), lo: R(1), hi: V('n') }],
    ['derivative', { k: 'derivative', varName: 'x', body: op('mult', V('x'), V('y')) }],
  ])('%s', (_, e) => both(e));

  test('a program, with control flow', () => {
    both({
      k: 'program',
      body: [
        { k: 'assign', target: { k: 'var', name: 's' }, value: R(0) },
        {
          k: 'for', varName: 'i', iter: { k: 'range', first: R(0), second: null, last: V('n') },
          body: {
            k: 'block',
            body: [
              { k: 'if', cond: op('lessThan', V('i'), R(2)), then: { k: 'assign', target: { k: 'var', name: 's' }, value: V('i') } },
              { k: 'otherwise', then: { k: 'return', value: V('s') } },
            ],
          },
        },
        { k: 'expr', e: V('s') },
      ],
    });
  });
});

describe('typed forms', () => {
  test.each<[string, Expr]>([
    ['2x', op('mult', R(2), V('x'))],
    ['speed', V('speed')],
    ['x9', V('x9')],
    ['2x3', op('mult', R(2), V('x3'))],
    ['pi', V('π')],
    ['alpha', V('α')],
    ['\\sin\\left(x\\right)', { k: 'call', fn: V('sin'), args: [V('x')] }],
    ['\\frac12', op('div', R(1), R(2))],
    ['x^2', op('pow', V('x'), R(2))],
    ['f(x)', { k: 'call', fn: V('f'), args: [V('x')] }],
    ['\\int_0^3x^2\\,\\mathrm{dx}', { k: 'bigop', op: 'integral', varName: 'x', body: op('pow', V('x'), R(2)), lo: R(0), hi: R(3) }],
    ['\\int_0^1x\\,\\mathrm{d\\theta}', { k: 'bigop', op: 'integral', varName: 'θ', body: V('x'), lo: R(0), hi: R(1) }],
    ['\\frac{\\mathrm{d}}{\\mathrm{da}}a^3', { k: 'derivative', varName: 'a', body: op('pow', V('a'), R(3)) }],
  ])('%s', (text, e) => expect(readTex(text)).toEqual(e));
});

describe('definition targets', () => {
  test.each<[string, Target]>([
    ['variable', { k: 'var', name: 'x' }],
    ['subscripted', { k: 'var', name: 'x.max' }],
    ['function', { k: 'fn', name: 'f', params: ['a', 'b'] }],
    ['index', { k: 'index', name: 'v', index: [V('i')] }],
    ['index on a subscripted name', { k: 'index', name: 'v.a', index: [V('i')] }],
    ['column', { k: 'col', name: 'M', index: R(1) }],
  ])('%s', (_, t) => {
    const back = exprToTarget(readTex(target(t)));
    expect(back).toEqual(t);
  });
});

describe('whole regions', () => {
  test('a definition, a global definition and an evaluation', () => {
    const define: Content = { k: 'define', target: { k: 'var', name: 'x' }, value: R(3), global: false, stored: null, unit: null, shown: false };
    expect(readRegion(regionLatex(define))).toEqual(define);
    const global: Content = { ...define, global: true };
    expect(readRegion(regionLatex(global))).toEqual(global);
    const evaluate: Content = { k: 'eval', expr: V('x'), stored: null, unit: null };
    expect(readRegion(regionLatex(evaluate))).toEqual(evaluate);
  });

  test('math with no = is written to be read, and asks for no result', () => {
    expect(readRegion('a+b').k).toBe('show');
    const show: Content = { k: 'show', expr: V('x') };
    expect(readRegion(regionLatex(show))).toEqual(show);
  });

  test('a typed := is forgiven', () => {
    expect(readRegion('x\\coloneq=3').k).toBe('define');
  });

  test('a definition inside a program is not the region definition', () => {
    const c = readRegion('\\left|\\begin{array}{l}a\\gets1\\\\a\\end{array}\\right.=');
    expect(c.k).toBe('eval');
  });

  test('unreadable math throws, so the caller can keep it as a draft', () => {
    expect(() => readRegion('1+')).toThrow();
  });

  test('a region with unknown constructs is locked', () => {
    expect(isEditable({ k: 'eval', expr: { k: 'unsupported', tag: 'mystery' }, stored: null, unit: null })).toBe(false);
    expect(isEditable({ k: 'draft', latex: '1+', error: 'x' })).toBe(true);
  });
});
