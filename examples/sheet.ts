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
 * A small language for writing the example worksheets: regions flow down the page from a cursor, side by side
 * with `row`, and a block that would cross a page break starts the next page. Heights are estimates, so start
 * each section with `section()`, which also leaves room above it, or `page()` to be sure of a new page.
 *
 * Coordinates are points. The page is US Letter, 612 × 792, with 54 pt side margins and 72 pt top and bottom.
 */
import { readFileSync } from 'node:fs';
import { fileKey } from '../src/engine/files.js';
import { readTex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import { emptyWorksheet } from '../src/format/native.js';
import { type Content, type Worksheet, autoAxis } from '../src/model/ast.js';

const PAGE = 792;
const TOP = 72;
const BOTTOM = 72;
const LEFT = 54;
/** The width text wraps at, in points, before the 15% the paper adds for font differences. */
const TEXT_WIDTH = 440;

type Plot = Extract<Content, { k: 'plot' }>;

/** One math region: LaTeX, with the unit its result shows in and options. */
export interface MathItem {
  latex: string;
  /** The display unit for a result, as LaTeX: `\\mathrm{km}`. */
  unit?: string;
  /** Complex results as magnitude∠angle. */
  polar?: boolean;
  /** Indent from the left margin, in points. */
  x?: number;
  /** This region shows an error on purpose, as a units mistake MathMath catches. */
  error?: boolean;
  /** Rows in the result it shows, for a vector or matrix answer, so the row is tall enough. */
  rows?: number;
}

export interface PlotOptions {
  /** The x expression; empty for a surface, which plots its y alone. */
  x: string;
  ys: string[];
  width?: number;
  height?: number;
  view?: Plot['view'];
  /** The angle a 3D plot is seen from. */
  view3d?: Plot['view3d'];
  /** A surface or contour plot's colour map, by name. */
  colorMap?: string;
  logX?: boolean;
  logY?: boolean;
  xUnit?: string;
  yUnit?: string;
  title?: string;
  xTitle?: string;
  yTitle?: string;
  markers?: boolean;
  xMin?: string;
  xMax?: string;
  yMin?: string;
  yMax?: string;
  traces?: Plot['traces'];
  /** Indent from the left margin, in points. */
  at?: number;
}

/** A matrix shown as a gray picture. */
export interface ImageItem {
  latex: string;
  /** Width and height, in points. */
  size?: number;
  /** Stretch the matrix's own range over black to white. */
  fit?: boolean;
  /** Red, green and blue blocks side by side, shown as one color picture. */
  color?: boolean;
  caption?: string;
  /** Indent from the left margin, in points. */
  x?: number;
}

/** A rough height for a line of math, in points: taller for fractions and matrices. */
function mathHeight(latex: string, resultRows = 1): number {
  const rows = Math.max(1, ...[...latex.matchAll(/\\begin\{pmatrix\}(.*?)\\end\{pmatrix\}/g)].map((m) => m[1]!.split('\\\\').length));
  const program = Math.max(1, ...[...latex.matchAll(/\\begin\{array\}\{\|l\}(.*?)\\end\{array\}/g)].map((m) => m[1]!.split('\\\\').length));
  const tall = /\\frac|\\int|\\sum|\\prod|\\sqrt/.test(latex) ? 10 : 0;
  return Math.max(22 + tall, 14 * Math.max(rows, program, resultRows) + 10);
}

export class Sheet {
  readonly ws: Worksheet = emptyWorksheet();
  /** Regions that show an error on purpose. */
  readonly expectedErrors = new Set<string>();
  private y = TOP;
  private id = 1;

  constructor() {
    // Four places, and numbers below 100 000 in full, as 5105.1 rather than 5.1051 × 10³.
    this.ws.format = { ...this.ws.format, precision: 4, exponent: 5 };
  }

  /** Room for `height` points from the cursor, on this page or the next. */
  private room(height: number): void {
    const pageTop = Math.floor(this.y / PAGE) * PAGE;
    if (this.y + height > pageTop + PAGE - BOTTOM) this.y = pageTop + PAGE + TOP;
  }

  /**
   * A file the sheet reads, kept inside it under `name`, as Files on the toolbar does. A web address as the name
   * is what Files → From a web address gives, so readImage("https://…") reads it.
   */
  attach(name: string, path: URL, mime: string): this {
    this.ws.assets[fileKey(name)] = { mime, data: readFileSync(path).toString('base64') };
    return this;
  }

  /** Starts the next page. */
  page(): this {
    this.y = (Math.floor(this.y / PAGE) + 1) * PAGE + TOP;
    return this;
  }

  /** A section: space above, and a new page if little of this one is left. */
  section(title: string, first = false): this {
    if (!first) this.y += 18;
    this.room(100);
    return this.text(title);
  }

  /** Blank space, in points. */
  gap(points = 12): this {
    this.y += points;
    return this;
  }

  /** A paragraph, wrapped at the text width or a narrower one. `end` marks the sheet's last. */
  text(text: string, opts: { x?: number; width?: number; end?: boolean } = {}): this {
    const width = opts.width ?? TEXT_WIDTH - (opts.x ?? 0);
    const perLine = Math.floor((width * 1.15) / 5.4);
    const lines = text.split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0);
    const height = lines * 13.5;
    // A paragraph introduces what follows it, so it never ends a page alone; the sheet's last one has nothing to wait for.
    this.room(height + (opts.end ? 0 : 40));
    this.ws.texts.push({ id: String(this.id++), left: LEFT + (opts.x ?? 0), top: this.y, width, height, text });
    this.y += height + 8;
    return this;
  }

  /** Math regions side by side on one baseline: at their `x`, or spread evenly. */
  row(...items: (MathItem | string)[]): this {
    const all = items.map((m) => (typeof m === 'string' ? { latex: m } : m));
    const height = Math.max(...all.map((m) => mathHeight(m.latex, m.rows)));
    this.room(height);
    // One baseline, for the order regions calculate in; each region's top centres it on the row.
    const base = this.y + height / 2 + 4;
    const step = 504 / all.length;
    all.forEach((m, n) => {
      const x = LEFT + (m.x ?? n * step);
      const content = readRegion(m.latex);
      if (m.unit && (content.k === 'eval' || content.k === 'define')) content.unit = readTex(m.unit);
      if (m.polar && (content.k === 'eval' || content.k === 'define')) content.format = { ...this.ws.format, polar: true };
      const id = String(this.id++);
      if (m.error) this.expectedErrors.add(id);
      const top = this.y + (height - mathHeight(m.latex, m.rows)) / 2;
      this.ws.regions.push({ id, left: x, top, alignX: x, alignY: base, disabled: false, content });
    });
    this.y += height + 14;
    return this;
  }

  /** One line of math. */
  math(latex: string, opts: Omit<MathItem, 'latex'> = {}): this {
    return this.row({ latex, x: opts.x ?? 0, ...opts });
  }

  /** A plot, with an optional paragraph beside it at `note`'s indent. */
  plot(o: PlotOptions, note?: { text: string; x?: number }): this {
    const [w, h] = [o.width ?? 250, o.height ?? 170];
    this.room(h + 30);
    this.place(o, LEFT + (o.at ?? 0));
    if (note) {
      const x = note.x ?? w + 30;
      this.ws.texts.push({ id: String(this.id++), left: LEFT + x, top: this.y + 30, width: 504 - x - 10, height: 60, text: note.text });
    }
    this.y += h + 26;
    return this;
  }

  /** Plots side by side, tops level: at their `at`, or spread evenly. */
  plots(...all: PlotOptions[]): this {
    const h = Math.max(...all.map((o) => o.height ?? 170));
    this.room(h + 30);
    all.forEach((o, n) => this.place(o, LEFT + (o.at ?? (n * 504) / all.length)));
    this.y += h + 26;
    return this;
  }

  /** Matrices shown as pictures, side by side, each with a caption under it. */
  images(...all: ImageItem[]): this {
    const h = Math.max(...all.map((m) => m.size ?? 140));
    this.room(h + 40);
    all.forEach((m, n) => {
      const size = m.size ?? 140;
      const left = LEFT + (m.x ?? (n * 504) / all.length);
      const content: Content = { k: 'image', expr: readTex(m.latex), mode: m.color ? 'rgb' : 'gray', width: size, height: size, png: null, ...(m.fit ? { fit: true } : {}) };
      this.ws.regions.push({ id: String(this.id++), left, top: this.y, alignX: left, alignY: this.y, disabled: false, content });
      if (m.caption) this.ws.texts.push({ id: String(this.id++), left, top: this.y + size + 6, width: Math.min(size, 504 / all.length - 30), height: 27, text: m.caption });
    });
    this.y += h + 40;
    return this;
  }

  private place(o: PlotOptions, left: number): void {
    const axis = (unit?: string, log?: boolean, min?: string, max?: string, title?: string) => ({
      ...autoAxis(),
      ...(unit ? { unit: readTex(unit) } : {}),
      ...(log ? { log: true } : {}),
      ...(min ? { min: readTex(min) } : {}),
      ...(max ? { max: readTex(max) } : {}),
      ...(title !== undefined ? { title } : {}),
    });
    const content: Plot = {
      k: 'plot', x: o.x ? readTex(o.x) : null, ys: o.ys.map((e) => readTex(e)), markers: o.markers ?? false, width: o.width ?? 250, height: o.height ?? 170,
      xAxis: axis(o.xUnit, o.logX, o.xMin, o.xMax, o.xTitle), yAxis: axis(o.yUnit, o.logY, o.yMin, o.yMax, o.yTitle),
      ...(o.view ? { view: o.view } : {}),
      ...(o.view3d ? { view3d: o.view3d } : {}),
      ...(o.colorMap ? { colorMap: o.colorMap } : {}),
      ...(o.title !== undefined ? { title: o.title } : {}),
      ...(o.traces ? { traces: o.traces } : {}),
    };
    this.ws.regions.push({ id: String(this.id++), left, top: this.y, alignX: left, alignY: this.y, disabled: false, content });
  }
}

/** An example worksheet: what the gallery shows, and how to build it. */
export interface Example {
  /** The file name, without .mathmath. */
  slug: string;
  title: string;
  /** One sentence for the gallery. */
  summary: string;
  /** Whether it uses symbolic evaluation, which only the browser can check. */
  symbolic?: boolean;
  build(s: Sheet): void;
}
