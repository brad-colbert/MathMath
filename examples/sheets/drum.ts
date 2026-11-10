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

export const drum: Example = {
  slug: 'drum',
  title: 'A drumhead and Bessel functions',
  summary: 'A drumhead\'s modes from the zeros of Bessel functions, and Γ giving the volume of a ball in n dimensions.',
  build(s) {
    s.text('A drumhead and Bessel functions. A string vibrates at whole multiples of its lowest frequency, which is why it sounds a clear note. A round drumhead does not: its modes are set by the zeros of Bessel functions, and those aren\'t evenly spaced.');
    s.section('Bessel functions of the first kind: J0, and Jn(n, x) for J1 and J2. Each wobbles like a cosine whose swing dies away as 1/√x; J0 is 1 at the centre, and the others start at 0.', true);
    s.row('x\\coloneq 0,0.1..20', { latex: 'J0\\left(2.4048\\right)=', x: 150 }, { latex: '\\mathrm{Jn}\\left(1,3.8317\\right)=', x: 300 });
    s.plot(
      { x: 'x', ys: ['J0\\left(x\\right)', '\\mathrm{Jn}\\left(1,x\\right)', '\\mathrm{Jn}\\left(2,x\\right)'], width: 300, height: 160, yMin: '-1', yMax: '1', traces: [{ color: '#2563eb', weight: 2 }, { color: '#d97706', weight: 2 }, { color: '#6b7280', weight: 2 }] },
      { text: 'Blue J0, orange J1, gray J2. The drum\'s edge is held still, so a mode has to put a zero of J at the rim.', x: 330 },
    );

    s.section('The drum: a 30 cm head, its tension τ per unit length and its mass σ per unit area set the speed waves cross it.');
    s.row('a\\coloneq 15\\cdot \\mathrm{cm}', '\\tau \\coloneq 2000\\cdot \\frac{\\mathrm{N}}{\\mathrm{m}}', '\\sigma \\coloneq 0.25\\cdot \\frac{\\mathrm{kg}}{\\mathrm{m}^{2}}', 'c\\coloneq \\sqrt{\\frac{\\tau }{\\sigma }}', { latex: 'c=', unit: '\\frac{\\mathrm{m}}{\\mathrm{s}}' });
    s.text('root finds the first zeros, each from an interval it lies in. Mode (0, 1) bulges as a whole, (1, 1) rocks side to side with one still line across it, and (0, 2) has a still ring:');
    s.row(
      { latex: 'z_{\\text{01}}\\coloneq \\mathrm{root}\\left(J0\\left(u\\right),u,2,3\\right)' },
      { latex: 'z_{\\text{11}}\\coloneq \\mathrm{root}\\left(\\mathrm{Jn}\\left(1,u\\right),u,3,5\\right)', x: 170 },
      { latex: 'z_{\\text{02}}\\coloneq \\mathrm{root}\\left(J0\\left(u\\right),u,5,6\\right)', x: 340 },
    );
    s.row({ latex: 'F\\left(z\\right)\\coloneq \\frac{z\\cdot c}{2\\cdot \\pi \\cdot a}' }, { latex: 'F\\left(z_{\\text{01}}\\right)=', unit: '\\mathrm{Hz}', x: 120 }, { latex: '\\frac{z_{\\text{11}}}{z_{\\text{01}}}=', x: 260 }, { latex: '\\frac{z_{\\text{02}}}{z_{\\text{01}}}=', x: 380 });
    s.text('The overtones sit at 1.59 and 2.30 times the fundamental, not 2 and 3. That is the drum\'s thud. The shapes, across a diameter from the rim through the centre to the rim:');
    s.row('r\\coloneq -a,-0.98\\cdot a..a');
    s.plot(
      {
        x: 'r', ys: ['J0\\left(\\frac{z_{\\text{01}}\\cdot \\left|r\\right|}{a}\\right)', '\\mathrm{Jn}\\left(1,\\frac{z_{\\text{11}}\\cdot r}{a}\\right)', 'J0\\left(\\frac{z_{\\text{02}}\\cdot \\left|r\\right|}{a}\\right)'],
        width: 300, height: 150, xUnit: '\\mathrm{cm}', traces: [{ color: '#2563eb', weight: 2 }, { color: '#d97706', weight: 2 }, { color: '#16a34a', weight: 2 }],
      },
      { text: 'Blue (0, 1), orange (1, 1), green (0, 2). J1 is odd, so (1, 1) goes up on one side as it goes down on the other.', x: 330 },
    );

    s.section('Γ, the factorial for any number. Γ(n + 1) = n!, and Γ(1/2) is √π. It gives the volume of a ball of radius 1 in n dimensions, which grows, peaks near five dimensions, and then shrinks towards nothing.');
    s.row({ latex: '\\Gamma \\left(5\\right)=' }, { latex: '\\Gamma \\left(0.5\\right)^{2}=', x: 100 }, { latex: 'V\\left(n\\right)\\coloneq \\frac{\\pi ^{\\frac{n}{2}}}{\\Gamma \\left(\\frac{n}{2}+1\\right)}', x: 230 }, { latex: 'V\\left(3\\right)=', x: 380 });
    s.row('n\\coloneq 0..20', 'n_{\\text{max}}\\coloneq \\mathrm{root}\\left(\\frac{\\mathrm{d}}{\\mathrm{d}u}V\\left(u\\right),u,4,6\\right)', { latex: 'n_{\\text{max}}=', x: 380 });
    s.plot(
      { x: 'n', ys: ['V\\left(n\\right)'], width: 300, height: 150, traces: [{ color: '#2563eb', line: 'solid', weight: 2, points: 'circle' }] },
      { text: 'V(3) is 4π/3, the sphere we know. Treating n as any real number, the peak is at 5.26 dimensions.', x: 330 },
    );
  },
};
