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

export const shooting: Example = {
  slug: 'shooting',
  title: 'A circuit, a beam and a reaction',
  summary: 'Three kinds of differential equation: a driven RLC circuit with statespace, a loaded beam whose far end is fixed, by shooting with sbval, and a stiff reaction whose Jacobian comes from Jacob.',
  build(s) {
    s.text('A circuit, a beam and a reaction: three kinds of differential equation, and the solvers that suit them.');
    s.section('A series RLC circuit switched onto 10 V at t = 0, its states the charge q and current i: q′ = i and i′ = (V − R·i − q/C)/L. That is linear, x′ = A·x + B·u, so statespace takes it as it is, with A, B and the input u as functions of time (in seconds, ohms, henries and farads, without units, as statespace takes them).', true);
    s.row('R\\coloneq 20', { latex: 'L\\coloneq 0.5', x: 90 }, { latex: 'C\\coloneq 0.002', x: 180 }, { latex: 'A\\left(t\\right)\\coloneq \\begin{pmatrix}0&1\\\\-\\frac{1}{L\\cdot C}&-\\frac{R}{L}\\end{pmatrix}', x: 300 });
    s.row({ latex: 'B\\left(t\\right)\\coloneq \\begin{pmatrix}0\\\\\\frac{1}{L}\\end{pmatrix}', x: 0 }, { latex: 'u\\left(t\\right)\\coloneq 10', x: 140 }, { latex: 'X\\coloneq \\mathrm{statespace}\\left(\\begin{pmatrix}0\\\\0\\end{pmatrix},0,0.5,250,A,B,u\\right)', x: 250 });
    s.plot({ x: 'X^{\\langle 0\\rangle }', ys: ['X^{\\langle 2\\rangle }'], width: 460, height: 140, xTitle: 's', yTitle: 'A' });
    s.text('The current rings at about 5 Hz, 1/(2π√(LC)), dying away as the resistor takes the energy, and the capacitor ends charged to 10 V:');
    s.row({ latex: '\\frac{X_{250,1}}{C}=' }, { latex: '\\frac{1}{2\\cdot \\pi \\cdot \\sqrt{L\\cdot C}}=', x: 200 });
    s.section('A beam 4 m long, resting on supports at both ends, under a uniform load. Its deflection y obeys y⁗ = w, the load over the stiffness of the beam, q/(E·I), with y = 0 and y″ = 0 at each end: two conditions at the start and two at the far end. Written as four first-order equations, the deflection, slope, curvature and its rate:');
    s.row('span\\coloneq 4', { latex: 'w\\coloneq 0.001', x: 110 }, { latex: 'D\\left(x,y\\right)\\coloneq \\begin{pmatrix}y_{1}\\\\y_{2}\\\\y_{3}\\\\w\\end{pmatrix}', x: 250 });
    s.text('sbval guesses the two unknown starting values, the slope y′ and y‴ at the left support, solves along the beam, and adjusts them until the far conditions hold. load fills in the known ones; score is 0 when the far end is right.');
    s.row({ latex: '\\mathrm{load}\\left(x,v\\right)\\coloneq \\begin{pmatrix}0\\\\v_{0}\\\\0\\\\v_{1}\\end{pmatrix}', rows: 4 }, { latex: '\\mathrm{score}\\left(x,y\\right)\\coloneq \\begin{pmatrix}y_{0}\\\\y_{2}\\end{pmatrix}', x: 170, rows: 2 }, { latex: 'v\\coloneq \\mathrm{sbval}\\left(\\begin{pmatrix}0\\\\0\\end{pmatrix},0,span,D,\\mathrm{load},\\mathrm{score}\\right)', x: 320 });
    s.row({ latex: 'Y\\coloneq \\mathrm{Rkadapt}\\left(\\mathrm{load}\\left(0,v\\right),0,span,40,D\\right)' }, { latex: 'v=', x: 280, rows: 2 });
    s.plot({ x: 'Y^{\\langle 0\\rangle }', ys: ['Y^{\\langle 1\\rangle }'], width: 460, height: 120, xTitle: 'm', yTitle: 'deflection' });
    s.text('It bends most at the middle, where the textbook gives 5·w·L⁴/384 for a span L:');
    s.row({ latex: 'Y_{20,1}=' }, { latex: '\\frac{5\\cdot w\\cdot span^{4}}{384}=', x: 200 });
    s.section('A stiff reaction: Robertson\'s three chemicals, one changing a million times faster than another. The stiff solvers want the Jacobian of the equations; Jacob works it out from them, rather than by hand.');
    s.row({ latex: 'S\\left(t,c\\right)\\coloneq \\begin{pmatrix}-0.04\\cdot c_{0}+10^{4}\\cdot c_{1}\\cdot c_{2}\\\\0.04\\cdot c_{0}-10^{4}\\cdot c_{1}\\cdot c_{2}-3\\cdot 10^{7}\\cdot c_{1}^{2}\\\\3\\cdot 10^{7}\\cdot c_{1}^{2}\\end{pmatrix}', rows: 3 });
    s.row('J\\left(t,c\\right)\\coloneq \\mathrm{augment}\\left(\\begin{pmatrix}0\\\\0\\\\0\\end{pmatrix},\\mathrm{Jacob}\\left(S\\left(t,c\\right),c\\right)\\right)', { latex: 'Z\\coloneq \\mathrm{Stiffb}\\left(\\begin{pmatrix}1\\\\0\\\\0\\end{pmatrix},0,40,4,S,J\\right)', x: 330 });
    s.row({ latex: 'Z=', rows: 5 });
    s.text('The first column is time; by t = 40 more than a quarter of the first chemical has become the third, while the second never passes 2e−5. The Jacobian at the start, for comparison with the equations:');
    s.row({ latex: 'c\\coloneq \\begin{pmatrix}1\\\\0\\\\0\\end{pmatrix}' }, { latex: '\\mathrm{Jacob}\\left(S\\left(0,c\\right),c\\right)=', x: 150, rows: 3 });
    s.text('Try another load or span for the beam, or another resistor: R above 2√(L/C), about 32 Ω, stops the ringing.', { end: true });
  },
};
