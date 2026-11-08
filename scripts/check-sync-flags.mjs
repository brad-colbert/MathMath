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

// Fails if a generated folder inside a Dropbox checkout has lost its ignore flag. The flag lives on
// the folder, so deleting and recreating the folder clears it. Outside Dropbox this does nothing.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));

if (root.includes('/Dropbox/')) {
  const unflagged = ['node_modules', 'dist', 'public/giac/vendor'].filter((name) => {
    const path = join(root, name);
    if (!existsSync(path)) return false;
    try {
      const value = execFileSync('attr', ['-q', '-g', 'com.dropbox.ignored', path], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return value.toString().trim() !== '1';
    } catch {
      return true;
    }
  });

  if (unflagged.length > 0) {
    console.error(`Not ignored by Dropbox: ${unflagged.join(', ')}. Run scripts/setup.sh.`);
    process.exit(1);
  }
}
