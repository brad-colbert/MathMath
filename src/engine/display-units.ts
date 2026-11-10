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
 * Which unit a result shows in. Tested in Mathcad 14: a dimension that matches a named unit shows
 * that name, and anything else is a fraction of base units in the order m, kg, K, s, A, mol, cd.
 */
import { type Dim, dimEq, isNoDim } from './values.js';

export interface UnitPart { name: string; power: number }
export interface Chosen { parts: UnitPart[]; factor: number }

// Dimension index: length, mass, time, current, temperature, substance, luminous intensity.
const d = (L: number, M: number, T: number, I = 0, K = 0, N = 0, J = 0): Dim => [L, M, T, I, K, N, J];

/** Named units Mathcad chooses, in the order it tries them. Hz, S and lm are absent: it shows 1/s, 1/Ω and cd. */
const NAMED: { name: string; dim: Dim; factor: number }[] = [
  { name: 'N', dim: d(1, 1, -2), factor: 1 },
  { name: 'J', dim: d(2, 1, -2), factor: 1 },
  { name: 'W', dim: d(2, 1, -3), factor: 1 },
  { name: 'Pa', dim: d(-1, 1, -2), factor: 1 },
  { name: 'C', dim: d(0, 0, 1, 1), factor: 1 },
  { name: 'V', dim: d(2, 1, -3, -1), factor: 1 },
  { name: 'Ω', dim: d(2, 1, -3, -2), factor: 1 },
  { name: 'F', dim: d(-2, -1, 4, 2), factor: 1 },
  { name: 'T', dim: d(0, 1, -2, -1), factor: 1 },
  { name: 'Wb', dim: d(2, 1, -2, -1), factor: 1 },
  { name: 'H', dim: d(2, 1, -2, -2), factor: 1 },
  { name: 'lx', dim: d(-2, 0, 0, 0, 0, 0, 1), factor: 1 },
  { name: 'L', dim: d(3, 0, 0), factor: 1e-3 },
];

const BASE: { name: string; index: number }[] = [
  { name: 'm', index: 0 }, { name: 'kg', index: 1 }, { name: 'K', index: 4 }, { name: 's', index: 2 },
  { name: 'A', index: 3 }, { name: 'mol', index: 5 }, { name: 'cd', index: 6 },
];

/** The whole number p with dim = unit^p, or 0 if there is none. */
function powerOf(dim: Dim, unit: Dim): number {
  const k = unit.findIndex((u) => u !== 0);
  const p = dim[k]! / unit[k]!;
  return Number.isInteger(p) && p !== 0 && dimEq(dim, unit.map((u) => u * p)) ? p : 0;
}

export function chooseUnits(dim: Dim): Chosen {
  if (isNoDim(dim)) return { parts: [], factor: 1 };
  // A whole power of a named unit shows as that power: Mathcad 14 shows conductance as 1/Ω, and Ω², 1/W and
  // 1/L the same way (probed). S/m and Ω·m are not powers of one unit, so they fall to base units.
  for (const n of NAMED) {
    const p = powerOf(dim, n.dim);
    if (p !== 0) return { parts: [{ name: n.name, power: p }], factor: n.factor ** p };
  }
  const parts = BASE.flatMap((b): UnitPart[] => {
    const p = dim[b.index]!;
    return Math.abs(p) < 1e-9 ? [] : [{ name: b.name, power: Number(p.toFixed(6)) }];
  });
  return { parts, factor: 1 };
}

/** A unit's name as LaTeX. kΩ and μF stay one name in `\\mathrm`, so the unit editor reads them back whole; % is a command, as in a comment it would hide the rest. */
export const unitNameLatex = (name: string): string => (name === 'Ω' ? '\\Omega' : name === '%' ? '\\%' : `\\mathrm{${name}}`);
const up = unitNameLatex;
const power = (p: UnitPart, n: number): string => (n === 1 ? up(p.name) : `${up(p.name)}^{${n}}`);

/** As Mathcad writes them: a fraction when any power is negative. */
export function unitsLatex(parts: UnitPart[]): string {
  const top = parts.filter((p) => p.power > 0).map((p) => power(p, p.power));
  const bottom = parts.filter((p) => p.power < 0).map((p) => power(p, -p.power));
  if (top.length === 0 && bottom.length === 0) return '';
  if (bottom.length === 0) return top.join('\\cdot ');
  return `\\frac{${top.join('\\cdot ') || '1'}}{${bottom.join('\\cdot ')}}`;
}
