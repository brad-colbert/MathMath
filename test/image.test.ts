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
import { makeBuiltins } from '../src/engine/builtins.js';
import { runWorksheet } from '../src/engine/evaluate.js';
import { bayer, pixels } from '../src/engine/image.js';
import { type Mat, type Num, type Value, fromValues, newMat, num, str } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion, regionLatex } from '../src/latex/region.js';
import ref from './image-reference.json' with { type: 'json' };

// The expected values are SciPy's and Python's answers on invented images, from test/image-reference.py.
const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Value => B.get(fn)!.call(args);
/** A matrix from rows of values. */
const mat = (rows: number[][]): Mat => {
  const m = newMat(rows.length, rows[0]!.length);
  rows.forEach((r, i) => r.forEach((v, j) => (m.re[i + j * rows.length] = v)));
  return m;
};
const rowsOf = (v: Value): number[][] => {
  const m = v as Mat;
  return Array.from({ length: m.rows }, (_, i) => Array.from({ length: m.cols }, (_, j) => m.re[i + j * m.rows]!));
};
const close = (got: Value, want: number[][], tol = 1e-9) => {
  const g = rowsOf(got);
  expect([g.length, g[0]!.length]).toEqual([want.length, want[0]!.length]);
  g.forEach((r, i) => r.forEach((v, j) => expect(Math.abs(v - want[i]![j]!)).toBeLessThan(tol)));
};
const M = mat(ref.M);
const color = fromValues(3, 1, [mat(ref.R), mat(ref.G), mat(ref.B)]);
const side = (() => {
  const m = newMat(ref.R.length, ref.R[0]!.length * 3);
  [ref.R, ref.G, ref.B].forEach((c, k) => m.re.set(mat(c).re, k * mat(c).re.length));
  return m;
})();

describe('filters, as SciPy ndimage with the edge continued', () => {
  test('convolve2d flips the kernel, as convolve does', () => close(call('convolve2d', M, mat(ref.K)), ref.convolve2d));
  test('gaussianBlur', () => {
    close(call('gaussianBlur', M, num(1)), ref.gaussian1);
    close(call('gaussianBlur', M, num(0.6)), ref['gaussian0.6']);
    close(call('gaussianBlur', M, num(0)), ref.M);
  });
  test('boxBlur and medianFilter', () => {
    close(call('boxBlur', M, num(3)), ref.box3);
    close(call('medianFilter', M, num(3)), ref.median3);
  });
  test('erode and dilate', () => {
    close(call('erode', M, num(3)), ref.erode3);
    close(call('dilate', M, num(5)), ref.dilate5);
  });
  test('sobelEdges is the gradient magnitude', () => close(call('sobelEdges', M), ref.sobel));
  test('sharpen adds back the difference from a blur', () => {
    const blur = rowsOf(call('gaussianBlur', M, num(1)));
    close(call('sharpen', M, num(0.5)), ref.M.map((r, i) => r.map((v, j) => v + 0.5 * (v - blur[i]![j]!))));
  });
  test('sizes must be odd, with a center', () => {
    expect(() => call('medianFilter', M, num(4))).toThrow(/odd whole number/);
    expect(() => call('convolve2d', M, mat([[1, 1]]))).toThrow(/odd number of rows and columns/);
  });
});

