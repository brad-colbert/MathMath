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

import type { Content, Expr, Region, Stmt, Target, Worksheet } from '../model/ast.js';
import { Defs } from '../symbolic/defs.js';
import { type Files, NO_FILES, fileKey, sheetKey } from './files.js';
import { makeBuiltins } from './builtins.js';
import { Compiler, type Host, type ProgramState } from './compile.js';
import { brent, leastSquares, minimize, minimizeWithin, multipleShooting, secant } from './solve.js';
import { nthDerivative } from './differentiate.js';
import { type Side, methodOfLines } from './pde.js';
import { odeGrid } from './ode.js';
import { MATHCAD_WRITES, type Pixels, type Written, mathcadWrite, pixels } from './image.js';
import {
  absV, addV, compareClose, compareReal, cross, divE, divZeroE, inverse, magnitude, mapMat, matPow, mulE, mulV, neg, powE, subV, sumV,
  transpose, zip,
} from './ops.js';
import { type Seeded, drawFrom, seeded, stream } from './random.js';
import { type MapRows, builtinMap, isCmpFile, mapFromMatrix, mapMatrix, writeCmp } from './colormaps.js';
import { type Polyhedron, polyhedron } from './polyhedra.js';
import { type FieldData, fieldOf } from './vectorfield.js';
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
  /** On a Smith chart, where x and y are Γ's real and imaginary parts: the value each point was swept over. */
  param?: Float64Array;
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
  /** The colour maps saved in the sheet above a surface or contour plot, by name. */
  maps?: [string, MapRows][];
  /** For a surface plot of a polyhedron's name, as Polyhedron gives, in place of a surface. */
  poly?: Polyhedron;
  /** For a vector field plot: its arrows. */
  field?: FieldData;
}


export interface Outcome {
  region: Region;
  value?: Value;
  plot?: PlotData;
  image?: Pixels;
  /** Image files the region wrote with writeImage, to offer for saving. */
  files?: Written[];
  /** What trace and pause printed, shown under the region. */
  trace?: string[];
  /** The result of a symbolic region. */
  symbolic?: Expr;
  unevaluated?: boolean;
  /** The evaluated unit override, for results shown in a sheet-defined unit. */
  unit?: Value;
  error?: EvalError;
}

/** Lines of trace kept for one region; a trace in a long loop shows these and a count of the rest. */
const TRACE_LINES = 200;

const truthy = (v: Value): boolean => requireNum(v, 'condition').re !== 0;
const bool = (b: boolean): Num => num(b ? 1 : 0);

function rangeCount(r: Range): number {
  if (r.step === 0) throw new EvalError('runtime', 'range step is zero');
  return Math.max(0, Math.floor((r.last - r.first) / r.step + 1e-9) + 1);
}

/** Identifiers used in a tree, and those bound inside it. */
/** A call root(f, x, a, b), the form that searches between a and b: its expression, its variable and its ends. */
function rootBracket(n: Record<string, unknown>): { body: unknown; name: string; ends: unknown[] } | null {
  if (n.k !== 'call') return null;
  const fn = n.fn as Expr;
  const args = n.args as Expr[];
  if (fn.k !== 'id' || fn.name !== 'root' || args.length !== 4 || args[1]!.k !== 'id') return null;
  return { body: args[0], name: args[1]!.name, ends: [args[2], args[3]] };
}

export function collectIds(node: unknown, used: Set<string>, bound: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectIds(n, used, bound);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const n = node as Record<string, unknown>;
  // root(f(x), x, a, b) binds x inside f, as Mathcad 14 does (probed): a range variable x doesn't make it iterate,
  // though a range in a or b still does. The guess form, root(f(x), x), takes x's value as its guess, so x counts.
  const root = rootBracket(n);
  if (root) {
    const inner = new Set<string>();
    collectIds(root.body, inner, bound);
    for (const name of inner) if (name !== root.name) used.add(name);
    collectIds(root.ends, used, bound);
    return;
  }
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
  // Mathcad's marker for a missing value, which IsNaN finds.
  NaN: num(NaN),
};

/** Functions that work on names rather than values, as root, and those that close a solve block. */
export const SOLVE_FORMS = new Set(['Find', 'Minerr', 'Maximize', 'Minimize', 'Odesolve', 'Pdesolve', 'root', 'Jacob', 'until', 'SaveColormap', 'LoadColormap']);

