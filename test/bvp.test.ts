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
import { runWorksheet } from '../src/engine/evaluate.js';
import type { Mat } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

// statespace, sbval, bvalfit and Jacob against Mathcad 14's answers (test/bvp-reference.json) and closed forms.
type Entry = number | [number, number];
const REF = JSON.parse(readFileSync(new URL('./bvp-reference.json', import.meta.url), 'utf8')) as Record<'statespace' | 'statespaceTight' | 'shoot' | 'jacob', Record<string, Entry[][]>>;
const v = (xs: (number | string)[]) => `\\begin{pmatrix}${xs.join('\\\\')}\\end{pmatrix}`;
const y = (k: number) => `y_{${k}}`;
const DEFS = [
  'A1\\left(t\\right)\\coloneq \\begin{pmatrix}0&1\\\\-4&-0.2\\end{pmatrix}', 'A2\\left(t\\right)\\coloneq \\begin{pmatrix}0&1\\\\-t&0\\end{pmatrix}',
  `Bv\\left(t\\right)\\coloneq ${v([0, 1])}`, 'us\\left(t\\right)\\coloneq \\sin \\left(t\\right)', 'Bm\\left(t\\right)\\coloneq \\begin{pmatrix}1&0\\\\0&2\\end{pmatrix}',
  `uv\\left(t\\right)\\coloneq ${v([1, '2\\cdot t'])}`, 'A3\\left(t\\right)\\coloneq \\begin{pmatrix}-1\\end{pmatrix}',
  `D1\\left(x,y\\right)\\coloneq ${v([y(1), `-${y(0)}`])}`, `ld1\\left(x1,v\\right)\\coloneq ${v([0, 'v_{0}'])}`, `sc1\\left(x2,y\\right)\\coloneq ${y(0)}-1`,
  `D2\\left(x,y\\right)\\coloneq ${v([y(1), `1.5\\cdot ${y(0)}^{2}`])}`, `ld2\\left(x1,v\\right)\\coloneq ${v([4, 'v_{0}'])}`, `sc2\\left(x2,y\\right)\\coloneq ${y(0)}-1`,
  `D3\\left(x,y\\right)\\coloneq ${v([y(1), y(2), `-0.5\\cdot ${y(0)}\\cdot ${y(2)}`])}`, `ld3\\left(x1,v\\right)\\coloneq ${v([0, 0, 'v_{0}'])}`, `sc3\\left(x2,y\\right)\\coloneq ${y(1)}-1`,
  `D4\\left(x,y\\right)\\coloneq ${v([y(1), `-${y(0)}+${y(2)}`, y(3), `-${y(2)}`])}`, `ld4\\left(x1,v\\right)\\coloneq ${v([0, 'v_{0}', 1, 'v_{1}'])}`, `sc4\\left(x2,y\\right)\\coloneq ${v([`${y(0)}-0.5`, `${y(2)}-0.2`])}`,
  `la\\left(x1,v\\right)\\coloneq ${v([0, 'v_{0}'])}`, `lb\\left(x2,w\\right)\\coloneq ${v([1, 'w_{0}'])}`, 'sf\\left(xf,y\\right)\\coloneq y',
  `D5\\left(x,y\\right)\\coloneq ${v([y(1), `-\\mathrm{if}\\left(x<0.5,1,4\\right)\\cdot ${y(0)}`])}`,
  `Db\\left(x,y\\right)\\coloneq ${v([y(1), y(2), y(3), 1])}`, `l1\\left(x1,v\\right)\\coloneq ${v([0, 0, 'v_{0}', 'v_{1}'])}`, `l2\\left(x2,w\\right)\\coloneq ${v(['w_{0}', 'w_{1}', 0, 0])}`,
  `Dc\\left(x,y\\right)\\coloneq ${v([y(1), y(2), `-${y(0)}`])}`, `m1\\left(x1,v\\right)\\coloneq ${v([0, 'v_{0}', 'v_{1}'])}`, `m2\\left(x2,w\\right)\\coloneq ${v(['w_{0}', 0.5, 0.2])}`,
  `F1\\left(x\\right)\\coloneq ${v(['x_{0}^{2}\\cdot x_{1}', '5\\cdot x_{0}+\\sin \\left(x_{1}\\right)', 'x_{2}\\cdot x_{0}'])}`,
  `F2\\left(x\\right)\\coloneq ${v(['e^{x_{0}\\cdot x_{1}}', '\\frac{1}{1+x_{0}^{2}}'])}`, 'g1\\left(x\\right)\\coloneq x_{0}^{3}+x_{0}\\cdot x_{1}',
  `Fc\\left(x\\right)\\coloneq ${v(['x_{0}\\cdot 1\\mathrm{i}', 'x_{1}^{2}'])}`,
  `xv\\coloneq ${v([1, 2, 3])}`, `xw\\coloneq ${v([0.3, 1.7])}`, `xl\\coloneq ${v([1, 2, 3, 4])}`, `xz\\coloneq ${v([0, 2, 3])}`, `xc\\coloneq ${v([2, 3])}`,
];
/** Each line's value or error, after the shared definitions. */
function run(lines: string[]): { value: Mat | undefined; error: string | undefined }[] {
  const ws = emptyWorksheet();
  ws.regions = [...DEFS, ...lines].map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30, alignX: 0, alignY: i * 30 + 8, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).slice(DEFS.length).map((o) => ({ value: o.value as Mat | undefined, error: o.error?.reason }));
}
function within(m: Mat | undefined, want: Entry[][], tol: number, what: string): void {
  expect(m, what).toBeDefined();
  expect([m!.rows, m!.cols], what).toEqual([want.length, want[0]!.length]);
  for (let i = 0; i < m!.rows; i++) for (let j = 0; j < m!.cols; j++) {
    const k = j * m!.rows + i;
    const got = m!.cells ? (m!.cells[k] as { re: number; im: number }) : { re: m!.re[k]!, im: m!.im?.[k] ?? 0 };
    const w = want[i]![j]!;
    const [re, im] = typeof w === 'number' ? [w, 0] : w;
    expect(Math.abs(got.re - re) + Math.abs(got.im - im) <= tol * Math.max(1, Math.abs(re)), `${what} [${i},${j}]: ${got.re} vs ${re}`).toBe(true);
  }
}

