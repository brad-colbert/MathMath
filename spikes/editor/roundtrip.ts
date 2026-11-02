// Kill test for MathLive. Sends every self-contained region through a live field and back, compares
// the tree, and rescores the worksheets on the returned trees.
import { readFileSync, readdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import puppeteer from 'puppeteer-core';
import { runWorksheet } from '../../src/engine/evaluate.js';
import type { Content, Expr, Worksheet } from '../../src/model/ast.js';
import { compareResult } from '../../src/score/compare.js';
import { type XElement, importWorksheet } from '../../src/xmcd/import.js';
import { readTex, tex } from './latex.js';

const corpus = process.env.MATHMATH_CORPUS!;
const find = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  if (e.isDirectory()) return e.name.startsWith('.') ? [] : find(p);
  return e.name.toLowerCase().endsWith('.xmcd') ? [p] : [];
});
const norm = (e: unknown): string => JSON.stringify(e, (_, v) => (v?.k === 'block' && v.body.length === 1 ? v.body[0] : v));

interface Item { ws: number; content: Content; latex: string }
const sheets: Worksheet[] = [];
const items: Item[] = [];
for (const path of find(corpus)) {
  const xml = readFileSync(path, 'utf8');
  const ws = importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
  if (ws.otherRegions.reference || ws.componentOutputs.length || />(READRGB|READBIN|WRITERGB)</.test(xml)) continue;
  sheets.push(ws);
  for (const r of ws.regions) {
    const c = r.content;
    const e: Expr | null = c.k === 'define' ? c.value : c.k === 'eval' ? c.expr : null;
    if (e) items.push({ ws: sheets.length - 1, content: c, latex: tex(e) });
  }
}

const root = process.cwd();
const mime: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url!.split('?')[0]!);
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><title>rt</title><script type="module">
      import { MathfieldElement, convertLatexToMarkup } from '/nm/mathlive/mathlive.min.mjs';
      MathfieldElement.soundsDirectory = null;
      window.ml = { MathfieldElement, convertLatexToMarkup };
      window.ready = true;
    </script><math-field id="f" style="display:block"></math-field>`);
    return;
  }
  const path = url.startsWith('/nm/') ? join(root, 'node_modules', url.slice(4)) : '';
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as { port: number }).port;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.ready === true', { timeout: 20000 });

const returned = await page.evaluate(async (list: string[]) => {
  const f = document.getElementById('f') as HTMLElement & { setValue(v: string, o?: object): void; getValue(fmt?: string): string };
  const t = performance.now();
  const errors: Record<string, number> = {};
  let withErrors = 0;
  const out = list.map((l) => {
    // `latex` echoes the input. `latex-unstyled` serializes the parsed model, through the edit path.
    f.setValue('', { silenceNotifications: true });
    (f as any).insert(l, { format: 'latex', insertionMode: 'replaceAll', silenceNotifications: true });
    const errs = ((f as any).errors ?? []) as { code: string; arg?: string }[];
    if (errs.length) withErrors++;
    for (const e of errs) errors[`${e.code} ${e.arg ?? ''}`] = (errors[`${e.code} ${e.arg ?? ''}`] ?? 0) + 1;
    return f.getValue('latex-unstyled');
  });
  return { out, ms: performance.now() - t, errors, withErrors };
}, items.map((i) => i.latex));
console.log(`${items.length} regions through MathLive in ${(returned.ms / 1000).toFixed(1)} s`);
console.log(`regions with MathLive parse errors: ${returned.withErrors}`, JSON.stringify(returned.errors).slice(0, 300));

let same = 0;
let textSame = 0;
const reasons = new Map<string, number>();
const samples = new Map<string, string>();
returned.out.forEach((l2, n) => {
  const item = items[n]!;
  if (l2 === item.latex) textSame++;
  const c = item.content;
  const before = c.k === 'define' ? c.value : c.k === 'eval' ? c.expr : null;
  try {
    const back = readTex(l2);
    if (norm(back) === norm(before)) same++;
    else {
      const [x, y] = [norm(before), norm(back)];
      let i = 0;
      while (x[i] === y[i]) i++;
      const k = `tree: ${x.slice(Math.max(0, i - 10), i + 22)} / ${y.slice(Math.max(0, i - 10), i + 22)}`.replace(/-?\d+(\.\d+)?/g, '#');
      reasons.set(k, (reasons.get(k) ?? 0) + 1);
      if (!samples.has(k)) samples.set(k, `${item.latex.slice(0, 70)} => ${l2.slice(0, 70)}`);
    }
    if (c.k === 'define') c.value = back;
    else if (c.k === 'eval') c.expr = back;
  } catch (err) {
    const k = (err as Error).message.replace(/ at \d+$/, '');
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
    if (!samples.has(k)) samples.set(k, `${item.latex.slice(0, 90)}  =>  ${l2.slice(0, 90)}`);
  }
});
console.log(`same tree ${same}/${items.length}, same text ${textSame}/${items.length}`);
for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String(v).padStart(5), k.slice(0, 60), '::', samples.get(k));

let match = 0;
let scored = 0;
for (const ws of sheets) {
  for (const o of runWorksheet(ws)) {
    const c = o.region.content;
    if (c.k === 'other' || !c.stored) continue;
    scored++;
    try {
      const v = o.value ? compareResult(o.value, c.stored, 1e-9, o.unit) : { ok: false, reason: o.error?.message ?? 'no value' };
      if (v.ok) match++;
      else console.log('  miss:', 'reason' in v ? v.reason : '');
    } catch (err) {
      console.log('  miss:', (err as Error).message);
    }
  }
}
console.log(`rescored on returned trees: ${match}/${scored}`);
await browser.close();
server.close();
