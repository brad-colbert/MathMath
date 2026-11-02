// Runs every case on each engine in a worker in headless Chromium, as the app would. Results go to
// the folder in argv[2], outside this repository.
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CASES } from './cases.js';
import { ceCommand, giacCommand, sympyCommand } from './engines.js';

const out = process.argv[2]!;
const vendor = process.argv[3]!;
const root = process.cwd();
const mime: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json', '.zip': 'application/zip' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url!.split('?')[0]!);
  const path = url === '/' ? null
    : url.startsWith('/nm/') ? join(root, 'node_modules', url.slice(4))
      : url.startsWith('/vendor/') ? join(vendor, url.slice(8))
        : url.startsWith('/w/') ? join(root, 'spikes/algebra', url.slice(3)) : null;
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>spike</title>');
    return;
  }
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
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
await page.goto(`http://127.0.0.1:${port}/`);

const engines = [
  { name: 'giac', url: '/w/worker-giac.js', type: 'classic', command: giacCommand },
  { name: 'sympy', url: '/w/worker-pyodide.mjs', type: 'module', command: sympyCommand },
  { name: 'compute-engine', url: '/w/worker-ce.mjs', type: 'module', command: ceCommand },
];

const results: Record<string, unknown> = {};
for (const engine of engines) {
  const cmds = CASES.map((c) => ({ id: c.id, cmd: engine.command(c) }));
  const run = await page.evaluate(async ({ url, type, cmds }) => {
    const start = (): Promise<{ w: Worker; ms: number }> => new Promise((resolve, reject) => {
      const t = performance.now();
      const w = new Worker(url, { type: type as WorkerType });
      w.onerror = (e) => reject(new Error(e.message || 'worker error'));
      w.onmessage = (m) => {
        if (m.data.ready) resolve({ w, ms: performance.now() - t });
        if (m.data.failed) reject(new Error(m.data.failed));
      };
    });
    const first = await start();
    let w = first.w;
    const output: Record<string, { out: string; ms: number }> = {};
    for (const c of cmds) {
      const r = await new Promise<{ out: string; ms: number } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 20000);
        w.onmessage = (m) => {
          clearTimeout(timer);
          resolve(m.data);
        };
        w.postMessage(c);
      });
      if (r) output[c.id] = { out: r.out, ms: r.ms };
      else {
        output[c.id] = { out: 'TIMEOUT', ms: 20000 };
        w.terminate();
        w = (await start()).w;
      }
    }
    return { startupMs: first.ms, output };
  }, { url: engine.url, type: engine.type, cmds });
  const total = Object.values(run.output).reduce((s, r) => s + r.ms, 0);
  writeFileSync(out, JSON.stringify({ ...results, [engine.name]: run }, null, 1));
  console.log(`${engine.name.padEnd(15)} cold start ${(run.startupMs / 1000).toFixed(2)} s, cases ${(total / 1000).toFixed(2)} s`);
  results[engine.name] = run;
}
writeFileSync(out, JSON.stringify(results, null, 1));
await browser.close();
server.close();
