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

// Prints the worksheet tree as LaTeX and reads it back. An editor built on LaTeX needs both, so its
// size and its failures are part of what this spike measures.
import { type Expr, type Stmt, type Target, realFrom } from '../model/ast.js';
import { MATHCAD_WRITES } from '../xmcd/names.js';

const GREEK: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
  'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma',
  'τ': '\\tau', 'υ': '\\upsilon', 'ϕ': '\\phi', 'φ': '\\varphi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega', 'Δ': '\\Delta', 'Θ': '\\Theta',
  'Λ': '\\Lambda', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega', 'Γ': '\\Gamma', '∞': '\\infty',
  // Not Greek, but a name written as a command the same way: the percent unit.
  '%': '\\%',
};
/** Greek letters by name, so `alpha` typed in a region is α. */
const GREEK_WORDS = Object.fromEntries(
  Object.entries(GREEK).filter(([k]) => k !== '∞' && k !== '%').map(([k, v]) => [v.slice(1).replace('var', ''), k]),
);
const UNGREEK = Object.fromEntries(Object.entries(GREEK).map(([k, v]) => [v, k]));

function name(whole: string): string {
  // Primes, as y'' for y″, print after the name, subscript and all.
  const marks = /'*$/.exec(whole)![0];
  const id = whole.slice(0, whole.length - marks.length);
  const dot = id.indexOf('.');
  const [base, sub] = dot > 0 ? [id.slice(0, dot), id.slice(dot + 1)] : [id, null];
  const b = GREEK[base] ?? (/^[A-Za-z]$/.test(base) ? base : `\\mathrm{${escapeText(base)}}`);
  return (sub ? `${b}_{\\text{${escapeText(sub)}}}` : b) + marks;
}

