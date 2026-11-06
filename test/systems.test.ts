import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { byRealThenImaginary } from '../src/engine/systems.js';
import { type Mat, type Num, type Value, fromValues, newMat, num } from '../src/engine/values.js';
import ref from './systems-reference.json' with { type: 'json' };

// The expected values are SciPy's and NumPy's, from test/systems-reference.py. SciPy lists coefficients
// highest power first; MathMath lists them constant term first, with a₀ = 1 for analog filters.
const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Value => B.get(fn)!.call(args);
const HZ = [0, 0, -1, 0, 0, 0, 0];
const SEC = [0, 0, 1, 0, 0, 0, 0];
const hz = (f: number): Num => num(f, HZ);
const col = (xs: number[], dim = [0, 0, 0, 0, 0, 0, 0]): Mat => {
  const m = newMat(xs.length, 1, dim);
  m.re.set(xs);
  return m;
};
const tf = (b: number[], a: number[]): Mat => fromValues(2, 1, [col(b), col(a)]);
const parts = (v: Value): { b: number[]; a: number[] } => {
  const m = v as Mat;
  return { b: [...(m.cells![0] as Mat).re], a: [...(m.cells![1] as Mat).re] };
};
const re = (v: Value): number[] => [...(v as Mat).re];
const im = (v: Value): number[] => ((v as Mat).im ? [...(v as Mat).im!] : (v as Mat).re.map(() => 0) as unknown as number[]);
const near = (got: number[], want: number[], tol: number) => {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => expect(Math.abs(g - want[i]!)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(want[i]!))));
};

type Design = { b: number[]; a: number[] };
const ARGS: Record<string, number[]> = { butter: [], cheby1: [1], cheby2: [40], ellip: [1, 40], bessel: [] };
const DIGITAL: Record<string, number[]> = { low: [0.1], high: [0.2], band: [0.05, 0.2], stop: [0.1, 0.3] };
const ANALOG: Record<string, number[]> = { low: [1000], high: [2000], band: [500, 2000], stop: [800, 1500] };
const SUFFIX: Record<string, string> = { low: 'Lowpass', high: 'Highpass', band: 'Bandpass', stop: 'Bandstop' };

describe('IIR design, digital and analog, as SciPy', () => {
  for (const family of Object.keys(ARGS)) {
    const cases = Object.entries((ref as unknown as Record<string, Record<string, Design>>)[family]!);
    test.each(cases)(`${family} %s`, (name, want) => {
      const [, domain, kind, n] = /^(digital|analog)_(low|high|band|stop)(\d+)$/.exec(name)!;
      const extras = ARGS[family]!.map((x) => num(x));
      const edges = domain === 'digital' ? DIGITAL[kind!]!.map((f) => num(f)) : ANALOG[kind!]!.map(hz);
      const got = parts(call(`${family}${SUFFIX[kind!]}`, num(Number(n)), ...extras, ...edges));
      if (domain === 'digital') {
        near(got.b, want.b, 1e-9);
        near(got.a, want.a, 1e-9);
      } else {
        // Constant term first, a₀ = 1; scaled by a reference ω^k so every power compares at the same size.
        const w = 2 * Math.PI * 1000;
        const a0 = want.a.at(-1)!;
        const scaled = (xs: number[]) => xs.map((x, k) => x * w ** k);
        const pad = (xs: number[], n: number) => [...xs, ...new Array(Math.max(0, n - xs.length)).fill(0)];
        const wantB = [...want.b].reverse().map((x) => x / a0);
        const wantA = [...want.a].reverse().map((x) => x / a0);
        const len = Math.max(got.b.length, wantB.length);
        near(scaled(pad(got.b, len)), scaled(pad(wantB, len)), 1e-8);
        near(scaled(got.a), scaled(wantA), 1e-8);
      }
    });
  }

  test('a cutoff with frequency units designs an analog filter; a plain one, digital', () => {
    const analog = parts(call('butterLowpass', num(1), hz(1000)));
    expect(analog.a[0]).toBe(1);
    expect(analog.a[1]).toBeCloseTo(1 / (2 * Math.PI * 1000), 15);
    expect(parts(call('butterLowpass', num(1), num(0.1))).a[0]).toBe(1);
  });
  test('the edges must agree, and other units are refused', () => {
    expect(() => call('butterBandpass', num(2), num(0.1), hz(2000))).toThrow(/both/);
    expect(() => call('butterLowpass', num(2), num(1, SEC))).toThrow(/frequency \(Hz\)/);
    expect(() => call('butterLowpass', num(2), num(0.7))).toThrow(/between 0 and 0.5/);
    expect(() => call('ellipLowpass', num(4), num(40), num(1), num(0.1))).toThrow(/more than its passband ripple/);
    expect(() => call('cheby1Lowpass', num(4), num(0.1))).toThrow(/takes 3/);
    expect(() => call('besselLowpass', num(16), num(0.1))).toThrow(/1 to 15/);
    expect(() => call('butterLowpass', num(21), num(0.1))).toThrow(/1 to 20/);
  });
});

