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

// Compares ways of running a worksheet program, to choose how the engine should execute loops.
// The workload is standard Floyd-Steinberg error diffusion on a synthetic image. Every backend runs
// the same tree and must produce the same output, or the timing is meaningless.
import { Evaluator, Scope } from '../src/engine/evaluate.js';
import { type Mat, type Value, newMat, num } from '../src/engine/values.js';
import type { Expr, Stmt, Target } from '../src/model/ast.js';

const R = (v: number): Expr => ({ k: 'real', v });
const V = (name: string): Expr => ({ k: 'id', name });
const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });
const fn = (name: string, ...args: Expr[]): Expr => ({ k: 'call', fn: V(name), args });
const at = (m: string, i: Expr, j: Expr): Expr => op('indexer', V(m), i, j);
const set = (name: string, value: Expr): Stmt => ({ k: 'assign', target: { k: 'var', name }, value });
const put = (m: string, i: Expr, j: Expr, value: Expr): Stmt => ({
  k: 'assign', target: { k: 'index', name: m, index: [i, j] } as Target, value,
});
const when = (cond: Expr, then: Stmt): Stmt => ({ k: 'if', cond, then });
const plus = (a: Expr, b: Expr): Expr => op('plus', a, b);
const minus = (a: Expr, b: Expr): Expr => op('minus', a, b);
const lt = (a: Expr, b: Expr): Expr => op('lessThan', a, b);
const gt = (a: Expr, b: Expr): Expr => op('greaterThan', a, b);

const quantize: Stmt[] = [
  set('L', minus(op('pow', R(2), V('b')), R(1))),
  when(gt(V('v'), R(1)), { k: 'return', value: R(1) }),
  { k: 'otherwise', then: { k: 'expr', e: op('div', fn('trunc', plus(op('mult', V('v'), V('L')), R(0.5))), V('L')) } },
];

const spread = (i: Expr, j: Expr, w: number): Stmt =>
  put('I', i, j, plus(at('I', i, j), op('mult', op('div', R(w), R(16)), V('e'))));

const r1 = plus(V('r'), R(1));
const c1 = plus(V('c'), R(1));
const cm = minus(V('c'), R(1));
const lastR = minus(V('rs'), R(1));
const lastC = minus(V('cs'), R(1));

const diffuse: Stmt[] = [
  set('rs', fn('rows', V('I'))),
  set('cs', fn('cols', V('I'))),
  set('I', op('div', V('I'), V('mx'))),
  {
    k: 'for', varName: 'r', iter: { k: 'range', first: R(0), second: null, last: lastR },
    body: {
      k: 'for', varName: 'c', iter: { k: 'range', first: R(0), second: null, last: lastC },
      body: {
        k: 'block',
        body: [
          set('v', at('I', V('r'), V('c'))),
          set('q', fn('quantize', V('v'), V('b'))),
          set('e', minus(V('v'), V('q'))),
          put('I', V('r'), V('c'), V('q')),
          when(lt(V('c'), lastC), spread(V('r'), c1, 7)),
          when(lt(V('r'), lastR), when(gt(V('c'), R(0)), spread(r1, cm, 3))),
          when(lt(V('r'), lastR), spread(r1, V('c'), 5)),
          when(lt(V('r'), lastR), when(lt(V('c'), lastC), spread(r1, c1, 1))),
        ],
      },
    },
  },
  { k: 'expr', e: V('I') },
];

function makeImage(rows: number, cols: number): Mat {
  const m = newMat(rows, cols);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) m.re[i + j * rows] = (((i * 7 + j * 13) % 251) + (255 * i) / rows) / 2;
  }
  return m;
}

const checksum = (a: Float64Array): string => a.reduce((s, x) => s + x, 0).toFixed(6);

// Backend 1: the tree-walking evaluator, unchanged.
function interpret(img: Mat, b: number, mx: number): Float64Array {
  const ev = new Evaluator({ origin: 0, tol: 0.001 });
  const scope = new Scope(null);
  const define = (name: string, params: string[], body: Stmt[]): void => {
    ev.assign({ k: 'fn', name, params }, () => num(0), { k: 'program', body }, scope, scope);
  };
  define('quantize', ['v', 'b'], quantize);
  define('diffuse', ['I', 'b', 'mx'], diffuse);
  const args: Expr[] = [V('img'), R(b), R(mx)];
  scope.set('img', img as Value);
  return (ev.eval(fn('diffuse', ...args), scope) as Mat).re;
}

