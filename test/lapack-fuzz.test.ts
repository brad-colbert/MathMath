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
import { ggev } from '../src/engine/qz.js';
import { gesvd } from '../src/engine/svd.js';

// The LAPACK 3.0 ports on random matrices larger than any probed: every answer finite, and each decomposition
// reproducing its matrix. Mathcad's own answers are checked in genvals.test.ts and svd2.test.ts.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}
type C = [number, number];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const abs = (a: C) => Math.hypot(a[0], a[1]);
const random = (r: () => number, m: number, n: number, complex: boolean, ints: boolean) => {
  const v = () => (ints ? Math.round(r() * 4) : r());
  const re = Array.from({ length: m }, () => Array.from({ length: n }, v));
  const im = complex ? Array.from({ length: m }, () => Array.from({ length: n }, v)) : null;
  return { re, im };
};
const at = (x: { re: number[][]; im: number[][] | null }, i: number, j: number): C => [x.re[i]![j]!, x.im ? x.im[i]![j]! : 0];

describe('ggev on random pencils', () => {
  for (let trial = 0; trial < 120; trial++) {
    const r = rng(1000 + trial);
    const n = 1 + (trial % 12);
    const complex = trial % 3 === 2;
    const ints = trial % 4 === 1;
    test(`n=${n} ${complex ? 'complex' : 'real'}${ints ? ' integers' : ''} #${trial}`, () => {
      const A = random(r, n, n, complex, ints);
      const B = random(r, n, n, complex, ints);
      if (trial % 5 === 0) for (let j = 0; j < n; j++) B.re[n - 1]![j] = 0, B.im && (B.im[n - 1]![j] = 0); // singular N
      for (const side of ['right', 'left'] as const) {
        const g = ggev(A.re, A.im, B.re, B.im, side);
        const norm = Math.max(1, ...A.re.flat().map(Math.abs), ...B.re.flat().map(Math.abs), ...(A.im ?? []).flat().map(Math.abs), ...(B.im ?? []).flat().map(Math.abs));
        for (let k = 0; k < n; k++) {
          const alpha: C = [g.alphaRe[k]!, g.alphaIm[k]!];
          const beta: C = [g.betaRe[k]!, g.betaIm[k]!];
          expect([...alpha, ...beta].every(Number.isFinite)).toBe(true);
          const x = Array.from({ length: n }, (_, i): C => [g.vre![i]![k]!, g.vim?.[i]?.[k] ?? 0]);
          expect(x.every((v) => Number.isFinite(v[0]) && Number.isFinite(v[1]))).toBe(true);
          if (x.every((v) => abs(v) === 0)) continue; // dtgevc leaves no vector for a 0/0 pair
          // β·A·x − α·B·x for right vectors; for left ones, yᴴ·(β·A − α·B) = 0, i.e. (β̄·Aᴴ − ᾱ·Bᴴ)·y = 0.
          let worst = 0;
          for (let i = 0; i < n; i++) {
            let s: C = [0, 0];
            for (let j = 0; j < n; j++) {
              const [a, b] = side === 'right' ? [at(A, i, j), at(B, i, j)] : [at(A, j, i), at(B, j, i)];
              const [ac, bc] = side === 'right' ? [a, b] : [[a[0], -a[1]] as C, [b[0], -b[1]] as C];
              const [be, al] = side === 'right' ? [beta, alpha] : [[beta[0], -beta[1]] as C, [alpha[0], -alpha[1]] as C];
              const t1 = mul(be, mul(ac, x[j]!));
              const t2 = mul(al, mul(bc, x[j]!));
              s = [s[0] + t1[0] - t2[0], s[1] + t1[1] - t2[1]];
            }
            worst = Math.max(worst, abs(s));
          }
          expect(worst, `residual of pair ${k}`).toBeLessThan(1e-9 * n * norm * Math.max(1, abs(alpha), abs(beta)));
        }
      }
    });
  }
});

describe('gesvd on random matrices', () => {
  for (let trial = 0; trial < 120; trial++) {
    const r = rng(5000 + trial);
    const n = 1 + (trial % 10);
    const m = n + (trial % 7);
    const complex = trial % 3 === 2;
    const rankDeficient = trial % 6 === 0 && n > 1;
    test(`${m}×${n} ${complex ? 'complex' : 'real'}${rankDeficient ? ' rank-deficient' : ''} #${trial}`, () => {
      const A = random(r, m, n, complex, trial % 4 === 1);
      if (rankDeficient) for (let i = 0; i < m; i++) { A.re[i]![n - 1] = A.re[i]![0]!; if (A.im) A.im[i]![n - 1] = A.im[i]![0]!; }
      const g = gesvd(A.re, A.im);
      expect(g.s.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
      for (let k = 1; k < n; k++) expect(g.s[k]!).toBeLessThanOrEqual(g.s[k - 1]!);
      const U = { re: g.Ure, im: g.Uim };
      const V = { re: g.VTre, im: g.VTim };
      let worst = 0;
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
          let s: C = [0, 0];
          for (let k = 0; k < n; k++) {
            const t = mul(at(U, i, k), at(V, k, j));
            s = [s[0] + g.s[k]! * t[0], s[1] + g.s[k]! * t[1]];
          }
          const a = at(A, i, j);
          worst = Math.max(worst, abs([s[0] - a[0], s[1] - a[1]]));
        }
      }
      expect(worst).toBeLessThan(1e-12 * m * Math.max(1, g.s[0]!));
      // Uᴴ·U = I
      for (let p = 0; p < n; p++) {
        for (let q = 0; q < n; q++) {
          let s: C = [0, 0];
          for (let i = 0; i < m; i++) { const u = at(U, i, p); const t = mul([u[0], -u[1]], at(U, i, q)); s = [s[0] + t[0], s[1] + t[1]]; }
          expect(abs([s[0] - (p === q ? 1 : 0), s[1]])).toBeLessThan(1e-12 * m);
        }
      }
    });
  }
});
