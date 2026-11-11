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
 * Mathcad 14's shooting functions for boundary-value problems (probed, 2026-11-11):
 *
 * - sbval(v, x1, x2, D, load, score): the starting values left unknown at x1. load(x1, v) gives the values at x1,
 *   known ones and the guesses v; the solution of y' = D(x, y) is carried to x2, and score(x2, y) must come to 0
 *   there, one value for each guess. Newton's method on v until the score is 0 to rounding: Mathcad's answers are
 *   within about 1e−13 of the true ones, whatever TOL is.
 * - bvalfit(v1, v2, x1, x2, xf, D, load1, load2, score): the same from both ends, load1(x1, v1) carried forward
 *   and load2(x2, v2) back to xf, where score(xf, y) must agree; good for a D that jumps at xf. The answer is v1
 *   and v2 side by side, the shorter padded with zeros, as Mathcad gives them.
 *
 * Where Mathcad returns a number regardless, for a problem with no solution or a score of the wrong length,
 * these say so instead.
 */
import { bulirschStoer } from './ode-methods.js';
import { newtonSystem } from './solve.js';
import { EvalError, type Fn, type Mat, type Value, fromValues, isNoDim, newMat, num } from './values.js';

type Impl = (...args: Value[]) => Value;

export const BVP_ARITY: Record<string, [number, number]> = { sbval: [6, 6], bvalfit: [9, 9] };

/** A column of real numbers without units, as these take their guesses and give their values. */
function realColumn(v: Value, fn: string, what: string): number[] {
  if (v.t === 'num' && v.im === 0 && isNoDim(v.dim)) return [v.re];
  if (v.t !== 'mat' || v.cells || (v.cols !== 1 && v.rows !== 1) || !isNoDim(v.dim) || v.im?.some((x) => x !== 0)) {
    throw new EvalError('runtime', `${fn}: ${what} must be a vector of real numbers without units`);
  }
  return Array.from(v.re);
}

