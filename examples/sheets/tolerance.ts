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

const col = (m: string, k: number): string => `${m}^{\\langle ${k}\\rangle }`;

export const tolerance: Example = {
  slug: 'tolerance',
  title: 'Ten thousand voltage dividers',
  summary: 'Worst case or Monte Carlo? Random parts, statistics and a histogram for a divider built from 5% resistors.',
  build(s) {
    s.text('Ten thousand voltage dividers. A sensor needs 1.6 V, made from a 5 V supply by two resistors of 5% tolerance. The worst case says how far off a board could be; a Monte Carlo run says how far off boards actually are.');
    s.section('The design.', true);
    s.row('V_{\\text{s}}\\coloneq 5\\cdot \\mathrm{V}', 'R_{\\text{1}}\\coloneq 10\\cdot k\\Omega', 'R_{\\text{2}}\\coloneq 4.7\\cdot k\\Omega', 't\\coloneq 0.05');
    s.row(
      { latex: 'V_{\\text{out}}\\left(a,b\\right)\\coloneq V_{\\text{s}}\\cdot \\frac{b}{a+b}' },
      { latex: 'V_{\\text{nom}}\\coloneq V_{\\text{out}}\\left(R_{\\text{1}},R_{\\text{2}}\\right)', x: 220 }, { latex: 'V_{\\text{nom}}=', x: 380 },
    );

    s.section('Worst case. Every part at the edge of its tolerance, in the direction that hurts.');
    s.row(
      { latex: 'V_{\\text{lo}}\\coloneq V_{\\text{out}}\\left(R_{\\text{1}}\\cdot \\left(1+t\\right),R_{\\text{2}}\\cdot \\left(1-t\\right)\\right)' }, { latex: 'V_{\\text{lo}}=', x: 260 },
      { latex: '\\frac{V_{\\text{lo}}}{V_{\\text{nom}}}-1=', x: 380 },
    );
    s.row(
      { latex: 'V_{\\text{hi}}\\coloneq V_{\\text{out}}\\left(R_{\\text{1}}\\cdot \\left(1-t\\right),R_{\\text{2}}\\cdot \\left(1+t\\right)\\right)' }, { latex: 'V_{\\text{hi}}=', x: 260 },
      { latex: '\\frac{V_{\\text{hi}}}{V_{\\text{nom}}}-1=', x: 380 },
    );

    s.section('Monte Carlo. Real parts scatter: take each resistor as normal, with its tolerance at three standard deviations, and build ten thousand boards. The arrow over Vout applies it board by board.');
    s.row('n\\coloneq 10000', 'r_{\\text{1}}\\coloneq R_{\\text{1}}\\cdot \\mathrm{rnorm}\\left(n,1,\\frac{t}{3}\\right)', 'r_{\\text{2}}\\coloneq R_{\\text{2}}\\cdot \\mathrm{rnorm}\\left(n,1,\\frac{t}{3}\\right)');
    s.math('v\\coloneq \\overrightarrow{V_{\\text{out}}\\left(r_{\\text{1}},r_{\\text{2}}\\right)}');
    s.row(
      { latex: '\\mu \\coloneq \\mathrm{mean}\\left(v\\right)' }, '\\mu =', { latex: '\\sigma \\coloneq \\mathrm{stdev}\\left(v\\right)' }, { latex: '\\sigma =', unit: '\\mathrm{mV}' },
    );
    s.text('The worst case is about ±7%, but most boards are much closer. What fraction falls outside ±2% of nominal, and how far out do the extremes of ten thousand get?');
    s.row(
      { latex: '\\mathrm{mean}\\left(\\overrightarrow{\\left|v-V_{\\text{nom}}\\right|>0.02\\cdot V_{\\text{nom}}}\\right)=' },
      { latex: '\\mathrm{min}\\left(v\\right)=', x: 260 }, { latex: '\\mathrm{max}\\left(v\\right)=', x: 380 },
    );

    s.page();
    s.section('The spread. A histogram of the boards, with the normal curve of the same mean and standard deviation.', true);
    s.row(
      { latex: 'H\\coloneq \\mathrm{histogram}\\left(40,\\frac{v}{\\mathrm{V}}\\right)' }, { latex: 'x\\coloneq ' + col('H', 0) },
      { latex: '\\Delta \\coloneq x_{1}-x_{0}' },
    );
    s.math('g\\left(x\\right)\\coloneq n\\cdot \\Delta \\cdot \\mathrm{dnorm}\\left(x,\\frac{\\mu }{\\mathrm{V}},\\frac{\\sigma }{\\mathrm{V}}\\right)');
    s.plot(
      {
        x: 'x', ys: [col('H', 1), '\\overrightarrow{g\\left(x\\right)}'], width: 300, height: 170, yTitle: 'boards',
        traces: [{ color: '#2563eb', line: 'none', points: 'circle' }, { color: '#d97706', line: 'solid', weight: 2 }],
      },
      { text: 'Reroll on the toolbar builds a new ten thousand: the histogram shifts a little, the statistics hardly at all.', x: 340 },
    );
  },
};
