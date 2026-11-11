// MathMath: math on paper, in the browser.
// Copyright (C) 2026 Pelican Labs, LLC
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
// General Public License as published by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
// implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
// License for more details.
//
// You should have received a copy of the GNU Affero General Public License along with this program. If not,
// see <https://www.gnu.org/licenses/>.

// Drives the production build in headless Chromium with real input events. Everything here is
// invented: corpus checks live in src/cli. Pass a folder to keep screenshots outside the repository.
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import puppeteer, { KnownDevices, type Page } from 'puppeteer-core';
import { CSP } from '../../vite.config.js';
import { emptyWorksheet, saveWorksheet } from '../../src/format/native.js';
import { readTex } from '../../src/latex/latex.js';
import { readRegion } from '../../src/latex/region.js';
import { autoAxis } from '../../src/model/ast.js';
import { buildAll } from '../../examples/index.js';

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
  '&': 'Digit7', '?': 'Slash', '%': 'Digit5',
};
const PLAIN: Record<string, string> = {
  '/': 'Slash', '=': 'Equal', '-': 'Minus', '.': 'Period', ';': 'Semicolon', '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma', ' ': 'Space',
};

async function fresh(withSplash = false): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${String((e as Error).stack ?? e).slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('dialog', (d) => void d.accept());
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
  // The splash would cover the paper: tests of it open their own page.
  if (!withSplash) await page.evaluateOnNewDocument("try { localStorage.setItem('mathmath.splash', 'off') } catch {}");
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

type Part = string | { press: string; ctrl?: boolean; shift?: boolean };

/** Clicks, types, and presses Esc to finish, which also stops a calculation still running. */
async function type(page: Page, left: number, top: number, ...parts: Part[]): Promise<void> {
  await clickAt(page, left, top);
  await send(page, parts);
  await page.keyboard.press('Escape');
  await sleep(50);
}

async function send(page: Page, parts: Part[]): Promise<void> {
  for (const p of parts) {
    if (typeof p === 'string') await keys(page, p);
    else {
      if (p.ctrl) await page.keyboard.down('Control');
      if (p.shift) await page.keyboard.down('Shift');
      await page.keyboard.press(p.press as never);
      if (p.shift) await page.keyboard.up('Shift');
      if (p.ctrl) await page.keyboard.up('Control');
    }
  }
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

// Sums: $ over a range variable, and Mathcad's Ctrl+Shift+4 for one with limits.
{
  const page = await fresh();
  const T = { press: 'Tab' };
  await type(page, 72, 72, 'i:0;10');
  await type(page, 72, 108, '$', 'i', T, 'i^2', R, '=');
  await type(page, 72, 160, { press: 'Digit4', ctrl: true, shift: true }, 'n', T, '1', T, '4', T, 'n=');
  await type(page, 72, 212, '#', 'i', T, '(i+1', R, '=');
  const ws = await model(page);
  const kinds = ws.regions.map((r: any) => r.content.expr?.k ?? r.content.k);
  const text = (await shown(page)).join(' | ').replace(/\s/g, '');
  check('$ and # make a sum and product over a range variable', kinds[1] === 'bigop' && ws.regions[1].content.expr.lo === null && kinds[3] === 'bigop', ws.regions.map((r: any) => r.content));
  check('and they add up its values', text.includes('=385') && text.includes('=3.992×10'), text);
  check('Ctrl+Shift+4 makes a sum with limits', ws.regions[2]?.content.expr?.lo?.v === 1 && text.includes('=10'), ws.regions[2]?.content);
  await page.close();
}

// The nth derivative: Mathcad's Ctrl+Shift+/ (Ctrl+?), with the order typed above only, and under an arrow.
{
  const page = await fresh();
  const T = { press: 'Tab' };
  const nth = { press: 'Slash', ctrl: true, shift: true };
  await type(page, 72, 72, 'x:1');
  await type(page, 72, 120, nth, '2', T, 'x', T, 'x^3', R, '=');
  // Ctrl+. ends this one: type's Esc would stop the algebra engine's calculation.
  await clickAt(page, 72, 180);
  await send(page, [nth, '2', T, 'u', T, 'u^5', R, { press: 'Period', ctrl: true }]);
  await page.waitForFunction(() => /→\S/.test(document.querySelectorAll<HTMLElement>('.region')[2]?.innerText ?? ''), { timeout: 30000 }).catch(() => {});
  const ws = await model(page);
  const e = ws.regions[1]?.content.expr;
  const text = (await shown(page)).map((t) => t.replace(/\s/g, ''));
  check('Ctrl+? makes an nth derivative', e?.k === 'derivative' && e.degree?.v === 2 && e.varName === 'x', ws.regions[1]?.content);
  check('it is calculated, and its order shows below too', text[1]?.endsWith('=6') === true && (text[1].match(/2/g) ?? []).length >= 2, text[1]);
  check('and the algebra engine takes it too', /→20[·⋅]?u3$/.test(text[2] ?? ''), text[2]);
  await page.close();
}

// Matrices: Ctrl+M, and the Matrix menu's operators on what's before the caret.
{
  const page = await fresh();
  const T = { press: 'Tab' };
  const menu = (label: string) => page.evaluate((l) => [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((b) => b.textContent === l)!.click(), label);
  await type(page, 72, 72, 'A:', { press: 'KeyM', ctrl: true }, '1', T, '2', T, '3', T, '4');
  const typeWith = async (top: number, before: string, label: string, ...after: (string | { press: string })[]) => {
    await clickAt(page, 72, top);
    await keys(page, before);
    await menu(label);
    await sleep(60);
    for (const p of after) {
      if (typeof p === 'string') await keys(page, p);
      else await page.keyboard.press(p.press as never);
    }
    await page.keyboard.press('Escape');
    await sleep(60);
  };
  await typeWith(130, 'A', 'Transpose  Mᵀ', '=');
  await typeWith(180, 'A', 'Column  M⟨j⟩', '1', R, R, '=');
  await typeWith(230, '', 'Vectorize (element by element)', 'A*A', R, '=');
  await typeWith(280, '', 'Determinant or length  |M|', 'A', R, '=');
  await clickAt(page, 300, 72);
  await keys(page, 'B:');
  await menu('2 × 2 matrix');
  await keys(page, '1');
  await menu('Add row');
  await sleep(60);
  await page.keyboard.press('Escape');
  await sleep(60);
  const ws = await model(page);
  const text = (await shown(page)).join(' | ').replace(/\s/g, '');
  const ops = ws.regions.slice(1, 5).map((r: any) => r.content.expr?.op ?? r.content.expr?.k);
  check('Ctrl+M inserts a matrix, filled with Tab', ws.regions[0]?.content.value?.k === 'matrix' && ws.regions[0].content.value.rows === 2, ws.regions[0]?.content);
  check('the Matrix menu makes transpose, column, vectorize and |M|', JSON.stringify(ops) === JSON.stringify(['transpose', 'matcol', 'vectorize', 'absval']), ops);
  const at = (n: number) => ws.regions[n]?.id;
  const shownFor = async (n: number) => (await page.evaluate((id) => document.querySelector<HTMLElement>(`.region[data-id="${id}"]`)?.innerText ?? '', at(n))).replace(/[\s\u200b]/g, '');
  check('and they calculate: Aᵀ, A⟨1⟩, A·A element by element, and det A = −2',
    (await shownFor(1)).endsWith('(1234)') && (await shownFor(2)).endsWith('(24)') && (await shownFor(3)).endsWith('(19416)') && (await shownFor(4)).endsWith('=−2'),
    [await shownFor(1), await shownFor(2), await shownFor(3), await shownFor(4)]);
  check('Add row grows a matrix', ws.regions.find((r: any) => r.content.target?.name === 'B')?.content.value?.rows === 3, ws.regions.map((r: any) => r.content.value?.rows));
  await page.close();
}

// Recalculating only what changed: the worker remembers the sheet between calculations.
{
  const page = await fresh();
  await type(page, 72, 72, 'a:2*m');
  await type(page, 72, 108, 'b:a*3');
  await type(page, 72, 144, 'b=');
  await type(page, 72, 180, 'c:10');
  await type(page, 72, 216, 'c=');
  await idle(page);
  const ids = await page.evaluate(() => (window as any).mathmath.doc.ws.regions.map((r: any) => r.id));
  const ran = () => page.evaluate(() => (window as any).mathmath.doc.lastRan);
  await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    d.update(d.ws.regions[3], (c: any) => ({ ...c, value: { k: 'real', v: 20 } }));
  });
  await idle(page);
  check('changing c runs only c and what reads it', JSON.stringify(await ran()) === JSON.stringify([ids[3], ids[4]]), { ran: await ran(), ids });
  check('and the answers are right', (await shown(page)).join('|').replace(/[\s\u200b]/g, '').includes('c=20'), await shown(page));
  await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    d.update(d.ws.regions[2], (c: any) => ({ ...c, unit: { k: 'id', name: 'cm' } }));
  });
  await idle(page);
  check('a new display unit calculates nothing', JSON.stringify(await ran()) === '[]', await ran());
  await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    d.update(d.ws.regions[0], (c: any) => ({ ...c, value: { k: 'op', op: 'mult', args: [{ k: 'real', v: 5 }, { k: 'id', name: 'm' }] } }));
  });
  await idle(page);
  check('changing a reaches b below it, and leaves c alone', JSON.stringify(await ran()) === JSON.stringify([ids[0], ids[1], ids[2]]), await ran());
  check('with b = 15 m shown in its chosen unit', (await shown(page)).join('|').replace(/[\s\u200b]/g, '').includes('b=1.5×103cm'), await shown(page));
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

  // Laplace and z-transforms, through the engine.
  const px = await fresh();
  const transform = async (top: number, expr: string, name: string, variable: string) => {
    await clickAt(px, 60, top);
    await keys(px, expr);
    await keyword(px, name);
    await sleep(40);
    await keys(px, variable);
    await px.keyboard.press('Escape');
    await sleep(60);
  };
  await transform(60, 'e^-2t', 'laplace', 't');
  await transform(110, '1/(s^2+4', 'invlaplace', 's');
  await transform(160, '2^n', 'ztrans', 'n');
  await transform(210, '1', 'invlaplace', 's');
  const xf = (await text(px)).map((x) => x.replace(/\s/g, ''));
  check('laplace, t gives a function of s', /→s\+21/.test(xf[0] ?? ''), xf[0]);
  check('invlaplace, s gives a function of t', /→.*sin\(2⋅?t\)/.test(xf[1] ?? ''), xf[1]);
  check('ztrans, n gives a function of z', /→z−2z/.test(xf[2] ?? ''), xf[2]);
  check('the inverse transform of 1 is Δ(t), as Mathcad writes it', /→Δ\(t\)$/.test(xf[3] ?? ''), xf[3]);
  await px.close();

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

  // Titles: off until Format turns them on, then typed in place as plain text.
  const pt = await fresh();
  await type(pt, 60, 60, 'x:0;10');
  await plotAt(pt, 60, 96, 'x^2', 'x');
  await idleP(pt);
  const areaWidth = () => pt.evaluate(() => Number(document.querySelector('.region.plot rect')!.getAttribute('width')));
  const before = await areaWidth();
  const plotBox = await pt.evaluate(() => {
    const r = document.querySelector<HTMLElement>('.region.plot')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  check('a new plot has no title slots', (await pt.evaluate(() => document.querySelectorAll('.region.plot [data-slot^="title"]').length)) === 0);
  await pt.mouse.click(plotBox.x, plotBox.y);
  await sleep(60);
  const menu = (label: string) => pt.evaluate((l) => [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((b) => b.textContent === l)!.click(), label);
  await menu('Axis titles');
  await menu('Plot title');
  await idleP(pt);
  await sleep(60);
  check('Format shows empty title slots, and the plot area makes room', (await pt.evaluate(() => document.querySelectorAll('.region.plot [data-slot^="title"].empty').length)) === 3 && (await areaWidth()) < before);
  const typeTitle = async (slot: string, text: string, end: string) => {
    const at = await pt.evaluate((s) => {
      const r = document.querySelector<HTMLElement>(`.region.plot [data-slot="${s}"]`)!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, slot);
    await pt.mouse.click(at.x, at.y);
    await sleep(120);
    await pt.keyboard.type(text);
    await pt.keyboard.press('Backspace');
    await pt.keyboard.press(end as never);
    await sleep(80);
  };
  await typeTitle('titlex', 'Time, s!', 'Enter');
  await typeTitle('titley', 'Height (m)?', 'Escape');
  await typeTitle('title', 'A falling ball!', 'Tab');
  await idleP(pt);
  let pw = await model(pt);
  const pc = pw.regions[1]?.content;
  check('titles are typed in place, and Backspace edits them rather than deleting the plot', pc?.k === 'plot' && pc.xAxis.title === 'Time, s' && pc.yAxis.title === 'Height (m)' && pc.title === 'A falling ball', pc);
  check('and they show on the plot', (await pt.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.plot [data-slot^="title"]')].map((e) => e.textContent).join('|'))) === 'A falling ball|Time, s|Height (m)');
  const savedTitles = await pt.evaluate(() => (window as any).mathmath.save());
  const reopened = await fresh();
  await reopened.evaluate((t) => (window as any).mathmath.load('p.mathmath', t), savedTitles);
  await sleep(150);
  check('titles survive saving', (await model(reopened)).regions[1]?.content.xAxis.title === 'Time, s');
  await reopened.close();
  await pt.mouse.click(plotBox.x, plotBox.y);
  await sleep(60);
  await menu('Axis titles');
  await sleep(80);
  pw = await model(pt);
  check('Format turns axis titles off again', pw.regions[1].content.xAxis.title === undefined && pw.regions[1].content.title === 'A falling ball' && !('title' in pw.regions[1].content.yAxis));
  await pt.close();

  // Units: each axis shows its default unit, and another can be chosen by clicking it.
  const pu = await fresh();
  await type(pu, 60, 60, 'd:0m,1m;10m');
  await plotAt(pu, 60, 96, 'd', 'd');
  await idleP(pu);
  const unitText = () => pu.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.plot .axis-unit')].map((e) => `${e.dataset.slot}:${e.textContent}:${e.classList.contains('auto')}`));
  check('each axis shows its default unit, in gray', JSON.stringify(await unitText()) === JSON.stringify(['yunit:(m):true', 'xunit:(m):true']), {
    units: await unitText(),
    state: await pu.evaluate(() => { const d = (window as any).mathmath.doc; const r = d.ws.regions[1]; return { x: r?.content.x, ys: r?.content.ys?.length, labels: d.outcomes.get(r?.id)?.plot?.labels, ran: d.lastRan, computing: d.computing, behind: d.behind }; }),
  });
  const yu = await pu.evaluate(() => {
    const r = document.querySelector<HTMLElement>('.region.plot [data-slot="yunit"]')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await pu.mouse.click(yu.x, yu.y);
  await sleep(120);
  await keys(pu, 'cm');
  await pu.keyboard.press('Escape');
  await idleP(pu);
  await sleep(80);
  const uc = (await model(pu)).regions[1]?.content;
  const top = await pu.evaluate(() => document.querySelector<HTMLElement>('.region.plot [data-slot="ymax"]')!.textContent);
  check('a chosen unit converts the axis', uc?.yAxis.unit?.name === 'cm' && top === '1000' && (await unitText())[0] === 'yunit:(cm):false', { unit: uc?.yAxis.unit, top, labels: await unitText() });
  await pu.close();

  // Trace styles: a panel from Format, changing how a trace looks without recalculating.
  const ps = await fresh();
  await type(ps, 60, 60, 't:0,0.5;5');
  await plotAt(ps, 60, 96, 't,t^2', 't');
  await idleP(ps);
  const psBox = await ps.evaluate(() => {
    const r = document.querySelector<HTMLElement>('.region.plot')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await ps.mouse.click(psBox.x, psBox.y);
  await sleep(80);
  await ps.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((b) => b.textContent === 'Trace styles…')!.click());
  await sleep(120);
  check('Format → Trace styles… opens a row per trace', (await ps.evaluate(() => document.querySelectorAll('#trace-panel:not([hidden]) .trace').length)) === 2);
  await ps.evaluate(() => {
    const row = document.querySelectorAll<HTMLElement>('#trace-panel .trace')[0]!;
    row.querySelectorAll<HTMLButtonElement>('.swatch')[1]!.click();
    const line = row.querySelectorAll<HTMLSelectElement>('select')[0]!;
    line.value = 'none';
    line.dispatchEvent(new Event('change'));
  });
  await idleP(ps);
  await sleep(80);
  const styled = await ps.evaluate(() => {
    const d = (window as any).mathmath.doc;
    const el = document.querySelector<HTMLElement>('.region.plot')!;
    return {
      traces: d.ws.regions[1].content.traces,
      ran: d.lastRan,
      paths: [...el.querySelectorAll('path')].map((p) => p.getAttribute('stroke')),
      points: el.querySelectorAll('.plot-svg circle').length,
    };
  });
  check('a trace can be given its own color and drawn as points', styled.traces?.[0]?.color === '#eb6834' && styled.traces[0].line === 'none' && styled.points === 11, styled);
  check('and restyling calculates nothing', JSON.stringify(styled.ran) === '[]', styled.ran);
  await ps.evaluate(() => document.querySelectorAll<HTMLElement>('#trace-panel .trace')[0]!.querySelector<HTMLButtonElement>('.controls button')!.click());
  await sleep(80);
  check('Default puts the trace back', (await ps.evaluate(() => (window as any).mathmath.doc.ws.regions[1].content.traces)) === undefined);
  await ps.keyboard.press('Escape');
  await sleep(60);
  check('Esc closes the panel', await ps.evaluate(() => document.getElementById('trace-panel')!.hidden === true));
  await ps.close();

  // Polar, surface and contour views, chosen from Format.
  const pv = await fresh();
  const pick = (label: string) => pv.evaluate((l) => [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((b) => b.textContent === l)!.click(), label);
  const viewInfo = () => pv.evaluate((): { view?: string; view3d?: { azimuth: number; elevation: number }; ran: string[]; paths: number; d: string; problem: string; ranges: number } => {
    const d = (window as any).mathmath.doc;
    const r = d.ws.regions.find((x: any) => x.content.k === 'plot');
    const el = document.querySelector<HTMLElement>('.region.plot')!;
    return {
      view: r.content.view, view3d: r.content.view3d, ran: d.lastRan,
      paths: el.querySelectorAll('.plot-svg path').length,
      d: [...el.querySelectorAll('.plot-svg path')].slice(0, 3).map((p) => p.getAttribute('d')).join(),
      problem: el.querySelector('.plot-problem')?.textContent ?? '',
      ranges: el.querySelectorAll('.ranges').length,
    };
  });
  const selectPlot = async () => {
    const b = await pv.evaluate(() => {
      const r = document.querySelector<HTMLElement>('.region.plot')!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 3 };
    });
    await pv.mouse.click(b.x, b.y);
    await sleep(80);
    return b;
  };
  await type(pv, 60, 60, 'q:0,0.1;6.3');
  await type(pv, 60, 96, 'f(x,y', R, ':x*y');
  await plotAt(pv, 60, 140, '1+cos(q', 'q');
  await idleP(pv);
  await selectPlot();
  await pick('Polar plot');
  await idleP(pv);
  await sleep(80);
  let vi = await viewInfo();
  check('Format → Polar plot draws the trace around a center, calculating nothing', vi.view === 'polar' && vi.paths >= 1 && !vi.problem && JSON.stringify(vi.ran) === '[]', vi);
  // A Smith chart reads its traces as reflection coefficients, so choosing it calculates.
  await selectPlot();
  await pick('Smith chart');
  await idleP(pv);
  await sleep(80);
  vi = await viewInfo();
  check('Format → Smith chart draws Γ on its grid, calculating the plot', vi.view === 'smith' && vi.paths >= 1 && !vi.problem && vi.ran.length === 1, vi);
  const centre = await pv.evaluate(() => {
    const c = [...document.querySelectorAll<SVGCircleElement>('.region.plot .plot-svg > circle')].at(-1)!.getBoundingClientRect();
    return { x: c.left + c.width / 2, y: c.top + c.height / 2 };
  });
  await pv.mouse.move(centre.x, centre.y);
  await sleep(60);
  const readout = await pv.evaluate(() => document.querySelector<HTMLElement>('.region.plot .readout')!.textContent ?? '');
  check('hovering at the centre of a Smith chart reads the swept value and the match there', /^x = 3\.1, Γ = 0\.00\d*∠[-\d.e]+°, z = 1(\.00\d*)? [+−] 0/.test(readout), readout);
  // The same plot, now of f, as a surface.
  await pv.evaluate(() => {
    const d = (window as any).mathmath.doc;
    const r = d.ws.regions.find((x: any) => x.content.k === 'plot');
    d.update(r, (c: any) => ({ ...c, x: null, ys: [{ k: 'id', name: 'f' }] }));
  });
  await idleP(pv);
  await pick('Surface plot (3-D)');
  await idleP(pv);
  await sleep(80);
  vi = await viewInfo();
  check('Format → Surface plot (3-D) draws a function of two variables', vi.view === 'surface' && vi.paths > 400 && !vi.problem && vi.ranges === 1, vi);
  const unturned = vi.d;
  const area = await pv.evaluate(() => {
    const r = document.querySelector('.region.plot .rotate-area')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await pv.mouse.move(area.x, area.y);
  await pv.mouse.down();
  for (let n = 1; n <= 5; n++) await pv.mouse.move(area.x + n * 12, area.y + n * 4);
  await pv.mouse.up();
  await idleP(pv);
  await sleep(80);
  vi = await viewInfo();
  check('dragging a surface turns it, calculating nothing', !!vi.view3d && vi.view3d.azimuth !== -55 && vi.view3d.elevation !== 28 && vi.d !== unturned && JSON.stringify(vi.ran) === '[]', vi);
  const saved3d = await pv.evaluate(() => (window as any).mathmath.save());
  await pick('Reset the 3-D view');
  await idleP(pv);
  await sleep(80);
  vi = await viewInfo();
  check('Format → Reset the 3-D view turns it back, calculating nothing', vi.view3d === undefined && vi.d === unturned && JSON.stringify(vi.ran) === '[]', vi);
  await pv.keyboard.down('Control');
  await pv.keyboard.press('KeyZ');
  await pv.keyboard.up('Control');
  await sleep(120);
  check('and undo turns it again', !!(await viewInfo()).view3d);
  const pdf3d = Buffer.from(await pv.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
  check('a 3-D plot prints as drawing, not a picture', !/\/Subtype\s*\/Image/.test(pdf3d));
  await pv.keyboard.press('Escape');
  await pv.keyboard.down('Control');
  await pv.keyboard.press('KeyZ');
  await pv.keyboard.up('Control');
  await sleep(120);
  vi = await viewInfo();
  check('one undo turns it back', vi.view3d === undefined && vi.d === unturned, vi);
  await selectPlot();
  await pick('Contour plot');
  await idleP(pv);
  await sleep(80);
  vi = await viewInfo();
  check('Format → Contour plot draws level lines, calculating nothing', vi.view === 'contour' && vi.paths >= 3 && !vi.problem && JSON.stringify(vi.ran) === '[]', vi);
  const pv2 = await fresh();
  await pv2.evaluate((t) => (window as any).mathmath.load('v.mathmath', t), saved3d);
  await idleP(pv2);
  const back = (await model(pv2)).regions.find((r: any) => r.content.k === 'plot')?.content;
  check('a saved surface keeps its view', back?.view === 'surface' && back.view3d?.azimuth === JSON.parse(saved3d).worksheet.regions.find((r: any) => r.content.k === 'plot').content.view3d.azimuth, back);
  check('and draws it again', (await pv2.evaluate(() => document.querySelectorAll('.region.plot .plot-svg path').length)) > 400);
  await pv2.close();
  // A matrix of heights has no sampling limits to show, and something that isn't a surface says so.
  await pv.evaluate(() => {
    const d = (window as any).mathmath.doc;
    const r = d.ws.regions.find((x: any) => x.content.k === 'plot');
    const row = (a: number[]) => a.map((v) => ({ k: 'real', v }));
    d.update(r, (c: any) => ({ ...c, view: 'surface', ys: [{ k: 'matrix', rows: 2, cols: 3, items: [...row([1, 2, 3]), ...row([4, 5, 6])] }] }));
  });
  await idleP(pv);
  await sleep(80);
  vi = await viewInfo();
  check('a matrix of heights draws as a surface, without x and y limits', vi.view3d === undefined && vi.paths >= 2 && vi.ranges === 0 && !vi.problem, vi);
  await pv.evaluate(() => {
    const d = (window as any).mathmath.doc;
    const r = d.ws.regions.find((x: any) => x.content.k === 'plot');
    d.update(r, (c: any) => ({ ...c, ys: [{ k: 'real', v: 3 }] }));
  });
  await idleP(pv);
  await sleep(80);
  vi = await viewInfo();
  check('a number says what a surface needs', vi.problem.includes('A surface needs'), vi);
  await pv.close();

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
    const opened = await page.evaluate(() => {
      const view = document.querySelectorAll<HTMLElement>('.region')[1]!;
      const unit = view.querySelector<HTMLElement>('[data-unitpart]');
      return {
        editor: ((document.getElementById('editor') as any).getValue?.('latex-unstyled') as string) ?? '',
        numberShown: view.style.visibility !== 'hidden' && getComputedStyle(view.querySelector('[data-slot="unit"]')!).visibility !== 'hidden',
        unitHidden: unit ? getComputedStyle(unit).visibility === 'hidden' : false,
      };
    });
    check('clicking the answer keeps the number in view, and opens its unit filled in', opened.numberShown && opened.unitHidden && /m/.test(opened.editor), opened);
    await keys(page, 'cm');
    await page.keyboard.press('Escape');
    await sleep(60);
  }
  text = await answers(page);
  check('choosing cm shows the length in centimetres', text[1]?.endsWith('=300cm') === true, text[1]);
  // Editing the math keeps the unit, and the old answer stays in view, grayed, while it's edited.
  await clickAt(page, 62, 94);
  const ghost = await page.evaluate(() => {
    const g = document.querySelector<HTMLElement>('.ghost-answer')!;
    return { hidden: g.hidden, text: (g.innerText ?? '').replace(/[\s\u200b]/g, '') };
  });
  check('while the math is edited, its answer stays in view', !ghost.hidden && ghost.text.startsWith('300'), ghost);
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
    [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === '2 × 2 matrix')!.click();
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
  await type(page, 300, 72, 'y:2');
  await type(page, 300, 108, 'y=');
  await idle(page);
  const during = await page.evaluate(() => {
    const m = (window as any).mathmath;
    const real = m.doc.recompute.bind(m.doc);
    const [, xAnswer, , yAnswer] = m.doc.ws.regions.map((r: any) => r.id);
    // Holds a calculation open, as a long one would, which may change x and its answer but not y's.
    m.doc.recompute = () => {
      m.doc.computing = true;
      m.doc.mayChange = new Set([m.doc.ws.regions[0].id, xAnswer]);
    };
    m.doc.setMath(m.doc.ws.regions[0], 'x\\coloneq9');
    const stale = (id: string) => document.querySelector(`[data-id="${id}"]`)!.classList.contains('stale');
    const seen = { x: stale(xAnswer), y: stale(yAnswer) };
    m.doc.recompute = real;
    m.doc.computing = false;
    m.doc.mayChange = null;
    m.doc.recompute();
    return seen;
  });
  check('an answer the calculation may change shows as provisional', during.x === true, during);
  check('and one it can\'t change stays current', during.y === false, during);
  await idle(page);
  check('and as current once it finishes', (await page.evaluate(() => document.querySelectorAll('.region.stale').length)) === 0);
  await page.close();
}

// The region being calculated gets a green box, once it has taken a moment, and loses it after.
{
  const page = await fresh();
  const T = { press: 'Tab' };
  await type(page, 72, 72, 'a:1');
  await idle(page);
  await type(page, 72, 108, { press: 'Digit4', ctrl: true, shift: true }, 'n', T, '1', T, '20000000', T, '1/n^2', R, '=');
  const boxed = await page.waitForSelector('.region.calculating', { timeout: 8000 }).then((h) => h?.evaluate((e) => (e as HTMLElement).dataset.id)).catch(() => null);
  if (shots) await page.screenshot({ path: `${shots}/calculating.png` as `${string}.png`, clip: { x: 0, y: 0, width: 700, height: 300 } });
  const ws = await model(page);
  check('the slow region gets the green box while it calculates', boxed === ws.regions[1]?.id, { boxed, ids: ws.regions.map((r: any) => r.id) });
  await page.waitForFunction('!window.mathmath.doc.computing', { timeout: 60000 });
  check('and loses it when the calculation ends', (await page.evaluate(() => document.querySelectorAll('.region.calculating').length)) === 0);
  check('with the right answer', (await shown(page)).join('').replace(/\s/g, '').includes('=1.645'), await shown(page));
  await page.close();
}

// Answers appear as they're ready: one above a slow region shows, current, while the slow one calculates.
{
  const page = await fresh();
  const T = { press: 'Tab' };
  await type(page, 72, 72, 'a:1');
  await type(page, 72, 108, 'a=');
  await type(page, 72, 150, { press: 'Digit4', ctrl: true, shift: true }, 'n', T, '1', T, '3000000', T, '1/n^2', R, '+a', R, '=');
  await idle(page);
  await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    d.update(d.ws.regions[0], (c: any) => ({ ...c, value: { k: 'real', v: 2 } }));
  });
  // Wait for a='s new answer, which comes before the slow sum below it finishes.
  await page.waitForFunction(() => {
    const d = (window as any).mathmath.doc;
    return /2/.test(d.outcomes.get(d.ws.regions[1].id)?.value ?? '');
  }, { timeout: 10000 });
  const mid = await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    const el = (id: string) => document.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    return { computing: d.computing, aStale: el(d.ws.regions[1].id).classList.contains('stale'), sumStale: el(d.ws.regions[2].id).classList.contains('stale') };
  });
  check('an answer shows as soon as it is ready, current, while a slow region below still calculates', mid.computing && !mid.aStale && mid.sumStale, mid);
  await idle(page);
  check('and the slow one follows', (await shown(page)).join('|').replace(/[\s\u200b]/g, '').includes('=3.64'), await shown(page));
  await page.close();
}

// A file the sheet needs is said under the toolbar, and attaching it clears the notice.
{
  const page = await fresh();
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const r = (n: number, content: unknown) => ({ id: String(n), left: 60, top: 30 + n * 40, alignX: 60, alignY: 38 + n * 40, disabled: false, content });
    const call = { k: 'call', fn: { k: 'id', name: 'readTable' }, args: [{ k: 'str', v: 'data.csv' }] };
    m.load('n.mathmath', JSON.stringify({
      format: 'mathmath', version: 1,
      worksheet: { ...m.doc.ws, regions: [
        r(1, { k: 'define', target: { k: 'var', name: 'D' }, value: call, global: false, stored: null, unit: null, shown: false }),
        r(2, { k: 'eval', expr: { k: 'op', op: 'indexer', args: [{ k: 'id', name: 'D' }, { k: 'real', v: 1 }, { k: 'real', v: 1 }] }, stored: null, unit: null }),
      ], texts: [] },
    }));
  });
  await idle(page);
  const bar = () => page.evaluate(() => { const b = document.getElementById('needs-bar')!; return b.hidden ? null : b.innerText; });
  check('a missing file is named under the toolbar, with a way to attach it', /needs a file to calculate: data\.csv/.test((await bar()) ?? '') && /Attach files/.test((await bar()) ?? ''), await bar());
  check('and the answer waiting for it keeps its = and says so', (await shown(page))[1]?.replace(/[\s\u200b]/g, '').endsWith('=needsafile') === true, await shown(page));
  await page.evaluate(() => (window as any).mathmath.doc.attach([{ name: 'data.csv', mime: 'text/csv', data: btoa('1,2\n3,4\n') }]));
  await idle(page);
  check('attaching it clears the notice and the answer appears', (await bar()) === null && (await shown(page))[1]?.replace(/[\s\u200b]/g, '').endsWith('=4') === true, { bar: await bar(), shown: await shown(page) });
  await page.close();
}

// Page orientation: Page → Landscape swaps the page's width and height, for the screen and for print.
{
  const page = await fresh();
  await type(page, 72, 72, 'x:1');
  await idle(page);
  const pick = (label: string) => page.evaluate((l) => {
    const menu = [...document.querySelectorAll<HTMLDetailsElement>('#toolbar details.menu')].find((d) => d.querySelector('summary')!.textContent === 'Page')!;
    menu.open = true;
    menu.dispatchEvent(new Event('toggle'));
    [...menu.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes(l))!.click();
  }, label);
  const state = () => page.evaluate(() => {
    const ws = (window as any).mathmath.doc.ws;
    const line = document.querySelector<HTMLElement>('.pagebreak');
    return { landscape: ws.page.landscape, width: ws.page.width, height: ws.page.height, firstBreak: line?.style.top, print: document.getElementById('page-style')?.textContent ?? '' };
  });
  await pick('Landscape');
  await sleep(80);
  let st = await state();
  check('Page → Landscape turns the page sideways', st.landscape && st.width === 792 && st.height === 612 && st.firstBreak === '612pt', st);
  check('and printing uses the landscape size', st.print.includes('size: 792pt 612pt'), st.print);
  check('changing the page calculates nothing', JSON.stringify(await page.evaluate(() => (window as any).mathmath.doc.lastRan)) === '[]');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await sleep(80);
  st = await state();
  check('one undo puts it back to portrait', !st.landscape && st.width === 612 && st.height === 792, st);
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
  // The worker remembers the sheet, so this one-region change can finish before anything looks: check what ran.
  await idle(page);
  check('switching back to LIVE calculates', (await mode()).live && JSON.stringify(await page.evaluate(() => (window as any).mathmath.doc.lastRan)) === JSON.stringify(await page.evaluate(() => (window as any).mathmath.doc.ws.regions.map((r: any) => r.id))),
    await page.evaluate(() => (window as any).mathmath.doc.lastRan));
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

// Signal processing: a WAV file attached after the sheet asks for it, its spectrum, and a filter.
{
  const page = await fresh();
  const ws = emptyWorksheet();
  const lines = [
    's\\coloneq \\mathrm{readWav}\\left(\\text{"beep.wav"}\\right)', 'r\\coloneq \\mathrm{wavRate}\\left(\\text{"beep.wav"}\\right)', 'r=',
    'S\\coloneq \\mathrm{cfft}\\left(s\\right)', 'm\\coloneq 0..399', 'h\\coloneq \\mathrm{firLowpass}\\left(31,\\frac{300\\cdot \\mathrm{Hz}}{r}\\right)',
    'y\\coloneq \\mathrm{zeroPhaseFilter}\\left(h,s\\right)', '\\mathrm{rows}\\left(y\\right)=',
  ];
  ws.regions = lines.map((l, i) => ({ id: `w${i}`, left: 60, top: 40 + i * 30 - 8, alignX: 60, alignY: 40 + i * 30, disabled: false, content: readRegion(l) }));
  ws.regions.push({ id: 'wp', left: 60, top: 300, alignX: 60, alignY: 300, disabled: false,
    content: { k: 'plot', x: readTex('m'), ys: [readTex('\\left|S_{m}\\right|')], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 300, height: 150 } });
  // 0.1 s of a 1 kHz tone at 8 kHz, 16-bit mono.
  const n = 800;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(16000 * Math.sin((2 * Math.PI * 1000 * i) / 8000)), 44 + i * 2);
  await page.evaluate((t) => (window as any).mathmath.load('wav.mathmath', t), saveWorksheet(ws));
  await idle(page);
  await sleep(100);
  const needs = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].filter((e) => e.classList.contains('needs-file') || e.classList.contains('stale')).length);
  check('a sheet reading a WAV file that is not attached grays what needs it', needs >= 3, needs);
  await page.evaluate((data) => (window as any).mathmath.doc.attach([{ name: 'beep.wav', mime: 'audio/wav', data }]), wav.toString('base64'));
  await idle(page);
  await sleep(150);
  const got = await page.evaluate(() => {
    const d = (window as any).mathmath.doc;
    const o = (id: string) => d.outcomes.get(id);
    const el = document.querySelector<HTMLElement>('.region.plot')!;
    return {
      errors: [...document.querySelectorAll<HTMLElement>('.region.error')].map((e) => e.title),
      rate: document.querySelector<HTMLElement>('[data-id="w2"]')?.innerText.replace(/\s+/g, ' ') ?? '',
      rows: document.querySelector<HTMLElement>('[data-id="w7"]')?.innerText.replace(/\s+/g, ' ') ?? '',
      paths: el.querySelectorAll('.plot-svg path').length,
      peak: (() => {
        const t = o('wp')?.plot?.traces?.[0];
        if (!t) return -1;
        let best = 0;
        for (let k = 1; k < t.y.length; k++) if (t.y[k] > t.y[best]) best = k;
        return t.x[best];
      })(),
    };
  });
  check('attaching it calculates: readWav gives the samples, wavRate the rate in hertz', got.errors.length === 0 && /8000|8\s*×\s*10/.test(got.rate), got);
  check('cfft of 800 samples puts a 1 kHz tone at bin 100', got.peak === 100, got.peak);
  check('the spectrum plots, and a zero-phase filter keeps the length', got.paths >= 1 && got.rows.includes('800'), got);
  await page.close();

  // The names can be typed.
  const typed = await fresh();
  await type(typed, 72, 72, 'h:firLowpass(5,0.1');
  await type(typed, 72, 108, 'h=');
  await type(typed, 72, 300, 'b:butterLowpass(2,0.25');
  await type(typed, 72, 360, 'rows(fft(hannWindow(8', R, R, R, '=');
  const t = await shown(typed);
  check('typed signal functions calculate', t[1]?.startsWith('h=') === true && !(await typed.evaluate(() => document.querySelector('.region.error'))) && t[3]?.replace(/\s/g, '').endsWith('=5') === true, t);
  await typed.close();
}

// Image processing: display options from Format, and writeImage's Save button.
{
  const page = await fresh();
  const ws = emptyWorksheet();
  const lines = ['i\\coloneq 0..15', 'j\\coloneq 0..15', 'M_{i,j}\\coloneq i\\cdot j', 'w\\coloneq \\mathrm{writeImage}\\left(\\text{"out.png"},\\mathrm{gaussianBlur}\\left(M,1\\right)\\right)'];
  ws.regions = lines.map((l, k) => ({ id: `m${k}`, left: 60, top: 40 + k * 30 - 8, alignX: 60, alignY: 40 + k * 30, disabled: false, content: readRegion(l) }));
  ws.regions.push({ id: 'im', left: 60, top: 200, alignX: 60, alignY: 200, disabled: false, content: { k: 'image', expr: readTex('M'), mode: 'gray', width: 64, height: 64, png: null } });
  await page.evaluate((t) => (window as any).mathmath.load('img.mathmath', t), saveWorksheet(ws));
  await idle(page);
  await sleep(100);
  const firstPixel = () => page.evaluate(() => (window as any).mathmath.doc.outcomes.get('im')?.image?.rgba.slice(0, 3).join(',') ?? '');
  const lastPixel = () => page.evaluate(() => {
    const px = (window as any).mathmath.doc.outcomes.get('im')?.image?.rgba;
    return px ? [...px.slice(px.length - 4, px.length - 1)].join(',') : '';
  });
  check('a matrix of 0 to 225 shows as gray, unscaled', (await lastPixel()) === '225,225,225', await lastPixel());
  const imgBox = await page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('[data-id="im"]')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(imgBox.x, imgBox.y);
  await sleep(80);
  const pick = (label: string) => page.evaluate((l) => [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((b) => b.textContent === l)!.click(), label);
  await pick('Fit image to its range');
  await idle(page);
  await sleep(80);
  check('Format → Fit image to its range stretches it to white', (await lastPixel()) === '255,255,255' && (await model(page)).regions.find((r: any) => r.id === 'im').content.fit === true, await lastPixel());
  await pick('False color (blue ramp)');
  await idle(page);
  await sleep(80);
  check('Format → False color uses the blue ramp', (await firstPixel()) === '205,226,251' && (await lastPixel()) === '13,54,107', [await firstPixel(), await lastPixel()]);
  const savedImg = await page.evaluate(() => (window as any).mathmath.save());
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await idle(page);
  await sleep(80);
  check('one undo takes false color off', (await model(page)).regions.find((r: any) => r.id === 'im').content.falseColor === undefined);
  check('a saved sheet keeps both options', /"fit":true/.test(savedImg) && /"falseColor":true/.test(savedImg));
  // The Save button: its download is a PNG of the blurred matrix.
  const button = await page.evaluate(() => document.querySelector('[data-id="m3"] .saves button')?.textContent ?? '');
  check('writeImage puts a Save button under its region', button === 'Save out.png', button);
  const file = await page.evaluate(async () => {
    const made: Blob[] = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => {
      made.push(b as Blob);
      return original(b);
    };
    const clicked: string[] = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicked.push(this.download); };
    document.querySelector<HTMLButtonElement>('[data-id="m3"] .saves button')!.click();
    for (let n = 0; n < 50 && made.length === 0; n++) await new Promise((r) => setTimeout(r, 20));
    URL.createObjectURL = original;
    HTMLAnchorElement.prototype.click = click;
    const bytes = made[0] ? [...new Uint8Array(await made[0].arrayBuffer()).slice(0, 8)] : [];
    return { type: made[0]?.type, bytes, clicked };
  });
  check('clicking it downloads a PNG named as written', file.type === 'image/png' && file.bytes.join(',') === '137,80,78,71,13,10,26,10' && file.clicked[0] === 'out.png', file);
  await page.close();

  // Mathcad's file writes, WRITEBMP("name") := M and the like, get Save buttons too.
  const writes = await fresh();
  await writes.evaluate((lines) => (window as any).mathmath.paper.insertExample(lines), [
    'M\\coloneq \\begin{pmatrix}0&255\\\\128&64\\end{pmatrix}',
    '\\mathrm{WRITEBMP}\\left(\\text{"C:\\textbackslash pictures\\textbackslash two by two.bmp"}\\right)\\coloneq M',
    '\\mathrm{WRITERGB}\\left(\\text{"stars.gif"}\\right)\\coloneq \\begin{pmatrix}255&0&9\\end{pmatrix}',
    '\\mathrm{WRITEPRN}\\left(\\text{"d.prn"}\\right)\\coloneq M',
  ]);
  await idle(writes);
  await sleep(150);
  const saves = await writes.evaluate(() => [...document.querySelectorAll('.saves button')].map((b) => b.textContent));
  check("Mathcad's WRITEBMP, WRITERGB and WRITEPRN offer their files, named without folders; a .gif as PNG", JSON.stringify(saves) === JSON.stringify(['Save two by two.bmp', 'Save stars.png', 'Save d.prn']), saves);
  const got = await writes.evaluate(async () => {
    const made: Blob[] = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => {
      made.push(b as Blob);
      return original(b);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    const out: { type: string; head: string }[] = [];
    for (const b of document.querySelectorAll<HTMLButtonElement>('.saves button')) {
      const n = made.length;
      b.click();
      for (let k = 0; k < 50 && made.length === n; k++) await new Promise((r) => setTimeout(r, 20));
      const blob = made.at(-1)!;
      out.push({ type: blob.type, head: new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 16)) });
    }
    URL.createObjectURL = original;
    HTMLAnchorElement.prototype.click = click;
    return out;
  });
  check('they download a bitmap, a PNG and the numbers as text', got[0]?.type === 'image/bmp' && got[0].head.startsWith('BM') && got[1]?.type === 'image/png' && got[2]?.type === 'text/plain' && got[2].head.startsWith('       0     255'), got);
  await writes.close();

  const typed = await fresh();
  await type(typed, 72, 72, 'A:identity(5', R, '*200');
  await type(typed, 72, 160, 'rows(gaussianBlur(A,1', R, R, '=');
  const shownTyped = await shown(typed);
  check('a typed image function calculates', !(await typed.evaluate(() => document.querySelector('.region.error'))) && shownTyped[1]?.replace(/\s/g, '').endsWith('=5') === true, shownTyped);
  await typed.close();
}

// Electrical: typed units, and complex results switched to magnitude∠angle from Format.
{
  const page = await fresh();
  const ws = emptyWorksheet();
  const lines = ['Z\\coloneq 3\\cdot \\Omega+4\\mathrm{i}\\cdot \\Omega', 'Z=', '\\mathrm{phasor}\\left(2,90\\cdot \\mathrm{deg}\\right)=', '\\mathrm{parallel}\\left(Z,Z\\right)='];
  ws.regions = lines.map((l, k) => ({ id: `e${k}`, left: 60, top: 40 + k * 40 - 8, alignX: 60, alignY: 40 + k * 40, disabled: false, content: readRegion(l) }));
  await page.evaluate((t) => (window as any).mathmath.load('ac.mathmath', t), saveWorksheet(ws));
  await idle(page);
  const value = (id: string) => page.evaluate((i) => (window as any).mathmath.doc.outcomes.get(i)?.value ?? '', id);
  check('complex results show as re + im·i at first', (await value('e1')) === '3+4\\mathrm{i}\\ \\Omega' && (await value('e3')).startsWith('1.5+2'), [await value('e1'), await value('e3')]);
  const center = (id: string) => page.evaluate((i) => {
    const r = document.querySelector<HTMLElement>(`[data-id="${i}"]`)!.getBoundingClientRect();
    return { x: r.left + 8, y: r.top + r.height / 2 };
  }, id);
  const a = await center('e1');
  const b = await center('e2');
  await page.keyboard.down('Shift');
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  await sleep(80);
  const pick = (label: string) => page.evaluate((l) => [...document.querySelectorAll<HTMLButtonElement>('#toolbar .menu button')].find((x) => x.textContent === l)!.click(), label);
  await pick('Complex results as magnitude∠angle');
  await idle(page);
  await sleep(80);
  check('Format → magnitude∠angle switches every selected result', (await value('e1')) === '5\\angle {53.13}^{\\circ}\\ \\Omega' && (await value('e2')) === '2\\angle {90}^{\\circ}', [await value('e1'), await value('e2')]);
  check('results not selected stay as they were', (await value('e3')).startsWith('1.5+2'), await value('e3'));
  await pick('Complex results as magnitude∠angle');
  await idle(page);
  await sleep(80);
  check('picking it again switches them back', (await value('e1')) === '3+4\\mathrm{i}\\ \\Omega', await value('e1'));
  await page.close();

  const typed = await fresh();
  await type(typed, 72, 72, 'R:4.7*kohm');
  await type(typed, 72, 120, 'C:100*nF');
  await type(typed, 72, 168, '1/(2*pi', R, '*R*C', R, '=');
  await type(typed, 72, 260, 'G:2*Omega');
  const shownTyped = await shown(typed);
  const typedModel = await model(typed);
  check('kohm and nF typed in the editor are units', typedModel.regions[0]?.content.value?.args?.[1]?.name === 'kohm' && !(await typed.evaluate(() => document.querySelector('.region.error'))), [typedModel.regions[0]?.content, shownTyped]);
  check('an RC corner frequency comes out in 1/s', /338\.6/.test(shownTyped[2] ?? ''), shownTyped);
  check('Omega typed alone is the ohm', typedModel.regions[3]?.content.value?.args?.[1]?.name === 'Ω', typedModel.regions[3]?.content);
  await typed.close();
}

// Solve blocks, typed: Given, an equation, Find; and an equation in primes.
{
  const page = await fresh();
  await type(page, 72, 60, 'x:3');
  await type(page, 72, 100, 'Given');
  await type(page, 72, 140, 'x^2', R, '=16');
  await type(page, 72, 180, 'Find(x', R, '=');
  await type(page, 72, 240, "y''(t", R, '+y(t', R, '=0');
  const shownSolve = await shown(page);
  const solveModel = await model(page);
  check('Given typed is the solve block keyword', solveModel.regions[1]?.content.k === 'show' && solveModel.regions[1]?.content.expr?.name === 'Given', solveModel.regions[1]?.content);
  check('an equation typed between is a constraint', solveModel.regions[2]?.content.expr?.op === 'equal', solveModel.regions[2]?.content);
  check('Find solves the block', /=4$/.test((shownSolve[3] ?? '').replace(/\s/g, '')), shownSolve);
  check("primes typed after a name are part of it, y''", JSON.stringify(solveModel.regions[4]?.content ?? {}).includes(`"name":"y''"`), solveModel.regions[4]?.content);
  await page.close();
}

// The splash: what MathMath is, and the copyright, when it opens.
{
  const page = await fresh(true);
  // Other pages in this browser turned it off; start as a first visit does.
  await page.evaluate(() => localStorage.removeItem('mathmath.splash'));
  await page.reload();
  await page.waitForFunction('!!window.mathmath');
  await sleep(100);
  const splash = () => page.evaluate(() => {
    const s = document.getElementById('splash')!;
    return { open: !s.hidden, text: s.innerText, focus: document.activeElement?.textContent ?? '' };
  });
  let s = await splash();
  check('the splash shows when the app opens, with the copyright', s.open && s.text.includes('© 2026 Pelican Labs, LLC') && s.text.includes('GNU Affero') && s.text.includes('not affiliated with or endorsed by PTC'), s.text.slice(0, 120));
  const giac = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('#splash .legal a.giac, #splash .legal a.giac-source')].map((a) => a.href));
  check('it names Giac, its license and its source, in every build', s.text.includes('Giac, by Bernard Parisse') && s.text.includes('GNU General Public License')
    && giac[0] === 'https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html' && /\/giac_2\.0\.0-14\.tar\.gz$/.test(giac[1] ?? ''), giac);
  const amos = await page.evaluate(async () => {
    const a = document.querySelector<HTMLAnchorElement>('#splash .legal a.amos-license');
    const text = a ? await (await fetch(a.href)).text() : '';
    return { href: a?.href ?? '', scipy: text.includes('Copyright (C) 2024 SciPy developers'), sandia: text.includes('APPROVED FOR UNLIMITED RELEASE') };
  });
  check('About links the notices of the Amos port, and they are served', amos.scipy && amos.sandia, amos);
  const lapack = await page.evaluate(async () => {
    const a = document.querySelector<HTMLAnchorElement>('#splash .legal a.lapack-license');
    const text = a ? await (await fetch(a.href)).text() : '';
    return { href: a?.href ?? '', license: text.includes('The University of Tennessee') && text.includes('LAPACK 3.0') };
  });
  check('About links LAPACK\'s license, and it is served', lapack.license, lapack);
  check('it says what the app is, and its button has focus', s.text.includes('So good we named it twice') && s.focus === 'Start calculating', s.focus);
  await page.keyboard.press('Escape');
  await sleep(60);
  check('Esc closes it', !(await splash()).open);
  check('a plain build has no site script, and its site bar stays hidden and empty', await page.evaluate(() => {
    const slot = document.getElementById('site-slot')!;
    return slot.hidden && slot.childElementCount === 0 && !document.querySelector('script[src="/site/extras.js"]') && !document.querySelector('#splash .legal a.site-source');
  }));
  await page.evaluate(() => (document.querySelector('#toolbar .version') as HTMLElement).click());
  await sleep(60);
  check('the version on the toolbar opens it again', (await splash()).open);
  await page.click('#splash .at-start');
  await page.click('#splash .start');
  await page.reload();
  await page.waitForFunction('!!window.mathmath');
  await sleep(100);
  check('turned off, it stays closed when the app opens again', !(await splash()).open);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === 'Help')!.click());
  await sleep(60);
  await page.evaluate(() => (document.querySelector('#help-panel [data-about]') as HTMLElement).click());
  await sleep(60);
  check('About MathMath in Help opens it', (await splash()).open);
  const icons = await page.evaluate(async () => {
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')].map((l) => l.href);
    const manifest = await (await fetch('/manifest.webmanifest')).json() as { name: string; icons: { src: string }[] };
    const all = [...links, ...manifest.icons.map((i) => new URL(i.src, location.href).href)];
    const status = await Promise.all(all.map(async (u) => (await fetch(u)).status));
    return { links: links.length, name: manifest.name, icons: manifest.icons.length, ok: status.every((s) => s === 200) };
  });
  check('the favicon, touch icon and app manifest are there, with every icon they name', icons.links === 4 && icons.name === 'MathMath' && icons.icons === 4 && icons.ok, icons);
  await page.emulateMediaType('print');
  check('it doesn\'t print', await page.evaluate(() => getComputedStyle(document.getElementById('splash')!).display === 'none'));
  await page.emulateMediaType();
  await page.close();
}

