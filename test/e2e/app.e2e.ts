// Drives the production build in headless Chromium with real input events. Everything here is
// invented: corpus checks live in src/cli. Pass a folder to keep screenshots outside the repository.
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { CSP } from '../../vite.config.js';

const shots = process.argv[2];
execSync('npx vite build --logLevel error', { stdio: 'inherit' });
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url!.split('?')[0]!);
  const path = join('dist', url === '/' ? 'index.html' : url);
  if (!existsSync(path) || !statSync(path).isFile()) return void res.writeHead(404).end();
  // A header, as a real server sends: a <meta> policy doesn't reach workers.
  res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream', 'content-security-policy': CSP });
  createReadStream(path).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1000, height: 1200 },
});

const PT = 96 / 72;
const problems: string[] = [];
let passed = 0;
let failed = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHIFTED: Record<string, string> = {
  ':': 'Semicolon', '^': 'Digit6', '(': 'Digit9', ')': 'Digit0', '*': 'Digit8', '+': 'Equal', '{': 'BracketLeft', '}': 'BracketRight', '"': 'Quote',
  '&': 'Digit7', '?': 'Slash',
};
const PLAIN: Record<string, string> = {
  '/': 'Slash', '=': 'Equal', '-': 'Minus', '.': 'Period', ';': 'Semicolon', '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma', ' ': 'Space',
};

async function fresh(): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${String((e as Error).stack ?? e).slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('dialog', (d) => void d.accept());
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
  await page.goto(url);
  await page.waitForFunction('!!window.mathmath');
  await page.bringToFront();
  return page;
}

async function keys(page: Page, text: string): Promise<void> {
  for (const ch of text) {
    if (SHIFTED[ch]) {
      await page.keyboard.down('Shift');
      await page.keyboard.press(SHIFTED[ch] as never);
      await page.keyboard.up('Shift');
    } else if (PLAIN[ch]) await page.keyboard.press(PLAIN[ch] as never);
    else if (/[A-Z]/.test(ch)) {
      await page.keyboard.down('Shift');
      await page.keyboard.press(`Key${ch}` as never);
      await page.keyboard.up('Shift');
    } else await page.keyboard.press(ch as never);
    await sleep(25);
  }
}

const sheetBox = (page: Page) => page.evaluate(() => {
  const r = document.getElementById('sheet')!.getBoundingClientRect();
  return { x: r.left, y: r.top };
});

async function clickAt(page: Page, left: number, top: number): Promise<void> {
  const b = await sheetBox(page);
  await page.mouse.click(b.x + left * PT, b.y + top * PT);
  await sleep(120);
}

async function type(page: Page, left: number, top: number, ...parts: (string | { press: string; ctrl?: boolean })[]): Promise<void> {
  await clickAt(page, left, top);
  for (const p of parts) {
    if (typeof p === 'string') await keys(page, p);
    else {
      if (p.ctrl) await page.keyboard.down('Control');
      await page.keyboard.press(p.press as never);
      if (p.ctrl) await page.keyboard.up('Control');
    }
  }
  await page.keyboard.press('Escape');
  await sleep(50);
}

const R = { press: 'ArrowRight' };
const G = { press: 'KeyG', ctrl: true };
const idle = (page: Page) => page.waitForFunction('!window.mathmath.doc.computing', { timeout: 15000 });
const shown = async (page: Page) => (await idle(page), page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => (e.innerText ?? '').replace(/\s+/g, ' ').trim())));
const model = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).mathmath.doc.ws)));

function check(name: string, ok: boolean, detail: unknown = ''): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 300)}`}`);
}

// Click anywhere, type, and see the answer.
{
  const page = await fresh();
  await type(page, 72, 72, 'x:3');
  await type(page, 72, 108, 'x^2', R, '+1/2', R, '=');
  await type(page, 72, 144, 'f(y', R, ':y*2');
  await type(page, 72, 180, 'f(x', R, '=');
  await type(page, 72, 216, 'speed:5');
  await type(page, 72, 252, 'speed*2=');
  await type(page, 300, 72, 'sqrt(16', R, '=');
  await type(page, 300, 108, 'sin(0', R, '=');
  await type(page, 300, 144, '2x=');
  await type(page, 300, 180, 'alpha:1');
  await type(page, 300, 216, 'alpha+1=');
  const ws = await model(page);
  const out = (id: number): string => ws.regions[id]?.content?.k ?? '';
  check('every typed region was understood', ws.regions.every((r: any) => r.content.k !== 'draft'), ws.regions.map((r: any) => r.content.latex).filter(Boolean));
  void out;
  const text = (await shown(page)).join(' | ');
  for (const want of ['9.5', '= 6', '= 10', '= 4', '= 0']) check(`shows ${want}`, text.replace(/\s/g, '').includes(want.replace(/\s/g, '')), text);
  check('new regions sit on the snap grid', ws.regions.every((r: any) => r.alignX % 6 === 0 && r.alignY % 6 === 0));
  if (shots) await page.screenshot({ path: `${shots}/typing.png` as `${string}.png` });
  await page.close();
}

// Ctrl+G turns the letter before the caret Greek, or back, as in Mathcad.
{
  const page = await fresh();
  await type(page, 72, 72, 'D', G, 'x:2');
  await type(page, 72, 108, 'q', G, ':3');
  await type(page, 72, 144, 'D', G, 'x*q', G, '=');
  await type(page, 72, 180, 'a', G, G, 'b:5');
  await type(page, 72, 216, 'ab=');
  const ws = await model(page);
  const names = ws.regions.map((r: any) => r.content.target?.name ?? r.content.expr?.k);
  check('Ctrl+G makes Δx and θ', names[0] === 'Δx' && names[1] === 'θ', names);
  check('a name can mix Greek and Latin letters', (await shown(page)).join(' | ').replace(/\s/g, '').includes('=6'), await shown(page));
  check('Ctrl+G twice turns the letter back', names[3] === 'ab' && (await shown(page)).join('').replace(/\s/g, '').includes('=5'), names);
  await page.close();
}

// Editing above changes what's below.
{
  const page = await fresh();
  await type(page, 72, 72, 'x:3');
  await type(page, 72, 108, 'x+1=');
  check('computes', (await shown(page)).join('').replace(/\s/g, '').includes('=4'));
  await clickAt(page, 74, 70);
  await page.keyboard.press('Backspace');
  await keys(page, '9');
  await page.keyboard.press('Escape');
  await sleep(60);
  const text = (await shown(page)).join('|').replace(/\s/g, '');
  check('editing a definition recomputes below it', text.includes('=10') || text.includes('x+1=10'), text);
  await page.close();
}

// Math with no = is for reading.
{
  const page = await fresh();
  await type(page, 72, 72, 'a+b');
  const ws = await model(page);
  check('math with no = shows no result and no error', ws.regions[0]?.content.k === 'show' && (await page.evaluate(() => document.querySelectorAll('.region.error').length)) === 0, ws.regions[0]?.content);
  await page.close();
}

// Top to bottom order.
{
  const page = await fresh();
  await type(page, 72, 72, 'y=');
  await type(page, 72, 108, 'y:4');
  const ws = await model(page);
  await idle(page);
  const errors = await page.evaluate(() => document.querySelectorAll('.region.error').length);
  check('a use above its definition is an error', errors === 1, ws.regions.length);
  await page.close();
}

// A typing mistake never loses anything.
{
  const page = await fresh();
  await type(page, 72, 72, '1+');
  const ws = await model(page);
  check('unreadable math is kept as typed', ws.regions[0]?.content.k === 'draft' && ws.regions[0].content.latex.includes('1+'), ws.regions[0]?.content);
  check('it shows as a draft', (await page.evaluate(() => document.querySelectorAll('.region.draft').length)) === 1);
  await page.close();
}

