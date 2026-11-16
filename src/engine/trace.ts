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
 * Mathcad's trace and pause: the text they print, as Mathcad 14's Help describes it. Each {n} in S is the nth
 * value after S, counted from 0; a vector prints as vector{n} [v0, v1, …] and an m × n matrix as
 * matrix{m, n} [[M00, M01, …], …]; a value with units prints in base SI units, without them. With one value and
 * no text, the value alone prints. Both give 0 to the sheet. A browser can't stop a calculation to wait, so pause
 * prints as trace does and carries on.
 */
import { EvalError, type Value, getEl } from './values.js';

const number = (re: number, im: number): string => {
  if (im === 0) return String(re);
  const imag = `${Math.abs(im) === 1 ? '' : String(Math.abs(im))}i`;
  return re === 0 ? `${im < 0 ? '-' : ''}${imag}` : `${re}${im < 0 ? '-' : '+'}${imag}`;
};

/** One value as trace prints it. */
export function traceValue(v: Value): string {
  switch (v.t) {
    case 'num': return number(v.re, v.im);
    case 'str': return v.v;
    case 'mat': {
      const row = (i: number): string[] => Array.from({ length: v.cols }, (_, j) => traceValue(getEl(v, i, j)));
      if (v.cols === 1) return `vector{${v.rows}} [${Array.from({ length: v.rows }, (_, i) => traceValue(getEl(v, i, 0))).join(', ')}]`;
      return `matrix{${v.rows}, ${v.cols}} [${Array.from({ length: v.rows }, (_, i) => `[${row(i).join(', ')}]`).join(', ')}]`;
    }
    case 'range': return `range ${v.first}..${v.last}`;
    case 'fn': return `function ${v.name}`;
    case 'failed': throw v.error;
  }
}

/** The line trace(S, x, y, …) or pause(S, x, y, …) prints. */
export function traceText(fn: string, args: Value[]): string {
  if (args.length === 0) throw new EvalError('runtime', `${fn} takes a value to print, or a text such as "x = {0}" and the values for it`);
  const [first, ...rest] = args;
  if (rest.length === 0) return traceValue(first!);
  if (first!.t !== 'str') throw new EvalError('runtime', `${fn}'s first argument is the text, with {0}, {1} … where the values go, as ${fn}("x = {0}", x)`);
  return first!.v.replace(/\{(\d+)\}/g, (all, k: string) => {
    const v = rest[Number(k)];
    return v === undefined ? all : traceValue(v);
  });
}
