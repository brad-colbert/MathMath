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
 * The bridge to Giac. Worksheets are untrusted and Giac is a full language, so nothing from a file
 * reaches it as text: commands are printed from the tree, with only numbers, operators, known
 * function names and generated identifiers (`v0`, `f0`).
 */
import type { Content, Expr, SymCommand } from '../model/ast.js';
import type { C } from '../engine/complex.js';
import { SYMFN_ARITY, symFns } from '../engine/symfns.js';
import { num } from '../engine/values.js';
import { mathcadDecimal, parse, roundDecimal } from './text.js';

export interface GiacRequest {
  setup: string[];
  command: string;
  cleanup: string[];
  /** For a final collect: the variable, whose coefficients come back as a list to build the polynomial from. */
  collectIn?: Expr;
  /**
   * Keywords held back for a second round: with a derivative of a function Giac doesn't know, as FresnelS, Giac
   * first works out the derivative alone, MathMath writes in the function's own derivative, and then the keywords
   * apply to that, as substitute, which Giac refuses on a derivative it left unworked.
   */
  then?: SymCommand[];
}

/** Mathcad's name, then Giac's. Note that Giac's `log` is natural. */
const FUNCTIONS: Record<string, string> = {
  sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  ln: 'ln', log: 'log10', exp: 'exp', sqrt: 'sqrt', max: 'max', min: 'min', floor: 'floor', ceil: 'ceil', sign: 'sign',
  Re: 're', Im: 'im', sec: 'sec', csc: 'csc', cot: 'cot',
  // Mathcad's step is Φ, and Dirac's impulse Δ, as Mathcad 14 shows inverse transforms (probed).
  'Φ': 'Heaviside', 'Δ': 'Dirac',
  // Mathcad's symbolic-only functions that Giac knows. Shi, Chi, FresnelS, FresnelC and dilog it doesn't, so
  // they pass through by their own names, and their numbers come from MathMath (see numericCalls).
  Si: 'Si', Ci: 'Ci', Ei: 'Ei', Zeta: 'Zeta', Psi: 'Psi', LambertW: 'LambertW', IsPrime: 'isprime', numer: 'numer', denom: 'denom',
};

/** Two-argument forms Giac takes the other way round: Mathcad's Psi(n, x) is Giac's Psi(x, n), and so on. */
const SWAPPED = new Set(['Ei', 'Psi', 'LambertW']);

const CONSTANTS: Record<string, string> = { 'π': 'pi', e: 'e', '∞': '(+infinity)' };

/** What comes back. Generated names map back separately. */
const FROM_GIAC: Record<string, Expr> = {
  pi: { k: 'id', name: 'π' }, e: { k: 'id', name: 'e' }, infinity: { k: 'id', name: '∞' },
  // Euler's constant, as Mathcad 14 writes Psi(1) → −γ; IsPrime's answer, as Mathcad's 1 or 0.
  euler_gamma: { k: 'id', name: 'γ' }, true: { k: 'real', v: 1 }, false: { k: 'real', v: 0 },
};

/** The functions MathMath works out itself when their arguments are numbers (see numericCalls). */
const NUMERIC = new Set(['Si', 'Ci', 'Shi', 'Chi', 'Ei', 'FresnelS', 'FresnelC', 'dilog', 'Zeta', 'Psi', 'LambertW']);
/** Of those, the ones Giac can't give a number for at all. */
const GIAC_CANNOT = new Set(['Shi', 'Chi', 'FresnelS', 'FresnelC', 'dilog']);

