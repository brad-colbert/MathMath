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

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { buildAll } from '../examples/index.js';
import { runWorksheet } from '../src/engine/evaluate.js';
import { readAny } from '../src/ui/files.js';

const built = buildAll();
const dir = new URL('../public/examples/', import.meta.url);

test('the example files are current: run npm run examples after changing one', () => {
  for (const b of built) expect(readFileSync(new URL(`${b.slug}.mathmath`, dir), 'utf8'), b.slug).toBe(b.text);
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as unknown;
  expect(index).toEqual(built.map(({ slug, title, summary }) => ({ slug, title, summary })));
});

test('every example has a distinct slug, a title and a summary', () => {
  expect(new Set(built.map((b) => b.slug)).size).toBe(built.length);
  for (const b of built) {
    expect(b.slug).toMatch(/^[a-z0-9-]+$/);
    expect(b.title.length).toBeGreaterThan(3);
    expect(b.summary).toMatch(/\.$/);
  }
});

test.each(built.map((b) => [b.slug, b] as const))('%s calculates with no errors but the ones it shows on purpose', (_, b) => {
  // As the app reads it, from the written file.
  const ws = readAny(`${b.slug}.mathmath`, b.text);
  const t = performance.now();
  const outs = runWorksheet(ws);
  const ms = performance.now() - t;
  const symbolic = outs.filter((o) => o.region.content.k === 'sym');
  if (!b.symbolic) expect(symbolic, 'symbolic regions, so mark it symbolic').toEqual([]);
  // Symbolic regions, and what uses their answers, need the algebra engine, and attached pictures the browser's
  // decoder: the e2e test opens those there. A picture counts only if it really is attached, so a missing one still fails here.
  const attached = Object.keys(ws.assets);
  const browserOnly = (o: (typeof outs)[number]): boolean =>
    o.region.content.k === 'sym' || (b.symbolic && o.error?.reason === 'needs symbolic evaluation') ||
    attached.some((name) => o.error?.reason.startsWith(`${name} isn't`) || (o.error?.kind === 'needs-file' && o.error.needs.includes(name)));
  const wrong = outs.filter((o) => !browserOnly(o) && Boolean(o.error) !== b.sheet.expectedErrors.has(o.region.id));
  expect(wrong.map((o) => [o.region.id, o.error?.reason ?? 'no error, but one was expected'])).toEqual([]);
  expect(outs.filter((o) => o.value || o.error).length).toBeGreaterThan(3);
  if (attached.length) expect(outs.filter((o) => !browserOnly(o) && o.value).length, 'regions checked here').toBeGreaterThan(0);
  // Opening one should feel instant.
  expect(ms).toBeLessThan(1500);
});
