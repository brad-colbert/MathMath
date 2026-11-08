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
 * Electrical engineering helpers, MathMath's own: parallel combinations, phasors, decibels and standard
 * (E-series) part values. They take units: parallel(1·kΩ, 2·kΩ) is in ohms, standardValue(4.8·μF, 12) in farads.
 */
import { add, div, mapMat, scalarOf, zip } from './ops.js';
import { type Dim, EvalError, type Num, type Value, dimEq, getEl, isNoDim, num, requireNum } from './values.js';

type Impl = (...args: Value[]) => Value;

const WATT: Dim = [2, 1, -3, 0, 0, 0, 0];

/** Every number in the arguments, matrices read down their columns. */
function numbers(args: Value[]): Num[] {
  return args.flatMap((a): Num[] => {
    if (a.t !== 'mat') return [requireNum(a)];
    const out: Num[] = [];
    for (let n = 0; n < a.rows * a.cols; n++) out.push(...numbers([getEl(a, n % a.rows, Math.floor(n / a.rows))]));
    return out;
  });
}

/** One over the sum of reciprocals: resistors or impedances in parallel, capacitors in series. */
function parallel(...args: Value[]): Value {
  const items = numbers(args);
  if (items.length === 0) throw new EvalError('runtime', 'parallel needs at least one value');
  const dim = items[0]!.dim;
  if (items.some((x) => !dimEq(x.dim, dim))) throw new EvalError('runtime', 'parallel: the values must all have the same units');
  // A short circuit across any branch shorts the whole combination.
  if (items.some((x) => x.re === 0 && x.im === 0)) return num(0, dim);
  const total = items.map((x) => div(num(1), x)).reduce((a, b) => add(a, b));
  if (total.re === 0 && total.im === 0) throw new EvalError('runtime', 'parallel: the branches cancel, so the combination is infinite');
  return div(num(1), total);
}

/** Each element of `v`, or `v` itself, through `f`. */
const each = (f: (x: Num) => Value): Impl => {
  const g = (v: Value): Value => (v.t === 'mat' ? mapMat(v, g) : f(requireNum(v)));
  return (v) => g(v!);
};

const realOf = (x: Num, what: string): number => {
  if (x.im !== 0) throw new EvalError('runtime', `${what} must be real`);
  return x.re;
};

/** r∠θ as a complex number. θ is in radians, so 30·deg works. */
function phasor(r: Value, theta: Value): Value {
  return zip(r, theta, (a, b) => {
    const m = scalarOf(a);
    const t = scalarOf(b);
    if (!isNoDim(t.dim)) throw new EvalError('runtime', "phasor's angle must be an angle (radians or deg), without other units");
    const angle = realOf(t, "phasor's angle");
    const mag = realOf(m, "phasor's magnitude");
    return num(mag * Math.cos(angle), m.dim, mag * Math.sin(angle));
  });
}

const ratio = (x: Num, fn: string): Num => {
  if (!isNoDim(x.dim)) throw new EvalError('runtime', `${fn} takes a ratio without units: divide by the reference first`);
  return x;
};

const log10Of = (v: number, fn: string): number => {
  if (v === 0) throw new EvalError('runtime', `${fn} of 0 is minus infinity`);
  return Math.log10(v);
};

