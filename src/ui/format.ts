/** Shows a computed value as LaTeX, following the worksheet's number format. */
import { chooseUnits, unitNameLatex, unitsLatex } from '../engine/display-units.js';
import { shortUnit } from '../engine/units.js';
import { type Dim, type Mat, NODIM, type Num, type Value, dimDiv, getEl, isNoDim } from '../engine/values.js';
import type { Expr, NumberFormat, StoredResult, StoredValue } from '../model/ast.js';

const trim = (s: string): string => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);

function fixed(x: number, f: NumberFormat): string {
  const s = x.toFixed(Math.min(f.precision, 20));
  return f.trailingZeros ? s : trim(s);
}

export function formatNumber(x: number, f: NumberFormat): string {
  if (Number.isNaN(x)) return '\\mathrm{NaN}';
  if (!Number.isFinite(x)) return x > 0 ? '\\infty' : '-\\infty';
  const size = Math.abs(x);
  if (size < 1e-15) return fixed(0, f);
  // Tested in Mathcad 14 at four thresholds. The two sides of the rule really do differ by one.
  if (size >= 10 ** f.exponent || size < 10 ** -(f.exponent - 1)) {
    let power = Math.floor(Math.log10(size));
    let mantissa = fixed(x / 10 ** power, f);
    if (Math.abs(Number(mantissa)) >= 10) {
      power += 1;
      mantissa = fixed(x / 10 ** power, f);
    }
    return `${mantissa}\\times10^{${power}}`;
  }
  return fixed(x, f);
}

/**
 * A part far smaller than the other is shown as 0, by Mathcad's complex threshold: 1 + 10⁻¹¹i shows as 1,
 * and rounding noise such as 25 − 2·10⁻¹⁵i as 25. Probed in Mathcad 14 at its default of 10.
 */
function belowThreshold(n: { re: number; im: number }, f: NumberFormat): { re: number; im: number } {
  const t = 10 ** -(f.complexThreshold ?? 10);
  if (n.im !== 0 && Math.abs(n.im) < t * Math.abs(n.re)) return { re: n.re, im: 0 };
  if (n.re !== 0 && Math.abs(n.re) < t * Math.abs(n.im)) return { re: 0, im: n.im };
  return n;
}

/** Magnitude∠angle, the angle in degrees, as phasors are written. */
function polarForm(n: { re: number; im: number }, f: NumberFormat): string {
  const r = Math.hypot(n.re, n.im);
  // Braced, so the minus of a negative angle is a sign rather than a subtraction.
  return `${formatNumber(r, f)}\\angle {${formatNumber(r === 0 ? 0 : (Math.atan2(n.im, n.re) * 180) / Math.PI, f)}}^{\\circ}`;
}

/**
 * A complex number as re+im·i, or as magnitude∠angle when the format asks for polar. `polar` is set for every
 * element of a matrix that holds a complex number, so a column of phasors reads alike even where one is real.
 */
function complex(given: { re: number; im: number }, f: NumberFormat, polar?: boolean): string {
  const n = belowThreshold(given, f);
  if (polar ?? (f.polar === true && n.im !== 0)) return polarForm(n, f);
  if (n.im === 0) return formatNumber(n.re, f);
  const im = formatNumber(Math.abs(n.im), f);
  if (n.re === 0) return `${n.im < 0 ? '-' : ''}${im}\\mathrm{i}`;
  return `${formatNumber(n.re, f)}${n.im < 0 ? '-' : '+'}${im}\\mathrm{i}`;
}

/** A display unit chosen on the sheet, such as `cm` after a result. */
export interface DisplayUnit {
  /** The unit's value in base units, or null for a temperature, which has an offset. */
  value: Num | null;
  latex: string;
  offset?: { scale: number; zero: number };
}

/** Upright, as units are written, whatever the expression. */
export function unitTex(e: Expr): string {
  const t = (x: Expr): string => unitTex(x);
  switch (e.k) {
    case 'real': return String(e.v);
    case 'id': return unitNameLatex(e.name.replace(/[\\{}_^]/g, ''));
    case 'op': {
      const [a, b] = e.args;
      if (e.op === 'mult') return `${t(a!)}\\cdot ${t(b!)}`;
      if (e.op === 'div') return `\\frac{${t(a!)}}{${t(b!)}}`;
      if (e.op === 'pow') return `${t(a!)}^{${t(b!)}}`;
      if (e.op === 'neg') return `-${t(a!)}`;
      return '?';
    }
    default: return '?';
  }
}

/** `degC` and `degF` are the typed spellings, since ° isn't on most keyboards. */
const TEMPERATURES: Record<string, { scale: number; zero: number }> = {
  '°C': { scale: 1, zero: 273.15 },
  '°F': { scale: 5 / 9, zero: (459.67 * 5) / 9 },
  degC: { scale: 1, zero: 273.15 },
  degF: { scale: 5 / 9, zero: (459.67 * 5) / 9 },
};

