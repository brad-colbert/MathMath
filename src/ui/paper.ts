/**
 * The sheet of paper. Positions are in points, like the file format. The paper is continuous, with
 * dashed guides where pages break, because a worksheet can run for many pages.
 */
import { convertLatexToMarkup } from 'mathlive';
import { type Doc, GRID, type Item } from '../app/document.js';
import { tex } from '../latex/latex.js';
import { isEditable, regionLatex } from '../latex/region.js';
import type { Content, NumberFormat, Region, TextRegion } from '../model/ast.js';
import { Editor } from './editor.js';
import { formatStored } from './format.js';

const PT = 96 / 72;
const DRAG_THRESHOLD = 4;
const LINE = 24;

const snap = (v: number): number => Math.round(v / GRID) * GRID;

/** A region's math, with the definition sign drawn with proper spacing. */
function display(latex: string): string {
  return latex.replace(/\\coloneq\s*/g, '\\mathrel{:=}').replace(/\\equiv\s*/g, '\\mathrel{\\equiv}');
}

/** One oversized or unusual region must never stop the rest of a sheet from drawing. */
function render(latex: string): string {
  try {
    return convertLatexToMarkup(latex);
  } catch {
    return convertLatexToMarkup('\\text{Too large to display}');
  }
}

type Press =
  | { kind: 'blank'; x: number; y: number }
  | { kind: 'region'; id: string; x: number; y: number; dragging: boolean };

export class Paper {
  private views = new Map<string, HTMLElement>();
  private selected = new Set<string>();
  private editor: Editor;
  private editing: { region: Region; bottom: number; isNew: boolean } | null = null;
  private textEdit: { region: TextRegion; el: HTMLElement } | null = null;
  private crosshair: HTMLElement;
  private marquee: HTMLElement | null = null;
  private press: Press | null = null;

  constructor(private sheet: HTMLElement, private doc: Doc) {
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'crosshair';
    this.crosshair.textContent = '+';
    this.crosshair.hidden = true;
    sheet.appendChild(this.crosshair);
    this.editor = new Editor(sheet, {
      commit: (next) => this.commit(next),
      startText: () => this.startTextFromEmpty(),
    });
    doc.onChange = (ids) => this.draw(ids);
    sheet.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.draw(null);
  }

  get mathEditor(): Editor {
    return this.editor;
  }

  /** Point coordinates of a mouse event on the sheet. */
  private point(e: MouseEvent): { x: number; y: number } {
    const box = this.sheet.getBoundingClientRect();
    return { x: (e.clientX - box.left) / PT, y: (e.clientY - box.top) / PT };
  }

  private draw(ids: Set<string> | null): void {
    const items = this.doc.items();
    const live = new Set(items.map((i) => i.region.id));
    for (const [id, el] of this.views) {
      if (!live.has(id)) {
        el.remove();
        this.views.delete(id);
        this.selected.delete(id);
      }
    }
    for (const item of items) {
      if (item.region.id === this.textEdit?.region.id) continue;
      this.drawItem(item, ids === null || ids.has(item.region.id));
    }
    this.drawPages();
  }

  private drawItem(item: Item, content: boolean): void {
    const { id, left, top } = item.region;
    let el = this.views.get(id);
    const fresh = !el;
    if (!el) {
      el = document.createElement('div');
      el.className = `region ${item.kind}`;
      el.dataset.id = id;
      this.views.set(id, el);
      this.sheet.insertBefore(el, this.crosshair);
    }
    el.style.left = `${left}pt`;
    el.style.top = `${top}pt`;
    el.classList.toggle('selected', this.selected.has(id));
    if (id === this.editing?.region.id) return;
    if (item.kind === 'math' || fresh || content) this.drawContent(item, el);
  }

