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
 * Image processing. An image is a matrix of numbers, 0 to 255 by convention: a plain matrix is one channel
 * (gray), and a vector of three matrices (R; G; B) is color. Functions that work on a channel at a time do
 * each of a color image's three, and give back the same kind they were given.
 *
 * Mathcad's `READRGB`, and `readImage`, give color as one matrix with the red, green and blue blocks side by
 * side. That can't be told from a wide gray image, so only the functions whose job is color read a plain
 * matrix that way: `imageChannels`, `toGray` and `rgbToHsv`. Split it with `imageChannels` before filtering,
 * or a blur would run across the seams between the blocks.
 *
 * Filters treat the edge as continuing the border pixels, as SciPy's `mode='nearest'`, so the size stays.
 * The tests check them against SciPy's `ndimage`, on invented images.
 */
import { EvalError, type Mat, type Value, fromValues, isNoDim, newMat, requireReal } from './values.js';

/** One channel, column by column, as matrices are stored. */
interface Channel { rows: number; cols: number; v: Float64Array }
/** One channel or three, and whether it came as a plain matrix, (R; G; B), or the side-by-side blocks. */
interface Image { ch: Channel[]; form: 'plain' | 'nested' | 'side' }

const PLAIN = 'image functions take plain numbers (0 to 255 for an image), with no units';

function channelOf(v: Value, fn: string): Channel {
  if (v.t !== 'mat' || v.cells) throw new EvalError('runtime', `${fn} needs an image: a matrix of numbers, or a vector of three (R; G; B)`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}: ${PLAIN}`);
  if (v.im && v.im.some((x) => x !== 0)) throw new EvalError('runtime', `${fn} needs real numbers`);
  return { rows: v.rows, cols: v.cols, v: v.re };
}

/** The image a value holds. `side` reads a plain matrix with a multiple of 3 columns as R|G|B side by side. */
function imageOf(v: Value, fn: string, side = false): Image {
  if (v.t === 'mat' && v.cells) {
    if (v.rows * v.cols !== 3) throw new EvalError('runtime', `${fn} needs an image: a matrix of numbers, or a vector of three (R; G; B)`);
    const ch = v.cells.map((c) => channelOf(c, fn));
    if (ch.some((c) => c.rows !== ch[0]!.rows || c.cols !== ch[0]!.cols)) throw new EvalError('runtime', `${fn}: the red, green and blue matrices differ in size`);
    return { ch, form: 'nested' };
  }
  if (v.t === 'num') return { ch: [channelOf(fromValues(1, 1, [v]), fn)], form: 'plain' };
  const c = channelOf(v, fn);
  if (!side) return { ch: [c], form: 'plain' };
  if (c.cols % 3 !== 0) throw new EvalError('runtime', `${fn} reads one matrix as red, green and blue blocks side by side, so it needs a multiple of 3 columns, not ${c.cols}`);
  const w = c.cols / 3;
  const ch = [0, 1, 2].map((k) => ({ rows: c.rows, cols: w, v: c.v.slice(k * w * c.rows, (k + 1) * w * c.rows) }));
  return { ch, form: 'side' };
}

const matOf = (c: Channel): Mat => {
  const m = newMat(c.rows, c.cols);
  m.re.set(c.v);
  return m;
};

function valueOf(img: Image): Mat {
  if (img.ch.length === 1) return matOf(img.ch[0]!);
  if (img.form === 'side') {
    const { rows, cols } = img.ch[0]!;
    const m = newMat(rows, cols * 3);
    img.ch.forEach((c, k) => m.re.set(c.v, k * rows * cols));
    return m;
  }
  return fromValues(3, 1, img.ch.map(matOf));
}

/** Applies f to each channel and gives back the same kind of image. */
const perChannel = (v: Value, fn: string, f: (c: Channel) => Channel): Mat => {
  const img = imageOf(v, fn);
  return valueOf({ ...img, ch: img.ch.map(f) });
};

const at = (c: Channel, i: number, j: number): number => c.v[Math.min(c.rows - 1, Math.max(0, i)) + Math.min(c.cols - 1, Math.max(0, j)) * c.rows]!;
const blank = (rows: number, cols: number): Channel => ({ rows, cols, v: new Float64Array(rows * cols) });
const clamp255 = (x: number): number => Math.min(255, Math.max(0, x));

function oddSize(v: Value, fn: string, what = 'size'): number {
  const n = requireReal(v, `${fn}'s ${what}`);
  if (!Number.isInteger(n) || n < 1 || n % 2 === 0) throw new EvalError('runtime', `${fn}'s ${what} must be an odd whole number, such as 3 or 5, so the window has a center`);
  return n;
}

