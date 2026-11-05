import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { transform } from '../src/engine/fourier.js';
import { type Mat, type Value, newMat, num } from '../src/engine/values.js';

const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Mat => B.get(fn)!.call(args) as Mat;
type Z = [number, number];
const mat = (rows: number, cols: number, items: (number | Z)[]): Mat => {
  const m = newMat(rows, cols);
  m.im = new Float64Array(rows * cols);
  // Row by row, as written; stored column by column.
  items.forEach((v, n) => {
    const [i, j] = [Math.floor(n / cols), n % cols];
    const [re, im] = typeof v === 'number' ? [v, 0] : v;
    m.re[i + j * rows] = re;
    m.im![i + j * rows] = im;
  });
  return m;
};
const col = (...items: (number | Z)[]) => mat(items.length, 1, items);
const values = (m: Mat): Z[] => Array.from(m.re, (re, k) => [re, m.im?.[k] ?? 0]);
/** Mathcad 14 keeps about 12 digits through its transforms, so its numbers are matched to 10⁻¹⁰. */
const near = (m: Mat, want: Z[][] | Z[], tol = 1e-10) => {
  const flat = (Array.isArray(want[0]![0]) ? (want as Z[][]) : [want as Z[]]);
  const rows = flat.length === 1 && m.cols === 1 ? (want as Z[]).length : flat.length;
  const expected: Z[] = [];
  if (m.cols === 1) expected.push(...(want as Z[]));
  else for (let j = 0; j < m.cols; j++) for (let i = 0; i < rows; i++) expected.push((want as Z[][])[i]![j]!);
  expect(m.rows * m.cols).toBe(expected.length);
  values(m).forEach(([re, im], k) => {
    expect(re).toBeCloseTo(expected[k]![0], -Math.log10(tol));
    expect(im).toBeCloseTo(expected[k]![1], -Math.log10(tol));
  });
};

// Invented inputs, with the answers Mathcad 14 gave for them.
const b = col(1, 2, 3, 4, 5, 6, 7, 8);
const c = col([1, 0.5], [2, -1], [3, 2]);
const M = mat(2, 3, [1, 2, 3, 4, 5, 6]);
const C = mat(2, 3, [[1, 0], [2, 1], [3, 0], [4, 2], [5, 0], [6, -1]]);
const k = col(1, [0, 1], 2, [0, -1], 3);

