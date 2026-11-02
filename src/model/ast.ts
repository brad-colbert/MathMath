/** Worksheet model. Node names follow the worksheet schema so that its rules stay in one place. */

export type Expr =
  | { k: 'real'; v: number }
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
  | { k: 'derivative'; varName: string; body: Expr }
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
  | { k: 'str'; v: string };

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

/** How numbers display. `precision` is decimal places. Numbers outside 10^±exponent go exponential. */
export interface NumberFormat {
  precision: number;
  exponent: number;
  trailingZeros: boolean;
}

export type Content =
  | { k: 'define'; target: Target; value: Expr; global: boolean; stored: StoredResult | null; unit: Expr | null; shown: boolean; format?: NumberFormat }
  | { k: 'eval'; expr: Expr; stored: StoredResult | null; unit: Expr | null; format?: NumberFormat }
  /** Symbolic evaluation with →. With a target, the result is what the target is defined as. */
  | { k: 'sym'; target: Target | null; global: boolean; expr: Expr; commands: SymCommand[]; stored: Expr | null }
  /** Math written to be read, with no definition or result. */
  | { k: 'show'; expr: Expr }
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
  /** Base64 PNG of how the original program drew it. */
  png: string | null;
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

export interface Worksheet {
  page: PageModel;
  format: NumberFormat;
  regions: Region[];
  texts: TextRegion[];
  opaque: OpaqueRegion[];
  origin: number;
  tol: number;
  /** Count of non-math regions by element name, such as `reference` or `plot`. */
  otherRegions: Record<string, number>;
  /** Variables produced by embedded components. */
  componentOutputs: string[];
}