/** The display unit for a result, from the unit expression and its value. */
export function displayUnit(expr: Expr | null, value: Value | undefined): DisplayUnit | undefined {
  if (!expr) return undefined;
  if (expr.k === 'id' && TEMPERATURES[expr.name]) {
    return { value: null, latex: `\\mathrm{${expr.name.replace('deg', '°')}}`, offset: TEMPERATURES[expr.name]! };
  }
  if (value?.t !== 'num' || value.re === 0) return undefined;
  return { value, latex: unitTex(expr) };
}

/** The scale and unit for a dimension: the chosen unit, plus any dimension it leaves over. */
function unitFor(dim: Dim, unit: DisplayUnit | undefined): { divide: number; latex: string; offset?: DisplayUnit['offset'] } {
  if (unit?.offset) return { divide: unit.offset.scale, latex: unit.latex, offset: unit.offset };
  if (unit?.value) {
    const rest = dimDiv(dim, unit.value.dim);
    const extra = isNoDim(rest) ? '' : `\\cdot ${unitsLatex(chooseUnits(rest).parts)}`;
    return { divide: unit.value.re, latex: `${unit.latex}${extra}` };
  }
  const chosen = chooseUnits(dim);
  return { divide: chosen.factor, latex: unitsLatex(chosen.parts) };
}

/**
 * How a plot axis shows values of a dimension: each base-unit value v shows as (v − zero) / divide, labelled
 * with the unit's LaTeX ('' for plain numbers). Chosen as a result's display unit is.
 */
export function axisScale(dim: Dim, unit: DisplayUnit | undefined): { divide: number; zero: number; latex: string } {
  const u = unitFor(dim, unit);
  return { divide: u.divide, zero: u.offset?.zero ?? 0, latex: u.latex };
}

/** The unit an answer shows, as LaTeX: the chosen one, with any dimension it leaves over, or the default. */
export function unitLatexOf(v: Value, unit?: DisplayUnit): string {
  return v.t === 'num' || v.t === 'mat' ? unitFor(v.dim, unit).latex : '';
}

const withUnit = (number: string, latex: string): string => (latex ? `${number}\\ ${latex}` : number);

const matrix = (rows: string[][]): string => `\\begin{pmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{pmatrix}`;

/** Large arrays show their first rows and columns, as a table would. */
const MAX_ROWS = 12;
const MAX_COLS = 8;

function grid(rows: number, cols: number, cell: (i: number, j: number) => string): string {
  const showRows = Math.min(rows, MAX_ROWS);
  const showCols = Math.min(cols, MAX_COLS);
  const out: string[][] = [];
  for (let i = 0; i < showRows; i++) {
    const row = Array.from({ length: showCols }, (_, j) => cell(i, j));
    if (cols > showCols) row.push('\\cdots');
    out.push(row);
  }
  if (rows > showRows) out.push(Array.from({ length: showCols + (cols > showCols ? 1 : 0) }, () => '\\vdots'));
  return matrix(out);
}

export function formatValue(v: Value, f: NumberFormat, unit?: DisplayUnit): string {
  const scaled = (n: Num, u: ReturnType<typeof unitFor>): Num => ({
    ...n,
    re: u.offset ? (n.re - u.offset.zero) / u.divide : n.re / u.divide,
    im: n.im / u.divide,
    dim: NODIM,
  });
  switch (v.t) {
    case 'num': {
      const u = unitFor(v.dim, unit);
      return withUnit(complex(scaled(v as Num, u), f), u.latex);
    }
    case 'str': return `\\text{"${v.v.replace(/[\\{}]/g, '')}"}`;
    case 'mat': {
      const m = v as Mat;
      const u = unitFor(m.dim, unit);
      const polar = f.polar === true && !m.cells && m.im !== null && m.im.some((x) => x !== 0);
      const body = grid(m.rows, m.cols, (i, j) => {
        const el = getEl(m, i, j);
        return el.t === 'num' ? complex(scaled(el, u), f, polar) : formatValue(el, f);
      });
      return withUnit(body, u.latex);
    }
    default: return '';
  }
}

/** Shows the answer saved in an imported file, used when a sheet can't recompute it yet. */
export function formatStored(s: StoredResult, f: NumberFormat): string {
  const one = (v: StoredValue): string => {
    if (v.k === 'num') return complex(v, f);
    if (v.k === 'str') return `\\text{"${v.v.replace(/[\\{}]/g, '')}"}`;
    if (v.k === 'fn') return `\\text{${v.type.replace(/[\\{}]/g, '')}}`;
    return grid(v.rows, v.cols, (i, j) => one(v.items[i + j * v.rows]!));
  };
  const latex = unitsLatex(s.units.map((x) => ({ name: shortUnit(x.unit), power: x.power })));
  return withUnit(one(s.value), latex);
}
