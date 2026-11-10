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
 * Mathcad's string functions, the type tests and SIUnitsOf, as probed in Mathcad 14 (strings are indexed from 0,
 * whatever ORIGIN is):
 *
 * - substr(S, m, n): m from 0 to the length (the length itself gives ""), n from 0; past the end it stops there.
 * - search(S, SubS, m): from position m, 0 to the length; −1 when not found; case matters.
 * - str2num reads Mathcad's own number syntax, trimmed of spaces at the ends: decimals with an exponent, complex
 *   numbers with i or j, and hexadecimal, octal and binary as 0FFh, 17o and 101b. Anything else is an error.
 * - num2str and format write numbers as C's %.15g does: 1/3 is 0.333333333333333, 1e−5 is 1e-05.
 * - format(Sf, x, …) puts its arguments at {0}, {1}…; {{ and }} are braces. A string comes out in quotes, a vector as
 *   vector{2} [1, 2] and a matrix as matrix{2,2} [[1, 2], [3, 4]]; units are dropped, leaving the SI value.
 * - str2vec("") is 0. vec2str takes a column of codes, truncating fractions, and refuses those below 32 except
 *   tab (9), newline (10) and carriage return (13).
 */
import { type Dim, EvalError, type Mat, NODIM, type Num, type Value, getEl, isNoDim, newMat, num, requireMat, str } from './values.js';

type Impl = (...args: Value[]) => Value;

export const STRING_ARITY: Record<string, [number, number]> = {
  substr: [3, 3], search: [3, 3], str2num: [1, 1], num2str: [1, 1], str2vec: [1, 1], vec2str: [1, 1], error: [1, 1],
  format: [1, Infinity], IsString: [1, 1], IsArray: [1, 1], IsScalar: [1, 1], IsNaN: [1, 1], SIUnitsOf: [1, 1], UnitsOf: [1, 1],
};

function text(v: Value | undefined, fn: string, what = 'string'): string {
  if (v?.t !== 'str') throw new EvalError('runtime', `${fn}'s ${what} must be a string, in quotes`);
  return v.v;
}

