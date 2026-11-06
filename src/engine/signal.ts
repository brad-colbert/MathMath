/**
 * Signal processing: convolution and correlation, windows, FIR filter design, filtering, and frequency
 * response. IIR design (Butterworth, Chebyshev, elliptic, Bessel) is in iir.ts. These are MathMath's own functions, not Mathcad's (its Signal Processing pack isn't
 * measured), so they follow SciPy's definitions, and the tests check them against SciPy's numbers.
 *
 * Frequencies are fractions of the sample rate, 0 to ½ (½ is the Nyquist frequency), so a cutoff typed as
 * `fc/fs` with both in Hz cancels to a plain number. A filter is a vector of FIR coefficients b, or a vector
 * of two vectors (b; a) for an IIR filter, as the design functions in iir.ts return. freqResponse also takes
 * frequencies with units, for an analog H(s).
 */
import { type C, cdiv } from './complex.js';
import { transform } from './fourier.js';
import { analogAt, systemOf } from './systems.js';
import {
  type Dim, EvalError, type Mat, NODIM, type Value, dimEq, dimMul, fromValues, isNoDim, newMat, requireMat, requireReal,
} from './values.js';

const PER_SECOND: Dim = [0, 0, -1, 0, 0, 0, 0];

// ── Vectors in and out ──────────────────────────────────────────────────────────────────────────────

interface Seq { re: Float64Array; im: Float64Array | null; dim: Dim }

function sequence(v: Value, what: string): Seq {
  const m = requireMat(v, what);
  if (m.cells) throw new EvalError('runtime', `${what} must hold numbers`);
  if (m.cols !== 1 && m.rows !== 1) throw new EvalError('runtime', `${what} must be a vector`);
  if (m.rows * m.cols === 0) throw new EvalError('runtime', `${what} is empty`);
  return { re: m.re, im: m.im && m.im.some((x) => x !== 0) ? m.im : null, dim: m.dim };
}

function realSequence(v: Value, what: string): Float64Array {
  const s = sequence(v, what);
  if (s.im) throw new EvalError('runtime', `${what} must be real`);
  return s.re;
}

const columnOf = (re: ArrayLike<number>, dim: Dim = NODIM, im: Float64Array | null = null): Mat => {
  const m = newMat(re.length, 1, dim);
  m.re.set(re);
  if (im) m.im = im;
  return m;
};

// ── Convolution and correlation ─────────────────────────────────────────────────────────────────────

/** Direct below this many multiplications, through the FFT above it. */
const DIRECT_LIMIT = 1 << 16;

function convolveSeq(a: Seq, b: Seq): { re: Float64Array; im: Float64Array | null } {
  const [na, nb] = [a.re.length, b.re.length];
  const n = na + nb - 1;
  const complex = a.im !== null || b.im !== null;
  if (na * nb <= DIRECT_LIMIT) {
    const re = new Float64Array(n);
    const im = complex ? new Float64Array(n) : null;
    for (let i = 0; i < na; i++) {
      const [ar, ai] = [a.re[i]!, a.im?.[i] ?? 0];
      for (let j = 0; j < nb; j++) {
        const [br, bi] = [b.re[j]!, b.im?.[j] ?? 0];
        re[i + j] += ar * br - ai * bi;
        if (im) im[i + j] += ar * bi + ai * br;
      }
    }
    return { re, im };
  }
  let m = 1;
  while (m < n) m <<= 1;
  const [xr, xi, yr, yi] = [new Float64Array(m), new Float64Array(m), new Float64Array(m), new Float64Array(m)];
  xr.set(a.re);
  if (a.im) xi.set(a.im);
  yr.set(b.re);
  if (b.im) yi.set(b.im);
  transform(xr, xi, -1);
  transform(yr, yi, -1);
  for (let k = 0; k < m; k++) {
    const r = xr[k]! * yr[k]! - xi[k]! * yi[k]!;
    xi[k] = xr[k]! * yi[k]! + xi[k]! * yr[k]!;
    xr[k] = r;
  }
  transform(xr, xi, 1);
  const re = Float64Array.from(xr.subarray(0, n), (x) => x / m);
  return { re, im: complex ? Float64Array.from(xi.subarray(0, n), (x) => x / m) : null };
}

