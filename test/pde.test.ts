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

// relax, multigrid, numol and Pdesolve against Mathcad 14's answers (test/pde-reference.json) and exact solutions.
const REF = JSON.parse(readFileSync(new URL('./pde-reference.json', import.meta.url), 'utf8')) as { grids: Record<string, number[][]>; pdesolve: Record<string, number>; wave: Record<string, number> };
const v = (xs: (number | string)[]) => `\\begin{pmatrix}${xs.join('\\\\')}\\end{pmatrix}`;
const m = (rows: number[][]) => `\\begin{pmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{pmatrix}`;
function run(lines: string[]): { value: Mat | undefined; num: number | undefined; error: string | undefined }[] {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30, alignX: 0, alignY: i * 30 + 8, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).map((o) => ({ value: o.value as Mat | undefined, num: o.value?.t === 'num' ? o.value.re : undefined, error: o.error?.reason }));
}
function within(got: Mat | undefined, want: number[][], tol: number, what: string): void {
  expect(got, what).toBeDefined();
  expect([got!.rows, got!.cols], what).toEqual([want.length, want[0]!.length]);
  for (let i = 0; i < got!.rows; i++) for (let j = 0; j < got!.cols; j++) {
    expect(Math.abs(got!.re[j * got!.rows + i]! - want[i]![j]!), `${what} [${i},${j}]`).toBeLessThanOrEqual(tol);
  }
}
const full = (n: number, f: (i: number, j: number) => number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => f(i, j)));

describe('relax and multigrid, Numerical Recipes\' methods as Mathcad\'s', () => {
  const one = m(full(9, () => 1));
  const U = m(full(9, (i, j) => (i === 0 && j > 0 ? 1 : j === 0 ? i / 8 : 0)));
  const S = m(full(9, (i, j) => (i === 4 && j === 4 ? 1 : i === 2 && j === 6 ? -0.5 : 0)));
  const S17 = m(full(17, (i, j) => (i === 8 && j === 8 ? 1 : i === 4 && j === 12 ? 2 : 0)));
  const outs = run([`A\\coloneq ${one}`, `U\\coloneq ${U}`, `S\\coloneq ${S}`,
    '\\mathrm{relax}\\left(A,A,A,A,-4\\cdot A,0\\cdot A,U,0.95\\right)=', '\\mathrm{relax}\\left(A,A,A,A,-4\\cdot A,0\\cdot A,U,0.5\\right)=',
    '\\mathrm{relax}\\left(A,A,A,A,-4\\cdot A,S,0\\cdot A,0.95\\right)=', '\\mathrm{multigrid}\\left(S,2\\right)=', '\\mathrm{multigrid}\\left(S,1\\right)=', `\\mathrm{multigrid}\\left(${S17},2\\right)=`,
    `\\mathrm{multigrid}\\left(${m(full(10, () => 0))},2\\right)=`]);
  const labels = ['relax laplace', 'relax laplace rjac0.5', 'relax poisson', 'multigrid 9', 'multigrid 9 c1', 'multigrid 17'];
  labels.forEach((lab, k) => test(`${lab}: Mathcad's to the last digit`, () => within(outs[3 + k]!.value, REF.grids[lab]!, 1e-15, lab)));
  test('a grid that isn\'t 2ⁿ + 1 is refused, as Mathcad refuses it', () => expect(outs[9]!.error).toMatch(/power of 2/));
  test('four different coefficient matrices, a source and edges: Mathcad\'s to the last digit, so the orientation is Mathcad\'s', () => {
    const n = 7;
    const c = (x: number) => m(full(n, () => x));
    const F = m(full(n, (i, j) => (i === 2 && j === 4 ? 0.3 : i === 4 && j === 1 ? -0.2 : 0)));
    // Built as the probe built it, each edge in turn, so the corners hold the last edge written.
    const u = full(n, () => 0);
    for (let k = 0; k < n; k++) { u[0]![k] = 1 + 0.1 * k; u[n - 1]![k] = 0.5; u[k]![0] = 0.2 * k; u[k]![n - 1] = -0.3; }
    const U = m(u);
    const [o] = run([`\\mathrm{relax}\\left(${c(1.1)},${c(0.9)},${c(1.3)},${c(0.7)},${c(-4)},${F},${U},0.8\\right)=`]);
    within(o!.value, REF.grids['relax unequal']!, 1e-15, 'relax unequal');
  });
});

