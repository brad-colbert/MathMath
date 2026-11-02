// Drives the paper prototype with real input events in headless Chromium.
import { readFileSync, readdirSync, existsSync, statSync, createReadStream, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import * as esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';
import { type XElement, importWorksheet } from '../../src/xmcd/import.js';
import { target, tex } from '../editor/latex.js';

const out = process.argv[2]!;
const root = process.cwd();
const built = await esbuild.build({ entryPoints: ['spikes/paper/app.ts'], bundle: true, format: 'esm', write: false, platform: 'browser', logLevel: 'error' });
const app = built.outputFiles[0]!.text;
const mime: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.html': 'text/html' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url!.split('?')[0]!);
  if (url === '/app.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(app);
  if (url === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync('spikes/paper/index.html'));
  const path = url.startsWith('/nm/') ? join(root, 'node_modules', url.slice(4)) : '';
  if (!path || !existsSync(path) || !statSync(path).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--window-size=1000,1100'], defaultViewport: { width: 1000, height: 1100 } });
const open = async () => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String((e as Error).stack ?? e).split('\n').slice(0, 5).join(' | ').slice(0, 420)));
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
  await page.goto(url);
  await page.waitForFunction('!!window.app', { timeout: 20000 });
  return page;
};

const PT = 96 / 72;
const CLICK_TO_KEY = Number(process.env.CLICK_TO_KEY ?? 150);
const SHIFTED: Record<string, string> = { ':': 'Semicolon', '^': 'Digit6', '(': 'Digit9', ')': 'Digit0', '*': 'Digit8', '+': 'Equal', _: 'Minus' };
/** Types as a real keyboard does: shifted characters arrive as Shift plus the base key, 40 ms apart. */
async function send(p: Awaited<ReturnType<typeof open>>, text: string): Promise<void> {
  for (const ch of text) {
    if (SHIFTED[ch]) {
      await p.keyboard.down('Shift');
      await p.keyboard.press(SHIFTED[ch] as never);
      await p.keyboard.up('Shift');
    } else if (ch === '/') await p.keyboard.press('Slash');
    else if (ch === '=') await p.keyboard.press('Equal');
    else if (/[A-Z]/.test(ch)) {
      await p.keyboard.down('Shift');
      await p.keyboard.press(`Key${ch}` as never);
      await p.keyboard.up('Shift');
    } else await p.keyboard.press(ch as never);
    await new Promise((r) => setTimeout(r, 40));
  }
}
const page = await open();
const box = await page.evaluate(() => { const r = document.getElementById('page')!.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
console.log(`page ${(box.w / PT).toFixed(1)} x ${(box.h / PT).toFixed(1)} pt`);
const click = (left: number, top: number) => page.mouse.click(box.x + left * PT, box.y + top * PT);
async function type(left: number, top: number, keys: (string | { press: string })[]): Promise<void> {
  await click(left, top);
  await new Promise((r) => setTimeout(r, CLICK_TO_KEY));
  for (const k of keys) {
    if (typeof k === 'string') await send(page, k);
    else await page.keyboard.press(k.press as never);
  }
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 60));
}
const R = { press: 'ArrowRight' };
await type(72, 72, ['x:3']);
await type(72, 108, ['x^2', R, '+1/2', R, '=']);
await type(72, 288, ['y:=4']);
await type(72, 144, ['f(y', R, ':y*2']);
await type(72, 180, ['f(x', R, '=']);
await type(72, 216, ['speed:5']);
await type(72, 252, ['speed*2=']);
await type(300, 72, ['L:3*m']);
await type(300, 108, ['sqrt(16', R, '=']);
await type(300, 144, ['2x=']);
await type(300, 180, ['sin(0', R, '=']);
await type(300, 216, ['y^2', R, '-pi=']);
const typed = await page.evaluate(() => (window.app as any).items.map((i: any) => ({ left: i.left, top: i.top, latex: i.latex, result: i.result, error: i.error })));
for (const t of typed) console.log(`  (${t.left},${t.top}) ${t.latex}  ->  ${t.result ?? ''} ${t.error ? `ERROR ${t.error}` : ''}`);

