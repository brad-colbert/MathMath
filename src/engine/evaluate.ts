import type { Content, Expr, Region, Stmt, Target, Worksheet } from '../model/ast.js';
import { Defs } from '../symbolic/defs.js';
import type { Files } from './files.js';
import { makeBuiltins } from './builtins.js';
import {
  absV, addV, compareReal, cross, divE, inverse, magnitude, mapMat, matPow, mulE, mulV, neg, powE, subV, sumV,
  transpose, zip,
} from './ops.js';
import { UNITS } from './units.js';
import {
  EvalError, type Fn, type Mat, NODIM, type Num, type Range, type Value, cloneMat, dimMul, fromValues, getEl, isNoDim, newMat, num,
  requireMat, requireNum, requireReal, resized, setEl, str,
} from './values.js';

export class Scope {
  private vars = new Map<string, Value>();
  constructor(public parent: Scope | null) {}
  lookup(name: string): Value | undefined {
    for (let s: Scope | null = this; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return v;
    }
    return undefined;
  }
  set(name: string, v: Value): void {
    this.vars.set(name, v);
  }
}

export type OrderKey = 'align' | 'top';

/** One plotted trace, with NaN where a point can't be drawn. */
export interface Trace {
  x: Float64Array;
  y: Float64Array;
  error?: string;
}

export interface PlotData {
  traces: Trace[];
  /** Limits typed on the plot. Anything missing comes from the data. */
  limits: { xmin?: number; xmax?: number; ymin?: number; ymax?: number };
}

/** An image region's pixels, row by row, four bytes a pixel. */
export interface Pixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface Outcome {
  region: Region;
  value?: Value;
  plot?: PlotData;
  image?: Pixels;
  /** The result of a symbolic region. */
  symbolic?: Expr;
  unevaluated?: boolean;
  /** The evaluated unit override, for results shown in a sheet-defined unit. */
  unit?: Value;
  error?: EvalError;
}

const truthy = (v: Value): boolean => requireNum(v, 'condition').re !== 0;
const bool = (b: boolean): Num => num(b ? 1 : 0);

function rangeCount(r: Range): number {
  if (r.step === 0) throw new EvalError('runtime', 'range step is zero');
  return Math.max(0, Math.floor((r.last - r.first) / r.step + 1e-9) + 1);
}

/** Identifiers used in a tree, and those bound inside it. */
function collectIds(node: unknown, used: Set<string>, bound: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectIds(n, used, bound);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const n = node as Record<string, unknown>;
  if (n.k === 'id') used.add(n.name as string);
  if (typeof n.varName === 'string') bound.add(n.varName);
  if (n.k === 'assign') {
    const t = n.target as Target;
    if (t.k === 'var' || t.k === 'index' || t.k === 'col') bound.add(t.name);
  }
  for (const v of Object.values(n)) collectIds(v, used, bound);
}

const GK_X = [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691, 0.405845151377397, 0.207784955007898, 0];
const GK_WK = [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728];
const GK_WG = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];

function gaussKronrod(f: (x: number) => number, a: number, b: number): { value: number; error: number } {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  let kron = 0;
  let gauss = 0;
  for (let i = 0; i < 8; i++) {
    const dx = h * GK_X[i]!;
    const sum = i === 7 ? f(c) : f(c - dx) + f(c + dx);
    kron += GK_WK[i]! * sum;
    if (i % 2 === 1) gauss += GK_WG[(i - 1) / 2]! * sum;
  }
  return { value: kron * h, error: Math.abs((kron - gauss) * h) };
}

function adaptive(f: (x: number) => number, a: number, b: number, tol: number, depth = 0): number {
  const { value, error } = gaussKronrod(f, a, b);
  if (depth >= 40 || error <= tol) return value;
  const m = (a + b) / 2;
  return adaptive(f, a, m, tol / 2, depth + 1) + adaptive(f, m, b, tol / 2, depth + 1);
}

const CONSTANTS: Record<string, Num> = {
  'π': num(Math.PI), e: num(Math.E), '∞': num(1e307), '%': num(0.01),
};

export class Evaluator {
  private builtins: Map<string, Fn>;
  constructor(private ws: Pick<Worksheet, 'origin' | 'tol'>, files?: Files) {
    this.builtins = makeBuiltins(ws.origin, files);
  }

