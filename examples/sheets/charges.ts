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
const call = (f: string, ...a: string[]) => `${f}\\left(${a.join(',')}\\right)`;
const col = (...a: string[]) => `\\begin{pmatrix}${a.join('\\\\')}\\end{pmatrix}`;
const P = '0.3,0.4,0.2';

export const charges: Example = {
  slug: 'charges',
  title: 'Fields from a potential',
  summary: 'Vector calculus with ∇: the field of two charges as −∇V, its divergence and curl, a spinning body, and the wave equation in partial derivatives.',
  symbolic: true,
  build(s) {
    s.text('∇ goes before a function and its arguments, and differentiates in each argument in turn: ∇f(x, y, z) is the gradient, ∇·F the divergence, ∇×F the curl and ∇²f the Laplacian. They are in the ∇ menu on the toolbar, with ∂/∂x and the hats of î, ĵ and k̂.');
    s.section('Two charges, +1 at (−1, 0, 0) and −1 at (1, 0, 0). The potential is the sum of q/r for each; the field, the force on a small positive charge, is E = −∇V.', true);
    s.row(`${call('r', 'x', 'y', 'z', 'a')}\\coloneq \\sqrt{\\left(x-a\\right)^{2}+y^{2}+z^{2}}`, { latex: `${call('V', 'x', 'y', 'z')}\\coloneq \\frac{1}{${call('r', 'x', 'y', 'z', '-1')}}-\\frac{1}{${call('r', 'x', 'y', 'z', '1')}}`, x: 250 });
    s.gap(16);
    s.row(`${call('E', 'x', 'y', 'z')}\\coloneq -\\nabla ${call('V', 'x', 'y', 'z')}`, { latex: `${call('E', '0', '0', '0')}=`, x: 200, rows: 3 }, { latex: `${call('E', '0', '1', '0')}=`, x: 330, rows: 3 });
    s.gap(12);
    s.text('Halfway between, the field points from + to −, along x. Above the middle it is weaker, and still along x: the two charges\' pulls up and down cancel.');
    s.row(`${call('D', 'x', 'y')}\\coloneq \\frac{${call('E', 'x', 'y', '0')}}{\\left|${call('E', 'x', 'y', '0')}\\right|}`, { latex: `${call('Dxy', 'x', 'y')}\\coloneq ${col(`${call('D', 'x', 'y')}_{0}`, `${call('D', 'x', 'y')}_{1}`)}`, x: 150 }, { latex: `${call('Vz', 'x', 'y')}\\coloneq ${call('V', 'x', 'y', '0.3')}`, x: 310 });
    s.gap(8);
    s.plots(
      { x: '', ys: ['Dxy'], view: 'vector', width: 250, height: 210, xMin: '-2.5', xMax: '2.5', yMin: '-2', yMax: '2', title: 'the direction of E in the plane z = 0' },
      { x: '', ys: ['Vz'], view: 'contour', width: 220, height: 210, colorMap: 'viridis', xMin: '-2.5', xMax: '2.5', yMin: '-2', yMax: '2', title: 'V just above it, z = 0.3' },
    );
    s.text('Each arrow is E divided by its length, so it shows only the way the field points: out of the + charge, round, and into the −. The lines of equal V cross the arrows at right angles, as a gradient\'s do.');
    s.section('Away from the charges, the field has no sources and doesn\'t turn: its divergence and curl are zero, and V is harmonic, its Laplacian zero. Here at (0.3, 0.4, 0.2), zero to the accuracy of the differences ∇ takes.');
    s.row(`\\nabla \\cdot ${call('E', P)}=`, { latex: `\\nabla \\times ${call('E', P)}=`, x: 230, rows: 3 });
    s.gap(10);
    s.row(`\\nabla^{2}${call('V', P)}=`);
    s.gap(16);
    s.text('With →, ∇ works exactly. The potential of one charge, 1/r, is harmonic everywhere but at the charge itself:');
    s.row(`${call('U', 'x', 'y', 'z')}\\coloneq \\frac{1}{\\sqrt{x^{2}+y^{2}+z^{2}}}`, { latex: `\\nabla^{2}${call('U', 'x', 'y', 'z')}\\rightarrow `, x: 220 });
    s.gap(16);
    s.row(`\\nabla ${call('U', 'x', 'y', 'z')}\\rightarrow `);
    s.gap(30);
    s.section('A spinning body. Turning at angular velocity ω, a vector along its axis, a point at (x, y, z) moves at ω × (x, y, z). Its curl is 2ω everywhere, and its divergence zero: it turns, and nothing is squeezed. î, ĵ and k̂ are the unit vectors.');
    s.row('\\vec{\\omega}\\coloneq 0.3\\cdot \\hat{\\imath}-0.2\\cdot \\hat{\\jmath}+1.5\\cdot \\hat{k}', { latex: `${call('v', 'x', 'y', 'z')}\\coloneq \\vec{\\omega}\\times ${col('x', 'y', 'z')}`, x: 230 });
    s.gap(24);
    s.row(`\\nabla \\times ${call('v', '1', '-2', '0.5')}=`, { latex: `2\\cdot \\vec{\\omega}=`, x: 170, rows: 3 }, { latex: `\\nabla \\cdot ${call('v', '1', '-2', '0.5')}=`, x: 300 });
    s.gap(30);
    s.text('In the plane, ∇× of a field of two parts is a number, the turning about the axis out of the page. A whirl that slows with distance, like water round a drain, turns nowhere but at the middle:');
    s.row(`${call('w', 'x', 'y')}\\coloneq \\frac{${col('-y', 'x')}}{x^{2}+y^{2}}`, { latex: `\\nabla \\times ${call('w', '0.5', '1')}=`, x: 200 });
    s.gap(16);
    s.row(`\\nabla \\times ${call('w', 'x', 'y')}\\ \\mathbf{simplify}\\to `);
    s.gap(16);
    s.section('Partial derivatives. A wave moving at speed c, u(x, t) = sin(x − ct), satisfies the wave equation ∂²u/∂t² = c² ∂²u/∂x². ∂/∂x works as d/dx does, holding the other variables at their values.');
    s.row('c\\coloneq 2', { latex: `${call('u', 'x', 't')}\\coloneq \\sin \\left(x-c\\cdot t\\right)`, x: 70 }, { latex: 'x\\coloneq 0.7', x: 240 }, { latex: 't\\coloneq 0.3', x: 320 });
    s.gap(12);
    s.row(`\\frac{\\partial^{2}}{\\partial t^{2}}${call('u', 'x', 't')}=`, { latex: `c^{2}\\cdot \\frac{\\partial^{2}}{\\partial x^{2}}${call('u', 'x', 't')}=`, x: 200 });
    s.gap(16);
    s.text('Two in a row, in different variables, show as one: ∂/∂x of ∂/∂t of u.');
    s.row(`\\frac{\\partial}{\\partial x}\\frac{\\partial}{\\partial t}${call('u', 'x', 't')}=`, { latex: `c\\cdot \\sin \\left(x-c\\cdot t\\right)=`, x: 200 });
    s.text('Change the charges, or move the point, and everything below follows.', { end: true });
  },
};
