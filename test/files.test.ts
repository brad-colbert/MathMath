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

import { gzipSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import { type Files, NO_FILES, sheetKey } from '../src/engine/files.js';
import { parseTable } from '../src/engine/table.js';
import { type Mat, type Value, getEl } from '../src/engine/values.js';
import type { Worksheet } from '../src/model/ast.js';
import { gunzip, inflateRaw } from '../src/xmcd/inflate.js';
import { type XElement, importWorksheet } from '../src/xmcd/import.js';
import { call, define, evaluate, id, op, real, sheet } from './helpers.js';

const cell = (m: Value, i: number, j: number): Value => getEl(m as Mat, i, j);

describe('gzip', () => {
  test('reads what zlib writes, at every compression level', () => {
    const text = 'Data\\Tables\\example.csv '.repeat(40) + Array.from({ length: 300 }, (_, i) => String.fromCharCode(32 + ((i * 7) % 90))).join('');
    for (const level of [0, 1, 6, 9]) {
      const out = gunzip(gzipSync(Buffer.from(text), { level }));
      expect(Buffer.from(out).toString()).toBe(text);
    }
  });

  test('stops on damaged data rather than reading past it', () => {
    const z = gzipSync(Buffer.from('x'.repeat(500)));
    expect(() => inflateRaw(z.subarray(10, 13))).toThrow();
  });
});

describe('tables from text', () => {
  test('commas, tabs or spaces, with exponents', () => {
    for (const text of ['1,2.5\r\n3,1.0E-05\r\n', '1\t2.5\n3\t1.0E-05\n', '  1   2.5\n3 1.0e-005\n']) {
      const m = parseTable(text) as Mat;
      expect([m.rows, m.cols, m.cells]).toEqual([2, 2, null]);
      expect([...m.re]).toEqual([1, 3, 2.5, 1e-5]);
    }
  });

  test('words stay as strings, and an empty cell is 0, as Mathcad reads it', () => {
    const m = parseTable('id,name,mag\n1,"Sol, the Sun",-26.7\n2,,4.8\n');
    expect(cell(m, 0, 1)).toEqual({ t: 'str', v: 'name' });
    expect(cell(m, 1, 1)).toEqual({ t: 'str', v: 'Sol, the Sun' });
    expect(cell(m, 1, 2)).toMatchObject({ t: 'num', re: -26.7 });
    expect(cell(m, 2, 1)).toMatchObject({ t: 'num', re: 0 });
  });

  test('short rows are padded', () => {
    const m = parseTable('1 2 3\n4\n') as Mat;
    expect([m.rows, m.cols]).toEqual([2, 3]);
    expect(m.re[3]).toBe(0);
  });
});

/** A sheet with one data-reading component, its file path stored as Mathcad stores it. */
function componentSheet(path: string, wide: boolean, clsid: string): Worksheet {
  const bytes = wide ? Buffer.from(`\0\0${path}\0\0`, 'utf16le') : Buffer.from(`\x01\x02${path}\x00`, 'latin1');
  const blob = gzipSync(Buffer.concat([Buffer.from('mcObject CVSEqItem '), bytes, Buffer.from(' tail')])).toString('base64');
  const xml = `<worksheet xmlns:ml="m"><builtInVariables array-origin="0"/><regions>
    <region region-id="1" left="0" top="0" align-x="5" align-y="8"><component clsid-buddy="${clsid}" item-idref="2" disable-calc="false">
      <inputs/><outputs><ml:id>D</ml:id></outputs></component><rendering item-idref="3"/></region>
    <region region-id="4" left="0" top="20" align-x="0" align-y="20"><math><ml:eval><ml:apply><ml:indexer/><ml:id>D</ml:id><ml:sequence><ml:real>1</ml:real><ml:real>1</ml:real></ml:sequence></ml:apply></ml:eval></math></region>
    </regions><binaryContent><item item-id="2" content-encoding="gzip">${blob}</item></binaryContent></worksheet>`;
  return importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
}

const withTable = (name: string, text: string): Files => ({ ...NO_FILES, table: (n) => (n === name ? text : undefined) });

describe("Mathcad's data-reading components", () => {
  test('become a readTable definition that shows only the file name', () => {
    for (const [wide, clsid] of [[true, '01350083-1122-11DB-9380-000D56C6051A'], [false, '577d93c8-ea65-4d05-b631-401168b146e4']] as const) {
      const ws = componentSheet('C:\\Users\\someone\\Data\\Tables\\example.csv', wide, clsid);
      const c = ws.regions[0]!.content;
      expect(c).toMatchObject({ k: 'define', target: { name: 'D' }, value: { k: 'call', args: [{ k: 'str', v: 'example.csv' }] } });
      expect([ws.regions[0]!.alignX, ws.regions[0]!.alignY]).toEqual([5, 8]);
    }
  });

  test('read the attached file, and say so when it is missing', () => {
    const ws = componentSheet('Data\\example.csv', true, '01350083-1122-11DB-9380-000D56C6051A');
    expect(runWorksheet(ws, 'align', withTable('example.csv', '1,2\n3,4\n'))[1]!.value).toMatchObject({ re: 4 });
    const missing = runWorksheet(ws);
    expect(missing[0]!.error).toMatchObject({ kind: 'needs-file' });
    expect(missing[0]!.error!.reason).toContain('Files');
    expect(missing[1]!.error?.kind).toBe('needs-file');
  });

  test('readTable refuses folder paths and spreadsheets', () => {
    const run = (name: string) => runWorksheet(sheet([evaluate(call('readTable', `<ml:str>${name}</ml:str>`))]))[0]!.error!.reason;
    expect(run('C:\\data\\a.csv')).toContain('not a folder path');
    expect(run('a.xls')).toContain('attached');
  });
});

describe('references', () => {
  const other = sheet([define(id('g'), real(9.8)), define(id('h'), op('mult', real(2), id('g')))]);
  const files: Files = { ...NO_FILES, sheet: (k) => (k === 'physics' ? other : undefined) };
  const refSheet = (href: string, ...after: string[]): Worksheet => sheet([
    `<reference><originRef href="${href}"/></reference>`,
    ...after,
  ]);

  test('import as the file name alone', () => {
    expect(refSheet('\\\\server\\share\\Physics.mcd').regions[0]!.content).toEqual({ k: 'include', file: 'Physics.mcd' });
    expect(sheetKey('Physics.mcd')).toBe(sheetKey('physics.xmcd'));
    const converted = sheet(['<reference><originRef/></reference><link href="./Physics.mcd"/>']);
    expect(converted.regions[0]!.content).toEqual({ k: 'include', file: 'Physics.mcd' });
  });

  test("make the other sheet's definitions hold from there on, without showing its results", () => {
    const out = runWorksheet(refSheet('C:\\x\\Physics.mcd', evaluate(id('h'))), 'align', files);
    expect(out.map((o) => o.region.content.k)).toEqual(['include', 'eval']);
    expect(out[1]!.value).toMatchObject({ re: 19.6 });
  });

  test('a missing sheet is a file to load, and its definitions are undefined', () => {
    const out = runWorksheet(refSheet('C:\\x\\Physics.mcd', evaluate(id('h'))));
    expect(out[0]!.error).toMatchObject({ kind: 'needs-file' });
    expect(out[1]!.error?.kind).toBe('undefined');
  });

  test('a sheet that includes itself stops with a message', () => {
    const loop = refSheet('Loop.xmcd');
    const out = runWorksheet(loop, 'align', { ...NO_FILES, sheet: (k) => (k === 'loop' ? loop : undefined) });
    expect(out[0]!.error!.reason).toContain('includes itself');
  });
});

describe('what a reference still needs', () => {
  test('files its sheet needs, here or further in, are listed on the reference', () => {
    const inner = sheet([define(id('d'), call('readTable', '<ml:str>inner.csv</ml:str>'))]);
    const outer = sheet([`<reference><originRef href="Inner.xmcd"/></reference>`, `<reference><originRef href="Missing.xmcd"/></reference>`, define(id('k'), real(2))]);
    const files: Files = { ...NO_FILES, sheet: (k) => ({ inner, outer } as Record<string, Worksheet>)[k] };
    const top = sheet([`<reference><originRef href="Outer.mcd"/></reference>`, evaluate(id('k'))]);
    const out = runWorksheet(top, 'align', files);
    expect(out[0]!.error).toMatchObject({ kind: 'needs-file', needs: ['inner.csv', 'Missing.xmcd'] });
    expect(out[0]!.error!.reason).toContain('Outer.mcd is attached, but it needs inner.csv and Missing.xmcd too');
    expect(out[1]!.value).toMatchObject({ re: 2 });
  });
});
