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
import { emptyWorksheet, loadWorksheet, saveWorksheet } from '../src/format/native.js';
import { sheet } from './helpers.js';

describe('native files', () => {
  test('a saved worksheet loads back the same', () => {
    const ws = emptyWorksheet();
    ws.regions.push({
      id: '1', left: 1, top: 2, alignX: 3, alignY: 4, disabled: false,
      content: { k: 'eval', expr: { k: 'real', v: 2 }, stored: null, unit: null },
    });
    ws.texts.push({ id: '2', left: 0, top: 0, width: 10, height: 10, text: 'note' });
    expect(loadWorksheet(saveWorksheet(ws))).toEqual(ws);
  });

  test('NaN and infinity survive saving', () => {
    const ws = emptyWorksheet();
    ws.regions.push({
      id: '1', left: 0, top: 0, alignX: 0, alignY: 0, disabled: false,
      content: { k: 'eval', expr: { k: 'real', v: 1 }, unit: null, stored: { value: { k: 'num', re: NaN, im: Infinity }, units: [] } },
    });
    const c = loadWorksheet(saveWorksheet(ws)).regions[0]!.content;
    expect(c.k === 'eval' && c.stored?.value).toEqual({ k: 'num', re: NaN, im: Infinity });
  });

  test('drafts are saved as typed', () => {
    const ws = emptyWorksheet();
    ws.regions.push({ id: '1', left: 0, top: 0, alignX: 0, alignY: 0, disabled: false, content: { k: 'draft', latex: '1+', error: 'bad' } });
    expect(loadWorksheet(saveWorksheet(ws)).regions[0]!.content).toEqual({ k: 'draft', latex: '1+', error: 'bad' });
  });

  test('other files are refused', () => {
    expect(() => loadWorksheet('{"a":1}')).toThrow('not a MathMath file');
    expect(() => loadWorksheet('{"format":"mathmath","version":99,"worksheet":{}}')).toThrow('newer version');
  });
});

describe('files from anyone', () => {
  const file = (change: (ws: Record<string, any>) => void): string => {
    const ws = JSON.parse(saveWorksheet({ ...emptyWorksheet(), regions: [{ id: '1', left: 0, top: 0, alignX: 0, alignY: 0, disabled: false, content: { k: 'other', tag: 'x' } }] })) as { worksheet: Record<string, any> };
    change(ws.worksheet);
    return JSON.stringify(ws);
  };
  test('a saved worksheet reads back', () => {
    expect(() => loadWorksheet(file(() => {}))).not.toThrow();
  });
  test('ids, positions and sizes that would go into the page as markup are refused', () => {
    expect(() => loadWorksheet(file((ws) => { ws.regions[0].id = 'x"><style>'; }))).toThrow(/damaged/);
    expect(() => loadWorksheet(file((ws) => { ws.regions[0].left = '1" onload="x'; }))).toThrow(/damaged/);
    expect(() => loadWorksheet(file((ws) => { ws.page.width = '612"'; }))).toThrow(/damaged/);
    expect(() => loadWorksheet(file((ws) => { ws.regions[0].content = { k: 'plot', width: '9" x', height: 1 }; }))).toThrow(/damaged/);
    expect(() => loadWorksheet(file((ws) => { ws.opaque = [{ id: '7', kind: 'picture', left: 0, top: 0, width: 1, height: 1, png: '', mime: 'text/html', xml: null, items: {} }]; }))).toThrow(/damaged/);
    expect(() => loadWorksheet(file((ws) => { ws.regions = {}; }))).toThrow(/damaged/);
  });
});

describe('importing page settings', () => {
  test('a landscape page keeps its size and margins', () => {
    const ws = sheet([]);
    expect(ws.page.width).toBe(612);
    const landscape = sheet([], 'array-origin="0"');
    expect(landscape.origin).toBe(0);
  });
});