const SS: [string, string][] = [['ss const', `${v([1, 0])},0,5,10,A1`], ['ss const 40', `${v([1, 0])},0,5,40,A1`], ['ss airy', `${v([1, 0])},0,3,6,A2`],
  ['ss Bu', `${v([0, 0])},0,4,8,A1,Bv,us`], ['ss Bm', `${v([1, -1])},0,2,4,A1,Bm,uv`], ['ss scalar', `${v([2])},0,1,4,A3`], ['ss backwards', `${v([1, 0])},5,0,5,A1`]];

describe('statespace', () => {
  const outs = run(SS.map(([, a]) => `\\mathrm{statespace}\\left(${a}\\right)=`));
  SS.forEach(([lab], k) => {
    test(`${lab}: Mathcad's at TOL 1e-10, and within its own 1e-4 at the default TOL`, () => {
      within(outs[k]!.value, REF.statespaceTight[lab]!, 2e-9, lab);
      within(outs[k]!.value, REF.statespace[lab]!, 1e-4, lab);
    });
  });
  test('a stiff system, rates 1 and 1e5 apart, is quick and exact', () => {
    const t = performance.now();
    const [o] = run(['As\\left(t\\right)\\coloneq \\begin{pmatrix}-1&0\\\\0&-100000\\end{pmatrix}', `\\mathrm{statespace}\\left(${v([1, 1])},0,10,10,As\\right)=`]).slice(1);
    expect(performance.now() - t).toBeLessThan(2000);
    const m = o!.value!;
    for (let i = 0; i < m.rows; i++) expect(Math.abs(m.re[i + m.rows]! - Math.exp(-m.re[i]!))).toBeLessThan(1e-11);
  });
  test('the constant system against its closed form', () => {
    const m = outs[1]!.value!;
    const w = Math.sqrt(3.99);
    for (let i = 0; i < m.rows; i++) {
      const t = m.re[i]!;
      expect(Math.abs(m.re[i + m.rows]! - Math.exp(-0.1 * t) * (Math.cos(w * t) + (0.1 / w) * Math.sin(w * t)))).toBeLessThan(1e-11);
    }
  });
  test('what is refused, as Mathcad refuses it', () => {
    const errs = run([
      'Am\\coloneq \\begin{pmatrix}0&1\\\\-4&-0.2\\end{pmatrix}', `\\mathrm{statespace}\\left(${v([1, 0])},0,5,10,Am\\right)=`,
      `\\mathrm{statespace}\\left(${v([1, 0])},0,5,10,A1,Bv\\right)=`, `\\mathrm{statespace}\\left(${v([1, 0, 0])},0,5,10,A1\\right)=`,
      `\\mathrm{statespace}\\left(${v([1, 0])}\\cdot \\mathrm{m},0,5,10,A1\\right)=`, `\\mathrm{statespace}\\left(${v([1, 0])},0,5,0,A1\\right)=`,
    ]).slice(1).map((o) => o.error);
    expect(errs[0]).toMatch(/A must be a function of t/);
    expect(errs[1]).toMatch(/u\(t\) with B\(t\)/);
    expect(errs[2]).toMatch(/2 × 2|3 × 3/);
    expect(errs[3]).toMatch(/without units/);
    expect(errs[4]).toMatch(/number of points/);
  });
});

