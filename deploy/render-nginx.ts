// Writes the nginx configuration for the deployed app: the server blocks, and the headers every response
// carries, with the content security policy taken from vite.config.ts.
// Usage: npx tsx deploy/render-nginx.ts <output folder>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSP } from '../vite.config.js';

const out = process.argv[2];
if (!out) throw new Error('Usage: render-nginx.ts <output folder>');
if (CSP.includes('"')) throw new Error('The policy contains a double quote, which would break the nginx header line');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'default.conf'), readFileSync(new URL('./nginx.conf.template', import.meta.url), 'utf8'));
writeFileSync(join(out, 'mathmath-headers.conf'), [
  `add_header Content-Security-Policy "${CSP}" always;`,
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header Referrer-Policy "no-referrer" always;',
  '',
].join('\n'));
console.log(`wrote ${out}/default.conf and ${out}/mathmath-headers.conf`);