// ── Filters ─────────────────────────────────────────────────────────────────────────────────────────

/** A 1-D kernel along rows (axis 0) or columns (axis 1), correlated, with nearest-edge padding. */
function correlate1d(c: Channel, w: ArrayLike<number>, axis: 0 | 1): Channel {
  const out = blank(c.rows, c.cols);
  const r = (w.length - 1) / 2;
  for (let j = 0; j < c.cols; j++) {
    for (let i = 0; i < c.rows; i++) {
      let s = 0;
      for (let k = 0; k < w.length; k++) s += w[k]! * (axis === 0 ? at(c, i + k - r, j) : at(c, i, j + k - r));
      out.v[i + j * c.rows] = s;
    }
  }
  return out;
}

/** As SciPy's `ndimage.convolve(M, K, mode='nearest')`: the kernel is flipped, so it's a true convolution. */
function convolve2d(c: Channel, k: Channel): Channel {
  const out = blank(c.rows, c.cols);
  const [ci, cj] = [(k.rows - 1) / 2, (k.cols - 1) / 2];
  for (let j = 0; j < c.cols; j++) {
    for (let i = 0; i < c.rows; i++) {
      let s = 0;
      for (let b = 0; b < k.cols; b++) for (let a = 0; a < k.rows; a++) s += k.v[a + b * k.rows]! * at(c, i + ci - a, j + cj - b);
      out.v[i + j * c.rows] = s;
    }
  }
  return out;
}

/** As SciPy's `gaussian_filter(σ, mode='nearest', truncate=4)`: a kernel out to 4σ, normalized. */
function gaussianKernel(sigma: number): Float64Array {
  const r = Math.trunc(4 * sigma + 0.5);
  const w = Float64Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)));
  const sum = w.reduce((s, x) => s + x, 0);
  return w.map((x) => x / sum);
}

const gaussian = (c: Channel, sigma: number): Channel => {
  if (sigma === 0) return c;
  const w = gaussianKernel(sigma);
  return correlate1d(correlate1d(c, w, 0), w, 1);
};

/** The value at each pixel picked from its n×n neighborhood: a median, minimum or maximum. */
function rank(c: Channel, n: number, pick: (win: Float64Array) => number): Channel {
  const out = blank(c.rows, c.cols);
  const r = (n - 1) / 2;
  const win = new Float64Array(n * n);
  for (let j = 0; j < c.cols; j++) {
    for (let i = 0; i < c.rows; i++) {
      let k = 0;
      for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) win[k++] = at(c, i + a, j + b);
      out.v[i + j * c.rows] = pick(win);
    }
  }
  return out;
}

const median = (win: Float64Array): number => {
  win.sort();
  return win[(win.length - 1) / 2]!;
};
const minOf = (win: Float64Array): number => win.reduce((m, x) => (x < m ? x : m), Infinity);
const maxOf = (win: Float64Array): number => win.reduce((m, x) => (x > m ? x : m), -Infinity);

// ── Geometry ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resamples along one axis with a triangle (linear) kernel, widened when shrinking so every input pixel
 * counts, as image editors do. Pixel centers line up: pixel k covers k to k + 1.
 */
function resample(c: Channel, size: number, axis: 0 | 1): Channel {
  const from = axis === 0 ? c.rows : c.cols;
  const scale = from / size;
  const support = Math.max(1, scale);
  const out = axis === 0 ? blank(size, c.cols) : blank(c.rows, size);
  const weights: { lo: number; w: number[] }[] = [];
  for (let d = 0; d < size; d++) {
    const center = (d + 0.5) * scale - 0.5;
    const lo = Math.ceil(center - support);
    const hi = Math.floor(center + support);
    const w: number[] = [];
    for (let s = lo; s <= hi; s++) w.push(Math.max(0, 1 - Math.abs(s - center) / support));
    const sum = w.reduce((t, x) => t + x, 0);
    weights.push({ lo, w: w.map((x) => x / sum) });
  }
  for (let d = 0; d < size; d++) {
    const { lo, w } = weights[d]!;
    if (axis === 0) {
      for (let j = 0; j < c.cols; j++) {
        let s = 0;
        w.forEach((x, k) => (s += x * at(c, lo + k, j)));
        out.v[d + j * size] = s;
      }
    } else {
      for (let i = 0; i < c.rows; i++) {
        let s = 0;
        w.forEach((x, k) => (s += x * at(c, i, lo + k)));
        out.v[i + d * c.rows] = s;
      }
    }
  }
  return out;
}

