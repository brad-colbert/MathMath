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

const P = (...lines: string[]): string => `\\begin{array}{|l}${lines.join('\\\\')}\\end{array}`;

export const trials: Example = {
  slug: 'trials',
  title: 'Repeatable trials, stopping rules and tracing',
  summary: 'Seed to repeat a random experiment exactly, until to stop a recurrence at a limit, and trace to follow a program step by step.',
  build(s) {
    s.text('Three tools for working with steps and chance: a random experiment you can repeat, a sequence that stops itself, and a program that reports as it runs.');
    s.section('Estimating π by throwing darts. Points scattered evenly over a unit square land inside the quarter circle x² + y² < 1 with probability π/4, so 4 × the fraction inside estimates π. Seed fixes where the draws start, so the same seed gives the same darts, and the same estimate, again.', true);
    s.row('N\\coloneq 2000', { latex: '\\mathrm{Seed}\\left(42\\right)=', x: 110 }, { latex: 'x\\coloneq \\mathrm{runif}\\left(N,0,1\\right)', x: 240 }, { latex: 'y\\coloneq \\mathrm{runif}\\left(N,0,1\\right)', x: 380 });
    s.row('i\\coloneq 0..N-1', { latex: '\\pi _{\\text{est}}\\coloneq \\frac{4}{N}\\cdot \\sum _{i}\\left(\\left(x_{i}\\right)^{2}+\\left(y_{i}\\right)^{2}<1\\right)', x: 110 }, { latex: '\\pi _{\\text{est}}=', x: 380 });
    s.plot({ x: 'x_{i}', ys: ['y_{i}'], markers: true, width: 210, height: 190 }, { text: 'The darts: those inside the quarter circle count toward π. With 2000 darts the estimate is typically within a few hundredths; the error shrinks like 1/√N.', x: 240 });
    s.text('Seeding again with 42 throws the same darts, so this second estimate is the same to the last digit. Seed gives back the seed that was in effect, here 42.');
    s.row({ latex: '\\mathrm{Seed}\\left(42\\right)=' }, { latex: 'u\\coloneq \\mathrm{runif}\\left(N,0,1\\right)', x: 120 }, { latex: 'v\\coloneq \\mathrm{runif}\\left(N,0,1\\right)', x: 260 });
    s.row({ latex: '\\frac{4}{N}\\cdot \\sum _{i}\\left(\\left(u_{i}\\right)^{2}+\\left(v_{i}\\right)^{2}<1\\right)-\\pi _{\\text{est}}=' });
    s.section('A cup of coffee cooling. Each minute it loses 8% of its difference from the 20 °C room: T_(k+1) = T_k − 0.08·(T_k − 20). until stops the sequence at the first minute the coffee is cool enough to drink, below 60 °C, so the vector\'s length says how long that takes.');
    s.row('k\\coloneq 0..100', { latex: 'T_{0}\\coloneq 90', x: 110 }, { latex: 'T_{k+1}\\coloneq \\mathrm{until}\\left(T_{k}-60,T_{k}-0.08\\cdot \\left(T_{k}-20\\right)\\right)', x: 200 });
    s.row({ latex: '\\mathrm{rows}\\left(T\\right)=' }, { latex: 'T_{\\mathrm{rows}\\left(T\\right)-1}=', x: 160 });
    s.text('T₀ is the start, so the cup first drops below 60 °C after rows(T) − 1 minutes. Without until, the definition would carry on to k = 100.');
    s.section('Following a program. Newton\'s method for √2: each step replaces x by x − (x² − 2)/(2x). trace prints a line under the region at every step, which shows how fast the digits settle: about twice as many correct each time.');
    s.row(`r\\left(a,n\\right)\\coloneq ${P('x\\gets a', `\\mathbf{for}\\ j\\in 1..n\\ ${P('x\\gets x-\\frac{x^{2}-2}{2\\cdot x}', 't\\gets \\mathrm{trace}\\left(\\text{"step {0}: x = {1}"},j,x\\right)')}`, 'x')}`, { latex: 'r\\left(1,5\\right)=', x: 330 });
    s.gap(70);
    s.text('The lines under r(1, 5) are what trace printed; they\'re for reading as you work, and aren\'t printed with the sheet. pause prints the same way, and in Mathcad also stops to wait.', { end: true });
  },
};
