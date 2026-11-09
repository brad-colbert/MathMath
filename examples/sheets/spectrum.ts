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

export const spectrum: Example = {
  slug: 'spectrum',
  title: 'Finding a hum in the noise',
  summary: 'An FFT picks two tones out of a signal buried in noise, then a filter in the frequency domain and ifft bring the clean signal back.',
  build(s) {
    s.text('Finding a hum in the noise. A sensor\'s signal carries mains hum and a vibration, but random noise twice their size hides them. In the time domain it looks like static; the Fourier transform shows what is there.');
    s.section('The signal. 1024 samples at 1024 per second: one second. Two tones, 0.5 at 50 Hz and 0.3 at 120 Hz, and normal noise with a standard deviation of 0.8.', true);
    s.row('N\\coloneq 1024', 'f_{\\text{s}}\\coloneq 1024\\cdot \\mathrm{Hz}', 'k\\coloneq 0..N-1', 't_{k}\\coloneq \\frac{k}{f_{\\text{s}}}');
    s.math('c_{k}\\coloneq 0.5\\cdot \\sin \\left(2\\cdot \\pi \\cdot 50\\cdot \\mathrm{Hz}\\cdot t_{k}\\right)+0.3\\cdot \\sin \\left(2\\cdot \\pi \\cdot 120\\cdot \\mathrm{Hz}\\cdot t_{k}\\right)');
    s.row('\\mathrm{noise}\\coloneq \\mathrm{rnorm}\\left(N,0,0.8\\right)', { latex: 'x_{k}\\coloneq c_{k}+\\mathrm{noise}_{k}', x: 250 });
    s.plot(
      { x: 't_{k}', ys: ['x_{k}', 'c_{k}'], width: 440, height: 130, xUnit: '\\mathrm{s}', xMax: '0.2\\cdot \\mathrm{s}', traces: [{ color: '#9ca3af', weight: 1 }, { color: '#2563eb', line: 'solid', weight: 2 }] },
    );
    s.text('The first 0.2 s: what the sensor gives, gray, and the two tones inside it, blue.');

    s.section('The spectrum. fft gives N/2 + 1 complex values, from 0 Hz up to half the sample rate, one hertz apart here. Scaled by 2/√N, a magnitude is a tone\'s amplitude.');
    s.row('F\\coloneq \\mathrm{fft}\\left(x\\right)', 'j\\coloneq 0..\\frac{N}{2}', 'f_{j}\\coloneq j\\cdot \\frac{f_{\\text{s}}}{N}', 'A\\coloneq \\overrightarrow{\\frac{2\\cdot \\left|F\\right|}{\\sqrt{N}}}');
    s.plot(
      { x: 'f_{j}', ys: ['A_{j}'], width: 300, height: 140, xUnit: '\\mathrm{Hz}', traces: [{ color: '#2563eb', weight: 1.5 }] },
      { text: 'Two spikes stand clear of the noise floor, at 50 and 120 Hz.', x: 340 },
    );
    s.row('A_{50}=', 'A_{120}=', '\\mathrm{mean}\\left(A\\right)=');
    s.text('Close to 0.5 and 0.3. The noise is spread thinly over all 513 frequencies, so each tone towers over it.');

    s.section('Clean it up. Keep only the frequencies that stand above 0.15, set the rest to zero, and transform back with ifft.');
    s.row('G\\coloneq \\overrightarrow{F\\cdot \\left(A>0.15\\right)}', 'y\\coloneq \\mathrm{ifft}\\left(G\\right)', '\\mathrm{sum}\\left(\\overrightarrow{A>0.15}\\right)=');
    s.plot(
      { x: 't_{k}', ys: ['y_{k}', 'c_{k}'], width: 440, height: 130, xUnit: '\\mathrm{s}', xMax: '0.2\\cdot \\mathrm{s}', traces: [{ color: '#dc2626', weight: 2 }, { color: '#2563eb', line: 'dash', weight: 1.5 }] },
    );
    s.text('Red, the filtered signal; dashed blue, the true tones. How far each is from the truth:');
    s.row({ latex: '\\mathrm{stdev}\\left(x-c\\right)=' }, { latex: '\\mathrm{stdev}\\left(y-c\\right)=', x: 200 });
    s.text('The error falls more than tenfold. Try it: raise the noise to 2, or move a tone to 300 Hz. Reroll draws new noise.');
  },
};
