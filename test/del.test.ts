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
import { runWorksheet } from '../src/engine/evaluate.js';
import { type Mat, type Num, type Value, getEl } from '../src/engine/values.js';
import { readTex, tex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import { emptyWorksheet } from '../src/format/native.js';
import { Scope } from '../src/engine/evaluate.js';
import { Defs } from '../src/symbolic/defs.js';
import { expand } from '../src/symbolic/expand.js';
import { Printer } from '../src/symbolic/giac.js';

/** The last region's value, or its error as a thrown Error. */
function last(...lines: string[]): Value {
  return at(0, ...lines);
}
function at(origin: number, ...lines: string[]): Value {
  const ws = emptyWorksheet();
  ws.origin = origin;
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  const out = runWorksheet(ws).at(-1)!;
  if (out.error) throw new Error(out.error.reason);
  return out.value!;
}
const re = (v: Value): number[] => (v.t === 'mat' ? [...(v as Mat).re] : [(v as { re: number }).re]);
const close = (got: number[], want: number[], digits = 7): void => {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => expect(g).toBeCloseTo(want[i]!, digits));
};
const call = (f: string, ...a: string[]): string => `${f}\\left(${a.join(',')}\\right)`;
const col = (...a: string[]): string => `\\begin{pmatrix}${a.join('\\\\')}\\end{pmatrix}`;
const F = `${call('f', 'x', 'y', 'z')}\\coloneq x^{2}\\cdot y+\\sin \\left(z\\right)`;
const J = `${call('J', 'x', 'y', 'z')}\\coloneq ${col('x\\cdot y', 'y\\cdot z^{2}', '\\sin \\left(x\\right)')}`;

describe('reading and writing ∇, ∂ and marked names', () => {
  const same = (latex: string): void => expect(tex(readTex(latex))).toBe(latex);

  test('each operator reads back as written', () => {
    same('\\nabla f\\left(x,y,z\\right)');
    same('\\nabla \\cdot F\\left(x,y,z\\right)');
    same('\\nabla \\times F\\left(x,y,z\\right)');
    same('\\nabla^{2}f\\left(x,y\\right)');
    same('-\\nabla V\\left(x,y,z\\right)');
    // A subscript after the call is the gradient's: ∇ takes the call alone.
    same('\\nabla f\\left(1,2,3\\right)_{0}');
    expect(readTex('\\nabla f\\left(1,2,3\\right)_{0}')).toMatchObject({ op: 'indexer', args: [{ op: 'gradient' }, { v: 0 }] });
    same('\\nabla f\\left(x,y,z\\right)\\cdot v');
    same('2\\cdot \\nabla \\cdot F\\left(x,y,z\\right)');
  });

  test('∇ needs a function with its arguments', () => {
    expect(() => readTex('\\nabla f')).toThrow(/a function and its arguments/);
    expect(() => readTex('\\nabla \\cdot \\left(x+y\\right)')).toThrow(/a function and its arguments/);
    expect(() => readTex('\\nabla^{3}f\\left(x\\right)')).toThrow(/Laplacian/);
  });

  test('partial derivatives', () => {
    same('\\frac{\\partial}{\\partial x}f\\left(x,y\\right)');
    same('\\frac{\\partial^{2}}{\\partial x^{2}}f\\left(x,y\\right)');
    same('\\frac{\\partial^{2}}{\\partial x\\,\\partial y}f\\left(x,y\\right)');
    expect(readTex('\\frac{\\partial}{\\partial x}u')).toEqual({ k: 'derivative', varName: 'x', body: { k: 'id', name: 'u' }, partial: true });
    // Typed nested, shown as one.
    expect(tex(readTex('\\frac{\\partial}{\\partial x}\\frac{\\partial}{\\partial y}u'))).toBe('\\frac{\\partial^{2}}{\\partial x\\,\\partial y}u');
    // The same variable twice stays two derivatives.
    same('\\frac{\\partial}{\\partial x}\\frac{\\partial}{\\partial x}u');
    const mixed = readTex('\\frac{\\partial^{3}}{\\partial x^{2}\\partial y}u');
    expect(mixed).toMatchObject({ varName: 'x', degree: { v: 2 }, body: { varName: 'y', body: { name: 'u' } } });
    expect(() => readTex('\\frac{\\partial^{3}}{\\partial x\\partial y}u')).toThrow(/must be 2/);
    expect(() => readTex('\\frac{\\partial^{2}}{\\partial x^{3}}u')).toThrow(/above and 3 below/);
    expect(() => readTex('\\partial x')).toThrow(/∂\/∂x/);
    // d/dx is unchanged.
    same('\\frac{\\mathrm{d}}{\\mathrm{d}x}u');
  });

  test('a hat or an arrow is part of a one-letter name', () => {
    expect(readTex('\\hat{\\imath}')).toEqual({ k: 'id', name: 'i\u0302' });
    expect(readTex('\\hat{i}')).toEqual({ k: 'id', name: 'i\u0302' });
    expect(readTex('\\hat{k}')).toEqual({ k: 'id', name: 'k\u0302' });
    expect(readTex('\\vec{v}')).toEqual({ k: 'id', name: 'v\u20d7' });
    expect(readTex('\\vec{\\omega}')).toEqual({ k: 'id', name: 'ω\u20d7' });
    same('\\hat{\\imath}');
    same('\\hat{\\jmath}');
    same('\\hat{n}');
    same('\\vec{v}');
    same('\\vec{F}_{\\text{net}}');
    same('\\vec{r}\\left(t\\right)');
    same('3\\cdot \\hat{\\imath}+2\\cdot \\hat{\\jmath}');
    expect(tex(readTex('3\\hat{i}'))).toBe('3\\cdot \\hat{\\imath}');
    expect(() => readTex('\\vec{AB}')).toThrow(/single letter/);
    // The vectorize arrow is something else.
    expect(readTex('\\overrightarrow{v}')).toMatchObject({ k: 'op', op: 'vectorize' });
  });
});