/** Inside text, a backslash is written as a command: `\\\\` there would be a line break. */
/** Text as LaTeX writes it inside \text{…}: special characters escaped. */
export const escapeText = (t: string): string =>
  // ~ and ^ by name: in text, \~ and \^ are accents, which would put a mark on the next letter instead.
  t.replace(/[\\{}_%&#$^~]/g, (c) => (c === '\\' ? '\\textbackslash ' : c === '~' ? '\\textasciitilde ' : c === '^' ? '\\textasciicircum ' : `\\${c}`));

function numberText(v: number, digits?: string): string {
  const s = digits ?? String(v);
  const m = /^(-?[\d.]+)e([+-]?\d+)$/.exec(s);
  return m ? `${m[1]}\\times10^{${Number(m[2])}}` : s;
}

const PREC: Record<string, number> = {
  // As Mathcad 14 reads them (typed and probed): comparisons, then ∧, then ∨ and ⊕. a < 9 ∧ b < 9 is (a < 9) ∧ (b < 9),
  // and a ∨ b ∧ c is a ∨ (b ∧ c).
  equal: 1, notEqual: 1, lessThan: 1, greaterThan: 1, lessOrEqual: 1, greaterOrEqual: 1, and: 0.5, or: 0.4, xor: 0.4,
  plus: 2, minus: 2, neg: 3, mult: 3, div: 5, crossProduct: 3, pow: 4,
};
const INFIX: Record<string, string> = {
  plus: '+', minus: '-', mult: '\\cdot ', crossProduct: '\\times ', equal: '=', notEqual: '\\ne ', lessThan: '<', greaterThan: '>',
  lessOrEqual: '\\le ', greaterOrEqual: '\\ge ', and: '\\land ', or: '\\lor ', xor: '\\oplus ',
};

/**
 * A derivative, a limit, and a sum or product with its index written are open on the right: their body reads
 * on through any product after it (see product() below), so d/dx f·k is d/dx (f·k).
 */
const openRight = (e: Expr): boolean => e.k === 'derivative' || e.k === 'limit' || (e.k === 'bigop' && e.op !== 'integral');

function prec(e: Expr): number {
  if (e.k === 'real') return e.v < 0 ? 3 : 9;
  if (e.k === 'op') return PREC[e.op] ?? 9;
  if (openRight(e)) return 2.5;
  // An integral ends at its dx, so it's a factor like any other, though a power of it is bracketed.
  if (e.k === 'bigop') return 4.5;
  return 9;
}

/** Operators that a body open on the right reads on through. */
const ABSORBED = new Set(['mult', 'crossProduct']);

const paren = (t: string): string => `\\left(${t}\\right)`;
const grouped = (e: Expr): string =>
  (e.k === 'id' && e.name.includes('.')) || (e.k === 'op' && e.op === 'indexer') ? `{${tex(e)}}` : at(e, 5);
/**
 * e where it needs to bind at least as tightly as min. `tail` says nothing a product reads on through follows
 * it, so an open construct there needs no brackets: E·I·d²/dx² w(x), as Mathcad shows it.
 */
const at = (e: Expr, min: number, tail = true): string =>
  prec(e) >= min || (tail && openRight(e) && min <= 3.5) ? print(e, tail) : paren(tex(e));

function stmt(s: Stmt): string[] {
  switch (s.k) {
    case 'assign': return [`${target(s.target)}\\gets ${tex(s.value)}`];
    case 'if': return [`${inline(s.then)}\\ \\mathbf{if}\\ ${tex(s.cond)}`];
    case 'otherwise': return [`${inline(s.then)}\\ \\mathbf{otherwise}`];
    case 'for': return [`\\mathbf{for}\\ ${name(s.varName)}\\in ${tex(s.iter)}\\ ${block(s.body)}`];
    case 'while': return [`\\mathbf{while}\\ ${tex(s.cond)}\\ ${block(s.body)}`];
    case 'return': return [`\\mathbf{return}\\ ${tex(s.value)}`];
    case 'block': return [block(s)];
    case 'expr': return [tex(s.e)];
  }
}

const inline = (s: Stmt): string => (s.k === 'block' ? block(s) : stmt(s)[0]!);

function block(s: Stmt): string {
  const body = s.k === 'block' ? s.body : [s];
  return program(body);
}

/**
 * The bar is part of the array. A stretchy \\left| is symmetric about the line, so a program hanging
 * below its first line left as much empty space above it.
 */
const program = (body: Stmt[]): string =>
  `\\begin{array}{|l}${body.flatMap(stmt).join('\\\\')}\\end{array}`;

export function target(t: Target): string {
  switch (t.k) {
    case 'var': return name(t.name);
    case 'index': return `${t.name.includes('.') ? `{${name(t.name)}}` : name(t.name)}_{${t.index.map(tex).join(',')}}`;
    case 'col': return `${name(t.name)}^{\\langle ${tex(t.index)}\\rangle}`;
    // A Mathcad file write's parameter is the file's name, kept as a string so its spaces survive.
    case 'fn': return `${name(t.name)}\\left(${t.params.map((p, i) => (t.file && i === 0 ? `\\text{"${escapeText(p)}"}` : t.file && /^-?[\\d.]/.test(p) ? p : name(p))).join(',')}\\right)`;
    case 'multi': return `\\begin{pmatrix}${t.targets.map(target).join('\\\\')}\\end{pmatrix}`;
    default: return '\\mathrm{unsupported}';
  }
}

export function tex(e: Expr): string {
  return print(e, true);
}

function print(e: Expr, tail: boolean): string {
  switch (e.k) {
    case 'real': return numberText(e.v, e.digits);
    case 'imag': return `${numberText(e.v)}\\mathrm{i}`;
    case 'str': return `\\text{"${escapeText(e.v)}"}`;
    case 'id': return name(e.name);
    case 'placeholder': return '\\placeholder{}';
    case 'matrix': {
      const rows: string[] = [];
      for (let i = 0; i < e.rows; i++) {
        rows.push(Array.from({ length: e.cols }, (_, j) => tex(e.items[i + j * e.rows]!)).join('&'));
      }
      return `\\begin{pmatrix}${rows.join('\\\\')}\\end{pmatrix}`;
    }
    case 'range': return `${tex(e.first)}${e.second ? `,${tex(e.second)}` : ''}..${tex(e.last)}`;
    case 'call': return `${e.fn.k === 'id' ? name(e.fn.name) : paren(tex(e.fn))}\\left(${e.args.map(tex).join(',')}\\right)`;
    case 'program': return program(e.body);
    case 'bigop': {
      const bounds = e.lo && e.hi ? `_{${tex(e.lo)}}^{${tex(e.hi)}}` : ' ';
      if (e.op === 'integral') return `\\int${bounds}${at(e.body, 3)}\\,\\mathrm{d}${name(e.varName)}`;
      const sym = e.op === 'summation' ? '\\sum' : '\\prod';
      // With no limits, it runs over a range variable's values, as Mathcad's range sum does.
      if (!e.lo || !e.hi) return `${sym}_{${name(e.varName)}}${at(e.body, 3)}`;
      return `${sym}_{${name(e.varName)}=${tex(e.lo)}}^{${tex(e.hi)}}${at(e.body, 3)}`;
    }
    case 'limit': {
      const side = e.side === 'left' ? '^{-}' : e.side === 'right' ? '^{+}' : '';
      return `\\lim_{${name(e.varName)}\\to ${tex(e.to)}${side}}${at(e.body, 3)}`;
    }
    case 'derivative': {
      if (!e.degree) return `\\frac{\\mathrm{d}}{\\mathrm{d}${name(e.varName)}}${at(e.body, 3)}`;
      const n = tex(e.degree);
      return `\\frac{\\mathrm{d}^{${n}}}{\\mathrm{d}${name(e.varName)}^{${n}}}${at(e.body, 3)}`;
    }
    case 'op': {
      const [a, b] = e.args;
      const p = PREC[e.op] ?? 9;
      if (INFIX[e.op]) return `${at(a!, p, !ABSORBED.has(e.op))}${INFIX[e.op]}${at(b!, p + 0.5, tail)}`;
      switch (e.op) {
        case 'div': return `\\frac{${tex(a!)}}{${tex(b!)}}`;
        case 'pow': return `{${at(a!, 5)}}^{${tex(b!)}}`;
        case 'neg': return `-${at(a!, 3.5, tail)}`;
        case 'sqrt': return `\\sqrt{${tex(a!)}}`;
        case 'nthRoot': return `\\sqrt[${tex(a!)}]{${tex(b!)}}`;
        case 'absval': return `\\left|${tex(a!)}\\right|`;
        case 'transpose': return `{${at(a!, 5)}}^{\\mathsf{T}}`;
        case 'vectorize': return `\\overrightarrow{${tex(a!)}}`;
        case 'vectorSum': return `\\sum ${at(a!, 5)}`;
        case 'not': return `\\lnot ${at(a!, 5)}`;
        case 'factorial': return `${at(a!, 5)}!`;
        case 'indexer': return `${grouped(a!)}_{${e.args.slice(1).map(tex).join(',')}}`;
        case 'matcol': return `{${at(a!, 5)}}^{\\langle ${tex(b!)}\\rangle}`;
        default: return `\\mathrm{op:${e.op}}`;
      }
    }
    default: return `\\mathrm{unsupported}`;
  }
}

// Reading back.
type Tok = { t: 'cmd' | 'ch' | 'num' | 'text'; v: string };

/** Text as written inside \\text{…}, with its escapes undone. Spaces count here. */
function decodeText(raw: string): string {
  return raw.replace(/\\([A-Za-z]+)(\{\}| )?|\\(.)/g, (whole, word: string | undefined, _gap, symbol: string | undefined) => {
    if (symbol !== undefined) return symbol;
    const cmd = `\\${word}`;
    if (TEXT_SYMBOLS[cmd] !== undefined) return TEXT_SYMBOLS[cmd]!;
    if (cmd === '\\degree') return '°';
    return UNGREEK[cmd] ?? whole;
  });
}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+\*?|.)/s.exec(src.slice(i))!;
      out.push({ t: 'cmd', v: `\\${m[1]}` });
      i += m[0].length;
      // Text is read as one token: the math lexer would drop its spaces.
      if (m[1] === 'text' && src[i] === '{') {
        let depth = 1;
        let j = i + 1;
        for (; j < src.length && depth > 0; j++) {
          if (src[j] === '\\') j++;
          else if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
        }
        out.push({ t: 'text', v: decodeText(src.slice(i + 1, j - 1)) });
        i = j;
      }
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (src.startsWith('..', i)) {
      out.push({ t: 'ch', v: '..' });
      i += 2;
      continue;
    }
    const n = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i));
    if (n) {
      out.push({ t: 'num', v: n[0] });
      i += n[0].length;
      continue;
    }
    out.push({ t: 'ch', v: ch });
    i++;
  }
  return out;
}

