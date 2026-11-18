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

const A = 'Arithmetic and functions';
const SHOW = 'To show a result in the format, type its name in the result\'s unit placeholder, the blank after the answer. ';

export const FORMATS: Entry[] = [
  {
    name: 'DMS', group: A, usage: 'DMS(v), DMS(d, m, s)', mathcad: true,
    summary: 'An angle given in degrees, minutes and seconds, in radians.',
    details: [
      'v is a vector of degrees, minutes and seconds, or the three are given as separate numbers: the angle is d + m/60 + s/3600 degrees. Each part keeps its own sign, so DMS(−10, 30, 0) is −9.5°; give all three negative for −10° 30′.',
      `${SHOW}The answer then shows as a vector of degrees, minutes and seconds, each with the angle's sign.`,
    ],
    units: 'The parts have no units; the answer is in radians, which have none.',
    errors: ['A vector of more than three elements.', 'Parts with units.'],
    example: ['\\mathrm{DMS}\\left(10,30,36\\right)=', '\\frac{\\mathrm{DMS}\\left(\\begin{pmatrix}45\\\\0\\\\0\\end{pmatrix}\\right)}{\\mathrm{deg}}='],
  },
  {
    name: 'FIF', group: A, usage: 'FIF("ft\' in-p/q\\""), FIF(ft, in, frac)', mathcad: true,
    summary: 'A length given in feet, inches and a fraction of an inch.',
    details: [
      'The string is as a builder writes it: "9\' 6-1/4\\"" is 9 feet 6¼ inches. Any part may be left out, as "6-1/4" or "9\'"; a space can stand for the dash, the closing " is optional, and a − in front negates the whole. Numbers in the string are whole: write 9\' 6" rather than 9.5\'. Or give feet, inches and the fraction of an inch as three numbers.',
      `${SHOW}The answer then shows as a string of feet and inches, with the nearest fraction of an inch whose denominator is 256 or less: 3.14159 inches is 0' 3-16/113".`,
    ],
    units: 'The answer is a length. The three numbers have no units.',
    errors: ['A string not in the form n\' n-n/n", as one with a decimal point.', 'Numbers with units.'],
    example: ['\\mathrm{FIF}\\left(\\text{"9\' 6-1/4\\""}\\right)=', '\\mathrm{FIF}\\left(9,6,0.25\\right)='],
  },
  {
    name: 'hhmmss', group: A, usage: 'hhmmss("hh:mm:ss.sss"), hhmmss(h, m, s)', mathcad: true,
    summary: 'A time given in hours, minutes and seconds.',
    details: [
      'The string needs all three parts, separated by colons, as "1:02:03.5"; the parts may run over, as "0:90:00" for an hour and a half, and a − in front negates the whole. Or give the three as numbers, which are added as they are.',
      `${SHOW}The answer then shows as a string, the seconds to 3 decimals: 3723.5 s is "1:2:3.5".`,
    ],
    units: 'The answer is a time. The three numbers have no units.',
    errors: ['A string without exactly three parts, or with spaces.', 'Numbers with units.'],
    example: ['\\mathrm{hhmmss}\\left(\\text{"1:02:03.5"}\\right)=', '\\mathrm{hhmmss}\\left(0,90,0\\right)='],
  },
  {
    name: 'time', group: A, usage: 'time(z)', mathcad: true,
    summary: 'The time on the computer\'s clock, in seconds since 1970, for timing a calculation.',
    details: [
      'z can be anything: it only makes time wait for what it depends on. Take time before and after a long calculation, and subtract. The clock reads to the millisecond.',
      'A region with time calculates again only when something it depends on changes.',
    ],
    units: 'The answer has no units: multiply by s for a time.',
    example: ['t_{0}\\coloneq \\mathrm{time}\\left(0\\right)'],
  },
];