  get origin(): number {
    return this.ws.origin;
  }

  /** `min` is a unit as a value and a function when called, so the two lookups differ. */
  resolve(name: string, s: Scope, called = false): Value | undefined {
    const v = s.lookup(name);
    if (v) return v;
    if (name === 'ORIGIN') return num(this.ws.origin);
    if (name === 'TOL') return num(this.ws.tol);
    const c = CONSTANTS[name];
    if (c) return c;
    const b = this.builtins.get(name);
    const u = UNITS[name];
    const unit = u ? num(u.factor, u.dim) : undefined;
    return called ? (b ?? unit) : (unit ?? b);
  }

  eval(e: Expr, s: Scope, vec = false): Value {
    switch (e.k) {
      case 'real': return num(e.v);
      case 'imag': return num(0, NODIM, e.v);
      case 'str': return str(e.v);
      case 'id': {
        const v = this.resolve(e.name, s);
        if (!v) throw new EvalError('undefined', e.name);
        if (v.t === 'failed') throw v.error;
        return v;
      }
      case 'matrix': {
        const items = e.items.map((i) => {
          const v = this.eval(i, s, vec);
          if (v.t === 'mat') delete v.owner;
          return v;
        });
        return fromValues(e.rows, e.cols, items);
      }
      case 'range': return this.evalRange(e, s);
      case 'op': return this.evalOp(e.op, e.args, s, vec);
      case 'call': return this.evalCall(e.fn, e.args, s, vec);
      case 'bigop': return this.evalBigOp(e, s);
      case 'derivative': return this.evalDerivative(e, s);
      case 'program': return this.runProgram(e.body, s);
      case 'placeholder': throw new EvalError('runtime', 'empty placeholder');
      case 'limit': throw new EvalError('unsupported', 'a limit needs symbolic evaluation');
      case 'unsupported': throw new EvalError('unsupported', `element ${e.tag}`);
    }
  }

  private evalRange(e: Extract<Expr, { k: 'range' }>, s: Scope): Range {
    const first = requireNum(this.eval(e.first, s), 'range start');
    const last = requireNum(this.eval(e.last, s), 'range end');
    const second = e.second ? requireNum(this.eval(e.second, s), 'range step') : null;
    const step = second ? second.re - first.re : first.re <= last.re ? 1 : -1;
    return { t: 'range', first: first.re, step, last: last.re, dim: first.dim };
  }

  private evalOp(op: string, args: Expr[], s: Scope, vec: boolean): Value {
    if (op === 'vectorize') return this.eval(args[0]!, s, true);
    const a = this.eval(args[0]!, s, vec);
    const b = args[1] ? this.eval(args[1], s, vec) : undefined;
    switch (op) {
      case 'plus': return addV(a, b!);
      case 'minus': return b ? subV(a, b) : neg(a);
      case 'neg': return neg(a);
      case 'mult': return vec ? mulE(a, b!) : mulV(a, b!);
      case 'div': return this.divide(a, b!, vec);
      case 'pow': return this.power(a, b!, vec);
      case 'sqrt': return powE(a, num(0.5));
      case 'nthRoot': return powE(b!, num(1 / requireReal(a)));
      case 'absval': return vec && a.t === 'mat' ? mapMat(a, (x) => magnitude(requireNum(x))) : absV(a);
      case 'transpose': return transpose(requireMat(a));
      case 'vectorSum': return sumV(a);
      case 'crossProduct': return cross(requireMat(a), requireMat(b!));
      case 'indexer': return this.index(a, args.slice(1).map((i) => this.eval(i, s, vec)));
      case 'matcol': return this.column(requireMat(a), b!);
      case 'equal': return this.compare(a, b!, (c) => c === 0);
      case 'notEqual': return this.compare(a, b!, (c) => c !== 0);
      case 'lessThan': return this.compare(a, b!, (c) => c < 0);
      case 'greaterThan': return this.compare(a, b!, (c) => c > 0);
      case 'lessOrEqual': return this.compare(a, b!, (c) => c <= 0);
      case 'greaterOrEqual': return this.compare(a, b!, (c) => c >= 0);
      case 'and': return zip(a, b!, (x, y) => bool(truthy(x) && truthy(y)));
      case 'or': return zip(a, b!, (x, y) => bool(truthy(x) || truthy(y)));
      case 'xor': return zip(a, b!, (x, y) => bool(truthy(x) !== truthy(y)));
      case 'not': return bool(!truthy(a));
      case 'factorial': {
        let f = 1;
        for (let i = 2; i <= requireReal(a); i++) f *= i;
        return num(f);
      }
      default: throw new EvalError('unsupported', `operator ${op}`);
    }
  }