// Random numbers: steady while editing, new ones with Reroll, and undo takes them back.
{
  const page = await fresh();
  await type(page, 72, 72, 'x:rnorm(3,0,1');
  await type(page, 72, 120, 'x=');
  await idle(page);
  const value = async () => (await shown(page))[1] ?? '';
  const first = await value();
  await type(page, 300, 72, 'y:1');
  await idle(page);
  check('random numbers stay the same as the sheet recalculates', (await value()) === first && /\d/.test(first), first);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === 'Reroll')!.click());
  await idle(page);
  const second = await value();
  check('Reroll draws new ones', second !== first && /\d/.test(second), [first, second]);
  const saved = await page.evaluate(() => (window as any).mathmath.save() as string);
  check('the new seed is saved with the sheet', /"seed": ?\d+/.test(saved));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await idle(page);
  check('undo brings the old numbers back', (await value()) === first, [first, await value()]);
  await page.close();
}

// A phone: the page fits the screen, one row of tools, and the keypad for math.
{
  const page = await fresh();
  await page.emulate(KnownDevices['iPhone 13']);
  await page.reload();
  await page.waitForFunction('!!window.mathmath');
  await sleep(300);
  const layout = () => page.evaluate(() => ({
    toolbar: document.getElementById('toolbar')!.getBoundingClientRect().height,
    sheet: document.getElementById('sheet')!.getBoundingClientRect().width,
    width: innerWidth,
    keypad: (window as any).mathVirtualKeyboard?.visible === true,
    bar: !document.getElementById('keypad-bar')?.hidden,
  }));
  let l = await layout();
  check('on a phone the page fits the screen\'s width, and the tools are one row', l.sheet <= l.width && l.sheet > l.width * 0.8 && l.toolbar < 50, l);
  const box = await page.evaluate(() => document.getElementById('sheet')!.getBoundingClientRect().toJSON());
  await page.touchscreen.tap(box.left + 60, box.top + 60);
  await sleep(1500);
  l = await layout();
  check('tapping the paper opens math there, with the keypad and its bar', l.keypad && l.bar && (await page.evaluate(() => (window as any).mathmath.paper.mathEditor.isOpen)), l);
  const caps = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.MLK__keycap')].map((k) => {
    const r = k.getBoundingClientRect();
    return { t: k.innerText.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  }).filter((k) => k.w > 0));
  const key = async (t: string) => {
    const c = caps.find((k) => k.t === t);
    if (c) await page.touchscreen.tap(c.x, c.y);
    await sleep(150);
  };
  const action = (t: string) => page.evaluate((label) => [...document.querySelectorAll<HTMLButtonElement>('#keypad-bar button')].find((b) => b.textContent === label)!.click(), t);
  for (const t of ['x', ':=', '7', '×', '6']) await key(t);
  await action('⏎');
  await sleep(300);
  for (const t of ['x', '=']) await key(t);
  await action('Done');
  await idle(page);
  await sleep(300);
  const regions = await shown(page);
  check('keys and the bar type and finish math: x := 7·6, then x = 42', regions.join('|').replace(/\s/g, '').includes('x=42'), regions);
  l = await layout();
  check('Done puts the keypad away', !l.keypad && !l.bar, l);
  // A long press selects a region; then a finger drags it.
  const first = await page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('.region')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: (document.querySelector('.region') as HTMLElement).dataset.id };
  });
  const was = (await model(page)).regions.find((r: { id: string }) => r.id === first.id);
  await page.touchscreen.touchStart(first.x, first.y);
  await sleep(700);
  await page.touchscreen.touchEnd();
  await sleep(100);
  check('a long press selects a region without opening it', await page.evaluate((id) => document.querySelector(`.region[data-id="${id}"]`)!.classList.contains('selected'), first.id)
    && !(await page.evaluate(() => (window as any).mathmath.paper.mathEditor.isOpen)));
  await page.touchscreen.touchStart(first.x, first.y);
  for (let n = 1; n <= 5; n++) await page.touchscreen.touchMove(first.x + n * 10, first.y + n * 6);
  await page.touchscreen.touchEnd();
  await sleep(200);
  const moved = (await model(page)).regions.find((r: { id: string }) => r.id === first.id);
  check('a finger drags the selected region', moved.left > was.left + 50 && moved.top > was.top + 30, [was.left, was.top, moved.left, moved.top]);
  const before = l.sheet;
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === '+')!.click());
  await sleep(150);
  check('+ zooms the page in', (await layout()).sheet > before * 1.2);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === 'Fit')!.click());
  await sleep(150);
  check('Fit fits it again', Math.abs((await layout()).sheet - before) < 2);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === '☰')!.click());
  await sleep(150);
  check('☰ shows every tool', (await layout()).toolbar > 100);
  await page.close();
}

