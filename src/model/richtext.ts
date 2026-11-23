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
import { TEXT_SIZES } from './ast.js';

/** What a block is: a paragraph when left out. Lists are flat, each item with its level. */
export type BlockKind = 'title' | 'h1' | 'h2' | 'bullet' | 'number';
export type Align = 'left' | 'center' | 'right' | 'justify';

/** Words that look alike. A line break inside a paragraph is a '\n' in `t`. */
export interface TextRun {
  t: string;
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

function runOf(given: unknown): TextRun | null {
  if (!isObject(given) || typeof given.t !== 'string' || given.t === '') return null;
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
  a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.script === b.script && a.size === b.size && a.color === b.color;

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