  /** A square array to an integer power is a matrix power. Anything else works element by element. */
  private power(a: Value, b: Value, vec: boolean): Value {
    if (vec || a.t !== 'mat' || a.rows !== a.cols || a.rows === 1) return powE(a, b);
    const p = requireReal(b, 'power');
    return Number.isInteger(p) ? matPow(a, p) : powE(a, b);
  }

  private divide(a: Value, b: Value, vec: boolean): Value {
    if (!vec && b.t === 'mat' && b.rows === b.cols && b.rows > 1) return mulV(a, inverse(b));
    return divE(a, b);
  }

  private compare(a: Value, b: Value, test: (c: number) => boolean): Value {
    return zip(a, b, (x, y) => {
      if (x.t === 'str' || y.t === 'str') {
        const [p, q] = [x.t === 'str' ? x.v : '', y.t === 'str' ? y.v : ''];
        return bool(test(p < q ? -1 : p > q ? 1 : 0));
      }
      return bool(test(compareReal(requireNum(x), requireNum(y))));
    });
  }

  private position(v: Value): number {
    return Math.trunc(requireReal(v, 'index') + 1e-9 * Math.sign(requireReal(v, 'index'))) - this.ws.origin;
  }

  private index(base: Value, idx: Value[]): Value {
    const first = idx[0];
    if (first?.t === 'mat') return mapMat(first, (i) => this.index(base, [i, ...idx.slice(1)]));
    const m = requireMat(base, 'indexed value');
    const i = this.position(idx[0]!);
    const j = idx[1] ? this.position(idx[1]) : 0;
    if (idx.length === 1 && m.cols > 1 && m.rows === 1) {
      if (i < 0 || i >= m.cols) throw new EvalError('runtime', 'index out of bounds');
      return getEl(m, 0, i);
    }
    if (idx.length === 1 && m.cols > 1) throw new EvalError('runtime', 'matrix needs two indices');
    if (i < 0 || j < 0 || i >= m.rows || j >= m.cols) throw new EvalError('runtime', 'index out of bounds');
    return getEl(m, i, j);
  }

  private column(m: Mat, b: Value): Mat {
    const j = this.position(b);
    if (j < 0 || j >= m.cols) throw new EvalError('runtime', 'column out of bounds');
    const out = newMat(m.rows, 1, m.dim);
    for (let i = 0; i < m.rows; i++) setEl(out, i, 0, getEl(m, i, j));
    return out;
  }

  private evalCall(fn: Expr, args: Expr[], s: Scope, vec: boolean): Value {
    const callee = this.callee(fn, s);
    if (callee.name === 'if' && callee === this.builtinIf) return this.evalIf(args, s, vec);
    const values = args.map((a) => this.eval(a, s, vec));
    if (vec && values.some((v) => v.t === 'mat')) return this.mapCall(callee, values);
    return callee.call(values);
  }

  private builtinIf: Fn = { t: 'fn', name: 'if', call: () => num(0) };

  private callee(fn: Expr, s: Scope): Fn {
    if (fn.k === 'id') {
      const v = fn.name === 'if' && !s.lookup('if') ? this.builtinIf : this.resolve(fn.name, s, true);
      if (!v) throw new EvalError('undefined-function', fn.name);
      if (v.t === 'failed') throw v.error;
      if (v.t === 'fn') return v;
      throw new EvalError('runtime', `${fn.name} is not a function`);
    }
    const v = this.eval(fn, s);
    if (v.t === 'fn') return v;
    throw new EvalError('runtime', 'called value is not a function');
  }

  private evalIf(args: Expr[], s: Scope, vec: boolean): Value {
    const cond = this.eval(args[0]!, s, vec);
    if (cond.t === 'mat') {
      const yes = this.eval(args[1]!, s, vec);
      const no = this.eval(args[2]!, s, vec);
      return zip(zip(cond, yes, (c, y) => (truthy(c) ? y : str('\u0000'))), no, (p, n) => (p.t === 'str' && p.v === '\u0000' ? n : p));
    }
    return this.eval(truthy(cond) ? args[1]! : args[2]!, s, vec);
  }

