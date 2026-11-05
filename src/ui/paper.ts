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
import { drawPlot } from './plot.js';
import { NEXT_SLOT, type Slot, type TitleSlot, isTitleSlot, slotLatex, titleText, withSlot, withTitle } from './slots.js';

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
  | { kind: 'region'; id: string; x: number; y: number; dragging: boolean; slot: Slot | null }
  | { kind: 'resize'; id: string; x: number; y: number; width: number; height: number };

type Editing =
  | { kind: 'region'; region: Region; bottom: number; isNew: boolean }
  | { kind: 'slot'; region: Region; slot: Slot };

const MIN_PLOT = { width: 96, height: 72 };

/** How long a region calculates before it gets the green box, in milliseconds. */
const CALC_BOX_DELAY = 100;

export class Paper {
  private views = new Map<string, HTMLElement>();
  private selected = new Set<string>();
  private editor: Editor;
  private editing: Editing | null = null;
  private textEdit: { region: TextRegion; el: HTMLElement } | null = null;
  private calcTimer: ReturnType<typeof setTimeout> | undefined;
  /** The answer of the region being edited, grayed beside the editor. */
  private ghost = document.createElement('div');
  /** A plot title being typed in place. */
  private titleEdit: { region: Region; slot: TitleSlot; el: HTMLElement } | null = null;
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
      startPlot: () => this.startPlotFromEmpty(),
      changed: () => this.placeGhost(),
      closed: () => {
        this.ghost.hidden = true;
      },
    });
    this.ghost.className = 'ghost-answer';
    this.ghost.hidden = true;
    sheet.appendChild(this.ghost);
    doc.onChange = (ids) => this.draw(ids);
    doc.onCalculating = (id) => this.calculating(id);
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
      if (item.region.id === this.textEdit?.region.id || item.region.id === this.titleEdit?.region.id) continue;
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
    if (this.editing?.kind === 'region' && id === this.editing.region.id) return;
    if (item.kind === 'math' || fresh || content) this.drawContent(item, el);
  }

  private drawContent(item: Item, el: HTMLElement): void {
    if (item.kind === 'opaque') {
      el.style.width = `${item.region.width}pt`;
      el.style.height = `${item.region.height}pt`;
      el.title = item.region.kind === 'picture' && item.region.mime ? 'Picture' : `${item.region.kind}: shown as saved, and not recomputed`;
      if (item.region.png && !el.firstChild) {
        const img = document.createElement('img');
        img.src = `data:${item.region.mime ?? 'image/png'};base64,${item.region.png}`;
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
    // A plot or image keeps its last picture, faded, until it's recalculated. Not while a calculation
    // runs: that would flash a large picture on every edit.
    if (item.region.content.k === 'image' || item.region.content.k === 'plot') {
      const outdated = this.doc.computing ? '' : this.doc.behind;
      el.classList.toggle('stale', outdated !== '' && this.doc.outcomes.has(item.region.id));
      el.title = el.classList.contains('stale') ? outdated : '';
    }
    if (item.region.content.k === 'image') {
      this.drawImage(item.region, item.region.content, el);
      return;
    }
    if (item.region.content.k === 'plot') {
      const outcome = this.doc.outcomes.get(item.region.id);
      // Redraw only when the plot or its data changed: drawing replaces the plot's elements.
      const key = `${JSON.stringify(item.region.content)}|${this.selected.has(item.region.id)}`;
      const cache = el as HTMLElement & { plotKey?: string; plotData?: unknown };
      if (cache.plotKey === key && cache.plotData === outcome) return;
      cache.plotKey = key;
      cache.plotData = outcome;
      el.classList.add('plot');
      drawPlot(el, item.region.content, outcome?.plot, outcome?.error);
      if (this.selected.has(item.region.id)) {
        const handle = document.createElement('div');
        handle.className = 'handle';
        handle.title = 'Drag to resize';
        el.appendChild(handle);
      }
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

  /** A matrix as an image. Until it's computed, or if it can't be, the stored picture stands in. */
  private drawImage(region: Region, c: Extract<Content, { k: 'image' }>, el: HTMLElement): void {
    const outcome = this.doc.outcomes.get(region.id);
    const key = `${JSON.stringify({ ...c, png: c.png ? c.png.length : 0 })}|${this.selected.has(region.id)}`;
    const cache = el as HTMLElement & { imageKey?: string; imageData?: unknown };
    if (cache.imageKey === key && cache.imageData === outcome) return;
    cache.imageKey = key;
    cache.imageData = outcome;
    el.classList.add('image');
    el.style.width = `${c.width}pt`;
    el.style.height = `${c.height}pt`;
    el.innerHTML = '';
    const frame = document.createElement('div');
    frame.className = 'frame';
    el.appendChild(frame);
    if (outcome?.image) {
      const { width, height, rgba } = outcome.image;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      // Sharp pixels when a small matrix is enlarged; smooth when a photo is shrunk.
      if (width * 4 < c.width && height * 4 < c.height) canvas.classList.add('enlarged');
      frame.appendChild(canvas);
    } else if (c.png) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${c.png}`;
      img.className = 'stand-in';
      img.draggable = false;
      frame.appendChild(img);
    }
    const label = document.createElement('div');
    label.className = `slot${c.expr ? '' : ' empty'}`;
    label.dataset.slot = 'expr';
    label.title = 'The matrix to show';
    label.innerHTML = c.expr ? render(tex(c.expr)) : '&#9632;';
    el.appendChild(label);
    el.classList.toggle('error', !!outcome?.error);
    el.title = outcome?.error ?? (c.mode === 'rgb' ? 'Color, from red, green and blue blocks side by side' : 'Gray levels 0 to 255, or color from three matrices');
    if (this.selected.has(region.id)) {
      const handle = document.createElement('div');
      handle.className = 'handle';
      handle.title = 'Drag to resize';
      el.appendChild(handle);
    }
  }

  private mathView(region: Region): { latex: string; state: 'ok' | 'error' | 'stale' | 'draft'; note: string } {
    const c: Content = region.content;
    const format: NumberFormat = (c.k === 'define' || c.k === 'eval' ? c.format : undefined) ?? this.doc.ws.format;
    if (c.k === 'draft') return { latex: c.latex, state: 'draft', note: `Can't read this yet: ${c.error}` };
    if (c.k === 'other') return { latex: `\\text{${c.tag}}`, state: 'stale', note: 'Not supported yet' };
    if (c.k === 'show') return { latex: regionLatex(c), state: 'ok', note: '' };
    if (c.k === 'plot' || c.k === 'image') return { latex: '', state: 'ok', note: '' };
    if (c.k === 'sym') return this.symView(region, c);
    if (c.k === 'include') {
      const outcome = this.doc.outcomes.get(region.id);
      const failed = outcome?.error;
      const name = (c.file || '(no file)').replace(/[\\{}_%&#$^~]/g, (ch) => (ch === '\\' ? '\\textbackslash ' : `\\${ch}`));
      const shown = `\\text{Reference: ${name}}`;
      // Found, though it needs more files: shown as found, as Mathcad does, with what's missing on hover.
      if (failed && outcome.partial) return { latex: shown, state: 'ok', note: failed };
      return failed ? { latex: shown, state: 'stale', note: failed } : { latex: shown, state: 'ok', note: `Definitions from ${c.file} hold from here on` };
    }
    const outcome = this.doc.outcomes.get(region.id);
    const math = display(regionLatex(c)).replace(/=$/, '');
    const shows = c.k === 'eval' || (c.k === 'define' && c.shown);
    // The answer is a slot: clicking it chooses the unit it shows in. Its unit is marked apart from the
    // number, so editing the unit leaves the number in view.
    const answer = (result: string, unit?: string): string => {
      const tail = unit ? `\\ ${unit}` : '';
      const marked = tail && result.endsWith(tail) ? `${result.slice(0, -tail.length)}\\ \\htmlData{unitpart=1}{${unit}}` : result;
      return `${math}=\\htmlData{slot=unit}{${marked}}`;
    };
    if (region.disabled) return { latex: math, state: 'stale', note: 'Calculation is off for this region' };
    // Waiting for a file: the = stays, with a word saying so, rather than the answer seeming to vanish.
    if (outcome?.mathcad && outcome.needs && shows) {
      return { latex: `${math}=\\ {\\scriptsize\\text{needs a file}}`, state: 'stale', note: outcome.error ?? '' };
    }
    // A Mathcad feature to replace, such as a file function: grayed, with what to do instead.
    if (outcome?.mathcad) return { latex: math, state: 'stale', note: outcome.error ?? '' };
    const stored = c.stored;
    if (outcome?.error) {
      if (stored) {
        return { latex: answer(formatStored(stored, format)), state: 'stale', note: `Saved answer, not recomputed: ${outcome.error}` };
      }
      return { latex: math, state: 'error', note: outcome.error };
    }
    // While a calculation runs, or in EDIT mode after a change, an answer may be out of date, and must look it.
    const note = this.outdated(region.id);
    const current = note ? 'stale' : 'ok';
    if (shows && outcome?.value) return { latex: answer(outcome.value, outcome.unit), state: current, note };
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
      const note = this.outdated(region.id);
      return { latex: `${math}${outcome.value}`, state: note ? 'stale' : 'ok', note };
    }
    if (c.stored) return { latex: `${math}${tex(c.stored)}`, state: 'stale', note: 'Saved answer' };
    return { latex: math, state: 'stale', note: this.doc.live ? 'Calculating' : 'Not calculated in EDIT mode. Switch to LIVE to calculate.' };
  }

  /** Why results on the page may be out of date, or '' if they're current. */
  private outdated(id: string): string {
    // While calculating, only what the calculation may change: the first region affected and those below.
    if (this.doc.computing) return this.doc.mayChange?.has(id) ? 'Calculating' : '';
    return this.doc.behind;
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
    const before = this.selected;
    this.selected = new Set(ids);
    for (const [id, el] of this.views) el.classList.toggle('selected', this.selected.has(id));
    // Plots show a resize handle when selected, so they redraw when that changes.
    const changed = new Set([...before, ...this.selected].filter((id) => before.has(id) !== this.selected.has(id)));
    if (changed.size > 0) this.draw(changed);
  }

  /** The one selected region of a kind, for the Format menu. */
  selectedOf(kind: 'plot' | 'image'): Region | null {
    if (this.selected.size !== 1) return null;
    const item = this.doc.find([...this.selected][0]!);
    return item?.kind === 'math' && item.region.content.k === kind ? item.region : null;
  }

  /** Where the next inserted thing goes: the click waiting for input, or the top of the page. */
  insertionPoint(): { left: number; top: number } {
    if (this.editing?.kind === 'region' && this.editor.value() === '') {
      const { region } = this.editing;
      this.editor.close();
      this.editing = null;
      this.crosshair.hidden = true;
      this.doc.discard(region.id);
      return { left: region.left, top: region.top };
    }
    return { left: this.doc.ws.page.margins.left, top: this.doc.ws.page.margins.top };
  }

  /** Starts a plot where math was about to be typed. */
  insertPlot(): void {
    if (this.editing?.kind === 'region' && this.editor.value() === '') this.startPlotFromEmpty();
    else this.doc.onProblem('Click on the paper where it should go first');
  }

  /** Adds `■ := readImage("name")` for a file just loaded, with the name to type selected. */
  insertReadImage(source: string, fn = 'readImage'): void {
    const at = this.insertionPoint();
    const region = this.doc.addMath(at.left, at.top + 8);
    const quoted = source.replace(/[\\{}_%&#$^~]/g, (ch) => (ch === '\\' ? '\\textbackslash ' : `\\${ch}`));
    this.open(region, true);
    this.editor.field.setValue(`\\placeholder{}\\coloneq \\mathrm{${fn}}\\left(\\text{"${quoted}"}\\right)`, { silenceNotifications: true });
    this.editor.field.position = 0;
    this.editor.field.executeCommand('moveToNextPlaceholder');
  }

  /** Starts an image view where math was about to be typed. */
  insertImage(): void {
    if (!(this.editing?.kind === 'region' && this.editor.value() === '')) {
      this.doc.onProblem('Click on the paper where it should go first');
      return;
    }
    const at = this.insertionPoint();
    const region = this.doc.addImage(at.left, at.top);
    this.select([region.id]);
    this.openSlot(region, 'expr');
  }

  get selection(): Set<string> {
    return this.selected;
  }

  /** Undo acts on the sheet unless there's typing in progress for the editor to undo instead. */
  canUndo(): boolean {
    return !this.textEdit && !this.titleEdit && (!this.editor.isOpen || this.editor.value() === '');
  }

  /**
   * Outlines the region being calculated, as Mathcad does. Only once it has taken a moment, so a
   * quick sheet doesn't flicker.
   */
  private calculating(id: string | null): void {
    clearTimeout(this.calcTimer);
    this.sheet.querySelector('.region.calculating')?.classList.remove('calculating');
    if (id === null) return;
    this.calcTimer = setTimeout(() => this.views.get(id)?.classList.add('calculating'), CALC_BOX_DELAY);
  }

  /** Finishes any edit in progress. */
  commitAll(): void {
    this.commit('stay');
    this.commitText();
    this.commitTitle();
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
    this.editing = { kind: 'region', region, bottom, isNew };
    if (el) el.style.visibility = 'hidden';
    this.editor.show(region.left, region.top, regionLatex(region.content));
    // The answer stays in view, grayed, just after the math being edited, as in Mathcad, until the sheet
    // calculates again.
    const c = region.content;
    const value = this.doc.outcomes.get(region.id)?.value;
    if (value && (c.k === 'eval' || (c.k === 'define' && c.shown))) {
      this.ghost.innerHTML = render(value);
      this.ghost.hidden = false;
      this.placeGhost();
    }
  }

  /** Keeps the grayed answer just after the editor as the math grows and shrinks. */
  private placeGhost(): void {
    if (this.ghost.hidden) return;
    requestAnimationFrame(() => {
      const sheet = this.sheet.getBoundingClientRect();
      const f = this.editor.field.getBoundingClientRect();
      const g = this.ghost.getBoundingClientRect();
      this.ghost.style.left = `${(f.right - sheet.left) / PT + 2}pt`;
      this.ghost.style.top = `${(f.top + (f.height - g.height) / 2 - sheet.top) / PT}pt`;
    });
  }

  /** Edits one part of a region in place, over the part itself. */
  private openSlot(region: Region, slot: Slot): void {
    if (isTitleSlot(slot)) {
      this.openTitle(region, slot);
      return;
    }
    const el = this.views.get(region.id);
    const part = el?.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
    const sheet = this.sheet.getBoundingClientRect();
    let latex = slotLatex(region.content, slot);
    let over: HTMLElement | null | undefined = part;
    let after = false;
    if (slot === 'unit') {
      // Only the unit is edited, over the unit itself, starting from the one it shows now, all selected so
      // typing replaces it. A plain number has no unit: the editor opens just after it.
      const shown = this.doc.outcomes.get(region.id)?.unit ?? '';
      if (!latex) latex = shown;
      over = part?.querySelector<HTMLElement>('[data-unitpart]');
      if (!over) {
        over = part;
        after = true;
      }
    }
    const box = (over ?? el)?.getBoundingClientRect();
    const left = box ? ((after ? box.right + 2 : box.left) - sheet.left) / PT : region.left;
    const top = box ? (box.top - sheet.top) / PT : region.top;
    this.editing = { kind: 'slot', region, slot };
    if (!after) over?.classList.add('editing');
    this.editor.show(left, top, latex, true);
    if (slot === 'unit' && latex) this.editor.selectAll();
  }

  /** A title is plain text, so it's typed right where it shows, like a text region. */
  private openTitle(region: Region, slot: TitleSlot): void {
    const el = this.views.get(region.id)?.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
    if (!el) return;
    el.textContent = titleText(region.content, slot);
    el.classList.remove('empty');
    el.classList.add('typing');
    el.contentEditable = 'plaintext-only';
    this.titleEdit = { region, slot, el };
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  private commitTitle(): void {
    const edit = this.titleEdit;
    if (!edit) return;
    this.titleEdit = null;
    const { region, slot, el } = edit;
    el.contentEditable = 'false';
    el.classList.remove('typing');
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
    const current = this.doc.find(region.id);
    const content = current?.kind === 'math' ? current.region.content : region.content;
    if (text !== titleText(content, slot)) this.doc.update(region, (c) => withTitle(c, slot, text));
    else this.draw(new Set([region.id]));
  }

  private commitSlot(region: Region, slot: Slot, next: 'stay' | 'below' | 'next'): void {
    const latex = this.editor.value();
    const changed = this.editor.edited();
    const following = NEXT_SLOT[slot];
    this.editor.close(next === 'next' && Boolean(following));
    this.editing = null;
    this.views.get(region.id)?.querySelector('[data-slot].editing, [data-unitpart].editing')?.classList.remove('editing');
    if (changed) {
      try {
        const content = withSlot(region.content, slot, latex);
        this.doc.update(region, () => content);
      } catch (err) {
        this.doc.onProblem(`Can't read that: ${(err as Error).message}`);
      }
    }
    if (next === 'next' && following) this.openSlot(region, following);
  }

  private startPlotFromEmpty(): void {
    const editing = this.editing;
    if (editing?.kind !== 'region') return;
    const { region } = editing;
    this.editor.close();
    this.editing = null;
    this.crosshair.hidden = true;
    this.doc.discard(region.id);
    const plot = this.doc.addPlot(region.left, region.top);
    this.select([plot.id]);
    this.openSlot(plot, 'ys');
  }

  private commit(next: 'stay' | 'below' | 'next'): void {
    const editing = this.editing;
    if (!editing) return;
    if (editing.kind === 'slot') {
      this.commitSlot(editing.region, editing.slot, next);
      return;
    }
    const { region, bottom, isNew } = editing;
    const latex = this.editor.value();
    const changed = this.editor.edited();
    const height = this.editor.field.offsetHeight / PT;
    this.editor.close(next === 'below');
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
    if (editing?.kind !== 'region') return;
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
    if (this.titleEdit && target.closest('[data-slot]') === this.titleEdit.el) return;
    e.preventDefault();
    const p = this.point(e);
    this.commitAll();
    if (target.classList.contains('handle') && view) {
      const item = this.doc.find(view.dataset.id!);
      if (item?.kind === 'math' && (item.region.content.k === 'plot' || item.region.content.k === 'image')) {
        const { width, height } = item.region.content;
        this.press = { kind: 'resize', id: item.region.id, x: p.x, y: p.y, width, height };
        return;
      }
    }
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
    const slot = (target.closest<HTMLElement>('[data-slot]')?.dataset.slot ?? null) as Slot | null;
    this.press = { kind: 'region', id, x: p.x, y: p.y, dragging: false, slot };
  }

  private onMove(e: MouseEvent): void {
    const press = this.press;
    if (!press) return;
    const p = this.point(e);
    const [dx, dy] = [p.x - press.x, p.y - press.y];
    const far = Math.hypot(dx, dy) * PT > DRAG_THRESHOLD;
    if (press.kind === 'resize') {
      const el = this.views.get(press.id);
      const svg = el?.querySelector<HTMLElement | SVGElement>('.plot-svg, .frame');
      if (el) {
        el.style.width = `${Math.max(MIN_PLOT.width, press.width + dx)}pt`;
        el.style.height = `${Math.max(MIN_PLOT.height, press.height + dy)}pt`;
      }
      if (svg) svg.style.opacity = '0.4';
      return;
    }
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
    if (press.kind === 'resize') {
      const item = this.doc.find(press.id);
      if (item?.kind === 'math') {
        const width = Math.max(MIN_PLOT.width, snap(press.width + p.x - press.x));
        const height = Math.max(MIN_PLOT.height, snap(press.height + p.y - press.y));
        this.doc.update(item.region, (c) => (c.k === 'plot' || c.k === 'image' ? { ...c, width, height } : c));
      }
      return;
    }
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
    if (item?.kind === 'math' && press.slot) {
      this.openSlot(item.region, press.slot);
      return;
    }
    if (item?.kind === 'math' && (item.region.content.k === 'plot' || item.region.content.k === 'image')) {
      this.select([press.id]);
      return;
    }
    this.select([]);
    if (item?.kind === 'math' && isEditable(item.region.content)) this.open(item.region, false);
    else if (item?.kind === 'text') this.openText(item.region);
    else if (item) this.select([press.id]);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.titleEdit) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        this.commitTitle();
      }
      return;
    }
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