const SHOOT: [string, string, number][] = [
  ['sbval lin', `\\mathrm{sbval}\\left(${v([1])},0,1,D1,ld1,sc1\\right)=`, 1e-13], ['sbval nl -8', `\\mathrm{sbval}\\left(${v([-8])},0,1,D2,ld2,sc2\\right)=`, 1e-13],
  ['sbval nl -36', `\\mathrm{sbval}\\left(${v([-36])},0,1,D2,ld2,sc2\\right)=`, 1e-11], ['sbval nl -7', `\\mathrm{sbval}\\left(${v([-7])},0,1,D2,ld2,sc2\\right)=`, 1e-13],
  ['sbval nl -10', `\\mathrm{sbval}\\left(${v([-10])},0,1,D2,ld2,sc2\\right)=`, 1e-13], ['sbval blasius', `\\mathrm{sbval}\\left(${v([0.3])},0,3,D3,ld3,sc3\\right)=`, 1e-10],
  // Mathcad stops 6e−9 short of the exact answer here, (0.2 − cos 1)/sin 1; MathMath reaches it.
  ['sbval two', `\\mathrm{sbval}\\left(${v([0, 0])},0,1,D4,ld4,sc4\\right)=`, 2e-8],
  ['bvalfit lin', `\\mathrm{bvalfit}\\left(${v([1])},${v([1])},0,1,0.5,D1,la,lb,sf\\right)=`, 1e-13],
  ['bvalfit jump', `\\mathrm{bvalfit}\\left(${v([1])},${v([1])},0,1,0.5,D5,la,lb,sf\\right)=`, 1e-11],
  ['bvalfit 2+2', `\\mathrm{bvalfit}\\left(${v([0.1, -0.5])},${v([0.1, 0.2])},0,1,0.5,Db,l1,l2,sf\\right)=`, 1e-13],
  ['bvalfit 2+1', `\\mathrm{bvalfit}\\left(${v([1, 0])},${v([0.5])},0,1,0.5,Dc,m1,m2,sf\\right)=`, 1e-13],
];

