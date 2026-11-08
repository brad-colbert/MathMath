import type {
  Content, Expr, NumberFormat, OpaqueRegion, PageModel, Region, Stmt, StoredResult, StoredUnit, StoredValue, Target, TextRegion,
  Worksheet,
} from '../model/ast.js';
import { DEFAULT_FORMAT, DEFAULT_PAGE, realFrom } from '../model/ast.js';
import { translateFunction } from './names.js';
import { gunzip } from './inflate.js';
import { baseName } from '../engine/files.js';

/** The part of the DOM used here, so the same code runs on @xmldom in Node and in a browser. */
export interface XElement {
  localName: string | null;
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<XElement>;
  getAttribute(name: string): string | null;
}

/** Mathcad's picture components, identified from their stored renderings. */
const IMAGE_VIEWERS = new Set(['01350071-1122-11db-9380-000d56c6051a', '8442da2d-08d7-45ad-a4a6-f28bee6ae06a']);

/**
 * Mathcad's components that read a data file into a variable: the File Input, the Data Import Wizard, and
 * the Excel component, whose spreadsheet readTable asks to have saved as CSV.
 */
const FILE_READERS = new Set(['01350083-1122-11db-9380-000d56c6051a', '577d93c8-ea65-4d05-b631-401168b146e4', '01350081-1122-11db-9380-000d56c6051a']);

/**
 * The data file a reading component names. Its gzip data holds the path as UTF-16 or plain text, often
 * twice, and some copies are cut short at the front, so the longest gives the whole file name.
 */
function componentFile(base64: string | undefined): string | null {
  if (!base64) return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzip(bytes);
  } catch {
    return null;
  }
  const latin1 = new TextDecoder('latin1').decode(bytes.subarray(0, 1 << 16));
  const wide: string[] = [];
  for (const m of latin1.matchAll(/(?:[\x20-\x7e]\x00){5,}/g)) wide.push(m[0].replace(/\x00/g, ''));
  const narrow = [...latin1.matchAll(/[\x20-\x7e]{5,}/g)].map((m) => m[0]);
  const paths = [...wide, ...narrow].filter((t) => /\.(txt|csv|dat|prn|xls|xlsx)$/i.test(t));
  if (paths.length === 0) return null;
  return baseName(paths.reduce((a, b) => (b.length > a.length ? b : a)));
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

const SOLVE_TAGS = new Set(['Find', 'Minerr', 'Maximize', 'Minimize', 'Odesolve']);

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
    // The nth derivative has its order in a <degree> beside the lambda.
    const degree = rest[1]?.localName === 'degree' ? kids(rest[1])[0] : undefined;
    if (rest[1] && !degree) return { k: 'unsupported', tag: 'derivative:shape' };
    return { k: 'derivative', varName: boundOne(vars), body: parseExpr(body), ...(degree ? { degree: parseExpr(degree) } : {}) };
  }
  const args = argList(rest).map(parseExpr);
  // Mathcad saves a solve block's function as an element of its own, holding the solver's settings.
  if (SOLVE_TAGS.has(tag)) return { k: 'call', fn: { k: 'id', name: tag }, args };
  if (tag === 'id') return { k: 'call', fn: { k: 'id', name: translateFunction(idName(head)) }, args };
  if (tag === 'apply' || tag === 'parens') return { k: 'call', fn: parseExpr(head), args };
  // Mathcad writes the determinant as its own operator; in MathMath, |M| on a square matrix is the determinant.
  return { k: 'op', op: tag === 'determinant' ? 'absval' : tag, args };
}