/**
 * Turned by `angle` radians about the center, keeping the size, as SciPy's
 * `ndimage.rotate(M, degrees, reshape=False, order=1, mode='constant')`: positive turns counterclockwise as
 * the image is shown, and corners left empty are 0.
 */
function rotate(c: Channel, angle: number): Channel {
  const out = blank(c.rows, c.cols);
  const [ci, cj] = [(c.rows - 1) / 2, (c.cols - 1) / 2];
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const get = (i: number, j: number): number => (i >= 0 && i < c.rows && j >= 0 && j < c.cols ? c.v[i + j * c.rows]! : 0);
  for (let j = 0; j < c.cols; j++) {
    for (let i = 0; i < c.rows; i++) {
      const [di, dj] = [i - ci, j - cj];
      const si = ci + cos * di + sin * dj;
      const sj = cj - sin * di + cos * dj;
      // Within a whisker of the edge counts as on it, so a quarter turn loses no row to rounding.
      const [fi, fj] = [Math.abs(si - Math.round(si)) < 1e-9 ? Math.round(si) : si, Math.abs(sj - Math.round(sj)) < 1e-9 ? Math.round(sj) : sj];
      if (fi < 0 || fi > c.rows - 1 || fj < 0 || fj > c.cols - 1) continue;
      const [i0, j0] = [Math.floor(fi), Math.floor(fj)];
      const [ti, tj] = [fi - i0, fj - j0];
      out.v[i + j * c.rows] = (1 - ti) * (1 - tj) * get(i0, j0) + ti * (1 - tj) * get(i0 + 1, j0) + (1 - ti) * tj * get(i0, j0 + 1) + ti * tj * get(i0 + 1, j0 + 1);
    }
  }
  return out;
}

/** k quarter turns counterclockwise, as NumPy's `rot90`. */
function quarterTurns(c: Channel, k: number): Channel {
  let cur = c;
  for (let t = 0; t < ((k % 4) + 4) % 4; t++) {
    const next = blank(cur.cols, cur.rows);
    // rot90: out[i][j] = in[j][cols − 1 − i].
    for (let j = 0; j < next.cols; j++) for (let i = 0; i < next.rows; i++) next.v[i + j * next.rows] = cur.v[j + (cur.cols - 1 - i) * cur.rows]!;
    cur = next;
  }
  return cur;
}

// ── Color ───────────────────────────────────────────────────────────────────────────────────────────

/** Rec. 601 luma, the weights JPEG and most image tools use for gray. */
const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** Hue, saturation and value, each 0 to 255 like the color channels (hue 255 is a full turn). */
function hsvOf(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h * 255, max === 0 ? 0 : (d / max) * 255, max];
}

function rgbOf(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h / 255) % 1) + 1) % 1 * 6;
  const ss = s / 255;
  const i = Math.floor(hh);
  const f = hh - i;
  const [p, q, t] = [v * (1 - ss), v * (1 - ss * f), v * (1 - ss * (1 - f))];
  return ([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]] as const)[i % 6]!.slice() as [number, number, number];
}

function mapColor(v: Value, fn: string, f: (r: number, g: number, b: number) => [number, number, number]): Mat {
  const img = imageOf(v, fn, true);
  if (img.ch.length !== 3) throw new EvalError('runtime', `${fn} needs a color image`);
  const [R, G, B] = img.ch as [Channel, Channel, Channel];
  const out = [blank(R.rows, R.cols), blank(R.rows, R.cols), blank(R.rows, R.cols)];
  for (let k = 0; k < R.v.length; k++) {
    const c = f(R.v[k]!, G.v[k]!, B.v[k]!);
    out.forEach((o, n) => (o.v[k] = c[n]!));
  }
  return valueOf({ ch: out, form: img.form });
}

