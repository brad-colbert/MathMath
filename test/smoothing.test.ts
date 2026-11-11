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
import { makeBuiltins } from '../src/engine/builtins.js';
import { runWorksheet } from '../src/engine/evaluate.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';
import { type Value, fromValues, getEl, num } from '../src/engine/values.js';

/** ksmooth, supsmooth, correl, correl2d, wave and iwave at the points probed in Mathcad 14, with the same inputs. */
const REF = JSON.parse(readFileSync(new URL('./smoothing-reference.json', import.meta.url), 'utf8')) as { cases: Record<string, (number | number[])[] | 'error'> };
const B = makeBuiltins(0);
const call = (name: string, ...args: Value[]): Value => B.get(name)!.call(args);
const col = (xs: number[]): Value => fromValues(xs.length, 1, xs.map((x) => num(x)));
const cx = (p: [number, number][]): Value => fromValues(p.length, 1, p.map(([a, b]) => num(a, undefined, b)));
const mat = (rows: number[][]): Value => {
  const items: Value[] = [];
  for (let j = 0; j < rows[0]!.length; j++) for (let i = 0; i < rows.length; i++) items.push(num(rows[i]![j]!));
  return fromValues(rows.length, rows[0]!.length, items);
};
const noise = [0.31, -0.42, 0.15, 0.58, -0.27, -0.61, 0.44, 0.09, -0.18, 0.37, -0.53, 0.22, 0.05, -0.35, 0.49, -0.12, 0.28, -0.46, 0.13, 0.4];
const X = Array.from({ length: 20 }, (_, k) => k + 1);
const Y = X.map((x, k) => Math.sin(0.35 * x) * 3 + noise[k]!);
const Xn = [0, 0.5, 0.7, 1.5, 2, 3.2, 3.3, 4, 5.5, 6, 6.1, 7, 8.4, 9, 10];
const Yn = Xn.map((x, k) => x * x * 0.1 + noise[k]!);
const X60 = Array.from({ length: 60 }, (_, k) => k * 0.25);
const Y60 = X60.map((x, k) => Math.cos(0.4 * x) + 0.1 * x + noise[k % 20]! * 0.5);
const DATA: Record<string, [number[], number[]]> = {
  a: [X, Y], b: [Xn, Yn], c: [[1, 2, 3, 4, 5], [2, 1, 4, 3, 5]], t: [[1, 2, 2, 3, 4, 4, 5, 6], [1, 3, 2, 5, 4, 6, 5, 7]], u: [[3, 1, 2, 5, 4], [1, 2, 3, 4, 5]], d: [X60, Y60],
};
const M = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20]];
const K: Record<string, number[][]> = {
  K33: [[1, 2, 0], [0, 1, 0], [0, 0, 3]], K22: [[1, 2], [3, 4]], K23: [[1, 0, 2], [0, 3, 0]], K11: [[2]],
  K55: Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => ((r + c) % 3 === 0 ? 1 : 0))), K14: [[1, 2, 3, 4]],
};
const e = (n: number, k: number): number[] => Array.from({ length: n }, (_, i) => (i === k ? 1 : 0));
// The gallery's 128 readings, written to 15 digits as the probe gave them to Mathcad.
const GX = Array.from({ length: 128 }, (_, k) => k / 8);
const GY = GX.map((x, k) => Number((Math.sin(x) + 0.05 * x + 0.35 * Math.sin(1.7 * k * k)).toPrecision(15)));
const row = (xs: number[]): Value => fromValues(1, xs.length, xs.map((x) => num(x)));

const INPUTS: Record<string, () => Value> = {
  ...Object.fromEntries([1, 2, 0.5, 10, 0.01].map((b) => [`ksmooth(a,${b})`, () => call('ksmooth', col(X), col(Y), num(b))])),
  ...Object.fromEntries([1, 3].map((b) => [`ksmooth(b,${b})`, () => call('ksmooth', col(Xn), col(Yn), num(b))])),
  'ksmooth(u,1)': () => call('ksmooth', col(DATA.u![0]), col(DATA.u![1]), num(1)),
  'ksmooth(a,0)': () => call('ksmooth', col(X), col(Y), num(0)),
  'ksmooth(a,-1)': () => call('ksmooth', col(X), col(Y), num(-1)),
  'ksmooth(c,ay)': () => call('ksmooth', col(DATA.c![0]), col(Y), num(1)),
  'ksmooth(ties,1)': () => call('ksmooth', col(DATA.t![0]), col(DATA.t![1]), num(1)),
  ...Object.fromEntries(Object.keys(DATA).map((n) => [`supsmooth(${n})`, () => call('supsmooth', col(DATA[n]![0]), col(DATA[n]![1]))])),
  'supsmooth(1)': () => call('supsmooth', col([1]), col([3])),
  'supsmooth(2)': () => call('supsmooth', col([1, 2]), col([3, 5])),
  'supsmooth(3)': () => call('supsmooth', col([1, 2, 3]), col([3, 5, 4])),
  'supsmooth(4)': () => call('supsmooth', col([1, 2, 3, 4]), col([3, 5, 4, 7])),
  'correl([1,2,3],[1,0,-1,2])': () => call('correl', col([1, 2, 3]), col([1, 0, -1, 2])),
  'correl([1,0,-1,2],[1,2,3])': () => call('correl', col([1, 0, -1, 2]), col([1, 2, 3])),
  'correl([1,2],[5])': () => call('correl', col([1, 2]), col([5])),
  'correl(cx[1+i,2],[1,1j])': () => call('correl', cx([[1, 1], [2, 0]]), cx([[1, 0], [0, 1]])),
  ...Object.fromEntries(Object.keys(K).map((k) => [`correl2d(M,${k})`, () => call('correl2d', mat(M), mat(K[k]!))])),
  'correl2d(K22,M)': () => call('correl2d', mat(K.K22!), mat(M)),
  'wave(8)': () => call('wave', col([1, 2, 3, 4, 5, 6, 7, 8])),
  'wave(4)': () => call('wave', col([1, -2, 3, 0.5])),
  'wave(2)': () => call('wave', col([3, 1])),
  'wave(16)': () => call('wave', col(Array.from({ length: 16 }, (_, k) => Math.sin(k)))),
  'wave(6)': () => call('wave', col([1, 2, 3, 4, 5, 6])),
  'wave(1)': () => call('wave', col([7])),
  'iwave(e1 of 8)': () => call('iwave', col(e(8, 0))),
  'iwave(e5 of 8)': () => call('iwave', col(e(8, 4))),
  'iwave(e8 of 8)': () => call('iwave', col(e(8, 7))),
  'iwave(wave(8))': () => call('iwave', call('wave', col([1, 2, 3, 4, 5, 6, 7, 8]))),
  'iwave(6)': () => call('iwave', col([1, 2, 3, 4, 5, 6])),
  'correl2d(cx)': () => call('correl2d', mat([[1, 2], [3, 4]]), cx([[1, 1]])),
  'wave(cx)': () => call('wave', cx([[1, 1], [2, 0]])),
  'correl(row)': () => call('correl', row([1, 2]), col([1, 2])),
  'supsmooth(g)': () => call('supsmooth', col(GX), col(GY)),
  'ksmooth(g,1.5)': () => call('ksmooth', col(GX), col(GY), num(1.5)),
  'wave(g)': () => call('wave', col(GY)),
};
/** Cases with units, checked in a worksheet below, where units can be typed. */
const IN_A_WORKSHEET = new Set(['ksmooth(s,m,1s)', 'ksmooth(s,m,1)', 'supsmooth(s,m)', 'correl(m)', 'wave(m)']);

