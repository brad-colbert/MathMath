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
import type { Region, Worksheet } from '../src/model/ast.js';
import { traceText } from '../src/engine/trace.js';
import { NO_FILES, sheetKey } from '../src/engine/files.js';
import { num, str, fromValues } from '../src/engine/values.js';

/**
 * Mathcad's Seed, until, trace, pause and PolyLookup, against what Mathcad 14 gives (probed 2026-11-16).
 */
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
  trace: o.trace ?? null,
});
const at = (outcomes: Outcome[], id: string): Outcome => outcomes.find((o) => o.region.id === id)!;
const re = (o: Outcome): number => (o.value as { re: number }).re;
const items = (o: Outcome): number[] => [...(o.value as { re: Float64Array }).re];

describe('Seed', () => {
  const lines = ['\\mathrm{Seed}\\left(7\\right)=', 'a\\coloneq \\mathrm{rnd}\\left(1\\right)', '\\mathrm{Seed}\\left(7\\right)=', 'b\\coloneq \\mathrm{rnd}\\left(1\\right)', 'c\\coloneq \\mathrm{rnd}\\left(1\\right)'];

  test('gives the seed in effect before, and seeding again with the same number draws the same numbers again', () => {
    const o = runWorksheet(sheetOf(lines));
    expect(re(at(o, 'r1'))).toBe(1);
    expect(re(at(o, 'r3'))).toBe(7);
    expect(re(at(o, 'r2'))).toBe(re(at(o, 'r4')));
    expect(re(at(o, 'r5'))).not.toBe(re(at(o, 'r4')));
  });

  test('takes 1 to 2147483647, as Mathcad does', () => {
    const o = runWorksheet(sheetOf(['\\mathrm{Seed}\\left(2.5\\right)=', '\\mathrm{Seed}\\left(0\\right)=', '\\mathrm{Seed}\\left(2147483648\\right)=', '\\mathrm{Seed}\\left(2147483647\\right)=']));
    expect(o.slice(0, 3).map((x) => x.error?.reason)).toEqual(Array(3).fill('Seed takes a whole number from 1 to 2147483647'));
    expect(o[3]!.error).toBeUndefined();
  });

  test('a sheet without Seed draws as before: each region from its own stream', () => {
    const plain = sheetOf(['a\\coloneq \\mathrm{rnd}\\left(1\\right)', 'b\\coloneq \\mathrm{rnd}\\left(1\\right)']);
    const o = runWorksheet(plain);
    const again = runWorksheet(plain);
    expect(re(at(o, 'r1'))).toBe(re(at(again, 'r1')));
    expect(re(at(o, 'r1'))).not.toBe(re(at(o, 'r2')));
  });

  test('recalculating from a change matches a full run, whether the change is to the seed or to a draw above it', async () => {
    const ws = sheetOf([...lines, 'd\\coloneq \\mathrm{rnd}\\left(1\\right)', 'x\\coloneq 1', 'y\\coloneq x+1']);
    const first = await runIncremental(ws, noAlgebra, null);
    for (const [id, latex] of [['r3', '\\mathrm{Seed}\\left(8\\right)='], ['r4', 'b\\coloneq \\mathrm{rnd}\\left(1\\right)+\\mathrm{rnd}\\left(1\\right)'], ['r7', 'x\\coloneq 2']] as const) {
      const after = structuredClone(ws);
      after.regions.find((r) => r.id === id)!.content = readRegion(latex);
      const next = await runIncremental(after, noAlgebra, first.snapshot);
      expect(next.outcomes.map(flat)).toEqual(runWorksheet(after).map(flat));
    }
  });

  test('a region below the seed that draws is calculated again when a draw above it changes, not reused', async () => {
    const ws = sheetOf(['\\mathrm{Seed}\\left(3\\right)=', 'a\\coloneq \\mathrm{rnd}\\left(1\\right)', 'b\\coloneq \\mathrm{rnd}\\left(1\\right)']);
    const first = await runIncremental(ws, noAlgebra, null);
    const after = structuredClone(ws);
    after.regions[1]!.content = readRegion('a\\coloneq \\mathrm{rnd}\\left(1\\right)\\cdot \\mathrm{rnd}\\left(1\\right)');
    const next = await runIncremental(after, noAlgebra, first.snapshot);
    expect(next.ran).toEqual(['r2', 'r3']);
    expect(re(at(next.outcomes, 'r3'))).not.toBe(re(at(first.outcomes, 'r3')));
  });
});

