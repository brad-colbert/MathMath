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