// Help: the panel, its search, Insert, and F1 on the name being typed.
{
  const page = await fresh();
  const panel = () => page.evaluate(() => {
    const p = document.getElementById('help-panel')!;
    return { open: !p.hidden, title: p.querySelector('h2')?.textContent ?? '', results: [...p.querySelectorAll('.results a')].map((a) => a.textContent) };
  });
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === 'Help')!.click());
  await sleep(100);
  let h = await panel();
  check('Help on the toolbar opens the panel at its contents', h.open && h.title === 'Topics', h);
  await page.type('#help-panel input', 'standing wave');
  await sleep(100);
  h = await panel();
  check('search finds an entry by what it does', h.results[0] === 'vswr', h);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await sleep(100);
  h = await panel();
  check('Backspace in the search stays in the search, and Enter opens the first match', h.title === 'vswr(Γ)', h);
  await page.click('#help-panel .insert');
  await idle(page);
  await sleep(200);
  const inserted = await shown(page);
  check('Insert puts the example on the sheet, calculated', inserted.length === 2 && /=3$/.test(inserted[0]!.replace(/\s/g, '')), inserted);
  await page.keyboard.press('Escape');
  await sleep(60);
  check('Esc closes it', !(await panel()).open);
  await type(page, 72, 300, 'z:lineInput(100');
  await clickAt(page, 72, 300);
  await sleep(100);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('F1');
  await sleep(100);
  h = await panel();
  check('F1 while typing opens the entry of the function the caret is in', h.open && h.title === 'lineInput(ZL, Z0, θ)', h);
  await page.emulateMediaType('print');
  check('the panel doesn\'t print', await page.evaluate(() => getComputedStyle(document.getElementById('help-panel')!).display === 'none'));
  await page.emulateMediaType();
  await page.close();
}