// An empty click leaves nothing behind.
{
  const page = await fresh();
  await clickAt(page, 100, 100);
  await page.keyboard.press('Escape');
  await clickAt(page, 200, 200);
  await page.keyboard.press('Escape');
  const ws = await model(page);
  check('clicking without typing adds no regions', ws.regions.length === 0, ws.regions);
  check('and does not mark the sheet as changed', !(await page.evaluate(() => (window as any).mathmath.doc.dirty)));
  await page.close();
}

// Programs, typed with keys.
{
  const page = await fresh();
  await type(page, 72, 72, 'f(n', R, ':]a{1', { press: 'ArrowDown' }, 'a+n');
  await type(page, 72, 144, 'f(2', R, '=');
  const ws = await model(page);
  const kinds = ws.regions.map((r: any) => (r.content.k === 'draft' ? `draft ${r.content.latex}` : r.content.k));
  const text = (await shown(page)).join('|').replace(/\s/g, '');
  check('a program typed with ] and { runs', text.includes('=3'), { kinds, text });
  await page.close();
}

// Mathcad's keys.
{
  const page = await fresh();
  await type(page, 72, 72, 'i:0;2');
  await type(page, 72, 108, 'v[i', R, ':i*2');
  await type(page, 72, 144, 'v[1', R, '=');
  await type(page, 72, 180, 'x.max:7');
  await type(page, 72, 216, 'x.max+1=');
  const ws = await model(page);
  const text = (await shown(page)).join('|').replace(/\s/g, '');
  check('; makes a range, and [ makes an index', text.includes('=2'), { text, regions: ws.regions.map((r: any) => r.content) });
  check('. starts a literal subscript', ws.regions[3]?.content.target?.name === 'x.max', ws.regions[3]?.content);
  check('which works as a name', text.includes('=8'), text);
  await page.close();
}

// Integrals, derivatives, sums and products, by key and by button.
{
  const T = { press: 'Tab' };
  const press = (p: Page, label: string) => p.evaluate((l) => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === l)!.click();
  }, label);
  const page = await fresh();
  await type(page, 72, 72, '&0', T, '3', T, 'x^2', R, T, 'x=');
  await type(page, 72, 120, 'a:2');
  await type(page, 72, 156, '?a', T, 'a^3', R, '=');
  await clickAt(page, 72, 204);
  await press(page, 'Σ');
  await keys(page, 'k');
  await page.keyboard.press('Tab');
  await keys(page, '1');
  await page.keyboard.press('Tab');
  await keys(page, '4');
  await page.keyboard.press('Tab');
  await keys(page, 'k=');
  await page.keyboard.press('Escape');
  await sleep(60);
  await clickAt(page, 72, 252);
  await press(page, 'Π');
  await keys(page, 'k');
  await page.keyboard.press('Tab');
  await keys(page, '1');
  await page.keyboard.press('Tab');
  await keys(page, '4');
  await page.keyboard.press('Tab');
  await keys(page, 'k=');
  await page.keyboard.press('Escape');
  await sleep(60);
  await idle(page);
  const ws = await model(page);
  const text = (await shown(page)).map((s) => s.replace(/\s/g, ''));
  const drafts = ws.regions.filter((r: any) => r.content.k === 'draft').map((r: any) => r.content.latex);
  check('none of them is left as a draft', drafts.length === 0, drafts);
  check('an integral from 0 to 3 of x^2 is 9', text[0]?.endsWith('=9') === true, text);
  check('the derivative of a^3 at 2 is 12', text[2]?.endsWith('=12') === true, text);
  check('the sum of 1 to 4 is 10', text[3]?.endsWith('=10') === true, text);
  check('the product of 1 to 4 is 24', text[4]?.endsWith('=24') === true, text);
  await page.close();
}