describe('∇ calculates', () => {
  test('gradient of f(x, y, z) = x²y + sin z at a point', () => {
    close(re(last(F, `\\nabla ${call('f', '1', '2', '0.5')}=`)), [4, 1, Math.cos(0.5)]);
  });

  test('in a definition, and at a point given by names', () => {
    close(re(last(F, `${call('E', 'x', 'y', 'z')}\\coloneq \\nabla ${call('f', 'x', 'y', 'z')}`, `${call('E', '1', '2', '0.5')}=`)), [4, 1, Math.cos(0.5)]);
    close(re(last(F, 'a\\coloneq 1', 'b\\coloneq 2', `\\nabla ${call('f', 'a', 'b', '0')}=`)), [4, 1, 1]);
  });

  test('a component of the gradient, whatever ORIGIN is', () => {
    close(re(last(F, `{\\nabla ${call('f', '1', '2', '0.5')}}_{1}=`)), [1]);
    close(re(at(1, F, `{\\nabla ${call('f', '1', '2', '0.5')}}_{1}=`)), [4]);
    close(re(at(1, J, `\\nabla \\cdot ${call('J', '1', '2', '0.5')}=`)), [2 + 0.25]);
  });

  test('divergence, curl and Laplacian', () => {
    // ∇·J = y + z², ∇×J = (−2yz, −cos x, −x), ∇²f = 2y − sin z.
    close(re(last(J, `\\nabla \\cdot ${call('J', '1', '2', '0.5')}=`)), [2.25]);
    close(re(last(J, `\\nabla \\times ${call('J', '1', '2', '0.5')}=`)), [-2, -Math.cos(1), -1]);
    close(re(last(F, `\\nabla^{2}${call('f', '1', '2', '0.5')}=`)), [4 - Math.sin(0.5)], 5);
  });

  test('identities: curl of a gradient and divergence of a curl are zero', () => {
    const E = `${call('E', 'x', 'y', 'z')}\\coloneq \\nabla ${call('f', 'x', 'y', 'z')}`;
    close(re(last(F, E, `\\nabla \\times ${call('E', '1', '2', '0.5')}=`)), [0, 0, 0], 5);
    const C = `${call('C', 'x', 'y', 'z')}\\coloneq \\nabla \\times ${call('J', 'x', 'y', 'z')}`;
    close(re(last(J, C, `\\nabla \\cdot ${call('C', '1', '2', '0.5')}=`)), [0], 5);
  });

  test('in the plane: two variables', () => {
    const W = `${call('W', 'x', 'y')}\\coloneq ${col('-y', 'x')}`;
    close(re(last(W, `\\nabla \\times ${call('W', '1', '2')}=`)), [2]);
    close(re(last(W, `\\nabla \\cdot ${call('W', '1', '2')}=`)), [0]);
    close(re(last(`${call('h', 'x', 'y')}\\coloneq x^{2}+3\\cdot y^{2}`, `\\nabla^{2}${call('h', '1', '2')}=`)), [8], 5);
  });

  test('∇² of a vector field, part by part', () => {
    close(re(last(`${call('G', 'x', 'y')}\\coloneq ${col('x^{2}', 'y^{3}')}`, `\\nabla^{2}${call('G', '1', '2')}=`)), [2, 12], 5);
  });

  test('units: the gradient of a potential is a field', () => {
    const v = last(`${call('\\phi', 'x', 'y')}\\coloneq 3\\cdot \\mathrm{V}\\cdot \\frac{x}{\\mathrm{m}}`, `\\nabla ${call('\\phi', '2\\cdot \\mathrm{m}', '1\\cdot \\mathrm{m}')}=`) as Mat;
    close([...v.re], [3, 0]);
  });

  test('refusals', () => {
    expect(() => last(J, `\\nabla ${call('J', '1', '2', '0.5')}=`)).toThrow(/needs J to give a number/);
    expect(() => last(F, `\\nabla \\cdot ${call('f', '1', '2', '0.5')}=`)).toThrow(/vector of 3 parts/);
    expect(() => last(`${call('g', 'x')}\\coloneq x`, `\\nabla \\times ${call('g', '1')}=`)).toThrow(/3 variables, or 2/);
    expect(() => last(F, `\\nabla ${call('f', col('1', '2'), '1', '1')}=`)).toThrow(/at a point/);
  });

  test('partial derivatives calculate as d/dx does', () => {
    close(re(last(F, 'x\\coloneq 1', 'y\\coloneq 2', `\\frac{\\partial}{\\partial x}${call('f', 'x', 'y', '0')}=`)), [4]);
    close(re(last(F, 'x\\coloneq 1', 'y\\coloneq 2', `\\frac{\\partial^{2}}{\\partial x\\,\\partial y}${call('f', 'x', 'y', '0')}=`)), [2], 5);
  });

  test('î, ĵ and k̂ are the unit vectors, unless the sheet says otherwise', () => {
    close(re(last('3\\cdot \\hat{\\imath}+2\\cdot \\hat{\\jmath}-\\hat{k}=')), [3, 2, -1]);
    close(re(last('\\hat{\\imath}\\times \\hat{\\jmath}=')), [0, 0, 1]);
    close(re(last('\\hat{\\imath}\\coloneq 5', '\\hat{\\imath}=')), [5]);
    close(re(last('\\vec{v}\\coloneq \\begin{pmatrix}1\\\\2\\\\2\\end{pmatrix}', '\\left|\\vec{v}\\right|=')), [3]);
  });
});

