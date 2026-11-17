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
import { POLYHEDRA, polyhedron } from '../src/engine/polyhedra.js';
import { type Mesh, type Vec, dual, parseSymbol, wythoff } from '../src/engine/wythoff.js';
import { rasterize } from '../src/ui/polyview.js';
import { type XElement, importWorksheet } from '../src/xmcd/import.js';

/**
 * Each of the 80 by Mathcad's number: vertices, edges, faces, the faces round a vertex in order, and the
 * circumradius for an edge of 1, as Kaleido (Har'El's program, whose numbering Mathcad uses) gives them. A trailing
 * /2 is a vertex figure that goes round twice. Different polyhedra can share counts and vertex figures, as the
 * snub |5/2 3 3 and the retrosnub |3/2 3/2 5/2 do; the circumradius tells them apart.
 */
const KALEIDO: [number, number, number, number, string, number][] = [
  [1, 10, 15, 7, '{4,4,5}', 0.9867],
  [2, 10, 20, 12, '{3,3,3,5}', 0.9511],
  [3, 10, 15, 7, '{4,4,5/2}', 0.7255],
  [4, 10, 20, 12, '{3,3,3,5/2}', 0.6564],
  [5, 10, 20, 12, '{3,3,3,5/3}', 0.5878],
  [6, 4, 6, 4, '{3,3,3}', 0.6124],
  [7, 12, 18, 8, '{6,6,3}', 1.1726],
  [8, 12, 24, 12, '{6,3/2,6,3}', 1.0000],
  [9, 6, 12, 7, '{4,3/2,4,3}', 0.7071],
  [10, 6, 12, 8, '{3,3,3,3}', 0.7071],
  [11, 8, 12, 6, '{4,4,4}', 0.8660],
  [12, 12, 24, 14, '{3,4,3,4}', 1.0000],
  [13, 24, 36, 14, '{6,6,4}', 1.5811],
  [14, 24, 36, 14, '{8,8,3}', 1.7788],
  [15, 24, 48, 26, '{4,3,4,4}', 1.3990],
  [16, 48, 72, 26, '{4,6,8}', 2.3176],
  [17, 24, 60, 38, '{3,3,3,3,4}', 1.3437],
  [18, 24, 48, 20, '{8,3/2,8,4}', 1.3990],
  [19, 24, 48, 20, '{8/3,3,8/3,4}', 0.7368],
  [20, 12, 24, 10, '{6,4/3,6,4}', 1.0000],
  [21, 48, 72, 20, '{8/3,6,8}', 1.3229],
  [22, 24, 48, 26, '{4,3/2,4,4}', 0.7368],
  [23, 24, 48, 18, '{8,4,8/7,4/3}', 1.3990],
  [24, 24, 36, 14, '{8/3,8/3,3}', 0.5795],
  [25, 48, 72, 26, '{8/3,4,6}', 1.0624],
  [26, 24, 48, 18, '{4,8/3,4/3,8/5}', 0.7368],
  [27, 12, 30, 20, '{3,3,3,3,3}', 0.9511],
  [28, 20, 30, 12, '{5,5,5}', 1.4013],
  [29, 30, 60, 32, '{3,5,3,5}', 1.6180],
  [30, 60, 90, 32, '{6,6,5}', 2.4780],
  [31, 60, 90, 32, '{10,10,3}', 2.9694],
  [32, 60, 120, 62, '{4,3,4,5}', 2.2330],
  [33, 120, 180, 62, '{4,6,10}', 3.8024],
  [34, 60, 150, 92, '{3,3,3,3,5}', 2.1558],
  [35, 20, 60, 32, '{5/2,3,5/2,3,5/2,3}', 0.8660],
  [36, 60, 120, 52, '{6,5/2,6,3}', 1.7215],
  [37, 60, 180, 112, '{3,5/2,3,3,3,3}', 1.4582],
  [38, 60, 120, 44, '{10,3/2,10,5}', 2.2330],
  [39, 12, 30, 12, '{5/2,5/2,5/2,5/2,5/2}', 0.5878],
  [40, 12, 30, 12, '{5,5,5,5,5}/2', 0.9511],
  [41, 30, 60, 24, '{5/2,5,5/2,5}', 1.0000],
  [42, 60, 90, 24, '{10,10,5/2}', 1.8768],
  [43, 60, 120, 54, '{4,5/2,4,5}', 1.3229],
  [44, 60, 120, 42, '{10,4,10/9,4/3}', 2.2330],
  [45, 60, 150, 84, '{3,3,5/2,3,5}', 1.2744],
  [46, 20, 60, 24, '{5/3,5,5/3,5,5/3,5}', 0.8660],
  [47, 60, 120, 44, '{10/3,3,10/3,5}', 1.1342],
  [48, 60, 120, 44, '{10,5/3,10,3}', 1.7215],
  [49, 60, 120, 44, '{6,5/3,6,5}', 1.3229],
  [50, 120, 180, 44, '{10/3,6,10}', 2.0000],
  [51, 60, 180, 104, '{3,5/3,3,3,3,5}', 1.1269],
  [52, 20, 60, 32, '{3,5,3,5,3,5}/2', 0.8660],
  [53, 60, 120, 52, '{6,3/2,6,5}', 1.1342],
  [54, 30, 60, 26, '{10,3/2,10,3}', 1.6180],
  [55, 60, 120, 32, '{10,6,10/9,6/5}', 1.7215],
  [56, 30, 60, 18, '{10,5/4,10,5}', 1.6180],
  [57, 20, 30, 12, '{5/2,5/2,5/2}', 0.5352],
  [58, 12, 30, 20, '{3,3,3,3,3}/2', 0.5878],
  [59, 30, 60, 32, '{5/2,3,5/2,3}', 0.6180],
  [60, 60, 90, 32, '{6,6,5/2}', 1.0533],
  [61, 60, 120, 50, '{6,4,6/5,4/3}', 1.3229],
  [62, 60, 150, 92, '{3,3,5/2,3,3}', 0.8161],
  [63, 60, 90, 24, '{10/3,10/3,5}', 0.8529],
  [64, 120, 180, 54, '{10/3,4,10}', 1.6583],
  [65, 60, 150, 84, '{3,5/3,3,3,5}', 0.8516],
  [66, 60, 120, 44, '{10/3,5/2,10/3,3}', 0.7169],
  [67, 30, 60, 22, '{6,5/3,6,5/2}', 1.0000],
  [68, 60, 120, 32, '{6,10/3,6/5,10/7}', 1.1342],
  [69, 60, 180, 104, '{3,5/3,3,5/2,3,3}', 0.7071],
  [70, 30, 60, 22, '{6,5/4,6,5}', 1.0000],
  [71, 60, 90, 32, '{10/3,10/3,3}', 0.6576],
  [72, 60, 120, 62, '{4,5/3,4,3}', 0.7169],
  [73, 120, 180, 62, '{10/3,4,6}', 1.0207],
  [74, 60, 150, 92, '{3,5/3,3,3,3}', 0.6450],
  [75, 30, 60, 18, '{10/3,5/3,10/3,5/2}', 0.6180],
  [76, 30, 60, 26, '{10/3,3/2,10/3,3}', 0.6180],
  [77, 60, 180, 112, '{3,3/2,3,3/2,3,5/2}', 0.5807],
  [78, 60, 120, 42, '{4,10/3,4/3,10/7}', 0.7169],
  [79, 60, 150, 92, '{3,3/2,3,5/3,3}', 0.5800],
  [80, 60, 240, 124, '{4,5/3,4,3,4,5/2,4,3/2}', 0.7071],
];