// Symbolic evaluation.
{
  const arrow = async (p: Page): Promise<void> => {
    await p.keyboard.down('Control');
    await p.keyboard.press('Period');
    await p.keyboard.up('Control');
    await sleep(60);
  };
  const keyword = (p: Page, name: string) => p.evaluate((n) => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((b) => b.textContent === n)!.click();
  }, name);
  const sym = async (p: Page, left: number, top: number, ...parts: (string | { press: string })[]): Promise<void> => {
    await clickAt(p, left, top);
    for (const part of parts) {
      if (typeof part === 'string') await keys(p, part);
      else await p.keyboard.press(part.press as never);
    }
    await arrow(p);
  };
  const text = async (p: Page): Promise<string[]> => {
    await p.waitForFunction('!window.mathmath.doc.computing', { timeout: 30000 });
    await sleep(40);
    return (await shown(p)).map((s) => s.replace(/\s/g, ''));
  };


  const page = await fresh();
  await sym(page, 60, 60, '3*m+2*m');
  await type(page, 60, 96, 'c:1/3');
  await sym(page, 60, 132, 'c+1');
  await type(page, 60, 168, 'f(u', R, ':u^2');
  await sym(page, 60, 204, 'f(x+1', R);
  await sym(page, 60, 240, 'g(x', R);
  await sym(page, 60, 276, '1/0');
  await sym(page, 60, 312, 'sqrt(x+sin(x', R, R, { press: 'ArrowRight' });
  const shownSym = await text(page);
  check('units are symbols under an arrow', shownSym[0]?.endsWith('→5⋅m') === true || shownSym[0]?.includes('→5') === true, shownSym[0]);
  const exact = await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    return d.outcomes.get(d.ws.regions[2].id)?.value;
  });
  check('definitions substitute exactly', exact === '\\frac{4}{3}', exact);
  check('sheet functions inline', /→\(x\+1\)2$/.test(shownSym[4] ?? ''), shownSym[4]);
  check('undefined functions stay', shownSym[5]?.endsWith('→g(x)') === true, shownSym[5]);
  check('1/0 is an error', (await page.evaluate(() => document.querySelectorAll('.region.error').length)) === 1, await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.error')].map((e) => e.title)));
  await page.close();

  const p2 = await fresh();
  await clickAt(p2, 60, 60);
  await keys(p2, 'h(x');
  await p2.keyboard.press('ArrowRight');
  await keys(p2, ':?x');
  await p2.keyboard.press('Tab');
  await keys(p2, 'x^3');
  await p2.keyboard.press('ArrowRight');
  await arrow(p2);
  await type(p2, 60, 108, 'h(2', R, '=');
  await clickAt(p2, 60, 156);
  await keys(p2, 'x^2+2x+1');
  await keyword(p2, 'factor');
  await sleep(80);
  await clickAt(p2, 60, 192);
  await keys(p2, '(x+1');
  await p2.keyboard.press('ArrowRight');
  await keys(p2, '^2');
  await p2.keyboard.press('ArrowRight');
  await keyword(p2, 'expand');
  await sleep(80);
  await clickAt(p2, 60, 228);
  await keys(p2, 'x^2');
  await p2.keyboard.press('ArrowRight');
  await keys(p2, '=9');
  await keyword(p2, 'solve');
  await sleep(40);
  await keys(p2, 'x');
  await p2.keyboard.press('Escape');
  await sleep(60);
  await clickAt(p2, 60, 264);
  await keys(p2, 'sqrt(y^2');
  await p2.keyboard.press('ArrowRight');
  await p2.keyboard.press('ArrowRight');
  await keyword(p2, 'assume');
  await sleep(40);
  await keys(p2, 'y>0');
  await p2.keyboard.press('Escape');
  await sleep(60);
  await sym(p2, 60, 300, 'sqrt(y^2', R, R);
  const after = await text(p2);
  const ws2 = await model(p2);
  check('an arrow on a definition defines the result', after[0]?.includes('→3') === true && after[1]?.endsWith('=12') === true, after.slice(0, 2));
  check('factor', after[2]?.includes('→(x+1)2') === true, after[2]);
  check('expand', after[3]?.includes('→') === true && !after[3]!.endsWith('→'), after[3]);
  check('solve finds both roots', after[4]?.includes('3') === true && after[4]!.includes('−3'), after[4]);
  check('assume applies', after[5]?.endsWith('→y') === true, { shown: after[5], c: ws2.regions[5]?.content });
  check('and does not leak into the next region', after[6]?.includes('∣y∣') === true || after[6]?.includes('|y|') === true, after[6]);
  await page.evaluate(() => 0).catch(() => 0);

  // A saved sheet keeps its arrows and works them out again.
  const savedSheet = await p2.evaluate(() => (window as any).mathmath.save());
  const p3 = await fresh();
  await p3.evaluate((t) => (window as any).mathmath.load('s.mathmath', t), savedSheet);
  const reopened = await text(p3);
  check('a reopened sheet recomputes its arrows', reopened[0]?.includes('→3') === true && reopened[1]?.endsWith('=12') === true, reopened.slice(0, 2));
  await p2.close();
  await p3.close();

  // No closed form must never look like an answer.
  const p4 = await fresh();
  await p4.evaluate(() => {
    const m = (window as any).mathmath;
    const body = { k: 'op', op: 'sqrt', args: [{ k: 'op', op: 'plus', args: [{ k: 'id', name: 'x' }, { k: 'call', fn: { k: 'id', name: 'sin' }, args: [{ k: 'id', name: 'x' }] }] }] };
    m.load('n.mathmath', JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: { ...m.doc.ws, regions: [{ id: '1', left: 60, top: 60, alignX: 60, alignY: 68, disabled: false, content: { k: 'sym', target: null, global: false, commands: [], stored: null, expr: { k: 'bigop', op: 'integral', varName: 'x', body, lo: null, hi: null } } }] },
    }));
  });
  const none = await text(p4);
  const state = await p4.evaluate(() => {
    const e = document.querySelector<HTMLElement>('.region')!;
    return { title: e.title, stale: e.classList.contains('stale') };
  });
  check('no closed form is shown as unanswered, not as an answer', none[0]?.endsWith('→') === true && state.stale && state.title.includes('closed form'), { none, state });
  await p4.close();

  // A ( in an integrand stays in the integrand.
  const p8 = await fresh();
  await clickAt(p8, 60, 60);
  await p8.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === '∫ dx')!.click();
  });
  await sleep(50);
  await keys(p8, 'sin(x');
  await p8.keyboard.press('Tab');
  await keys(p8, 'x');
  await arrow(p8);
  const fence = await text(p8);
  check('an unclosed ( in an integrand does not swallow the dx', fence[0]?.endsWith('→−cos(x)') === true, { fence, c: (await model(p8)).regions[0]?.content });
  await clickAt(p8, 60, 120);
  await arrow(p8);
  await p8.keyboard.press('Escape');
  await sleep(60);
  check('an arrow on an empty region does nothing', (await model(p8)).regions.length === 1, (await model(p8)).regions.length);
  await p8.close();

  // A calculation that fails says so and doesn't hang.
  const p9 = await fresh();
  await p9.evaluate(() => {
    const w = window as any;
    const Real = w.Worker;
    w.Worker = function Stub(this: unknown, url: string | URL, options: WorkerOptions) {
      if (String(url).includes('/giac/')) return new Real(url, options);
      const fake: any = { onmessage: null, onerror: null, postMessage() { setTimeout(() => fake.onerror?.({ message: 'broken on purpose' }), 0); }, terminate() {} };
      return fake;
    };
  });
  await type(p9, 60, 60, 'x:1');
  await sleep(100);
  const said = await p9.evaluate(() => ({ busy: (window as any).mathmath.doc.computing, text: document.querySelector('.busy')?.textContent }));
  check('a failed calculation ends and reports itself', !said.busy && said.text?.includes('broken on purpose') === true, said);
  await p9.close();

  // Definitions apply to keyword variables, as in Mathcad.
  const p6 = await fresh();
  await type(p6, 60, 60, 'x:5');
  await clickAt(p6, 60, 96);
  await keys(p6, 'x^2');
  await p6.keyboard.press('ArrowRight');
  await keys(p6, '=9');
  await keyword(p6, 'solve');
  await sleep(40);
  await keys(p6, 'x');
  await p6.keyboard.press('Escape');
  await sleep(60);
  await clickAt(p6, 60, 132);
  await keys(p6, 'x^2');
  await p6.keyboard.press('ArrowRight');
  await keys(p6, '+2x');
  await keyword(p6, 'coeffs');
  await sleep(40);
  await keys(p6, 'x');
  await p6.keyboard.press('Escape');
  await sleep(60);
  const defined = await text(p6);
  const errors = await p6.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.error')].map((e) => e.title));
  check('solving for a variable with a value is an error', errors.length === 1 && errors[0]!.includes('no value on the sheet'), errors);
  check('coeffs on a variable with a value gives the number', defined[2]?.endsWith('→35') === true, defined[2]);
  await p6.close();

  // A stuck engine call can be stopped, and doesn't block what comes next.
  const p7 = await fresh();
  await p7.evaluate(() => {
    const w = window as any;
    const Real = w.Worker;
    w.__terminated = 0;
    w.__Real = Real;
    w.Worker = function Stub(this: unknown, url: string | URL, options: WorkerOptions) {
      if (!String(url).includes('/giac/')) return new Real(url, options);
      const fake: any = { onmessage: null, onerror: null, postMessage() {}, terminate() { w.__terminated++; } };
      setTimeout(() => fake.onmessage?.({ data: { ready: true } }), 0);
      return fake;
    };
  });
  await sym(p7, 60, 60, 'x+x');
  await sleep(300);
  check('a stuck engine call shows as calculating', await p7.evaluate(() => (window as any).mathmath.doc.computing));
  await p7.keyboard.press('Escape');
  await sleep(150);
  const stopped = await p7.evaluate(() => ({ busy: (window as any).mathmath.doc.computing, killed: (window as any).__terminated }));
  check('Esc stops it, ending the engine call too', !stopped.busy && stopped.killed === 1, stopped);
  await p7.evaluate(() => {
    (window as any).Worker = (window as any).__Real;
  });
  await sym(p7, 60, 108, 'y+y');
  const recovered = await text(p7);
  check('and the next arrow works', recovered.some((t) => t.includes('→2')), recovered);
  await p7.close();

  // If the engine can't load, the region says so and nothing hangs.
  const p5 = await fresh();
  await p5.setRequestInterception(true);
  p5.on('request', (r) => (r.url().includes('/giac/') ? void r.abort() : void r.continue()));
  const before = problems.length;
  await sym(p5, 60, 60, 'x+x');
  await text(p5);
  const down = await p5.evaluate(() => {
    const e = document.querySelector<HTMLElement>('.region')!;
    return { error: e.classList.contains('error'), title: e.title };
  });
  check('a failed engine is reported on the region', down.error && down.title.includes('algebra engine'), down);
  problems.length = before;
  await p5.close();
}

