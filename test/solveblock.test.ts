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

import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import { runIncremental } from '../src/engine/incremental.js';
import { type Fn, type Mat, type Num, type Value, num } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readTex, tex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import type { Worksheet } from '../src/model/ast.js';
import { type XElement, importWorksheet } from '../src/xmcd/import.js';

const sheet = (lines: string[]): Worksheet => {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  return ws;
};
/** The last region's value, or its error as a thrown Error. */
function last(...lines: string[]): Value {
  const out = runWorksheet(sheet(lines)).at(-1)!;
  if (out.error) throw new Error(out.error.reason);
  return out.value!;
}
const re = (v: Value): number => (v as Num).re;
const vec = (v: Value): number[] => [...(v as Mat).re];
const call = (f: Value, x: number): number => ((f as Fn).call([num(x)]) as Num).re;

const CIRCLE = ['x\\coloneq 1', 'y\\coloneq 0.5', '\\mathrm{Given}', 'x^2+y^2=4', 'x-y=0'];

describe('Find and Minerr', () => {
  test('two equations in two unknowns, from guesses above Given', () => {
    // Mathcad 14 gives √2, √2 from these guesses.
    vec(last(...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=')).forEach((v) => expect(v).toBeCloseTo(Math.SQRT2, 14));
  });
  test('a definition from Find, of each variable', () => {
    expect(re(last(...CIRCLE, '\\begin{pmatrix}p\\\\q\\end{pmatrix}\\coloneq \\mathrm{Find}\\left(x,y\\right)', 'p\\cdot q='))).toBeCloseTo(2, 12);
  });
  test('an inequality keeps the answer on its side, from a guess on the other', () => {
    // Mathcad 14: 2, from u = −1.
    expect(re(last('u\\coloneq -1', '\\mathrm{Given}', 'u>0', 'u^2=4', '\\mathrm{Find}\\left(u\\right)='))).toBeCloseTo(2, 9);
    vec(last('x\\coloneq -1', 'y\\coloneq -0.5', '\\mathrm{Given}', 'x^2+y^2=4', 'x-y=0', 'x<0', '\\mathrm{Find}\\left(x,y\\right)=')).forEach((v) => expect(v).toBeCloseTo(-Math.SQRT2, 9));
  });
  test('Find reports no solution; Minerr gives the nearest', () => {
    expect(() => last('w\\coloneq 1', '\\mathrm{Given}', 'w^2=-1', '\\mathrm{Find}\\left(w\\right)=')).toThrow(/No solution was found/);
    expect(Math.abs(re(last('w\\coloneq 1', '\\mathrm{Given}', 'w^2=-1', '\\mathrm{Minerr}\\left(w\\right)=')))).toBeLessThan(1e-3);
  });
  test('units: the current through two resistors from a source', () => {
    const v = last('I\\coloneq 1\\cdot \\mathrm{mA}', '\\mathrm{Given}', '12\\cdot \\mathrm{V}=I\\cdot \\left(1\\cdot k\\Omega+2\\cdot k\\Omega\\right)', '\\mathrm{Find}\\left(I\\right)=') as Num;
    expect(v.re).toBeCloseTo(0.004, 14);
    expect([...v.dim]).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });
  test('a block is closed by its solver, and a solver needs one', () => {
    expect(() => last(...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=', '\\mathrm{Find}\\left(x,y\\right)=')).toThrow(/Given above/);
    expect(() => last('x\\coloneq 1', '\\mathrm{Find}\\left(x\\right)=')).toThrow(/Given above/);
    expect(() => last('\\mathrm{Given}', 'z^2=4', '\\mathrm{Find}\\left(z\\right)=')).toThrow(/needs a guess for z/);
  });
  test('a function from a solve block, its constraints using the parameter, as f(a) := Find(x)', () => {
    const lines = ['x\\coloneq 1', '\\mathrm{Given}', 'x^2=a', 'f\\left(a\\right)\\coloneq \\mathrm{Find}\\left(x\\right)'];
    expect(re(last(...lines, 'f\\left(9\\right)='))).toBeCloseTo(3, 12);
    expect(re(last(...lines, 'f\\left(16\\right)='))).toBeCloseTo(4, 12);
    const ode = ['\\mathrm{Given}', "y'\\left(t\\right)=-k\\cdot y\\left(t\\right)", 'y\\left(0\\right)=1', 'Y\\left(k\\right)\\coloneq \\mathrm{Odesolve}\\left(t,2\\right)'];
    expect(call(last(...ode, 'Y\\left(2\\right)='), 1)).toBeCloseTo(Math.exp(-2), 10);
  });
  test("a sheet's own function named Find is called as itself", () => {
    expect(re(last('\\mathrm{Find}\\left(a\\right)\\coloneq a+1', '\\mathrm{Find}\\left(2\\right)='))).toBe(3);
  });
});

describe('Find with arrays and complex numbers, and ERR', () => {
  // Each as Mathcad 14 gave it.
  const G = '\\mathrm{Given}';
  const M = 'M\\coloneq \\begin{pmatrix}2&1\\\\1&3\\end{pmatrix}';
  const B = 'b\\coloneq \\begin{pmatrix}3\\\\5\\end{pmatrix}';
  const X = 'x\\coloneq \\begin{pmatrix}0\\\\0\\end{pmatrix}';
  test('a vector unknown, its elements in the constraints', () => {
    const v = last('v\\coloneq \\begin{pmatrix}1\\\\1\\end{pmatrix}', G, 'v_{0}+v_{1}=3', 'v_{0}-v_{1}=1', '\\mathrm{Find}\\left(v\\right)=');
    vec(v).forEach((e, i) => expect(e).toBeCloseTo([2, 1][i]!, 12));
  });
  test('a vector equation, M·x = b, holds element by element', () => {
    vec(last(M, B, X, G, 'M\\cdot x=b', '\\mathrm{Find}\\left(x\\right)=')).forEach((e, i) => expect(e).toBeCloseTo([0.8, 1.4][i]!, 12));
  });
  test('a vector and a number together come back nested', () => {
    const out = last(X, 's\\coloneq 1', G, 'x_{0}+s=3', 'x_{1}-s=1', 's=2', '\\mathrm{Find}\\left(x,s\\right)=') as Mat;
    expect(out.rows).toBe(2);
    vec(out.cells![0]!).forEach((e, i) => expect(e).toBeCloseTo([1, 3][i]!, 12));
    expect(re(out.cells![1]!)).toBeCloseTo(2, 12);
  });
  test('a matrix unknown: A·A = M gives its square root', () => {
    const A = last(M, 'A\\coloneq \\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}', G, 'A\\cdot A=M', '\\mathrm{Find}\\left(A\\right)=') as Mat;
    expect([A.rows, A.cols]).toEqual([2, 2]);
    vec(A).forEach((e, i) => expect(e).toBeCloseTo([1.3763819204711736, 0.32491969623290634, 0.32491969623290634, 1.7013016167040798][i]!, 8));
  });
  test('a vector in units', () => {
    const p = last('p\\coloneq \\begin{pmatrix}1\\cdot \\mathrm{m}\\\\1\\cdot \\mathrm{m}\\end{pmatrix}', G, 'p_{0}+p_{1}=3\\cdot \\mathrm{m}', 'p_{0}-p_{1}=1\\cdot \\mathrm{m}', '\\mathrm{Find}\\left(p\\right)=') as Mat;
    vec(p).forEach((e, i) => expect(e).toBeCloseTo([2, 1][i]!, 12));
    expect(p.dim).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  test('an inequality on a vector holds for each element', () => {
    vec(last('y\\coloneq \\begin{pmatrix}-1\\\\-1\\end{pmatrix}', G, 'y>0', 'y\\cdot y=1', 'y_{0}=y_{1}', '\\mathrm{Find}\\left(y\\right)='))
      .forEach((e) => expect(e).toBeCloseTo(Math.SQRT1_2, 9));
  });
  test('a complex guess finds a complex answer; a real one stays real', () => {
    const z = last('z\\coloneq 1+1\\mathrm{i}', G, 'z^2=-4', '\\mathrm{Find}\\left(z\\right)=') as Num;
    expect(z.re).toBeCloseTo(0, 12);
    expect(z.im).toBeCloseTo(2, 12);
    expect(() => last('w\\coloneq 1', G, 'w^2=-4', '\\mathrm{Find}\\left(w\\right)=')).toThrow(/No solution/);
    const c = last('c\\coloneq \\begin{pmatrix}1+1\\mathrm{i}\\\\1\\end{pmatrix}', G, 'c_{0}+c_{1}=3+2\\mathrm{i}', 'c_{0}-c_{1}=1', '\\mathrm{Find}\\left(c\\right)=') as Mat;
    expect(c.rows).toBe(2);
    [...c.re].forEach((e, i) => expect(e).toBeCloseTo([2, 1][i]!, 12));
    [...c.im!].forEach((e) => expect(e).toBeCloseTo(1, 12));
  });
  test('ERR: how far Minerr is from meeting the constraints, inequalities included', () => {
    expect(re(last('q\\coloneq 1', G, 'q=1', 'q=2', '\\mathrm{Minerr}\\left(q\\right)=', 'ERR='))).toBeCloseTo(Math.SQRT1_2, 9);
    // Mathcad 14: 2.6666666642, ERR 2.9439202888.
    expect(re(last('q\\coloneq 1', G, 'q=1', 'q=2', 'q>5', '\\mathrm{Minerr}\\left(q\\right)='))).toBeCloseTo(8 / 3, 8);
    expect(re(last('q\\coloneq 1', G, 'q=1', 'q=2', 'q>5', '\\mathrm{Minerr}\\left(q\\right)=', 'ERR='))).toBeCloseTo(2.9439202887759492, 8);
    expect(re(last(M, B, X, G, 'M\\cdot x=b', 'x_{0}=1', '\\mathrm{Minerr}\\left(x\\right)=', 'ERR='))).toBeCloseTo(0.16903085094570336, 9);
    const z = last('z\\coloneq 1+1\\mathrm{i}', G, 'z^2=-4', 'z=1', '\\mathrm{Minerr}\\left(z\\right)=') as Num;
    expect([z.re, z.im].map((v) => +v.toFixed(7))).toEqual([0.0625, 1.8697844]);
    expect(re(last('z\\coloneq 1+1\\mathrm{i}', G, 'z^2=-4', 'z=1', '\\mathrm{Minerr}\\left(z\\right)=', 'ERR='))).toBeCloseTo(2.1650635094610968, 8);
  });
  test('ERR is 0 after a Find that solves exactly, and undefined before any', () => {
    expect(re(last(...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=', 'ERR='))).toBeCloseTo(0, 12);
    expect(() => last('ERR=')).toThrow();
  });
  test('Maximize over a vector calls the function with it', () => {
    vec(last('f\\left(v\\right)\\coloneq -\\left(v_{0}-1\\right)^2-\\left(v_{1}-2\\right)^2', 'v\\coloneq \\begin{pmatrix}0\\\\0\\end{pmatrix}', '\\mathrm{Maximize}\\left(f,v\\right)='))
      .forEach((e, i) => expect(e).toBeCloseTo([1, 2][i]!, 6));
  });
});

describe('root, Maximize and Minimize', () => {
  test('root from a guess, and between a and b', () => {
    expect(re(last('x\\coloneq 1', '\\mathrm{root}\\left(x^2-2,x\\right)='))).toBeCloseTo(Math.SQRT2, 14);
    expect(re(last('\\mathrm{root}\\left(x^2-2,x,-3,0\\right)='))).toBeCloseTo(-Math.SQRT2, 15);
    expect(() => last('\\mathrm{root}\\left(x^2-2,x,2,3\\right)=')).toThrow(/opposite signs/);
    expect(() => last('x\\coloneq 1', '\\mathrm{root}\\left(x^2+1,x\\right)=')).toThrow(/no root/);
  });
  test('Maximize and Minimize, alone and inside a solve block', () => {
    expect(re(last('f\\left(x\\right)\\coloneq -\\left(x-3\\right)^2', 'x\\coloneq 1', '\\mathrm{Maximize}\\left(f,x\\right)='))).toBeCloseTo(3, 6);
    expect(re(last('f\\left(x\\right)\\coloneq \\left(x-3\\right)^2', 'x\\coloneq 1', '\\mathrm{Given}', 'x\\le 2', '\\mathrm{Minimize}\\left(f,x\\right)='))).toBeCloseTo(2, 2);
    expect(() => last('f\\left(x\\right)\\coloneq x', 'x\\coloneq 1', '\\mathrm{Minimize}\\left(f,x\\right)=')).toThrow(/without bound/);
  });
});

describe('Odesolve', () => {
  test('a first-order equation with the derivative operator, as the probe', () => {
    // Mathcad 14 gave 0.367880853…, 1.4·10⁻⁶ from e⁻¹.
    const g = last('\\mathrm{Given}', '\\frac{\\mathrm{d}}{\\mathrm{d}t}g\\left(t\\right)+g\\left(t\\right)=0', 'g\\left(0\\right)=1', 'g\\coloneq \\mathrm{Odesolve}\\left(t,2\\right)', 'g=');
    expect(call(g, 1)).toBeCloseTo(Math.exp(-1), 12);
  });
  test('second and third orders with the nth derivative operator, as the probe', () => {
    // Mathcad 14: y(1) = 0.84146784 (sin 1 to 3·10⁻⁶), u(1) = 0.36788112 (e⁻¹), v(0.5) = 0.47942544 (sin 0.5).
    const D = (n: number, f: string) => `\\frac{\\mathrm{d}^{${n}}}{\\mathrm{d}t^{${n}}}${f}\\left(t\\right)`;
    const y = last('\\mathrm{Given}', `${D(2, 'y')}+y\\left(t\\right)=0`, 'y\\left(0\\right)=0', "y'\\left(0\\right)=1", 'y\\coloneq \\mathrm{Odesolve}\\left(t,2\\right)', 'y=');
    expect(call(y, 1)).toBeCloseTo(Math.sin(1), 12);
    const u = last('\\mathrm{Given}', `${D(3, 'u')}=-u\\left(t\\right)`, 'u\\left(0\\right)=1', "u'\\left(0\\right)=-1", "u''\\left(0\\right)=1", 'u\\coloneq \\mathrm{Odesolve}\\left(t,1\\right)', 'u=');
    expect(call(u, 1)).toBeCloseTo(Math.exp(-1), 12);
    const v = last('\\mathrm{Given}', `${D(2, 'v')}=-v\\left(t\\right)`, 'v\\left(0\\right)=0', 'v\\left(\\frac{\\pi}{2}\\right)=1', 'v\\coloneq \\mathrm{Odesolve}\\left(t,\\frac{\\pi}{2}\\right)', 'v=');
    expect(call(v, 0.5)).toBeCloseTo(Math.sin(0.5), 8);
  });
  test("a second-order equation in primes: y'' + y = 0 is sin", () => {
    const y = last('\\mathrm{Given}', "y''\\left(t\\right)+y\\left(t\\right)=0", 'y\\left(0\\right)=0', "y'\\left(0\\right)=1", 'y\\coloneq \\mathrm{Odesolve}\\left(t,10\\right)', 'y=');
    for (const x of [0, 1.3, Math.PI / 2, 7.77, 10]) expect(call(y, x)).toBeCloseTo(Math.sin(x), 9);
    expect(() => call(y, 11)).toThrow(/solved from 0 to 10/);
  });
  test('a system, by a vector of unknowns', () => {
    const out = last('\\mathrm{Given}', "x'\\left(t\\right)=y\\left(t\\right)", "y'\\left(t\\right)=-x\\left(t\\right)", 'x\\left(0\\right)=1', 'y\\left(0\\right)=0',
      'S\\coloneq \\mathrm{Odesolve}\\left(\\begin{pmatrix}x\\\\y\\end{pmatrix},t,5\\right)', 'S=') as Mat;
    expect(call(out.cells![0]!, 2)).toBeCloseTo(Math.cos(2), 9);
    expect(call(out.cells![1]!, 2)).toBeCloseTo(-Math.sin(2), 9);
  });
  test('an RC discharge in volts and seconds', () => {
    const v = last('R\\coloneq 1\\cdot k\\Omega', 'C\\coloneq 1\\cdot \\mathrm{mF}', '\\mathrm{Given}', "v'\\left(t\\right)=\\frac{-v\\left(t\\right)}{R\\cdot C}", 'v\\left(0\\cdot \\mathrm{s}\\right)=5\\cdot \\mathrm{V}',
      'v\\coloneq \\mathrm{Odesolve}\\left(t,3\\cdot \\mathrm{s}\\right)', 'v\\left(1\\cdot \\mathrm{s}\\right)=') as Num;
    expect(v.re).toBeCloseTo(5 * Math.exp(-1), 9);
    expect([...v.dim]).toEqual([2, 1, -3, -1, 0, 0, 0]);
  });
  test('what it needs: an equation per unknown and its starting values', () => {
    expect(() => last('\\mathrm{Given}', "y'\\left(t\\right)=y\\left(t\\right)", 'y\\coloneq \\mathrm{Odesolve}\\left(t,1\\right)')).toThrow(/starting values/);
    expect(() => last('\\mathrm{Given}', "y''\\left(t\\right)=-y\\left(t\\right)", 'y\\left(0\\right)=0', 'y\\coloneq \\mathrm{Odesolve}\\left(t,1\\right)')).toThrow(/one starting value for y'/);
  });
});

/** An Odesolve block for y, from the equation and conditions, as y := Odesolve(t, end), giving y. */
const odesolve = (end: string, ...lines: string[]): Value => last('\\mathrm{Given}', ...lines, `y\\coloneq \\mathrm{Odesolve}\\left(t,${end}\\right)`, 'y=');
const HALF_PI = '1.5707963267949';

describe('Odesolve with conditions at two points', () => {
  test("y'' + y = 0 from y(0) = 0 to y(π/2) = 1 is sin", () => {
    // Mathcad 14 gave y(1) = 0.841469884, 1.1·10⁻⁶ from sin 1.
    const y = odesolve(HALF_PI, "y''\\left(t\\right)+y\\left(t\\right)=0", 'y\\left(0\\right)=0', `y\\left(${HALF_PI}\\right)=1`);
    for (const x of [0, 0.4, 1, Math.PI / 2]) expect(call(y, x)).toBeCloseTo(Math.sin(x), 8);
  });
  test('a derivative at the far end, and the conditions in either order', () => {
    // Mathcad 14: w(1) = 0.500000006 for t − t²/2, and p(0.5) = 0.125 for t³.
    const w = odesolve('1', "y''\\left(t\\right)=-1", 'y\\left(0\\right)=0', "y'\\left(1\\right)=0");
    expect(call(w, 1)).toBeCloseTo(0.5, 10);
    const p = odesolve('1', "y''\\left(t\\right)=6\\cdot t", 'y\\left(1\\right)=1', 'y\\left(0\\right)=0');
    expect(call(p, 0.5)).toBeCloseTo(0.125, 10);
  });
  test('a nonlinear equation: Bratu, from the guess 0 to the lower of its two solutions', () => {
    // Mathcad 14: q(0.5) = 0.140539963. The exact value is 0.1405392159…
    const q = odesolve('1', "y''\\left(t\\right)+e^{y\\left(t\\right)}=0", 'y\\left(0\\right)=0', 'y\\left(1\\right)=0');
    expect(call(q, 0.5)).toBeCloseTo(0.14053921, 7);
  });
  test('the solution runs from the point farther from the end: the second point may be inside or beyond', () => {
    // Mathcad 14: v(2) = 0.909273117 with the second point inside; g(1) = 1 with it past the end, and
    // g(1.5) is outside the solution, as h(0.5) is when both points come before the end.
    const v = odesolve('2', "y''\\left(t\\right)+y\\left(t\\right)=0", 'y\\left(0\\right)=0', `y\\left(1\\right)=${Math.sin(1)}`);
    expect(call(v, 2)).toBeCloseTo(Math.sin(2), 9);
    const g = odesolve('1', "y''\\left(t\\right)=0", 'y\\left(0\\right)=0', 'y\\left(2\\right)=2');
    expect(call(g, 1)).toBeCloseTo(1, 12);
    expect(() => call(g, 1.5)).toThrow(/solved from 0 to 1/);
    const h = odesolve('3', "y''\\left(t\\right)=0", 'y\\left(1\\right)=1', 'y\\left(2\\right)=2');
    expect(call(h, 3)).toBeCloseTo(3, 12);
    expect(() => call(h, 0.5)).toThrow(/solved from 1 to 3/);
  });
  test('a third-order equation, and a system with its conditions on one unknown', () => {
    // Mathcad 14: u(0.5) = 0.250000002; a(1) = 0.841469884 and b(0) = 0.999999995.
    const u = odesolve('1', "y'''\\left(t\\right)=0", 'y\\left(0\\right)=0', "y'\\left(0\\right)=0", 'y\\left(1\\right)=1');
    expect(call(u, 0.5)).toBeCloseTo(0.25, 10);
    const s = last('\\mathrm{Given}', "a'\\left(t\\right)=b\\left(t\\right)", "b'\\left(t\\right)=-a\\left(t\\right)", 'a\\left(0\\right)=0', `a\\left(${HALF_PI}\\right)=1`,
      `\\begin{pmatrix}a\\\\b\\end{pmatrix}\\coloneq \\mathrm{Odesolve}\\left(\\begin{pmatrix}a\\\\b\\end{pmatrix},t,${HALF_PI}\\right)`, 'b\\left(0\\right)=');
    expect(re(s)).toBeCloseTo(1, 8);
  });
  test('a solution that grows fast, where shooting from one end alone loses it', () => {
    // y'' = 100·y, y(0) = 1, y(5) = 0: sinh(10·(5 − t))/sinh 50. Mathcad 14 gives −9.6·10⁻⁹ at 2.5, for 1.39·10⁻¹¹.
    const y = odesolve('5', "y''\\left(t\\right)=100\\cdot y\\left(t\\right)", 'y\\left(0\\right)=1', 'y\\left(5\\right)=0');
    for (const x of [0.5, 1, 2.5]) expect(call(y, x)).toBeCloseTo(Math.sinh(10 * (5 - x)) / Math.sinh(50), 10);
    // y'' = y over 0 to 10 once stopped a hair short of a point it had to reach.
    const w = odesolve('10', "y''\\left(t\\right)=y\\left(t\\right)", 'y\\left(0\\right)=1', 'y\\left(10\\right)=0');
    expect(call(w, 5)).toBeCloseTo(Math.sinh(5) / Math.sinh(10), 9);
  });
  test('a cable sagging under its own weight, in metres', () => {
    // y'' = k·√(1 + y'²) between supports at 0 and 100 m, both at 0 m: a catenary, (cosh(k·(x − 50 m)) − cosh(50 m·k))/k.
    const y = last('k\\coloneq 0.01\\cdot \\mathrm{m}^{-1}', '\\mathrm{Given}', "y''\\left(x\\right)=k\\cdot \\sqrt{1+y'\\left(x\\right)^2}",
      'y\\left(0\\cdot \\mathrm{m}\\right)=0\\cdot \\mathrm{m}', 'y\\left(100\\cdot \\mathrm{m}\\right)=0\\cdot \\mathrm{m}', 'y\\coloneq \\mathrm{Odesolve}\\left(x,100\\cdot \\mathrm{m}\\right)',
      'y\\left(50\\cdot \\mathrm{m}\\right)=') as Num;
    expect(y.re).toBeCloseTo(100 * (1 - Math.cosh(0.5)), 7);
    expect([...y.dim]).toEqual([1, 0, 0, 0, 0, 0, 0]);
    // Ten times as heavy: a sag of 732 m, which Newton's method reaches only by shorter steps on the way.
    const deep = last('k\\coloneq 0.1\\cdot \\mathrm{m}^{-1}', '\\mathrm{Given}', "y''\\left(x\\right)=k\\cdot \\sqrt{1+y'\\left(x\\right)^2}",
      'y\\left(0\\cdot \\mathrm{m}\\right)=0\\cdot \\mathrm{m}', 'y\\left(100\\cdot \\mathrm{m}\\right)=0\\cdot \\mathrm{m}', 'y\\coloneq \\mathrm{Odesolve}\\left(x,100\\cdot \\mathrm{m}\\right)',
      'y\\left(50\\cdot \\mathrm{m}\\right)=') as Num;
    expect(deep.re / (10 * (1 - Math.cosh(5)))).toBeCloseTo(1, 8);
  });
  test("errors as Mathcad's: no solution, three points, a condition that isn't a value, too many", () => {
    // Mathcad 14: "Root finder failed to converge", "Error in initial conditions", "Too few initial conditions".
    expect(() => odesolve('3.14159265358979', "y''\\left(t\\right)+y\\left(t\\right)=0", 'y\\left(0\\right)=0', 'y\\left(3.14159265358979\\right)=1')).toThrow(/can't meet the conditions at both points/);
    expect(() => odesolve('1', "y'''\\left(t\\right)=0", 'y\\left(0\\right)=0', 'y\\left(0.5\\right)=0.25', 'y\\left(1\\right)=1')).toThrow(/two points at most/);
    expect(() => odesolve('1', "y''\\left(t\\right)=-1", 'y\\left(0\\right)=0', "y\\left(1\\right)+y'\\left(1\\right)=0")).toThrow(/must give one value/);
    expect(() => odesolve('1', "y''\\left(t\\right)=-1", 'y\\left(0\\right)=0', "y'\\left(0\\right)=0", 'y\\left(1\\right)=0')).toThrow(/needs 2 conditions/);
    expect(() => odesolve('1', "y'\\left(t\\right)=1", 'y\\left(0\\right)=0', 'y\\left(1\\right)=0')).toThrow(/needs 1 condition,/);
    expect(() => odesolve('1', "y''\\left(t\\right)=-1", 'y\\left(0\\right)=0', 'y\\left(1\\right)=0', 'y\\left(1\\right)=1')).toThrow(/two conditions for y at t = 1/);
  });
  test('a starting value nothing fixes stays at 0, as in Mathcad', () => {
    // z'' = 0 with z'(0) = z'(1) = 1: Mathcad 14 gives z(1) = 1.
    expect(call(odesolve('1', "y''\\left(t\\right)=0", "y'\\left(0\\right)=1", "y'\\left(1\\right)=1"), 1)).toBeCloseTo(1, 12);
  });
});

describe('reading and writing', () => {
  test("primes are part of the name, as Mathcad keeps them: y'' is y″", () => {
    expect(readTex("y''\\left(t\\right)")).toEqual({ k: 'call', fn: { k: 'id', name: "y''" }, args: [{ k: 'id', name: 't' }] });
    expect(readTex('y^{\\prime}\\left(t\\right)')).toEqual({ k: 'call', fn: { k: 'id', name: "y'" }, args: [{ k: 'id', name: 't' }] });
    expect(tex(readTex("y''\\left(t\\right)"))).toBe("y''\\left(t\\right)");
  });
  test("a Mathcad sheet's solve block, with Find saved as its own element", () => {
    // As Mathcad 14 saved the probe: Given as a name, the constraints as equations, Find with its settings.
    const NS = 'xmlns:ml="http://schemas.mathsoft.com/math30"';
    const region = (k: number, math: string) => `<region region-id="${k}" left="0" top="${k * 20}" align-x="0" align-y="${k * 20}"><math>${math}</math></region>`;
    const xml = `<worksheet xmlns:ml="m"><settings><calculation><builtInVariables array-origin="0" convergence-tolerance="0.001" constraint-tolerance="0.001"/></calculation></settings><regions>${[
      `<ml:define ${NS}><ml:id>x</ml:id><ml:real>1</ml:real></ml:define>`,
      `<ml:id ${NS}>Given</ml:id>`,
      `<ml:apply ${NS}><ml:equal/><ml:apply><ml:pow/><ml:id>x</ml:id><ml:real>2</ml:real></ml:apply><ml:real>9</ml:real></ml:apply>`,
      `<ml:eval ${NS}><ml:apply><ml:Find auto-method="true" method="levenberg"/><ml:id>x</ml:id></ml:apply></ml:eval>`,
    ].map((m, k) => region(k, m)).join('')}</regions></worksheet>`;
    const ws = importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
    expect(ws.ctol).toBe(0.001);
    expect(re(runWorksheet(ws).at(-1)!.value!)).toBeCloseTo(3, 12);
  });
});

describe('recalculating', () => {
  const noAlgebra = async () => ({ result: null, error: 'none' });
  test('editing a constraint calculates its Find again; deleting Given makes it an error', async () => {
    const before = sheet([...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=']);
    const first = await runIncremental(before, noAlgebra, null);
    vec(first.outcomes.at(-1)!.value!).forEach((v) => expect(v).toBeCloseTo(Math.SQRT2, 12));
    const edited = sheet([...CIRCLE.slice(0, 3), 'x^2+y^2=8', 'x-y=0', '\\mathrm{Find}\\left(x,y\\right)=']);
    const next = await runIncremental(edited, noAlgebra, first.snapshot);
    expect(next.ran).toContain('r5');
    vec(next.outcomes.at(-1)!.value!).forEach((v) => expect(v).toBeCloseTo(2, 12));
    const noGiven = sheet([...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=']);
    noGiven.regions.splice(2, 1);
    const third = await runIncremental(noGiven, noAlgebra, next.snapshot);
    expect(third.outcomes.at(-1)!.error?.reason).toMatch(/Given above/);
  });
  test('ERR below Minerr changes when a constraint does', async () => {
    const lines = (k: string) => sheet(['q\\coloneq 1', '\\mathrm{Given}', 'q=1', `q=${k}`, '\\mathrm{Minerr}\\left(q\\right)=', 'ERR=']);
    const first = await runIncremental(lines('2'), noAlgebra, null);
    expect(re(first.outcomes.at(-1)!.value!)).toBeCloseTo(Math.SQRT1_2, 9);
    const next = await runIncremental(lines('3'), noAlgebra, first.snapshot);
    expect(next.ran).toContain('r5');
    expect(re(next.outcomes.at(-1)!.value!)).toBeCloseTo(Math.SQRT2, 9);
  });
});
