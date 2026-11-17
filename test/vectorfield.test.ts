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
import { type Outcome, runWorksheet } from '../src/engine/evaluate.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';
import { readTex } from '../src/latex/latex.js';
import type { Region, Worksheet } from '../src/model/ast.js';
import { FIELD_SAMPLES, MAX_SIDE, fieldOf, typicalSpacing } from '../src/engine/vectorfield.js';
import { fromValues, num } from '../src/engine/values.js';
import { type XElement, importWorksheet } from '../src/xmcd/import.js';

/** Vector field plots, against Mathcad 14 (probed 2026-11-16, probes/vectorfield). */
const limits = { x0: -5, x1: 5, y0: -5, y1: 5 };
const complexMat = (rows: number, cols: number, f: (i: number, j: number) => [number, number]) =>
  fromValues(rows, cols, Array.from({ length: rows * cols }, (_, k) => { const [re, im] = f(k % rows, Math.floor(k / rows)); return num(re, undefined, im); }));
const realMat = (rows: number, cols: number, f: (i: number, j: number) => number) =>
  fromValues(rows, cols, Array.from({ length: rows * cols }, (_, k) => num(f(k % rows, Math.floor(k / rows)))));
const at = (f: ReturnType<typeof fieldOf>, x: number, y: number) => {
  const k = [...f.x].findIndex((xx, n) => xx === x && f.y[n] === y);
  return [f.u[k]! * f.scale, f.v[k]! * f.scale];
};