// ── Tone ────────────────────────────────────────────────────────────────────────────────────────────

/** Histogram equalization over 256 levels: each level maps to its share of the pixels at or below it. */
function equalize(c: Channel): Channel {
  const levels = Float64Array.from(c.v, (x) => Math.round(clamp255(x)));
  const hist = new Float64Array(256);
  for (const x of levels) hist[x]!++;
  const cdf = new Float64Array(256);
  let run = 0;
  for (let k = 0; k < 256; k++) cdf[k] = run += hist[k]!;
  const first = cdf.find((x) => x > 0) ?? 0;
  const n = levels.length;
  const out = blank(c.rows, c.cols);
  for (let k = 0; k < n; k++) out.v[k] = n === first ? levels[k]! : Math.round(((cdf[levels[k]!]! - first) / (n - first)) * 255);
  return out;
}

// ── Dithering ───────────────────────────────────────────────────────────────────────────────────────

/** The nearest of `levels` evenly spaced values from 0 to 255. */
const quantize = (x: number, levels: number): number => (Math.round((clamp255(x) / 255) * (levels - 1)) * 255) / (levels - 1);

/** Where each method sends a pixel's error: [down, across, share], the shares out of the divisor. */
const DIFFUSION: Record<string, { taps: [number, number, number][]; divisor: number }> = {
  ditherFloydSteinberg: { taps: [[0, 1, 7], [1, -1, 3], [1, 0, 5], [1, 1, 1]], divisor: 16 },
  // Atkinson passes on only 6/8 of the error, which keeps highlights and shadows clean.
  ditherAtkinson: { taps: [[0, 1, 1], [0, 2, 1], [1, -1, 1], [1, 0, 1], [1, 1, 1], [2, 0, 1]], divisor: 8 },
  ditherJarvis: {
    taps: [[0, 1, 7], [0, 2, 5], [1, -2, 3], [1, -1, 5], [1, 0, 7], [1, 1, 5], [1, 2, 3], [2, -2, 1], [2, -1, 3], [2, 0, 5], [2, 1, 3], [2, 2, 1]],
    divisor: 48,
  },
};

/** Error diffusion in plain raster order, left to right along each row, top to bottom. */
function diffuse(c: Channel, levels: number, method: string): Channel {
  const { taps, divisor } = DIFFUSION[method]!;
  const work = Float64Array.from(c.v);
  const out = blank(c.rows, c.cols);
  for (let i = 0; i < c.rows; i++) {
    for (let j = 0; j < c.cols; j++) {
      const k = i + j * c.rows;
      const q = quantize(work[k]!, levels);
      out.v[k] = q;
      const err = work[k]! - q;
      for (const [di, dj, share] of taps) {
        const [ni, nj] = [i + di, j + dj];
        if (ni < c.rows && nj >= 0 && nj < c.cols) work[ni + nj * c.rows]! += (err * share) / divisor;
      }
    }
  }
  return out;
}

/** The n×n Bayer matrix, 0 to n² − 1, for n a power of two. */
export function bayer(n: number): number[][] {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length;
    const next = Array.from({ length: 2 * s }, () => new Array<number>(2 * s).fill(0));
    for (let i = 0; i < s; i++) {
      for (let j = 0; j < s; j++) {
        const v = 4 * m[i]![j]!;
        next[i]![j] = v;
        next[i]![j + s] = v + 2;
        next[i + s]![j] = v + 3;
        next[i + s]![j + s] = v + 1;
      }
    }
    m = next;
  }
  return m;
}

function ordered(c: Channel, levels: number, n: number): Channel {
  const b = bayer(n);
  const out = blank(c.rows, c.cols);
  for (let j = 0; j < c.cols; j++) {
    for (let i = 0; i < c.rows; i++) {
      const x = (clamp255(c.v[i + j * c.rows]!) / 255) * (levels - 1);
      const base = Math.floor(x);
      const up = x - base > (b[i % n]![j % n]! + 0.5) / (n * n) ? 1 : 0;
      out.v[i + j * c.rows] = (Math.min(levels - 1, base + up) * 255) / (levels - 1);
    }
  }
  return out;
}

function levelCount(v: Value, fn: string): number {
  const n = requireReal(v, `${fn}'s number of levels`);
  if (!Number.isInteger(n) || n < 2 || n > 256) throw new EvalError('runtime', `${fn}'s number of levels must be a whole number from 2 (black and white) to 256`);
  return n;
}

