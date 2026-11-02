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
  | { k: 'bigop'; op: 'integral' | 'summation' | 'product'; varName: string; body: Expr; lo: Expr; hi: Expr }
  | { k: 'derivative'; varName: string; body: Expr }
  | { k: 'program'; body: Stmt[] }
  | { k: 'placeholder' }
  /** Symbolic evaluation. Represented now; evaluated in a later milestone. */
  | { k: 'symEval'; expr: Expr }
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

export type Content =
  | { k: 'define'; target: Target; value: Expr; global: boolean; stored: StoredResult | null; unit: Expr | null; shown: boolean }
  | { k: 'eval'; expr: Expr; stored: StoredResult | null; unit: Expr | null }
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

export interface Worksheet {
  regions: Region[];
  texts: TextRegion[];
  origin: number;
  tol: number;
  /** Count of non-math regions by element name, such as `reference` or `plot`. */
  otherRegions: Record<string, number>;
  /** Variables produced by embedded components. */
  componentOutputs: string[];
}