/** A fraction as the polygon it draws: {4/3} is a square and {5/3} the pentagram {5/2}, turned the other way. */
const polygon = (f: string): string => {
  const [n, d = 1] = f.split('/').map(Number) as [number, number?];
  let dd = d % n;
  if (dd > n / 2) dd = n - dd;
  return dd === 1 ? String(n) : `${n}/${dd}`;
};
/** A cycle written the same wherever it starts and whichever way round. */
const cycle = (a: string[]): string => {
  const all: string[] = [];
  for (const s of [a, [...a].reverse()]) for (let i = 0; i < s.length; i++) all.push([...s.slice(i), ...s.slice(0, i)].join(' '));
  return all.sort()[0]!;
};
function edges(m: Mesh): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of m.faces) {
    for (let i = 0; i < f.length; i++) {
      const [a, b] = [f[i]!, f[(i + 1) % f.length]!];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  }
  return out;
}
/** The kinds of face round vertex v, in order. */
function config(m: Mesh, v: number): string[] {
  const fs = m.faces.map((f, k) => [f, k] as const).filter(([f]) => f.includes(v)).map(([, k]) => k);
  const nb = (k: number): [number, number] => {
    const f = m.faces[k]!;
    const j = f.indexOf(v);
    return [f[(j + f.length - 1) % f.length]!, f[(j + 1) % f.length]!];
  };
  const order = [fs[0]!];
  let next = nb(fs[0]!)[1];
  while (order.length < fs.length) {
    const k = fs.find((g) => !order.includes(g) && nb(g).includes(next));
    if (k === undefined) return ['not a cycle'];
    order.push(k);
    const [a, b] = nb(k);
    next = a === next ? b : a;
  }
  return order.map((k) => m.kinds[m.kind[k]!]!);
}
const dist = (p: Vec, q: Vec): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('the 80 uniform polyhedra, by Wythoff\'s construction', () => {
  test.each(KALEIDO)('#%i has Kaleido\'s counts, vertex figure and size', (n, V, E, F, figure, radius) => {
    const m = wythoff(parseSymbol(POLYHEDRA[n - 1]![2])!);
    const e = edges(m);
    expect([m.vertices.length, e.size, m.faces.length]).toEqual([V, E, F]);
    // Every edge between two faces, all the same length, and every vertex on the unit sphere.
    expect([...e.values()].every((c) => c === 2)).toBe(true);
    const lengths = [...e.keys()].map((k) => k.split(',').map(Number) as [number, number]).map(([a, b]) => dist(m.vertices[a]!, m.vertices[b]!));
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(1e-9);
    expect(m.vertices.every((v) => Math.abs(Math.hypot(...v) - 1) < 1e-9)).toBe(true);
    // On the unit sphere, so the circumradius for an edge of 1 is one over the edge.
    expect(1 / lengths[0]!).toBeCloseTo(radius, 3);
    // The same faces in the same order round every vertex, as Kaleido gives them.
    const want = cycle(figure.replace(/}\/\d+$/, '').replace(/[{}]/g, '').split(',').map(polygon));
    expect(new Set(m.vertices.map((_, v) => cycle(config(m, v))))).toEqual(new Set([want]));
  });

  test('each face is flat and goes round its centre once, or twice for a star', () => {
    for (const [, , symbol] of POLYHEDRA) {
      const m = wythoff(parseSymbol(symbol)!);
      for (const f of m.faces) {
        const pts = f.map((i) => m.vertices[i]!);
        const c = [0, 1, 2].map((k) => pts.reduce((t, p) => t + p[k]!, 0) / pts.length) as Vec;
        // Every corner the same distance from the centre: a regular polygon.
        const r = pts.map((p) => dist(p, c));
        expect(Math.max(...r) - Math.min(...r)).toBeLessThan(1e-9);
      }
    }
  });

  test('symbols that name no polyhedron are refused', () => {
    expect(parseSymbol('3 | 2 4')).not.toBeNull();
    expect(parseSymbol('3 2 4')).toBeNull();
    expect(parseSymbol('3|2 4|')).toBeNull();
    expect(parseSymbol('7/7|2 3')).toBeNull();
    expect(() => wythoff(parseSymbol('2 3 7|')!)).toThrow();
  });
});

