// MathMath: math on paper, in the browser.
// Copyright (C) 2026 Pelican Labs, LLC
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
// General Public License as published by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
// implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
// License for more details.
//
// You should have received a copy of the GNU Affero General Public License along with this program. If not,
// see <https://www.gnu.org/licenses/>.

/**
 * Typing formatted text in place: the words of a text region, with a bar of formats over it. Built on ProseMirror,
 * whose document is the truth while typing (see richschema.ts); the region is given the result when typing ends.
 *
 * What's pasted or dropped from elsewhere arrives as plain words. Only text copied from MathMath keeps its formatting,
 * and even that is read back only through the schema's own checked attributes.
 */
import { baseKeymap, chainCommands, splitBlockAs, toggleMark } from 'prosemirror-commands';
import { closeHistory, history, redo, undo } from 'prosemirror-history';
import { InputRule, inputRules, undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { Fragment, type MarkType, type Node, type ResolvedPos, Slice } from 'prosemirror-model';
import { AllSelection, type Command, EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView, type NodeView } from 'prosemirror-view';
import { AFTER, type Align, type BlockKind, LINES, MAX_LEVEL, type TextBlock } from '../model/richtext.js';
import { BLOCK_KINDS, blocksOf, docOf, schema, showRef } from './richschema.js';

type Attrs = { kind: BlockKind | null; level: number; align: Align | null; line: number | null; after: number | null; label: string | null };
const isListKind = (k: unknown): boolean => k === 'bullet' || k === 'number';
const isHeadingKind = (k: unknown): boolean => k === 'title' || k === 'h1' || k === 'h2';

/** The blocks the selection touches, with where each starts. */
function selectedBlocks(state: EditorState): { node: Node; pos: number }[] {
  const { from, to } = state.selection;
  const out: { node: Node; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === schema.nodes.block) out.push({ node, pos });
    return node.type === schema.nodes.doc;
  });
  return out;
}

/** Changes the attributes of every block the selection touches. */
const setBlocks = (change: (a: Attrs) => Partial<Attrs>): Command => (state, dispatch) => {
  const blocks = selectedBlocks(state);
  if (blocks.length === 0) return false;
  if (dispatch) {
    const tr = state.tr;
    for (const { node, pos } of blocks) {
      const was = node.attrs as Attrs;
      const next = { ...was, ...change(was) };
      if (!isListKind(next.kind)) next.level = 0;
      tr.setNodeMarkup(pos, undefined, next);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

const every = (state: EditorState, test: (a: Attrs) => boolean): boolean => selectedBlocks(state).every(({ node }) => test(node.attrs as Attrs));

/** Paragraph, title, heading or subheading. */
export const setKind = (kind: BlockKind | null): Command => setBlocks(() => ({ kind }));
/** A bulleted or numbered list, or back to paragraphs when they all are already. */
export const toggleList = (kind: 'bullet' | 'number'): Command => (state, dispatch) => {
  const on = every(state, (a) => a.kind === kind);
  return setBlocks(() => ({ kind: on ? null : kind }))(state, dispatch);
};
/** One level deeper in a list, or one back out. Not a list: nothing to do. */
export const indent = (by: 1 | -1): Command => (state, dispatch) => {
  if (!every(state, (a) => isListKind(a.kind))) return false;
  return setBlocks((a) => ({ level: Math.min(MAX_LEVEL, Math.max(0, a.level + by)) }))(state, dispatch);
};
export const setAlign = (align: Align | null): Command => setBlocks(() => ({ align }));
export const setLine = (line: number | null): Command => setBlocks(() => ({ line: line === null || line === 1 ? null : Math.min(LINES.max, Math.max(LINES.min, line)) }));
export const setAfter = (after: number | null): Command => setBlocks(() => ({ after: after ? Math.min(AFTER.max, Math.max(AFTER.min, after)) : null }));

/** Whether the selection, or what's about to be typed, has a mark, with these attributes if given. */
function hasMark(state: EditorState, type: MarkType, test: (attrs: Record<string, unknown>) => boolean = () => true): boolean {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    const m = type.isInSet(state.storedMarks ?? $from.marks());
    return !!m && test(m.attrs);
  }
  let all = true;
  let any = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true;
    any = true;
    const m = type.isInSet(node.marks);
    if (!m || !test(m.attrs)) all = false;
    return false;
  });
  return any && all;
}

