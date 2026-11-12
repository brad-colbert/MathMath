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

export const fringes: Example = {
  slug: 'fringes',
  title: 'Fringes, an overshoot and a diode',
  summary: 'Integrals with names: light bending round an edge with the Fresnel integrals, the Gibbs overshoot with the sine integral, and a diode\'s current, exactly, with Lambert\'s W.',
  symbolic: true,
  build(s) {
    s.text('Some integrals and equations come up so often that their answers have names. Three of them, each answering a question that has no answer in elementary functions.');
    s.section('Light past a straight edge. Green light, λ = 500 nm, passes the edge of a razor blade and falls on a screen 1 m beyond. Geometry says the shadow is sharp; in fact bright and dark fringes run along the lit side and light reaches into the shadow. With the distance x from the edge scaled to v, the brightness, relative to the light with no blade, is built from the Fresnel integrals:', true);
    s.row('\\lambda \\coloneq 500\\cdot \\mathrm{nm}', { latex: 'z\\coloneq 1\\cdot \\mathrm{m}', x: 110 }, { latex: 'v\\left(x\\right)\\coloneq x\\cdot \\sqrt{\\frac{2}{\\lambda \\cdot z}}', x: 200 });
    s.row('I\\left(x\\right)\\coloneq \\frac{1}{2}\\cdot \\left(\\left(\\mathrm{FresnelC}\\left(v\\left(x\\right)\\right)+\\frac{1}{2}\\right)^{2}+\\left(\\mathrm{FresnelS}\\left(v\\left(x\\right)\\right)+\\frac{1}{2}\\right)^{2}\\right)');
    s.row('x\\coloneq -1\\cdot \\mathrm{mm},-0.99\\cdot \\mathrm{mm}..3\\cdot \\mathrm{mm}', { latex: 't\\coloneq -4,-3.98..4', x: 280 });
    s.plots(
      { x: 'x', ys: ['I\\left(x\\right)'], xUnit: '\\mathrm{mm}', width: 250, height: 170, xTitle: 'distance from the edge', yTitle: 'brightness' },
      { x: '\\mathrm{FresnelC}\\left(t\\right)', ys: ['\\mathrm{FresnelS}\\left(t\\right)'], width: 190, height: 170, at: 290, title: 'Cornu spiral' },
    );
    s.text('At the edge of the geometric shadow the brightness is a quarter; the first bright fringe, 37% brighter than no blade at all, is about 0.6 mm out:');
    s.row({ latex: 'I\\left(0\\cdot \\mathrm{mm}\\right)=' }, { latex: 'I\\left(0.609\\cdot \\mathrm{mm}\\right)=', x: 180 });
    s.text('The Cornu spiral on the right is FresnelC against FresnelS, winding into (½, ½) and (−½, −½); the brightness is the square of the distance along it from (−½, −½). Each integral\'s derivative is the function inside it:');
    s.row('\\frac{\\mathrm{d}}{\\mathrm{d}u}\\mathrm{FresnelS}\\left(u\\right)\\to ', { latex: '\\frac{\\mathrm{d}}{\\mathrm{d}u}\\mathrm{FresnelC}\\left(u^{2}\\right)\\to ', x: 260 });
    s.section('The Gibbs overshoot. A square wave summed from its first N odd harmonics overshoots its edges, and adding harmonics only squeezes the overshoot closer to the edge without shrinking it.');
    s.row('N\\coloneq 25', { latex: 'f\\left(x\\right)\\coloneq \\frac{4}{\\pi }\\cdot \\sum _{k=1}^{N}\\frac{\\sin \\left(\\left(2\\cdot k-1\\right)\\cdot x\\right)}{2\\cdot k-1}', x: 90 }, { latex: 'y\\coloneq 0,0.005..1', x: 360 });
    s.plot({ x: 'y', ys: ['f\\left(y\\right)'], width: 300, height: 150 }, { text: 'Near the edge at 0, the sum peaks at the first zero of its derivative, x = π/(2N), and the height there tends to (2/π)·Si(π) as N grows.', x: 330 });
    s.row({ latex: 'f\\left(\\frac{\\pi }{2\\cdot N}\\right)=' }, { latex: '\\frac{2}{\\pi }\\cdot \\mathrm{Si}\\left(\\pi \\right)=', x: 180 }, { latex: '\\int_{0}^{\\pi }\\frac{\\sin \\left(t\\right)}{t}\\,\\mathrm{d}t\\to ', x: 340 });
    s.text('The wave jumps from −1 to 1, so it overshoots by 0.179, about 9% of the jump, however many harmonics are added.');
    s.section('A diode and a resistor. A small silicon diode in series with 100 Ω across 5 V: its current I obeys V = I·R + n·V_T·ln(I/I_s + 1), which has no answer in elementary functions. Lambert\'s W, the w for which w·eʷ = a, gives it exactly.');
    s.row('V\\coloneq 5\\cdot \\mathrm{V}', { latex: 'R\\coloneq 100\\cdot \\Omega ', x: 90 }, { latex: 'I_{\\text{s}}\\coloneq 2.5\\cdot 10^{-9}\\cdot \\mathrm{A}', x: 190 }, { latex: 'n\\coloneq 1.75', x: 310 }, { latex: 'V_{\\text{T}}\\coloneq 25.85\\cdot \\mathrm{mV}', x: 380 });
    s.row('I\\coloneq \\frac{n\\cdot V_{\\text{T}}}{R}\\cdot \\mathrm{LambertW}\\left(\\frac{I_{\\text{s}}\\cdot R}{n\\cdot V_{\\text{T}}}\\cdot e^{\\frac{V+I_{\\text{s}}\\cdot R}{n\\cdot V_{\\text{T}}}}\\right)-I_{\\text{s}}', { latex: 'I=', x: 330, unit: '\\mathrm{mA}' });
    s.text('A check: the diode\'s voltage, and the two voltages adding up to 5 V again.');
    s.row({ latex: 'V_{\\text{d}}\\coloneq n\\cdot V_{\\text{T}}\\cdot \\ln \\left(\\frac{I}{I_{\\text{s}}}+1\\right)' }, { latex: 'V_{\\text{d}}=', x: 220 }, { latex: 'I\\cdot R+V_{\\text{d}}=', x: 340 });
    s.text('MathMath gives all of these with =. In Mathcad 14 the Fresnel integrals, Si and LambertW are symbolic-only, so there the numbers come from → with the float keyword.', { end: true });
  },
};