export function parseExpr(e: XElement): Expr {
  const tag = e.localName ?? '';
  switch (tag) {
    case 'real': {
      const r = realFrom(e.textContent ?? '');
      return r.digits ? r : { k: 'real', v: parseNumber(e.textContent) };
    }
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
    // On the right of a global definition, Mathcad writes a call f(a, b) as a function with its
    // arguments as bound variables.
    case 'function': {
      const [name, vars] = kids(e);
      if (name?.localName !== 'id' || vars?.localName !== 'boundVars') return { k: 'unsupported', tag };
      return { k: 'call', fn: { k: 'id', name: translateFunction(idName(name)) }, args: kids(vars).map(parseExpr) };
    }
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
  if (tag === 'id' && (e.textContent ?? '').startsWith('ƒ')) return { k: 'fn', type: e.textContent ?? '' };
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
    ...(general.getAttribute('complex-threshold') && Number(general.getAttribute('complex-threshold')) !== 10
      ? { complexThreshold: Number(general.getAttribute('complex-threshold')) } : {}),
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
      // A data-reading component becomes a readTable definition of its output, found by file name.
      const clsid = (body.getAttribute('clsid-buddy') ?? '').toLowerCase();
      const output = kids(kids(body).find((c) => c.localName === 'outputs') ?? body).find((c) => c.localName === 'id');
      const file = name === 'component' && FILE_READERS.has(clsid) && output ? componentFile(binary.get(body.getAttribute('item-idref') ?? '')) : null;
      if (file && output) {
        regions.push({
          id: r.getAttribute('region-id') ?? '',
          left: num(r, 'left'),
          top: num(r, 'top'),
          alignX: num(r, 'align-x'),
          alignY: num(r, 'align-y'),
          disabled: body.getAttribute('disable-calc') === 'true',
          content: {
            k: 'define', target: { k: 'var', name: idName(output) },
            value: { k: 'call', fn: { k: 'id', name: 'readTable' }, args: [{ k: 'str', v: file }] },
            global: false, stored: null, unit: null, shown: false,
          },
        });
        continue;
      }
      // A reference includes another worksheet, found by its file name.
      if (name === 'reference') {
        // Saved by Mathcad 12 and later, the path is in originRef; converted from .mcd, in a link beside it.
        const href = descendants(body, 'originRef')[0]?.getAttribute('href') || kids(r).find((c) => c.localName === 'link')?.getAttribute('href') || '';
        regions.push({
          id: r.getAttribute('region-id') ?? '',
          left: num(r, 'left'),
          top: num(r, 'top'),
          alignX: num(r, 'align-x'),
          alignY: num(r, 'align-y'),
          disabled: false,
          content: { k: 'include', file: href ? baseName(href) : '' },
        });
        continue;
      }
      const rendering = kids(r).find((c) => c.localName === 'rendering')?.getAttribute('item-idref');
      const png = rendering ? (binary.get(rendering) ?? null) : null;
      // Picture viewers become image regions, so they show what their input computes.
      if (name === 'component' && IMAGE_VIEWERS.has((body.getAttribute('clsid-buddy') ?? '').toLowerCase())) {
        const input = kids(kids(body).find((c) => c.localName === 'inputs') ?? body)[0];
        regions.push({
          id: r.getAttribute('region-id') ?? '',
          left: num(r, 'left'),
          top: num(r, 'top'),
          alignX: num(r, 'left'),
          alignY: num(r, 'top'),
          disabled: body.getAttribute('disable-calc') === 'true',
          content: { k: 'image', expr: input ? parseExpr(input) : null, mode: 'gray', width: num(r, 'width'), height: num(r, 'height'), png },
        });
        continue;
      }
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
        png,
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
    assets: {},
    format: readFormat(general) ?? DEFAULT_FORMAT,
    regions,
    texts,
    opaque,
    otherRegions,
    componentOutputs,
    origin: vars ? num(vars, 'array-origin') : 0,
    tol: vars ? Number(vars.getAttribute('convergence-tolerance') ?? 0.001) : 0.001,
    ctol: vars ? Number(vars.getAttribute('constraint-tolerance') ?? 0.001) : 0.001,
    exactCompare: descendants(root, 'calculationBehavior')[0]?.getAttribute('exact-boolean') !== 'false',
    zeroOverZero: descendants(root, 'calculationBehavior')[0]?.getAttribute('zero-over-zero') === '0',
  };
}