describe('∇ with →', () => {
  const scope = new Scope(null);
  const defs = new Defs()
    .with({ k: 'fn', name: 'f', params: ['u', 'v', 'w'] }, readTex('u^{2}\\cdot v+\\sin \\left(w\\right)'), scope)
    .with({ k: 'fn', name: 'W', params: ['u', 'v'] }, readTex(col('-v', 'u')), scope)
    .with({ k: 'var', name: 'x' }, readTex('7'), scope);
  /** Giac's command, with its generated names put back as the sheet's. */
  const giac = (latex: string): string => {
    const p = new Printer();
    const out = p.print(expand(readTex(latex), defs, new Set()));
    return out.replace(/\bv\d+\b/g, (n) => p.back.get(n) ?? n);
  };

  test('each operator is Giac\'s, in the call\'s names, even one with a value on the sheet', () => {
    expect(giac('\\nabla f\\left(x,y,z\\right)')).toBe('grad((((x^2)*y)+sin(z)),[x,y,z])');
    expect(giac('\\nabla^{2}f\\left(x,y,z\\right)')).toBe('laplacian((((x^2)*y)+sin(z)),[x,y,z])');
    expect(giac('\\nabla \\cdot W\\left(x,y\\right)')).toBe('divergence([(-y),x],[x,y])');
    expect(giac('\\nabla \\times W\\left(x,y\\right)')).toBe('(diff(([(-y),x])[1],x)-diff(([(-y),x])[0],y))');
  });

  test('the unit vectors', () => {
    expect(giac('3\\cdot \\hat{\\imath}')).toBe('(3*[1,0,0])');
  });

  test('a point instead of names is refused', () => {
    expect(() => giac('\\nabla f\\left(1,y,z\\right)')).toThrow(/function of names/);
    expect(() => giac('\\nabla f\\left(x,x,z\\right)')).toThrow(/each different/);
  });
});

