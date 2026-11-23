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
 * Formatted text: a text region's paragraphs, headings and list items, and how the words in each look.
 *
 * The region's `text` always holds the plain words as well, so a version that knows nothing of this still shows
 * them. The formatting counts only while its words are the same as `text`: if such a version edited the region, its
 * words are right and the formatting is dropped. A worksheet can come from anyone, so `textBlocksOf` keeps only what
 * the editor could have made, and drawing sets text and checked styles on elements, never markup.
 */
import { TEXT_SIZES, type Worksheet } from './ast.js';

/** What a block is: a paragraph when left out. Lists are flat, each item with its level. */
export type BlockKind = 'title' | 'h1' | 'h2' | 'bullet' | 'number';
export type Align = 'left' | 'center' | 'right' | 'justify';

/**
 * Words that look alike. A line break inside a paragraph is a '\n' in `t`. Math in a line of text is a run of its own
 * with no words, `t` empty, naming the math region it shows (see inlineMath): a version that knows nothing of it drops
 * a run without words, and the words are unchanged.
 */
export interface TextRun {
  t: string;
  /** The math region shown here, by id. */
  math?: string;
  bold?: true;
  italic?: true;
  underline?: true;
  script?: 'sub' | 'sup';
  size?: number;
  color?: string;
}

export interface TextBlock {
  kind?: BlockKind;
  /** How deep a list item is, from 0. */
  level?: number;
  /** Left out, as the sheet's text is: left, or justified in Paper style. */
  align?: Align;
  /** Line spacing, as a multiple of single. */
  line?: number;
  /** Space after it, in points. */
  after?: number;
  runs: TextRun[];
}

/** How a sheet's text looks: 'paper' is a serif face, justified, with numbered headings. */
export type TextLook = 'paper';

const KINDS: readonly string[] = ['title', 'h1', 'h2', 'bullet', 'number'] satisfies BlockKind[];
const ALIGNS: readonly string[] = ['left', 'center', 'right', 'justify'] satisfies Align[];
export const MAX_LEVEL = 3;
export const LINES = { min: 1, max: 3 } as const;
export const AFTER = { min: 0, max: 72 } as const;
/** The most blocks and runs a region may have: past this its plain words are shown. */
const MAX_BLOCKS = 5000;
const MAX_RUNS = 50000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const within = (v: unknown, { min, max }: { min: number; max: number }): number | undefined =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

/** A color as Format writes one, #rrggbb, or undefined. */
export const colorOf = (v: unknown): string | undefined => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);

/** A region id as a file may name one in text: as MathMath writes them (format/native.ts). */
const MATH_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

function runOf(given: unknown): TextRun | null {
  if (!isObject(given) || typeof given.t !== 'string') return null;
  if (given.t === '') return typeof given.math === 'string' && MATH_ID.test(given.math) ? { t: '', math: given.math } : null;
  const run: TextRun = { t: given.t };
  if (given.bold === true) run.bold = true;
  if (given.italic === true) run.italic = true;
  if (given.underline === true) run.underline = true;
  if (given.script === 'sub' || given.script === 'sup') run.script = given.script;
  const size = within(given.size, TEXT_SIZES);
  if (size !== undefined) run.size = size;
  const color = colorOf(given.color);
  if (color) run.color = color;
  return run;
}

const sameLook = (a: TextRun, b: TextRun): boolean =>
  a.math === undefined && b.math === undefined && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.script === b.script && a.size === b.size && a.color === b.color;

function blockOf(given: unknown): TextBlock | null {
  if (!isObject(given) || !Array.isArray(given.runs)) return null;
  const block: TextBlock = { runs: [] };
  for (const r of given.runs) {
    const run = runOf(r);
    if (!run) continue;
    const last = block.runs.at(-1);
    if (last && sameLook(last, run)) last.t += run.t;
    else block.runs.push(run);
  }
  if (typeof given.kind === 'string' && KINDS.includes(given.kind)) block.kind = given.kind as BlockKind;
  if (isList(block)) {
    const level = within(given.level, { min: 0, max: MAX_LEVEL });
    if (level) block.level = Math.round(level);
  }
  if (typeof given.align === 'string' && ALIGNS.includes(given.align)) block.align = given.align as Align;
  const line = within(given.line, LINES);
  if (line !== undefined && line !== 1) block.line = line;
  const after = within(given.after, AFTER);
  if (after) block.after = after;
  return block;
}

export const isList = (b: TextBlock): boolean => b.kind === 'bullet' || b.kind === 'number';

/** The plain words of blocks, a line for each. */
export const wordsOf = (blocks: readonly TextBlock[]): string => blocks.map((b) => b.runs.map((r) => r.t).join('')).join('\n');

/** Plain words as blocks: a paragraph for each line. */
export const plainBlocks = (text: string): TextBlock[] => text.split('\n').map((t) => ({ runs: t ? [{ t }] : [] }));

