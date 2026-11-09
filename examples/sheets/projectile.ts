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

/** Column k of matrix m, as M⟨k⟩. */
const col = (m: string, k: number): string => `${m}^{\\langle ${k}\\rangle }`;
const SPEED = '\\sqrt{u_{2}^{2}+u_{3}^{2}}';

export const projectile: Example = {
  slug: 'projectile',
  title: 'A baseball and the air',
  summary: 'How far a thrown ball really goes: a differential equation with units, solved and plotted.',
  build(s) {
    s.text('A baseball and the air. A fielder throws a baseball at 40 m/s, 35° above level ground. How far does it go? The textbook answer leaves out the air; here we solve the motion with drag too, and compare.');
    s.section('The ball and the air. Drag grows with the square of the speed: F = ½·ρ·Cd·A·v².', true);
    s.row('m_{\\text{b}}\\coloneq 145\\cdot \\mathrm{gm}', 'd\\coloneq 74\\cdot \\mathrm{mm}', 'C_{\\text{d}}\\coloneq 0.35', '\\rho \\coloneq 1.2\\cdot \\frac{\\mathrm{kg}}{\\mathrm{m}^{3}}');
    s.row(
      { latex: 'A\\coloneq \\frac{\\pi \\cdot d^{2}}{4}' }, { latex: 'A=', unit: '\\mathrm{cm}^{2}' },
      { latex: 'k\\coloneq \\frac{\\rho \\cdot C_{\\text{d}}\\cdot A}{2\\cdot m_{\\text{b}}}' }, 'k=',
    );
    s.row('v_{\\text{0}}\\coloneq 40\\cdot \\frac{\\mathrm{m}}{\\mathrm{s}}', '\\theta \\coloneq 35\\cdot \\mathrm{deg}');

    s.section('In a vacuum, the range has a formula. g, the acceleration of gravity, is built in.');
    s.row({ latex: 'R_{\\text{vac}}\\coloneq \\frac{v_{\\text{0}}^{2}\\cdot \\sin \\left(2\\cdot \\theta \\right)}{g}' }, { latex: 'R_{\\text{vac}}=', unit: '\\mathrm{m}', x: 250 });

    s.section('With drag. The state u is position and velocity, (x, y, vx, vy), each in its own unit. D gives its rate of change, and rkfixed steps it forward in time.');
    s.row(
      { latex: 'u_{\\text{0}}\\coloneq \\begin{pmatrix}0\\cdot \\mathrm{m}\\\\0\\cdot \\mathrm{m}\\\\v_{\\text{0}}\\cdot \\cos \\left(\\theta \\right)\\\\v_{\\text{0}}\\cdot \\sin \\left(\\theta \\right)\\end{pmatrix}' },
      { latex: `D\\left(t,u\\right)\\coloneq \\begin{pmatrix}u_{2}\\\\u_{3}\\\\-k\\cdot ${SPEED}\\cdot u_{2}\\\\-g-k\\cdot ${SPEED}\\cdot u_{3}\\end{pmatrix}`, x: 200 },
    );
    s.math('S\\coloneq \\mathrm{rkfixed}\\left(u_{\\text{0}},0\\cdot \\mathrm{s},5\\cdot \\mathrm{s},500,D\\right)');
    s.text('S has a row for each step: time, x, y, vx and vy. The ball lands where y comes back to zero: root finds that time, and linterp reads x there.');
    s.row(
      { latex: `t_{\\text{land}}\\coloneq \\mathrm{root}\\left(\\mathrm{linterp}\\left(${col('S', 0)},${col('S', 2)},t\\right),t,1\\cdot \\mathrm{s},5\\cdot \\mathrm{s}\\right)` },
      { latex: 't_{\\text{land}}=', unit: '\\mathrm{s}', x: 380 },
    );
    s.row(
      { latex: `R\\coloneq \\mathrm{linterp}\\left(${col('S', 0)},${col('S', 1)},t_{\\text{land}}\\right)` },
      { latex: 'R=', unit: '\\mathrm{m}', x: 250 }, { latex: '\\frac{R}{R_{\\text{vac}}}=', x: 380 },
    );

    s.section('The flight. Drag shortens the throw, and the ball comes down more steeply than it went up.');
    s.row(
      { latex: 'x\\coloneq 0\\cdot \\mathrm{m},0.5\\cdot \\mathrm{m}..R_{\\text{vac}}' },
      { latex: `y\\left(x\\right)\\coloneq \\mathrm{linterp}\\left(${col('S', 1)},${col('S', 2)},x\\right)`, x: 150 },
    );
    s.math('y_{\\text{vac}}\\left(x\\right)\\coloneq x\\cdot \\tan \\left(\\theta \\right)-\\frac{g\\cdot x^{2}}{2\\cdot v_{\\text{0}}^{2}\\cdot \\cos \\left(\\theta \\right)^{2}}');
    s.plot({
      x: 'x', ys: ['y\\left(x\\right)', 'y_{\\text{vac}}\\left(x\\right)'], width: 440, height: 170,
      xUnit: '\\mathrm{m}', yUnit: '\\mathrm{m}', yMin: '0',
      traces: [{ color: '#2563eb', weight: 2 }, { color: '#9ca3af', line: 'dash' }],
    });
    s.text('Try it: change v₀ or θ above, or set Cd to 0 and watch the two curves meet.');
  },
};