describe('a matrix of complex numbers, as Mathcad draws it', () => {
  test('row i is at x = i and column j at y = j; the longest arrow reaches the next point', () => {
    // Mathcad's Mc: x part i on a 5 × 4 grid draws arrows 0, ¼, ½, ¾ and 1 of a step long.
    const f = fieldOf(complexMat(5, 4, (i) => [i, 0]), 0, limits);
    expect(f.dims).toBe(2);
    expect([Math.min(...f.x), Math.max(...f.x), Math.min(...f.y), Math.max(...f.y)]).toEqual([0, 4, 0, 3]);
    expect([0, 1, 2, 3, 4].map((i) => at(f, i, 2)[0])).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  test('Mathcad\'s Md: 3 rows across, 6 columns up, the imaginary part pointing up', () => {
    const f = fieldOf(complexMat(3, 6, (_, j) => [0, j]), 0, limits);
    expect([Math.max(...f.x), Math.max(...f.y)]).toEqual([2, 5]);
    expect(at(f, 1, 5)).toEqual([0, 1]);
  });
  test('a real matrix points every arrow across, and ORIGIN moves where rows and columns are counted from', () => {
    const f = fieldOf(realMat(5, 4, () => 1), 1, limits);
    expect([Math.min(...f.x), Math.min(...f.y)]).toEqual([1, 1]);
    expect([...f.v].every((v) => v === 0) && at(f, 3, 2)[0]).toBe(1);
  });
  test('all zero draws dots, not a division by zero', () => {
    const f = fieldOf(realMat(4, 4, () => 0), 0, limits);
    expect(f.scale).toBe(0);
  });
  test('units are dropped, as Mathcad drops them', () => {
    const m = fromValues(2, 2, [num(1, [1, 0, 0, 0, 0, 0, 0]), num(2, [1, 0, 0, 0, 0, 0, 0]), num(3, [1, 0, 0, 0, 0, 0, 0]), num(4, [1, 0, 0, 0, 0, 0, 0])]);
    expect(fieldOf(m, 0, limits).scale).toBeCloseTo(1 / 4, 12);
  });
  test('a big matrix draws every few rows and columns, the step growing to match', () => {
    const f = fieldOf(realMat(100, 100, () => 1), 0, limits);
    expect(f.every).toBe(Math.ceil(100 / MAX_SIDE));
    expect(f.x.length).toBe(Math.ceil(100 / f.every) ** 2);
    expect(f.scale).toBe(f.every);
  });
});

describe('two matrices (X; Y) of the parts, as Mathcad\'s (X, Y)', () => {
  test('equal parts point diagonally, the tip at (0.71, 0.71) of a step', () => {
    const v = fromValues(2, 1, [realMat(5, 4, () => 1), realMat(5, 4, () => 1)]);
    const [u, w] = at(fieldOf(v, 0, limits), 0, 0);
    expect(u).toBeCloseTo(Math.SQRT1_2, 12);
    expect(w).toBeCloseTo(Math.SQRT1_2, 12);
  });
  test('different sizes are refused, as Mathcad refuses them', () => {
    const v = fromValues(2, 1, [realMat(5, 4, () => 1), realMat(4, 4, () => 1)]);
    expect(() => fieldOf(v, 0, limits)).toThrow(/same size/);
  });
});

describe('MathMath\'s own forms', () => {
  test('a function of x and y, giving a 2-vector or a complex number, sampled over the limits', () => {
    const swirl = { t: 'fn' as const, name: 'F', call: ([x, y]: any[]) => fromValues(2, 1, [num(-y.re), num(x.re)]) };
    const f = fieldOf(swirl, 0, { x0: -2, x1: 2, y0: -1, y1: 1 });
    expect(f.x.length).toBe(FIELD_SAMPLES ** 2);
    expect([Math.min(...f.x), Math.max(...f.x), Math.min(...f.y), Math.max(...f.y)]).toEqual([-2, 2, -1, 1]);
    // The smaller of the two steps, so the arrows keep their directions in the plot's own units.
    expect(f.step).toBeCloseTo(2 / (FIELD_SAMPLES - 1), 12);
    const complex = { t: 'fn' as const, name: 'G', call: ([x, y]: any[]) => num(-y.re, undefined, x.re) };
    expect([...fieldOf(complex, 0, limits).u]).toEqual([...fieldOf({ ...swirl }, 0, limits).u]);
  });
  test('arrows in space from six arrays: the points and the parts, scaled by the spacing of the points', () => {
    const pts = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const col = (k: number, s = 1) => fromValues(4, 1, pts.map((p) => num(p[k]! * s)));
    const v = fromValues(6, 1, [col(0), col(1), col(2), col(0, 2), col(1, 2), col(2, 2)]);
    const f = fieldOf(v, 0, limits);
    expect(f.dims).toBe(3);
    expect(f.step).toBe(1);
    expect(f.scale).toBeCloseTo(1 / 2, 12);
  });
  test('the typical spacing of a grid is its step', () => {
    const xs = Float64Array.from({ length: 9 }, (_, k) => (k % 3) * 0.5);
    const ys = Float64Array.from({ length: 9 }, (_, k) => Math.floor(k / 3) * 0.5);
    expect(typicalSpacing(xs, ys, new Float64Array(9))).toBe(0.5);
  });
});

function sheetOf(lines: string[], plots: { id: string; expr: string | string[]; view?: 'vector' | 'surface' }[]): Worksheet {
  const ws = emptyWorksheet();
  ws.regions = lines.map((latex, i): Region => ({ id: `r${i + 1}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(latex) }));
  plots.forEach((p, i) => ws.regions.push({
    id: p.id, left: 0, top: 600 + i * 200, alignX: 0, alignY: 600 + i * 200, disabled: false,
    content: { k: 'plot', x: null, ys: (Array.isArray(p.expr) ? p.expr : [p.expr]).map((e) => readTex(e)), xAxis: { min: null, max: null, log: false }, yAxis: { min: null, max: null, log: false }, markers: false, width: 200, height: 200, view: p.view ?? 'vector' },
  }));
  return ws;
}
const out = (os: Outcome[], id: string) => os.find((o) => o.region.id === id)!;

describe('in a worksheet', () => {
  test('a matrix, a pair, a function and arrows in space all plot; a function giving three parts says so', () => {
    const ws = sheetOf([
      'f\\left(i,j\\right)\\coloneq i+j\\cdot 1i', 'M\\coloneq \\mathrm{matrix}\\left(5,4,f\\right)',
      'g\\left(i,j\\right)\\coloneq 1', 'X\\coloneq \\mathrm{matrix}\\left(3,3,g\\right)',
      'F\\left(x,y\\right)\\coloneq \\begin{pmatrix}-y\\\\x\\end{pmatrix}', 'H\\left(x,y\\right)\\coloneq \\begin{pmatrix}x\\\\y\\\\0\\end{pmatrix}',
      'P\\coloneq \\begin{pmatrix}0\\\\1\\end{pmatrix}',
    ], [
      { id: 'mat', expr: 'M' }, { id: 'pair', expr: '\\begin{pmatrix}X\\\\X\\end{pmatrix}' }, { id: 'fn', expr: 'F' },
      { id: 'space', expr: '\\begin{pmatrix}P\\\\P\\\\P\\\\P\\\\P\\\\P\\end{pmatrix}' }, { id: 'scalar', expr: 'H' },
      { id: 'typed pair', expr: ['X', 'X'] }, { id: 'typed six', expr: ['P', 'P', 'P', 'P', 'P', 'P'] }, { id: 'three', expr: ['X', 'X', 'X'] },
    ]);
    const os = runWorksheet(ws);
    expect(out(os, 'mat').plot?.field?.x.length).toBe(20);
    expect(out(os, 'pair').plot?.field?.x.length).toBe(9);
    expect(out(os, 'fn').plot?.field?.x.length).toBe(FIELD_SAMPLES ** 2);
    expect(out(os, 'space').plot?.field?.dims).toBe(3);
    expect(out(os, 'scalar').error?.reason).toMatch(/two parts/);
    // Typed as Mathcad types them, separated by commas: two are the pair, six arrows in space, three neither.
    expect(out(os, 'typed pair').plot?.field?.x.length).toBe(9);
    expect(out(os, 'typed six').plot?.field?.dims).toBe(3);
    expect(out(os, 'three').error?.reason).toMatch(/one expression, two matrices/);
  });
});

describe('importing Mathcad\'s vector field plot', () => {
  const sheet = (inputs: string): Worksheet => {
    const xml = `<worksheet xmlns:ml="m"><builtInVariables array-origin="0"/><regions>
      <region region-id="1" left="0" top="0" align-x="0" align-y="0"><math><ml:define><ml:id>f</ml:id><ml:real>0</ml:real></ml:define></math></region>
      <region region-id="2" left="54" top="546" width="181.5" height="217.5" align-x="144" align-y="546"><component clsid-buddy="013500E0-1122-11DB-9380-000D56C6051A" item-idref="17" disable-calc="false">
        <inputs>${inputs}</inputs><outputs/></component><rendering item-idref="18"/></region>
      </regions><binaryContent><item item-id="18">iVBORw0KGgo=</item></binaryContent></worksheet>`;
    return importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
  };
  test('(M, N), two matrices in parentheses, becomes a vector field plot of M, N at its size', () => {
    const ws = sheet('<ml:parens><ml:sequence><ml:id>M</ml:id><ml:id>N</ml:id></ml:sequence></ml:parens>');
    const plot = ws.regions.find((r) => r.content.k === 'plot')?.content;
    expect(plot).toMatchObject({ k: 'plot', view: 'vector', width: 181.5, height: 217.5, ys: [{ k: 'id', name: 'M' }, { k: 'id', name: 'N' }] });
    expect(ws.opaque).toHaveLength(0);
  });
  test('a single matrix, or three, stays Mathcad\'s picture: it could be a surface', () => {
    expect(sheet('<ml:id>M</ml:id>').opaque).toHaveLength(1);
    expect(sheet('<ml:parens><ml:sequence><ml:id>X</ml:id><ml:id>Y</ml:id><ml:id>Z</ml:id></ml:sequence></ml:parens>').opaque).toHaveLength(1);
  });
});
