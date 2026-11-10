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
 * Math as HTML, through MathLive's convertLatexToMarkup, with one fix. MathLive spaces a string on its own,
 * character by character, so the space due after an operator, as in x := "a_b", lands before the string's first
 * escaped character (\_, \{, \%, …) instead of after the operator: the string hugs the := and a gap opens inside
 * it. Wrapped in braces, a string is one piece, spaced like any other operand. Only the drawing changes: what a
 * region stores, and what its editor shows, stay as they are.
 */
import { convertLatexToMarkup } from 'mathlive';

/** Each string, \text{"…"}, in braces. */
export const groupStrings = (latex: string): string => latex.replace(/\\text\{"(?:[^{}\\]|\\.)*"\}/g, '{$&}');

export const mathMarkup = (latex: string): string => convertLatexToMarkup(groupStrings(latex));