describe('the duals', () => {
  test('a face for each vertex and a vertex for each face, every face flat', () => {
    for (const [name, dualName, symbol] of POLYHEDRA) {
      const m = wythoff(parseSymbol(symbol)!);
      const d = dual(m);
      expect(d.faces.length, dualName).toBe(m.vertices.length);
      for (const f of d.faces) {
        const pts = f.map((i) => d.vertices[i]!);
        const [a, b, c] = pts as [Vec, Vec, Vec];
        const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const w: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n: Vec = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const l = Math.hypot(...n);
        if (l < 1e-9) continue;
        for (const p of pts) expect(Math.abs(((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1] + (p[2] - a[2]) * n[2]) / l), `${name}'s dual`).toBeLessThan(1e-9);
      }
      // Without a face through the centre, the dual has the same edges and a vertex for each face.
      const hemi = m.faces.some((f) => Math.hypot(...[0, 1, 2].map((k) => f.reduce((t, i) => t + m.vertices[i]![k]!, 0))) < 1e-6);
      // Faces in one plane, as the small snub icosicosidodecahedron's triangles are in pairs, share a dual vertex.
      const centres: Vec[] = [];
      for (const f of m.faces) {
        const c = [0, 1, 2].map((k) => f.reduce((t, i) => t + m.vertices[i]![k]!, 0) / f.length) as Vec;
        if (!centres.some((q) => dist(q, c) < 1e-6)) centres.push(c);
      }
      if (!hemi) expect([d.vertices.length, edges(d).size], dualName).toEqual([centres.length, edges(m).size]);
    }
  });

  test('the cube\'s dual is the octahedron, the rhombic dodecahedron has 14 vertices and 12 rhombi', () => {
    const oct = polyhedron('octahedron')!;
    const fromCube = dual(wythoff(parseSymbol('3|2 4')!));
    expect([fromCube.vertices.length, fromCube.faces.length]).toEqual([oct.vertices.length, oct.faces.length]);
    const rd = polyhedron('Rhombic Dodecahedron')!;
    expect(rd.name).toBe('rhombic dodecahedron');
    expect([rd.vertices.length, rd.faces.length, rd.faces.every((f) => f.length === 4)]).toEqual([14, 12, true]);
  });
});

