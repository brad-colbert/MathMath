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

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/** Source files, tracked or new: everything with a comment syntax, which carries the notice. */
const SOURCE = /\.(ts|mts|mjs|js|css|html|sh|py|yml|template)$|(^|\/)Dockerfile$/;
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter((f) => SOURCE.test(f));

test('every source file carries the AGPL notice, copyright Pelican Labs, LLC', () => {
  expect(files.length).toBeGreaterThan(100);
  const missing = files.filter((f) => {
    const head = readFileSync(f, 'utf8').slice(0, 1500);
    return !head.includes('Copyright (C) 2026 Pelican Labs, LLC') || !head.includes('GNU Affero') || !head.includes('SPDX-License-Identifier: AGPL-3.0-or-later');
  });
  expect(missing).toEqual([]);
});