/** The full linear convolution, na + nb − 1 values. Units multiply. */
export function convolve(va: Value, vb: Value): Mat {
  const [a, b] = [sequence(va, "convolve's first vector"), sequence(vb, "convolve's second vector")];
  const { re, im } = convolveSeq(a, b);
  return columnOf(re, dimMul(a.dim, b.dim), im);
}

/**
 * Cross-correlation at every lag, as NumPy's `correlate(a, b, 'full')`: element k is Σ a_(n+k) · conj(b_n),
 * for lags −(nb − 1) to na − 1. Correlating a vector with itself puts lag 0 in the middle.
 */
export function correlate(va: Value, vb: Value): Mat {
  const [a, b] = [sequence(va, "correlate's first vector"), sequence(vb, "correlate's second vector")];
  const nb = b.re.length;
  const rev: Seq = {
    re: Float64Array.from({ length: nb }, (_, k) => b.re[nb - 1 - k]!),
    im: b.im ? Float64Array.from({ length: nb }, (_, k) => -b.im![nb - 1 - k]!) : null,
    dim: b.dim,
  };
  const { re, im } = convolveSeq(a, rev);
  return columnOf(re, dimMul(a.dim, b.dim), im);
}

// ── Windows ─────────────────────────────────────────────────────────────────────────────────────────

function windowLength(v: Value, fn: string): number {
  const n = requireReal(v, `${fn}'s length`);
  if (!Number.isInteger(n) || n < 1) throw new EvalError('runtime', `${fn} needs a whole number of points, 1 or more`);
  return n;
}

/** A symmetric cosine-sum window, as SciPy's `get_window(…, fftbins=False)`: the first and last points match. */
function cosineWindow(n: number, coefs: number[]): Float64Array {
  if (n === 1) return Float64Array.of(1);
  return Float64Array.from({ length: n }, (_, k) => coefs.reduce((s, c, j) => s + (j % 2 ? -c : c) * Math.cos((2 * Math.PI * j * k) / (n - 1)), 0));
}

export const hann = (n: number): Float64Array => cosineWindow(n, [0.5, 0.5]);
export const hamming = (n: number): Float64Array => cosineWindow(n, [0.54, 0.46]);
export const blackman = (n: number): Float64Array => cosineWindow(n, [0.42, 0.5, 0.08]);

/** The modified Bessel function I₀, by its power series, which converges for every x. */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 500; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

export function kaiser(n: number, beta: number): Float64Array {
  if (n === 1) return Float64Array.of(1);
  const d = besselI0(beta);
  return Float64Array.from({ length: n }, (_, k) => {
    const r = (2 * k) / (n - 1) - 1;
    return besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / d;
  });
}

export const windowFns = {
  hannWindow: (v: Value) => columnOf(hann(windowLength(v, 'hannWindow'))),
  hammingWindow: (v: Value) => columnOf(hamming(windowLength(v, 'hammingWindow'))),
  blackmanWindow: (v: Value) => columnOf(blackman(windowLength(v, 'blackmanWindow'))),
  kaiserWindow: (v: Value, b: Value) => {
    const beta = requireReal(b, "kaiserWindow's β");
    if (beta < 0) throw new EvalError('runtime', "kaiserWindow's β must be 0 or more");
    return columnOf(kaiser(windowLength(v, 'kaiserWindow'), beta));
  },
};

// ── Frequencies ─────────────────────────────────────────────────────────────────────────────────────

/** A frequency as a fraction of the sample rate, strictly between 0 and ½. */
function fraction(v: Value, fn: string, what = 'cutoff'): number {
  const x = requireReal(v, `${fn}'s ${what}`);
  if (!isNoDim((v as { dim?: Dim }).dim ?? NODIM)) {
    throw new EvalError('runtime', `${fn}'s ${what} is a fraction of the sample rate: divide it by the sample rate, as fc/fs`);
  }
  if (!(x > 0 && x < 0.5)) throw new EvalError('runtime', `${fn}'s ${what} must be between 0 and 0.5 (a fraction of the sample rate; 0.5 is the Nyquist frequency)`);
  return x;
}

