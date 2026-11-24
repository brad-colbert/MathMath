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
 * Draws text regions: plain words as they are, formatted ones as a block for each paragraph, heading or list item
 * (see model/richtext.ts). Everything is set on elements, never written as markup.
 */
import { type PageModel, type TextRegion, textStyleOf } from '../model/ast.js';
import { type Counts, type TextLook, refsOf, textBlocksOf } from '../model/richtext.js';
import { blockElements, showRef } from './richschema.js';

const PT = 96 / 72;

/** The width text across the page has, between the margins. */
export const flowWidth = (page: PageModel): number => Math.max(72, page.width - page.margins.left - page.margins.right);

export interface TextContext {
  page: PageModel;
  look: TextLook | undefined;
  /** How many headings, subheadings and captions come before it. */
  counts: Counts | undefined;
  /** What a reference shows, by the label it names, and whether that's gone. */
  refs?: (label: string) => { text: string; missing: boolean };
  /**
   * The math in its words: how it looks now, as a key, and how to put it in the places kept for it. It's drawn
   * elsewhere, as math is, and put in before lines are kept off page ends.
   */
  math?: { key: string; mount: (root: HTMLElement) => void } | undefined;
}

/** Draws a text region in its element, unless it already shows just this. */
export function drawText(el: HTMLElement, region: TextRegion, { page, look, counts, math, refs }: TextContext): void {
  const blocks = region.blocks === undefined ? null : textBlocksOf(region.blocks, region.text);
  const paper = look === 'paper';
  const flow = region.flow === true;
  const cache = el as HTMLElement & { textKey?: string };
  const shown = blocks && refs ? refsOf(blocks).map(refs) : [];
  const key = JSON.stringify([region.text, blocks, region.style, flow, paper, blocks ? counts : 0, flow ? [page, region.top] : region.width, blocks ? math?.key : 0, shown]);
  if (cache.textKey === key) return;
  cache.textKey = key;
  // Fonts differ a little from the original program's, so stored widths need some room to spare.
  el.style.width = flow ? `${flowWidth(page)}pt` : region.width > 0 ? `${region.width * 1.15}pt` : '';
  el.classList.toggle('flow', flow);
  el.classList.toggle('paper-look', paper);
  el.classList.toggle('blocks', blocks !== null);
  el.style.counterReset = blocks ? `h1 ${counts?.h1 ?? 0} h2 ${counts?.h2 ?? 0} fig ${counts?.fig ?? 0} tab ${counts?.tab ?? 0}` : '';
  if (blocks) {
    el.replaceChildren(blockElements(blocks));
    // References in the order they're drawn, which is the order they're read.
    el.querySelectorAll<HTMLElement>('span.ref[data-ref]').forEach((r, i) => {
      const at = shown[i];
      if (at) showRef(r, at.text, at.missing);
    });
    math?.mount(el);
  } else el.textContent = region.text;
  // Its style, set on the element, never written into markup.
  const style = textStyleOf(region.style);
  el.style.fontWeight = style.bold ? 'bold' : '';
  el.style.fontStyle = style.italic ? 'italic' : '';
  el.style.fontSize = style.size ? `${style.size}pt` : '';
  el.style.color = style.color ?? '';
  if (flow) keepOffBreaks(el, region.top, page);
}

/** Forgets what an element shows, so it's drawn again. */
export function forgetText(el: HTMLElement): void {
  delete (el as HTMLElement & { textKey?: string }).textKey;
}

/** The most lines moved to another page in one region: a guard, far past any real text. */
const MAX_BREAKS = 2000;

/**
 * Moves lines that would cross from one page to the next, or into its margins, to the top of the next page, by a gap
 * before each. Before a block's first line the gap is a block of its own, measured again once it's in, as the block
 * may lose the space kept above it after another. Inside one it's a float as wide as the text: the line before it
 * still wraps, so it stays justified. Headings just before a block moved go with it.
 */
function keepOffBreaks(el: HTMLElement, top: number, page: PageModel): void {
  const { height, margins } = page;
  // A page with no room between its margins has nowhere better to move a line to.
  if (height - margins.top - margins.bottom < 72) return;
  let from = 0;
  for (let n = 0; n < MAX_BREAKS; n++) {
    const line = firstCrossing(el, top, page, from);
    if (!line) return;
    const gap = document.createElement(line.block ? 'div' : 'span');
    gap.className = 'page-gap';
    gap.style.height = `${line.gap}pt`;
    gap.setAttribute('aria-hidden', 'true');
    if (line.block) {
      el.insertBefore(gap, line.block);
      const first = linesOf(line.block)[0];
      if (first) gap.style.height = `${Math.max(0, line.gap + line.to - placeIn(el, top)(first.top))}pt`;
    } else {
      const range = document.createRange();
      range.setStart(line.node, line.offset);
      range.insertNode(gap);
    }
    from = line.page;
  }
}

