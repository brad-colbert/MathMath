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

export const summit: Example = {
  slug: 'summit',
  title: 'The way up a hill',
  summary: 'A surface with its gradient arrows lying on it, the path of steepest ascent, the summit marked, its contours below, and all of it seen from above.',
  build(s) {
    s.heading('The way up a hill');
    s.text('A walker in fog can only feel the slope underfoot, so goes uphill the steepest way at every step. Where does that lead, and how does it look on the hill? A surface plot draws several things at once, in one box: the hill, arrows, a path and a point.');
    s.section('The hill: two rounded peaks, a high one and a lower shoulder. Its gradient ∇h points the way it rises fastest, as steeply as it rises.', true);
    s.row('h\\left(x,y\\right)\\coloneq 3\\cdot e^{-\\frac{\\left(x-1\\right)^{2}+\\left(y-0.5\\right)^{2}}{2}}+1.6\\cdot e^{-\\left(x+1.5\\right)^{2}-\\left(y+1.2\\right)^{2}}',
      { latex: 'G\\left(x,y\\right)\\coloneq \\nabla h\\left(x,y\\right)', x: 330 });
    s.section('Arrows on the slope. At each point of a grid, the arrow goes ∂h/∂x across and ∂h/∂y along, and rises with the hill: U·∂h/∂x + V·∂h/∂y, which is U² + V², so it lies on the surface. Six arrays X, Y, Z, U, V, W in a vector are arrows in space.');
    s.row('i\\coloneq 0..8', { latex: 'j\\coloneq 0..8', x: 70 }, { latex: 'X_{i,j}\\coloneq -3+0.75\\cdot i', x: 140 }, { latex: 'Y_{i,j}\\coloneq -3+0.75\\cdot j', x: 260 }, { latex: 'Z_{i,j}\\coloneq h\\left(X_{i,j},Y_{i,j}\\right)', x: 380 });
    s.row('U_{i,j}\\coloneq G\\left(X_{i,j},Y_{i,j}\\right)_{0}', { latex: 'V_{i,j}\\coloneq G\\left(X_{i,j},Y_{i,j}\\right)_{1}', x: 170 }, { latex: 'W_{i,j}\\coloneq \\left(U_{i,j}\\right)^{2}+\\left(V_{i,j}\\right)^{2}', x: 340 });
    s.math('A\\coloneq \\begin{pmatrix}X\\\\Y\\\\Z\\\\U\\\\V\\\\W\\end{pmatrix}');
    s.section('The walk. Steepest ascent follows the gradient: the position (x, y) changes in its direction. Dividing by its length, plus a little, keeps the pace steady and lets the walk settle at the top, where the gradient is 0. rkfixed takes it in steps from a start low in the near corner.');
    s.row('D\\left(t,p\\right)\\coloneq \\frac{G\\left(p_{0},p_{1}\\right)}{\\left|G\\left(p_{0},p_{1}\\right)\\right|+0.05}', { latex: 'S\\coloneq \\mathrm{rkfixed}\\left(\\begin{pmatrix}2.8\\\\-2.5\\end{pmatrix},0,16,320,D\\right)', x: 220 });
    s.row('k\\coloneq 0..320', { latex: 'C_{k}\\coloneq h\\left(S_{k,1},S_{k,2}\\right)', x: 80 }, { latex: 'P\\coloneq \\begin{pmatrix}S^{\\langle 1\\rangle }\\\\S^{\\langle 2\\rangle }\\\\C\\end{pmatrix}', x: 230 });
    s.section('The summit, where the walk ends: Maximize climbs from the same start, and the top is marked by its three numbers (x, y, z).');
    s.row('x\\coloneq 2.8', { latex: 'y\\coloneq -2.5', x: 80 }, { latex: 'M\\coloneq \\mathrm{Maximize}\\left(h,x,y\\right)', x: 160 }, { latex: 'M=', rows: 2, x: 330 });
    s.row('T\\coloneq \\begin{pmatrix}M_{0}\\\\M_{1}\\\\h\\left(M_{0},M_{1}\\right)\\end{pmatrix}', { latex: 'S_{320,1}=', x: 200 }, { latex: 'S_{320,2}=', x: 330 });
    s.section('All four in one plot, over x and y from −3 to 3: the hill colored by height, the arrows dark, the walk in orange, the summit in red. Format → Contour lines below a surface draws the hill\'s contours on the floor. Drag the plot to turn it: the hill hides what is behind it.');
    s.plot({
      x: '', ys: ['h', 'A', 'P', 'T'], view: 'surface', width: 380, height: 300, floorContours: true, view3d: { azimuth: -60, elevation: 32 },
      xMin: '-3', xMax: '3', yMin: '-3', yMax: '3',
      traces: [null, { color: '#1f1f1f', weight: 1.2 }, { color: '#eb6834', weight: 2.5 }, { color: '#e34948' }],
    });
    s.text('A contour plot takes the same four and shows them from above: the hill\'s level lines colored by height, the arrows flat, the walk and the summit where they lie.');
    s.plot({
      x: '', ys: ['h', 'A', 'P', 'T'], view: 'contour', width: 300, height: 260, xMin: '-3', xMax: '3', yMin: '-3', yMax: '3',
      traces: [null, { color: '#1f1f1f', weight: 1.2 }, { color: '#eb6834', weight: 2.5, line: 'solid' }, { color: '#e34948' }],
    }, { text: 'Seen this way, the walk crosses each contour at right angles, as the gradient does: steepest ascent is the way that crosses the level lines most directly.', x: 320 });
    s.text('Move the start, or the second peak, and the walk finds its way again.', { end: true });
  },
};