const PI_SQUARED = (over: number, sign = 1): Expr => {
  const e: Expr = { k: 'op', op: 'div', args: [{ k: 'op', op: 'pow', args: [{ k: 'id', name: 'π' }, { k: 'real', v: 2 }] }, { k: 'real', v: over }] };
  return sign < 0 ? { k: 'op', op: 'neg', args: [e] } : e;
};
/** Exact values of the functions Giac doesn't know, at the points where they have them, as Mathcad gives dilog(1) → 0. */
const EXACT: Record<string, Expr> = {
  'dilog(1)': { k: 'real', v: 0 }, 'dilog(0)': PI_SQUARED(6), 'dilog(2)': PI_SQUARED(12, -1),
  'Shi(0)': { k: 'real', v: 0 }, 'FresnelS(0)': { k: 'real', v: 0 }, 'FresnelC(0)': { k: 'real', v: 0 },
};

/** A constant's value, or null when it has a name in it. */
function constant(e: Expr): C | null {
  switch (e.k) {
    case 'real': return [e.v, 0];
    case 'imag': return [0, e.v];
    case 'id': return e.name === 'π' ? [Math.PI, 0] : e.name === 'e' ? [Math.E, 0] : null;
    case 'op': {
      const [a, b] = e.args.map(constant);
      if (!a || (e.args.length > 1 && !b)) return null;
      switch (e.op) {
        case 'neg': return [-a[0], -a[1]];
        case 'plus': return [a[0] + b![0], a[1] + b![1]];
        case 'minus': return [a[0] - b![0], a[1] - b![1]];
        case 'mult': return [a[0] * b![0] - a[1] * b![1], a[0] * b![1] + a[1] * b![0]];
        case 'div': {
          const d = b![0] * b![0] + b![1] * b![1];
          return d === 0 ? null : [(a[0] * b![0] + a[1] * b![1]) / d, (a[1] * b![0] - a[0] * b![1]) / d];
        }
        default: return null;
      }
    }
    default: return null;
  }
}

const hasDecimal = (e: Expr): boolean => (e.k === 'real' ? !Number.isInteger(e.v) : e.k === 'op' ? e.args.some(hasDecimal) : false);

/**
 * Calls to Si, Zeta, LambertW and the rest with numbers for arguments, replaced by their values, worked out by
 * MathMath to a double's 16 digits: when the arguments have decimals, where Giac would give only about 12, and
 * under float when Giac can't work them out at all (Shi, Chi, the Fresnel integrals, dilog, Psi(n, x), Ci of a
 * negative number). Otherwise Giac keeps its exact forms, as Zeta(2) → π²/6, and float gives all 20 digits.
 * An argument outside the function's domain leaves the call to Giac.
 */
function numericCalls(e: Expr, float: boolean, made: WeakSet<Expr>): Expr {
  const go = (x: Expr): Expr => numericCalls(x, float, made);
  if (e.k === 'op') return { ...e, args: e.args.map(go) };
  if (e.k === 'matrix') return { ...e, items: e.items.map(go) };
  if (e.k !== 'call' || e.fn.k !== 'id') return e;
  const name = e.fn.name;
  const args = e.args.map(go);
  const call: Expr = { ...e, args };
  const arity = SYMFN_ARITY[name];
  if (!NUMERIC.has(name) || !arity || args.length < arity[0] || args.length > arity[1]) return call;
  const values = args.map(constant);
  if (values.some((v) => v === null)) return call;
  const ciNegative = name === 'Ci' && values[0]![0] < 0;
  const giacCannot = GIAC_CANNOT.has(name) || (name === 'Psi' && args.length === 2) || ciNegative;
  if (!args.some(hasDecimal) && !float) {
    const exact = EXACT[`${name}(${values.map((v) => v![1] === 0 ? v![0] : NaN).join(',')})`];
    if (exact) return exact;
  }
  if (!args.some(hasDecimal) && !(float && giacCannot)) return call;
  let out;
  try {
    out = symFns[name]!(...values.map((v) => num(v![0], undefined, v![1])));
  } catch {
    return call;
  }
  if (out.t !== 'num') return call;
  const part = (v: number): Expr => {
    const r: Expr = { k: 'real', v: Math.abs(v) };
    made.add(r);
    return v < 0 ? { k: 'op', op: 'neg', args: [r] } : r;
  };
  if (out.im === 0) return part(out.re);
  return { k: 'op', op: 'plus', args: [part(out.re), { k: 'op', op: 'mult', args: [part(out.im), { k: 'imag', v: 1 }] }] };
}

