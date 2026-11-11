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

export const shapes: Example = {
  slug: 'shapes',
  title: 'Shapes in three dimensions',
  summary: 'A torus, a helix and a sphere from CreateMesh and CreateSpace, coordinates converted between systems, and points spaced on a log scale.',
  build(s) {
    s.text('Shapes in three dimensions. A surface is a function of two parameters that gives a point in space; CreateMesh samples it on a grid, and a 3D plot draws the grid. CreateSpace does the same for a curve, with one parameter.');
    s.section('A torus: a circle of radius r swept round a circle of radius R. u goes round the big circle and v round the small one.', true);
    s.row({ latex: 'R\\coloneq 3' }, { latex: 'r\\coloneq 1', x: 90 });
    s.math('T\\left(u,v\\right)\\coloneq \\begin{pmatrix}\\left(R+r\\cdot \\cos \\left(v\\right)\\right)\\cdot \\cos \\left(u\\right)\\\\\\left(R+r\\cdot \\cos \\left(v\\right)\\right)\\cdot \\sin \\left(u\\right)\\\\r\\cdot \\sin \\left(v\\right)\\end{pmatrix}');
    s.row('M\\coloneq \\mathrm{CreateMesh}\\left(T,0,2\\cdot \\pi ,0,2\\cdot \\pi ,36,18\\right)');
    s.plot(
      { x: '', ys: ['M'], view: 'surface', width: 280, height: 200 },
      { text: 'CreateMesh gives the x, y and z of every grid point, 36 round the big circle and 18 round the small one. Drag the plot to turn it.', x: 310 },
    );

    s.section('A helix: one parameter, so CreateSpace, and the plot draws a curve. Three turns, climbing one unit a turn.');
    s.row('H\\left(t\\right)\\coloneq \\begin{pmatrix}\\cos \\left(t\\right)\\\\\\sin \\left(t\\right)\\\\\\frac{t}{2\\cdot \\pi }\\end{pmatrix}', { latex: 'C\\coloneq \\mathrm{CreateSpace}\\left(H,0,6\\cdot \\pi ,240\\right)', x: 200 });
    s.plot(
      { x: '', ys: ['C'], view: 'surface', width: 280, height: 200 },
      { text: 'A space curve, colored by height. C₀ holds the three vectors of x, y and z: CreateSpace, like CreateMesh, gives them inside a one-element array, as Mathcad does.', x: 310 },
    );

    s.section('A sphere through a mapping. Here the function gives the radius at each pair of angles, and the last argument, fmap, turns each point (θ, φ, radius) into x, y and z with sph2xyz. A radius that varies with the angles makes a lumpier shape.');
    s.row('\\rho \\left(\\theta ,\\phi \\right)\\coloneq 1+0.2\\cdot \\cos \\left(4\\cdot \\theta \\right)\\cdot \\sin \\left(\\phi \\right)', { latex: 'S\\left(\\theta ,\\phi ,\\rho \\right)\\coloneq \\mathrm{sph2xyz}\\left(\\rho ,\\theta ,\\phi \\right)', x: 260 });
    s.row('B\\coloneq \\mathrm{CreateMesh}\\left(\\rho ,0,2\\cdot \\pi ,0,\\pi ,40,20,S\\right)');
    s.plot(
      { x: '', ys: ['B'], view: 'surface', width: 280, height: 200, view3d: { azimuth: 30, elevation: 25 } },
      { text: 'sph2xyz takes the radius first, so S puts its arguments in the order CreateMesh gives them: the two angles, then the value.', x: 310 },
    );

    s.section('Converting a point. xy2pol and pol2xy in the plane, xyz2sph and sph2xyz, xyz2cyl and cyl2xyz in space; angles in radians. In spherical coordinates θ is round the z axis and φ down from it.');
    s.row({ latex: '\\mathrm{xy2pol}\\left(3,4\\right)=', rows: 2 }, { latex: '\\mathrm{xyz2sph}\\left(1,1,1\\right)=', rows: 3, x: 150 }, { latex: '\\mathrm{sph2xyz}\\left(\\mathrm{xyz2sph}\\left(1,1,1\\right)\\right)=', rows: 3, x: 300 });

    s.section('Points on a log scale. logspace spaces points evenly in their logarithm, from one value to another, units and all; logpts spaces them evenly within each decade.');
    s.row({ latex: 'f\\coloneq \\mathrm{logspace}\\left(10\\cdot \\mathrm{Hz},100\\cdot \\mathrm{kHz},5\\right)' }, { latex: 'f=', unit: '\\mathrm{Hz}', rows: 5, x: 260 }, { latex: '\\mathrm{logpts}\\left(0,1,3\\right)=', rows: 3, x: 400 });
    s.text('logpts(0, 1, 3) is 1, 4 and 7: a third of the way from 1 to 10 each time, as Mathcad gives it.', { end: true });
  },
};