const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });
/** How the editor spells some characters in text. */
const TEXT_SYMBOLS: Record<string, string> = {
  '\\textbackslash': '\\', '\\textquotedbl': '"', '\\textunderscore': '_', '\\textasciitilde': '~', '\\textasciicircum': '^',
  '\\textbraceleft': '{', '\\textbraceright': '}',
};

/** Function names LaTeX writes as commands, as pasted or as MathLive writes them: each reads as Mathcad's name. */
const TYPED_FUNCTIONS = new Map([
  ...['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth', 'ln', 'log', 'exp', 'max', 'min'].map((f) => [`\\${f}`, f] as const),
  ['\\arcsin', 'asin'], ['\\arccos', 'acos'], ['\\arctan', 'atan'],
]);
const SPACING = new Set(['\\,', '\;', '\\:', '\\!', '\\ ', '\\quad', '\\qquad']);
const REL: Record<string, string> = {
  '=': 'equal', '\\ne': 'notEqual', '\\neq': 'notEqual', '<': 'lessThan', '>': 'greaterThan', '\\le': 'lessOrEqual', '\\leq': 'lessOrEqual',
  '\\ge': 'greaterOrEqual', '\\geq': 'greaterOrEqual', '\\land': 'and', '\\lor': 'or', '\\oplus': 'xor', '\\wedge': 'and', '\\vee': 'or',
};

