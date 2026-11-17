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

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { convertContent, fileClashes, findConvertible } from '../src/engine/convert.js';
import { runWorksheet } from '../src/engine/evaluate.js';
import { type Files, fileKey } from '../src/engine/files.js';
import { mathcadWrite } from '../src/engine/image.js';
import { type Mat, fromValues, getEl, num } from '../src/engine/values.js';
import { parseWav } from '../src/engine/wav.js';
import { emptyWorksheet } from '../src/format/native.js';
import { regionLatex, readRegion } from '../src/latex/region.js';
import type { Content, Region } from '../src/model/ast.js';

// Convert's MathMath expressions against Mathcad 14's own answers, on the same files (test/files-reference.json).
const REF = JSON.parse(readFileSync(new URL('./files-reference.json', import.meta.url), 'utf8')) as {
  image: number[][]; reads: Record<string, number[][]>; wavs: Record<string, string>; readwav: Record<string, number[][]>;
  readwavRefused: Record<string, string>; getwavinfo: Record<string, number[]>; prn: Record<string, [string, number[][]]>;
  writewav: Record<string, [number, number, number[][], { bits: number; channels: number; rate: number; samples: number[] }]>;
  writeHsv: [number[][], number[][]]; writeHls: [number[], number[]][];
};
const W = REF.image[0]!.length / 3;
const H = REF.image.length;
const rgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) [0, 1, 2].forEach((c) => (rgba[(i * W + j) * 4 + c] = REF.image[i]![j + c * W]!)), (rgba[(i * W + j) * 4 + 3] = 255);
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const audio = new Map(Object.entries(REF.wavs).map(([n, b]) => [`${n}.wav`, parseWav(bytes(b))]));
const tables = new Map(Object.entries(REF.prn).map(([n, [text]]) => [`${n}.prn`, text]));
const FILES: Files = {
  image: (n) => (n === 'c.bmp' ? { width: W, height: H, rgba } : undefined),
  table: (n) => tables.get(n),
  sheet: () => undefined,
  audio: (n) => audio.get(fileKey(n)),
  colormap: () => undefined,
};
const CTX = { origin: 0, audio: (n: string) => audio.get(fileKey(n)), table: (n: string) => tables.get(fileKey(n)) };

/** Converts `fn("C:\\data\\file")=`, runs the converted region on the files, and returns its value and LaTeX. */
function converted(fn: string, file: string, origin = 0): { value: Mat; latex: string } {
  const content = readRegion(`\\mathrm{${fn}}\\left(\\text{"C:\\\\data\\\\${file}"}\\right)=`);
  const out = convertContent(content, { ...CTX, origin });
  expect(out, fn).not.toBeNull();
  const ws = { ...emptyWorksheet(), origin, regions: [{ id: 'a', left: 0, top: 0, alignX: 0, alignY: 0, disabled: false, content: out! } as Region] };
  const [o] = runWorksheet(ws, 'align', FILES);
  expect(o!.error?.reason, fn).toBeUndefined();
  return { value: o!.value as Mat, latex: regionLatex(out!) };
}
function same(m: Mat, want: number[][], what: string, tol = 1e-9): void {
  expect([m.rows, m.cols], what).toEqual([want.length, want[0]!.length]);
  for (let i = 0; i < m.rows; i++) for (let j = 0; j < m.cols; j++) {
    const v = (getEl(m, i, j) as { re: number }).re;
    expect(Math.abs(v - want[i]![j]!) <= tol, `${what} [${i},${j}] ${v} vs ${want[i]![j]}`).toBe(true);
  }
}