describe('Seed in a referenced sheet', () => {
  test('carries on into the sheet that references it, the same in a full run and from a change', async () => {
    const other = sheetOf(['\\mathrm{Seed}\\left(7\\right)=', 'p\\coloneq \\mathrm{rnd}\\left(1\\right)']);
    const files = { ...NO_FILES, sheet: (name: string) => (name === sheetKey('other.mathmath') ? other : undefined) };
    const ws = sheetOf(['q\\coloneq \\mathrm{rnd}\\left(1\\right)', 'r\\coloneq \\mathrm{rnd}\\left(1\\right)', 'x\\coloneq 1']);
    ws.regions.unshift({ id: 'r0', left: 0, top: -38, alignX: 0, alignY: -30, disabled: false, content: { k: 'include', file: 'other.mathmath' } });
    const full = runWorksheet(ws, 'align', files);
    const first = await runIncremental(ws, noAlgebra, null, { files });
    expect(first.outcomes.map(flat)).toEqual(full.map(flat));
    // Seeded by the other sheet: the first draw here is the second of that stream, not this region's own.
    expect(re(at(full, 'r1'))).not.toBe(re(at(runWorksheet(sheetOf(['q\\coloneq \\mathrm{rnd}\\left(1\\right)'])), 'r1')));
    const after = structuredClone(ws);
    after.regions.find((r) => r.id === 'r3')!.content = readRegion('x\\coloneq 2');
    const next = await runIncremental(after, noAlgebra, first.snapshot, { files });
    expect(next.outcomes.map(flat)).toEqual(runWorksheet(after, 'align', files).map(flat));
  });
});