describe('geometry', () => {
  test('rotateImage turns about the center, as SciPy rotate with order 1', () => {
    close(call('rotateImage', M, num((30 * Math.PI) / 180)), ref.rotate30, 1e-8);
    close(call('rotateImage', M, num((-75 * Math.PI) / 180)), ref['rotate-75'], 1e-8);
  });
  test('rotate90 and the flips, as NumPy', () => {
    close(call('rotate90', M), ref.rot90_1);
    close(call('rotate90', M, num(3)), ref.rot90_3);
    close(call('rotate90', M, num(-1)), ref.rot90_3);
    close(call('flipRows', M), ref.flipud);
    close(call('flipCols', M), ref.fliplr);
  });
  test('resizeImage keeps a constant, a ramp, and the same size', () => {
    const flat = mat(Array.from({ length: 6 }, () => new Array(8).fill(77)));
    close(call('resizeImage', flat, num(13), num(3)), Array.from({ length: 13 }, () => new Array(3).fill(77)));
    close(call('resizeImage', M, num(7), num(9)), ref.M);
    // A ramp along the columns, enlarged: the middle stays a ramp of the same slope per output pixel.
    const ramp = mat([Array.from({ length: 8 }, (_, j) => 10 * j)]);
    const big = rowsOf(call('resizeImage', ramp, num(1), num(16)))[0]!;
    for (let j = 2; j < 13; j++) expect(big[j + 1]! - big[j]!).toBeCloseTo(5, 9);
    // Halving averages: the mean stays.
    const small = rowsOf(call('resizeImage', M, num(4), num(5)));
    const mean = (r: number[][]) => r.flat().reduce((s, v) => s + v, 0) / r.flat().length;
    expect(Math.abs(mean(small) - mean(ref.M)) / mean(ref.M)).toBeLessThan(0.03);
  });
});

describe('color', () => {
  test('imageChannels splits side-by-side blocks into (R; G; B), and joinChannels puts them back', () => {
    const c = call('imageChannels', side) as Mat;
    expect(c.cells?.length).toBe(3);
    close(c.cells![1]!, ref.G);
    close(call('joinChannels', c), rowsOf(side));
    close(call('joinChannels', mat(ref.R), mat(ref.G), mat(ref.B)), rowsOf(side));
  });
  test('imageChannels does what a hand-written split with submatrix does', () => {
    // The usual sheet program: n := cols(M)/3, then submatrix(M, 0, rows−1, k·n, (k+1)·n − 1).
    const n = side.cols / 3;
    const c = call('imageChannels', side) as Mat;
    [0, 1, 2].forEach((k) => close(c.cells![k]!, rowsOf(call('submatrix', side, num(0), num(side.rows - 1), num(k * n), num((k + 1) * n - 1)))));
  });
  test('toGray uses Rec. 601 weights, from either form', () => {
    close(call('toGray', color), ref.gray);
    close(call('toGray', side), ref.gray);
  });
  test('rgbToHsv and back, each part 0 to 255, as colorsys scaled', () => {
    const hsv = call('rgbToHsv', color) as Mat;
    close(hsv.cells![0]!, ref.H, 1e-9);
    close(hsv.cells![1]!, ref.S, 1e-9);
    close(hsv.cells![2]!, ref.V, 1e-9);
    const back = call('hsvToRgb', hsv) as Mat;
    close(back.cells![0]!, ref.R, 1e-9);
    close(back.cells![2]!, ref.B, 1e-9);
    // Side by side in, side by side out.
    expect((call('rgbToHsv', side) as Mat).cols).toBe(side.cols);
  });
  test('filters work on each channel of a color image', () => {
    const blurred = call('gaussianBlur', color, num(1)) as Mat;
    close(blurred.cells![0]!, ref.gaussian1);
  });
});

describe('tone', () => {
  test('threshold, levels and gammaAdjust', () => {
    close(call('threshold', M, num(128)), ref.M.map((r) => r.map((v) => (v >= 128 ? 255 : 0))));
    close(call('levels', M, num(50), num(200)), ref.M.map((r) => r.map((v) => Math.min(255, Math.max(0, ((v - 50) / 150) * 255)))));
    close(call('gammaAdjust', M, num(0.5)), ref.M.map((r) => r.map((v) => 255 * Math.sqrt(v / 255))));
  });
  test('equalize spreads a narrow range over 0 to 255, keeping the order', () => {
    const narrow = mat([[100, 101, 102, 103], [104, 105, 106, 107]]);
    const e = rowsOf(call('equalize', narrow)).flat();
    expect(Math.min(...e)).toBe(0);
    expect(Math.max(...e)).toBe(255);
    // Stored column by column: 100, 104, 101, 105, … A brighter input never comes out darker.
    const input = rowsOf(narrow).flat();
    for (let a = 0; a < e.length; a++) for (let b = 0; b < e.length; b++) if (input[a]! < input[b]!) expect(e[a]!).toBeLessThan(e[b]!);
  });
  test('image functions take plain numbers', () => {
    const metres = { ...M, dim: [1, 0, 0, 0, 0, 0, 0] };
    expect(() => call('gaussianBlur', metres, num(1))).toThrow(/plain numbers/);
  });
});