/** Gives the selection, or what's typed next, a mark, or takes it away. */
const markCommand = (type: MarkType, attrs: Record<string, unknown> | null): Command => (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (dispatch) {
    const tr = state.tr;
    if (empty) {
      tr.removeStoredMark(type);
      if (attrs) tr.addStoredMark(type.create(attrs));
    } else {
      tr.removeMark(from, to, type);
      if (attrs) tr.addMark(from, to, type.create(attrs));
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** A subscript or superscript, or back to the line when it already is one. */
export const toggleScript = (which: 'sub' | 'sup'): Command => (state, dispatch) =>
  markCommand(schema.marks.script!, hasMark(state, schema.marks.script!, (a) => a.which === which) ? null : { which })(state, dispatch);
export const setColor = (hex: string | null): Command => markCommand(schema.marks.color!, hex ? { hex } : null);
export const toggle = (name: 'bold' | 'italic' | 'underline'): Command => toggleMark(schema.marks[name]!);
/** Back to plain words and paragraphs. */
export const clearFormat: Command = (state, dispatch) => {
  if (dispatch) {
    const { from, to } = state.selection;
    const tr = state.tr.removeMark(from, to).setStoredMarks([]);
    for (const { node, pos } of selectedBlocks(state)) tr.setNodeMarkup(pos, undefined, { ...(node.attrs as Attrs), kind: null, level: 0, align: null, line: null, after: null, label: null });
    dispatch(tr);
  }
  return true;
};

/**
 * Enter: a new block like this one, though one after a heading's end is a paragraph. An empty list item steps out a
 * level, and out of the list from its first.
 */
const enter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  const attrs = node.attrs as Attrs;
  if (empty && node.content.size === 0 && isListKind(attrs.kind)) {
    return setBlocks(() => (attrs.level > 0 ? { level: attrs.level - 1 } : { kind: null }))(state, dispatch);
  }
  // At the start of a block with words, a new block goes before it, and its label stays with its words.
  if (empty && $from.parentOffset === 0 && node.content.size > 0 && attrs.label !== null) {
    if (dispatch) dispatch(state.tr.insert($from.before(), schema.nodes.block!.create({ ...attrs, label: null })).scrollIntoView());
    return true;
  }
  return splitBlockAs((n, atEnd) => ({
    type: n.type,
    // A heading's or caption's label stays with its first part: what follows is a block of its own.
    attrs: atEnd && (isHeadingKind(n.attrs.kind) || n.attrs.kind === 'caption') ? { kind: null, level: 0, align: null, line: null, after: null, label: null } : { ...n.attrs, label: null },
  }))(state, dispatch);
};

/** Backspace at the start of a list item takes its bullet or number away, keeping its words where they are. */
const unlist: Command = (state, dispatch) => {
  const { $cursor } = state.selection as TextSelection;
  if (!$cursor || $cursor.parentOffset > 0 || !isListKind($cursor.parent.attrs.kind)) return false;
  return setBlocks(() => ({ kind: null }))(state, dispatch);
};

const hardBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break!.create()).scrollIntoView());
  return true;
};

/** A format given on its own step to undo, apart from the typing before and after it. */
const apart = (command: Command): Command => (state, dispatch, view) => command(state, dispatch && ((tr) => dispatch(closeHistory(tr))), view);

/** Typing "- ", "* " or "1. " at the start of a paragraph makes it a list item. */
const listRule = (pattern: RegExp, kind: 'bullet' | 'number'): InputRule => new InputRule(pattern, (state, _match, start, end) => {
  const $start = state.doc.resolve(start);
  if ($start.parent.attrs.kind !== null) return null;
  return state.tr.delete(start, end).setNodeMarkup($start.before(), undefined, { ...($start.parent.attrs as Attrs), kind });
});

/** Words as a slice: a block for each line, like the block they're put into, so lines pasted into a list are items. */
function textSlice(text: string, $at: ResolvedPos): Slice {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const attrs = $at.parent.type === schema.nodes.block ? { ...$at.parent.attrs, label: null } : null;
  const blocks = lines.map((line) => {
    // Control characters other than a tab aren't words.
    const words = line.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
    return schema.node('block', attrs, words ? schema.text(words) : undefined);
  });
  return new Slice(Fragment.from(blocks), 1, 1);
}

