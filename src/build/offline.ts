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


import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** A file of the build, by the address it's served at, and its content's hash. */
export interface OfflineFile { url: string; hash: string }

/** Files the service worker fetches once the app is running, not while installing: the algebra engine. */
const LATER = /^giac\/vendor\//;

const hashOf = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex').slice(0, 16);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/**
 * The build's files for the service worker, in a stable order: the page as `base` itself, as a navigation asks for
 * it, everything else at its own address. The worker's own file isn't one.
 */
export function offlineFiles(outDir: string, base: string): { files: OfflineFile[]; later: OfflineFile[] } {
  const files: OfflineFile[] = [];
  const later: OfflineFile[] = [];
  for (const path of walk(outDir).sort()) {
    const rel = relative(outDir, path).split(sep).join('/');
    if (rel === 'sw.js') continue;
    const file = { url: rel === 'index.html' ? base : `${base}${rel}`, hash: hashOf(readFileSync(path)) };
    (LATER.test(rel) ? later : files).push(file);
  }
  return { files, later };
}

/** Writes sw.js into the build from its template, with the build's files and a version that changes with any of them. */
export function writeServiceWorker(template: string, outDir: string, base: string): { files: OfflineFile[]; later: OfflineFile[]; version: string } {
  const { files, later } = offlineFiles(outDir, base);
  const version = hashOf(JSON.stringify([files, later]));
  const fill = (marker: string, value: unknown): string => {
    const at = `/* ${marker} */ `;
    if (!source.includes(at)) throw new Error(`sw template: no ${marker}`);
    return `${at}${JSON.stringify(value)}`;
  };
  let source = readFileSync(template, 'utf8');
  source = source
    .replace('/* FILES */ []', fill('FILES', files))
    .replace('/* LATER */ []', fill('LATER', later))
    .replace("/* VERSION */ ''", fill('VERSION', version))
    .replace("/* BASE */ '/'", fill('BASE', base));
  writeFileSync(join(outDir, 'sw.js'), source);
  return { files, later, version };
}
