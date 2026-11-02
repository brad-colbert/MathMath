/** Shows a computed value as LaTeX, following the worksheet's number format. */
import { type Dim, type Mat, type Num, type Value, getEl, isNoDim } from '../engine/values.js';
import type { NumberFormat, StoredResult, StoredValue } from '../model/ast.js';

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

function complex(n: { re: number; im: number }, f: NumberFormat): string {
  if (n.im === 0) return formatNumber(n.re, f);
  const im = formatNumber(Math.abs(n.im), f);
  if (n.re === 0) return `${n.im < 0 ? '-' : ''}${im}\\mathrm{i}`;
  return `${formatNumber(n.re, f)}${n.im < 0 ? '-' : '+'}${im}\\mathrm{i}`;
}

const BASE = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'];

/** Base units for now. Choosing named units such as W is a later milestone. */
function units(dim: Dim): string {
  if (isNoDim(dim)) return '';
  const parts = dim.flatMap((power, i) => {
    if (Math.abs(power) < 1e-9) return [];
    const p = Number(power.toFixed(6));
    return [`\\mathrm{${BASE[i]}}${p === 1 ? '' : `^{${p}}`}`];
  });
  return `\\ ${parts.join('\\cdot ')}`;
}

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

export function formatValue(v: Value, f: NumberFormat): string {
  switch (v.t) {
    case 'num': return `${complex(v as Num, f)}${units(v.dim)}`;
    case 'str': return `\\text{"${v.v.replace(/[\\{}]/g, '')}"}`;
    case 'mat': {
      const m = v as Mat;
      const body = grid(m.rows, m.cols, (i, j) => {
        const el = getEl(m, i, j);
        return el.t === 'num' ? complex(el, f) : formatValue(el, f);
      });
      return `${body}${units(m.dim)}`;
    }
    default: return '';
  }
}

/** Shows the answer saved in an imported file, used when a sheet can't recompute it yet. */
export function formatStored(s: StoredResult, f: NumberFormat): string {
  const one = (v: StoredValue): string => {
    if (v.k === 'num') return complex(v, f);
    if (v.k === 'str') return `\\text{"${v.v.replace(/[\\{}]/g, '')}"}`;
    return grid(v.rows, v.cols, (i, j) => one(v.items[i + j * v.rows]!));
  };
  const u = s.units.map((x) => `\\mathrm{${x.unit}}${x.power === 1 ? '' : `^{${x.power}}`}`).join('\\cdot ');
  return `${one(s.value)}${u ? `\\ ${u}` : ''}`;
}
