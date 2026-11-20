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

export const extremes: Example = {
  slug: 'extremes',
  title: 'Floods, signals and winds',
  summary: 'Distributions for real questions: a hundred-year flood from Gumbel, a radar threshold from Rayleigh and Rice, wind from von Mises, gas speeds from Maxwell, and a triangular estimate.',
  build(s) {
    s.heading('Floods, signals and winds');
    s.text('Each distribution has four functions: d for its density, p for the chance of a value at or below x, q to go back from a chance to a value, and r for random draws. These five answer questions the normal distribution can\'t.');
    s.section('The hundred-year flood. A river\'s highest level each year follows the Gumbel distribution, the law of maxima. Here 60 years of yearly peaks, in metres, are drawn from it; then its location μ and scale β are estimated from their mean and standard deviation, by the method of moments.', true);
    s.row('L\\coloneq \\mathrm{rgumbel}\\left(60,4.2,0.55\\right)', { latex: '\\beta \\coloneq \\frac{\\mathrm{Stdev}\\left(L\\right)\\cdot \\sqrt{6}}{\\pi }', x: 170 }, { latex: '\\mu \\coloneq \\mathrm{mean}\\left(L\\right)-0.5772\\cdot \\beta ', x: 320 });
    s.row('\\beta =', { latex: '\\mu =', x: 120 }, { latex: '\\mathrm{qgumbel}\\left(0.99,\\mu ,\\beta \\right)=', x: 240 });
    s.text('The level reached one year in a hundred is qgumbel at 0.99, well over two metres above the commonest peak, μ. The chance that a given year tops 7 m, and that one of the next 30 years does:');
    s.row('p_{7}\\coloneq 1-\\mathrm{pgumbel}\\left(7,\\mu ,\\beta \\right)', { latex: 'p_{7}=', x: 190 }, { latex: '1-\\left(1-p_{7}\\right)^{30}=', x: 310 });
    s.section('A radar threshold. With noise alone, the amplitude a receiver sees follows the Rayleigh distribution; with a target\'s echo of amplitude ν in it, the Rice distribution. Set the threshold so noise crosses it once in a thousand looks, then ask how often an echo does.');
    s.row('\\sigma \\coloneq 1', { latex: 'T\\coloneq \\mathrm{qrayleigh}\\left(1-10^{-3},\\sigma \\right)', x: 70 }, { latex: 'T=', x: 260 }, { latex: '1-\\mathrm{price}\\left(T,4,\\sigma \\right)=', x: 340 });
    s.row('x\\coloneq 0,0.05..8');
    s.plot({
      x: 'x', ys: ['\\mathrm{drice}\\left(x,0,\\sigma \\right)', '\\mathrm{drice}\\left(x,2,\\sigma \\right)', '\\mathrm{drice}\\left(x,4,\\sigma \\right)'], width: 260, height: 150,
      traces: [{ color: '#52514e', line: 'solid', weight: 2 }, { color: '#2a78d6', line: 'solid', weight: 2 }, { color: '#eb6834', line: 'solid', weight: 2 }],
    }, { text: 'Noise alone, gray, is Rayleigh: Rice with ν = 0. An echo of 2, blue, and of 4, orange, move the curve out past the threshold of about 3.7: the stronger echo is seen about two times in three.' });
    s.section('Wind. Directions are angles, which wrap round: the von Mises distribution is the normal distribution of a circle. Here the wind blows mostly towards μ, 4 radians from east, κ saying how steadily. The polar plot is its density round the compass.');
    s.row('\\mu _{\\text{w}}\\coloneq 4', { latex: '\\kappa \\coloneq 2', x: 80 }, { latex: '\\theta \\coloneq \\mu _{\\text{w}}-\\pi ,\\mu _{\\text{w}}-\\pi +0.02..\\mu _{\\text{w}}+\\pi ', x: 160 });
    s.plot({ x: '\\theta ', ys: ['\\mathrm{dvonmises}\\left(\\theta ,\\mu _{\\text{w}},\\kappa \\right)'], view: 'polar', width: 200, height: 200, traces: [{ color: '#2a78d6', weight: 2 }] },
      { text: 'The chance the wind is within 30° of its usual direction: the cumulative at either side, subtracted. With κ = 0 every direction would be equally likely, and the answer one in six.' });
    s.row('\\mathrm{pvonmises}\\left(\\mu _{\\text{w}}+\\frac{\\pi }{6},\\mu _{\\text{w}},\\kappa \\right)-\\mathrm{pvonmises}\\left(\\mu _{\\text{w}}-\\frac{\\pi }{6},\\mu _{\\text{w}},\\kappa \\right)=');
    s.section('Molecules. In a gas, speeds follow the Maxwell–Boltzmann distribution with scale a = √(kT/m). For nitrogen at 300 K, in m/s: the likeliest speed is a·√2, and the share of molecules faster than 1 km/s is small.');
    s.row('a\\coloneq \\sqrt{\\frac{1.380649\\cdot 10^{-23}\\cdot 300}{4.652\\cdot 10^{-26}}}', { latex: 'a\\cdot \\sqrt{2}=', x: 200 }, { latex: '1-\\mathrm{pmaxwell}\\left(1000,a\\right)=', x: 320 });
    s.section('An estimate. A task will take at least 3 days, most likely 5, and at most 10. The triangular distribution makes that a curve: the chance it is done within a week, and the time to promise to be 90% sure.');
    s.row('\\mathrm{ptri}\\left(7,3,10,5\\right)=', { latex: '\\mathrm{qtri}\\left(0.9,3,10,5\\right)=', x: 170 }, { latex: '\\frac{3+10+5}{3}=', x: 340 });
    s.text('The mean, 6 days, is past the likeliest 5: the long side of the triangle pulls it. Laplace and Pareto, for sharp peaks and long tails, round out the eight families MathMath adds.', { end: true });
  },
};
