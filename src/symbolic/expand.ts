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

/** Replaces sheet definitions with what they stand for, leaving only math the engine can read. */
import { type Value, getEl, isNoDim, type Mat } from '../engine/values.js';
import type { Expr } from '../model/ast.js';
import type { Definition, Defs } from './defs.js';

export class NotSymbolic extends Error {}

const BASE_UNITS = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'];
const MAX_DEPTH = 200;

/** A numeric value as math, for definitions with no usable expression. */
function fromValue(v: Value): Expr | null {
  if (v.t === 'mat') {
    const m = v as Mat;
    const items: Expr[] = [];
    for (let j = 0; j < m.cols; j++) {
      for (let i = 0; i < m.rows; i++) {
        const el = fromValue(getEl(m, i, j));
        if (!el) return null;
        items.push(el);
      }
    }
    return { k: 'matrix', rows: m.rows, cols: m.cols, items };
  }
  if (v.t !== 'num') return null;
  const number: Expr = v.im ? { k: 'op', op: 'plus', args: [{ k: 'real', v: v.re }, { k: 'imag', v: v.im }] } : { k: 'real', v: v.re };
  if (isNoDim(v.dim)) return number;
  const units = v.dim.flatMap((p, i): Expr[] => (p === 0 ? [] : [{ k: 'op', op: 'pow', args: [{ k: 'id', name: BASE_UNITS[i]! }, { k: 'real', v: p }] }]));
  return units.reduce<Expr>((a, b) => ({ k: 'op', op: 'mult', args: [a, b] }), number);
}

function resolve(name: string, d: Definition, keep: Expr, depth: number): Expr {
  if (d.bound) return d.body!;
  if (d.body) {
    try {
      return expand(d.body, d.env, new Set(), depth + 1);
    } catch (err) {
      if (!(err instanceof NotSymbolic)) throw err;
    }
  }
  // A program or an indexed definition has no expression to substitute, so use what it came to.
  const value = d.scope.lookup(name);
  if (value?.t === 'failed') throw new NotSymbolic(value.error.reason);
  if (value?.t === 'range') return keep;
  const literal = value ? fromValue(value) : null;
  if (!literal) throw new NotSymbolic(`${name} can't be used symbolically`);
  return literal;
}

export function expand(e: Expr, defs: Defs, bound: Set<string>, depth = 0): Expr {
  if (depth > MAX_DEPTH) throw new NotSymbolic('definitions are too deeply nested, or call themselves');
  const go = (x: Expr): Expr => expand(x, defs, bound, depth);
  const under = (name: string): Set<string> => new Set(bound).add(name);
  switch (e.k) {
    case 'real':
    case 'imag': return e;
    case 'str': throw new NotSymbolic('strings have no symbolic form');
    case 'placeholder': throw new NotSymbolic('there is an empty placeholder');
    case 'range': throw new NotSymbolic('ranges have no symbolic form');
    case 'program': throw new NotSymbolic('programs have no symbolic form');
    case 'unsupported': throw new NotSymbolic(`${e.tag} has no symbolic form`);
    case 'id': {
      if (bound.has(e.name)) return e;
      const d = defs.find(e.name);
      if (!d || d.params) return e;
      return resolve(e.name, d, e, depth);
    }
    case 'matrix': return { ...e, items: e.items.map(go) };
    case 'op': return { ...e, args: e.args.map(go) };
    case 'bigop': {
      const inner = under(e.varName);
      return { ...e, body: expand(e.body, defs, inner, depth), lo: e.lo && go(e.lo), hi: e.hi && go(e.hi) };
    }
    case 'derivative': return { ...e, body: expand(e.body, defs, under(e.varName), depth), ...(e.degree ? { degree: go(e.degree) } : {}) };
    case 'limit': return { ...e, body: expand(e.body, defs, under(e.varName), depth), to: go(e.to) };
    case 'call': {
      const args = e.args.map(go);
      if (e.fn.k !== 'id') throw new NotSymbolic('only named functions have a symbolic form');
      const d = bound.has(e.fn.name) ? undefined : defs.find(e.fn.name);
      if (!d) return { ...e, args };
      if (!d.params) throw new NotSymbolic(`${e.fn.name} is not a function`);
      if (d.params.length !== args.length) throw new NotSymbolic(`${e.fn.name} takes ${d.params.length} arguments`);
      if (!d.body) throw new NotSymbolic(`${e.fn.name} can't be used symbolically`);
      // Sheet functions inline: f(u) := u², then f(x+1) → (x+1)².
      const env = d.params.reduce((env_, p, i) => env_.add(p, { params: null, body: args[i]!, env: env_, scope: d.scope, bound: true }), d.env);
      return expand(d.body, env, new Set(), depth + 1);
    }
  }
}
