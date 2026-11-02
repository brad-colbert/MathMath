// Fetches Giac, the algebra engine, and checks it's the build this project was tested with. It's
// 19 MB and GPL-licensed, so it's downloaded rather than kept in the repository.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://www-fourier.univ-grenoble-alpes.fr/~parisse/giacjs/giacwasm.js';
const SHA256 = 'a39869bb02000d0baaf8a24907a57552ab4b63f1944b53c222db8fba2840cb7c';

const folder = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'giac', 'vendor');
const file = join(folder, 'giacwasm.js');
const hash = (data) => createHash('sha256').update(data).digest('hex');

if (existsSync(file) && hash(readFileSync(file)) === SHA256) process.exit(0);
mkdirSync(folder, { recursive: true });
console.log(`Fetching Giac from ${SOURCE}`);
const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
if (hash(data) !== SHA256) {
  console.error('Giac has changed upstream, so it needs testing before use. Update SHA256 in this script afterwards.');
  process.exit(1);
}
writeFileSync(file, data);