// The elementary functions on complex numbers, typed as a user would.
{
  const page = await fresh();
  await type(page, 72, 72, 'acosh(0.5', R, '=');
  await type(page, 72, 108, 'signum(3+4i', R, '=');
  await type(page, 72, 144, 'asin(2', R, '=');
  const s = await shown(page);
  check('typed acosh(0.5), signum(3+4i) and asin(2) give complex answers', s[0]?.replace(/\s/g, '') === 'acosh(0.5)=1.047i'
    && s[1]?.replace(/\s/g, '') === 'signum(3+4i)=0.6+0.8i' && s[2]?.replace(/\s/g, '') === 'asin(2)=1.571−1.317i', s);
  await page.close();
}

// Strings and rounding to a step, typed as a user would.
{
  const page = await fresh();
  await type(page, 72, 72, 'str2num("0FFh")=');
  await type(page, 72, 108, 'Floor(0.3,0.1', R, '=');
  await type(page, 72, 144, 'format("{0} and {1}",3,4.5)=');
  await type(page, 72, 180, 'concat("a","b")=');
  const s = await shown(page);
  check('typed str2num("0FFh"), Floor(0.3,0.1), format and concat("a","b") give Mathcad\'s answers, braces shown', s[0]?.replace(/\s/g, '') === 'str2num("0FFh")=255'
    && s[1]?.replace(/\s/g, '') === 'Floor(0.3,0.1)=0.3' && s[2]?.replace(/\s/g, '') === 'format("{0}and{1}",3,4.5)="3and4.5"' && s[3]?.replace(/\s/g, '') === 'concat("a","b")="ab"', s);
  await page.close();
}

