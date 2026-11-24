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
import { runWorksheet } from '../src/engine/evaluate.js';
import { parseSheet } from '../src/cli/corpus.js';

// An invented sheet: math in a text's lines, as the older format keeps it, inside the paragraph it's in.
const nested = (id: number, math: string) =>
  `<region region-id="${id}" left="300" top="${id * 7}" width="20" height="12" align-x="300" align-y="${id * 7 + 8}"><math>${math}</math><rendering item-idref="9"/></region>`;
const xml = `<worksheet xmlns:ml="m"><builtInVariables array-origin="0"/><regions>
  <region region-id="1" left="36" top="20" width="300" height="40" align-x="36" align-y="28"><text use-page-width="false">
\t\t<p style="Normal">Let ${nested(10, '<ml:define><ml:id>a</ml:id><ml:real>3</ml:real></ml:define>')}
\t\t\t<f family="Arial" size="10"><inlineAttr font-weight="normal">so<sp count="2"/>e<sub>M</sub> stays</inlineAttr></f> </p>
\t\t<p style="Normal"/>
\t\t<p style="Normal"><b>Then</b> ${nested(11, '<ml:eval><ml:apply><ml:plus/><ml:id>a</ml:id><ml:real>1</ml:real></ml:apply></ml:eval>')} follows.</p>
  </text></region>
  <region region-id="2" left="36" top="100" align-x="36" align-y="108"><math><ml:eval><ml:apply><ml:mult/><ml:id>a</ml:id><ml:real>2</ml:real></ml:apply></ml:eval></math></region>
</regions></worksheet>`;

test('math in an imported text\'s lines is math in the text: its paragraphs and looks kept, calculated where the text starts', () => {
  const ws = parseSheet(xml);
  const text = ws.texts[0]!;
  expect(text.blocks).toEqual([
    { runs: [{ t: 'Let ' }, { t: '', math: '10' }, { t: 'so  e' }, { t: 'M', script: 'sub' }, { t: ' stays' }] },
    { runs: [] },
    { runs: [{ t: 'Then', bold: true }, { t: ' ' }, { t: '', math: '11' }, { t: ' follows.' }] },
  ]);
  expect(text.text).toBe('Let so  eM stays\n\nThen  follows.');
  // Each math is in the text, once: no copy of it on its own, and none of its text in the words.
  expect(ws.regions.map((r) => [r.id, r.inText ?? null])).toEqual([['10', '1'], ['11', '1'], ['2', null]]);
  expect(ws.regions.find((r) => r.id === '10')!.alignY).toBe(28);
  const values = Object.fromEntries(runWorksheet(ws).map((o) => [o.region.id, o.error?.reason ?? (o.value as { re?: number } | undefined)?.re]));
  expect(values['11']).toBe(4);
  expect(values['2']).toBe(6);
});

test('a text keeps its paragraphs and their looks, colors too, and the Symbol font\'s letters are its Greek', () => {
  const plain = xml.replace(/<region region-id="1[01]"[\s\S]*?<\/region>/g, '')
    .replace('follows.', 'follows <c val="#A31515">in red</c> at <f family="Symbol">l</f> and <f family="Symbol" size="10">Dw</f>.');
  const ws = parseSheet(plain);
  expect(ws.texts[0]!.blocks).toEqual([
    { runs: [{ t: 'Let so  e' }, { t: 'M', script: 'sub' }, { t: ' stays' }] },
    { runs: [] },
    { runs: [{ t: 'Then', bold: true }, { t: ' follows ' }, { t: 'in red', color: '#a31515' }, { t: ' at λ and Δω.' }] },
  ]);
  // Plain paragraphs are lines of words.
  const lines = parseSheet(xml.replace(/<region region-id="1[01]"[\s\S]*?<\/region>/g, '').replace(/<\/?(b|sub)>/g, ''));
  expect(lines.texts[0]!.blocks).toBeUndefined();
  expect(lines.texts[0]!.text).toBe('Let so  eM stays\n\nThen follows.');
});
