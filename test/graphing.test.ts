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
import { type Value, getEl } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/** The graphing helpers at 66 points probed in Mathcad 14: its answers, nested arrays flattened column by column. */
type Case = { label: string; latex: string; want?: (number | null)[]; error?: boolean };
const REF = JSON.parse(readFileSync(new URL('./graphing-reference.json', import.meta.url), 'utf8')) as { defs: string[]; cases: Case[] };

function run(lines: string[]): { value: Value | undefined; error: string | undefined }[] {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).map((o) => ({ value: o.value ?? undefined, error: o.error?.reason }));
}
const flat = (v: Value): number[] => {
  if (v.t === 'num') return [v.re];
  if (v.t !== 'mat') return [];
  const out: number[] = [];
  for (let c = 0; c < v.cols; c++) for (let r = 0; r < v.rows; r++) out.push(...flat(getEl(v, r, c)));
  return out;
};

const outs = run([...REF.defs, ...REF.cases.map((c) => c.latex)]).slice(REF.defs.length);

describe('graphing helpers, against Mathcad 14', () => {
  test.each(REF.cases.map((c, k) => [c.label, c, k] as const))('%s', (_, c, k) => {
    const o = outs[k]!;
    if (c.error) {
      expect(o.error).toBeDefined();
      return;
    }
    expect(o.error).toBeUndefined();
    const got = flat(o.value!);
    expect(got).toHaveLength(c.want!.length);
    c.want!.forEach((w, i) => {
      if (w === null) expect(got[i]).toBeNaN();
      else expect(Math.abs(got[i]! - w)).toBeLessThanOrEqual(1e-13 * Math.max(1, Math.abs(w)));
    });
  });
});

describe('graphing helpers, more', () => {
  test('CreateSpace with one function of one value: x = y = t, z = f(t), as Mathcad 14 gives it', () => {
    const [, o] = run(['c\\left(t\\right)\\coloneq 2\\cdot t', '\\mathrm{CreateSpace}\\left(c,0,1,3\\right)=']);
    expect(flat(o!.value!)).toEqual([0, 0.5, 1, 0, 0.5, 1, 0, 1, 2]);
  });
  test('the defaults: −5 to 5 and 20 points', () => {
    const [, o] = run(['G\\left(s,t\\right)\\coloneq s\\cdot t', 'M\\coloneq \\mathrm{CreateMesh}\\left(G\\right)']);
    expect(o!.error).toBeUndefined();
    const [, , x] = run(['G\\left(s,t\\right)\\coloneq s\\cdot t', 'M\\coloneq \\mathrm{CreateMesh}\\left(G\\right)', '\\mathrm{rows}\\left(\\left(M_{0}\\right)_{0}\\right)=']);
    expect((x!.value as { re: number }).re).toBe(20);
  });
  test('the default grid, and CreateMesh(G, fm) taking fm as the mapping, as probed in Mathcad 14', () => {
    const defs = ['G\\left(s,t\\right)\\coloneq s+100\\cdot t', '\\mathrm{fm}\\left(a,b,c\\right)\\coloneq \\begin{pmatrix}a+1000\\\\b+2000\\\\c+3000\\end{pmatrix}',
      'M\\coloneq \\mathrm{CreateMesh}\\left(G\\right)', 'N\\coloneq \\mathrm{CreateMesh}\\left(G,\\mathrm{fm}\\right)'];
    const at = (m: string, k: number, r: number, c: number): string => `\\left(\\left(${m}_{0}\\right)_{${k}}\\right)_{${r},${c}}=`;
    const got = run([...defs, at('M', 0, 1, 0), at('M', 1, 0, 1), at('M', 2, 1, 1), at('N', 0, 0, 0), at('N', 2, 0, 0)]).slice(defs.length).map((o) => (o.value as { re: number }).re);
    // Mathcad 14: −4.473684210526316, −4.473684210526316, −451.8421052631579, 995, 2495.
    [-4.473684210526316, -4.473684210526316, -451.8421052631579, 995, 2495].forEach((w, i) => expect(got[i]).toBeCloseTo(w, 12));
  });
  test('a built-in function as the mapping, and the wrong number of parameters named', () => {
    const [, o] = run(['G\\left(s,t\\right)\\coloneq 1', '\\mathrm{CreateMesh}\\left(G,0,1,0,\\pi ,2,2,\\mathrm{cyl2xyz}\\right)=']);
    expect(flat(o!.value!).slice(0, 4)).toEqual([0, 1, 0, -1].map((v, i) => (i % 2 === 0 ? 0 : v)));
    expect(run(['h\\left(s\\right)\\coloneq s', '\\mathrm{CreateMesh}\\left(h\\right)='])[1]!.error).toMatch(/two variables/);
    expect(run(['g\\left(s,t\\right)\\coloneq s', '\\mathrm{CreateSpace}\\left(g\\right)='])[1]!.error).toMatch(/one variable/);
  });
});
