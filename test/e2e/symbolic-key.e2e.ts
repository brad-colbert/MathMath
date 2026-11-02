// Runs the algebra test set through the real app and scores it against Mathcad's answers by numeric
// equivalence. The answers stay private. Usage: tsx test/e2e/symbolic-key.e2e.ts <answers.json>
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { Evaluator, Scope } from '../../src/engine/evaluate.js';
import { type Mat, NODIM, type Num, type Value, getEl, num, requireNum } from '../../src/engine/values.js';
import { readTex } from '../../src/latex/latex.js';
import type { Content, Expr, SymCommand } from '../../src/model/ast.js';
import { CSP } from '../../vite.config.js';
import { parse } from './infix.js';
import { CASES, type Case } from './symbolic-cases.js';

const key = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as Record<string, { result: Expr | null }>;
execSync('npx vite build --logLevel error', { stdio: 'inherit' });
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url!.split('?')[0]!);
  const path = join('dist', url === '/' ? 'index.html' : url);
  if (!existsSync(path) || !statSync(path).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream', 'content-security-policy': CSP });
  createReadStream(path).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));

const expr = (s: string): Expr => parse(s);
const kw = (name: string, ...args: string[]): SymCommand => ({ name, args: args.map(expr) });
const bounds = (c: Case) => ({ lo: c.lo ? expr(c.lo) : null, hi: c.hi ? expr(c.hi) : null });

function content(c: Case): Content {
  const body = expr(c.expr);
  const v = c.arg ?? 'x';
  const sym = (e: Expr, ...commands: SymCommand[]): Content => ({ k: 'sym', target: null, global: false, expr: e, commands, stored: null });
  switch (c.kind) {
    case 'plain': return sym(body);
    case 'simplify': case 'expand': case 'factor': return sym(body, kw(c.kind));
    case 'collect': case 'coeffs': case 'solve': case 'series': case 'parfrac': case 'substitute': return sym(body, kw(c.kind, v));
    case 'diff': return sym({ k: 'derivative', varName: v, body });
    case 'integrate': return sym({ k: 'bigop', op: 'integral', varName: v, body, lo: null, hi: null });
    case 'definite': return sym({ k: 'bigop', op: 'integral', varName: v, body, ...bounds(c) });
    case 'sum': return sym({ k: 'bigop', op: 'summation', varName: v, body, ...bounds(c) });
    case 'limit': return sym({ k: 'limit', varName: v, body, to: expr(c.lo!), side: null });
    case 'det': return sym({ k: 'op', op: 'absval', args: [body] });
    case 'inverse': return sym({ k: 'op', op: 'pow', args: [body, { k: 'real', v: -1 }] });
  }
}

const place = (n: number): { left: number; top: number; alignX: number; alignY: number; disabled: boolean } =>
  ({ left: 40, top: 40 + n * 40, alignX: 40, alignY: 48 + n * 40, disabled: false });

// Definitions are separate regions, so each case stays alone: names aren't shared between cases.
const regions: unknown[] = [];
const ids = new Map<string, string>();
CASES.forEach((c, n) => {
  for (const [name, value] of c.defs ?? []) {
    regions.push({ id: `d${n}`, ...place(n), alignY: 40 + n * 40, content: { k: 'define', target: { k: 'var', name }, value: expr(value), global: false, stored: null, unit: null, shown: false } });
  }
  ids.set(c.id, `c${n}`);
  regions.push({ id: `c${n}`, ...place(n), content: content(c) });
});

const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'], protocolTimeout: 200000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error', String(e).slice(0, 200)));
await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
await page.waitForFunction('!!window.mathmath');
const t = Date.now();
const answers = await page.evaluate(async (list) => {
  const m = (window as any).mathmath;
  m.load('t.mathmath', JSON.stringify({ format: 'mathmath', version: 1, worksheet: { ...m.doc.ws, regions: list } }));
  while (m.doc.computing) await new Promise((r) => setTimeout(r, 50));
  return Object.fromEntries(m.doc.outcomes);
}, regions) as Record<string, { value?: string; error?: string; unevaluated?: boolean }>;
console.log(`all cases in ${((Date.now() - t) / 1000).toFixed(1)} s, including engine start`);

