/**
 * Fourier transforms. `transform` is the unscaled discrete Fourier transform of any length, in place:
 * radix-2 for powers of two, and Bluestein's method (a convolution done with powers of two) otherwise, so
 * a length such as 44,100 costs about as much as the next power of two up, not n².
 *
 * Mathcad's eight functions differ only in scaling, the sign of the exponent, and what they take and give:
 *
 * | function | forward sum                       | takes                    | gives                 |
 * |----------|-----------------------------------|--------------------------|-----------------------|
 * | `fft`    | (1/√n) Σ v_k e^(+2πi jk/n)        | 2^m real values, m ≥ 3   | 2^(m−1) + 1 values    |
 * | `ifft`   | (1/√n) Σ c_j e^(−2πi jk/n)        | 2^(m−1) + 1 values       | 2^m real values       |
 * | `FFT`    | (1/n) Σ v_k e^(−2πi jk/n)         | as `fft`                 | as `fft`              |
 * | `IFFT`   | Σ c_j e^(+2πi jk/n)               | as `ifft`                | as `ifft`             |
 * | `cfft`   | (1/√n) Σ e^(+2πi …), 2-D on a matrix | any size, complex     | the same size         |
 * | `icfft`  | (1/√n) Σ e^(−2πi …)               |                          |                       |
 * | `CFFT`   | (1/n) Σ e^(−2πi …)                |                          |                       |
 * | `ICFFT`  | Σ e^(+2πi …)                      |                          |                       |
 *
 * Measured in Mathcad 14 on invented data; `ifft` and `IFFT` fill in the second half of the spectrum as the
 * complex conjugate of the first, so the result is real. Values keep their units: the scale is a pure number.
 */
import { EvalError, type Mat, type Value, newMat, requireMat } from './values.js';

/** In-place unscaled DFT of a complex sequence; `sign` is the exponent's sign, +1 or −1. */
export function transform(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) === 0) radix2(re, im, sign);
  else bluestein(re, im, sign);
}

function radix2(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = (sign * 2 * Math.PI) / len;
    // Twiddles worked out directly each time, rather than by repeated multiplication, which drifts.
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(step * k);
      const wi = Math.sin(step * k);
      for (let s = k; s < n; s += len) {
        const t = s + half;
        const xr = re[t]! * wr - im[t]! * wi;
        const xi = re[t]! * wi + im[t]! * wr;
        re[t] = re[s]! - xr;
        im[t] = im[s]! - xi;
        re[s] = re[s]! + xr;
        im[s] = im[s]! + xi;
      }
    }
  }
}

/** Any length, as a convolution: X_j = conj(w_j) Σ (x_k conj(w_k)) w_(j−k), with w_k = e^(−sign·πi k²/n). */
function bluestein(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
  const n = re.length;
  let m = 1;
  while (m < 2 * n - 1) m <<= 1;
  const [wr, wi] = [new Float64Array(n), new Float64Array(n)];
  for (let k = 0; k < n; k++) {
    // k² mod 2n keeps the angle small, so large k doesn't lose precision.
    const a = (-sign * Math.PI * ((k * k) % (2 * n))) / n;
    wr[k] = Math.cos(a);
    wi[k] = Math.sin(a);
  }
  const [ar, ai] = [new Float64Array(m), new Float64Array(m)];
  for (let k = 0; k < n; k++) {
    ar[k] = re[k]! * wr[k]! + im[k]! * wi[k]!;
    ai[k] = im[k]! * wr[k]! - re[k]! * wi[k]!;
  }
  const [br, bi] = [new Float64Array(m), new Float64Array(m)];
  br[0] = wr[0]!;
  bi[0] = wi[0]!;
  for (let k = 1; k < n; k++) {
    br[k] = br[m - k] = wr[k]!;
    bi[k] = bi[m - k] = wi[k]!;
  }
  radix2(ar, ai, -1);
  radix2(br, bi, -1);
  for (let k = 0; k < m; k++) {
    const r = ar[k]! * br[k]! - ai[k]! * bi[k]!;
    ai[k] = ar[k]! * bi[k]! + ai[k]! * br[k]!;
    ar[k] = r;
  }
  radix2(ar, ai, 1);
  for (let k = 0; k < n; k++) {
    const [cr, ci] = [ar[k]! / m, ai[k]! / m];
    re[k] = cr * wr[k]! + ci * wi[k]!;
    im[k] = ci * wr[k]! - cr * wi[k]!;
  }
}