// ── The functions ───────────────────────────────────────────────────────────────────────────────────

const real = (v: Value | undefined, what: string): number => {
  if (v === undefined) throw new EvalError('runtime', `${what} is missing`);
  return requireReal(v, what);
};

export const imageFns: Record<string, (...a: Value[]) => Value> = {
  imageChannels: (m) => {
    const img = imageOf(m!, 'imageChannels', true);
    return valueOf({ ...img, form: 'nested' });
  },
  joinChannels: (...a) => {
    const parts = a.length === 1 ? imageOf(a[0]!, 'joinChannels').ch : a.map((x) => channelOf(x, 'joinChannels'));
    if (parts.length !== 3) throw new EvalError('runtime', 'joinChannels needs red, green and blue: three matrices, or a vector of three');
    if (parts.some((c) => c.rows !== parts[0]!.rows || c.cols !== parts[0]!.cols)) throw new EvalError('runtime', 'joinChannels: the red, green and blue matrices differ in size');
    return valueOf({ ch: parts, form: 'side' });
  },
  toGray: (m) => {
    const img = imageOf(m!, 'toGray', true);
    if (img.ch.length === 1) return valueOf(img);
    const [R, G, B] = img.ch as [Channel, Channel, Channel];
    return matOf({ rows: R.rows, cols: R.cols, v: R.v.map((r, k) => luma(r, G.v[k]!, B.v[k]!)) });
  },
  rgbToHsv: (m) => mapColor(m!, 'rgbToHsv', hsvOf),
  hsvToRgb: (m) => mapColor(m!, 'hsvToRgb', rgbOf),

  resizeImage: (m, r, c) => {
    const [rows, cols] = [real(r, "resizeImage's rows"), real(c, "resizeImage's columns")];
    if (![rows, cols].every((n) => Number.isInteger(n) && n >= 1)) throw new EvalError('runtime', "resizeImage's rows and columns must be whole numbers, 1 or more");
    return perChannel(m!, 'resizeImage', (ch) => resample(resample(ch, rows, 0), cols, 1));
  },
  rotateImage: (m, a) => perChannel(m!, 'rotateImage', (ch) => rotate(ch, real(a, "rotateImage's angle"))),
  rotate90: (m, k) => {
    const turns = k === undefined ? 1 : real(k, "rotate90's number of turns");
    if (!Number.isInteger(turns)) throw new EvalError('runtime', "rotate90's number of turns must be a whole number");
    return perChannel(m!, 'rotate90', (ch) => quarterTurns(ch, turns));
  },
  flipRows: (m) => perChannel(m!, 'flipRows', (ch) => {
    const out = blank(ch.rows, ch.cols);
    for (let j = 0; j < ch.cols; j++) for (let i = 0; i < ch.rows; i++) out.v[i + j * ch.rows] = ch.v[ch.rows - 1 - i + j * ch.rows]!;
    return out;
  }),
  flipCols: (m) => perChannel(m!, 'flipCols', (ch) => {
    const out = blank(ch.rows, ch.cols);
    for (let j = 0; j < ch.cols; j++) out.v.set(ch.v.subarray((ch.cols - 1 - j) * ch.rows, (ch.cols - j) * ch.rows), j * ch.rows);
    return out;
  }),

  convolve2d: (m, k) => {
    const kernel = channelOf(k!, 'convolve2d');
    if (kernel.rows % 2 === 0 || kernel.cols % 2 === 0) throw new EvalError('runtime', "convolve2d's kernel needs an odd number of rows and columns, such as 3×3, so it has a center");
    return perChannel(m!, 'convolve2d', (ch) => convolve2d(ch, kernel));
  },
  gaussianBlur: (m, s) => {
    const sigma = real(s, "gaussianBlur's σ");
    if (sigma < 0) throw new EvalError('runtime', "gaussianBlur's σ can't be negative");
    return perChannel(m!, 'gaussianBlur', (ch) => gaussian(ch, sigma));
  },
  boxBlur: (m, n) => {
    const size = oddSize(n!, 'boxBlur');
    const w = new Float64Array(size).fill(1 / size);
    return perChannel(m!, 'boxBlur', (ch) => correlate1d(correlate1d(ch, w, 0), w, 1));
  },
  medianFilter: (m, n) => {
    const size = oddSize(n!, 'medianFilter');
    return perChannel(m!, 'medianFilter', (ch) => rank(ch, size, median));
  },
  sharpen: (m, a, s) => {
    const amount = real(a, "sharpen's amount");
    const sigma = s === undefined ? 1 : real(s, "sharpen's σ");
    return perChannel(m!, 'sharpen', (ch) => {
      const blurred = gaussian(ch, sigma);
      return { ...ch, v: ch.v.map((x, k) => x + amount * (x - blurred.v[k]!)) };
    });
  },
  sobelEdges: (m) => perChannel(m!, 'sobelEdges', (ch) => {
    // As SciPy's sobel along each axis with mode='nearest': a central difference, smoothed by 1 2 1 across.
    const gx = correlate1d(correlate1d(ch, [-1, 0, 1], 0), [1, 2, 1], 1);
    const gy = correlate1d(correlate1d(ch, [-1, 0, 1], 1), [1, 2, 1], 0);
    return { ...ch, v: gx.v.map((x, k) => Math.hypot(x, gy.v[k]!)) };
  }),

  threshold: (m, t) => {
    const at = real(t, "threshold's level");
    return perChannel(m!, 'threshold', (ch) => ({ ...ch, v: ch.v.map((x) => (x >= at ? 255 : 0)) }));
  },
  levels: (m, lo, hi) => {
    const [a, b] = [real(lo, "levels' low point"), real(hi, "levels' high point")];
    if (!(b > a)) throw new EvalError('runtime', "levels' high point must be above its low point");
    return perChannel(m!, 'levels', (ch) => ({ ...ch, v: ch.v.map((x) => clamp255(((x - a) / (b - a)) * 255)) }));
  },
  gammaAdjust: (m, g) => {
    const gamma = real(g, "gammaAdjust's γ");
    if (!(gamma > 0)) throw new EvalError('runtime', "gammaAdjust's γ must be more than 0: below 1 brightens, above 1 darkens");
    return perChannel(m!, 'gammaAdjust', (ch) => ({ ...ch, v: ch.v.map((x) => 255 * (clamp255(x) / 255) ** gamma) }));
  },
  equalize: (m) => perChannel(m!, 'equalize', equalize),
  erode: (m, n) => {
    const size = oddSize(n!, 'erode');
    return perChannel(m!, 'erode', (ch) => rank(ch, size, minOf));
  },
  dilate: (m, n) => {
    const size = oddSize(n!, 'dilate');
    return perChannel(m!, 'dilate', (ch) => rank(ch, size, maxOf));
  },

  ...Object.fromEntries(Object.keys(DIFFUSION).map((fn) => [fn, (m: Value, l: Value) => {
    const levels = levelCount(l, fn);
    return perChannel(m, fn, (ch) => diffuse(ch, levels, fn));
  }])),
  ditherOrdered: (m, l, s) => {
    const levels = levelCount(l!, 'ditherOrdered');
    const n = s === undefined ? 4 : real(s, "ditherOrdered's matrix size");
    if (![2, 4, 8, 16].includes(n)) throw new EvalError('runtime', "ditherOrdered's matrix size must be 2, 4, 8 or 16");
    return perChannel(m!, 'ditherOrdered', (ch) => ordered(ch, levels, n));
  },
};

