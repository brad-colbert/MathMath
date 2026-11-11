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

export const stairs: Example = {
  slug: 'stairs',
  title: 'A staircase in feet and inches',
  summary: 'Laying out a stair from a builder\'s tape: risers and treads in feet, inches and fractions, the stringer\'s angle in degrees and minutes, and the time to cut it.',
  build(s) {
    s.text('A staircase in feet and inches. FIF reads a length as a builder writes it, and FIF in a result\'s unit placeholder shows a length that way, to the nearest fraction of an inch. DMS and hhmmss do the same for angles and times.');
    s.section('The floor-to-floor rise, taped at 9\' 6-1/4", and the tallest riser the code allows, 7-3/4".', true);
    s.row({ latex: 'H\\coloneq \\mathrm{FIF}\\left(\\text{"9\' 6-1/4\\""}\\right)' }, { latex: 'r_{\\text{max}}\\coloneq \\mathrm{FIF}\\left(\\text{"7-3/4"}\\right)', x: 230 }, { latex: 'H=', x: 400 });
    s.section('The number of risers, and each one\'s height: the rise shared equally, shown in feet and inches.');
    s.row('n\\coloneq \\mathrm{ceil}\\left(\\frac{H}{r_{\\text{max}}}\\right)', { latex: 'n=', x: 140 }, { latex: 'r\\coloneq \\frac{H}{n}', x: 230 }, { latex: 'r=', unit: '\\mathrm{FIF}', x: 360 });
    s.text('Fifteen risers of 7-37/60", a hair under 7-5/8" on the tape: FIF shows the closest fraction with a denominator up to 256, not the nearest sixteenth. In inches, and checked against the rise:');
    s.row({ latex: 'r=', unit: '\\mathrm{in}' }, { latex: 'n\\cdot r-H=', x: 230 });
    s.section('The run: one tread fewer than the risers, each 10" deep. Then the stringer, the board the steps are cut from, and its slope.');
    s.row('t\\coloneq \\mathrm{FIF}\\left(0,10,0\\right)', { latex: 'L\\coloneq \\left(n-1\\right)\\cdot t', x: 200 }, { latex: 'L=', unit: '\\mathrm{FIF}', x: 360 });
    s.row('S\\coloneq \\sqrt{L^{2}+H^{2}}', { latex: 'S=', unit: '\\mathrm{FIF}', x: 200 }, { latex: '\\theta \\coloneq \\mathrm{atan}\\left(\\frac{H}{L}\\right)', x: 360 });
    s.row({ latex: '\\theta =', unit: '\\mathrm{DMS}', rows: 3 }, { latex: '\\theta =', unit: '\\mathrm{deg}', x: 230 });
    s.text('DMS shows the angle as degrees, minutes and seconds: the stringer rises at 39° 13′. The carpenter\'s rule of thumb for a comfortable step is a riser plus a tread of about 17-1/2":');
    s.row({ latex: 'r+t=', unit: '\\mathrm{FIF}' });
    s.section('The time to build it: 25 minutes to mark and cut each stringer, three stringers, and 6-1/2 minutes to fit each tread.');
    s.row('T\\coloneq 3\\cdot \\mathrm{hhmmss}\\left(0,25,0\\right)+\\left(n-1\\right)\\cdot \\mathrm{hhmmss}\\left(\\text{"0:06:30"}\\right)', { latex: 'T=', unit: '\\mathrm{hhmmss}', x: 400 });
    s.text('2 hours 46 minutes, shown as hours, minutes and seconds. hhmmss reads "h:mm:ss" strings, or three numbers.', { end: true });
  },
};
