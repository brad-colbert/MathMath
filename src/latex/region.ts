/** What the editor shows for a whole region, and how typed math becomes a region again. */
import type { Content, Expr, SymCommand, Target } from '../model/ast.js';
import { KEYWORDS } from '../symbolic/giac.js';
import { exprToTarget, readTex, target, tex } from './latex.js';

const DEFINE = '\\coloneq ';
const GLOBAL = '\\equiv ';

const ARROW = '\\to ';

const unsupported = (node: unknown): boolean => JSON.stringify(node).includes('"k":"unsupported"');

/** Regions holding constructs this version can't print can't be edited, only kept. */
export function isEditable(c: Content): boolean {
  if (c.k === 'draft') return true;
  if (c.k === 'define') return !unsupported(c.value) && !unsupported(c.target);
  if (c.k === 'eval' || c.k === 'show') return !unsupported(c.expr);
  if (c.k === 'sym') return !unsupported(c);
  return false;
}

export function regionLatex(c: Content): string {
  switch (c.k) {
    case 'define': return `${target(c.target)}${c.global ? GLOBAL : DEFINE}${tex(c.value)}`;
    case 'eval': return `${tex(c.expr)}=`;
    case 'show': return tex(c.expr);
    case 'sym': {
      const head = c.target ? `${target(c.target)}${c.global ? GLOBAL : DEFINE}` : '';
      const keywords = c.commands.map((k) => `\\ \\mathbf{${k.name}}${k.args.map((a) => `,${tex(a)}`).join('')}`).join('');
      return `${head}${tex(c.expr)}${keywords}${ARROW}`;
    }
    case 'draft': return c.latex;
    case 'other': return '';
  }
}

function topLevel(latex: string, marker: string): number {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '\\' && latex.startsWith(marker, i) && depth === 0) return i;
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  return -1;
}

/** Splits `expr keyword,arg keyword →` at keywords outside any group. */
function splitKeywords(text: string): { expr: string; commands: SymCommand[] } {
  const marks: { at: number; end: number; name: string }[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && depth === 0 && text.startsWith('\\mathbf{', i)) {
      const close = text.indexOf('}', i);
      const name = text.slice(i + 8, close);
      if (KEYWORDS.includes(name)) marks.push({ at: i, end: close + 1, name });
    }
    if (ch === '\\') i++;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  const expr = text.slice(0, marks[0]?.at ?? text.length).replace(/(\\ |\\,|\\;|\s)+$/, '');
  const commands = marks.map((m, n) => {
    const part = text.slice(m.end, marks[n + 1]?.at ?? text.length).replace(/(\\ |\\,|\\;|\s)+$/, '');
    return { name: m.name, args: splitArgs(part).map(readTex) };
  });
  return { expr, commands };
}

function splitArgs(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 1;
  if (!text.startsWith(',')) return [];
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.filter((a) => a.trim() !== '');
}

const ARROW_AT_END = /\\(to|rightarrow)\s*$/;

function readSym(text: string, t: Target | null, global: boolean): Content {
  const { expr, commands } = splitKeywords(text.replace(ARROW_AT_END, ''));
  return { k: 'sym', target: t, global, expr: readTex(expr), commands, stored: null };
}

/** Reads typed math. An error here becomes a draft in the caller, so nothing typed is lost. */
export function readRegion(latex: string, previous?: Content): Content {
  // `:` alone gives the definition sign. Typing `:=` is forgiven.
  const clean = latex.replace(/(\\coloneq|:=)\s*=?/g, DEFINE).trim();
  for (const [marker, global] of [[DEFINE.trim(), false], [GLOBAL.trim(), true]] as const) {
    const at = topLevel(clean, marker);
    if (at >= 0) {
      const t: Target = exprToTarget(readTex(clean.slice(0, at)));
      const right = clean.slice(at + marker.length);
      if (ARROW_AT_END.test(right)) return readSym(right, t, global);
      const value: Expr = readTex(right);
      const format = previous?.k === 'define' && previous.format ? { format: previous.format } : {};
      return { k: 'define', target: t, value, global, stored: null, unit: null, shown: false, ...format };
    }
  }
  if (ARROW_AT_END.test(clean)) return readSym(clean, null, false);
  // Only a trailing = asks for a result. Anything else is math written to be read.
  if (!/=\s*$/.test(clean)) return { k: 'show', expr: readTex(clean) };
  const expr = readTex(clean.replace(/=\s*$/, ''));
  const format = previous?.k === 'eval' && previous.format ? { format: previous.format } : {};
  return { k: 'eval', expr, stored: null, unit: null, ...format };
}