interface Line {
  node: Text;
  rect: DOMRect;
  top: number;
  bottom: number;
}

/** The lines of a block's words, each with the node it starts in, and its part of the line. */
function linesOf(block: HTMLElement): Line[] {
  const out: Line[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.height === 0) continue;
      const last = out.at(-1);
      // A super- or subscript, or a larger word, is on its line though its box is higher or lower.
      const shared = last ? Math.min(last.bottom, rect.bottom) - Math.max(last.top, rect.top) : 0;
      if (last && shared > 0.4 * Math.min(last.bottom - last.top, rect.height)) {
        last.top = Math.min(last.top, rect.top);
        last.bottom = Math.max(last.bottom, rect.bottom);
      } else out.push({ node, rect, top: rect.top, bottom: rect.bottom });
    }
  }
  return out;
}

/**
 * The first line crossing into the margins between page `from` and any page after it, counting pages from 1: where it
 * starts, the block it starts if it does, and how far it must move.
 */
function firstCrossing(el: HTMLElement, top: number, page: PageModel, from: number): { node: Text; offset: number; block: HTMLElement | null; gap: number; to: number; page: number } | null {
  const at = placeIn(el, top);
  const blocks = el.classList.contains('blocks') ? [...el.querySelectorAll<HTMLElement>(':scope > .tb')] : [el];
  for (const [i, block] of blocks.entries()) {
    const lines = linesOf(block);
    for (const [n, line] of lines.entries()) {
      const [a, b] = [at(line.top), at(line.bottom)];
      const p = Math.floor((b + page.margins.bottom) / page.height);
      if (p <= from || b <= p * page.height - page.margins.bottom + 0.5 || a >= p * page.height + page.margins.top - 0.5) continue;
      const to = p * page.height + page.margins.top;
      // A heading of two lines isn't split: it moves whole.
      if ((n === 0 || isHeading(block)) && block !== el) {
        const kept = withHeadings(blocks, i, at, page, p);
        const first = linesOf(kept)[0];
        const start = first ? at(first.top) : a;
        return { node: line.node, offset: lineStart(line), block: kept, gap: to - start, to, page: p };
      }
      return { node: line.node, offset: lineStart(line), block: null, gap: to - a, to, page: p };
    }
  }
  return null;
}

const isHeading = (block: HTMLElement): boolean => ['title', 'h1', 'h2'].some((h) => block.classList.contains(h));

/**
 * The block to move to page `p` with block `i`: the first of the headings just before it, past empty lines between, so
 * a heading isn't left at the foot of a page, apart from what it heads. Not when they start their page already: they'd
 * only move again.
 */
function withHeadings(blocks: HTMLElement[], i: number, at: (y: number) => number, page: PageModel, p: number): HTMLElement {
  let j = i;
  for (let k = i; k > 0; k--) {
    const before = blocks[k - 1]!;
    if (isHeading(before)) j = k - 1;
    else if (linesOf(before).length > 0) break;
  }
  if (j === i) return blocks[i]!;
  const first = linesOf(blocks[j]!)[0];
  if (!first) return blocks[i]!;
  const a = at(first.top);
  const pageTop = (p - 1) * page.height + page.margins.top;
  return a > pageTop + 0.5 && a < p * page.height ? blocks[j]! : blocks[i]!;
}

/** Where a point on screen is, in points down the sheet, for the region at `top`: the sheet may be zoomed. */
function placeIn(el: HTMLElement, top: number): (y: number) => number {
  const box = el.getBoundingClientRect();
  const k = (el.offsetWidth / PT) / (box.width || 1);
  return (y: number): number => top + (y - box.top) * k;
}

/** Where a line starts in its node, by halving: lines only go down through a node. */
function lineStart({ node, rect }: Line): number {
  const range = document.createRange();
  let [lo, hi] = [0, Math.max(0, node.length - 1)];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    range.setStart(node, mid);
    range.setEnd(node, mid + 1);
    const r = [...range.getClientRects()].at(-1);
    if (r && r.bottom > rect.top + 1) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
