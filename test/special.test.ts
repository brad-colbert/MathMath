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
import type { Num, Value } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/**
 * The special functions at about 590 points probed in Mathcad 14, and more beyond them: each with Mathcad's answer
 * where MathMath matches it, mpmath's where MathMath gives the true value and Mathcad doesn't, or a refusal.
 */
type Case = { label: string; latex: string; want?: [number, number]; source?: string; error?: boolean; why?: string; abs?: number };
const REF = JSON.parse(readFileSync(new URL('./special-reference.json', import.meta.url), 'utf8')) as { cases: Case[]; extra: Case[] };

function run(lines: string[]): (Value | string)[] {
  const ws = emptyWorksheet();
  lines.forEach((l, n) => ws.regions.push({ id: String(n), left: 0, top: n * 30, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).map((o) => (o.error ? o.error.reason : (o.value ?? '')));
}

function check(c: Case, got: Value | string): void {
  if (c.error) {
    expect(typeof got, `${c.label} should be refused${c.why ? `: ${c.why}` : ''}`).toBe('string');
    return;
  }
  expect(typeof got, String(got)).not.toBe('string');
  const v = got as Num;
  const [re, im] = c.want!;
  // Relative to the value, with a floor for answers near a zero, as J0 at its first root.
  const err = Math.hypot(v.re - re, v.im - im);
  expect(err, `${c.label}: ${v.re} ${v.im} against ${re} ${im} (${c.source})`).toBeLessThanOrEqual(1e-12 * Math.hypot(re, im) + (c.abs ?? 1e-15));
}

describe("special functions, against Mathcad 14 and mpmath", () => {
  const out = run(REF.cases.map((c) => c.latex));
  test.each(REF.cases.map((c, k) => [c.label, c, k] as const))('%s', (_, c, k) => check(c, out[k]!));
});

describe('beyond the probed range, against mpmath', () => {
  const out = run(REF.extra.map((c) => c.latex));
  test.each(REF.extra.map((c, k) => [c.label, c, k] as const))('%s', (_, c, k) => check(c, out[k]!));
});

describe('names people use for their own values', () => {
  test("a sheet's own ε, I0, Y0 and H1 win over the built-ins", () => {
    const out = run(['\\varepsilon\\coloneq 0.96714', '\\varepsilon=', 'I0\\coloneq 2\\cdot \\mathrm{A}', 'Y0\\left(t\\right)\\coloneq t+1', 'Y0\\left(1\\right)=', 'H1\\coloneq 5', 'H1=']);
    expect((out[1] as Num).re).toBe(0.96714);
    expect((out[4] as Num).re).toBe(2);
    expect((out[6] as Num).re).toBe(5);
  });
  test('a built-in used as a plain value is an error, not a number', () => {
    const [r] = run(['\\mathrm{I0}\\cdot 2=']);
    expect(r).toMatch(/scalar/);
  });
});

describe('the edges', () => {
  test('ε counts from ORIGIN', () => {
    const ws = emptyWorksheet();
    ws.origin = 1;
    ['\\varepsilon\\left(1,2,3\\right)=', '\\varepsilon\\left(2,1,3\\right)=', '\\varepsilon\\left(0,1,2\\right)='].forEach((l, n) => ws.regions.push({ id: String(n), left: 0, top: n * 30, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(l) }));
    const [a, b, c] = runWorksheet(ws);
    // As Mathcad 14 at ORIGIN 1: 1, −1, and an error for 0.
    expect([(a!.value as Num).re, (b!.value as Num).re, c!.error !== undefined]).toEqual([1, -1, true]);
  });
  test('element by element, with the vectorize arrow', () => {
    const out = run(['v\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\end{pmatrix}', '\\overrightarrow{J0\\left(v\\right)}=']);
    const m = out[1] as { re: Float64Array };
    expect(Array.from(m.re).map((x) => +x.toFixed(12))).toEqual([1, 0.765197686558, 0.223890779141]);
  });
  test('lnΓ far below 0 keeps its branch, and gives up past −100 000 rather than hang', () => {
    const [a, b] = run(['\\mathrm{lnΓ}\\left(-500.5\\right)=', '\\mathrm{lnΓ}\\left(-1\\cdot 10^{10}-0.5\\mathrm{i}\\right)=']);
    expect((a as Num).re).toBeCloseTo(-2613.2937821238925, 9);
    expect((a as Num).im).toBeCloseTo(-1573.9379194484864, 9);
    expect(b).toMatch(/only down to/);
  });
  test('a series that would cancel is refused, not given wrong', () => {
    const [a, b, c] = run(['\\mathrm{mhyper}\\left(-50.5,1,30\\right)=', '\\mathrm{fhyper}\\left(30,30,1,-0.4\\right)=', '\\mathrm{mhyper}\\left(-10.5,2,15\\right)=']);
    expect(a).toMatch(/cancels/);
    expect(b).toMatch(/cancels/);
    expect((c as Num).re).toBeCloseTo(-21.49909691666833, 9);
  });
  test('js at 0: 1 for order 0, 0 above, infinite below', () => {
    const out = run(['\\mathrm{js}\\left(0,0\\right)=', '\\mathrm{js}\\left(2,0\\right)=', '\\mathrm{js}\\left(-0.3,0\\right)=']);
    expect([(out[0] as Num).re, (out[1] as Num).re]).toEqual([1, 0]);
    expect(out[2]).toMatch(/undefined/);
  });
});
