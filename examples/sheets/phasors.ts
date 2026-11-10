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

export const phasors: Example = {
  slug: 'phasors',
  title: 'Phasors and power factor',
  summary: 'A motor as a complex impedance: its current as a phasor, a capacitor to correct its power factor, and RLC ringing.',
  build(s) {
    s.text('Phasors and power factor. At one frequency a circuit is just complex arithmetic: a resistor is a real number of ohms, a coil or a capacitor an imaginary one, and a sine wave a complex number whose size is its amplitude and whose angle is its phase. Type a number followed by i for an imaginary one, as 3i; 3j works too, as electrical engineers write it.');
    s.section('A motor on a 120 V, 60 Hz supply, modelled as a resistance in series with an inductance.', true);
    s.row('V_{\\text{s}}\\coloneq 120\\cdot \\mathrm{V}', 'f\\coloneq 60\\cdot \\mathrm{Hz}', 'R\\coloneq 8\\cdot \\Omega', 'L\\coloneq 25\\cdot \\mathrm{mH}');
    s.row('\\omega \\coloneq 2\\cdot \\pi \\cdot f', { latex: 'Z\\coloneq R+1\\mathrm{i}\\cdot \\omega \\cdot L', x: 130 }, { latex: 'Z=', x: 290 }, { latex: 'Z=', polar: true, x: 410 });
    s.text('The same impedance two ways: as resistance plus reactance, and, under Format → Complex results as magnitude∠angle, as a size and an angle. The current is the voltage over the impedance, and lags it by that angle:');
    s.row({ latex: 'I\\coloneq \\frac{V_{\\text{s}}}{Z}' }, { latex: 'I=', polar: true, unit: '\\mathrm{A}', x: 130 }, { latex: '\\left|I\\right|=', unit: '\\mathrm{A}', x: 290 }, { latex: '\\frac{\\mathrm{arg}\\left(I\\right)}{\\mathrm{deg}}=', x: 410 });

    s.section('The power. The complex power S is the current squared times the impedance: its real part P does work, its imaginary part Q only sloshes back and forth, and the power factor is the share that does work.');
    s.row('S\\coloneq \\left|I\\right|^{2}\\cdot Z', { latex: '\\mathrm{Re}\\left(S\\right)=', unit: '\\mathrm{W}', x: 130 }, { latex: '\\mathrm{Im}\\left(S\\right)=', unit: '\\mathrm{VA}', x: 310 });
    s.row('\\mathrm{pf}\\coloneq \\cos \\left(\\mathrm{arg}\\left(Z\\right)\\right)', { latex: '\\mathrm{pf}=', x: 130 });

    s.section('Correcting it. A capacitor across the motor draws a current that leads, cancelling the lagging part. The size that cancels all of Q:');
    s.row({ latex: 'C\\coloneq \\frac{\\mathrm{Im}\\left(S\\right)}{\\omega \\cdot V_{\\text{s}}^{2}}' }, { latex: 'C=', unit: '\\mathrm{μF}', x: 130 }, { latex: 'Z_{\\text{c}}\\coloneq \\frac{1}{\\frac{1}{Z}+1\\mathrm{i}\\cdot \\omega \\cdot C}', x: 250 }, { latex: 'Z_{\\text{c}}=', polar: true, x: 400 });
    s.row({ latex: 'I_{\\text{c}}\\coloneq \\frac{V_{\\text{s}}}{Z_{\\text{c}}}' }, { latex: 'I_{\\text{c}}=', polar: true, unit: '\\mathrm{A}', x: 130 }, { latex: '\\frac{\\left|I_{\\text{c}}\\right|}{\\left|I\\right|}=', x: 290 });
    s.text('The motor works as hard as before, but the supply now carries less current, in phase with the voltage. Over one cycle, the instantaneous current is the real part of the phasor turning at ω, √2 times its RMS size:');
    s.row('k\\coloneq 0..200', 't_{k}\\coloneq k\\cdot 0.1\\cdot \\mathrm{ms}', 'i\\left(t,I\\right)\\coloneq \\mathrm{Re}\\left(\\sqrt{2}\\cdot I\\cdot e^{1\\mathrm{i}\\cdot \\omega \\cdot t}\\right)');
    s.plot(
      { x: 't_{k}', ys: ['i\\left(t_{k},I\\right)', 'i\\left(t_{k},I_{\\text{c}}\\right)'], width: 280, height: 160, xUnit: '\\mathrm{ms}', yUnit: '\\mathrm{A}', traces: [{ color: '#2563eb', weight: 2 }, { color: '#d97706', weight: 2 }] },
      { text: 'Blue: the motor alone. Orange: with the capacitor. Same work, less current in the wires.', x: 310 },
    );

    s.section('Ringing. Switch 10 V onto a series R, L and C. The current is a sum of exponentials whose rates are the roots of L·s² + R·s + 1/C = 0, and when the resistance is small the roots are complex: their real part is the decay and their imaginary part the frequency of the ringing.');
    s.row('R_{\\text{2}}\\coloneq 10\\cdot \\Omega', 'C_{\\text{2}}\\coloneq 10\\cdot \\mathrm{μF}', 'V_{\\text{0}}\\coloneq 10\\cdot \\mathrm{V}', '\\alpha \\coloneq \\frac{R_{\\text{2}}}{2\\cdot L}', '\\omega_{\\text{0}}\\coloneq \\frac{1}{\\sqrt{L\\cdot C_{\\text{2}}}}');
    s.row({ latex: 's_{\\text{1}}\\coloneq -\\alpha +\\sqrt{\\alpha ^{2}-\\omega_{\\text{0}}^{2}}' }, { latex: 's_{\\text{2}}\\coloneq -\\alpha -\\sqrt{\\alpha ^{2}-\\omega_{\\text{0}}^{2}}', x: 170 }, { latex: 's_{\\text{1}}=', x: 340 });
    s.row('i_{\\text{2}}\\left(t\\right)\\coloneq \\mathrm{Re}\\left(\\frac{V_{\\text{0}}}{L\\cdot \\left(s_{\\text{1}}-s_{\\text{2}}\\right)}\\cdot \\left(e^{s_{\\text{1}}\\cdot t}-e^{s_{\\text{2}}\\cdot t}\\right)\\right)', { latex: '\\frac{\\mathrm{Im}\\left(s_{\\text{1}}\\right)}{2\\cdot \\pi }=', unit: '\\mathrm{Hz}', x: 340 });
    s.plot(
      { x: 't_{k}', ys: ['i_{\\text{2}}\\left(t_{k}\\right)'], width: 280, height: 160, xUnit: '\\mathrm{ms}', yUnit: '\\mathrm{A}', traces: [{ color: '#2563eb', weight: 2 }] },
      { text: 'One formula covers every case. Try R₂ = 150 Ω: the square root turns real, both roots are real decays, and the current rises and falls without ringing.', x: 310 },
    );
  },
};