/** until(c, x) with c negative: ends the range definition it stands in, as Mathcad's does. */
class UntilStop {}
const BLOCK_FORMS = ['Find', 'Minerr', 'Maximize', 'Minimize', 'Odesolve', 'Pdesolve'];
const RELATIONS = new Set(['equal', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual']);
/**
 * A name no sheet can write. Given and each constraint set it, and each solver reads it, so recalculation
 * that changes a constraint calculates the solver below it again.
 */
export const SOLVE_BLOCK = '\u0000solve block';
/**
 * The colour maps SaveColormap has added to the sheet so far, as one name in the scope, so recalculation sees a
 * plot or LoadColormap depend on them: a k × 2 array of each map's name and its rows.
 */
export const COLORMAPS = '\u0000colour maps';

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

/** A solver's variable: a number (shape null) or an array, with its guess's elements and their units. */
interface Unknown { name: string; shape: [number, number] | null; dims: Dim[]; complex: boolean; guess: Num[] }
interface Unknowns { list: Unknown[]; x0: Float64Array; complex: boolean }

export class Evaluator implements Host {
  private builtins: Map<string, Fn>;
  /** Set by Run while a region that calls a solver is worked out. */
  solveContext: SolveContext | null = null;
  /** ERR: how far from holding the last Find or Minerr left its constraints, for the region that called it to set. */
  solveError: number | null = null;
  /** Expressions and programs as closures, built once per tree node. */
  private compiler = new Compiler(this);
  /** While an integral samples its integrand: tables interpolated at the integration variable. */
  private corners: { at: number; tables: Set<Float64Array> } | null = null;
  private files: Files;
  constructor(private ws: Pick<Worksheet, 'origin' | 'tol'> & { ctol?: number; exactCompare?: boolean; zeroOverZero?: boolean; seed?: number }, files?: Files) {
    this.files = files ?? NO_FILES;
    this.builtins = makeBuiltins(ws.origin, files, {
      interpolated: (xs, at) => {
        if (this.corners && at === this.corners.at) this.corners.tables.add(xs);
      },
      random: () => this.random(),
      wrote: (file) => this.writes.at(-1)?.set(file.name, file),
      tol: () => this.ws.tol,
      seed: (x) => {
        const before = this.seeded?.seed ?? this.ws.seed ?? 1;
        this.seeded = seeded(x);
        const s = this.seeded;
        this.random = () => drawFrom(s);
        return before;
      },
      trace: (text) => {
        const lines = this.traced.at(-1);
        if (!lines) return;
        if (lines.length < TRACE_LINES) lines.push(text);
        else this.tracedOver[this.tracedOver.length - 1]!++;
      },
    });
  }

  /**
   * After a Seed: the one stream the rest of the sheet draws from, and where it has got to. Null before any Seed,
   * when each region draws from its own (see randomFor). Recalculation compares it to decide what to reuse.
   */
  seeded: Seeded | null = null;

  /** Lines trace and pause printed in the regions being calculated, innermost last, and how many were left out. */
  private traced: string[][] = [];
  private tracedOver: number[] = [];

  beginTrace(): void {
    this.traced.push([]);
    this.tracedOver.push(0);
  }

  takeTrace(): string[] {
    const lines = this.traced.pop() ?? [];
    const over = this.tracedOver.pop() ?? 0;
    return over > 0 ? [...lines, `… and ${over} more`] : lines;
  }

  /** Files written by the regions being calculated, innermost last: an included sheet's regions nest. */
  private writes: Map<string, Written>[] = [];

  beginWrites(): void {
    this.writes.push(new Map());
  }

  takeWrites(): Written[] {
    return [...(this.writes.pop() ?? new Map<string, Written>()).values()];
  }

  /** The stream random numbers come from, set as each region starts. */
  private random: () => number = stream('');

  /**
   * Starts the random stream for a region, so its numbers are the same every time it calculates; after a Seed, the
   * sheet's one stream carries on instead.
   */
  randomFor(key: string): void {
    const s = this.seeded;
    this.random = s ? () => drawFrom(s) : stream(key, this.ws.seed ?? 1);
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

  /** Colour maps saved by the region being calculated, to add to the sheet's after it (see Run.plain). */
  savedMaps: [string, MapRows][] = [];

  /** A colour map's name, as SaveColormap and LoadColormap take it: a string, and nothing that names a folder. */
  private mapName(v: Expr | undefined, s: Scope, fn: string): string {
    const name = v ? this.eval(v, s) : undefined;
    if (name?.t !== 'str' || !name.v.trim()) throw new EvalError('runtime', `${fn}'s first argument is the map's name, a string, as ${fn}("mine"${fn === 'SaveColormap' ? ', M' : ''})`);
    if (/[\\/:]/.test(name.v)) throw new EvalError('runtime', `A colour map's name is just a name, without a folder: MathMath keeps maps in the worksheet`);
    return name.v.trim();
  }

  /**
   * SaveColormap("name", M): adds M to the sheet's colour maps under the name, for the plots below it, and offers it
   * as Mathcad's name.cmp file to save. Gives the number of rows, as Mathcad.
   */
  private saveColormap(args: Expr[], s: Scope): Value {
    if (args.length !== 2) throw new EvalError('runtime', 'SaveColormap takes a name and a matrix: SaveColormap("mine", M), with M n × 3, red, green and blue 0 to 255');
    const name = this.mapName(args[0], s, 'SaveColormap');
    const rows = mapFromMatrix(this.eval(args[1]!, s), 'SaveColormap');
    this.savedMaps = [...this.savedMaps.filter(([n]) => n.toLowerCase() !== name.toLowerCase()), [name, rows]];
    const file = `${name}.cmp`;
    this.writes.at(-1)?.set(file, { name: file, bytes: writeCmp(rows), mime: 'application/octet-stream', about: `A Mathcad colour map of ${rows.length} colours` });
    return num(rows.length);
  }

  /** The sheet's colour maps where it stands, the region's own last. */
  mapsAt(s: Scope): [string, MapRows][] {
    const v = s.lookup(COLORMAPS);
    const saved: [string, MapRows][] = [];
    if (v?.t === 'mat' && v.cells) {
      for (let i = 0; i < v.rows; i++) {
        const name = getEl(v, i, 0);
        const m = getEl(v, i, 1);
        if (name.t === 'str' && m.t === 'mat') saved.push([name.v, Array.from({ length: m.rows }, (_, r) => [0, 1, 2].map((c) => requireReal(getEl(m, r, c))))]);
      }
    }
    const own = new Set(this.savedMaps.map(([n]) => n.toLowerCase()));
    return [...saved.filter(([n]) => !own.has(n.toLowerCase())), ...this.savedMaps];
  }

  /**
   * LoadColormap("name"): a colour map's rows, as an n × 3 matrix: one saved above with SaveColormap, an attached
   * Mathcad name.cmp file, or one of MathMath's own. Names match whatever their case, as Mathcad's do.
   */
  private loadColormap(args: Expr[], s: Scope): Value {
    if (args.length !== 1) throw new EvalError('runtime', 'LoadColormap takes a colour map\'s name: LoadColormap("mine")');
    const name = this.mapName(args[0], s, 'LoadColormap');
    const key = name.toLowerCase();
    const saved = this.mapsAt(s).find(([n]) => n.toLowerCase() === key);
    if (saved) return mapMatrix(saved[1]);
    const file = isCmpFile(name) ? name : `${name}.cmp`;
    const attached = this.files.colormap(fileKey(file));
    if (typeof attached === 'string') throw new EvalError('runtime', `${file}: ${attached}`);
    if (attached) return mapMatrix(attached);
    const builtin = builtinMap(name);
    if (builtin) return mapMatrix(builtin);
    throw needsFile(file);
  }

  /** Range definitions running, which until can end. */
  private ranging = 0;

  /**
   * until(c, x): x while c is 0 or more; when c is negative, the range definition it stands in stops there, keeping
   * the elements it has. As Mathcad 14 (probed): only in a definition over a range variable, x_k := until(c, x),
   * where it may stand inside a larger expression, or inside another until.
   */
  private until(args: Expr[], s: Scope): Value {
    if (args.length !== 2) throw new EvalError('runtime', 'until takes a condition and a value: until(c, x) gives x until c is negative');
    if (this.ranging === 0) {
      throw new EvalError('runtime', 'until works in a definition over a range variable, as x_k := until(c, x): it stops at the first k where c is negative');
    }
    const c = requireReal(this.eval(args[0]!, s), 'until\'s condition');
    if (c < 0) throw new UntilStop();
    return this.eval(args[1]!, s);
  }

  // ── Solve blocks and root ───────────────────────────────────────────────────────────────────────

  /** root, Find, Minerr, Maximize, Minimize and Odesolve, which take names, not values, for their variables. */
  solveForm(name: string, args: Expr[], s: Scope): Value {
    if (name === 'until') return this.until(args, s);
    if (name === 'SaveColormap') return this.saveColormap(args, s);
    if (name === 'LoadColormap') return this.loadColormap(args, s);
    if (name === 'root') return this.root(args, s);
    if (name === 'Jacob') return this.jacob(args, s);
    const ctx = this.solveContext;
    if (name === 'Find' || name === 'Minerr') {
      if (!ctx?.constraints) throw new EvalError('runtime', `${name} ends a solve block: type Given above the constraints, then ${name} below them`);
      return this.find(name, args, ctx.constraints, s);
    }
    if (name === 'Maximize' || name === 'Minimize') return this.optimum(name, args, ctx?.constraints ?? null, s);
    if (name === 'Pdesolve') {
      if (!ctx?.constraints) throw new EvalError('runtime', 'Pdesolve ends a solve block: type Given above the partial differential equations and their initial and boundary conditions, then Pdesolve below them');
      return this.pdesolve(args, ctx.constraints, s);
    }
    if (!ctx?.constraints) throw new EvalError('runtime', 'Odesolve ends a solve block: type Given above the differential equation and its starting values, then Odesolve below them');
    return this.odesolve(args, ctx, s);
  }

  /**
   * Odesolve(t, b[, steps]), or Odesolve((y; z), t, b[, steps]) for a system: the unknown functions from the
   * block's differential equations and their starting values, solved from the starting point to b. Each
   * comes back as a function of t, interpolated between the solution's points.
   */
  /**
   * Pdesolve(u, x, xrange, t, trange, [xpts, tpts]), or Pdesolve((u; v), …) for a system: the block's PDEs,
   * u.t(x, t) = …, written with u(x, t), u.x(x, t) and u.xx(x, t); an initial condition u(x, t1) = …; and a
   * condition at each end the equation's order needs, u(x1, t) = … or u.x(x1, t) = …. Solved by the method of lines
   * as numol does, on 10 × 10 points by default, as Mathcad (probed); each function comes back as u(x, t),
   * interpolated linearly in x and in t between the grid's points, as Mathcad's are.
   */
  private pdesolve(args: Expr[], constraints: Expr[], s: Scope): Value {
    const fn = 'Pdesolve';
    const [uv, xv, xr, tv, tr, xpv, tpv] = args;
    if (!uv || xv?.k !== 'id' || !xr || tv?.k !== 'id' || !tr || args.length > 7) {
      throw new EvalError('runtime', 'Pdesolve takes the function, x, its range, t, its range, and optionally the numbers of points: Pdesolve(u, x, (0; 1), t, (0; 5))');
    }
    const names = uv.k === 'id' ? [uv.name] : uv.k === 'matrix' && uv.items.every((e) => e.k === 'id') ? uv.items.map((e) => (e as { name: string }).name) : null;
    if (!names) throw new EvalError('runtime', "Pdesolve's unknowns must be a function's name, or a vector of names, without their variables");
    const [x, t] = [xv.name, tv.name];
    const pair = (e: Expr, what: string): [number, number] => {
      const v = this.eval(e, s);
      const m = v.t === 'mat' && v.rows * v.cols === 2 ? [0, 1].map((k) => requireReal(getEl(v, v.cols === 1 ? k : 0, v.cols === 1 ? 0 : k), what)) : null;
      if (!m || !(m[1]! > m[0]!)) throw new EvalError('runtime', `Pdesolve's ${what} must be a vector of two values, the first below the second`);
      return m as [number, number];
    };
    const [xa, xb] = pair(xr, 'xrange');
    const [ta, tb] = pair(tr, 'trange');
    const points = (e: Expr | undefined, what: string, min: number): number => {
      if (!e) return 10;
      const n = requireReal(this.eval(e, s), `Pdesolve's ${what}`);
      if (!Number.isInteger(n) || n < min) throw new EvalError('runtime', `Pdesolve's ${what} must be a whole number, ${min} or more`);
      return n;
    };
    const xpts = points(xpv, 'xpts', 6);
    const tpts = points(tpv, 'tpts', 2);
    const isId = (e: Expr | undefined, name: string): boolean => e?.k === 'id' && e.name === name;
    const callOf = (e: Expr): { name: string; args: Expr[] } | null => (e.k === 'call' && e.fn.k === 'id' ? { name: e.fn.name, args: e.args } : null);
    const known = new Set(names.flatMap((u) => [u, `${u}.x`, `${u}.xx`, `${u}.t`]));
    const rates = new Map<string, Expr>();
    const starts = new Map<string, Expr>();
    const ends = new Map<string, { at: 0 | 1; neumann: boolean; value: Expr }[]>(names.map((u) => [u, []]));
    const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    for (const c of constraints) {
      if (c.k !== 'op' || c.op !== 'equal') throw new EvalError('runtime', "Pdesolve's block holds equations, with =: the PDEs and their initial and boundary conditions");
      const [l, r] = c.args as [Expr, Expr];
      const cl = callOf(l);
      const cr = callOf(r);
      const side = cl && known.has(cl.name) && cl.args.length === 2 ? { call: cl, other: r } : cr && known.has(cr.name) && cr.args.length === 2 ? { call: cr, other: l } : null;
      if (!side) throw new EvalError('runtime', `A Pdesolve condition must have one of ${names.join(', ')} on one side, written with its variables, as ${names[0]}(${x}, 0) = … or ${names[0]}.t(${x}, ${t}) = …`);
      const { name, args: [ax, at] } = side.call as { name: string; args: [Expr, Expr] };
      const u = name.replace(/\.(x|xx|t)$/, '');
      if (name.endsWith('.t') && isId(ax, x) && isId(at, t)) {
        if (rates.has(u)) throw new EvalError('runtime', `Pdesolve has two equations for ${u}.t`);
        rates.set(u, side.other);
      } else if (!name.endsWith('.t') && !name.endsWith('.xx') && isId(at, t)) {
        const where = requireReal(this.eval(ax, s), 'a boundary');
        if (!close(where, xa) && !close(where, xb)) throw new EvalError('runtime', `Pdesolve's boundary conditions must be at the ends of xrange, ${xa} or ${xb}, not ${where}`);
        ends.get(u)!.push({ at: close(where, xa) ? 0 : 1, neumann: name.endsWith('.x'), value: side.other });
      } else if (name === u && isId(ax, x) && close(requireReal(this.eval(at, s), 'the initial time'), ta)) {
        starts.set(u, side.other);
      } else {
        throw new EvalError('runtime', `Pdesolve can't use the condition on ${name}: it takes ${u}.t(${x}, ${t}) = …, ${u}(${x}, ${ta}) = …, and ${u}(${xa}, ${t}) = … or ${u}.x(${xb}, ${t}) = …`);
      }
    }
    const usesIn = (e: Expr, name: string): boolean => JSON.stringify(e).includes(`{"k":"id","name":${JSON.stringify(name)}}`);
    const sides = names.map((u) => {
      const rate = rates.get(u);
      if (!rate) throw new EvalError('runtime', `Pdesolve needs an equation for ${u}.t(${x}, ${t})`);
      if (!starts.has(u)) throw new EvalError('runtime', `Pdesolve needs an initial condition for ${u}, as ${u}(${x}, ${ta}) = …`);
      const order = [...rates.values()].some((e) => usesIn(e, `${u}.xx`)) ? 2 : [...rates.values()].some((e) => usesIn(e, `${u}.x`)) ? 1 : 0;
      const given = ends.get(u)!;
      if (given.length !== order) throw new EvalError('runtime', `Pdesolve needs ${order} boundary condition${order === 1 ? '' : 's'} for ${u}, as its equation has ${order === 2 ? 'a second' : order === 1 ? 'a first' : 'no'} derivative in ${x}; it has ${given.length}`);
      if (order === 2 && given[0]!.at === given[1]!.at) throw new EvalError('runtime', `Pdesolve needs a boundary condition for ${u} at each end of xrange`);
      const sideAt = (end: 0 | 1): Side => {
        const g = given.find((b) => b.at === end);
        if (!g) return { kind: 'free' };
        return { kind: 'value', neumann: g.neumann, f: (tt) => requireReal(this.eval(g.value, this.bindAt(t, num(tt), s)), 'a boundary condition') };
      };
      return { left: sideAt(0), right: sideAt(1), neumann: false };
    });
    // The equations see each unknown, and its x derivatives, as the values at the point being worked out.
    const at = (frame: Scope, k: number, u: number[], ux: number[], uxx: number[]): void => {
      const u0 = names[k]!;
      const value = (v: number): Fn => ({ t: 'fn', name: u0, arity: 2, call: () => num(v) });
      frame.set(u0, value(u[k]!));
      frame.set(`${u0}.x`, value(ux[k]!));
      frame.set(`${u0}.xx`, value(uxx[k]!));
    };
    const grids = methodOfLines({
      xa, xb, xpts, ta, tb, tpts, sides, fn,
      rate: (xx, tt, u, ux, uxx) => {
        const frame = new Scope(s);
        frame.set(x, num(xx));
        frame.set(t, num(tt));
        names.forEach((_, k) => at(frame, k, u, ux, uxx));
        return names.map((n) => requireReal(this.eval(rates.get(n)!, frame), `the equation for ${n}.t`));
      },
      start: (xx) => names.map((n) => requireReal(this.eval(starts.get(n)!, this.bindAt(x, num(xx), s)), `the initial condition for ${n}`)),
    });
    const solved = names.map((u, k): Fn => ({
      t: 'fn', name: u, arity: 2,
      call: ([xq, tq]) => {
        const xv2 = requireReal(xq!, `${u}'s ${x}`);
        const tv2 = requireReal(tq!, `${u}'s ${t}`);
        if (xv2 < xa - 1e-12 * Math.abs(xb - xa) || xv2 > xb + 1e-12 * Math.abs(xb - xa) || tv2 < ta - 1e-12 * Math.abs(tb - ta) || tv2 > tb + 1e-12 * Math.abs(tb - ta)) {
          throw new EvalError('runtime', `${u} is solved for ${x} from ${xa} to ${xb} and ${t} from ${ta} to ${tb}`);
        }
        const fx = Math.min(Math.max((xv2 - xa) / (xb - xa), 0), 1) * (xpts - 1);
        const ft = Math.min(Math.max((tv2 - ta) / (tb - ta), 0), 1) * (tpts - 1);
        const i = Math.min(Math.floor(fx), xpts - 2);
        const j = Math.min(Math.floor(ft), tpts - 2);
        const [a, b] = [fx - i, ft - j];
        const g = grids[k]!;
        const v = (ii: number, jj: number) => g[jj * xpts + ii]!;
        return num((1 - a) * (1 - b) * v(i, j) + a * (1 - b) * v(i + 1, j) + (1 - a) * b * v(i, j + 1) + a * b * v(i + 1, j + 1));
      },
    }));
    if (solved.length === 1) return solved[0]!;
    return { t: 'mat', rows: solved.length, cols: 1, re: new Float64Array(solved.length), im: null, dim: NODIM, cells: solved };
  }

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
    // A derivative d/dt of an unknown is the same as a prime: d/dt y(t) is y'(t), and d²/dt² y(t) is y''(t).
    const rewrite = (e: Expr): Expr => {
      switch (e.k) {
        case 'derivative': {
          const body = rewrite(e.body);
          if (e.varName === t && body.k === 'call' && body.fn.k === 'id') {
            const n = e.degree ? this.derivativeOrder(e.degree, s) : 1;
            return { ...body, fn: { k: 'id', name: `${body.fn.name}${"'".repeat(n)}` } };
          }
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
    if (conditions.length === 0) throw new EvalError('runtime', `Odesolve needs starting values, as ${unknowns[0]}(0) = 1`);
    const points = [...new Set(conditions.map((c) => c.at.re))];
    if (points.length > 2) throw new EvalError('runtime', `Odesolve's conditions can be at two points at most, not ${points.length}`);
    // With conditions at two points, the solution starts from the one farther from the end, as Mathcad's does,
    // and the conditions at the other are met by shooting.
    points.sort((p, q) => Math.abs(q - b.re) - Math.abs(p - b.re) || p - q);
    const a = conditions.find((c) => c.at.re === points[0])!.at;
    const far = points.length === 2 ? points[1]! : null;
    if (a.re === b.re) throw new EvalError('runtime', "Odesolve's end must differ from the starting point");
    const tDim = [a, ...conditions.map((c) => c.at), b].find((v) => v.re !== 0)?.dim ?? NODIM;
    // The state: for each unknown y of order m, y, y′, … y⁽ᵐ⁻¹⁾, from its starting values.
    const slots: { u: string; k: number }[] = unknowns.flatMap((u) => Array.from({ length: order.get(u)! }, (_, k) => ({ u, k })));
    const prime = (u: string, k: number): string => `${u}${"'".repeat(k)}`;
    for (const c of conditions) if (c.order >= order.get(c.u)!) throw new EvalError('runtime', `Odesolve's starting value for ${prime(c.u, c.order)} is one too many: the equation's highest derivative of ${c.u} is order ${order.get(c.u)}`);
    const unitOf = new Map<string, Dim>();
    for (const c of conditions) if (!unitOf.has(c.u) && !(c.value.re === 0 && isNoDim(c.value.dim))) unitOf.set(c.u, dimMul(c.value.dim, dimPow(tDim, c.order)));
    const y0 = new Float64Array(slots.length);
    const free: number[] = [];
    slots.forEach((slot, i) => {
      const given = conditions.filter((c) => c.u === slot.u && c.order === slot.k && c.at.re === a.re);
      if (given.length > 1 || (given.length === 0 && far === null)) throw new EvalError('runtime', `Odesolve needs exactly one starting value for ${prime(slot.u, slot.k)}, at ${t} = ${a.re}`);
      if (given.length === 1) y0[i] = given[0]!.value.re;
      else free.push(i);
    });
    const targets = conditions.filter((c) => c.at.re === far).map((c) => ({ i: slots.findIndex((slot) => slot.u === c.u && slot.k === c.order), value: c.value.re, c }));
    for (const x of targets) if (targets.some((y) => y !== x && y.i === x.i)) throw new EvalError('runtime', `Odesolve has two conditions for ${prime(x.c.u, x.c.order)} at ${t} = ${far}`);
    if (targets.length !== free.length) {
      throw new EvalError('runtime', `Odesolve needs ${slots.length} condition${slots.length === 1 ? '' : 's'}, as many as the equations' orders add up to, not ${conditions.length}`);
    }
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
    // ∂(the equations)/∂(the highest derivatives), kept from call to call while Newton's steps keep shrinking fast.
    let kept: number[][] | null = null;
    const slopes = (time: number, y: Float64Array, zz: Float64Array, r: Float64Array): number[][] => {
      const J = Array.from({ length: zz.length }, () => new Array<number>(zz.length).fill(0));
      for (let j = 0; j < zz.length; j++) {
        const h = 1e-7 * Math.max(1, Math.abs(zz[j]!));
        const up = zz.slice();
        up[j] = zz[j]! + h;
        const ru = residual(time, y, up);
        for (let i = 0; i < zz.length; i++) J[i]![j] = (ru[i]! - r[i]!) / h;
      }
      return J;
    };
    const highest = (time: number, y: Float64Array): Float64Array => {
      let zz = z.slice();
      let fresh = false;
      let prev = Infinity;
      for (let iter = 0; iter < 30; iter++) {
        const r = residual(time, y, zz);
        if (!kept) {
          kept = slopes(time, y, zz, r);
          fresh = true;
        }
        let step = solveSmall(kept, Array.from(r, (v) => -v));
        const size = (d: number[]): number => Math.max(...d.map((v, j) => Math.abs(v) / Math.max(1, Math.abs(zz[j]!))));
        if (!fresh && (!step || size(step) > 0.1 * prev)) {
          kept = slopes(time, y, zz, r);
          fresh = true;
          step = solveSmall(kept, Array.from(r, (v) => -v));
        }
        if (!step) throw new EvalError('runtime', `Odesolve can't find the highest derivative${unknowns.length > 1 ? 's' : ''} from the equation${unknowns.length > 1 ? 's' : ''}: each must appear in them`);
        zz = zz.map((v, j) => v + step[j]!);
        prev = size(step);
        if (prev <= 1e-13) break;
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
    let grid: { xs: number[]; ys: Float64Array[]; dys: Float64Array[] };
    if (far === null) grid = odeGrid(f, a.re, b.re, y0, steps, 'Odesolve');
    else {
      // Conditions at two points: multiple shooting from a to the far point, with more segments if the
      // first try doesn't converge, then on to b if it lies beyond.
      const failed = new EvalError('runtime', `Odesolve can't meet the conditions at both points, ${t} = ${a.re} and ${t} = ${far}: the problem may have no solution`);
      const flow = (x1: number, x2: number, y: Float64Array): Float64Array => odeGrid(f, x1, x2, y, 1, 'Odesolve').ys[1]!;
      let solved: ReturnType<typeof multipleShooting> = 'unmet';
      let nodes: number[] = [];
      for (const M of [8, 64]) {
        nodes = Array.from({ length: M + 1 }, (_, k) => (k === M ? far : a.re + ((far - a.re) * k) / M));
        solved = multipleShooting({ y0, free, targets, nodes, flow });
        if (solved !== 'unmet') break;
      }
      if (typeof solved === 'string') throw failed;
      const beyond = Math.abs(b.re - a.re) > Math.abs(far - a.re) && Math.sign(b.re - a.re) === Math.sign(far - a.re);
      const span = Math.abs((beyond ? b.re : far) - a.re);
      const per = (x1: number, x2: number): number => Math.max(1, Math.ceil((steps * Math.abs(x2 - x1)) / span));
      const parts = solved.starts.map((y, k) => odeGrid(f, nodes[k]!, nodes[k + 1]!, y, per(nodes[k]!, nodes[k + 1]!), 'Odesolve'));
      if (beyond) parts.push(odeGrid(f, far, b.re, solved.end, per(far, b.re), 'Odesolve'));
      grid = { xs: [a.re], ys: [parts[0]!.ys[0]!], dys: [parts[0]!.dys[0]!] };
      for (const g of parts) {
        grid.xs.push(...g.xs.slice(1));
        grid.ys.push(...g.ys.slice(1));
        grid.dys.push(...g.dys.slice(1));
      }
    }
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

  /**
   * The variables a solver is given, by name, and their values above, the guesses. Each may be a number, a
   * vector or a matrix, and is complex if its guess is: the solver then varies each element's real and
   * imaginary parts. The parameters are every element in turn, column by column, its imaginary part after it.
   */
  private guesses(fn: string, args: Expr[], s: Scope, complexAllowed = true): Unknowns {
    if (args.length === 0) throw new EvalError('runtime', `${fn} needs the variables to solve for, as ${fn}(x, y)`);
    const list = args.map((a): Unknown => {
      if (a.k !== 'id') throw new EvalError('runtime', `${fn}'s variables must be names, as ${fn}(x, y)`);
      const n = a.name;
      const v = s.lookup(n);
      if (!v) throw new EvalError('runtime', `${fn} needs a guess for ${n}: define ${n} above, before Given`);
      if (v.t !== 'num' && v.t !== 'mat') throw new EvalError('unsupported', `${fn} solves for numbers and arrays of them: ${n}'s guess isn't one`);
      const items = v.t === 'num' ? [v] : Array.from({ length: v.rows * v.cols }, (_, k) => getEl(v, k % v.rows, Math.floor(k / v.rows)));
      const nums = items.map((e) => {
        if (e.t !== 'num') throw new EvalError('unsupported', `${fn} solves for arrays of numbers: ${n} holds an array or a function`);
        return e;
      });
      const complex = nums.some((e) => e.im !== 0);
      if (complex && !complexAllowed) throw new EvalError('unsupported', `${fn} solves for real numbers: ${n}'s guess is complex`);
      return { name: n, shape: v.t === 'num' ? null : [v.rows, v.cols], dims: nums.map((e) => e.dim), complex, guess: nums };
    });
    const x0 = list.flatMap((u) => u.guess.flatMap((e) => (u.complex ? [e.re, e.im] : [e.re])));
    return { list, x0: Float64Array.from(x0), complex: list.some((u) => u.complex) };
  }

  /** Each variable's value for the parameters x. */
  private unknownValues(u: Unknowns, x: ArrayLike<number>): Value[] {
    let k = 0;
    return u.list.map((v) => {
      const items = v.dims.map((d) => (v.complex ? num(x[k++]!, d, x[k++]!) : num(x[k++]!, d)));
      return v.shape ? fromValues(v.shape[0], v.shape[1], items) : items[0]!;
    });
  }

  /** A scope where the variables have trial values. */
  private trial(u: Unknowns, x: ArrayLike<number>, s: Scope): Scope {
    const frame = new Scope(s);
    this.unknownValues(u, x).forEach((v, j) => frame.set(u.list[j]!.name, v));
    return frame;
  }

  /**
   * a − b for each element of a constraint's sides, which may be arrays of one size, or an array and a number,
   * which is compared with each element.
   */
  private differences(c: Expr, scope: Scope): { re: number; im: number; complex: boolean }[] {
    if (c.k !== 'op') return [];
    const a = this.eval(c.args[0]!, scope);
    const b = this.eval(c.args[1]!, scope);
    const items = (v: Value): Value[] => (v.t === 'mat' ? Array.from({ length: v.rows * v.cols }, (_, k) => getEl(v, k % v.rows, Math.floor(k / v.rows))) : [v]);
    const as = items(a);
    const bs = items(b);
    if (as.length !== bs.length && as.length !== 1 && bs.length !== 1) {
      throw new EvalError('runtime', 'the two sides of a constraint must be arrays of the same size, or one of them a number');
    }
    return Array.from({ length: Math.max(as.length, bs.length) }, (_, k) => {
      const p = requireNum(as.length === 1 ? as[0]! : as[k]!, 'a side of a constraint');
      const q = requireNum(bs.length === 1 ? bs[0]! : bs[k]!, 'a side of a constraint');
      if (!dimEq(p.dim, q.dim) && !(p.re === 0 && p.im === 0) && !(q.re === 0 && q.im === 0)) {
        throw new EvalError('runtime', 'units do not match: the two sides of a constraint need the same units');
      }
      return { re: p.re - q.re, im: p.im - q.im, complex: p.im !== 0 || q.im !== 0 };
    });
  }

  /**
   * Each constraint as residuals that vanish when it holds: a − b for =, and how far off for <, >, ≤, ≥. An
   * equation's imaginary part is a residual of its own when the variables are complex, or either side is.
   */
  private residuals(constraints: Expr[], scope: Scope, complex = false): number[] {
    const out: number[] = [];
    for (const c of constraints) {
      if (c.k !== 'op') continue;
      for (const d of this.differences(c, scope)) {
        if (c.op === 'equal') {
          out.push(d.re);
          if (complex || d.complex) out.push(d.im);
        } else if (c.op === 'lessThan' || c.op === 'lessOrEqual') out.push(Math.max(0, d.re));
        else out.push(Math.max(0, -d.re));
      }
    }
    return out;
  }

  /** The answer: one variable alone, several as a vector, each in its own units (a vector or matrix nested). */
  private answer(u: Unknowns, x: ArrayLike<number>): Value {
    const plain = u.list.every((v) => !v.shape && !v.complex);
    if (!plain) {
      const values = this.unknownValues(u, x);
      return values.length === 1 ? values[0]! : fromValues(values.length, 1, values);
    }
    const dims = u.list.map((v) => v.dims[0]!);
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
    const u = this.guesses(fn, args, s);
    const { x0, complex } = u;
    const res = (x: Float64Array): Float64Array => Float64Array.from(this.residuals(constraints, this.trial(u, x, s), complex));
    const ctol = this.ws.ctol ?? 0.001;
    const holds = (r: Float64Array): boolean => r.every((v) => Math.abs(v) <= ctol);
    // Each inequality becomes an equation with a slack variable: a < b is a − b + z² = 0. A one-sided penalty
    // would stall where an equation's residual is flat (from u = −1, u > 0 and u² = 4 stop at u = 0).
    const sides = constraints.map((c) => (c.k !== 'op' || c.op === 'equal' ? 0 : c.op === 'lessThan' || c.op === 'lessOrEqual' ? 1 : -1));
    const n = x0.length;
    // How far each element of an inequality is from equality, a − b.
    const gaps = (c: Expr, scope: Scope): number[] => this.differences(c, scope).map((d) => d.re);
    // A guess on the wrong side of an inequality is first moved just inside all of them: from there the slack
    // form can reach a solution on the right side, rather than one beyond the wrong side's equations.
    let x1 = x0;
    const unmet = (p: Float64Array): Float64Array => {
      const scope = this.trial(u, p, s);
      return Float64Array.from(constraints.flatMap((c, i) => {
        if (!sides[i]) return [];
        return gaps(c, scope).map((d) => {
          const margin = 1e-3 * Math.max(1, Math.abs(d));
          return Math.max(0, sides[i] === 1 ? d + margin : -d + margin);
        });
      }));
    };
    if (unmet(x0).some((v) => v > 0)) x1 = leastSquares(unmet, x0).x;
    const start = this.trial(u, x1, s);
    // A slack starts where it makes a met inequality hold exactly, one for each element.
    const z0 = constraints.flatMap((c, i) => (sides[i] ? gaps(c, start).map((d) => Math.sqrt(Math.max(Math.abs(d), 1e-12))) : []));
    const augmented = (p: Float64Array): Float64Array => {
      const scope = this.trial(u, p, s);
      const out: number[] = [];
      let k = n;
      constraints.forEach((c, i) => {
        if (!sides[i]) out.push(...this.residuals([c], scope, complex));
        else for (const d of gaps(c, scope)) out.push(d + sides[i]! * p[k++]! ** 2);
      });
      if (k !== p.length) throw new EvalError('runtime', `${fn}'s inequalities changed size while it solved`);
      return Float64Array.from(out);
    };
    const fit = leastSquares(augmented, Float64Array.from([...x1, ...z0]));
    let x = fit.x.slice(0, n);
    let r = res(x);
    // When the constraints can't all hold, Minerr's answer is the least squares of how far off each one is, as
    // Mathcad's: a slack stalls short of it, near 0, where its square has no slope.
    if (fn === 'Minerr' && !holds(r)) {
      const polished = leastSquares(res, x);
      const cost = (v: ArrayLike<number>): number => Array.from(v).reduce((t, e) => t + e * e, 0);
      if (cost(polished.r) < cost(r)) [x, r] = [Float64Array.from(polished.x), Float64Array.from(polished.r)];
    }
    if (fn === 'Find' && !holds(r)) {
      throw new EvalError('runtime', 'No solution was found. Try other guess values, or check that the constraints can all hold (CTOL sets how nearly they must)');
    }
    // As in Mathcad, ERR is how far from holding the constraints are: the length of the residuals.
    this.solveError = Math.hypot(...r);
    return this.answer(u, x);
  }

  private optimum(fn: string, args: Expr[], constraints: Expr[] | null, s: Scope): Value {
    const [first, ...vars] = args;
    const f = first ? this.eval(first, s) : undefined;
    if (f?.t !== 'fn') throw new EvalError('runtime', `${fn}'s first argument is the function, as ${fn}(f, x)`);
    const u = this.guesses(fn, vars, s, false);
    const sign = fn === 'Maximize' ? -1 : 1;
    const value = (x: Float64Array): number => {
      const v = requireNum(f.call(this.unknownValues(u, x)), `${fn}'s function value`);
      if (v.im !== 0) throw new EvalError('runtime', `${fn}'s function must give a real number`);
      return sign * v.re;
    };
    const res = (x: Float64Array): Float64Array => Float64Array.from(this.residuals(constraints ?? [], this.trial(u, x, s)));
    const ctol = this.ws.ctol ?? 0.001;
    const x = constraints && constraints.length > 0 ? minimizeWithin(value, res, u.x0, ctol) : minimize(value, u.x0);
    if (!x) throw new EvalError('runtime', `No ${fn === 'Maximize' ? 'maximum' : 'minimum'} was found: the function keeps ${fn === 'Maximize' ? 'rising' : 'falling'} without bound`);
    if (constraints && constraints.length > 0 && !res(x).every((v) => Math.abs(v) <= ctol)) {
      throw new EvalError('runtime', `No ${fn === 'Maximize' ? 'maximum' : 'minimum'} was found that meets the constraints. Try other guess values`);
    }
    return this.answer(u, x);
  }

  /** root(f(x), x) from x's value as a guess, or root(f(x), x, a, b) between a and b, where f changes sign. */
  /**
   * Jacob(F(x), x, [k]): the matrix of ∂Fᵢ/∂xⱼ at the vector x defined above, a row per element of F and a column
   * per element of x, as Mathcad 14 gives it numerically (probed, 2026-11-11): by Ridders' extrapolated differences,
   * agreeing with Mathcad's to about 1e−13. k, the number of variables, changes nothing once x has a value, as in
   * Mathcad; complex F is differentiated part by part. A single F gives a row, the gradient.
   */
  private jacob(args: Expr[], s: Scope): Value {
    const [body, v, k] = args;
    if (!body || v?.k !== 'id' || args.length > 3) throw new EvalError('runtime', 'Jacob takes an expression and the vector it varies, as Jacob(F(x), x), and optionally the number of variables');
    if (k) requireNum(this.eval(k, s), "Jacob's number of variables");
    const name = v.name;
    const point = s.lookup(name);
    if (!point) throw new EvalError('runtime', `Jacob works out the Jacobian at the vector ${name}: define ${name} above`);
    const xs = point.t === 'num' ? [point] : point.t === 'mat' && !point.cells && (point.cols === 1 || point.rows === 1) ? Array.from(point.re, (_, i) => getEl(point, point.cols === 1 ? i : 0, point.cols === 1 ? 0 : i) as Num) : null;
    if (!xs || xs.some((x) => x.im !== 0)) throw new EvalError('runtime', `Jacob: ${name} must be a vector of real numbers`);
    if (xs.some((x) => !isNoDim(x.dim))) throw new EvalError('runtime', `Jacob: ${name} must be without units`);
    // F at x with its jth element moved to t, each point worked out once for all of F's elements.
    const seen = new Map<string, Num[]>();
    const at = (j: number, t: number): Num[] => {
      const key = `${j}:${t}`;
      const hit = seen.get(key);
      if (hit) return hit;
      const moved = fromValues(xs.length, 1, xs.map((x, i) => num(i === j ? t : x.re)));
      const frame = new Scope(s);
      frame.set(name, point.t === 'num' ? num(t) : moved);
      const out = this.eval(body, frame);
      const items = out.t === 'num' ? [out] : out.t === 'mat' && !out.cells && (out.cols === 1 || out.rows === 1)
        ? Array.from({ length: out.rows * out.cols }, (_, i) => requireNum(getEl(out, out.cols === 1 ? i : 0, out.cols === 1 ? 0 : i)))
        : null;
      if (!items) throw new EvalError('runtime', 'Jacob: F(x) must be a number or a vector of numbers');
      seen.set(key, items);
      return items;
    };
    const rows = at(0, xs[0]!.re).length;
    const cells: Value[] = [];
    const parts: Num[][] = xs.map((x, j) => Array.from({ length: rows }, (_, i) => {
      const here = at(j, x.re)[i]!;
      const d = (im: boolean) => nthDerivative((t) => (im ? at(j, t)[i]!.im : at(j, t)[i]!.re), x.re, 1);
      const complex = here.im !== 0 || at(j, x.re + 1e-3 * Math.max(1, Math.abs(x.re)))[i]!.im !== 0;
      return num(d(false), here.dim, complex ? d(true) : 0);
    }));
    for (let j = 0; j < xs.length; j++) for (let i = 0; i < rows; i++) cells.push(parts[j]![i]!);
    return fromValues(rows, xs.length, cells);
  }

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

  /**
   * The derivative at the variable's current value: the first by a five-point central difference, higher
   * ones by Ridders' extrapolation (differentiate.ts), and the 0th is the expression itself.
   */
  private evalDerivative(e: Extract<Expr, { k: 'derivative' }>, s: Scope): Value {
    const n = e.degree ? this.derivativeOrder(e.degree, s) : 1;
    const at = (p: Num): Value =>
      n === 1 ? this.derivativeAt(e, p, s) : n === 0 ? this.eval(e.body, this.bindAt(e.varName, p, s)) : this.nthDerivativeAt(e, n, p, s);
    // At a range or vector of points, the derivative at each one, as a vector.
    const point = this.eval({ k: 'id', name: e.varName }, s);
    if (point.t === 'range' || (point.t === 'mat' && point.rows * point.cols > 1)) {
      const values = [...this.iterate(point)].map((v) => at(requireNum(v, 'derivative point')));
      return fromValues(values.length, 1, values);
    }
    return at(requireNum(point, 'derivative point'));
  }

  /** An nth derivative's order: a whole number from 0 to 5, as Mathcad allows, past which differences are noise. */
  private derivativeOrder(degree: Expr, s: Scope): number {
    const v = requireNum(this.eval(degree, s), "a derivative's order");
    const plain = v.im === 0 && v.dim.every((d) => d === 0);
    if (!plain || !Number.isInteger(v.re) || v.re < 0 || v.re > 5) {
      throw new EvalError('runtime', `A derivative's order must be a whole number from 0 to 5${plain ? `, not ${v.re}` : ''}`);
    }
    return v.re;
  }

  private nthDerivativeAt(e: Extract<Expr, { k: 'derivative' }>, n: number, at: Num, s: Scope): Value {
    const f = (x: number): Num => requireNum(this.eval(e.body, this.bindAt(e.varName, num(x, at.dim), s)));
    const dim = f(at.re).dim;
    return num(nthDerivative((x) => f(x).re, at.re, n), dim.map((d, i) => d - n * at.dim[i]!));
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
    // Mathcad writes a file by defining one of its file functions at the file's name: WRITEBMP("a.bmp") := M.
    if (t.k === 'fn' && t.file && MATHCAD_WRITES.has(t.name)) {
      const value = this.eval(c.value, s);
      // WRITEWAV's rate and bits, numbers or names defined above.
      const extra = t.params.slice(1).map((p) => (/^-?[\d.]/.test(p) ? Number(p) : requireReal(this.eval({ k: 'id', name: p }, s), p)));
      this.writes.at(-1)?.set(t.params[0]!, mathcadWrite(t.name, t.params[0]!, value, extra));
      return undefined;
    }
    // Mathcad's other file writes, as APPENDPRN("name") := M, aren't carried out: say so, rather than define a function.
    if (t.k === 'fn' && t.file) {
      throw new EvalError('mathcad', `${t.name}("${t.params[0]}") := … writes a file in Mathcad. MathMath writes WRITEBMP, WRITERGB, WRITE_HLS, WRITE_HSV, WRITEPRN and WRITEWAV files, offering them to save; not ${t.name}.`);
    }
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
    if (vars.length > 0) this.ranging++;
    try {
      this.forEachBinding(vars, s, (scope) => {
        this.assign(t, () => (last = this.eval(c.value, scope)), null, scope, s);
        if (last) items.push(last);
      });
    } catch (err) {
      if (!(err instanceof UntilStop)) throw err;
      // Stopped by until. With nothing assigned, and nothing there before, there's no vector to give.
      if (items.length === 0 && !('name' in t && t.k !== 'var' && s.lookup(t.name))) {
        throw new EvalError('runtime', 'until stopped at the first value: the condition was negative from the start, so there is nothing to define');
      }
    } finally {
      if (vars.length > 0) this.ranging--;
    }
    return vars.length > 0 ? (items.length > 0 ? fromValues(items.length, 1, items) : undefined) : last;
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
    this.ev.beginTrace();
    const shown = this.outcomes.length;
    try {
      this.plainRegion(region);
    } finally {
      const files = this.ev.takeWrites();
      const trace = this.ev.takeTrace();
      // Maps SaveColormap added hold from here down, as a definition does.
      if (this.ev.savedMaps.length > 0) {
        const maps = this.ev.mapsAt(this.scope);
        this.ev.savedMaps = [];
        this.scope = Scope.after(this.scope);
        this.scope.set(COLORMAPS, fromValues(maps.length, 2, [...maps.map(([n]) => str(n)), ...maps.map(([, rows]) => mapMatrix(rows))]));
      }
      const outcome = this.outcomes[shown];
      if (files.length > 0 && outcome) outcome.files = files;
      if (trace.length > 0 && outcome) outcome.trace = trace;
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
    this.ev.solveError = null;
    try {
      this.plainMath(region, c);
    } finally {
      this.ev.solveContext = null;
    }
    // Find and Minerr set ERR, as in Mathcad, for the regions below.
    if (this.ev.solveError !== null) {
      this.scope = Scope.after(this.scope);
      this.scope.set('ERR', num(this.ev.solveError));
      this.ev.solveError = null;
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
  let v = ev.eval(e, scope);
  // Polyhedron("cube"), or the string alone, as Mathcad draws either.
  if (v.t === 'str') {
    const poly = polyhedron(v.v);
    if (!poly) throw new EvalError('runtime', `"${v.v}" names no polyhedron: give one of the 80 uniform polyhedra or its dual by name, "#1" to "#80", or a Wythoff symbol written as PolyLookup gives it`);
    // A contour plot gets it too and says it can't draw it, so switching between the two only redraws.
    return { traces: [], limits: {}, poly };
  }
  // CreateMesh and CreateSpace give their three matrices inside a 1 × 1 array, as Mathcad's do.
  if (v.t === 'mat' && v.cells && v.rows * v.cols === 1 && v.cells[0]?.t === 'mat') v = v.cells[0];
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
    if (X!.rows * X!.cols < 2) throw new EvalError('runtime', 'X, Y and Z need at least two points');
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
  throw new EvalError('runtime', 'A surface needs a matrix of heights, a function of two variables, three matrices X, Y and Z in a vector, as CreateMesh gives, or a polyhedron, as Polyhedron gives');
}

/** A Smith chart's data: each trace's x and y are the real and imaginary parts of Γ, with no units. */
function smithData(ev: Evaluator, c: Extract<Content, { k: 'plot' }>, scope: Scope): PlotData {
  const pv = c.x ? ev.evalRegionExpr(c.x, scope) : null;
  const ps = pv ? numbers(pv, 'the swept value') : null;
  const traces = c.ys.map((y): Trace => {
    try {
      const v = ev.evalRegionExpr(y, scope);
      if (v.t !== 'num' && v.t !== 'mat') throw new EvalError('runtime', 'a reflection coefficient must be a number or a vector');
      if (!isNoDim(v.dim)) throw new EvalError('runtime', 'A Smith chart plots reflection coefficients Γ, which have no units: zToGamma(Z, Z0) gives them from impedances');
      if (v.t === 'mat' && (v.cells || (v.rows > 1 && v.cols > 1))) throw new EvalError('runtime', 'a reflection coefficient must be a number or a vector');
      const re = v.t === 'num' ? Float64Array.of(v.re) : v.re.slice();
      const im = v.t === 'num' ? Float64Array.of(v.im) : v.im ? v.im.slice() : new Float64Array(re.length);
      // A single Γ is a point, as a load's, with nothing swept.
      if (ps && ps.length !== re.length && ps.length !== 1 && re.length !== 1) throw new EvalError('runtime', `the swept value has ${ps.length} values and Γ has ${re.length}`);
      const p = ps && ps.length === re.length ? ps : undefined;
      if (re.length <= MAX_POINTS) return { x: re, y: im, ...(p ? { param: p } : {}) };
      const [tx, ty] = thin(re, im);
      return { x: tx, y: ty, ...(p ? { param: thin(re, p)[1] } : {}) };
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
  // The x axis's dimension is the swept value's, so the worker shows it in its display unit.
  return { traces, limits: {}, dims: { x: pv ? dimOf(pv) : NODIM, y: NODIM, limits: {} }, units: { x: unit(c.xAxis.unit), y: undefined } };
}

export function plotData(ev: Evaluator, c: Extract<Content, { k: 'plot' }>, scope: Scope): PlotData {
  if (c.view === 'surface' || c.view === 'contour') {
    // The sheet's saved colour maps go with it, so the page can draw it in whichever the plot names.
    const maps = ev.mapsAt(scope);
    const data = surfaceData(ev, c, scope);
    return maps.length > 0 ? { ...data, maps } : data;
  }
  if (c.view === 'vector') {
    const maps = ev.mapsAt(scope);
    if (c.ys.length === 0) return { traces: [], limits: {} };
    if (c.ys.length !== 1 && c.ys.length !== 2 && c.ys.length !== 6) {
      throw new EvalError('runtime', 'A vector field takes one expression, two matrices X, Y of the parts, or six arrays X, Y, Z, U, V, W for arrows in space');
    }
    const limit = (x: Expr | null, fallback: number): number => (x ? requireReal(ev.eval(x, scope), 'a limit') : fallback);
    // X, Y typed as two expressions, as Mathcad takes them, are the pair; six are arrows in space.
    const values = c.ys.map((e) => ev.eval(e, scope));
    const value = values.length === 1 ? values[0]! : fromValues(values.length, 1, values);
    const field = fieldOf(value, ev.origin, { x0: limit(c.xAxis.min, -5), x1: limit(c.xAxis.max, 5), y0: limit(c.yAxis.min, -5), y1: limit(c.yAxis.max, 5) });
    return { traces: [], limits: {}, field, ...(maps.length > 0 ? { maps } : {}) };
  }
  if (c.view === 'smith') return smithData(ev, c, scope);
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