  private mapCall(fn: Fn, values: Value[]): Value {
    const shape = values.find((v): v is Mat => v.t === 'mat')!;
    const out: Value[] = [];
    for (let n = 0; n < shape.rows * shape.cols; n++) {
      const i = n % shape.rows;
      const j = Math.floor(n / shape.rows);
      out.push(fn.call(values.map((v) => (v.t === 'mat' ? getEl(v, i, j) : v))));
    }
    return fromValues(shape.rows, shape.cols, out);
  }

  private bindAt(name: string, x: Num, s: Scope): Scope {
    const child = new Scope(s);
    child.set(name, x);
    return child;
  }

  private evalBigOp(e: Extract<Expr, { k: 'bigop' }>, s: Scope): Value {
    if (!e.lo || !e.hi) throw new EvalError('unsupported', 'an indefinite integral needs symbolic evaluation');
    const lo = requireNum(this.eval(e.lo, s), 'lower bound');
    const hi = requireNum(this.eval(e.hi, s), 'upper bound');
    if (e.op === 'integral') {
      compareReal(lo, hi);
      // A bare 0 can pair with a bound that has units, so take them from the other bound.
      const xDim = isNoDim(lo.dim) ? hi.dim : lo.dim;
      if (Math.abs(lo.re) > 1e300 || Math.abs(hi.re) > 1e300) throw new EvalError('unsupported', 'infinite integral bound');
      let dim = NODIM;
      const f = (x: number): number => {
        const y = requireNum(this.eval(e.body, this.bindAt(e.varName, num(x, xDim), s)), 'integrand');
        if (y.im !== 0) throw new EvalError('unsupported', 'complex integrand');
        dim = y.dim;
        return y.re;
      };
      const coarse = gaussKronrod(f, lo.re, hi.re).value;
      const tol = Math.max(Math.abs(coarse) * 1e-10, 1e-300);
      return num(adaptive(f, lo.re, hi.re, tol), dimMul(dim, xDim));
    }
    let total: Value | null = null;
    for (let i = lo.re; i <= hi.re + 1e-9; i += 1) {
      const y = this.eval(e.body, this.bindAt(e.varName, num(i), s));
      total = !total ? y : e.op === 'summation' ? addV(total, y) : mulE(total, y);
    }
    return total ?? num(e.op === 'summation' ? 0 : 1);
  }

  /** Five-point central difference at the variable's current value. */
  private evalDerivative(e: Extract<Expr, { k: 'derivative' }>, s: Scope): Value {
    const at = requireNum(this.eval({ k: 'id', name: e.varName }, s), 'derivative point');
    const h = Math.max(Math.abs(at.re), 1e-3) * 1e-3;
    const f = (x: number): Num => requireNum(this.eval(e.body, this.bindAt(e.varName, num(x, at.dim), s)));
    const parts = [f(at.re - 2 * h), f(at.re - h), f(at.re + h), f(at.re + 2 * h)];
    const v = (parts[0]!.re - 8 * parts[1]!.re + 8 * parts[2]!.re - parts[3]!.re) / (12 * h);
    return num(v, parts[0]!.dim.map((d, i) => d - at.dim[i]!));
  }

  private closure(name: string, params: string[], body: Expr, scope: Scope): Fn {
    return {
      t: 'fn',
      name,
      arity: params.length,
      call: (args) => {
        if (args.length !== params.length) throw new EvalError('runtime', `${name} takes ${params.length} arguments`);
        const frame = new Scope(scope);
        params.forEach((p, i) => frame.set(p, args[i]!));
        return this.eval(body, frame);
      },
    };
  }

