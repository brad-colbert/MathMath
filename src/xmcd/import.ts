import type {
  Content, Expr, NumberFormat, OpaqueRegion, PageModel, Region, Stmt, StoredResult, StoredUnit, StoredValue, Target, TextRegion,
  Worksheet,
} from '../model/ast.js';
import { DEFAULT_FORMAT, DEFAULT_PAGE } from '../model/ast.js';

/** The part of the DOM used here, so the same code runs on @xmldom in Node and in a browser. */
export interface XElement {
  localName: string | null;
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<XElement>;
  getAttribute(name: string): string | null;
}

const kids = (e: XElement): XElement[] => {
  const out: XElement[] = [];
  for (let i = 0; i < e.childNodes.length; i++) {
    const c = e.childNodes[i]!;
    if (c.nodeType === 1) out.push(c);
  }
  return out;
};

const num = (e: XElement, name: string): number => Number(e.getAttribute(name) ?? 0);

function descendants(e: XElement, tag: string, out: XElement[] = []): XElement[] {
  for (const c of kids(e)) {
    if (c.localName === tag) out.push(c);
    descendants(c, tag, out);
  }
  return out;
}

const idName = (e: XElement): string => {
  const text = (e.textContent ?? '').trim();
  const sub = e.getAttribute('subscript');
  return sub ? `${text}.${sub}` : text;
};

const parseNumber = (text: string | null): number => {
  const t = (text ?? '').trim();
  if (t === 'NaN') return NaN;
  return Number(t);
};

const PROVENANCE_META = new Set(['originRef', 'parentRef', 'comment', 'originComment', 'contentHash']);
const CONTROL_TAGS = new Set(['localDefine', 'ifThen', 'otherwise', 'for', 'while', 'return', 'program']);

function argList(args: XElement[]): XElement[] {
  return args.flatMap((a) => (a.localName === 'sequence' ? kids(a) : [a]));
}

function boundOne(e: XElement): string {
  const names = kids(e).map(idName);
  return names[0] ?? '';
}

function parseApply(e: XElement): Expr {
  const [head, ...rest] = kids(e);
  if (!head) return { k: 'unsupported', tag: 'apply:empty' };
  const tag = head.localName ?? '';
  if (tag === 'integral' || tag === 'summation' || tag === 'product') {
    const [lambda, bounds] = rest;
    const [vars, body] = lambda ? kids(lambda) : [];
    const [lo, hi] = bounds ? kids(bounds) : [];
    if (!vars || !body) return { k: 'unsupported', tag: `${tag}:shape` };
    return {
      k: 'bigop', op: tag, varName: boundOne(vars), body: parseExpr(body), lo: lo ? parseExpr(lo) : null, hi: hi ? parseExpr(hi) : null,
    };
  }
  if (tag === 'limit') {
    const [lambda, to] = rest;
    const [vars, body] = lambda ? kids(lambda) : [];
    if (!vars || !body || !to) return { k: 'unsupported', tag: 'limit:shape' };
    const direction = head.getAttribute('direction');
    const side = direction === 'left' || direction === 'right' ? direction : null;
    return { k: 'limit', varName: boundOne(vars), body: parseExpr(body), to: parseExpr(to), side };
  }
  if (tag === 'derivative') {
    const [vars, body] = rest[0] ? kids(rest[0]) : [];
    if (!vars || !body) return { k: 'unsupported', tag: 'derivative:shape' };
    return { k: 'derivative', varName: boundOne(vars), body: parseExpr(body) };
  }
  const args = argList(rest).map(parseExpr);
  if (tag === 'id' || tag === 'apply' || tag === 'parens') return { k: 'call', fn: parseExpr(head), args };
  return { k: 'op', op: tag, args };
}

