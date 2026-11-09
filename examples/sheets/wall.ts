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

const col = (...v: string[]): string => `\\begin{pmatrix}${v.join('\\\\')}\\end{pmatrix}`;
const K = '\\frac{\\mathrm{W}}{\\mathrm{m}\\cdot \\mathrm{K}}';
const RU = '\\frac{\\mathrm{m}^{2}\\cdot \\mathrm{K}}{\\mathrm{W}}';
/** The sum of the first j layers' values: before the j-th interface. */
const before = (v: string): string => `\\sum_{i=0}^{3}${v}_{i}\\cdot \\left(i<j\\right)`;

export const wall: Example = {
  slug: 'wall',
  title: 'Heat loss through a wall',
  summary: 'Layers in series, temperatures through the wall in °C, and how much insulation pays: vectors, sums and units.',
  build(s) {
    s.text('Heat loss through a wall. A house wall of four layers keeps a room at 20 °C on a −5 °C day. How much heat leaks through it, how cold is each layer, and how much would thicker insulation save in a year?');
    s.section('The layers, from inside to out: plasterboard, mineral wool, plywood and brick. Thickness and conductivity of each, as vectors.', true);
    s.row(
      { latex: `t\\coloneq ${col('13', '90', '12', '100')}\\cdot \\mathrm{mm}` },
      { latex: `k\\coloneq ${col('0.17', '0.04', '0.13', '0.7')}\\cdot ${K}`, x: 150 },
      { latex: 'R\\coloneq \\overrightarrow{\\frac{t}{k}}', x: 330 },
      { latex: 'R=', unit: RU, x: 410, rows: 4 },
    );
    s.text('Each layer resists heat in proportion to its thickness over its conductivity; the arrow divides element by element. Thin films of still air on each face add a little more, and the resistances add up in series:');
    s.row(
      { latex: `R_{\\text{in}}\\coloneq 0.13\\cdot ${RU}` }, { latex: `R_{\\text{out}}\\coloneq 0.04\\cdot ${RU}`, x: 150 },
      { latex: 'R_{\\text{wall}}\\coloneq R_{\\text{in}}+\\mathrm{sum}\\left(R\\right)+R_{\\text{out}}', x: 300 },
    );
    s.row(
      { latex: 'U\\coloneq \\frac{1}{R_{\\text{wall}}}' }, { latex: 'U=', unit: '\\frac{\\mathrm{W}}{\\mathrm{m}^{2}\\cdot \\mathrm{K}}', x: 120 },
    );

    s.section('The heat loss. °C turns a Celsius reading into a temperature to calculate with; a result shows in °C when you choose that unit.');
    s.row('T_{\\text{in}}\\coloneq \\mathrm{°C}\\left(20\\right)', 'T_{\\text{out}}\\coloneq \\mathrm{°C}\\left(-5\\right)', 'A\\coloneq 30\\cdot \\mathrm{m}^{2}');
    s.row(
      { latex: 'q\\coloneq U\\cdot \\left(T_{\\text{in}}-T_{\\text{out}}\\right)' }, { latex: 'q=', unit: '\\frac{\\mathrm{W}}{\\mathrm{m}^{2}}' },
      { latex: 'Q\\coloneq q\\cdot A' }, { latex: 'Q=', unit: '\\mathrm{W}' },
    );

    s.section('Inside the wall. The same heat flow crosses every layer, so the temperature drops in proportion to each one\'s resistance. Interface j comes after j layers; (i < j) is 1 for the layers before it.');
    s.row(
      'j\\coloneq 0..4',
      { latex: `x_{j}\\coloneq ${before('t')}`, x: 90 },
      { latex: `T_{j}\\coloneq T_{\\text{in}}-q\\cdot \\left(R_{\\text{in}}+${before('R')}\\right)`, x: 250 },
    );
    s.row({ latex: 'T=', unit: '\\mathrm{°C}', rows: 5 }, { latex: 'x=', unit: '\\mathrm{mm}', rows: 5, x: 130 });
    s.plot(
      { x: 'x_{j}', ys: ['T_{j}'], width: 240, height: 150, xUnit: '\\mathrm{mm}', yUnit: '\\mathrm{°C}', traces: [{ color: '#dc2626', line: 'solid', weight: 2, points: 'circle' }] },
      { text: 'Temperature through the wall, from the room on the left to outdoors on the right. Almost all the drop is across the wool: it does nearly all the work.', x: 280 },
    );

    s.section('Is more insulation worth it? A heating season of 3000 kelvin-days, with heat at 12 cents a kilowatt-hour. The cost of the wall each year, for wool of thickness d:');
    s.row('D\\coloneq 3000\\cdot \\mathrm{K}\\cdot \\mathrm{day}', '\\mathrm{price}\\coloneq \\frac{0.12}{\\mathrm{kWh}}');
    s.math('\\mathrm{cost}\\left(d\\right)\\coloneq \\frac{A\\cdot D\\cdot \\mathrm{price}}{R_{\\text{wall}}-R_{1}+\\frac{d}{k_{1}}}');
    s.row(
      { latex: '\\mathrm{cost}\\left(90\\cdot \\mathrm{mm}\\right)=' }, { latex: '\\mathrm{cost}\\left(200\\cdot \\mathrm{mm}\\right)=' },
      { latex: '\\mathrm{cost}\\left(0\\cdot \\mathrm{mm}\\right)=' },
    );
    s.row('d\\coloneq 0\\cdot \\mathrm{mm},5\\cdot \\mathrm{mm}..300\\cdot \\mathrm{mm}');
    s.plot(
      { x: 'd', ys: ['\\mathrm{cost}\\left(d\\right)'], width: 260, height: 150, xUnit: '\\mathrm{mm}', yMin: '0', traces: [{ color: '#2563eb', weight: 2 }] },
      { text: 'Dollars a year against wool thickness. The first few centimeters save the most; past about 150 mm each extra one buys little.', x: 300 },
    );
  },
};