  assign(t: Target, value: () => Value, body: Expr | null, evalIn: Scope, store: Scope): void {
    switch (t.k) {
      case 'var': {
        const v = value();
        if (v.t === 'mat') delete v.owner;
        store.set(t.name, v);
        return;
      }
      case 'fn':
        store.set(t.name, this.closure(t.name, t.params, body!, store));
        return;
      case 'index': {
        const pos = t.index.map((i) => this.position(this.eval(i, evalIn)));
        const i = pos[0]!;
        const j = pos[1] ?? 0;
        if (i < 0 || j < 0) throw new EvalError('runtime', 'index out of bounds');
        const v = value();
        this.ownedMatrix(t.name, store, i + 1, j + 1, (m) => setEl(m, i, j, v));
        return;
      }
      case 'col': {
        const j = this.position(this.eval(t.index, evalIn));
        const col = requireMat(value());
        this.ownedMatrix(t.name, store, col.rows, j + 1, (m) => {
          for (let i = 0; i < col.rows; i++) setEl(m, i, j, getEl(col, i, 0));
        });
        return;
      }
      case 'multi': {
        const m = requireMat(value());
        t.targets.forEach((target, i) => this.assign(target, () => getEl(m, i, 0), null, evalIn, store));
        return;
      }
      case 'unsupported': throw new EvalError('unsupported', t.tag);
    }
  }

  /** The matrix behind `name`, private to `store` and at least the given size. */
  private ownedMatrix(name: string, store: Scope, rows: number, cols: number, edit: (m: Mat) => void): void {
    const old = store.lookup(name);
    let m: Mat;
    if (old?.t === 'mat') {
      m = old.owner === store ? old : cloneMat(old);
      if (rows > m.rows || cols > m.cols) m = resized(m, Math.max(rows, m.rows), Math.max(cols, m.cols));
    } else m = newMat(rows, cols);
    m.owner = store;
    edit(m);
    store.set(name, m);
  }

  private runProgram(body: Stmt[], s: Scope): Value {
    const frame = new Scope(s);
    const state: ProgramState = { value: null, returned: false, ifTaken: false };
    this.execBlock(body, frame, state);
    if (!state.value) throw new EvalError('runtime', 'program has no value');
    return state.value;
  }

  private execBlock(body: Stmt[], s: Scope, st: ProgramState): void {
    for (const stmt of body) {
      this.exec(stmt, s, st);
      if (st.returned) return;
    }
  }

  private exec(stmt: Stmt, s: Scope, st: ProgramState): void {
    if (stmt.k !== 'if' && stmt.k !== 'otherwise') st.ifTaken = false;
    switch (stmt.k) {
      case 'assign':
        if (stmt.target.k === 'fn') {
          this.assign(stmt.target, () => num(0), stmt.value, s, s);
          return;
        }
        this.assign(stmt.target, () => (st.value = this.eval(stmt.value, s)), null, s, s);
        return;
      case 'if': {
        // Each `if` runs on its own merits. `otherwise` runs only if none before it in the run did.
        const earlier = st.ifTaken;
        const taken = truthy(this.eval(stmt.cond, s));
        if (taken) this.exec(stmt.then, s, st);
        st.ifTaken = earlier || taken;
        return;
      }
      case 'otherwise': {
        const skip = st.ifTaken;
        st.ifTaken = false;
        if (!skip) this.exec(stmt.then, s, st);
        return;
      }
      case 'for': {
        const iter = this.eval(stmt.iter, s);
        for (const v of this.iterate(iter)) {
          s.set(stmt.varName, v);
          this.exec(stmt.body, s, st);
          if (st.returned) return;
        }
        return;
      }
      case 'while':
        while (truthy(this.eval(stmt.cond, s))) {
          this.exec(stmt.body, s, st);
          if (st.returned) return;
        }
        return;
      case 'return':
        st.value = this.eval(stmt.value, s);
        st.returned = true;
        return;
      case 'block':
        this.execBlock(stmt.body, s, st);
        return;
      case 'expr':
        st.value = this.eval(stmt.e, s);
    }
  }

  private *iterate(v: Value): Generator<Value> {
    if (v.t === 'range') {
      const n = rangeCount(v);
      for (let i = 0; i < n; i++) yield num(v.first + i * v.step, v.dim);
    } else if (v.t === 'mat') {
      for (let n = 0; n < v.rows * v.cols; n++) yield getEl(v, n % v.rows, Math.floor(n / v.rows));
    } else yield v;
  }

  /** Range variables an expression depends on. These iterate implicitly. */
  private rangesIn(nodes: unknown, s: Scope): { name: string; range: Range }[] {
    const used = new Set<string>();
    const bound = new Set<string>();
    collectIds(nodes, used, bound);
    const out: { name: string; range: Range }[] = [];
    for (const name of used) {
      if (bound.has(name)) continue;
      const v = s.lookup(name);
      if (v?.t === 'range') out.push({ name, range: v });
    }
    return out;
  }

