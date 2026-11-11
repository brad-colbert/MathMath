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
 * The help panel's content: an entry for everything a user can type by name, and pages on topics.
 *
 * Text is plain, with three marks: `code` for something to type, [[name]] for a link to another entry or
 * topic, and **bold**. Examples are lines of math in the LaTeX the editor writes, one region each, top to
 * bottom; they're checked by test/help.test.ts, and their answers are stored in results.ts.
 */

/** The groups the home page lists entries under, in order. */
export const GROUPS = [
  'Arithmetic and functions', 'Complex numbers', 'Special functions', 'Vectors and matrices', 'Linear algebra', 'Statistics',
  'Probability distributions', 'Random numbers', 'Interpolation and fitting', 'Strings', 'Solving', 'Finance', 'Differential equations',
  'Plots and coordinates', 'Fourier transforms', 'Signal processing', 'Filters and systems', 'Images', 'Files',
  'Electrical engineering', 'Circuits', 'RF and microwave', 'Symbolic keywords',
] as const;
export type Group = (typeof GROUPS)[number];

export interface Entry {
  /** The name as typed. */
  name: string;
  /** Other spellings that do the same, as FFT beside fft. */
  also?: string[];
  group: Group;
  /** How it's called, as `lineInput(ZL, Z0, θ)`. Optional arguments go in brackets: `zToGamma(Z, [Z0])`. */
  usage: string;
  /** One sentence: what it gives. */
  summary: string;
  /** More, a paragraph each. */
  details?: string[];
  /** How it treats units, when that matters. */
  units?: string;
  /** What's refused, and why. */
  errors?: string[];
  /** Lines of math, each a region. A line ending in = shows its answer. */
  example: string[];
  /** Whether Mathcad has it too, so a worksheet using it can go to and from Mathcad. */
  mathcad: boolean;
  /**
   * How the example's answers are shown: stored by the generator (the default); `varies` for random numbers,
   * shown without answers; `files` for functions that read or write files, shown without answers;
   * `symbolic` for keywords, whose answer is the hand-written `answer`.
   */
  results?: 'varies' | 'files' | 'symbolic';
  /** For `symbolic`: the answer, in LaTeX, for the example's last line. */
  answer?: string;
}

/** A block of a topic page. */
export type Block =
  | { p: string }
  /** A heading within the page. */
  | { h: string }
  /** An example, as an entry's: lines of math with an Insert button. `id` keys its stored answers. */
  | { id: string; example: string[] }
  /** Keys and what they do. */
  | { keys: [string, string][] };

export interface Topic {
  id: string;
  title: string;
  /** One sentence for the home page. */
  summary: string;
  body: Block[];
}