// Plots.
{
  const plotAt = async (p: Page, left: number, top: number, ys: string, x: string): Promise<void> => {
    await clickAt(p, left, top);
    await keys(p, '@');
    await sleep(80);
    await keys(p, ys);
    await p.keyboard.press('Tab');
    await sleep(60);
    await keys(p, x);
    await p.keyboard.press('Escape');
    await sleep(80);
  };
  const plotInfo = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.plot')].map((el) => ({
    paths: [...el.querySelectorAll('path')].map((d) => (d.getAttribute('d')!.match(/[ML]/g) ?? []).length),
    dots: el.querySelectorAll('circle').length,
    ticks: [...el.querySelectorAll('text')].map((t) => t.textContent),
    problem: el.querySelector('.plot-problem')?.textContent ?? '',
    swatches: el.querySelectorAll('.ylabel svg').length,
    width: el.getBoundingClientRect().width,
  })));
  const idleP = (p: Page) => p.waitForFunction('!window.mathmath.doc.computing', { timeout: 20000 });

  const page = await fresh();
  await type(page, 60, 60, 'x:0;10');
  await plotAt(page, 60, 96, 'x^2', 'x');
  await idleP(page);
  let info = await plotInfo(page);
  let ws = await model(page);
  check('@ makes a plot from typed y and x', ws.regions[1]?.content.k === 'plot' && ws.regions[1].content.ys.length === 1 && ws.regions[1].content.x?.name === 'x', ws.regions[1]?.content);
  check('it draws one point per range value', info[0]?.paths[0] === 11, info[0]);
  const ends = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('.region.plot [data-slot]')].slice(0, 6).map((e) => [e.dataset.slot, e.textContent])));
  check('ticks are round numbers inside the axis', ['20', '40', '60', '80'].every((t) => info[0]?.ticks.includes(t)), info[0]?.ticks);
  check('and the ends show the limits, rounded out to cover the data', ends.ymin === '0' && ends.ymax === '100' && ends.xmin === '0' && ends.xmax === '10', ends);
  check('a single trace needs no legend swatch', info[0]?.swatches === 0);

  // Several traces, separated by commas, each with its own line in the legend.
  await type(page, 300, 60, 't:0,0.1;6');
  await plotAt(page, 300, 96, 'sin(t),cos(t)', 't');
  await idleP(page);
  info = await plotInfo(page);
  check('commas make several traces', info[1]?.paths.length === 2 && info[1].paths.every((n) => n === 61), info[1]);
  check('each trace is labelled with its own line style', info[1]?.swatches === 2);
  check('and the calculation did not fail', !(await page.evaluate(() => document.querySelector('.busy')?.textContent ?? '')).includes('failed'));

  // A limit typed on the axis replaces the automatic one.
  const lim = await page.evaluate(() => {
    const el = document.querySelectorAll<HTMLElement>('.region.plot')[0]!.querySelector<HTMLElement>('[data-slot="ymax"]')!;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(lim.x, lim.y);
  await sleep(120);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await keys(page, '50');
  await page.keyboard.press('Escape');
  await idleP(page);
  await sleep(60);
  ws = await model(page);
  info = await plotInfo(page);
  check('a typed limit sets the axis', ws.regions[1].content.yAxis.max?.v === 50 && !info[0]!.ticks.includes('100'), { max: ws.regions[1].content.yAxis.max, ticks: info[0]?.ticks });

  // Log axes, from the Plot menu.
  const box = await page.evaluate(() => {
    const r = document.querySelectorAll<HTMLElement>('.region.plot')[0]!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await sleep(60);
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((b) => b.textContent === 'Log y axis')!.click();
  });
  await idleP(page);
  await sleep(60);
  info = await plotInfo(page);
  ws = await model(page);
  check('the Plot menu sets a log axis', ws.regions[1].content.yAxis.log === true, ws.regions[1].content.yAxis);
  check('a log axis has decade ticks and skips zero', info[0]!.ticks.includes('10') && info[0]!.paths[0] === 10, info[0]);

  // Resizing by the corner handle, which lands on the grid.
  const handle = await page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('.region.plot .handle')!.getBoundingClientRect();
    return { x: r.left + 4, y: r.top + 4 };
  });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + 30, { steps: 5 });
  await page.mouse.up();
  await sleep(80);
  ws = await model(page);
  check('dragging the handle resizes a plot, on the grid', ws.regions[1].content.width > 216 && ws.regions[1].content.width % 6 === 0, ws.regions[1].content.width);

  // A saved plot comes back.
  const saved = await page.evaluate(() => (window as any).mathmath.save());
  const again = await fresh();
  await again.evaluate((t) => (window as any).mathmath.load('p.mathmath', t), saved);
  await idleP(again);
  await sleep(80);
  check('a saved plot opens and redraws', (await plotInfo(again)).length === 2 && (await plotInfo(again))[1]!.paths.length === 2);

  // Printing keeps plots as vectors: their tick labels are text in the PDF.
  if (shots) {
    const pdf = await again.pdf({ preferCSSPageSize: true, printBackground: true });
    writeFileSync(`${shots}/plots.pdf`, pdf);
    const text = execSync(`pdftotext ${shots}/plots.pdf -`).toString();
    const images = execSync(`pdfimages -list ${shots}/plots.pdf`).toString().trim().split('\n').length - 2;
    check('printed plots are vector graphics, with real text', text.includes('10') && text.includes('0.5') && images === 0, { images });
    await again.screenshot({ path: `${shots}/plots.png` as `${string}.png` });
  }
  await again.close();

  // Undo removes a new plot.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await sleep(60);
  check('undo reverses a resize', (await model(page)).regions[1].content.width === 216);
  await page.close();

  // Vectors with no x, and mismatched lengths.
  const p2 = await fresh();
  await p2.evaluate(() => {
    const m = (window as any).mathmath;
    const vec = (items: number[]) => ({ k: 'matrix', rows: items.length, cols: 1, items: items.map((v) => ({ k: 'real', v })) });
    const plot = (id: string, top: number, x: unknown, ys: unknown[]) => ({
      id, left: 60, top, alignX: 60, alignY: top, disabled: false,
      content: { k: 'plot', x, ys, xAxis: { min: null, max: null, log: false }, yAxis: { min: null, max: null, log: false }, markers: true, width: 200, height: 140 },
    });
    m.load('v.mathmath', JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: { ...m.doc.ws, regions: [plot('1', 40, null, [vec([1, 4, 9])]), plot('2', 220, vec([1, 2]), [vec([1, 2, 3])])] },
    }));
  });
  await idleP(p2);
  await sleep(80);
  const vinfo = await plotInfo(p2);
  check('a vector plots against its index', vinfo[0]?.dots === 3, vinfo[0]);
  check('mismatched lengths say so on the plot', vinfo[1]?.problem.includes('x has 2 values and y has 3') === true, vinfo[1]?.problem);
  await p2.close();

  // A file from before plots existed still opens.
  const p3 = await fresh();
  await p3.evaluate(() => (window as any).mathmath.load('old.mathmath', JSON.stringify({ format: 'mathmath', version: 1, worksheet: { regions: [], texts: [] } })));
  await sleep(80);
  check('an older file still opens', (await model(p3)).opaque?.length === 0);
  await p3.close();
}

