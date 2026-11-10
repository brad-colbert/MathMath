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
    ['string with backslashes', { k: 'str', v: 'C:\\pics\\a.jpg' }],
    ['string with spaces and braces', { k: 'str', v: 'C:\\Program Files\\{x}_1 50%' }],
    ['subscript name', V('x.max value')],
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
    ['nth derivative', { k: 'derivative', varName: 'x', body: op('pow', V('x'), R(5)), degree: R(3) }],
    ['nth derivative of a named order', { k: 'derivative', varName: 't', body: { k: 'call', fn: V('y'), args: [V('t')] }, degree: V('n') }],
    ['fraction of names starting with d', op('div', V('dL'), V('Rad'))],
  ])('%s', (_, e) => both(e));

  test('a program written the earlier way still reads', () => {
    expect(readTex('\\left|\\begin{array}{l}a\\gets 1\\\\a\\end{array}\\right.')).toEqual(readTex('\\begin{array}{|l}a\\gets 1\\\\a\\end{array}'));
    expect(readTex('\\begin{array}{|l}a\\gets 1\\\\a\\end{array}').k).toBe('program');
  });

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
    ['\\Delta x', V('Δx')],
    ['a\\alpha b', V('aαb')],
    ['\\alpha\\beta2', V('αβ2')],
    ['2\\pi', op('mult', R(2), V('π'))],
    ['\\mathrm{\\Delta x}', V('Δx')],
    ['\\sin\\left(x\\right)', { k: 'call', fn: V('sin'), args: [V('x')] }],
    ['\\sinh\\left(x\\right)', { k: 'call', fn: V('sinh'), args: [V('x')] }],
    ['\\arcsin\\left(x\\right)', { k: 'call', fn: V('asin'), args: [V('x')] }],
    // A number followed straight away by i or j is imaginary, as typed in Mathcad; not when a name or subscript follows.
    ['3+4i', op('plus', R(3), { k: 'imag', v: 4 })],
    ['4j', { k: 'imag', v: 4 }],
    ['4\\cdot i', op('mult', R(4), V('i'))],
    ['4in', op('mult', R(4), V('in'))],
    ['\\frac12', op('div', R(1), R(2))],
    ['x^2', op('pow', V('x'), R(2))],
    ['f(x)', { k: 'call', fn: V('f'), args: [V('x')] }],
    ["\\text{''photo.jpg''}", { k: 'str', v: 'photo.jpg' }],
    ['\\text{C:\\textbackslash a.jpg}', { k: 'str', v: 'C:\\a.jpg' }],
    ['\\int_0^3x^2\\,\\mathrm{dx}', { k: 'bigop', op: 'integral', varName: 'x', body: op('pow', V('x'), R(2)), lo: R(0), hi: R(3) }],
    ['\\int_0^1x\\,\\mathrm{d\\theta}', { k: 'bigop', op: 'integral', varName: 'θ', body: V('x'), lo: R(0), hi: R(1) }],
    ['\\sum_{i}i^2', { k: 'bigop', op: 'summation', varName: 'i', body: op('pow', V('i'), R(2)), lo: null, hi: null }],
    ['\\prod_{k}k', { k: 'bigop', op: 'product', varName: 'k', body: V('k'), lo: null, hi: null }],
    ['\\sum_{n=1}^{3}n', { k: 'bigop', op: 'summation', varName: 'n', body: V('n'), lo: R(1), hi: R(3) }],
    ['\\frac{\\mathrm{d}}{\\mathrm{da}}a^3', { k: 'derivative', varName: 'a', body: op('pow', V('a'), R(3)) }],
    // As the editor's blank leaves it: the order above only.
    ['\\frac{\\mathrm{d}^2}{\\mathrm{d}x}x^3', { k: 'derivative', varName: 'x', body: op('pow', V('x'), R(3)), degree: R(2) }],
  ])('%s', (text, e) => expect(readTex(text)).toEqual(e));
});