describe('polyroots, constant term first', () => {
  const cases = Object.entries(ref.roots as Record<string, { c: number[]; re: number[]; im: number[] }>);
  test.each(cases)('%s, as NumPy roots', (_, want) => {
    const got = call('polyroots', col(want.c));
    const pairs = want.re.map((r, i) => [r, want.im[i]!] as [number, number]).sort(byRealThenImaginary);
    const g = re(got).map((r, i) => [r, im(got)[i]!]);
    expect(g.length).toBe(pairs.length);
    g.forEach(([r, i], k) => {
      const scale = Math.max(1, Math.hypot(...pairs[k]!));
      expect(Math.abs(r! - pairs[k]![0])).toBeLessThan(1e-9 * scale);
      expect(Math.abs(i! - pairs[k]![1])).toBeLessThan(1e-9 * scale);
    });
  });
  test('real roots come out real, sorted', () => {
    const got = call('polyroots', col([-6, 11, -6, 1])) as Mat;
    expect(got.im).toBeNull();
    near(re(got), [1, 2, 3], 1e-12);
  });
  test('a triple root, to the accuracy a triple root allows', () => {
    const got = call('polyroots', col([-8, 12, -6, 1]));
    re(got).forEach((r) => expect(Math.abs(r - 2)).toBeLessThan(1e-4));
  });
  test('complex coefficients', () => {
    // (x − i)(x + 2) = x² + (2 − i)x − 2i
    const c = col([0, 2, 1]);
    c.im = Float64Array.of(-2, -1, 0);
    const got = call('polyroots', c);
    near(re(got), [-2, 0], 1e-12);
    near(im(got), [0, 1], 1e-12);
  });
  test('needs a degree of at least 1', () => expect(() => call('polyroots', col([3, 0]))).toThrow(/degree 1 or more/));
});

describe('analog systems, as SciPy freqs, step and impulse', () => {
  const cases = Object.entries(ref.systems as Record<string, { b: number[]; a: number[]; t: number[]; step: number[]; impulse: number[]; f: number[]; freqs: { re: number[]; im: number[] } }>);
  test.each(cases)('%s', (_, s) => {
    const H = tf([...s.b].reverse(), [...s.a].reverse());
    near(re(call('stepResponse', H, col(s.t, SEC))), s.step, 1e-9);
    near(re(call('impulseResponse', H, col(s.t, SEC))), s.impulse, 1e-9);
    const h = call('freqResponse', H, col(s.f, HZ));
    near(re(h), s.freqs.re, 1e-10);
    near(im(h), s.freqs.im, 1e-10);
  });
  test('poles and zeros in 1/s', () => {
    // H = (s + 2)/(s² + 3s + 2): zero at −2, poles at −2 and −1.
    const H = tf([2, 1], [2, 3, 1]);
    const p = call('analogPoles', H) as Mat;
    near([...p.re], [-2, -1], 1e-12);
    expect([...p.dim]).toEqual(HZ);
    near(re(call('analogZeros', H)), [-2], 1e-12);
    expect(() => call('analogZeros', tf([1], [1, 1]))).toThrow(/no zeros/);
  });
  test('an improper system has no step response', () => {
    expect(() => call('stepResponse', tf([0, 0, 1], [1, 1]), num(1, SEC))).toThrow(/degree/);
  });
  test('a single time gives a single value', () => {
    expect((call('stepResponse', tf([1], [1, 1]), num(1, SEC)) as Num).re).toBeCloseTo(1 - Math.exp(-1), 14);
  });
});

