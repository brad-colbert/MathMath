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

/** Everything the help panel shows: entries by name, topics, and the examples' stored answers. */
import { CIRCUITS, ELECTRICAL, RF } from './functions/electrical.js';
import { CORE } from './functions/core.js';
import { DISTRIBUTIONS } from './functions/distributions.js';
import { FILES } from './functions/files.js';
import { IMAGES } from './functions/images.js';
import { MATRICES } from './functions/matrices.js';
import { SIGNAL } from './functions/signal.js';
import { SOLVING } from './functions/solving.js';
import { SYMBOLIC } from './functions/symbolic.js';
import { RESULTS } from './results.js';
import { TOPICS } from './topics.js';
import { type Entry, GROUPS, type Topic } from './types.js';

export { GROUPS, RESULTS, TOPICS };
export type { Entry, Topic };

export const ENTRIES: Entry[] = [...CORE, ...DISTRIBUTIONS, ...MATRICES, ...SOLVING, ...SIGNAL, ...IMAGES, ...FILES, ...ELECTRICAL, ...CIRCUITS, ...RF, ...SYMBOLIC];

/** Entries by every name they go by. */
export const BY_NAME = new Map<string, Entry>();
for (const e of ENTRIES) for (const n of [e.name, ...(e.also ?? [])]) BY_NAME.set(n, e);

export const TOPIC_BY_ID = new Map<string, Topic>(TOPICS.map((t) => [t.id, t]));