/** Whether a paste or drop came from a MathMath text, or another editor of the same kind: then it's read by the schema. */
const fromEditor = (data: DataTransfer | null): boolean => (data?.getData('text/html') ?? '').includes('data-pm-slice');

const escapeText = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (t: string): string => escapeText(t).replace(/"/g, '&quot;');

/**
 * Copied text's markup rebuilt from only what the schema writes, before the editor reads it: it's read in a page
 * that loads nothing and runs nothing, and only blocks, spans with the schema's own attributes, sub- and
 * superscripts and line breaks are kept. What it says of the text it was copied from is dropped, as that would be
 * taken as it is, unchecked.
 */
export function safeHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const attrs = (el: Element, names: string[]): string =>
    names.filter((n) => el.hasAttribute(n)).map((n) => ` ${n}="${escapeAttr(el.getAttribute(n)!)}"`).join('');
  const walk = (node: globalThis.Node): string => {
    if (node.nodeType === 3) return escapeText(node.textContent ?? '');
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    const tag = el.localName;
    if (['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'head', 'title'].includes(tag)) return '';
    const inner = [...el.childNodes].map(walk).join('');
    const slice = /^(\d+) (\d+)/.exec(el.getAttribute('data-pm-slice') ?? '');
    const open = slice ? ` data-pm-slice="${Math.min(1, Number(slice[1]))} ${Math.min(1, Number(slice[2]))} []"` : '';
    if (tag === 'br') return '<br>';
    if (tag === 'sub' || tag === 'sup') return `<${tag}>${inner}</${tag}>`;
    if (tag === 'div' && el.classList.contains('tb')) {
      const kinds = BLOCK_KINDS.filter((k) => el.classList.contains(k));
      return `<div class="tb ${kinds.join(' ')}"${attrs(el, ['data-level', 'data-align', 'data-line', 'data-after', 'data-label'])}${open}>${inner}</div>`;
    }
    if (tag === 'span' && el.hasAttribute('data-math')) return `<span${attrs(el, ['data-math', 'data-latex'])}${open}></span>`;
    if (tag === 'span' && el.hasAttribute('data-ref')) return `<span${attrs(el, ['data-ref'])}${open}></span>`;
    if (tag === 'span') return `<span${attrs(el, ['data-bold', 'data-italic', 'data-underline', 'data-color', 'data-size'])}${open}>${inner}</span>`;
    return open ? `<div${open}>${inner}</div>` : inner;
  };
  return walk(doc.body);
}

export interface RichEditorEvents {
  /** The words or their look changed. */
  changed: () => void;
  /** Draws math in the words, by its id and LaTeX. */
  mathView?: (id: string, latex: string) => HTMLElement;
  /** An id for new math. */
  newId?: () => string;
  /** Opens math in the words for editing: the element it's drawn in, its id and LaTeX. */
  openMath?: (dom: HTMLElement, id: string, latex: string) => void;
  /** What a reference shows now, by the label it names, and whether that's gone. */
  refText?: (label: string) => { text: string; missing: boolean };
  /** What a reference can name, in the order read. */
  refChoices?: () => RefChoice[];
  /** Whether a label already names a heading or caption: one pasted is then a copy, with none of its own. */
  labelTaken?: (label: string) => boolean;
}

/**
 * Something a reference can name, as Reference offers it: by its label, or, for a heading or caption with none yet,
 * the block in these words to give one, or a way to give one elsewhere.
 */
export interface RefChoice {
  title: string;
  /** A drawing of it, as for an equation. */
  preview?: HTMLElement;
  label?: string;
  block?: number;
  give?: () => string | undefined;
}

/** A reference in the words: the number it names, filled in by the page. */
function refNodeView(node: Node, text: (label: string) => { text: string; missing: boolean }): NodeView {
  const dom = document.createElement('span');
  dom.className = 'ref';
  dom.dataset.ref = node.attrs.label as string;
  dom.contentEditable = 'false';
  const r = text(node.attrs.label as string);
  showRef(dom, r.text, r.missing);
  return {
    dom,
    update: (next) => next.type === node.type && next.attrs.label === node.attrs.label,
    ignoreMutation: () => true,
    selectNode: () => dom.classList.add('chosen'),
    deselectNode: () => dom.classList.remove('chosen'),
  };
}

/** Math in the words, drawn by the page, which the editor leaves alone. */
function mathNodeView(node: Node, draw: (id: string, latex: string) => HTMLElement): NodeView {
  const dom = document.createElement('span');
  dom.className = 'inline-math';
  dom.dataset.math = node.attrs.id as string;
  dom.contentEditable = 'false';
  dom.appendChild(draw(node.attrs.id as string, node.attrs.latex as string));
  return {
    dom,
    update: (next) => next.type === node.type && next.attrs.id === node.attrs.id && next.attrs.latex === node.attrs.latex,
    ignoreMutation: () => true,
    selectNode: () => dom.classList.add('chosen'),
    deselectNode: () => dom.classList.remove('chosen'),
  };
}

/** Pasted math is new math: each gets a new id, so it's a region of its own. */
function freshMath(fragment: Fragment, newId: () => string): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((n) => {
    if (n.type === schema.nodes.math) nodes.push(schema.nodes.math!.create({ ...n.attrs, id: newId() }));
    else if (n.isText || n.isLeaf) nodes.push(n);
    else nodes.push(n.copy(freshMath(n.content, newId)));
  });
  return Fragment.from(nodes);
}

/** A pasted heading or caption whose label names one already is a copy of it: references stay with the first. */
function freshLabels(fragment: Fragment, taken: (label: string) => boolean): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((n) => {
    if (n.type === schema.nodes.block && typeof n.attrs.label === 'string' && taken(n.attrs.label)) nodes.push(n.type.create({ ...n.attrs, label: null }, n.content, n.marks));
    else nodes.push(n);
  });
  return Fragment.from(nodes);
}