export function parseExpr(e: XElement): Expr {
  const tag = e.localName ?? '';
  switch (tag) {
    case 'real': return { k: 'real', v: parseNumber(e.textContent) };
    case 'imag': return { k: 'imag', v: parseNumber(e.textContent) };
    case 'str': return { k: 'str', v: e.textContent ?? '' };
    case 'id': return { k: 'id', name: idName(e) };
    case 'placeholder': return { k: 'placeholder' };
    case 'parens': {
      const inner = kids(e)[0];
      return inner ? parseExpr(inner) : { k: 'placeholder' };
    }
    case 'matrix':
      return { k: 'matrix', rows: num(e, 'rows'), cols: num(e, 'cols'), items: kids(e).map(parseExpr) };
    case 'range': {
      const [a, last] = kids(e);
      if (!a || !last) return { k: 'unsupported', tag: 'range:shape' };
      if (a.localName === 'sequence') {
        const [first, second] = kids(a);
        return { k: 'range', first: parseExpr(first!), second: second ? parseExpr(second) : null, last: parseExpr(last) };
      }
      return { k: 'range', first: parseExpr(a), second: null, last: parseExpr(last) };
    }
    case 'apply': return parseApply(e);
    case 'program': return { k: 'program', body: kids(e).map(parseStmt) };
    case 'provenance': {
      const inner = kids(e).filter((c) => !PROVENANCE_META.has(c.localName ?? '')).at(-1);
      return inner ? parseExpr(inner) : { k: 'unsupported', tag };
    }
    case 'localDefine':
    case 'ifThen':
    case 'for':
    case 'while':
    case 'return':
      // A one-line program has no <program> wrapper.
      return { k: 'program', body: [parseStmt(e)] };
    default: return { k: 'unsupported', tag };
  }
}

const unwrap = (e: XElement): XElement =>
  e.localName === 'provenance' ? (kids(e).filter((c) => !PROVENANCE_META.has(c.localName ?? '')).at(-1) ?? e) : e;

function parseTarget(raw: XElement): Target {
  const e = unwrap(raw);
  const tag = e.localName ?? '';
  if (tag === 'id') return { k: 'var', name: idName(e) };
  if (tag === 'function') {
    const [name, vars] = kids(e);
    if (!name || !vars) return { k: 'unsupported', tag: 'function:shape' };
    return { k: 'fn', name: idName(name), params: kids(vars).map(idName) };
  }
  if (tag === 'matrix') return { k: 'multi', targets: kids(e).map(parseTarget) };
  if (tag === 'apply') {
    const [head, base, ...rest] = kids(e);
    if (head?.localName === 'indexer' && base?.localName === 'id') {
      return { k: 'index', name: idName(base), index: argList(rest).map(parseExpr) };
    }
    if (head?.localName === 'matcol' && base?.localName === 'id' && rest[0]) {
      return { k: 'col', name: idName(base), index: parseExpr(rest[0]) };
    }
    return { k: 'unsupported', tag: `target:${head?.localName ?? 'empty'}` };
  }
  return { k: 'unsupported', tag: `target:${tag}` };
}

function parseStmt(e: XElement): Stmt {
  const tag = e.localName ?? '';
  if (!CONTROL_TAGS.has(tag)) return { k: 'expr', e: parseExpr(e) };
  const [a, b, c] = kids(e);
  const empty: Stmt = { k: 'expr', e: { k: 'placeholder' } };
  switch (tag) {
    case 'localDefine': return { k: 'assign', target: parseTarget(a!), value: parseExpr(b!) };
    case 'ifThen': return { k: 'if', cond: parseExpr(a!), then: b ? parseStmt(b) : empty };
    case 'otherwise': return { k: 'otherwise', then: a ? parseStmt(a) : empty };
    case 'for': return { k: 'for', varName: idName(a!), iter: parseExpr(b!), body: c ? parseStmt(c) : empty };
    case 'while': return { k: 'while', cond: parseExpr(a!), body: b ? parseStmt(b) : empty };
    case 'return': return { k: 'return', value: parseExpr(a!) };
    default: return { k: 'block', body: kids(e).map(parseStmt) };
  }
}

function parseStoredValue(e: XElement): StoredValue {
  const tag = e.localName;
  if (tag === 'real') return { k: 'num', re: parseNumber(e.textContent), im: 0 };
  if (tag === 'imag') return { k: 'num', re: 0, im: parseNumber(e.textContent) };
  if (tag === 'complex') {
    const [re, im] = kids(e);
    return { k: 'num', re: parseNumber(re?.textContent ?? '0'), im: parseNumber(im?.textContent ?? '0') };
  }
  if (tag === 'str') return { k: 'str', v: e.textContent ?? '' };
  if (tag === 'matrix') {
    return { k: 'mat', rows: num(e, 'rows'), cols: num(e, 'cols'), items: kids(e).map(parseStoredValue) };
  }
  return { k: 'str', v: `<${tag ?? ''}>` };
}

