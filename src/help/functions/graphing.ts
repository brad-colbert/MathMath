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

import type { Entry } from '../types.js';

const G = 'Plots and coordinates';
const RAD = 'Angles are in radians. The coordinates have no units, as in Mathcad.';
const ARGS = (n: string) => `The coordinates go in one by one or as one column vector of ${n}.`;

export const GRAPHING: Entry[] = [
  {
    name: 'xy2pol', group: G, usage: 'xy2pol(x, y) or xy2pol(v)', mathcad: true,
    summary: 'The polar coordinates (r, θ) of the point (x, y), as a vector.',
    details: ['θ runs from 0 to 2π, as Mathcad gives it: (0, −1) is at 3π/2. ' + ARGS('two') + ' ' + RAD, '[[pol2xy]] goes back.'],
    errors: ['A vector that isn\'t a column of two.', 'Coordinates with units.'],
    example: ['\\mathrm{xy2pol}\\left(3,4\\right)=', '\\mathrm{xy2pol}\\left(0,-1\\right)='],
  },
  {
    name: 'pol2xy', group: G, usage: 'pol2xy(r, θ) or pol2xy(v)', mathcad: true,
    summary: 'The rectangular coordinates (x, y) of the point at radius r and angle θ, as a vector.',
    details: ['(r·cos θ, r·sin θ); r can be negative. ' + ARGS('two') + ' ' + RAD],
    errors: ['A vector that isn\'t a column of two.', 'Coordinates with units.'],
    example: ['\\mathrm{pol2xy}\\left(2,\\frac{\\pi }{3}\\right)='],
  },
  {
    name: 'xyz2sph', group: G, usage: 'xyz2sph(x, y, z) or xyz2sph(v)', mathcad: true,
    summary: 'The spherical coordinates (r, θ, φ) of the point (x, y, z), as a vector.',
    details: ['θ is the angle round the z axis, from −π to π, and φ the angle down from it, from 0 to π. At the origin φ is NaN, as in Mathcad. ' + ARGS('three') + ' ' + RAD, '[[sph2xyz]] goes back.'],
    errors: ['A vector that isn\'t a column of three.', 'Coordinates with units.'],
    example: ['\\mathrm{xyz2sph}\\left(1,1,1\\right)=', '\\mathrm{xyz2sph}\\left(0,0,-1\\right)='],
  },
  {
    name: 'sph2xyz', group: G, usage: 'sph2xyz(r, θ, φ) or sph2xyz(v)', mathcad: true,
    summary: 'The rectangular coordinates (x, y, z) of the point at radius r, angle θ round the z axis and φ down from it.',
    details: ['(r·sin φ·cos θ, r·sin φ·sin θ, r·cos φ). ' + ARGS('three') + ' ' + RAD, 'As the mapping of [[CreateMesh]] it would take the radius first, so wrap it, as S(θ, φ, ρ) := sph2xyz(ρ, θ, φ).'],
    errors: ['A vector that isn\'t a column of three.', 'Coordinates with units.'],
    example: ['\\mathrm{sph2xyz}\\left(1,\\frac{\\pi }{4},\\frac{\\pi }{3}\\right)='],
  },
  {
    name: 'xyz2cyl', group: G, usage: 'xyz2cyl(x, y, z) or xyz2cyl(v)', mathcad: true,
    summary: 'The cylindrical coordinates (r, θ, z) of the point (x, y, z), as a vector.',
    details: ['θ is the angle round the z axis, from −π to π. ' + ARGS('three') + ' ' + RAD, '[[cyl2xyz]] goes back.'],
    errors: ['A vector that isn\'t a column of three.', 'Coordinates with units.'],
    example: ['\\mathrm{xyz2cyl}\\left(1,1,2\\right)='],
  },
  {
    name: 'cyl2xyz', group: G, usage: 'cyl2xyz(r, θ, z) or cyl2xyz(v)', mathcad: true,
    summary: 'The rectangular coordinates (x, y, z) of the point at radius r, angle θ and height z.',
    details: ['(r·cos θ, r·sin θ, z). ' + ARGS('three') + ' ' + RAD],
    errors: ['A vector that isn\'t a column of three.', 'Coordinates with units.'],
    example: ['\\mathrm{cyl2xyz}\\left(2,\\frac{\\pi }{2},3\\right)='],
  },
  {
    name: 'logspace', group: G, usage: 'logspace(min, max, npts)', mathcad: true,
    summary: 'A vector of npts points from min to max, spaced evenly in their logarithm.',
    details: ['Both ends are included: logspace(1, 1000, 4) is 1, 10, 100, 1000. min and max are positive and in the same units, which the points keep, and min can be above max. With npts = 1 the point is NaN, as in Mathcad. See also [[logpts]].'],
    errors: ['A min or max of 0 or less.', 'min and max in different units.', 'An npts that isn\'t a positive whole number.'],
    example: ['\\mathrm{logspace}\\left(1,1000,4\\right)=', '\\mathrm{logspace}\\left(10\\cdot \\mathrm{Hz},10\\cdot \\mathrm{kHz},4\\right)='],
  },
  {
    name: 'logpts', group: G, usage: 'logpts(minexp, dec, dnpts)', mathcad: true,
    summary: 'dec decades of points from 10^minexp, dnpts in each decade, spaced evenly within it.',
    details: ['Within a decade the points step evenly, not logarithmically, as Mathcad\'s do: logpts(0, 1, 3) is 1, 4, 7, and logpts(−1, 1, 9) is 0.1, 0.2, … 0.9. The first point of the next decade isn\'t included. For points spaced evenly on a log scale, see [[logspace]].'],
    errors: ['A dec or dnpts that isn\'t a positive whole number.'],
    example: ['\\mathrm{logpts}\\left(0,1,3\\right)=', '\\mathrm{logpts}\\left(0,2,2\\right)='],
  },
  {
    name: 'CreateMesh', group: G, usage: 'CreateMesh(F, [s0, s1, t0, t1], [sgrid, tgrid], [fmap])', mathcad: true,
    summary: 'The x, y and z of a surface on a grid of its two parameters, for a 3D plot.',
    details: [
      'F is a function of two parameters, s and t, giving a vector (x, y, z), as a torus or a sphere; or giving one value, a height z over x = s, y = t; or three functions, one each for x, y and z. Give the functions by name, without their arguments.',
      's runs from s0 to s1 down the rows and t from t0 to t1 along the columns, sgrid and tgrid points each, ends included; the defaults are −5 to 5 and 20 points. The limits can be left out while the grid is given. fmap, if given, is a function of the three coordinates that gives the point to use, for another coordinate system.',
      'The answer is the three matrices X, Y and Z in a vector, held in a 1 × 1 array, as Mathcad gives it: a surface plot draws it as it is. For a curve, see [[CreateSpace]].',
    ],
    errors: ['A function that doesn\'t take two parameters.', 'Limits that aren\'t s0, s1, t0, t1, or a grid that isn\'t two positive whole numbers.'],
    example: ['G\\left(s,t\\right)\\coloneq s\\cdot t', '\\mathrm{CreateMesh}\\left(G,0,1,0,1,2,3\\right)='],
  },
  {
    name: 'CreateSpace', group: G, usage: 'CreateSpace(F, [t0, t1], [tgrid], [fmap])', mathcad: true,
    summary: 'The x, y and z of a curve at points along its parameter, for a 3D plot.',
    details: [
      'F is a function of one parameter, t, giving a vector (x, y, z), as a helix; or three functions, one each for x, y and z. A single function giving one value makes x = y = t and z its value, as in Mathcad. Give the functions by name.',
      't runs from t0 to t1 in tgrid points, ends included; the defaults are −5 to 5 and 20 points. fmap, if given, maps each point, as in [[CreateMesh]].',
      'The answer is three vectors held in a 1 × 1 array, as Mathcad gives it; a surface plot draws them as a curve in space.',
    ],
    errors: ['A function that doesn\'t take one parameter.', 'A grid that isn\'t a positive whole number.'],
    example: ['H\\left(t\\right)\\coloneq \\begin{pmatrix}\\cos \\left(t\\right)\\\\\\sin \\left(t\\right)\\\\t\\end{pmatrix}', '\\mathrm{CreateSpace}\\left(H,0,\\pi ,3\\right)='],
  },
  {
    name: 'PolyLookup', group: 'Plots and coordinates', usage: 'PolyLookup(n)', mathcad: true,
    summary: 'The name of uniform polyhedron n, the name of its dual and its Wythoff symbol, as a vector of three strings.',
    details: [
      'n is 1 to 80, or a string "#n", numbered as Mathcad numbers them: 11 is the cube, 27 the icosahedron, 6 the tetrahedron. The names are spelt as Mathcad gives them. [[Polyhedron]] draws any of them in a surface plot.',
    ],
    errors: ['A number outside 1 to 80.'],
    example: ['\\mathrm{PolyLookup}\\left(11\\right)=', '\\mathrm{PolyLookup}\\left(\\text{"#27"}\\right)='],
  },
  {
    name: 'Polyhedron', group: 'Plots and coordinates', usage: 'Polyhedron("name")', mathcad: true,
    summary: 'Draws a uniform polyhedron, or its dual, in a surface plot: put Polyhedron("cube") in the plot\'s placeholder.',
    details: [
      'The string is a polyhedron\'s name, in any case, as "snub cube"; its dual\'s name, as "rhombic dodecahedron"; "#n" for number n, 1 to 80, numbered as [[PolyLookup]] numbers them; or its Wythoff symbol written exactly as PolyLookup gives it, as "3|2 4". Mathcad accepts these and nothing else, so a symbol spaced differently, or one outside the 80 such as "2 7|2", draws nothing.',
      'It is drawn solid and lit, with its edges in dark lines, in one blue as Mathcad draws it; with a colour map from Format → Color map…, each kind of face takes its own colour. Drag it to turn it. The star polyhedra\'s faces pass through each other, as they should. A dual whose polyhedron has faces through the centre has vertices at infinity, so its faces run out as long prisms, cut off.',
      'Polyhedron itself gives back its string, as Mathcad\'s does; the plot draws the polyhedron the string names, so a variable holding the string, or the string alone, draws it too. It is built by Wythoff\'s construction, and matches Kaleido, the program Mathcad\'s numbering comes from, in every polyhedron\'s vertices, edges, faces and vertex figure.',
    ],
    errors: ['A number rather than a string.', 'In a plot, a string that names no polyhedron.', 'In a contour plot.'],
    example: ['\\mathrm{Polyhedron}\\left(\\text{"#11"}\\right)=', '\\mathrm{PolyLookup}\\left(34\\right)='],
  },
  {
    name: 'SaveColormap', group: 'Plots and coordinates', usage: 'SaveColormap("name", M)', mathcad: true,
    summary: 'Adds M to the worksheet as a colour map called name, for the surface and contour plots below it, and gives its number of rows.',
    details: [
      'M has 3 columns, red, green and blue from 0 to 255, and a row for each colour, the lowest heights\' first; between rows the colours blend. Values are cut to whole numbers and held to 0..255, as Mathcad does. Choose the map for a plot with Format → Color map….',
      'Mathcad keeps a colour map as a file in its own folder; MathMath keeps it in the worksheet, from the region down, and offers it as Mathcad\'s name.cmp file to save, which Mathcad reads.',
    ],
    errors: ['A matrix without 3 columns, or with fewer than 2 rows.', 'Values with units, or complex ones.', 'A name with a folder in it.'],
    example: ['M\\coloneq \\begin{pmatrix}0&0&80\\\\0&160&0\\\\255&255&255\\end{pmatrix}', '\\mathrm{SaveColormap}\\left(\\text{"sea"},M\\right)=', '\\mathrm{LoadColormap}\\left(\\text{"sea"}\\right)='],
  },
  {
    name: 'LoadColormap', group: 'Plots and coordinates', usage: 'LoadColormap("name")', mathcad: true,
    summary: 'A colour map\'s colours, as a matrix of red, green and blue rows from 0 to 255, lowest heights first.',
    details: [
      'The map is one saved above with [[SaveColormap]], an attached Mathcad name.cmp file, or one of MathMath\'s own: ramp (the default, light to dark blue), gray, spectrum, viridis and heat. Names match whatever their case, as Mathcad\'s do. Mathcad\'s own map files, as Fire or Royal, need attaching from a Mathcad installation\'s cmaps folder.',
    ],
    errors: ['A name that is none of these: attach name.cmp with Files.'],
    example: ['\\mathrm{LoadColormap}\\left(\\text{"gray"}\\right)='],
  },
];