/** Each decimal rounded to n significant digits, from the two more Giac was asked for. */
function rounded(e: Expr, n: number): Expr {
  const fix = <T extends { v: number; digits?: string }>(x: T): T => {
    if (x.digits === '' || x.digits === undefined) return x;
    const shown = mathcadDecimal(roundDecimal(x.digits.replace('×', 'e'), n));
    const v = Number(shown);
    const { digits: _, ...rest } = x;
    return (shown === String(v) ? { ...rest, v } : { ...rest, v, digits: shown }) as T;
  };
  if (e.k === 'real' || e.k === 'imag') return fix(e);
  if (e.k === 'op') return { ...e, args: e.args.map((a) => rounded(a, n)) };
  if (e.k === 'matrix') return { ...e, items: e.items.map((a) => rounded(a, n)) };
  if (e.k === 'call') return { ...e, args: e.args.map((a) => rounded(a, n)) };
  return e;
}

/** Each number rounded to 16 significant digits, the rest of a 20-digit answer being only zeros or noise. */
function sixteen(e: Expr): Expr {
  const round = (v: number): { v: number; digits?: string } => {
    const shown = mathcadDecimal(v.toPrecision(16));
    const r = Number(shown);
    return shown === String(r) ? { v: r } : { v: r, digits: shown };
  };
  if (e.k === 'real') return { k: 'real', ...round(e.v) };
  if (e.k === 'imag') return e.digits === '' ? e : { k: 'imag', ...round(e.v) };
  if (e.k === 'op') return { ...e, args: e.args.map(sixteen) };
  if (e.k === 'matrix') return { ...e, items: e.items.map(sixteen) };
  if (e.k === 'call') return { ...e, args: e.args.map(sixteen) };
  return e;
}

/** A double as an exact fraction of its 16 significant digits, so float shows those and zeros, not binary noise. */
function sixteenDigits(v: number): string {
  if (v === 0) return '0';
  const [mantissa, exponent] = v.toExponential(15).split('e') as [string, string];
  const digits = mantissa.replace('.', '');
  const power = Number(exponent) - 15;
  return power >= 0 ? `(${digits}*10^${power})` : `(${digits}/10^${-power})`;
}

const TRANSFORMS = ['laplace', 'invlaplace', 'ztrans', 'invztrans'];
const KEYWORDS_WITH_ARGUMENT = ['solve', 'collect', 'coeffs', 'series', 'substitute', 'parfrac', 'assume', ...TRANSFORMS];
const KEYWORDS_PLAIN = ['simplify', 'expand', 'factor', 'float'];
export const KEYWORDS = [...KEYWORDS_PLAIN, ...KEYWORDS_WITH_ARGUMENT];

export class Printer {
  private names = new Map<string, string>();
  /** Decimals as exact fractions: the engine finds no z-transform of 0.5^n, but does of (1/2)^n. */
  exactNumbers = false;
  /** Values MathMath worked out (see numericCalls), printed under float as fractions of their 16 digits. */
  readonly worked = new WeakSet<Expr>();
  float = false;
  /** For float: the significant digits asked for, when Giac is asked for more, to round to here. */
  floatDigits: number | null = null;
  /** Whether the command has any of those values in it, and so is good to 16 digits, not 20. */
  usedWorked = false;
  /** Whether this is the second round, after derivatives of functions Giac doesn't know were put in. */
  rewritten = false;
  private calls = new Map<string, string>();
  /** Generated name, back to the name on the sheet. */
  readonly back = new Map<string, string>();

  name(id: string): string {
    let n = this.names.get(id);
    if (!n) {
      n = `v${this.names.size}`;
      this.names.set(id, n);
      this.back.set(n, id);
    }
    return n;
  }

