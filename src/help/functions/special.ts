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

export const SPECIAL: Entry[] = [
  {
    name: 'Γ', group: 'Special functions', usage: 'Γ(z) or Γ(a, x)', mathcad: true,
    summary: 'Euler\'s gamma function of z; with two arguments, the upper incomplete gamma function.',
    details: [
      'Γ(n + 1) = n! for a whole number n, and z can be complex. Γ(a, x) is the integral of t^(a−1)·e^(−t) from x to infinity, not divided by Γ(a): Γ(a, 0) = Γ(a). Type Γ as G then Ctrl+G. For large values, [[lnΓ]] gives the logarithm.',
    ],
    errors: ['0 or a negative whole number, where Γ is infinite.', 'Γ(a, x) with a or x below 0, or a = 0.', 'A z over about 171.6, where Γ(z) passes 10³⁰⁷.'],
    example: ['\\Gamma\\left(5\\right)=', '\\Gamma\\left(0.5\\right)=', '\\Gamma\\left(2,1\\right)='],
  },
  {
    name: 'lnΓ', group: 'Special functions', usage: 'lnΓ(z)', mathcad: true,
    summary: 'The natural logarithm of the gamma function, for when Γ(z) itself is too large.',
    details: [
      'It\'s the analytic log-gamma, as Mathcad\'s: continuous for complex z, so lnΓ(−0.5) is 1.2655 − iπ, not ln of Γ(−0.5). Mathcad 14 overflows at lnΓ(1e5); MathMath gives the value.',
    ],
    errors: ['0 or a negative whole number.'],
    example: ['\\mathrm{lnΓ}\\left(100\\right)=', '\\mathrm{lnΓ}\\left(-0.5\\right)='],
  },
  {
    name: 'Her', group: 'Special functions', usage: 'Her(n, x)', mathcad: true,
    summary: 'The Hermite polynomial of degree n at x, the physicists\' kind: Her(2, x) = 4x² − 2.',
    details: [
      'Worked out by its three-term recurrence, which keeps its digits at high degrees. See also [[Jac]].',
    ],
    errors: ['A degree that isn\'t a whole number, 0 or more.'],
    example: ['\\mathrm{Her}\\left(2,1\\right)='],
  },
  {
    name: 'Tcheb', group: 'Special functions', usage: 'Tcheb(n, x)', mathcad: true,
    summary: 'The Chebyshev polynomial of the first kind, of degree n, at x: Tcheb(n, cos θ) = cos(nθ).',
    details: [
      'Worked out by its three-term recurrence, which keeps its digits at high degrees. See also [[Jac]].',
    ],
    errors: ['A degree that isn\'t a whole number, 0 or more.'],
    example: ['\\mathrm{Tcheb}\\left(3,0.5\\right)='],
  },
  {
    name: 'Ucheb', group: 'Special functions', usage: 'Ucheb(n, x)', mathcad: true,
    summary: 'The Chebyshev polynomial of the second kind, of degree n, at x.',
    details: [
      'Worked out by its three-term recurrence, which keeps its digits at high degrees. See also [[Jac]].',
    ],
    errors: ['A degree that isn\'t a whole number, 0 or more.'],
    example: ['\\mathrm{Ucheb}\\left(3,0.5\\right)='],
  },
  {
    name: 'Lag', group: 'Special functions', usage: 'Lag(n, x)', mathcad: true,
    summary: 'The Laguerre polynomial of degree n at x: Lag(1, x) = 1 − x.',
    details: [
      'Worked out by its three-term recurrence, which keeps its digits at high degrees. See also [[Jac]].',
    ],
    errors: ['A degree that isn\'t a whole number, 0 or more.'],
    example: ['\\mathrm{Lag}\\left(3,1.5\\right)='],
  },
  {
    name: 'Leg', group: 'Special functions', usage: 'Leg(n, x)', mathcad: true,
    summary: 'The Legendre polynomial of degree n at x: Leg(2, x) = (3x² − 1)/2.',
    details: [
      'Worked out by its three-term recurrence, which keeps its digits at high degrees. See also [[Jac]].',
    ],
    errors: ['A degree that isn\'t a whole number, 0 or more.'],
    example: ['\\mathrm{Leg}\\left(3,0.5\\right)='],
  },
  {
    name: 'Jac', group: 'Special functions', usage: 'Jac(n, a, b, x)', mathcad: true,
    summary: 'The Jacobi polynomial of degree n with parameters a and b, at x.',
    details: [
      'Jac(n, 0, 0, x) is the Legendre polynomial [[Leg]]. a and b must be more than −1.',
    ],
    errors: ['A degree that isn\'t a whole number, 0 or more.', 'An a or b of −1 or less.'],
    example: ['\\mathrm{Jac}\\left(3,0.5,1.5,0.3\\right)=', '\\mathrm{Jac}\\left(2,0,0,0.5\\right)='],
  },
  {
    name: 'fhyper', group: 'Special functions', usage: 'fhyper(a, b, c, x)', mathcad: true,
    summary: 'The Gauss hypergeometric function ₂F₁(a, b; c; x), for x between −1 and 1.',
    details: [
      'Many functions are special cases: ln(1 + x) = x·fhyper(1, 1, 2, −x), and asin(x) = x·fhyper(0.5, 0.5, 1.5, x²). See also [[mhyper]].',
    ],
    errors: ['x of 1 or more, or −1 or less.', 'c a negative whole number or 0, unless the series stops before it.', 'Values where the series would cancel and lose its digits, as fhyper(30, 30, 1, −0.4).'],
    example: ['\\mathrm{fhyper}\\left(1,1,2,-0.5\\right)=', '\\mathrm{fhyper}\\left(0.5,0.5,1.5,0.25\\right)='],
  },
  {
    name: 'mhyper', group: 'Special functions', usage: 'mhyper(a, b, x)', mathcad: true,
    summary: 'The confluent hypergeometric function ₁F₁(a; b; x), also written M(a, b, x).',
    details: [
      'exp(x) = mhyper(1, 1, x). For negative x it uses Kummer\'s transformation, which keeps the digits a plain series loses; Mathcad 14 gives mhyper(0.5, 1, 100) as 0, where it is 1.52·10⁴².',
    ],
    errors: ['b a negative whole number or 0.', 'Values where the series would cancel and lose its digits, as mhyper(−50.5, 1, 30).'],
    example: ['\\mathrm{mhyper}\\left(1,1,1\\right)=', '\\mathrm{mhyper}\\left(1,2,-50\\right)='],
  },
  {
    name: 'ibeta', group: 'Special functions', usage: 'ibeta(a, x, y)', mathcad: true,
    summary: 'The regularized incomplete beta function: the integral of t^(x−1)·(1 − t)^(y−1) from 0 to a, over the whole beta function.',
    details: [
      'a runs from 0 to 1, and ibeta(1, x, y) = 1. It gives the cumulative probabilities of the beta, binomial and Student\'s t distributions.',
    ],
    errors: ['An a outside 0 to 1.', 'An x or y of 0 or less.'],
    example: ['\\mathrm{ibeta}\\left(0.3,2,3\\right)=', '\\mathrm{ibeta}\\left(0.5,2,2\\right)='],
  },
  {
    name: 'sinc', group: 'Special functions', usage: 'sinc(z)', mathcad: true,
    summary: 'sin(z)/z, with the right value, 1, at z = 0.',
    details: [
      'z can be complex.',
    ],
    example: ['\\mathrm{sinc}\\left(0\\right)=', '\\mathrm{sinc}\\left(\\pi\\right)='],
  },
  {
    name: 'ε', group: 'Special functions', usage: 'ε(i, j, k)', mathcad: true,
    summary: 'The antisymmetric tensor of rank 3: 1 for an even arrangement of i, j, k, −1 for an odd one, and 0 if two are the same.',
    details: [
      'i, j and k run from ORIGIN to ORIGIN + 2. Type ε as e then Ctrl+G. A worksheet\'s own ε, such as an eccentricity, takes its place.',
    ],
    errors: ['An index that isn\'t a whole number, or outside ORIGIN to ORIGIN + 2.'],
    example: ['\\varepsilon\\left(0,1,2\\right)=', '\\varepsilon\\left(1,0,2\\right)=', '\\varepsilon\\left(0,0,1\\right)='],
  },
  {
    name: 'ln0', group: 'Special functions', usage: 'ln0(z)', mathcad: true,
    summary: 'The natural logarithm of z, but −10³⁰⁷ at z = 0 instead of an error.',
    details: [
      'For a solve block or optimization, where z can reach 0 on the way to the answer. See [[ln]].',
    ],
    example: ['\\mathrm{ln0}\\left(0\\right)=', '\\mathrm{ln0}\\left(2\\right)='],
  },
  {
    name: 'J0', also: ['J0.sc'], group: 'Special functions', usage: 'J0(x)', mathcad: true,
    summary: 'The Bessel function of the first kind, order 0.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'J0.sc, typed J0 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{J0}\\left(0\\right)=', '\\mathrm{J0}\\left(2.5\\right)='],
  },
  {
    name: 'J1', also: ['J1.sc'], group: 'Special functions', usage: 'J1(x)', mathcad: true,
    summary: 'The Bessel function of the first kind, order 1.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'J1.sc, typed J1 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{J1}\\left(1\\right)='],
  },
  {
    name: 'Jn', also: ['Jn.sc'], group: 'Special functions', usage: 'Jn(m, x)', mathcad: true,
    summary: 'The Bessel function of the first kind, of order m.',
    details: [
      'm can be any real number, fractional or negative. At a negative x, a fractional order gives a complex answer, as it should; Mathcad 14 keeps only its real part there. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'Jn.sc, typed Jn then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{Jn}\\left(2,3\\right)=', '\\mathrm{Jn}\\left(0.5,3\\right)='],
  },
  {
    name: 'Y0', also: ['Y0.sc'], group: 'Special functions', usage: 'Y0(x)', mathcad: true,
    summary: 'The Bessel function of the second kind, order 0.',
    details: [
      'Infinite at 0; complex for a negative x. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'Y0.sc, typed Y0 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{Y0}\\left(1\\right)='],
  },
  {
    name: 'Y1', also: ['Y1.sc'], group: 'Special functions', usage: 'Y1(x)', mathcad: true,
    summary: 'The Bessel function of the second kind, order 1.',
    details: [
      'Infinite at 0; complex for a negative x, where Mathcad 14 gives NaN. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'Y1.sc, typed Y1 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{Y1}\\left(1\\right)='],
  },
  {
    name: 'Yn', also: ['Yn.sc'], group: 'Special functions', usage: 'Yn(m, x)', mathcad: true,
    summary: 'The Bessel function of the second kind, of order m.',
    details: [
      'm can be any real number. At a negative x, a fractional order gives a complex answer, as it should; Mathcad 14 keeps only its real part there. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'Yn.sc, typed Yn then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{Yn}\\left(2,3\\right)='],
  },
  {
    name: 'I0', also: ['I0.sc'], group: 'Special functions', usage: 'I0(x)', mathcad: true,
    summary: 'The modified Bessel function of the first kind, order 0.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'I0.sc, typed I0 then . then sc, is the scaled form: multiplied by e^(−|x|). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{I0}\\left(1\\right)=', '\\mathrm{I0}_{\\text{sc}}\\left(1000\\right)='],
  },
  {
    name: 'I1', also: ['I1.sc'], group: 'Special functions', usage: 'I1(x)', mathcad: true,
    summary: 'The modified Bessel function of the first kind, order 1.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'I1.sc, typed I1 then . then sc, is the scaled form: multiplied by e^(−|x|). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{I1}\\left(1\\right)='],
  },
  {
    name: 'In', also: ['In.sc'], group: 'Special functions', usage: 'In(m, x)', mathcad: true,
    summary: 'The modified Bessel function of the first kind, of order m.',
    details: [
      'm can be any real number. At a negative x, a fractional order gives a complex answer, as it should; Mathcad 14 keeps only its real part there. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'In.sc, typed In then . then sc, is the scaled form: multiplied by e^(−|x|). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{In}\\left(2,3\\right)='],
  },
  {
    name: 'K0', also: ['K0.sc'], group: 'Special functions', usage: 'K0(x)', mathcad: true,
    summary: 'The modified Bessel function of the second kind, order 0.',
    details: [
      'Infinite at 0. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'K0.sc, typed K0 then . then sc, is the scaled form: multiplied by e^x. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{K0}\\left(1\\right)='],
  },
  {
    name: 'K1', also: ['K1.sc'], group: 'Special functions', usage: 'K1(x)', mathcad: true,
    summary: 'The modified Bessel function of the second kind, order 1.',
    details: [
      'Infinite at 0. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'K1.sc, typed K1 then . then sc, is the scaled form: multiplied by e^x. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{K1}\\left(1\\right)='],
  },
  {
    name: 'Kn', also: ['Kn.sc'], group: 'Special functions', usage: 'Kn(m, x)', mathcad: true,
    summary: 'The modified Bessel function of the second kind, of order m.',
    details: [
      'm can be any real number; K of −m is K of m. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'Kn.sc, typed Kn then . then sc, is the scaled form: multiplied by e^x. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{Kn}\\left(2,3\\right)='],
  },
  {
    name: 'H1', also: ['H1.sc'], group: 'Special functions', usage: 'H1(m, x)', mathcad: true,
    summary: 'The Hankel function of the first kind, J + iY, of order m.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'H1.sc, typed H1 then . then sc, is the scaled form: multiplied by e^(−ix). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{H1}\\left(0,1\\right)='],
  },
  {
    name: 'H2', also: ['H2.sc'], group: 'Special functions', usage: 'H2(m, x)', mathcad: true,
    summary: 'The Hankel function of the second kind, J − iY, of order m.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'H2.sc, typed H2 then . then sc, is the scaled form: multiplied by e^(ix). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{H2}\\left(0,1\\right)='],
  },
  {
    name: 'Ai', also: ['Ai.sc'], group: 'Special functions', usage: 'Ai(x)', mathcad: true,
    summary: 'The Airy function of the first kind.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'Ai.sc, typed Ai then . then sc, is the scaled form: for x ≥ 0, multiplied by e^(2/3·x^(3/2)); for x < 0, by cos(2/3·|x|^(3/2)), as Mathcad\'s Help gives it. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{Ai}\\left(0\\right)=', '\\mathrm{Ai}\\left(-2\\right)='],
  },
  {
    name: 'Bi', also: ['Bi.sc'], group: 'Special functions', usage: 'Bi(x)', mathcad: true,
    summary: 'The Airy function of the second kind.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'Bi.sc, typed Bi then . then sc, is the scaled form: for x ≥ 0, multiplied by e^(−2/3·x^(3/2)); for x < 0 it is Bi itself. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{Bi}\\left(0\\right)=', '\\mathrm{Bi}\\left(1\\right)='],
  },
  {
    name: 'DAi', also: ['DAi.sc'], group: 'Special functions', usage: 'DAi(x)', mathcad: true,
    summary: 'The derivative of the Airy function Ai.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'DAi.sc, typed DAi then . then sc, is the scaled form: scaled as Ai.sc is. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{DAi}\\left(0\\right)='],
  },
  {
    name: 'DBi', also: ['DBi.sc'], group: 'Special functions', usage: 'DBi(x)', mathcad: true,
    summary: 'The derivative of the Airy function Bi.',
    details: [
      'Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
      'DBi.sc, typed DBi then . then sc, is the scaled form: scaled as Bi.sc is. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{DBi}\\left(0\\right)='],
  },
  {
    name: 'ber', group: 'Special functions', usage: 'ber(m, x)', mathcad: true,
    summary: 'The Kelvin function ber of order m: the real part of J_m(x·e^(3πi/4)).',
    details: [
      'm is a whole number, 0 or more, and x is real. See also [[bei]].',
    ],
    errors: ['An order that isn\'t a whole number, 0 or more.'],
    example: ['\\mathrm{ber}\\left(0,1\\right)=', '\\mathrm{ber}\\left(1,5\\right)='],
  },
  {
    name: 'bei', group: 'Special functions', usage: 'bei(m, x)', mathcad: true,
    summary: 'The Kelvin function bei of order m: the imaginary part of J_m(x·e^(3πi/4)).',
    details: [
      'm is a whole number, 0 or more, and x is real. See also [[ber]].',
    ],
    errors: ['An order that isn\'t a whole number, 0 or more.'],
    example: ['\\mathrm{bei}\\left(0,1\\right)=', '\\mathrm{bei}\\left(1,5\\right)='],
  },
  {
    name: 'js', group: 'Special functions', usage: 'js(m, x)', mathcad: true,
    summary: 'The spherical Bessel function of the first kind, of order m: √(π/(2x))·J of order m + ½.',
    details: [
      'js(0, x) = sin(x)/x. At a negative x a whole order gives the true values, js(m, −x) = (−1)^m·js(m, x), where Mathcad 14 gives 0. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
    ],
    errors: ['A complex argument, for now.'],
    example: ['\\mathrm{js}\\left(0,1\\right)=', '\\mathrm{js}\\left(1,2\\right)='],
  },
  {
    name: 'ys', group: 'Special functions', usage: 'ys(m, x)', mathcad: true,
    summary: 'The spherical Bessel function of the second kind, of order m: √(π/(2x))·Y of order m + ½.',
    details: [
      'ys(0, x) = −cos(x)/x. Infinite at 0. At a negative x a whole order gives the true values, where Mathcad 14 gives the opposite sign. Takes a real x for now: Mathcad also takes complex arguments, which MathMath doesn\'t yet.',
    ],
    errors: ['0, where it is infinite.', 'A complex argument, for now.'],
    example: ['\\mathrm{ys}\\left(0,1\\right)='],
  },
];