describe('dithering', () => {
  test('error diffusion, as a plain Python loop does it', () => {
    close(call('ditherFloydSteinberg', M, num(2)), ref.fs2);
    close(call('ditherFloydSteinberg', M, num(4)), ref.fs4);
    close(call('ditherAtkinson', M, num(2)), ref.atkinson2);
    close(call('ditherJarvis', M, num(3)), ref.jarvis3);
  });
  test('the Bayer matrices', () => {
    expect(bayer(2)).toEqual([[0, 2], [3, 1]]);
    expect(bayer(4)).toEqual([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]);
    expect(bayer(8).flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, k) => k));
  });
  test('on a smooth gradient: only the levels asked for, and the same brightness overall', () => {
    const ramp = mat(Array.from({ length: 32 }, (_, i) => Array.from({ length: 64 }, (_, j) => (j * 255) / 63)));
    const mean = (v: Value) => rowsOf(v).flat().reduce((s, x) => s + x, 0) / (32 * 64);
    for (const fn of ['ditherFloydSteinberg', 'ditherAtkinson', 'ditherJarvis', 'ditherOrdered']) {
      for (const levels of [2, 4]) {
        const d = call(fn, ramp, num(levels));
        expect(new Set(rowsOf(d).flat()).size).toBeLessThanOrEqual(levels);
        // Atkinson drops a quarter of the error by design, so it drifts more at the extremes.
        expect(Math.abs(mean(d) - mean(ramp)) / 255).toBeLessThan(fn === 'ditherAtkinson' ? 0.03 : 0.01);
      }
    }
  });
  test('levels must be 2 to 256', () => {
    expect(() => call('ditherFloydSteinberg', M, num(1))).toThrow(/from 2/);
    expect(() => call('ditherOrdered', M, num(2), num(3))).toThrow(/2, 4, 8 or 16/);
  });
});

describe('writing and showing', () => {
  test('writeImage hands the region its pixels, and gives back the matrix', () => {
    const wrote: { name: string; w: number; h: number; first: number[] }[] = [];
    const W = makeBuiltins(0, undefined, { wrote: ({ name, image: img }) => wrote.push({ name, w: img!.width, h: img!.height, first: [...img!.rgba.slice(0, 4)] }) });
    const small = mat([[10, 20, 30], [40, 50, 60]]);
    expect(W.get('writeImage')!.call([str('out.png'), small])).toBe(small);
    expect(wrote).toEqual([{ name: 'out.png', w: 3, h: 2, first: [10, 10, 10, 255] }]);
    W.get('writeImage')!.call([str('c.jpg'), fromValues(3, 1, [mat([[255]]), mat([[128]]), mat([[0]])])]);
    expect(wrote[1]!.first).toEqual([255, 128, 0, 255]);
    expect(() => W.get('writeImage')!.call([str('C:/out.png'), small])).toThrow(/not a folder path/);
    expect(() => W.get('writeImage')!.call([str('out.gif'), small])).toThrow(/\.png, \.jpg or \.webp/);
  });
  test('a region that writes keeps the file with its outcome', () => {
    const ws = emptyWorksheet();
    ws.regions = ['M\\coloneq \\begin{pmatrix}0&255\\end{pmatrix}', 'w\\coloneq \\mathrm{writeImage}\\left(\\text{"a.png"},M\\right)', 'M='].map((l, i) => ({
      id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l),
    }));
    const out = runWorksheet(ws);
    expect(out[1]!.files?.map((f) => [f.name, f.image!.width, f.image!.height])).toEqual([['a.png', 2, 1]]);
    expect(out[0]!.files).toBeUndefined();
    expect(out[2]!.files).toBeUndefined();
  });
  test('fit stretches the matrix over black to white, and false color uses the blue ramp', () => {
    const m = mat([[-1, 0, 1]]);
    expect([...pixels(m, 'gray', { fit: true }).rgba].filter((_, k) => k % 4 === 0)).toEqual([0, 128, 255]);
    const fc = pixels(mat([[0, 255]]), 'gray', { falseColor: true }).rgba;
    expect([...fc.slice(0, 3)]).toEqual([0xcd, 0xe2, 0xfb]);
    expect([...fc.slice(4, 7)]).toEqual([0x0d, 0x36, 0x6b]);
  });
});

