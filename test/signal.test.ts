import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { type Mat, type Value, fromValues, newMat, num } from '../src/engine/values.js';
import ref from './signal-reference.json' with { type: 'json' };

// The expected values are SciPy's answers on invented inputs, from test/signal-reference.py.
const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Value => B.get(fn)!.call(args);
const col = (xs: number[], im?: number[]): Mat => {
  const m = newMat(xs.length, 1);
  m.re.set(xs);
  if (im) m.im = Float64Array.from(im);
  return m;
};
const re = (v: Value): number[] => [...(v as Mat).re];
const close = (got: number[], want: number[], tol = 1e-12) => {
  expect(got.length).toBe(want.length);
  const scale = Math.max(1, ...want.map(Math.abs));
  got.forEach((g, k) => expect(Math.abs(g - want[k]!) / scale).toBeLessThan(tol));
};
const parts = (v: Value): { b: number[]; a: number[] } => {
  const m = v as Mat;
  return { b: re(m.cells![0]!), a: re(m.cells![1]!) };
};
const x = col(ref.x);

describe('windows, symmetric as SciPy makes them for filter design', () => {
  test.each([1, 2, 7, 8])('of %i points', (n) => {
    const w = ref.windows as Record<string, number[]>;
    close(re(call('hannWindow', num(n))), w[`hann${n}`]!);
    close(re(call('hammingWindow', num(n))), w[`hamming${n}`]!);
    close(re(call('blackmanWindow', num(n))), w[`blackman${n}`]!);
    close(re(call('kaiserWindow', num(n), num(4.5))), w[`kaiser${n}`]!);
  });
  test('need a whole number of points', () => {
    expect(() => call('hannWindow', num(2.5))).toThrow(/whole number/);
  });
});

describe('FIR filters by the window method', () => {
  test('low, high, band and stop, as SciPy firwin', () => {
    close(re(call('firLowpass', num(31), num(0.1))), ref.fir['low31_0.1']);
    close(re(call('firLowpass', num(30), num(0.2))), ref.fir['low30_0.2']);
    close(re(call('firHighpass', num(31), num(0.2))), ref.fir['high31_0.2']);
    close(re(call('firBandpass', num(41), num(0.1), num(0.25))), ref.fir['band41_0.1_0.25']);
    close(re(call('firBandstop', num(41), num(0.1), num(0.25))), ref.fir['stop41_0.1_0.25']);
  });
  test('with another window', () => {
    close(re(call('firLowpass', num(31), num(0.1), call('blackmanWindow', num(31)))), ref.fir['low31_0.1_blackman']);
  });
  test('say what is wrong with a cutoff or a tap count', () => {
    expect(() => call('firLowpass', num(31), num(0.7))).toThrow(/between 0 and 0.5/);
    expect(() => call('firLowpass', num(31), num(100, [0, 0, -1, 0, 0, 0, 0]))).toThrow(/fc\/fs/);
    expect(() => call('firHighpass', num(30), num(0.2))).toThrow(/odd number of taps/);
    expect(() => call('firBandpass', num(31), num(0.3), num(0.1))).toThrow(/above its lower/);
    expect(() => call('firLowpass', num(31))).toThrow(/takes 2 or 3 arguments, not 1/);
    expect(() => call('firLowpass', num(31), num(0.1), call('hannWindow', num(5)))).toThrow(/5 points/);
  });
});

describe('Butterworth filters', () => {
  const cases = Object.entries(ref.butter as Record<string, { b: number[]; a: number[] }>);
  test.each(cases)('%s, as SciPy butter', (name, want) => {
    const n = Number(name.replace(/\D/g, ''));
    const kind = name.replace(/\d/g, '');
    const got = parts(
      kind === 'low' ? call('butterLowpass', num(n), num(0.1))
        : kind === 'high' ? call('butterHighpass', num(n), num(0.2))
          : kind === 'band' ? call('butterBandpass', num(n), num(0.05), num(0.2))
            : call('butterBandstop', num(n), num(0.1), num(0.3)),
    );
    close(got.b, want.b, 1e-9);
    close(got.a, want.a, 1e-9);
  });
});

