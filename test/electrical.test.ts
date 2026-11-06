import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { E_SERIES, nearestStandard } from '../src/engine/electrical.js';
import { runWorksheet } from '../src/engine/evaluate.js';
import { UNITS } from '../src/engine/units.js';
import { type Mat, type Num, type Value, fromValues, num } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';
import { formatValue } from '../src/ui/format.js';

const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Value => B.get(fn)!.call(args);
const d = (L: number, M: number, T: number, I = 0) => [L, M, T, I, 0, 0, 0];
const OHM = d(2, 1, -3, -2);
const FARAD = d(-2, -1, 4, 2);
const f = { precision: 3, exponent: 3, trailingZeros: false };

/** Runs typed regions top to bottom and gives each one's value. */
function sheet(...lines: string[]): (Value | undefined)[] {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  return runWorksheet(ws).map((o) => {
    if (o.error) throw new Error(o.error.reason);
    return o.value;
  });
}

describe('electrical units, as Mathcad 14 defines them', () => {
  // Each value is Mathcad 14's, read from a probe sheet, in base SI units.
  test.each<[string, number, number[]]>([
    ['Ω', 1, OHM], ['kΩ', 1e3, OHM], ['MΩ', 1e6, OHM], ['ohm', 1, OHM],
    ['S', 1, d(-2, -1, 3, 2)], ['mho', 1, d(-2, -1, 3, 2)],
    ['F', 1, FARAD], ['μF', 1e-6, FARAD], ['nF', 1e-9, FARAD], ['pF', 1e-12, FARAD],
    ['H', 1, d(2, 1, -2, -2)], ['mH', 1e-3, d(2, 1, -2, -2)], ['μH', 1e-6, d(2, 1, -2, -2)],
    ['C', 1, d(0, 0, 1, 1)], ['mC', 1e-3, d(0, 0, 1, 1)], ['μC', 1e-6, d(0, 0, 1, 1)], ['nC', 1e-9, d(0, 0, 1, 1)], ['pC', 1e-12, d(0, 0, 1, 1)],
    ['Wb', 1, d(2, 1, -2, -1)], ['T', 1, d(0, 1, -2, -1)], ['gauss', 1e-4, d(0, 1, -2, -1)], ['G', 1e-4, d(0, 1, -2, -1)],
    ['Oe', 79.577471545947674, d(-1, 0, 0, 1)],
    ['kA', 1e3, d(0, 0, 0, 1)], ['μA', 1e-6, d(0, 0, 0, 1)], ['nA', 1e-9, d(0, 0, 0, 1)], ['pA', 1e-12, d(0, 0, 0, 1)],
    ['μV', 1e-6, d(2, 1, -3, -1)], ['nV', 1e-9, d(2, 1, -3, -1)],
    ['μs', 1e-6, d(0, 0, 1)], ['ps', 1e-12, d(0, 0, 1)], ['mW', 1e-3, d(2, 1, -3)], ['μW', 1e-6, d(2, 1, -3)], ['nW', 1e-9, d(2, 1, -3)],
  ])('%s', (name, factor, dim) => {
    const u = UNITS[name]!;
    expect(u.factor).toBeCloseTo(factor, 12);
    expect([...u.dim]).toEqual(dim);
  });

  test('typed units calculate, and results show in ohms, farads and henries', () => {
    const [, , i, c, l] = sheet('V\\coloneq 12\\cdot \\mathrm{V}', 'R\\coloneq 4.7\\cdot k\\Omega', '\\frac{V}{R}=', '\\frac{1}{2\\cdot \\pi \\cdot 1\\cdot \\mathrm{kHz}\\cdot 1\\cdot k\\Omega}=', '5\\cdot \\mathrm{mH}=');
    expect(formatValue(i!, f)).toBe('2.553\\times10^{-3}\\ \\mathrm{A}');
    expect(formatValue(c!, f)).toBe('1.592\\times10^{-7}\\ \\mathrm{F}');
    expect(formatValue(l!, f)).toBe('5\\times10^{-3}\\ \\mathrm{H}');
  });

  test('names to type without Greek letters', () => {
    expect([UNITS.kohm!.factor, UNITS.Mohm!.factor, UNITS.mohm!.factor, UNITS.uF!.factor]).toEqual([1e3, 1e6, 1e-3, 1e-6]);
    expect([...UNITS.kohm!.dim]).toEqual(OHM);
  });

  test('the micro sign many keyboards type is read as μ', () => {
    expect((sheet('3\\cdot \\mathrm{µF}=')[0] as Num).re).toBeCloseTo(3e-6, 18);
  });

  test("a sheet's own C, F, S or T is used in place of the unit", () => {
    expect((sheet('T\\coloneq 300', 'T+1=')[1] as Num).re).toBe(301);
  });
});

