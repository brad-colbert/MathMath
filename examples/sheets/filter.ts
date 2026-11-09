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

const NETLIST = [
  '\\text{"V1"}&1&0&1\\cdot \\mathrm{V}',
  '\\text{"R1"}&1&2&R_{\\text{1}}',
  '\\text{"R2"}&2&3&R_{\\text{2}}',
  '\\text{"C1"}&2&4&C_{\\text{1}}',
  '\\text{"C2"}&3&0&C_{\\text{2}}',
  '\\text{"O1"}&3&4&4',
].join('\\\\');

export const filter: Example = {
  slug: 'filter',
  title: 'An active low-pass filter',
  summary: 'A Sallen–Key filter from its netlist: node voltages at any frequency, a Bode plot, and the −3 dB point.',
  build(s) {
    s.text('An active low-pass filter. A Sallen–Key stage: two resistors, two capacitors and an op-amp that passes low frequencies and rolls off high ones at 40 dB a decade. We describe the circuit once, as a netlist, and let MathMath solve it at every frequency.');
    s.section('The parts. Standard values from the E12 series.', true);
    s.row('R_{\\text{1}}\\coloneq 10\\cdot k\\Omega', 'R_{\\text{2}}\\coloneq 10\\cdot k\\Omega', 'C_{\\text{1}}\\coloneq 22\\cdot \\mathrm{nF}', 'C_{\\text{2}}\\coloneq 10\\cdot \\mathrm{nF}');
    s.section('The circuit. A row for each part: its name, its two nodes and its value. Node 0 is ground; the op-amp O1 lists its + input, − input and output, here wired as a follower.');
    s.row(
      { latex: `N\\coloneq \\begin{pmatrix}${NETLIST}\\end{pmatrix}` },
      { latex: '\\mathrm{nodeVoltages}\\left(N\\right)=', x: 250, rows: 5 },
    );
    s.text('At DC the capacitors are open, so the output, node 4, follows the 1 V input. Give a frequency, and nodeVoltages solves the circuit as phasors there. The gain is the output over the input:', { width: 440 });
    s.row('H\\left(f\\right)\\coloneq \\frac{\\mathrm{nodeVoltages}\\left(N,f\\right)_{4}}{1\\cdot \\mathrm{V}}', { latex: 'H\\left(1\\cdot \\mathrm{kHz}\\right)=', polar: true });

    s.section('Bode plot: the gain in dB, left, and the phase in degrees, right, at fifty frequencies a decade from 10 Hz to 100 kHz. Hover over a plot to read its points.');
    s.row('k\\coloneq 0..200', 'f_{k}\\coloneq 10\\cdot \\mathrm{Hz}\\cdot 10^{\\frac{k}{50}}');
    s.plots(
      { x: 'f_{k}', ys: ['\\mathrm{ampToDb}\\left(H\\left(f_{k}\\right)\\right)'], width: 220, height: 140, logX: true, xUnit: '\\mathrm{Hz}', yMin: '-60', yMax: '5', traces: [{ color: '#2563eb', weight: 2 }] },
      { x: 'f_{k}', ys: ['\\frac{\\mathrm{arg}\\left(H\\left(f_{k}\\right)\\right)}{\\mathrm{deg}}'], width: 220, height: 140, logX: true, xUnit: '\\mathrm{Hz}', traces: [{ color: '#d97706', weight: 2 }] },
    );

    s.section('The corner. Theory gives the natural frequency and Q of this stage; root finds where the gain is really 3 dB down.');
    s.row(
      { latex: 'f_{\\text{0}}\\coloneq \\frac{1}{2\\cdot \\pi \\cdot \\sqrt{R_{\\text{1}}\\cdot R_{\\text{2}}\\cdot C_{\\text{1}}\\cdot C_{\\text{2}}}}' }, { latex: 'f_{\\text{0}}=', unit: '\\mathrm{Hz}', x: 160 },
      { latex: 'Q\\coloneq \\frac{\\sqrt{R_{\\text{1}}\\cdot R_{\\text{2}}\\cdot C_{\\text{1}}\\cdot C_{\\text{2}}}}{C_{\\text{2}}\\cdot \\left(R_{\\text{1}}+R_{\\text{2}}\\right)}', x: 270 }, { latex: 'Q=', x: 420 },
    );
    s.row(
      { latex: 'f_{\\text{3dB}}\\coloneq \\mathrm{root}\\left(\\mathrm{ampToDb}\\left(H\\left(f\\right)\\right)+3,f,100\\cdot \\mathrm{Hz},10\\cdot \\mathrm{kHz}\\right)' },
      { latex: 'f_{\\text{3dB}}=', unit: '\\mathrm{Hz}', x: 380 },
    );
    s.text('With Q near 0.71 the response is nearly maximally flat, a Butterworth filter, and its −3 dB point sits close to f₀. Try C₁ = 47 nF: Q rises and a peak appears before the roll-off.');
  },
};
