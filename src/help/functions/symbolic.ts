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

const HOW = 'Type the expression, then choose the keyword from the Keywords menu, or type → (Ctrl+.) after it. Sheet variables with values are put in first; names without values stay as symbols.';

/** A keyword entry: `usage` shows where the expression and arguments go. */
const kw = (e: Omit<Entry, 'group' | 'mathcad' | 'results'> & { mathcad?: boolean }): Entry => ({
  group: 'Symbolic keywords', mathcad: e.mathcad ?? true, results: 'symbolic', ...e,
  details: [...(e.details ?? []), HOW],
});

export const SYMBOLIC: Entry[] = [
  kw({
    name: 'simplify', usage: 'expr simplify →', summary: 'The expression in a simpler form.',
    example: ['\\frac{x^2-1}{x-1}\\ \\mathbf{simplify}\\to '], answer: 'x+1',
  }),
  kw({
    name: 'expand', usage: 'expr expand →', summary: 'The expression multiplied out.',
    example: ['\\left(x+1\\right)^3\\ \\mathbf{expand}\\to '], answer: 'x^{3}+3\\cdot x^{2}+3\\cdot x+1',
  }),
  kw({
    name: 'factor', usage: 'expr factor →', summary: 'The expression as a product of factors.',
    example: ['x^2-5\\cdot x+6\\ \\mathbf{factor}\\to '], answer: '\\left(x-3\\right)\\cdot \\left(x-2\\right)',
  }),
  kw({
    name: 'float', usage: 'expr float, [n] →', summary: 'The expression as a decimal number, to 20 significant digits, or to n with `float, n`.',
    example: ['\\pi \\ \\mathbf{float}\\to '], answer: '3.1415926535897932385',
  }),
  kw({
    name: 'solve', usage: 'expr solve, x →', summary: 'The values of x that make an equation true, or an expression zero.',
    details: ['Several solutions come as a vector. Type the equation with an ordinary =.'],
    example: ['x^2-4=0\\ \\mathbf{solve},x\\to '], answer: '\\begin{pmatrix}-2\\\\2\\end{pmatrix}',
  }),
  kw({
    name: 'collect', usage: 'expr collect, x →', summary: 'The expression with the terms in x gathered together.',
    details: ['The answer is a polynomial in x, highest power first, as in Mathcad. Terms in anything else, as sin(x), are left as they are.'],
    example: ['\\left(x+a\\right)\\cdot \\left(x+b\\right)\\ \\mathbf{collect},x\\to '], answer: 'x^{2}+\\left(a+b\\right)\\cdot x+a\\cdot b',
  }),
  kw({
    name: 'coeffs', usage: 'expr coeffs, x →', summary: 'The coefficients of a polynomial in x, as a vector from the constant term up.',
    example: ['3\\cdot x^2+2\\cdot x+1\\ \\mathbf{coeffs},x\\to '], answer: '\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}',
  }),
  kw({
    name: 'series', usage: 'expr series, x, n →', summary: 'The series of the expression in x about 0, up to the power n.',
    example: ['e^{x}\\ \\mathbf{series},x,4\\to '], answer: '1+x+\\frac{1}{2}\\cdot x^{2}+\\frac{1}{6}\\cdot x^{3}+\\frac{1}{24}\\cdot x^{4}',
  }),
  kw({
    name: 'substitute', usage: 'expr substitute, x = value →', summary: 'The expression with x replaced by another expression.',
    example: ['x^2+y\\ \\mathbf{substitute},x=y+1\\to '], answer: '\\left(y+1\\right)^{2}+y',
  }),
  kw({
    name: 'parfrac', usage: 'expr parfrac, x →', summary: 'The expression in partial fractions in x.',
    example: ['\\frac{1}{x^2-1}\\ \\mathbf{parfrac},x\\to '], answer: '\\frac{\\frac{1}{2}}{x-1}-\\frac{\\frac{1}{2}}{x+1}',
  }),
  kw({
    name: 'assume', usage: 'expr assume, condition →', summary: 'The expression worked out under a condition on a variable, as x > 0.',
    example: ['\\sqrt{x^2}\\ \\mathbf{assume},x>0\\to '], answer: 'x',
  }),
  kw({
    name: 'laplace', usage: 'expr laplace, t →', summary: 'The Laplace transform of an expression in t: a function of s.',
    details: ['[[invlaplace]] goes back. A step is Φ(t) and an impulse Δ(t).'],
    example: ['e^{-2\\cdot t}\\ \\mathbf{laplace},t\\to '], answer: '\\frac{1}{s+2}',
  }),
  kw({
    name: 'invlaplace', usage: 'expr invlaplace, s →', summary: 'The inverse Laplace transform of an expression in s: a function of t.',
    example: ['\\frac{1}{s+2}\\ \\mathbf{invlaplace},s\\to '], answer: 'e^{-2\\cdot t}',
  }),
  kw({
    name: 'ztrans', usage: 'expr ztrans, n →', summary: 'The z-transform of an expression in n: a function of z.',
    details: ['[[invztrans]] goes back.'],
    example: ['2^{n}\\ \\mathbf{ztrans},n\\to '], answer: '\\frac{z}{z-2}',
  }),
  kw({
    name: 'invztrans', usage: 'expr invztrans, z →', summary: 'The inverse z-transform of an expression in z: a function of n.',
    example: ['\\frac{z}{z-2}\\ \\mathbf{invztrans},z\\to '], answer: '2^{n}',
  }),
  {
    name: 'numer', group: 'Arithmetic and functions', usage: 'numer(expr) →', mathcad: true, results: 'symbolic',
    summary: 'The numerator of an expression, once it is written as one fraction.',
    details: ['numer(3/4) → 3, and numer((a + 1)/(b·c)) → a + 1. It works on expressions, so evaluate it with → (Ctrl+.); = is an error. See also [[denom]].'],
    example: ['\\mathrm{numer}\\left(\\frac{a+1}{b\\cdot c}\\right)\\to '], answer: 'a+1',
  },
  {
    name: 'denom', group: 'Arithmetic and functions', usage: 'denom(expr) →', mathcad: true, results: 'symbolic',
    summary: 'The denominator of an expression, once it is written as one fraction.',
    details: ['denom(3/4) → 4, and denom(1/x + 1/y) → x·y. It works on expressions, so evaluate it with → (Ctrl+.); = is an error. See also [[numer]].'],
    example: ['\\mathrm{denom}\\left(\\frac{1}{x}+\\frac{1}{y}\\right)\\to '], answer: 'x\\cdot y',
  },
];