/** The editor over one text region's element. */
export class RichEditor {
  readonly view: EditorView;
  private bar: FormatBar;

  /** `at`, a point on the screen, is where the caret goes; otherwise it goes to the end. */
  constructor(
    private host: HTMLElement, blocks: readonly TextBlock[], private events: RichEditorEvents, private anchor: HTMLElement, at?: { x: number; y: number },
    latexOf?: (id: string) => string | undefined,
  ) {
    const state = EditorState.create({
      doc: docOf(blocks, latexOf),
      plugins: [
        history(),
        inputRules({ rules: [listRule(/^[-*•]\s$/, 'bullet'), listRule(/^1[.)]\s$/, 'number')] }),
        keymap({
          'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo,
          'Mod-b': apart(toggle('bold')), 'Mod-i': apart(toggle('italic')), 'Mod-u': apart(toggle('underline')),
          'Mod-,': apart(toggleScript('sub')), 'Mod-.': apart(toggleScript('sup')),
          'Shift-Mod-8': apart(toggleList('bullet')), 'Shift-Mod-7': apart(toggleList('number')),
          'Mod-Alt-0': apart(setKind(null)), 'Mod-Alt-1': apart(setKind('h1')), 'Mod-Alt-2': apart(setKind('h2')),
          Tab: apart(indent(1)), 'Shift-Tab': apart(indent(-1)),
          Enter: chainCommands(this.openChosen, enter), 'Shift-Enter': hardBreak,
          'Mod-m': (_state, dispatch) => {
            if (dispatch) this.insertMath();
            return true;
          },
          Backspace: chainCommands(undoInputRule, unlist),
        }),
        keymap(baseKeymap),
      ],
    });
    // The caret goes to the end, as it did in a plain region.
    const end = TextSelection.atEnd(state.doc);
    this.view = new EditorView({ mount: host }, {
      state: state.apply(state.tr.setSelection(end)),
      attributes: { class: 'pm', spellcheck: 'true' },
      dispatchTransaction: (tr: Transaction) => {
        this.view.updateState(this.view.state.apply(tr));
        this.bar.update();
        if (tr.docChanged) this.events.changed();
      },
      // From elsewhere, only the words are taken, before the editor reads any markup.
      handleDOMEvents: {
        paste: (view, event) => {
          if (fromEditor(event.clipboardData)) return false;
          event.preventDefault();
          const text = event.clipboardData?.getData('text/plain') ?? '';
          if (text) view.dispatch(view.state.tr.replaceSelection(textSlice(text, view.state.selection.$from)).scrollIntoView());
          return true;
        },
        drop: (view, event) => {
          if (view.dragging || fromEditor(event.dataTransfer)) return false;
          event.preventDefault();
          const text = event.dataTransfer?.getData('text/plain') ?? '';
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (text && at) view.dispatch(view.state.tr.replaceRange(at.pos, at.pos, textSlice(text, view.state.doc.resolve(at.pos))));
          return true;
        },
      },
      transformPastedHTML: safeHTML,
      clipboardTextParser: (text, $context) => textSlice(text, $context),
      transformPasted: (slice, view) => {
        let content = events.newId ? freshMath(slice.content, events.newId) : slice.content;
        // A heading dragged within the words is moved, label and all: only a copy is new.
        if (events.labelTaken && !view.dragging?.move) content = freshLabels(content, events.labelTaken);
        return new Slice(content, slice.openStart, slice.openEnd);
      },
      nodeViews: {
        ...(events.mathView ? { math: (node: Node) => mathNodeView(node, events.mathView!) } : {}),
        ...(events.refText ? { ref: (node: Node) => refNodeView(node, events.refText!) } : {}),
      },
      handleClickOn: (_view, _pos, node, nodePos) => {
        if (node.type !== schema.nodes.math) return false;
        this.open(nodePos);
        return true;
      },
    });
    this.bar = new FormatBar(this);
    const pos = at && this.view.posAtCoords({ left: at.x, top: at.y });
    if (pos) this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, pos.pos)));
    this.view.focus();
    this.bar.update();
  }

  /**
   * Runs a format on the selection, keeping the caret in the words. With `whole`, a format given with nothing selected
   * goes to all of the words, as Format's menu does for a region.
   */
  run(command: Command, whole = false): void {
    const { view } = this;
    const was = view.state.selection;
    if (whole && was.empty) {
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
      apart(command)(view.state, view.dispatch);
      view.dispatch(view.state.tr.setSelection(was.map(view.state.doc, view.state.tr.mapping)));
    } else apart(command)(view.state, view.dispatch);
    view.focus();
  }

  is(name: 'bold' | 'italic' | 'underline'): boolean {
    return hasMark(this.view.state, schema.marks[name]!);
  }

  isScript(which: 'sub' | 'sup'): boolean {
    return hasMark(this.view.state, schema.marks.script!, (a) => a.which === which);
  }

  /** The attributes of the block the caret is in. */
  get block(): Attrs {
    return this.view.state.selection.$from.parent.attrs as Attrs;
  }

  /** Enter on chosen math opens it. */
  private openChosen: Command = (state) => {
    const sel = state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== schema.nodes.math) return false;
    this.open(sel.from);
    return true;
  };

  /** Opens the math at `pos` for editing. */
  private open(pos: number): void {
    const node = this.view.state.doc.nodeAt(pos);
    const dom = this.view.nodeDOM(pos);
    if (node?.type !== schema.nodes.math || !(dom instanceof HTMLElement)) return;
    this.events.openMath?.(dom, node.attrs.id as string, node.attrs.latex as string);
  }

  /** Opens math, by id, for editing. */
  openMath(id: string): void {
    const pos = this.findMath(id);
    if (pos !== null) this.open(pos);
  }

  /** New math at the caret, opened for typing. */
  insertMath(): void {
    if (!this.events.newId) return;
    const { view } = this;
    const node = schema.nodes.math!.create({ id: this.events.newId(), latex: '' });
    const tr = closeHistory(view.state.tr.replaceSelectionWith(node, false));
    const pos = tr.mapping.map(view.state.selection.from, -1);
    view.dispatch(tr);
    this.open(pos);
  }

  /**
   * A reference at the caret to what's chosen. A heading or caption without a label is given one first, in the same
   * step to undo.
   */
  insertRef(choice: RefChoice): void {
    const { view } = this;
    const tr = view.state.tr;
    let label = choice.label;
    if (label === undefined && choice.block !== undefined && this.events.newId && choice.block < view.state.doc.childCount) {
      label = `L${this.events.newId()}`;
      let at = 0;
      for (let i = 0; i < choice.block; i++) at += view.state.doc.child(i).nodeSize;
      tr.setNodeMarkup(at, undefined, { ...view.state.doc.child(choice.block).attrs, label });
    } else if (label === undefined) label = choice.give?.();
    if (label === undefined) return;
    tr.replaceSelectionWith(schema.nodes.ref!.create({ label }), false);
    view.dispatch(closeHistory(tr.scrollIntoView()));
    view.focus();
  }

  /** Each reference shows what it names now: numbers change as what's before them does. */
  refreshRefs(): void {
    const text = this.events.refText;
    if (!text) return;
    for (const el of this.view.dom.querySelectorAll<HTMLElement>('span.ref[data-ref]')) {
      const r = text(el.dataset.ref!);
      showRef(el, r.text, r.missing);
    }
  }

  /** What a reference can name now, for Reference. */
  refChoices(): RefChoice[] {
    return this.events.refChoices?.() ?? [];
  }

  /** Where math is, by id. */
  private findMath(id: string): number | null {
    let at: number | null = null;
    this.view.state.doc.descendants((node, pos) => {
      if (at !== null) return false;
      if (node.type === schema.nodes.math && node.attrs.id === id) at = pos;
      return node.type !== schema.nodes.math;
    });
    return at;
  }

  /** Math as typed, after its editor closes: kept, or taken out when there's none. The caret goes on after it. */
  setMath(id: string, latex: string): void {
    const { view } = this;
    const pos = this.findMath(id);
    if (pos !== null) {
      const node = view.state.doc.nodeAt(pos)!;
      const tr = latex.trim() === '' ? view.state.tr.delete(pos, pos + node.nodeSize)
        : node.attrs.latex === latex ? view.state.tr : view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex });
      const after = latex.trim() === '' ? pos : pos + node.nodeSize;
      view.dispatch(closeHistory(tr.setSelection(TextSelection.create(tr.doc, after))));
    }
    view.focus();
  }

  /** Math given another id when it was kept (see Doc.setTextAndMath), as the region it's now in. */
  renameMath(renamed: ReadonlyMap<string, string>): void {
    if (renamed.size === 0) return;
    const tr = this.view.state.tr;
    this.view.state.doc.descendants((node, pos) => {
      const to = node.type === schema.nodes.math ? renamed.get(node.attrs.id as string) : undefined;
      if (to) tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: to });
      return node.type !== schema.nodes.math;
    });
    this.view.dispatch(tr.setMeta('addToHistory', false));
  }

  /** The math the selection holds, by id: Format's result formats act on it. */
  selectedMath(): string[] {
    const { from, to } = this.view.state.selection;
    const out: string[] = [];
    this.view.state.doc.nodesBetween(from, to, (node) => {
      if (node.type === schema.nodes.math) out.push(node.attrs.id as string);
      return node.type !== schema.nodes.math;
    });
    return out;
  }

  /** While math in the words is being typed, the formats wait. */
  set mathOpen(on: boolean) {
    this.bar.busy(on);
  }

  /** Math given the LaTeX its region now reads as, by id, where that differs: not a step to undo. */
  syncMath(latex: ReadonlyMap<string, string>): void {
    const tr = this.view.state.tr;
    this.view.state.doc.descendants((node, pos) => {
      const to = node.type === schema.nodes.math ? latex.get(node.attrs.id as string) : undefined;
      if (to !== undefined && to !== node.attrs.latex) tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex: to });
      return node.type !== schema.nodes.math;
    });
    if (tr.docChanged) this.view.dispatch(tr.setMeta('addToHistory', false));
  }

  /** The element math is drawn in, by id. */
  mathDom(id: string): HTMLElement | null {
    const pos = this.findMath(id);
    const dom = pos === null ? null : this.view.nodeDOM(pos);
    return dom instanceof HTMLElement ? dom : null;
  }

  /** What's been typed, as blocks, or null when it's more than a region may keep formatted. */
  blocks(): TextBlock[] | null {
    return blocksOf(this.view.state.doc);
  }

  /** Where the bar goes: over this element. */
  get over(): HTMLElement {
    return this.anchor;
  }

  /** Takes the editor away, leaving the element empty for the region to be drawn in again. */
  destroy(): void {
    this.bar.remove();
    this.view.destroy();
    this.host.remove();
  }
}

