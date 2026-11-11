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

export const hues: Example = {
  slug: 'hues',
  title: 'Colour and sound, by the numbers',
  summary: 'A picture built from numbers, its hues turned with the hue, lightness and saturation model, and a chime written as a WAV file, as Mathcad writes them.',
  build(s) {
    s.text('Colour and sound, by the numbers. A picture is three matrices of red, green and blue, 0 to 255, packed side by side; a sound is a column of samples. Both can be worked on as numbers and written out as files.');
    s.section('A picture: red rising to the right, green rising downward, blue fixed. joinChannels packs the three 32 × 32 matrices side by side, as readImage gives a picture.', true);
    s.row('i\\coloneq 0..31', 'j\\coloneq 0..31', 'R_{i,j}\\coloneq 8\\cdot j', 'G_{i,j}\\coloneq 8\\cdot i', 'B_{i,j}\\coloneq 120');
    s.row('P\\coloneq \\mathrm{joinChannels}\\left(R,G,B\\right)');
    s.section('Hue, lightness and saturation. rgbToHls gives the hue in degrees with 360, as Mathcad\'s READ_HLS does; imageChannels takes out one of the three. Turning every hue by 120° moves red to green and green to blue, keeping lightness and saturation.');
    s.row('L\\coloneq \\mathrm{rgbToHls}\\left(P,360\\right)', 'h\\coloneq \\mathrm{imageChannels}\\left(L,0\\right)', 'l\\coloneq \\mathrm{imageChannels}\\left(L,1\\right)', 's\\coloneq \\mathrm{imageChannels}\\left(L,2\\right)');
    s.row('t\\coloneq \\overrightarrow{\\mathrm{mod}\\left(h+120,360\\right)}', { latex: 'Q\\coloneq \\mathrm{hlsToRgb}\\left(\\mathrm{joinChannels}\\left(t,l,s\\right),360\\right)', x: 200 });
    s.images({ latex: 'P', size: 130, color: true, caption: 'The picture' }, { latex: 'Q', size: 130, color: true, caption: 'Hues turned 120°' }, { latex: 'l', size: 130, caption: 'Its lightness' });
    s.text('The lightness is the same in both: only the hue moved. Mathcad\'s WRITE_HLS writes such a matrix straight to a picture file, and the region offers it to save:');
    s.row('\\mathrm{WRITE\\_HLS}\\left(\\text{"turned.bmp"}\\right)\\coloneq \\mathrm{joinChannels}\\left(t,l,s\\right)');
    s.section('A chime: two notes a major third apart, C and E, dying away over a second, at 8000 samples a second. WRITEWAV writes 16-bit samples, −32768 to 32767, so the chime is scaled to about 11 600 at its loudest.');
    s.row('k\\coloneq 0..7999', { latex: 'c_{k}\\coloneq \\left(\\sin \\left(2\\cdot \\pi \\cdot 523\\cdot \\frac{k}{8000}\\right)+0.6\\cdot \\sin \\left(2\\cdot \\pi \\cdot 659\\cdot \\frac{k}{8000}\\right)\\right)\\cdot e^{-\\frac{k}{2000}}', x: 110 });
    s.row({ latex: 'C\\coloneq 7500\\cdot c', x: 0 }, { latex: '\\max \\left(C\\right)=', x: 160 }, { latex: '\\mathrm{WRITEWAV}\\left(\\text{"chime.wav"},8000,16\\right)\\coloneq C', x: 300 });
    s.plot({ x: '\\frac{k}{8000}', ys: ['C_{k}'], width: 460, height: 140, xTitle: 's' });
    s.text('Save chime.wav and play it. WRITEWAV cuts each sample to a whole number, as Mathcad does; one beyond 32767 would wrap round to a loud click rather than stop at the top, so keep the loudest under it.', { end: true });
  },
};
