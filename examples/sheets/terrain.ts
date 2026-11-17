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

export const terrain: Example = {
  slug: 'terrain',
  title: 'Hills in color',
  summary: 'Colour maps for surface and contour plots: a landscape in a map of its own, made with SaveColormap, and the same heights in viridis.',
  build(s) {
    s.text('A surface or contour plot colors its heights by a colour map. MathMath has a few of its own, chosen with Format → Color map…, and a worksheet can make more.');
    s.section('A landscape: two hills and a hollow, as a function of x and y, sampled on a 41 × 41 grid.', true);
    s.row('h\\left(x,y\\right)\\coloneq 3\\cdot e^{-\\left(\\left(x-1\\right)^{2}+y^{2}\\right)}+2\\cdot e^{-\\left(\\left(x+1.2\\right)^{2}+\\left(y-1\\right)^{2}\\right)}-1.5\\cdot e^{-\\left(\\left(x+0.5\\right)^{2}+\\left(y+1.3\\right)^{2}\\right)}');
    s.row('f\\left(i,j\\right)\\coloneq h\\left(-3+0.15\\cdot i,-3+0.15\\cdot j\\right)', { latex: 'H\\coloneq \\mathrm{matrix}\\left(41,41,f\\right)', x: 260 });
    s.section('A map of its own, as an atlas colors land: deep water to shallows, then green lowland, brown hills and white peaks. Each row is red, green and blue, 0 to 255, lowest heights first; between rows the colours blend. SaveColormap adds it to the worksheet under a name, gives its number of rows, and offers it as a Mathcad .cmp file to save.');
    s.row('T\\coloneq \\begin{pmatrix}20&50&120\\\\70&140&200\\\\90&160&80\\\\160&190&90\\\\140&100&50\\\\240&240&240\\end{pmatrix}', { latex: '\\mathrm{SaveColormap}\\left(\\text{"atlas"},T\\right)=', x: 220 });
    s.gap(30);
    s.plots(
      { x: '', ys: ['H'], view: 'surface', width: 250, height: 200, colorMap: 'atlas', title: 'atlas' },
      { x: '', ys: ['H'], view: 'contour', width: 230, height: 200, colorMap: 'viridis', title: 'viridis' },
    );
    s.text('The surface uses the atlas map; the contour plot, viridis, one of MathMath\'s own, whose steps look evenly spaced and stay distinct for colour-blind readers and in gray print. Select either plot and choose Format → Color map… to try the others: ramp, the default light-to-dark blue, gray, spectrum and heat.');
    s.text('LoadColormap gives a map\'s colours back as a matrix, to change and save again under another name. Here, the atlas map with the water left out:');
    s.row('A\\coloneq \\mathrm{LoadColormap}\\left(\\text{"atlas"}\\right)', { latex: '\\mathrm{SaveColormap}\\left(\\text{"land"},\\mathrm{submatrix}\\left(A,2,5,0,2\\right)\\right)=', x: 220 });
    s.text('A Mathcad worksheet\'s own colour map files, as Fire or Royal, can be attached with Files and used by name the same way.', { end: true });
  },
};
