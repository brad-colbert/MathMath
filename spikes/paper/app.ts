// Paper prototype: a real page, regions in points, click anywhere and type, idle regions static.
import { MathfieldElement, convertLatexToMarkup } from 'mathlive';
import { runWorksheet } from '../../src/engine/evaluate.js';
import { type Mat, type Value, getEl } from '../../src/engine/values.js';
import type { Content, Region as Model, Worksheet } from '../../src/model/ast.js';
import { exprToTarget, readTex, target, tex } from '../editor/latex.js';

MathfieldElement.fontsDirectory = '/nm/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

interface Item { id: number; left: number; top: number; latex: string; el: HTMLElement; result?: string; error?: string }

const page = document.getElementById('page')!;
const PT = 96 / 72;
const items: Item[] = [];
let nextId = 1;
let crosshair: HTMLElement | null = null;
let active: { item: Item; field: MathfieldElement } | null = null;
let at = { left: 36, top: 36 };


function readRegion(latex: string): Content {
  // `:` alone gives the definition sign, as in Mathcad. Typing `:=` is forgiven.
  const clean = latex.replace(/(\\coloneq|:=)\s*=?/g, '\\coloneq ');
  const split = clean.indexOf('\\coloneq ');
  if (split >= 0) {
    const left = readTex(clean.slice(0, split));
    const value = readTex(clean.slice(split + 9));
    return { k: 'define', target: exprToTarget(left), value, global: false, stored: null, unit: null, shown: false };
  }
  const expr = readTex(clean.replace(/=\s*$/, ''));
  return { k: 'eval', expr, stored: null, unit: null };
}

function show(v: Value): string {
  if (v.t === 'num') return v.im ? `${v.re.toPrecision(6)}+${v.im.toPrecision(6)}i` : `${Number(v.re.toPrecision(6))}`;
  if (v.t === 'mat') {
    const m = v as Mat;
    const rows: string[] = [];
    for (let i = 0; i < m.rows; i++) rows.push(Array.from({ length: m.cols }, (_, j) => show(getEl(m, i, j))).join('&'));
    return `\\begin{pmatrix}${rows.join('\\\\')}\\end{pmatrix}`;
  }
  return v.t === 'str' ? `\\text{${v.v}}` : '';
}

function renderStatic(item: Item): void {
  const math = item.result !== undefined ? `${item.latex.replace(/=\s*$/, '')}=${item.result}` : item.latex;
  item.el.innerHTML = convertLatexToMarkup(math.replace(/:=/g, '\\coloneq '));
  item.el.classList.toggle('error', item.error !== undefined);
  item.el.title = item.error ?? '';
}

function recompute(): void {
  const regions: Model[] = [];
  const byRegion = new Map<string, Item>();
  for (const item of items) {
    item.error = undefined;
    item.result = undefined;
    try {
      const m: Model = {
        id: String(item.id), left: item.left, top: item.top, alignX: item.left, alignY: item.top, disabled: false, content: readRegion(item.latex),
      };
      regions.push(m);
      byRegion.set(m.id, item);
    } catch (err) {
      item.error = (err as Error).message;
    }
  }
  const ws: Worksheet = { regions, texts: [], origin: 0, tol: 0.001, otherRegions: {}, componentOutputs: [] };
  for (const o of runWorksheet(ws)) {
    const item = byRegion.get(o.region.id)!;
    if (o.error) item.error = o.error.message;
    else if (o.value && o.region.content.k === 'eval') item.result = show(o.value);
  }
  for (const item of items) if (item !== active?.item) renderStatic(item);
}

function place(item: Item): void {
  item.el.style.left = `${item.left}pt`;
  item.el.style.top = `${item.top}pt`;
}

function newItem(left: number, top: number, latex: string): Item {
  const el = document.createElement('div');
  el.className = 'region';
  const item: Item = { id: nextId++, left, top, latex, el };
  place(item);
  page.appendChild(el);
  items.push(item);
  el.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (active?.item !== item) activate(item);
  });
  return item;
}

/**
 * Space grows the selection through the expression. MathLive has no such command, so walk outward:
 * widen to the current depth's whole group, then step out one depth.
 */
