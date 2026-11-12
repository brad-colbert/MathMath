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

/** Reads math as the algebra engine prints it, into the worksheet tree. */
import { type Expr, realFrom } from '../model/ast.js';

/**
 * A decimal as Mathcad 14 lays out a float answer (probed 2026-11-11): its significant digits without trailing zeros,
 * written out in full between 10⁻⁶ and 10⁶, both excluded, and with an exponent outside, as 8.3333e-7 and 1.0e7; a
 * whole number keeps ".0", as 2.0. Giac writes them as 0.83333333333333333333e-1 or 2.0000000000000000000.
 */
export function mathcadDecimal(text: string): string {
  const m = /^(-?)(\d*)\.?(\d*)(?:[eE]([+-]?\d+))?$/.exec(text.trim());
  if (!m) return text;
  const [, sign, whole = '', frac = '', exp = '0'] = m;
  const all = whole + frac;
  const lead = /^0*/.exec(all)![0].length;
  const digits = all.slice(lead).replace(/0+$/, '');
  if (!digits) return '0.0';
  // The power of ten of the first significant digit.
  const e = Number(exp) + whole.length - lead - 1;
  const inFull = (e > -6 || (e === -6 && digits !== '1')) && e < 6;
  if (!inFull) return `${sign}${digits[0]}.${digits.slice(1) || '0'}e${e}`;
  if (e < 0) return `${sign}0.${'0'.repeat(-e - 1)}${digits}`;
  const intPart = digits.slice(0, e + 1).padEnd(e + 1, '0');
  return `${sign}${intPart}.${digits.slice(e + 1) || '0'}`;
}

/** A decimal rounded to n significant digits, half up, in Giac's form: 0.66666666666666666666667e6 to 20 is 0.66666666666666666666667 → 0.66666666666666666667e6. */
export function roundDecimal(text: string, n: number): string {
  const m = /^(-?)(\d*)\.?(\d*)(?:[eE]([+-]?\d+))?$/.exec(text.trim());
  if (!m) return text;
  const [, sign, whole = '', frac = '', exp = '0'] = m;
  const all = whole + frac;
  const lead = /^0*/.exec(all)![0].length;
  let digits = all.slice(lead);
  if (digits.length <= n) return text;
  let e = Number(exp) + whole.length - lead;
  const up = digits.charCodeAt(n) >= 53; // '5'
  const kept = digits.slice(0, n).split('').map(Number);
  if (up) {
    let k = n - 1;
    while (k >= 0 && kept[k] === 9) kept[k--] = 0;
    if (k >= 0) kept[k]!++;
    else {
      kept.unshift(1);
      kept.pop();
      e++;
    }
  }
  digits = kept.join('');
  return `${sign}0.${digits}e${e}`;
}

/** A decimal from Giac, kept as Mathcad lays it out where that isn't how the number would print anyway. */
function decimal(text: string): Extract<Expr, { k: 'real' }> {
  const shown = mathcadDecimal(text);
  const v = Number(text);
  return shown === String(v) ? { k: 'real', v } : { k: 'real', v, digits: shown };
}

type Tok = { t: 'num' | 'id' | 'op'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|!=|==|[-+*/^()[\],=<>!]))/y;
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(at))) break;
      throw new Error(`can't read "${src.slice(at, at + 24)}"`);
    }
    at = re.lastIndex;
    if (m[1]) out.push({ t: 'num', v: m[1] });
    else if (m[2]) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3]! });
  }
  return out;
}

const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });

function toMatrix(items: Expr[]): Expr {
  const rows = items.filter((i): i is Extract<Expr, { k: 'matrix' }> => i.k === 'matrix');
  if (rows.length === items.length && rows.length > 0) {
    const cols = rows[0]!.rows;
    const cells: Expr[] = [];
    for (let j = 0; j < cols; j++) for (const r of rows) cells.push(r.items[j]!);
    return { k: 'matrix', rows: rows.length, cols, items: cells };
  }
  return { k: 'matrix', rows: items.length, cols: 1, items };
}

export function parse(src: string): Expr {
  const toks = lex(src);
  let p = 0;
  const isOp = (v: string): boolean => toks[p]?.t === 'op' && toks[p]!.v === v;
  const eat = (v: string): void => {
    if (!isOp(v)) throw new Error(`expected ${v} at ${toks[p]?.v ?? 'the end'}`);
    p++;
  };
  const list = (close: string): Expr[] => {
    const items: Expr[] = [];
    if (isOp(close)) {
      p++;
      return items;
    }
    for (;;) {
      items.push(relation());
      if (!isOp(',')) break;
      p++;
    }
    eat(close);
    return items;
  };
  function atom(): Expr {
    const t = toks[p];
    if (!t) throw new Error('unexpected end');
    p++;
    if (t.t === 'num') return /[.eE]/.test(t.v) ? decimal(t.v) : realFrom(t.v);
    if (t.t === 'id') {
      if (isOp('(')) {
        p++;
        return { k: 'call', fn: { k: 'id', name: t.v }, args: list(')') };
      }
      if (isOp('[') && (t.v === 'list' || t.v === 'poly1' || t.v === 'set')) {
        p++;
        return toMatrix(list(']'));
      }
      return { k: 'id', name: t.v };
    }
    if (t.v === '(') {
      const e = relation();
      eat(')');
      return e;
    }
    if (t.v === '[') return toMatrix(list(']'));
    throw new Error(`unexpected ${t.v}`);
  }
  function power(): Expr {
    let base = atom();
    while (isOp('!')) {
      p++;
      base = op('factorial', base);
    }
    if (isOp('^')) {
      p++;
      return op('pow', base, unary());
    }
    return base;
  }
  function unary(): Expr {
    if (isOp('-')) {
      p++;
      return op('neg', unary());
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  }
  function term(): Expr {
    let a = unary();
    while (isOp('*') || isOp('/')) {
      const o = toks[p]!.v === '*' ? 'mult' : 'div';
      p++;
      a = op(o, a, unary());
    }
    return a;
  }
  function sum(): Expr {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const o = toks[p]!.v === '+' ? 'plus' : 'minus';
      p++;
      a = op(o, a, term());
    }
    return a;
  }
  function relation(): Expr {
    const a = sum();
    if (isOp('=') || isOp('==')) {
      p++;
      return op('equal', a, sum());
    }
    return a;
  }
  const e = relation();
  if (p !== toks.length) throw new Error(`trailing ${toks[p]?.v}`);
  return e;
}