interface Slots { scalars: Map<string, number>; matrix: string }

const slot = (s: Slots, name: string): number => {
  if (!s.scalars.has(name)) s.scalars.set(name, s.scalars.size);
  return s.scalars.get(name)!;
};

// Backend 2: compile the tree to nested closures over a scalar frame.
type N = (f: Float64Array) => number;
type S = (f: Float64Array) => boolean;

interface Rt { re: Float64Array; rows: number; cols: number; ret: number; quantFrame: Float64Array; quant: S | null; quantSlots: number }

function closureExpr(e: Expr, s: Slots, rt: Rt): N {
  if (e.k === 'real') {
    const v = e.v;
    return () => v;
  }
  if (e.k === 'id') {
    const i = slot(s, e.name);
    return (f) => f[i]!;
  }
  if (e.k === 'call') {
    const name = e.fn.k === 'id' ? e.fn.name : '';
    if (name === 'rows') return () => rt.rows;
    if (name === 'cols') return () => rt.cols;
    const a = closureExpr(e.args[0]!, s, rt);
    if (name === 'trunc') return (f) => Math.trunc(a(f));
    const b = closureExpr(e.args[1]!, s, rt);
    return (f) => {
      const g = rt.quantFrame;
      const [x, y] = [a(f), b(f)];
      g[0] = x;
      g[1] = y;
      rt.quant!(g);
      return rt.ret;
    };
  }
  if (e.k !== 'op') throw new Error(`no closure for ${e.k}`);
  if (e.op === 'indexer') {
    const i = closureExpr(e.args[1]!, s, rt);
    const j = closureExpr(e.args[2]!, s, rt);
    return (f) => {
      const [x, y] = [i(f), j(f)];
      if (x < 0 || y < 0 || x >= rt.rows || y >= rt.cols) throw new Error('index out of bounds');
      return rt.re[x + y * rt.rows]!;
    };
  }
  const a = closureExpr(e.args[0]!, s, rt);
  const b = closureExpr(e.args[1]!, s, rt);
  switch (e.op) {
    case 'plus': return (f) => a(f) + b(f);
    case 'minus': return (f) => a(f) - b(f);
    case 'mult': return (f) => a(f) * b(f);
    case 'div': return (f) => a(f) / b(f);
    case 'pow': return (f) => a(f) ** b(f);
    case 'lessThan': return (f) => (a(f) < b(f) ? 1 : 0);
    case 'greaterThan': return (f) => (a(f) > b(f) ? 1 : 0);
    default: throw new Error(`no closure for ${e.op}`);
  }
}

function closureStmt(st: Stmt, s: Slots, rt: Rt): S {
  switch (st.k) {
    case 'assign': {
      const value = closureExpr(st.value, s, rt);
      if (st.target.k === 'index') {
        const i = closureExpr(st.target.index[0]!, s, rt);
        const j = closureExpr(st.target.index[1]!, s, rt);
        return (f) => {
          const [x, y] = [i(f), j(f)];
          const v = value(f);
          if (x < 0 || y < 0 || x >= rt.rows || y >= rt.cols) throw new Error('index out of bounds');
          rt.re[x + y * rt.rows] = v;
          return false;
        };
      }
      const t = slot(s, (st.target as { name: string }).name);
      return (f) => {
        f[t] = value(f);
        return false;
      };
    }
    case 'if': {
      const c = closureExpr(st.cond, s, rt);
      const then = closureStmt(st.then, s, rt);
      return (f) => (c(f) !== 0 ? then(f) : false);
    }
    case 'for': {
      if (st.iter.k !== 'range') throw new Error('range expected');
      const v = slot(s, st.varName);
      const last = closureExpr(st.iter.last, s, rt);
      const first = closureExpr(st.iter.first, s, rt);
      const body = closureStmt(st.body, s, rt);
      return (f) => {
        const end = last(f);
        for (let i = first(f); i <= end; i++) {
          f[v] = i;
          if (body(f)) return true;
        }
        return false;
      };
    }
    case 'block': return closureBlock(st.body, s, rt);
    case 'return': {
      const value = closureExpr(st.value, s, rt);
      return (f) => {
        rt.ret = value(f);
        return true;
      };
    }
    case 'expr': {
      const value = closureExpr(st.e, s, rt);
      return (f) => {
        rt.ret = value(f);
        return false;
      };
    }
    default: throw new Error(`no closure for ${st.k}`);
  }
}

