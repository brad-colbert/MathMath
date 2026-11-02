/** Reads math as the algebra engine prints it, into the worksheet tree. */
import type { Expr } from '../model/ast.js';

type Tok = { t: 'num' | 'id' | 'op'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|!=|==|[-+*/^()[\],=<>!]))/y;
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(at))) break;
      throw new Error(`can't read "${src.slice(at, at + 24)}"`);
    }
    at = re.lastIndex;
    if (m[1]) out.push({ t: 'num', v: m[1] });
    else if (m[2]) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3]! });
  }
  return out;
}

const op = (o: string, ...args: Expr[]): Expr => ({ k: 'op', op: o, args });

function toMatrix(items: Expr[]): Expr {
  const rows = items.filter((i): i is Extract<Expr, { k: 'matrix' }> => i.k === 'matrix');
  if (rows.length === items.length && rows.length > 0) {
    const cols = rows[0]!.rows;
    const cells: Expr[] = [];
    for (let j = 0; j < cols; j++) for (const r of rows) cells.push(r.items[j]!);
    return { k: 'matrix', rows: rows.length, cols, items: cells };
  }
  return { k: 'matrix', rows: items.length, cols: 1, items };
}

export function parse(src: string): Expr {
  const toks = lex(src);
  let p = 0;
  const isOp = (v: string): boolean => toks[p]?.t === 'op' && toks[p]!.v === v;
  const eat = (v: string): void => {
    if (!isOp(v)) throw new Error(`expected ${v} at ${toks[p]?.v ?? 'the end'}`);
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
      if (!isOp(',')) break;
      p++;
    }
    eat(close);
    return items;
  };
  function atom(): Expr {
    const t = toks[p];
    if (!t) throw new Error('unexpected end');
    p++;
    if (t.t === 'num') return { k: 'real', v: Number(t.v) };
    if (t.t === 'id') {
      if (isOp('(')) {
        p++;
        return { k: 'call', fn: { k: 'id', name: t.v }, args: list(')') };
      }
      if (isOp('[') && (t.v === 'list' || t.v === 'poly1' || t.v === 'set')) {
        p++;
        return toMatrix(list(']'));
      }
      return { k: 'id', name: t.v };
    }
    if (t.v === '(') {
      const e = relation();
      eat(')');
      return e;
    }
    if (t.v === '[') return toMatrix(list(']'));
    throw new Error(`unexpected ${t.v}`);
  }
  function power(): Expr {
    let base = atom();
    while (isOp('!')) {
      p++;
      base = op('factorial', base);
    }
    if (isOp('^')) {
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
      const o = toks[p]!.v === '*' ? 'mult' : 'div';
      p++;
      a = op(o, a, unary());
    }
    return a;
  }
  function sum(): Expr {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const o = toks[p]!.v === '+' ? 'plus' : 'minus';
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
  if (p !== toks.length) throw new Error(`trailing ${toks[p]?.v}`);
  return e;
}
