/** Runs a worksheet off the main thread, so a long calculation can't freeze the page. */
import { type SymAnswer, type SymSolver, runWithSymbolics } from '../engine/evaluate.js';
import { tex } from '../latex/latex.js';
import type { Content, Expr, NumberFormat, Region, Worksheet } from '../model/ast.js';
import type { Defs } from '../symbolic/defs.js';
import { NotSymbolic, expand } from '../symbolic/expand.js';
import { type GiacRequest, Printer, buildRequest, readAnswer } from '../symbolic/giac.js';
import { formatValue } from '../ui/format.js';

export interface ComputeRequest {
  seq: number;
  sheet: Pick<Worksheet, 'regions' | 'origin' | 'tol' | 'format'>;
}

/** What the page needs for one region. Values can't cross to the page, so they travel as LaTeX. */
export interface Shown {
  id: string;
  value?: string;
  error?: string;
  /** Symbolic evaluation found no closed form. */
  unevaluated?: boolean;
}

/** Messages to the page, which owns the long-lived algebra engine. */
export interface AskAlgebra { ask: GiacRequest; id: number }

const formatFor = (r: Region, fallback: NumberFormat): NumberFormat =>
  (r.content.k === 'define' || r.content.k === 'eval' ? r.content.format : undefined) ?? fallback;

const pending = new Map<number, (out: string) => void>();
let nextAsk = 1;

function ask(request: GiacRequest): Promise<string> {
  const id = nextAsk++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const message: AskAlgebra = { ask: request, id };
    self.postMessage(message);
  });
}

const solve: SymSolver = async (c: Extract<Content, { k: 'sym' }>, defs: Defs): Promise<SymAnswer> => {
  try {
    // Definitions apply everywhere, keyword arguments included. Tested in Mathcad 14: with x := 5,
    // `x²+2x coeffs,x` gives 35, and `solve,x` is an error.
    const clear = (): Set<string> => new Set();
    const expr: Expr = expand(c.expr, defs, clear());
    const commands = c.commands.map((k) => ({ name: k.name, args: k.args.map((a) => expand(a, defs, clear())) }));
    const printer = new Printer();
    const request = buildRequest(expr, commands, printer);
    let answer = readAnswer(await ask(request), c, request, printer);
    if ('retry' in answer) answer = readAnswer(await ask({ ...request, command: answer.retry }), c, request, printer);
    if ('result' in answer) return { result: answer.result };
    if ('unevaluated' in answer) return { result: null, unevaluated: true };
    if ('error' in answer) return { result: null, error: answer.error };
    return { result: null, error: 'No usable answer came back' };
  } catch (err) {
    if (err instanceof NotSymbolic) return { result: null, error: err.message };
    return { result: null, error: (err as Error).message };
  }
};

async function run({ seq, sheet }: ComputeRequest): Promise<void> {
  const ws: Worksheet = { ...sheet, page: null as never, texts: [], opaque: [], otherRegions: {}, componentOutputs: [] };
  const shown: Shown[] = (await runWithSymbolics(ws, solve)).map((o) => {
    const id = o.region.id;
    if (o.error) return { id, error: o.error.reason };
    if (o.unevaluated) return { id, unevaluated: true };
    if (o.symbolic) return { id, value: tex(o.symbolic) };
    return o.value ? { id, value: formatValue(o.value, formatFor(o.region, sheet.format)) } : { id };
  });
  self.postMessage({ seq, shown });
}

self.onmessage = (m: MessageEvent<ComputeRequest | { answer: string; id: number }>) => {
  const data = m.data;
  if ('answer' in data) {
    pending.get(data.id)?.(data.answer);
    pending.delete(data.id);
  } else {
    // A failure here must end the calculation visibly, or the page waits for ever.
    run(data).catch((err: Error) => self.postMessage({ seq: data.seq, shown: [], failure: err.message }));
  }
};
