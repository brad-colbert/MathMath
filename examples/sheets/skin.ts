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

export const skin: Example = {
  slug: 'skin',
  title: 'The skin effect in a wire',
  summary: 'Alternating current crowds to the surface of a copper bar: Bessel functions of a complex argument give its spread and the resistance it costs.',
  build(s) {
    s.text('The skin effect in a wire. Direct current spreads evenly across a conductor, but alternating current crowds towards its surface, so a thick wire carries AC as if it were a thinner tube. Inside a round wire the current density follows the Bessel function J0 of a complex argument.');
    s.section('A copper bar 10 mm across, and the depth at which a field dies away by 1/e at each frequency.', true);
    s.row('a\\coloneq 5\\cdot \\mathrm{mm}', '\\sigma \\coloneq 5.8\\cdot 10^{7}\\cdot \\frac{\\mathrm{S}}{\\mathrm{m}}', '\\mu_{\\text{0}}\\coloneq 4\\cdot \\pi \\cdot 10^{-7}\\cdot \\frac{\\mathrm{H}}{\\mathrm{m}}');
    s.row('\\delta \\left(f\\right)\\coloneq \\sqrt{\\frac{1}{\\pi \\cdot f\\cdot \\mu_{\\text{0}}\\cdot \\sigma }}', { latex: '\\delta \\left(60\\cdot \\mathrm{Hz}\\right)=', unit: '\\mathrm{mm}' }, { latex: '\\delta \\left(10\\cdot \\mathrm{kHz}\\right)=', unit: '\\mathrm{mm}' });
    s.text('The field in the wire obeys a Bessel equation whose wavenumber is complex, κ = (1 − i)/δ: it decays and turns in phase at the same rate. The current density at radius r, as a share of the density at the surface:');
    s.row('\\kappa \\left(f\\right)\\coloneq \\frac{1-1\\mathrm{i}}{\\delta \\left(f\\right)}', 'u\\left(r,f\\right)\\coloneq \\frac{J0\\left(\\kappa \\left(f\\right)\\cdot r\\right)}{J0\\left(\\kappa \\left(f\\right)\\cdot a\\right)}', { latex: 'u\\left(0\\cdot \\mathrm{mm},1\\cdot \\mathrm{kHz}\\right)=', polar: true });
    s.row('r\\coloneq 0\\cdot \\mathrm{mm},0.05\\cdot \\mathrm{mm}..a');
    s.plot(
      {
        x: 'r', ys: ['\\left|u\\left(r,60\\cdot \\mathrm{Hz}\\right)\\right|', '\\left|u\\left(r,1\\cdot \\mathrm{kHz}\\right)\\right|', '\\left|u\\left(r,10\\cdot \\mathrm{kHz}\\right)\\right|'],
        width: 280, height: 160, xUnit: '\\mathrm{mm}', yMin: '0', yMax: '1.05',
        traces: [{ color: '#2563eb', weight: 2 }, { color: '#d97706', weight: 2 }, { color: '#dc2626', weight: 2 }],
      },
      { text: 'Blue 60 Hz: nearly even. Orange 1 kHz: the centre carries 40% of the surface density. Red 10 kHz: the current lives in the outer millimetre or so.', x: 310 },
    );

    s.section('The resistance. The wire\'s internal impedance per metre comes from the same functions; its real part is the resistance, compared here with the DC value.');
    s.row(
      { latex: 'Z\\left(f\\right)\\coloneq \\frac{\\kappa \\left(f\\right)}{2\\cdot \\pi \\cdot a\\cdot \\sigma }\\cdot \\frac{J0\\left(\\kappa \\left(f\\right)\\cdot a\\right)}{J1\\left(\\kappa \\left(f\\right)\\cdot a\\right)}' },
      { latex: 'R_{\\text{dc}}\\coloneq \\frac{1}{\\pi \\cdot a^{2}\\cdot \\sigma }', x: 250 },
      { latex: 'R_{\\text{dc}}=', unit: '\\frac{m\\Omega }{\\mathrm{m}}', x: 380 },
    );
    s.row({ latex: '\\frac{\\mathrm{Re}\\left(Z\\left(60\\cdot \\mathrm{Hz}\\right)\\right)}{R_{\\text{dc}}}=' }, { latex: '\\frac{\\mathrm{Re}\\left(Z\\left(10\\cdot \\mathrm{kHz}\\right)\\right)}{R_{\\text{dc}}}=', x: 200 }, { latex: '\\frac{a}{2\\cdot \\delta \\left(10\\cdot \\mathrm{kHz}\\right)}+\\frac{1}{4}=', x: 360 });
    s.text('At 60 Hz the bar costs a quarter of a percent more than at DC; at 1 kHz, 45% more; at 10 kHz, four times as much. At high frequency the ratio approaches a/(2δ) + ¼, the resistance of a tube one skin depth thick. Over five decades:');
    s.row('k\\coloneq 0..100', 'f_{k}\\coloneq 10\\cdot \\mathrm{Hz}\\cdot 10^{\\frac{k}{20}}');
    s.plot(
      { x: 'f_{k}', ys: ['\\frac{\\mathrm{Re}\\left(Z\\left(f_{k}\\right)\\right)}{R_{\\text{dc}}}'], width: 280, height: 160, logX: true, logY: true, xUnit: '\\mathrm{Hz}', traces: [{ color: '#2563eb', weight: 2 }] },
      { text: 'Flat at 1 while the skin depth is larger than the wire, then rising as √f once it is smaller. Try a = 1 mm: the knee moves up by a factor of 25.', x: 310 },
    );
  },
};