  private drawContent(item: Item, el: HTMLElement): void {
    if (item.kind === 'opaque') {
      el.style.width = `${item.region.width}pt`;
      el.style.height = `${item.region.height}pt`;
      el.title = `${item.region.kind}: shown as saved, and not recomputed`;
      if (item.region.png && !el.firstChild) {
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${item.region.png}`;
        img.alt = item.region.kind;
        img.draggable = false;
        el.appendChild(img);
      }
      return;
    }
    if (item.kind === 'text') {
      // Fonts differ a little from the original program's, so stored widths need some room to spare.
      if (item.region.width > 0) el.style.width = `${item.region.width * 1.15}pt`;
      el.textContent = item.region.text;
      return;
    }
    const { latex, state, note } = this.mathView(item.region);
    const key = `${state}|${latex}`;
    if (el.dataset.key !== key) {
      el.innerHTML = render(latex);
      el.dataset.key = key;
    }
    el.classList.toggle('error', state === 'error');
    el.classList.toggle('stale', state === 'stale');
    el.classList.toggle('draft', state === 'draft');
    el.title = note;
  }

  private mathView(region: Region): { latex: string; state: 'ok' | 'error' | 'stale' | 'draft'; note: string } {
    const c: Content = region.content;
    const format: NumberFormat = (c.k === 'define' || c.k === 'eval' ? c.format : undefined) ?? this.doc.ws.format;
    if (c.k === 'draft') return { latex: c.latex, state: 'draft', note: `Can't read this yet: ${c.error}` };
    if (c.k === 'other') return { latex: `\\text{${c.tag}}`, state: 'stale', note: 'Not supported yet' };
    if (c.k === 'show') return { latex: regionLatex(c), state: 'ok', note: '' };
    if (c.k === 'sym') return this.symView(region, c);
    const outcome = this.doc.outcomes.get(region.id);
    const math = display(regionLatex(c)).replace(/=$/, '');
    const shows = c.k === 'eval' || (c.k === 'define' && c.shown);
    const answer = (result: string): string => `${math}=${result}`;
    if (region.disabled) return { latex: math, state: 'stale', note: 'Calculation is off for this region' };
    const stored = c.stored;
    if (outcome?.error) {
      if (stored) {
        return { latex: answer(formatStored(stored, format)), state: 'stale', note: `Saved answer, not recomputed: ${outcome.error}` };
      }
      return { latex: math, state: 'error', note: outcome.error };
    }
    // While a calculation runs, an existing answer may be out of date, and must look it.
    const current = this.doc.computing ? 'stale' : 'ok';
    const note = this.doc.computing ? 'Calculating' : '';
    if (shows && outcome?.value) return { latex: answer(outcome.value), state: current, note };
    if (shows && !outcome && stored) return { latex: answer(formatStored(stored, format)), state: 'stale', note: 'Saved answer' };
    return { latex: math, state: 'ok', note: '' };
  }

  private symView(region: Region, c: Extract<Content, { k: 'sym' }>): { latex: string; state: 'ok' | 'error' | 'stale' | 'draft'; note: string } {
    const outcome = this.doc.outcomes.get(region.id);
    const math = display(regionLatex(c));
    if (region.disabled) return { latex: math, state: 'stale', note: 'Calculation is off for this region' };
    if (outcome?.error) return { latex: math, state: 'error', note: outcome.error };
    if (outcome?.unevaluated) return { latex: math, state: 'stale', note: 'No closed form was found' };
    if (outcome?.value) {
      return { latex: `${math}${outcome.value}`, state: this.doc.computing ? 'stale' : 'ok', note: this.doc.computing ? 'Calculating' : '' };
    }
    if (c.stored) return { latex: `${math}${tex(c.stored)}`, state: 'stale', note: 'Saved answer' };
    return { latex: math, state: 'stale', note: 'Calculating' };
  }

  private drawPages(): void {
    const { page } = this.doc.ws;
    const s = this.sheet.style;
    let bottom = page.height;
    let right = page.width;
    let printed = page.height;
    for (const { region } of this.doc.items()) {
      const el = this.views.get(region.id);
      const low = region.top + (el ? el.offsetHeight / PT : 0);
      const end = region.left + (el ? el.offsetWidth / PT : 0);
      bottom = Math.max(bottom, low);
      right = Math.max(right, end);
      // Anything past the page edge makes the browser shrink the whole print, so printing hides
      // regions beyond it and trims regions across it.
      el?.classList.toggle('past-page', region.left >= page.width);
      el?.classList.toggle('across-page', region.left < page.width && end > page.width);
      el?.style.setProperty('--room', `${page.width - region.left}pt`);
      // Printing covers the first page width, so regions past it don't add pages.
      if (region.left < page.width) printed = Math.max(printed, low);
    }
    // Worksheets run past the page edge sideways too, so the paper does as well.
    const across = Math.max(1, Math.ceil(right / page.width));
    s.width = `${across * page.width}pt`;
    s.setProperty('--print-width', `${page.width}pt`);
    const pages = Math.max(1, Math.ceil(bottom / page.height));
    // One more page than is used, so there's always somewhere to click. It doesn't print.
    s.height = `${(pages + 1) * page.height}pt`;
    s.setProperty('--print-height', `${Math.ceil(printed / page.height) * page.height}pt`);
    this.sheet.querySelectorAll('.pagebreak').forEach((n) => n.remove());
    for (let p = 1; p <= pages; p++) {
      const line = document.createElement('div');
      line.className = 'pagebreak';
      line.style.top = `${p * page.height}pt`;
      this.sheet.appendChild(line);
    }
    this.sheet.querySelectorAll('.pagecolumn').forEach((n) => n.remove());
    for (let c = 1; c <= across; c++) {
      const line = document.createElement('div');
      line.className = 'pagecolumn';
      line.style.left = `${c * page.width}pt`;
      this.sheet.appendChild(line);
    }
    document.documentElement.style.setProperty('--margin-left', `${page.margins.left}pt`);
    let style = document.getElementById('page-style') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-style';
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${page.width}pt ${page.height}pt; margin: 0; }`;
  }

  private select(ids: Iterable<string>): void {
    this.selected = new Set(ids);
    for (const [id, el] of this.views) el.classList.toggle('selected', this.selected.has(id));
  }

  get selection(): Set<string> {
    return this.selected;
  }

  /** Undo acts on the sheet unless there's typing in progress for the editor to undo instead. */
  canUndo(): boolean {
    return !this.textEdit && (!this.editor.isOpen || this.editor.value() === '');
  }

  /** Finishes any edit in progress. */
  commitAll(): void {
    this.commit('stay');
    this.commitText();
  }

  private placeCrosshair(x: number, y: number): void {
    this.crosshair.style.left = `${x}pt`;
    this.crosshair.style.top = `${y}pt`;
    this.crosshair.hidden = false;
  }

  /** A click is a region waiting for input: focus lands at once, so the first key arrives natively. */
  private beginAt(x: number, y: number): void {
    this.placeCrosshair(x, y);
    const region = this.doc.addMath(x, y);
    this.open(region, true);
  }

  private open(region: Region, isNew: boolean): void {
    const el = this.views.get(region.id);
    const bottom = region.top + (el ? el.offsetHeight / PT : 0);
    this.editing = { region, bottom, isNew };
    if (el) el.style.visibility = 'hidden';
    this.editor.show(region.left, region.top, regionLatex(region.content));
  }

  private commit(next: 'stay' | 'below'): void {
    const editing = this.editing;
    if (!editing) return;
    const { region, bottom, isNew } = editing;
    const latex = this.editor.value();
    const changed = this.editor.edited();
    const height = this.editor.field.offsetHeight / PT;
    this.editor.close();
    this.editing = null;
    this.crosshair.hidden = true;
    const el = this.views.get(region.id);
    if (el) el.style.visibility = '';
    if (latex.trim() === '') {
      if (isNew) {
        this.doc.discard(region.id);
        this.draw(null);
      } else this.doc.remove(new Set([region.id]));
    } else if (changed) {
      this.doc.batch(() => {
        this.doc.setMath(region, latex);
        this.pushBelow(region.id, bottom, region.top + height);
      });
    }
    if (next === 'below') this.beginAt(region.left, snap(region.alignY + Math.max(LINE, height)));
  }

  private pushBelow(id: string, oldBottom: number, newBottom: number): void {
    const box = this.views.get(id)?.getBoundingClientRect();
    if (!box) return;
    this.doc.pushDown(id, oldBottom, newBottom - oldBottom, (other) => {
      const b = this.views.get(other)?.getBoundingClientRect();
      return !!b && b.left < box.right + 200 && b.right > box.left - 200;
    });
  }

  private startTextFromEmpty(): void {
    const editing = this.editing;
    if (!editing) return;
    const { region } = editing;
    this.editor.close();
    this.editing = null;
    this.crosshair.hidden = true;
    this.doc.discard(region.id);
    this.draw(null);
    const text = this.doc.addText(region.left, region.alignY);
    this.draw(new Set([text.id]));
    this.openText(text);
  }

  private openText(region: TextRegion): void {
    const el = this.views.get(region.id)!;
    el.contentEditable = 'plaintext-only';
    el.classList.add('editing');
    this.textEdit = { region, el };
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  private commitText(): void {
    const edit = this.textEdit;
    if (!edit) return;
    this.textEdit = null;
    const { region, el } = edit;
    el.contentEditable = 'false';
    el.classList.remove('editing');
    const text = (el.innerText ?? '').replace(/\n$/, '');
    if (text.trim() === '') this.doc.remove(new Set([region.id]));
    else if (text !== region.text) this.doc.setText(region, text);
  }

  private onDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target === this.editor.field) return;
    const view = target.closest<HTMLElement>('.region');
    if (view && view === this.textEdit?.el) return;
    e.preventDefault();
    const p = this.point(e);
    this.commitAll();
    if (!view) {
      this.select([]);
      this.press = { kind: 'blank', x: p.x, y: p.y };
      this.beginAt(snap(p.x), snap(p.y));
      return;
    }
    const id = view.dataset.id!;
    if (e.shiftKey) {
      const next = new Set(this.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.select(next);
      return;
    }
    if (!this.selected.has(id)) this.select([id]);
    this.press = { kind: 'region', id, x: p.x, y: p.y, dragging: false };
  }

  private onMove(e: MouseEvent): void {
    const press = this.press;
    if (!press) return;
    const p = this.point(e);
    const [dx, dy] = [p.x - press.x, p.y - press.y];
    const far = Math.hypot(dx, dy) * PT > DRAG_THRESHOLD;
    if (press.kind === 'region') {
      if (!press.dragging && !far) return;
      press.dragging = true;
      for (const id of this.selected) {
        const el = this.views.get(id);
        if (el) el.style.transform = `translate(${dx}pt, ${dy}pt)`;
      }
      return;
    }
    if (!far && !this.marquee) return;
    if (!this.marquee) {
      // It was a drag across the paper, not a click: drop the waiting region and draw a box.
      this.commit('stay');
      this.marquee = document.createElement('div');
      this.marquee.id = 'marquee';
      this.sheet.appendChild(this.marquee);
    }
    const m = this.marquee.style;
    m.left = `${Math.min(p.x, press.x)}pt`;
    m.top = `${Math.min(p.y, press.y)}pt`;
    m.width = `${Math.abs(dx)}pt`;
    m.height = `${Math.abs(dy)}pt`;
  }

  private onUp(e: MouseEvent): void {
    const press = this.press;
    this.press = null;
    if (!press) return;
    const p = this.point(e);
    if (press.kind === 'blank') {
      if (!this.marquee) return;
      const box = this.marquee.getBoundingClientRect();
      this.marquee.remove();
      this.marquee = null;
      const inside = [...this.views].filter(([, el]) => {
        const r = el.getBoundingClientRect();
        return r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
      });
      this.select(inside.map(([id]) => id));
      return;
    }
    for (const id of this.selected) {
      const el = this.views.get(id);
      if (el) el.style.transform = '';
    }
    if (press.dragging) {
      const dx = snap(p.x - press.x);
      const dy = snap(p.y - press.y);
      this.doc.move(this.selected, dx, dy);
      return;
    }
    const item = this.doc.find(press.id);
    this.select([]);
    if (item?.kind === 'math' && isEditable(item.region.content)) this.open(item.region, false);
    else if (item?.kind === 'text') this.openText(item.region);
    else if (item) this.select([press.id]);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.textEdit) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.commitText();
      }
      return;
    }
    if (this.editing) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected.size > 0) {
      e.preventDefault();
      this.doc.remove(new Set(this.selected));
    } else if (e.key === 'Escape') {
      this.select([]);
      this.doc.stop();
    }
  }
}

