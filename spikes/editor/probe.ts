// Does a MathLive field really parse its input? Reads each form back, and its own error list.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
export async function open() {
  const root = process.cwd();
  const mime: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
  const server = createServer((req, res) => {
    const url = decodeURIComponent(req.url!.split('?')[0]!);
    if (url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><title>p</title><script type="module">
        import { MathfieldElement, convertLatexToMarkup } from '/nm/mathlive/mathlive.min.mjs';
        window.ml = { MathfieldElement, convertLatexToMarkup }; window.ready = true;
      </script><math-field id="f" style="display:block;font-size:20px"></math-field>`);
      return;
    }
    const path = url.startsWith('/nm/') ? join(root, 'node_modules', url.slice(4)) : '';
    if (!path || !existsSync(path) || !statSync(path).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--window-size=1200,900'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction('window.ready === true', { timeout: 20000 });
  return { browser, page, server };
}
if (process.argv[1]?.endsWith('probe.ts')) {
  const { browser, page, server } = await open();
  const r = await page.evaluate(() => {
    const f = document.getElementById('f') as any;
    const tests = ['\\frac12', 'x^2', '{a}^{b}', '\\mathrm{RotZ}\\left(x\\right)', '\\thisisnotacommand{x}', '\\frac{1}{', '\\left|\\begin{array}{l}a\\gets 0\\\\a\\end{array}\\right.', 'x_{\\text{sub}}', '0..5', '1.5\\times10^{-11}'];
    return { upgraded: !!customElements.get('math-field'), proto: f.constructor.name, rows: tests.map((t) => {
      f.setValue(t, { silenceNotifications: true });
      return { t, latex: f.getValue('latex'), expanded: f.getValue('latex-expanded'), unstyled: f.getValue('latex-unstyled'), errors: (f.errors ?? []).map((e: any) => e.code), json: JSON.stringify(f.getValue('math-json')).slice(0, 70) };
    }) };
  });
  console.log(r.upgraded, r.proto);
  for (const x of r.rows) console.log(JSON.stringify(x).slice(0, 300));
  await browser.close();
  server.close();
}
