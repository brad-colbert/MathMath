/**
 * Compiles expressions and program statements into nested JavaScript closures, once per tree node, so a
 * loop that runs a body a million times no longer walks the tree and matches on node kinds each time. No
 * code is generated as text: each closure is ordinary code chosen by the node's kind.
 *
 * The closures keep the interpreter's meaning exactly. Variables stay in the same scopes; every operation
 * calls the same functions the interpreter does, and the only shortcuts are where those functions would
 * reach the same leaf anyway (two plain numbers added are `add` of them, whatever their units). Any kind of
 * node not handled here runs through the interpreter itself.
 */
import type { Expr, Stmt, Target } from '../model/ast.js';
import { add, compareClose, compareReal, div, mul, neg, pow, sub, zip } from './ops.js';
import { EvalError, type Fn, type Num, type Range, type Value, dimDiv, fromValues, num, requireNum, str } from './values.js';

/** What the compiled code needs from the interpreter. Scope is the interpreter's variable store. */
export interface Scope {
  lookup(name: string): Value | undefined;
  set(name: string, v: Value): void;
}

export interface ProgramState {
  value: Value | null;
  returned: boolean;
  ifTaken: boolean;
}

export interface Host {
  /** The interpreter's own evaluation, for nodes not compiled here. */
  evalGeneric(e: Expr, s: Scope, vec: boolean): Value;
  evalOp(op: string, args: Expr[], s: Scope, vec: boolean): Value;
  /** plus, minus or mult of values already worked out, as the interpreter does them. */
  evalOpValues(op: 'plus' | 'minus' | 'mult', a: Value, b: Value): Value;
  resolve(name: string, s: Scope, called?: boolean): Value | undefined;
  callee(fn: Expr, s: Scope): Fn;
  isBuiltinIf(f: Fn): boolean;
  isSolveForm(name: string): boolean;
  solveForm(name: string, args: Expr[], s: Scope): Value;
  index(base: Value, idx: Value[]): Value;
  indexAt(base: Value, a: Value, b: Value | undefined): Value;
  position(v: Value): number;
  setAt(name: string, store: Scope, i: number, j: number, v: Value): void;
  divideValues(a: Value, b: Value): Value;
  powerValues(a: Value, b: Value): Value;
  compareValues(a: Value, b: Value, test: (c: number) => boolean): Value;
  assign(t: Target, value: () => Value, body: Expr | null, evalIn: Scope, store: Scope): void;
  iterate(v: Value): Iterable<Value>;
  runProgram(body: Stmt[], s: Scope): Value;
  readonly exactCompare: boolean;
  readonly zeroOverZero: boolean;
}

type E = (s: Scope) => Value;
type S = (s: Scope, st: ProgramState) => void;

const truthy = (v: Value): boolean => requireNum(v, 'condition').re !== 0;
const bool = (b: boolean): Num => num(b ? 1 : 0);
function rangeCount(r: Range): number {
  if (r.step === 0) throw new EvalError('runtime', 'range step is zero');
  return Math.max(0, Math.floor((r.last - r.first) / r.step + 1e-9) + 1);
}

const TESTS: Record<string, (c: number) => boolean> = {
  equal: (c) => c === 0, notEqual: (c) => c !== 0, lessThan: (c) => c < 0, greaterThan: (c) => c > 0,
  lessOrEqual: (c) => c <= 0, greaterOrEqual: (c) => c >= 0,
};

export class Compiler {
  private exprs = new WeakMap<Expr, E>();
  private stmts = new WeakMap<Stmt, S>();
  private blocks = new WeakMap<Stmt[], S>();

  constructor(private h: Host) {}

  expr(e: Expr): E {
    let c = this.exprs.get(e);
    if (!c) {
      c = this.buildExpr(e);
      this.exprs.set(e, c);
    }
    return c;
  }

  block(body: Stmt[]): S {
    let c = this.blocks.get(body);
    if (!c) {
      const parts = body.map((x) => this.stmt(x));
      c = (s, st) => {
        for (const part of parts) {
          part(s, st);
          if (st.returned) return;
        }
      };
      this.blocks.set(body, c);
    }
    return c;
  }

