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

/**
 * Numerical nth derivatives, for Mathcad's dⁿ/dxⁿ operator (orders 2 to 5; the first has its own five-point
 * difference in the evaluator, which corpus answers depend on).
 */

/** (−1)^k·C(n, k): the weights of the central nth difference. */
function weights(n: number): number[] {
  let w = [1];
  for (let i = 0; i < n; i++) w = [...w, 0].map((v, k) => v - (w[k - 1] ?? 0));
  return w;
}

/**
 * Ridders' method (Numerical Recipes' dfridr) on the central nth difference, whose error runs in even powers
 * of the step. The step starts at a tenth of the point's size and shrinks by 1.4 each row, and Neville's
 * table extrapolates each row to a zero step. The best estimate is the one whose neighbours in the table
 * agree most closely. It stops when rounding in the differences, which grows as the step shrinks, is
 * larger than that disagreement, so smaller steps can't help.
 */
export function nthDerivative(f: (x: number) => number, x: number, n: number): number {
  const w = weights(n);
  const difference = (h: number): [number, number] => {
    let sum = 0;
    let size = 0;
    for (let k = 0; k <= n; k++) {
      const y = w[k]! * f(x + (n / 2 - k) * h);
      sum += y;
      size += Math.abs(y);
    }
    return [sum / h ** n, (4 * Number.EPSILON * size) / h ** n];
  };
  const CON = 1.4;
  const CON2 = CON * CON;
  let h = 0.1 * (x === 0 ? 1 : Math.abs(x));
  let previous = [difference(h)[0]];
  let best = previous[0]!;
  let relative = Infinity;
  for (let i = 1; i < 40; i++) {
    h /= CON;
    const [d, rounding] = difference(h);
    const row = [d];
    let fac = CON2;
    for (let j = 1; j <= i; j++) {
      row[j] = (row[j - 1]! * fac - previous[j - 1]!) / (fac - 1);
      fac *= CON2;
      const e = Math.max(Math.abs(row[j]! - row[j - 1]!), Math.abs(row[j]! - previous[j - 1]!));
      // Relative, since with steps much too large the estimates are all tiny and so agree closely.
      const r = e === 0 ? 0 : e / Math.abs(row[j]!);
      if (r <= relative) {
        relative = r;
        best = row[j]!;
      }
    }
    if (rounding > relative * Math.abs(d)) break;
    previous = row;
  }
  return best;
}
