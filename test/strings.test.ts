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
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';
import type { StoredResult } from '../src/model/ast.js';
import { compareResult } from '../src/score/compare.js';

/**
 * Mathcad 14's answers for the string, type, lookup, number theory and stepped rounding functions, from three probe
 * sheets: each region's math, and Mathcad's stored answer or its error message.
 */
const REF = JSON.parse(readFileSync(new URL('./strings-reference.json', import.meta.url), 'utf8'), (k, v) => (v === null && (k === 're' || k === 'im') ? NaN : v)) as {
  sheets: { defs: string[]; cases: { label: string; latex: string; stored?: StoredResult; mathcadError?: string }[] }[];
};

describe("strings, lookup, number theory and rounding to a step, against Mathcad 14's answers", () => {
  for (const [n, sheet] of REF.sheets.entries()) {
    const ws = emptyWorksheet();
    [...sheet.defs, ...sheet.cases.map((c) => c.latex)].forEach((l, k) => ws.regions.push({ id: String(k), left: 0, top: k * 30, alignX: 0, alignY: k * 30, disabled: false, content: readRegion(l) }));
    const outs = runWorksheet(ws).slice(sheet.defs.length);
    test.each(sheet.cases.map((c, k) => [`${n}: ${c.label}`, c, k] as const))('%s', (_, c, k) => {
      const o = outs[k]!;
      if (c.mathcadError) {
        expect(o.error?.reason, `Mathcad: ${c.mathcadError}`).toBeTruthy();
        return;
      }
      expect(o.error, o.error?.reason).toBeUndefined();
      const verdict = compareResult(o.value!, c.stored!, 1e-12);
      expect(verdict.ok ? 'ok' : verdict.reason).toBe('ok');
    });
  }
});

describe('what Mathcad 14 gets wrong, or MathMath does differently', () => {
  const run = (latex: string[]): (string | number)[] => {
    const ws = emptyWorksheet();
    latex.forEach((l, k) => ws.regions.push({ id: String(k), left: 0, top: k * 30, alignX: 0, alignY: k * 30, disabled: false, content: readRegion(l) }));
    return runWorksheet(ws).map((o) => (o.error ? o.error.reason : !o.value ? '' : o.value.t === 'num' ? o.value.re : o.value.t === 'str' ? o.value.v : NaN));
  };
  test('permut gives the number where Mathcad 14 overflows to 0', () => {
    const [p] = run(['\\mathrm{permut}\\left(60,30\\right)=']);
    expect((p as number) / 3.137001847457163e49).toBeCloseTo(1, 12);
  });
  test("lookup and match use the sheet's TOL", () => {
    const ws = emptyWorksheet();
    ws.tol = 0.01;
    ['A\\coloneq \\begin{pmatrix}1\\\\2\\end{pmatrix}', '\\mathrm{match}\\left(2.005,A\\right)='].forEach((l, k) => ws.regions.push({ id: String(k), left: 0, top: k * 30, alignX: 0, alignY: k * 30, disabled: false, content: readRegion(l) }));
    const out = runWorksheet(ws)[1]!;
    expect(out.error).toBeUndefined();
    expect(out.value!.t === 'mat' && Array.from(out.value!.re)).toEqual([1]);
  });
  test("a sheet's own format, search or match wins over the built-in", () => {
    const out = run(['\\mathrm{format}\\coloneq 3', '\\mathrm{format}=', '\\mathrm{search}\\left(x\\right)\\coloneq x+1', '\\mathrm{search}\\left(1\\right)=']);
    expect([out[1], out[3]]).toEqual([3, 2]);
  });
  test('strings with braces show them', () => {
    expect(run(['\\mathrm{format}\\left(\\text{"{0}"},\\begin{pmatrix}1\\\\2\\end{pmatrix}\\right)='])[0]).toBe('vector{2} [1, 2]');
  });
});
