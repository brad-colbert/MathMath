// Scores the engine against results stored in a folder of worksheets. The folder is private and is
// never read from a path in this repository: pass --corpus or set MATHMATH_CORPUS. Keep --report
// output outside the repository, because sheet names and values are private.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { OrderKey } from '../engine/evaluate.js';
import { scoreSheet, selfContained } from '../score/sheet.js';
import { corpusFolder, readSheets } from './corpus.js';

const { values: opts } = parseArgs({
  options: {
    corpus: { type: 'string' },
    order: { type: 'string', default: 'align' },
    all: { type: 'boolean', default: false },
    sheet: { type: 'string' },
    report: { type: 'string' },
    verbose: { type: 'boolean', short: 'v', default: false },
    top: { type: 'string', default: '25' },
  },
});

const tally = { match: 0, mismatch: 0, error: 0, excluded: 0 };
const unscored = { ran: 0, failed: 0 };
const reasons = new Map<string, number>();
const unscoredReasons = new Map<string, number>();
const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);
const lines: string[] = [];
const rows: unknown[] = [];

for (const { path, xml, ws } of readSheets(corpusFolder(opts.corpus), opts.sheet)) {
  if (!opts.all && !selfContained(ws, xml)) continue;
  const s = scoreSheet(ws, opts.order as OrderKey);
  for (const k of ['match', 'mismatch', 'error', 'excluded'] as const) tally[k] += s[k];
  unscored.ran += s.unscored.ran;
  unscored.failed += s.unscored.failed.length;
  for (const f of s.unscored.failed) {
    bump(unscoredReasons, f.reason);
    if (opts.verbose) lines.push(`    ${path} #${f.region} unscored: ${f.reason}`);
  }
  for (const r of s.rows) {
    if (r.bucket === 'error') bump(reasons, r.detail);
    if (r.bucket === 'mismatch') bump(reasons, `mismatch: ${r.detail.replace(/-?\d[\d.e+-]*/g, '#').slice(0, 60)}`);
    rows.push({ sheet: path, ...r });
    if (opts.verbose) lines.push(`    ${path} #${r.region} ${r.bucket}: ${r.detail}`);
  }
  const total = s.match + s.mismatch + s.error + s.excluded;
  console.log(`${String(s.match).padStart(4)}/${String(total).padEnd(4)} ${path}`);
}

for (const l of lines) console.log(l);
const total = tally.match + tally.mismatch + tally.error + tally.excluded;
console.log(`\nTOTAL ${tally.match}/${total} match, ${tally.mismatch} mismatch, ${tally.error} error, ${tally.excluded} excluded`);
console.log(`Without a stored result: ${unscored.ran} regions ran, ${unscored.failed} failed`);
const print = (title: string, m: Map<string, number>): void => {
  if (m.size === 0) return;
  console.log(`\n${title}:`);
  for (const [k, n] of [...m].sort((a, b) => b[1] - a[1]).slice(0, Number(opts.top))) console.log(`${String(n).padStart(5)}  ${k}`);
};
print('Failure reasons', reasons);
print('Failures without a stored result', unscoredReasons);
if (opts.report) writeFileSync(opts.report, JSON.stringify({ tally, rows }, null, 2));