/**
 * A region's formatting as it can be drawn, or null when there is none to use: it isn't formatting, it's too big, or
 * its words aren't the region's, as after an edit by a version without formatting.
 */
export function textBlocksOf(given: unknown, text: string): TextBlock[] | null {
  if (!Array.isArray(given) || given.length === 0 || given.length > MAX_BLOCKS) return null;
  let runs = 0;
  for (const g of given) if (isObject(g) && Array.isArray(g.runs) && (runs += g.runs.length) > MAX_RUNS) return null;
  const blocks = given.map(blockOf);
  if (blocks.some((b) => b === null) || wordsOf(blocks as TextBlock[]) !== text) return null;
  return blocks as TextBlock[];
}

/** Whether blocks say anything their plain words don't. A region without formatting is saved as words alone. */
export const isFormatted = (blocks: readonly TextBlock[]): boolean =>
  blocks.some((b) => Object.keys(b).length > 1 || b.runs.some((r) => Object.keys(r).length > 1));

/** The math regions text shows, by id, in the order they're read. */
export const mathIdsOf = (blocks: readonly TextBlock[]): string[] => blocks.flatMap((b) => b.runs.flatMap((r) => (r.math === undefined ? [] : [r.math])));

/** The kinds of math that can be in a line of text: what typing math there can make. */
const IN_LINE: readonly string[] = ['define', 'eval', 'sym', 'show', 'draft'];

/** Where a math region sits in a line of text: the text, and how many come before it there. */
export interface InlinePlace { text: string; n: number }

/**
 * The math regions shown inside text, by id. A region counts only when it names the text (`inText`) and the text's
 * formatting names it, once, in the whole sheet: anything else, as from a hostile file, an older version's edit or a
 * paste, is drawn as math on its own.
 */
export function inlineMath(
  texts: readonly { id: string; text: string; blocks?: unknown }[], regions: readonly { id: string; inText?: string; content?: { k: string } }[],
): Map<string, InlinePlace> {
  const out = new Map<string, InlinePlace>();
  const owner = new Map<string, string>();
  for (const r of regions) {
    // Only math typed in a line: a plot or picture named by a file is drawn on its own.
    if (typeof r.inText === 'string' && !owner.has(r.id) && (!r.content || IN_LINE.includes(r.content.k))) owner.set(r.id, r.inText);
  }
  if (owner.size === 0) return out;
  for (const t of texts) {
    if (t.blocks === undefined) continue;
    const blocks = textBlocksOf(t.blocks, t.text);
    if (!blocks) continue;
    let n = 0;
    for (const id of mathIdsOf(blocks)) if (owner.get(id) === t.id && !out.has(id)) out.set(id, { text: t.id, n: n++ });
  }
  return out;
}

/**
 * Places math in text where it's calculated: where its text starts, on its first line, one after another in the order
 * they're read.
 * It's set from the text alone, never from how the words happen to wrap, so the order is the same whatever the page,
 * style or fonts. A version that doesn't show math in text draws it there too.
 */
export function placeInline(ws: Pick<Worksheet, 'texts' | 'regions' | 'page'>): void {
  const inline = inlineMath(ws.texts, ws.regions);
  if (inline.size === 0) return;
  const texts = new Map(ws.texts.map((t) => [t.id, t]));
  for (const r of ws.regions) {
    const at = inline.get(r.id);
    const text = at && texts.get(at.text);
    if (!at || !text) continue;
    const left = text.flow === true ? ws.page.margins.left : text.left;
    r.left = left;
    r.top = text.top;
    r.alignX = left + at.n * 0.001;
    // On the text's first line, whose baseline is as a new text's, 8 points below its top: math on that row to its
    // right comes after it, and math to its left before.
    r.alignY = text.top + 8;
  }
}

/** Every block changed together. */
export const changeBlocks = (blocks: readonly TextBlock[], change: (b: TextBlock) => TextBlock): TextBlock[] =>
  blocks.map((b) => blockOf(change(b))!);

/**
 * The numbers headings have before each region, in the order they're read: down the sheet, then across. Each region
 * gets how many headings, and how many subheadings since the last one, come before it.
 */
export function headingCounts(texts: readonly { id: string; left: number; top: number; text: string; blocks?: unknown }[]): Map<string, { h1: number; h2: number }> {
  const out = new Map<string, { h1: number; h2: number }>();
  let [h1, h2] = [0, 0];
  for (const t of [...texts].sort((a, b) => a.top - b.top || a.left - b.left)) {
    out.set(t.id, { h1, h2 });
    for (const b of t.blocks === undefined ? [] : textBlocksOf(t.blocks, t.text) ?? []) {
      if (b.kind === 'h1') {
        h1++;
        h2 = 0;
      } else if (b.kind === 'h2') h2++;
    }
  }
  return out;
}
