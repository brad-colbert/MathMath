/**
 * Parts of a region that are edited on their own: a plot's axis expressions and limits, and a
 * result's display unit. Each reads and writes expression trees, never stored text.
 */
import { readTex, tex } from '../latex/latex.js';
import type { Content, Expr } from '../model/ast.js';

export type Slot = 'ys' | 'x' | 'xmin' | 'xmax' | 'ymin' | 'ymax' | 'unit' | 'expr';

/** Where Tab goes next in a new plot. */
export const NEXT_SLOT: Partial<Record<Slot, Slot>> = { ys: 'x' };

type Plot = Extract<Content, { k: 'plot' }>;

/** Splits at commas outside any group, so `f(a,b),g` is two items. */
export function splitList(latex: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '\\') {
      if (latex.startsWith('\\left', i)) depth++;
      else if (latex.startsWith('\\right', i)) depth--;
      i++;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(latex.slice(start, i));
      start = i + 1;
    }
  }
  out.push(latex.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

const optional = (latex: string): Expr | null => (latex.trim() === '' ? null : readTex(latex));

export function slotLatex(c: Content, slot: Slot): string {
  if (c.k === 'plot') {
    switch (slot) {
      case 'ys': return c.ys.map(tex).join(',');
      case 'x': return c.x ? tex(c.x) : '';
      case 'xmin': return c.xAxis.min ? tex(c.xAxis.min) : '';
      case 'xmax': return c.xAxis.max ? tex(c.xAxis.max) : '';
      case 'ymin': return c.yAxis.min ? tex(c.yAxis.min) : '';
      case 'ymax': return c.yAxis.max ? tex(c.yAxis.max) : '';
      default: return '';
    }
  }
  if ((c.k === 'eval' || c.k === 'define') && slot === 'unit') return c.unit ? tex(c.unit) : '';
  if (c.k === 'image' && slot === 'expr') return c.expr ? tex(c.expr) : '';
  return '';
}

/** Reads a slot's math. Throws if it can't be read, so the caller can keep the old value. */
export function withSlot(c: Content, slot: Slot, latex: string): Content {
  if (c.k === 'plot') {
    const p: Plot = { ...c, xAxis: { ...c.xAxis }, yAxis: { ...c.yAxis } };
    switch (slot) {
      case 'ys': p.ys = splitList(latex).map(readTex); break;
      case 'x': p.x = optional(latex); break;
      case 'xmin': p.xAxis.min = optional(latex); break;
      case 'xmax': p.xAxis.max = optional(latex); break;
      case 'ymin': p.yAxis.min = optional(latex); break;
      case 'ymax': p.yAxis.max = optional(latex); break;
      default:
    }
    return p;
  }
  if ((c.k === 'eval' || c.k === 'define') && slot === 'unit') return { ...c, unit: optional(latex) };
  if (c.k === 'image' && slot === 'expr') return { ...c, expr: optional(latex) };
  return c;
}