function closureBlock(body: Stmt[], s: Slots, rt: Rt): S {
  const out: S[] = [];
  for (let n = 0; n < body.length; n++) {
    const st = body[n]!;
    const next = body[n + 1];
    if (st.k === 'if' && next?.k === 'otherwise') {
      const c = closureExpr(st.cond, s, rt);
      const yes = closureStmt(st.then, s, rt);
      const no = closureStmt(next.then, s, rt);
      out.push((f) => (c(f) !== 0 ? yes(f) : no(f)));
      n++;
    } else out.push(closureStmt(st, s, rt));
  }
  return (f) => {
    for (let i = 0; i < out.length; i++) if (out[i]!(f)) return true;
    return false;
  };
}

function closures(img: Mat, b: number, mx: number): Float64Array {
  const rt: Rt = { re: img.re.slice(), rows: img.rows, cols: img.cols, ret: 0, quantFrame: new Float64Array(0), quant: null, quantSlots: 0 };
  for (let n = 0; n < rt.re.length; n++) rt.re[n] = rt.re[n]! / mx;
  const q: Slots = { scalars: new Map([['v', 0], ['b', 1]]), matrix: '' };
  rt.quant = closureBlock(quantize, q, rt);
  rt.quantFrame = new Float64Array(q.scalars.size);
  const d: Slots = { scalars: new Map([['b', 0]]), matrix: 'I' };
  const body = diffuse.filter((st) => !(st.k === 'assign' && st.target.k === 'var' && st.target.name === 'I') && st.k !== 'expr');
  const run = closureBlock(body, d, rt);
  const f = new Float64Array(d.scalars.size);
  f[0] = b;
  run(f);
  return rt.re;
}

// Backend 3: generate JavaScript from the tree. Only numbers and slot names reach the source text.
function jsExpr(e: Expr, s: Slots): string {
  if (e.k === 'real') return `(${e.v})`;
  if (e.k === 'id') return `s${slot(s, e.name)}`;
  if (e.k === 'call') {
    const name = e.fn.k === 'id' ? e.fn.name : '';
    if (name === 'rows') return 'rows';
    if (name === 'cols') return 'cols';
    const args = e.args.map((a) => jsExpr(a, s));
    return name === 'trunc' ? `Math.trunc(${args[0]})` : `quant(${args.join(',')})`;
  }
  if (e.k !== 'op') throw new Error(`no code for ${e.k}`);
  if (e.op === 'indexer') return `re[at(${jsExpr(e.args[1]!, s)},${jsExpr(e.args[2]!, s)})]`;
  const [a, b] = [jsExpr(e.args[0]!, s), jsExpr(e.args[1]!, s)];
  const table: Record<string, string> = {
    plus: `(${a}+${b})`, minus: `(${a}-${b})`, mult: `(${a}*${b})`, div: `(${a}/${b})`, pow: `Math.pow(${a},${b})`,
    lessThan: `(${a}<${b}?1:0)`, greaterThan: `(${a}>${b}?1:0)`,
  };
  const code = table[e.op];
  if (!code) throw new Error(`no code for ${e.op}`);
  return code;
}

function jsBlock(body: Stmt[], s: Slots, tail: string): string {
  return body.map((st, n) => {
    const next = body[n + 1];
    switch (st.k) {
      case 'assign': {
        const v = jsExpr(st.value, s);
        if (st.target.k === 'index') return `re[at(${jsExpr(st.target.index[0]!, s)},${jsExpr(st.target.index[1]!, s)})]=${v};`;
        return `s${slot(s, (st.target as { name: string }).name)}=${v};`;
      }
      case 'if': {
        const then = jsBlock([st.then], s, tail);
        const other = next?.k === 'otherwise' ? `else{${jsBlock([next.then], s, tail)}}` : '';
        return `if(${jsExpr(st.cond, s)}!==0){${then}}${other}`;
      }
      case 'otherwise': return '';
      case 'for': {
        if (st.iter.k !== 'range') throw new Error('range expected');
        const v = `s${slot(s, st.varName)}`;
        return `for(${v}=${jsExpr(st.iter.first, s)};${v}<=${jsExpr(st.iter.last, s)};${v}++){${jsBlock([st.body], s, tail)}}`;
      }
      case 'block': return jsBlock(st.body, s, tail);
      case 'return': return `return ${jsExpr(st.value, s)};`;
      case 'expr': return `${tail}${jsExpr(st.e, s)};`;
      default: throw new Error(`no code for ${st.k}`);
    }
  }).join('');
}

