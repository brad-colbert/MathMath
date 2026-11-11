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

export const noisy: Example = {
  slug: 'noisy',
  title: 'Cleaning up a noisy signal',
  summary: 'Noisy readings smoothed three ways, an echo\'s delay found by correlation, wavelet compression, and a blurred picture.',
  build(s) {
    s.text('Cleaning up a noisy signal. A slow wave measured 128 times with noise on every reading. The noise here is made by formula, sin(1.7·k²), so the sheet gives the same numbers every time.');
    s.section('The readings, and the wave under them.', true);
    s.row('k\\coloneq 0..127', 'x_{k}\\coloneq \\frac{k}{8}', 'f\\left(x\\right)\\coloneq \\sin \\left(x\\right)+0.05\\cdot x', 'y_{k}\\coloneq f\\left(x_{k}\\right)+0.35\\cdot \\sin \\left(1.7\\cdot k^{2}\\right)');
    s.section('Three smoothers. medsmooth takes the median of each 7 readings; ksmooth averages them with Gaussian weights, b setting the width; supsmooth, Friedman\'s super smoother, chooses its own width point by point.');
    s.row('a\\coloneq \\mathrm{medsmooth}\\left(y,7\\right)', 'g\\coloneq \\mathrm{ksmooth}\\left(x,y,1.5\\right)', 'h\\coloneq \\mathrm{supsmooth}\\left(x,y\\right)');
    s.plot(
      {
        x: 'x_{k}', ys: ['y_{k}', 'g_{k}', 'h_{k}', 'f\\left(x_{k}\\right)'], width: 300, height: 170,
        traces: [{ color: '#9ca3af', line: 'none', points: 'circle' }, { color: '#2563eb', line: 'solid', weight: 2, points: 'none' }, { color: '#d97706', line: 'solid', weight: 2, points: 'none' }, { color: '#111827', line: 'dash', weight: 1, points: 'none' }],
      },
      { text: 'Gray: the readings. Blue: ksmooth. Orange: supsmooth. Dashed: the wave they came from.', x: 330 },
    );
    s.text('How far each lands from the wave, as a root-mean-square error, against the noise itself:');
    s.row({ latex: 'e\\left(v\\right)\\coloneq \\sqrt{\\frac{1}{128}\\cdot \\sum_{k}\\left(v_{k}-f\\left(x_{k}\\right)\\right)^{2}}' }, { latex: 'e\\left(y\\right)=', x: 230 }, { latex: 'e\\left(a\\right)=', x: 310 }, { latex: 'e\\left(g\\right)=', x: 380 }, { latex: 'e\\left(h\\right)=', x: 450 });

    s.section('Finding a delay. A pulse goes out and its echo comes back late, weaker and noisy. correl lines the echo up against the pulse at every shift; the shift where they agree best is the delay.');
    s.row('p_{k}\\coloneq \\mathrm{if}\\left(k<12,\\sin \\left(\\frac{\\pi \\cdot k}{12}\\right),0\\right)', 'r_{k}\\coloneq 0.4\\cdot p_{\\mathrm{mod}\\left(k+91,128\\right)}+0.25\\cdot \\sin \\left(2.9\\cdot k^{2}\\right)');
    s.row({ latex: 'c\\coloneq \\mathrm{correl}\\left(r,p\\right)' }, { latex: 'd\\coloneq \\mathrm{match}\\left(\\mathrm{max}\\left(c\\right),c\\right)_{0}', x: 150 }, { latex: 'd=', x: 340 });
    s.plots(
      { x: 'k', ys: ['p_{k}', 'r_{k}'], width: 230, height: 140, traces: [{ color: '#2563eb', weight: 2 }, { color: '#9ca3af', weight: 1 }] },
      { x: 'k', ys: ['c_{k}'], width: 230, height: 140, traces: [{ color: '#d97706', weight: 2 }] },
    );
    s.text('Left: the pulse, blue, and what came back, gray, the echo hard to see. Right: the correlation, which peaks at the delay, 37 samples.');

    s.section('Keeping a tenth. The wavelet transform, wave, spreads the readings over 128 coefficients, most of them small. Keep the 13 largest, set the rest to 0, and iwave rebuilds the signal from them.');
    s.row({ latex: 'w\\coloneq \\mathrm{wave}\\left(y\\right)' }, { latex: 't\\coloneq \\mathrm{reverse}\\left(\\mathrm{sort}\\left(\\overrightarrow{\\left|w\\right|}\\right)\\right)_{12}', x: 130 }, { latex: 'z_{k}\\coloneq \\mathrm{if}\\left(\\left|w_{k}\\right|\\ge t,w_{k},0\\right)', x: 330 });
    s.row({ latex: 'q\\coloneq \\mathrm{iwave}\\left(z\\right)' }, { latex: 'e\\left(q\\right)=', x: 130 });
    s.plot(
      { x: 'x_{k}', ys: ['y_{k}', 'q_{k}'], width: 300, height: 160, traces: [{ color: '#9ca3af', line: 'none', points: 'circle' }, { color: '#16a34a', line: 'solid', weight: 2, points: 'none' }] },
      { text: 'Green: the signal from 13 coefficients of 128. It is closer to the wave than the readings were, since much of the noise lived in the small coefficients that were dropped.', x: 330 },
    );

    s.section('A picture blurred. correl2d slides a kernel over a matrix: a 5 × 5 average blurs a white square, and a kernel of −1, 0, 1 finds its left and right edges.');
    s.row('i\\coloneq 0..31', 'j\\coloneq 0..31', 'S_{i,j}\\coloneq \\mathrm{if}\\left(\\left|i-15.5\\right|<9\\wedge \\left|j-15.5\\right|<9,1,0\\right)');
    s.row({ latex: '\\mathrm{one}\\left(a,b\\right)\\coloneq 1' }, { latex: 'B\\coloneq \\mathrm{correl2d}\\left(S,\\frac{\\mathrm{matrix}\\left(5,5,\\mathrm{one}\\right)}{25}\\right)', x: 150 });
    s.row({ latex: 'D\\coloneq \\mathrm{correl2d}\\left(S,\\begin{pmatrix}-1&0&1\\end{pmatrix}\\right)' }, { latex: 'E\\coloneq \\overrightarrow{\\left|D\\right|}', x: 250 });
    s.images({ latex: 'S', size: 130, fit: true, caption: 'The square' }, { latex: 'B', size: 130, fit: true, caption: 'Blurred' }, { latex: 'E', size: 130, fit: true, caption: 'Its left and right edges' });
  },
};
