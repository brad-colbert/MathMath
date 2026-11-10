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

import type { Entry } from '../types.js';

const F = 'Finance';
const SIGNS = 'Money paid out is negative and money received positive, as in a spreadsheet: a loan of 200 000 received now is a pv of 200000, and its payments come back negative.';
const TYPE = 'type is 0, the default, for payments at the end of each period, or 1 for the start.';
const UNITLESS = 'The arguments have no units. A rate can be written as a percentage: 8.25% is 0.0825.';
const RATE = 'rate is the interest rate for one period: for monthly payments on a yearly rate, divide it by 12.';
const COUNT = (n: string) => `${n} must be a positive whole number.`;
const col = (xs: number[]) => `\\begin{pmatrix}${xs.join('\\\\')}\\end{pmatrix}`;

export const FINANCE: Entry[] = [
  {
    name: 'pmt', group: F, usage: 'pmt(rate, nper, pv, [fv], [type])', mathcad: true,
    summary: 'The payment each period that pays off pv, leaving fv, over nper periods at a fixed rate.',
    details: [RATE, SIGNS, 'fv, the balance left at the end, is 0 unless given. ' + TYPE, UNITLESS],
    errors: [COUNT('nper'), 'A type other than 0 or 1.'],
    example: ['\\mathrm{pmt}\\left(\\frac{8\\%}{12},360,200000\\right)=', '\\mathrm{pmt}\\left(\\frac{8\\%}{12},360,200000,0,1\\right)='],
  },
  {
    name: 'pv', group: F, usage: 'pv(rate, nper, pmt, [fv], [type])', mathcad: true,
    summary: 'The present value of nper payments of pmt, and of fv at the end, at a fixed rate.',
    details: [RATE, SIGNS, TYPE, UNITLESS],
    errors: [COUNT('nper'), 'A type other than 0 or 1.'],
    example: ['\\mathrm{pv}\\left(0.05,10,-100\\right)=', '\\mathrm{pv}\\left(0.05,10,-100,-1000\\right)='],
  },
  {
    name: 'fv', group: F, usage: 'fv(rate, nper, pmt, [pv], [type])', mathcad: true,
    summary: 'The future value of nper payments of pmt, and of pv at the start, at a fixed rate.',
    details: [RATE, SIGNS, 'pv is 0 unless given. At a rate of 0, fv is −(pv + nper·pmt); Mathcad 14 leaves out pv there, so fv(0, 10, −100, −50) is 1000 in it and 1050 in MathMath. ' + TYPE, UNITLESS],
    errors: [COUNT('nper'), 'A type other than 0 or 1.'],
    example: ['\\mathrm{fv}\\left(0.05,10,-100\\right)=', '\\mathrm{fv}\\left(0.05,10,-100,-1000,1\\right)='],
  },
  {
    name: 'nper', group: F, usage: 'nper(rate, pmt, pv, [fv], [type])', mathcad: true,
    summary: 'The number of periods that payments of pmt take to bring pv to fv, at a fixed rate.',
    details: [RATE, SIGNS, 'The answer is usually fractional: the last payment is a part one. At a rate of 0 it is −(pv + fv)/pmt; Mathcad 14 turns fv\'s sign there, so nper(0, −100, 1000, −200) is 12 in it and 8 in MathMath. ' + TYPE, UNITLESS],
    errors: ['A rate of −1 or less.', 'Payments that never reach fv, as 5 a period against 1% of 1000.', 'A type other than 0 or 1.'],
    example: ['\\mathrm{nper}\\left(0.01,-100,1000\\right)=', '\\mathrm{nper}\\left(0.01,-100,1000,-200\\right)='],
  },
  {
    name: 'rate', group: F, usage: 'rate(nper, pmt, pv, [fv], [type], [guess])', mathcad: true,
    summary: 'The interest rate per period at which nper payments of pmt bring pv to fv.',
    details: [SIGNS, 'rate solves from the guess, 0.1 unless given, to about 1e−9, as Mathcad\'s does, not to TOL. ' + TYPE, UNITLESS],
    errors: [COUNT('nper'), '"No rate near the guess": try another guess.', 'A type other than 0 or 1.'],
    example: ['\\mathrm{rate}\\left(36,-300,10000\\right)=', '12\\cdot \\mathrm{rate}\\left(36,-300,10000\\right)='],
  },
  {
    name: 'ipmt', group: F, usage: 'ipmt(rate, per, nper, pv, [fv], [type])', mathcad: true,
    summary: 'The interest part of the payment in period per, of nper, on a loan or investment.',
    details: [RATE, 'per counts from 1. ' + SIGNS, TYPE + ' With payments at the start, the first one carries no interest.', 'The rest of each payment is [[ppmt]]; [[cumint]] adds the interest over several periods.'],
    errors: ['A per or nper that isn\'t a positive whole number, or a per after nper.', 'A type other than 0 or 1.'],
    example: ['\\mathrm{ipmt}\\left(0.01,1,12,1000\\right)=', '\\mathrm{ipmt}\\left(0.01,12,12,1000\\right)='],
  },
  {
    name: 'ppmt', group: F, usage: 'ppmt(rate, per, nper, pv, [fv], [type])', mathcad: true,
    summary: 'The principal part of the payment in period per, of nper, on a loan or investment.',
    details: [RATE, 'per counts from 1. ppmt + ipmt is the whole payment, [[pmt]]. ' + SIGNS, TYPE],
    errors: ['A per or nper that isn\'t a positive whole number, or a per after nper.', 'A type other than 0 or 1.'],
    example: ['\\mathrm{ppmt}\\left(0.01,1,12,1000\\right)=', '\\mathrm{ppmt}\\left(0.01,1,12,1000\\right)+\\mathrm{ipmt}\\left(0.01,1,12,1000\\right)='],
  },
  {
    name: 'cumint', group: F, usage: 'cumint(rate, nper, pv, start, end, [type])', mathcad: true,
    summary: 'The interest paid on a loan from period start to period end, both included.',
    details: [RATE, 'The periods count from 1, with start ≤ end ≤ nper. The loan is paid off by the end: fv is 0. ' + SIGNS, TYPE, 'The principal over the same periods is [[cumprn]].'],
    errors: ['A start or end that isn\'t a positive whole number, start after end, or end after nper.', 'A type other than 0 or 1.'],
    example: ['\\mathrm{cumint}\\left(0.01,12,1000,1,12\\right)=', '\\mathrm{cumint}\\left(0.01,12,1000,3,5\\right)='],
  },
  {
    name: 'cumprn', group: F, usage: 'cumprn(rate, nper, pv, start, end, [type])', mathcad: true,
    summary: 'The principal paid on a loan from period start to period end, both included.',
    details: [RATE, 'The periods count from 1, with start ≤ end ≤ nper; over all of them it is −pv. ' + SIGNS, TYPE],
    errors: ['A start or end that isn\'t a positive whole number, start after end, or end after nper.', 'A type other than 0 or 1.'],
    example: ['\\mathrm{cumprn}\\left(0.01,12,1000,1,12\\right)=', '\\mathrm{cumprn}\\left(0.01,12,1000,3,5\\right)='],
  },
  {
    name: 'eff', group: F, usage: 'eff(nrate, npery)', mathcad: true,
    summary: 'The effective yearly rate, the APR, of a nominal yearly rate compounded npery times a year.',
    details: ['(1 + nrate/npery)^npery − 1. [[nom]] goes back. ' + UNITLESS],
    errors: [COUNT('npery')],
    example: ['\\mathrm{eff}\\left(8\\%,12\\right)=', '\\mathrm{eff}\\left(8\\%,1\\right)='],
  },
  {
    name: 'nom', group: F, usage: 'nom(apr, npery)', mathcad: true,
    summary: 'The nominal yearly rate that, compounded npery times a year, gives the effective rate apr.',
    details: ['npery·((1 + apr)^(1/npery) − 1). npery needn\'t be whole, as in Mathcad. [[eff]] goes back. ' + UNITLESS],
    errors: ['An npery of 0 or less.'],
    example: ['\\mathrm{nom}\\left(0.083,12\\right)=', '\\mathrm{nom}\\left(\\mathrm{eff}\\left(0.08,12\\right),12\\right)='],
  },
  {
    name: 'npv', group: F, usage: 'npv(rate, cash)', mathcad: true,
    summary: 'The net present value of the cash flows in cash, one a period, at the discount rate.',
    details: ['Each flow is at the end of its period, so the first is discounted once, as in Mathcad: npv(0.1, (−100, 110)) is 0. To count a flow now, add it outside npv. cash is a column vector; payments are negative, income positive. ' + UNITLESS],
    errors: ['cash as a row, or with units.'],
    example: [`\\mathrm{npv}\\left(0.1,${col([-100, 110])}\\right)=`, `\\mathrm{npv}\\left(0.1,${col([1, 2, 3])}\\right)=`],
  },
  {
    name: 'irr', group: F, usage: 'irr(cash, [guess])', mathcad: true,
    summary: 'The internal rate of return of the cash flows in cash: the rate at which their [[npv]] is 0.',
    details: ['irr solves from the guess, 0.1 unless given. A flow whose sign changes more than once can have several rates, and irr gives the one it reaches from the guess: (−100, 230, −132) gives 10% from 0.1 and 20% from 0.25. cash is a column vector. ' + UNITLESS, 'irr((−1000, 100)) is −90%, which MathMath finds; Mathcad 14 was still calculating it after a minute.'],
    errors: ['cash without both a payment and an income.', '"No rate near the guess": try another guess.'],
    example: [`\\mathrm{irr}\\left(${col([-100, 30, 40, 50])}\\right)=`, `\\mathrm{irr}\\left(${col([-100, 230, -132])},0.25\\right)=`],
  },
  {
    name: 'mirr', group: F, usage: 'mirr(cash, fin_rate, rein_rate)', mathcad: true,
    summary: 'The modified internal rate of return: payments financed at fin_rate, income reinvested at rein_rate.',
    details: ['The income is carried to the end at rein_rate and the payments brought to the start at fin_rate; mirr is the rate that grows one into the other over the periods. cash is a column vector. ' + UNITLESS],
    errors: ['cash without both a payment and an income.'],
    example: [`\\mathrm{mirr}\\left(${col([-100, 30, 40, 50])},0.1,0.12\\right)=`],
  },
  {
    name: 'cnper', group: F, usage: 'cnper(rate, pv, fv)', mathcad: true,
    summary: 'The number of periods for pv to grow to fv at a fixed compound rate.',
    details: ['ln(fv/pv)/ln(1 + rate), with no payments in between. pv and fv are both positive here. ' + UNITLESS],
    errors: ['A pv or fv of 0 or less.', 'A rate of 0.'],
    example: ['\\mathrm{cnper}\\left(0.05,100,200\\right)='],
  },
  {
    name: 'crate', group: F, usage: 'crate(nper, pv, fv)', mathcad: true,
    summary: 'The fixed compound rate per period at which pv grows to fv in nper periods.',
    details: ['(fv/pv)^(1/nper) − 1. pv and fv are both positive here. ' + UNITLESS],
    errors: [COUNT('nper'), 'A pv or fv of 0 or less.'],
    example: ['\\mathrm{crate}\\left(10,100,200\\right)='],
  },
  {
    name: 'fvadj', group: F, usage: 'fvadj(prin, sched)', mathcad: true,
    summary: 'The future value of prin after a schedule of interest rates, one for each period.',
    details: ['prin·(1 + r₁)(1 + r₂)…, for the rates in the column vector sched. ' + UNITLESS],
    errors: ['sched as a row, or with units.'],
    example: [`\\mathrm{fvadj}\\left(1000,${col([0.05, 0.06, 0.07])}\\right)=`],
  },
  {
    name: 'fvc', group: F, usage: 'fvc(rate, cash)', mathcad: true,
    summary: 'The future value, at the last of them, of cash flows one a period, earning a fixed rate.',
    details: ['Each flow earns interest until the last, which earns none. cash is a column vector. ' + UNITLESS],
    errors: ['cash as a row, or with units.'],
    example: [`\\mathrm{fvc}\\left(0.05,${col([100, 100, 100])}\\right)=`],
  },
];