  /** Names of plain variables used, for clearing assumptions afterwards. */
  get variables(): string[] {
    return [...this.names.values()];
  }

  private fn(id: string): string {
    const known = FUNCTIONS[id];
    if (known) return known;
    let n = this.calls.get(id);
    if (!n) {
      n = `f${this.calls.size}`;
      this.calls.set(id, n);
      this.back.set(n, id);
    }
    return n;
  }

  print(e: Expr): string {
    const p = (x: Expr): string => this.print(x);
    switch (e.k) {
      case 'real': {
        if (this.worked.has(e)) this.usedWorked = true;
        if (this.float && this.worked.has(e)) return sixteenDigits(e.v);
        // More digits than a double holds, as typed: sent as typed, checked to be only a number first.
        if (e.digits && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(e.digits) && (!this.exactNumbers || /^-?\d+$/.test(e.digits))) return e.digits.startsWith('-') ? `(${e.digits})` : e.digits;
        const text = this.exactNumbers && !Number.isInteger(e.v) ? `exact(${e.v})` : String(e.v);
        return e.v < 0 ? `(${text})` : text;
      }
      case 'imag': return `(${e.v}*i)`;
      case 'id': return CONSTANTS[e.name] ?? this.name(e.name);
      case 'matrix': {
        if (e.cols === 1) return `[${e.items.map(p).join(',')}]`;
        const rows: string[] = [];
        for (let i = 0; i < e.rows; i++) rows.push(`[${Array.from({ length: e.cols }, (_, j) => p(e.items[i + j * e.rows]!)).join(',')}]`);
        return `[${rows.join(',')}]`;
      }
      case 'call': {
        const name = (e.fn as { name: string }).name;
        const arity = FUNCTIONS[name] || GIAC_CANNOT.has(name) ? SYMFN_ARITY[name] : undefined;
        if (arity && (e.args.length < arity[0] || e.args.length > arity[1])) {
          throw new Error(`${name} takes ${arity[0] === arity[1] ? arity[0] : `${arity[0]} or ${arity[1]}`} argument${arity[1] === 1 ? '' : 's'}, not ${e.args.length}`);
        }
        const args = SWAPPED.has(name) && e.args.length === 2 ? [e.args[1]!, e.args[0]!] : e.args;
        return `${this.fn(name)}(${args.map(p).join(',')})`;
      }
      case 'derivative': return `diff(${p(e.body)},${this.name(e.varName)}${e.degree ? `,${p(e.degree)}` : ''})`;
      case 'limit': {
        const side = e.side === 'left' ? ',-1' : e.side === 'right' ? ',1' : '';
        return `limit(${p(e.body)},${this.name(e.varName)},${p(e.to)}${side})`;
      }
      case 'bigop': {
        // Giac reads a sum with no limits as an antidifference, which isn't what a range sum means.
        if (e.op !== 'integral' && !(e.lo && e.hi)) throw new Error(`a ${e.op === 'summation' ? 'sum' : 'product'} over a range variable has no exact form here. Give it limits, or use =`);
        const fn = { integral: 'integrate', summation: 'sum', product: 'product' }[e.op];
        const bounds = e.lo && e.hi ? `,${p(e.lo)},${p(e.hi)}` : '';
        return `${fn}(${p(e.body)},${this.name(e.varName)}${bounds})`;
      }
      case 'op': return this.operator(e.op, e.args);
      default: throw new Error(`no symbolic form for ${e.k}`);
    }
  }