describe('digital systems at sample numbers', () => {
  const d = ref.digital;
  const H = tf(d.b, d.a);
  const n = col(Array.from({ length: 20 }, (_, k) => k));
  test('step and impulse, as lfilter', () => {
    near(re(call('stepResponse', H, n)), d.step, 1e-12);
    near(re(call('impulseResponse', H, n)), d.impulse, 1e-12);
  });
  test('poles and zeros in z', () => {
    // H = 1/(1 − 0.5z⁻¹) = z/(z − 0.5): pole 0.5, zero 0.
    near(re(call('digitalPoles', tf([1], [1, -0.5]))), [0.5], 1e-14);
    near(re(call('digitalZeros', tf([1], [1, -0.5]))), [0], 1e-14);
    // Butterworth lowpass zeros all sit at z = −1.
    re(call('digitalZeros', call('butterLowpass', num(3), num(0.1)))).forEach((z) => expect(Math.abs(z + 1)).toBeLessThan(1e-4));
  });
  test('plain times must be sample numbers', () => {
    expect(() => call('stepResponse', H, num(0.5))).toThrow(/sample numbers/);
  });
});

describe('unwrapPhase', () => {
  test('as NumPy unwrap', () => near(re(call('unwrapPhase', col(ref.unwrap.in))), ref.unwrap.out, 1e-14));
});

describe("Mathcad's Φ and δ", () => {
  test('Φ is the step, 1 from 0 on', () => {
    expect([-1, 0, 2].map((x) => (call('Φ', num(x)) as Num).re)).toEqual([0, 1, 1]);
  });
  test('δ(m, n) is Kronecker’s; δ(x) alone is Dirac’s impulse', () => {
    expect((call('δ', num(2), num(2)) as Num).re).toBe(1);
    expect((call('δ', num(2), num(3)) as Num).re).toBe(0);
    expect((call('δ', num(0.5)) as Num).re).toBe(0);
    expect((call('δ', num(0)) as Num).re).toBe(Infinity);
  });
});

describe('coefficients written from parts, with units', () => {
  const S1 = [0, 0, 1, 0, 0, 0, 0];
  const S2 = [0, 0, 2, 0, 0, 0, 0];
  // An RLC lowpass: 1/(1 + RC·s + LC·s²), R = 100 Ω, L = 10 mH, C = 1 μF.
  const a = fromValues(3, 1, [num(1), num(1e-4, S1), num(1e-8, S2)]);
  const H = fromValues(2, 1, [num(1), a]);
  test('the k-th coefficient in s^k, and b a single number', () => {
    const p = call('analogPoles', H) as Mat;
    // s² + 10⁴ s + 10⁸ = 0: −5000 ± 8660i.
    near([...p.re], [-5000, -5000], 1e-9);
    near([...p.im!].map(Math.abs), [8660.254037844386, 8660.254037844386], 1e-9);
    expect((call('stepResponse', H, num(1, S1)) as Num).re).toBeCloseTo(1, 10);
  });
  test('wrong powers are refused, and a digital filter has no units', () => {
    expect(() => call('analogPoles', fromValues(2, 1, [num(1), fromValues(2, 1, [num(1), num(1, S2)])]))).toThrow(/s\^k/);
    expect(() => call('stepResponse', H, col([0, 1, 2]))).toThrow(/plain numbers/);
  });
});
