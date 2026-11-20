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
import { type PlotData, runWorksheet } from '../src/engine/evaluate.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readTex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import { autoAxis, type Content, type Worksheet } from '../src/model/ast.js';
import { contourLines } from '../src/ui/plot3d.js';

type Plot = Extract<Content, { k: 'plot' }>;

/** A sheet of typed definitions, then a surface plot of `ys`; returns the plot's data or its error. */
function surfaceOf(lines: string[], ys: string, change: Partial<Plot> = {}): { data: PlotData | undefined; error: string | undefined } {
  const ws: Worksheet = emptyWorksheet();
  ws.regions = lines.map((latex, n) => ({ id: `r${n}`, left: 0, top: n * 30 - 8, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(latex) }));
  const plot: Plot = { k: 'plot', x: null, ys: [readTex(ys)], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 270, height: 220, view: 'surface', ...change };
  ws.regions.push({ id: 'p', left: 0, top: 1000, alignX: 0, alignY: 1000, disabled: false, content: plot });
  const o = runWorksheet(ws).find((x) => x.region.id === 'p')!;
  return { data: o.plot, error: o.error?.reason };
}

describe('surface data', () => {
  test('a matrix gives heights over its row and column numbers', () => {
    const s = surfaceOf(['M\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}'], 'M').data!.surface!;
    expect([s.rows, s.cols, s.regular, s.sampled]).toEqual([2, 3, true, false]);
    expect([...s.z]).toEqual([1, 4, 2, 5, 3, 6]);
    expect([...s.x]).toEqual([0, 1, 0, 1, 0, 1]);
    expect([...s.y]).toEqual([0, 0, 1, 1, 2, 2]);
  });

  test('a function of two variables is sampled over the x and y limits', () => {
    const s = surfaceOf(['f\\left(x,y\\right)\\coloneq x\\cdot 10+y'], 'f', { xAxis: { ...autoAxis(), min: readTex('0'), max: readTex('3') } }).data!.surface!;
    expect([s.rows, s.cols, s.regular, s.sampled]).toEqual([31, 31, true, true]);
    expect([s.x[0], s.x[30], s.y[0], s.y[31 * 30]]).toEqual([0, 3, -5, 5]);
    expect(s.z[30 + 31 * 30]).toBeCloseTo(35);
  });

  test('three matrices in a vector give each point its x, y and z', () => {
    const s = surfaceOf(['X\\coloneq \\begin{pmatrix}0&1\\\\0&1\\end{pmatrix}', 'Y\\coloneq \\begin{pmatrix}0&0\\\\1&1\\end{pmatrix}', 'Z\\coloneq \\begin{pmatrix}7&8\\\\9&10\\end{pmatrix}'],
      '\\begin{pmatrix}X\\\\Y\\\\Z\\end{pmatrix}').data!.surface!;
    expect([s.regular, s.sampled]).toEqual([false, false]);
    expect([...s.z]).toEqual([7, 9, 8, 10]);
  });

  test('CreateMesh and CreateSpace plot as they are, inside their 1 × 1 array: a surface, and a curve one point wide', () => {
    const mesh = surfaceOf(['G\\left(s,t\\right)\\coloneq s+100\\cdot t'], '\\mathrm{CreateMesh}\\left(G,0,1,0,2,3,4\\right)').data!.surface!;
    expect([mesh.rows, mesh.cols]).toEqual([3, 4]);
    // s down the rows, t along the columns, as in Mathcad.
    expect([mesh.x[1], mesh.y[3 * 3], mesh.z[1 + 3 * 3]]).toEqual([0.5, 2, 200.5]);
    const curve = surfaceOf(['H\\left(t\\right)\\coloneq \\begin{pmatrix}\\cos \\left(t\\right)\\\\\\sin \\left(t\\right)\\\\t\\end{pmatrix}'], '\\mathrm{CreateSpace}\\left(H,0,6,50\\right)').data!.surface!;
    expect([curve.rows, curve.cols]).toEqual([50, 1]);
    expect(curve.z[49]).toBeCloseTo(6, 12);
  });

  test('X, Y and Z of different sizes say so', () => {
    const r = surfaceOf(['X\\coloneq \\begin{pmatrix}0&1\\\\0&1\\end{pmatrix}', 'Z\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}'], '\\begin{pmatrix}X\\\\X\\\\Z\\end{pmatrix}');
    expect(r.error).toContain('same size');
  });

  test('a number is not a surface', () => {
    expect(surfaceOf([], '3').error).toContain('A surface needs');
  });

  test('a function sampled over limits the wrong way round says so', () => {
    const r = surfaceOf(['f\\left(x,y\\right)\\coloneq x+y'], 'f', { xAxis: { ...autoAxis(), min: readTex('2'), max: readTex('1') } });
    expect(r.error).toContain('upper limit');
  });
});

