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

const EC = '\\varepsilon ';

export const orbits: Example = {
  slug: 'orbits',
  title: 'Orbits, from a satellite to a comet',
  summary: 'Kepler\'s laws: a solve block for the geostationary orbit, then Halley\'s Comet on a polar plot, with Kepler\'s equation solved by root.',
  build(s) {
    s.text('Orbits, from a satellite to a comet. Kepler\'s third law ties an orbit\'s size to its period. We use it to find where a satellite must be to hang over one spot on the Earth, then follow Halley\'s Comet around the Sun.');
    s.section('A geostationary orbit goes round once a sidereal day, as the Earth turns. μ is the Earth\'s gravitational parameter, G times its mass.', true);
    s.row(
      '\\mu \\coloneq 3.986004418\\cdot 10^{14}\\cdot \\frac{\\mathrm{m}^{3}}{\\mathrm{s}^{2}}',
      { latex: 'T_{\\text{day}}\\coloneq 23\\cdot \\mathrm{hr}+56\\cdot \\mathrm{min}+4.09\\cdot \\mathrm{s}', x: 250 },
    );
    s.text('A solve block: a guess for the radius a, then Given, the condition, and Find.');
    s.row('a\\coloneq 30000\\cdot \\mathrm{km}', '\\mathrm{Given}', '2\\cdot \\pi \\cdot \\sqrt{\\frac{a^{3}}{\\mu }}=T_{\\text{day}}');
    s.row(
      { latex: 'a_{\\text{geo}}\\coloneq \\mathrm{Find}\\left(a\\right)' }, { latex: 'a_{\\text{geo}}=', unit: '\\mathrm{km}', x: 170 },
      { latex: 'a_{\\text{geo}}-6378\\cdot \\mathrm{km}=', unit: '\\mathrm{km}', x: 330 },
    );
    s.text('About 35 800 km above the equator, where the weather and TV satellites are.');

    s.section(`Halley's Comet. Its orbit's half-length a and eccentricity ${'ε'}, and μ for the Sun. AU, the Earth's distance from the Sun, is defined here.`);
    s.row(
      '\\mathrm{AU}\\coloneq 149597870.7\\cdot \\mathrm{km}', '\\mu _{\\text{sun}}\\coloneq 1.32712440018\\cdot 10^{20}\\cdot \\frac{\\mathrm{m}^{3}}{\\mathrm{s}^{2}}',
    );
    s.row(`a_{\\text{H}}\\coloneq 17.834\\cdot \\mathrm{AU}`, `${EC}\\coloneq 0.96714`);
    s.row(
      { latex: 'P\\coloneq 2\\cdot \\pi \\cdot \\sqrt{\\frac{a_{\\text{H}}^{3}}{\\mu _{\\text{sun}}}}' }, { latex: 'P=', unit: '\\mathrm{yr}', x: 170 },
    );
    s.row(
      { latex: `\\frac{a_{\\text{H}}\\cdot \\left(1-${EC}\\right)}{\\mathrm{AU}}=` },
      { latex: `\\frac{a_{\\text{H}}\\cdot \\left(1+${EC}\\right)}{\\mathrm{AU}}=`, x: 250 },
    );
    s.text('Closest to the Sun, it is inside Venus\'s orbit; farthest, beyond Neptune\'s.');

    s.section('The shape. An ellipse with the Sun at a focus: r as a function of the angle θ from perihelion, drawn on a polar plot with the orbits of the Earth and Jupiter.');
    s.row(
      { latex: `r\\left(\\theta \\right)\\coloneq \\frac{a_{\\text{H}}\\cdot \\left(1-${EC}^{2}\\right)}{1+${EC}\\cdot \\cos \\left(\\theta \\right)}` },
      { latex: '\\theta \\coloneq 0,0.01..2\\cdot \\pi ', x: 250 },
    );
    s.plot(
      { x: '\\theta ', ys: ['\\frac{r\\left(\\theta \\right)}{\\mathrm{AU}}', '1', '5.2'], view: 'polar', width: 220, height: 220, traces: [{ color: '#2563eb', weight: 2 }, { color: '#16a34a', line: 'solid', weight: 2 }, { color: '#d97706', line: 'solid', weight: 1.5 }] },
      { text: 'Blue, the comet, in AU from the Sun; green, the Earth\'s orbit, a speck at the center; orange, Jupiter\'s, at 5.2 AU. The comet swings close round the Sun on the right and spends most of its time far out to the left.', x: 260 },
    );

    s.section('Where is it now? The mean anomaly M grows evenly with time; Kepler\'s equation, M = ψ − ε·sin ψ, has no formula for ψ, so root solves it.');
    s.row(
      { latex: 'M\\left(t\\right)\\coloneq 2\\cdot \\pi \\cdot \\frac{t}{P}' },
      { latex: `\\psi \\left(t\\right)\\coloneq \\mathrm{root}\\left(u-${EC}\\cdot \\sin \\left(u\\right)-M\\left(t\\right),u,-1,7\\right)`, x: 150 },
    );
    s.row(
      { latex: `d\\left(t\\right)\\coloneq a_{\\text{H}}\\cdot \\left(1-${EC}\\cdot \\cos \\left(\\psi \\left(t\\right)\\right)\\right)` },
      { latex: 't\\coloneq 0\\cdot \\mathrm{yr},0.1\\cdot \\mathrm{yr}..P', x: 250 },
    );
    s.plot(
      { x: 't', ys: ['\\frac{d\\left(t\\right)}{\\mathrm{AU}}'], width: 260, height: 120, xUnit: '\\mathrm{yr}', traces: [{ color: '#2563eb', weight: 2 }] },
      { text: 'Its distance from the Sun, in AU, over one orbit from perihelion. It races through the inner Solar System and crawls round the far end.', x: 300 },
    );
    s.text('How long is it inside Jupiter\'s orbit, 5.2 AU from the Sun? From perihelion until d reaches 5.2 AU, and the same again before:');
    s.row(
      { latex: 't_{\\text{J}}\\coloneq \\mathrm{root}\\left(d\\left(\\tau \\right)-5.2\\cdot \\mathrm{AU},\\tau ,0\\cdot \\mathrm{yr},\\frac{P}{2}\\right)' },
      { latex: '2\\cdot t_{\\text{J}}=', unit: '\\mathrm{yr}', x: 330 },
      { latex: '\\frac{2\\cdot t_{\\text{J}}}{P}=', x: 430 },
    );
    s.text('About two years in every 75: under 3% of its time. Try it: Halley\'s next perihelion is in 2061; change ε to 0.0167 and a to 1 AU for the Earth, and its distance hardly changes at all.', { end: true });
  },
};