export function exprToTarget(e: Expr): Target {
  if (e.k === 'id') return { k: 'var', name: e.name };
  if (e.k === 'call' && e.fn.k === 'id') {
    // A parameter is a name: WRITEPRN("out.prn") := M, Mathcad's way of writing a file, isn't a definition here.
    // Mathcad writes a file by defining a file function at its name: WRITEBMP("out.bmp") := M.
    // WRITEWAV("out.wav", 8000, 16) := M also takes a rate and bits, each a number or a name.
    if (MATHCAD_WRITES.has(e.fn.name) && e.args[0]?.k === 'str' && e.args.slice(1).every((a) => a.k === 'real' || a.k === 'id')) {
      return { k: 'fn', name: e.fn.name, params: [e.args[0].v, ...e.args.slice(1).map((a) => (a.k === 'real' ? String(a.v) : (a as { name: string }).name))], file: true };
    }
    if (e.args.some((a) => a.k !== 'id')) throw new Error("a function's parameters must be names");
    return { k: 'fn', name: e.fn.name, params: e.args.map((a) => (a as { name: string }).name) };
  }
  if (e.k === 'op' && e.op === 'indexer' && e.args[0]?.k === 'id') return { k: 'index', name: e.args[0].name, index: e.args.slice(1) };
  if (e.k === 'op' && e.op === 'matcol' && e.args[0]?.k === 'id') return { k: 'col', name: e.args[0].name, index: e.args[1]! };
  if (e.k === 'matrix') return { k: 'multi', targets: e.items.map(exprToTarget) };
  throw new Error('not a definable target');
}

