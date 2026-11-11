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

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { gesvd } from "../src/engine/svd.js";

// Mathcad 14's svd2 answers, probed 2026-11-10: s a column, U (m × n) and Vᵀ (n × n), entries a number or a
// complex [re, im]. The port has to reproduce them, singular vector signs and complex phases included.
type Entry = number | [number, number];
interface Case {
  label: string;
  A: Entry[][];
  s: number[][];
  U: Entry[][];
  VT: Entry[][];
}
const reference = JSON.parse(
  readFileSync(new URL("./svd2-reference.json", import.meta.url), "utf8"),
) as { cases: Case[] };

const re = (x: Entry): number => (typeof x === "number" ? x : x[0]);
const im = (x: Entry): number => (typeof x === "number" ? 0 : x[1]);

describe("gesvd as LAPACK 3.0 (Mathcad 14 svd2)", () => {
  for (const c of reference.cases) {
    test(c.label, () => {
      const complex = c.A.some((row) => row.some((x) => typeof x !== "number"));
      const r = gesvd(
        c.A.map((row) => row.map(re)),
        complex ? c.A.map((row) => row.map(im)) : null,
      );
      expect(r.s.length).toBe(c.s.length);
      c.s.forEach((row, i) => {
        const want = row[0]!;
        expect(Math.abs(r.s[i]! - want)).toBeLessThanOrEqual(
          1e-12 * Math.max(1, Math.abs(want)),
        );
      });
      const compare = (
        name: string,
        got: number[][],
        gotIm: number[][] | null,
        want: Entry[][],
      ): void => {
        expect(got.length, `${name} rows`).toBe(want.length);
        want.forEach((row, i) =>
          row.forEach((w, j) => {
            expect(
              Math.abs(got[i]![j]! - re(w)),
              `${name}[${i}][${j}] real`,
            ).toBeLessThanOrEqual(1e-10);
            expect(
              Math.abs((gotIm ? gotIm[i]![j]! : 0) - im(w)),
              `${name}[${i}][${j}] imaginary`,
            ).toBeLessThanOrEqual(1e-10);
          }),
        );
      };
      compare("U", r.Ure, r.Uim, c.U);
      compare("VT", r.VTre, r.VTim, c.VT);
    });
  }

  test("needs at least as many rows as columns", () => {
    expect(() => gesvd([[1, 2, 3]], null)).toThrow(/rows/);
  });
});