describe("Mathcad's file writes, WRITEBMP(\"name\") := M", () => {
  const run = (...lines: string[]) => {
    const ws = emptyWorksheet();
    ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
    return runWorksheet(ws);
  };
  const M = 'M\\coloneq \\begin{pmatrix}0&255\\\\128&64\\end{pmatrix}';
  test('WRITEBMP offers a gray image, named without its folder', () => {
    const out = run(M, '\\mathrm{WRITEBMP}\\left(\\text{"C:\\textbackslash data\\textbackslash a b.bmp"}\\right)\\coloneq M');
    const f = out[1]!.files![0]!;
    expect([f.name, f.image!.width, f.image!.height, [...f.image!.rgba.slice(0, 8)]]).toEqual(['a b.bmp', 2, 2, [0, 0, 0, 255, 255, 255, 255, 255]]);
  });
  test('WRITERGB reads its matrix as red, green and blue side by side', () => {
    const f = run('C\\coloneq \\begin{pmatrix}255&0&9\\end{pmatrix}', '\\mathrm{WRITERGB}\\left(\\text{"red.gif"}\\right)\\coloneq C')[1]!.files![0]!;
    expect([f.image!.width, [...f.image!.rgba]]).toEqual([1, [255, 0, 9, 255]]);
  });
  test('WRITEPRN writes numbers as Mathcad does: 4 figures, right-aligned in columns of 8', () => {
    const f = run(M, '\\mathrm{WRITEPRN}\\left(\\text{"d.prn"}\\right)\\coloneq M\\cdot 1.23456')[1]!.files![0]!;
    expect(f).toEqual({ name: 'd.prn', text: '       0   314.8\r\n     158   79.01\r\n' });
  });
  test('the name keeps its spaces through the text form, and the write is undone by a definition of its own', () => {
    const typed = '\\mathrm{WRITEBMP}\\left(\\text{"my picture.bmp"}\\right)\\coloneq M';
    const region = readRegion(typed);
    expect(region).toMatchObject({ k: 'define', target: { k: 'fn', name: 'WRITEBMP', params: ['my picture.bmp'] } });
    expect(regionLatex(region)).toBe(typed);
    // A sheet that defines a function named WRITEPRN gets its own function, not a file.
    const own = run('\\mathrm{WRITEPRN}\\left(x\\right)\\coloneq x+1', '\\mathrm{WRITEPRN}\\left(2\\right)=');
    expect((own[1]!.value as Num).re).toBe(3);
  });
  test("Mathcad's other file writes say they aren't carried out", () => {
    const ws = emptyWorksheet();
    ws.regions = [{ id: 'r', left: 0, top: 0, alignX: 0, alignY: 8, disabled: false, content: { k: 'define', target: { k: 'fn', name: 'APPENDPRN', params: ['log.prn'], file: true }, value: { k: 'real', v: 1 }, global: false, stored: null, unit: null, shown: false } }];
    expect(runWorksheet(ws)[0]!.error).toMatchObject({ kind: 'mathcad', reason: expect.stringMatching(/not APPENDPRN/) });
  });
  test('what a write refuses', () => {
    expect(run('\\mathrm{WRITERGB}\\left(\\text{"a.bmp"}\\right)\\coloneq \\begin{pmatrix}1&2\\end{pmatrix}')[0]!.error?.reason).toMatch(/three equal blocks/);
    expect(run('\\mathrm{WRITEPRN}\\left(\\text{"a.prn"}\\right)\\coloneq \\begin{pmatrix}1\\mathrm{i}\\end{pmatrix}')[0]!.error?.reason).toMatch(/real numbers only/);
  });
});

