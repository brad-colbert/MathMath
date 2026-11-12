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

export const heat: Example = {
  slug: 'heat',
  title: 'Heat in a rod and a plate',
  summary: 'Partial differential equations: a rod cooling from its ends, solved as written with Pdesolve, and a plate heated along one edge, by relaxation.',
  build(s) {
    s.text('Heat in a rod and a plate: two partial differential equations, one changing in time and one at rest.');
    s.section('A metal rod 1 m long, hot in the middle, its ends held at 0 °C in ice water. Its temperature u(x, t) obeys the heat equation, u_t = α·u_xx, with α its thermal diffusivity. Typed between Given and Pdesolve, as written: the subscripts are typed after a . so they read as literal subscripts.', true);
    s.row('\\alpha \\coloneq 0.01', { latex: 'p\\left(x\\right)\\coloneq 100\\cdot \\sin \\left(\\pi \\cdot x\\right)^{4}', x: 140 });
    s.row('\\mathrm{Given}');
    s.row('u_{\\text{t}}\\left(x,t\\right)=\\alpha \\cdot u_{\\text{xx}}\\left(x,t\\right)', { latex: 'u\\left(x,0\\right)=p\\left(x\\right)', x: 220 }, { latex: 'u\\left(0,t\\right)=0', x: 360 }, { latex: 'u\\left(1,t\\right)=0', x: 450 });
    s.row('u\\coloneq \\mathrm{Pdesolve}\\left(u,x,\\begin{pmatrix}0\\\\1\\end{pmatrix},t,\\begin{pmatrix}0\\\\20\\end{pmatrix},41,41\\right)');
    s.row('x\\coloneq 0,0.025..1');
    s.plot({ x: 'x', ys: ['u\\left(x,0\\right)', 'u\\left(x,2\\right)', 'u\\left(x,6\\right)', 'u\\left(x,20\\right)'], width: 460, height: 160, xTitle: 'm', yTitle: '°C' });
    s.text('At 0, 2, 6 and 20 seconds: the sharp peak spreads out and sinks as heat leaves through the ends. The middle\'s temperature over time:');
    s.row({ latex: 'u\\left(0.5,2\\right)=' }, { latex: 'u\\left(0.5,6\\right)=', x: 160 }, { latex: 'u\\left(0.5,20\\right)=', x: 320 });
    s.text('In the long run only the slowest shape is left, a sine, dying as e^(−απ²t): from 6 s to 20 s by a factor of about e^(−0.01·π²·14) = 0.25, as the answers show.');
    s.section('A square plate, one edge (row 0 of the grid) held at 100 °C and the other three at 0 °C, at rest: Laplace\'s equation, ∇²T = 0. On a 17 × 17 grid each point is the average of its four neighbours, a·T(i+1, j) + b·T(i−1, j) + c·T(i, j+1) + d·T(i, j−1) + e·T(i, j) = 0 with a to d 1 and e −4; relax solves it from the edges inward.');
    s.row('n\\coloneq 17', 'o\\left(i,j\\right)\\coloneq 1', { latex: 'A\\coloneq \\mathrm{matrix}\\left(n,n,o\\right)', x: 220 }, { latex: 'E\\left(i,j\\right)\\coloneq \\mathrm{if}\\left(i=0,100,0\\right)', x: 360 });
    s.row({ latex: 'P\\coloneq \\mathrm{relax}\\left(A,A,A,A,-4\\cdot A,0\\cdot A,\\mathrm{matrix}\\left(n,n,E\\right),1-\\frac{\\pi ^{2}}{2\\cdot n^{2}}\\right)' });
    s.plots({ x: '', ys: ['P'], view: 'surface', width: 230, height: 190 }, { x: '', ys: ['P'], view: 'contour', width: 230, height: 190 });
    s.text('The heat reaches in from the hot edge; the centre of the plate settles at a quarter of the edge\'s temperature, 25 °C, as symmetry says it must:');
    s.row({ latex: 'P_{8,8}=' });
    s.text('rjac, 1 − π²/(2n²), sets how hard each sweep over-relaxes; this value suits an n × n grid. multigrid solves the same equation with a source and zero edges faster still.', { end: true });
  },
};
