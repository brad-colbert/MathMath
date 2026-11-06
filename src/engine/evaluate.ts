import type { Content, Expr, Region, Stmt, Target, Worksheet } from '../model/ast.js';
import { Defs } from '../symbolic/defs.js';
import { type Files, NO_FILES, sheetKey } from './files.js';
import { makeBuiltins } from './builtins.js';
import { Compiler, type Host, type ProgramState } from './compile.js';
import { brent, leastSquares, minimize, minimizeWithin, secant } from './solve.js';
import { odeGrid } from './ode.js';
import { type Pixels, type Written, pixels } from './image.js';
import {
  absV, addV, compareClose, compareReal, cross, divE, divZeroE, inverse, magnitude, mapMat, matPow, mulE, mulV, neg, powE, subV, sumV,
  transpose, zip,
} from './ops.js';
import { stream } from './random.js';
import { UNITS } from './units.js';
import {
  type Dim, EvalError, type Fn, type Mat, NODIM, type Num, type Range, type Value, cloneMat, dimDiv, dimEq, dimMul, dimPow, fromValues, getEl, isNoDim, newMat, num,
  growColumn, needsFile, requireMat, requireNum, requireReal, resized, setEl, str,
} from './values.js';


export { type Pixels, type Written, pixels };
/** Columns taken from each matrix, as long as it hasn't changed since. */
const COLUMNS = new WeakMap<Mat, { version: number; cols: Map<number, Mat> }>();

/** The scopes of one sheet's definitions, in order, and for each name the ones that define it. */
class Line {
  next = 0;
  readonly holders = new Map<string, Scope[]>();
}

/**
 * Names and their values. Each definition on a sheet opens a scope after the one before, so a sheet's scopes
 * form one line, and a function defined partway down sees only what's above it. Walking that line for every
 * name took time in proportion to the number of definitions, so those scopes share an index of which define
 * each name, searched by position. Scopes opened for a call or a range value are walked as before: they're few.
 */
export class Scope {
  private vars = new Map<string, Value>();
  private line: Line | null = null;
  private serial = 0;
  constructor(public parent: Scope | null) {}

  /** The next scope in a sheet's line of definitions, or the first when `before` is null. */
  static after(before: Scope | null): Scope {
    const s = new Scope(before);
    if (before && !before.line) throw new Error('a definition scope must follow another');
    s.line = before?.line ?? new Line();
    s.serial = s.line.next++;
    return s;
  }

  lookup(name: string): Value | undefined {
    let s: Scope | null = this;
    for (; s && !s.line; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return v;
    }
    if (!s) return undefined;
    // The last scope in the line, at or before this one, that defines the name.
    const holders = s.line!.holders.get(name);
    if (!holders) return undefined;
    let lo = 0;
    let hi = holders.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (holders[mid]!.serial <= s.serial) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found < 0 ? undefined : holders[found]!.vars.get(name);
  }

  /** The names this scope itself sets, not its parents'. */
  own(): IterableIterator<[string, Value]> {
    return this.vars.entries();
  }

  /**
   * Forgets every definition scope after this one in its line, so a run can pick up again from here.
   * Serials keep counting up, so a scope from the forgotten part can never pass for a new one.
   */
  forgetAfter(): void {
    if (!this.line) throw new Error('only a definition scope can be resumed from');
    for (const holders of this.line.holders.values()) {
      while (holders.length > 0 && holders[holders.length - 1]!.serial > this.serial) holders.pop();
    }
  }

  set(name: string, v: Value): void {
    if (this.line && !this.vars.has(name)) {
      const holders = this.line.holders.get(name);
      if (!holders) this.line.holders.set(name, [this]);
      else {
        // Usually the newest scope, so the end; kept in order either way.
        let at = holders.length;
        while (at > 0 && holders[at - 1]!.serial > this.serial) at--;
        holders.splice(at, 0, this);
      }
    }
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

export type LimitKey = 'xmin' | 'xmax' | 'ymin' | 'ymax';

/**
 * A surface on a grid of rows × cols points, each array column by column. `regular` is true for a matrix of
 * heights or a sampled function, whose x and y follow the grid; false for three matrices X, Y and Z.
 * `sampled` is true for a function, the one kind the x and y limits apply to.
 */
export interface SurfaceData { rows: number; cols: number; x: Float64Array; y: Float64Array; z: Float64Array; regular: boolean; zDim: Dim; sampled: boolean }

export interface PlotData {
  traces: Trace[];
  /** Limits typed on the plot. Anything missing comes from the data. */
  limits: Partial<Record<LimitKey, number>>;
  /**
   * For the worker, which shows each axis in a display unit. Values above are in base units. An axis's
   * dimension is null when its traces disagree. A limit typed with units has its dimension here; one
   * typed as a bare number is already in the axis's display unit.
   */
  dims?: { x: Dim | null; y: Dim | null; limits: Partial<Record<LimitKey, Dim>> };
  /** The display units chosen for the axes, evaluated. */
  units?: { x: Value | undefined; y: Value | undefined };
  /** The unit each axis shows, as LaTeX, and whether it was chosen rather than the default. Set by the worker. */
  labels?: { x: string; y: string; xChosen: boolean; yChosen: boolean };
  /** For a surface or contour plot, in place of traces. */
  surface?: SurfaceData;
  /** The unit the surface's heights are shown in, as LaTeX. Set by the worker. */
  zLabel?: string;
}


export interface Outcome {
  region: Region;
  value?: Value;
  plot?: PlotData;
  image?: Pixels;
  /** Image files the region wrote with writeImage, to offer for saving. */
  files?: Written[];
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
export function collectIds(node: unknown, used: Set<string>, bound: Set<string>): void {
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

/** Kronrod's 7 points, with Gauss's 3 among them for the error estimate: ± nodes, then the middle. */
const K7_X = [0.9604912687080202, 0.7745966692414834, 0.4342437493468026];
const K7_W = [0.1046562260264673, 0.2684880898683334, 0.4013974147759622, 0.4509165386584741];
const G3_W = [0.5555555555555556, 0.8888888888888888];

/** A cheaper rule for short pieces that are already smooth: 7 evaluations instead of 15. */
function gaussKronrod7(f: (x: number) => number, a: number, b: number): { value: number; error: number } {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const mid = f(c);
  let kron = K7_W[3]! * mid;
  let gauss = G3_W[1]! * mid;
  for (let i = 0; i < 3; i++) {
    const dx = h * K7_X[i]!;
    const sum = f(c - dx) + f(c + dx);
    kron += K7_W[i]! * sum;
    if (i === 1) gauss += G3_W[0]! * sum;
  }
  return { value: kron * h, error: Math.abs((kron - gauss) * h) };
}

type Rule = (f: (x: number) => number, a: number, b: number) => { value: number; error: number };

function adaptive(f: (x: number) => number, a: number, b: number, tol: number, depth = 0, rule: Rule = gaussKronrod): number {
  const { value, error } = rule(f, a, b);
  if (depth >= 40 || error <= tol) return value;
  const m = (a + b) / 2;
  return adaptive(f, a, m, tol / 2, depth + 1, rule) + adaptive(f, m, b, tol / 2, depth + 1, rule);
}

const CONSTANTS: Record<string, Num> = {
  'π': num(Math.PI), e: num(Math.E), '∞': num(1e307), '%': num(0.01),
};

/** Functions that work on names rather than values, as root, and those that close a solve block. */
export const SOLVE_FORMS = new Set(['Find', 'Minerr', 'Maximize', 'Minimize', 'Odesolve', 'root']);
const BLOCK_FORMS = ['Find', 'Minerr', 'Maximize', 'Minimize', 'Odesolve'];
const RELATIONS = new Set(['equal', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual']);
/**
 * A name no sheet can write. Given and each constraint set it, and each solver reads it, so recalculation
 * that changes a constraint calculates the solver below it again.
 */
export const SOLVE_BLOCK = '\u0000solve block';

const BLOCK_CALL = new RegExp(`"name":"(${BLOCK_FORMS.join('|')})"`);
/** Whether a definition or evaluation calls a function that closes a solve block. Its stored answer isn't looked at. */
export const closesBlock = (c: Content): boolean =>
  (c.k === 'define' || c.k === 'eval') && BLOCK_CALL.test(JSON.stringify(c.k === 'define' ? c.value : c.expr));
export const isGiven = (c: Content): boolean => c.k === 'show' && c.expr.k === 'id' && (c.expr.name === 'Given' || c.expr.name === 'given');
export const isConstraint = (c: Content): boolean => c.k === 'show' && c.expr.k === 'op' && RELATIONS.has(c.expr.op);

/** Solves the small n × n system A·x = b, or null if A is singular. */
function solveSmall(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r) => r.slice());
  const x = b.slice();
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-300) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    [x[c], x[p]] = [x[p]!, x[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k < n; k++) M[r]![k]! -= f * M[c]![k]!;
      x[r]! -= f * x[c]!;
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let v = x[r]!;
    for (let k = r + 1; k < n; k++) v -= M[r]![k]! * x[k]!;
    x[r] = v / M[r]![r]!;
  }
  return x;
}

/** Cubic Hermite interpolation through values and slopes at sorted or reverse-sorted points. */
function hermite(xs: number[], ys: number[], ds: number[], at: number): number {
  const n = xs.length;
  const up = xs[n - 1]! >= xs[0]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid]! <= at) === up) lo = mid;
    else hi = mid;
  }
  const h = xs[hi]! - xs[lo]!;
  const u = (at - xs[lo]!) / h;
  const h00 = (1 + 2 * u) * (1 - u) ** 2;
  const h10 = u * (1 - u) ** 2;
  const h01 = u * u * (3 - 2 * u);
  const h11 = u * u * (u - 1);
  return h00 * ys[lo]! + h10 * h * ds[lo]! + h01 * ys[hi]! + h11 * h * ds[hi]!;
}

