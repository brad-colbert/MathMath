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
import { emptyWorksheet, loadWorksheet, saveWorksheet } from '../src/format/native.js';
import { readTex } from '../src/latex/latex.js';
import { autoAxis, textStyleOf } from '../src/model/ast.js';

test('a text style keeps only what Format could have set', () => {
  expect(textStyleOf({ bold: true, italic: true, size: 16, color: '#1c5cab' })).toEqual({ bold: true, italic: true, size: 16, color: '#1c5cab' });
  // From a file anyone could have written: sizes are held in range, and anything else is dropped.
  expect(textStyleOf({ bold: 'yes', size: 4000, color: 'red;background:url(x)', extra: 1 })).toEqual({ size: 48 });
  expect(textStyleOf({ size: -3, color: '#fff' })).toEqual({ size: 6 });
  expect(textStyleOf({ size: Number.NaN })).toEqual({});
  expect(textStyleOf(null)).toEqual({});
  expect(textStyleOf('bold')).toEqual({});
});

test('a saved worksheet keeps text styles and contours below a surface', () => {
  const ws = emptyWorksheet();
  ws.texts = [{ id: 't1', left: 10, top: 10, width: 0, height: 0, text: 'Fields', style: { bold: true, size: 16, color: '#b3261e' } }];
  ws.regions = [{ id: 'p', left: 10, top: 60, alignX: 10, alignY: 60, disabled: false, content: {
    k: 'plot', x: null, ys: [readTex('f'), readTex('P')], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 200, height: 150, view: 'surface', floorContours: true,
  } }];
  const back = loadWorksheet(saveWorksheet(ws));
  expect(back.texts[0]!.style).toEqual({ bold: true, size: 16, color: '#b3261e' });
  expect(back.regions[0]!.content).toMatchObject({ view: 'surface', floorContours: true, ys: [{ k: 'id', name: 'f' }, { k: 'id', name: 'P' }] });
});
