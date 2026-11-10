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
 * Mathcad 14's finance functions, which follow the spreadsheet conventions: money paid out is negative and money
 * received positive; type 0 puts each payment at the end of its period and type 1 at the start; an omitted fv or
 * pv is 0. Probed in Mathcad 14 (2026-11-10):
 *
 * - npv discounts the first cash flow by one period, so npv(0.1, (−100, 110)) is 0. Cash flows are a column vector:
 *   a row is refused, as in Mathcad.
 * - irr and rate solve by Newton's method from the guess, 0.1 unless given, so a flow with two rates gives the one
 *   nearer the guess: irr((−100, 230, −132)) is 10%, and 20% from 0.25. Their accuracy is fixed, 1e−7 of a
 *   percent for rate and 1e−5 for irr as Mathcad's Help says, not TOL. Mathcad 14 was still calculating
 *   irr((−1000, 100)), whose answer is −90%, after a minute; MathMath finds it.
 * - The number of periods, nper, and the periods per year of eff must be positive whole numbers, as must per, start and end,
 *   with per and end at most nper and start at most end. nom takes any npery above 0. type is 0 or 1. nper refuses
 *   a rate of −1 or less, and says so when the payments never reach the target, where the logarithm would be of
 *   a negative number. cnper and crate need pv and fv positive.
 * - At a rate of 0, fv keeps pv and nper keeps fv's sign, as the formulas do and as Mathcad 14 itself does at any
 *   other rate. Mathcad 14 drops pv from fv there, so fv(0, 10, −100, −50) is 1000 in it and 1050 here, and turns
 *   fv's sign in nper, so nper(0, −100, 1000, −200) is 12 in it and 8 here (at a rate of 1%, Mathcad gives 8.56).
 * - The arguments have no units, as in Mathcad. Rates can be written with %, as 8.25%.
 */
import { EvalError, type Mat, type Value, isNoDim, num } from './values.js';

type Impl = (...args: Value[]) => Value;

export const FINANCE_ARITY: Record<string, [number, number]> = {
  pmt: [3, 5], pv: [3, 5], fv: [3, 5], nper: [3, 5], rate: [3, 6], ipmt: [4, 6], ppmt: [4, 6], cumint: [5, 6], cumprn: [5, 6],
  eff: [2, 2], nom: [2, 2], npv: [2, 2], irr: [1, 2], mirr: [3, 3], cnper: [3, 3], crate: [3, 3], fvadj: [2, 2], fvc: [2, 2],
};

