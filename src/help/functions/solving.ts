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

// Data used by several examples: x = (0; 1; 2; 3) and y = x².
const XS = 'x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\end{pmatrix}';
const YS = 'y\\coloneq \\begin{pmatrix}0\\\\1\\\\4\\\\9\\end{pmatrix}';

// The decay y' = -y from y(0) = 1, for the differential equation solvers.
const START = 'w\\coloneq \\begin{pmatrix}1\\end{pmatrix}';
const DECAY = 'D\\left(x,y\\right)\\coloneq \\begin{pmatrix}-y_{0}\\end{pmatrix}';

const SAME_SPLINE = 'Give the result to [[interp]] with the same x and y to read values off the curve.';

export const SOLVING: Entry[] = [
  // ── Interpolation and fitting ────────────────────────────────────────────────────────────────────
  {
    name: 'linterp', group: 'Interpolation and fitting', usage: 'linterp(vx, vy, x)', mathcad: true,
    summary: 'The value at x of the straight-line segments joining the points (vx, vy).',
    details: [
      'vx must be in increasing order, and vx and vy the same length, at least two. x can be a number or a vector of numbers. Beyond either end, the first or last segment is carried on in a straight line.',
      'Unlike the spline functions, `linterp` gives the value directly: there is no separate step.',
    ],
    units: 'x is in vx\'s units and the result in vy\'s.',
    errors: ['vx and vy of different lengths.', 'Fewer than two points.', 'x in units that don\'t match vx.'],
    example: [XS, YS, '\\mathrm{linterp}\\left(x,y,1.5\\right)='],
  },
  {
    name: 'lspline', group: 'Interpolation and fitting', usage: 'lspline(vx, vy)', mathcad: true,
    summary: 'A spline through the points (vx, vy) that ends as a straight line, for use with interp.',
    details: [
      'The curve is made of cubic pieces that join smoothly. At each end the curve becomes linear (its second derivative is 0 there). ' + SAME_SPLINE,
      'vx and vy are column vectors of the same length. vx must be in increasing order. Given an n×2 matrix of grid coordinates for vx and an n×n matrix for vy, it makes a spline for a surface, and [[interp]] then takes a point with two coordinates. The result is a vector of coefficients, not something to read: it is meant for [[interp]]. For other end behaviour see [[pspline]] and [[cspline]].',
    ],
    errors: ['vx and vy of different lengths.', 'A vx or vy that is complex or isn\'t a column vector.'],
    example: [XS, YS, 'S\\coloneq \\mathrm{lspline}\\left(x,y\\right)', '\\mathrm{interp}\\left(S,x,y,2.5\\right)='],
  },
  {
    name: 'pspline', group: 'Interpolation and fitting', usage: 'pspline(vx, vy)', mathcad: true,
    summary: 'A spline through the points (vx, vy) that ends as a parabola, for use with interp.',
    details: [
      'The curve is made of cubic pieces that join smoothly. At each end the curve becomes a parabola (its second derivative is constant there), so a table sampled from a parabola is reproduced exactly. ' + SAME_SPLINE,
      'Arguments and the 2-D form are as for [[lspline]]. See also [[cspline]].',
    ],
    errors: ['vx and vy of different lengths.', 'A vx or vy that is complex or isn\'t a column vector.'],
    example: [XS, YS, 'S\\coloneq \\mathrm{pspline}\\left(x,y\\right)', '\\mathrm{interp}\\left(S,x,y,2.5\\right)='],
  },
  {
    name: 'cspline', group: 'Interpolation and fitting', usage: 'cspline(vx, vy)', mathcad: true,
    summary: 'A spline through the points (vx, vy) that ends as a cubic, for use with interp.',
    details: [
      'The curve is made of cubic pieces that join smoothly. At each end the curve continues as one cubic, so a table sampled from a cubic (or a parabola, or a line) is reproduced exactly. ' + SAME_SPLINE,
      'Arguments and the 2-D form are as for [[lspline]]. See also [[pspline]].',
    ],
    errors: ['vx and vy of different lengths.', 'A vx or vy that is complex or isn\'t a column vector.'],
    example: [XS, YS, 'S\\coloneq \\mathrm{cspline}\\left(x,y\\right)', '\\mathrm{interp}\\left(S,x,y,2.5\\right)='],
  },
  {
    name: 'bspline', group: 'Interpolation and fitting', usage: 'bspline(vx, vy, u, n)', mathcad: true,
    summary: 'A piecewise polynomial of degree n through the points (vx, vy), with its pieces joined at the break points u, for use with interp.',
    details: [
      'n is the degree: 1, 2 or 3. u holds the break points, in increasing order, spanning the data. It has n−1 fewer entries than vx, so for degree 1 it is vx itself, and for degree 2 it has one fewer. ' + SAME_SPLINE,
      'The result holds the degree code, each piece\'s coefficients and each piece\'s ends, in the form Mathcad stores them.',
    ],
    errors: ['A degree other than 1, 2 or 3.', 'A u with the wrong number of entries.', 'Break points that don\'t increase.', 'vx and vy of different lengths.'],
    example: [XS, YS, 'S\\coloneq \\mathrm{bspline}\\left(x,y,x,1\\right)', '\\mathrm{interp}\\left(S,x,y,2.5\\right)='],
  },
  {
    name: 'interp', group: 'Interpolation and fitting', usage: 'interp(vs, vx, vy, x)', mathcad: true,
    summary: 'The value at x of the spline or regression vs, made from the points (vx, vy).',
    details: [
      'vs comes from [[lspline]], [[pspline]], [[cspline]], [[bspline]] or [[regress]], and vx and vy must be the same two vectors given to it. x can be a number or a vector. For a 2-D spline, x is a point with two coordinates, as a two-element vector.',
      'Beyond the ends of the data the end behaviour of the spline carries on. For straight segments between points use [[linterp]].',
    ],
    units: 'x is in vx\'s units and the result in vy\'s.',
    errors: ['A vs that didn\'t come from one of the spline functions or regress.', 'A vs that doesn\'t match vx and vy.', 'A 2-D point without two coordinates.'],
    example: [XS, YS, 'S\\coloneq \\mathrm{cspline}\\left(x,y\\right)', '\\mathrm{interp}\\left(S,x,y,1.5\\right)='],
  },
  {
    name: 'predict', group: 'Interpolation and fitting', usage: 'predict(v, m, n)', mathcad: true,
    summary: 'n values past the end of the data v, by linear prediction from the m values before each.',
    details: [
      'The coefficients come from Burg\'s method over the whole of v, as Mathcad\'s do; each new value then comes from the m before it, so once n is more than m, predictions build on predictions. Suited to smooth, oscillating data sampled evenly. Reverse v to predict backwards.',
    ],
    errors: ['An m not less than the number of values less 1.', 'An m or n that isn\'t a whole number of 1 or more.'],
    example: ['v\\coloneq \\begin{pmatrix}0\\\\0.59\\\\0.95\\\\0.95\\\\0.59\\\\0\\\\-0.59\\\\-0.95\\\\-0.95\\\\-0.59\\end{pmatrix}', '\\mathrm{predict}\\left(v,2,3\\right)='],
  },
  {
    name: 'slope', group: 'Interpolation and fitting', usage: 'slope(vx, vy)', mathcad: true,
    summary: 'The slope of the least-squares straight line through the points (vx, vy).',
    details: [
      'The least-squares fit: it makes the sum of the squared differences in y as small as it can. [[intercept]] gives where it crosses x = 0, and [[line]] gives both.',
    ],
    units: 'The answer is in vy\'s units per vx\'s.',
    errors: ['x and y of different lengths.', 'All the x values the same, so no line fits.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', '\\mathrm{slope}\\left(x,y\\right)='],
  },
  {
    name: 'intercept', group: 'Interpolation and fitting', usage: 'intercept(vx, vy)', mathcad: true,
    summary: 'Where the least-squares straight line through the points (vx, vy) crosses x = 0.',
    details: [
      'See [[slope]] and [[line]].',
    ],
    units: 'The answer is in vy\'s units.',
    errors: ['x and y of different lengths.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', '\\mathrm{intercept}\\left(x,y\\right)='],
  },
  {
    name: 'line', group: 'Interpolation and fitting', usage: 'line(vx, vy)', mathcad: true,
    summary: 'The least-squares straight line through the points (vx, vy): a vector of its intercept and slope.',
    details: [
      'The least-squares fit: it makes the sum of the squared differences in y as small as it can. The same as [[intercept]] and [[slope]] together. For a line that a few wild points can\'t pull, see [[medfit]].',
    ],
    units: 'vx and vy have no units; [[slope]] and [[intercept]] take them.',
    errors: ['x and y of different lengths.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', '\\mathrm{line}\\left(x,y\\right)='],
  },
  {
    name: 'stderr', group: 'Interpolation and fitting', usage: 'stderr(vx, vy)', mathcad: true,
    summary: 'The standard error of the least-squares line through (vx, vy): how far, typically, the points lie from it.',
    details: [
      'The square root of the sum of the squared residuals over n − 2.',
    ],
    units: 'The answer is in vy\'s units.',
    errors: ['x and y of different lengths.', 'Fewer than 3 points: a line through 2 fits them exactly.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', '\\mathrm{stderr}\\left(x,y\\right)='],
  },
  {
    name: 'medfit', group: 'Interpolation and fitting', usage: 'medfit(vx, vy)', mathcad: true,
    summary: 'A straight line that resists outliers, the median-median line: a vector of its intercept and slope.',
    details: [
      'The points are split into thirds by x: x up to a third of the way across the range, the last third, and the middle. The slope joins the median points of the outer thirds, and the intercept is the mean of the three medians\' intercepts, as in Mathcad.',
    ],
    errors: ['x and y of different lengths.', 'No points in the first or last third of the x range.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', '\\mathrm{medfit}\\left(x,y\\right)='],
  },
  {
    name: 'linfit', group: 'Interpolation and fitting', usage: 'linfit(vx, vy, F)', mathcad: true,
    summary: 'The coefficients of the best combination of the functions in F to fit the points (vx, vy).',
    details: [
      'F(x) gives a vector of functions of x, such as (1, x, ln(x)); the answer has a coefficient for each, so the fit is the sum of each coefficient times its function. The least-squares fit: it makes the sum of the squared differences in y as small as it can.',
    ],
    errors: ['x and y of different lengths.', 'Functions that don\'t fit the points independently, or more of them than points.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', 'F\\left(x\\right)\\coloneq \\begin{pmatrix}1\\\\x\\\\x^{2}\\end{pmatrix}', '\\mathrm{linfit}\\left(x,y,F\\right)='],
  },
  {
    name: 'regress', group: 'Interpolation and fitting', usage: 'regress(vx, vy, k)', mathcad: true,
    summary: 'A polynomial of degree k fitted to the points (vx, vy), as a vector for [[interp]].',
    details: [
      'The vector is 3, 3, k, then the coefficients from the constant term up, as Mathcad\'s: take them out with submatrix(…, 3, k + 3, 0, 0). interp(v, vx, vy, x) gives the polynomial\'s value at x. The least-squares fit: it makes the sum of the squared differences in y as small as it can.',
      'With several variables, vx is a matrix with a column for each, and the terms come in Mathcad\'s order (for two variables of degree 2: xy, y², y, 1, x, x²).',
    ],
    errors: ['x and y of different lengths.', 'A degree that isn\'t a whole number of 1 or more.', 'Fewer points than coefficients.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', 'R\\coloneq \\mathrm{regress}\\left(x,y,2\\right)', '\\mathrm{interp}\\left(R,x,y,2.5\\right)='],
  },
  {
    name: 'genfit', group: 'Interpolation and fitting', usage: 'genfit(vx, vy, vg, F)', mathcad: true,
    summary: 'The parameters u that make F(x, u) best fit the points (vx, vy), starting from the guess vg.',
    details: [
      'F(x, u) takes x and the vector of parameters u, or takes the parameters one by one, as F(x, A, c). It gives the model\'s value alone, and genfit works out the derivatives, or a vector of the value and then its partial derivative in each parameter, as the example does. With one parameter, the guess can be a plain number. The least-squares fit: it makes the sum of the squared differences in y as small as it can. It starts from the guess and improves it until it can\'t: a guess near the answer helps, and one too far off can find another answer or fail.',
    ],
    errors: ['x and y of different lengths.', 'An F that gives neither one value nor one more than the parameters.', 'A guess it can\'t improve from.'],
    example: ['x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\\\4\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}3\\\\3.70\\\\4.64\\\\5.92\\\\7.64\\end{pmatrix}', 'F\\left(x,u\\right)\\coloneq \\begin{pmatrix}u_{0}\\cdot e^{u_{1}\\cdot x}\\\\e^{u_{1}\\cdot x}\\\\u_{0}\\cdot x\\cdot e^{u_{1}\\cdot x}\\end{pmatrix}', '\\mathrm{genfit}\\left(x,y,\\begin{pmatrix}1\\\\0.1\\end{pmatrix},F\\right)='],
  },
  {
    name: 'expfit', group: 'Interpolation and fitting', usage: 'expfit(vx, vy, [vg])', mathcad: true,
    summary: 'The exponential a·e^(b·x) + c fitted to the points (vx, vy): the vector (a, b, c).',
    details: [
      'The guess vg, of a, b and c, is optional: without one, it finds a start itself. The least-squares fit: it makes the sum of the squared differences in y as small as it can.',
    ],
    errors: ['x and y of different lengths.', 'A guess it can\'t improve from.'],
    example: ['x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\\\4\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}3\\\\3.70\\\\4.64\\\\5.92\\\\7.64\\end{pmatrix}', '\\mathrm{expfit}\\left(x,y\\right)='],
  },
  {
    name: 'lgsfit', group: 'Interpolation and fitting', usage: 'lgsfit(vx, vy, vg)', mathcad: true,
    summary: 'The logistic curve a / (1 + b·e^(−c·x)) fitted to the points (vx, vy), from the guess vg: the vector (a, b, c).',
    details: [
      'The least-squares fit: it makes the sum of the squared differences in y as small as it can. It starts from the guess and improves it until it can\'t: a guess near the answer helps, and one too far off can find another answer or fail.',
    ],
    errors: ['x and y of different lengths.', 'A guess it can\'t improve from.'],
    example: ['x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\\\4\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}1.25\\\\2.13\\\\3.17\\\\4.04\\\\4.56\\end{pmatrix}', '\\mathrm{lgsfit}\\left(x,y,\\begin{pmatrix}5\\\\3\\\\1\\end{pmatrix}\\right)='],
  },
  {
    name: 'logfit', group: 'Interpolation and fitting', usage: 'logfit(vx, vy, vg)', mathcad: true,
    summary: 'The curve a·ln(x + b) + c fitted to the points (vx, vy), from the guess vg: the vector (a, b, c).',
    details: [
      'The least-squares fit: it makes the sum of the squared differences in y as small as it can. It starts from the guess and improves it until it can\'t: a guess near the answer helps, and one too far off can find another answer or fail. See also [[lnfit]].',
    ],
    errors: ['x and y of different lengths.', 'A guess it can\'t improve from.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.3\\\\3.0\\\\3.5\\\\3.9\\\\4.2\\end{pmatrix}', '\\mathrm{logfit}\\left(x,y,\\begin{pmatrix}1\\\\1\\\\1\\end{pmatrix}\\right)='],
  },
  {
    name: 'lnfit', group: 'Interpolation and fitting', usage: 'lnfit(vx, vy)', mathcad: true,
    summary: 'The curve a·ln(x) + b fitted to the points (vx, vy): the vector (a, b).',
    details: [
      'The least-squares fit: it makes the sum of the squared differences in y as small as it can. It needs no guess: the fit is a straight line in ln(x).',
    ],
    errors: ['x and y of different lengths.', 'An x of 0 or less.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2\\\\3.0\\\\3.6\\\\4.1\\\\4.4\\end{pmatrix}', '\\mathrm{lnfit}\\left(x,y\\right)='],
  },
  {
    name: 'pwrfit', group: 'Interpolation and fitting', usage: 'pwrfit(vx, vy, vg)', mathcad: true,
    summary: 'The power curve a·x^b + c fitted to the points (vx, vy), from the guess vg: the vector (a, b, c).',
    details: [
      'The least-squares fit: it makes the sum of the squared differences in y as small as it can. It starts from the guess and improves it until it can\'t: a guess near the answer helps, and one too far off can find another answer or fail.',
    ],
    errors: ['x and y of different lengths.', 'A guess it can\'t improve from.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}3\\\\6.7\\\\11.4\\\\17\\\\23.4\\end{pmatrix}', '\\mathrm{pwrfit}\\left(x,y,\\begin{pmatrix}1\\\\1\\\\0\\end{pmatrix}\\right)='],
  },
  {
    name: 'sinfit', group: 'Interpolation and fitting', usage: 'sinfit(vx, vy, vg)', mathcad: true,
    summary: 'The sine wave a·sin(x + b) + c fitted to the points (vx, vy), from the guess vg: the vector (a, b, c).',
    details: [
      'x is in radians, and the wave has a period of 2π, as Mathcad\'s. The least-squares fit: it makes the sum of the squared differences in y as small as it can. It starts from the guess and improves it until it can\'t: a guess near the answer helps, and one too far off can find another answer or fail.',
    ],
    errors: ['x and y of different lengths.', 'A guess it can\'t improve from.'],
    example: ['x\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\\\4\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.44\\\\3.99\\\\2.80\\\\0.37\\\\-1.12\\end{pmatrix}', '\\mathrm{sinfit}\\left(x,y,\\begin{pmatrix}2\\\\0\\\\0\\end{pmatrix}\\right)='],
  },

  // ── Solving ───────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Find', group: 'Solving', usage: 'Find(x, y, …)', mathcad: true,
    summary: 'The values of the unknowns that satisfy the constraints in the solve block above it.',
    details: [
      'Give each unknown a guess value first. Then write `Given`, the constraints, and `Find` below them. Constraints use `=` (typed as a single equals sign), `<`, `>`, `≤`, `≥`. One unknown gives a number; several give a vector, which you can take apart: a vector of names (p; q) := Find(x, y) is written with a matrix of names on the left.',
      'An unknown can be a number, a complex number, a vector or a matrix, and have units. The constraints use the same units.',
      'To use a solve block as a function of a parameter, define `f(a) := Find(x)` with the constraints written in terms of `a`. After a `Find` that solves exactly, `ERR` is 0.',
    ],
    units: 'The answer is in the guess\'s units, so a guess of `1·mA` gives a current.',
    errors: ['No `Given` above: a solve block must start with `Given`.', 'An unknown with no guess value above `Given`.', '"No solution was found": the constraints can\'t all be met. Try other guesses, or use [[Minerr]] for the nearest answer.', 'A solve block with no constraints.'],
    example: ['x\\coloneq 1', 'y\\coloneq 1', '\\mathrm{Given}', 'x+y=5', 'x-y=1', '\\mathrm{Find}\\left(x,y\\right)='],
  },
  {
    name: 'Minerr', group: 'Solving', usage: 'Minerr(x, y, …)', mathcad: true,
    summary: 'The values of the unknowns that come closest to meeting the constraints in the solve block above it.',
    details: [
      'Written as [[Find]] is, with guesses above `Given`. Where `Find` would fail because no answer meets every constraint, `Minerr` gives the least-squares nearest one, and does not report an error.',
      'After `Minerr`, the variable `ERR` holds how far the answer is from meeting the constraints (inequalities count too). A small `ERR` means a good answer; check it before trusting the result.',
    ],
    errors: ['No `Given` above.', 'An unknown with no guess value above `Given`.', 'A solve block with no constraints.'],
    example: ['q\\coloneq 1', '\\mathrm{Given}', 'q=1', 'q=2', '\\mathrm{Minerr}\\left(q\\right)=', 'ERR='],
  },
  {
    name: 'Maximize', group: 'Solving', usage: 'Maximize(f, x, y, …)', mathcad: true,
    summary: 'The values of the unknowns that make the function f as large as possible.',
    details: [
      'f is the name of a function defined above, and x, y, … are its arguments, each with a guess value above. If an unknown is a vector, f is called with the whole vector. It can be used alone, or after `Given` and constraints that the answer must meet.',
      'It finds a local maximum near the guess; a different guess can find a different one. Use [[Minimize]] for the smallest value.',
    ],
    errors: ['A first argument that isn\'t a function.', 'A function that rises without bound.', 'Constraints that can\'t be met, from the guess given. Try another guess.', 'A function that gives a complex number.'],
    example: ['f\\left(x\\right)\\coloneq -\\left(x-3\\right)^{2}+5', 'x\\coloneq 1', '\\mathrm{Maximize}\\left(f,x\\right)='],
  },
  {
    name: 'Minimize', group: 'Solving', usage: 'Minimize(f, x, y, …)', mathcad: true,
    summary: 'The values of the unknowns that make the function f as small as possible.',
    details: [
      'Used as [[Maximize]] is: f is the name of a function, the unknowns need guesses, and `Given` constraints can limit the answer. It finds a local minimum near the guess.',
      'With a constraint `x ≤ 2` after `Given`, a function whose lowest point is at 3 gives 2.',
    ],
    errors: ['A first argument that isn\'t a function.', 'A function that falls without bound.', 'Constraints that can\'t be met, from the guess given. Try another guess.', 'A function that gives a complex number.'],
    example: ['f\\left(x\\right)\\coloneq \\left(x-3\\right)^{2}+1', 'x\\coloneq 1', '\\mathrm{Minimize}\\left(f,x\\right)='],
  },
  {
    name: 'Odesolve', group: 'Solving', usage: 'Odesolve([y,] t, b, [steps])', mathcad: true,
    summary: 'The solution of the differential equation in the solve block above it, as a function of t from the starting point to b.',
    details: [
      'Write `Given`, the equation, and its starting values, then define the answer: `y := Odesolve(t, b)`. The equation uses the derivative operator or primes, as `y\'\'(t) + y(t) = 0`, and needs one starting value for each order, as `y(0) = 0` and `y\'(0) = 1`. The result is a function: `y(1)=` reads it. It is only defined from the starting point to b.',
      'For a system, give the unknowns as a vector first: `Odesolve((x; y), t, b)`, with one equation for each. `steps` is the number of points the solution is calculated at, 1000 if omitted.',
      'The conditions can also be given at two points, for a boundary-value problem, as `y(0) = 0` and `y(b) = 1`; two points at most, and two conditions for a second-order equation.',
    ],
    units: 'The starting point, b and the values can carry units, which the answer then has.',
    errors: ['No `Given` above.', 'Too few or too many conditions for the order of the equation.', 'A condition that isn\'t a single value, as `y(1) + y\'(1) = 0`.', 'A function used beyond the interval it was solved over.', 'Conditions at two points that can\'t be met.'],
    example: ['\\mathrm{Given}', "y'\\left(t\\right)=-y\\left(t\\right)", 'y\\left(0\\right)=1', 'y\\coloneq \\mathrm{Odesolve}\\left(t,2\\right)', 'y\\left(1\\right)='],
  },
  {
    name: 'root', group: 'Solving', usage: 'root(f(x), x, [a, b])', mathcad: true,
    summary: 'A value of x that makes the expression f(x) equal to 0.',
    details: [
      'There are two forms. With a guess, `root(f(x), x)`, x must have a value defined above, and the search runs from there. With a bracket, `root(f(x), x, a, b)`, the search stays between a and b, and f must have opposite signs at the two ends, so a root lies between them.',
      'root finds real roots of real expressions. It is not part of a solve block. For polynomials, [[polyroots]] gives all the roots at once.',
    ],
    units: 'The answer is in the units of the guess, or of a and b.',
    errors: ['A guess form with no value for x above.', '"No root near the guess": try another guess, or give a and b.', 'A bracket where f has the same sign at both ends.', 'A complex value of f.', 'Three arguments, or more than four.'],
    example: ['x\\coloneq 1', '\\mathrm{root}\\left(x^{2}-2,x\\right)=', '\\mathrm{root}\\left(x^{2}-4,x,0,5\\right)='],
  },
  {
    name: 'polyroots', group: 'Solving', usage: 'polyroots(v)', mathcad: true,
    summary: 'All the roots of the polynomial whose coefficients are in v, constant term first.',
    details: [
      'The vector v = (a₀; a₁; …; aₙ) stands for a₀ + a₁·x + … + aₙ·xⁿ. The answer is a vector of n roots, which may be complex. Zero coefficients at the high end are ignored. Coefficients can be complex.',
    ],
    errors: ['A polynomial of degree 0: at least two coefficients are needed (a lone constant, or all zeros, has none to find).', 'Coefficients that aren\'t numbers.'],
    example: ['p\\coloneq \\begin{pmatrix}-6\\\\1\\\\1\\end{pmatrix}', '\\mathrm{polyroots}\\left(p\\right)='],
  },

  // ── Differential equations ───────────────────────────────────────────────────────────────────────
  {
    name: 'rkfixed', group: 'Differential equations', usage: 'rkfixed(y, x1, x2, npoints, D)', mathcad: true,
    summary: 'The solution of a system of differential equations by fourth-order Runge–Kutta, in equal steps from x1 to x2.',
    details: [
      'y is the vector of starting values at x1 (a one-element vector for a single equation). D(x, y) is a function you define that gives the vector of derivatives, one for each starting value. The y it receives is always a vector, so write `y[0`, shown y₀, for the first value. npoints is the number of steps, a positive whole number.',
      'The answer is a matrix with npoints+1 rows: the x values in the first column, then one column for each of the y values. x2 can be below x1 to solve backwards. The step is fixed, so a larger npoints is more accurate. For steps chosen to meet an accuracy, see [[Rkadapt]].',
    ],
    units: 'MathMath accepts units here: x with one unit and each y with its own, and D must then give each value in y\'s units per x\'s.',
    errors: ['A D that gives a different number of values than there are starting values.', 'A D whose values have the wrong units.', 'A number of points that isn\'t a positive whole number.'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{rkfixed}\\left(w,0,1,4,D\\right)', 'Y_{4,0}=', 'Y_{4,1}='],
  },
  {
    name: 'Rkadapt', group: 'Differential equations', usage: 'Rkadapt(y, x1, x2, npoints, D)', mathcad: true,
    summary: 'The solution of a system of differential equations by an adaptive Runge–Kutta method, given at equal steps from x1 to x2.',
    details: [
      'Arguments and answer are as for [[rkfixed]]: a matrix of npoints+1 rows, x first. Inside, it takes whatever smaller steps keep the error low, then reports at the equal points, so the answer is more accurate than `rkfixed` for the same npoints. The method is the Cash–Karp Runge–Kutta pair of orders 5 and 4.',
      'It differs from [[rkadapt]] in the output: `Rkadapt` gives the points you ask for, `rkadapt` gives the points the solver itself chose.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['As for [[rkfixed]].', 'Equations too stiff to solve in a reasonable number of steps. Try [[Radau]] or [[Stiffr]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{Rkadapt}\\left(w,0,1,4,D\\right)', 'Y_{4,1}='],
  },
  {
    name: 'rkadapt', group: 'Differential equations', usage: 'rkadapt(y, x1, x2, acc, D, kmax, save)', mathcad: true,
    summary: 'The solution of a system of differential equations by an adaptive Runge–Kutta method, at the points the solver chose.',
    details: [
      'It differs from [[Rkadapt]] in its output and arguments. Instead of equal steps, the answer has the start, then a row whenever x has moved by more than save since the last row kept, up to kmax rows, and always the end x2. A save of 0 keeps every step. acc is the accuracy wanted, a number above 0 such as 10⁻⁶.',
      'The method is the same as [[Rkadapt]]\'s; only the points reported differ. The answer is a matrix with x in the first column, then one for each y.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['An accuracy that isn\'t a plain number above 0.', 'A kmax that isn\'t a positive whole number.', 'As for [[rkfixed]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{rkadapt}\\left(w,0,1,10^{-8},D,3,0\\right)', 'Y_{2,0}=', 'Y_{2,1}='],
  },
  {
    name: 'Bulstoer', group: 'Differential equations', usage: 'Bulstoer(y, x1, x2, npoints, D)', mathcad: true,
    summary: 'The solution of a system of differential equations, given at equal steps from x1 to x2, for smooth equations.',
    details: [
      'Arguments and answer are as for [[Rkadapt]]: a matrix of npoints+1 rows, x first. It uses the Bulirsch–Stoer method: each step is taken several times, with more and more modified-midpoint substeps, and the answers extrapolated to a step of zero. On smooth solutions it takes very long steps.',
      'It differs from [[bulstoer]] in the output: `Bulstoer` reports at equal points, `bulstoer` at the solver\'s own.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['As for [[rkfixed]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{Bulstoer}\\left(w,0,1,4,D\\right)', 'Y_{4,1}='],
  },
  {
    name: 'bulstoer', group: 'Differential equations', usage: 'bulstoer(y, x1, x2, acc, D, kmax, save)', mathcad: true,
    summary: 'As Bulstoer, but at the points the solver chose, to an accuracy you give.',
    details: [
      'The arguments after D are as for [[rkadapt]]: acc, the accuracy; kmax, the most rows; and save, the least spacing in x between rows kept. The end x2 is always the last row.',
      'The method is the same as [[Bulstoer]]\'s; only the points reported differ.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['As for [[rkadapt]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{bulstoer}\\left(w,0,1,10^{-8},D,3,0\\right)', 'Y_{2,0}=', 'Y_{2,1}='],
  },
  {
    name: 'Adams', group: 'Differential equations', usage: 'Adams(y, x1, x2, npoints, D, [tol])', mathcad: true,
    summary: 'The solution of a system of differential equations, given at equal steps from x1 to x2, for smooth equations, to an optional tolerance.',
    details: [
      'Arguments and answer are as for [[Rkadapt]], with an optional last argument: the tolerance, a number above 0 (10⁻⁹ if omitted). It uses the Adams–Bashforth–Moulton methods, choosing an order from 1 to 12 as it goes: efficient on smooth solutions, but slow on stiff ones, where it has to keep its steps tiny.',
      'For stiff equations see [[AdamsBDF]] and [[Radau]].',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['A tolerance that isn\'t a plain number above 0.', 'As for [[rkfixed]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{Adams}\\left(w,0,1,4,D,10^{-10}\\right)', 'Y_{4,1}='],
  },
  {
    name: 'Stiffb', group: 'Differential equations', usage: 'Stiffb(y, x1, x2, npoints, D, J)', mathcad: true,
    summary: 'The solution of a stiff system of differential equations, given at equal steps from x1 to x2, using the Jacobian J.',
    details: [
      'Arguments are as for [[rkfixed]], with one more: J(x, y), a function you define that gives an n×(n+1) matrix. Its first column holds ∂D/∂x, and the n columns after it ∂Dᵢ/∂yⱼ. A system is stiff when the plain solvers need very small steps to stay stable.',
      'It uses semi-implicit extrapolation (Bader and Deuflhard\'s method): steps that stay stable on stiff equations, taken with more and more substeps and extrapolated, so it takes long steps where the solution is smooth. [[Stiffr]] uses a Rosenbrock method instead. The lowercase [[stiffb]] gives the solver\'s own points instead of equal ones.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['A J that isn\'t n×(n+1).', 'As for [[rkfixed]].'],
    example: [START, DECAY, 'J\\left(x,y\\right)\\coloneq \\begin{pmatrix}0&-1\\end{pmatrix}', 'Y\\coloneq \\mathrm{Stiffb}\\left(w,0,1,4,D,J\\right)', 'Y_{4,1}='],
  },
  {
    name: 'stiffb', group: 'Differential equations', usage: 'stiffb(y, x1, x2, acc, D, J, kmax, save)', mathcad: true,
    summary: 'As Stiffb, but at the points the solver chose, to an accuracy you give.',
    details: [
      'J is as for [[Stiffb]], an n×(n+1) matrix. acc, kmax and save are as for [[rkadapt]]: the accuracy, the most rows, and the least spacing in x between rows kept. The end x2 is always the last row.',
      'The method is the same as [[Stiffb]]\'s; only the points reported differ.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['As for [[Stiffb]] and [[rkadapt]].'],
    example: [START, DECAY, 'J\\left(x,y\\right)\\coloneq \\begin{pmatrix}0&-1\\end{pmatrix}', 'Y\\coloneq \\mathrm{stiffb}\\left(w,0,1,10^{-8},D,J,3,0\\right)', 'Y_{2,0}=', 'Y_{2,1}='],
  },
  {
    name: 'Stiffr', group: 'Differential equations', usage: 'Stiffr(y, x1, x2, npoints, D, J)', mathcad: true,
    summary: 'The solution of a stiff system of differential equations, given at equal steps from x1 to x2, using the Jacobian J.',
    details: [
      'Arguments and answer are as for [[Stiffb]]. It uses a fourth-order Rosenbrock method with Shampine\'s constants, where [[Stiffb]] uses extrapolation. The lowercase [[stiffr]] gives the solver\'s own points instead.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['As for [[Stiffb]].'],
    example: [START, DECAY, 'J\\left(x,y\\right)\\coloneq \\begin{pmatrix}0&-1\\end{pmatrix}', 'Y\\coloneq \\mathrm{Stiffr}\\left(w,0,1,4,D,J\\right)', 'Y_{4,1}='],
  },
  {
    name: 'stiffr', group: 'Differential equations', usage: 'stiffr(y, x1, x2, acc, D, J, kmax, save)', mathcad: true,
    summary: 'As Stiffr, but at the points the solver chose, to an accuracy you give.',
    details: [
      'Arguments are as for [[stiffb]]. The solver is the same as [[Stiffr]]\'s; only the points reported differ.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['As for [[Stiffb]] and [[rkadapt]].'],
    example: [START, DECAY, 'J\\left(x,y\\right)\\coloneq \\begin{pmatrix}0&-1\\end{pmatrix}', 'Y\\coloneq \\mathrm{stiffr}\\left(w,0,1,10^{-8},D,J,3,0\\right)', 'Y_{2,0}=', 'Y_{2,1}='],
  },
  {
    name: 'AdamsBDF', group: 'Differential equations', usage: 'AdamsBDF(y, x1, x2, npoints, D, [J], [tol])', mathcad: true,
    summary: 'The solution of a system of differential equations, given at equal steps from x1 to x2, switching between methods to suit stiff or smooth stretches.',
    details: [
      'Arguments and answer are as for [[rkfixed]]. After D come two optional arguments, in this order: a Jacobian J(x, y), an n×n matrix of ∂Dᵢ/∂yⱼ (without the ∂D/∂x column [[Stiffb]] takes), and a tolerance. Without J it is found numerically. The default tolerance is 10⁻⁹.',
      'It starts with the Adams methods, as [[Adams]], and switches to the backward differentiation formulas of [[BDF]] when the equations prove stiff, and back when they no longer are.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['A J that isn\'t n×n.', 'An optional argument that isn\'t a function or a number.', 'As for [[rkfixed]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{AdamsBDF}\\left(w,0,1,4,D\\right)', 'Y_{4,1}='],
  },
  {
    name: 'BDF', group: 'Differential equations', usage: 'BDF(y, x1, x2, npoints, D, [J], [tol])', mathcad: true,
    summary: 'The solution of a stiff system of differential equations, given at equal steps from x1 to x2, by a backward differentiation method.',
    details: [
      'Arguments are as for [[AdamsBDF]]: optionally an n×n Jacobian J(x, y) and then a tolerance. Without J it is found numerically. It uses the backward differentiation formulas, choosing an order from 1 to 5 as it goes. [[Radau]] also takes a mass matrix.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['As for [[AdamsBDF]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{BDF}\\left(w,0,1,4,D\\right)', 'Y_{4,1}='],
  },
  {
    name: 'Radau', group: 'Differential equations', usage: 'Radau(y, x1, x2, npoints, D, [J], [M], [tol])', mathcad: true,
    summary: 'The solution of a stiff system of differential equations, given at equal steps from x1 to x2, optionally with a mass matrix.',
    details: [
      'It uses the Radau IIA method of order 5, an implicit Runge–Kutta method that stays stable however stiff the equations. Arguments are as for [[BDF]], with a third optional argument: a constant, invertible n×n mass matrix M, which solves M·y′ = D(x, y). The optional arguments go in the order J, M, tol and are told apart by kind: a function is J, a matrix is M, a number is the tolerance. When M is given, J is not used.',
    ],
    units: 'As for [[rkfixed]].',
    errors: ['A singular mass matrix: a system with no solution for y′ isn\'t supported.', 'A mass matrix that isn\'t n×n.', 'As for [[AdamsBDF]].'],
    example: [START, DECAY, 'Y\\coloneq \\mathrm{Radau}\\left(w,0,1,4,D\\right)', 'Y_{4,1}='],
  },
];
