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

/** The share of a binary image's pixels that are white, times its pixel count: the white area in pixels. */
const area = (m: string): string => `\\frac{\\mathrm{mean}\\left(${m}\\right)\\cdot n^{2}}{255}`;

export const washer: Example = {
  slug: 'washer',
  title: 'Measuring a washer in a noisy picture',
  summary: 'Image processing on a picture made by formula: noise, dead pixels, a median filter, edges, and an area measured to within a few pixels.',
  build(s) {
    s.text('Measuring a washer in a noisy picture. An inspection camera photographs a washer on a lit table and must check its area. The picture is noisy, and some of the sensor\'s pixels are stuck black or white. A matrix is a picture here, so we make one by formula, spoil it, then clean it up and measure.');
    s.section('The scene. A washer with outer radius 45 pixels and hole radius 20, bright on a table lit more on the right.', true);
    s.row('n\\coloneq 160', 'c\\coloneq 80', 'r_{\\text{o}}\\coloneq 45', 'r_{\\text{i}}\\coloneq 20');
    s.row(
      { latex: '\\rho \\left(i,j\\right)\\coloneq \\sqrt{\\left(i-c\\right)^{2}+\\left(j-c\\right)^{2}}' },
      { latex: 'S\\left(i,j\\right)\\coloneq 70+50\\cdot \\frac{j}{n}+130\\cdot \\left(\\rho \\left(i,j\\right)\\le r_{\\text{o}}\\right)\\cdot \\left(\\rho \\left(i,j\\right)\\ge r_{\\text{i}}\\right)', x: 220 },
    );
    s.text('Each comparison is 1 where it holds and 0 where it doesn\'t, so the last term adds 130 on the washer only. Its true area, in pixels:');
    s.row({ latex: 'A_{\\text{true}}\\coloneq \\pi \\cdot \\left(r_{\\text{o}}^{2}-r_{\\text{i}}^{2}\\right)' }, { latex: 'A_{\\text{true}}=', x: 220 });

    s.section('The camera. Normal noise of 12 gray levels on every pixel, and 3% of pixels stuck at black or white. qnorm of a uniform draw is a normal draw.');
    s.math('P\\left(i,j\\right)\\coloneq S\\left(i,j\\right)+\\mathrm{qnorm}\\left(\\mathrm{rnd}\\left(1\\right),0,12\\right)');
    s.math('Q\\left(i,j\\right)\\coloneq P\\left(i,j\\right)+\\left(\\mathrm{rnd}\\left(1\\right)<0.03\\right)\\cdot \\left(255\\cdot \\left(\\mathrm{rnd}\\left(1\\right)<0.5\\right)-P\\left(i,j\\right)\\right)');
    s.row('M\\coloneq \\mathrm{matrix}\\left(n,n,Q\\right)', 'G\\coloneq \\mathrm{gaussianBlur}\\left(M,1.5\\right)', 'F\\coloneq \\mathrm{medianFilter}\\left(M,3\\right)');
    s.images(
      { latex: 'M', caption: 'As the camera sees it' },
      { latex: 'G', caption: 'Blurred: specks smeared, edges soft' },
      { latex: 'F', caption: 'Median of each 3×3: specks gone, edges sharp' },
    );

    s.section('Measure. Threshold at 160 gray, between the table and the washer, and count the white pixels.');
    s.row({ latex: `A_{\\text{raw}}\\coloneq ${area('\\mathrm{threshold}\\left(M,160\\right)')}` }, { latex: 'A_{\\text{raw}}=', x: 250 }, { latex: '\\frac{A_{\\text{raw}}}{A_{\\text{true}}}-1=', x: 380 });
    s.row({ latex: `A_{\\text{blur}}\\coloneq ${area('\\mathrm{threshold}\\left(G,160\\right)')}` }, { latex: 'A_{\\text{blur}}=', x: 250 }, { latex: '\\frac{A_{\\text{blur}}}{A_{\\text{true}}}-1=', x: 380 });
    s.row({ latex: `A_{\\text{med}}\\coloneq ${area('\\mathrm{threshold}\\left(F,160\\right)')}` }, { latex: 'A_{\\text{med}}=', x: 250 }, { latex: '\\frac{A_{\\text{med}}}{A_{\\text{true}}}-1=', x: 380 });
    s.text('Stuck pixels throw the raw count off: white ones on the table count as washer, black ones on the washer don\'t. The median filter removes them and keeps the edges where they were, so its count is the closest.');

    s.section('Edges. sobelEdges is large where brightness changes fast; a threshold turns it into an outline, as a gauge would use to fit circles.');
    s.row('E\\coloneq \\mathrm{sobelEdges}\\left(F\\right)', 'O\\coloneq \\mathrm{threshold}\\left(E,300\\right)');
    s.images(
      { latex: 'E', fit: true, caption: 'Edge strength' },
      { latex: 'O', caption: 'The outline' },
      { latex: '\\mathrm{ditherFloydSteinberg}\\left(F,2\\right)', caption: 'F dithered to black and white' },
    );
    s.text('Try it: raise the noise from 12 to 40, or the stuck pixels from 3% to 10%, and see which measurement holds up. Reroll on the toolbar takes a new picture.');
  },
};