describe('Convert gives Mathcad\'s numbers', () => {
  for (const fn of Object.keys(REF.reads)) {
    test(fn, () => same(converted(fn, 'c.bmp').value, REF.reads[fn]!, fn, 1e-9));
  }
  test('READRGB is readImage, the folder dropped', () => {
    const r = converted('READRGB', 'c.bmp');
    expect(r.latex).toContain('\\mathrm{readImage}\\left(\\text{"c.bmp"}\\right)');
    same(r.value, REF.image, 'READRGB');
  });
  test('channels count from the sheet\'s ORIGIN', () => {
    const r = converted('READ_GREEN', 'c.bmp', 1);
    expect(r.latex).toContain(',2\\right)');
    same(r.value, REF.reads.READ_GREEN!, 'READ_GREEN with ORIGIN 1');
  });
  for (const n of Object.keys(REF.readwav)) {
    test(`READWAV of the ${n} file, scaled to Mathcad's samples`, () => same(converted('READWAV', `${n}.wav`).value, REF.readwav[n]!, n, 1e-9));
  }
  for (const [n, want] of Object.entries(REF.getwavinfo)) {
    test(`GETWAVINFO of ${n}`, () => same(converted('GETWAVINFO', `${n}.wav`).value, want.map((x) => [x]), n));
  }
  test('READPRN of a file with one kind of separator', () => same(converted('READPRN', 'p2.prn').value, REF.prn.p2![1], 'p2'));
  test('READPRN of a file mixing commas and spaces waits, since readTable reads it differently', () => {
    expect(findConvertible(readRegion('\\mathrm{READPRN}\\left(\\text{"p1.prn"}\\right)='), CTX)[0]!.cannot).toMatch(/readTable reads p1.prn differently from READPRN/);
  });
  test('READWAV waits for its file, and leaves alone what Mathcad can\'t read either', () => {
    const c = readRegion('x\\coloneq \\mathrm{READWAV}\\left(\\text{"none.wav"}\\right)');
    expect(findConvertible(c, CTX)).toEqual([{ name: 'READWAV', to: 'readWav, scaled', cannot: 'attach none.wav first, to know its bits per sample' }]);
    expect(convertContent(c, CTX)).toBeNull();
    for (const n of Object.keys(REF.readwavRefused)) {
      expect(findConvertible(readRegion(`\\mathrm{READWAV}\\left(\\text{"${n}.wav"}\\right)=`), CTX)[0]!.cannot, n).toMatch(/Mathcad 14 can't read/);
    }
  });
  test('a file name not in quotes, or read from two folders, stays as it is', () => {
    expect(findConvertible(readRegion('\\mathrm{READRGB}\\left(f\\right)='), CTX)[0]!.cannot).toMatch(/isn't written in quotes/);
    const a = readRegion('\\mathrm{READRGB}\\left(\\text{"C:\\\\x\\\\c.bmp"}\\right)=');
    const b = readRegion('\\mathrm{READ\\_RED}\\left(\\text{"D:\\\\y\\\\C.BMP"}\\right)=');
    const clashes = fileClashes([a, b]);
    expect([...clashes]).toEqual(['c.bmp']);
    expect(findConvertible(a, { ...CTX, clashes })[0]!.cannot).toMatch(/from more than one folder/);
    expect(convertContent(a, { ...CTX, clashes: fileClashes([a]) })).not.toBeNull();
  });
  test('calls inside programs, plots and definitions convert; other code is left as it was', () => {
    const c = readRegion('M\\coloneq \\mathrm{READRGB}\\left(\\text{"c.bmp"}\\right)+\\mathrm{mean}\\left(\\mathrm{READ\\_RED}\\left(\\text{"c.bmp"}\\right)\\right)') as Content;
    const out = convertContent(c, CTX)!;
    expect(regionLatex(out)).toBe('M\\coloneq \\mathrm{readImage}\\left(\\text{"c.bmp"}\\right)+\\mathrm{mean}\\left(\\mathrm{imageChannels}\\left(\\mathrm{readImage}\\left(\\text{"c.bmp"}\\right),0\\right)\\right)');
  });
});

describe('Mathcad\'s writes, as Mathcad 14 writes them', () => {
  for (const [n, [rate, bits, rows, want]] of Object.entries(REF.writewav)) {
    test(`WRITEWAV ${n}`, () => {
      const items = []; for (let j = 0; j < rows[0]!.length; j++) for (let i = 0; i < rows.length; i++) items.push(num(rows[i]![j]!));
      const w = mathcadWrite('WRITEWAV', `C:\\x\\${n}.wav`, fromValues(rows.length, rows[0]!.length, items), [rate, bits]);
      expect(w.name).toBe(`${n}.wav`);
      const v = new DataView(w.bytes!.buffer);
      expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([want.channels, want.rate, want.bits]);
      const width = bits <= 8 ? 1 : 2;
      const got = Array.from({ length: v.getUint32(42, true) / width }, (_, k) => (width === 1 ? v.getUint8(46 + k) : v.getInt16(46 + 2 * k, true)));
      expect(got).toEqual(want.samples);
    });
  }
  test('WRITEWAV refuses more than 16 bits, as Mathcad does', () => {
    expect(() => mathcadWrite('WRITEWAV', 'a.wav', fromValues(1, 1, [num(1)]), [8000, 24])).toThrow(/between 1 and 16/);
  });
  const pixel = (w: ReturnType<typeof mathcadWrite>, i: number, j: number) => Array.from(w.image!.rgba.slice((i * w.image!.width + j) * 4, (i * w.image!.width + j) * 4 + 3));
  const packed = (rows: number[][]) => { const items = []; for (let j = 0; j < rows[0]!.length; j++) for (let i = 0; i < rows.length; i++) items.push(num(rows[i]![j]!)); return fromValues(rows.length, rows[0]!.length, items); };
  test('WRITE_HSV', () => {
    const w = mathcadWrite('WRITE_HSV', 'v.bmp', packed(REF.writeHsv[0]));
    const want = REF.writeHsv[1];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(pixel(w, i, j), `${i},${j}`).toEqual([want[i]![j]!, want[i]![j + 3]!, want[i]![j + 6]!]);
  });
  test('WRITE_HLS', () => {
    for (const [hls, rgb] of REF.writeHls) expect(pixel(mathcadWrite('WRITE_HLS', 'h.bmp', packed([hls])), 0, 0), String(hls)).toEqual(rgb);
  });
});