function band(v1: Value, v2: Value, fn: string): [number, number] {
  const [lo, hi] = [fraction(v1, fn, 'lower edge'), fraction(v2, fn, 'upper edge')];
  if (!(hi > lo)) throw new EvalError('runtime', `${fn}'s upper edge must be above its lower edge`);
  return [lo, hi];
}

// ── FIR design ──────────────────────────────────────────────────────────────────────────────────────

const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

/**
 * A windowed-sinc FIR filter, as SciPy's `firwin(n, edges, window, pass_zero, scale=True, fs=1)`. `edges`
 * are the band edges in order, and `passZero` says whether the band starting at 0 passes. Scaled so the
 * middle of the first pass band has a gain of exactly 1.
 */
export function firwin(n: number, edges: number[], passZero: boolean, window: Float64Array): Float64Array {
  // Pass bands as pairs of edges, as fractions of the Nyquist frequency.
  const e = [...(passZero ? [0] : []), ...edges.map((f) => f * 2)];
  if (e.length % 2 === 1) e.push(1);
  const alpha = 0.5 * (n - 1);
  const h = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const m = k - alpha;
    let s = 0;
    for (let p = 0; p < e.length; p += 2) s += e[p + 1]! * sinc(e[p + 1]! * m) - e[p]! * sinc(e[p]! * m);
    h[k] = s * window[k]!;
  }
  const [l, r] = [e[0]!, e[1]!];
  const center = l === 0 ? 0 : r === 1 ? 1 : (l + r) / 2;
  let gain = 0;
  for (let k = 0; k < n; k++) gain += h[k]! * Math.cos(Math.PI * (k - alpha) * center);
  return h.map((x) => x / gain);
}

function firArgs(fn: string, vn: Value, vw: Value | undefined, odd: boolean): { n: number; window: Float64Array } {
  const n = requireReal(vn, `${fn}'s number of taps`);
  if (!Number.isInteger(n) || n < 1) throw new EvalError('runtime', `${fn} needs a whole number of taps, 1 or more`);
  if (odd && n % 2 === 0) throw new EvalError('runtime', `${fn} needs an odd number of taps, such as ${n + 1}: an even number can't pass the Nyquist frequency`);
  let window = hamming(n);
  if (vw !== undefined) {
    window = realSequence(vw, `${fn}'s window`);
    if (window.length !== n) throw new EvalError('runtime', `${fn}'s window has ${window.length} points; it needs one for each of the ${n} taps`);
  }
  return { n, window };
}

export const firFns = {
  firLowpass: (vn: Value, fc: Value, vw?: Value) => {
    const { n, window } = firArgs('firLowpass', vn, vw, false);
    return columnOf(firwin(n, [fraction(fc, 'firLowpass')], true, window));
  },
  firHighpass: (vn: Value, fc: Value, vw?: Value) => {
    const { n, window } = firArgs('firHighpass', vn, vw, true);
    return columnOf(firwin(n, [fraction(fc, 'firHighpass')], false, window));
  },
  firBandpass: (vn: Value, f1: Value, f2: Value, vw?: Value) => {
    const { n, window } = firArgs('firBandpass', vn, vw, false);
    return columnOf(firwin(n, band(f1, f2, 'firBandpass'), false, window));
  },
  firBandstop: (vn: Value, f1: Value, f2: Value, vw?: Value) => {
    const { n, window } = firArgs('firBandstop', vn, vw, true);
    return columnOf(firwin(n, band(f1, f2, 'firBandstop'), true, window));
  },
};

// ── Filtering ───────────────────────────────────────────────────────────────────────────────────────

