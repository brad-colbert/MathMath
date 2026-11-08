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

/** Worksheet model. Node names follow the worksheet schema so that its rules stay in one place. */

export type Expr =
  /**
   * A real number. `digits` keeps it as written when it has more significant digits than a double holds,
   * as float's 20-digit answers do, so they show in full.
   */
  | { k: 'real'; v: number; digits?: string }
  | { k: 'imag'; v: number }
  | { k: 'str'; v: string }
  | { k: 'id'; name: string }
  /** Items are column-major, as in the file format. */
  | { k: 'matrix'; rows: number; cols: number; items: Expr[] }
  | { k: 'range'; first: Expr; second: Expr | null; last: Expr }
  | { k: 'op'; op: string; args: Expr[] }
  | { k: 'call'; fn: Expr; args: Expr[] }
  /** With no bounds it's an indefinite integral, which only the symbolic engine can do. */
  | { k: 'bigop'; op: 'integral' | 'summation' | 'product'; varName: string; body: Expr; lo: Expr | null; hi: Expr | null }
  /** With a degree, the nth derivative (Mathcad's Ctrl+Shift+/); without one, the first. */
  | { k: 'derivative'; varName: string; body: Expr; degree?: Expr }
  | { k: 'limit'; varName: string; body: Expr; to: Expr; side: 'left' | 'right' | null }
  | { k: 'program'; body: Stmt[] }
  | { k: 'placeholder' }
  | { k: 'unsupported'; tag: string };

export type Target =
  | { k: 'var'; name: string }
  | { k: 'index'; name: string; index: Expr[] }
  | { k: 'col'; name: string; index: Expr }
  | { k: 'fn'; name: string; params: string[] }
  | { k: 'multi'; targets: Target[] }
  | { k: 'unsupported'; tag: string };

export type Stmt =
  | { k: 'assign'; target: Target; value: Expr }
  | { k: 'if'; cond: Expr; then: Stmt }
  | { k: 'otherwise'; then: Stmt }
  | { k: 'for'; varName: string; iter: Expr; body: Stmt }
  | { k: 'while'; cond: Expr; body: Stmt }
  | { k: 'return'; value: Expr }
  | { k: 'block'; body: Stmt[] }
  | { k: 'expr'; e: Expr };

export type StoredScalar =
  | { k: 'num'; re: number; im: number }
  | { k: 'str'; v: string }
  /** A function, which Mathcad shows by its type, such as `ƒ(Unitless) → Unitless`. */
  | { k: 'fn'; type: string };

export type StoredValue = StoredScalar | { k: 'mat'; rows: number; cols: number; items: StoredValue[] };

export interface StoredUnit {
  unit: string;
  power: number;
}

export interface StoredResult {
  value: StoredValue;
  /**
   * Unit of the stored numbers, which are in display units, not base units. Empty when the display
   * unit is a sheet-defined one, in which case the number is the value divided by the override.
   */
  units: StoredUnit[];
}

/** A symbolic keyword and its arguments, such as `solve` and `x`. */
export interface SymCommand {
  name: string;
  args: Expr[];
}

/**
 * How one trace is drawn. Anything left out takes the default: the color and dash for the trace's place in
 * the plot, and lines or points as the plot's own setting says.
 */
export interface TraceStyle {
  /** A CSS color, as #rrggbb. */
  color?: string;
  line?: 'solid' | 'dash' | 'dot' | 'dashdot' | 'none';
  /** Line weight, in points. */
  weight?: number;
  points?: 'none' | 'circle' | 'square' | 'triangle' | 'cross';
}

/** A plot axis. Null limits are chosen from the data. */
export interface Axis {
  min: Expr | null;
  max: Expr | null;
  log: boolean;
  /** Plain text beside the axis. Absent means no title; empty means one is shown, waiting for text. */
  title?: string;
  /** The unit the axis shows its values in. Absent means the default, chosen as for a result. */
  unit?: Expr | null;
}

export const autoAxis = (): Axis => ({ min: null, max: null, log: false });

/** How numbers display. `precision` is decimal places. Numbers outside 10^±exponent go exponential. */
export interface NumberFormat {
  precision: number;
  exponent: number;
  trailingZeros: boolean;
  /** Complex results as magnitude∠angle in degrees, MathMath's own option. Left out when off. */
  polar?: boolean;
  /**
   * Mathcad's complex threshold: a real or imaginary part under 10^−n times the other is shown as 0. 10
   * when left out, Mathcad's default.
   */
  complexThreshold?: number;
}

