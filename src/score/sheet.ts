import { type OrderKey, runWorksheet } from '../engine/evaluate.js';
import { EvalError } from '../engine/values.js';
import { type Files, sheetKey } from '../engine/files.js';
import type { Content, Worksheet } from '../model/ast.js';
import { chooseUnits } from '../engine/display-units.js';
import { shortUnit } from '../engine/units.js';
import { compareResult } from './compare.js';

/** `needs`: a missing file or a Mathcad feature to replace stands in the way, so the engine isn't at fault. */
export type Bucket = 'match' | 'mismatch' | 'error' | 'excluded' | 'needs';

export interface Row { region: string; bucket: Bucket; detail: string }

export interface SheetScore {
  match: number;
  mismatch: number;
  error: number;
  excluded: number;
  needs: number;
  /** Regions with nothing to compare against, which can still fail to run. */
  unscored: { ran: number; failed: { region: string; reason: string }[] };
  rows: Row[];
  /** Results Mathcad showed in a unit it chose itself, against the unit MathMath chooses. */
  units: { agree: number; total: number; misses: string[] };
}

/** Whether a sheet needs other files. Sheets that do are outside the self-contained set. */
export const selfContained = (ws: Worksheet, xml: string): boolean =>
  !ws.otherRegions.reference && ws.componentOutputs.length === 0 && !/>(READRGB|READBIN|READPRN|READ|WRITERGB)</.test(xml);

const storedOf = (c: Content) => (c.k === 'define' || c.k === 'eval' ? c.stored : null);
const APPROXIMATE = /"(bigop|derivative)"/;
/** A call of a random-number function. The answers Mathcad saved came from its own draws, so can't match. */
const RANDOM = /"k":"id","name":"(rnd|runif|rnorm)"/;
const namesIn = (json: string): string[] => [...json.matchAll(/"k":"id","name":"([^"]+)"/g)].map((m) => m[1]!);

/**
 * Names whose values come, at any remove, from something the pattern finds in a definition: an integral or
 * derivative, which Mathcad computes only to its tolerance, or random numbers. Definitions in referenced
 * sheets count too.
 */
function dependentNames(ws: Worksheet, files: Files | undefined, pattern: RegExp): Set<string> {
  const defs = new Map<string, string>();
  const seen = new Set<string>();
  const visit = (sheet: Worksheet): void => {
    for (const r of sheet.regions) {
      const c = r.content;
      if (c.k === 'include' && files) {
        const key = sheetKey(c.file);
        const other = seen.has(key) ? undefined : files.sheet(key);
        seen.add(key);
        if (other) visit(other);
      }
      if (c.k !== 'define' && c.k !== 'sym') continue;
      const value = JSON.stringify(c.k === 'define' ? c.value : c.expr);
      const target = c.target;
      if (!target) continue;
      for (const m of JSON.stringify(target).matchAll(/"name":"([^"]+)"/g)) defs.set(m[1]!, `${defs.get(m[1]!) ?? ''}${value}`);
    }
  };
  visit(ws);
  const approx = new Set([...defs].filter(([, v]) => pattern.test(v)).map(([k]) => k));
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, v] of defs) {
      if (!approx.has(name) && namesIn(v).some((n) => approx.has(n))) {
        approx.add(name);
        grew = true;
      }
    }
  }
  return approx;
}

const tolFor = (c: Content, approx: Set<string>): number => {
  const json = JSON.stringify(c);
  return APPROXIMATE.test(json) || namesIn(json).some((n) => approx.has(n)) ? 5e-3 : 1e-9;
};

export function scoreSheet(ws: Worksheet, order: OrderKey = 'align', files?: Files): SheetScore {
  const score: SheetScore = { match: 0, mismatch: 0, error: 0, excluded: 0, needs: 0, unscored: { ran: 0, failed: [] }, rows: [], units: { agree: 0, total: 0, misses: [] } };
  const outcomes = runWorksheet(ws, order, files);
  const approx = dependentNames(ws, files, APPROXIMATE);
  const random = dependentNames(ws, files, RANDOM);
  const isRandom = (c: Content): boolean => {
    const json = JSON.stringify(c);
    return RANDOM.test(json) || namesIn(json).some((n) => random.has(n));
  };
  // With a referenced sheet missing, an undefined name is most likely one it would have defined.
  const missing = outcomes.find((o) => o.region.content.k === 'include' && o.error?.kind === 'needs-file')?.region.content;
  const missingFile = missing?.k === 'include' ? missing.file : null;
  for (const o of outcomes) {
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
      const blamed = missingFile && (o.error.kind === 'undefined' || o.error.kind === 'undefined-function');
      bucket = o.error.kind === 'excluded' ? 'excluded' : o.error.kind === 'needs-file' || o.error.kind === 'mathcad' || blamed ? 'needs' : 'error';
      detail = blamed ? `needs-file: ${missingFile}, which a reference names, probably defines it (${o.error.reason})` : `${o.error.kind}: ${o.error.reason}`;
    } else if (!o.value) {
      bucket = 'error';
      detail = 'runtime: no value produced';
    } else {
      try {
        const verdict = compareResult(o.value, stored, tolFor(c, approx), o.unit);
        bucket = verdict.ok ? 'match' : 'mismatch';
        if (!verdict.ok) detail = verdict.reason;
        // Random draws differ from the ones Mathcad saved, so a miss there says nothing about the engine.
        // Answers that don't hang on the draws, such as how many there are, still count.
        if (!verdict.ok && isRandom(c)) {
          bucket = 'excluded';
          detail = `depends on random numbers, which differ from the ones Mathcad drew (${verdict.reason})`;
        }
      } catch (err) {
        if (!(err instanceof EvalError)) throw err;
        bucket = 'error';
        detail = `${err.kind}: ${err.reason}`;
      }
    }
    score[bucket]++;
    if (detail) score.rows.push({ region: o.region.id, bucket, detail });
    const shown = o.value?.t === 'num' || o.value?.t === 'mat' ? o.value.dim : null;
    if (shown && (c.k === 'eval' || c.k === 'define') && !c.unit && stored.units.length > 0) {
      const key = (parts: { name: string; power: number }[]): string => parts.map((p) => `${p.name}^${p.power}`).sort().join(' ');
      const mine = key(chooseUnits(shown).parts);
      const theirs = key(stored.units.map((u) => ({ name: shortUnit(u.unit), power: u.power })));
      score.units.total++;
      if (mine === theirs) score.units.agree++;
      else score.units.misses.push(`${theirs} shown as ${mine}`);
    }
  }
  return score;
}