  private operator(op: string, args: Expr[]): string {
    const [a, b] = args.map((x) => this.print(x));
    const infix: Record<string, string> = {
      plus: '+', minus: '-', mult: '*', div: '/', pow: '^', equal: '=', notEqual: '!=', lessThan: '<', greaterThan: '>', lessOrEqual: '<=', greaterOrEqual: '>=',
    };
    if (infix[op]) return `(${a}${infix[op]}${b})`;
    switch (op) {
      case 'neg': return `(-${a})`;
      case 'sqrt': return `sqrt(${a})`;
      case 'nthRoot': return `((${b})^(1/(${a})))`;
      // |M| of a square array is its determinant.
      case 'absval': return args[0]?.k === 'matrix' && args[0].cols > 1 ? `det(${a})` : `abs(${a})`;
      case 'transpose': return `tran(${a})`;
      case 'vectorSum': return `sum(${a})`;
      case 'crossProduct': return `cross(${a},${b})`;
      case 'indexer': return `(${a})[${args.slice(1).map((x) => this.print(x)).join(',')}]`;
      case 'matcol': return `col(${a},${b})`;
      case 'factorial': return `factorial(${a})`;
      default: throw new Error(`no symbolic form for ${op}`);
    }
  }
}

type Sym = Extract<Content, { k: 'sym' }>;

const hasLimitProcess = (c: Sym): boolean => /"k":"(bigop|limit)"/.test(JSON.stringify(c.expr));