const flat = (v: Value): [number, number][] => {
  if (v.t === 'num') return [[v.re, v.im]];
  const out: [number, number][] = [];
  if (v.t === 'mat') for (let c = 0; c < v.cols; c++) for (let r = 0; r < v.rows; r++) out.push(...flat(getEl(v, r, c)));
  return out;
};

describe('smoothing, correlation and wavelets, against Mathcad 14', () => {
  const labels = Object.keys(INPUTS).filter((l) => l in REF.cases);
  test('every case Mathcad answered is checked, here or in a worksheet below', () => {
    expect(Object.keys(REF.cases).filter((l) => !(l in INPUTS) && !IN_A_WORKSHEET.has(l))).toEqual([]);
  });
  test.each(labels.map((l) => [l] as const))('%s', (l) => {
    const want = REF.cases[l]!;
    if (want === 'error') {
      expect(INPUTS[l]!).toThrow();
      return;
    }
    const got = flat(INPUTS[l]!());
    expect(got).toHaveLength(want.length);
    want.forEach((w, i) => {
      const [re, im] = Array.isArray(w) ? w : [w, 0];
      const scale = Math.max(1, Math.hypot(re!, im!));
      expect(Math.hypot(got[i]![0] - re!, got[i]![1] - im!)).toBeLessThanOrEqual(1e-12 * scale);
    });
  });
});

describe('units, as Mathcad 14 takes them', () => {
  const run = (...lines: string[]): (Value | string)[] => {
    const ws = emptyWorksheet();
    ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
    return runWorksheet(ws).map((o) => o.error?.reason ?? o.value!);
  };
  const S = '\\begin{pmatrix}1\\\\2\\\\3\\\\4\\end{pmatrix}\\cdot \\mathrm{s}';
  const Mv = '\\begin{pmatrix}1\\\\4\\\\2\\\\3\\end{pmatrix}\\cdot \\mathrm{m}';
  test('ksmooth with b in vx\'s units gives vy\'s units; b without them is refused', () => {
    const [v] = run(`\\mathrm{ksmooth}\\left(${S},${Mv},1\\cdot \\mathrm{s}\\right)=`);
    // Mathcad 14: 1.0770239856447104, 3.874840414227148, 2.075095018627051, 2.9743259644949873 m.
    expect(flat(v as Value).map((p) => p[0])).toEqual([1.0770239856447104, 3.874840414227148, 2.075095018627051, 2.9743259644949873].map((x) => expect.closeTo(x, 12)));
    expect(run(`\\mathrm{ksmooth}\\left(${S},${Mv},1\\right)=`)[0]).toMatch(/units/);
  });
  test('supsmooth keeps vy\'s units', () => {
    const X5 = '\\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}\\cdot \\mathrm{s}';
    const Y5 = '\\begin{pmatrix}2\\\\1\\\\4\\\\3\\\\5\\end{pmatrix}\\cdot \\mathrm{m}';
    const [v] = run(`\\mathrm{supsmooth}\\left(${X5},${Y5}\\right)=`);
    // Mathcad 14: 1.4, 2.2, 3, 3.8, 4.6 m.
    expect(flat(v as Value).map((p) => p[0])).toEqual([1.4, 2.2, 3, 3.8, 4.6].map((x) => expect.closeTo(x, 12)));
    expect((v as unknown as { dim: number[] }).dim).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  test('wave and correl refuse units', () => {
    expect(run(`\\mathrm{wave}\\left(${Mv}\\right)=`)[0]).toMatch(/no units/);
    expect(run(`\\mathrm{correl}\\left(${Mv},${Mv}\\right)=`)[0]).toMatch(/no units/);
  });
});
