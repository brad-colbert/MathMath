import { describe, expect, test } from 'vitest';
import { makeBuiltins } from '../src/engine/builtins.js';
import { type PlotData, runWorksheet } from '../src/engine/evaluate.js';
import { calcKey } from '../src/engine/incremental.js';
import { type Mat, type Num, type Value, fromValues, getEl, num } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readTex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import { type Content, autoAxis } from '../src/model/ast.js';

const B = makeBuiltins(0);
const call = (fn: string, ...args: Value[]): Value => B.get(fn)!.call(args);
const d = (L: number, M: number, T: number, I = 0) => [L, M, T, I, 0, 0, 0];
const OHM = d(2, 1, -3, -2);
const SIEMENS = d(-2, -1, 3, 2);
const NODIM = d(0, 0, 0);
const c = (re: number, im = 0): Num => num(re, NODIM, im);
const ohms = (re: number, im = 0): Num => num(re, OHM, im);

/** A matrix from rows of [re, im] pairs or plain numbers, all in one unit. */
function mat(rows: (number | [number, number])[][], dim = NODIM): Mat {
  const items: Value[] = [];
  for (let j = 0; j < rows[0]!.length; j++) {
    for (const row of rows) {
      const x = row[j]!;
      items.push(typeof x === 'number' ? num(x, dim) : num(x[0], dim, x[1]));
    }
  }
  const m = fromValues(rows.length, rows[0]!.length, items);
  if (!m.cells) m.dim = dim;
  return m;
}
const el = (m: Value, i: number, j: number): Num => getEl(m as Mat, i, j) as Num;
function closeC(got: Value, re: number, im = 0, digits = 10): void {
  expect((got as Num).re).toBeCloseTo(re, digits);
  expect((got as Num).im).toBeCloseTo(im, digits);
}
function closeM(got: Value, want: Value, digits = 10): void {
  const [g, w] = [got as Mat, want as Mat];
  expect([g.rows, g.cols]).toEqual([w.rows, w.cols]);
  for (let i = 0; i < w.rows; i++) for (let j = 0; j < w.cols; j++) closeC(el(g, i, j), el(w, i, j).re, el(w, i, j).im, digits);
}
const thrown = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
};

/** Runs typed regions top to bottom and gives the last one's value. */
function sheet(...lines: string[]): Value {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  const out = runWorksheet(ws).at(-1)!;
  if (out.error) throw new Error(out.error.reason);
  return out.value!;
}

describe('reflection', () => {
  test('zToGamma and gammaToZ, on 50 Ω unless told otherwise', () => {
    closeC(call('zToGamma', ohms(100)), 1 / 3);
    // (−25 + 25j)/(75 + 25j) = −0.2 + 0.4j.
    closeC(call('zToGamma', ohms(25, 25)), -0.2, 0.4);
    closeC(call('zToGamma', c(150), c(75)), 1 / 3);
    const z = call('gammaToZ', c(-0.2, 0.4)) as Num;
    closeC(z, 25, 25);
    expect(z.dim).toEqual(OHM);
    expect((call('gammaToZ', c(0.5), c(75)) as Num).dim).toEqual(NODIM);
    closeC(call('gammaToZ', c(0.5), c(75)), 225);
  });
  test('they go element by element', () => {
    const g = call('zToGamma', mat([[0], [50], [100]], OHM)) as Mat;
    expect([...g.re].map((x) => +x.toFixed(12))).toEqual([-1, 0, +(1 / 3).toFixed(12)]);
  });
  test('VSWR, return loss and mismatch loss', () => {
    closeC(call('vswr', c(0.5)), 3);
    closeC(call('vswr', c(0, 0.5)), 3);
    closeC(call('returnLoss', c(0.5)), 20 * Math.log10(2));
    closeC(call('mismatchLoss', c(0.5)), -10 * Math.log10(0.75));
    closeC(call('vswr', c(0)), 1);
  });
  test('errors name the trouble', () => {
    expect(thrown(() => call('vswr', c(1)))).toMatch(/infinite/);
    expect(thrown(() => call('returnLoss', c(0)))).toMatch(/perfect match/);
    expect(thrown(() => call('mismatchLoss', c(-1)))).toMatch(/no power/);
    expect(thrown(() => call('gammaToZ', c(1)))).toMatch(/open circuit/);
    expect(thrown(() => call('vswr', ohms(50)))).toMatch(/zToGamma/);
    expect(thrown(() => call('zToGamma', num(1, d(0, 0, 1))))).toMatch(/wrong units/);
    expect(thrown(() => call('zToGamma', ohms(50), ohms(50, 10)))).toMatch(/real and positive/);
  });
});

