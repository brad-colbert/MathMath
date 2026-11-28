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

/**
 * Which arguments of a built-in take a whole array under the vectorize arrow.
 *
 * Under the arrow, a function of numbers is called once for each element, but an argument that is an array by
 * nature goes in whole: →(v / max(v)) divides each element by the largest, and →augment(a, b) is a matrix of two
 * columns. Mathcad 14 does the same: its own sheets keep →reverse(A) as A reversed and →augment(a, b) as one
 * matrix, its migration guide says augment's arguments aren't vectorized, and →|y − mean(y)| takes the mean of
 * the whole of y. Functions defined in the sheet always go element by element, as Mathcad's do.
 *
 * Every built-in whose Help entry is in an array group (Statistics, Vectors and matrices and so on) is listed
 * here, and test/vectorize.test.ts keeps it so, along with the few elsewhere that take an array.
 */
type Whole = true | 'one' | readonly number[];

/**
 * `true`: every argument goes in whole. A list: those arguments, by position from 0, and the others element by
 * element. `'one'`: whole when called with one argument, as xy2pol(v), and element by element otherwise, as
 * xy2pol(x, y).
 */
const WHOLE: Record<string, Whole> = {
  // Vectors and matrices. The value looked up is a number, so it goes element by element.
  until: true, augment: true, stack: true, cols: true, rows: true, length: true, last: true, diag: true, identity: true, matrix: true,
  submatrix: true, reverse: true, sort: true, csort: true, rsort: true, tr: true, resize: true,
  lookup: [1, 2], hlookup: [1], vlookup: [1], match: [1],
  // Statistics
  mean: true, stdev: true, Stdev: true, max: true, min: true, hist: true, histogram: true, var: true, Var: true, median: true, mode: true,
  gmean: true, hmean: true, skew: true, kurt: true, cvar: true, corr: true,
  // Linear algebra
  rank: true, det: true, norm1: true, norm2: true, norme: true, normi: true, cond1: true, cond2: true, conde: true, condi: true,
  eigenvals: true, eigenvec: true, eigenvecs: true, genvals: true, genvecs: true, cholesky: true, lu: true, qr: true, svd: true, svd2: true,
  svds: true, geninv: true, lsolve: true, rref: true,
  // Interpolation and fitting. The point to interpolate at is a number.
  linterp: [0, 1], interp: [0, 1, 2],
  lspline: true, pspline: true, cspline: true, bspline: true, predict: true, slope: true, intercept: true, line: true, stderr: true,
  medfit: true, linfit: true, regress: true, loess: true, genfit: true, expfit: true, lgsfit: true, logfit: true, lnfit: true, pwrfit: true,
  sinfit: true,
  // Solving
  Find: true, Minerr: true, Maximize: true, Minimize: true, Odesolve: true, root: true, polyroots: true,
  // Differential equations
  rkfixed: true, Rkadapt: true, rkadapt: true, Bulstoer: true, bulstoer: true, Adams: true, statespace: true, sbval: true, bvalfit: true,
  numol: true, Pdesolve: true, relax: true, multigrid: true, Jacob: true, Stiffb: true, stiffb: true, Stiffr: true, stiffr: true,
  AdamsBDF: true, BDF: true, Radau: true,
  // Plots and coordinates
  xy2pol: 'one', pol2xy: 'one', xyz2sph: 'one', sph2xyz: 'one', xyz2cyl: 'one', cyl2xyz: 'one',
  logspace: true, logpts: true, CreateMesh: true, CreateSpace: true, PolyLookup: true, Polyhedron: true, SaveColormap: true, LoadColormap: true,
  // Fourier transforms
  fft: true, FFT: true, ifft: true, IFFT: true, cfft: true, CFFT: true, icfft: true, ICFFT: true, wave: true, iwave: true,
  // Signal processing
  convolve: true, correlate: true, hannWindow: true, hammingWindow: true, blackmanWindow: true, kaiserWindow: true, firLowpass: true,
  firHighpass: true, firBandpass: true, firBandstop: true, applyFilter: true, zeroPhaseFilter: true, medsmooth: true, unwrapPhase: true,
  freqResponse: true, impulseResponse: true, stepResponse: true, ksmooth: true, supsmooth: true, correl: true, correl2d: true,
  // Filters and systems
  butterLowpass: true, butterHighpass: true, butterBandpass: true, butterBandstop: true, cheby1Lowpass: true, cheby1Highpass: true,
  cheby1Bandpass: true, cheby1Bandstop: true, cheby2Lowpass: true, cheby2Highpass: true, cheby2Bandpass: true, cheby2Bandstop: true,
  ellipLowpass: true, ellipHighpass: true, ellipBandpass: true, ellipBandstop: true, besselLowpass: true, besselHighpass: true,
  besselBandpass: true, besselBandstop: true, analogPoles: true, analogZeros: true, digitalPoles: true, digitalZeros: true,
  // Images
  imageChannels: true, joinChannels: true, toGray: true, rgbToHsv: true, hsvToRgb: true, rgbToHls: true, hlsToRgb: true, resizeImage: true,
  rotateImage: true, rotate90: true, flipRows: true, flipCols: true, convolve2d: true, gaussianBlur: true, boxBlur: true, medianFilter: true,
  sharpen: true, sobelEdges: true, threshold: true, levels: true, gammaAdjust: true, equalize: true, erode: true, dilate: true,
  ditherFloydSteinberg: true, ditherAtkinson: true, ditherJarvis: true, ditherOrdered: true,
  // Files
  readImage: true, writeImage: true, readTable: true, readWav: true, wavRate: true, wavInfo: true, READPRN: true, WRITEPRN: true,
  APPENDPRN: true, READ: true, WRITE: true, READFILE: true, READBIN: true, WRITEBIN: true, READRGB: true, READ_IMAGE: true, READBMP: true,
  WRITEBMP: true, WRITERGB: true, READ_RED: true, READ_GREEN: true, READ_BLUE: true, READ_HLS: true, READ_HSV: true, READ_HLS_HUE: true,
  READ_HLS_LIGHT: true, READ_HLS_SAT: true, READ_HSV_HUE: true, READ_HSV_SAT: true, READ_HSV_VALUE: true, READWAV: true, GETWAVINFO: true,
  WRITEWAV: true, WRITE_HLS: true, WRITE_HSV: true,
  // Circuits
  nodeVoltages: true, branchCurrents: true,

  // Elsewhere: functions of numbers mostly, but these take an array.
  sum: true, gcd: true, lcm: true, IsArray: true, IsScalar: true, IsString: true, SIUnitsOf: true, UnitsOf: true,
  error: true, trace: true, pause: true, DMS: 'one', vec2str: true,
  npv: [1], irr: [0], mirr: [0], fvadj: [1], fvc: [1],
  sToZ: true, zToS: true, sToY: true, yToS: true, zToY: true, yToZ: true, sToAbcd: true, abcdToS: true, zToAbcd: true, abcdToZ: true,
  yToAbcd: true, abcdToY: true,
};

/** The names listed, for the test that keeps the list complete. */
export const WHOLE_NAMES: readonly string[] = Object.keys(WHOLE);

/** Whether argument `i` of `n` to the built-in `name` goes in whole under the vectorize arrow. */
export function wholeArgument(name: string, i: number, n: number): boolean {
  const w = WHOLE[name];
  if (w === undefined) return false;
  if (w === true) return true;
  if (w === 'one') return n === 1;
  return w.includes(i);
}
