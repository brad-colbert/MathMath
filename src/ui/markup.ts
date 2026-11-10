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
 * Math as HTML, through MathLive's convertLatexToMarkup, with two fixes to strings, made only as they're drawn:
 * what a region stores, and what its editor shows, stay as they are.
 *
 * - MathLive spaces a string character by character, so the space due after an operator, as in x := "a_b",
 *   lands before the string's first escaped character (\_, \{, \%, …) instead of after the operator: the string
 *   hugs the := and a gap opens inside it. Wrapped in braces, a string is one piece, spaced like any other operand.
 * - MathLive draws every " in text as a closing curly quote, so "abc" came out ”abc”. Mathcad's quotes are
 *   straight, and \char34{} draws one.
 */
import { convertLatexToMarkup } from 'mathlive';
import { escapeText } from '../latex/latex.js';

/** Each string, \text{"…"}, in braces, with its quotes straight. */
export const drawnStrings = (latex: string): string =>
  latex.replace(/\\text\{"(?:[^{}\\]|\\.)*"\}/g, (s) => `{${s.replace(/"/g, '\\char34{}')}}`);

export const mathMarkup = (latex: string): string => convertLatexToMarkup(drawnStrings(latex));

/**
 * MathLive writes a {, }, ~, ^ or \\ typed in a string as a command, \\textbraceright and the like, and a space typed
 * after it is lost: "{0} and" and "{0}and" both come out as \\textbraceright and. Its plain text keeps them apart, so
 * when a string holds such a command and a space, the string is rebuilt from the plain text: each ”…” there is a
 * string, in the same order as the \\text{''…''} in the LaTeX. If the two don't line up, the LaTeX stands.
 */
export function exactStrings(latex: string, plain: () => string): string {
  if (!/\\text(?:braceleft|braceright|asciitilde|asciicircum|backslash) /.test(latex)) return latex;
  const strings: [number, number][] = [];
  for (let at = latex.indexOf("\\text{''"); at >= 0; at = latex.indexOf("\\text{''", at + 1)) {
    let depth = 0;
    let end = -1;
    for (let k = at + 5; k < latex.length; k++) {
      const c = latex[k];
      if (c === '\\') k++;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        end = k;
        break;
      }
    }
    if (end < 0) return latex;
    strings.push([at, end + 1]);
  }
  const texts = [...plain().matchAll(/”([^”]*)”/g)].map((m) => m[1]!);
  if (texts.length !== strings.length) return latex;
  let out = latex;
  for (let s = strings.length - 1; s >= 0; s--) {
    const [a, b] = strings[s]!;
    out = `${out.slice(0, a)}\\text{''${escapeText(texts[s]!)}''}${out.slice(b)}`;
  }
  return out;
}