// Program editing: add a line to a vertical-bar program in a live field, with real keys.
const prog = await open();
const edited = await prog.evaluate(async () => {
  const app = window.app as any;
  app.load([{ left: 72, top: 72, latex: '\\left|\\begin{array}{l}a\\gets 1\\\\a+1\\end{array}\\right.' }]);
  app.activateIndex(0);
  const f = app.field();
  f.executeCommand('moveToMathfieldStart');
  f.executeCommand('moveToNextPlaceholder');
  f.executeCommand('moveToNextChar');
  f.executeCommand('moveToNextChar');
  f.executeCommand('addRowAfter');
  f.insert('b\\gets 2', { format: 'latex' });
  return { value: f.getValue('latex-unstyled'), errors: f.errors.length };
});
console.log('program edit:', JSON.stringify(edited));

// Space growing the selection.
const grow = await open();
const steps = await grow.evaluate(() => {
  const app = window.app as any;
  app.load([{ left: 72, top: 72, latex: 'a+\\frac{b+c}{\\sqrt{d+e}}' }]);
  app.activateIndex(0);
  const f = app.field();
  f.executeCommand('moveToMathfieldEnd');
  f.executeCommand('moveToPreviousChar');
  f.executeCommand('moveToPreviousChar');
  const seen: string[] = [];
  for (let i = 0; i < 7; i++) {
    app.grow(f);
    seen.push(f.getValue(f.selection, 'latex-unstyled'));
  }
  return seen;
});
console.log('space steps:', JSON.stringify(steps));

// Largest self-contained sheet, as loaded regions.
const corpus = process.env.MATHMATH_CORPUS!;
const find = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  if (e.isDirectory()) return e.name.startsWith('.') ? [] : find(p);
  return e.name.toLowerCase().endsWith('.xmcd') ? [p] : [];
});
let largest: { left: number; top: number; latex: string }[] = [];
let all = 0;
for (const path of find(corpus)) {
  const xml = readFileSync(path, 'utf8');
  const ws = importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
  if (ws.otherRegions.reference || ws.componentOutputs.length || />(READRGB|READBIN|WRITERGB)</.test(xml)) continue;
  const list = ws.regions.flatMap((r) => {
    const c = r.content;
    if (c.k === 'define') return [{ left: r.left, top: r.top, latex: `${target(c.target)}:=${tex(c.value)}` }];
    if (c.k === 'eval') return [{ left: r.left, top: r.top, latex: `${tex(c.expr)}=` }];
    return [];
  });
  all += list.length;
  if (list.length > largest.length) largest = list;
}
const big = await open();
const repeated = Array.from({ length: Math.ceil(252 / largest.length) }, () => largest).flat().slice(0, 252);
const perf = await big.evaluate((list) => {
  const app = window.app as any;
  const load = app.load(list);
  const times: number[] = [];
  for (const n of [0, 40, 80, 120, 160, 200, 240]) times.push(app.activateIndex(n));
  app.commit();
  const t = performance.now();
  app.recompute();
  return { load, activate: times, recompute: performance.now() - t };
}, repeated);
console.log(`largest self-contained sheet ${largest.length} regions, tested with ${repeated.length}`);
console.log(`full recompute and redraw ${perf.recompute.toFixed(0)} ms`);
console.log(`load ${perf.load.ms.toFixed(0)} ms; activation ${perf.activate.map((t: number) => t.toFixed(1)).join(', ')} ms`);
const shown = await open();
await shown.evaluate((list) => (window.app as any).load(list), largest);
await new Promise((r) => setTimeout(r, 800));
const bad = await shown.evaluate(() => {
  const app = window.app as any;
  const page = document.getElementById('page')!.getBoundingClientRect();
  let off = 0;
  for (const i of app.items) {
    const r = i.el.getBoundingClientRect();
    if (Math.abs(r.left - page.left - i.left * 96 / 72) > 0.5 || Math.abs(r.top - page.top - i.top * 96 / 72) > 0.5) off++;
  }
  return { off, count: app.items.length };
});
console.log(`positions off by more than 0.5 px: ${bad.off} of ${bad.count}`);
await page.bringToFront();
await page.screenshot({ path: `${out}/typed.png` as `${string}.png`, fullPage: false });
await shown.bringToFront();
await shown.screenshot({ path: `${out}/sheet.png` as `${string}.png`, fullPage: false });
const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
writeFileSync(`${out}/typed.pdf`, pdf);
console.log(`pdf pages: ${(Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length}`);
await browser.close();
server.close();