describe('until', () => {
  const k = 'k\\coloneq 0..10';
  test('ends a range definition at the first negative condition, keeping what it has', () => {
    const o = runWorksheet(sheetOf([k, 'x_{k}\\coloneq \\mathrm{until}\\left(5-k,k^{2}\\right)', 'x=']));
    expect(items(at(o, 'r3'))).toEqual([0, 1, 4, 9, 16, 25]);
  });
  test('inside a larger expression, and in a recurrence, as Mathcad gives them', () => {
    const o = runWorksheet(sheetOf([k, 'y_{k}\\coloneq 2\\cdot \\mathrm{until}\\left(5-k,k\\right)', 'y=', 'w_{0}\\coloneq 1', 'w_{k+1}\\coloneq \\mathrm{until}\\left(100-w_{k},2\\cdot w_{k}\\right)', 'w=']));
    expect(items(at(o, 'r3'))).toEqual([0, 2, 4, 6, 8, 10]);
    expect(items(at(o, 'r6'))).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
  });
  test('negative from the start: an error with nothing there before, the old value kept with something', () => {
    const o = runWorksheet(sheetOf([k, 'u_{k}\\coloneq \\mathrm{until}\\left(-1,k\\right)', 'v_{0}\\coloneq 7', 'v_{k}\\coloneq \\mathrm{until}\\left(-1,k\\right)', 'v=']));
    expect(at(o, 'r2').error?.reason).toMatch(/negative from the start/);
    expect(items(at(o, 'r5'))).toEqual([7]);
  });
  test('over two range variables it stops at the first negative condition, the rest of the matrix 0', () => {
    const o = runWorksheet(sheetOf([k, 'j\\coloneq 0..3', 'm_{k,j}\\coloneq \\mathrm{until}\\left(4-\\left(k+j\\right),10\\cdot k+j\\right)', 'm=']));
    // By rows: k = 0 and 1 in full, k = 2 up to j = 2, where k + j passes 4.
    expect(items(at(o, 'r4'))).toEqual([0, 10, 20, 1, 11, 21, 2, 12, 22, 3, 13, 0]);
  });
  test('through a function of your own, which Mathcad refuses, and with a condition in units, whose sign is what counts', () => {
    const o = runWorksheet(sheetOf([k, 'f\\left(n\\right)\\coloneq \\mathrm{until}\\left(5-n,n\\right)', 'z_{k}\\coloneq f\\left(k\\right)', 'z=',
      'T_{0}\\coloneq 90\\cdot \\mathrm{K}', 'T_{k+1}\\coloneq \\mathrm{until}\\left(T_{k}-60\\cdot \\mathrm{K},T_{k}-0.08\\cdot \\left(T_{k}-20\\cdot \\mathrm{K}\\right)\\right)', '\\mathrm{rows}\\left(T\\right)=']));
    expect(items(at(o, 'r4'))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(re(at(o, 'r7'))).toBe(8);
  });
  test('inside a program\'s loop, it ends the definition the program stands in', () => {
    const o = runWorksheet(sheetOf([k, 'g_{k}\\coloneq \\begin{array}{|l}s\\gets 0\\\\\\mathbf{for}\\ i\\in 0..k\\ \\begin{array}{|l}s\\gets s+\\mathrm{until}\\left(3-i,i\\right)\\end{array}\\\\s\\end{array}', 'g=']));
    expect(items(at(o, 'r3'))).toEqual([0, 1, 3, 6]);
  });
  test('outside a range definition it is an error, as in Mathcad', () => {
    const o = runWorksheet(sheetOf(['\\mathrm{until}\\left(1,3\\right)=']));
    expect(o[0]!.error?.reason).toMatch(/works in a definition over a range variable/);
  });
});

describe('trace and pause', () => {
  test('print as Mathcad Help gives them, and give 0', () => {
    expect(traceText('trace', [str('x = {0}, y = {1}'), num(0.2), num(0.03)])).toBe('x = 0.2, y = 0.03');
    expect(traceText('trace', [fromValues(3, 1, [num(1), num(2), num(3)])])).toBe('vector{3} [1, 2, 3]');
    expect(traceText('trace', [str('{0}'), fromValues(2, 2, [num(1), num(3), num(2), num(4)])])).toBe('matrix{2, 2} [[1, 2], [3, 4]]');
    expect(traceText('trace', [num(1, undefined, -2)])).toBe('1-2i');
    expect(() => traceText('trace', [num(1), num(2)])).toThrow(/first argument is the text/);
    const o = runWorksheet(sheetOf(['\\mathrm{trace}\\left(\\text{"a {0}"},5\\right)=', '\\mathrm{pause}\\left(5\\right)=']));
    expect(o.map((x) => [re(x), x.trace])).toEqual([[0, ['a 5']], [0, ['5']]]);
  });
  test('in a loop, keeps 200 lines and counts the rest', () => {
    const o = runWorksheet(sheetOf(['i\\coloneq 1..250', 'q_{i}\\coloneq \\mathrm{trace}\\left(i\\right)']));
    const t = at(o, 'r2').trace!;
    expect(t.length).toBe(201);
    expect(t.at(-1)).toBe('… and 50 more');
  });
});

describe('PolyLookup', () => {
  test('the name, the dual and the Wythoff symbol, by number or "#n", as Mathcad 14 gives them', () => {
    const o = runWorksheet(sheetOf(['\\mathrm{PolyLookup}\\left(11\\right)=', '\\mathrm{PolyLookup}\\left(\\text{"#80"}\\right)=', '\\mathrm{PolyLookup}\\left(81\\right)=']));
    const strs = (x: Outcome) => (x.value as { cells: { v: string }[] }).cells.map((c) => c.v);
    expect(strs(o[0]!)).toEqual(['cube', 'octahedron', '3|2 4']);
    expect(strs(o[1]!)).toEqual(['great dirhombicosidodecahedron', 'great dirhombicosidodecacron', '|3/2 5/3 3 5/2']);
    expect(o[2]!.error?.reason).toMatch(/1 to 80/);
  });
});