  private forEachBinding(vars: { name: string; range: Range }[], s: Scope, visit: (scope: Scope) => void): void {
    const [head, ...tail] = vars;
    if (!head) {
      visit(s);
      return;
    }
    const n = rangeCount(head.range);
    for (let i = 0; i < n; i++) {
      const child = this.bindAt(head.name, num(head.range.first + i * head.range.step, head.range.dim), s);
      this.forEachBinding(tail, child, visit);
    }
  }

  evalRegionExpr(e: Expr, s: Scope): Value {
    const vars = this.rangesIn(e, s);
    if (vars.length === 0) return this.eval(e, s);
    const items: Value[] = [];
    this.forEachBinding(vars, s, (scope) => items.push(this.eval(e, scope)));
    return fromValues(items.length, 1, items);
  }

  define(c: Extract<Content, { k: 'define' }>, s: Scope): Value | undefined {
    const t = c.target;
    if (t.k === 'fn') {
      this.assign(t, () => num(0), c.value, s, s);
      return undefined;
    }
    if (c.value.k === 'range' && t.k === 'var') {
      const r = this.evalRange(c.value, s);
      s.set(t.name, r);
      return undefined;
    }
    const nodes = t.k === 'index' ? [t.index, c.value] : t.k === 'col' ? [t.index, c.value] : c.value;
    const vars = this.rangesIn(nodes, s);
    // Tested in Mathcad 14: `y := i^2` with a range variable `i` is an error.
    if (vars.length > 0 && t.k === 'var') throw new EvalError('runtime', 'range variable in a non-indexed definition');
    let last: Value | undefined;
    const items: Value[] = [];
    this.forEachBinding(vars, s, (scope) => {
      this.assign(t, () => (last = this.eval(c.value, scope)), null, scope, s);
      if (last) items.push(last);
    });
    return vars.length > 0 ? fromValues(items.length, 1, items) : last;
  }

  markFailed(t: Target, error: EvalError, s: Scope): void {
    if (t.k === 'multi') t.targets.forEach((x) => this.markFailed(x, error, s));
    else if (t.k !== 'unsupported') s.set(t.name, { t: 'failed', error });
  }
}

type Sym = Extract<Content, { k: 'sym' }>;

interface ProgramState {
  value: Value | null;
  returned: boolean;
  ifTaken: boolean;
}

const sortKey: Record<OrderKey, (r: Region) => [number, number]> = {
  align: (r) => [r.alignY, r.alignX],
  top: (r) => [r.top, r.left],
};

export function orderRegions(regions: Region[], key: OrderKey): Region[] {
  const get = sortKey[key];
  return [...regions].sort((a, b) => {
    const [ay, ax] = get(a);
    const [by, bx] = get(b);
    return ay - by || ax - bx;
  });
}

/** What a symbolic region came to. With no result, `error` says why. */
export interface SymAnswer {
  result: Expr | null;
  error?: string;
  /** The engine found no closed form, which isn't an error. */
  unevaluated?: boolean;
}

/** Works out a symbolic region, given the definitions above it. */
export type SymSolver = (c: Sym, defs: Defs, scope: Scope, ws: Worksheet) => Promise<SymAnswer>;

/** Keeps a worksheet's state as regions run in order. */
class Run {
  readonly ev: Evaluator;
  readonly outcomes: Outcome[] = [];
  scope = new Scope(null);
  defs = new Defs();

  constructor(ws: Worksheet, files?: Files) {
    this.ev = new Evaluator(ws, files);
  }

  /** The value of a display unit. Units resolve before functions here, so `°C` isn't a function. */
  private unitOf(unit: Expr | null): { unit?: Value } {
    if (!unit) return {};
    try {
      const v = this.ev.eval(unit, this.scope);
      return v.t === 'num' ? { unit: v } : {};
    } catch {
      return {};
    }
  }

