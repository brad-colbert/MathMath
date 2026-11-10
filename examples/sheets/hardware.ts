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

const q = (s: string): string => `\\text{"${s}"}`;
const CATALOGUE = [
  [q('M8x40'), '50', '12.40'], [q('M8x60'), '50', '14.90'], [q('M10x80'), '25', '13.60'],
  [q('M10x100'), '25', '15.80'], [q('W8'), '100', '4.20'], [q('W10'), '100', '5.10'],
].map((r) => r.join('&')).join('\\\\');

export const hardware: Example = {
  slug: 'hardware',
  title: 'Ordering by the box',
  summary: 'A parts table of strings and numbers: looking parts up, rounding up to whole boxes, and writing the order as text.',
  build(s) {
    s.text('Ordering by the box. The bolts and washers for a garden shed, bought from a catalogue that sells them only in boxes. Strings sit in worksheets beside numbers: type " in math to start one, and " again to end it.');
    s.section('The catalogue: each row a part code, how many come in a box, and the price of a box in dollars.', true);
    s.row({ latex: `C\\coloneq \\begin{pmatrix}${CATALOGUE}\\end{pmatrix}` }, { latex: '\\mathrm{vlookup}\\left(\\text{"M10x100"},C,2\\right)=', x: 220 });
    s.text('vlookup finds the rows whose first column holds a value and gives back another of their columns, here the price. It gives a vector, since more than one row can match; match says where a value is, as a row and a column.', { width: 440 });
    s.row({ latex: '\\mathrm{match}\\left(\\text{"W8"},C\\right)=', rows: 2 }, { latex: '\\mathrm{box}\\left(c\\right)\\coloneq \\mathrm{vlookup}\\left(c,C,1\\right)_{0}', x: 170 }, { latex: '\\mathrm{price}\\left(c\\right)\\coloneq \\mathrm{vlookup}\\left(c,C,2\\right)_{0}', x: 340 });

    s.section('What the drawings call for: a code and a count for each part.');
    s.row({ latex: `N\\coloneq \\begin{pmatrix}${[q('M8x60'), q('M10x100'), q('W8'), q('W10')].join('\\\\')}\\end{pmatrix}` }, { latex: 'Q\\coloneq \\begin{pmatrix}64\\\\30\\\\128\\\\60\\end{pmatrix}', x: 130 }, { latex: 'k\\coloneq 0..3', x: 230 });
    s.text('Ceil(x, y) rounds x up to a multiple of y, so the bolts and washers we need, rounded up to whole boxes, then the boxes and what they cost:');
    s.row(
      { latex: 'B_{k}\\coloneq \\frac{\\mathrm{Ceil}\\left(Q_{k},\\mathrm{box}\\left(N_{k}\\right)\\right)}{\\mathrm{box}\\left(N_{k}\\right)}' },
      { latex: 'B=', rows: 4, x: 170 },
      { latex: '\\mathrm{cost}\\coloneq \\sum_{k}B_{k}\\cdot \\mathrm{price}\\left(N_{k}\\right)', x: 260 },
      { latex: '\\mathrm{cost}=', x: 420 },
    );
    s.text('With 8.25% sales tax, rounded to the cent: Round(x, y) rounds to the nearest multiple of y.');
    s.math('\\mathrm{Round}\\left(1.0825\\cdot \\mathrm{cost},0.01\\right)=');

    s.section('The order, as text. concat joins strings, and num2str turns a number into one.');
    s.row(
      { latex: 'O_{k}\\coloneq \\mathrm{concat}\\left(\\mathrm{num2str}\\left(B_{k}\\right),\\text{" × "},N_{k},\\text{", "},\\mathrm{num2str}\\left(B_{k}\\cdot \\mathrm{box}\\left(N_{k}\\right)\\right),\\text{" in all"}\\right)' },
    );
    s.math('O=', { rows: 4 });

    s.section('Reading the code. A bolt\'s code is M, its diameter, x, and its length, in millimetres. search finds the x, substr cuts out the digits on each side, and str2num reads them as numbers.');
    s.row(
      { latex: 'd\\left(c\\right)\\coloneq \\mathrm{str2num}\\left(\\mathrm{substr}\\left(c,1,\\mathrm{search}\\left(c,\\text{"x"},0\\right)-1\\right)\\right)\\cdot \\mathrm{mm}' },
    );
    s.math('\\mathrm{len}\\left(c\\right)\\coloneq \\mathrm{str2num}\\left(\\mathrm{substr}\\left(c,\\mathrm{search}\\left(c,\\text{"x"},0\\right)+1,10\\right)\\right)\\cdot \\mathrm{mm}');
    s.row({ latex: 'd\\left(\\text{"M10x100"}\\right)=', unit: '\\mathrm{mm}' }, { latex: '\\mathrm{len}\\left(\\text{"M10x100"}\\right)=', unit: '\\mathrm{mm}', x: 170 });
    s.text('Is the M10 long enough? It goes through two 38 mm timbers with a 2 mm washer under its head and another under an 8 mm nut, and should stick out a few millimetres past the nut:');
    s.row({ latex: '\\mathrm{len}\\left(\\text{"M10x100"}\\right)-\\left(2\\cdot 38\\cdot \\mathrm{mm}+2\\cdot 2\\cdot \\mathrm{mm}+8\\cdot \\mathrm{mm}\\right)=', unit: '\\mathrm{mm}' });
    s.text('12 mm to spare, where the cheaper M10x80 would be 8 mm short. Change the counts in Q, or add a row to the catalogue, and the order rewrites itself.', { end: true });
  },
};