// Special functions, typed as a user would: a scaled Bessel function's .sc is a literal subscript, and Γ is G, Ctrl+G.
{
  const page = await fresh();
  await type(page, 72, 72, 'J0.sc(1)=');
  await type(page, 72, 108, 'G', G, '(5)=');
  await type(page, 72, 144, 'Jn(0.5,-2)=');
  await type(page, 72, 180, 'lnG', G, '(5)=');
  const s = await shown(page);
  check('typed J0.sc(1), Γ(5), Jn(0.5,−2) and lnΓ(5) calculate', s[0]?.replace(/[\s\u200b]/g, '') === 'J0sc(1)=0.765' && s[1]?.replace(/\s/g, '') === 'Γ(5)=24'
    && s[2]?.replace(/\s/g, '') === 'Jn(0.5,−2)=0.513i' && s[3]?.replace(/\s/g, '') === 'lnΓ(5)=3.178', s);
  await page.close();
}

// Finance, typed as a user would: a rate as a percentage, with %.
{
  const page = await fresh();
  await type(page, 72, 72, 'r:8.25%');
  await type(page, 72, 108, 'pmt(r/12', R, ',360,200000)=');
  await type(page, 72, 144, 'r=');
  const s = await shown(page);
  const tex = (await model(page)).regions.map((r: { content: { value?: unknown } }) => JSON.stringify(r.content)).join(' ');
  check('typed 8.25% is a percentage, and pmt gives Mathcad\'s payment', s[1]?.replace(/[\s\u200b]/g, '') === 'pmt(12r,360,200000)=−1.503×103' && s[2]?.replace(/\s/g, '') === 'r=0.083'
    && tex.includes('"%"'), { s, tex: tex.slice(0, 200) });
  // % in the answer's unit blank shows it as a percentage.
  const slot = await page.evaluate(() => {
    const el = document.querySelectorAll<HTMLElement>('.region')[2]!.querySelector<HTMLElement>('[data-slot="unit"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (slot) {
    await page.mouse.click(slot.x, slot.y);
    await sleep(120);
    await keys(page, '%');
    await page.keyboard.press('Escape');
    await sleep(60);
  }
  const pct = (await shown(page))[2]?.replace(/[\s\u200b]/g, '');
  check('% typed in the unit blank shows the rate as a percentage', slot !== null && pct === 'r=8.25%', { slot, pct });
  await page.close();
}

// Plots and coordinates, typed as a user would: log in a name isn't the log function, digits run on in a name, and
// a function goes to CreateMesh by its name; then a CreateSpace value plots as a curve.
{
  const page = await fresh();
  await type(page, 72, 72, 'logspace(1,1000,4)=');
  await type(page, 72, 144, 'logpts(0,1,3)=');
  await type(page, 72, 216, 'xy2pol(3,4)=');
  await type(page, 72, 288, 'sph2xyz(1,0,0)=');
  await type(page, 72, 360, 'G(s,t', R, ':s*t');
  await type(page, 72, 396, 'rows(CreateMesh(G,0,1,0,1,2,3', R, R, R, ')=');
  await type(page, 72, 432, 'c(t', R, ':t^2');
  const s = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  check('typed logspace, logpts, xy2pol, sph2xyz and CreateMesh calculate', s[0]?.startsWith('logspace(1,1000,4)=') === true && s[0].includes('100')
    && s[1]?.includes('4') === true && s[1].includes('7') && s[2]?.includes('0.927') === true && s[3]?.replace(/[()]/g, '').includes('sph2xyz1,0,0=') === true
    && s[5]?.endsWith('=1') === true, s);
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const call = { k: 'call', fn: { k: 'id', name: 'CreateSpace' }, args: [{ k: 'id', name: 'c' }, { k: 'real', v: 0 }, { k: 'real', v: 6 }, { k: 'real', v: 50 }] };
    const plot = { id: 'p3d', left: 60, top: 500, alignX: 60, alignY: 500, disabled: false,
      content: { k: 'plot', x: null, ys: [call], xAxis: { min: null, max: null, log: false }, yAxis: { min: null, max: null, log: false }, markers: false, width: 260, height: 200, view: 'surface' } };
    m.load('c.mathmath', JSON.stringify({ format: 'mathmath', version: 1, worksheet: { ...m.doc.ws, regions: [...m.doc.ws.regions, plot] } }));
  });
  await idle(page);
  await sleep(120);
  const curve = await page.evaluate(() => ({ segs: document.querySelectorAll('.region.plot path.curve3d').length, problem: document.querySelector('.region.plot .plot-problem')?.textContent ?? '' }));
  check('a CreateSpace value plots as a curve in space', curve.segs === 49 && !curve.problem, curve);
  await page.close();
}