export type Content =
  | { k: 'define'; target: Target; value: Expr; global: boolean; stored: StoredResult | null; unit: Expr | null; shown: boolean; format?: NumberFormat }
  | { k: 'eval'; expr: Expr; stored: StoredResult | null; unit: Expr | null; format?: NumberFormat }
  /** Symbolic evaluation with →. With a target, the result is what the target is defined as. */
  | { k: 'sym'; target: Target | null; global: boolean; expr: Expr; commands: SymCommand[]; stored: Expr | null }
  /** Math written to be read, with no definition or result. */
  | { k: 'show'; expr: Expr }
  /**
   * A matrix shown as an image: gray levels 0 to 255, or color from red, green and blue blocks side by
   * side. `png` is a stored rendering, shown until the image is computed.
   */
  | {
    k: 'image'; expr: Expr | null; mode: 'gray' | 'rgb'; width: number; height: number; png: string | null;
    /** Stretch the matrix's own lowest to highest value over black to white, rather than 0 to 255. */
    fit?: boolean;
    /** Show a gray image on the blue ramp, light for low values and dark for high. */
    falseColor?: boolean;
  }
  /** An X-Y plot. Each y expression is a trace against x. Size is in points. */
  | { k: 'plot'; x: Expr | null; ys: Expr[]; xAxis: Axis; yAxis: Axis; markers: boolean; width: number; height: number; title?: string; traces?: (TraceStyle | null)[];
      /**
       * How the plot is drawn: X-Y when absent; polar takes x as the angle in radians and each y as a radius.
       * Surface and contour plot the first y expression: a matrix of heights, a function of two variables
       * (sampled over the x and y limits, −5 to 5 by default), or three matrices X, Y and Z. A Smith chart
       * takes each y as complex reflection coefficients Γ; x, if given, is what they're swept over, shown on hover.
       */
      view?: 'polar' | 'surface' | 'contour' | 'smith';
      /** The angle a surface is seen from, in degrees: round the vertical, and above the horizontal. */
      view3d?: { azimuth: number; elevation: number } }
  /**
   * Another worksheet's definitions, available from here on as if its regions were here. `file` is a file
   * name, matched without its extension against attached worksheets.
   */
  | { k: 'include'; file: string }
  /** Typed math that couldn't be read. Kept exactly as typed, so nothing is ever lost. */
  | { k: 'draft'; latex: string; error: string }
  | { k: 'other'; tag: string };

export interface Region {
  id: string;
  left: number;
  top: number;
  alignX: number;
  alignY: number;
  disabled: boolean;
  content: Content;
}

export interface TextRegion {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Plain text. Styling isn't imported yet. */
  text: string;
}

/** A region this version can show but not edit, kept intact so saving never destroys it. */
export interface OpaqueRegion {
  id: string;
  kind: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Base64 image data: how the original program drew it, or a picture from a file. */
  png: string | null;
  /** The image type, when it isn't PNG. */
  mime?: string;
  /** The original XML. */
  xml: string | null;
  /** Base64 data the XML refers to, by item id. */
  items: Record<string, string>;
}

export interface PageModel {
  width: number;
  height: number;
  landscape: boolean;
  margins: { left: number; right: number; top: number; bottom: number };
}

export const DEFAULT_PAGE: PageModel = {
  width: 612, height: 792, landscape: false, margins: { left: 36, right: 36, top: 36, bottom: 36 },
};

export const DEFAULT_FORMAT: NumberFormat = { precision: 3, exponent: 3, trailingZeros: false };

/** A file a worksheet reads, such as an image, kept inside the worksheet file. */
export interface Asset {
  mime: string;
  /** Base64. */
  data: string;
}

export interface Worksheet {
  page: PageModel;
  /** By file name, so a path from another machine still finds its file. */
  assets: Record<string, Asset>;
  format: NumberFormat;
  regions: Region[];
  texts: TextRegion[];
  opaque: OpaqueRegion[];
  origin: number;
  tol: number;
  /** Mathcad's CTOL: how near a solve block's constraints must come to holding. 0.001 when left out. */
  ctol?: number;
  /**
   * Whether comparisons are exact. When not, as Mathcad's "exact equality" option off, numbers within a
   * relative 10⁻¹² of each other are equal, so `<` and `>` are false between them.
   */
  exactCompare: boolean;
  /** Whether 0/0 is 0, element by element, as Mathcad's zero-over-zero option allows. Anything else over 0 is still an error. */
  zeroOverZero: boolean;
  /** Count of non-math regions by element name, such as `reference` or `plot`. */
  otherRegions: Record<string, number>;
  /** Variables produced by embedded components. */
  componentOutputs: string[];
}

/** A real number read from text, keeping its digits when a double can't hold them all. */
export function realFrom(text: string): Extract<Expr, { k: 'real' }> {
  const v = Number(text);
  const significant = text.replace(/[eE].*$/, '').replace(/[^0-9]/g, '').replace(/^0+/, '').length;
  return significant > 17 ? { k: 'real', v, digits: text.trim() } : { k: 'real', v };
}
