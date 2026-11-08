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

// Scores the engine against results stored in a folder of worksheets. The folder is private and is
// never read from a path in this repository: pass --corpus or set MATHMATH_CORPUS. Keep --report
// output outside the repository, because sheet names and values are private.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { OrderKey } from '../engine/evaluate.js';
import { scoreSheet, selfContained } from '../score/sheet.js';
import { type Found, corpusFiles, corpusFolder, readSheets } from './corpus.js';

const { values: opts } = parseArgs({
  options: {
    corpus: { type: 'string' },
    order: { type: 'string', default: 'align' },
    all: { type: 'boolean', default: false },
    sheet: { type: 'string' },
    report: { type: 'string' },
    verbose: { type: 'boolean', short: 'v', default: false },
    top: { type: 'string', default: '25' },
    // More worksheets that references can find, searched before the corpus: sheets converted from .mcd.
    also: { type: 'string', multiple: true, default: [] },
    // Sheets to leave out, by part of their path, such as ones that take minutes.
    skip: { type: 'string', multiple: true, default: [] },
  },
});

const tally = { match: 0, mismatch: 0, error: 0, excluded: 0, needs: 0 };
const corpus = corpusFolder(opts.corpus);
const filesFor = corpusFiles(corpus, opts.also ?? []);
const guesses = new Map<string, string>();
const unscored = { ran: 0, failed: 0 };
const units = { agree: 0, total: 0, misses: new Map<string, number>() };
const reasons = new Map<string, number>();
const unscoredReasons = new Map<string, number>();
const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);
const lines: string[] = [];
const rows: unknown[] = [];

for (const { path, xml, ws } of readSheets(corpus, opts.sheet)) {
  if (!opts.all && !selfContained(ws, xml)) continue;
  if (opts.skip?.some((k) => path.includes(k))) {
    console.log(`  skipped  ${path}`);
    continue;
  }
  const found = new Map<string, Found>();
  const s = scoreSheet(ws, opts.order as OrderKey, filesFor(path, found));
  for (const [what, f] of found) if (f.how === 'guess') guesses.set(`${path}: ${what}`, f.path);
  for (const k of ['match', 'mismatch', 'error', 'excluded', 'needs'] as const) tally[k] += s[k];
  units.agree += s.units.agree;
  units.total += s.units.total;
  for (const m of s.units.misses) bump(units.misses, m);
  unscored.ran += s.unscored.ran;
  unscored.failed += s.unscored.failed.length;
  for (const f of s.unscored.failed) {
    bump(unscoredReasons, f.reason);
    if (opts.verbose) lines.push(`    ${path} #${f.region} unscored: ${f.reason}`);
  }
  for (const r of s.rows) {
    if (r.bucket === 'error') bump(reasons, r.detail);
    if (r.bucket === 'needs') bump(reasons, `needs: ${r.detail.replace(/^[\w-]+: /, '').split(/[.:] /)[0]}`);
    if (r.bucket === 'mismatch') bump(reasons, `mismatch: ${r.detail.replace(/-?\d[\d.e+-]*/g, '#').slice(0, 60)}`);
    rows.push({ sheet: path, ...r });
    if (opts.verbose) lines.push(`    ${path} #${r.region} ${r.bucket}: ${r.detail}`);
  }
  const total = s.match + s.mismatch + s.error + s.excluded + s.needs;
  console.log(`${String(s.match).padStart(4)}/${String(total).padEnd(4)} ${path}`);
}

for (const l of lines) console.log(l);
const total = tally.match + tally.mismatch + tally.error + tally.excluded + tally.needs;
console.log(`\nTOTAL ${tally.match}/${total} match, ${tally.mismatch} mismatch, ${tally.error} error, ${tally.excluded} excluded, ${tally.needs} need a file`);
console.log(`Without a stored result: ${unscored.ran} regions ran, ${unscored.failed} failed`);
console.log(`Units Mathcad chose: ${units.agree}/${units.total} chosen the same way`);
for (const [k, n] of units.misses) console.log(`${String(n).padStart(5)}  ${k}`);
const print = (title: string, m: Map<string, number>): void => {
  if (m.size === 0) return;
  console.log(`\n${title}:`);
  for (const [k, n] of [...m].sort((a, b) => b[1] - a[1]).slice(0, Number(opts.top))) console.log(`${String(n).padStart(5)}  ${k}`);
};
if (guesses.size > 0) {
  console.log('\nFiles found by guessing among several with the same name:');
  for (const [k, v] of guesses) console.log(`  ${k} -> ${v}`);
}
print('Failure reasons', reasons);
print('Failures without a stored result', unscoredReasons);
if (opts.report) writeFileSync(opts.report, JSON.stringify({ tally, rows }, null, 2));