// Units.
{
  const answers = async (p: Page) => (await shown(p)).map((t) => t.replace(/\s/g, ''));
  const page = await fresh();
  await type(page, 60, 60, 'L:3*m');
  await type(page, 60, 96, 'L=');
  await type(page, 60, 132, 'q:2*W/m^2');
  await type(page, 60, 168, 'q=');
  await type(page, 60, 204, 'P:2*kg*m^2/s^3');
  await type(page, 60, 240, 'P=');
  let text = await answers(page);
  check('a length shows in metres', text[1]?.endsWith('=3m') === true, text[1]);
  const irradiance = await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    return d.outcomes.get(d.ws.regions[3].id)?.value;
  });
  check('irradiance shows as Mathcad writes it, in base units', irradiance === '2\\ \\frac{\\mathrm{kg}}{\\mathrm{s}^{3}}', irradiance);
  check('a dimension with a name shows that name', text[5]?.endsWith('=2W') === true, text[5]);

  // Clicking the answer chooses its unit.
  const at = await page.evaluate(() => {
    const el = document.querySelectorAll<HTMLElement>('.region')[1]!.querySelector<HTMLElement>('[data-slot="unit"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  check('the answer is a unit slot', at !== null);
  if (at) {
    await page.mouse.click(at.x, at.y);
    await sleep(120);
    await keys(page, 'cm');
    await page.keyboard.press('Escape');
    await sleep(60);
  }
  text = await answers(page);
  check('choosing cm shows the length in centimetres', text[1]?.endsWith('=300cm') === true, text[1]);
  // Editing the math keeps the unit.
  await clickAt(page, 62, 94);
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await keys(page, '*2');
  await page.keyboard.press('Escape');
  await sleep(60);
  text = await answers(page);
  const c = (await model(page)).regions[1].content;
  check('editing the math keeps the chosen unit', text[1]?.endsWith('=600cm') === true && c.unit?.name === 'cm', { text: text[1], unit: c.unit });
  await page.close();

  // An imported region with an override keeps it through an edit, and temperatures convert.
  const p2 = await fresh();
  await p2.evaluate(() => {
    const m = (window as any).mathmath;
    const id = (name: string) => ({ k: 'id', name });
    const mult = (a: unknown, b: unknown) => ({ k: 'op', op: 'mult', args: [a, b] });
    const r = (n: number, content: unknown) => ({ id: String(n), left: 60, top: 30 + n * 36, alignX: 60, alignY: 38 + n * 36, disabled: false, content });
    m.load('u.mathmath', JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: { ...m.doc.ws, regions: [
        r(1, { k: 'define', target: { k: 'var', name: 'd' }, value: mult({ k: 'real', v: 2 }, id('km')), global: false, stored: null, unit: null, shown: false }),
        r(2, { k: 'eval', expr: id('d'), stored: null, unit: id('m') }),
        r(3, { k: 'eval', expr: mult({ k: 'real', v: 300 }, id('K')), stored: null, unit: id('°C') }),
      ] },
    }));
  });
  text = await answers(p2);
  check('an override from a file shows', text[1]?.endsWith('=2000m') === true || text[1]?.endsWith('=2×103m') === true, text[1]);
  check('degrees Celsius take their offset', text[2]?.endsWith('=26.85°C') === true, text[2]);
  await clickAt(p2, 62, 104);
  await p2.keyboard.press('End');
  await p2.keyboard.press('ArrowLeft');
  await keys(p2, '*3');
  await p2.keyboard.press('Escape');
  await sleep(60);
  const kept = (await model(p2)).regions[1].content;
  check('an imported override survives editing the math', kept.unit?.name === 'm' && kept.expr.k === 'op', kept);
  await p2.close();
}

// Images.
{
  const pixelsAt = (p: Page, n = 0) => p.evaluate((i) => {
    const canvas = document.querySelectorAll<HTMLElement>('.region.image')[i]?.querySelector('canvas');
    if (!canvas) return null;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, data: [...data] };
  }, n);
  const page = await fresh();
  await type(page, 60, 60, 'M:');
  await clickAt(page, 62, 58);
  await page.keyboard.press('End');
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === 'Matrix')!.click();
  });
  await sleep(40);
  for (const v of ['0', '100', '200', '255']) {
    await keys(page, v);
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Escape');
  await sleep(60);
  await clickAt(page, 60, 120);
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === 'Image')!.click();
  });
  await sleep(60);
  await keys(page, 'M');
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.mathmath.doc.computing');
  await sleep(80);
  const px = await pixelsAt(page);
  check('a matrix shows as an image, pixel for element', px?.width === 2 && px.height === 2 && px.data[0] === 0 && px.data[4] === 100 && px.data[8] === 200 && px.data[12] === 255, px);
  // Color mode reads three blocks of columns.
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const region = m.doc.ws.regions.find((r: any) => r.content.k === 'image');
    m.doc.update(region, (c: any) => ({ ...c, mode: 'rgb' }));
  });
  await page.waitForFunction('!window.mathmath.doc.computing');
  await sleep(60);
  const bad = await page.evaluate(() => document.querySelector<HTMLElement>('.region.image')!.title);
  check('color mode needs three blocks, and says so', bad.includes('three equal blocks'), bad);
  await page.close();

  // Attaching a file, then reading it.
  const p2 = await fresh();
  const png = await p2.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 1;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 1, 1);
    g.fillStyle = '#0000ff';
    g.fillRect(1, 0, 1, 1);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  const folder = mkdtempSync(join(tmpdir(), 'mathmath-img-'));
  writeFileSync(join(folder, 'tiny.png'), Buffer.from(png, 'base64'));
  const menu = (p: Page, label: string) => p.evaluate((l) => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((x) => x.textContent === l)!.click();
  }, label);
  await clickAt(p2, 60, 60);
  const [chooser] = await Promise.all([p2.waitForFileChooser(), menu(p2, 'From this computer…')]);
  await chooser.accept([join(folder, 'tiny.png')]);
  await sleep(300);
  await keys(p2, 'P');
  await p2.keyboard.press('Escape');
  await sleep(60);
  const made = (await model(p2)).regions[0]?.content;
  check('loading a file adds readImage, assigned to the variable typed', made?.k === 'define' && made.target.name === 'P' && made.value.fn?.name === 'readImage' && made.value.args[0]?.v === 'tiny.png', made);
  await type(p2, 60, 120, 'P=');
  await p2.waitForFunction('!window.mathmath.doc.computing');
  await sleep(80);
  const read = (await shown(p2)).map((t) => t.replace(/[\s\u200b]/g, ''));
  check('an attached image reads as red, green and blue blocks', read[1]?.endsWith('=(2550000255)') === true, read);
  // A folder path in readImage is refused, with a reason.
  await clickAt(p2, 300, 60);
  await keys(p2, 'Q:readImage("C:/pics/tiny.png"');
  await p2.keyboard.press('Escape');
  await p2.waitForFunction('!window.mathmath.doc.computing');
  await sleep(60);
  const refused = await p2.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.error')].map((e) => e.title));
  check('readImage refuses a folder path', refused.some((t) => t.includes('not a folder path')), refused);
  // A web address must be https.
  await p2.evaluate(() => {
    window.prompt = () => 'http://example.com/a.png';
  });
  await menu(p2, 'From a web address…');
  await sleep(150);
  check('a web address must be https', ((await p2.evaluate(() => document.querySelector('.busy')?.textContent)) ?? '').includes('https://'));
  // It travels inside the saved file.
  const saved = await p2.evaluate(() => (window as any).mathmath.save());
  check('attached files are saved with the worksheet', JSON.parse(saved).worksheet.assets['tiny.png']?.mime === 'image/png');
  // A picture from a file sits on the page.
  const [pick] = await Promise.all([p2.waitForFileChooser(), p2.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((x) => x.textContent === 'Picture…')!.click();
  })]);
  await pick.accept([join(folder, 'tiny.png')]);
  await sleep(300);
  const pic = await p2.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('.region.opaque img');
    return img ? { src: img.src.slice(0, 22), ok: img.complete && img.naturalWidth === 2 } : null;
  });
  check('a picture from a file shows on the page', pic?.ok === true && pic.src.startsWith('data:image/png'), pic);
  await p2.close();
}

