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

export const fields: Example = {
  slug: 'fields',
  title: 'Fields of arrows',
  summary: 'Vector field plots: a whirlpool from a complex matrix, a pendulum\'s phase portrait, the gradient of a hill, and arrows in space.',
  build(s) {
    s.text('A vector field plot draws an arrow at each point, its length in proportion, the longest reaching the next point. Choose it from Format → Vector field plot.');
    s.section('A whirlpool, written as Mathcad writes a field: a matrix of complex numbers, the real part across and the imaginary part up, row i at x = i and column j at y = j. Water spirals in towards the middle: inward, and round.', true);
    s.row('z\\left(i,j\\right)\\coloneq \\left(i-7\\right)+\\left(j-7\\right)\\cdot 1i', { latex: `f\\left(i,j\\right)\\coloneq \\frac{\\left(-0.5+1i\\right)\\cdot z\\left(i,j\\right)}{\\left|z\\left(i,j\\right)\\right|^{2}+6}`, x: 210 });
    s.gap(10);
    s.row('W\\coloneq \\mathrm{matrix}\\left(15,15,f\\right)');
    s.gap(10);
    s.plots({ x: '', ys: ['W'], view: 'vector', width: 260, height: 250 });
    s.section('A pendulum\'s phase portrait: at angle θ and angular speed ω, the state moves at (ω, −sin θ). A function of two variables giving the two parts is sampled over the limits below the plot. In a colour map, each arrow is colored by its length: the swing is fastest at the bottom.');
    s.row('P\\left(\\theta ,\\omega \\right)\\coloneq \\begin{pmatrix}\\omega \\\\-\\sin \\left(\\theta \\right)\\end{pmatrix}');
    s.gap(16);
    s.plots({ x: '', ys: ['P'], view: 'vector', width: 330, height: 240, colorMap: 'viridis', xMin: '-2\\cdot \\pi', xMax: '2\\cdot \\pi', yMin: '-3', yMax: '3', title: 'θ across, ω up' });
    s.text('Round the bottom, at θ = 0 and its turns 2π, the arrows circle: the pendulum swings back and forth. Near θ = ±π, the top, they part: it falls one way or the other.');
    s.section('The gradient of a hill: ∇h, the parts ∂h/∂x and ∂h/∂y, points the way h rises fastest, and crosses its level curves at right angles.');
    s.row('h\\left(x,y\\right)\\coloneq e^{-\\frac{x^{2}+y^{2}}{4}}+0.6\\cdot e^{-\\left(\\left(x-2\\right)^{2}+\\left(y+1\\right)^{2}\\right)}', { latex: 'G\\left(x,y\\right)\\coloneq \\nabla h\\left(x,y\\right)', x: 290 });
    s.gap(24);
    s.plots(
      { x: '', ys: ['G'], view: 'vector', width: 240, height: 230, xMin: '-4', xMax: '4', yMin: '-4', yMax: '4', title: '∇h' },
      { x: '', ys: ['h'], view: 'contour', width: 240, height: 230, xMin: '-4', xMax: '4', yMin: '-4', yMax: '4', title: 'h' },
    );
    s.section('Arrows in space: six arrays typed with commas, the points X, Y and Z and the arrows\' parts U, V and W. Here, points on a sphere with the arrows pointing straight out, as from a source; drag the plot to turn it.');
    s.row('N\\coloneq 8', { latex: 'k\\coloneq 0..N^{2}-1', x: 90 }, { latex: '\\theta _{k}\\coloneq \\pi \\cdot \\frac{\\mathrm{floor}\\left(\\frac{k}{N}\\right)+0.5}{N}', x: 210 }, { latex: '\\phi _{k}\\coloneq 2\\cdot \\pi \\cdot \\frac{\\mathrm{mod}\\left(k,N\\right)}{N}', x: 370 });
    s.gap(16);
    s.row('Sx\\coloneq \\overrightarrow{\\sin \\left(\\theta \\right)\\cdot \\cos \\left(\\phi \\right)}', { latex: 'Sy\\coloneq \\overrightarrow{\\sin \\left(\\theta \\right)\\cdot \\sin \\left(\\phi \\right)}', x: 180 }, { latex: 'Sz\\coloneq \\overrightarrow{\\cos \\left(\\theta \\right)}', x: 360 });
    s.gap(16);
    s.plots({ x: '', ys: ['Sx', 'Sy', 'Sz', 'Sx', 'Sy', 'Sz'], view: 'vector', width: 280, height: 260 });
    s.text('The same points can carry any field: swap the last three for −Sy, Sx and 0 and the arrows swirl round the vertical axis instead.', { end: true });
  },
};
