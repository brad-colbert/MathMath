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
import { type Outcome, runWorksheet } from '../src/engine/evaluate.js';
import { runIncremental } from '../src/engine/incremental.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';
import { readTex } from '../src/latex/latex.js';
import type { Region, Worksheet } from '../src/model/ast.js';
import { BUILTIN_MAPS, mapColor, mapFromMatrix, readCmp, writeCmp } from '../src/engine/colormaps.js';
import { NO_FILES, fileKey, sheetKey } from '../src/engine/files.js';
import { fromValues, num } from '../src/engine/values.js';

/** Colour maps: SaveColormap, LoadColormap and the .cmp files, against Mathcad 14 (probed 2026-11-16). */
function sheetOf(lines: string[]): Worksheet {
  const ws = emptyWorksheet();
  ws.regions = lines.map((latex, i): Region => ({ id: `r${i + 1}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(latex) }));
  return ws;
}
const noAlgebra = async () => ({ result: null, error: 'no algebra engine in this test' });
const flat = (o: Outcome): unknown => ({
  id: o.region.id,
  error: o.error?.reason ?? null,
  value: o.value ? JSON.stringify(o.value, (k, v) => (k === 'owner' || k === 'version' ? undefined : v instanceof Float64Array ? [...v] : v)) : null,
  maps: o.plot?.maps ?? null,
});
const at = (outcomes: Outcome[], id: string): Outcome => outcomes.find((o) => o.region.id === id)!;
const rowsOf = (o: Outcome): number[][] => {
  const m = o.value as { rows: number; re: Float64Array };
  return Array.from({ length: m.rows }, (_, i) => [0, 1, 2].map((j) => m.re[j * m.rows + i]!));
};
const M = 'M\\coloneq \\begin{pmatrix}0&0&0\\\\128.7&64&32\\\\300&255&-5\\end{pmatrix}';
const save = (name: string, m = 'M') => `\\mathrm{SaveColormap}\\left(\\text{"${name}"},${m}\\right)=`;
const load = (name: string) => `\\mathrm{LoadColormap}\\left(\\text{"${name}"}\\right)=`;

/** A Mathcad .cmp file as the format is (see colormaps.ts): 17, "Mathsoft Colormap", the count, 4 bytes a row. */
function cmp(rows: number[][]): Uint8Array {
  const header = [17, ...[...'Mathsoft Colormap'].map((c) => c.charCodeAt(0))];
  const n = rows.length;
  return Uint8Array.from([...header, n & 255, (n >> 8) & 255, 0, 0, ...rows.flatMap((r) => [...r, 0])]);
}

describe('the .cmp file', () => {
  test('is written as Mathcad writes it, and read back', () => {
    const rows = [[1, 1, 1], [2, 2, 2]];
    expect([...writeCmp(rows)]).toEqual([...cmp(rows)]);
    expect(writeCmp(rows).length).toBe(30);
    expect(readCmp(cmp([[0, 0, 0], [0, 0, 255]]))).toEqual([[0, 0, 0], [0, 0, 255]]);
    const big = Array.from({ length: 300 }, (_, k) => [k % 256, 0, 255 - (k % 256)]);
    expect(readCmp(writeCmp(big))).toEqual(big);
  });
  test('refuses what isn\'t one', () => {
    expect(readCmp(Uint8Array.from([3, 65, 66, 67, 1, 0, 0, 0]))).toMatch(/isn't a Mathcad colour map/);
    expect(readCmp(cmp([[1, 2, 3], [4, 5, 6]]).subarray(0, 26))).toMatch(/cut short/);
  });
});

describe('a matrix as a map', () => {
  test('truncates toward 0 and holds to 0..255, as Mathcad does', () => {
    const m = fromValues(2, 3, [num(0.4), num(-0.5), num(0.6), num(255.5), num(254.9), num(1e9)]);
    expect(mapFromMatrix(m, 'SaveColormap')).toEqual([[0, 0, 254], [0, 255, 255]]);
  });
  test('interpolates between rows, lowest first', () => {
    expect(mapColor([[0, 0, 0], [200, 100, 50]], 0.5)).toEqual([100, 50, 25]);
    expect(mapColor(BUILTIN_MAPS.gray!, 1)).toEqual([255, 255, 255]);
  });
});

describe('SaveColormap and LoadColormap', () => {
  test('save gives the number of rows, and load gives the map back, its name in any case', () => {
    const o = runWorksheet(sheetOf([M, save('mine'), load('MINE')]));
    expect((o[1]!.value as { re: number }).re).toBe(3);
    expect(rowsOf(o[2]!)).toEqual([[0, 0, 0], [128, 64, 32], [255, 255, 0]]);
  });
  test('save offers the map as Mathcad\'s name.cmp file', () => {
    const o = runWorksheet(sheetOf([M, save('mine')]));
    const f = o[1]!.files![0]!;
    expect(f.name).toBe('mine.cmp');
    expect(readCmp(f.bytes!)).toEqual([[0, 0, 0], [128, 64, 32], [255, 255, 0]]);
  });
  test('refuses what Mathcad refuses', () => {
    const o = runWorksheet(sheetOf([M,
      save('two', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'), save('one', '\\begin{pmatrix}1&2&3\\end{pmatrix}'), save('u', 'M\\cdot \\mathrm{m}'), save('a/b')]));
    expect(o.slice(1).map((x) => x.error?.reason)).toEqual([
      'SaveColormap takes a matrix of 3 columns, red, green and blue, a row for each colour',
      'SaveColormap takes at least two rows: a colour for the lowest heights and one for the highest',
      'SaveColormap takes numbers without units, 0 to 255',
      'A colour map\'s name is just a name, without a folder: MathMath keeps maps in the worksheet',
    ]);
  });
  test('MathMath\'s own maps load, and Mathcad\'s map files ask to be attached', () => {
    const o = runWorksheet(sheetOf([load('gray'), load('Fire')]));
    expect(rowsOf(o[0]!)).toEqual([[0, 0, 0], [255, 255, 255]]);
    expect(o[1]!.error).toMatchObject({ kind: 'needs-file', needs: ['Fire.cmp'] });
  });
  test('an attached .cmp file loads', () => {
    const files = { ...NO_FILES, colormap: (k: string) => (k === fileKey('Fire.cmp') ? [[0, 0, 0], [255, 128, 0]] : undefined) };
    const o = runWorksheet(sheetOf([load('fire')]), 'align', files);
    expect(rowsOf(o[0]!)).toEqual([[0, 0, 0], [255, 128, 0]]);
  });
  test('a saved map holds from its region down: not above it', () => {
    const o = runWorksheet(sheetOf([load('mine'), M, save('mine'), load('mine')]));
    expect(o[0]!.error?.kind).toBe('needs-file');
    expect(o[3]!.error).toBeUndefined();
  });
});

describe('surface plots and recalculation', () => {
  const plot: Region = {
    id: 'p', left: 0, top: 200, alignX: 0, alignY: 200, disabled: false,
    content: { k: 'plot', x: null, ys: [readTex('Z')], markers: false, width: 200, height: 150, view: 'surface', colorMap: 'mine',
      xAxis: { min: null, max: null }, yAxis: { min: null, max: null } } as never,
  };
  const base = (): Worksheet => {
    const ws = sheetOf(['Z\\coloneq \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', M, save('mine'), 'x\\coloneq 1']);
    ws.regions.push(structuredClone(plot));
    return ws;
  };
  test('a surface plot carries the maps saved above it', () => {
    const o = runWorksheet(base());
    expect(o.find((x) => x.region.id === 'p')!.plot!.maps).toEqual([['mine', [[0, 0, 0], [128, 64, 32], [255, 255, 0]]]]);
  });
  test('recalculating matches a full run, whether the map changes, is renamed, goes, or moves below the plot', async () => {
    const ws = base();
    expect((await runIncremental(ws, noAlgebra, null)).outcomes.map(flat)).toEqual(runWorksheet(ws).map(flat));
    const edits: ((w: Worksheet) => void)[] = [
      (w) => { w.regions[1]!.content = readRegion('M\\coloneq \\begin{pmatrix}9&9&9\\\\1&1&1\\end{pmatrix}'); },
      (w) => { w.regions[2]!.content = readRegion(save('yours')); },
      (w) => { w.regions.splice(2, 1); },
      (w) => { const r = w.regions[2]!; r.top = 400; r.alignY = 400; },
      (w) => { w.regions[3]!.content = readRegion('x\\coloneq 2'); },
    ];
    for (const edit of edits) {
      // A recalculation moves its snapshot on, so each edit starts from a first run of its own, as the page's do.
      const first = await runIncremental(ws, noAlgebra, null);
      const after = structuredClone(ws);
      edit(after);
      const next = await runIncremental(after, noAlgebra, first.snapshot);
      expect(next.outcomes.map(flat)).toEqual(runWorksheet(after).map(flat));
    }
  });
});

describe('more than one map, and maps from a referenced sheet', () => {
  const two = (): Worksheet => {
    const ws = sheetOf([
      'P\\coloneq \\begin{pmatrix}1&1&1\\\\2&2&2\\end{pmatrix}', save('first', 'P'),
      'Q\\coloneq \\begin{pmatrix}5&5&5\\\\6&6&6\\end{pmatrix}', save('second', 'Q'),
      'A\\coloneq \\mathrm{LoadColormap}\\left(\\text{"first"}\\right)', 'A=', load('second'),
    ]);
    return ws;
  };
  test('a second save adds to the first, and loading either finds it', () => {
    const o = runWorksheet(two());
    expect(rowsOf(at(o, 'r6'))).toEqual([[1, 1, 1], [2, 2, 2]]);
    expect(rowsOf(at(o, 'r7'))).toEqual([[5, 5, 5], [6, 6, 6]]);
  });
  test('changing the first map recalculates what loads it, and keeps the second', async () => {
    const ws = two();
    const first = await runIncremental(ws, noAlgebra, null);
    const after = structuredClone(ws);
    after.regions[0]!.content = readRegion('P\\coloneq \\begin{pmatrix}9&9&9\\\\8&8&8\\end{pmatrix}');
    const next = await runIncremental(after, noAlgebra, first.snapshot);
    expect(next.outcomes.map(flat)).toEqual(runWorksheet(after).map(flat));
    expect(rowsOf(at(next.outcomes, 'r6'))).toEqual([[9, 9, 9], [8, 8, 8]]);
    expect(rowsOf(at(next.outcomes, 'r7'))).toEqual([[5, 5, 5], [6, 6, 6]]);
  });
  test('saving again under a name replaces the map for the regions below, whatever the case', () => {
    const o = runWorksheet(sheetOf([M, save('mine'), load('mine'), save('MINE', '\\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}'), load('mine')]));
    expect(rowsOf(o[2]!)).toEqual([[0, 0, 0], [128, 64, 32], [255, 255, 0]]);
    expect(rowsOf(o[4]!)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });
  test('a map saved in a referenced sheet holds after the reference, the same in a full run and from a change', async () => {
    const other = sheetOf([M, save('theirs')]);
    const files = { ...NO_FILES, sheet: (name: string) => (name === sheetKey('other.mathmath') ? other : undefined) };
    const ws = sheetOf([load('theirs'), 'x\\coloneq 1']);
    ws.regions.unshift({ id: 'r0', left: 0, top: -38, alignX: 0, alignY: -30, disabled: false, content: { k: 'include', file: 'other.mathmath' } });
    const full = runWorksheet(ws, 'align', files);
    expect(rowsOf(at(full, 'r1'))).toEqual([[0, 0, 0], [128, 64, 32], [255, 255, 0]]);
    const first = await runIncremental(ws, noAlgebra, null, { files });
    expect(first.outcomes.map(flat)).toEqual(full.map(flat));
    const after = structuredClone(ws);
    after.regions.find((r) => r.id === 'r2')!.content = readRegion('x\\coloneq 2');
    const next = await runIncremental(after, noAlgebra, first.snapshot, { files });
    expect(next.outcomes.map(flat)).toEqual(runWorksheet(after, 'align', files).map(flat));
  });
  test('names that are properties of every object find no map, rather than breaking', () => {
    const o = runWorksheet(sheetOf([load('constructor'), load('__proto__')]));
    expect(o.map((x) => x.error?.kind)).toEqual(['needs-file', 'needs-file']);
  });
  test('a .cmp file of one colour is refused, as a map needs two', () => {
    expect(readCmp(cmp([[1, 2, 3]]))).toMatch(/at least two colours/);
  });
});