// Mathcad's file functions are grayed, with what to do instead.
{
  const page = await fresh();
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const r = (n: number, content: unknown) => ({ id: String(n), left: 60, top: 30 + n * 36, alignX: 60, alignY: 38 + n * 36, disabled: false, content });
    const read = { k: 'call', fn: { k: 'id', name: 'READRGB' }, args: [{ k: 'str', v: 'Z:\\home\\pics\\photo.jpg' }] };
    m.load('old.mathmath', JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: { ...m.doc.ws, regions: [
        r(1, { k: 'define', target: { k: 'var', name: 'I' }, value: read, global: false, stored: null, unit: null, shown: false }),
        r(2, { k: 'eval', expr: { k: 'op', op: 'mult', args: [{ k: 'id', name: 'I' }, { k: 'real', v: 2 }] }, stored: null, unit: null }),
      ] },
    }));
  });
  await page.waitForFunction('!window.mathmath.doc.computing');
  await sleep(60);
  const look = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => ({ stale: e.classList.contains('stale'), error: e.classList.contains('error'), title: e.title })));
  check('a Mathcad file function is grayed, with advice to use Files and readImage', look[0]?.stale === true && !look[0].error && look[0].title.includes('Files') && look[0].title.includes('readImage'), look[0]);
  check('and so is what depends on it', look[1]?.stale === true && look[1].title.includes('READRGB'), look[1]);
  await page.close();
}

// Data files and references: loaded with Files, found by name.
{
  const page = await fresh();
  const folder = mkdtempSync(join(tmpdir(), 'mathmath-data-'));
  writeFileSync(join(folder, 'points.csv'), '1,10\r\n2,20\r\n');
  const other = { format: 'mathmath', version: 1, worksheet: { regions: [
    { id: '1', left: 60, top: 60, alignX: 60, alignY: 68, disabled: false, content: { k: 'define', target: { k: 'var', name: 'gk' }, value: { k: 'real', v: 9.5 }, global: false, stored: null, unit: null, shown: false } },
    { id: '2', left: 60, top: 90, alignX: 60, alignY: 98, disabled: false, content: { k: 'define', target: { k: 'var', name: 'T' }, value: { k: 'call', fn: { k: 'id', name: 'readTable' }, args: [{ k: 'str', v: 'extra.csv' }] }, global: false, stored: null, unit: null, shown: false } },
  ] } };
  writeFileSync(join(folder, 'Constants.mathmath'), JSON.stringify(other));
  const fromComputer = async (file: string) => {
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.evaluate(() => {
      [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((x) => x.textContent === 'From this computer…')!.click();
    })]);
    await chooser.accept([join(folder, file)]);
    await sleep(300);
  };
  await clickAt(page, 60, 60);
  await fromComputer('points.csv');
  await keys(page, 'D');
  await page.keyboard.press('Escape');
  await type(page, 60, 120, 'D[1,1', R, '=');
  await idle(page);
  await sleep(80);
  const made = (await model(page)).regions[0]?.content;
  check('loading a data file adds readTable, assigned to the variable typed', made?.k === 'define' && made.value.fn?.name === 'readTable' && made.value.args[0]?.v === 'points.csv', made);
  const read = (await shown(page)).map((t) => t.replace(/[\s\u200b]/g, ''));
  const notes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => e.title));
  check('an attached data file reads as a matrix', read.some((t) => t.endsWith('=20')), { read, notes });
  // A reference to a sheet that isn't attached is grayed, with what to do.
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const ws = JSON.parse(m.save()).worksheet;
    ws.regions = [
      { id: '1', left: 60, top: 30, alignX: 60, alignY: 38, disabled: false, content: { k: 'include', file: 'Constants.mcd' } },
      { id: '2', left: 60, top: 80, alignX: 60, alignY: 88, disabled: false, content: { k: 'eval', expr: { k: 'id', name: 'gk' }, stored: null, unit: null } },
    ];
    m.load('refs.mathmath', JSON.stringify({ format: 'mathmath', version: 1, worksheet: ws }));
  });
  await idle(page);
  await sleep(80);
  const before = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => ({ stale: e.classList.contains('stale'), title: e.title, text: e.textContent })));
  const ref = before.find((r) => (r.text ?? '').includes('Reference'));
  check('a reference shows its file name, grayed until the sheet is attached', ref?.stale === true && ref.title.includes('Files') && (ref.text ?? '').includes('Constants'), before);
  await fromComputer('Constants.mathmath');
  await idle(page);
  await sleep(80);
  const after = (await shown(page)).map((t) => t.replace(/[\s\u200b]/g, ''));
  check("once attached, the other sheet's definitions hold", after.some((t) => t.endsWith('=9.5')), after);
  const partial = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].filter((e) => (e.textContent ?? '').includes('Reference')).map((e) => ({ stale: e.classList.contains('stale'), title: e.title }))[0]);
  check('a found sheet that needs more files shows as found, naming them', partial?.stale === false && partial.title.includes('is attached, but it needs extra.csv'), partial);
  // A reference can't be typed into, so clicking it leaves it as it is.
  await clickAt(page, 70, 38);
  await page.keyboard.press('Escape');
  await sleep(80);
  const kept = (await model(page)).regions.find((r: { content: { k: string } }) => r.content.k === 'include');
  check('clicking a reference leaves it intact', kept?.content.file === 'Constants.mcd', (await model(page)).regions);
  await page.close();
}

// Enter moves down the page, as in writing.
{
  const page = await fresh();
  await clickAt(page, 72, 72);
  await keys(page, 'a:2');
  await page.keyboard.press('Enter');
  await sleep(120);
  await keys(page, 'a+1=');
  await page.keyboard.press('Escape');
  await sleep(60);
  const ws = await model(page);
  check('Enter starts a new region below', ws.regions.length === 2 && ws.regions[1].alignY > ws.regions[0].alignY && ws.regions[1].alignX === 72, ws.regions.map((r: any) => [r.alignX, r.alignY]));
  check('and calculation continues', (await shown(page)).join('').replace(/\s/g, '').includes('=3'));
  await page.close();
}

// A region that grows pushes down what's below it.
{
  const page = await fresh();
  await type(page, 72, 72, 'a:1');
  await type(page, 72, 96, 'b:2');
  const before = (await model(page)).regions[1].top;
  await clickAt(page, 74, 70);
  await keys(page, ']');
  await keys(page, '2');
  await page.keyboard.press('ArrowDown');
  await keys(page, '3');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await sleep(80);
  const ws = await model(page);
  check('growing pushes regions below it down', ws.regions[1].top > before, { before, after: ws.regions[1].top, a: ws.regions[0].content });
  await page.close();
}

// Shift-click and align.
{
  const page = await fresh();
  await type(page, 72, 72, 'a:1');
  await type(page, 120, 120, 'b:2');
  const at = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + 3, y: r.top + r.height / 2 };
  }));
  await page.keyboard.down('Shift');
  for (const p of at) await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Shift');
  await sleep(40);
  check('shift-click selects several', (await page.evaluate(() => document.querySelectorAll('.region.selected').length)) === 2);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((x) => x.textContent === 'Align left')!;
    b.click();
  });
  await sleep(40);
  const ws = await model(page);
  check('Align lines them up', ws.regions[0].left === ws.regions[1].left && ws.regions[0].alignX === ws.regions[1].alignX, ws.regions.map((r: any) => r.left));
  await page.close();
}

