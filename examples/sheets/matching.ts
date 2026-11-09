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

const W = '2\\cdot \\pi \\cdot f';

export const matching: Example = {
  slug: 'matching',
  title: 'Matching an antenna',
  summary: 'Two parts that match a 25 Ω antenna to a 50 Ω radio, designed by formula and checked on a Smith chart.',
  build(s) {
    s.text('Matching an antenna. A small antenna for 100 MHz measures about 25 − 15j Ω, and the radio expects 50 Ω. The mismatch reflects some of the power back to the transmitter. Two parts, an inductor and a capacitor, fix it at the design frequency.');
    s.section('The antenna. Near resonance it acts as a resistor, an inductor and a capacitor in series.', true);
    s.row('Z_{\\text{0}}\\coloneq 50\\cdot \\Omega', 'f_{\\text{0}}\\coloneq 100\\cdot \\mathrm{MHz}', 'R_{\\text{a}}\\coloneq 25\\cdot \\Omega', 'L_{\\text{a}}\\coloneq 100\\cdot \\mathrm{nH}', 'C_{\\text{a}}\\coloneq 20.46\\cdot \\mathrm{pF}');
    s.row(
      { latex: `Z_{\\text{a}}\\left(f\\right)\\coloneq R_{\\text{a}}+\\mathrm{i}\\cdot \\left(${W}\\cdot L_{\\text{a}}-\\frac{1}{${W}\\cdot C_{\\text{a}}}\\right)` },
      { latex: 'Z_{\\text{a}}\\left(f_{\\text{0}}\\right)=', unit: '\\Omega', x: 300 },
    );
    s.text('Its reflection coefficient, the standing-wave ratio on the cable, and how far down the reflection is:');
    s.row(
      { latex: '\\Gamma _{\\text{a}}\\left(f\\right)\\coloneq \\mathrm{zToGamma}\\left(Z_{\\text{a}}\\left(f\\right),Z_{\\text{0}}\\right)' },
      { latex: '\\Gamma _{\\text{a}}\\left(f_{\\text{0}}\\right)=', polar: true, x: 250 },
    );
    s.row('\\mathrm{vswr}\\left(\\Gamma _{\\text{a}}\\left(f_{\\text{0}}\\right)\\right)=', '\\mathrm{returnLoss}\\left(\\Gamma _{\\text{a}}\\left(f_{\\text{0}}\\right)\\right)=', '\\mathrm{mismatchLoss}\\left(\\Gamma _{\\text{a}}\\left(f_{\\text{0}}\\right)\\right)=');

    s.section('The match. An L network: an inductor in series with the antenna, then a capacitor across the line. Q comes from the ratio of the resistances.');
    s.row(
      { latex: 'Q\\coloneq \\sqrt{\\frac{Z_{\\text{0}}}{R_{\\text{a}}}-1}' }, { latex: 'X_{\\text{s}}\\coloneq Q\\cdot R_{\\text{a}}-\\mathrm{Im}\\left(Z_{\\text{a}}\\left(f_{\\text{0}}\\right)\\right)', x: 120 },
      { latex: 'B_{\\text{p}}\\coloneq \\frac{Q}{Z_{\\text{0}}}', x: 350 },
    );
    s.row(
      { latex: 'L_{\\text{m}}\\coloneq \\frac{X_{\\text{s}}}{2\\cdot \\pi \\cdot f_{\\text{0}}}' }, { latex: 'L_{\\text{m}}=', unit: '\\mathrm{nH}', x: 120 },
      { latex: 'C_{\\text{m}}\\coloneq \\frac{B_{\\text{p}}}{2\\cdot \\pi \\cdot f_{\\text{0}}}', x: 250 }, { latex: 'C_{\\text{m}}=', unit: '\\mathrm{pF}', x: 380 },
    );
    s.text('Looking into the network, the capacitor is in parallel with the inductor and antenna in series:');
    s.row(
      { latex: `Z_{\\text{in}}\\left(f\\right)\\coloneq \\mathrm{parallel}\\left(\\frac{1}{\\mathrm{i}\\cdot ${W}\\cdot C_{\\text{m}}},Z_{\\text{a}}\\left(f\\right)+\\mathrm{i}\\cdot ${W}\\cdot L_{\\text{m}}\\right)` },
      { latex: 'Z_{\\text{in}}\\left(f_{\\text{0}}\\right)=', unit: '\\Omega', x: 330 },
    );
    s.math('\\Gamma _{\\text{in}}\\left(f\\right)\\coloneq \\mathrm{zToGamma}\\left(Z_{\\text{in}}\\left(f\\right),Z_{\\text{0}}\\right)');

    s.page();
    s.section('Across the band. The Smith chart shows the antenna alone, gray, and matched, blue: the match passes through the center, a perfect 50 Ω, at 100 MHz. Right, the standing-wave ratio of each.', true);
    s.row('k\\coloneq 0..120', 'f_{k}\\coloneq 80\\cdot \\mathrm{MHz}+k\\cdot \\frac{40\\cdot \\mathrm{MHz}}{120}');
    const style = [{ color: '#9ca3af', line: 'solid', weight: 2 }, { color: '#2563eb', line: 'solid', weight: 2 }] as const;
    s.plots(
      {
        x: 'f_{k}', ys: ['\\Gamma _{\\text{a}}\\left(f_{k}\\right)', '\\Gamma _{\\text{in}}\\left(f_{k}\\right)'],
        view: 'smith', width: 200, height: 200, traces: [...style],
      },
      {
        x: 'f_{k}', ys: ['\\mathrm{vswr}\\left(\\Gamma _{\\text{a}}\\left(f_{k}\\right)\\right)', '\\mathrm{vswr}\\left(\\Gamma _{\\text{in}}\\left(f_{k}\\right)\\right)'],
        width: 200, height: 180, xUnit: '\\mathrm{MHz}', yMin: '1', yMax: '6', traces: [...style], at: 270,
      },
    );
    s.text('Try it: change f₀, and the parts follow. Or round Lm and Cm to values you can buy and see how much of the match survives.');
  },
};
