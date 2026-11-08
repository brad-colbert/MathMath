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

/** The symbolic keywords, as the Keywords menu lists them: name, whether it takes an argument, and a hint. */
export const KEYWORDS = [
  ['simplify', false, 'Simplify'], ['expand', false, 'Multiply out'], ['factor', false, 'Factor'], ['float', false, 'As a decimal, to 20 digits'],
  ['solve', true, 'Solve for a variable'], ['collect', true, 'Collect powers of a variable'], ['coeffs', true, 'List coefficients of a variable'],
  ['series', true, 'Series in a variable'], ['substitute', true, 'Substitute, as x=y+1'], ['parfrac', true, 'Partial fractions in a variable'],
  ['assume', true, 'Assume something, as x>0'],
  ['laplace', true, 'Laplace transform in a variable, as t; the result is in s'],
  ['invlaplace', true, 'Inverse Laplace transform in a variable, as s; the result is in t'],
  ['ztrans', true, 'z-transform in a variable, as n; the result is in z'],
  ['invztrans', true, 'Inverse z-transform in a variable, as z; the result is in n'],
] as const;