// Smoothing and wavelets, typed as a user would against vectors already on the sheet.
{
  const page = await fresh();
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const vec = (items: number[]) => ({ k: 'matrix', rows: items.length, cols: 1, items: items.map((v) => ({ k: 'real', v })) });
    const def = (id: string, top: number, name: string, value: unknown) => ({ id, left: 60, top, alignX: 60, alignY: top + 10, disabled: false,
      content: { k: 'define', target: { k: 'var', name }, value, global: false, stored: null, unit: null, shown: false } });
    m.load('s.mathmath', JSON.stringify({ format: 'mathmath', version: 1, worksheet: { ...m.doc.ws, regions: [
      def('x', 40, 'x', vec([1, 2, 3, 4, 5])), def('y', 40 + 0, 'y', vec([2, 1, 4, 3, 5])), def('v', 40, 'v', vec([1, 2, 3, 4, 5, 6, 7, 8])),
    ] } }));
  });
  await idle(page);
  await type(page, 72, 180, 'supsmooth(x,y)=');
  await type(page, 72, 300, 'wave(v)=');
  await type(page, 300, 180, 'ksmooth(x,y,1)=');
  const s = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  const has = (start: string, bit: string) => s.some((x) => x.startsWith(start) && x.includes(bit));
  check('typed supsmooth, ksmooth and wave calculate', has('supsmooth(x,y)=', '3.8') && has('wave(v)=', '5.902') && has('ksmooth(x,y,1)=', '3.075'), s);
  await page.close();
}

