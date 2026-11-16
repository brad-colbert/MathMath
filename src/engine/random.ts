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
 * Random numbers for rnd, runif and rnorm. Each region draws from its own stream, seeded from the region,
 * so a sheet's "random" data is the same every time it calculates. That keeps recalculating only what
 * changed in step with a full run, and keeps a sheet's numbers steady between sessions. Mathcad draws new
 * numbers on each recalculation, and its generator isn't public, so the values differ from Mathcad's.
 */

/** A 32-bit FNV-1a hash of a string, for seeding. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Mulberry32's step: its state advances by this each draw. */
const STEP = 0x6d2b79f5;

/** Mulberry32's output for a state: small, fast and well mixed, plenty for test data. In [0, 1). */
function mix(a: number): number {
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A region's own stream: Mulberry32 seeded from the region and the sheet's seed. Returns numbers in [0, 1). */
export function stream(key: string, seed = 1): () => number {
  let a = (hash(key) ^ Math.imul(seed, 0x9e3779b9)) >>> 0;
  return () => {
    a = (a + STEP) >>> 0;
    return mix(a);
  };
}

/**
 * After Seed(x): one stream for the rest of the sheet, as Mathcad's generator is, so seeding again with the same
 * x draws the same numbers again. `a` is the generator's state, which each draw moves on.
 */
export interface Seeded {
  seed: number;
  a: number;
}

export function seeded(seed: number): Seeded {
  return { seed, a: (hash('Seed') ^ Math.imul(seed, 0x9e3779b9)) >>> 0 };
}

/** The next number from a seeded stream, moving it on. */
export function drawFrom(s: Seeded): number {
  s.a = (s.a + STEP) >>> 0;
  return mix(s.a);
}

/** A standard normal number, by the Box–Muller transform. */
export function normal(next: () => number): number {
  let u = 0;
  while (u === 0) u = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}