/** What a solver sees while its region is worked out: its block's constraints, or null outside a block. */
export interface SolveContext { constraints: Expr[] | null; target: Target | null }

export class Evaluator implements Host {
  private builtins: Map<string, Fn>;
  /** Set by Run while a region that calls a solver is worked out. */
  solveContext: SolveContext | null = null;
  /** Expressions and programs as closures, built once per tree node. */
  private compiler = new Compiler(this);
  /** While an integral samples its integrand: tables interpolated at the integration variable. */
  private corners: { at: number; tables: Set<Float64Array> } | null = null;
  constructor(private ws: Pick<Worksheet, 'origin' | 'tol'> & { ctol?: number; exactCompare?: boolean; zeroOverZero?: boolean }, files?: Files) {
    this.builtins = makeBuiltins(ws.origin, files, {
      interpolated: (xs, at) => {
        if (this.corners && at === this.corners.at) this.corners.tables.add(xs);
      },
      random: () => this.random(),
      wrote: (name, image) => this.writes.at(-1)?.set(name, image),
    });
  }

  /** Files written by the regions being calculated, innermost last: an included sheet's regions nest. */
  private writes: Map<string, Pixels>[] = [];

  beginWrites(): void {
    this.writes.push(new Map());
  }

  takeWrites(): Written[] {
    return [...(this.writes.pop() ?? new Map<string, Pixels>())].map(([name, image]) => ({ name, image }));
  }

  /** The stream random numbers come from, set as each region starts. */
  private random: () => number = stream('');

  /** Starts the random stream for a region, so its numbers are the same every time it calculates. */
  randomFor(key: string): void {
    this.random = stream(key);
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
    if (name === 'CTOL') return num(this.ws.ctol ?? 0.001);
    const c = CONSTANTS[name];
    if (c) return c;
    const b = this.builtins.get(name);
    // µ, the micro sign many keyboards type, is read as μ, the Greek letter Mathcad uses.
    const u = UNITS[name] ?? UNITS[name.replace(/^µ/, 'μ')];
    const unit = u ? num(u.factor, u.dim) : undefined;
    return called ? (b ?? unit) : (unit ?? b);
  }

  /** Element by element (`vec`, under the vectorize arrow) is interpreted; everything else runs compiled. */
  eval(e: Expr, s: Scope, vec = false): Value {
    return vec ? this.evalGeneric(e, s, true) : this.compiler.expr(e)(s);
  }

  get exactCompare(): boolean {
    return this.ws.exactCompare !== false;
  }

  get zeroOverZero(): boolean {
    return this.ws.zeroOverZero === true;
  }

  isSolveForm(name: string): boolean {
    return SOLVE_FORMS.has(name);
  }

  isBuiltinIf(f: Fn): boolean {
    return f.name === 'if' && f === this.builtinIf;
  }

  evalOpValues(op: 'plus' | 'minus' | 'mult', a: Value, b: Value): Value {
    return op === 'plus' ? addV(a, b) : op === 'minus' ? subV(a, b) : mulV(a, b);
  }

  divideValues(a: Value, b: Value): Value {
    return this.divide(a, b, false);
  }

  powerValues(a: Value, b: Value): Value {
    return this.power(a, b, false);
  }

  compareValues(a: Value, b: Value, test: (c: number) => boolean): Value {
    return this.compare(a, b, test);
  }

  /** The interpreter. The compiled closures fall back to it for anything they don't handle. */
  evalGeneric(e: Expr, s: Scope, vec: boolean): Value {
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
    // As measured in Mathcad 14: a range with units must give its second value, so the step can't
    // default to 1 of a base unit, and all three values share one unit, except that a 0 goes with any.
    if (!second) {
      if (!isNoDim(first.dim) || !isNoDim(last.dim)) {
        throw new EvalError('runtime', 'a range with units needs its second value, as in 0s, 0.5s..3s');
      }
      return { t: 'range', first: first.re, step: first.re <= last.re ? 1 : -1, last: last.re, dim: NODIM };
    }
    let unit: Num | null = null;
    for (const v of [second, first, last]) {
      if (v.re === 0 && v.im === 0) continue;
      if (!unit) unit = v;
      else if (!dimEq(unit.dim, v.dim)) throw new EvalError('runtime', 'units do not match: every value in a range needs the same unit, though a 0 can go without');
    }
    return { t: 'range', first: first.re, step: second.re - first.re, last: last.re, dim: unit?.dim ?? second.dim };
  }

  evalOp(op: string, args: Expr[], s: Scope, vec: boolean): Value {
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
      case 'vectorSum':
        // Mathcad 14 refuses a single number here, which also catches Σ of a range variable.
        if (a.t !== 'mat') throw new EvalError('runtime', 'Σ with nothing under it adds up a vector. To add up over a range variable, put it under the Σ: type $');
        return sumV(a);
      case 'crossProduct': return cross(requireMat(a), requireMat(b!));
      // The first index is b, already worked out: working it out again would draw rnd twice.
      case 'indexer': return this.index(a, [b!, ...args.slice(2).map((i) => this.eval(i, s, vec))]);
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
    return this.ws.zeroOverZero ? divZeroE(a, b) : divE(a, b);
  }

  private compare(a: Value, b: Value, test: (c: number) => boolean): Value {
    return zip(a, b, (x, y) => {
      if (x.t === 'str' || y.t === 'str') {
        const [p, q] = [x.t === 'str' ? x.v : '', y.t === 'str' ? y.v : ''];
        return bool(test(p < q ? -1 : p > q ? 1 : 0));
      }
      const [p, q] = [requireNum(x), requireNum(y)];
      return bool(test(this.ws.exactCompare === false ? compareClose(p, q) : compareReal(p, q)));
    });
  }

