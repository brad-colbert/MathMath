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

import type { Entry } from '../types.js';

const S = 'Signal processing';
const col = (xs: number[]) => `\\begin{pmatrix}${xs.join('\\\\')}\\end{pmatrix}`;
const mat = (rows: number[][]) => `\\begin{pmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{pmatrix}`;
const X = col([1, 2, 3, 4, 5, 6]);
const Y = col([2.1, 3.9, 3.2, 5.8, 5.1, 7.2]);

export const SMOOTHING: Entry[] = [
  {
    name: 'ksmooth', group: S, usage: 'ksmooth(vx, vy, b)', mathcad: true,
    summary: 'The points vy smoothed by a Gaussian kernel of bandwidth b along vx.',
    details: [
      'Each smoothed point is the average of all of vy, each weighted by a Gaussian of its distance along x, with standard deviation b/2.696756. Mathcad\'s Help rounds that to 0.37·b; MathMath uses the constant Mathcad\'s answers show.',
      'vx ascends, ties allowed, and vy is the same length. b is in vx\'s units, usually a few times the spacing of the points. See also [[supsmooth]] and [[medsmooth]]; Mathcad\'s loess isn\'t in MathMath yet.',
    ],
    units: 'The result is in vy\'s units.',
    errors: ['vx not in ascending order.', 'vx and vy of different lengths.', 'A b of 0 or less, or not in vx\'s units.'],
    example: [`\\mathrm{ksmooth}\\left(${X},${Y},2\\right)=`],
  },
  {
    name: 'supsmooth', group: S, usage: 'supsmooth(vx, vy)', mathcad: true,
    summary: 'The points vy smoothed adaptively: Friedman\'s super smoother, which chooses its span at each point.',
    details: [
      'Running least-squares lines through the nearest 5%, 20% and 50% of the points, blended at each point by whichever span predicts the points left out best, as Friedman\'s supsmu does without bass enhancement. Its answers agree with Mathcad\'s to 15 digits.',
      'vx strictly ascends, and vy is the same length. Three points or fewer come back as they are, as in Mathcad. See also [[ksmooth]].',
    ],
    units: 'The result is in vy\'s units.',
    errors: ['vx not strictly ascending: no two the same.', 'vx and vy of different lengths.'],
    example: [`\\mathrm{supsmooth}\\left(${X},${Y}\\right)=`],
  },
  {
    name: 'correl', group: S, usage: 'correl(vx, vy)', mathcad: true,
    summary: 'The correlation of two vectors at every shift, as Mathcad orders it: a vector of length(vx) + length(vy) − 1.',
    details: [
      'Element m is the sum of vx_(n+m)·conj(vy_n), the indices taken round the combined length with zeros beyond each vector. So the first element is the overlap at no shift, the next ones shifts with vx ahead, and the last ones shifts with vy ahead. For the lags in order, see [[correlate]].',
      'The vectors are columns of numbers without units, and can be complex.',
    ],
    errors: ['A row, or values with units.'],
    example: [`\\mathrm{correl}\\left(${col([1, 2, 3])},${col([1, 0, -1, 2])}\\right)=`],
  },
  {
    name: 'correl2d', group: S, usage: 'correl2d(M, K)', mathcad: true,
    summary: 'The 2-D correlation of the kernel K with the matrix M, the same size as M.',
    details: [
      'Each element is the sum of K times the part of M under it, with K\'s centre, at row and column floor(size/2), over that element, and zeros beyond M\'s edges. Used to filter an image with a kernel.',
      'M and K are real matrices without units.',
    ],
    errors: ['Complex values, or values with units.'],
    example: [`\\mathrm{correl2d}\\left(${mat([[1, 2, 3], [4, 5, 6], [7, 8, 9]])},${mat([[0, 1, 0], [1, 1, 1], [0, 1, 0]])}\\right)=`],
  },
  {
    name: 'wave', group: 'Fourier transforms', usage: 'wave(v)', mathcad: true,
    summary: 'The discrete wavelet transform of v, with Daubechies\' four-coefficient filter.',
    details: [
      'The pyramid of Numerical Recipes\' wt1 with daub4: the smooth coefficients first, then the details of each level from coarsest to finest. Within each level the detail that wraps round the end comes first, as in Mathcad. [[iwave]] goes back.',
      'v is a real column with a power of 2 elements, without units; two elements come back as they are.',
    ],
    errors: ['A length that isn\'t a power of 2, or 1.', 'Complex values, or values with units.'],
    example: [`\\mathrm{wave}\\left(${col([1, 2, 3, 4, 5, 6, 7, 8])}\\right)=`],
  },
  {
    name: 'iwave', group: 'Fourier transforms', usage: 'iwave(u)', mathcad: true,
    summary: 'The inverse of [[wave]]: the data whose wavelet transform is u.',
    details: ['u is a real column with a power of 2 elements, without units.'],
    errors: ['A length that isn\'t a power of 2, or 1.', 'Complex values, or values with units.'],
    example: [`\\mathrm{iwave}\\left(\\mathrm{wave}\\left(${col([1, 2, 3, 4])}\\right)\\right)=`],
  },
];
