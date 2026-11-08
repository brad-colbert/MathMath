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

// Proves that saving loses nothing, and that all math survives the editor's text form. Both run the
// real scoreboard afterwards: keeping the meaning is what counts. Reads a private folder; see corpus.ts.
import { parseArgs } from 'node:util';
import { loadWorksheet, saveWorksheet } from '../format/native.js';
import { isEditable, readRegion, regionLatex } from '../latex/region.js';
import type { Content, Worksheet } from '../model/ast.js';
import { type SheetScore, scoreSheet, selfContained } from '../score/sheet.js';
import { corpusFolder, readSheets } from './corpus.js';

const { values: opts } = parseArgs({ options: { corpus: { type: 'string' }, all: { type: 'boolean', default: false } } });

const same = (c: Content): string => JSON.stringify(c, (key, v) => {
  if (key === 'stored' || key === 'shown' || key === 'unit' || key === 'format') return undefined;
  return v?.k === 'block' && v.body.length === 1 ? v.body[0] : v;
});

const totals = { sheets: 0, baseline: 0, saved: 0, text: 0, scored: 0, bytes: 0, regions: 0, kept: 0, locked: 0, opaque: 0, texts: 0 };
const problems = new Map<string, number>();
const bump = (k: string): void => void problems.set(k, (problems.get(k) ?? 0) + 1);

function viaText(ws: Worksheet): Worksheet {
  const copy = structuredClone(ws);
  for (const r of copy.regions) {
    const c = r.content;
    if (c.k !== 'define' && c.k !== 'eval' && c.k !== 'show') continue;
    totals.regions++;
    if (!isEditable(c)) {
      totals.locked++;
      continue;
    }
    try {
      const back = readRegion(regionLatex(c));
      if (same(back) === same(c)) totals.kept++;
      else {
        const [x, y] = [same(c), same(back)];
        let i = 0;
        while (x[i] === y[i]) i++;
        bump(`differs: ...${x.slice(Math.max(0, i - 40), i + 50)} / ...${y.slice(Math.max(0, i - 40), i + 50)}`);
      }
      r.content = c.k === 'show' ? back : ({ ...back, stored: c.stored, unit: c.unit } as Content);
      if (c.k === 'define' && r.content.k === 'define') r.content.shown = c.shown;
    } catch (err) {
      bump(`unreadable: ${(err as Error).message}`);
    }
  }
  return copy;
}

const agree = (a: SheetScore, b: SheetScore): boolean => a.match === b.match && a.mismatch === b.mismatch && a.error === b.error;

for (const { path, xml, ws } of readSheets(corpusFolder(opts.corpus))) {
  if (!opts.all && !selfContained(ws, xml)) continue;
  totals.sheets++;
  totals.opaque += ws.opaque.length;
  totals.texts += ws.texts.length;
  const base = scoreSheet(ws);
  const file = saveWorksheet(ws);
  totals.bytes += file.length;
  const loaded = loadWorksheet(file);
  const saved = scoreSheet(loaded);
  const text = scoreSheet(viaText(ws));
  totals.baseline += base.match;
  totals.saved += saved.match;
  totals.text += text.match;
  totals.scored += base.match + base.mismatch + base.error + base.excluded;
  if (!agree(base, saved)) bump(`save changed the score: ${path}`);
  if (!agree(base, text)) bump(`text form changed the score: ${path}`);
  if (saveWorksheet(loaded) !== file) bump(`save is not stable: ${path}`);
}

console.log(`${totals.sheets} sheets, ${(totals.bytes / 1e6).toFixed(1)} MB as native files, ${totals.texts} text and ${totals.opaque} opaque regions kept`);
console.log(`Answers: ${totals.baseline}/${totals.scored} directly, ${totals.saved} after save and load, ${totals.text} through the text form`);
console.log(`Regions through the text form: ${totals.kept}/${totals.regions} identical, ${totals.locked} locked`);
for (const [k, n] of [...problems].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${String(n).padStart(5)}  ${k}`);