function applyKeyword(cmd: string, c: SymCommand, p: Printer, req: GiacRequest, last: boolean): string {
  const arg = (i: number): string => {
    const x = c.args[i];
    if (!x) throw new Error(`${c.name} needs an argument`);
    return p.print(x);
  };
  // Sheet definitions apply to keyword arguments too. If the variable has a value, there's nothing
  // left to work on: solving and series are errors, and the rest leave the expression alone.
  const first = c.args[0];
  const numeric = first !== undefined && !/"k":"id"/.test(JSON.stringify(first));
  if (numeric && (c.name === 'solve' || c.name === 'series')) throw new Error(`${c.name} needs a variable with no value on the sheet`);
  // A transform's variables must be plain names: one with a value on the sheet has been replaced by it.
  if (TRANSFORMS.includes(c.name) && c.args.some((a) => a.k !== 'id')) throw new Error(`${c.name} needs a variable with no value on the sheet`);
  if (numeric && ['coeffs', 'collect', 'parfrac', 'substitute', 'assume'].includes(c.name)) return cmd;
  const substituted = c.name === 'substitute' && first?.k === 'op' && first.args[0]?.k !== 'id';
  if (substituted) return cmd;
  switch (c.name) {
    case 'simplify': return `simplify(${cmd})`;
    case 'expand': return /\b(sin|cos|tan)\(/.test(cmd) ? `texpand(${cmd})` : `expand(${cmd})`;
    case 'factor': return `factor(${cmd})`;
    // As Mathcad: a polynomial in the variable, highest power first, each power's coefficient gathered.
    // Giac would multiply the coefficients out again, so it gives them as a list and the answer is built here.
    case 'collect':
      if (!last || c.args[0]?.k !== 'id') return `collect(${cmd})`;
      req.collectIn = c.args[0];
      return `symb2poly(expand(${cmd}),${arg(0)})`;
    // Mathcad lists coefficients from the constant term up.
    case 'coeffs': return `revlist(coeffs(${cmd},${arg(0)}))`;
    case 'parfrac': return `partfrac(${cmd},${arg(0)})`;
    case 'substitute': return `subst(${cmd},${arg(0)})`;
    case 'solve': return `csolve(${cmd},${arg(0)})`;
    case 'series': return `convert(series(${cmd},${c.args[0]?.k === 'id' ? `${arg(0)}=0` : arg(0)},${c.args[1] ? arg(1) : 6}),polynom)`;
    case 'float': {
      // Giac cuts off the last of 16 or more digits rather than rounding it, as 666666.66666666666666 for Mathcad's
      // …667: it is asked for two more, and the answer rounded here (see readAnswer).
      const n = c.args[0] === undefined ? 20 : c.args[0].k === 'real' && Number.isInteger(c.args[0].v) && c.args[0].v > 0 ? c.args[0].v : null;
      if (n === null) return `evalf(${cmd},${arg(0)})`;
      if (n >= 16) p.floatDigits = n;
      return `evalf(${cmd},${n >= 16 ? n + 2 : n})`;
    }
    // As Mathcad: the transform's variable, then optionally the result's, which is otherwise s, t, z or n.
    case 'laplace': return `laplace(${cmd},${arg(0)},${c.args[1] ? arg(1) : p.name('s')})`;
    case 'invlaplace': return `ilaplace(${cmd},${arg(0)},${c.args[1] ? arg(1) : p.name('t')})`;
    case 'ztrans': return `ztrans(${cmd},${arg(0)},${c.args[1] ? arg(1) : p.name('z')})`;
    case 'invztrans': return `invztrans(${cmd},${arg(0)},${c.args[1] ? arg(1) : p.name('n')})`;
    case 'assume':
      req.setup.push(`assume(${arg(0)})`);
      return cmd;
    default: throw new Error(`unknown keyword ${c.name}`);
  }
}

export function buildRequest(expanded: Expr, commands: SymCommand[], p: Printer): GiacRequest {
  const req: GiacRequest = { setup: [], command: '', cleanup: [] };
  // Without a keyword, combine like terms and leave the rest as written, as a plain arrow does.
  p.exactNumbers = commands.some((c) => TRANSFORMS.includes(c.name));
  p.float = commands.some((c) => c.name === 'float');
  const printed = p.print(numericCalls(expanded, p.float, p.worked));
  let cmd = commands.length === 0 ? `regroup(${printed})` : printed;
  commands.forEach((command, i) => {
    cmd = applyKeyword(cmd, command, p, req, i === commands.length - 1);
  });
  req.command = cmd;
  const unknownInDiff = /\bdiff\(/.test(printed) && [...p.back].some(([g, sheet]) => /^f\d+$/.test(g) && sheet in DERIVATIVES && printed.includes(`${g}(`));
  if (unknownInDiff && commands.length > 0) {
    req.command = `regroup(${printed})`;
    req.then = commands;
  }
  // Assumptions stay in Giac until purged, and would leak into the next region.
  if (req.setup.length > 0) req.cleanup = p.variables.map((v) => `purge(${v})`);
  return req;
}

function backToSheet(e: Expr, p: Printer): Expr {
  const go = (x: Expr): Expr => backToSheet(x, p);
  switch (e.k) {
    case 'id': {
      const sheet = p.back.get(e.name);
      if (sheet) return { k: 'id', name: sheet };
      // i alone shows as i, as Mathcad shows it, not 1i; under float, as 1.0i.
      if (e.name === 'i') return { k: 'imag', v: 1, digits: p.float ? '1.0' : '' };
      return FROM_GIAC[e.name] ?? e;
    }
    case 'matrix': return { ...e, items: e.items.map(go) };
    case 'op': return imaginary({ ...e, args: e.args.map(go) });
    case 'call': {
      const name = (e.fn as { name: string }).name;
      const args = e.args.map(go);
      if (name === 'sqrt') return { k: 'op', op: 'sqrt', args };
      if (name === 'abs') return { k: 'op', op: 'absval', args };
      if (name === 'exp') return { k: 'op', op: 'pow', args: [{ k: 'id', name: 'e' }, args[0]!] };
      const sheet = p.back.get(name);
      const mapped = Object.entries(FUNCTIONS).find(([, giac]) => giac === name)?.[0];
      const back = sheet ?? mapped ?? name;
      return { ...e, fn: { k: 'id', name: back }, args: SWAPPED.has(back) && args.length === 2 ? [args[1]!, args[0]!] : args };
    }
    default: return e;
  }
}

/**
 * Giac's 1.4142*i as one imaginary number, 1.4142i, as Mathcad writes it, rather than 1.4142·i; and i·x as x·i,
 * Mathcad's order.
 */
function imaginary(e: Extract<Expr, { k: 'op' }>): Expr {
  if (e.op !== 'mult' || e.args.length !== 2) return e;
  const [a, b] = e.args as [Expr, Expr];
  const bare = (x: Expr): boolean => x.k === 'imag' && x.v === 1 && x.digits !== undefined;
  const times = (r: Extract<Expr, { k: 'real' }>): Expr => ({ k: 'imag', v: r.v, ...(r.digits !== undefined ? { digits: r.digits } : {}) });
  if (bare(b) && a.k === 'real') return times(a);
  if (bare(b) && a.k === 'op' && a.op === 'neg' && a.args[0]?.k === 'real') return { k: 'op', op: 'neg', args: [times(a.args[0])] };
  if (bare(a) && b.k !== 'real' && b.k !== 'imag') return { ...e, args: [b, a] };
  return e;
}

/** A polynomial from its coefficients, highest power first, as Mathcad's collect writes it: x² + (a + b)·x + a·b. */
function polynomial(coefficients: Expr, x: Expr): Expr {
  if (coefficients.k !== 'matrix') return coefficients;
  const n = coefficients.items.length;
  const isReal = (e: Expr, v?: number): boolean => e.k === 'real' && (v === undefined || e.v === v);
  let out: Expr | null = null;
  coefficients.items.forEach((coef, i) => {
    const power = n - 1 - i;
    if (isReal(coef, 0)) return;
    const negative = (coef.k === 'real' && coef.v < 0) || (coef.k === 'op' && coef.op === 'neg');
    const size: Expr = !negative ? coef : coef.k === 'real' ? { k: 'real', v: -coef.v } : (coef as { args: Expr[] }).args[0]!;
    const xp: Expr | null = power === 0 ? null : power === 1 ? x : { k: 'op', op: 'pow', args: [x, { k: 'real', v: power }] };
    const term: Expr = !xp ? size : isReal(size, 1) ? xp : { k: 'op', op: 'mult', args: [size, xp] };
    if (!out) out = negative ? { k: 'op', op: 'neg', args: [term] } : term;
    else out = { k: 'op', op: negative ? 'minus' : 'plus', args: [out, term] };
  });
  return out ?? { k: 'real', v: 0 };
}

export type GiacAnswer =
  | { result: Expr }
  | { error: string }
  | { unevaluated: true }
  /** Exact but unreadable, such as a `rootof`. Ask again for a number. */
  | { retry: string };

const UNEVALUATED = /\b(integrate|int|sum|product|limit|diff|laplace|ilaplace|ztrans|invztrans)\(/;

/**
 * Derivatives of the functions Giac doesn't know, in Giac's terms of their argument: the integrands, by definition.
 * Mathcad 14 gives FresnelS's and dilog's in these forms (probed); Shi's, Chi's and FresnelC's follow the same way.
 */
const DERIVATIVES: Record<string, (a: string) => string> = {
  Shi: (a) => `(sinh(${a})/(${a}))`,
  Chi: (a) => `(cosh(${a})/(${a}))`,
  FresnelS: (a) => `sin(pi*(${a})^2/2)`,
  FresnelC: (a) => `cos(pi*(${a})^2/2)`,
  dilog: (a) => `(-ln(${a})/((${a})-1))`,
};

/**
 * Giac's answer with the derivatives it left of Shi, Chi, FresnelS, FresnelC and dilog written out, or null when
 * there are none: f0'(u) at any u, and diff(f0(v0),v0), as Giac writes the first derivative of each.
 */
function writeDerivatives(text: string, p: Printer): string | null {
  const formula = (generated: string): ((a: string) => string) | undefined => {
    const sheet = p.back.get(generated);
    return sheet ? DERIVATIVES[sheet] : undefined;
  };
  // The nth derivative at a: the first written in, and Giac asked for the rest.
  const nth = (f: (a: string) => string, n: number, a: string): string =>
    n === 1 ? f(a) : `subst(diff(${f('mmt')},mmt,${n - 1}),mmt=${a})`;
  let out = text.replace(/diff\((f\d+)\((v\d+)\),\2(?:,(\d+))?\)/g, (all, g: string, v: string, n?: string) => {
    const f = formula(g);
    return f ? nth(f, Number(n ?? 1), v) : all;
  });
  // f0'(u), and higher, as Giac writes them: (f0')'(u), ((f0')')'(u).
  const PRIMED = /(\(*)(f\d+)'((?:\)')*)\(/g;
  for (let m = PRIMED.exec(out); m; m = PRIMED.exec(out)) {
    const [whole, lead, g, closes] = m as unknown as [string, string, string, string];
    const order = 1 + closes.length / 2;
    const f = formula(g);
    if (!f || lead.length < order - 1) continue;
    const from = m.index + lead.length - (order - 1);
    const open = m.index + whole.length - 1;
    let depth = 0;
    let close = open;
    for (; close < out.length; close++) {
      if (out[close] === '(') depth++;
      else if (out[close] === ')' && --depth === 0) break;
    }
    if (close >= out.length) return null;
    const replacement = nth(f, order, out.slice(open + 1, close));
    out = out.slice(0, from) + replacement + out.slice(close + 1);
    PRIMED.lastIndex = from + replacement.length;
  }
  return out === text ? null : out;
}

export function readAnswer(out: string, c: Sym, req: GiacRequest, p: Printer): GiacAnswer {
  // Giac adds an approximation to exact results: 2*sqrt(2)=2.82842712475.
  // Giac adds an approximation after an exact answer, real or complex: 3*i/4=0.75*i, 2*sqrt(2)+i=2.82842712475+i.
  // Not after an equation, whose own = it is: x = 3 → x = 3.
  const relation = c.expr.k === 'op' && ['equal', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'].includes(c.expr.op);
  const text = relation ? out.trim() : out.trim().replace(/=(?=[-\d.i])-?(?:[\d.]+(?:e[+-]?\d+)?)?(?:[+-]?(?:[\d.]+(?:e[+-]?\d+)?\*)?i)?$/, '');
  if (text.startsWith('ERROR ')) return { error: text.slice(6) };
  if (text.includes('undef')) {
    const transform = c.commands.find((k) => TRANSFORMS.includes(k.name));
    return { error: transform ? `No ${transform.name} transform was found for this` : 'This has no defined value' };
  }
  if (/^-?infinity$/.test(text) && !hasLimitProcess(c)) return { error: 'This has no defined value' };
  if (text.includes('rootof')) return { retry: `evalf(${req.command})` };
  if (!p.rewritten) {
    p.rewritten = true;
    const derived = writeDerivatives(text, p);
    if (req.then) {
      // The keywords held back now apply to the derivative, written in or not.
      let cmd = derived ?? text;
      const held: GiacRequest = { setup: [], command: '', cleanup: [] };
      req.then.forEach((command, i) => {
        cmd = applyKeyword(cmd, command, p, held, i === req.then!.length - 1);
      });
      if (held.collectIn) req.collectIn = held.collectIn;
      return { retry: cmd };
    }
    if (derived) return { retry: p.float ? `evalf(${derived},20)` : `regroup(${derived})` };
  }
  // A derivative still unworked, as of a function of your own with no definition, has no closed form here.
  if (/\bf\d+'|\bfunction_diff\(/.test(text)) return { unevaluated: true };
  if (UNEVALUATED.test(text)) return { unevaluated: true };
  let e = backToSheet(parse(text), p);
  // A value MathMath worked out has a double's 16 digits, so the answer shows no more than those.
  if (p.floatDigits !== null) e = rounded(e, p.floatDigits);
  if (p.usedWorked && p.float) e = sixteen(e);
  if (req.collectIn) e = polynomial(e, req.collectIn);
  // One solution shows on its own, and none is an error.
  if (e.k === 'matrix' && e.cols === 1 && c.commands.some((k) => k.name === 'solve')) {
    if (e.rows === 0) return { error: 'No solution was found' };
    if (e.rows === 1) e = e.items[0]!;
  }
  return { result: e };
}