/** A whole number, as a position or count. */
function whole(v: Value | undefined, fn: string, what: string): number {
  if (v?.t !== 'num' || v.im !== 0 || !isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must be a plain number`);
  if (!Number.isInteger(v.re)) throw new EvalError('runtime', `${fn}'s ${what} must be a whole number`);
  return v.re;
}

/** A number as C's %.15g writes it. */
export function g15(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const [mant, ex] = x.toExponential(14).split('e') as [string, string];
  const exp = Number(ex);
  const trim = (s: string): string => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  if (exp < -4 || exp >= 15) return `${trim(mant)}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  return trim(x.toFixed(14 - exp));
}

/** A complex number as Mathcad's num2str writes it: 2 + 3i, -2 - 3i, 0.5i. */
function numText(re: number, im: number): string {
  if (im === 0) return g15(re);
  if (re === 0) return `${g15(im)}i`;
  return `${g15(re)} ${im < 0 ? '-' : '+'} ${g15(Math.abs(im))}i`;
}

/** Mathcad's number syntax, as str2num reads it; undefined when it isn't a number. */
export function readNumber(s: string): { re: number; im: number } | undefined {
  const t = s.replace(/^[ \t]+|[ \t]+$/g, '');
  const finite = (x: number): number | undefined => (Number.isFinite(x) ? x : undefined);
  let m = /^([+-]?)([0-9][0-9A-Fa-f]*)[hH]$/.exec(t);
  if (m) return { re: (m[1] === '-' ? -1 : 1) * parseInt(m[2]!, 16), im: 0 };
  m = /^([+-]?)([0-7]+)[oO]$/.exec(t);
  if (m) return { re: (m[1] === '-' ? -1 : 1) * parseInt(m[2]!, 8), im: 0 };
  m = /^([+-]?)([01]+)[bB]$/.exec(t);
  if (m) return { re: (m[1] === '-' ? -1 : 1) * parseInt(m[2]!, 2), im: 0 };
  const NUM = '(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
  m = new RegExp(`^([+-]?${NUM})$`).exec(t);
  if (m) {
    const re = finite(Number(m[1]));
    return re === undefined ? undefined : { re, im: 0 };
  }
  m = new RegExp(`^(?:([+-]?${NUM})(?=[+-]))?([+-]?${NUM})[ij]$`).exec(t);
  if (m) {
    const re = finite(m[1] ? Number(m[1]) : 0);
    const im = finite(Number(m[2]));
    return re === undefined || im === undefined ? undefined : { re, im };
  }
  return undefined;
}

/** A value as format writes it. */
function formatted(v: Value): string {
  if (v.t === 'str') return `"${v.v}"`;
  if (v.t === 'num') return numText(v.re, v.im);
  if (v.t === 'mat') {
    const el = (i: number, j: number): string => formatted(getEl(v, i, j));
    if (v.cols === 1) return `vector{${v.rows}} [${Array.from({ length: v.rows }, (_, i) => el(i, 0)).join(', ')}]`;
    const rows = Array.from({ length: v.rows }, (_, i) => `[${Array.from({ length: v.cols }, (_, j) => el(i, j)).join(', ')}]`);
    return `matrix{${v.rows},${v.cols}} [${rows.join(', ')}]`;
  }
  if (v.t === 'range') return `${g15(v.first)}..${g15(v.last)}`;
  if (v.t === 'fn') return v.name;
  throw new EvalError('runtime', "format can't write this value");
}

function format(args: Value[]): string {
  // With one argument that isn't a string, format writes it alone.
  if (args.length === 1 && args[0]!.t !== 'str') return formatted(args[0]!);
  const f = text(args[0], 'format', 'first argument');
  const values = args.slice(1);
  return f.replace(/\{\{|\}\}|\{(\d+)\}|[{}]/g, (code, n?: string) => {
    if (code === '{{') return '{';
    if (code === '}}') return '}';
    if (n === undefined) throw new EvalError('runtime', 'format: a brace on its own must be doubled, {{ or }}; arguments go in as {0}, {1}…');
    const k = Number(n);
    if (k >= values.length) throw new EvalError('runtime', `format: {${k}} needs ${k + 1} values after the format string, and there ${values.length === 1 ? 'is' : 'are'} ${values.length}`);
    return formatted(values[k]!);
  });
}

const column = (values: number[], dim: Dim = NODIM): Mat => {
  const m = newMat(values.length, 1, dim);
  m.re.set(values);
  return m;
};

export const stringFns: Record<string, Impl> = {
  substr: (s, m, n) => {
    const S = text(s, 'substr');
    const [start, count] = [whole(m, 'substr', 'start'), whole(n, 'substr', 'length')];
    if (count < 0) throw new EvalError('runtime', "substr's length must be 0 or more");
    if (start < 0 || start > S.length) throw new EvalError('runtime', `substr's start must be from 0 to the string's length, ${S.length}`);
    return str(S.slice(start, start + count));
  },
  search: (s, sub, m) => {
    const S = text(s, 'search');
    const start = whole(m, 'search', 'start');
    if (start < 0 || start > S.length) throw new EvalError('runtime', `search's start must be from 0 to the string's length, ${S.length}`);
    return num(S.indexOf(text(sub, 'search', 'substring'), start));
  },
  str2num: (s) => {
    const S = text(s, 'str2num');
    const n = readNumber(S);
    if (!n) throw new EvalError('runtime', `str2num can't read "${S}" as a number`);
    return num(n.re, NODIM, n.im);
  },
  num2str: (z) => {
    if (z?.t !== 'num') throw new EvalError('runtime', 'num2str takes a single number');
    if (!isNoDim(z.dim)) throw new EvalError('runtime', 'num2str takes a number without units: divide by the unit first');
    return str(numText(z.re, z.im));
  },
  str2vec: (s) => {
    const S = text(s, 'str2vec');
    return S.length === 0 ? num(0) : column(Array.from(S, (c) => c.codePointAt(0)!));
  },
  vec2str: (v) => {
    const m = requireMat(v!, "vec2str's argument");
    if (m.cells || m.im || m.cols !== 1 || !isNoDim(m.dim)) throw new EvalError('runtime', 'vec2str takes a column vector of character codes');
    return str(Array.from(m.re, (x) => {
      const c = Math.trunc(x);
      if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c > 0x10ffff) throw new EvalError('runtime', `vec2str: ${c} isn't the code of a character it can put in a string`);
      return String.fromCodePoint(c);
    }).join(''));
  },
  error: (s) => {
    throw new EvalError('runtime', text(s, 'error', 'message'));
  },
  format: (...args) => str(format(args)),
  IsString: (x) => num(x?.t === 'str' ? 1 : 0),
  IsArray: (x) => num(x?.t === 'mat' ? 1 : 0),
  IsScalar: (x) => num(x?.t === 'num' ? 1 : 0),
  IsNaN: (x) => num(x?.t === 'num' && (Number.isNaN(x.re) || Number.isNaN(x.im)) ? 1 : 0),
  SIUnitsOf: (x) => num(1, unitsOf(x!)),
  // Mathcad 14 keeps the older name too, for SI worksheets.
  UnitsOf: (x) => num(1, unitsOf(x!)),
};

function unitsOf(x: Value): Dim {
  if (x.t === 'num') return x.dim;
  if (x.t === 'mat') return x.cells ? ((x.cells.find((c) => c.t === 'num') as Num | undefined)?.dim ?? NODIM) : x.dim;
  return NODIM;
}
