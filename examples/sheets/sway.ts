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

export const sway: Example = {
  slug: 'sway',
  title: 'How a building sways',
  summary: 'A three-storey frame\'s natural frequencies and mode shapes, from its stiffness and mass matrices with genvals and genvecs, and its stiffness checked with svd2.',
  build(s) {
    s.text('How a building sways. A three-storey frame is three floors, each a mass, joined by columns that act as springs. Its free vibration is K·x = ω²·M·x, a generalized eigenvalue problem: genvals gives the ω², and genvecs the shapes the frame sways in.');
    s.section('The floors\' masses and the storeys\' stiffnesses, from the ground up. The top floor is a lighter roof.', true);
    s.row('m_{\\text{1}}\\coloneq 12000\\cdot \\mathrm{kg}', 'm_{\\text{2}}\\coloneq 12000\\cdot \\mathrm{kg}', 'm_{\\text{3}}\\coloneq 8000\\cdot \\mathrm{kg}');
    s.row('k_{\\text{1}}\\coloneq 30000\\cdot \\frac{\\mathrm{kN}}{\\mathrm{m}}', 'k_{\\text{2}}\\coloneq 25000\\cdot \\frac{\\mathrm{kN}}{\\mathrm{m}}', 'k_{\\text{3}}\\coloneq 20000\\cdot \\frac{\\mathrm{kN}}{\\mathrm{m}}');
    s.text('Each floor is pulled by the storey below and the one above, which gives the stiffness matrix; the mass matrix is the masses on its diagonal.');
    s.row(
      { latex: 'K\\coloneq \\begin{pmatrix}k_{\\text{1}}+k_{\\text{2}}&-k_{\\text{2}}&0\\\\-k_{\\text{2}}&k_{\\text{2}}+k_{\\text{3}}&-k_{\\text{3}}\\\\0&-k_{\\text{3}}&k_{\\text{3}}\\end{pmatrix}', rows: 3 },
      { latex: 'M\\coloneq \\begin{pmatrix}m_{\\text{1}}&0&0\\\\0&m_{\\text{2}}&0\\\\0&0&m_{\\text{3}}\\end{pmatrix}', rows: 3, x: 330 },
    );
    s.section('The natural frequencies. genvals gives ω² in 1/s², since K/M is (N/m)/kg; the frequency is ω/2π.');
    s.row({ latex: '\\omega 2\\coloneq \\mathrm{genvals}\\left(K,M\\right)' }, { latex: '\\omega 2=', rows: 3, x: 200 }, { latex: 'f\\coloneq \\frac{\\overrightarrow{\\sqrt{\\omega 2}}}{2\\cdot \\pi }', x: 330 }, { latex: 'f=', unit: '\\mathrm{Hz}', rows: 3, x: 460 });
    s.text('Three modes, at about 13, 9.5 and 3.7 Hz. genvals lists them in the order LAPACK\'s QZ method finds them, as Mathcad does, here the fastest first; sort them if you want them in order. The slowest, under 4 Hz, is the one wind or traffic would excite.');
    s.section('The mode shapes. Each column of genvecs is how far each floor moves in that mode, scaled so the largest is ±1, as Mathcad scales them.');
    s.row({ latex: 'X\\coloneq \\mathrm{genvecs}\\left(K,M\\right)' }, { latex: 'X=', rows: 3, x: 200 });
    s.text('In the slowest mode, the last column, all three floors move the same way, the roof most. In the next the floors move against each other once, and in the fastest twice. The signs are arbitrary, as for any eigenvector, and match Mathcad\'s. Each column satisfies K·x = ω²·M·x, which checks the answer: for the slowest mode, the springs\' force K·x over the floors\' mass times their movement, M·x, is ω² on every floor.');
    s.row('x\\coloneq X^{\\langle 2\\rangle }', { latex: 'F\\coloneq K\\cdot x', x: 150 }, { latex: 'A\\coloneq M\\cdot x', x: 300 });
    s.row({ latex: '\\overrightarrow{\\frac{F}{A}}=', rows: 3 }, { latex: '\\omega 2_{2}=', x: 300 });
    s.section('How stiff the frame is in every direction. svd2 splits K into rotations and its singular values: the largest over the smallest is how much stiffer the frame is against its stiffest pattern of floor movements than against its softest.');
    s.row({ latex: 'S\\coloneq \\mathrm{svd2}\\left(K\\right)' }, { latex: 'S_{0}=', unit: '\\frac{\\mathrm{kN}}{\\mathrm{m}}', rows: 3, x: 200 }, { latex: '\\frac{\\max \\left(S_{0}\\right)}{\\min \\left(S_{0}\\right)}=', x: 400 });
    s.text('The same ratio as cond2(K). Since K is symmetric and positive, its singular values are its ordinary eigenvalues; for the frame as it moves, it is M that weights them, and that is what genvals does.', { end: true });
  },
};