/** A filter's coefficients, with a normalized so a₀ = 1: a vector b, or a vector of two vectors (b; a). */
function coefficients(v: Value, fn: string): { b: Float64Array; a: Float64Array } {
  const m = requireMat(v, `${fn}'s filter`);
  const bad = (): never => {
    throw new EvalError('runtime', `${fn}'s filter must be a vector of coefficients, or a vector holding two of them (b and a)`);
  };
  let b: Float64Array;
  let a: Float64Array = Float64Array.of(1);
  if (m.cells) {
    if (m.rows * m.cols !== 2) bad();
    b = realSequence(m.cells[0]!, `${fn}'s b coefficients`);
    a = realSequence(m.cells[1]!, `${fn}'s a coefficients`);
    for (const c of m.cells) if (c.t === 'mat' && !isNoDim(c.dim)) bad();
  } else {
    if (!isNoDim(m.dim)) throw new EvalError('runtime', `${fn}'s filter coefficients must be plain numbers`);
    b = realSequence(m, `${fn}'s filter`);
  }
  if (a[0] === 0) throw new EvalError('runtime', `${fn}'s first a coefficient can't be 0`);
  const a0 = a[0]!;
  return { b: b.map((x) => x / a0), a: a.map((x) => x / a0) };
}

/**
 * Direct form II transposed, as SciPy's `lfilter(b, a, x, zi)`. `zi` is the starting state, length
 * max(len a, len b) − 1, and is left holding the final state. b and a are normalized and padded alike.
 */
function lfilter(b: Float64Array, a: Float64Array, x: ArrayLike<number>, zi?: Float64Array): Float64Array {
  const n = Math.max(a.length, b.length);
  const [bb, aa] = [new Float64Array(n), new Float64Array(n)];
  bb.set(b);
  aa.set(a);
  const z = zi ?? new Float64Array(n - 1);
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = n > 1 ? bb[0]! * xi + z[0]! : bb[0]! * xi;
    for (let k = 0; k < n - 2; k++) z[k] = bb[k + 1]! * xi + z[k + 1]! - aa[k + 1]! * yi;
    if (n > 1) z[n - 2] = bb[n - 1]! * xi - aa[n - 1]! * yi;
    y[i] = yi;
  }
  return y;
}

/** The state that makes a step input give a steady output from the start, as SciPy's `lfilter_zi`. */
function lfilterZi(b: Float64Array, a: Float64Array): Float64Array {
  const n = Math.max(a.length, b.length);
  const [bb, aa] = [new Float64Array(n), new Float64Array(n)];
  bb.set(b);
  aa.set(a);
  const m = n - 1;
  if (m === 0) return new Float64Array(0);
  // (I − Aᵀ) zi = b[1:] − a[1:]·b[0], with A the companion matrix of a.
  const M = Array.from({ length: m }, (_, i) => Float64Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
  for (let j = 0; j < m; j++) M[j]![0]! += aa[j + 1]!;
  for (let i = 0; i + 1 < m; i++) M[i]![i + 1]! -= 1;
  const rhs = Float64Array.from({ length: m }, (_, i) => bb[i + 1]! - aa[i + 1]! * bb[0]!);
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    [rhs[c], rhs[p]] = [rhs[p]!, rhs[c]!];
    for (let r = c + 1; r < m; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k < m; k++) M[r]![k]! -= f * M[c]![k]!;
      rhs[r]! -= f * rhs[c]!;
    }
  }
  const out = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = rhs[r]!;
    for (let k = r + 1; k < m; k++) s -= M[r]![k]! * out[k]!;
    out[r] = s / M[r]![r]!;
  }
  return out;
}

/** Forward and back, as SciPy's `filtfilt(b, a, x)` with its defaults: odd padding of 3·max(len a, len b). */
function filtfilt(b: Float64Array, a: Float64Array, x: Float64Array, fn: string): Float64Array {
  const pad = 3 * Math.max(a.length, b.length);
  if (x.length <= pad) throw new EvalError('runtime', `${fn} needs more than ${pad} values for this filter (3 times its length)`);
  const n = x.length;
  const ext = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) ext[i] = 2 * x[0]! - x[pad - i]!;
  ext.set(x, pad);
  for (let i = 0; i < pad; i++) ext[pad + n + i] = 2 * x[n - 1]! - x[n - 2 - i]!;
  const zi = lfilterZi(b, a);
  const fwd = lfilter(b, a, ext, zi.map((z) => z * ext[0]!));
  fwd.reverse();
  const back = lfilter(b, a, fwd, zi.map((z) => z * fwd[0]!));
  back.reverse();
  return back.slice(pad, pad + n);
}

