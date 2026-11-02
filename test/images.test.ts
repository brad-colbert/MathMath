import { describe, expect, test } from 'vitest';
import { Evaluator, Scope, pixels } from '../src/engine/evaluate.js';
import { type Mat, fromValues, num, str } from '../src/engine/values.js';
import { translateFunction } from '../src/xmcd/names.js';
import { runWorksheet } from '../src/engine/evaluate.js';
import { call, math, sheet, stat } from './helpers.js';

const matrix = (rows: number, cols: number, values: number[]): Mat => fromValues(rows, cols, values.map((v) => num(v)));

describe('matrices as images', () => {
  test('gray levels', () => {
    const p = pixels(matrix(1, 2, [0, 200]), 'gray');
    expect([p.width, p.height]).toEqual([2, 1]);
    expect([...p.rgba]).toEqual([0, 0, 0, 255, 200, 200, 200, 255]);
  });

  test('color from three blocks side by side', () => {
    const p = pixels(matrix(1, 3, [10, 20, 30]), 'rgb');
    expect([...p.rgba]).toEqual([10, 20, 30, 255]);
  });

  test('values outside 0 to 255 are clipped, as on screen', () => {
    expect([...pixels(matrix(1, 1, [340]), 'gray').rgba].slice(0, 3)).toEqual([255, 255, 255]);
  });

  test('three matrices in a vector are red, green and blue', () => {
    const trio = fromValues(3, 1, [matrix(1, 1, [10]), matrix(1, 1, [20]), matrix(1, 1, [30])]);
    expect([...pixels(trio, 'gray').rgba]).toEqual([10, 20, 30, 255]);
  });

  test('color needs three equal blocks', () => {
    expect(() => pixels(matrix(1, 2, [1, 2]), 'rgb')).toThrow('three equal blocks');
  });
});

describe('reading images', () => {
  const tiny = { width: 2, height: 1, rgba: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 255, 255]) };
  const files = { image: (name: string) => (name === 'tiny.png' ? tiny : undefined) };
  const ev = new Evaluator({ origin: 0, tol: 0.001 }, files);
  const read = (path: string) => ev.eval({ k: 'call', fn: { k: 'id', name: 'readImage' }, args: [{ k: 'str', v: path }] }, new Scope(null)) as Mat;

  test('an image is red, green and blue blocks side by side', () => {
    const m = read('tiny.png');
    expect([m.rows, m.cols]).toEqual([1, 6]);
    expect([...m.re]).toEqual([255, 0, 0, 0, 0, 255]);
  });

  test('file names are matched without regard to case', () => {
    expect(read('Tiny.PNG').cols).toBe(6);
  });

  test('a folder path is refused, since nothing can be read from one', () => {
    expect(() => read('Z:\\home\\someone\\tiny.png')).toThrow('not a folder path');
  });

  test('a missing file says which one to attach', () => {
    expect(() => read('other.jpg')).toThrow("other.jpg isn't attached");
  });

  test('a file name must be a string', () => {
    expect(() => ev.eval({ k: 'call', fn: { k: 'id', name: 'readImage' }, args: [{ k: 'real', v: 1 }] }, new Scope(null))).toThrow('in quotes');
    void str;
  });
});

describe('importing picture viewers', () => {
  test('a viewer component becomes an image region showing its input', () => {
    const viewer = '<component clsid-buddy="01350071-1122-11DB-9380-000D56C6051A"><inputs><ml:id>M</ml:id></inputs><outputs/></component>';
    const ws = sheet([viewer]);
    const c = ws.regions[0]?.content;
    expect(c).toMatchObject({ k: 'image', expr: { k: 'id', name: 'M' }, mode: 'gray' });
    expect(ws.opaque).toEqual([]);
  });

  test('other components stay as they were', () => {
    const ws = sheet(['<component clsid-buddy="00000000-0000-0000-0000-000000000000"><inputs/><outputs/></component>']);
    expect(ws.opaque[0]?.kind).toBe('component');
  });
});

describe('Mathcad file functions', () => {
  test('keep their names on import', () => {
    expect(translateFunction('READRGB')).toBe('READRGB');
    const c = sheet([math(`<ml:eval>${call('READRGB', '<ml:str>a.jpg</ml:str>')}</ml:eval>`)]).regions[0]!.content;
    expect(c.k === 'eval' && c.expr.k === 'call' && c.expr.fn.k === 'id' && c.expr.fn.name).toBe('READRGB');
    void stat;
  });

  test('say how to replace them, and so does anything that depends on them', () => {
    const out = runWorksheet(sheet([
      math(`<ml:define><ml:id>I</ml:id>${call('READRGB', '<ml:str>Z:\\a.jpg</ml:str>')}</ml:define>`),
      math('<ml:eval><ml:id>I</ml:id></ml:eval>'),
    ]));
    expect(out[0]!.error).toMatchObject({ kind: 'mathcad' });
    expect(out[0]!.error!.reason).toContain('Files');
    expect(out[1]!.error?.kind).toBe('mathcad');
  });
});