describe('filtering', () => {
  const iir = call('butterLowpass', num(4), num(0.1));
  const fir = call('firLowpass', num(15), num(0.15));
  test('applyFilter runs the filter forward from rest, as SciPy lfilter', () => {
    close(re(call('applyFilter', iir, x)), ref.lfilter_iir, 1e-10);
    close(re(call('applyFilter', fir, x)), ref.lfilter_fir, 1e-12);
  });
  test('zeroPhaseFilter runs it forward and back, as SciPy filtfilt', () => {
    close(re(call('zeroPhaseFilter', iir, x)), ref.filtfilt_iir, 1e-9);
    close(re(call('zeroPhaseFilter', fir, x)), ref.filtfilt_fir, 1e-12);
  });
  test('a filter given as its own (b; a) works the same', () => {
    const { b, a } = parts(iir);
    const handmade = fromValues(2, 1, [col(b), col(a)]);
    close(re(call('applyFilter', handmade, x)), ref.lfilter_iir, 1e-10);
  });
  test('each column of a matrix is a channel, filtered separately, and units stay', () => {
    const two = newMat(ref.x.length, 2, [2, 1, -3, -1, 0, 0, 0]);
    two.re.set(ref.x, 0);
    two.re.set(ref.x.map((v) => -v), ref.x.length);
    const y = call('applyFilter', fir, two) as Mat;
    expect([y.rows, y.cols]).toEqual([ref.x.length, 2]);
    expect(y.dim).toEqual(two.dim);
    close([...y.re.subarray(0, ref.x.length)], ref.lfilter_fir);
    close([...y.re.subarray(ref.x.length)], ref.lfilter_fir.map((v) => -v));
  });
  test('zeroPhaseFilter needs a signal longer than its padding', () => {
    expect(() => call('zeroPhaseFilter', iir, col([1, 2, 3]))).toThrow(/more than 15 values/);
  });
  test('freqResponse is the complex gain at each frequency, as SciPy freqz', () => {
    const f = col([0, 0.05, 0.1, 0.2, 0.33, 0.5]);
    const h = call('freqResponse', iir, f) as Mat;
    close([...h.re], ref.freqz_iir.re, 1e-10);
    close([...h.im!], ref.freqz_iir.im, 1e-10);
    const g = call('freqResponse', fir, f) as Mat;
    close([...g.re], ref.freqz_fir.re);
    close([...g.im!], ref.freqz_fir.im);
    const one = call('freqResponse', iir, num(0.1)) as { re: number; im: number };
    expect(Math.hypot(one.re, one.im)).toBeCloseTo(Math.SQRT1_2, 9);
  });
});

describe('convolution and correlation', () => {
  const p = col([1, 2, 3, -1]);
  const q = col([0.5, -1, 2]);
  test('of real vectors, as NumPy', () => {
    close(re(call('convolve', p, q)), ref.convolve);
    close(re(call('correlate', p, q)), ref.correlate);
  });
  test('of complex vectors', () => {
    const pc = col([1, 2, 3, -1], [0, 1, -1, 0.5]);
    const qc = col([0.5, -1, 2], [1, 0, -2]);
    const v = call('convolve', pc, qc) as Mat;
    close([...v.re], ref.convolve_c.re);
    close([...v.im!], ref.convolve_c.im);
    const r = call('correlate', pc, qc) as Mat;
    close([...r.re], ref.correlate_c.re);
    close([...r.im!], ref.correlate_c.im);
  });
  test('long ones go through the FFT and agree', () => {
    const a = col(Array.from({ length: 400 }, (_, i) => Math.cos(i * 0.1)));
    const b = col(Array.from({ length: 300 }, (_, i) => Math.sin(i * 0.05)));
    const y = re(call('convolve', a, b));
    expect(y.length).toBe(699);
    expect(y.reduce((s, v) => s + v, 0)).toBeCloseTo(ref.convolve_big_sum, 8);
    expect(y[200]).toBeCloseTo(ref.convolve_big_200, 9);
  });
  test('units multiply', () => {
    const volts = { ...p, dim: [2, 1, -3, -1, 0, 0, 0] };
    expect((call('convolve', volts, q) as Mat).dim).toEqual(volts.dim);
  });
});