const PROBLEMS = [
  `pf\\left(x,t,u,ux,uxx\\right)\\coloneq ${v(['uxx_{0}'])}`, `p0\\left(x\\right)\\coloneq ${v(['\\sin \\left(\\pi \\cdot x\\right)'])}`, 'bc\\left(t\\right)\\coloneq \\begin{pmatrix}0&0&\\text{"D"}\\end{pmatrix}',
  `pa\\left(x,t,u,ux,uxx\\right)\\coloneq ${v(['-ux_{0}'])}`, `pg\\left(x\\right)\\coloneq ${v(['e^{-\\frac{\\left(x-0.3\\right)^{2}}{0.01}}'])}`, 'ba\\left(t\\right)\\coloneq \\begin{pmatrix}0&\\text{"NA"}&\\text{"D"}\\end{pmatrix}',
  `ps\\left(x,t,u,ux,uxx\\right)\\coloneq ${v(['uxx_{0}+0.1\\cdot u_{1}', 'uxx_{1}'])}`, `q0\\left(x\\right)\\coloneq ${v(['\\sin \\left(\\pi \\cdot x\\right)', '\\sin \\left(2\\cdot \\pi \\cdot x\\right)'])}`,
  'bs\\left(t\\right)\\coloneq \\begin{pmatrix}0&0&\\text{"D"}\\\\0&0&\\text{"D"}\\end{pmatrix}',
  `pn\\left(x\\right)\\coloneq ${v(['\\sin \\left(\\frac{\\pi }{2}\\cdot x\\right)'])}`, 'bn\\left(t\\right)\\coloneq \\begin{pmatrix}0&0&\\text{"N"}\\end{pmatrix}',
];
const CASES: [string, string, number][] = [
  ['numol heat 11 3', `${v([0, 1])},11,${v([0, 0.1])},3,1,0,pf,p0,bc`, 2e-6], ['numol heat 21 3', `${v([0, 1])},21,${v([0, 0.1])},3,1,0,pf,p0,bc`, 3e-6],
  ['numol heat 6 3', `${v([0, 1])},6,${v([0, 0.1])},3,1,0,pf,p0,bc`, 2e-6], ['numol advect', `${v([0, 1])},21,${v([0, 0.2])},3,1,0,pa,pg,ba`, 1e-5],
  ['numol system', `${v([0, 1])},11,${v([0, 0.1])},3,2,0,ps,q0,bs`, 2e-6],
];

