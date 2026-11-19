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
 * Mathcad 14's graphing helpers, as probed (2026-11-10):
 *
 * - xy2pol and pol2xy work in two dimensions and give two coordinates; xyz2sph, sph2xyz, xyz2cyl and cyl2xyz in
 *   three. Each takes the coordinates one by one or as one column vector of the right length, without units, as
 *   Mathcad's do. xy2pol's angle runs from 0 to 2π, as Mathcad's does, but the azimuth θ of xyz2sph and xyz2cyl
 *   from −π to π. φ in spherical coordinates is measured from the z axis: sph2xyz(r, θ, φ) is
 *   (r·sin φ·cos θ, r·sin φ·sin θ, r·cos φ). At the origin xyz2sph's φ is NaN, as in Mathcad.
 * - logspace(min, max, npts) steps evenly in log10 from min to max, ends included, which gives Mathcad's digits;
 *   min and max are positive and in the same units. With one point it gives NaN, as Mathcad does.
 * - logpts(minexp, dec, dnpts) steps evenly within each decade, not logarithmically: logpts(0, 1, 3) is 1, 4, 7.
 * - CreateMesh and CreateSpace return the grid as Mathcad does: a 1 × 1 array holding a vector of X, Y and Z.
 *   Mesh rows follow s and columns t, each from its lower limit to its upper, ends included; the limits default
 *   to −5 and 5 and the grids to 20 points. A function giving one value makes x = s, y = t (a curve: x = y = t)
 *   and z the value; one giving a vector, or three functions, give x, y and z. An fmap after them is called
 *   with each point's x, y and z and gives the point to use.
 */
import { EvalError, type Fn, MAX_CELLS, checkPoints, countText, type Mat, type Value, dimEq, fromValues, getEl, isNoDim, num } from './values.js';

type Impl = (...args: Value[]) => Value;

export const GRAPHING_ARITY: Record<string, [number, number]> = {
  xy2pol: [1, 2], pol2xy: [1, 2], xyz2sph: [1, 3], sph2xyz: [1, 3], xyz2cyl: [1, 3], cyl2xyz: [1, 3],
  logspace: [3, 3], logpts: [3, 3], CreateMesh: [1, 10], CreateSpace: [1, 8],
};