const declare = (s: Slots, params: string[]): string => {
  const locals = [...s.scalars].filter(([n]) => !params.includes(n)).map(([, i]) => `s${i}=0`);
  return locals.length ? `let ${locals.join(',')};` : '';
};

function codegen(img: Mat, b: number, mx: number): Float64Array {
  const q: Slots = { scalars: new Map([['v', 0], ['b', 1]]), matrix: '' };
  const qBody = jsBlock(quantize, q, 'return ');
  const d: Slots = { scalars: new Map([['b', 0]]), matrix: 'I' };
  const body = diffuse.filter((st) => !(st.k === 'assign' && st.target.k === 'var' && st.target.name === 'I') && st.k !== 'expr');
  const dBody = jsBlock(body, d, '');
  const source = `
    "use strict";
    function at(i,j){if(i<0||j<0||i>=rows||j>=cols)throw new Error("index out of bounds");return i+j*rows;}
    function quant(s0,s1){${declare(q, ['v', 'b'])}${qBody}}
    let s0=b;${declare(d, ['b'])}${dBody}`;
  const re = img.re.map((x) => x / mx);
  new Function('re', 'rows', 'cols', 'b', source)(re, img.rows, img.cols, b);
  return re;
}

// Backend 4: written by hand. The ceiling for any generated code.
function handwritten(img: Mat, b: number, mx: number): Float64Array {
  const { rows, cols } = img;
  const re = img.re.map((x) => x / mx);
  const L = 2 ** b - 1;
  const quant = (v: number): number => (v > 1 ? 1 : Math.trunc(v * L + 0.5) / L);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = r + c * rows;
      const v = re[n]!;
      const q = quant(v);
      const e = v - q;
      re[n] = q;
      if (c < cols - 1) re[n + rows] = re[n + rows]! + (7 / 16) * e;
      if (r < rows - 1 && c > 0) re[n + 1 - rows] = re[n + 1 - rows]! + (3 / 16) * e;
      if (r < rows - 1) re[n + 1] = re[n + 1]! + (5 / 16) * e;
      if (r < rows - 1 && c < cols - 1) re[n + 1 + rows] = re[n + 1 + rows]! + (1 / 16) * e;
    }
  }
  return re;
}

const backends = { interpret, closures, codegen, handwritten };

const check = makeImage(64, 80);
const sums = Object.entries(backends).map(([name, run]) => [name, checksum(run(check, 2, 255))] as const);
for (const [name, sum] of sums) console.log(`${name.padEnd(12)} checksum ${sum}`);
if (new Set(sums.map(([, s]) => s)).size !== 1) throw new Error('Backends disagree, so timings mean nothing.');

const TARGET = 8_400_000;
console.log(`\nSeconds, and projected seconds for ${TARGET} values:`);
const sizes: Record<string, [number, number]> = {
  interpret: [240, 320], closures: [1445, 1920], codegen: [1445, 1920], handwritten: [1445, 1920],
};
const runs: [string, (img: Mat, b: number, mx: number) => Float64Array, [number, number]][] = [
  ['interpret', interpret, [480, 640]],
  ...Object.entries(backends).map(([name, run]) => [name, run, sizes[name]!] as (typeof runs)[number]),
];
for (const [name, run, [rows, cols]] of runs) {
  const img = makeImage(rows, cols);
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    run(img, 2, 255);
    best = Math.min(best, performance.now() - t);
  }
  const seconds = best / 1000;
  const projected = (seconds * TARGET) / (rows * cols);
  console.log(`${name.padEnd(12)} ${String(rows * cols).padStart(8)} values ${seconds.toFixed(3).padStart(8)} s  -> ${projected.toFixed(1).padStart(8)} s`);
}
