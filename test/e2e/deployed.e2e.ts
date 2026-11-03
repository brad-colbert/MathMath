// Smoke test of a deployed copy, in a real browser: a numeric answer, symbolic answers from the algebra
// engine, a plot, saving, and no console errors or policy violations. Also checks the security policy
// arrives as a header on the page and on the calculation worker's script, which takes its policy from there.
//
// Usage: MATHMATH_URL=https://host:8888/ [MATHMATH_CA=ca.crt] npm run test:deployed
// MATHMATH_CA, a private CA's certificate, makes the test check the server's certificate against it.
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import puppeteer from 'puppeteer-core';
import { saveWorksheet, emptyWorksheet } from '../../src/format/native.js';
import { readRegion } from '../../src/latex/region.js';
import { autoAxis } from '../../src/model/ast.js';
import { readTex } from '../../src/latex/latex.js';

const base = process.env.MATHMATH_URL;
if (!base) {
  console.error('Set MATHMATH_URL to the deployed address, such as https://myserver:8888/');
  process.exit(2);
}
const ca = process.env.MATHMATH_CA ? readFileSync(process.env.MATHMATH_CA) : undefined;
const version = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: unknown = ''): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 300)}`}`);
}

/** GET over HTTPS, checking the certificate against MATHMATH_CA when given. */
function get(path: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, base), { ca, rejectUnauthorized: Boolean(ca) }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

// Headers, straight from the server.
const page0 = await get('/');
check(`the page answers${ca ? ', over a certificate the CA signed' : ''}`, page0.status === 200, page0.status);
const script = /\/assets\/index-[^"]+\.js/.exec(page0.body)?.[0];
const app = script ? await get(script) : null;
const workerName = app ? /compute\.worker-[\w-]+\.js/.exec(app.body)?.[0] : undefined;
const worker = workerName ? await get(`/assets/${workerName}`) : null;
const policy = (h?: Record<string, unknown>) => String(h?.['content-security-policy'] ?? '');
check('the security policy comes as a header with the page', policy(page0.headers).includes("'wasm-unsafe-eval'"), page0.headers);
check('and with the calculation worker\'s script', Boolean(worker) && policy(worker!.headers) === policy(page0.headers), workerName);

// A real calculation in a real browser.
const ws = emptyWorksheet();
let id = 1;
const math = (y: number, latex: string) => ws.regions.push({ id: String(id++), left: 54, top: y - 8, alignX: 54, alignY: y, disabled: false, content: readRegion(latex) });
math(60, 'x\\coloneq 3');
math(90, 'x+1=');
math(120, '\\left(y+1\\right)^2\\ \\mathbf{expand}\\to ');
math(150, '\\int_0^1t^2\\,\\mathrm{d}t\\to ');
math(180, 'k\\coloneq 0..10');
ws.regions.push({
  id: String(id++), left: 54, top: 210, alignX: 54, alignY: 210, disabled: false,
  content: { k: 'plot', x: readTex('k'), ys: [readTex('k^2')], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 216, height: 150 },
});

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true,
  // The certificate was checked above, when MATHMATH_CA was given. Headless Chromium keeps its own trust
  // store, which doesn't have a private CA, so the browser itself skips the check.
  args: ['--no-sandbox', '--ignore-certificate-errors'], acceptInsecureCerts: true,
});
try {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${String(e)}`));
  page.on('console', (m) => {
    // Headless Chromium sometimes resets its certificate checks at startup under --ignore-certificate-errors
    // and logs this once. It isn't the app's doing.
    if (m.type() === 'error' && !m.text().includes('ERR_CERT_VERIFIER_CHANGED')) problems.push(`console: ${m.text()}`);
  });
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`policy violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction('!!window.mathmath', { timeout: 20000 });
  const env = await page.evaluate(() => ({
    secure: window.isSecureContext,
    uuid: typeof crypto.randomUUID === 'function',
    version: document.querySelector('#toolbar .version')?.textContent ?? '',
  }));
  check('it runs in a secure context', env.secure && env.uuid, env);
  check(`it says it is version ${version}`, env.version === `MathMath ${version}`, env.version);

  await page.evaluate((t) => (window as unknown as { mathmath: { load(n: string, t: string): void } }).mathmath.load('smoke.mathmath', t), saveWorksheet(ws));
  await page.waitForFunction('!window.mathmath.doc.computing', { timeout: 120000 });
  const shown = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.region')].map((e) => (e.innerText ?? '').replace(/[\s​]/g, '')));
  const text = shown.join(' | ');
  check('a numeric answer', text.includes('x+1=4'), shown);
  check('symbolic answers from the algebra engine', /y2\+2[·⋅]?y\+1/.test(text) && /dt→(13|31)/.test(text), shown);
  const plot = await page.evaluate(() => document.querySelector('.region.plot path')?.getAttribute('d')?.match(/[ML]/g)?.length ?? 0);
  check('a plot draws its points', plot === 11, plot);
  check('no region is in error', (await page.evaluate(() => document.querySelectorAll('.region.error, .region.stale').length)) === 0);
  const saved = await page.evaluate(() => (window as unknown as { mathmath: { save(): string } }).mathmath.save());
  check('the sheet saves', saved.includes('"format": "mathmath"') || saved.includes('"format":"mathmath"'), saved.slice(0, 80));
  check('no console errors or policy violations', problems.length === 0, problems);
} finally {
  await browser.close();
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
