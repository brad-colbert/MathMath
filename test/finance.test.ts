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
import { makeBuiltins } from '../src/engine/builtins.js';
import { type Num, type Value, fromValues, num } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/** Mathcad 14's finance functions at 123 probed points: its answers, or its refusals, which MathMath makes too. */
type Case = { fn: string; args: (number | number[])[]; want?: number; source?: string; abs?: number; error?: string };
const REF = JSON.parse(readFileSync(new URL('./finance-reference.json', import.meta.url), 'utf8')) as { cases: Case[] };
const B = makeBuiltins(0);
const arg = (a: number | number[]): Value => (Array.isArray(a) ? fromValues(a.length, 1, a.map((x) => num(x))) : num(a));
const label = (c: Case): string => `${c.fn}(${c.args.map((a) => (Array.isArray(a) ? `(${a.join(', ')})` : a)).join(', ')})`;

describe('finance functions, against Mathcad 14', () => {
  test.each(REF.cases.map((c) => [label(c), c] as const))('%s', (_, c) => {
    const f = B.get(c.fn)!;
    if (c.error) {
      expect(() => f.call(c.args.map(arg))).toThrow();
      return;
    }
    const v = f.call(c.args.map(arg)) as Num;
    expect(v.im).toBe(0);
    expect(Math.abs(v.re - c.want!)).toBeLessThanOrEqual(c.abs ?? 1e-12 * Math.abs(c.want!));
  });
});

function run(...lines: string[]): (Value | string)[] {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).map((o) => o.error?.reason ?? o.value!);
}
const re = (v: Value | string): number => (v as Num).re;

describe('finance in a worksheet', () => {
  test('rates written as percentages: 8.25% is 0.0825', () => {
    const [, r, p] = run('r\\coloneq 8.25\\%', 'r=', '\\mathrm{pmt}\\left(\\frac{r}{12},360,200000\\right)=');
    expect(re(r!)).toBeCloseTo(0.0825, 15);
    // Mathcad 14: −1502.5332081018505.
    expect(re(p!)).toBeCloseTo(-1502.5332081018505, 9);
  });
  test('arguments with units, a row of cash flows, and an irr with no sign change are refused, as in Mathcad', () => {
    expect(run('\\mathrm{pv}\\left(0.05,10,-100\\cdot \\mathrm{kg}\\right)=')[0]).toMatch(/no units/);
    expect(run('\\mathrm{npv}\\left(0.1,\\begin{pmatrix}1&2&3\\end{pmatrix}\\right)=')[0]).toMatch(/column/);
    expect(run('\\mathrm{irr}\\left(\\begin{pmatrix}100\\\\200\\end{pmatrix}\\right)=')[0]).toMatch(/positive and one negative/);
    for (const f of ['\\mathrm{irr}\\left(\\begin{pmatrix}-100&30&40\\end{pmatrix}\\right)=', '\\mathrm{fvc}\\left(0.05,\\begin{pmatrix}100&100\\end{pmatrix}\\right)=', '\\mathrm{fvadj}\\left(1000,\\begin{pmatrix}0.05&0.06\\end{pmatrix}\\right)=', '\\mathrm{mirr}\\left(\\begin{pmatrix}-100&30&40\\end{pmatrix},0.1,0.12\\right)=']) {
      expect(run(f)[0]).toMatch(/column/);
    }
  });
  test('irr finds a rate Mathcad 14 was still calculating after a minute, and the root nearer its guess', () => {
    // irr((−1000, 100)) is −90%: Mathcad 14 was still calculating after a minute.
    expect(re(B.get('irr')!.call([arg([-1000, 100])]))).toBeCloseTo(-0.9, 10);
    expect(re(B.get('irr')!.call([arg([-100, 230, -132]), num(0.25)]))).toBeCloseTo(0.2, 10);
  });
  test('a loan pays off: the principal over every period is the loan, and ipmt + ppmt is pmt', () => {
    const [r, n, pv] = [0.005, 60, 25000];
    const pmt = re(B.get('pmt')!.call([num(r), num(n), num(pv)]));
    expect(re(B.get('cumprn')!.call([num(r), num(n), num(pv), num(1), num(n)]))).toBeCloseTo(-pv, 8);
    for (const per of [1, 17, 60]) {
      const i = re(B.get('ipmt')!.call([num(r), num(per), num(n), num(pv)]));
      const p = re(B.get('ppmt')!.call([num(r), num(per), num(n), num(pv)]));
      expect(i + p).toBeCloseTo(pmt, 10);
    }
  });
});
