// Round trip without MathLive first: separates printer and parser bugs from what MathLive does.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import type { Expr } from '../../src/model/ast.js';
import { type XElement, importWorksheet } from '../../src/xmcd/import.js';
import { readTex, tex } from './latex.js';

const corpus = process.env.MATHMATH_CORPUS!;
const find = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  if (e.isDirectory()) return e.name.startsWith('.') ? [] : find(p);
  return e.name.toLowerCase().endsWith('.xmcd') ? [p] : [];
});
/** A block of one statement means the same as the statement. */
const strip = (e: unknown): string => JSON.stringify(e, (_, v) => (v?.k === 'block' && v.body.length === 1 ? v.body[0] : v));
const reasons = new Map<string, number>();
let total = 0, ok = 0;
for (const path of find(corpus)) {
  const xml = readFileSync(path, 'utf8');
  const ws = importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
  if (ws.otherRegions.reference || ws.componentOutputs.length || />(READRGB|READBIN|WRITERGB)</.test(xml)) continue;
  for (const r of ws.regions) {
    const c = r.content;
    const e: Expr | null = c.k === 'define' ? c.value : c.k === 'eval' ? c.expr : null;
    if (!e) continue;
    total++;
    try {
      const back = readTex(tex(e));
      if (strip(back) === strip(e)) ok++;
      else {
        let i = 0;
        const [a, b] = [strip(e), strip(back)];
        while (a[i] === b[i]) i++;
        const k = `differs near ${a.slice(Math.max(0, i - 24), i + 24)} / ${b.slice(Math.max(0, i - 24), i + 24)}`.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, '#');
        reasons.set(k, (reasons.get(k) ?? 0) + 1);
      }
    } catch (err) {
      const k = `error: ${(err as Error).message.replace(/ at \d+$/, '')}`;
      reasons.set(k, (reasons.get(k) ?? 0) + 1);
    }
  }
}
console.log(`${ok}/${total} survive printing and reading`);
for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(String(v).padStart(5), k.slice(0, 130));