  private buildExpr(e: Expr): E {
    const h = this.h;
    switch (e.k) {
      case 'real': {
        const v = num(e.v);
        return () => v;
      }
      case 'imag': {
        const v = num(0, undefined, e.v);
        return () => v;
      }
      case 'str': {
        const v = str(e.v);
        return () => v;
      }
      case 'id': {
        const name = e.name;
        // resolve() looks in the scope first; doing that here saves a call for every variable read.
        return (s) => {
          const v = s.lookup(name) ?? h.resolve(name, s);
          if (!v) throw new EvalError('undefined', name);
          if (v.t === 'failed') throw v.error;
          return v;
        };
      }
      case 'matrix': {
        const items = e.items.map((i) => this.expr(i));
        const { rows, cols } = e;
        return (s) => fromValues(rows, cols, items.map((f) => {
          const v = f(s);
          if (v.t === 'mat') delete v.owner;
          return v;
        }));
      }
      case 'op': return this.op(e.op, e.args);
      case 'call': return this.call(e.fn, e.args);
      case 'program': {
        const body = e.body;
        return (s) => h.runProgram(body, s);
      }
      default: return (s) => h.evalGeneric(e, s, false);
    }
  }

  private op(op: string, args: Expr[]): E {
    const h = this.h;
    const generic: E = (s) => h.evalOp(op, args, s, false);
    if (op === 'vectorize' || args.length === 0) return generic;
    const x = this.expr(args[0]!);
    const y = args[1] ? this.expr(args[1]) : null;
    // Two numbers go straight to the operation that the interpreter's array-aware versions end in.
    switch (op) {
      case 'plus': return y ? (s) => {
        const a = x(s);
        const b = y(s);
        return a.t === 'num' && b.t === 'num' ? add(a, b) : h.evalOpValues(op, a, b);
      } : generic;
      case 'minus':
        if (!y) return (s) => neg(x(s));
        return (s) => {
          const a = x(s);
          const b = y(s);
          return a.t === 'num' && b.t === 'num' ? sub(a, b) : h.evalOpValues(op, a, b);
        };
      case 'neg': return (s) => neg(x(s));
      case 'mult': return y ? (s) => {
        const a = x(s);
        const b = y(s);
        return a.t === 'num' && b.t === 'num' ? mul(a, b) : h.evalOpValues(op, a, b);
      } : generic;
      case 'div': return y ? (s) => {
        const a = x(s);
        const b = y(s);
        if (a.t === 'num' && b.t === 'num') {
          // Mathcad's zero-over-zero option: 0/0 is 0.
          if (h.zeroOverZero && a.re === 0 && a.im === 0 && b.re === 0 && b.im === 0) return num(0, dimDiv(a.dim, b.dim));
          return div(a, b);
        }
        return h.divideValues(a, b);
      } : generic;
      case 'pow': return y ? (s) => {
        const a = x(s);
        const b = y(s);
        return a.t === 'num' && b.t === 'num' ? pow(a, b) : h.powerValues(a, b);
      } : generic;
      case 'equal': case 'notEqual': case 'lessThan': case 'greaterThan': case 'lessOrEqual': case 'greaterOrEqual': {
        if (!y) return generic;
        const test = TESTS[op]!;
        return (s) => {
          const a = x(s);
          const b = y(s);
          if (a.t === 'num' && b.t === 'num') return bool(test(h.exactCompare ? compareReal(a, b) : compareClose(a, b)));
          return h.compareValues(a, b, test);
        };
      }
      case 'indexer': {
        const idx = args.slice(1).map((i) => this.expr(i));
        if (idx.length === 1 || idx.length === 2) {
          const [i0, i1] = idx as [E, E | undefined];
          return (s) => {
            const base = x(s);
            return h.indexAt(base, i0(s), i1 ? i1(s) : undefined);
          };
        }
        return (s) => {
          const base = x(s);
          return h.index(base, idx.map((f) => f(s)));
        };
      }
      default: return generic;
    }
  }

  private call(fn: Expr, args: Expr[]): E {
    const h = this.h;
    const fs = args.map((a) => this.expr(a));
    const normal = this.normalCall(fn, fs);
    // root and the solve block functions take names, unless the sheet has a function of that name.
    if (fn.k === 'id' && h.isSolveForm(fn.name)) {
      const name = fn.name;
      return (s) => (s.lookup(name) ? normal(s) : h.solveForm(name, args, s));
    }
    return normal;
  }

