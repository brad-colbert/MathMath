// Scores the engine against results stored in a folder of worksheets. The folder is private and is
// never read from a path in this repository: pass --corpus or set MATHMATH_CORPUS. Keep --report
// output outside the repository, because sheet names and values are private.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { DOMParser } from '@xmldom/xmldom';
import { type OrderKey, runWorksheet } from '../engine/evaluate.js';
import { EvalError } from '../engine/values.js';
import type { Content, Worksheet } from '../model/ast.js';
import { compareResult } from '../score/compare.js';
import { type XElement, importWorksheet } from '../xmcd/import.js';

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

const corpus = opts.corpus ?? process.env.MATHMATH_CORPUS;
if (!corpus) {
  console.error('Set MATHMATH_CORPUS or pass --corpus <folder>.');
  process.exit(2);
}

function findSheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : findSheets(path);
    return e.name.toLowerCase().endsWith('.xmcd') ? [path] : [];
  });
}

/** Files or other sheets a worksheet needs. Such sheets are out of scope for milestone 1. */
function selfContained(ws: Worksheet, xml: string): boolean {
  if (ws.otherRegions.reference || ws.componentOutputs.length > 0) return false;
  return !/>(READRGB|READBIN|READPRN|READ|WRITERGB)</.test(xml);
}

const storedOf = (c: Content) => (c.k === 'other' ? null : c.stored);

const tally = { match: 0, mismatch: 0, error: 0, excluded: 0 };
/** Regions with nothing to compare against, which can still fail to run. */
const unscored = { ran: 0, failed: 0 };
const unscoredReasons = new Map<string, number>();
const reasons = new Map<string, number>();
const note = (reason: string): void => void reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
const lines: string[] = [];
const rows: unknown[] = [];

const tolFor = (c: Content): number => (/"(bigop|derivative)"/.test(JSON.stringify(c)) ? 5e-3 : 1e-9);

for (const path of findSheets(corpus).sort()) {
  const rel = relative(corpus, path);
  if (opts.sheet && !rel.includes(opts.sheet)) continue;
  const xml = readFileSync(path, 'utf8');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const ws = importWorksheet(doc.documentElement as unknown as XElement);
  if (!opts.all && !selfContained(ws, xml)) continue;

  const sheet = { match: 0, mismatch: 0, error: 0, excluded: 0 };
  for (const o of runWorksheet(ws, opts.order as OrderKey)) {
    const stored = storedOf(o.region.content);
    if (!stored) {
      if (o.region.content.k === 'other') continue;
      unscored.ran++;
      if (o.error) {
        unscored.failed++;
        const reason = `${o.error.kind}: ${o.error.reason}`;
        unscoredReasons.set(reason, (unscoredReasons.get(reason) ?? 0) + 1);
        if (opts.verbose) lines.push(`    ${rel} #${o.region.id} unscored: ${reason}`);
      }
      continue;
    }
    let bucket: keyof typeof sheet;
    let detail = '';
    if (o.error) {
      bucket = o.error.kind === 'excluded' ? 'excluded' : 'error';
      detail = `${o.error.kind}: ${o.error.reason}`;
    } else if (!o.value) {
      bucket = 'error';
      detail = 'runtime: no value produced';
    } else {
      try {
        const verdict = compareResult(o.value, stored, tolFor(o.region.content), o.unit);
        bucket = verdict.ok ? 'match' : 'mismatch';
        if (!verdict.ok) detail = verdict.reason;
      } catch (err) {
        if (!(err instanceof EvalError)) throw err;
        bucket = 'error';
        detail = `${err.kind}: ${err.reason}`;
      }
    }
    sheet[bucket]++;
    tally[bucket]++;
    if (bucket === 'error') note(detail);
    if (bucket === 'mismatch') note(`mismatch: ${detail.replace(/-?\d[\d.e+-]*/g, '#').slice(0, 60)}`);
    if (detail) rows.push({ sheet: rel, region: o.region.id, bucket, detail });
    if (detail && opts.verbose) lines.push(`    ${rel} #${o.region.id} ${bucket}: ${detail}`);
  }
  const total = sheet.match + sheet.mismatch + sheet.error + sheet.excluded;
  console.log(`${String(sheet.match).padStart(4)}/${String(total).padEnd(4)} ${rel}`);
}

for (const l of lines) console.log(l);
const total = tally.match + tally.mismatch + tally.error + tally.excluded;
console.log(`\nTOTAL ${tally.match}/${total} match, ${tally.mismatch} mismatch, ${tally.error} error, ${tally.excluded} excluded`);
console.log(`Without a stored result: ${unscored.ran} regions ran, ${unscored.failed} failed`);
console.log('\nFailure reasons:');
const top = [...reasons].sort((a, b) => b[1] - a[1]).slice(0, Number(opts.top));
for (const [reason, count] of top) console.log(`${String(count).padStart(5)}  ${reason}`);
if (unscoredReasons.size > 0) console.log('\nFailures without a stored result:');
const topUnscored = [...unscoredReasons].sort((a, b) => b[1] - a[1]).slice(0, Number(opts.top));
for (const [reason, count] of topUnscored) console.log(`${String(count).padStart(5)}  ${reason}`);
if (opts.report) writeFileSync(opts.report, JSON.stringify({ tally, rows }, null, 2));
