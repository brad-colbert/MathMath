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

import type { Example } from '../sheet.js';

const col = (m: string, k: number): string => `${m}^{\\langle ${k}\\rangle }`;

export const laplace: Example = {
  slug: 'laplace',
  title: 'Exact answers: calculus and Laplace',
  summary: 'Symbolic derivatives, integrals, limits and series, then a spring and damper solved exactly with the Laplace transform and checked numerically.',
  symbolic: true,
  build(s) {
    s.text('Exact answers: calculus and Laplace. Press Ctrl+. for →, and MathMath answers in symbols rather than numbers. A keyword before the arrow says what to do. Then the Laplace transform solves a differential equation exactly.');
    s.section('Calculus. A derivative, an integral to infinity, a limit and a Taylor series:', true);
    s.row(
      '\\frac{\\mathrm{d}}{\\mathrm{d}t}\\left(e^{-t}\\cdot \\sin \\left(2\\cdot t\\right)\\right)\\to ',
      { latex: '\\int_{0}^{\\infty }e^{-t}\\cdot \\sin \\left(2\\cdot t\\right)\\,\\mathrm{d}t\\to ', x: 300 },
    );
    s.row(
      '\\lim_{x\\to 0}\\frac{1-\\cos \\left(x\\right)}{x^{2}}\\to ',
      { latex: '\\frac{\\sin \\left(x\\right)}{x}\\ \\mathbf{series},x,6\\to ', x: 200 },
    );
    s.text('And algebra: factor a polynomial, and solve an equation for one letter in terms of the others, here the distance d to speed up from u to v.');
    s.row(
      'x^{3}-6\\cdot x^{2}+11\\cdot x-6\\ \\mathbf{factor}\\to ',
      { latex: 'v^{2}=u^{2}+2\\cdot a\\cdot d\\ \\mathbf{solve},d\\to ', x: 270 },
    );

    s.section('A spring and a damper. A 1 kg mass on a spring of stiffness 5 N/m, with a damper of 2 N·s/m, is pushed by a steady 5 N from t = 0. Its position obeys x″ + 2·x′ + 5·x = 5, starting at rest.');
    s.text('The Laplace transform turns each derivative into a factor of s, so the differential equation becomes algebra. Starting from rest, the transform of the position is:');
    s.row(
      { latex: 'X\\left(s\\right)\\coloneq \\frac{5}{s\\cdot \\left(s^{2}+2\\cdot s+5\\right)}' },
      { latex: 'X\\left(s\\right)\\ \\mathbf{parfrac},s\\to ', x: 220 },
    );
    s.text('invlaplace turns it back into a function of time, and defines x(t) with the answer:');
    s.math('x\\left(t\\right)\\coloneq X\\left(s\\right)\\ \\mathbf{invlaplace},s\\to ');
    s.text('Where it settles, by the final value theorem, and x at one second, now an ordinary function:');
    s.row('\\lim_{s\\to 0}s\\cdot X\\left(s\\right)\\to ', { latex: 'x\\left(1\\right)=', x: 250 });

    s.section('Check it numerically. rkfixed solves the same equation step by step, from the state (position; velocity).');
    s.row(
      { latex: 'D\\left(t,y\\right)\\coloneq \\begin{pmatrix}y_{1}\\\\5-5\\cdot y_{0}-2\\cdot y_{1}\\end{pmatrix}' },
      { latex: 'S\\coloneq \\mathrm{rkfixed}\\left(\\begin{pmatrix}0\\\\0\\end{pmatrix},0,6,30,D\\right)', x: 220 },
    );
    s.plot(
      {
        x: col('S', 0), ys: [`\\overrightarrow{x\\left(${col('S', 0)}\\right)}`, col('S', 1)], width: 280, height: 150,
        traces: [{ color: '#2563eb', weight: 2 }, { color: '#dc2626', line: 'none', points: 'circle' }],
      },
      { text: 'The exact answer, blue, through the numerical steps, red: they agree. The mass overshoots, rings and settles at 1.', x: 320 },
    );
    s.text('The overshoot peaks where the velocity is zero, and the largest difference between the two answers is tiny:');
    s.row(
      { latex: 't_{\\text{p}}\\coloneq \\mathrm{root}\\left(\\frac{\\mathrm{d}}{\\mathrm{d}t}x\\left(t\\right),t,1,2\\right)' },
      { latex: 't_{\\text{p}}=', x: 250 }, { latex: 'x\\left(t_{\\text{p}}\\right)=', x: 380 },
    );
    s.row(
      { latex: `\\mathrm{err}\\coloneq \\overrightarrow{\\left|x\\left(${col('S', 0)}\\right)-${col('S', 1)}\\right|}` },
      { latex: '\\mathrm{max}\\left(\\mathrm{err}\\right)=', x: 250 },
    );
    s.text('Try it: make the damper 6 instead of 2, in X and in D, and the ringing stops.');
  },
};
