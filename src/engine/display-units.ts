/**
 * Which unit a result shows in. Tested in Mathcad 14: a dimension that matches a named unit shows
 * that name, and anything else is a fraction of base units in the order m, kg, K, s, A, mol, cd.
 */
import { type Dim, dimEq, isNoDim } from './values.js';

export interface UnitPart { name: string; power: number }
export interface Chosen { parts: UnitPart[]; factor: number }

// Dimension index: length, mass, time, current, temperature, substance, luminous intensity.
const d = (L: number, M: number, T: number, I = 0, K = 0, N = 0, J = 0): Dim => [L, M, T, I, K, N, J];

/** Named units Mathcad chooses. Hz, S and lm are absent: it shows 1/s, 1/Ω and cd. */
const NAMED: { name: string; dim: Dim; factor: number }[] = [
  { name: 'N', dim: d(1, 1, -2), factor: 1 },
  { name: 'J', dim: d(2, 1, -2), factor: 1 },
  { name: 'W', dim: d(2, 1, -3), factor: 1 },
  { name: 'Pa', dim: d(-1, 1, -2), factor: 1 },
  { name: 'C', dim: d(0, 0, 1, 1), factor: 1 },
  { name: 'V', dim: d(2, 1, -3, -1), factor: 1 },
  { name: 'Ω', dim: d(2, 1, -3, -2), factor: 1 },
  { name: 'F', dim: d(-2, -1, 4, 2), factor: 1 },
  { name: 'T', dim: d(0, 1, -2, -1), factor: 1 },
  { name: 'Wb', dim: d(2, 1, -2, -1), factor: 1 },
  { name: 'H', dim: d(2, 1, -2, -2), factor: 1 },
  { name: 'lx', dim: d(-2, 0, 0, 0, 0, 0, 1), factor: 1 },
  { name: 'L', dim: d(3, 0, 0), factor: 1e-3 },
];

const BASE: { name: string; index: number }[] = [
  { name: 'm', index: 0 }, { name: 'kg', index: 1 }, { name: 'K', index: 4 }, { name: 's', index: 2 },
  { name: 'A', index: 3 }, { name: 'mol', index: 5 }, { name: 'cd', index: 6 },
];

export function chooseUnits(dim: Dim): Chosen {
  if (isNoDim(dim)) return { parts: [], factor: 1 };
  const named = NAMED.find((n) => dimEq(n.dim, dim));
  if (named) return { parts: [{ name: named.name, power: 1 }], factor: named.factor };
  const parts = BASE.flatMap((b): UnitPart[] => {
    const p = dim[b.index]!;
    return Math.abs(p) < 1e-9 ? [] : [{ name: b.name, power: Number(p.toFixed(6)) }];
  });
  return { parts, factor: 1 };
}

const up = (name: string): string => (name === 'Ω' ? '\\Omega' : `\\mathrm{${name}}`);
const power = (p: UnitPart, n: number): string => (n === 1 ? up(p.name) : `${up(p.name)}^{${n}}`);

/** As Mathcad writes them: a fraction when any power is negative. */
export function unitsLatex(parts: UnitPart[]): string {
  const top = parts.filter((p) => p.power > 0).map((p) => power(p, p.power));
  const bottom = parts.filter((p) => p.power < 0).map((p) => power(p, -p.power));
  if (top.length === 0 && bottom.length === 0) return '';
  if (bottom.length === 0) return top.join('\\cdot ');
  return `\\frac{${top.join('\\cdot ') || '1'}}{${bottom.join('\\cdot ')}}`;
}