const ev = new Evaluator({ origin: 0, tol: 0.001 });
const VARS = ['x', 'y', 'a', 'b', 'c', 'n', 'p', 'q', 'r', 't', 'k', 'w'];
function scopeAt(c: Case, n: number): Scope {
  const s = new Scope(null);
  const fn = (name: string, f: (v: Num) => Num): void => s.set(name, { t: 'fn', name, call: (a) => f(requireNum(a[0]!)) });
  fn('abs', (v) => num(Math.hypot(v.re, v.im)));
  fn('sign', (v) => num(Math.sign(v.re)));
  fn('signum', (v) => num(Math.sign(v.re)));
  fn('csgn', (v) => num(Math.sign(v.re)));
  fn('asinh', (v) => num(Math.asinh(v.re)));
  fn('arsinh', (v) => num(Math.asinh(v.re)));
  fn('ln', (v) => (v.re > 0 && v.im === 0 ? num(Math.log(v.re)) : num(Math.log(Math.hypot(v.re, v.im)), NODIM, Math.atan2(v.im, v.re))));
  for (const v of VARS) s.set(v, num(c.kind === 'series' ? 0.02 + 0.01 * n : 0.37 + 0.211 * n + 0.13 * VARS.indexOf(v)));
  return s;
}
const flat = (v: Value): Num[] => {
  if (v.t !== 'mat') return [requireNum(v)];
  const m = v as Mat;
  const out: Num[] = [];
  for (let n = 0; n < m.rows * m.cols; n++) out.push(requireNum(getEl(m, n % m.rows, Math.floor(n / m.rows))));
  return out;
};
const near = (a: Num, b: Num, tol: number): boolean =>
  Math.hypot(a.re - b.re, a.im - b.im) <= tol * Math.max(1, Math.hypot(a.re, a.im), Math.hypot(b.re, b.im));
function sameSet(a: Num[], b: Num[], tol: number): boolean {
  if (a.length !== b.length) return false;
  const left = [...b];
  return a.every((x) => {
    const i = left.findIndex((y) => near(x, y, tol));
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

function equivalent(c: Case, ref: Expr, got: Expr): string | null {
  const tol = c.kind === 'series' ? 1e-5 : 1e-8;
  let compared = 0;
  const seen: { a: Num[]; b: Num[] }[] = [];
  for (let n = 0; n < 6; n++) {
    const s = scopeAt(c, n);
    let a: Num[];
    let b: Num[];
    try {
      a = flat(ev.eval(ref, s));
      b = flat(ev.eval(got, s));
    } catch (err) {
      if (compared === 0 && n === 5) return `can't evaluate: ${(err as Error).message}`;
      continue;
    }
    compared++;
    if (c.kind === 'integrate') {
      seen.push({ a, b });
      const [p, q] = [seen[0]!, seen.at(-1)!];
      const d = (u: Num, v: Num): Num => num(u.re - v.re, NODIM, u.im - v.im);
      if (!near(d(q.a[0]!, p.a[0]!), d(q.b[0]!, p.b[0]!), tol)) return 'differs by more than a constant';
      continue;
    }
    const same = c.kind === 'solve' ? sameSet(a, b, tol) : a.length === b.length && a.every((x, i) => near(x, b[i]!, tol));
    if (!same) return `differs: ${a.map((x) => x.re.toPrecision(6))} vs ${b.map((x) => x.re.toPrecision(6))}`;
  }
  return compared ? null : 'no comparable points';
}

let match = 0;
for (const c of CASES) {
  const got = answers[ids.get(c.id)!];
  let why: string | null;
  if (!got) why = 'no outcome';
  else if (got.error) why = `error: ${got.error}`;
  else if (got.unevaluated) why = 'no closed form';
  else if (!got.value) why = 'no value';
  else {
    try {
      // A scorer that can't fail proves nothing: SABOTAGE=1 must collapse the score.
      const read = readTex(got.value);
      const answer: Expr = process.env.SABOTAGE ? { k: 'op', op: 'plus', args: [read, { k: 'op', op: 'mult', args: [{ k: 'real', v: 0.0001 }, { k: 'real', v: 1 }] }] } : read;
      why = equivalent(c, key[c.id]!.result!, answer);
    } catch (err) {
      why = `unreadable: ${(err as Error).message.slice(0, 50)}`;
    }
  }
  if (why) console.log(`   ${c.id.padEnd(18)} ${why}  |  ${(got?.value ?? '').slice(0, 80)}`);
  else match++;
}
console.log(`${match}/${CASES.length} match Mathcad through the whole app`);
await browser.close();
server.close();
