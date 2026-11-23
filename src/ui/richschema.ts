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
 * Formatted text as the editor holds it: one kind of block, for paragraphs, headings and list items alike, holding
 * words with marks. The same schema draws a region that isn't being edited, so it looks the same either way.
 *
 * Everything read from a page, as in a paste, comes only from the attributes the schema itself writes, each checked
 * as a saved file's are (model/richtext.ts). Anything else on a pasted element is ignored.
 */
import { DOMSerializer, type Mark, type MarkSpec, type Node, type NodeSpec, Schema } from 'prosemirror-model';
import { type TextBlock, type TextRun, textBlocksOf, wordsOf } from '../model/richtext.js';

/** A block's attributes, checked as a file's are: one block with no words, run through the file's checks. */
function blockAttrs(given: Record<string, unknown>): Record<string, unknown> {
  const [b] = textBlocksOf([{ ...given, runs: [] }], '') ?? [{ runs: [] } as TextBlock];
  return { kind: b!.kind ?? null, level: b!.level ?? 0, align: b!.align ?? null, line: b!.line ?? null, after: b!.after ?? null };
}

/** One word's look, checked as a file's is. */
const runLook = (given: Record<string, unknown>): TextRun | undefined => textBlocksOf([{ runs: [{ ...given, t: 'x' }] }], 'x')?.[0]?.runs[0];

const block: NodeSpec = {
  content: 'inline*',
  attrs: { kind: { default: null }, level: { default: 0 }, align: { default: null }, line: { default: null }, after: { default: null } },
  parseDOM: [{
    tag: 'div.tb',
    getAttrs: (dom) => {
      const el = dom as HTMLElement;
      const kind = ['title', 'h1', 'h2', 'bullet', 'number'].find((k) => el.classList.contains(k));
      const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
      return blockAttrs({ kind, level: num(el.dataset.level), align: el.dataset.align, line: num(el.dataset.line), after: num(el.dataset.after) });
    },
  }],
  toDOM: (node) => {
    const { kind, level, align, line, after } = node.attrs as { kind: string | null; level: number; align: string | null; line: number | null; after: number | null };
    const style = [align ? `text-align: ${align}` : '', line ? `line-height: ${line * 1.15}` : '', after ? `margin-bottom: ${after}pt` : ''].filter(Boolean).join('; ');
    const heading = kind === 'title' || kind === 'h1' || kind === 'h2';
    return ['div', {
      class: `tb${kind ? ` ${kind}` : ''}`,
      'data-level': level ? String(level) : null,
      'data-align': align,
      'data-line': line === null ? null : String(line),
      'data-after': after === null ? null : String(after),
      style: style || null,
      role: heading ? 'heading' : null,
      'aria-level': heading ? (kind === 'h2' ? '3' : kind === 'h1' ? '2' : '1') : null,
    }, 0];
  },
};

/** A mark written as a span with one checked style, and read back only from its own data attribute. */
const flag = (attr: string, style: string): MarkSpec => ({
  parseDOM: [{ tag: `span[data-${attr}]` }],
  toDOM: () => ['span', { [`data-${attr}`]: '', style }, 0],
});

const marks: Record<string, MarkSpec> = {
  // Outermost first: a sub- or superscript is smaller than the size around it.
  size: {
    attrs: { pt: {} },
    parseDOM: [{ tag: 'span[data-size]', getAttrs: (dom) => { const r = runLook({ size: Number((dom as HTMLElement).dataset.size) }); return r?.size ? { pt: r.size } : false; } }],
    toDOM: (m) => ['span', { 'data-size': String(m.attrs.pt), style: `font-size: ${m.attrs.pt}pt` }, 0],
  },
  color: {
    attrs: { hex: {} },
    parseDOM: [{ tag: 'span[data-color]', getAttrs: (dom) => { const r = runLook({ color: (dom as HTMLElement).dataset.color }); return r?.color ? { hex: r.color } : false; } }],
    toDOM: (m) => ['span', { 'data-color': m.attrs.hex as string, style: `color: ${m.attrs.hex}` }, 0],
  },
  bold: flag('bold', 'font-weight: bold'),
  italic: flag('italic', 'font-style: italic'),
  underline: flag('underline', 'text-decoration: underline'),
  script: {
    attrs: { which: {} },
    parseDOM: [{ tag: 'sub', attrs: { which: 'sub' } }, { tag: 'sup', attrs: { which: 'sup' } }],
    toDOM: (m) => [m.attrs.which === 'sup' ? 'sup' : 'sub', 0],
  },
};

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    block,
    text: { group: 'inline' },
    // A line break inside a paragraph: a '\n' in the words.
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  marks,
});

const serializer = DOMSerializer.fromSchema(schema);

function marksOf(run: TextRun): Mark[] {
  const out: Mark[] = [];
  if (run.size) out.push(schema.marks.size!.create({ pt: run.size }));
  if (run.color) out.push(schema.marks.color!.create({ hex: run.color }));
  if (run.bold) out.push(schema.marks.bold!.create());
  if (run.italic) out.push(schema.marks.italic!.create());
  if (run.underline) out.push(schema.marks.underline!.create());
  if (run.script) out.push(schema.marks.script!.create({ which: run.script }));
  return out;
}

/** Blocks as the editor's document. They're built directly, never read from markup, so every space is kept. */
export function docOf(blocks: readonly TextBlock[]): Node {
  return schema.node('doc', null, blocks.map((b) => {
    const inline: Node[] = [];
    for (const run of b.runs) {
      const look = marksOf(run);
      run.t.split('\n').forEach((part, i) => {
        if (i > 0) inline.push(schema.nodes.hard_break!.create());
        if (part) inline.push(schema.text(part, look));
      });
    }
    return schema.node('block', blockAttrs(b as unknown as Record<string, unknown>), inline);
  }));
}

/**
 * The editor's document as blocks, checked as a file's are, or null when there's more than a region may keep (see
 * richtext.ts): then only its words can be kept.
 */
export function blocksOf(doc: Node): TextBlock[] | null {
  const raw: TextBlock[] = [];
  doc.forEach((node) => {
    const { kind, level, align, line, after } = node.attrs as Record<string, unknown>;
    const b: Record<string, unknown> = { kind, level, align, line, after, runs: [] };
    const runs = b.runs as TextRun[];
    node.forEach((child) => {
      if (child.type.name === 'hard_break') {
        const last = runs.at(-1);
        if (last) last.t += '\n';
        else runs.push({ t: '\n' });
        return;
      }
      const run: Record<string, unknown> = { t: child.text ?? '' };
      for (const m of child.marks) {
        if (m.type.name === 'size') run.size = m.attrs.pt;
        else if (m.type.name === 'color') run.color = m.attrs.hex;
        else if (m.type.name === 'script') run.script = m.attrs.which;
        else run[m.type.name] = true;
      }
      runs.push(run as unknown as TextRun);
    });
    raw.push(b as unknown as TextBlock);
  });
  return textBlocksOf(raw, wordsOf(raw));
}

/** The words of the editor's document, a line for each block. */
export const wordsOfDoc = (doc: Node): string => {
  const lines: string[] = [];
  doc.forEach((node) => {
    let s = '';
    node.forEach((child) => { s += child.type.name === 'hard_break' ? '\n' : child.text ?? ''; });
    lines.push(s);
  });
  return lines.join('\n');
};

/** Blocks as elements, as the editor shows them. */
export const blockElements = (blocks: readonly TextBlock[]): DocumentFragment | HTMLElement => serializer.serializeFragment(docOf(blocks).content);