describe('→ inside a function called with other arguments', () => {
  const scope = new Scope(null);
  const defs = new Defs()
    .with({ k: 'fn', name: 'f', params: ['x', 'y', 'z'] }, readTex('x^{2}\\cdot y+\\sin \\left(z\\right)'), scope)
    .with({ k: 'fn', name: 'E', params: ['x', 'y', 'z'] }, readTex('\\nabla f\\left(x,y,z\\right)'), scope)
    .with({ k: 'fn', name: 'g', params: ['x'] }, readTex('\\frac{\\mathrm{d}}{\\mathrm{d}x}x^{2}'), scope);
  const giac = (latex: string): string => {
    const p = new Printer();
    const out = p.print(expand(readTex(latex), defs, new Set()));
    return out.replace(/\bv\d+\b/g, (n) => p.back.get(n) ?? n);
  };

  test('the operation works in the parameters, then the arguments go in', () => {
    expect(giac('E\\left(a,b,c\\right)')).toBe('subst(grad((((x^2)*y)+sin(z)),[x,y,z]),[x,y,z],[a,b,c])');
    expect(giac('E\\left(1,2,0.5\\right)')).toBe('subst(grad((((x^2)*y)+sin(z)),[x,y,z]),[x,y,z],[1,2,0.5])');
    expect(giac('\\nabla \\cdot E\\left(u,v,w\\right)')).toBe('divergence(subst(grad((((x^2)*y)+sin(z)),[x,y,z]),[x,y,z],[u,v,w]),[u,v,w])');
  });

  test('so does d/dx: g(a) is 2a, not 2x', () => {
    expect(giac('g\\left(a\\right)')).toBe('subst(diff((x^2),x),[x],[a])');
    // Called with its own name, nothing to put in.
    expect(giac('\\frac{\\mathrm{d}}{\\mathrm{d}x}x^{2}')).toBe('diff((x^2),x)');
  });
});

