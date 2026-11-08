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

// Parses infix math, as written in the cases and as printed by algebra engines, into the worksheet
// tree. The per-engine printers below are the outbound half of the bridge this spike is sizing.
import type { Expr } from '../../src/model/ast.js';

type Tok = { t: 'num' | 'id' | 'op'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-zα-ωπ∞_][A-Za-z0-9α-ωπ∞_]*)|(\*\*|<=|>=|!=|==|[-+*/^()[\],=<>;!]))/y;
  let m: RegExpExecArray | null;
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(at))) break;
      throw new Error(`cannot read "${src.slice(at, at + 20)}"`);
    }
    at = re.lastIndex;
    if (m[1]) out.push({ t: 'num', v: m[1] });
    else if (m[2]) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3]! });
  }
  return out;
}

const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });

export function parse(src: string): Expr {
  const toks = lex(src);
  let p = 0;
  const peek = (): Tok | undefined => toks[p];
  const isOp = (v: string): boolean => peek()?.t === 'op' && peek()!.v === v;
  const eat = (v: string): void => {
    if (!isOp(v)) throw new Error(`expected ${v} at ${peek()?.v ?? 'end'} in ${src}`);
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
      if (isOp(',')) p++;
      else break;
    }
    eat(close);
    return items;
  };
  function atom(): Expr {
    const t = peek();
    if (!t) throw new Error(`unexpected end of ${src}`);
    p++;
    if (t.t === 'num') return { k: 'real', v: Number(t.v) };
    if (t.t === 'id') {
      if (isOp('(')) {
        p++;
        return { k: 'call', fn: { k: 'id', name: t.v }, args: list(')') };
      }
      if (isOp('[') && t.v === 'list') {
        p++;
        return vector(list(']'));
      }
      return { k: 'id', name: t.v };
    }
    if (t.v === '(') {
      const e = relation();
      eat(')');
      return e;
    }
    if (t.v === '[') return vector(list(']'));
    throw new Error(`unexpected ${t.v} in ${src}`);
  }
  function vector(items: Expr[]): Expr {
    const rows = items.filter((i) => i.k === 'matrix');
    if (rows.length === items.length && rows.length > 0) {
      const cols = (rows[0] as { rows: number }).rows;
      const cells: Expr[] = [];
      for (let j = 0; j < cols; j++) for (const r of rows) cells.push((r as { items: Expr[] }).items[j]!);
      return { k: 'matrix', rows: rows.length, cols, items: cells };
    }
    return { k: 'matrix', rows: items.length, cols: 1, items };
  }
  function postfix(): Expr {
    const a = atom();
    if (isOp('!')) {
      p++;
      return op('factorial', a);
    }
    return a;
  }
  function power(): Expr {
    const base = postfix();
    if (isOp('^') || isOp('**')) {
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
      const o = peek()!.v === '*' ? 'mult' : 'div';
      p++;
      a = op(o, a, unary());
    }
    return a;
  }
  function sum(): Expr {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const o = peek()!.v === '+' ? 'plus' : 'minus';
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
  if (p !== toks.length) throw new Error(`trailing input in ${src}`);
  return e;
}

export interface Dialect {
  name: (n: string) => string;
  pow: string;
  list: (items: string[]) => string;
  matrix: (rows: string[][]) => string;
  equal: (a: string, b: string) => string;
}

export function print(e: Expr, d: Dialect): string {
  const p = (x: Expr): string => print(x, d);
  switch (e.k) {
    case 'real': return Number.isInteger(e.v) ? String(e.v) : `${e.v}`;
    case 'id': return d.name(e.name);
    case 'call': return `${d.name((e.fn as { name: string }).name)}(${e.args.map(p).join(',')})`;
    case 'matrix': {
      if (e.cols === 1) return d.list(e.items.map(p));
      const rows: string[][] = [];
      for (let i = 0; i < e.rows; i++) rows.push(Array.from({ length: e.cols }, (_, j) => p(e.items[i + j * e.rows]!)));
      return d.matrix(rows);
    }
    case 'op': {
      const [a, b] = e.args;
      switch (e.op) {
        case 'plus': return `(${p(a!)}+${p(b!)})`;
        case 'minus': return `(${p(a!)}-${p(b!)})`;
        case 'mult': return `(${p(a!)}*${p(b!)})`;
        case 'div': return `(${p(a!)}/${p(b!)})`;
        case 'pow': return `((${p(a!)})${d.pow}(${p(b!)}))`;
        case 'neg': return `(-${p(a!)})`;
        case 'equal': return d.equal(p(a!), p(b!));
        case 'factorial': return `factorial(${p(a!)})`;
        default: throw new Error(`no printer for ${e.op}`);
      }
    }
    default: throw new Error(`no printer for ${e.k}`);
  }
}