function parseStored(e: XElement): StoredResult | null {
  const inner = kids(e)[0];
  if (!inner) return null;
  if (inner.localName !== 'unitedValue') return { value: parseStoredValue(inner), units: [] };
  const [value, monomial] = kids(inner);
  if (!value) return null;
  const units: StoredUnit[] = (monomial ? kids(monomial) : []).map((u) => ({
    unit: u.getAttribute('unit') ?? '',
    power: Number(u.getAttribute('power-numerator') ?? 1) / Number(u.getAttribute('power-denominator') ?? 1),
  }));
  return { value: parseStoredValue(value), units };
}

function parseEval(e: XElement): { expr: Expr; stored: StoredResult | null; unit: Expr | null } {
  const cs = kids(e);
  const result = cs.find((c) => c.localName === 'result');
  const body = cs.find((c) => c.localName !== 'result' && c.localName !== 'unitOverride');
  const override = cs.find((c) => c.localName === 'unitOverride');
  const unit = override ? kids(override)[0] : undefined;
  return {
    expr: body ? parseExpr(body) : { k: 'placeholder' },
    stored: result ? parseStored(result) : null,
    unit: unit ? parseExpr(unit) : null,
  };
}

function parseSym(e: XElement, target: Target | null, global: boolean): Content {
  const cs = kids(e);
  const body = cs.find((c) => c.localName !== 'command' && c.localName !== 'symResult');
  if (!body) return { k: 'other', tag: 'symEval' };
  const commands = cs.filter((c) => c.localName === 'command').map((c) => {
    const [name, ...args] = kids(c);
    return { name: name?.textContent?.trim() ?? '', args: args.map(parseExpr) };
  });
  const result = kids(cs.find((c) => c.localName === 'symResult') ?? e).find((c) => c.localName !== 'command');
  const hasResult = cs.some((c) => c.localName === 'symResult');
  return { k: 'sym', target, global, expr: parseExpr(body), commands, stored: hasResult && result ? parseExpr(result) : null };
}

const storedParts = ({ stored, unit }: { stored: StoredResult | null; unit: Expr | null }) => ({ stored, unit });

function readFormat(general: XElement | undefined): NumberFormat | undefined {
  if (!general) return undefined;
  return {
    precision: Number(general.getAttribute('precision') ?? DEFAULT_FORMAT.precision),
    exponent: Number(general.getAttribute('exponential-threshold') ?? DEFAULT_FORMAT.exponent),
    trailingZeros: general.getAttribute('show-trailing-zeros') === 'true',
  };
}

function parseMath(math: XElement): Content {
  let top = kids(math).find((c) => c.localName !== 'resultFormat');
  if (top?.localName === 'provenance') {
    top = kids(top).find((c) => ['define', 'globalDefine', 'eval', 'symEval'].includes(c.localName ?? '')) ?? top;
  }
  if (!top) return { k: 'other', tag: 'empty' };
  const own = kids(math).find((c) => c.localName === 'resultFormat');
  const general = own ? descendants(own, 'general')[0] : undefined;
  const format = readFormat(general);
  const withFormat = format ? { format } : {};
  if (top.localName === 'eval') return { k: 'eval', ...parseEval(top), ...withFormat };
  if (top.localName === 'symEval') return parseSym(top, null, false);
  if (top.localName === 'define' || top.localName === 'globalDefine') {
    const [t, raw] = kids(top);
    if (!t || !raw) return { k: 'other', tag: 'define:shape' };
    const v = unwrap(raw);
    const global = top.localName === 'globalDefine';
    const target = parseTarget(t);
    if (v.localName === 'symEval') return parseSym(v, target, global);
    if (v.localName === 'eval') {
      return { k: 'define', target, value: parseEval(v).expr, global, ...storedParts(parseEval(v)), shown: true, ...withFormat };
    }
    return { k: 'define', target, value: parseExpr(v), global, stored: null, unit: null, shown: false };
  }
  // A bare expression: math written to be read. Unknown elements stay `other`.
  const shown = parseExpr(top);
  return shown.k === 'unsupported' ? { k: 'other', tag: top.localName ?? '' } : { k: 'show', expr: shown };
}

