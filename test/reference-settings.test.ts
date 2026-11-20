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
import { NO_FILES, sheetKey } from '../src/engine/files.js';

/**
 * A referenced sheet's regions are calculated with the referencing sheet's settings, as the reference program
 * documents ("References do not pass definitions of built-in variables … made in the Worksheet Options dialog");
 * a definition such as ORIGIN := 1 in the referenced sheet itself carries over. When the two sheets' settings
 * differ, the reference says so.
 */
function sheetOf(lines: string[], settings: Partial<Worksheet> = {}): Worksheet {
  const ws = { ...emptyWorksheet(), ...settings };
  ws.regions = lines.map((latex, i): Region => ({ id: `r${i + 1}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(latex) }));
  return ws;
}
function referencing(file: string, lines: string[], settings: Partial<Worksheet> = {}): Worksheet {
  const ws = sheetOf(lines, settings);
  ws.regions.unshift({ id: 'r0', left: 0, top: -38, alignX: 0, alignY: -30, disabled: false, content: { k: 'include', file } });
  return ws;
}
const filesOf = (sheets: Record<string, Worksheet>) => ({ ...NO_FILES, sheet: (name: string) => Object.entries(sheets).find(([f]) => sheetKey(f) === name)?.[1] });
const at = (o: Outcome[], id: string): Outcome => o.find((x) => x.region.id === id)!;
const re = (o: Outcome): number => (o.value?.t === 'num' ? o.value.re : NaN);
const vector = 'v\\coloneq \\begin{pmatrix}10\\\\20\\\\30\\end{pmatrix}';

describe("a referenced sheet's settings", () => {
  test("its regions use this sheet's ORIGIN, and the reference names the difference", () => {
    const files = filesOf({ 'Table.mathmath': sheetOf([vector, 'w\\coloneq v_{1}'], { origin: 1 }) });
    const o = runWorksheet(referencing('Table.mathmath', ['w=', 'v_{1}=']), 'align', files);
    // ORIGIN 0 here: v₁ is the second element, inside the referenced sheet as well as here.
    expect(re(at(o, 'r1'))).toBe(20);
    expect(re(at(o, 'r2'))).toBe(20);
    expect(at(o, 'r0').error).toBeUndefined();
    expect(at(o, 'r0').note).toBe("Definitions from Table.mathmath hold from here on. They are calculated with this sheet's settings, which differ: ORIGIN is 1 in Table.mathmath, 0 here. To carry ORIGIN, TOL or CTOL with a sheet, define it in that sheet, as ORIGIN := 1.");
  });

  test('ORIGIN defined in the referenced sheet carries over into this one, and is not a difference', () => {
    const files = filesOf({ 'Table.mathmath': sheetOf(['ORIGIN\\coloneq 1', vector], { origin: 1 }) });
    const o = runWorksheet(referencing('Table.mathmath', ['v_{1}=']), 'align', files);
    expect(re(at(o, 'r1'))).toBe(10);
    expect(at(o, 'r0').note).toBeUndefined();
  });

  test('the same settings give no note', () => {
    const files = filesOf({ 'Same.mathmath': sheetOf(['a\\coloneq 2']) });
    const o = runWorksheet(referencing('Same.mathmath', ['a=']), 'align', files);
    expect(re(at(o, 'r1'))).toBe(2);
    expect(at(o, 'r0').note).toBeUndefined();
  });

  test('each setting that differs is named, in plain words', () => {
    const files = filesOf({ 'Other.mathmath': sheetOf(['a\\coloneq 2'], { tol: 1e-5, ctol: 1e-6, seed: 7, exactCompare: false, zeroOverZero: true }) });
    const note = at(runWorksheet(referencing('Other.mathmath', ['a=']), 'align', files), 'r0').note!;
    expect(note).toContain('TOL is 0.00001 in Other.mathmath, 0.001 here');
    expect(note).toContain('CTOL is 0.000001 in Other.mathmath, 0.001 here');
    expect(note).toContain('random numbers are seeded with 7 in Other.mathmath, 1 here');
    expect(note).toContain('comparisons are within 10⁻¹² in Other.mathmath, exact here');
    expect(note).toContain('0/0 gives 0 in Other.mathmath, an error here');
  });

  test("0/0 in the referenced sheet follows this sheet's setting", () => {
    const files = filesOf({ 'Zero.mathmath': sheetOf(['z\\coloneq \\frac{0}{0}'], { zeroOverZero: true }) });
    // A failure inside a referenced sheet stays there, as its own results do: z just isn't defined here.
    const here = runWorksheet(referencing('Zero.mathmath', ['z=']), 'align', files);
    expect(at(here, 'r1').error).toBeDefined();
    expect(at(here, 'r0').note).toContain('0/0 gives 0 in Zero.mathmath, an error here');
    const allowed = runWorksheet(referencing('Zero.mathmath', ['z='], { zeroOverZero: true }), 'align', files);
    expect(re(at(allowed, 'r1'))).toBe(0);
    expect(at(allowed, 'r0').note).toBeUndefined();
  });

  test('ORIGIN defined in the referenced sheet to another value than its own setting is still a difference', () => {
    const files = filesOf({ 'Table.mathmath': sheetOf(['ORIGIN\\coloneq 0', vector], { origin: 1 }) });
    const o = runWorksheet(referencing('Table.mathmath', ['v_{1}=']), 'align', files);
    expect(re(at(o, 'r1'))).toBe(20);
    expect(at(o, 'r0').note).toContain('ORIGIN is 1 in Table.mathmath, 0 here');
  });

  test('a sheet it references in turn is compared with this one too', () => {
    const inner = sheetOf(['c\\coloneq 3'], { origin: 1 });
    const middle = referencing('Inner.mathmath', ['d\\coloneq c+1']);
    const files = filesOf({ 'Inner.mathmath': inner, 'Middle.mathmath': middle });
    const o = runWorksheet(referencing('Middle.mathmath', ['d=']), 'align', files);
    expect(re(at(o, 'r1'))).toBe(4);
    expect(at(o, 'r0').note).toContain('ORIGIN is 1 in Inner.mathmath, 0 here');
  });

  test('a recalculation from a change gives the same note as a full run', async () => {
    const files = filesOf({ 'Table.mathmath': sheetOf([vector], { origin: 1 }) });
    const ws = referencing('Table.mathmath', ['v_{1}=', 'x\\coloneq 1']);
    const noAlgebra = async () => ({ result: null, error: 'no algebra engine in this test' });
    const first = await runIncremental(ws, noAlgebra, null, { files });
    expect(at(first.outcomes, 'r0').note).toContain('ORIGIN is 1');
    const after = structuredClone(ws);
    after.regions.find((r) => r.id === 'r2')!.content = readRegion('x\\coloneq 2');
    const next = await runIncremental(after, noAlgebra, first.snapshot, { files });
    expect(at(next.outcomes, 'r0').note).toBe(at(first.outcomes, 'r0').note);
  });
});

/** Against Mathcad 14, probed 2026-11-19. */
describe('ORIGIN, TOL and CTOL defined in a sheet', () => {
  const A = 'A\\coloneq \\begin{pmatrix}10\\\\20\\\\30\\\\40\\end{pmatrix}';
  const values = (o: Outcome[]): (number | string)[] => o.filter((x) => x.region.content.k === 'eval').map((x) => (x.error ? 'error' : x.value?.t === 'mat' ? JSON.stringify([...x.value.re]) : re(x)));

  test('hold from where they are defined down, and a function keeps the ORIGIN it was defined with', () => {
    const o = runWorksheet(sheetOf([
      A, 'f\\left(v\\right)\\coloneq v_{1}', 'A_{1}=',
      'ORIGIN\\coloneq 1', 'ORIGIN=', 'A_{1}=', 'f\\left(A\\right)=',
      'g\\left(v\\right)\\coloneq v_{1}', 'g\\left(A\\right)=',
      'match\\left(30,A\\right)=', 'last\\left(A\\right)=', 'submatrix\\left(A,1,2,1,1\\right)=',
      'k\\coloneq 1..3', 'B_{k}\\coloneq 2\\cdot k', 'B=', 'A_{0}=',
      'ORIGIN\\coloneq -1', 'A_{-1}=', 'A_{0}=',
      'ORIGIN\\coloneq 0', 'A_{1}=', 'f\\left(A\\right)=', 'B=',
    ]));
    expect(values(o)).toEqual([20, 1, 10, 20, 10, '[3]', 4, '[10,20]', '[2,4,6]', 'error', 10, 20, 20, 20, '[2,4,6]']);
  });

  test('ORIGIN must be a whole number', () => {
    const o = runWorksheet(sheetOf([A, 'ORIGIN\\coloneq 2.5', 'A_{1}=']));
    expect(at(o, 'r2').error?.reason).toContain('ORIGIN must be a whole number');
    expect(at(o, 'r3').error).toBeDefined();
  });

  test('a global ORIGIN holds over the whole sheet, above it too', () => {
    const o = runWorksheet(sheetOf([A, 'A_{1}=', 'ORIGIN\\equiv 1', 'A_{1}=']));
    expect(values(o)).toEqual([10, 10]);
  });

  test('TOL holds from where it is defined, and a function keeps the TOL it was defined with', () => {
    // match finds 2 in B within TOL: 2.05 is within 0.1, not within 0.001.
    const o = runWorksheet(sheetOf([
      'B\\coloneq \\begin{pmatrix}1\\\\2.05\\\\3\\end{pmatrix}', 'TOL\\coloneq 0.1', 'm\\left(v\\right)\\coloneq \\mathrm{match}\\left(2,v\\right)',
      '\\mathrm{match}\\left(2,B\\right)=', 'TOL\\coloneq 0.001', '\\mathrm{match}\\left(2,B\\right)=', 'm\\left(B\\right)=', 'TOL=',
    ]));
    expect(values(o)).toEqual(['[1]', 'error', '[1]', 0.001]);
  });

  test('a TOL or CTOL tighter than rounding allows still accepts an answer as exact as numbers hold', () => {
    const o = runWorksheet(sheetOf([
      'TOL\\coloneq 10^{-12}', 'CTOL\\coloneq 10^{-12}', 'x\\coloneq 10^{6}',
      '\\mathrm{root}\\left(x^{2}-2\\cdot 10^{12},x\\right)=',
      '\\mathrm{Given}', 'x^{2}=2\\cdot 10^{12}', '\\mathrm{Find}\\left(x\\right)=',
    ]));
    const [root, find] = values(o).slice(-2) as number[];
    expect(root).toBeCloseTo(Math.SQRT2 * 1e6, 6);
    expect(find).toBeCloseTo(Math.SQRT2 * 1e6, 6);
  });

  test('CTOL holds from where it is defined: a solve block that meets 0.001 fails a far tighter one', () => {
    // Minerr's best for x = 1 and x = 1.000002 together leaves each off by 10⁻⁶: within 0.001, not within 10⁻⁹.
    const block = ['x\\coloneq 0', '\\mathrm{Given}', 'x=1', 'x=1.000002'];
    const loose = runWorksheet(sheetOf([...block, '\\mathrm{Find}\\left(x\\right)=']));
    expect(values(loose)[0] as number).toBeCloseTo(1.000001, 9);
    const tight = runWorksheet(sheetOf(['CTOL\\coloneq 10^{-9}', ...block, '\\mathrm{Find}\\left(x\\right)=']));
    expect(values(tight)).toEqual(['error']);
  });

  test('after a refused ORIGIN, what counts from it fails, as there', () => {
    const o = runWorksheet(sheetOf([A, 'ORIGIN\\coloneq 1', 'ORIGIN\\coloneq 2.5', 'A_{1}=', 'a\\coloneq 3', 'a=']));
    expect(at(o, 'r4').error?.reason).toBe('ORIGIN has no value here: its definition above was refused');
    expect(re(at(o, 'r6'))).toBe(3);
  });

  test('a recalculation after editing, adding or removing ORIGIN := 1 equals a full run', async () => {
    const noAlgebra = async () => ({ result: null, error: 'no algebra engine in this test' });
    const flat = (o: Outcome[]): unknown => o.map((x) => [x.region.id, x.error?.reason ?? null, x.value ? JSON.stringify(x.value, (k, v) => (k === 'owner' || k === 'version' ? undefined : v instanceof Float64Array ? [...v] : v)) : null]);
    const ws = sheetOf([A, 'ORIGIN\\coloneq 1', 'A_{1}=', 'f\\left(v\\right)\\coloneq v_{1}', 'f\\left(A\\right)=']);
    let prev = (await runIncremental(ws, noAlgebra, null)).snapshot;
    const edits: ((w: Worksheet) => void)[] = [
      (w) => { w.regions[1]!.content = readRegion('ORIGIN\\coloneq 0'); },
      (w) => { w.regions[1]!.content = readRegion('ORIGIN\\coloneq 1'); },
      (w) => { w.regions.splice(1, 1); },
      (w) => { w.regions.splice(1, 0, { id: 'n1', left: 0, top: 22, alignX: 0, alignY: 30, disabled: false, content: readRegion('ORIGIN\\coloneq 1') }); },
    ];
    let sheet = ws;
    for (const edit of edits) {
      sheet = structuredClone(sheet);
      edit(sheet);
      const next = await runIncremental(sheet, noAlgebra, prev);
      expect(flat(next.outcomes)).toEqual(flat(runWorksheet(sheet)));
      prev = next.snapshot;
    }
  });

  test('and after adding or removing a global ORIGIN, or a reference to a sheet that defines it', async () => {
    const noAlgebra = async () => ({ result: null, error: 'no algebra engine in this test' });
    const flat = (o: Outcome[]): unknown => o.map((x) => [x.region.id, x.error?.reason ?? null, x.value?.t === 'num' ? x.value.re : null]);
    const files = filesOf({ 'Defines.mathmath': sheetOf(['ORIGIN\\coloneq 1']) });
    const ws = referencing('Defines.mathmath', [A, 'A_{1}=', 'x\\coloneq 1']);
    let prev = (await runIncremental(ws, noAlgebra, null, { files })).snapshot;
    const edits: ((w: Worksheet) => void)[] = [
      (w) => { w.regions.shift(); },
      (w) => { w.regions.push({ id: 'g', left: 0, top: 200, alignX: 0, alignY: 200, disabled: false, content: readRegion('ORIGIN\\equiv 1') }); },
      (w) => { w.regions.pop(); },
      (w) => { w.regions.unshift({ id: 'r0', left: 0, top: -38, alignX: 0, alignY: -30, disabled: false, content: { k: 'include', file: 'Defines.mathmath' } }); },
    ];
    let sheet = ws;
    const seen: unknown[] = [];
    for (const edit of edits) {
      sheet = structuredClone(sheet);
      edit(sheet);
      const next = await runIncremental(sheet, noAlgebra, prev, { files });
      expect(flat(next.outcomes)).toEqual(flat(runWorksheet(sheet, 'align', files)));
      seen.push(re(at(next.outcomes, 'r2')));
      prev = next.snapshot;
    }
    expect(seen).toEqual([20, 10, 20, 10]);
  });
});

describe('converting file functions', () => {
  test('counts image channels from the ORIGIN where the region is', async () => {
    const { originAt } = await import('../src/engine/convert.js');
    const ws = sheetOf(['a\\coloneq 1', 'ORIGIN\\coloneq 1', 'b\\coloneq 2', 'ORIGIN\\coloneq -1', 'c\\coloneq 3']);
    const [a, , b, , c] = ws.regions;
    expect([a, b, c].map((r) => originAt(ws.regions, r!, 0))).toEqual([0, 1, -1]);
    ws.regions[3]!.disabled = true;
    expect(originAt(ws.regions, c!, 0)).toBe(1);
    ws.regions.push({ id: 'g', left: 0, top: 400, alignX: 0, alignY: 400, disabled: false, content: readRegion('ORIGIN\\equiv 5') });
    expect(originAt(ws.regions, a!, 0)).toBe(5);
  });
});