// Text regions.
{
  const page = await fresh();
  await clickAt(page, 72, 72);
  await keys(page, '"');
  await sleep(40);
  await page.keyboard.type('A note about this.');
  await page.keyboard.press('Escape');
  await sleep(50);
  const ws = await model(page);
  check('a quote starts text', ws.texts[0]?.text === 'A note about this.', ws.texts);
  check('text does not become math', ws.regions.length === 0, ws.regions);
  await page.close();
}

// Moving things.
{
  const page = await fresh();
  await type(page, 72, 72, 'a:1');
  await type(page, 72, 120, 'b:2');
  const box = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + 4, y: r.top + r.height / 2 };
  }));
  await page.mouse.move(box[0]!.x, box[0]!.y);
  await page.mouse.down();
  await page.mouse.move(box[0]!.x + 40, box[0]!.y + 30, { steps: 6 });
  await page.mouse.up();
  await sleep(60);
  let ws = await model(page);
  const moved = ws.regions[0];
  check('dragging moves a region', moved.left !== 72 || moved.alignY !== 72, moved);
  check('and it lands on the grid', moved.left % 6 === 0 && moved.alignY % 6 === 0, moved);
  // A box drag selects, then Delete removes.
  const b = await sheetBox(page);
  await page.mouse.move(b.x + 20 * PT, b.y + 30 * PT);
  await page.mouse.down();
  await page.mouse.move(b.x + 400 * PT, b.y + 300 * PT, { steps: 6 });
  await page.mouse.up();
  await sleep(60);
  const selected = await page.evaluate(() => document.querySelectorAll('.region.selected').length);
  check('a box selects what it touches', selected === 2, selected);
  check('and adds no region', (await model(page)).regions.length === 2);
  await page.keyboard.press('Delete');
  await sleep(50);
  ws = await model(page);
  check('Delete removes the selection', ws.regions.length === 0, ws.regions.length);
  await page.close();
}

// Undo.
{
  const page = await fresh();
  await type(page, 72, 72, 'a:1');
  await type(page, 72, 120, 'a+1=');
  const box = await page.evaluate(() => {
    const r = document.querySelectorAll<HTMLElement>('.region')[1]!.getBoundingClientRect();
    return { x: r.left - 30, y: r.top - 10, w: r.right + 10, h: r.bottom + 10 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.w, box.h, { steps: 5 });
  await page.mouse.up();
  await sleep(40);
  await page.keyboard.press('Delete');
  await sleep(40);
  check('a region can be deleted', (await model(page)).regions.length === 1);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await sleep(40);
  check('undo brings it back', (await model(page)).regions.length === 2);
  check('and its answer', (await shown(page)).join('').replace(/\s/g, '').includes('=2'));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyY');
  await page.keyboard.up('Control');
  await sleep(40);
  check('redo removes it again', (await model(page)).regions.length === 1);
  await page.close();
}

// Answers being recalculated must not look current.
{
  const page = await fresh();
  await type(page, 72, 72, 'x:3');
  await type(page, 72, 108, 'x+1=');
  await idle(page);
  const during = await page.evaluate(() => {
    const m = (window as any).mathmath;
    const real = m.doc.recompute.bind(m.doc);
    // Holds a calculation open, as a long one would.
    m.doc.recompute = () => {
      m.doc.computing = true;
    };
    m.doc.setMath(m.doc.ws.regions[0], 'x\\coloneq9');
    const stale = document.querySelectorAll('.region.stale').length;
    m.doc.recompute = real;
    m.doc.computing = false;
    m.doc.recompute();
    return stale;
  });
  check('an answer shows as provisional during a calculation', during === 1, during);
  await idle(page);
  check('and as current once it finishes', (await page.evaluate(() => document.querySelectorAll('.region.stale').length)) === 0);
  await page.close();
}

// One edit is one undo, even when it pushes regions down.
{
  const page = await fresh();
  await type(page, 72, 72, 'a:1');
  await type(page, 72, 96, 'b:2');
  await clickAt(page, 74, 70);
  await keys(page, ']2');
  await page.keyboard.press('ArrowDown');
  await keys(page, '3');
  await page.keyboard.press('Escape');
  await sleep(60);
  const pushed = (await model(page)).regions[1].top;
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await sleep(60);
  const ws = await model(page);
  check('one undo reverses the edit and the push together', ws.regions[1].top < pushed && ws.regions[0].content.k === 'define' && !JSON.stringify(ws.regions[0].content).includes('program'), ws.regions[1].top);
  await page.close();
}

// The real Save and Open buttons, with the file picker and with plain downloads.
{
  const folder = mkdtempSync(join(tmpdir(), 'mathmath-e2e-'));
  const press = (page: Page, label: string) => page.evaluate((l) => {
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === l)!.click();
  }, label);

  // No file picker in the browser: Save downloads a file.
  const page = await fresh();
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (Object.getPrototypeOf(window) as any).showSaveFilePicker;
  });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: folder });
  await type(page, 72, 72, 'x:2');
  await type(page, 72, 108, 'x*5=');
  await press(page, 'Save');
  await sleep(500);
  const files = readdirSync(folder).filter((f) => f.endsWith('.mathmath'));
  check('Save downloads a .mathmath file', files.length === 1, readdirSync(folder));
  check('and clears the unsaved mark', !(await page.evaluate(() => (window as any).mathmath.doc.dirty)));

  // Open reads it back through the real file chooser.
  const next = await fresh();
  const [chooser] = await Promise.all([next.waitForFileChooser(), press(next, 'Open')]);
  await chooser.accept([join(folder, files[0]!)]);
  await sleep(300);
  check('Open reads a saved file', (await shown(next)).join('').replace(/\s/g, '').includes('=10'), await shown(next));

  // An imported worksheet opens too, and its answer is recomputed.
  const xml = '<worksheet xmlns="w" xmlns:ml="m"><settings><calculation><builtInVariables array-origin="0" convergence-tolerance="0.001"/></calculation>'
    + '<pageModel page-width="792" page-height="612" orientation="landscape"><margins left="36" right="36" top="36" bottom="36"/></pageModel></settings><regions>'
    + '<region region-id="1" left="50" top="50" align-x="50" align-y="60"><math><ml:define><ml:id>k</ml:id><ml:real>4</ml:real></ml:define></math></region>'
    + '<region region-id="2" left="50" top="90" align-x="50" align-y="100"><math><ml:eval><ml:id>k</ml:id><result><ml:real>4</ml:real></result></ml:eval></math></region>'
    + '</regions></worksheet>';
  writeFileSync(join(folder, 'old.xmcd'), xml);
  const third = await fresh();
  const [picker] = await Promise.all([third.waitForFileChooser(), press(third, 'Open')]);
  await picker.accept([join(folder, 'old.xmcd')]);
  await sleep(300);
  const imported = await model(third);
  check('Open imports a worksheet', imported.regions.length === 2 && imported.page.width === 792, imported.page);
  check('and takes its landscape page', (await third.evaluate(() => document.getElementById('sheet')!.getBoundingClientRect().width)) === 1056);

  // With a file picker, Save writes through the handle, and again without asking.
  const fourth = await fresh();
  await fourth.evaluate(() => {
    const w = window as any;
    w.__written = [];
    w.__asked = 0;
    w.showSaveFilePicker = async () => {
      w.__asked++;
      return { name: 'notes.mathmath', createWritable: async () => ({ write: async (t: string) => w.__written.push(t), close: async () => {} }) };
    };
  });
  await type(fourth, 72, 72, 'x:2');
  await press(fourth, 'Save');
  await sleep(120);
  await type(fourth, 72, 108, 'x=');
  await press(fourth, 'Save');
  await sleep(120);
  const saved = await fourth.evaluate(() => ({ asked: (window as any).__asked, written: (window as any).__written.length, last: (window as any).__written.at(-1), name: document.title }));
  check('Save asks once, then writes to the same file', saved.asked === 1 && saved.written === 2, saved);
  check('the saved file is a real worksheet', JSON.parse(saved.last).format === 'mathmath' && saved.name.startsWith('notes'), saved.name);
  await page.close();
  await next.close();
  await third.close();
  await fourth.close();
}

