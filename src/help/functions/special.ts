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
      'It\'s the analytic log-gamma: continuous for complex z, so lnΓ(−0.5) is 1.2655 − iπ, not ln of Γ(−0.5). The reference overflows at lnΓ(1e5); MathMath gives the value.',
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
      'exp(x) = mhyper(1, 1, x). For negative x it uses Kummer\'s transformation, which keeps the digits a plain series loses; the reference gives mhyper(0.5, 1, 100) as 0, where it is 1.52·10⁴².',
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
      'x can be complex.',
      'J0.sc, typed J0 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as J0(800i): its .sc form stays in range.'],
    example: ['\\mathrm{J0}\\left(0\\right)=', '\\mathrm{J0}\\left(2.5\\right)='],
  },
  {
    name: 'J1', also: ['J1.sc'], group: 'Special functions', usage: 'J1(x)', mathcad: true,
    summary: 'The Bessel function of the first kind, order 1.',
    details: [
      'x can be complex.',
      'J1.sc, typed J1 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as J1(800i): its .sc form stays in range.'],
    example: ['\\mathrm{J1}\\left(1\\right)='],
  },
  {
    name: 'Jn', also: ['Jn.sc'], group: 'Special functions', usage: 'Jn(m, x)', mathcad: true,
    summary: 'The Bessel function of the first kind, of order m.',
    details: [
      'm can be any real number, fractional or negative. At a negative x, a fractional order gives a complex answer, as it should; the reference keeps only its real part there. x can be complex.',
      'Jn.sc, typed Jn then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow. A negative order works here too, where the reference calls it undefined.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as Jn(2, 800i): its .sc form stays in range.', 'A complex order: the order must be real.'],
    example: ['\\mathrm{Jn}\\left(2,3\\right)=', '\\mathrm{Jn}\\left(0.5,3\\right)='],
  },
  {
    name: 'Y0', also: ['Y0.sc'], group: 'Special functions', usage: 'Y0(x)', mathcad: true,
    summary: 'The Bessel function of the second kind, order 0.',
    details: [
      'Infinite at 0; complex for a negative x. x can be complex.',
      'Y0.sc, typed Y0 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as Y0(800i): its .sc form stays in range.'],
    example: ['\\mathrm{Y0}\\left(1\\right)='],
  },
  {
    name: 'Y1', also: ['Y1.sc'], group: 'Special functions', usage: 'Y1(x)', mathcad: true,
    summary: 'The Bessel function of the second kind, order 1.',
    details: [
      'Infinite at 0; complex for a negative x, where the reference gives NaN. x can be complex.',
      'Y1.sc, typed Y1 then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as Y1(800i): its .sc form stays in range.'],
    example: ['\\mathrm{Y1}\\left(1\\right)='],
  },
  {
    name: 'Yn', also: ['Yn.sc'], group: 'Special functions', usage: 'Yn(m, x)', mathcad: true,
    summary: 'The Bessel function of the second kind, of order m.',
    details: [
      'm can be any real number. At a negative x, a fractional order gives a complex answer, as it should; the reference keeps only its real part there. x can be complex.',
      'Yn.sc, typed Yn then . then sc, is the scaled form: multiplied by e^(−|Im z|), which for a real x leaves it unchanged. It stays in range where the plain function would overflow or underflow. A negative order works here too, where the reference calls it undefined.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as Yn(2, 800i): its .sc form stays in range.', 'A complex order: the order must be real.'],
    example: ['\\mathrm{Yn}\\left(2,3\\right)='],
  },
  {
    name: 'I0', also: ['I0.sc'], group: 'Special functions', usage: 'I0(x)', mathcad: true,
    summary: 'The modified Bessel function of the first kind, order 0.',
    details: [
      'x can be complex.',
      'I0.sc, typed I0 then . then sc, is the scaled form: multiplied by e^(−|Re z|), which for a real x is e^(−|x|). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as I0(800 + i): its .sc form stays in range.'],
    example: ['\\mathrm{I0}\\left(1\\right)=', '\\mathrm{I0}_{\\text{sc}}\\left(1000\\right)='],
  },
  {
    name: 'I1', also: ['I1.sc'], group: 'Special functions', usage: 'I1(x)', mathcad: true,
    summary: 'The modified Bessel function of the first kind, order 1.',
    details: [
      'x can be complex.',
      'I1.sc, typed I1 then . then sc, is the scaled form: multiplied by e^(−|Re z|), which for a real x is e^(−|x|). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as I1(800 + i): its .sc form stays in range.'],
    example: ['\\mathrm{I1}\\left(1\\right)='],
  },
  {
    name: 'In', also: ['In.sc'], group: 'Special functions', usage: 'In(m, x)', mathcad: true,
    summary: 'The modified Bessel function of the first kind, of order m.',
    details: [
      'm can be any real number. At a negative x, a fractional order gives a complex answer, as it should; the reference keeps only its real part there. x can be complex.',
      'In.sc, typed In then . then sc, is the scaled form: multiplied by e^(−|Re z|), which for a real x is e^(−|x|). It stays in range where the plain function would overflow or underflow. A negative order works here too, where the reference calls it undefined.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as In(2, 800 + i): its .sc form stays in range.', 'A complex order: the order must be real.'],
    example: ['\\mathrm{In}\\left(2,3\\right)='],
  },
  {
    name: 'K0', also: ['K0.sc'], group: 'Special functions', usage: 'K0(x)', mathcad: true,
    summary: 'The modified Bessel function of the second kind, order 0.',
    details: [
      'Infinite at 0. x can be complex.',
      'K0.sc, typed K0 then . then sc, is the scaled form: multiplied by e^z. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as K0(−800 + i): its .sc form stays in range.'],
    example: ['\\mathrm{K0}\\left(1\\right)='],
  },
  {
    name: 'K1', also: ['K1.sc'], group: 'Special functions', usage: 'K1(x)', mathcad: true,
    summary: 'The modified Bessel function of the second kind, order 1.',
    details: [
      'Infinite at 0. x can be complex.',
      'K1.sc, typed K1 then . then sc, is the scaled form: multiplied by e^z. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as K1(−800 + i): its .sc form stays in range.'],
    example: ['\\mathrm{K1}\\left(1\\right)='],
  },
  {
    name: 'Kn', also: ['Kn.sc'], group: 'Special functions', usage: 'Kn(m, x)', mathcad: true,
    summary: 'The modified Bessel function of the second kind, of order m.',
    details: [
      'm can be any real number; K of −m is K of m. x can be complex.',
      'Kn.sc, typed Kn then . then sc, is the scaled form: multiplied by e^z. It stays in range where the plain function would overflow or underflow. A negative order works here too, where the reference calls it undefined.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as Kn(2, −800 + i): its .sc form stays in range.', 'A complex order: the order must be real.'],
    example: ['\\mathrm{Kn}\\left(2,3\\right)='],
  },
  {
    name: 'H1', also: ['H1.sc'], group: 'Special functions', usage: 'H1(m, x)', mathcad: true,
    summary: 'The Hankel function of the first kind, J + iY, of order m.',
    details: [
      'x can be complex.',
      'H1.sc, typed H1 then . then sc, is the scaled form: multiplied by e^(−iz). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as H1(0, −800i): its .sc form stays in range.', 'A complex order: the order must be real.'],
    example: ['\\mathrm{H1}\\left(0,1\\right)='],
  },
  {
    name: 'H2', also: ['H2.sc'], group: 'Special functions', usage: 'H2(m, x)', mathcad: true,
    summary: 'The Hankel function of the second kind, J − iY, of order m.',
    details: [
      'x can be complex.',
      'H2.sc, typed H2 then . then sc, is the scaled form: multiplied by e^(iz). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as H2(0, 800i): its .sc form stays in range.', 'A complex order: the order must be real.'],
    example: ['\\mathrm{H2}\\left(0,1\\right)='],
  },
  {
    name: 'Ai', also: ['Ai.sc'], group: 'Special functions', usage: 'Ai(x)', mathcad: true,
    summary: 'The Airy function of the first kind.',
    details: [
      'x can be complex.',
      'Ai.sc, typed Ai then . then sc, is the scaled form: for x ≥ 0, multiplied by e^(2/3·x^(3/2)); for x < 0, by cos(2/3·|x|^(3/2)); and for a complex z, by e^ζ, where ζ = 2/3·z^(3/2). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as Ai(−100 + 100i): its .sc form stays in range.'],
    example: ['\\mathrm{Ai}\\left(0\\right)=', '\\mathrm{Ai}\\left(-2\\right)='],
  },
  {
    name: 'Bi', also: ['Bi.sc'], group: 'Special functions', usage: 'Bi(x)', mathcad: true,
    summary: 'The Airy function of the second kind.',
    details: [
      'x can be complex.',
      'Bi.sc, typed Bi then . then sc, is the scaled form: for x ≥ 0, multiplied by e^(−2/3·x^(3/2)); for x < 0 it is Bi itself; and for a complex z, multiplied by e^(−|Re ζ|), where ζ = 2/3·z^(3/2). It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as Bi(500 + i): its .sc form stays in range.'],
    example: ['\\mathrm{Bi}\\left(0\\right)=', '\\mathrm{Bi}\\left(1\\right)='],
  },
  {
    name: 'DAi', also: ['DAi.sc'], group: 'Special functions', usage: 'DAi(x)', mathcad: true,
    summary: 'The derivative of the Airy function Ai.',
    details: [
      'x can be complex.',
      'DAi.sc, typed DAi then . then sc, is the scaled form: scaled as Ai.sc is. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as DAi(−100 + 100i): its .sc form stays in range.'],
    example: ['\\mathrm{DAi}\\left(0\\right)='],
  },
  {
    name: 'DBi', also: ['DBi.sc'], group: 'Special functions', usage: 'DBi(x)', mathcad: true,
    summary: 'The derivative of the Airy function Bi.',
    details: [
      'x can be complex.',
      'DBi.sc, typed DBi then . then sc, is the scaled form: scaled as Bi.sc is. It stays in range where the plain function would overflow or underflow.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as DBi(500 + i): its .sc form stays in range.'],
    example: ['\\mathrm{DBi}\\left(0\\right)='],
  },
  {
    name: 'ber', group: 'Special functions', usage: 'ber(m, x)', mathcad: true,
    summary: 'The Kelvin function ber of order m: the real part of J_m(x·e^(3πi/4)).',
    details: [
      'm is a whole number, 0 or more, and x is real. See also [[bei]].',
    ],
    errors: ['An order that isn\'t a whole number, 0 or more.', 'A complex argument: it must be real.'],
    example: ['\\mathrm{ber}\\left(0,1\\right)=', '\\mathrm{ber}\\left(1,5\\right)='],
  },
  {
    name: 'bei', group: 'Special functions', usage: 'bei(m, x)', mathcad: true,
    summary: 'The Kelvin function bei of order m: the imaginary part of J_m(x·e^(3πi/4)).',
    details: [
      'm is a whole number, 0 or more, and x is real. See also [[ber]].',
    ],
    errors: ['An order that isn\'t a whole number, 0 or more.', 'A complex argument: it must be real.'],
    example: ['\\mathrm{bei}\\left(0,1\\right)=', '\\mathrm{bei}\\left(1,5\\right)='],
  },
  {
    name: 'js', group: 'Special functions', usage: 'js(m, x)', mathcad: true,
    summary: 'The spherical Bessel function of the first kind, of order m: √(π/(2x))·J of order m + ½.',
    details: [
      'js(0, x) = sin(x)/x. At a negative x a whole order gives the true values, js(m, −x) = (−1)^m·js(m, x), where the reference gives 0. x can be complex; on the imaginary axis, as js(0, 2i), the reference\'s values are 1/√2 of the true ones.',
    ],
    errors: ['A value too large to hold, over 10³⁰⁷, as js(0, 800i).', 'A complex order: the order must be real.'],
    example: ['\\mathrm{js}\\left(0,1\\right)=', '\\mathrm{js}\\left(1,2\\right)='],
  },
  {
    name: 'ys', group: 'Special functions', usage: 'ys(m, x)', mathcad: true,
    summary: 'The spherical Bessel function of the second kind, of order m: √(π/(2x))·Y of order m + ½.',
    details: [
      'ys(0, x) = −cos(x)/x. Infinite at 0. At a negative x a whole order gives the true values, where the reference gives the opposite sign. x can be complex; on the imaginary axis, as ys(0, 2i), the reference\'s values are 1/√2 of the true ones.',
    ],
    errors: ['0, where it is infinite.', 'A value too large to hold, over 10³⁰⁷, as ys(0, 800i).', 'A complex order: the order must be real.'],
    example: ['\\mathrm{ys}\\left(0,1\\right)='],
  },
  {
    name: 'Si', group: 'Special functions', usage: 'Si(x)', mathcad: true,
    summary: 'The sine integral, ∫₀ˣ sin(t)/t dt.',
    details: [
      'Si is odd, and approaches π/2 as x grows. With →, its derivative is sin(x)/x, and ∫₀ˣ sin(t)/t dt gives Si(x). In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['A complex x, or one with units.'],
    example: ['\\mathrm{Si}\\left(2\\right)=', '\\mathrm{Si}\\left(100\\right)='],
  },
  {
    name: 'Ci', group: 'Special functions', usage: 'Ci(x)', mathcad: true,
    summary: 'The cosine integral, γ + ln(x) + ∫₀ˣ (cos(t) − 1)/t dt.',
    details: [
      'Ci(x) tends to 0 as x grows, and to −∞ at 0. For a negative x it is complex, Ci(|x|) + iπ. Its derivative is cos(x)/x. In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['0, where Ci is infinite.', 'A complex x, or one with units.'],
    example: ['\\mathrm{Ci}\\left(2\\right)=', '\\mathrm{Ci}\\left(-2\\right)='],
  },
  {
    name: 'Shi', group: 'Special functions', usage: 'Shi(x)', mathcad: true,
    summary: 'The hyperbolic sine integral, ∫₀ˣ sinh(t)/t dt.',
    details: [
      'Shi is odd and grows like eˣ/(2x). Its derivative, with →, is sinh(x)/x. The reference knows the name but leaves Shi(2) unevaluated even with float; MathMath gives the value, with = or float.',
    ],
    errors: ['A complex x, or one with units.', 'A value too large to hold, beyond x of about 717.'],
    example: ['\\mathrm{Shi}\\left(2\\right)='],
  },
  {
    name: 'Chi', group: 'Special functions', usage: 'Chi(x)', mathcad: true,
    summary: 'The hyperbolic cosine integral, γ + ln(x) + ∫₀ˣ (cosh(t) − 1)/t dt.',
    details: [
      'For a negative x it is complex, Chi(|x|) + iπ, as Ci is. Its derivative is cosh(x)/x. As with [[Shi]], the reference leaves it unevaluated; MathMath gives the value.',
    ],
    errors: ['0, where Chi is infinite.', 'A complex x, or one with units.'],
    example: ['\\mathrm{Chi}\\left(2\\right)='],
  },
  {
    name: 'Ei', group: 'Special functions', usage: 'Ei(x) or Ei(n, x)', mathcad: true,
    summary: 'The exponential integral, the principal value of ∫ eᵗ/t dt from −∞ to x; with two arguments, Eₙ(x) = ∫₁^∞ e^(−xt)/tⁿ dt.',
    details: [
      'Ei(−x) = −E₁(x) for x above 0, so Ei(1, x) = −Ei(−x). Its derivative is eˣ/x. n is a whole number, 0 or more. In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['Ei(0), which is −∞.', 'Ei(n, x) with x below 0, or at 0 with n of 0 or 1.', 'A complex x, or one with units.'],
    example: ['\\mathrm{Ei}\\left(1\\right)=', '\\mathrm{Ei}\\left(2,1\\right)='],
  },
  {
    name: 'FresnelS', group: 'Special functions', usage: 'FresnelS(x)', mathcad: true,
    summary: 'The Fresnel sine integral, ∫₀ˣ sin(πt²/2) dt.',
    details: [
      'It approaches ½ as x grows, and is odd. Its derivative is sin(πx²/2). In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['A complex x, or one with units.'],
    example: ['\\mathrm{FresnelS}\\left(1\\right)='],
  },
  {
    name: 'FresnelC', group: 'Special functions', usage: 'FresnelC(x)', mathcad: true,
    summary: 'The Fresnel cosine integral, ∫₀ˣ cos(πt²/2) dt.',
    details: [
      'It approaches ½ as x grows, and is odd. Plotting FresnelC(x) against [[FresnelS]](x) draws the Cornu spiral. Its derivative is cos(πx²/2). In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['A complex x, or one with units.'],
    example: ['\\mathrm{FresnelC}\\left(1\\right)='],
  },
  {
    name: 'dilog', group: 'Special functions', usage: 'dilog(x)', mathcad: true,
    summary: 'The dilogarithm, ∫₁ˣ ln(t)/(1 − t) dt, which is Li₂(1 − x).',
    details: [
      'dilog(1) = 0, dilog(0) = π²/6 and dilog(2) = −π²/12. Below 0 it is complex, as dilog(−1) = π²/4 − iπ·ln 2. Its derivative is −ln(x)/(x − 1). In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['A complex x, or one with units.'],
    example: ['\\mathrm{dilog}\\left(0.5\\right)=', '\\mathrm{dilog}\\left(-1\\right)='],
  },
  {
    name: 'Zeta', group: 'Special functions', usage: 'Zeta(s)', mathcad: true,
    summary: 'Riemann\'s zeta function, the sum of 1/kˢ over k = 1, 2, 3, … and its continuation.',
    details: [
      'With →, even whole numbers give exact forms, as Zeta(2) → π²/6. It is 0 at the negative even numbers, and Zeta(0) = −½. In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['1, where Zeta is infinite.', 'A complex s, or one with units.'],
    example: ['\\mathrm{Zeta}\\left(3\\right)=', '\\mathrm{Zeta}\\left(0.5\\right)='],
  },
  {
    name: 'Psi', group: 'Special functions', usage: 'Psi(x) or Psi(n, x)', mathcad: true,
    summary: 'The digamma function, the derivative of ln Γ(x); with two arguments, its nth derivative, the polygamma function.',
    details: [
      'Psi(1) → −γ, Euler\'s constant, and Psi(x + 1) = Psi(x) + 1/x. n is a whole number, 0 or more. In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
    ],
    errors: ['0 or a negative whole number, where Psi is infinite.', 'A complex x, or one with units.'],
    example: ['\\mathrm{Psi}\\left(2.5\\right)=', '\\mathrm{Psi}\\left(1,2.5\\right)='],
  },
  {
    name: 'LambertW', group: 'Special functions', usage: 'LambertW(x) or LambertW(n, x)', mathcad: true,
    summary: 'Lambert\'s W: the w for which w·eʷ = x, on the principal branch, or on branch n.',
    details: [
      'It is real on the principal branch for x from −1/e up, and on branch −1 for x from −1/e to 0; elsewhere, and on the other branches, it is complex. x can be complex. Its derivative is W/(x·(W + 1)). In the reference it works only symbolically, with → or the float keyword; MathMath gives its value with = too.',
      'The reference gives LambertW(−0.2) as 0 with float, which is wrong: the value is −0.2592, as MathMath gives.',
    ],
    errors: ['LambertW(n, 0) on any branch but 0, which is −∞.', 'A branch that isn\'t a whole number.'],
    example: ['\\mathrm{LambertW}\\left(1\\right)=', '\\mathrm{LambertW}\\left(-1,-0.2\\right)='],
  },
];
