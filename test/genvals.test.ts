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
import { ggev } from '../src/engine/qz.js';

type Entry = number | [number, number];
interface Case {
  label: string;
  M: Entry[][];
  N: Entry[][];
  genvals: Entry[][];
  genvecs: Entry[][];
  genvecsL?: Entry[][];
}

/** Mathcad 14's genvals, genvecs and genvecsL for 34 invented pairs, from a probe sheet. */
const CASES = (JSON.parse(readFileSync(new URL('./genvals-reference.json', import.meta.url), 'utf8')) as { cases: Case[] }).cases;

const re = (x: Entry): number => (typeof x === 'number' ? x : x[0]);
const im = (x: Entry): number => (typeof x === 'number' ? 0 : x[1]);
const part = (m: Entry[][], f: (x: Entry) => number): number[][] => m.map((r) => r.map(f));
const isComplex = (m: Entry[][]): boolean => m.some((r) => r.some((x) => typeof x !== 'number'));

const BIG = 1.7976931348623157e308;

/** genvals as Mathcad reports them: alpha / beta, and for beta = 0 the largest double signed like alpha, or 0. */
function ratio(ar: number, ai: number, br: number, bi: number): [number, number] {
  if (br === 0 && bi === 0) {
    const s = ar !== 0 ? ar : ai;
    return [s > 0 ? BIG : s < 0 ? -BIG : 0, 0];
  }
  const d = br * br + bi * bi;
  return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
}

const close = (got: number, want: number, rel: number, abs: number): boolean => Math.abs(got - want) <= rel * Math.abs(want) + abs;

describe('ggev, LAPACK 3.0 dggev and zggev', () => {
  test('the reference has 34 cases', () => expect(CASES.length).toBe(34));

  for (const c of CASES) {
    const cplx = isComplex(c.M) || isComplex(c.N);
    const solve = (want: 'none' | 'right' | 'left') =>
      ggev(part(c.M, re), cplx ? part(c.M, im) : null, part(c.N, re), cplx ? part(c.N, im) : null, want);

    test(`${c.label}: genvals, in Mathcad's order`, () => {
      const r = solve('none');
      expect(r.alphaRe.length).toBe(c.genvals.length);
      c.genvals.forEach((row, k) => {
        const [gr, gi] = ratio(r.alphaRe[k]!, r.alphaIm[k]!, r.betaRe[k]!, r.betaIm[k]!);
        const e = row[0]!;
        expect(close(gr, re(e), 1e-12, 0), `${c.label} genvals[${k}] re ${gr} vs ${re(e)}`).toBe(true);
        expect(close(gi, im(e), 1e-12, 0), `${c.label} genvals[${k}] im ${gi} vs ${im(e)}`).toBe(true);
      });
    });

    const vectors = (want: 'right' | 'left', ref: Entry[][]): void => {
      const r = solve(want);
      const n = ref.length;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const gr = r.vre![i]![j]!;
          const gi = r.vim![i]![j]!;
          expect(Math.abs(gr - re(ref[i]![j]!)), `${c.label} ${want} vector [${i}][${j}] re ${gr} vs ${re(ref[i]![j]!)}`).toBeLessThan(1e-10);
          expect(Math.abs(gi - im(ref[i]![j]!)), `${c.label} ${want} vector [${i}][${j}] im ${gi} vs ${im(ref[i]![j]!)}`).toBeLessThan(1e-10);
        }
      }
    };
    test(`${c.label}: genvecs`, () => vectors('right', c.genvecs));
    if (c.genvecsL) test(`${c.label}: genvecsL`, () => vectors('left', c.genvecsL!));
  }
});
