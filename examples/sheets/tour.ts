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

export const tour: Example = {
  slug: 'tour',
  title: 'A two-minute tour',
  summary: 'Math as you would write it on paper, with units, plots, solving, matrices and exact answers.',
  symbolic: true,
  build(s) {
    s.text('A two-minute tour of MathMath. Every result on this page is live: change a number and everything below it follows.');
    s.section('1. Write math as on paper. Type a colon for :=, the definition sign, and = to see a value.', true);
    s.row('a\\coloneq 3', 'b\\coloneq a^{2}+1', 'b=');

    s.section('2. Units keep you honest. A car braking from 100 km/h at 7.5 m/s²: MathMath converts as it goes, and shows each result in the unit you choose.');
    s.row('v_{\\text{0}}\\coloneq 100\\cdot \\frac{\\mathrm{km}}{\\mathrm{hr}}', 'g_{\\text{b}}\\coloneq 7.5\\cdot \\frac{\\mathrm{m}}{\\mathrm{s}^{2}}');
    s.row({ latex: 'd\\coloneq \\frac{v_{\\text{0}}^{2}}{2\\cdot g_{\\text{b}}}' }, { latex: 'd=', unit: '\\mathrm{m}' }, { latex: 't\\coloneq \\frac{v_{\\text{0}}}{g_{\\text{b}}}' }, { latex: 't=', unit: '\\mathrm{s}' });
    s.text('Adding a distance to a time is a mistake, and MathMath says so rather than giving a number:');
    s.math('d+t=', { error: true });

    s.section('3. Functions and plots. Define a function, give x a range, and plot it: click on empty paper and type @ for a plot.');
    s.row('f\\left(x\\right)\\coloneq \\sin \\left(x\\right)\\cdot e^{-\\frac{x}{5}}', 'x\\coloneq 0,0.05..12');
    s.plot({ x: 'x', ys: ['f\\left(x\\right)'], width: 260, height: 150 }, { text: 'A damped sine. Hover over the plot to read its points.' });

    s.section('4. Solve. root finds where f crosses zero between 2 and 4, at π; a solve block, Given … Find, solves equations together.');
    s.row('\\mathrm{root}\\left(f\\left(z\\right),z,2,4\\right)=', '\\mathrm{root}\\left(f\\left(z\\right),z,2,4\\right)-\\pi =');
    s.row('p\\coloneq 1', 'q\\coloneq 1', '\\mathrm{Given}');
    s.row('p^{2}+q^{2}=25', 'p-q=1', { latex: '\\mathrm{Find}\\left(p,q\\right)=', rows: 2 });

    s.section('5. Matrices. Ctrl+M makes one; the usual operators and functions work on them.');
    s.row('M\\coloneq \\begin{pmatrix}2&1\\\\1&3\\end{pmatrix}', { latex: 'M^{-1}=', rows: 2 }, { latex: '\\mathrm{eigenvals}\\left(M\\right)=', rows: 2 });

    s.section('6. Exact answers. Press Ctrl+. for → and MathMath works symbolically: derivatives, integrals and more.');
    s.row('\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(x^{2}\\cdot \\sin \\left(x\\right)\\right)\\to ', '\\int_{0}^{1}x^{2}\\,\\mathrm{d}x\\to ');
    s.row('\\left(u+1\\right)^{3}\\ \\mathbf{expand}\\to ');

    s.section('7. Where next. Open more examples from Examples on the toolbar. Press F1 while typing a function\'s name for its help, or open Help for everything.');
  },
};
