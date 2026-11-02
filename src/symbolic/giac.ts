/**
 * The bridge to Giac. Worksheets are untrusted and Giac is a full language, so nothing from a file
 * reaches it as text: commands are printed from the tree, with only numbers, operators, known
 * function names and generated identifiers (`v0`, `f0`).
 */
import type { Content, Expr, SymCommand } from '../model/ast.js';
import { parse } from './text.js';

export interface GiacRequest {
  setup: string[];
  command: string;
  cleanup: string[];
}

/** Mathcad's name, then Giac's. Note that Giac's `log` is natural. */
const FUNCTIONS: Record<string, string> = {
  sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  ln: 'ln', log: 'log10', exp: 'exp', sqrt: 'sqrt', max: 'max', min: 'min', floor: 'floor', ceil: 'ceil', sign: 'sign',
  Re: 're', Im: 'im', sec: 'sec', csc: 'csc', cot: 'cot',
};

const CONSTANTS: Record<string, string> = { 'π': 'pi', e: 'e', '∞': '(+infinity)' };

/** What comes back. Generated names map back separately. */
const FROM_GIAC: Record<string, Expr> = {
  pi: { k: 'id', name: 'π' }, e: { k: 'id', name: 'e' }, i: { k: 'imag', v: 1 }, infinity: { k: 'id', name: '∞' },
};

const KEYWORDS_WITH_ARGUMENT = ['solve', 'collect', 'coeffs', 'series', 'substitute', 'parfrac', 'assume'];
const KEYWORDS_PLAIN = ['simplify', 'expand', 'factor', 'float'];
export const KEYWORDS = [...KEYWORDS_PLAIN, ...KEYWORDS_WITH_ARGUMENT];

export class Printer {
  private names = new Map<string, string>();
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
      case 'real': return e.v < 0 ? `(${e.v})` : String(e.v);
      case 'imag': return `(${e.v}*i)`;
      case 'id': return CONSTANTS[e.name] ?? this.name(e.name);
      case 'matrix': {
        if (e.cols === 1) return `[${e.items.map(p).join(',')}]`;
        const rows: string[] = [];
        for (let i = 0; i < e.rows; i++) rows.push(`[${Array.from({ length: e.cols }, (_, j) => p(e.items[i + j * e.rows]!)).join(',')}]`);
        return `[${rows.join(',')}]`;
      }
      case 'call': return `${this.fn((e.fn as { name: string }).name)}(${e.args.map(p).join(',')})`;
      case 'derivative': return `diff(${p(e.body)},${this.name(e.varName)})`;
      case 'limit': {
        const side = e.side === 'left' ? ',-1' : e.side === 'right' ? ',1' : '';
        return `limit(${p(e.body)},${this.name(e.varName)},${p(e.to)}${side})`;
      }
      case 'bigop': {
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

function applyKeyword(cmd: string, c: SymCommand, p: Printer, req: GiacRequest): string {
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
  if (numeric && ['coeffs', 'collect', 'parfrac', 'substitute', 'assume'].includes(c.name)) return cmd;
  const substituted = c.name === 'substitute' && first?.k === 'op' && first.args[0]?.k !== 'id';
  if (substituted) return cmd;
  switch (c.name) {
    case 'simplify': return `simplify(${cmd})`;
    case 'expand': return /\b(sin|cos|tan)\(/.test(cmd) ? `texpand(${cmd})` : `expand(${cmd})`;
    case 'factor': return `factor(${cmd})`;
    case 'collect': return `collect(${cmd})`;
    // Mathcad lists coefficients from the constant term up.
    case 'coeffs': return `revlist(coeffs(${cmd},${arg(0)}))`;
    case 'parfrac': return `partfrac(${cmd},${arg(0)})`;
    case 'substitute': return `subst(${cmd},${arg(0)})`;
    case 'solve': return `csolve(${cmd},${arg(0)})`;
    case 'series': return `convert(series(${cmd},${c.args[0]?.k === 'id' ? `${arg(0)}=0` : arg(0)},${c.args[1] ? arg(1) : 6}),polynom)`;
    case 'float': return `evalf(${cmd},${c.args[0] ? arg(0) : 20})`;
    case 'assume':
      req.setup.push(`assume(${arg(0)})`);
      return cmd;
    default: throw new Error(`unknown keyword ${c.name}`);
  }
}

export function buildRequest(expanded: Expr, commands: SymCommand[], p: Printer): GiacRequest {
  const req: GiacRequest = { setup: [], command: '', cleanup: [] };
  // Without a keyword, combine like terms and leave the rest as written, as a plain arrow does.
  let cmd = p.print(expanded);
  if (commands.length === 0) cmd = `regroup(${cmd})`;
  for (const command of commands) cmd = applyKeyword(cmd, command, p, req);
  req.command = cmd;
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
      return FROM_GIAC[e.name] ?? e;
    }
    case 'matrix': return { ...e, items: e.items.map(go) };
    case 'op': return { ...e, args: e.args.map(go) };
    case 'call': {
      const name = (e.fn as { name: string }).name;
      const args = e.args.map(go);
      if (name === 'sqrt') return { k: 'op', op: 'sqrt', args };
      if (name === 'abs') return { k: 'op', op: 'absval', args };
      if (name === 'exp') return { k: 'op', op: 'pow', args: [{ k: 'id', name: 'e' }, args[0]!] };
      const sheet = p.back.get(name);
      const mapped = Object.entries(FUNCTIONS).find(([, giac]) => giac === name)?.[0];
      return { ...e, fn: { k: 'id', name: sheet ?? mapped ?? name }, args };
    }
    default: return e;
  }
}

export type GiacAnswer =
  | { result: Expr }
  | { error: string }
  | { unevaluated: true }
  /** Exact but unreadable, such as a `rootof`. Ask again for a number. */
  | { retry: string };

const UNEVALUATED = /\b(integrate|int|sum|product|limit|diff)\(/;

export function readAnswer(out: string, c: Sym, req: GiacRequest, p: Printer): GiacAnswer {
  // Giac adds an approximation to exact results: 2*sqrt(2)=2.82842712475.
  const text = out.trim().replace(/=-?[\d.]+(e[+-]?\d+)?$/, '');
  if (text.startsWith('ERROR ')) return { error: text.slice(6) };
  if (text.includes('undef')) return { error: 'This has no defined value' };
  if (/^-?infinity$/.test(text) && !hasLimitProcess(c)) return { error: 'This has no defined value' };
  if (text.includes('rootof')) return { retry: `evalf(${req.command})` };
  if (UNEVALUATED.test(text)) return { unevaluated: true };
  let e = backToSheet(parse(text), p);
  // One solution shows on its own, and none is an error.
  if (e.k === 'matrix' && e.cols === 1 && c.commands.some((k) => k.name === 'solve')) {
    if (e.rows === 0) return { error: 'No solution was found' };
    if (e.rows === 1) e = e.items[0]!;
  }
  return { result: e };
}
