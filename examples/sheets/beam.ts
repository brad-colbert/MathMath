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

export const beam: Example = {
  slug: 'beam',
  title: 'How much does a bookshelf sag?',
  summary: 'Beam bending with units: the sag of a loaded shelf, plotted for two thicknesses, and the thickness root finds to keep it straight.',
  build(s) {
    s.text('How much does a bookshelf sag? A pine shelf rests on two brackets 900 mm apart and holds 50 kg of books. Beam theory gives the sag along it; we check it against a common limit and find how thick the board should be.');
    s.section('The shelf. E is the stiffness of pine along the grain, and the books are a load spread evenly along the span.', true);
    s.row('L\\coloneq 900\\cdot \\mathrm{mm}', 'b\\coloneq 250\\cdot \\mathrm{mm}', 'E\\coloneq 9\\cdot \\mathrm{GPa}', 'P\\coloneq 50\\cdot \\mathrm{kg}\\cdot g');
    s.row(
      { latex: 'w\\coloneq \\frac{P}{L}' }, { latex: 'w=', unit: '\\frac{\\mathrm{N}}{\\mathrm{m}}' },
      { latex: 'I\\left(h\\right)\\coloneq \\frac{b\\cdot h^{3}}{12}' }, { latex: 'I\\left(19\\cdot \\mathrm{mm}\\right)=', unit: '\\mathrm{mm}^{4}' },
    );
    s.text('I is the second moment of area of the board\'s cross-section, which grows with the cube of its thickness h.');

    s.section('The sag. For a simply supported beam under an even load, the deflection at a distance x from one end is:');
    s.math('y\\left(x,h\\right)\\coloneq \\frac{w\\cdot x\\cdot \\left(L^{3}-2\\cdot L\\cdot x^{2}+x^{3}\\right)}{24\\cdot E\\cdot I\\left(h\\right)}');
    s.row('x\\coloneq 0\\cdot \\mathrm{mm},10\\cdot \\mathrm{mm}..L');
    s.plot(
      {
        x: 'x', ys: ['-y\\left(x,19\\cdot \\mathrm{mm}\\right)', '-y\\left(x,25\\cdot \\mathrm{mm}\\right)'], width: 300, height: 150,
        xUnit: '\\mathrm{mm}', yUnit: '\\mathrm{mm}', traces: [{ color: '#2563eb', weight: 2 }, { color: '#16a34a', line: 'solid', weight: 2 }],
      },
      { text: 'Blue, a 19 mm board; green, 25 mm. A third more thickness more than halves the sag.', x: 340 },
    );

    s.section('Too much? A common limit is a sag of 1/360 of the span. The middle sags most:');
    s.row(
      { latex: 'y\\left(\\frac{L}{2},19\\cdot \\mathrm{mm}\\right)=', unit: '\\mathrm{mm}' },
      { latex: '\\frac{L}{360}=', unit: '\\mathrm{mm}', x: 250 },
    );
    s.text('Over the limit. root finds the thickness at which the sag in the middle is exactly L/360:');
    s.row(
      { latex: 'h_{\\text{min}}\\coloneq \\mathrm{root}\\left(y\\left(\\frac{L}{2},h\\right)-\\frac{L}{360},h,5\\cdot \\mathrm{mm},60\\cdot \\mathrm{mm}\\right)' },
      { latex: 'h_{\\text{min}}=', unit: '\\mathrm{mm}', x: 380 },
    );

    s.section('Will it break? The bending stress is greatest at the middle, on the board\'s top and bottom faces.');
    s.row(
      { latex: 'M\\coloneq \\frac{w\\cdot L^{2}}{8}' }, { latex: 'M=', unit: '\\mathrm{N}\\cdot \\mathrm{m}' },
      { latex: '\\sigma \\left(h\\right)\\coloneq \\frac{M\\cdot \\frac{h}{2}}{I\\left(h\\right)}' }, { latex: '\\sigma \\left(19\\cdot \\mathrm{mm}\\right)=', unit: '\\mathrm{MPa}' },
    );
    s.text('Pine breaks at around 40 MPa in bending, so the shelf is strong enough: stiffness, not strength, decides its thickness. Try it: change P, or L to 1200 mm, and see how fast the sag grows with the span.');
  },
};
