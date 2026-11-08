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

// Tiny gray images for the examples, as the matrix the editor writes: gray levels from 0 to 255.
const DOT = '\\begin{pmatrix}0&0&0\\\\0&90&0\\\\0&0&0\\end{pmatrix}';
const RAMP = '\\begin{pmatrix}0&50&100\\\\50&100&150\\\\100&150&200\\end{pmatrix}';
const STEP = '\\begin{pmatrix}0&0&200&200\\\\0&0&200&200\\\\0&0&200&200\\end{pmatrix}';
const MID = '\\begin{pmatrix}40&80&120\\\\80&120&160\\\\120&160&200\\end{pmatrix}';
// One color pixel in two rows: red, green and blue blocks side by side.
const COLOR = '\\begin{pmatrix}200&100&0\\\\0&100&200\\end{pmatrix}';

const SAME = 'A color image is three matrices (R; G; B), or one matrix with the red, green and blue blocks side by side. The filter is applied to each color on its own, and the answer is the same kind of image as the one given.';

export const IMAGES: Entry[] = [
  {
    name: 'imageChannels', group: 'Images', usage: 'imageChannels(M)', mathcad: false,
    summary: 'Splits a color image, with its red, green and blue blocks side by side, into a vector of three matrices (R; G; B).',
    details: [
      'Mathcad\'s file readers and [[readImage]] give color as one matrix three times as wide as the picture: the red block, then the green, then the blue. A matrix like that looks the same as a wide gray image, so only [[imageChannels]], [[toGray]] and [[rgbToHsv]] read it that way. Split it first with this function before blurring or sharpening, or the filter runs across the seams between the blocks.',
      'Pick a channel out with an index: C₀, typed `C[0`, is red. [[joinChannels]] does the opposite.',
    ],
    errors: ['A matrix whose number of columns isn\'t a multiple of 3.', 'Anything but a matrix of real numbers without units.'],
    example: [`M\\coloneq ${COLOR}`, 'C\\coloneq \\mathrm{imageChannels}\\left(M\\right)', 'C_{0}='],
  },
  {
    name: 'joinChannels', group: 'Images', usage: 'joinChannels(R, G, B)', mathcad: false,
    summary: 'Puts three matrices, the red, green and blue channels, together as one color image with the blocks side by side.',
    details: [
      'The answer has three times the columns of each channel, the form [[READRGB]] and [[readImage]] give and image regions show as color. Give a vector of three matrices, such as the answer of [[imageChannels]], as the one argument instead.',
    ],
    errors: ['A number of channels other than three.', 'Channels of different sizes.', 'Channels with units or complex numbers.'],
    example: ['R\\coloneq \\begin{pmatrix}200\\\\0\\end{pmatrix}', 'G\\coloneq \\begin{pmatrix}100\\\\100\\end{pmatrix}', 'B\\coloneq \\begin{pmatrix}0\\\\200\\end{pmatrix}', '\\mathrm{joinChannels}\\left(R,G,B\\right)='],
  },
  {
    name: 'toGray', group: 'Images', usage: 'toGray(M)', mathcad: false,
    summary: 'A color image as gray levels, weighting the channels 0.299 red, 0.587 green and 0.114 blue.',
    details: [
      'Takes a vector of three matrices (R; G; B), or one matrix with the red, green and blue blocks side by side. A matrix that is already gray comes back unchanged.',
    ],
    errors: ['A matrix whose number of columns isn\'t a multiple of 3, as a color image.', 'Channels of different sizes.'],
    example: ['M\\coloneq \\begin{pmatrix}100&100&100\\\\200&200&200\\end{pmatrix}', '\\mathrm{toGray}\\left(M\\right)='],
  },
  {
    name: 'rgbToHsv', group: 'Images', usage: 'rgbToHsv(M)', mathcad: false,
    summary: 'A color image in hue, saturation and value, each scaled 0 to 255 like the channels.',
    details: [
      'The image is a vector of three matrices (R; G; B), or one matrix with the three blocks side by side; the answer is the same kind, with hue, saturation and value in place of red, green and blue. Hue 255 is a full turn round the color wheel, so red is 0, green is about 85 and blue about 170. [[hsvToRgb]] goes back.',
    ],
    errors: ['A gray image: it needs three channels.', 'Channels of different sizes.'],
    example: ['M\\coloneq \\begin{pmatrix}255&0&0\\\\0&255&0\\end{pmatrix}', '\\mathrm{rgbToHsv}\\left(M\\right)='],
  },
  {
    name: 'hsvToRgb', group: 'Images', usage: 'hsvToRgb(M)', mathcad: false,
    summary: 'A color image given as hue, saturation and value, each 0 to 255, in red, green and blue.',
    details: ['The reverse of [[rgbToHsv]], in the same two forms: a vector of three matrices, or one matrix with the blocks side by side. Hue 255 is a full turn, so 0 and 255 are both red.'],
    errors: ['A gray image: it needs three channels.', 'Channels of different sizes.'],
    example: ['M\\coloneq \\begin{pmatrix}0&255&255\\\\0&0&128\\end{pmatrix}', '\\mathrm{hsvToRgb}\\left(M\\right)='],
  },
  {
    name: 'resizeImage', group: 'Images', usage: 'resizeImage(M, rows, cols)', mathcad: false,
    summary: 'The image scaled to the given number of rows and columns, by linear interpolation.',
    details: [
      'Enlarging blends neighboring pixels. Shrinking averages the pixels that fall into each new one, so none is skipped. A flat image stays flat. To pad or cut a matrix without scaling use [[resize]]. ' + SAME,
    ],
    errors: ['Rows or columns that aren\'t whole numbers of 1 or more.', 'Anything but a matrix of plain numbers, or three of them.'],
    example: ['M\\coloneq \\begin{pmatrix}0&100\\\\100&200\\end{pmatrix}', '\\mathrm{resizeImage}\\left(M,1,1\\right)=', '\\mathrm{resizeImage}\\left(M,2,4\\right)='],
  },
  {
    name: 'rotateImage', group: 'Images', usage: 'rotateImage(M, angle)', mathcad: false,
    summary: 'The image turned by an angle about its center, the size kept, corners left empty as 0.',
    details: ['The angle is in radians, so `90·deg` works as well as `π/2`. A positive angle turns counterclockwise as the image is shown. In between pixels the values are blended. For turns of exactly a quarter use [[rotate90]]. ' + SAME],
    errors: ['An angle that isn\'t a plain real number.'],
    example: [`M\\coloneq ${RAMP}`, `\\mathrm{rotateImage}\\left(M,\\frac{\\pi}{2}\\right)=`],
  },
  {
    name: 'rotate90', group: 'Images', usage: 'rotate90(M, [k])', mathcad: false,
    summary: 'The image turned by k quarter turns counterclockwise, one if k is left out; the size changes if the image isn\'t square.',
    details: ['A negative k turns clockwise, and 4 turns bring it back. ' + SAME],
    errors: ['A number of turns that isn\'t a whole number.'],
    example: ['M\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}', '\\mathrm{rotate90}\\left(M\\right)=', '\\mathrm{rotate90}\\left(M,2\\right)='],
  },
  {
    name: 'flipRows', group: 'Images', usage: 'flipRows(M)', mathcad: false,
    summary: 'The image upside down: the order of its rows reversed.',
    details: ['[[flipCols]] mirrors it left to right. ' + SAME],
    example: ['M\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}', '\\mathrm{flipRows}\\left(M\\right)='],
  },
  {
    name: 'flipCols', group: 'Images', usage: 'flipCols(M)', mathcad: false,
    summary: 'The image mirrored left to right: the order of its columns reversed.',
    details: ['[[flipRows]] turns it upside down. ' + SAME],
    example: ['M\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}', '\\mathrm{flipCols}\\left(M\\right)='],
  },
  {
    name: 'convolve2d', group: 'Images', usage: 'convolve2d(M, K)', mathcad: false,
    summary: 'The image convolved with a small kernel matrix K, the same size as the image.',
    details: [
      'K must have an odd number of rows and columns, such as 3×3, so it has a center pixel. It is flipped before use, as in a true convolution: a kernel with one 1 off center moves the image the opposite way. Beyond the edge the border pixels are taken to continue, so the size is kept. Nothing is scaled, so a kernel that doesn\'t sum to 1 changes the overall brightness; values can leave the range 0 to 255.',
      'Use this to build your own filters; [[boxBlur]], [[gaussianBlur]], [[sharpen]] and [[sobelEdges]] are common ones ready made. ' + SAME,
    ],
    errors: ['A kernel with an even number of rows or columns.', 'A kernel that isn\'t a plain matrix of numbers.'],
    example: [`M\\coloneq ${DOT}`, 'K\\coloneq \\begin{pmatrix}0&1&0\\\\1&0&1\\\\0&1&0\\end{pmatrix}', '\\mathrm{convolve2d}\\left(M,K\\right)='],
  },
  {
    name: 'gaussianBlur', group: 'Images', usage: 'gaussianBlur(M, σ)', mathcad: false,
    summary: 'The image blurred with a bell-shaped kernel of standard deviation σ pixels.',
    details: ['A larger σ blurs more; 0 changes nothing. The kernel reaches out to four σ and is normalized, so overall brightness is kept. Edges are treated as continuing the border pixels. ' + SAME],
    errors: ['A negative σ.'],
    example: [`M\\coloneq ${STEP}`, '\\mathrm{gaussianBlur}\\left(M,1\\right)='],
  },
  {
    name: 'boxBlur', group: 'Images', usage: 'boxBlur(M, n)', mathcad: false,
    summary: 'The image blurred by averaging each pixel with its n×n neighborhood.',
    details: ['n is odd: 3, 5, 7 … so the window has a center. Edges are treated as continuing the border pixels, so the size is kept. [[gaussianBlur]] weights nearer pixels more. ' + SAME],
    errors: ['An n that isn\'t an odd whole number.'],
    example: [`M\\coloneq ${DOT}`, '\\mathrm{boxBlur}\\left(M,3\\right)='],
  },
  {
    name: 'medianFilter', group: 'Images', usage: 'medianFilter(M, n)', mathcad: false,
    summary: 'Each pixel replaced by the median of its n×n neighborhood, which removes specks without blurring edges.',
    details: ['n is odd. Edges are treated as continuing the border pixels. A single bright or dark pixel among its neighbors disappears. ' + SAME],
    errors: ['An n that isn\'t an odd whole number.'],
    example: [`M\\coloneq ${DOT}`, '\\mathrm{medianFilter}\\left(M,3\\right)='],
  },
  {
    name: 'sharpen', group: 'Images', usage: 'sharpen(M, amount, [σ])', mathcad: false,
    summary: 'The image sharpened by adding amount times the difference between it and a blurred copy.',
    details: ['The blur is [[gaussianBlur]] with σ, 1 if left out. An amount of 0 changes nothing; 1 is a gentle sharpening. Results can go past 0 and 255: clip them with [[levels]] or [[threshold]] if you need to stay in range. ' + SAME],
    example: [`M\\coloneq ${STEP}`, '\\mathrm{sharpen}\\left(M,1\\right)='],
  },
  {
    name: 'sobelEdges', group: 'Images', usage: 'sobelEdges(M)', mathcad: false,
    summary: 'The strength of the edges in the image: large where brightness changes quickly, 0 where it is flat.',
    details: ['Combines the Sobel horizontal and vertical gradients as √(gx²+gy²), so values can be beyond 255. Pair it with [[threshold]] to get a black and white outline. ' + SAME],
    example: [`M\\coloneq ${STEP}`, '\\mathrm{sobelEdges}\\left(M\\right)='],
  },
  {
    name: 'threshold', group: 'Images', usage: 'threshold(M, level)', mathcad: false,
    summary: 'Black and white: 255 where a pixel is at or above the level, 0 below it.',
    details: [SAME],
    example: [`M\\coloneq ${RAMP}`, '\\mathrm{threshold}\\left(M,100\\right)='],
  },
  {
    name: 'levels', group: 'Images', usage: 'levels(M, low, high)', mathcad: false,
    summary: 'Stretches the range low to high over 0 to 255, clipping what falls outside.',
    details: ['Pixels at or below low become 0, at or above high become 255, and the ones between are spread evenly. Use it to raise the contrast of a dull image. ' + SAME],
    errors: ['A high point that isn\'t above the low point.'],
    example: [`M\\coloneq ${MID}`, '\\mathrm{levels}\\left(M,40,200\\right)='],
  },
  {
    name: 'gammaAdjust', group: 'Images', usage: 'gammaAdjust(M, γ)', mathcad: false,
    summary: 'The brightness curve 255·(x/255)^γ: γ below 1 brightens the midtones and above 1 darkens them.',
    details: ['0 and 255 stay where they are. ' + SAME],
    errors: ['A γ of 0 or less.'],
    example: ['M\\coloneq \\begin{pmatrix}51&102\\\\153&204\\end{pmatrix}', '\\mathrm{gammaAdjust}\\left(M,2\\right)='],
  },
  {
    name: 'equalize', group: 'Images', usage: 'equalize(M)', mathcad: false,
    summary: 'Spreads the gray levels so they use the whole range 0 to 255 about evenly (histogram equalization).',
    details: ['Each level becomes the share of pixels at or below it, scaled to 255, so the darkest level present becomes 0 and the brightest 255. A flat image is left as it was. ' + SAME],
    example: ['M\\coloneq \\begin{pmatrix}100&100&110\\\\110&120&120\\end{pmatrix}', '\\mathrm{equalize}\\left(M\\right)='],
  },
  {
    name: 'erode', group: 'Images', usage: 'erode(M, n)', mathcad: false,
    summary: 'Each pixel replaced by the smallest in its n×n neighborhood, which shrinks bright areas.',
    details: ['n is odd. Edges are treated as continuing the border pixels. [[dilate]] does the opposite. ' + SAME],
    errors: ['An n that isn\'t an odd whole number.'],
    example: [`M\\coloneq ${STEP}`, '\\mathrm{erode}\\left(M,3\\right)='],
  },
  {
    name: 'dilate', group: 'Images', usage: 'dilate(M, n)', mathcad: false,
    summary: 'Each pixel replaced by the largest in its n×n neighborhood, which grows bright areas.',
    details: ['n is odd. Edges are treated as continuing the border pixels. [[erode]] does the opposite. ' + SAME],
    errors: ['An n that isn\'t an odd whole number.'],
    example: [`M\\coloneq ${DOT}`, '\\mathrm{dilate}\\left(M,3\\right)='],
  },
  {
    name: 'ditherFloydSteinberg', group: 'Images', usage: 'ditherFloydSteinberg(M, levels)', mathcad: false,
    summary: 'The image reduced to a number of evenly spaced gray levels, spreading each rounding error to the pixels after it.',
    details: [
      'levels is 2 for black and white up to 256. The error of each pixel is passed on, in raster order, to its right and lower neighbors: 7/16 right, 3/16, 5/16 and 1/16 below. The pattern keeps the average brightness. See also [[ditherAtkinson]] and [[ditherJarvis]]. ' + SAME,
    ],
    errors: ['A number of levels that isn\'t a whole number from 2 to 256.'],
    example: ['M\\coloneq \\begin{pmatrix}128&128&128\\\\128&128&128\\\\128&128&128\\end{pmatrix}', '\\mathrm{ditherFloydSteinberg}\\left(M,2\\right)='],
  },
  {
    name: 'ditherAtkinson', group: 'Images', usage: 'ditherAtkinson(M, levels)', mathcad: false,
    summary: 'The image reduced to a number of gray levels, passing on only three quarters of each error to keep highlights and shadows clean.',
    details: ['levels is 2 to 256. One eighth of the error goes to each of six nearby pixels, so the rest is dropped: contrast goes up compared with [[ditherFloydSteinberg]]. ' + SAME],
    errors: ['A number of levels that isn\'t a whole number from 2 to 256.'],
    example: ['M\\coloneq \\begin{pmatrix}128&128&128\\\\128&128&128\\\\128&128&128\\end{pmatrix}', '\\mathrm{ditherAtkinson}\\left(M,2\\right)='],
  },
  {
    name: 'ditherJarvis', group: 'Images', usage: 'ditherJarvis(M, levels)', mathcad: false,
    summary: 'The image reduced to a number of gray levels, spreading each error widely over twelve nearby pixels.',
    details: ['levels is 2 to 256. The wide spread gives a smoother pattern than [[ditherFloydSteinberg]], at more work. ' + SAME],
    errors: ['A number of levels that isn\'t a whole number from 2 to 256.'],
    example: ['M\\coloneq \\begin{pmatrix}128&128&128\\\\128&128&128\\\\128&128&128\\end{pmatrix}', '\\mathrm{ditherJarvis}\\left(M,2\\right)='],
  },
  {
    name: 'ditherOrdered', group: 'Images', usage: 'ditherOrdered(M, levels, [size])', mathcad: false,
    summary: 'The image reduced to a number of gray levels by comparing each pixel with a repeating Bayer pattern.',
    details: ['levels is 2 to 256. size is the pattern\'s side: 2, 4, 8 or 16, 4 if left out; a bigger pattern gives more shades in a flat area. Each pixel is decided on its own, so the same input always gives the same regular texture. ' + SAME],
    errors: ['A number of levels that isn\'t a whole number from 2 to 256.', 'A size other than 2, 4, 8 or 16.'],
    example: ['M\\coloneq \\begin{pmatrix}128&128\\\\128&128\\end{pmatrix}', '\\mathrm{ditherOrdered}\\left(M,2,2\\right)='],
  },
  {
    name: 'resize', group: 'Vectors and matrices', usage: 'resize(M, rows, cols)', mathcad: true,
    summary: 'The matrix cut or padded with zeros to the given number of rows and columns, with no scaling.',
    details: ['What fits is kept in place and anything new is 0. To scale an image to a new size, blending its pixels, use [[resizeImage]].'],
    example: ['M\\coloneq \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\mathrm{resize}\\left(M,3,3\\right)=', '\\mathrm{resize}\\left(M,1,2\\right)='],
  },
];
