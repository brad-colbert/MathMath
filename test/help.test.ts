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

import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { SOLVE_FORMS } from '../src/engine/evaluate.js';
import { allAnswers, readable } from '../src/help/compute.js';
import { BY_NAME, ENTRIES, GROUPS, RESULTS, TOPICS, TOPIC_BY_ID } from '../src/help/index.js';
import { KEYWORDS } from '../src/symbolic/keywords.js';

/** Everything a user can type by name and call: built-in functions, solve forms and keywords. */
const TYPED = new Set([...makeBuiltins(0).keys(), ...SOLVE_FORMS, ...KEYWORDS.map(([k]) => k)]);

/** Every piece of text in an entry or topic, for checking its links and marks. */
function texts(): [string, string][] {
  const out: [string, string][] = [];
  for (const e of ENTRIES) for (const t of [e.summary, e.usage, e.units ?? '', ...(e.details ?? []), ...(e.errors ?? [])]) out.push([e.name, t]);
  for (const t of TOPICS) for (const b of t.body) if ('p' in b) out.push([`topic ${t.id}`, b.p]);
  return out;
}

describe('help', () => {
  test('every example calculates without an error, and its stored answers are current (npm run help:results)', () => {
    expect(RESULTS).toEqual(allAnswers());
  });
  test('every example line can be read, including those not calculated here', () => {
    for (const e of ENTRIES) readable(e.example, e.name);
  });
  test('everything that can be typed has an entry', () => {
    const missing = [...TYPED].filter((n) => !BY_NAME.has(n)).sort();
    expect(missing).toEqual([]);
  });
  test('every entry is for something that can be typed', () => {
    const stale = [...BY_NAME.keys()].filter((n) => !TYPED.has(n)).sort();
    expect(stale).toEqual([]);
  });
  test('no name has two entries', () => {
    const seen = new Map<string, number>();
    for (const e of ENTRIES) for (const n of [e.name, ...(e.also ?? [])]) seen.set(n, (seen.get(n) ?? 0) + 1);
    expect([...seen].filter(([, k]) => k > 1)).toEqual([]);
  });
  test('prose is plain text, with no LaTeX in it', () => {
    expect(texts().filter(([, t]) => /\\[a-zA-Z]|_\{|\^\{/.test(t))).toEqual([]);
  });
  test('every link goes somewhere', () => {
    const broken: string[] = [];
    for (const [where, t] of texts()) {
      for (const m of t.matchAll(/\[\[([^\]]+)\]\]/g)) if (!BY_NAME.has(m[1]!) && !TOPIC_BY_ID.has(m[1]!)) broken.push(`${where}: ${m[1]}`);
    }
    expect(broken).toEqual([]);
  });
  test('every entry has a group, a usage that names it, an example and a summary ending in a full stop', () => {
    const bad = ENTRIES.filter((e) => !GROUPS.includes(e.group) || !e.usage.includes(e.name) || e.example.length === 0 || !/[.)]$/.test(e.summary));
    expect(bad.map((e) => e.name)).toEqual([]);
  });
  test('symbolic examples carry their answer; others have none', () => {
    expect(ENTRIES.filter((e) => (e.results === 'symbolic') !== (e.answer !== undefined)).map((e) => e.name)).toEqual([]);
  });
});