const decibels: Record<string, Impl> = {
  /** A power ratio in decibels: 10·log(P1/P2). */
  powerToDb: each((x) => {
    const v = realOf(ratio(x, 'powerToDb'), "powerToDb's ratio");
    if (v < 0) throw new EvalError('runtime', 'powerToDb takes a power ratio, which is never negative');
    return num(10 * log10Of(v, 'powerToDb'));
  }),
  /** An amplitude ratio (voltage, current, a transfer function's gain) in decibels: 20·log|x|. */
  ampToDb: each((x) => num(20 * log10Of(Math.hypot(ratio(x, 'ampToDb').re, x.im), 'ampToDb'))),
  dbToPower: each((d) => num(10 ** (realOf(ratio(d, 'dbToPower'), "dbToPower's decibels") / 10))),
  dbToAmp: each((d) => num(10 ** (realOf(ratio(d, 'dbToAmp'), "dbToAmp's decibels") / 20))),
  /** A power in dBm: decibels above one milliwatt. */
  wattsToDbm: each((p) => {
    if (!dimEq(p.dim, WATT)) throw new EvalError('runtime', 'wattsToDbm takes a power, in W, mW or another power unit');
    const v = realOf(p, "wattsToDbm's power");
    if (v < 0) throw new EvalError('runtime', 'wattsToDbm takes a power, which is never negative');
    return num(10 * log10Of(v / 1e-3, 'wattsToDbm'));
  }),
  dbmToWatts: each((d) => num(1e-3 * 10 ** (realOf(ratio(d, 'dbmToWatts'), "dbmToWatts's decibels") / 10), WATT)),
};

/** IEC 60063's preferred numbers. E3 to E24 are tabulated in the standard, not rounded powers of ten. */
const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
const E96 = [
  100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174,
  178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309,
  316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549,
  562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976,
];
/** E192 is 10^(k/192) to three figures, but for 9.20, where the standard doesn't round to 9.19. */
const E192 = Array.from({ length: 192 }, (_, k) => {
  const v = Math.round(100 * 10 ** (k / 192));
  return v === 919 ? 920 : v;
});
const every = <T>(xs: T[], step: number): T[] => xs.filter((_, k) => k % step === 0);
/** Each series as mantissas from 1 up to, not including, 10. */
export const E_SERIES: Record<number, number[]> = {
  3: every(E24, 8).map((v) => v / 10),
  6: every(E24, 4).map((v) => v / 10),
  12: every(E24, 2).map((v) => v / 10),
  24: E24.map((v) => v / 10),
  48: every(E96, 2).map((v) => v / 100),
  96: E96.map((v) => v / 100),
  192: E192.map((v) => v / 100),
};

/** The nearest standard value on a log scale, which is the nearest by ratio, as tolerances are. */
export function nearestStandard(x: number, series: number[]): number {
  if (x === 0) return 0;
  if (x < 0) return -nearestStandard(-x, series);
  let decade = Math.floor(Math.log10(x));
  // Rounding in log10 can put 1000 in the decade below; the mantissa must lie in [1, 10).
  const scale = (p: number): number => (p >= 0 ? 10 ** p : 1 / 10 ** -p);
  if (x / scale(decade) >= 10) decade++;
  if (x / scale(decade) < 1) decade--;
  const m = x / scale(decade);
  let best = 1;
  let gap = Infinity;
  for (const c of [...series, 10]) {
    const g = Math.abs(Math.log(m / c));
    if (g < gap) [best, gap] = [c, g];
  }
  // Dividing by a power of ten, rather than multiplying by a small one, keeps 4.7e-6 exact.
  return decade >= 0 ? best * 10 ** decade : best / 10 ** -decade;
}

function standardValue(x: Value, n: Value): Value {
  const count = requireNum(n, "standardValue's series");
  const series = E_SERIES[count.re];
  if (!series || count.im !== 0 || !isNoDim(count.dim)) {
    throw new EvalError('runtime', "standardValue's series must be 3, 6, 12, 24, 48, 96 or 192 (E3 to E192)");
  }
  return each((v) => num(nearestStandard(realOf(v, "standardValue's value"), series), v.dim))(x);
}

export const electricalFns: Record<string, Impl> = {
  parallel,
  phasor: (r, t) => phasor(r!, t!),
  ...decibels,
  standardValue: (x, n) => standardValue(x!, n!),
};

export const ELECTRICAL_ARITY: Record<string, [number, number]> = {
  parallel: [1, Infinity], phasor: [2, 2], powerToDb: [1, 1], ampToDb: [1, 1], dbToPower: [1, 1], dbToAmp: [1, 1],
  wattsToDbm: [1, 1], dbmToWatts: [1, 1], standardValue: [2, 2],
};