describe('sbval and bvalfit', () => {
  const outs = run(SHOOT.map(([, l]) => l));
  SHOOT.forEach(([lab, , tol], k) => test(lab, () => within(outs[k]!.value, REF.shoot[lab]!, tol, lab)));
  test('the linear cases against their closed forms', () => {
    expect(Math.abs(outs[0]!.value!.re[0]! - 1 / Math.sin(1))).toBeLessThan(1e-14);
    expect(Math.abs(outs[6]!.value!.re[1]! - (0.2 - Math.cos(1)) / Math.sin(1))).toBeLessThan(1e-13);
    expect(Math.abs(outs[7]!.value!.re[1]! - Math.cos(1) / Math.sin(1))).toBeLessThan(1e-14);
  });
  test('far guesses find Mathcad\'s solutions, and one whose solution runs away says so, as Mathcad refuses it', () => {
    const outs2 = run([0, -20, -60, 10].map((g) => `\\mathrm{sbval}\\left(${v([g])},0,1,D2,ld2,sc2\\right)=`));
    expect(outs2[0]!.value!.re[0]).toBeCloseTo(-8, 10);
    expect(outs2[1]!.value!.re[0]).toBeCloseTo(-35.8585488249, 8);
    expect(outs2[2]!.value!.re[0]).toBeCloseTo(-35.8585488249, 8);
    expect(outs2[3]!.error).toMatch(/runs away near x = 0.96/);
  });
  test('a problem with no solution, or a score of the wrong length, is refused where Mathcad answers regardless', () => {
    const errs = run([`\\mathrm{sbval}\\left(${v([1])},0,3.14159265358979,D1,ld1,sc1\\right)=`, `\\mathrm{sbval}\\left(${v([1, 2])},0,1,D1,ld1,sc1\\right)=`]).map((o) => o.error);
    expect(errs[0]).toMatch(/couldn't make the score 0/);
    expect(errs[1]).toMatch(/one value for each guess/);
  });
});

const JAC: [string, string][] = [['Jacob F1', 'F1\\left(xv\\right),xv'], ['Jacob F1 k5', 'F1\\left(xv\\right),xv,5'], ['Jacob F2', 'F2\\left(xw\\right),xw'],
  ['Jacob gradient', 'g1\\left(xw\\right),xw'], ['Jacob F1 long x', 'F1\\left(xl\\right),xl'], ['Jacob x0=0', 'F1\\left(xz\\right),xz'], ['Jacob k2', 'F1\\left(xv\\right),xv,2'],
  ['Jacob complex', 'Fc\\left(xc\\right),xc']];

describe('Jacob', () => {
  const outs = run(JAC.map(([, a]) => `\\mathrm{Jacob}\\left(${a}\\right)=`));
  JAC.forEach(([lab], k) => test(lab, () => within(outs[k]!.value, REF.jacob[lab]!, 2e-13, lab)));
  test('an x without a value, or with units, is refused', () => {
    const errs = run(['\\mathrm{Jacob}\\left(F1\\left(qq\\right),qq\\right)=', `xs\\coloneq ${v([1, 2, 3])}\\cdot \\mathrm{m}`, '\\mathrm{Jacob}\\left(F1\\left(xs\\right),xs\\right)=']).map((o) => o.error);
    expect(errs[0]).toMatch(/define qq above/);
    expect(errs[2]).toMatch(/without units/);
  });
  test('inside a function, as the Jacobian a stiff solver takes, it gives the hand-written Jacobian\'s answers', () => {
    const outs2 = run([
      `S\\left(t,y\\right)\\coloneq ${v([`-0.04\\cdot ${y(0)}+10^{4}\\cdot ${y(1)}\\cdot ${y(2)}`, `0.04\\cdot ${y(0)}-10^{4}\\cdot ${y(1)}\\cdot ${y(2)}-3\\cdot 10^{7}\\cdot ${y(1)}^{2}`, `3\\cdot 10^{7}\\cdot ${y(1)}^{2}`])}`,
      `Ja\\left(t,y\\right)\\coloneq \\mathrm{augment}\\left(${v([0, 0, 0])},\\mathrm{Jacob}\\left(S\\left(t,y\\right),y\\right)\\right)`,
      `Jh\\left(t,y\\right)\\coloneq \\begin{pmatrix}0&-0.04&10^{4}\\cdot ${y(2)}&10^{4}\\cdot ${y(1)}\\\\0&0.04&-10^{4}\\cdot ${y(2)}-6\\cdot 10^{7}\\cdot ${y(1)}&-10^{4}\\cdot ${y(1)}\\\\0&0&6\\cdot 10^{7}\\cdot ${y(1)}&0\\end{pmatrix}`,
      `\\mathrm{Stiffb}\\left(${v([1, 0, 0])},0,0.4,4,S,Ja\\right)=`, `\\mathrm{Stiffb}\\left(${v([1, 0, 0])},0,0.4,4,S,Jh\\right)=`,
    ]);
    const [a, b] = [outs2[3]!.value!, outs2[4]!.value!];
    expect(outs2[3]!.error).toBeUndefined();
    for (let k = 0; k < a.re.length; k++) expect(Math.abs(a.re[k]! - b.re[k]!)).toBeLessThan(1e-8 * Math.max(1, Math.abs(b.re[k]!)));
  });
});