/** Filters each column of x: a vector, or a matrix with a column per channel. Units stay those of x. */
function eachColumn(vx: Value, fn: string, f: (col: Float64Array) => Float64Array): Mat {
  const x = requireMat(vx, `${fn}'s signal`);
  if (x.cells) throw new EvalError('runtime', `${fn}'s signal must hold numbers`);
  if (x.im && x.im.some((v) => v !== 0)) throw new EvalError('runtime', `${fn}'s signal must be real`);
  const rows = x.rows === 1 ? x.cols : x.rows;
  const cols = x.rows === 1 ? 1 : x.cols;
  const out = newMat(rows, cols, x.dim);
  for (let j = 0; j < cols; j++) out.re.set(f(x.re.slice(j * rows, (j + 1) * rows)), j * rows);
  return out;
}

export const filterFns = {
  applyFilter: (vf: Value, vx: Value) => {
    const { b, a } = coefficients(vf, 'applyFilter');
    return eachColumn(vx, 'applyFilter', (col) => lfilter(b, a, col));
  },
  zeroPhaseFilter: (vf: Value, vx: Value) => {
    const { b, a } = coefficients(vf, 'zeroPhaseFilter');
    return eachColumn(vx, 'zeroPhaseFilter', (col) => filtfilt(b, a, col, 'zeroPhaseFilter'));
  },
  /**
   * H at each frequency f. A fraction of the sample rate: Σ b_k e^(−2πi f k) / Σ a_k e^(−2πi f k). A frequency
   * with units (Hz): H(s) of an analog system at s = i·2πf, coefficients constant term first.
   */
  freqResponse: (vf: Value, vfreq: Value) => {
    const fdim = (vfreq as { dim?: Dim }).dim ?? NODIM;
    if (dimEq(fdim, PER_SECOND)) {
      const sys = systemOf(vf, 'freqResponse');
      if (vfreq.t === 'num') {
        const [re, im] = analogAt(sys.b, sys.a, vfreq.re);
        return { t: 'num', re, im, dim: NODIM };
      }
      const hz = sequence(vfreq, "freqResponse's frequencies");
      const re = new Float64Array(hz.re.length);
      const im = new Float64Array(hz.re.length);
      hz.re.forEach((f, k) => {
        [re[k], im[k]] = analogAt(sys.b, sys.a, f);
      });
      return columnOf(re, NODIM, im);
    }
    const { b, a } = coefficients(vf, 'freqResponse');
    const at = (f: number): C => {
      const sum = (c: Float64Array): C => {
        let [re, im] = [0, 0];
        for (let k = 0; k < c.length; k++) {
          re += c[k]! * Math.cos(2 * Math.PI * f * k);
          im -= c[k]! * Math.sin(2 * Math.PI * f * k);
        }
        return [re, im];
      };
      return cdiv(sum(b), sum(a));
    };
    if (vfreq.t === 'num') {
      if (!isNoDim(vfreq.dim)) throw new EvalError('runtime', "freqResponse's frequency is a fraction of the sample rate (as f/fs) for a digital filter, or in Hz for an analog H(s)");
      const [re, im] = at(vfreq.re);
      return { t: 'num', re, im, dim: NODIM };
    }
    const fs = sequence(vfreq, "freqResponse's frequencies");
    if (!isNoDim(fs.dim)) throw new EvalError('runtime', "freqResponse's frequencies are fractions of the sample rate (as f/fs) for a digital filter, or in Hz for an analog H(s)");
    const re = new Float64Array(fs.re.length);
    const im = new Float64Array(fs.re.length);
    fs.re.forEach((f, k) => {
      [re[k], im[k]] = at(f);
    });
    return columnOf(re, NODIM, im);
  },
};