  position(v: Value): number {
    const x = requireReal(v, 'index');
    return Math.trunc(x + 1e-9 * Math.sign(x)) - this.ws.origin;
  }

  index(base: Value, idx: Value[]): Value {
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

  /** index() for one or two indices, without building an array of them: the compiled indexer's path. */
  indexAt(base: Value, a: Value, b: Value | undefined): Value {
    if (a.t === 'mat' || base.t !== 'mat') return this.index(base, b ? [a, b] : [a]);
    const i = this.position(a);
    const j = b ? this.position(b) : 0;
    if (!b && base.cols > 1 && base.rows === 1) {
      if (i < 0 || i >= base.cols) throw new EvalError('runtime', 'index out of bounds');
      return getEl(base, 0, i);
    }
    if (!b && base.cols > 1) throw new EvalError('runtime', 'matrix needs two indices');
    if (i < 0 || j < 0 || i >= base.rows || j >= base.cols) throw new EvalError('runtime', 'index out of bounds');
    return getEl(base, i, j);
  }

  /**
   * `name[i, j] := v` at positions already worked out, as assign() does. A real number into a real matrix
   * this scope already owns, inside its size and in its units, is written in place.
   */
  setAt(name: string, store: Scope, i: number, j: number, v: Value): void {
    if (i < 0 || j < 0) throw new EvalError('runtime', 'index out of bounds');
    const old = store.lookup(name);
    if (old?.t === 'mat' && old.owner === store && !old.cells && !old.im && i < old.rows && j < old.cols
      && v.t === 'num' && v.im === 0 && dimEq(v.dim, old.dim)) {
      old.re[i + j * old.rows] = v.re;
      old.version = (old.version ?? 0) + 1;
      return;
    }
    this.ownedMatrix(name, store, i + 1, j + 1, (m) => setEl(m, i, j, v));
  }

  private column(m: Mat, b: Value): Mat {
    const j = this.position(b);
    if (j < 0 || j >= m.cols) throw new EvalError('runtime', 'column out of bounds');
    // A function called many times often takes the same columns each time, as in linterp(D⟨0⟩, D⟨1⟩, x).
    // Copying them once per matrix, not once per call, keeps that from costing a copy of the table per call.
    let cached = COLUMNS.get(m);
    if (!cached || cached.version !== (m.version ?? 0)) COLUMNS.set(m, (cached = { version: m.version ?? 0, cols: new Map() }));
    const hit = cached.cols.get(j);
    if (hit) return hit;
    const out = this.copyColumn(m, j);
    cached.cols.set(j, out);
    return out;
  }

  private copyColumn(m: Mat, j: number): Mat {
    // Real numbers only: copy the column's numbers, which are stored together.
    if (!m.cells && !m.im) {
      const out = newMat(m.rows, 1, m.dim);
      out.re.set(m.re.subarray(j * m.rows, (j + 1) * m.rows));
      return out;
    }
    // Entries with units of their own: the column takes its unit from them, not from the whole matrix, so a
    // column of volts beside one of seconds comes out in volts even when it starts at 0.
    const out = newMat(m.rows, 1, m.cells ? NODIM : m.dim);
    for (let i = 0; i < m.rows; i++) setEl(out, i, 0, getEl(m, i, j));
    return out;
  }

  private evalCall(fn: Expr, args: Expr[], s: Scope, vec: boolean): Value {
    if (fn.k === 'id' && SOLVE_FORMS.has(fn.name) && !s.lookup(fn.name)) return this.solveForm(fn.name, args, s);
    const callee = this.callee(fn, s);
    if (callee.name === 'if' && callee === this.builtinIf) return this.evalIf(args, s, vec);
    const values = args.map((a) => this.eval(a, s, vec));
    if (vec && values.some((v) => v.t === 'mat')) return this.mapCall(callee, values);
    return callee.call(values);
  }

  private builtinIf: Fn = { t: 'fn', name: 'if', call: () => num(0) };

  // ── Solve blocks and root ───────────────────────────────────────────────────────────────────────

  /** root, Find, Minerr, Maximize, Minimize and Odesolve, which take names, not values, for their variables. */
  solveForm(name: string, args: Expr[], s: Scope): Value {
    if (name === 'root') return this.root(args, s);
    const ctx = this.solveContext;
    if (name === 'Find' || name === 'Minerr') {
      if (!ctx?.constraints) throw new EvalError('runtime', `${name} ends a solve block: type Given above the constraints, then ${name} below them`);
      return this.find(name, args, ctx.constraints, s);
    }
    if (name === 'Maximize' || name === 'Minimize') return this.optimum(name, args, ctx?.constraints ?? null, s);
    if (!ctx?.constraints) throw new EvalError('runtime', 'Odesolve ends a solve block: type Given above the differential equation and its starting values, then Odesolve below them');
    return this.odesolve(args, ctx, s);
  }

  /**
   * Odesolve(t, b[, steps]), or Odesolve((y; z), t, b[, steps]) for a system: the unknown functions from the
   * block's differential equations and their starting values, solved from the starting point to b. Each
   * comes back as a function of t, interpolated between the solution's points.
   */
  private odesolve(args: Expr[], ctx: SolveContext, s: Scope): Value {
    const vector = args[0]?.k === 'matrix';
    const rest = vector ? args.slice(1) : args;
    const [tv, bv, sv] = rest;
    if (tv?.k !== 'id' || !bv || rest.length > 3) throw new EvalError('runtime', 'Odesolve takes the variable and the end, as Odesolve(t, 10), and optionally a number of steps');
    const t = tv.name;
    const b = requireNum(this.eval(bv, s), "Odesolve's end");
    const steps = sv ? requireReal(this.eval(sv, s), "Odesolve's number of steps") : 1000;
    if (!Number.isInteger(steps) || steps < 1) throw new EvalError('runtime', "Odesolve's number of steps must be a positive whole number");
    const primes = (n: string): number => /'*$/.exec(n)![0].length;
    const base = (n: string): string => n.slice(0, n.length - primes(n));
    // A derivative d/dt of an unknown is the same as a prime: d/dt y(t) is y'(t).
    const rewrite = (e: Expr): Expr => {
      switch (e.k) {
        case 'derivative': {
          const body = rewrite(e.body);
          if (e.varName === t && body.k === 'call' && body.fn.k === 'id') return { ...body, fn: { k: 'id', name: `${body.fn.name}'` } };
          return { ...e, body };
        }
        case 'op': return { ...e, args: e.args.map(rewrite) };
        case 'call': return { ...e, fn: rewrite(e.fn), args: e.args.map(rewrite) };
        case 'matrix': return { ...e, items: e.items.map(rewrite) };
        default: return e;
      }
    };
    const constraints = ctx.constraints!.map(rewrite);
    const callsIn = (e: Expr, out: { name: string; arg: Expr }[] = []): { name: string; arg: Expr }[] => {
      if (e.k === 'call' && e.fn.k === 'id' && e.args.length === 1) out.push({ name: e.fn.name, arg: e.args[0]! });
      if (e.k === 'op') e.args.forEach((a) => callsIn(a, out));
      if (e.k === 'call') e.args.forEach((a) => callsIn(a, out));
      return out;
    };
    const mentions = (e: Expr, name: string): boolean => JSON.stringify(e).includes(`{"k":"id","name":${JSON.stringify(name)}}`);
    // The unknowns: named in a vector, or the function being defined, or the one function the equations call with t.
    let unknowns: string[];
    if (vector) {
      unknowns = (args[0] as Extract<Expr, { k: 'matrix' }>).items.map((x) => {
        if (x.k !== 'id') throw new EvalError('runtime', "Odesolve's unknowns must be names, as Odesolve((y; z), t, 10)");
        return x.name;
      });
    } else if (ctx.target?.k === 'var') unknowns = [ctx.target.name];
    else {
      const found = new Set(constraints.flatMap((c) => callsIn(c).filter((x) => mentions(x.arg, t)).map((x) => base(x.name))));
      if (found.size !== 1) throw new EvalError('runtime', 'Odesolve needs to know which function to solve for: define it, as y := Odesolve(t, 10)');
      unknowns = [...found];
    }
    const known = new Set(unknowns);
    const equations: Expr[] = [];
    const conditions: { u: string; order: number; at: Num; value: Num }[] = [];
    for (const c of constraints) {
      if (c.k !== 'op' || c.op !== 'equal') throw new EvalError('runtime', "Odesolve's block holds equations: the differential equations and the starting values, with =");
      const calls = callsIn(c).filter((x) => known.has(base(x.name)));
      if (calls.some((x) => mentions(x.arg, t))) {
        equations.push(c);
        continue;
      }
      // A starting value: y(0) = 1, y'(0) = 0, one call on one side and a value on the other.
      const [l, r] = c.args as [Expr, Expr];
      const side = l.k === 'call' && l.fn.k === 'id' && known.has(base(l.fn.name)) ? { call: l, value: r } : r.k === 'call' && r.fn.k === 'id' && known.has(base(r.fn.name)) ? { call: r, value: l } : null;
      if (!side || side.call.k !== 'call' || side.call.fn.k !== 'id' || side.call.args.length !== 1) {
        throw new EvalError('runtime', "An Odesolve condition must give one value, as y(0) = 1 or y'(0) = 0");
      }
      const name = side.call.fn.name;
      conditions.push({ u: base(name), order: primes(name), at: requireNum(this.eval(side.call.args[0]!, s), 'a starting point'), value: requireNum(this.eval(side.value, s), 'a starting value') });
    }
    if (equations.length !== unknowns.length) {
      throw new EvalError('runtime', `Odesolve needs ${unknowns.length === 1 ? 'one differential equation' : `${unknowns.length} differential equations`}, one for each unknown function, not ${equations.length}`);
    }
    // Each unknown's order: the most primes it has in the equations.
    const order = new Map(unknowns.map((u) => [u, 0]));
    for (const e of equations) for (const x of callsIn(e)) if (known.has(base(x.name))) order.set(base(x.name), Math.max(order.get(base(x.name))!, primes(x.name)));
    for (const [u, m] of order) if (m === 0) throw new EvalError('runtime', `Odesolve's equations must have a derivative of ${u}, as ${u}'(${t})`);
    const points = new Set(conditions.map((c) => c.at.re));
    if (points.size > 1) throw new EvalError('unsupported', 'Odesolve with conditions at two points (a boundary value problem) isn\'t supported yet: give every starting value at one point');
    const a = conditions[0]?.at ?? null;
    if (!a) throw new EvalError('runtime', `Odesolve needs starting values, as ${unknowns[0]}(0) = 1`);
    if (a.re === b.re) throw new EvalError('runtime', "Odesolve's end must differ from the starting point");
    const tDim = a.re !== 0 ? a.dim : b.dim;
    // The state: for each unknown y of order m, y, y′, … y⁽ᵐ⁻¹⁾, from its starting values.
    const slots: { u: string; k: number }[] = unknowns.flatMap((u) => Array.from({ length: order.get(u)! }, (_, k) => ({ u, k })));
    const y0 = new Float64Array(slots.length);
    const unitOf = new Map<string, Dim>();
    slots.forEach((slot, i) => {
      const given = conditions.filter((c) => c.u === slot.u && c.order === slot.k);
      if (given.length !== 1) throw new EvalError('runtime', `Odesolve needs exactly one starting value for ${slot.u}${"'".repeat(slot.k)}, at ${t} = ${a.re}`);
      y0[i] = given[0]!.value.re;
      if (!unitOf.has(slot.u) && !(given[0]!.value.re === 0 && isNoDim(given[0]!.value.dim))) unitOf.set(slot.u, dimMul(given[0]!.value.dim, dimPow(tDim, slot.k)));
    });
    for (const c of conditions) if (c.order >= order.get(c.u)!) throw new EvalError('runtime', `Odesolve's starting value for ${c.u}${"'".repeat(c.order)} is one too many: the equation's highest derivative of ${c.u} is order ${order.get(c.u)}`);
    const dimFor = (u: string, k: number): Dim => dimDiv(unitOf.get(u) ?? NODIM, dimPow(tDim, k));
    // The highest derivatives, found where the equations hold, by Newton's method from the last ones found.
    let z = new Float64Array(unknowns.length);
    const residual = (time: number, y: Float64Array, zz: Float64Array): Float64Array => {
      const frame = new Scope(s);
      frame.set(t, num(time, tDim));
      slots.forEach((slot, i) => {
        const value = num(y[i]!, dimFor(slot.u, slot.k));
        frame.set(`${slot.u}${"'".repeat(slot.k)}`, { t: 'fn', name: slot.u, arity: 1, call: () => value });
      });
      unknowns.forEach((u, j) => {
        const value = num(zz[j]!, dimFor(u, order.get(u)!));
        frame.set(`${u}${"'".repeat(order.get(u)!)}`, { t: 'fn', name: u, arity: 1, call: () => value });
      });
      return Float64Array.from(equations, (e) => {
        if (e.k !== 'op') return 0;
        const l = requireNum(this.eval(e.args[0]!, frame), 'a side of the differential equation');
        const r = requireNum(this.eval(e.args[1]!, frame), 'a side of the differential equation');
        return l.re - r.re;
      });
    };
    const highest = (time: number, y: Float64Array): Float64Array => {
      let zz = z.slice();
      for (let iter = 0; iter < 30; iter++) {
        const r = residual(time, y, zz);
        const J = Array.from({ length: zz.length }, () => new Array<number>(zz.length).fill(0));
        for (let j = 0; j < zz.length; j++) {
          const h = 1e-7 * Math.max(1, Math.abs(zz[j]!));
          const up = zz.slice();
          up[j] = zz[j]! + h;
          const ru = residual(time, y, up);
          for (let i = 0; i < zz.length; i++) J[i]![j] = (ru[i]! - r[i]!) / h;
        }
        const step = solveSmall(J, Array.from(r, (v) => -v));
        if (!step) throw new EvalError('runtime', `Odesolve can't find the highest derivative${unknowns.length > 1 ? 's' : ''} from the equation${unknowns.length > 1 ? 's' : ''}: each must appear in them`);
        zz = zz.map((v, j) => v + step[j]!);
        if (step.every((d, j) => Math.abs(d) <= 1e-13 * Math.max(1, Math.abs(zz[j]!)))) break;
      }
      z = zz;
      return zz;
    };
    const f = (time: number, y: Float64Array): Float64Array => {
      const zz = highest(time, y);
      const out = new Float64Array(slots.length);
      slots.forEach((slot, i) => {
        const m = order.get(slot.u)!;
        out[i] = slot.k + 1 < m ? y[i + 1]! : zz[unknowns.indexOf(slot.u)]!;
      });
      return out;
    };
    const grid = odeGrid(f, a.re, b.re, y0, steps, 'Odesolve');
    const lo = Math.min(a.re, b.re);
    const hi = Math.max(a.re, b.re);
    const solved = unknowns.map((u): Fn => {
      const i = slots.findIndex((slot) => slot.u === u && slot.k === 0);
      const dim = dimFor(u, 0);
      return {
        t: 'fn', name: u, arity: 1,
        call: ([arg]) => {
          const at = requireReal(arg!, `${u}'s argument`);
          if (at < lo - 1e-12 * (hi - lo) || at > hi + 1e-12 * (hi - lo)) throw new EvalError('runtime', `${u} was solved from ${a.re} to ${b.re} only`);
          return num(hermite(grid.xs, grid.ys.map((v) => v[i]!), grid.dys.map((v) => v[i]!), at), dim);
        },
      };
    });
    if (solved.length === 1) return solved[0]!;
    return { t: 'mat', rows: solved.length, cols: 1, re: new Float64Array(solved.length), im: null, dim: NODIM, cells: solved };
  }

  /** The variables a solver is given, by name, and their values above, the guesses. */
  private guesses(fn: string, args: Expr[], s: Scope): { names: string[]; x0: Float64Array; dims: Dim[] } {
    if (args.length === 0) throw new EvalError('runtime', `${fn} needs the variables to solve for, as ${fn}(x, y)`);
    const names = args.map((a) => {
      if (a.k !== 'id') throw new EvalError('runtime', `${fn}'s variables must be names, as ${fn}(x, y)`);
      return a.name;
    });
    const values = names.map((n) => {
      const v = s.lookup(n);
      if (!v) throw new EvalError('runtime', `${fn} needs a guess for ${n}: define ${n} above, before Given`);
      if (v.t !== 'num') throw new EvalError('unsupported', `${fn} solves for numbers: ${n} must be a number, not ${v.t === 'mat' ? 'an array' : 'that'}`);
      if (v.im !== 0) throw new EvalError('unsupported', `${fn} solves for real numbers: ${n}'s guess is complex`);
      return v;
    });
    return { names, x0: Float64Array.from(values, (v) => v.re), dims: values.map((v) => v.dim) };
  }

  /** A scope where the variables have trial values. */
  private trial(names: string[], dims: Dim[], x: ArrayLike<number>, s: Scope): Scope {
    const frame = new Scope(s);
    names.forEach((n, j) => frame.set(n, num(x[j]!, dims[j]!)));
    return frame;
  }

  /** Each constraint as residuals that vanish when it holds: a − b for =, and how far off for <, >, ≤, ≥. */
  private residuals(constraints: Expr[], scope: Scope): number[] {
    const out: number[] = [];
    for (const c of constraints) {
      if (c.k !== 'op') continue;
      const a = requireNum(this.eval(c.args[0]!, scope), 'a side of a constraint');
      const b = requireNum(this.eval(c.args[1]!, scope), 'a side of a constraint');
      if (!dimEq(a.dim, b.dim) && !(a.re === 0 && a.im === 0) && !(b.re === 0 && b.im === 0)) {
        throw new EvalError('runtime', 'units do not match: the two sides of a constraint need the same units');
      }
      const d = a.re - b.re;
      if (c.op === 'equal') {
        out.push(d);
        if (a.im !== 0 || b.im !== 0) out.push(a.im - b.im);
      } else if (c.op === 'lessThan' || c.op === 'lessOrEqual') out.push(Math.max(0, d));
      else out.push(Math.max(0, -d));
    }
    return out;
  }

  /** The answer: one variable alone, several as a vector, each in its own units. */
  private answer(x: ArrayLike<number>, dims: Dim[]): Value {
    if (x.length === 1) return num(x[0]!, dims[0]!);
    if (dims.every((d) => dimEq(d, dims[0]!))) {
      const m = newMat(x.length, 1, dims[0]!);
      m.re.set(Array.from(x));
      return m;
    }
    const cells = Array.from(x, (v, j) => num(v, dims[j]!));
    return { t: 'mat', rows: x.length, cols: 1, re: Float64Array.from(x), im: null, dim: dims[0]!, cells };
  }

  private find(fn: string, args: Expr[], constraints: Expr[], s: Scope): Value {
    if (constraints.length === 0) throw new EvalError('runtime', `${fn}'s solve block has no constraints: put equations, such as x + y = 3, between Given and ${fn}`);
    const { names, x0, dims } = this.guesses(fn, args, s);
    const res = (x: Float64Array): Float64Array => Float64Array.from(this.residuals(constraints, this.trial(names, dims, x, s)));
    const ctol = this.ws.ctol ?? 0.001;
    const holds = (r: Float64Array): boolean => r.every((v) => Math.abs(v) <= ctol);
    // Each inequality becomes an equation with a slack variable: a < b is a − b + z² = 0. A one-sided penalty
    // would stall where an equation's residual is flat (from u = −1, u > 0 and u² = 4 stop at u = 0).
    const sides = constraints.map((c) => (c.k !== 'op' || c.op === 'equal' ? 0 : c.op === 'lessThan' || c.op === 'lessOrEqual' ? 1 : -1));
    const n = x0.length;
    const gap = (c: Expr, scope: Scope): number => {
      if (c.k !== 'op') return 0;
      const a = requireNum(this.eval(c.args[0]!, scope), 'a side of a constraint');
      const b = requireNum(this.eval(c.args[1]!, scope), 'a side of a constraint');
      return a.re - b.re;
    };
    // A guess on the wrong side of an inequality is first moved just inside all of them: from there the slack
    // form can reach a solution on the right side, rather than one beyond the wrong side's equations.
    let x1 = x0;
    const unmet = (p: Float64Array): Float64Array => {
      const scope = this.trial(names, dims, p, s);
      return Float64Array.from(constraints.flatMap((c, i) => {
        if (!sides[i]) return [];
        const d = gap(c, scope);
        const margin = 1e-3 * Math.max(1, Math.abs(d));
        return [Math.max(0, sides[i] === 1 ? d + margin : -d + margin)];
      }));
    };
    if (unmet(x0).some((v) => v > 0)) x1 = leastSquares(unmet, x0).x;
    const start = this.trial(names, dims, x1, s);
    // A slack starts where it makes a met inequality hold exactly.
    const z0 = constraints.flatMap((c, i) => (sides[i] ? [Math.sqrt(Math.max(Math.abs(gap(c, start)), 1e-12))] : []));
    const augmented = (p: Float64Array): Float64Array => {
      const scope = this.trial(names, dims, p, s);
      const out: number[] = [];
      let k = n;
      constraints.forEach((c, i) => {
        if (!sides[i]) out.push(...this.residuals([c], scope));
        else {
          out.push(gap(c, scope) + sides[i]! * p[k]! ** 2);
          k++;
        }
      });
      return Float64Array.from(out);
    };
    const fit = leastSquares(augmented, Float64Array.from([...x1, ...z0]));
    const x = fit.x.slice(0, n);
    const r = res(x);
    if (fn === 'Find' && !holds(r)) {
      throw new EvalError('runtime', 'No solution was found. Try other guess values, or check that the constraints can all hold (CTOL sets how nearly they must)');
    }
    return this.answer(x, dims);
  }

  private optimum(fn: string, args: Expr[], constraints: Expr[] | null, s: Scope): Value {
    const [first, ...vars] = args;
    const f = first ? this.eval(first, s) : undefined;
    if (f?.t !== 'fn') throw new EvalError('runtime', `${fn}'s first argument is the function, as ${fn}(f, x)`);
    const { names, x0, dims } = this.guesses(fn, vars, s);
    const sign = fn === 'Maximize' ? -1 : 1;
    const value = (x: Float64Array): number => {
      const v = requireNum(f.call(Array.from(x, (xi, j) => num(xi, dims[j]!))), `${fn}'s function value`);
      if (v.im !== 0) throw new EvalError('runtime', `${fn}'s function must give a real number`);
      return sign * v.re;
    };
    const res = (x: Float64Array): Float64Array => Float64Array.from(this.residuals(constraints ?? [], this.trial(names, dims, x, s)));
    const ctol = this.ws.ctol ?? 0.001;
    const x = constraints && constraints.length > 0 ? minimizeWithin(value, res, x0, ctol) : minimize(value, x0);
    if (!x) throw new EvalError('runtime', `No ${fn === 'Maximize' ? 'maximum' : 'minimum'} was found: the function keeps ${fn === 'Maximize' ? 'rising' : 'falling'} without bound`);
    if (constraints && constraints.length > 0 && !res(x).every((v) => Math.abs(v) <= ctol)) {
      throw new EvalError('runtime', `No ${fn === 'Maximize' ? 'maximum' : 'minimum'} was found that meets the constraints. Try other guess values`);
    }
    return this.answer(x, dims);
  }

  /** root(f(x), x) from x's value as a guess, or root(f(x), x, a, b) between a and b, where f changes sign. */
  private root(args: Expr[], s: Scope): Value {
    const [body, v, lo, hi] = args;
    if (!body || v?.k !== 'id') throw new EvalError('runtime', 'root takes an expression and its variable, as root(x^2 − 2, x), and optionally a and b to search between');
    if (args.length === 3 || args.length > 4) throw new EvalError('runtime', 'root takes a guess from its variable, or both a and b to search between');
    const name = v.name;
    let dim: Dim = NODIM;
    const f = (x: number): number => {
      const y = requireNum(this.eval(body, this.bindAt(name, num(x, dim), s)), "root's expression");
      if (y.im !== 0) throw new EvalError('unsupported', "root finds real roots: the expression became complex");
      return y.re;
    };
    if (lo && hi) {
      const a = requireNum(this.eval(lo, s), "root's a");
      const b = requireNum(this.eval(hi, s), "root's b");
      dim = a.re !== 0 ? a.dim : b.dim;
      const [fa, fb] = [f(a.re), f(b.re)];
      if (Math.sign(fa) === Math.sign(fb) && fa !== 0) throw new EvalError('runtime', "root's expression must have opposite signs at a and b, so a root lies between them");
      return num(brent(f, a.re, b.re), dim);
    }
    const guess = s.lookup(name);
    if (!guess) throw new EvalError('runtime', `root needs a guess: define ${name} above, or give a and b to search between`);
    if (guess.t !== 'num' || guess.im !== 0) throw new EvalError('unsupported', `root finds real roots from a real guess: ${name} must be a real number`);
    dim = guess.dim;
    const x = secant(f, guess.re);
    if (x === null || !(Math.abs(f(x)) <= this.ws.tol)) throw new EvalError('runtime', 'root found no root near the guess. Try another guess, or give a and b to search between');
    return num(x, dim);
  }

  callee(fn: Expr, s: Scope): Fn {
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
    if (!e.lo || !e.hi) {
      if (e.op === 'integral') throw new EvalError('unsupported', 'an indefinite integral needs symbolic evaluation');
      return this.rangeSum(e, s);
    }
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
      // Sampling the integrand finds any table it interpolates at the integration variable. Splitting at
      // the table's points leaves smooth pieces, which converge at once; a corner inside a piece would
      // otherwise be halved down to the tolerance.
      const outer = this.corners;
      const probe = { at: NaN, tables: new Set<Float64Array>() };
      this.corners = probe;
      let coarse: number;
      try {
        coarse = gaussKronrod((x) => {
          probe.at = x;
          return f(x);
        }, lo.re, hi.re).value;
      } finally {
        this.corners = outer;
      }
      const tol = Math.max(Math.abs(coarse) * 1e-10, 1e-300);
      const [a, b] = lo.re <= hi.re ? [lo.re, hi.re] : [hi.re, lo.re];
      const cuts = new Set<number>();
      for (const xs of probe.tables) for (const x of xs) if (x > a && x < b) cuts.add(x);
      if (cuts.size === 0 || cuts.size > 5000) return num(adaptive(f, lo.re, hi.re, tol), dimMul(dim, xDim));
      const points = [a, ...[...cuts].sort((p, q) => p - q), b];
      let total = 0;
      for (let i = 0; i + 1 < points.length; i++) {
        const [p, q] = [points[i]!, points[i + 1]!];
        // Each piece lies between a table's points, so it's smooth and short: the 7-point rule is enough,
        // and still subdivides when its error estimate says so.
        total += adaptive(f, p, q, (tol * (q - p)) / (b - a), 0, gaussKronrod7);
      }
      return num(lo.re <= hi.re ? total : -total, dimMul(dim, xDim));
    }
    // As measured in Mathcad 14: the limits are whole numbers without units, and reversed limits count
    // down. A limit of ∞ (10^307) is an error there too, rather than a sum that never ends.
    const what = e.op === 'summation' ? 'sum' : 'product';
    for (const b of [lo, hi]) {
      if (!isNoDim(b.dim) || b.im !== 0) throw new EvalError('runtime', `the limits of a ${what} must be plain whole numbers, without units`);
      if (Math.abs(b.re) >= 1e300) throw new EvalError('runtime', `a ${what} to ∞ can't be worked out term by term. Use → (Ctrl+.) for an exact answer`);
      if (Math.abs(b.re - Math.round(b.re)) > 1e-9 * Math.max(1, Math.abs(b.re))) throw new EvalError('runtime', `the limits of a ${what} must be whole numbers`);
    }
    const [a, z] = [Math.round(lo.re), Math.round(hi.re)];
    const step = a <= z ? 1 : -1;
    let total: Value | null = null;
    for (let i = a; step > 0 ? i <= z : i >= z; i += step) total = this.accumulate(e, total, this.eval(e.body, this.bindAt(e.varName, num(i), s)));
    return total!;
  }

