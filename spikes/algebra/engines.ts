// Turns a case into a command for each candidate engine. With text.ts, this is the bridge.
import type { Expr } from '../../src/model/ast.js';
import type { Case } from './cases.js';
import { type Dialect, parse, print } from './text.js';

const defsApplied = (c: Case): string =>
  (c.defs ?? []).reduce((t, [n, v]) => t.replace(new RegExp(`\\b${n}\\b`, 'g'), v), c.expr);

const giacDialect: Dialect = {
  name: (n) => ({ 'π': 'pi', '∞': '(+infinity)', i: 'k' })[n] ?? n,
  pow: '^',
  list: (items) => `[${items.join(',')}]`,
  matrix: (rows) => `[${rows.map((r) => `[${r.join(',')}]`).join(',')}]`,
  equal: (a, b) => `${a}=${b}`,
};

export function giacCommand(c: Case): string {
  const p = (s: string): string => print(parse(s), giacDialect);
  const e = p(defsApplied(c));
  const v = giacDialect.name(c.arg ?? 'x');
  const [lo, hi] = [c.lo ? p(c.lo) : '', c.hi ? p(c.hi) : ''];
  switch (c.kind) {
    case 'plain': return e;
    case 'simplify': return `simplify(${e})`;
    case 'expand': return /sin|cos/.test(c.expr) ? `texpand(${e})` : `expand(${e})`;
    case 'factor': return `factor(${e})`;
    case 'collect': return `collect(${e})`;
    case 'coeffs': return `coeffs(${e},${v})`;
    case 'series': return `convert(series(${e},${v}=0,6),polynom)`;
    case 'substitute': return `subst(${e},${p(c.arg!)})`;
    case 'solve': return `csolve(${e},${v})`;
    case 'diff': return `diff(${e},${v})`;
    case 'integrate': return `integrate(${e},${v})`;
    case 'definite': return `integrate(${e},${v},${lo},${hi})`;
    case 'limit': return `limit(${e},${v},${lo})`;
    case 'sum': return `sum(${e},${v},${lo},${hi})`;
    case 'parfrac': return `partfrac(${e},${v})`;
    case 'det': return `det(${e})`;
    case 'inverse': return `inv(${e})`;
  }
}

const sympyDialect: Dialect = {
  name: (n) => ({ 'π': 'pi', '∞': 'oo', e: 'E', ln: 'log' })[n] ?? n,
  pow: '**',
  list: (items) => `[${items.join(',')}]`,
  matrix: (rows) => `Matrix([${rows.map((r) => `[${r.join(',')}]`).join(',')}])`,
  equal: (a, b) => `Eq(${a},${b})`,
};

export function sympyCommand(c: Case): string {
  const p = (s: string): string => print(parse(s), sympyDialect);
  const e = p(defsApplied(c));
  const v = c.arg?.split('=')[0] ?? 'x';
  const [lo, hi] = [c.lo ? p(c.lo) : '', c.hi ? p(c.hi) : ''];
  switch (c.kind) {
    case 'plain': return e;
    case 'simplify': return `simplify(${e})`;
    case 'expand': return `expand(${e},trig=True)`;
    case 'factor': return `factor(${e})`;
    case 'collect': return `collect(expand(${e}),${v})`;
    case 'coeffs': return `Poly(${e},${v}).all_coeffs()`;
    case 'series': return `series(${e},${v},0,6).removeO()`;
    case 'substitute': {
      const [a, b] = c.arg!.split('=');
      return `(${e}).subs(${a},${p(b!)})`;
    }
    case 'solve': return `solve(${e},${v})`;
    case 'diff': return `diff(${e},${v})`;
    case 'integrate': return `integrate(${e},${v})`;
    case 'definite': return `integrate(${e},(${v},${lo},${hi}))`;
    case 'limit': return `limit(${e},${v},${lo})`;
    case 'sum': return `summation(${e},(${v},${lo},${hi}))`;
    case 'parfrac': return `apart(${e},${v})`;
    case 'det': return `(${e}).det()`;
    case 'inverse': return `(${e}).inv()`;
  }
}

function json(e: Expr): unknown {
  switch (e.k) {
    case 'real': return e.v;
    case 'id': return ({ 'π': 'Pi', '∞': 'PositiveInfinity', e: 'ExponentialE' } as Record<string, string>)[e.name] ?? e.name;
    case 'call': {
      const n = (e.fn as { name: string }).name;
      const name = n[0]!.toUpperCase() + n.slice(1);
      return [name, ...e.args.map(json)];
    }
    case 'matrix': {
      const rows: unknown[] = [];
      for (let i = 0; i < e.rows; i++) rows.push(['List', ...Array.from({ length: e.cols }, (_, j) => json(e.items[i + j * e.rows]!))]);
      return ['Matrix', ['List', ...rows]];
    }
    case 'op': {
      const names: Record<string, string> = { plus: 'Add', minus: 'Subtract', mult: 'Multiply', div: 'Divide', pow: 'Power', neg: 'Negate', equal: 'Equal' };
      return [names[e.op], ...e.args.map(json)];
    }
    default: throw new Error(`no MathJSON for ${e.k}`);
  }
}

export function ceCommand(c: Case): { expr: unknown; fn: string; v?: string; lo?: unknown; hi?: unknown; sub?: unknown } {
  const j = (s: string): unknown => json(parse(s));
  const out: { expr: unknown; fn: string; v?: string; lo?: unknown; hi?: unknown; sub?: unknown } = { expr: j(defsApplied(c)), fn: c.kind };
  if (c.arg) out.v = c.arg.split('=')[0]!;
  if (c.kind === 'substitute') out.sub = [c.arg!.split('=')[0]!, j(c.arg!.split('=')[1]!)];
  if (c.lo) out.lo = j(c.lo);
  if (c.hi) out.hi = j(c.hi);
  return out;
}