describe('lines', () => {
  test('a quarter-wave line transforms 100 Ω to Z0²/ZL', () => {
    const z = call('lineInput', ohms(100), ohms(50), c(Math.PI / 2)) as Num;
    closeC(z, 25);
    expect(z.dim).toEqual(OHM);
  });
  test('a half-wave line repeats its load, and a matched line shows Z0 at any length', () => {
    closeC(call('lineInput', ohms(30, -40), ohms(50), c(Math.PI)), 30, -40);
    closeC(call('lineInput', ohms(50), ohms(50), c(1.234)), 50);
  });
  test('a shorted stub is j·Z0·tan θ, and a lossless line follows Z0·(ZL + j·Z0·tan θ)/(Z0 + j·ZL·tan θ)', () => {
    closeC(call('lineInput', ohms(0), ohms(50), c(Math.PI / 4)), 0, 50);
    const t = Math.tan(0.7);
    // (20 + 50jt)/(50 + 20jt)·50
    const [nr, ni, dr, di] = [20, 50 * t, 50, 20 * t];
    const q = dr * dr + di * di;
    closeC(call('lineInput', c(20), c(50), c(0.7)), (50 * (nr * dr + ni * di)) / q, (50 * (ni * dr - nr * di)) / q);
  });
  test('a lossy line: θ = β·ℓ − j·α·ℓ gives Z0·(ZL + Z0·tanh γℓ)/(Z0 + ZL·tanh γℓ)', () => {
    const [al, bl] = [0.3, 1.1];
    // tanh(a + jb) = (sinh 2a + j sin 2b)/(cosh 2a + cos 2b)
    const den = Math.cosh(2 * al) + Math.cos(2 * bl);
    const [tr, ti] = [Math.sinh(2 * al) / den, Math.sin(2 * bl) / den];
    const [zl, z0] = [100, 50];
    const [nr, ni, dr, di] = [zl + z0 * tr, z0 * ti, z0 + zl * tr, zl * ti];
    const q = dr * dr + di * di;
    closeC(call('lineInput', c(zl), c(z0), c(bl, -al)), (z0 * (nr * dr + ni * di)) / q, (z0 * (ni * dr - nr * di)) / q);
  });
  test('a long lossy line looks like Z0 whatever its load', () => {
    closeC(call('lineInput', ohms(1e6), ohms(75), c(3, -20)), 75, 0, 8);
  });
  test('a sweep of lengths gives a vector', () => {
    const v = call('lineInput', ohms(100), ohms(50), mat([[0], [Math.PI / 2], [Math.PI]])) as Mat;
    expect([...v.re].map((x) => +x.toFixed(9))).toEqual([100, 25, 100]);
  });
  test('an open end (∞ as 1e307 Ω) at a quarter wave is a short; a load of −Z0 or a length with units is refused', () => {
    closeC(call('lineInput', ohms(1e307), ohms(50), c(Math.PI / 2)), 0, 0, 9);
    expect(thrown(() => call('lineInput', ohms(0), ohms(50), c(0)))).toBe('');
    expect(thrown(() => call('lineInput', ohms(-50), ohms(50), c(1)))).toMatch(/no steady state/);
    expect(thrown(() => call('lineInput', ohms(50), ohms(50), num(1, d(1, 0, 0))))).toMatch(/radians or degrees/);
  });
});