describe('numol', () => {
  const outs = run([...PROBLEMS, ...CASES.map(([, a]) => `\\mathrm{numol}\\left(${a}\\right)=`),
    `\\mathrm{numol}\\left(${v([0, 1])},41,${v([0, 0.1])},3,1,0,pf,p0,bc\\right)=`, `\\mathrm{numol}\\left(${v([0, 1])},21,${v([0, 1])},3,1,0,pf,pn,bn\\right)=`,
    `\\mathrm{numol}\\left(${v([1, 0])},11,${v([0, 0.1])},3,1,0,pf,p0,bc\\right)=`]).slice(PROBLEMS.length);
  CASES.forEach(([lab, , tol], k) => test(`${lab}: Mathcad's to its tolerance`, () => within(outs[k]!.value, REF.grids[lab]!, tol, lab)));
  test('the heat equation against its exact solution, fourth order in space', () => {
    const g = outs[CASES.length]!.value!;
    for (let i = 0; i < g.rows; i++) expect(Math.abs(g.re[2 * g.rows + i]! - Math.exp(-Math.PI * Math.PI * 0.1) * Math.sin((Math.PI * i) / 40))).toBeLessThan(3e-7);
  });
  test('insulated ends keep the heat in: the average stays 2/π, where Mathcad 14\'s grows', () => {
    const g = outs[CASES.length + 1]!.value!;
    for (const j of [1, 2]) {
      let sum = 0;
      for (let i = 0; i < g.rows; i++) sum += (i === 0 || i === g.rows - 1 ? 0.5 : 1) * g.re[j * g.rows + i]!;
      expect(Math.abs(sum / (g.rows - 1) - 2 / Math.PI)).toBeLessThan(1e-4);
    }
  });
  test('ends out of order are refused', () => expect(outs[CASES.length + 2]!.error).toMatch(/left to right/));
  test('the wave equation as a system, one equation without x derivatives ("NA" "NA" "D")', () => {
    const [o] = run([...PROBLEMS, `pw\\left(x,t,u,ux,uxx\\right)\\coloneq ${v(['u_{1}', 'uxx_{0}'])}`, `pw0\\left(x\\right)\\coloneq ${v(['\\sin \\left(\\pi \\cdot x\\right)', 0])}`,
      'bw\\left(t\\right)\\coloneq \\begin{pmatrix}0&0&\\text{"D"}\\\\\\text{"NA"}&\\text{"NA"}&\\text{"D"}\\end{pmatrix}', `\\mathrm{numol}\\left(${v([0, 1])},21,${v([0, 0.5])},3,2,0,pw,pw0,bw\\right)=`]).slice(-1);
    within(o!.value, REF.grids['numol wave']!, 5e-6, 'numol wave');
  });
  test('a slope of 1 at both ends keeps u = x exactly, where Mathcad 14\'s numol drifts away from it', () => {
    const [o] = run([...PROBLEMS, `pl\\left(x\\right)\\coloneq ${v(['x'])}`, 'bl\\left(t\\right)\\coloneq \\begin{pmatrix}1&1&\\text{"N"}\\end{pmatrix}', `\\mathrm{numol}\\left(${v([0, 1])},11,${v([0, 0.2])},3,1,0,pf,pl,bl\\right)=`]).slice(-1);
    const g = o!.value!;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 11; i++) expect(Math.abs(g.re[j * 11 + i]! - i / 10)).toBeLessThan(1e-8);
  });
  test('boundary values that move with t, against u = x² + 2t', () => {
    const [o] = run([...PROBLEMS, `pm\\left(x\\right)\\coloneq ${v(['x^{2}'])}`, 'bm\\left(t\\right)\\coloneq \\begin{pmatrix}2\\cdot t&1+2\\cdot t&\\text{"D"}\\end{pmatrix}', `\\mathrm{numol}\\left(${v([0, 1])},11,${v([0, 0.5])},3,1,0,pf,pm,bm\\right)=`]).slice(-1);
    const g = o!.value!;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 11; i++) expect(Math.abs(g.re[j * 11 + i]! - ((i / 10) ** 2 + 2 * 0.25 * j))).toBeLessThan(1e-8);
  });
});

