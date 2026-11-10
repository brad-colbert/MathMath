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

const TIMES = '0&2&4&6&8&10&12&14&16&18&20&22&24&26&28&30'.replaceAll('&', '\\\\');
// Invented readings: 22 °C room, 90 °C start, an 18-minute time constant, and a little noise.
const TEMPS = '89.9&83.1&76.4&70.6&65.2&60.9&57.4&53.4&50.4&47.1&44.5&42.1&39.3&38.4&36.6&35.0'.replaceAll('&', '\\\\');

export const cooling: Example = {
  slug: 'cooling',
  title: 'Fitting a cooling curve',
  summary: 'Coffee readings fitted with a line, an exponential and a model of our own, and when it will be cool enough to drink.',
  build(s) {
    s.text('Fitting a cooling curve. A thermometer in a cup of coffee, read every two minutes for half an hour. Which curve describes it, and what does each say about the hour and a half after?');
    s.section('The readings: time in minutes and temperature in °C, as plain numbers, since the fitting functions take numbers without units.', true);
    s.row({ latex: `t\\coloneq \\begin{pmatrix}${TIMES}\\end{pmatrix}` }, { latex: `T\\coloneq \\begin{pmatrix}${TEMPS}\\end{pmatrix}`, x: 110 });

    s.section('A straight line first: line gives its intercept and slope, and stderr how far, typically, the readings lie from it.');
    s.row({ latex: 'L\\coloneq \\mathrm{line}\\left(t,T\\right)' }, { latex: 'L=', rows: 2, x: 150 }, { latex: '\\mathrm{stderr}\\left(t,T\\right)=', x: 300 });
    s.text('Nearly 4 °C off on average, and the misses are not random: the line runs above the readings in the middle and below them at the ends. The data bends.');

    s.section('An exponential. expfit fits a·e^(b·x) + c, and finds a starting guess itself. c is the temperature it settles to, the room, and −1/b its time constant.');
    s.row({ latex: 'E\\coloneq \\mathrm{expfit}\\left(t,T\\right)' }, { latex: 'E=', rows: 3, x: 150 }, { latex: 'f\\left(x\\right)\\coloneq E_{0}\\cdot e^{E_{1}\\cdot x}+E_{2}', x: 280 });
    s.row({ latex: '-\\frac{1}{E_{1}}=' }, { latex: 'r\\coloneq T-\\overrightarrow{f\\left(t\\right)}', x: 150 }, { latex: '\\sqrt{\\frac{r\\cdot r}{\\mathrm{length}\\left(t\\right)-3}}=', x: 300 });
    s.text('Less than a tenth of the line\'s error: what is left is the thermometer\'s own scatter.');

    s.section('A model of our own. Newton\'s law of cooling in the terms we care about: the room temperature, the starting temperature and the time constant. genfit takes the model with its parameters one by one, and a guess for each.');
    s.row(
      { latex: 'N\\left(x,T_{\\text{room}},T_{\\text{start}},\\tau \\right)\\coloneq T_{\\text{room}}+\\left(T_{\\text{start}}-T_{\\text{room}}\\right)\\cdot e^{-\\frac{x}{\\tau }}' },
      { latex: 'p\\coloneq \\mathrm{genfit}\\left(t,T,\\begin{pmatrix}20\\\\100\\\\10\\end{pmatrix},N\\right)', x: 290 },
    );
    s.row({ latex: 'p=', rows: 3 }, { latex: 'g\\left(x\\right)\\coloneq N\\left(x,p_{0},p_{1},p_{2}\\right)', x: 150 });
    s.text('The same curve as expfit\'s, since it is the same family, but its parameters read off directly. The readings came from a 22 °C room, a 90 °C start and an 18-minute time constant, plus noise.');

    s.section('Inside and outside the data. Left, the readings in red with the line, gray, and the exponential, blue. Right, the next hour and a half: the exponential, blue, and a quadratic from regress, orange, for comparison: inside the readings it fits them well, but just past them it turns and heats the coffee up again.');
    s.row('Q\\coloneq \\mathrm{regress}\\left(t,T,2\\right)', 'h\\left(x\\right)\\coloneq \\mathrm{interp}\\left(Q,t,T,x\\right)', 'm\\coloneq 0..90');
    s.plots(
      {
        x: 't', ys: ['L_{0}+L_{1}\\cdot t', '\\overrightarrow{f\\left(t\\right)}', 'T'], width: 230, height: 160,
        traces: [{ color: '#6b7280', line: 'dash', weight: 2, points: 'none' }, { color: '#2563eb', line: 'solid', weight: 2, points: 'none' }, { color: '#dc2626', line: 'none', points: 'circle' }],
      },
      {
        x: 'm', ys: ['g\\left(m\\right)', 'h\\left(m\\right)'], width: 230, height: 160, yMin: '0', yMax: '100',
        traces: [{ color: '#2563eb', line: 'solid', weight: 2, points: 'none' }, { color: '#d97706', line: 'dash', weight: 2, points: 'none' }],
      },
    );

    s.section('When can I drink it? Below about 60 °C. root finds where the fitted model crosses it, and where the coffee gets to within a degree of the room.');
    s.row(
      { latex: 'x_{\\text{60}}\\coloneq \\mathrm{root}\\left(g\\left(x\\right)-60,x,0,60\\right)' }, { latex: 'x_{\\text{60}}=', x: 220 },
      { latex: '-p_{2}\\cdot \\ln \\left(\\frac{1}{p_{1}-p_{0}}\\right)=', x: 340 },
    );
    s.text('About ten and a half minutes to drink it, and over an hour to reach the room. Try a 30-minute guess for τ, or a degree-3 regress, and see what changes.', { end: true });
  },
};