describe('network parameters', () => {
  const S3 = mat([[[0.1, 0.2], [0.5, -0.1], [0, 0.05]], [[0.5, -0.1], [-0.3, 0.1], 0.2], [[0, 0.05], 0.2, [0.4, -0.4]]]);
  test('a three-port S matrix to Z, checked against an independent calculation', () => {
    const z = call('sToZ', S3) as Mat;
    expect(z.dim).toEqual(OHM);
    // numpy: 50·(I + S)·inv(I − S)
    closeC(el(z, 0, 0), 87.21112029, 27.72277346, 6);
    closeC(el(z, 1, 0), 57.25394351, 4.7058936, 6);
    closeC(el(z, 2, 1), 26.26386878, -11.55235045, 6);
    closeC(el(z, 2, 2), 70.27300993, -82.5649241, 6);
  });
  test('every conversion round-trips', () => {
    closeM(call('zToS', call('sToZ', S3)), S3);
    closeM(call('yToS', call('sToY', S3)), S3);
    closeM(call('yToS', call('zToY', call('sToZ', S3))), S3);
    closeM(call('zToS', call('yToZ', call('sToY', S3, ohms(75))), ohms(75)), S3);
    const S2 = mat([[[0.2, 0.1], [0.6, -0.2]], [[0.6, -0.2], [-0.1, 0.3]]]);
    closeM(call('abcdToS', call('sToAbcd', S2)), S2);
    closeM(call('zToS', call('abcdToZ', call('sToAbcd', S2))), S2);
    closeM(call('yToS', call('abcdToY', call('sToAbcd', S2))), S2);
    closeM(call('abcdToS', call('zToAbcd', call('sToZ', S2))), S2);
    closeM(call('abcdToS', call('yToAbcd', call('sToY', S2))), S2);
  });
  test('a series impedance: S11 = Z/(Z + 2·Z0), S21 = 2·Z0/(Z + 2·Z0)', () => {
    const s = call('abcdToS', call('abcdSeries', ohms(30, 40))) as Mat;
    const q = 130 * 130 + 40 * 40;
    closeC(el(s, 0, 0), (30 * 130 + 40 * 40) / q, (40 * 130 - 30 * 40) / q);
    closeC(el(s, 1, 0), (100 * 130) / q, (-100 * 40) / q);
    closeC(el(s, 0, 1), (100 * 130) / q, (-100 * 40) / q);
  });
  test('a shunt impedance: S11 = −Z0/(2·Z + Z0)', () => {
    const s = call('abcdToS', call('abcdShunt', ohms(25))) as Mat;
    closeC(el(s, 0, 0), -50 / 100);
    closeC(el(s, 1, 0), 2 * 25 / 50 / 2);
  });
  test('a matched line passes the wave with a delay of θ', () => {
    const s = call('abcdToS', call('abcdLine', ohms(50), c(0.4))) as Mat;
    closeC(el(s, 0, 0), 0);
    closeC(el(s, 1, 0), Math.cos(0.4), -Math.sin(0.4));
  });
  test('ABCD keeps its units: B in ohms, C in siemens', () => {
    const a = call('abcdShunt', ohms(25)) as Mat;
    expect(el(a, 1, 0).dim).toEqual(SIEMENS);
    const b = call('abcdLine', ohms(50), c(0.4)) as Mat;
    expect(el(b, 0, 1).dim).toEqual(OHM);
    expect(el(b, 1, 0).dim).toEqual(SIEMENS);
    expect(el(b, 0, 0).dim).toEqual(NODIM);
    // A Z matrix in plain numbers stays plain.
    expect((call('zToAbcd', mat([[2, 1], [1, 3]])) as Mat).cells).toBeNull();
  });
  test('a T of three resistors, by ABCD cascade on the sheet, matches its Z matrix', () => {
    // Series 10 Ω, shunt 100 Ω, series 20 Ω: Z11 = 110, Z12 = Z21 = 100, Z22 = 120.
    const z = sheet(
      'T\\coloneq \\mathrm{abcdSeries}\\left(10\\cdot \\Omega\\right)\\cdot \\mathrm{abcdShunt}\\left(100\\cdot \\Omega\\right)\\cdot \\mathrm{abcdSeries}\\left(20\\cdot \\Omega\\right)',
      '\\mathrm{abcdToZ}\\left(T\\right)=',
    ) as Mat;
    expect(z.dim).toEqual(OHM);
    closeM(z, mat([[110, 100], [100, 120]], OHM));
    closeM(call('zToAbcd', z), sheet('T\\coloneq \\mathrm{abcdSeries}\\left(10\\cdot \\Omega\\right)\\cdot \\mathrm{abcdShunt}\\left(100\\cdot \\Omega\\right)\\cdot \\mathrm{abcdSeries}\\left(20\\cdot \\Omega\\right)', 'T='));
  });
  test('a one-port S is a reflection coefficient', () => {
    closeC(call('sToZ', c(1 / 3)), 100);
    closeC(call('zToS', ohms(100)), 1 / 3);
  });
  test('a network with no such matrix says why', () => {
    // A series part alone: S = [[s, 1−s], [1−s, s]], so I − S is singular.
    const series = call('abcdToS', call('abcdSeries', ohms(30))) as Mat;
    expect(thrown(() => call('sToZ', series))).toMatch(/no Z matrix: a part in series/);
    const shunt = call('abcdToS', call('abcdShunt', ohms(30))) as Mat;
    expect(thrown(() => call('sToY', shunt))).toMatch(/no Y matrix: a part across a port/);
    expect(thrown(() => call('zToAbcd', mat([[50, 0], [0, 50]], OHM)))).toMatch(/no ABCD matrix/);
    expect(thrown(() => call('abcdShunt', ohms(0)))).toMatch(/short/);
  });
  test('wrong shapes and units are refused', () => {
    expect(thrown(() => call('sToZ', mat([[1, 2, 3], [4, 5, 6]])))).toMatch(/square/);
    expect(thrown(() => call('sToAbcd', S3))).toMatch(/two-ports/);
    expect(thrown(() => call('sToZ', mat([[1, 0], [0, 1]], OHM)))).toMatch(/S matrix, which has no units/);
    expect(thrown(() => call('zToY', mat([[1, 0], [0, 1]], SIEMENS)))).toMatch(/Z matrix, in ohms/);
    expect(thrown(() => call('abcdToS', mat([[1, 0], [0, 1]], OHM)))).toMatch(/A has the wrong units/);
  });
});

