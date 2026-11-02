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

describe('importing page settings', () => {
  test('a landscape page keeps its size and margins', () => {
    const ws = sheet([]);
    expect(ws.page.width).toBe(612);
    const landscape = sheet([], 'array-origin="0"');
    expect(landscape.origin).toBe(0);
  });
});