describe('contour lines', () => {
  // Heights x + y on a 3 × 3 grid: the level 2 runs corner to corner through the middle point's cells.
  const grid = (z: number[]) => ({
    rows: 3, cols: 3, regular: true, sampled: false, zDim: undefined as never,
    x: Float64Array.from([0, 1, 2, 0, 1, 2, 0, 1, 2]), y: Float64Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]), z: Float64Array.from(z),
  });

  test('a level crossing a plane gives straight segments where the height equals it', () => {
    const segs = contourLines(grid([0, 1, 2, 1, 2, 3, 2, 3, 4]), 1.5);
    expect(segs.length).toBe(3);
    for (const [x1, y1, x2, y2] of segs) {
      expect(x1 + y1).toBeCloseTo(1.5);
      expect(x2 + y2).toBeCloseTo(1.5);
    }
  });

  test('a level outside the heights gives nothing', () => {
    expect(contourLines(grid([0, 1, 2, 1, 2, 3, 2, 3, 4]), 9)).toEqual([]);
  });

  test('a peak gives a closed ring around it', () => {
    const segs = contourLines(grid([0, 0, 0, 0, 1, 0, 0, 0, 0]), 0.5);
    expect(segs.length).toBe(4);
    for (const [x1, y1] of segs) expect(Math.max(Math.abs(x1 - 1), Math.abs(y1 - 1))).toBeCloseTo(0.5);
  });
});

describe('several things in one surface plot', () => {
  const lines = [
    'f\\left(x,y\\right)\\coloneq x+y',
    'P\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}',
    'X\\coloneq \\begin{pmatrix}0\\\\1\\end{pmatrix}',
    'A\\coloneq \\begin{pmatrix}X\\\\X\\\\X\\\\X\\\\X\\\\X\\end{pmatrix}',
    'C\\coloneq \\begin{pmatrix}X\\\\X\\\\X\\end{pmatrix}',
  ];
  const layered = (...ys: string[]) => surfaceOf(lines, ys[0]!, { ys: ys.map((y) => readTex(y)) });

  test('a point, arrows, a curve and another surface each draw over the first', () => {
    const { data, error } = layered('f', 'P', 'A', 'C', 'f');
    expect(error).toBeUndefined();
    const [point, arrows, curve, again] = data!.layers!;
    expect([point!.surface!.rows, point!.surface!.cols, point!.surface!.x[0], point!.surface!.y[0], point!.surface!.z[0]]).toEqual([1, 1, 1, 2, 3]);
    expect([arrows!.field!.dims, arrows!.field!.x.length]).toEqual([3, 2]);
    expect([curve!.surface!.rows * curve!.surface!.cols, curve!.surface!.regular]).toEqual([2, false]);
    expect([again!.surface!.rows, again!.surface!.sampled]).toEqual([31, true]);
  });

  test('six plain numbers are one arrow, drawn as long as it is', () => {
    const f = layered('f', '\\begin{pmatrix}1\\\\2\\\\3\\\\0\\\\0\\\\2\\end{pmatrix}').data!.layers![0]!.field!;
    expect([f.x.length, f.x[0], f.z[0], f.w[0], f.scale]).toEqual([1, 1, 3, 2, 1]);
  });

  test('a point alone is a surface plot of its own', () => {
    const s = surfaceOf(lines, 'P').data!.surface!;
    expect([s.rows, s.cols, s.z[0]]).toEqual([1, 1, 3]);
  });

  test('a layer that fails keeps its message, and the first expression still draws', () => {
    const { data, error } = layered('f', 'q', '\\mathrm{Polyhedron}\\left(\\text{"cube"}\\right)', '\\begin{pmatrix}1\\\\2\\end{pmatrix}');
    expect(error).toBeUndefined();
    expect(data!.surface!.rows).toBe(31);
    expect(data!.layers!.map((l) => l.error)).toEqual([
      'q isn\'t defined',
      'A polyhedron is drawn alone: put it in a plot of its own',
      expect.stringMatching(/three numbers \(x, y, z\) in a vector mark a point/),
    ]);
  });

  test('a contour plot has the layers too, so switching to a surface plot needn\'t calculate again', () => {
    expect(surfaceOf(lines, 'f', { ys: [readTex('f'), readTex('P')], view: 'contour' }).data!.layers![0]!.surface!.z[0]).toBe(3);
  });

  test('a point in other units than its x and y, as (x, y, f(x, y)) with f in metres', () => {
    const p = surfaceOf([...lines, 'g\\left(x,y\\right)\\coloneq \\left(x+y\\right)\\cdot \\mathrm{m}'], 'g',
      { ys: [readTex('g'), readTex('\\begin{pmatrix}1\\\\2\\\\g\\left(1,2\\right)\\end{pmatrix}')] }).data!.layers![0]!;
    expect([p.error, p.surface!.rows, p.surface!.z[0], p.surface!.zDim[0]]).toEqual([undefined, 1, 3, 1]);
  });
});