/** The DFT of a matrix: down each column, then along each row. A vector is the one-column case. */
function transform2(m: Mat, sign: 1 | -1, scale: number): Mat {
  const { rows, cols } = m;
  const out = newMat(rows, cols, m.dim);
  out.re.set(m.re);
  out.im = m.im ? Float64Array.from(m.im) : new Float64Array(rows * cols);
  for (let j = 0; j < cols; j++) {
    const [r, i] = [out.re.subarray(j * rows, (j + 1) * rows), out.im.subarray(j * rows, (j + 1) * rows)];
    transform(r, i, sign);
  }
  if (cols > 1 && rows > 0) {
    const [r, i] = [new Float64Array(cols), new Float64Array(cols)];
    for (let k = 0; k < rows; k++) {
      for (let j = 0; j < cols; j++) {
        r[j] = out.re[k + j * rows]!;
        i[j] = out.im[k + j * rows]!;
      }
      transform(r, i, sign);
      for (let j = 0; j < cols; j++) {
        out.re[k + j * rows] = r[j]!;
        out.im[k + j * rows] = i[j]!;
      }
    }
  }
  for (let k = 0; k < rows * cols; k++) {
    out.re[k]! *= scale;
    out.im[k]! *= scale;
  }
  return out;
}

const numeric = (v: Value, fn: string): Mat => {
  const m = requireMat(v, `${fn}'s argument`);
  if (m.cells) throw new EvalError('runtime', `${fn} needs numbers, not nested arrays or text`);
  if (m.rows * m.cols === 0) throw new EvalError('runtime', `${fn} needs at least one value`);
  return m;
};

/** Mathcad's error wording, measured: too few values, and a length that isn't a power of two. */
function realSignal(v: Value, fn: string): Mat {
  const m = numeric(v, fn);
  if (m.cols !== 1) throw new EvalError('runtime', `${fn} needs a column vector`);
  if (m.im && m.im.some((x) => x !== 0)) throw new EvalError('runtime', `${fn} needs real values: use cfft or CFFT for complex ones`);
  const n = m.rows;
  if (n < 8) throw new EvalError('runtime', `${fn} needs at least 8 values (a power of two: 8, 16, 32…). cfft takes any number`);
  if ((n & (n - 1)) !== 0) throw new EvalError('runtime', `${fn} needs a power of two values (8, 16, 32…), not ${n}. cfft takes any number`);
  return m;
}

/** `fft` and `FFT`: the first half of the spectrum of 2^m real values, 2^(m−1) + 1 of them. */
export function realForward(v: Value, fn: 'fft' | 'FFT'): Mat {
  const m = realSignal(v, fn);
  const n = m.rows;
  const full = transform2({ ...m, im: null }, fn === 'fft' ? 1 : -1, fn === 'fft' ? 1 / Math.sqrt(n) : 1 / n);
  const out = newMat(n / 2 + 1, 1, m.dim);
  out.re.set(full.re.subarray(0, n / 2 + 1));
  out.im = Float64Array.from(full.im!.subarray(0, n / 2 + 1));
  return out;
}

/** `ifft` and `IFFT`: 2^m real values from the first half of a spectrum, 2^(m−1) + 1 values. */
export function realInverse(v: Value, fn: 'ifft' | 'IFFT'): Mat {
  const h = numeric(v, fn);
  if (h.cols !== 1) throw new EvalError('runtime', `${fn} needs a column vector`);
  const half = h.rows - 1;
  if (half < 4 || (half & (half - 1)) !== 0) {
    throw new EvalError('runtime', `${fn} needs 2^m + 1 values (5, 9, 17, 33…), the first half of a spectrum, not ${h.rows}`);
  }
  const n = 2 * half;
  const full = newMat(n, 1, h.dim);
  full.im = new Float64Array(n);
  for (let k = 0; k <= half; k++) {
    full.re[k] = h.re[k]!;
    full.im[k] = h.im?.[k] ?? 0;
  }
  for (let k = 1; k < half; k++) {
    full.re[n - k] = full.re[k]!;
    full.im[n - k] = -full.im[k]!;
  }
  const t = transform2(full, fn === 'ifft' ? -1 : 1, fn === 'ifft' ? 1 / Math.sqrt(n) : 1);
  t.im = null;
  return t;
}

/** `cfft`, `icfft`, `CFFT` and `ICFFT`, on a vector or matrix of any size. */
export function complexTransform(v: Value, fn: 'cfft' | 'icfft' | 'CFFT' | 'ICFFT'): Mat {
  const m = numeric(v, fn);
  const n = m.rows * m.cols;
  const [sign, scale]: [1 | -1, number] = {
    cfft: [1, 1 / Math.sqrt(n)], icfft: [-1, 1 / Math.sqrt(n)], CFFT: [-1, 1 / n], ICFFT: [1, 1],
  }[fn] as [1 | -1, number];
  return transform2(m, sign, scale);
}
