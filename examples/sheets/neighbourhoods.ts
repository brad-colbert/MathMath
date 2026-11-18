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

export const neighbourhoods: Example = {
  slug: 'neighbourhoods',
  title: 'Fitting by neighbourhoods',
  summary: 'loess: a curve through noisy readings at two spans, and a surface through scattered points in two variables.',
  build(s) {
    s.text('Fitting by neighbourhoods. When no one formula suits the data, loess fits a quadratic to each neighbourhood of it, the nearest points counting most, and blends the pieces into a smooth curve. The noise here is made by formula, so the sheet gives the same numbers every time.');
    s.section('Sixty readings of a slow curve, with noise on each.', true);
    s.row('k\\coloneq 0..59', 'x_{k}\\coloneq \\frac{k}{6}', 'f\\left(x\\right)\\coloneq \\sin \\left(x\\right)+0.1\\cdot x', 'y_{k}\\coloneq f\\left(x_{k}\\right)+0.3\\cdot \\sin \\left(1.7\\cdot k^{2}\\right)');
    s.section('Two fits. span is the fraction of the points each local fit takes in: a quarter of them follows the curve closely, three quarters smooths more and cuts the corners. interp reads either fit anywhere within the data.');
    s.row('A\\coloneq \\mathrm{loess}\\left(x,y,0.25\\right)', 'B\\coloneq \\mathrm{loess}\\left(x,y,0.75\\right)', 'a_{k}\\coloneq \\mathrm{interp}\\left(A,x,y,x_{k}\\right)', 'b_{k}\\coloneq \\mathrm{interp}\\left(B,x,y,x_{k}\\right)');
    s.plot(
      {
        x: 'x_{k}', ys: ['y_{k}', 'a_{k}', 'b_{k}', 'f\\left(x_{k}\\right)'], width: 300, height: 170,
        traces: [{ color: '#9ca3af', line: 'none', points: 'circle' }, { color: '#2563eb', line: 'solid', weight: 2, points: 'none' }, { color: '#d97706', line: 'solid', weight: 2, points: 'none' }, { color: '#111827', line: 'dash', weight: 1, points: 'none' }],
      },
      { text: 'Gray: the readings. Blue: span 0.25. Orange: span 0.75. Dashed: the curve they came from.', x: 330 },
    );
    s.text('The vector loess returns holds the whole fit. Near its end is the residual standard error, an estimate of the noise, which was 0.3·sin(…), about 0.21 in size. Span 0.25 comes close; span 0.75 counts the corners it cut as noise too.');
    s.row({ latex: '\\mathrm{last}\\left(A\\right)=' }, { latex: 'A_{\\mathrm{last}\\left(A\\right)-3}=', x: 150 }, { latex: 'B_{\\mathrm{last}\\left(B\\right)-3}=', x: 330 });
    s.section('A surface. loess takes up to four variables, as the columns of a matrix. Here 60 points scattered over a square, with a height measured at each; interp gives the fitted surface at any point inside them.');
    s.row('j\\coloneq 0..59', 'u_{j}\\coloneq \\frac{4\\cdot \\mathrm{mod}\\left(7\\cdot j,13\\right)}{12}', 'v_{j}\\coloneq \\frac{4\\cdot \\mathrm{mod}\\left(5\\cdot j,11\\right)}{10}');
    s.row('z_{j}\\coloneq \\sin \\left(u_{j}\\right)\\cdot \\cos \\left(v_{j}\\right)+0.1\\cdot \\sin \\left(2.3\\cdot j^{2}\\right)', 'M\\coloneq \\mathrm{augment}\\left(u,v\\right)');
    s.row('C\\coloneq \\mathrm{loess}\\left(M,z,0.5\\right)', 'S\\left(p,q\\right)\\coloneq \\mathrm{interp}\\left(C,M,z,\\begin{pmatrix}p\\\\q\\end{pmatrix}\\right)');
    s.gap(16);
    s.plots(
      { x: '', ys: ['S'], view: 'surface', width: 240, height: 230, xMin: '0.05', xMax: '3.95', yMin: '0.05', yMax: '3.95', colorMap: 'viridis', title: 'The fitted surface' },
      { x: '', ys: ['S'], view: 'contour', width: 240, height: 230, xMin: '0.05', xMax: '3.95', yMin: '0.05', yMax: '3.95', title: 'Its contours' },
    );
    s.text('The heights came from sin(u)·cos(v) plus noise: a hill near u = π/2, v = 0 and a hollow near v = π. The fit finds both from 60 noisy points.', { end: true });
  },
};