  plain(region: Region): void {
    const c = region.content;
    if (c.k === 'image') {
      try {
        if (!c.expr) throw new EvalError('runtime', 'Type the matrix to show');
        this.outcomes.push({ region, image: pixels(this.ev.evalRegionExpr(c.expr, this.scope), c.mode) });
      } catch (err) {
        this.outcomes.push({ region, error: toEvalError(err) });
      }
      return;
    }
    if (c.k === 'plot') {
      try {
        this.outcomes.push({ region, plot: plotData(this.ev, c, this.scope) });
      } catch (err) {
        this.outcomes.push({ region, error: toEvalError(err) });
      }
      return;
    }
    if (c.k === 'other' || c.k === 'draft' || c.k === 'show') {
      this.outcomes.push({ region });
      return;
    }
    if (c.k === 'sym') throw new Error('symbolic regions go through symbolic()');
    if (c.k === 'eval') {
      try {
        const value = this.ev.evalRegionExpr(c.expr, this.scope);
        this.outcomes.push({ region, value, ...this.unitOf(c.unit) });
      } catch (err) {
        this.outcomes.push({ region, error: toEvalError(err) });
      }
      return;
    }
    this.defs = this.defs.with(c.target, c.value, this.scope = new Scope(this.scope));
    try {
      const value = this.ev.define(c, this.scope);
      this.outcomes.push(value ? { region, value, ...this.unitOf(c.unit) } : { region });
    } catch (err) {
      const error = toEvalError(err);
      this.ev.markFailed(c.target, error, this.scope);
      this.outcomes.push({ region, error });
    }
  }

  /** An arrow on a definition defines the result, so `h(x) := d/dx x³ → 3x²` gives h(2) = 12. */
  symbolic(region: Region, c: Sym, answer: SymAnswer): void {
    const outcome: Outcome = { region };
    if (answer.result) outcome.symbolic = answer.result;
    if (answer.error) outcome.error = new EvalError('runtime', answer.error);
    if (answer.unevaluated) outcome.unevaluated = true;
    this.outcomes.push(outcome);
    if (!c.target) return;
    const value = answer.result ?? c.expr;
    this.defs = this.defs.with(c.target, value, this.scope = new Scope(this.scope));
    if (answer.error) {
      this.ev.markFailed(c.target, new EvalError('runtime', answer.error), this.scope);
      return;
    }
    try {
      this.ev.define({ k: 'define', target: c.target, value, global: c.global, stored: null, unit: null, shown: false }, this.scope);
    } catch (err) {
      this.ev.markFailed(c.target, toEvalError(err), this.scope);
    }
  }
}

/**
 * A matrix as pixels: gray levels, or color from three equal blocks of columns side by side. Three
 * matrices in a vector are color too, red then green then blue.
 */