describe("Mathcad's transforms, as Mathcad 14 calculates them", () => {
  test('fft: 1/√n, a positive exponent, the first n/2 + 1 values', () => {
    near(call('fft', b), [[12.727922061357855, 0], [-1.4142135623730951, -3.414213562373095], [-1.4142135623730951, -1.4142135623730951], [-1.4142135623730951, -0.585786437626905], [-1.4142135623730951, 0]]);
  });
  test('FFT: 1/n and a negative exponent', () => {
    near(call('FFT', b), [[4.5, 0], [-0.5, 1.2071067811865475], [-0.5, 0.5], [-0.5, 0.20710678118654752], [-0.5, 0]]);
  });
  test('cfft and CFFT give every value', () => {
    near(call('cfft', b), [[12.727922061357855, 0], [-1.41421356237, -3.41421356237], [-1.41421356237, -1.41421356237], [-1.41421356237, -0.585786437627], [-1.41421356237, 0], [-1.41421356237, 0.585786437627], [-1.41421356237, 1.41421356237], [-1.41421356237, 3.41421356237]]);
    near(call('CFFT', b), [[4.5, 0], [-0.5, 1.20710678119], [-0.5, 0.5], [-0.5, 0.207106781187], [-0.5, 0], [-0.5, -0.207106781187], [-0.5, -0.5], [-0.5, -1.20710678119]]);
  });
  test('of a complex vector of any length', () => {
    near(call('cfft', c), [[3.46410161514, 0.866025403784], [0.633974596216, -0.5], [-2.36602540378, 0.5]]);
    near(call('CFFT', c), [[2, 0.5], [-1.36602540378, 0.288675134595], [0.366025403784, -0.288675134595]]);
    near(call('icfft', c), [[3.46410161514, 0.866025403784], [-2.36602540378, 0.5], [0.633974596216, -0.5]]);
    near(call('ICFFT', c), [[6, 1.5], [1.09807621135, -0.866025403784], [-4.09807621135, 0.866025403784]]);
    near(call('cfft', col(1, 2, 3, 4, 5, 6)), [[8.57321409974, 0], [-1.22474487139, -2.12132034356], [-1.22474487139, -0.707106781187], [-1.22474487139, 0], [-1.22474487139, 0.707106781187], [-1.22474487139, 2.12132034356]]);
  });
  test('of a matrix: the 2-D transform', () => {
    near(call('cfft', M), [[[8.57321409974, 0], [-1.22474487139, -0.707106781187], [-1.22474487139, 0.707106781187]], [[-3.67423461417, 0], [0, 0], [0, 0]]]);
    near(call('CFFT', M), [[[3.5, 0], [-0.5, 0.288675134595], [-0.5, -0.288675134595]], [[-1.5, 0], [0, 0], [0, 0]]]);
    near(call('cfft', C), [[[8.57321409974, 0.816496580928], [-1.93185165258, 0.109389799741], [-0.517638090205, 1.52360336211]], [[-3.67423461417, 0], [0, -1.22474487139], [0, -1.22474487139]]]);
    near(call('CFFT', C), [[[3.5, 0.333333333333], [-0.211324865405, 0.622008467928], [-0.788675134595, 0.0446581987385]], [[-1.5, 0], [0, -0.5], [0, -0.5]]]);
    near(call('icfft', C), [[[8.57321409974, 0.816496580928], [-0.517638090205, 1.52360336211], [-1.93185165258, 0.109389799741]], [[-3.67423461417, 0], [0, -1.22474487139], [0, -1.22474487139]]]);
  });
  test('ifft and IFFT rebuild 2^m real values from half a spectrum', () => {
    const ifft = call('ifft', k);
    expect(ifft.im).toBeNull();
    near(ifft, [[2.82842712475, 0], [-0.707106781187, 0], [1.41421356237, 0], [-0.707106781187, 0], [2.82842712475, 0], [-0.707106781187, 0], [-1.41421356237, 0], [-0.707106781187, 0]]);
    near(call('IFFT', k), [[8, 0], [-2, 0], [-4, 0], [-2, 0], [8, 0], [-2, 0], [4, 0], [-2, 0]]);
  });
  test('each pair undoes the other', () => {
    near(call('ifft', call('fft', b)), Array.from({ length: 8 }, (_, i) => [i + 1, 0] as Z), 1e-12);
    near(call('IFFT', call('FFT', b)), Array.from({ length: 8 }, (_, i) => [i + 1, 0] as Z), 1e-12);
    near(call('icfft', call('cfft', C)), [[[1, 0], [2, 1], [3, 0]], [[4, 2], [5, 0], [6, -1]]], 1e-12);
    near(call('ICFFT', call('CFFT', C)), [[[1, 0], [2, 1], [3, 0]], [[4, 2], [5, 0], [6, -1]]], 1e-12);
  });
  test("fft refuses what Mathcad refuses", () => {
    expect(() => call('fft', col(1, 0, 0, 0))).toThrow(/at least 8/);
    expect(() => call('fft', col(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))).toThrow(/power of two/);
    expect(() => call('fft', col([1, 1], 2, 3, 4, 5, 6, 7, 8))).toThrow(/real values/);
    expect(() => call('ifft', col(1, 2, 3, 4))).toThrow(/2\^m \+ 1/);
  });
  test('values keep their units', () => {
    const v = col(1, 2, 3, 4, 5, 6, 7, 8);
    const volts = { ...v, dim: [2, 1, -3, -1, 0, 0, 0] };
    expect(call('fft', volts).dim).toEqual(volts.dim);
    expect(call('cfft', volts).dim).toEqual(volts.dim);
  });
});

describe('the transform itself', () => {
  const naive = (re: number[], im: number[], sign: number): Z[] => re.map((_, j) => {
    let [sr, si] = [0, 0];
    re.forEach((x, n) => {
      const a = (sign * 2 * Math.PI * j * n) / re.length;
      sr += x * Math.cos(a) - im[n]! * Math.sin(a);
      si += x * Math.sin(a) + im[n]! * Math.cos(a);
    });
    return [sr, si];
  });
  test.each([1, 2, 3, 7, 8, 15, 16, 64, 100, 1000])('matches the plain sum at length %i, both signs', (n) => {
    const re = Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + i / n);
    const im = Array.from({ length: n }, (_, i) => Math.cos(i * 0.7));
    for (const sign of [1, -1] as const) {
      const [r, i] = [Float64Array.from(re), Float64Array.from(im)];
      transform(r, i, sign);
      const want = naive(re, im, sign);
      const scale = Math.max(1, ...want.map(([a, b]) => Math.hypot(a, b)));
      want.forEach(([a, b], j) => {
        expect(Math.abs(r[j]! - a) / scale).toBeLessThan(1e-12);
        expect(Math.abs(i[j]! - b) / scale).toBeLessThan(1e-12);
      });
    }
  });
  test("keeps energy (Parseval's theorem) at a length that isn't a power of two", () => {
    const n = 44100;
    const x = col(...Array.from({ length: n }, (_, i) => Math.sin(i * 0.01) + Math.sin(i * 0.37)));
    const X = call('cfft', x);
    const energy = (m: Mat) => values(m).reduce((s, [a, b]) => s + a * a + b * b, 0);
    expect(energy(X) / energy(x)).toBeCloseTo(1, 10);
  });
  test('a million points take well under a second', () => {
    const n = 1 << 20;
    const x = newMat(n, 1);
    for (let i = 0; i < n; i++) x.re[i] = Math.sin(i * 0.001);
    const t = performance.now();
    call('fft', x);
    expect(performance.now() - t).toBeLessThan(1500);
  });
  test('a single number is a 1×1 input', () => {
    expect(values(call('cfft', num(3) as unknown as Mat))).toEqual([[3, 0]]);
  });
});
