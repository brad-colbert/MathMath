// Scores engine answers against the Mathcad key by numeric equivalence. Usage: tsx score.ts <key> <results> [-v]
import { readFileSync } from 'node:fs';
import { Evaluator, Scope } from '../../src/engine/evaluate.js';
import { type Mat, NODIM, type Num, type Value, getEl, num, requireNum } from '../../src/engine/values.js';
import type { Expr } from '../../src/model/ast.js';
import { CASES, type Case } from './cases.js';
import { parse } from './text.js';

const [keyPath, resultsPath, flag] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyPath!, 'utf8')) as Record<string, { result: Expr | null }>;
const results = JSON.parse(readFileSync(resultsPath!, 'utf8')) as Record<string, { startupMs: number; output: Record<string, { out: string; ms: number }> }>;

const ev = new Evaluator({ origin: 0, tol: 0.001 });
const VARS = ['x', 'y', 'a', 'b', 'c', 'n', 'p', 'q', 'r', 't', 'k', 'w'];

function baseScope(): Scope {
  const s = new Scope(null);
  s.set('i_', num(0, NODIM, 1));
  const fn = (name: string, f: (v: Num) => Num): void => s.set(name, { t: 'fn', name, call: (a) => f(requireNum(a[0]!)) });
  fn('abs', (v) => num(Math.hypot(v.re, v.im)));
  fn('Abs', (v) => num(Math.hypot(v.re, v.im)));
  fn('sign', (v) => num(Math.sign(v.re)));
  fn('signum', (v) => num(Math.sign(v.re)));
  fn('csgn', (v) => num(Math.sign(v.re)));
  fn('arctan', (v) => num(Math.atan(v.re)));
  fn('asinh', (v) => num(Math.asinh(v.re)));
  fn('arsinh', (v) => num(Math.asinh(v.re)));
  return s;
}

function rename(e: Expr, names: Record<string, string>): Expr {
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (typeof n !== 'object' || n === null) return n;
    const o = n as Record<string, unknown>;
    if (o.k === 'id' && typeof o.name === 'string' && names[o.name]) return { ...o, name: names[o.name] };
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]));
  };
  return walk(e) as Expr;
}

const NAMES: Record<string, Record<string, string>> = {
  giac: { pi: 'π', i: 'i_', infinity: '∞' },
  sympy: { pi: 'π', E: 'e', I: 'i_', oo: '∞', log: 'ln' },
  'compute-engine': { pi: 'π', i: 'i_', Pi: 'π', oo: '∞', '+oo': '∞', ExponentialE: 'e', log: 'ln' },
};

function readAnswer(engine: string, text: string): Expr {
  let t = text.trim();
  // Negative control: a scorer that can't fail proves nothing.
  if (process.env.SABOTAGE === 'shift') t = t.replace(/\bx\b/g, '(x+1)');
  if (process.env.SABOTAGE === 'scale') t = `(${t})*1.0001`;
  if (engine === 'giac') t = t.replace(/=-?[\d.]+(e[+-]?\d+)?$/, '').replace(/poly1\[/g, 'list[');
  if (engine === 'sympy') t = t.replace(/Matrix\(\[(.*)\]\)/, '[$1]');
  if (engine === 'compute-engine') t = t.replace(/ \+ BigO\(.*\)$/, '').replace(/\|([^|]+)\|/g, 'abs($1)').replace(/(\d)(?=[A-Za-zπ(])/g, '$1*').replace(/\)(?=[A-Za-zπ(])/g, ')*').replace(/\+oo/g, 'oo');
  return rename(parse(t), NAMES[engine]!);
}

function points(c: Case): Scope[] {
  const out: Scope[] = [];
  for (let n = 0; n < 6; n++) {
    const s = baseScope();
    for (const v of VARS) {
      const value = c.kind === 'series' ? 0.02 + 0.01 * n : 0.37 + 0.211 * n + 0.13 * VARS.indexOf(v);
      s.set(v, num(value));
    }
    out.push(s);
  }
  return out;
}

const flat = (v: Value): Num[] => {
  if (v.t !== 'mat') return [requireNum(v)];
  const m = v as Mat;
  const items: Num[] = [];
  for (let n = 0; n < m.rows * m.cols; n++) items.push(requireNum(getEl(m, n % m.rows, Math.floor(n / m.rows))));
  return items;
};

const near = (a: Num, b: Num, tol: number): boolean =>
  Math.hypot(a.re - b.re, a.im - b.im) <= tol * Math.max(1, Math.hypot(a.re, a.im), Math.hypot(b.re, b.im));

function sameSet(a: Num[], b: Num[], tol: number): boolean {
  if (a.length !== b.length) return false;
  const left = [...b];
  for (const x of a) {
    const i = left.findIndex((y) => near(x, y, tol));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

function equivalent(c: Case, ref: Expr, got: Expr): string | null {
  const tol = c.kind === 'series' ? 1e-5 : 1e-8;
  const scopes = points(c);
  let compared = 0;
  const prev: { a: Num[]; b: Num[] }[] = [];
  for (const s of scopes) {
    let a: Num[];
    let b: Num[];
    try {
      a = flat(ev.eval(ref, s));
      b = flat(ev.eval(got, s));
    } catch (err) {
      if (compared === 0 && s === scopes.at(-1)) return `could not evaluate: ${(err as Error).message}`;
      continue;
    }
    compared++;
    if (c.kind === 'integrate') {
      prev.push({ a, b });
      if (prev.length > 1) {
        const [p, q] = [prev[0]!, prev.at(-1)!];
        const d = (u: Num, v: Num): Num => num(u.re - v.re, NODIM, u.im - v.im);
        if (!near(d(q.a[0]!, p.a[0]!), d(q.b[0]!, p.b[0]!), tol)) return 'differ by more than a constant';
      }
      continue;
    }
    const setwise = c.kind === 'solve' || c.kind === 'coeffs';
    const same = setwise ? sameSet(a, b, tol) : a.length === b.length && a.every((x, i) => near(x, b[i]!, tol));
    if (!same) return `differ: ${a.map((x) => x.re.toPrecision(6))} vs ${b.map((x) => x.re.toPrecision(6))}`;
  }
  return compared > 0 ? null : 'no comparable points';
}

const UNEVALUATED = /\b(int|Integral|Integrate|Limit|limit|Sum|sum|Int|Solve|Piecewise|RootOf|undef)\b/;

for (const [engine, run] of Object.entries(results)) {
  let match = 0;
  const bad: string[] = [];
  for (const c of CASES) {
    const ref = key[c.id]!.result;
    const text = run.output[c.id]!.out;
    let why: string | null;
    if (text.startsWith('ERROR') || text === 'TIMEOUT') why = text.slice(0, 70);
    else if (UNEVALUATED.test(text)) why = 'left unevaluated';
    else {
      try {
        why = equivalent(c, ref!, readAnswer(engine, text));
      } catch (err) {
        why = `unreadable: ${(err as Error).message.slice(0, 60)}`;
      }
    }
    if (why) bad.push(`   ${c.id.padEnd(18)} ${why}  |  ${text.slice(0, 70)}`);
    else match++;
  }
  console.log(`${engine}: ${match}/${CASES.length} match the key`);
  if (flag) console.log(bad.join('\n'));
}