export function pixels(v: Value, mode: 'gray' | 'rgb'): Pixels {
  if (v.t === 'mat' && v.cells && v.rows * v.cols === 3) {
    const [r, g, b] = v.cells;
    if (r?.t !== 'mat' || g?.t !== 'mat' || b?.t !== 'mat' || r.cells || g.cells || b.cells) throw new EvalError('runtime', 'A color image needs three matrices of numbers');
    if (g.rows !== r.rows || b.rows !== r.rows || g.cols !== r.cols || b.cols !== r.cols) throw new EvalError('runtime', 'The red, green and blue matrices differ in size');
    const joined = newMat(r.rows, r.cols * 3);
    joined.re.set(r.re, 0);
    joined.re.set(g.re, r.re.length);
    joined.re.set(b.re, 2 * r.re.length);
    return pixels(joined, 'rgb');
  }
  if (v.t !== 'mat' || v.cells) throw new EvalError('runtime', 'An image needs a matrix of numbers');
  const { rows: h, cols } = v;
  if (mode === 'rgb' && cols % 3 !== 0) throw new EvalError('runtime', `A color image needs three equal blocks of columns, and this has ${cols}`);
  const w = mode === 'rgb' ? cols / 3 : cols;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const at = (i: number, j: number): number => v.re[i + j * h]!;
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const p = (i * w + j) * 4;
      if (mode === 'rgb') {
        rgba[p] = at(i, j);
        rgba[p + 1] = at(i, j + w);
        rgba[p + 2] = at(i, j + 2 * w);
      } else rgba[p] = rgba[p + 1] = rgba[p + 2] = at(i, j);
      rgba[p + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}

/** The most points a trace keeps. Beyond this a plot can't show the difference. */
const MAX_POINTS = 20000;

function numbers(v: Value, what: string): Float64Array {
  if (v.t === 'num') return Float64Array.of(v.im === 0 ? v.re : NaN);
  if (v.t !== 'mat') throw new EvalError('runtime', `${what} must be a number or a vector`);
  if (v.cells) throw new EvalError('runtime', `${what} can't be a nested array`);
  if (v.rows > 1 && v.cols > 1) throw new EvalError('runtime', `${what} must be a vector, not a matrix`);
  const out = new Float64Array(v.re.length);
  for (let i = 0; i < out.length; i++) out[i] = v.im && v.im[i] !== 0 ? NaN : v.re[i]!;
  return out;
}

/** Thins a long trace evenly. Plots of very long vectors keep their shape. */
function thin(x: Float64Array, y: Float64Array): [Float64Array, Float64Array] {
  if (x.length <= MAX_POINTS) return [x, y];
  const step = x.length / MAX_POINTS;
  const [tx, ty] = [new Float64Array(MAX_POINTS), new Float64Array(MAX_POINTS)];
  for (let i = 0; i < MAX_POINTS; i++) {
    const j = Math.floor(i * step);
    tx[i] = x[j]!;
    ty[i] = y[j]!;
  }
  return [tx, ty];
}

/** Evaluates a plot's expressions. Range variables give aligned columns, as in any region. */
export function plotData(ev: Evaluator, c: Extract<Content, { k: 'plot' }>, scope: Scope): PlotData {
  const limit = (e: Expr | null): number | undefined => (e ? requireReal(ev.eval(e, scope), 'axis limit') : undefined);
  const limits: PlotData['limits'] = {};
  const set = (key: keyof PlotData['limits'], e: Expr | null): void => {
    const v = limit(e);
    if (v !== undefined) limits[key] = v;
  };
  set('xmin', c.xAxis.min);
  set('xmax', c.xAxis.max);
  set('ymin', c.yAxis.min);
  set('ymax', c.yAxis.max);
  const xs = c.x ? numbers(ev.evalRegionExpr(c.x, scope), 'the x axis') : null;
  const traces = c.ys.map((y): Trace => {
    try {
      const ys = numbers(ev.evalRegionExpr(y, scope), 'a y value');
      // With no x expression, points go at 0, 1, 2…, counted from the array origin.
      let x = xs ?? Float64Array.from(ys, (_, i) => i + ev.origin);
      let yy = ys;
      if (x.length === 1 && yy.length > 1) x = new Float64Array(yy.length).fill(x[0]!);
      if (yy.length === 1 && x.length > 1) yy = new Float64Array(x.length).fill(yy[0]!);
      if (x.length !== yy.length) throw new EvalError('runtime', `x has ${x.length} values and y has ${yy.length}`);
      const [tx, ty] = thin(x, yy);
      return { x: tx, y: ty };
    } catch (err) {
      return { x: new Float64Array(0), y: new Float64Array(0), error: toEvalError(err).reason };
    }
  });
  return { traces, limits };
}

const isGlobal = (r: Region): boolean => (r.content.k === 'define' || r.content.k === 'sym') && r.content.global;

function inOrder(ws: Worksheet, order: OrderKey): Region[] {
  const sorted = orderRegions(ws.regions.filter((r) => !r.disabled), order);
  return [...sorted.filter(isGlobal), ...sorted.filter((r) => !isGlobal(r))];
}

/** Numeric evaluation only. Symbolic regions use the answers stored with them. */
export function runWorksheet(ws: Worksheet, order: OrderKey = 'align'): Outcome[] {
  const run = new Run(ws);
  for (const region of inOrder(ws, order)) {
    const c = region.content;
    if (c.k === 'sym') run.symbolic(region, c, c.stored ? { result: c.stored } : { result: null, error: 'needs symbolic evaluation' });
    else run.plain(region);
  }
  return run.outcomes;
}

/** Runs a worksheet with symbolic evaluation. A region can depend on the arrow above it. */
export async function runWithSymbolics(ws: Worksheet, solve: SymSolver, order: OrderKey = 'align', files?: Files): Promise<Outcome[]> {
  const run = new Run(ws, files);
  for (const region of inOrder(ws, order)) {
    const c = region.content;
    if (c.k === 'sym') run.symbolic(region, c, await solve(c, run.defs, run.scope, ws));
    else run.plain(region);
  }
  return run.outcomes;
}

function toEvalError(err: unknown): EvalError {
  if (err instanceof EvalError) return err;
  if (err instanceof RangeError) return new EvalError('runtime', 'stack overflow or bad size');
  throw err;
}