  private normalCall(fn: Expr, fs: E[]): E {
    const h = this.h;
    return (s) => {
      const callee = h.callee(fn, s);
      if (h.isBuiltinIf(callee)) {
        // As the interpreter's if: an array condition picks element by element.
        const cond = fs[0]!(s);
        if (cond.t === 'mat') {
          const yes = fs[1]!(s);
          const no = fs[2]!(s);
          return zip(zip(cond, yes, (c, v) => (truthy(c) ? v : str('\u0000'))), no, (p, n) => (p.t === 'str' && p.v === '\u0000' ? n : p));
        }
        return (truthy(cond) ? fs[1]! : fs[2]!)(s);
      }
      return callee.call(fs.map((f) => f(s)));
    };
  }

  private stmt(x: Stmt): S {
    let c = this.stmts.get(x);
    if (!c) {
      c = this.buildStmt(x);
      this.stmts.set(x, c);
    }
    return c;
  }

  private buildStmt(x: Stmt): S {
    const h = this.h;
    switch (x.k) {
      case 'assign': {
        const target = x.target;
        if (target.k === 'fn') {
          const body = x.value;
          return (s, st) => {
            st.ifTaken = false;
            h.assign(target, () => num(0), body, s, s);
          };
        }
        const v = this.expr(x.value);
        if (target.k === 'index' && (target.index.length === 1 || target.index.length === 2)) {
          // As assign(): the positions first, then the value.
          const name = target.name;
          const [i0, i1] = target.index.map((i) => this.expr(i)) as [E, E | undefined];
          return (s, st) => {
            st.ifTaken = false;
            const i = h.position(i0(s));
            const j = i1 ? h.position(i1(s)) : 0;
            if (i < 0 || j < 0) throw new EvalError('runtime', 'index out of bounds');
            const value = (st.value = v(s));
            h.setAt(name, s, i, j, value);
          };
        }
        return (s, st) => {
          st.ifTaken = false;
          h.assign(target, () => (st.value = v(s)), null, s, s);
        };
      }
      case 'if': {
        const cond = this.expr(x.cond);
        const then = this.stmt(x.then);
        // Each `if` runs on its own merits. `otherwise` runs only if none before it in the run did.
        return (s, st) => {
          const earlier = st.ifTaken;
          const taken = truthy(cond(s));
          if (taken) then(s, st);
          st.ifTaken = earlier || taken;
        };
      }
      case 'otherwise': {
        const then = this.stmt(x.then);
        return (s, st) => {
          const skip = st.ifTaken;
          st.ifTaken = false;
          if (!skip) then(s, st);
        };
      }
      case 'for': {
        const iter = this.expr(x.iter);
        const body = this.stmt(x.body);
        const name = x.varName;
        return (s, st) => {
          st.ifTaken = false;
          const it = iter(s);
          if (it.t === 'range') {
            const n = rangeCount(it);
            for (let i = 0; i < n; i++) {
              s.set(name, num(it.first + i * it.step, it.dim));
              body(s, st);
              if (st.returned) return;
            }
            return;
          }
          for (const v of h.iterate(it)) {
            s.set(name, v);
            body(s, st);
            if (st.returned) return;
          }
        };
      }
      case 'while': {
        const cond = this.expr(x.cond);
        const body = this.stmt(x.body);
        return (s, st) => {
          st.ifTaken = false;
          while (truthy(cond(s))) {
            body(s, st);
            if (st.returned) return;
          }
        };
      }
      case 'return': {
        const v = this.expr(x.value);
        return (s, st) => {
          st.ifTaken = false;
          st.value = v(s);
          st.returned = true;
        };
      }
      case 'block': {
        const inner = this.block(x.body);
        return (s, st) => {
          st.ifTaken = false;
          inner(s, st);
        };
      }
      case 'expr': {
        const v = this.expr(x.e);
        return (s, st) => {
          st.ifTaken = false;
          st.value = v(s);
        };
      }
    }
  }
}