export function readTex(src: string): Expr {
  const toks = lex(src);
  let p = 0;
  const heads = new Map<Tok, string>();
  let integrals = 0;
  const toksHead = (n: Tok): string => heads.get(n) ?? '';
  const skip = (): void => {
    while (toks[p] && SPACING.has(toks[p]!.v)) p++;
  };
  const peek = (): Tok | undefined => {
    skip();
    return toks[p];
  };
  const is = (v: string): boolean => peek()?.v === v;
  const eat = (v: string): void => {
    if (!is(v)) throw new Error(`expected ${v}, found ${peek()?.v ?? 'end'} at ${p}`);
    p++;
  };
  const rawBetween = (): string => {
    if (toks[p]?.t === 'text') return toks[p++]!.v;
    eat('{');
    let depth = 1;
    let out = '';
    while (p < toks.length) {
      const t = toks[p++]!;
      if (t.v === '{') depth++;
      if (t.v === '}' && --depth === 0) return out;
      if (TEXT_SYMBOLS[t.v] !== undefined) out += TEXT_SYMBOLS[t.v];
      else if (t.v === '\\degree') out += '°';
      else if (UNGREEK[t.v]) out += UNGREEK[t.v];
      else out += t.v.startsWith('\\') && t.v.length === 2 && !/[A-Za-z]/.test(t.v[1]!) ? t.v[1]! : t.v;
    }
    throw new Error('unclosed group');
  };
  const group = (): Expr => {
    const n = peek();
    if (n?.t === 'num' && /^\d\d/.test(n.v)) {
      // `\\frac12` and `x^23`: a bare argument is a single digit.
      heads.set(n, n.v[0]!);
      n.v = n.v.slice(1);
      return { k: 'real', v: Number(toksHead(n)) };
    }
    if (is('{')) {
      p++;
      const e = relation();
      eat('}');
      return e;
    }
    return atom();
  };
  const scriptList = (): Expr[] => {
    if (!is('{')) return [atom()];
    p++;
    const items = [relation()];
    while (is(',')) {
      p++;
      items.push(relation());
    }
    eat('}');
    return items;
  };
  const identifier = (base: string): Expr => {
    let name = base;
    if (is('_') && toks[p + 1]?.v === '{' && toks[p + 2]?.v === '\\text') {
      p += 3;
      const sub = rawBetween();
      eat('}');
      name = `${base}.${sub}`;
    } else if (is('_') && toks[p + 1]?.v === '\\text') {
      p += 2;
      name = `${base}.${rawBetween()}`;
    }
    return { k: 'id', name: name + primes() };
  };
  /**
   * Primes after a name, as y′ and y″ for derivatives in an Odesolve block: Mathcad keeps them in the name,
   * as y''. Typed as apostrophes, or as ^{\prime} the way an editor may write them.
   */
  const primes = (): string => {
    let out = '';
    for (;;) {
      if (is("'")) {
        p++;
        out += "'";
      } else if (is('^') && toks[p + 1]?.v === '{' && toks[p + 2]?.v === '\\prime') {
        p += 2;
        while (is('\\prime')) {
          p++;
          out += "'";
        }
        eat('}');
      } else if (is('^') && toks[p + 1]?.v === '\\prime') {
        p += 2;
        out += "'";
      } else return out;
    }
  };
  /**
   * Adjacent letters are one name, as in Mathcad, Greek ones included (Δx, αβ). Multiplication is
   * always written. A whole name spelled as a Greek letter (alpha) is that letter, apart from Psi( (see below).
   */
  const word = (first: string): string => {
    // A name runs on through letters and digits alike once it has begun with a letter, as Mathcad's do: str2num.
    let w = first;
    for (;;) {
      const t = toks[p];
      if (t?.t === 'ch' && /^[A-Za-z]$/.test(t.v)) w += t.v;
      // ∞ and % stand alone: r% is r times percent, not a name.
      else if (t && t.v !== '\\infty' && t.v !== '\\%' && UNGREEK[t.v]) w += UNGREEK[t.v];
      else if (t?.t === 'num' && /^\d+$/.test(t.v)) w += t.v;
      else break;
      p++;
    }
    // Psi typed as a call is Mathcad's digamma function, Psi(x), not a Ψ: Ψ itself comes from Ctrl+G.
    if (w === 'Psi' && is('\\left') && toks[p + 1]?.v === '(') return w;
    return GREEK_WORDS[w] ?? w;
  };
  const callOrId = (base: string): Expr => {
    const id = identifier(base);
    if (is('\\left') && toks[p + 1]?.v === '(') {
      p += 2;
      const args = is('\\right') ? [] : list();
      eat('\\right');
      eat(')');
      return { k: 'call', fn: id, args };
    }
    if (is('(')) {
      p++;
      const args = is(')') ? [] : list();
      eat(')');
      return { k: 'call', fn: id, args };
    }
    return id;
  };
  const list = (): Expr[] => {
    const items = [relation()];
    while (is(',')) {
      p++;
      items.push(relation());
    }
    return items;
  };
  const env = (name: string): Expr[][] => {
    eat('\\begin');
    eat('{');
    for (const c of name) eat(c);
    eat('}');
    if (name === 'array') {
      eat('{');
      while (!is('}')) p++;
      p++;
    }
    const rows: Expr[][] = [[]];
    for (;;) {
      if (is('\\end')) {
        p++;
        eat('{');
        for (const c of name) eat(c);
        eat('}');
        return rows;
      }
      rows.at(-1)!.push(relation());
      if (is('&')) p++;
      else if (is('\\\\')) {
        p++;
        rows.push([]);
      }
    }
  };
  const statement = (): Stmt => {
    if (is('\\mathbf')) {
      const kw = (toks[p + 2]?.v ?? '') === '' ? '' : (() => {
        p++;
        return rawBetween();
      })();
      if (kw === 'return') return suffix({ k: 'return', value: relation() });
      if (kw === 'for') {
        const v = atom();
        eat('\\in');
        const iter = relation();
        return suffix({ k: 'for', varName: (v as { name: string }).name, iter, body: bodyStmt() });
      }
      if (kw === 'while') {
        const cond = relation();
        return suffix({ k: 'while', cond, body: bodyStmt() });
      }
      throw new Error(`keyword ${kw}`);
    }
    const start = p;
    if (programStarts()) {
      const then = bodyStmt();
      return suffix(then);
    }
    const first = relation();
    if (is('\\gets') || is('\\leftarrow')) {
      p++;
      const tgt = toTarget(first);
      return suffix({ k: 'assign', target: tgt, value: relation() });
    }
    void start;
    return suffix({ k: 'expr', e: first });
  };
  const suffix = (s: Stmt): Stmt => {
    if (!is('\\mathbf')) return s;
    p++;
    const kw = rawBetween();
    if (kw === 'if') return suffix({ k: 'if', cond: relation(), then: s });
    if (kw === 'otherwise') return { k: 'otherwise', then: s };
    throw new Error(`keyword ${kw}`);
  };
  /** A program block: the bar as part of the array, or, as written before, as a \\left| delimiter. */
  const programStarts = (): boolean => {
    if (is('\\left')) return toks[p + 1]?.v === '|' && toks[p + 2]?.v === '\\begin';
    return is('\\begin') && toks[p + 2]?.v === 'a' && toks[p + 3]?.v === 'r' && toks[p + 7]?.v === '}' && toks[p + 8]?.v === '{' && toks[p + 9]?.v === '|';
  };
  const bodyStmt = (): Stmt => {
    if (!programStarts()) return statement();
    const body = programBody();
    return body.length === 1 ? body[0]! : { k: 'block', body };
  };
  const programBody = (): Stmt[] => {
    const delimited = is('\\left');
    if (delimited) {
      eat('\\left');
      eat('|');
    }
    eat('\\begin');
    eat('{');
    for (const c of 'array') eat(c);
    eat('}');
    eat('{');
    while (!is('}')) p++;
    p++;
    const body: Stmt[] = [];
    while (!is('\\end')) {
      body.push(statement());
      if (is('\\\\')) p++;
    }
    p++;
    eat('{');
    for (const c of 'array') eat(c);
    eat('}');
    if (delimited) {
      eat('\\right');
      eat('.');
    }
    return body;
  };
  const toTarget = (e: Expr): Target => {
    if (e.k === 'id') return { k: 'var', name: e.name };
    if (e.k === 'op' && e.op === 'indexer' && e.args[0]?.k === 'id') return { k: 'index', name: e.args[0].name, index: e.args.slice(1) };
    if (e.k === 'op' && e.op === 'matcol' && e.args[0]?.k === 'id') return { k: 'col', name: e.args[0].name, index: e.args[1]! };
    if (e.k === 'matrix') return { k: 'multi', targets: e.items.map(toTarget) };
    throw new Error('not a target');
  };
  /** `dx` as loaded, or as typed, where the upright style runs on and swallows the variable. */
  function differential(): string {
    eat('\\mathrm');
    const word = rawBetween();
    return word === 'd' ? (atom() as { name: string }).name : word.slice(1);
  }
  /**
   * A number followed by an upright i is an imaginary number, and so, as typed in Mathcad, is a number followed
   * straight away by i or j on its own: 4i and 4j are imaginary, where 4·i, 4in and 4i₁ are not.
   */
  function imaginary(v: number, text?: string): Expr {
    if (is('\\mathrm') && toks[p + 1]?.v === '{' && toks[p + 2]?.v === 'i' && toks[p + 3]?.v === '}') {
      p += 4;
      return { k: 'imag', v };
    }
    const next = toks[p];
    if (next?.t === 'ch' && (next.v === 'i' || next.v === 'j') && !/^[A-Za-z0-9_'.]$/.test(toks[p + 1]?.v ?? '')) {
      p++;
      return { k: 'imag', v };
    }
    return text === undefined ? { k: 'real', v } : realFrom(text);
  }
  function atom(): Expr {
    const t = peek();
    if (!t) throw new Error('unexpected end');
    p++;
    if (t.t === 'num') {
      if (is('\\times') && toks[p + 1]?.v === '10' && toks[p + 2]?.v === '^') {
        p += 3;
        const power = group();
        const n = power.k === 'real' ? power.v : power.k === 'op' && power.op === 'neg' ? -(power.args[0] as { v: number }).v : NaN;
        return imaginary(Number(`${t.v}e${n}`), `${t.v}e${n}`);
      }
      return imaginary(Number(t.v), t.v);
    }
    if (t.t === 'ch') {
      if (/[A-Za-z]/.test(t.v)) return callOrId(word(t.v));
      if (t.v === '{') {
        const e = relation();
        eat('}');
        return e;
      }
      if (t.v === '(') {
        const e = relation();
        eat(')');
        return e;
      }
      throw new Error(`unexpected ${t.v}`);
    }
    if (t.v === '\\%') return { k: 'id', name: '%' };
    if (UNGREEK[t.v]) return callOrId(t.v === '\\infty' ? '∞' : word(UNGREEK[t.v]!));
    if (TYPED_FUNCTIONS.has(t.v)) return callOrId(TYPED_FUNCTIONS.get(t.v)!);
    switch (t.v) {
      case '\\mathrm': {
        const base = rawBetween();
        if (base === 'i' ) return { k: 'imag', v: 1 };
        return callOrId(base);
      }
      case '\\operatorname': return callOrId(rawBetween());
      case '\\frac': {
        // d/dx is `\\frac{\\mathrm{d}}{…}`, with d alone. `\\frac{\\mathrm{dL}}{…}` is an ordinary fraction.
        if (is('{') && toks[p + 1]?.v === '\\mathrm' && toks[p + 3]?.v === 'd' && toks[p + 4]?.v === '}' && toks[p + 5]?.v === '}') {
          p += 6;
          eat('{');
          const varName = differential();
          eat('}');
          return { k: 'derivative', varName, body: product() };
        }
        // The nth derivative, `\\frac{\\mathrm{d}^{n}}{\\mathrm{d}x^{n}}`. Its order is read above; the one below,
        // which the editor's blank leaves out, is optional and must match.
        if (is('{') && toks[p + 1]?.v === '\\mathrm' && toks[p + 3]?.v === 'd' && toks[p + 4]?.v === '}' && toks[p + 5]?.v === '^') {
          p += 6;
          const degree = group();
          eat('}');
          eat('{');
          const varName = differential();
          if (is('^')) {
            p++;
            const below = group();
            if (JSON.stringify(below) !== JSON.stringify(degree)) {
              throw new Error(`the derivative's order is ${tex(degree)} above and ${tex(below)} below: make them the same`);
            }
          }
          eat('}');
          return { k: 'derivative', varName, body: product(), degree };
        }
        const a = group();
        return op('div', a, group());
      }
      case '\\sqrt': {
        if (is('[')) {
          p++;
          const n = relation();
          eat(']');
          return op('nthRoot', n, group());
        }
        return op('sqrt', group());
      }
      case '\\left': {
        if (is('(')) {
          p++;
          const e = relation();
          eat('\\right');
          eat(')');
          return e;
        }
        if (is('|')) {
          if (toks[p + 1]?.v === '\\begin' && toks[p + 3]?.v === 'a') {
            p--;
            return { k: 'program', body: programBody() };
          }
          p++;
          const e = relation();
          eat('\\right');
          eat('|');
          return op('absval', e);
        }
        throw new Error(`unknown delimiter ${peek()?.v}`);
      }
      case '\\begin': {
        p--;
        if (programStarts()) return { k: 'program', body: programBody() };
        const rows = env('pmatrix');
        const r = rows.length;
        const c = rows[0]!.length;
        const items: Expr[] = [];
        for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) items.push(rows[i]![j]!);
        return { k: 'matrix', rows: r, cols: c, items };
      }
      case '\\text': {
        // Quotes may come back as '' from the editor.
        const raw = rawBetween();
        return { k: 'str', v: raw.replace(/^(''|")/, '').replace(/(''|")$/, '') };
      }
      case '\\overrightarrow': return op('vectorize', group());
      case '\\lnot': return op('not', group());
      case '\\placeholder': {
        if (is('{')) rawBetween();
        return { k: 'placeholder' };
      }
      case '\\lim': {
        eat('_');
        eat('{');
        const v = atom();
        eat('\\to');
        // A side is written after the limit point, where an exponent would otherwise be read.
        let close = p;
        for (let depth = 0; depth > 0 || toks[close]?.v !== '}'; close++) {
          if (toks[close]?.v === '{') depth++;
          if (toks[close]?.v === '}') depth--;
        }
        let side: 'left' | 'right' | null = null;
        if (toks[close - 4]?.v === '^' && toks[close - 3]?.v === '{' && toks[close - 1]?.v === '}') {
          side = toks[close - 2]?.v === '+' ? 'right' : 'left';
          toks.splice(close - 4, 4);
        }
        const to = relation();
        eat('}');
        return { k: 'limit', varName: (v as { name: string }).name, body: product(), to, side };
      }
      case '\\int': {
        let lo: Expr | null = null;
        let hi: Expr | null = null;
        if (is('_')) {
          p++;
          lo = group();
          eat('^');
          hi = group();
        }
        integrals++;
        const body = additive();
        integrals--;
        return { k: 'bigop', op: 'integral', varName: differential(), body, lo, hi };
      }
      case '\\sum':
      case '\\prod': {
        if (!is('_')) return op('vectorSum', unary());
        eat('_');
        eat('{');
        const v = atom();
        const which = t.v === '\\sum' ? 'summation' : 'product';
        if (is('}')) {
          eat('}');
          return { k: 'bigop', op: which, varName: (v as { name: string }).name, body: product(), lo: null, hi: null };
        }
        eat('=');
        const lo = relation();
        eat('}');
        eat('^');
        const hi = group();
        return { k: 'bigop', op: which, varName: (v as { name: string }).name, body: product(), lo, hi };
      }
      default: throw new Error(`unknown ${t.v}`);
    }
  }
  function scripts(): Expr {
    let base = atom();
    for (;;) {
      if (is('_')) {
        p++;
        base = op('indexer', base, ...scriptList());
      } else if (is('^')) {
        p++;
        if (is('{') && toks[p + 1]?.v === '\\mathsf') {
          p += 2;
          rawBetween();
          eat('}');
          base = op('transpose', base);
        } else if (is('{') && toks[p + 1]?.v === '\\langle') {
          p += 2;
          const i = relation();
          eat('\\rangle');
          eat('}');
          base = op('matcol', base, i);
        } else base = op('pow', base, group());
      } else if (is('!')) {
        p++;
        base = op('factorial', base);
      } else return base;
    }
  }
  const startsFactor = (): boolean => {
    const t = peek();
    if (!t) return false;
    if (t.t === 'num') return true;
    if (t.t === 'ch') return /[A-Za-z(]/.test(t.v);
    if (t.v === '\\left') return toks[p + 1]?.v === '(';
    // Inside an integral, an upright word starting with d is the differential that ends it.
    if (t.v === '\\mathrm' && toks[p + 2]?.v === 'd' && (integrals > 0 || toks[p + 3]?.v === '}')) return false;
    return t.v === '\\mathrm' || t.v === '\\lim' || t.v === '\\frac' || t.v === '\\sqrt' || t.v === '\\operatorname'
      || TYPED_FUNCTIONS.has(t.v) || UNGREEK[t.v] !== undefined;
  };
  function unary(): Expr {
    if (is('-')) {
      p++;
      const e = unary();
      return e.k === 'real' ? { k: 'real', v: -e.v, ...(e.digits ? { digits: `-${e.digits}` } : {}) } : op('neg', e);
    }
    return scripts();
  }
  function product(): Expr {
    let a = unary();
    for (;;) {
      if (is('\\cdot')) {
        p++;
        a = op('mult', a, unary());
      } else if (is('\\times')) {
        p++;
        a = op('crossProduct', a, unary());
      } else if (startsFactor()) {
        // Typed `2x` means 2 times x. Printing always writes \cdot, so this only affects typed input.
        a = op('mult', a, unary());
      } else return a;
    }
  }
  function additive(): Expr {
    let a = product();
    while (is('+') || is('-')) {
      const o = peek()!.v === '+' ? 'plus' : 'minus';
      p++;
      a = op(o, a, product());
    }
    return a;
  }
  function range(): Expr {
    const first = additive();
    if (is('..')) {
      p++;
      return { k: 'range', first, second: null, last: additive() };
    }
    if (is(',')) {
      const mark = p;
      p++;
      try {
        const second = additive();
        if (is('..')) {
          p++;
          return { k: 'range', first, second, last: additive() };
        }
      } catch {
        // Not a stepped range: the comma separates arguments.
      }
      p = mark;
    }
    return first;
  }
  const LOGIC = new Set(['and', 'or', 'xor']);
  const OR = new Set(['or', 'xor']);
  function comparison(): Expr {
    let a = range();
    while (peek() && REL[peek()!.v] && !LOGIC.has(REL[peek()!.v]!)) {
      const o = REL[peek()!.v]!;
      p++;
      a = op(o, a, range());
    }
    return a;
  }
  /** Comparisons joined by ∧, which binds more loosely than they do, as in Mathcad: a < 9 ∧ b < 9 compares first. */
  function conjunction(): Expr {
    let a = comparison();
    while (peek() && REL[peek()!.v] === 'and') {
      p++;
      a = op('and', a, comparison());
    }
    return a;
  }
  /** Then ∨ and ⊕, more loosely still: a ∨ b ∧ c is a ∨ (b ∧ c), as Mathcad 14 reads it. */
  function relation(): Expr {
    let a = conjunction();
    while (peek() && REL[peek()!.v] && OR.has(REL[peek()!.v]!)) {
      const o = REL[peek()!.v]!;
      p++;
      a = op(o, a, conjunction());
    }
    return a;
  }
  const e = relation();
  if (p < toks.length && peek()) throw new Error(`trailing ${peek()?.v}`);
  return e;
}