// FIF, hhmmss and DMS in a result's unit placeholder show it in that format; typed, FIF reads a builder's length.
{
  const page = await fresh();
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const times = (v: number, unit: string) => ({ k: 'op', op: 'mult', args: [{ k: 'real', v }, { k: 'id', name: unit }] });
    const ev = (id: string, top: number, expr: unknown, unit: string) => ({ id, left: 60, top, alignX: 60, alignY: top + 10, disabled: false,
      content: { k: 'eval', expr, stored: null, unit: { k: 'id', name: unit } } });
    m.load('f.mathmath', JSON.stringify({ format: 'mathmath', version: 1, worksheet: { ...m.doc.ws, regions: [
      ev('a', 40, times(114.25, 'in'), 'FIF'), ev('b', 100, times(3723.5, 's'), 'hhmmss'), ev('c', 160, times(10.51, 'deg'), 'DMS'), ev('d', 220, times(3, 'kg'), 'FIF'),
    ] } }));
  });
  await idle(page);
  await type(page, 72, 300, 'FIF(9,6,0.25)=');
  const s = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  check('FIF, hhmmss and DMS show a result in their formats', s.some((x) => /"9['’]6-1\/4""FIF/.test(x)) && s.some((x) => x.includes('"1:2:3.5"hhmmss'))
    && s.some((x) => /10.*30.*36.*DMS/.test(x)) && s.some((x) => x.startsWith('FIF(9,6,0.25)=2.902m')), s);
  const err = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.error')].map((e) => e.title));
  check('a mass in FIF is refused', err.length === 1 && /length/.test(err[0]!), err);
  await page.close();
}

// genvals, genvecs and svd2, typed against matrices already on the sheet.
{
  const page = await fresh();
  await page.evaluate(() => {
    const m = (window as any).mathmath;
    const mat = (rows: number[][]) => ({ k: 'matrix', rows: rows.length, cols: rows[0]!.length, items: rows[0]!.flatMap((_, j) => rows.map((r) => ({ k: 'real', v: r[j] }))) });
    const def = (id: string, left: number, name: string, value: unknown) => ({ id, left, top: 40, alignX: left, alignY: 50, disabled: false,
      content: { k: 'define', target: { k: 'var', name }, value, global: false, stored: null, unit: null, shown: false } });
    m.load('g.mathmath', JSON.stringify({ format: 'mathmath', version: 1, worksheet: { ...m.doc.ws, regions: [
      def('K', 60, 'K', mat([[2, 1, 0], [1, 3, 1], [0, 1, 4]])), def('M', 260, 'M', mat([[4, 1, 0], [1, 2, 0], [0, 0, 1]])), def('P', 460, 'P', mat([[1, 2], [3, 4], [5, 6]])),
    ] } }));
  });
  await idle(page);
  await type(page, 72, 160, 'genvals(K,M)=');
  await type(page, 300, 160, 'genvecs(K,M)=');
  await type(page, 72, 300, 'S:svd2(P)');
  await type(page, 72, 360, 'S[0', R, '=');
  const s = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  const has = (start: string, bit: string) => s.some((x) => x.startsWith(start) && x.includes(bit));
  check('typed genvals, genvecs and svd2 give Mathcad\'s answers', has('genvals(K,M)=', '0.4591.3294.211') && has('genvecs(K,M)=', '−10.301−0.085') && has('S0=', '9.526'), s);
  await page.close();
}

// statespace, sbval and Jacob, typed against functions already on the sheet.
{
  const page = await fresh();
  const ws = emptyWorksheet();
  const lines = [
    'A\\left(t\\right)\\coloneq \\begin{pmatrix}0&1\\\\-4&-0.2\\end{pmatrix}', 'D\\left(x,y\\right)\\coloneq \\begin{pmatrix}y_{1}\\\\-y_{0}\\end{pmatrix}',
    'L\\left(x,v\\right)\\coloneq \\begin{pmatrix}0\\\\v_{0}\\end{pmatrix}', 'S\\left(x,y\\right)\\coloneq y_{0}-1',
    'F\\left(x\\right)\\coloneq \\begin{pmatrix}x_{0}^{2}\\cdot x_{1}\\\\5\\cdot x_{0}\\end{pmatrix}', 'x\\coloneq \\begin{pmatrix}1\\\\2\\end{pmatrix}',
  ];
  ws.regions = lines.map((l, i) => ({ id: `d${i}`, left: 60, top: 40 + i * 50 - 8, alignX: 60, alignY: 40 + i * 50, disabled: false, content: readRegion(l) }));
  await page.evaluate((t) => (window as any).mathmath.load('ode.mathmath', t), saveWorksheet(ws));
  await idle(page);
  await type(page, 72, 340, 'sbval(1,0,1,D,L,S)=');
  await type(page, 72, 400, 'Jacob(F(x),x)=');
  await type(page, 72, 480, 'statespace(stack(1,0),0,1,2,A)=');
  const s = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  const has = (start: string, bit: string) => s.some((x) => x.startsWith(start) && x.includes(bit));
  const notes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.error')].map((e) => e.title));
  check('typed sbval, Jacob and statespace calculate', has('sbval(1,0,1,D,L,S)=', '1.188') && has('Jacob(F(x),x)=', '4510') && has('statespace(stack(1,0),0,1,2,A)=', '0.555'), { s, notes });
  await page.close();
}