type Plot = Extract<Content, { k: 'plot' }>;

/** A sheet of typed definitions, then a Smith chart of `ys` over `x`; returns the plot's data. */
function smithOf(lines: string[], ys: string[], x: string | null = null): PlotData {
  const ws = emptyWorksheet();
  ws.regions = lines.map((latex, n) => ({ id: `r${n}`, left: 0, top: n * 30 - 8, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(latex) }));
  const plot: Plot = { k: 'plot', x: x ? readTex(x) : null, ys: ys.map(readTex), xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 270, height: 270, view: 'smith' };
  ws.regions.push({ id: 'p', left: 0, top: 1000, alignX: 0, alignY: 1000, disabled: false, content: plot });
  return runWorksheet(ws).find((o) => o.region.id === 'p')!.plot!;
}

describe('Smith chart', () => {
  const sweep = ['k\\coloneq 0..4', '\\theta_{k}\\coloneq k\\cdot \\frac{\\pi}{8}', 'f_{k}\\coloneq k\\cdot 100\\cdot \\mathrm{MHz}'];
  test("each trace is Γ's real and imaginary parts, with the swept value kept for hover", () => {
    const data = smithOf(sweep, ['\\mathrm{zToGamma}\\left(\\mathrm{lineInput}\\left(100\\cdot \\Omega,50\\cdot \\Omega,\\theta_{k}\\right)\\right)'], 'f_{k}');
    const t = data.traces[0]!;
    expect(t.error).toBeUndefined();
    // Γ = (1/3)·e^(−2jθ): a circle round the centre.
    for (let k = 0; k < 5; k++) {
      expect(t.x[k]).toBeCloseTo(Math.cos((-2 * k * Math.PI) / 8) / 3, 12);
      expect(t.y[k]).toBeCloseTo(Math.sin((-2 * k * Math.PI) / 8) / 3, 12);
    }
    expect([...t.param!]).toEqual([0, 1e8, 2e8, 3e8, 4e8]);
    expect(data.dims!.x).toEqual(d(0, 0, -1));
    expect(data.dims!.y).toEqual(NODIM);
  });
  test('without x there is no swept value, and a single Γ is one point', () => {
    const data = smithOf([], ['0.5', '\\mathrm{zToGamma}\\left(25\\cdot \\Omega\\right)']);
    expect(data.traces.map((t) => [...t.x])).toEqual([[0.5], [-1 / 3]]);
    expect(data.traces[0]!.param).toBeUndefined();
  });
  test('a single Γ beside a sweep is a point with no swept value', () => {
    const data = smithOf(sweep, ['\\mathrm{zToGamma}\\left(\\mathrm{lineInput}\\left(100\\cdot \\Omega,50\\cdot \\Omega,\\theta_{k}\\right)\\right)', '0.2'], 'f_{k}');
    expect(data.traces[1]!.error).toBeUndefined();
    expect([...data.traces[1]!.x]).toEqual([0.2]);
    expect(data.traces[1]!.param).toBeUndefined();
  });
  test('an impedance is refused with a pointer to zToGamma', () => {
    const t = smithOf([], ['50\\cdot \\Omega']).traces[0]!;
    expect(t.error).toMatch(/zToGamma/);
  });
  test('switching to or from a Smith chart recalculates; polar and X-Y share their data', () => {
    const base: Plot = { k: 'plot', x: null, ys: [readTex('1')], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 270, height: 270 };
    expect(calcKey({ ...base, view: 'smith' })).not.toBe(calcKey(base));
    expect(calcKey({ ...base, view: 'polar' })).toBe(calcKey(base));
  });
});