// Save and load through the app.
{
  const page = await fresh();
  await type(page, 72, 72, 'x:2');
  await type(page, 72, 108, 'x*3=');
  const saved = await page.evaluate(() => (window as any).mathmath.save());
  const next = await fresh();
  await next.evaluate((t) => (window as any).mathmath.load('sheet.mathmath', t), saved);
  await sleep(100);
  const text = (await shown(next)).join('|').replace(/\s/g, '');
  check('a saved sheet opens and recomputes', text.includes('=6'), text);
  check('it stores trees, not LaTeX', !saved.includes('\\\\coloneq') && saved.includes('"k":"define"'));
  // Loaded regions stay editable.
  await clickAt(next, 74, 70);
  await page.close();
  await next.bringToFront();
  await next.keyboard.press('Escape');
  await sleep(40);
  check('an untouched region stays unchanged', JSON.stringify(await model(next)).length > 0 && !(await next.evaluate(() => (window as any).mathmath.doc.dirty)));
  await next.close();
}

// A calculation can be stopped, and it doesn't freeze the page.
{
  const page = await fresh();
  await type(page, 72, 72, 'n:1');
  await clickAt(page, 72, 120);
  await keys(page, 'f(x');
  await page.keyboard.press('ArrowRight');
  await keys(page, ':]s{0');
  await page.keyboard.press('Escape');
  await sleep(40);
  const hung = await page.evaluate(() => {
    const m = (window as any).mathmath;
    const text = JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: {
        ...m.doc.ws,
        regions: [{
          id: '1', left: 72, top: 64, alignX: 72, alignY: 72, disabled: false,
          content: {
            k: 'eval', stored: null, unit: null,
            expr: { k: 'program', body: [{ k: 'while', cond: { k: 'real', v: 1 }, body: { k: 'expr', e: { k: 'real', v: 1 } } }, { k: 'expr', e: { k: 'real', v: 2 } }] },
          },
        }],
      },
    });
    m.load('loop.mathmath', text);
    return m.doc.computing;
  });
  check('an endless loop is running', hung === true);
  const t = Date.now();
  const alive = await page.evaluate(() => 1 + 1);
  check('and the page still responds', alive === 2 && Date.now() - t < 1000, Date.now() - t);
  await page.keyboard.press('Escape');
  await sleep(60);
  check('Esc stops it', !(await page.evaluate(() => (window as any).mathmath.doc.computing)));
  await page.close();
}

// The mode button: LIVE calculates as you edit, EDIT doesn't until switched back.
{
  const page = await fresh();
  const mode = () => page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>('#toolbar button.mode')!;
    return { text: b.textContent, pressed: b.getAttribute('aria-pressed'), live: (window as any).mathmath.doc.live };
  });
  const click = () => page.evaluate(() => document.querySelector<HTMLButtonElement>('#toolbar button.mode')!.click());
  check('the sheet starts LIVE', JSON.stringify(await mode()) === '{"text":"LIVE","pressed":"true","live":true}', await mode());
  await type(page, 72, 72, 'a:2');
  await type(page, 72, 120, 'a+1=');
  await idle(page);
  const answer = () => page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    const el = document.querySelector<HTMLElement>(`[data-id="${d.ws.regions[1].id}"]`);
    return { value: d.outcomes.get(d.ws.regions[1].id)?.value, stale: el?.classList.contains('stale'), note: el?.title };
  });
  check('LIVE calculates', /3/.test((await answer()).value ?? ''), await answer());
  await click();
  check('one click switches to EDIT', JSON.stringify(await mode()) === '{"text":"EDIT","pressed":"false","live":false}', await mode());
  await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    d.update(d.ws.regions[0], (c: any) => ({ ...c, value: { k: 'real', v: 5 } }));
  });
  const edited = { computing: await page.evaluate(() => (window as any).mathmath.doc.computing), ...(await answer()) };
  check('EDIT calculates nothing, and the old answer grays', !edited.computing && /3/.test(edited.value ?? '') && edited.stale === true
    && /EDIT/.test(edited.note ?? ''), edited);
  await click();
  check('switching back to LIVE calculates', (await mode()).live && (await page.evaluate(() => (window as any).mathmath.doc.computing)));
  await idle(page);
  const after = await answer();
  check('and the answer is current again', /6/.test(after.value ?? '') && !after.stale, after);
  await page.close();
}

// Regions past the page edge are reachable.
{
  const page = await fresh();
  const wide = await page.evaluate(() => {
    const m = (window as any).mathmath;
    const text = JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: { ...m.doc.ws, texts: [{ id: '1', left: 900, top: 72, width: 100, height: 14, text: 'off to the side' }] },
    });
    m.load('wide.mathmath', text);
    const r = document.getElementById('sheet')!.getBoundingClientRect();
    const t = document.querySelector('.region.text')!.getBoundingClientRect();
    return { sheetRight: r.right, textRight: t.right };
  });
  check('the paper extends to regions past the page edge', wide.textRight <= wide.sheetRight, wide);
  await page.close();
}

// Regions past the page edge must not shrink the rest of the print.
{
  const page = await fresh();
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const text = JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: {
        ...m.doc.ws,
        texts: [
          { id: '1', left: 100, top: 100, width: 80, height: 14, text: 'marker' },
          { id: '2', left: 900, top: 72, width: 100, height: 14, text: 'off to the side' },
          { id: '3', left: 560, top: 72, width: 200, height: 14, text: 'across the page edge of the sheet' },
        ],
      },
    });
    m.load('wide.mathmath', text);
  });
  await idle(page);
  if (shots) {
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const file = `${shots}/wide.pdf`;
    writeFileSync(file, pdf);
    const bbox = execSync(`pdftotext -bbox ${file} -`).toString();
    const at = /xMin="([\d.]+)" yMin="[\d.]+" xMax="[\d.]+" yMax="[\d.]+">marker</.exec(bbox);
    check('printing keeps true scale when regions run past the edge', Math.abs(Number(at?.[1]) - 100) < 0.5, at?.[1]);
    check('regions past the edge do not print', !bbox.includes('>side<'));
  }
  await page.close();
}

// Printing: one PDF page per sheet page, sized from the worksheet.
{
  const page = await fresh();
  await type(page, 72, 72, 'x:1');
  await page.evaluate(() => document.getElementById('desk')!.scrollTo(0, 500));
  await type(page, 72, 900, 'x+1=');
  const pages = await page.evaluate(() => document.getElementById('sheet')!.getBoundingClientRect().height / (96 / 72) / 792);
  await idle(page);
  check('there is always a page to click on past the last one', pages === 3, pages);
  check('regions land past the first page', (await model(page)).regions[1]?.alignY === 900, (await model(page)).regions[1]);
  check('page breaks are drawn', (await page.evaluate(() => document.querySelectorAll('.pagebreak').length)) === 2);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const count = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check('printing gives two pages', count === 2, count);
  if (shots) writeFileSync(`${shots}/print.pdf`, pdf);
  await page.close();
}

check('no page errors, console errors or policy violations', problems.length === 0, problems);
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
server.close();
process.exit(failed > 0 ? 1 : 0);