// Mathcad's file functions: grayed with a note naming MathMath's, and Convert changes them once the files are attached.
{
  const page = await fresh();
  const ws = emptyWorksheet();
  const lines = [
    'P\\coloneq \\mathrm{READRGB}\\left(\\text{"C:\\\\pics\\\\two.bmp"}\\right)', 'P=',
    'H\\coloneq \\mathrm{READ\\_HSV\\_HUE}\\left(\\text{"C:\\\\pics\\\\two.bmp"}\\right)', 'H=',
    'S\\coloneq \\mathrm{READWAV}\\left(\\text{"beep.wav"}\\right)', 'S=',
  ];
  ws.regions = lines.map((l, i) => ({ id: `c${i}`, left: 60, top: 40 + i * 40 - 8, alignX: 60, alignY: 40 + i * 40, disabled: false, content: readRegion(l) }));
  await page.evaluate((t) => (window as any).mathmath.load('convert.mathmath', t), saveWorksheet(ws));
  await idle(page);
  await sleep(100);
  const bar = () => page.evaluate(() => {
    const b = document.getElementById('convert-bar')!;
    return { shown: !b.hidden, text: b.textContent ?? '', button: !b.querySelector('button')!.hidden };
  });
  const before = await bar();
  const note = await page.evaluate(() => document.querySelector<HTMLElement>('[data-id="c0"]')?.title ?? '');
  check('a Mathcad file function is grayed, its note naming MathMath\'s, and the bar offers to convert', before.shown && /readImage\("name"\)/.test(note) && before.text.includes('Convert changes READRGB') && before.text.includes('READWAV (attach beep.wav first'), { before, note });
  // A 2 × 1 bitmap, red then (10, 200, 90), and four 16-bit samples.
  const bmp = Buffer.alloc(54 + 8);
  bmp.write('BM', 0); bmp.writeUInt32LE(62, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(2, 18); bmp.writeInt32LE(1, 22);
  bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(8, 34);
  Buffer.from([0, 0, 255, 90, 200, 10, 0, 0]).copy(bmp, 54);
  const wav = Buffer.alloc(44 + 8);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(8, 40);
  [0, 1000, -32768, 32767].forEach((v, i) => wav.writeInt16LE(v, 44 + i * 2));
  await page.evaluate((b, w) => (window as any).mathmath.doc.attach([{ name: 'two.bmp', mime: 'image/bmp', data: b }, { name: 'beep.wav', mime: 'audio/wav', data: w }]), bmp.toString('base64'), wav.toString('base64'));
  await idle(page);
  await sleep(150);
  const ready = await bar();
  await page.click('#convert-bar button');
  await idle(page);
  await sleep(150);
  const s = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  const has = (start: string, bit: string) => s.some((x) => x.startsWith(start) && x.includes(bit));
  const after = await bar();
  check('Convert changes them all to MathMath\'s, with Mathcad\'s numbers', ready.button && ready.text.includes('READ_HSV_HUE and READWAV to MathMath') && !after.shown
    && s.some((x) => x.startsWith('P:=readImage("two.bmp")')) && has('P=', '25510') && has('H=', '0145.263') && has('S=', '01×103−3.277×1043.277×104'), s);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Control');
  await idle(page);
  await sleep(100);
  const undone = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  check('Undo puts the Mathcad calls back', undone.some((x) => x.startsWith('P:=READRGB')) && (await bar()).shown, undone);
  await page.close();
}

// Comparisons and Boolean operators, with Mathcad's keys and from the Boolean menu.
{
  const page = await fresh();
  await type(page, 72, 60, 'x:3');
  const key = (code: string, shift = false) => ({ press: code, ctrl: true, shift });
  await type(page, 72, 120, 'x>1', key('Digit7', true), 'x<5=');
  await type(page, 72, 180, 'x', key('Digit0'), '4', key('Digit6', true), 'x=');
  await type(page, 72, 240, key('Digit1', true), '(x', key('Digit5', true), '0)=');
  await clickAt(page, 300, 120);
  await keys(page, 'x>5');
  const menu = await page.$$eval('details.menu > summary', (els) => els.map((e) => e.textContent));
  await page.evaluate(() => {
    const m = [...document.querySelectorAll<HTMLDetailsElement>('details.menu')].find((d) => d.querySelector('summary')!.textContent === 'Boolean')!;
    m.open = true;
    [...m.querySelectorAll('button')].find((b) => b.textContent!.startsWith('Or'))!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await keys(page, 'x<5=');
  await page.keyboard.press('Escape');
  const s = (await shown(page)).map((x) => x.replace(/[\s\u200b]/g, ''));
  check('Boolean keys and menu type ∧, ≥, ∨, ¬ and ⊕', menu.includes('Boolean')
    && s.some((x) => x === 'x>1∧x<5=1') && s.some((x) => x === 'x≥4∨x=1') && s.some((x) => x === '¬(x⊕0)=0') && s.some((x) => x === 'x>5∨x<5=1'), s);
  await page.close();
}

// Examples: the gallery, from the splash, the toolbar and Help, and every example opens and calculates cleanly.
{
  const page = await fresh(true);
  await page.evaluate(() => localStorage.removeItem('mathmath.splash'));
  await page.reload();
  await page.waitForFunction('!!window.mathmath');
  await sleep(100);
  await page.click('#splash .try');
  await page.waitForFunction(() => document.querySelectorAll('#examples [data-slug]').length > 0, { timeout: 5000 }).catch(() => {});
  const gallery = () => page.evaluate(() => ({
    splash: !document.getElementById('splash')!.hidden,
    open: !document.getElementById('examples')!.hidden,
    slugs: [...document.querySelectorAll<HTMLElement>('#examples [data-slug]')].map((b) => b.dataset.slug!),
    focus: (document.activeElement as HTMLElement | null)?.dataset?.slug ?? '',
  }));
  const built = buildAll();
  let g = await gallery();
  check('Try an example on the splash closes it and opens the gallery, listing every example', !g.splash && g.open && JSON.stringify(g.slugs) === JSON.stringify(built.map((b) => b.slug)), g);
  check('the first example has focus', g.focus === built[0]?.slug, g.focus);
  await page.keyboard.press('Escape');
  await sleep(60);
  check('Esc closes the gallery', !(await gallery()).open);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((b) => b.textContent === 'Help')!.click());
  await sleep(60);
  await page.evaluate(() => (document.querySelector('#help-panel [data-examples]') as HTMLElement).click());
  await sleep(60);
  check('Examples in Help opens it', (await gallery()).open);
  await page.keyboard.press('Escape');
  for (const b of built) {
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#toolbar button')].find((x) => x.textContent === 'Examples')!.click());
    await page.waitForSelector(`#examples [data-slug="${b.slug}"]`, { timeout: 5000 });
    await page.click(`#examples [data-slug="${b.slug}"]`);
    await page.waitForFunction((t) => (window as any).mathmath.doc.name === t, { timeout: 5000 }, b.title).catch(() => {});
    await idle(page);
    // Symbolic answers come from the algebra engine, which loads on first use.
    if (b.symbolic) await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.region')].every((e) => !/→\s*$/.test(e.innerText.trim())), { timeout: 60000 }).catch(() => {});
    const r = await page.evaluate(() => ({
      name: (window as any).mathmath.doc.name as string,
      dirty: (window as any).mathmath.doc.dirty as boolean,
      regions: document.querySelectorAll('.region').length,
      errors: [...document.querySelectorAll<HTMLElement>('.region.error, .region.stale')].map((e) => [e.dataset.id!, e.title]),
    }));
    const unexpected = r.errors.filter(([id]) => !b.sheet.expectedErrors.has(id!));
    check(`example ${b.slug} opens and calculates with no errors but its own`, r.name === b.title && !r.dirty && r.regions === b.sheet.ws.regions.length + b.sheet.ws.texts.length && unexpected.length === 0 && r.errors.length === b.sheet.expectedErrors.size, r);
    if (b.slug === 'spectrum') {
      // Its time plots end at a typed 0.2·s, shown in the axis's unit as the fitted limits are.
      const ends = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.plot [data-slot="xmax"]')].slice(0, 1).map((e) => [e.innerText.trim(), e.querySelector('.typed') !== null]));
      check('a typed axis limit with a unit shows as a number in the axis unit', JSON.stringify(ends) === '[["0.2",true]]', ends);
    }
    if (b.slug === 'earth') {
      const s = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => e.innerText.replace(/\s+/g, '')).find((t) => t.includes('Apollo_17.jpg')));
      check('a string shows straight quotes', s === 'file:="The_Earth_seen_from_Apollo_17.jpg"', s);
    }
  }
  await page.close();
}

// Regions stay where they are: editing one moves nothing below it, unless it grows into what's below.
{
  const page = await fresh();
  const ws = emptyWorksheet();
  const at = (id: string, top: number, latex: string) => ({ id, left: 72, top, alignX: 72, alignY: top + 8, disabled: false, content: readRegion(latex) });
  ws.regions.push(at('1', 72, 'a\\coloneq 3'), at('2', 100, 'b\\coloneq a+1'), at('3', 220, 'b='));
  ws.texts.push({ id: '4', left: 72, top: 150, width: 200, height: 14, text: 'A note below' });
  await page.evaluate((t) => (window as any).mathmath.load('e.mathmath', t), saveWorksheet(ws));
  await idle(page);
  const tops = async () => {
    const m = await model(page);
    return Object.fromEntries([...m.regions, ...m.texts].map((r: { id: string; top: number }) => [r.id, r.top])) as Record<string, number>;
  };
  const edit = async (id: string, keysTyped: string, backspaces = 0) => {
    const box = await page.evaluate((i) => { const r = document.querySelector<HTMLElement>(`#sheet [data-id="${i}"]`)!.getBoundingClientRect(); return { x: r.right - 2, y: r.top + r.height / 2 }; }, id);
    await page.mouse.click(box.x, box.y);
    await sleep(150);
    await page.keyboard.press('End');
    for (let n = 0; n < backspaces; n++) await page.keyboard.press('Backspace');
    await keys(page, keysTyped);
    await page.keyboard.press('Escape');
    await idle(page);
  };
  const t0 = await tops();
  await edit('1', '4', 1);
  const t1 = await tops();
  check('changing a value moves nothing on the sheet', JSON.stringify(t1) === JSON.stringify(t0) && (await model(page)).regions[0].content.value?.v === 4, [t0, t1]);
  const note = await page.evaluate(() => { const r = document.querySelector<HTMLElement>('#sheet [data-id="4"]')!.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await page.mouse.click(note.x, note.y);
  await sleep(150);
  await page.mouse.click(note.x + 400, note.y + 300);
  await page.keyboard.press('Escape');
  await idle(page);
  const afterText = await tops();
  check('clicking into text and out moves nothing', Object.keys(t0).every((k) => afterText[k] === t0[k]), { afterText, model: JSON.stringify((await model(page)).regions.filter((r: { id: string }) => !(r.id in t0))).slice(0, 300), texts: JSON.stringify((await model(page)).texts.filter((r: { id: string }) => !(r.id in t0))).slice(0, 200) });
  // Nested fractions make the first region tall enough to reach the next one.
  await edit('1', '/2/3/5/7');
  const t2 = await tops();
  const grown = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('#sheet [data-id="1"]')!; return e.offsetTop + e.offsetHeight; });
  const second = await page.evaluate(() => document.querySelector<HTMLElement>('#sheet [data-id="2"]')!.offsetTop);
  const d = t2['2']! - t0['2']!;
  check('growing into a region moves the ones below just clear of it, together', d > 0 && second >= grown && t2['3']! - t0['3']! === d && t2['4']! - t0['4']! === d && t2['1'] === t0['1'], { t0, t2, grown, second });
  await page.keyboard.down('Control');
  await page.keyboard.press('z');
  await page.keyboard.up('Control');
  await idle(page);
  check('one undo puts the edit and the move back', JSON.stringify(await tops()) === JSON.stringify(t0), await tops());
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
