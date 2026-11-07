/**
 * Checks the help entries in one file without storing anything: each example calculates without an error,
 * and shows its answers to read over. Usage: npx tsx src/cli/help-check.ts src/help/functions/<file>.ts
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answersOf, readable } from '../help/compute.js';
import type { Entry } from '../help/types.js';

const mod = await import(pathToFileURL(resolve(process.argv[2]!)).href) as Record<string, Entry[]>;
let bad = 0;
for (const entries of Object.values(mod)) {
  for (const e of entries) {
    try {
      readable(e.example, e.name);
      const shown = e.results === 'files' || e.results === 'symbolic' ? e.example.map(() => '(not calculated here)') : answersOf(e.example, e.name);
      console.log(`${e.name}${e.results ? ` [${e.results}]` : ''}`);
      e.example.forEach((l, i) => console.log(`    ${l}${shown[i] ? `   →   ${shown[i]}` : ''}`));
    } catch (err) {
      bad++;
      console.log(`ERROR ${(err as Error).message}`);
    }
  }
}
console.log(bad ? `${bad} with errors` : 'all good');