/** A real number without units. */
function real(v: Value | undefined, fn: string, what: string): number {
  if (v?.t !== 'num') throw new EvalError('runtime', `${fn}'s ${what} must be a number`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s ${what} must have no units`);
  if (v.im !== 0) throw new EvalError('runtime', `${fn}'s ${what} must be real`);
  return v.re;
}
const optional = (v: Value | undefined, fn: string, what: string): number => (v === undefined ? 0 : real(v, fn, what));
function count(v: Value | undefined, fn: string, what: string): number {
  const n = real(v, fn, what);
  if (!Number.isInteger(n) || n < 1) throw new EvalError('runtime', `${fn}'s ${what} must be a positive whole number`);
  return n;
}
function type(v: Value | undefined, fn: string): number {
  const t = optional(v, fn, 'type');
  if (t !== 0 && t !== 1) throw new EvalError('runtime', `${fn}'s type must be 0, for payments at the end of each period, or 1, for the start`);
  return t;
}
/** A column of real numbers without units, as Mathcad's cash flows and rate schedules are. */
function column(v: Value | undefined, fn: string, what: string): number[] {
  if (v?.t !== 'mat' || v.cols !== 1 || v.cells) throw new EvalError('runtime', `${fn}'s ${what} must be a column vector of numbers`);
  const m = v as Mat;
  if (!isNoDim(m.dim)) throw new EvalError('runtime', `${fn}'s ${what} must have no units`);
  if (m.im?.some((x) => x !== 0)) throw new EvalError('runtime', `${fn}'s ${what} must be real`);
  return Array.from(m.re);
}
function checked(x: number, fn: string): Value {
  if (!Number.isFinite(x)) throw new EvalError('runtime', `${fn} has no finite answer here`);
  return num(x + 0);
}

/** (1 + r)^n − 1 over r, the growth of a payment of 1 a period, with its limit n at r = 0. */
const annuity = (r: number, n: number): number => {
  if (r === 0) return n;
  // expm1 and log1p keep the digits for small r; below −1 the growth (1 + r)^n changes sign, so take it directly.
  return r > -1 ? Math.expm1(n * Math.log1p(r)) / r : ((1 + r) ** n - 1) / r;
};
const growth = (r: number, n: number): number => (1 + r) ** n;

/** The payment each period: pv(1+r)^n + pmt(1+r·type)·annuity + fv = 0. */
function payment(r: number, n: number, pv: number, fv: number, t: number): number {
  if (r === 0) return -(pv + fv) / n;
  return -(pv * growth(r, n) + fv) / ((1 + r * t) * annuity(r, n));
}
function futureValue(r: number, n: number, pmt: number, pv: number, t: number): number {
  if (r === 0) return -(pv + pmt * n);
  return -(pv * growth(r, n) + pmt * (1 + r * t) * annuity(r, n));
}
function presentValue(r: number, n: number, pmt: number, fv: number, t: number): number {
  if (r === 0) return -(fv + pmt * n);
  return -(fv + pmt * (1 + r * t) * annuity(r, n)) / growth(r, n);
}
/** The interest in period per: the balance at its start, times r; with payments at the start, none in the first. */
function interest(r: number, per: number, n: number, pv: number, fv: number, t: number): number {
  const p = payment(r, n, pv, fv, t);
  if (t === 1 && per === 1) return 0;
  const balance = t === 1 ? futureValue(r, per - 2, p, pv, 1) - p : futureValue(r, per - 1, p, pv, 0);
  return balance * r;
}

/** Newton's method from a guess, for irr and rate: null when it doesn't settle within the steps. */
function newton(f: (r: number) => number, df: (r: number) => number, guess: number, tol: number): number | null {
  let r = guess;
  for (let k = 0; k < 100; k++) {
    const d = df(r);
    if (!Number.isFinite(d) || d === 0) return null;
    const step = f(r) / d;
    let next = r - step;
    // Keep 1 + r positive: a step past −1 goes halfway there instead.
    if (next <= -1) next = (r - 1) / 2;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - r) <= tol * Math.max(1, Math.abs(next))) return next;
    r = next;
  }
  return null;
}