describe('∇ on an expression, with its variables written below ∇', () => {
  const v3 = col('x\\cdot y', 'y\\cdot z^{2}', '\\sin \\left(x\\right)');
  const at3 = ['x\\coloneq 1', 'y\\coloneq 2', 'z\\coloneq 0.5'];

  test('reads and writes back, the names below ∇ and the expression after them', () => {
    for (const t of ['\\nabla _{x,y,z}{x}^{2}\\cdot y', '\\nabla _{x,y}\\cdot F\\left(x,y\\right)', '\\nabla _{x,y,z}\\times F\\left(x,y,z\\right)',
      '\\nabla _{x,y}^{2}\\left(x+y\\right)', '2\\cdot \\nabla _{x}{x}^{2}']) expect(tex(readTex(t))).toBe(t);
    // ∇² written either side of the names.
    expect(readTex('\\nabla ^{2}_{x,y}x')).toEqual(readTex('\\nabla _{x,y}^{2}x'));
    // The expression reads on through a product, as d/dx's does, and stops at a sum.
    expect(readTex('\\nabla _{x,y}x\\cdot y+1')).toEqual({ k: 'op', op: 'plus', args: [readTex('\\nabla _{x,y}\\left(x\\cdot y\\right)'), { k: 'real', v: 1 }] });
    // A call keeps its form.
    expect(readTex('\\nabla f\\left(x,y\\right)')).toEqual({ k: 'op', op: 'gradient', args: [readTex('f\\left(x,y\\right)')] });
  });

  test('the names must be names, each different, and ∇× takes 2 or 3', () => {
    expect(() => readTex('\\nabla _{x,x}x')).toThrow(/each a different name/);
    expect(() => readTex('\\nabla _{1,y}x')).toThrow(/each a different name/);
    expect(() => readTex('\\nabla _{x}\\times x')).toThrow(/3 variables, or 2/);
    expect(() => readTex('\\nabla _{x,y}')).toThrow(/goes before an expression/);
  });

  test('calculates at the names\' values here, as the call form does', () => {
    close(re(last(...at3, '\\nabla _{x,y,z}\\left(x^{2}\\cdot y+\\sin \\left(z\\right)\\right)=')), [4, 1, Math.cos(0.5)]);
    close(re(last(...at3, `\\nabla _{x,y,z}\\cdot ${v3}=`)), [2.25]);
    close(re(last(...at3, `\\nabla _{x,y,z}\\times ${v3}=`)), [-2, -Math.cos(1), -1]);
    close(re(last(...at3, '\\nabla _{x,y}^{2}\\left(x^{2}+y^{3}\\right)=')), [14], 4);
    close(re(last(...at3, `\\nabla _{x,y}\\times ${col('-y', 'x')}=`)), [2]);
    // The same as ∇f(x, y, z) for the same function.
    const f = 'f\\left(x,y,z\\right)\\coloneq x^{2}\\cdot y+\\sin \\left(z\\right)';
    close(re(last(...at3, f, '\\nabla _{x,y,z}f\\left(x,y,z\\right)=')), re(last(...at3, f, '\\nabla f\\left(x,y,z\\right)=')));
  });

  test('in a function definition, a range variable, and with units', () => {
    close(re(last('g\\left(x,y\\right)\\coloneq \\nabla _{x,y}\\left(x^{2}\\cdot y\\right)', 'g\\left(1,2\\right)=')), [4, 1]);
    const r = last('r\\coloneq 0..2', '\\nabla _{r}r^{2}=') as Mat;
    expect(r.rows).toBe(3);
    const L = last('L\\coloneq 2\\cdot \\mathrm{m}', '\\nabla _{L}\\left(5\\cdot \\mathrm{V}\\cdot \\frac{L}{\\mathrm{m}}\\right)=') as Mat;
    close(re(L), [5]);
    expect((getEl(L, 0, 0) as Num).dim).toEqual((last('1\\cdot \\frac{\\mathrm{V}}{\\mathrm{m}}=') as Num).dim);
  });

  test('refuses a name without a number, and says what it needs', () => {
    expect(() => last('x\\coloneq 1', '\\nabla _{x,q}\\left(x\\cdot q\\right)=')).toThrow();
    expect(() => last('x\\coloneq 1', 'y\\coloneq 2', `\\nabla _{x,y}\\cdot ${col('x', 'y', 'x')}=`)).toThrow(/vector of 2 parts, one for each of the 2 variables below ∇/);
    expect(() => last('x\\coloneq 1', 'y\\coloneq 2', `\\nabla _{x,y}${col('x', 'y')}=`)).toThrow(/^∇ needs the expression to give a number/);
  });

  test('with →, Giac\'s operator in the names written, even names with values on the sheet', () => {
    const defs = new Defs().with({ k: 'var', name: 'x' }, readTex('7'), new Scope(null));
    const giac = (latex: string): string => {
      const p = new Printer();
      return p.print(expand(readTex(latex), defs, new Set())).replace(/\bv\d+\b/g, (n) => p.back.get(n) ?? n);
    };
    expect(giac('\\nabla _{x,y}\\left(x^{2}\\cdot y\\right)')).toBe('grad(((x^2)*y),[x,y])');
    expect(giac('\\nabla _{x,y}^{2}x^{3}')).toBe('laplacian((x^3),[x,y])');
    expect(giac(`\\nabla _{x,y}\\cdot ${col('x', 'y')}`)).toBe('divergence([x,y],[x,y])');
    expect(giac(`\\nabla _{x,y}\\times ${col('-y', 'x')}`)).toBe('(diff(([(-y),x])[1],x)-diff(([(-y),x])[0],y))');
  });
});

describe('a square matrix to a power', () => {
  test('takes a plain number: a power with units is refused, as a number\'s is', () => {
    const A = 'A\\coloneq \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}';
    expect(() => last(A, 'A^{T}=')).toThrow(/exponent must be dimensionless/);
    expect(() => last(A, 'A^{2\\cdot \\mathrm{m}}=')).toThrow(/exponent must be dimensionless/);
    close(re(last(A, 'A^{\\frac{2\\cdot \\mathrm{m}}{\\mathrm{m}}}=')), [7, 15, 10, 22]);
    close(re(last(A, 'A^{\\mathsf{T}}=')), [1, 2, 3, 4]);
  });
});