describe('parallel', () => {
  const kohm = (x: number) => num(x * 1e3, OHM);
  test('resistors', () => {
    const r = call('parallel', kohm(1), kohm(1)) as Num;
    expect(r.re).toBeCloseTo(500, 9);
    expect([...r.dim]).toEqual(OHM);
    expect((call('parallel', kohm(1), kohm(2), kohm(3)) as Num).re).toBeCloseTo(6000 / 11, 9);
  });
  test('a vector of values, and one value alone', () => {
    expect((call('parallel', fromValues(3, 1, [kohm(1), kohm(2), kohm(3)])) as Num).re).toBeCloseTo(6000 / 11, 9);
    expect((call('parallel', kohm(4)) as Num).re).toBeCloseTo(4000, 9);
  });
  test('complex impedances: an inductor and a capacitor near resonance', () => {
    const z = call('parallel', num(0, OHM, 100), num(0, OHM, -200)) as Num;
    expect(z.re).toBeCloseTo(0, 9);
    expect(z.im).toBeCloseTo(200, 9);
  });
  test('a short across any branch is a short', () => expect((call('parallel', kohm(1), num(0, OHM)) as Num).re).toBe(0));
  test('mixed units are refused', () => expect(() => call('parallel', kohm(1), num(1e-6, FARAD))).toThrow(/same units/));
  test('no arguments are refused by count', () => expect(() => call('parallel')).toThrow(/at least 1/));
});

describe('phasor', () => {
  test('magnitude and angle in radians, so deg works', () => {
    const p = sheet('\\mathrm{phasor}\\left(10\\cdot \\mathrm{V},30\\cdot \\mathrm{deg}\\right)=')[0] as Num;
    expect(p.re).toBeCloseTo(10 * Math.cos(Math.PI / 6), 12);
    expect(p.im).toBeCloseTo(5, 12);
    expect([...p.dim]).toEqual(d(2, 1, -3, -1));
  });
  test('element by element', () => {
    const m = call('phasor', fromValues(2, 1, [num(1), num(2)]), num(Math.PI / 2)) as Mat;
    expect(m.im![1]).toBeCloseTo(2, 12);
  });
  test('an angle with units is refused', () => expect(() => call('phasor', num(1), num(1, d(0, 0, 1)))).toThrow(/angle/));
});

describe('decibels', () => {
  test('power and amplitude ratios, and back', () => {
    expect((call('powerToDb', num(100)) as Num).re).toBeCloseTo(20, 12);
    expect((call('ampToDb', num(100)) as Num).re).toBeCloseTo(40, 12);
    expect((call('ampToDb', num(0, undefined, -0.5)) as Num).re).toBeCloseTo(20 * Math.log10(0.5), 12);
    expect((call('dbToPower', num(-3)) as Num).re).toBeCloseTo(0.501187, 6);
    expect((call('dbToAmp', num(6)) as Num).re).toBeCloseTo(1.995262, 6);
  });
  test('dBm', () => {
    expect((call('wattsToDbm', num(1, d(2, 1, -3))) as Num).re).toBeCloseTo(30, 12);
    const p = call('dbmToWatts', num(0)) as Num;
    expect(p.re).toBeCloseTo(1e-3, 15);
    expect([...p.dim]).toEqual(d(2, 1, -3));
  });
  test('a ratio must be a ratio, and zero has no level', () => {
    expect(() => call('powerToDb', num(1, d(2, 1, -3)))).toThrow(/without units/);
    expect(() => call('wattsToDbm', num(1))).toThrow(/takes a power/);
    expect(() => call('ampToDb', num(0))).toThrow(/minus infinity/);
    expect(() => call('powerToDb', num(-1))).toThrow(/never negative/);
  });
  test('over a vector, as for a frequency response', () => {
    const m = call('ampToDb', fromValues(2, 1, [num(1), num(10)])) as Mat;
    expect([...m.re]).toEqual([0, 20]);
  });
});