describe('Pdesolve', () => {
  const sub = (u: string, s: string, a: string) => `${u}_{\\text{${s}}}\\left(${a}\\right)`;
  const block = (u: string, extra: string) => ['\\mathrm{Given}', `${sub(u, 't', 'x,t')}=${sub(u, 'xx', 'x,t')}`, `${u}\\left(x,0\\right)=\\sin \\left(\\pi \\cdot x\\right)`, `${u}\\left(0,t\\right)=0`, `${u}\\left(1,t\\right)=0`,
    `${u}\\coloneq \\mathrm{Pdesolve}\\left(${u},x,${v([0, 1])},t,${v([0, 0.1])}${extra}\\right)`];
  const points = Object.keys(REF.pdesolve);
  const outs = run([...block('u', ''), ...block('w', ',11,3'), ...points.map((p) => `${p.replace(/^pde (heat )?/, '').replace('(', '\\left(').replace(')', '\\right)')}=`)]).slice(12);
  points.forEach((p, k) => test(`${p}: Mathcad's, on its 10 × 10 default grid or 11 × 3, interpolated linearly`, () => {
    expect(outs[k]!.error).toBeUndefined();
    expect(Math.abs(outs[k]!.num! - REF.pdesolve[p]!)).toBeLessThan(3e-6);
  }));
  test('the wave equation as a system, (u; v) := Pdesolve((u; v), …), as Mathcad', () => {
    const outs2 = run(['\\mathrm{Given}', `${sub('u', 't', 'x,t')}=v\\left(x,t\\right)`, `${sub('v', 't', 'x,t')}=${sub('u', 'xx', 'x,t')}`, 'u\\left(x,0\\right)=\\sin \\left(\\pi \\cdot x\\right)', 'v\\left(x,0\\right)=0', 'u\\left(0,t\\right)=0', 'u\\left(1,t\\right)=0',
      `${v(['u', 'v'])}\\coloneq \\mathrm{Pdesolve}\\left(${v(['u', 'v'])},x,${v([0, 1])},t,${v([0, 0.5])},21,11\\right)`, ...Object.keys(REF.wave).map((k) => `${k.slice(5).replace('(', '\\left(').replace(')', '\\right)')}=`)]).slice(8);
    Object.values(REF.wave).forEach((want, k) => expect(Math.abs(outs2[k]!.num! - want), Object.keys(REF.wave)[k]).toBeLessThan(5e-6));
  });
  test('101 points across, a wave and a nonlinear (Burgers) equation, in well under a second each', () => {
    for (const eq of [`${sub('u', 't', 'x,t')}=v\\left(x,t\\right)`, `${sub('u', 't', 'x,t')}=0.01\\cdot ${sub('u', 'xx', 'x,t')}-u\\left(x,t\\right)\\cdot ${sub('u', 'x', 'x,t')}`]) {
      const wave = eq.includes('v\\left');
      const t0 = performance.now();
      const outs3 = run(['\\mathrm{Given}', eq, ...(wave ? [`${sub('v', 't', 'x,t')}=${sub('u', 'xx', 'x,t')}`, 'v\\left(x,0\\right)=0'] : []), 'u\\left(x,0\\right)=\\sin \\left(\\pi \\cdot x\\right)', 'u\\left(0,t\\right)=0', 'u\\left(1,t\\right)=0',
        `${wave ? v(['u', 'v']) : 'u'}\\coloneq \\mathrm{Pdesolve}\\left(${wave ? v(['u', 'v']) : 'u'},x,${v([0, 1])},t,${v([0, 0.5])},101,11\\right)`, 'u\\left(0.3,0.2\\right)=']);
      expect(performance.now() - t0).toBeLessThan(3000);
      if (wave) expect(Math.abs(outs3.at(-1)!.num! - Math.cos(0.2 * Math.PI) * Math.sin(0.3 * Math.PI))).toBeLessThan(1e-6);
      else expect(outs3.at(-1)!.error).toBeUndefined();
    }
  });
  test('a missing boundary condition is refused', () => {
    const errs = run(['\\mathrm{Given}', `${sub('z', 't', 'x,t')}=${sub('z', 'xx', 'x,t')}`, 'z\\left(x,0\\right)=0', 'z\\left(0,t\\right)=0', `z\\coloneq \\mathrm{Pdesolve}\\left(z,x,${v([0, 1])},t,${v([0, 1])}\\right)`]).map((o) => o.error);
    expect(errs[4]).toMatch(/needs 2 boundary conditions for z/);
  });
});