/** How many arguments each takes, at least and at most. */
export const IMAGE_ARITY: Record<string, [number, number]> = {
  imageChannels: [1, 1], joinChannels: [1, 3], toGray: [1, 1], rgbToHsv: [1, 1], hsvToRgb: [1, 1],
  resizeImage: [3, 3], rotateImage: [2, 2], rotate90: [1, 2], flipRows: [1, 1], flipCols: [1, 1],
  convolve2d: [2, 2], gaussianBlur: [2, 2], boxBlur: [2, 2], medianFilter: [2, 2], sharpen: [2, 3], sobelEdges: [1, 1],
  threshold: [2, 2], levels: [3, 3], gammaAdjust: [2, 2], equalize: [1, 1], erode: [2, 2], dilate: [2, 2],
  ditherFloydSteinberg: [2, 2], ditherAtkinson: [2, 2], ditherJarvis: [2, 2], ditherOrdered: [2, 3], writeImage: [2, 2],
};

// ── Showing and writing ─────────────────────────────────────────────────────────────────────────────

/** An image region's pixels, row by row, four bytes a pixel. */
export interface Pixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/** An image file a region wrote with `writeImage`, kept with its outcome so the page can offer to save it. */
export interface Written { name: string; image: Pixels }

/** The sequential blue ramp the surface plots use, light to dark, for false color. */
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
  .map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)) as [number, number, number]);