describe('standard part values (IEC 60063)', () => {
  test('each series has its length, in order, from 1 to under 10', () => {
    for (const [n, s] of Object.entries(E_SERIES)) {
      expect(s.length).toBe(Number(n));
      expect(s[0]).toBe(1);
      s.forEach((v, k) => k > 0 && expect(v).toBeGreaterThan(s[k - 1]!));
      expect(s.at(-1)!).toBeLessThan(10);
    }
  });
  test('E24 is the tabulated series, not rounded powers of ten', () => {
    expect(E_SERIES[24]!.slice(10, 16)).toEqual([2.7, 3, 3.3, 3.6, 3.9, 4.3]);
    expect(E_SERIES[12]).toEqual([1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]);
    expect(E_SERIES[6]).toEqual([1, 1.5, 2.2, 3.3, 4.7, 6.8]);
    expect(E_SERIES[3]).toEqual([1, 2.2, 4.7]);
  });
  test('E96 is every other E192 value, and E192 keeps the standard 9.20', () => {
    expect(E_SERIES[192]!.filter((_, k) => k % 2 === 0)).toEqual(E_SERIES[96]);
    expect(E_SERIES[192]).toContain(9.2);
    expect(E_SERIES[48]!.slice(0, 4)).toEqual([1, 1.05, 1.1, 1.15]);
  });
  test('nearest by ratio, across decades and signs', () => {
    expect(nearestStandard(4700, E_SERIES[12]!)).toBe(4700);
    expect(nearestStandard(4.8e-6, E_SERIES[12]!)).toBe(4.7e-6);
    expect(nearestStandard(9.6, E_SERIES[12]!)).toBe(10);
    expect(nearestStandard(1000, E_SERIES[24]!)).toBe(1000);
    expect(nearestStandard(-5300, E_SERIES[24]!)).toBe(-5100);
    expect(nearestStandard(0, E_SERIES[24]!)).toBe(0);
    // The boundary between 1.1 and 1.2 is their geometric mean, 1.1489: 1.149 is nearer 1.1 by difference
    // but nearer 1.2 by ratio.
    expect(nearestStandard(1.148, E_SERIES[24]!)).toBe(1.1);
    expect(nearestStandard(1.149, E_SERIES[24]!)).toBe(1.2);
  });
  test('keeps units, and refuses an unknown series', () => {
    const c = sheet('\\mathrm{standardValue}\\left(4.8\\cdot \\mu F,12\\right)=')[0] as Num;
    expect(c.re).toBeCloseTo(4.7e-6, 18);
    expect([...c.dim]).toEqual(FARAD);
    expect(() => call('standardValue', num(1), num(10))).toThrow(/3, 6, 12, 24, 48, 96 or 192/);
  });
});

describe('results as magnitude∠angle', () => {
  const polar = { ...f, polar: true };
  test('a complex number, with its unit', () => {
    expect(formatValue(num(3, OHM, 4), polar)).toBe('5\\angle {53.13}^{\\circ}\\ \\Omega');
    expect(formatValue(num(0, undefined, -2), polar)).toBe('2\\angle {-90}^{\\circ}');
  });
  test('a real number stays as it is, unless it sits among complex ones', () => {
    expect(formatValue(num(-5), polar)).toBe('-5');
    const m = fromValues(2, 1, [num(-5), num(0, undefined, 1)]);
    expect(formatValue(m, polar)).toBe('\\begin{pmatrix}5\\angle {180}^{\\circ}\\\\1\\angle {90}^{\\circ}\\end{pmatrix}');
  });
  test('off by default', () => expect(formatValue(num(3, undefined, 4), f)).toBe('3+4\\mathrm{i}'));
});