test("an nth derivative's order must be the same above and below", () => {
  expect(() => readTex('\\frac{\\mathrm{d}^{2}}{\\mathrm{d}x^{3}}x')).toThrow(/2 above and 3 below/);
});

describe('brackets around derivatives, limits, sums and integrals in products', () => {
  // These read on to the right through a product, so they're bracketed only when something follows them.
  const w: Expr = { k: 'call', fn: V('w'), args: [V('x')] };
  const d: Expr = { k: 'derivative', varName: 'x', body: w };
  const d4: Expr = { k: 'derivative', varName: 'x', body: w, degree: R(4) };
  const lim: Expr = { k: 'limit', varName: 'x', body: V('f'), to: R(0), side: null };
  const sum: Expr = { k: 'bigop', op: 'summation', varName: 'i', body: V('i'), lo: R(1), hi: R(3) };
  const int: Expr = { k: 'bigop', op: 'integral', varName: 'x', body: V('x'), lo: R(0), hi: R(1) };
  const D = '\\frac{\\mathrm{d}}{\\mathrm{d}x}w\\left(x\\right)';
  test.each<[string, Expr, string]>([
    ['last in a product, bare', op('mult', op('mult', V('E'), V('I')), d4), 'E\\cdot I\\cdot \\frac{\\mathrm{d}^{4}}{\\mathrm{d}x^{4}}w\\left(x\\right)'],
    ['before a sum, bare', op('plus', op('mult', V('E'), d), R(1)), `E\\cdot ${D}+1`],
    ['before an =, bare', op('equal', op('mult', V('E'), d), V('q')), `E\\cdot ${D}=q`],
    ['negated, bare', op('neg', d), `-${D}`],
    ['followed by a factor, bracketed', op('mult', d, V('k')), `\\left(${D}\\right)\\cdot k`],
    ['inside a product that a factor follows, bracketed', op('mult', op('mult', V('E'), d), V('k')), `E\\cdot \\left(${D}\\right)\\cdot k`],
    ['raised to a power, bracketed', op('pow', d, R(2)), `{\\left(${D}\\right)}^{2}`],
    ['a limit followed by a factor, bracketed', op('mult', lim, R(3)), '\\left(\\lim_{x\\to 0}f\\right)\\cdot 3'],
    ['a sum last in a product, bare', op('mult', R(2), sum), '2\\cdot \\sum_{i=1}^{3}i'],
    ['an integral ends at its dx, so it needs none', op('mult', op('mult', R(2), int), R(3)), '2\\cdot \\int_{0}^{1}x\\,\\mathrm{d}x\\cdot 3'],
  ])('%s', (_, e, text) => {
    expect(tex(e)).toBe(text);
    expect(readTex(text)).toEqual(e);
  });
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
    // A function's parameters are names: a value there isn't a definition (Mathcad's file writes aside).
    expect(() => readRegion('f\\left(\\text{"x"}\\right)\\coloneq M')).toThrow(/parameters must be names/);
    expect(() => readRegion('\\mathrm{APPENDPRN}\\left(\\text{"log.prn"}\\right)\\coloneq M')).toThrow(/parameters must be names/);
  });

  test('a region with unknown constructs is locked', () => {
    expect(isEditable({ k: 'eval', expr: { k: 'unsupported', tag: 'mystery' }, stored: null, unit: null })).toBe(false);
    expect(isEditable({ k: 'draft', latex: '1+', error: 'x' })).toBe(true);
  });
});

describe('sums over a range variable', () => {
  test('print with only the index under the Σ and read back the same', () => {
    for (const text of ['\\sum_{i}i^2', '\\prod_{\\theta}\\theta', '\\sum_{i}\\sum_{j}i\\cdot j']) {
      const e = readTex(text);
      expect(tex(e)).not.toContain('null');
      expect(readTex(tex(e))).toEqual(e);
    }
  });
});