function realNumber(v: Value, fn: string, what: string): number {
  if (v.t !== 'num' || v.im !== 0 || !isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must be a real number without units`);
  return v.re;
}

function fnOf(v: Value, fn: string, what: string): Fn {
  if (v.t !== 'fn') throw new EvalError('runtime', `${fn}'s ${what} must be a function, defined above as ${what}(…) := …`);
  return v;
}

const column = (xs: ArrayLike<number>): Mat => {
  const m = newMat(xs.length, 1);
  m.re.set(Array.from(xs));
  return m;
};

/** y at `to`, starting from y0 at `from`, for y' = D(x, y), integrated to 1e−13. */
function carry(D: Fn, y0: number[], from: number, to: number, fn: string): number[] {
  const n = y0.length;
  if (from === to) return y0;
  const f = (x: number, y: Float64Array): Float64Array => {
    const out = realColumn(D.call([num(x), column(y)]), fn, 'D(x, y)');
    if (out.length !== n) throw new EvalError('runtime', `${fn}: D(x, y) must give ${n} values, one for each of load's, not ${out.length}`);
    return Float64Array.from(out);
  };
  return Array.from(bulirschStoer({ f, x1: from, y0: Float64Array.from(y0), x2: to, rtol: 1e-13, atol: 1e-13, fn }).to(to));
}

/** Newton's method on the guesses, with central differences for the Jacobian, until the residuals are rounding. */
function solve(shoot: (v: number[]) => number[], v0: number[], fn: string): number[] {
  const vec = (v: ArrayLike<number>) => Float64Array.from(Array.from(v));
  let r0: number[];
  try {
    r0 = shoot(v0);
  } catch (err) {
    // From the guesses themselves the solution doesn't reach the end: say so, rather than the integrator's advice.
    const at = err instanceof EvalError ? /at x = ([^.\s]+(?:\.\d+)?)/.exec(err.reason)?.[1] : undefined;
    if (err instanceof EvalError && /step size|steps/.test(err.reason)) {
      throw new EvalError('runtime', `${fn} can't converge: from these guesses the solution runs away${at ? ` near x = ${at}` : ''} before the end. Try other guesses`);
    }
    throw err;
  }
  // A trial shot that runs away counts as a residual too large to accept, so the damped step backs off.
  const res = (v: number[]): number[] => {
    try {
      return shoot(v);
    } catch (err) {
      if (err instanceof EvalError && /step size|steps/.test(err.reason)) return v0.map(() => NaN);
      throw err;
    }
  };
  if (r0.length !== v0.length) throw new EvalError('runtime', `${fn}: the score must give one value for each guess: ${v0.length} guess${v0.length === 1 ? '' : 'es'}, ${r0.length} value${r0.length === 1 ? '' : 's'}`);
  const scale = Math.max(1, ...r0.map(Math.abs));
  const jac = (v: Float64Array): number[][] => {
    const cols = Array.from(v, (vj, j) => {
      const h = 1e-6 * Math.max(1, Math.abs(vj));
      const up = Array.from(v); up[j] = vj + h;
      const down = Array.from(v); down[j] = vj - h;
      const a = res(up);
      const b = res(down);
      return a.map((x, i) => (x - b[i]!) / (2 * h));
    });
    return cols[0]!.map((_, i) => cols.map((c) => c[i]!));
  };
  const fit = newtonSystem((v) => vec(res(Array.from(v))), vec(v0), jac,
    (_, r) => r.every((x) => Math.abs(x) <= 1e-14 * scale), (_, r) => r.every((x) => Math.abs(x) <= 1e-10 * scale));
  const worst = Math.max(...Array.from(fit.r, Math.abs));
  if (!(worst <= 1e-8 * scale)) {
    throw new EvalError('runtime', `${fn} couldn't make the score 0: it stays ${worst.toPrecision(3)} at best. The problem may have no solution, or the guesses may be too far from one`);
  }
  return Array.from(fit.x);
}

function sbval(v: Value, a: Value, b: Value, D: Value, load: Value, score: Value): Value {
  const fn = 'sbval';
  const v0 = realColumn(v, fn, 'v, the guesses');
  const [x1, x2] = [realNumber(a, fn, 'x1'), realNumber(b, fn, 'x2')];
  const [d, l, s] = [fnOf(D, fn, 'D'), fnOf(load, fn, 'load'), fnOf(score, fn, 'score')];
  const res = (g: number[]): number[] => {
    const y0 = realColumn(l.call([num(x1), column(g)]), fn, 'load(x1, v)');
    const y = carry(d, y0, x1, x2, fn);
    return realColumn(s.call([num(x2), column(y)]), fn, 'score(x2, y)');
  };
  return column(solve(res, v0, fn));
}

function bvalfit(v1: Value, v2: Value, a: Value, b: Value, c: Value, D: Value, load1: Value, load2: Value, score: Value): Value {
  const fn = 'bvalfit';
  const g1 = realColumn(v1, fn, 'v1, the guesses at x1');
  const g2 = realColumn(v2, fn, 'v2, the guesses at x2');
  const [x1, x2, xf] = [realNumber(a, fn, 'x1'), realNumber(b, fn, 'x2'), realNumber(c, fn, 'xf')];
  if (!((xf - x1) * (x2 - xf) >= 0)) throw new EvalError('runtime', "bvalfit's xf must lie between x1 and x2");
  const [d, l1, l2, s] = [fnOf(D, fn, 'D'), fnOf(load1, fn, 'load1'), fnOf(load2, fn, 'load2'), fnOf(score, fn, 'score')];
  const n1 = g1.length;
  const res = (g: number[]): number[] => {
    const ya = carry(d, realColumn(l1.call([num(x1), column(g.slice(0, n1))]), fn, 'load1(x1, v1)'), x1, xf, fn);
    const yb = carry(d, realColumn(l2.call([num(x2), column(g.slice(n1))]), fn, 'load2(x2, v2)'), x2, xf, fn);
    const sa = realColumn(s.call([num(xf), column(ya)]), fn, 'score(xf, y)');
    const sb = realColumn(s.call([num(xf), column(yb)]), fn, 'score(xf, y)');
    return sa.map((x, i) => x - sb[i]!);
  };
  const v = solve(res, [...g1, ...g2], fn);
  const rows = Math.max(n1, g2.length);
  const items: Value[] = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < rows; i++) items.push(num(j === 0 ? (i < n1 ? v[i]! : 0) : (i < g2.length ? v[n1 + i]! : 0)));
  return fromValues(rows, 2, items);
}

export const bvpFns: Record<string, Impl> = {
  sbval: (v, a, b, D, load, score) => sbval(v!, a!, b!, D!, load!, score!),
  bvalfit: (v1, v2, a, b, c, D, l1, l2, s) => bvalfit(v1!, v2!, a!, b!, c!, D!, l1!, l2!, s!),
};

