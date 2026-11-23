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
import { type TextLook, textBlocksOf } from '../model/richtext.js';
import { blockElements } from './richschema.js';

const PT = 96 / 72;

/** The width text across the page has, between the margins. */
export const flowWidth = (page: PageModel): number => Math.max(72, page.width - page.margins.left - page.margins.right);

export interface TextContext {
  page: PageModel;
  look: TextLook | undefined;
  /** How many headings and subheadings come before it. */
  counts: { h1: number; h2: number } | undefined;
}

/** Draws a text region in its element, unless it already shows just this. */
export function drawText(el: HTMLElement, region: TextRegion, { page, look, counts }: TextContext): void {
  const blocks = region.blocks === undefined ? null : textBlocksOf(region.blocks, region.text);
  const paper = look === 'paper';
  const flow = region.flow === true;
  const cache = el as HTMLElement & { textKey?: string };
  const key = JSON.stringify([region.text, blocks, region.style, flow, paper, paper && blocks ? counts : 0, flow ? [page, region.top] : region.width]);
  if (cache.textKey === key) return;
  cache.textKey = key;
  // Fonts differ a little from the original program's, so stored widths need some room to spare.
  el.style.width = flow ? `${flowWidth(page)}pt` : region.width > 0 ? `${region.width * 1.15}pt` : '';
  el.classList.toggle('flow', flow);
  el.classList.toggle('paper-look', paper);
  el.classList.toggle('blocks', blocks !== null);
  el.style.counterReset = blocks ? `h1 ${counts?.h1 ?? 0} h2 ${counts?.h2 ?? 0}` : '';
  if (blocks) el.replaceChildren(blockElements(blocks));
  else el.textContent = region.text;
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
 * before each. Before a block's first line the gap is a block of its own. Inside one it's a float as wide as the
 * text: the line before it still wraps, so it stays justified.
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
    if (line.block) el.insertBefore(gap, line.block);
    else {
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
function firstCrossing(el: HTMLElement, top: number, page: PageModel, from: number): { node: Text; offset: number; block: HTMLElement | null; gap: number; page: number } | null {
  const box = el.getBoundingClientRect();
  // The sheet may be zoomed, so positions are measured against the region's own size.
  const k = (el.offsetWidth / PT) / (box.width || 1);
  const at = (y: number): number => top + (y - box.top) * k;
  const blocks = el.classList.contains('blocks') ? [...el.querySelectorAll<HTMLElement>(':scope > .tb')] : [el];
  for (const block of blocks) {
    const lines = linesOf(block);
    for (const [n, line] of lines.entries()) {
      const [a, b] = [at(line.top), at(line.bottom)];
      const p = Math.floor((b + page.margins.bottom) / page.height);
      if (p <= from || b <= p * page.height - page.margins.bottom + 0.5 || a >= p * page.height + page.margins.top - 0.5) continue;
      return {
        node: line.node, offset: lineStart(line), block: n === 0 && block !== el ? block : null, gap: p * page.height + page.margins.top - a, page: p,
      };
    }
  }
  return null;
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