  /** A range sum or product: Σ over every value of a range variable, written with no limits. */
  private rangeSum(e: Extract<Expr, { k: 'bigop' }>, s: Scope): Value {
    const r = s.lookup(e.varName);
    if (!r) throw new EvalError('undefined', e.varName);
    if (r.t !== 'range') throw new EvalError('runtime', `${e.varName} must be a range variable, as in ${e.varName} := 0..10, for a sum or product with no limits`);
    let total: Value | null = null;
    for (const x of this.iterate(r)) total = this.accumulate(e, total, this.eval(e.body, this.bindAt(e.varName, x as Num, s)));
    return total!;
  }

  private accumulate(e: Extract<Expr, { k: 'bigop' }>, total: Value | null, y: Value): Value {
    return !total ? y : e.op === 'summation' ? addV(total, y) : mulE(total, y);
  }

  /** Five-point central difference at the variable's current value. */
  private evalDerivative(e: Extract<Expr, { k: 'derivative' }>, s: Scope): Value {
    // At a range or vector of points, the derivative at each one, as a vector.
    const point = this.eval({ k: 'id', name: e.varName }, s);
    if (point.t === 'range' || (point.t === 'mat' && point.rows * point.cols > 1)) {
      const values = [...this.iterate(point)].map((v) => this.derivativeAt(e, requireNum(v, 'derivative point'), s));
      return fromValues(values.length, 1, values);
    }
    return this.derivativeAt(e, requireNum(point, 'derivative point'), s);
  }

