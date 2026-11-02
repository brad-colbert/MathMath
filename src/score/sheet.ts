import { type OrderKey, runWorksheet } from '../engine/evaluate.js';
import { EvalError } from '../engine/values.js';
import type { Content, Worksheet } from '../model/ast.js';
import { compareResult } from './compare.js';

export type Bucket = 'match' | 'mismatch' | 'error' | 'excluded';

export interface Row { region: string; bucket: Bucket; detail: string }

export interface SheetScore {
  match: number;
  mismatch: number;
  error: number;
  excluded: number;
  /** Regions with nothing to compare against, which can still fail to run. */
  unscored: { ran: number; failed: { region: string; reason: string }[] };
  rows: Row[];
}

/** Whether a sheet needs other files. Sheets that do are outside the self-contained set. */
export const selfContained = (ws: Worksheet, xml: string): boolean =>
  !ws.otherRegions.reference && ws.componentOutputs.length === 0 && !/>(READRGB|READBIN|READPRN|READ|WRITERGB)</.test(xml);

const storedOf = (c: Content) => (c.k === 'define' || c.k === 'eval' ? c.stored : null);
const tolFor = (c: Content): number => (/"(bigop|derivative)"/.test(JSON.stringify(c)) ? 5e-3 : 1e-9);

export function scoreSheet(ws: Worksheet, order: OrderKey = 'align'): SheetScore {
  const score: SheetScore = { match: 0, mismatch: 0, error: 0, excluded: 0, unscored: { ran: 0, failed: [] }, rows: [] };
  for (const o of runWorksheet(ws, order)) {
    const c = o.region.content;
    const stored = storedOf(c);
    if (!stored) {
      if (c.k !== 'define' && c.k !== 'eval') continue;
      score.unscored.ran++;
      if (o.error) score.unscored.failed.push({ region: o.region.id, reason: `${o.error.kind}: ${o.error.reason}` });
      continue;
    }
    let bucket: Bucket;
    let detail = '';
    if (o.error) {
      bucket = o.error.kind === 'excluded' ? 'excluded' : 'error';
      detail = `${o.error.kind}: ${o.error.reason}`;
    } else if (!o.value) {
      bucket = 'error';
      detail = 'runtime: no value produced';
    } else {
      try {
        const verdict = compareResult(o.value, stored, tolFor(c), o.unit);
        bucket = verdict.ok ? 'match' : 'mismatch';
        if (!verdict.ok) detail = verdict.reason;
      } catch (err) {
        if (!(err instanceof EvalError)) throw err;
        bucket = 'error';
        detail = `${err.kind}: ${err.reason}`;
      }
    }
    score[bucket]++;
    if (detail) score.rows.push({ region: o.region.id, bucket, detail });
  }
  return score;
}