const COLORS: [string, string | null][] = [
  ['Black', null], ['Blue', '#1c5cab'], ['Red', '#b3261e'], ['Green', '#1d7a3e'], ['Purple', '#5a3fc0'], ['Orange', '#b45309'], ['Gray', '#52514e'],
];
/** The colors words can take: dark enough to read on the page. Format → Text color… offers the same. */
export const TEXT_COLORS = COLORS;

/** A small drawing for a button: lines [x1, y, x2], 16 units square, in the button's color, with dots or numbers before them. */
function icon(lines: [number, number, number][], before?: 'dots' | 'numbers'): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag: string, attrs: Record<string, string | number>, text?: string): void => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text) e.textContent = text;
    svg.appendChild(e);
  };
  for (const [x1, y, x2] of lines) add('line', { x1, y1: y, x2, y2: y, stroke: 'currentColor', 'stroke-width': 1.5 });
  lines.forEach(([, y], i) => {
    if (before === 'dots') add('circle', { cx: 2.5, cy: y, r: 1.4, fill: 'currentColor' });
    else if (before === 'numbers') add('text', { x: 0.5, y: y + 2.2, 'font-size': 6, 'font-family': 'sans-serif', fill: 'currentColor' }, String(i + 1));
  });
  return svg;
}

