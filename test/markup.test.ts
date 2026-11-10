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
import { groupStrings, mathMarkup } from '../src/ui/markup.js';

describe('strings in drawn math', () => {
  test.each([
    ['\\mathrm{file}\\coloneq \\text{"The\\_Earth\\_seen"}', '\\mathrm{file}\\coloneq {\\text{"The\\_Earth\\_seen"}}'],
    ['\\mathrm{concat}\\left(\\text{"a\\{b\\}"},\\text{"c"}\\right)', '\\mathrm{concat}\\left({\\text{"a\\{b\\}"}},{\\text{"c"}}\\right)'],
    ['x=\\text{"back\\textbackslash slash"}', 'x={\\text{"back\\textbackslash slash"}}'],
    ['x_{\\text{geo}}\\coloneq 1', 'x_{\\text{geo}}\\coloneq 1'],
  ])('%s', (latex, want) => expect(groupStrings(latex)).toBe(want));

  test('a string after := is drawn in one piece, spaced from the := like a number', () => {
    const html = mathMarkup('x\\mathrel{:=}\\text{"The\\_Earth\\_seen"}');
    expect(html.match(/class="ML__text"/g)).toHaveLength(1);
    expect(html).toMatch(/:=<\/span><span style="display:inline-block;width:0\.28em"><\/span><span class="ML__text">”The_Earth_seen”/);
  });
});
