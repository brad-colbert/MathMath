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

export const polyhedra: Example = {
  slug: 'polyhedra',
  title: 'Uniform polyhedra',
  summary: 'The 80 uniform polyhedra and their duals, drawn with Polyhedron: a snub, a star, a dual, and any of them by number.',
  build(s) {
    s.text('A uniform polyhedron has regular faces and every vertex alike. There are 80 of them, as Mathcad numbers them: the five Platonic solids, the thirteen Archimedean ones, prisms and antiprisms, and 57 stars whose faces pass through each other. Each has a name, a dual and a Wythoff symbol, which PolyLookup gives.');
    s.row('\\mathrm{PolyLookup}\\left(34\\right)=');
    s.gap(16);
    s.section('Polyhedron draws one in a surface plot, by its name, its dual\'s name, its number or its Wythoff symbol. Drag a plot to turn it. In a colour map, each kind of face has its own colour: here the snub dodecahedron\'s triangles and pentagons.', true);
    s.plots(
      { x: '', ys: ['\\mathrm{Polyhedron}\\left(\\text{"snub dodecahedron"}\\right)'], view: 'surface', width: 230, height: 230, colorMap: 'viridis' },
      { x: '', ys: ['\\mathrm{Polyhedron}\\left(\\text{"pentagonal hexecontahedron"}\\right)'], view: 'surface', width: 230, height: 230 },
    );
    s.text('The second is the snub dodecahedron\'s dual: a face for each of its vertices, and a vertex for each of its faces.');
    s.section('The Wythoff symbol says how the polyhedron is built. Its numbers p, q and r make a triangle on a sphere with angles π/p, π/q and π/r, and mirrors on its sides multiply it over the sphere; the bar says where in the triangle the first vertex sits. In 3|2 5/2 it sits at the corner with angle π/3, and 5/2, a pentagram\'s angle, makes a star: the great stellated dodecahedron.');
    s.plots(
      { x: '', ys: ['\\mathrm{Polyhedron}\\left(\\text{"3|2 5/2"}\\right)'], view: 'surface', width: 230, height: 230 },
      { x: '', ys: ['\\mathrm{Polyhedron}\\left(\\text{"#80"}\\right)'], view: 'surface', width: 230, height: 230, colorMap: 'spectrum' },
    );
    s.text('Number 80, the great dirhombicosidodecahedron, is the one whose symbol has four numbers: no triangle builds it. Its 60 squares all pass through the centre.');
    s.section('Any of the 80 by number: change n.');
    s.row('n\\coloneq 62', { latex: '\\mathrm{PolyLookup}\\left(n\\right)=', x: 120 });
    s.gap(16);
    s.row('S\\coloneq \\mathrm{concat}\\left(\\text{"#"},\\mathrm{num2str}\\left(n\\right)\\right)', { latex: 'S=', x: 260 });
    s.plots({ x: '', ys: ['S'], view: 'surface', width: 260, height: 240 });
    s.text('The plot draws the polyhedron its string names, so a string built from n draws it too; Polyhedron(S) would give the same.', { end: true });
  },
};
