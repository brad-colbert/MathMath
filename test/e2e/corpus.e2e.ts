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

// Opens every worksheet in a private folder in the real app. Nothing from the folder is committed.
// Usage: tsx test/e2e/corpus.e2e.ts <folder for private reports>
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { corpusFolder, readSheets } from '../../src/cli/corpus.js';
import { selfContained } from '../../src/score/sheet.js';

const out = process.argv[2]!;
execSync('npx vite build --logLevel error', { stdio: 'inherit' });
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url!.split('?')[0]!);
  const path = join('dist', url === '/' ? 'index.html' : url);
  if (!existsSync(path) || !statSync(path).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 1100 } });

const counts = { sheets: 0, regions: 0, off: 0, wrongSize: 0, pdfWrong: 0, errors: 0, slowest: 0, slowName: '', tierAErrors: 0, tierADrafts: 0, tierAStale: 0, ms: 0 };
const problems = new Map<string, number>();
const note = (k: string): void => void problems.set(k, (problems.get(k) ?? 0) + 1);
const samples: string[] = [];
const toCompare: { name: string; shot: string; pdf: string; width: number; height: number }[] = [];
const wanted = (process.env.COMPARE ?? '').split(',').filter(Boolean);

for (const { path, xml, ws } of readSheets(corpusFolder())) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => note(`page error: ${String(e).slice(0, 120)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') note(`console: ${m.text().slice(0, 100)}`);
  });
  await page.goto(url);
  await page.waitForFunction('!!window.mathmath');
  await page.bringToFront();
  const r = await page.evaluate((name, text) => {
    const t = performance.now();
    (window as any).mathmath.load(name, text);
    const opened = performance.now() - t;
    const sheet = document.getElementById('sheet')!;
    const box = sheet.getBoundingClientRect();
    const doc = (window as any).mathmath.doc;
    const PT = 96 / 72;
    let off = 0;
    for (const item of doc.items()) {
      const el = document.querySelector<HTMLElement>(`.region[data-id="${item.region.id}"]`);
      if (!el) {
        off++;
        continue;
      }
      const b = el.getBoundingClientRect();
      if (Math.abs(b.left - box.left - item.region.left * PT) > 0.6 || Math.abs(b.top - box.top - item.region.top * PT) > 0.6) off++;
    }
    return {
      ms: opened, off, count: doc.items().length, width: box.width / PT, breaks: document.querySelectorAll('.pagebreak').length,
      errors: document.querySelectorAll('.region.error').length, drafts: document.querySelectorAll('.region.draft').length,
      stale: document.querySelectorAll('.region.stale').length,
    };
  }, path, xml);
  await page.waitForFunction('!window.mathmath.doc.computing', { timeout: 120000 });
  if (selfContained(ws, xml)) {
    const titles = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region.stale')].map((e) => e.title.slice(0, 44)));
    for (const t of titles) note(`stale: ${t.replace(/: .*/, '')}`);
  }
  const after = await page.evaluate(() => ({
    errors: document.querySelectorAll('.region.error').length, stale: document.querySelectorAll('.region.stale').length,
    breaks: Math.round(parseFloat(document.getElementById('sheet')!.style.getPropertyValue('--print-height')) / (window as any).mathmath.doc.ws.page.height),
  }));
  Object.assign(r, after);
  counts.sheets++;
  counts.regions += r.count;
  counts.off += r.off;
  counts.ms += r.ms;
  if (r.ms > counts.slowest) {
    counts.slowest = r.ms;
    counts.slowName = path;
  }
  if (Math.abs(r.width % ws.page.width) > 0.5) counts.wrongSize++;
  if (selfContained(ws, xml)) {
    counts.tierAErrors += r.errors;
    counts.tierADrafts += r.drafts;
    counts.tierAStale += r.stale;
    if (r.errors) samples.push(`${path}: ${r.errors} errors`);
  }
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages !== r.breaks) {
    counts.pdfWrong++;
    samples.push(`${path}: ${pages} pdf pages, ${r.breaks} on screen`);
  }
  if (wanted.some((w) => path.includes(w))) {
    const safe = path.replace(/\W+/g, '_');
    const shot = `${out}/${safe}.png`;
    const file = `${out}/${safe}.pdf`;
    writeFileSync(file, pdf);
    await page.evaluate(() => document.getElementById('desk')!.scrollTo(0, 0));
    const sheet = await page.$('#sheet');
    await sheet!.screenshot({ path: shot as `${string}.png` });
    await page.screenshot({ path: `${out}/${safe}_app.png` as `${string}.png` });
    toCompare.push({ name: safe, shot, pdf: file, width: ws.page.width, height: ws.page.height });
  }
  await page.close();
}
console.log(JSON.stringify(counts));
for (const [k, n] of [...problems].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String(n).padStart(4), k);
for (const s of samples.slice(0, 14)) console.log('  ', s);
writeFileSync(`${out}/compare.json`, JSON.stringify(toCompare));
void readFileSync;
await browser.close();
server.close();