const KINDS: [string, BlockKind | null, string][] = [
  ['Paragraph', null, 'Ctrl+Alt+0'], ['Title', 'title', ''], ['Heading', 'h1', 'Ctrl+Alt+1'], ['Subheading', 'h2', 'Ctrl+Alt+2'], ['Caption', 'caption', ''],
];

/**
 * The formats, in a bar over the text being typed: the kind of block, bold, italic, underline, sub- and superscript,
 * color, lists, alignment and spacing. Pressing a button never takes the caret out of the words.
 */
class FormatBar {
  private el = document.createElement('div');
  private kind: HTMLButtonElement;
  private toggles: [HTMLButtonElement, () => boolean][] = [];
  private popup: HTMLElement | null = null;
  private place = () => this.position();

  constructor(private editor: RichEditor) {
    this.el.id = 'format-bar';
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', 'Text format');
    // A press in the bar keeps the caret where it is.
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') e.preventDefault();
    });
    this.kind = this.button('Paragraph ▾', 'Paragraph, title, heading, subheading or a figure\'s caption', (b) => this.menu(b, KINDS.map(([label, kind, keys]) => [label, keys, () => editor.run(setKind(kind))])));
    this.kind.classList.add('kind');
    this.sep();
    this.toggle('B', 'Bold (Ctrl+B)', () => editor.run(toggle('bold')), () => editor.is('bold')).style.fontWeight = 'bold';
    this.toggle('I', 'Italic (Ctrl+I)', () => editor.run(toggle('italic')), () => editor.is('italic')).style.fontStyle = 'italic';
    this.toggle('U', 'Underline (Ctrl+U)', () => editor.run(toggle('underline')), () => editor.is('underline')).style.textDecoration = 'underline';
    this.toggle('x₂', 'Subscript (Ctrl+,)', () => editor.run(toggleScript('sub')), () => editor.isScript('sub'));
    this.toggle('x²', 'Superscript (Ctrl+.)', () => editor.run(toggleScript('sup')), () => editor.isScript('sup'));
    this.button('A ▾', 'Color', (b) => this.menu(b, COLORS.map(([name, hex]) => [name, '', () => editor.run(setColor(hex)), hex ?? '#111111'])));
    this.sep();
    this.toggle(icon([[6, 3.5, 15], [6, 8, 15], [6, 12.5, 15]], 'dots'), 'Bulleted list (Ctrl+Shift+8)', () => editor.run(toggleList('bullet')), () => editor.block.kind === 'bullet');
    this.toggle(icon([[6, 3.5, 15], [6, 8, 15], [6, 12.5, 15]], 'numbers'), 'Numbered list (Ctrl+Shift+7)', () => editor.run(toggleList('number')), () => editor.block.kind === 'number');
    this.button('⇤', 'Out a level (Shift+Tab)', () => editor.run(indent(-1)));
    this.button('⇥', 'In a level (Tab)', () => editor.run(indent(1)));
    this.sep();
    const aligns: [SVGSVGElement, Align, string][] = [
      [icon([[1, 3, 15], [1, 6.5, 10], [1, 10, 15], [1, 13.5, 8]]), 'left', 'Align left'],
      [icon([[1, 3, 15], [4, 6.5, 12], [1, 10, 15], [5, 13.5, 11]]), 'center', 'Center'],
      [icon([[1, 3, 15], [6, 6.5, 15], [1, 10, 15], [8, 13.5, 15]]), 'right', 'Align right'],
      [icon([[1, 3, 15], [1, 6.5, 15], [1, 10, 15], [1, 13.5, 15]]), 'justify', 'Justify'],
    ];
    for (const [label, align, hint] of aligns) {
      this.toggle(label, hint, () => editor.run(setAlign(editor.block.align === align ? null : align)), () => editor.block.align === align);
    }
    this.button('↕ ▾', 'Line spacing and space after', (b) => this.menu(b, [
      ['Single spacing', '', () => editor.run(setLine(null))], ['1.5 lines', '', () => editor.run(setLine(1.5))], ['Double spacing', '', () => editor.run(setLine(2))],
      ['No space after', '', () => editor.run(setAfter(null))], ['6 pt after', '', () => editor.run(setAfter(6))], ['12 pt after', '', () => editor.run(setAfter(12))],
    ]));
    this.button('Plain', 'Back to plain words and paragraphs', () => editor.run(clearFormat));
    this.sep();
    this.button('Math', 'Math in the line of text, calculated where the text starts (Ctrl+M)', () => editor.insertMath()).classList.add('math');
    this.button('Ref ▾', 'A reference to a numbered equation, a figure or a section, which keeps its number up to date', (b) => {
      const choices = editor.refChoices();
      this.menu(b, choices.length ? choices.map((c) => [c.preview ?? c.title, '', () => editor.insertRef(c)])
        : [['Nothing is numbered yet: number an equation with Format → Number equation, or make a caption or heading', '', () => {}]]);
    }).classList.add('ref-button');
    document.body.appendChild(this.el);
    window.addEventListener('scroll', this.place, true);
    window.addEventListener('resize', this.place);
  }

  private button(label: string | SVGSVGElement, hint: string, click: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.append(label);
    b.title = hint;
    b.setAttribute('aria-label', hint);
    b.addEventListener('click', () => click(b));
    this.el.appendChild(b);
    return b;
  }

  private toggle(label: string | SVGSVGElement, hint: string, click: () => void, on: () => boolean): HTMLButtonElement {
    const b = this.button(label, hint, click);
    this.toggles.push([b, on]);
    return b;
  }

  busy(on: boolean): void {
    this.el.classList.toggle('busy', on);
    if (on) this.closeMenu();
  }

  private sep(): void {
    const s = document.createElement('span');
    s.className = 'sep';
    this.el.appendChild(s);
  }

  /** A short list under a button. */
  private menu(under: HTMLButtonElement, items: [string | HTMLElement, string, () => void, string?][]): void {
    const open = this.popup;
    this.closeMenu();
    if (open?.dataset.for === under.title) return;
    const list = document.createElement('div');
    list.className = 'format-menu';
    list.dataset.for = under.title;
    list.setAttribute('role', 'menu');
    for (const [label, keys, act, swatch] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (swatch) {
        const chip = document.createElement('span');
        chip.className = 'swatch';
        chip.style.background = swatch;
        b.appendChild(chip);
      }
      b.append(label);
      if (keys) {
        const k = document.createElement('span');
        k.className = 'keys';
        k.textContent = keys;
        b.appendChild(k);
      }
      b.addEventListener('click', () => {
        this.closeMenu();
        act();
      });
      list.appendChild(b);
    }
    this.el.appendChild(list);
    list.style.left = `${under.offsetLeft}px`;
    list.style.top = `${under.offsetTop + under.offsetHeight + 2}px`;
    this.popup = list;
  }

  private closeMenu(): void {
    this.popup?.remove();
    this.popup = null;
  }

  update(): void {
    for (const [b, on] of this.toggles) b.setAttribute('aria-pressed', String(on()));
    const kind = this.editor.block.kind;
    this.kind.textContent = `${KINDS.find(([, k]) => k === (isHeadingKind(kind) || kind === 'caption' ? kind : null))?.[0] ?? 'Paragraph'} ▾`;
    this.position();
  }

  /** Just over the text, kept in view below the toolbar. */
  private position(): void {
    const box = this.editor.over.getBoundingClientRect();
    const toolbar = document.getElementById('toolbar')?.getBoundingClientRect().bottom ?? 0;
    const h = this.el.offsetHeight;
    const w = this.el.offsetWidth;
    let top = box.top - h - 6;
    if (top < toolbar + 4) top = Math.min(Math.max(toolbar + 4, box.bottom + 6), window.innerHeight - h - 4);
    this.el.style.top = `${Math.max(toolbar + 4, top)}px`;
    this.el.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - w - 4))}px`;
  }

  remove(): void {
    window.removeEventListener('scroll', this.place, true);
    window.removeEventListener('resize', this.place);
    this.el.remove();
  }
}