function rampAt(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const k = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - k;
  return [0, 1, 2].map((n) => RAMP[k]![n]! + (RAMP[k + 1]![n]! - RAMP[k]![n]!) * f) as [number, number, number];
}

/** How an image region shows its matrix: scaled from its own lowest to highest value, or in false color. */
export interface Look { fit?: boolean; falseColor?: boolean }

/**
 * A matrix as pixels: gray levels, or color from three equal blocks of columns side by side. Three
 * matrices in a vector are color too, red then green then blue. Values are 0 to 255 unless `fit` stretches
 * the matrix's own range over them; `falseColor` shows a gray image on the blue ramp, light to dark.
 */
export function pixels(v: Value, mode: 'gray' | 'rgb', look: Look = {}): Pixels {
  if (v.t === 'mat' && v.cells && v.rows * v.cols === 3) {
    const [r, g, b] = v.cells;
    if (r?.t !== 'mat' || g?.t !== 'mat' || b?.t !== 'mat' || r.cells || g.cells || b.cells) throw new EvalError('runtime', 'A color image needs three matrices of numbers');
    if (g.rows !== r.rows || b.rows !== r.rows || g.cols !== r.cols || b.cols !== r.cols) throw new EvalError('runtime', 'The red, green and blue matrices differ in size');
    const joined = newMat(r.rows, r.cols * 3);
    joined.re.set(r.re, 0);
    joined.re.set(g.re, r.re.length);
    joined.re.set(b.re, 2 * r.re.length);
    return pixels(joined, 'rgb', look.fit ? { fit: true } : {});
  }
  if (v.t !== 'mat' || v.cells) throw new EvalError('runtime', 'An image needs a matrix of numbers');
  const { rows: h, cols } = v;
  if (mode === 'rgb' && cols % 3 !== 0) throw new EvalError('runtime', `A color image needs three equal blocks of columns, and this has ${cols}`);
  const w = mode === 'rgb' ? cols / 3 : cols;
  let [lo, span] = [0, 255];
  if (look.fit) {
    let [min, max] = [Infinity, -Infinity];
    for (const x of v.re) {
      if (x < min) min = x;
      if (x > max) max = x;
    }
    [lo, span] = max > min ? [min, max - min] : [min - 1, 2];
  }
  const level = (x: number): number => ((x - lo) / span) * 255;
  const colored = look.falseColor === true && mode === 'gray';
  const rgba = new Uint8ClampedArray(w * h * 4);
  const at = (i: number, j: number): number => v.re[i + j * h]!;
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const p = (i * w + j) * 4;
      if (mode === 'rgb') {
        rgba[p] = level(at(i, j));
        rgba[p + 1] = level(at(i, j + w));
        rgba[p + 2] = level(at(i, j + 2 * w));
      } else if (colored) {
        // Light is low and dark is high, as on the surface plots' scale.
        [rgba[p], rgba[p + 1], rgba[p + 2]] = rampAt(level(at(i, j)) / 255);
      } else rgba[p] = rgba[p + 1] = rgba[p + 2] = level(at(i, j));
      rgba[p + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}

/** `writeImage("name.png", M)`: M as an image file to save, gray from a plain matrix, color from (R; G; B). */
export function writeImage(name: Value, m: Value, wrote: ((name: string, image: Pixels) => void) | undefined): Value {
  if (name.t !== 'str') throw new EvalError('runtime', 'writeImage needs a file name in quotes, such as "result.png"');
  if (/[\\/]/.test(name.v)) throw new EvalError('runtime', 'writeImage takes a file name, not a folder path: the browser asks where to save it');
  if (!/\.(png|jpe?g|webp)$/i.test(name.v)) throw new EvalError('runtime', 'writeImage writes .png, .jpg or .webp files');
  const img = imageOf(m, 'writeImage');
  wrote?.(name.v, pixels(valueOf(img), 'gray'));
  return m;
}