export const financeFns: Record<string, Impl> = {
  pmt: (r, n, pv, fv, t) => checked(payment(real(r, 'pmt', 'rate'), count(n, 'pmt', 'nper'), real(pv, 'pmt', 'pv'), optional(fv, 'pmt', 'fv'), type(t, 'pmt')), 'pmt'),
  pv: (r, n, pmt, fv, t) => checked(presentValue(real(r, 'pv', 'rate'), count(n, 'pv', 'nper'), real(pmt, 'pv', 'pmt'), optional(fv, 'pv', 'fv'), type(t, 'pv')), 'pv'),
  fv: (r, n, pmt, pv, t) => checked(futureValue(real(r, 'fv', 'rate'), count(n, 'fv', 'nper'), real(pmt, 'fv', 'pmt'), optional(pv, 'fv', 'pv'), type(t, 'fv')), 'fv'),
  nper: (rv, pmtv, pvv, fvv, tv) => {
    const [r, pmt, pv, fv, t] = [real(rv, 'nper', 'rate'), real(pmtv, 'nper', 'pmt'), real(pvv, 'nper', 'pv'), optional(fvv, 'nper', 'fv'), type(tv, 'nper')];
    if (r <= -1) throw new EvalError('runtime', "nper's rate must be greater than −1");
    if (r === 0) {
      if (pmt === 0) throw new EvalError('runtime', 'nper has no answer: with no interest and no payments, the value never changes');
      return checked(-(pv + fv) / pmt, 'nper');
    }
    const a = pmt * (1 + r * t);
    const ratio = (a - fv * r) / (a + pv * r);
    if (!(ratio > 0)) throw new EvalError('runtime', 'nper has no answer: these payments never reach the future value');
    return checked(Math.log(ratio) / Math.log1p(r), 'nper');
  },
  rate: (nv, pmtv, pvv, fvv, tv, gv) => {
    const [n, pmt, pv, fv, t] = [count(nv, 'rate', 'nper'), real(pmtv, 'rate', 'pmt'), real(pvv, 'rate', 'pv'), optional(fvv, 'rate', 'fv'), type(tv, 'rate')];
    const guess = gv === undefined ? 0.1 : real(gv, 'rate', 'guess');
    const f = (r: number): number => pv * growth(r, n) + pmt * (1 + r * t) * annuity(r, n) + fv;
    // The derivative, by a central difference scaled to r: the closed form loses digits near r = 0.
    const df = (r: number): number => {
      const h = 1e-6 * Math.max(1e-3, Math.abs(1 + r));
      return (f(r + h) - f(r - h)) / (2 * h);
    };
    const x = newton(f, df, guess, 1e-12);
    if (x === null || !(Math.abs(f(x)) <= 1e-9 * Math.max(Math.abs(pv), Math.abs(fv), Math.abs(pmt) * n, 1))) {
      throw new EvalError('runtime', 'rate found no rate near the guess: try another guess');
    }
    return checked(x, 'rate');
  },
  ipmt: (r, per, n, pv, fv, t) => {
    const [rr, nn] = [real(r, 'ipmt', 'rate'), count(n, 'ipmt', 'nper')];
    const p = count(per, 'ipmt', 'per');
    if (p > nn) throw new EvalError('runtime', "ipmt's per must be at most nper");
    return checked(interest(rr, p, nn, real(pv, 'ipmt', 'pv'), optional(fv, 'ipmt', 'fv'), type(t, 'ipmt')), 'ipmt');
  },
  ppmt: (r, per, n, pv, fv, t) => {
    const [rr, nn, pvv, fvv, tt] = [real(r, 'ppmt', 'rate'), count(n, 'ppmt', 'nper'), real(pv, 'ppmt', 'pv'), optional(fv, 'ppmt', 'fv'), type(t, 'ppmt')];
    const p = count(per, 'ppmt', 'per');
    if (p > nn) throw new EvalError('runtime', "ppmt's per must be at most nper");
    return checked(payment(rr, nn, pvv, fvv, tt) - interest(rr, p, nn, pvv, fvv, tt), 'ppmt');
  },
  cumint: (r, n, pv, s, e, t) => cumulative('cumint', r, n, pv, s, e, t, true),
  cumprn: (r, n, pv, s, e, t) => cumulative('cumprn', r, n, pv, s, e, t, false),
  eff: (r, k) => {
    const [rr, kk] = [real(r, 'eff', 'nrate'), count(k, 'eff', 'npery')];
    return checked(Math.expm1(kk * Math.log1p(rr / kk)), 'eff');
  },
  nom: (a, k) => {
    const [aa, kk] = [real(a, 'nom', 'apr'), real(k, 'nom', 'npery')];
    if (!(kk > 0)) throw new EvalError('runtime', "nom's npery must be above 0");
    return checked(kk * Math.expm1(Math.log1p(aa) / kk), 'nom');
  },
  npv: (r, cash) => {
    const rr = real(r, 'npv', 'rate');
    // By Horner's rule in the discount 1/(1 + r), from the last flow back: npv(0.1, (−100, 110)) is exactly 0, as in Mathcad.
    const v = 1 / (1 + rr);
    return checked(column(cash, 'npv', 'cash').reduceRight((sum, c) => (sum + c) * v, 0), 'npv');
  },
  irr: (cash, g) => {
    const c = column(cash, 'irr', 'cash');
    if (!(c.some((x) => x > 0) && c.some((x) => x < 0))) throw new EvalError('runtime', "irr's cash must have at least one positive and one negative value");
    const guess = g === undefined ? 0.1 : real(g, 'irr', 'guess');
    // In terms of the discount v = 1/(1 + r), the present value is a polynomial: Σ c_i·v^i.
    const f = (r: number): number => c.reduce((s, x, i) => s + x / growth(r, i), 0);
    const df = (r: number): number => c.reduce((s, x, i) => s - (i * x) / growth(r, i + 1), 0);
    const x = newton(f, df, guess, 1e-12);
    const scale = c.reduce((s, x2) => s + Math.abs(x2), 0);
    if (x === null || !(Math.abs(f(x)) <= 1e-9 * scale)) throw new EvalError('runtime', 'irr found no rate near the guess: try another guess');
    return checked(x, 'irr');
  },
  mirr: (cash, fr, rr) => {
    const c = column(cash, 'mirr', 'cash');
    const [fin, rein] = [real(fr, 'mirr', 'fin_rate'), real(rr, 'mirr', 'rein_rate')];
    if (!(c.some((x) => x > 0) && c.some((x) => x < 0))) throw new EvalError('runtime', "mirr's cash must have at least one positive and one negative value");
    const n = c.length;
    // Income carried forward at the reinvestment rate, outlays brought back at the finance rate.
    const income = c.reduce((s, x, i) => s + (x > 0 ? x * growth(rein, n - 1 - i) : 0), 0);
    const outlay = c.reduce((s, x, i) => s + (x < 0 ? x / growth(fin, i) : 0), 0);
    return checked((-income / outlay) ** (1 / (n - 1)) - 1, 'mirr');
  },
  cnper: (r, pv, fv) => {
    const [rr, p, f] = [real(r, 'cnper', 'rate'), real(pv, 'cnper', 'pv'), real(fv, 'cnper', 'fv')];
    if (!(p > 0) || !(f > 0)) throw new EvalError('runtime', "cnper's pv and fv must be positive");
    if (rr === 0) throw new EvalError('runtime', 'cnper has no answer at a rate of 0: the value never grows');
    return checked(Math.log(f / p) / Math.log1p(rr), 'cnper');
  },
  crate: (n, pv, fv) => {
    const [nn, p, f] = [count(n, 'crate', 'nper'), real(pv, 'crate', 'pv'), real(fv, 'crate', 'fv')];
    if (!(p > 0) || !(f > 0)) throw new EvalError('runtime', "crate's pv and fv must be positive");
    return checked((f / p) ** (1 / nn) - 1, 'crate');
  },
  fvadj: (prin, sched) => {
    const p = real(prin, 'fvadj', 'prin');
    return checked(column(sched, 'fvadj', 'sched').reduce((v, r) => v * (1 + r), p), 'fvadj');
  },
  fvc: (r, cash) => {
    const rr = real(r, 'fvc', 'rate');
    const c = column(cash, 'fvc', 'cash');
    return checked(c.reduce((s, x, i) => s + x * growth(rr, c.length - 1 - i), 0), 'fvc');
  },
};

/** cumint and cumprn: the interest, or the principal, paid from period start to period end. */
function cumulative(fn: string, r: Value | undefined, n: Value | undefined, pv: Value | undefined, s: Value | undefined, e: Value | undefined, t: Value | undefined, interestPart: boolean): Value {
  const [rr, nn, pvv, tt] = [real(r, fn, 'rate'), count(n, fn, 'nper'), real(pv, fn, 'pv'), type(t, fn)];
  const [start, end] = [count(s, fn, 'start'), count(e, fn, 'end')];
  if (start > end || end > nn) throw new EvalError('runtime', `${fn}'s periods must run from start to end with start ≤ end ≤ nper`);
  const p = payment(rr, nn, pvv, 0, tt);
  let sum = 0;
  for (let per = start; per <= end; per++) {
    const i = interest(rr, per, nn, pvv, 0, tt);
    sum += interestPart ? i : p - i;
  }
  return checked(sum, fn);
}