function readPage(root: XElement): PageModel {
  const model = descendants(root, 'pageModel')[0];
  if (!model) return DEFAULT_PAGE;
  const margins = kids(model).find((c) => c.localName === 'margins');
  const landscape = model.getAttribute('orientation') === 'landscape';
  return {
    width: num(model, 'page-width') || (landscape ? DEFAULT_PAGE.height : DEFAULT_PAGE.width),
    height: num(model, 'page-height') || (landscape ? DEFAULT_PAGE.width : DEFAULT_PAGE.height),
    landscape,
    margins: margins
      ? { left: num(margins, 'left'), right: num(margins, 'right'), top: num(margins, 'top'), bottom: num(margins, 'bottom') }
      : DEFAULT_PAGE.margins,
  };
}

function readItems(root: XElement): Map<string, string> {
  const items = new Map<string, string>();
  for (const item of descendants(root, 'item')) {
    const id = item.getAttribute('item-id');
    if (id) items.set(id, (item.textContent ?? '').replace(/\s+/g, ''));
  }
  return items;
}

/** `serialize` keeps the original XML of regions this version can't edit. */
export function importWorksheet(root: XElement, serialize?: (e: XElement) => string): Worksheet {
  const regions: Region[] = [];
  const texts: TextRegion[] = [];
  const opaque: OpaqueRegion[] = [];
  const binary = readItems(root);
  const otherRegions: Record<string, number> = {};
  const componentOutputs: string[] = [];
  for (const r of descendants(root, 'region')) {
    const body = kids(r).find((c) => c.localName !== 'rendering');
    if (!body) continue;
    if (body.localName === 'text') {
      texts.push({
        id: r.getAttribute('region-id') ?? '',
        left: num(r, 'left'),
        top: num(r, 'top'),
        width: num(r, 'width'),
        height: num(r, 'height'),
        text: (body.textContent ?? '').replace(/\s+/g, ' ').trim(),
      });
      continue;
    }
    if (body.localName !== 'math') {
      const name = body.localName ?? 'unknown';
      otherRegions[name] = (otherRegions[name] ?? 0) + 1;
      if (name === 'component') {
        for (const out of kids(body).filter((c) => c.localName === 'outputs')) {
          for (const id of descendants(out, 'id')) componentOutputs.push(idName(id));
        }
      }
      const rendering = kids(r).find((c) => c.localName === 'rendering')?.getAttribute('item-idref');
      const items: Record<string, string> = {};
      const own = body.getAttribute('item-idref');
      if (own && binary.has(own)) items[own] = binary.get(own)!;
      opaque.push({
        id: r.getAttribute('region-id') ?? '',
        kind: name,
        left: num(r, 'left'),
        top: num(r, 'top'),
        width: num(r, 'width'),
        height: num(r, 'height'),
        png: rendering ? (binary.get(rendering) ?? null) : null,
        xml: serialize ? serialize(r) : null,
        items,
      });
      continue;
    }
    regions.push({
      id: r.getAttribute('region-id') ?? '',
      left: num(r, 'left'),
      top: num(r, 'top'),
      alignX: num(r, 'align-x'),
      alignY: num(r, 'align-y'),
      disabled: body.getAttribute('disable-calc') === 'true',
      content: parseMath(body),
    });
  }
  const vars = descendants(root, 'builtInVariables')[0];
  const results = descendants(root, 'results')[0];
  const general = results ? descendants(results, 'general')[0] : undefined;
  return {
    page: readPage(root),
    format: readFormat(general) ?? DEFAULT_FORMAT,
    regions,
    texts,
    opaque,
    otherRegions,
    componentOutputs,
    origin: vars ? num(vars, 'array-origin') : 0,
    tol: vars ? Number(vars.getAttribute('convergence-tolerance') ?? 0.001) : 0.001,
  };
}
