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

import { expect, test } from 'vitest';
import { DEFAULT_PAGE, onPaper, paperOf } from '../src/model/ast.js';

test('paper sizes, either way up', () => {
  expect(paperOf(DEFAULT_PAGE)).toBe('Letter');
  const a4 = onPaper(DEFAULT_PAGE, 'A4');
  expect(a4).toEqual({ ...DEFAULT_PAGE, width: 595.28, height: 841.89 });
  expect(paperOf(a4)).toBe('A4');
  const sideways = onPaper({ ...DEFAULT_PAGE, landscape: true, width: 792, height: 612 }, 'Legal');
  expect(sideways).toMatchObject({ landscape: true, width: 1008, height: 612 });
  expect(paperOf(sideways)).toBe('Legal');
  // A4 as imported files give it, in whole points, is still A4; another size is none of them.
  expect(paperOf({ ...DEFAULT_PAGE, width: 595, height: 842 })).toBe('A4');
  expect(paperOf({ ...DEFAULT_PAGE, width: 500, height: 700 })).toBeNull();
});