  private derivativeAt(e: Extract<Expr, { k: 'derivative' }>, at: Num, s: Scope): Value {
    const h = Math.max(Math.abs(at.re), 1e-3) * 1e-3;
    const f = (x: number): Num => requireNum(this.eval(e.body, this.bindAt(e.varName, num(x, at.dim), s)));
    const parts = [f(at.re - 2 * h), f(at.re - h), f(at.re + h), f(at.re + 2 * h)];
    const v = (parts[0]!.re - 8 * parts[1]!.re + 8 * parts[2]!.re - parts[3]!.re) / (12 * h);
    return num(v, parts[0]!.dim.map((d, i) => d - at.dim[i]!));
  }

  private closure(name: string, params: string[], body: Expr, scope: Scope): Fn {
    // A function defined from a solve block, as f(a) := Find(x), keeps its block, whose constraints may use
    // its parameters, for when it's called later.
    const block = this.solveContext;
    return {
      t: 'fn',
      name,
      arity: params.length,
      call: (args) => {
        if (!block) return this.callClosure(name, params, body, scope, args);
        const outer = this.solveContext;
        this.solveContext = block;
        try {
          return this.callClosure(name, params, body, scope, args);
        } finally {
          this.solveContext = outer;
        }
      },
    };
  }

  private callClosure(name: string, params: string[], body: Expr, scope: Scope, args: Value[]): Value {
    // Given fewer arguments, as in Mathcad, the result is a function of the rest.
    if (args.length > 0 && args.length < params.length) {
      const frame = new Scope(scope);
      params.slice(0, args.length).forEach((p, i) => frame.set(p, args[i]!));
      return this.closure(name, params.slice(args.length), body, frame);
    }
    if (args.length !== params.length) throw new EvalError('runtime', `${name} takes ${params.length} arguments`);
    const frame = new Scope(scope);
    params.forEach((p, i) => frame.set(p, args[i]!));
    // A program body runs in the arguments' own frame: it's private to this call, so a second one
    // in between would hold nothing the first doesn't.
    return body.k === 'program' ? this.runProgramIn(body.body, frame) : this.eval(body, frame);
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
      // A private vector grows in place; anything else is copied at its new size.
      if (m.cols === 1 && cols === 1 && rows > m.rows) growColumn(m, rows);
      else if (rows > m.rows || cols > m.cols) m = resized(m, Math.max(rows, m.rows), Math.max(cols, m.cols));
    } else m = newMat(rows, cols);
    m.owner = store;
    edit(m);
    m.version = (m.version ?? 0) + 1;
    store.set(name, m);
  }

  runProgram(body: Stmt[], s: Scope): Value {
    return this.runProgramIn(body, new Scope(s));
  }

  private runProgramIn(body: Stmt[], frame: Scope): Value {
    const state: ProgramState = { value: null, returned: false, ifTaken: false };
    this.compiler.block(body)(frame, state);
    if (!state.value) throw new EvalError('runtime', 'program has no value');
    return state.value;
  }

  *iterate(v: Value): Generator<Value> {
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

/** Where a run picks up: the evaluator, and the scope and definitions as they stood. */
export interface RunStart { ev: Evaluator; scope: Scope; defs: Defs }

/** Keeps a worksheet's state as regions run in order. */
export class Run {
  readonly ev: Evaluator;
  readonly outcomes: Outcome[] = [];
  scope: Scope;
  defs: Defs;
  /** Worksheets being included, innermost last, to stop a sheet that includes itself. */
  private including: string[] = [];

  /** The regions in calculation order, for finding a solver's block. Set by whoever runs them. */
  private ordered: Region[] | null = null;
  private positions = new Map<string, number>();

  constructor(private ws: Worksheet, private files: Files = NO_FILES, start?: RunStart) {
    this.ev = start?.ev ?? new Evaluator(ws, files);
    this.scope = start?.scope ?? Scope.after(null);
    this.defs = start?.defs ?? new Defs();
  }

  /** The regions in the order they're calculated, which a solve block is read in. */
  set order(regions: Region[]) {
    this.ordered = regions;
    this.positions = new Map(regions.map((r, i) => [r.id, i]));
  }

  /**
   * The constraints of the solve block a region closes: those between it and the Given above it, in
   * calculation order. null when there's no Given above, or another solver has closed the block since.
   */
  private blockFor(region: Region): Expr[] | null {
    if (!this.ordered) this.order = inOrder(this.ws, 'align');
    const at = this.positions.get(region.id);
    if (at === undefined) return null;
    for (let j = at - 1; j >= 0; j--) {
      const c = this.ordered![j]!.content;
      if (isGiven(c)) {
        return this.ordered!.slice(j + 1, at).flatMap((r) => (isConstraint(r.content) && r.content.k === 'show' ? [r.content.expr] : []));
      }
      if (closesBlock(c)) return null;
    }
    return null;
  }

  /** The value of a display unit, evaluated where the region stands. */
  unitAt(unit: Expr | null): { unit?: Value } {
    return this.unitOf(unit);
  }

  /**
   * Runs another worksheet's regions here, in its own order, so its definitions hold from here on.
   * Its results aren't shown: they belong to that sheet. Symbolic regions use their saved answers.
   */
  private include(file: string): void {
    if (!file.trim()) throw new EvalError('runtime', 'This reference names no file');
    const key = sheetKey(file);
    if (this.including.includes(key)) throw new EvalError('runtime', `${file} includes itself, through ${this.including.join(', ')}`);
    if (this.including.length >= 16) throw new EvalError('runtime', 'References are nested too deeply');
    const sheet = this.files.sheet(key);
    if (!sheet) throw needsFile(file);
    const shown = this.outcomes.length;
    this.including.push(key);
    // A solve block in the referenced sheet is read in that sheet's order.
    const outerOrder = this.ordered;
    // Problems inside are reported on this reference, where they can be seen, but the rest of the sheet
    // still runs, as in Mathcad. Files it needs, here or in references of its own, are listed together.
    let inner: unknown = null;
    const needs = new Set<string>();
    try {
      const regions = inOrder(sheet, 'align');
      this.order = regions;
      for (const region of regions) {
        const c = region.content;
        if (c.k === 'include') {
          try {
            this.include(c.file);
          } catch (err) {
            if (err instanceof EvalError && err.needs.length > 0) err.needs.forEach((n) => needs.add(n));
            else inner ??= err;
          }
        } else if (c.k === 'sym') this.symbolic(region, c, c.stored ? { result: c.stored } : { result: null, error: 'needs symbolic evaluation' });
        else this.plain(region);
      }
      for (const o of this.outcomes.slice(shown)) for (const n of o.error?.needs ?? []) needs.add(n);
    } finally {
      this.including.pop();
      this.outcomes.length = shown;
      if (outerOrder) this.order = outerOrder;
      else this.ordered = null;
    }
    if (needs.size > 0) {
      const list = [...needs];
      const named = list.length === 1 ? list[0]! : `${list.slice(0, -1).join(', ')} and ${list.at(-1)!}`;
      throw new EvalError('needs-file', `${file} is attached, but it needs ${named} too. Load ${list.length === 1 ? 'it' : 'them'} with Files on the toolbar`, list);
    }
    if (inner) throw inner;
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
    this.ev.beginWrites();
    const shown = this.outcomes.length;
    try {
      this.plainRegion(region);
    } finally {
      const files = this.ev.takeWrites();
      const outcome = this.outcomes[shown];
      if (files.length > 0 && outcome) outcome.files = files;
    }
  }

  private plainRegion(region: Region): void {
    this.ev.randomFor([...this.including, region.id].join('/'));
    const c = region.content;
    if (c.k === 'image') {
      try {
        if (!c.expr) throw new EvalError('runtime', 'Type the matrix to show');
        this.outcomes.push({ region, image: pixels(this.ev.evalRegionExpr(c.expr, this.scope), c.mode, c) });
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
    if (c.k === 'include') {
      try {
        this.include(c.file);
        this.outcomes.push({ region });
      } catch (err) {
        this.outcomes.push({ region, error: toEvalError(err) });
      }
      return;
    }
    if (c.k === 'show' && (isGiven(c) || isConstraint(c))) {
      // Marks the block as read here, so recalculation knows a solver below depends on it.
      this.scope = Scope.after(this.scope);
      this.scope.set(SOLVE_BLOCK, num(0));
    }
    if (c.k === 'other' || c.k === 'draft' || c.k === 'show') {
      this.outcomes.push({ region });
      return;
    }
    if (c.k === 'sym') throw new Error('symbolic regions go through symbolic()');
    // A region that calls a solver sees its block's constraints while it's worked out.
    if (closesBlock(c)) this.ev.solveContext = { constraints: this.blockFor(region), target: c.k === 'define' ? c.target : null };
    try {
      this.plainMath(region, c);
    } finally {
      this.ev.solveContext = null;
    }
  }

  private plainMath(region: Region, c: Extract<Content, { k: 'eval' | 'define' }>): void {
    if (c.k === 'eval') {
      try {
        const value = this.ev.evalRegionExpr(c.expr, this.scope);
        this.outcomes.push({ region, value, ...this.unitOf(c.unit) });
      } catch (err) {
        this.outcomes.push({ region, error: toEvalError(err) });
      }
      return;
    }
    this.defs = this.defs.with(c.target, c.value, this.scope = Scope.after(this.scope));
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
    this.defs = this.defs.with(c.target, value, this.scope = Scope.after(this.scope));
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
/** How many points a function is sampled at along each side of a surface. */
const SURFACE_SAMPLES = 31;

/** The data for a surface or contour plot, from its first y expression. */
function surfaceData(ev: Evaluator, c: Extract<Content, { k: 'plot' }>, scope: Scope): PlotData {
  const e = c.ys[0];
  if (!e) return { traces: [], limits: {} };
  const v = ev.eval(e, scope);
  const real = (x: Value, what: string): number => {
    const n = requireNum(x, what);
    if (n.im !== 0) throw new EvalError('runtime', `${what} must be real`);
    return n.re;
  };
  if (v.t === 'fn') {
    // A function of two variables, sampled over the x and y limits.
    const limit = (x: Expr | null, fallback: number): number => (x ? requireReal(ev.eval(x, scope), 'a limit') : fallback);
    const [x0, x1, y0, y1] = [limit(c.xAxis.min, -5), limit(c.xAxis.max, 5), limit(c.yAxis.min, -5), limit(c.yAxis.max, 5)];
    if (!(x1 > x0) || !(y1 > y0)) throw new EvalError('runtime', 'Each axis needs its upper limit above its lower one');
    const n = SURFACE_SAMPLES;
    const [x, y, z] = [new Float64Array(n * n), new Float64Array(n * n), new Float64Array(n * n)];
    let zDim: Dim = NODIM;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [xi, yj] = [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * j) / (n - 1)];
        const out = requireNum(v.call([num(xi), num(yj)]), 'the function');
        x[i + j * n] = xi;
        y[i + j * n] = yj;
        z[i + j * n] = out.im === 0 ? out.re : NaN;
        zDim = out.dim;
      }
    }
    return { traces: [], limits: {}, surface: { rows: n, cols: n, x, y, z, regular: true, zDim, sampled: true } };
  }
  if (v.t === 'mat' && v.cells && v.rows * v.cols === 3) {
    // Three matrices of the same size: the x, y and z of each grid point, for shapes such as a sphere.
    const [X, Y, Z] = v.cells.map((m) => requireMat(m, 'each of X, Y and Z'));
    if (X!.rows !== Y!.rows || X!.rows !== Z!.rows || X!.cols !== Y!.cols || X!.cols !== Z!.cols) {
      throw new EvalError('runtime', 'X, Y and Z must be matrices of the same size');
    }
    const flat = (m: Mat): Float64Array => Float64Array.from({ length: m.rows * m.cols }, (_, k) => real(getEl(m, k % m.rows, Math.floor(k / m.rows)), 'each value'));
    return { traces: [], limits: {}, surface: { rows: X!.rows, cols: X!.cols, x: flat(X!), y: flat(Y!), z: flat(Z!), regular: false, zDim: Z!.dim, sampled: false } };
  }
  if (v.t === 'mat' && !v.cells) {
    // A matrix of heights: x is the row number, y the column number, counted from ORIGIN.
    if (v.rows < 2 || v.cols < 2) throw new EvalError('runtime', 'A surface needs a matrix with at least two rows and two columns');
    const n = v.rows * v.cols;
    const [x, y] = [new Float64Array(n), new Float64Array(n)];
    for (let k = 0; k < n; k++) {
      x[k] = (k % v.rows) + ev.origin;
      y[k] = Math.floor(k / v.rows) + ev.origin;
    }
    const z = v.im ? Float64Array.from(v.re, (re, k) => (v.im![k] === 0 ? re : NaN)) : Float64Array.from(v.re);
    return { traces: [], limits: {}, surface: { rows: v.rows, cols: v.cols, x, y, z, regular: true, zDim: v.dim, sampled: false } };
  }
  throw new EvalError('runtime', 'A surface needs a matrix of heights, a function of two variables, or three matrices X, Y and Z in a vector');
}

export function plotData(ev: Evaluator, c: Extract<Content, { k: 'plot' }>, scope: Scope): PlotData {
  if (c.view === 'surface' || c.view === 'contour') return surfaceData(ev, c, scope);
  const limits: PlotData['limits'] = {};
  const limitDims: Partial<Record<LimitKey, Dim>> = {};
  const set = (key: LimitKey, e: Expr | null): void => {
    if (!e) return;
    const v = requireNum(ev.eval(e, scope), 'axis limit');
    limits[key] = requireReal(v, 'axis limit');
    if (!isNoDim(v.dim)) limitDims[key] = v.dim;
  };
  set('xmin', c.xAxis.min);
  set('xmax', c.xAxis.max);
  set('ymin', c.yAxis.min);
  set('ymax', c.yAxis.max);
  const xv = c.x ? ev.evalRegionExpr(c.x, scope) : null;
  const xs = xv ? numbers(xv, 'the x axis') : null;
  let yDim: Dim | null | undefined;
  const traces = c.ys.map((y): Trace => {
    try {
      const yv = ev.evalRegionExpr(y, scope);
      const ys = numbers(yv, 'a y value');
      const d = dimOf(yv);
      yDim = yDim === undefined ? d : yDim && dimEq(yDim, d) ? yDim : null;
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
  const unit = (e: Expr | null | undefined): Value | undefined => {
    if (!e) return undefined;
    try {
      return ev.eval(e, scope);
    } catch {
      return undefined;
    }
  };
  return {
    traces,
    limits,
    dims: { x: xv ? dimOf(xv) : NODIM, y: yDim ?? NODIM, limits: limitDims },
    units: { x: unit(c.xAxis.unit), y: unit(c.yAxis.unit) },
  };
}

const dimOf = (v: Value): Dim => (v.t === 'num' || v.t === 'mat' ? v.dim : NODIM);

const isGlobal = (r: Region): boolean => (r.content.k === 'define' || r.content.k === 'sym') && r.content.global;

export function inOrder(ws: Worksheet, order: OrderKey): Region[] {
  const sorted = orderRegions(ws.regions.filter((r) => !r.disabled), order);
  return [...sorted.filter(isGlobal), ...sorted.filter((r) => !isGlobal(r))];
}

/** Numeric evaluation only. Symbolic regions use the answers stored with them. */
export function runWorksheet(ws: Worksheet, order: OrderKey = 'align', files?: Files): Outcome[] {
  const run = new Run(ws, files);
  const regions = inOrder(ws, order);
  run.order = regions;
  for (const region of regions) {
    const c = region.content;
    if (c.k === 'sym') run.symbolic(region, c, c.stored ? { result: c.stored } : { result: null, error: 'needs symbolic evaluation' });
    else run.plain(region);
  }
  return run.outcomes;
}

/** Runs a worksheet with symbolic evaluation. A region can depend on the arrow above it. */
export async function runWithSymbolics(
  ws: Worksheet, solve: SymSolver, order: OrderKey = 'align', files?: Files, starting?: (region: Region) => void,
): Promise<Outcome[]> {
  const run = new Run(ws, files);
  const regions = inOrder(ws, order);
  run.order = regions;
  for (const region of regions) {
    starting?.(region);
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