function grow(field: MathfieldElement): void {
  const last = field.lastOffset;
  const depthAt = (o: number): number => field.getElementInfo(o)?.depth ?? 0;
  const [start, end] = field.selection.ranges[0]!;
  let [a, b] = start === end ? [Math.max(0, start - 1), start] : [start, end];
  let depth = Infinity;
  for (let i = a + 1; i <= b; i++) depth = Math.min(depth, depthAt(i));
  const widen = (d: number): [number, number] => {
    let [lo, hi] = [a, b];
    while (lo > 0 && depthAt(lo) >= d) lo--;
    while (hi < last && depthAt(hi + 1) >= d) hi++;
    return [lo, hi];
  };
  let next = widen(depth);
  while (start !== end && next[0] === start && next[1] === end && depth > 0) next = widen(--depth);
  [a, b] = start !== end && next[0] === start && next[1] === end ? [0, last] : next;
  field.selection = { ranges: [[a, b]], direction: 'forward' };
}

let editor: MathfieldElement;

/** Stays rendered: a field shown and focused in the same tick loses the first key. */
function hide(field: MathfieldElement): void {
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
}

function makeEditor(): MathfieldElement {
  const field = new MathfieldElement();
  field.id = 'editor';
  page.appendChild(field);
  field.mathVirtualKeyboardPolicy = 'manual';
  field.menuItems = [];
  field.smartFence = true;
  // None at all: stale shortcut state crashes a reused field, and words need no shortcuts here.
  field.inlineShortcuts = {};
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      grow(field);
    } else if (e.key === ':' || e.key === '*') {
      e.preventDefault();
      e.stopPropagation();
      field.insert(e.key === ':' ? '\\coloneq ' : '\\cdot ', { format: 'latex' });
    }
  }, { capture: true });
  return field;
}

/** One always-mounted editor moves over the active region. Mounting a field per region drops keys. */
function activate(item: Item): MathfieldElement {
  commit();
  const field = editor;
  item.el.style.visibility = 'hidden';
  field.style.left = `${item.left}pt`;
  field.style.top = `${item.top}pt`;
  field.style.opacity = '1';
  field.style.pointerEvents = 'auto';
  field.setValue(item.latex, { silenceNotifications: true });
  active = { item, field };
  field.focus();
  return field;
}

function commit(): void {
  if (!active) return;
  const { item, field } = active;
  // `latex` echoes what was set until an edit happens, so it shows whether anything changed.
  const changed = item.latex !== field.getValue('latex');
  if (changed) item.latex = field.getValue('latex-unstyled');
  active = null;
  field.blur();
  hide(field);
  item.el.style.visibility = '';
  if (item.latex.trim() === '') {
    item.el.remove();
    items.splice(items.indexOf(item), 1);
  }
  if (changed) recompute();
  if (item.el.isConnected) renderStatic(item);
}

// A click is a region waiting for input: the editor takes focus at once, so the first key arrives
// natively. An empty region disappears when it's committed.
page.addEventListener('mousedown', (e) => {
  if (e.target === editor) return;
  e.preventDefault();
  commit();
  const box = page.getBoundingClientRect();
  const snap = (v: number): number => Math.round(v / PT / 6) * 6;
  at = { left: snap(e.clientX - box.left), top: snap(e.clientY - box.top) };
  crosshair?.remove();
  crosshair = document.createElement('div');
  crosshair.id = 'crosshair';
  crosshair.textContent = '+';
  crosshair.style.left = `${at.left}pt`;
  crosshair.style.top = `${at.top}pt`;
  page.appendChild(crosshair);
  activate(newItem(at.left, at.top, ''));
});

editor = makeEditor();
hide(editor);

declare global { interface Window { app: unknown } }
window.app = {
  items,
  commit,
  field: () => active?.field,
  /** Loads prepared regions and reports time to a laid-out page. */
  load(list: { left: number; top: number; latex: string }[]): { ms: number; count: number; failed: number } {
    const t = performance.now();
    for (const r of list) renderStatic(newItem(r.left, r.top, r.latex));
    void page.getBoundingClientRect().height;
    const ms = performance.now() - t;
    return { ms, count: list.length, failed: 0 };
  },
  activateIndex(n: number): number {
    const t = performance.now();
    activate(items[n]!);
    void page.getBoundingClientRect().height;
    return performance.now() - t;
  },
  grow,
  recompute,
  tex,
  target,
};
