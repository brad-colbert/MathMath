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

/**
 * Works out the answers the help panel shows beside each example, by running it as a worksheet. Used by
 * `npm run help:results`, which stores them in results.ts, and by test/help.test.ts, which checks them.
 */
import { runWorksheet } from '../engine/evaluate.js';
import { emptyWorksheet } from '../format/native.js';
import { readRegion } from '../latex/region.js';
import { formatValue } from '../ui/format.js';
import { ENTRIES, TOPICS } from './index.js';

/** An example's answer for each line: LaTeX for a line ending in =, '' otherwise. Throws on any error. */
export function answersOf(lines: string[], what: string): string[] {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => {
    let content;
    try {
      content = readRegion(l);
    } catch (err) {
      throw new Error(`${what}, line ${i + 1}: can't be read: ${(err as Error).message}`);
    }
    return { id: `r${i}`, left: 0, top: i * 40 - 8, alignX: 0, alignY: i * 40, disabled: false, content };
  });
  const out = runWorksheet(ws);
  return ws.regions.map((r, i) => {
    const o = out.find((x) => x.region.id === r.id);
    if (o?.error) throw new Error(`${what}, line ${i + 1}: ${o.error.reason}`);
    return r.content.k === 'eval' && o?.value ? formatValue(o.value, ws.format) : '';
  });
}

/** Every stored answer, by entry name or `topic:<id>`. */
export function allAnswers(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of ENTRIES) {
    if (!e.results) out[e.name] = answersOf(e.example, e.name);
    // Random numbers differ each time: checked to calculate, but nothing is stored.
    else if (e.results === 'varies') answersOf(e.example, e.name);
  }
  for (const t of TOPICS) for (const b of t.body) if ('example' in b) out[`topic:${b.id}`] = answersOf(b.example, `topic ${t.id}, ${b.id}`);
  return out;
}

/** Reads every line of an example, without calculating: for examples that need files or symbolic evaluation. */
export function readable(lines: string[], what: string): void {
  lines.forEach((l, i) => {
    try {
      readRegion(l);
    } catch (err) {
      throw new Error(`${what}, line ${i + 1}: can't be read: ${(err as Error).message}`);
    }
  });
}