const real = (v: Value | undefined, fn: string, what: string): number => {
  if (v?.t !== 'num') throw new EvalError('runtime', `${fn}'s ${what} must be a number`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must have no units`);
  if (v.im !== 0) throw new EvalError('runtime', `${fn}'s ${what} must be real`);
  return v.re;
};
const column = (xs: number[]): Mat => fromValues(xs.length, 1, xs.map((x) => num(x + 0)));

/** The n coordinates, given one by one or as a column vector of n. */
function coords(args: Value[], n: number, fn: string): number[] {
  if (args.length === n) return args.map((a, k) => real(a, fn, `coordinate ${k + 1}`));
  const v = args[0];
  if (args.length === 1 && v?.t === 'mat') {
    if (v.cols !== 1 || v.cells) throw new EvalError('runtime', `${fn}'s vector must be a column of numbers`);
    if (v.rows !== n) throw new EvalError('runtime', `${fn}'s vector must have ${n} elements`);
    return Array.from({ length: n }, (_, k) => real(getEl(v, k, 0), fn, `coordinate ${k + 1}`));
  }
  throw new EvalError('runtime', `${fn} takes ${n} coordinates, or a column vector of ${n}`);
}

/** The positive whole number of points. */
function count(v: Value | undefined, fn: string, what: string): number {
  const n = real(v, fn, what);
  if (!Number.isInteger(n) || n < 1) throw new EvalError('runtime', `${fn}'s ${what} must be a positive whole number`);
  checkPoints(n, fn, what);
  return n;
}

const asFn = (v: Value | undefined): Fn | null => (v?.t === 'fn' ? v : null);

/** The value of a function at a point, as numbers: one, or the elements of a vector. */
function values(f: Fn, args: Value[], fn: string): Value[] {
  const out = f.call(args);
  if (out.t === 'num') return [out];
  if (out.t === 'mat' && out.cols === 1 && !out.cells && out.rows === 3) return [0, 1, 2].map((k) => getEl(out, k, 0));
  throw new EvalError('runtime', `${fn}'s function must give a number or a vector of three`);
}

/** The functions, then the numbers, then an fmap: CreateMesh(F, [s0, s1, t0, t1], [sgrid, tgrid], [fmap]). */
function split(args: Value[], fn: string): { fns: Fn[]; nums: number[]; fmap: Fn | null } {
  let k = 0;
  const fns: Fn[] = [];
  while (k < args.length && asFn(args[k])) fns.push(asFn(args[k++])!);
  const nums: number[] = [];
  while (k < args.length && args[k]?.t === 'num') nums.push(real(args[k++], fn, 'limit or grid'));
  let fmap = k < args.length ? asFn(args[k]) : null;
  if (fmap) k++;
  if (k < args.length || fns.length === 0) throw new EvalError('runtime', `${fn} takes a function, or three, then numbers, then an optional mapping function`);
  // Two or four functions in a row: the last is the mapping, as CreateMesh(G, fmap).
  if (!fmap && (fns.length === 2 || fns.length === 4)) fmap = fns.pop()!;
  if (fns.length !== 1 && fns.length !== 3) throw new EvalError('runtime', `${fn} takes one function or three`);
  return { fns, nums, fmap };
}

function needArity(f: Fn, n: number, fn: string): void {
  if (f.arity !== undefined && f.arity !== n) {
    throw new EvalError('runtime', `${fn}'s function${n === 1 ? ' must take one variable, t' : 's must take two variables, s and t'}, not ${f.arity}`);
  }
}

/** One point: x, y and z from the functions at these parameters, mapped if there's an fmap. */
function point(fns: Fn[], params: Value[], fmap: Fn | null, fn: string): Value[] {
  let p: Value[];
  if (fns.length === 3) p = fns.map((f) => values(f, params, fn)[0]!);
  else {
    const v = values(fns[0]!, params, fn);
    // A single value is a height over the parameters: (s, t, z), or for a curve (t, t, z).
    p = v.length === 3 ? v : [params[0]!, params[params.length - 1]!, v[0]!];
  }
  if (!fmap) return p;
  const m = values(fmap, p, fn);
  if (m.length !== 3) throw new EvalError('runtime', `${fn}'s mapping function must give a vector of three`);
  return m;
}

/** X, Y and Z, as Mathcad gives them: a 1 × 1 array holding the vector of the three. */
function nested(rows: number, cols: number, pts: Value[][]): Mat {
  const parts = [0, 1, 2].map((c) => {
    const items = pts.map((p) => p[c]!);
    const d = items[0]?.t === 'num' ? items[0].dim : undefined;
    if (d && items.some((v) => v.t !== 'num' || !dimEq(v.dim, d))) throw new EvalError('runtime', 'each of x, y and z must be in one unit throughout');
    const m = fromValues(rows, cols, items);
    return m;
  });
  return fromValues(1, 1, [fromValues(3, 1, parts)]);
}

const steps = (lo: number, hi: number, n: number): number[] => Array.from({ length: n }, (_, k) => (n === 1 ? lo : lo + ((hi - lo) * k) / (n - 1)));

export const graphingFns: Record<string, Impl> = {
  xy2pol: (...a) => {
    const [x, y] = coords(a, 2, 'xy2pol');
    const t = Math.atan2(y, x);
    return column([Math.hypot(x, y), t < 0 ? t + 2 * Math.PI : t]);
  },
  pol2xy: (...a) => {
    const [r, t] = coords(a, 2, 'pol2xy');
    return column([r * Math.cos(t), r * Math.sin(t)]);
  },
  xyz2sph: (...a) => {
    const [x, y, z] = coords(a, 3, 'xyz2sph');
    const r = Math.hypot(x, y, z);
    return column([r, Math.atan2(y, x), Math.acos(z / r)]);
  },
  sph2xyz: (...a) => {
    const [r, t, p] = coords(a, 3, 'sph2xyz');
    return column([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)]);
  },
  xyz2cyl: (...a) => {
    const [x, y, z] = coords(a, 3, 'xyz2cyl');
    return column([Math.hypot(x, y), Math.atan2(y, x), z]);
  },
  cyl2xyz: (...a) => {
    const [r, t, z] = coords(a, 3, 'cyl2xyz');
    return column([r * Math.cos(t), r * Math.sin(t), z]);
  },
  logspace: (lo, hi, n) => {
    if (lo?.t !== 'num' || hi?.t !== 'num' || lo.im !== 0 || hi.im !== 0) throw new EvalError('runtime', "logspace's min and max must be real numbers");
    if (!dimEq(lo.dim, hi.dim)) throw new EvalError('runtime', "logspace's min and max must be in the same units");
    if (!(lo.re > 0) || !(hi.re > 0)) throw new EvalError('runtime', "logspace's min and max must be positive");
    const k = count(n, 'logspace', 'npts');
    const [a, b] = [Math.log10(lo.re), Math.log10(hi.re)];
    // Evenly in log10, which gives Mathcad's digits: 10, 100 and 1000 exactly. One point is 0/0: NaN, as in Mathcad.
    return fromValues(k, 1, Array.from({ length: k }, (_, j) => num(10 ** (a + (j * (b - a)) / (k - 1)), lo.dim)));
  },
  logpts: (m, d, n) => {
    const e = real(m, 'logpts', 'minexp');
    const [dec, per] = [count(d, 'logpts', 'dec'), count(n, 'logpts', 'dnpts')];
    const out: number[] = [];
    for (let j = 0; j < dec; j++) {
      const [base, top] = [10 ** (e + j), 10 ** (e + j + 1)];
      for (let k = 0; k < per; k++) out.push(base + k * ((top - base) / per));
    }
    return column(out);
  },
  CreateMesh: (...args) => {
    const { fns, nums, fmap } = split(args, 'CreateMesh');
    fns.forEach((f) => needArity(f, 2, 'CreateMesh'));
    if (![0, 2, 4, 6].includes(nums.length)) throw new EvalError('runtime', 'CreateMesh takes its limits as s0, s1, t0, t1, then its grid as sgrid, tgrid');
    const [s0, s1, t0, t1] = nums.length >= 4 ? nums : [-5, 5, -5, 5];
    const grid = nums.length === 2 ? nums : nums.length === 6 ? nums.slice(4) : [20, 20];
    const [ns, nt] = grid.map((g) => count(num(g), 'CreateMesh', 'grid'));
    // Each point is kept as its own values till the grid is made, so the grid is held to an array of objects' size.
    if (ns! * nt! > MAX_CELLS) throw new EvalError('runtime', `CreateMesh's grid, sgrid × tgrid, can have at most ${countText(MAX_CELLS)} points, not ${countText(ns! * nt!)}, to keep within the page's memory`);
    const ss = steps(s0!, s1!, ns!);
    const ts = steps(t0!, t1!, nt!);
    const pts: Value[][] = [];
    // Column-major, as matrices are stored: s down the rows, t along the columns.
    for (const t of ts) for (const s of ss) pts.push(point(fns, [num(s), num(t)], fmap, 'CreateMesh'));
    return nested(ns!, nt!, pts);
  },
  CreateSpace: (...args) => {
    const { fns, nums, fmap } = split(args, 'CreateSpace');
    fns.forEach((f) => needArity(f, 1, 'CreateSpace'));
    if (nums.length > 3) throw new EvalError('runtime', 'CreateSpace takes its limits as t0, t1, then its grid, tgrid');
    const [t0, t1] = nums.length >= 2 ? nums : [-5, 5];
    const n = count(num(nums.length === 1 ? nums[0]! : nums.length === 3 ? nums[2]! : 20), 'CreateSpace', 'grid');
    const pts = steps(t0!, t1!, n).map((t) => point(fns, [num(t)], fmap, 'CreateSpace'));
    return nested(n, 1, pts);
  },
};