describe('what Polyhedron accepts, as Mathcad 14 does (probed 2026-11-16)', () => {
  test('a name in any case, a dual\'s name, "#n", or the symbol exactly as PolyLookup gives it', () => {
    expect(polyhedron('cube')?.name).toBe('cube');
    expect(polyhedron('CUBE')?.name).toBe('cube');
    expect(polyhedron('#11')?.name).toBe('cube');
    expect(polyhedron('3|2 4')?.name).toBe('cube');
    expect(polyhedron('rhombic dodecahedron')?.vertices.length).toBe(14);
    // A name that is both a polyhedron and another's dual is the polyhedron.
    expect(polyhedron('octahedron')?.faces.length).toBe(8);
    expect(polyhedron('#80')?.name).toBe('great dirhombicosidodecahedron');
    expect(polyhedron('|3/2 5/3 3 5/2')?.faces.length).toBe(124);
  });
  test('nothing else: other spacing, symbols outside the 80, numbers outside 1 to 80, other words', () => {
    for (const s of [' 3 | 2 4 ', '2 7|2', '|2 2 7', '2 3 7|', '2 2 9|', '#0', '#81', 'bogus', '']) expect(polyhedron(s), s).toBeNull();
  });
});

function sheetOf(lines: string[], plots: { id: string; expr: string; view?: 'surface' | 'contour' }[] = []): Worksheet {
  const ws = emptyWorksheet();
  ws.regions = lines.map((latex, i): Region => ({ id: `r${i + 1}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(latex) }));
  plots.forEach((p, i) => ws.regions.push({
    id: p.id, left: 0, top: 400 + i * 200, alignX: 0, alignY: 400 + i * 200, disabled: false,
    content: { k: 'plot', x: null, ys: [readTex(p.expr)], xAxis: { min: null, max: null, log: false }, yAxis: { min: null, max: null, log: false }, markers: false, width: 200, height: 200, view: p.view ?? 'surface' },
  }));
  return ws;
}
const at = (outcomes: Outcome[], id: string): Outcome => outcomes.find((o) => o.region.id === id)!;

describe('Polyhedron in the engine', () => {
  test('it gives back its string, refuses a number, and a surface plot of it draws the polyhedron', () => {
    const ws = sheetOf(['\\mathrm{Polyhedron}\\left(\\text{"cube"}\\right)=', '\\mathrm{Polyhedron}\\left(3\\right)=', '\\mathrm{Polyhedron}\\left(\\text{"bogus"}\\right)=',
      'P\\coloneq \\mathrm{Polyhedron}\\left(\\text{"#27"}\\right)', 'Q\\coloneq \\text{"dodecahedron"}'], [
      { id: 'call', expr: '\\mathrm{Polyhedron}\\left(\\text{"#6"}\\right)' }, { id: 'bare', expr: '\\text{"cube"}' }, { id: 'var', expr: 'P' },
      { id: 'inner', expr: '\\mathrm{Polyhedron}\\left(Q\\right)' }, { id: 'bogus', expr: '\\mathrm{Polyhedron}\\left(\\text{"bogus"}\\right)' },
      { id: 'contour', expr: '\\mathrm{Polyhedron}\\left(\\text{"#6"}\\right)', view: 'contour' }]);
    const out = runWorksheet(ws);
    expect(at(out, 'r1').value).toEqual({ t: 'str', v: 'cube' });
    expect(at(out, 'r2').error?.reason).toMatch(/takes a string/);
    // Mathcad gives "bogus" back too; only a plot of it fails.
    expect(at(out, 'r3').value).toEqual({ t: 'str', v: 'bogus' });
    expect(at(out, 'call').plot?.poly?.name).toBe('tetrahedron');
    expect(at(out, 'bare').plot?.poly?.name).toBe('cube');
    expect(at(out, 'var').plot?.poly?.name).toBe('icosahedron');
    expect(at(out, 'inner').plot?.poly?.name).toBe('dodecahedron');
    expect(at(out, 'bogus').error?.reason).toMatch(/names no polyhedron/);
    // A contour plot gets the polyhedron too, and says on the page that it can't draw it.
    expect(at(out, 'contour').plot?.poly?.name).toBe('tetrahedron');
  });
});

describe('drawing a polyhedron', () => {
  // Seen from below the z axis, so the tetrahedron's bottom face, opposite its top vertex, is towards the reader.
  const size = 101;
  const k = 40;
  const project = (v: Vec): [number, number, number] => [size / 2 + v[0] * k, size / 2 - v[1] * k, -v[2] * k];
  test('the nearest face shows, lit full on when it faces the light, with dark edges and clear corners', () => {
    const m = polyhedron('tetrahedron')!;
    const colours: [number, number, number][] = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
    const r = rasterize(m, size, size, project, (f) => colours[f]!, [0, 0, 1], 1);
    const bottom = m.faces.findIndex((f) => f.every((i) => m.vertices[i]![2] < 0));
    const o = (55 * size + 50) * 4;
    expect([...r.data.slice(o, o + 4)]).toEqual([...colours[bottom]!, 255]);
    expect(r.data[3]).toBe(0);
    let dark = 0;
    for (let i = 0; i < size * size; i++) if (r.data[i * 4 + 3]! > 0 && r.data[i * 4]! < 60 && r.data[i * 4 + 1]! < 60 && r.data[i * 4 + 2]! < 60) dark++;
    expect(dark).toBeGreaterThan(50);
  });
  test('a face turned from the light is darker, and lit the same from either side', () => {
    const m = polyhedron('tetrahedron')!;
    const white = (): [number, number, number] => [200, 200, 200];
    const front = rasterize(m, size, size, project, white, [0, 0, 1], 1);
    const back = rasterize(m, size, size, project, white, [0, 0, -1], 1);
    const o = (55 * size + 50) * 4;
    expect([front.data[o], back.data[o]]).toEqual([200, 200]);
    const tilted = rasterize(m, size, size, project, white, [0, 0.8, 0.6], 1);
    expect(tilted.data[o]).toBeLessThan(200);
  });
});

describe('importing Mathcad\'s 3D plot of a polyhedron', () => {
  const sheet = (input: string): Worksheet => {
    const xml = `<worksheet xmlns:ml="m"><builtInVariables array-origin="0"/><regions>
      <region region-id="1" left="6" top="108" width="89.25" height="118.5" align-x="45" align-y="108"><component clsid-buddy="013500E0-1122-11DB-9380-000D56C6051A" item-idref="3" disable-calc="false">
        <inputs>${input}</inputs><outputs/></component><rendering item-idref="4"/></region>
      </regions><binaryContent><item item-id="4">iVBORw0KGgo=</item></binaryContent></worksheet>`;
    return importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
  };
  test('Polyhedron("#6") becomes a surface plot of it at the plot\'s size, which draws the tetrahedron', () => {
    const ws = sheet('<ml:apply><ml:id>Polyhedron</ml:id><ml:str>#6</ml:str></ml:apply>');
    expect(ws.opaque).toHaveLength(0);
    const c = ws.regions[0]!.content;
    expect(c).toMatchObject({ k: 'plot', view: 'surface', width: 89.25, height: 118.5, ys: [{ k: 'call', fn: { k: 'id', name: 'Polyhedron' }, args: [{ k: 'str', v: '#6' }] }] });
    expect(runWorksheet(ws)[0]!.plot?.poly?.name).toBe('tetrahedron');
  });
  test('a string alone is read too, and any other 3D plot stays Mathcad\'s picture', () => {
    expect(sheet('<ml:str>cube</ml:str>').regions[0]?.content.k).toBe('plot');
    const other = sheet('<ml:id>M</ml:id>');
    expect([other.regions.length, other.opaque.length]).toEqual([0, 1]);
  });
});
