import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import { type Mat, type Num, type Value, getEl } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';
import ref from './ode-reference.json' with { type: 'json' };

/** Runs typed regions top to bottom and gives the last one's value, or throws its error. */
function last(...lines: string[]): Value {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  const out = runWorksheet(ws);
  for (const o of out) if (o.error) throw new Error(o.error.reason);
  return out.at(-1)!.value!;
}
const at = (m: Value, i: number, j: number): number => (getEl(m as Mat, i, j) as Num).re;
const column = (m: Value, j: number): number[] => Array.from({ length: (m as Mat).rows }, (_, i) => at(m, i, j));

const OSC = ['z\\coloneq \\begin{pmatrix}1\\\\0\\end{pmatrix}', 'E\\left(x,y\\right)\\coloneq \\begin{pmatrix}y_{1}\\\\-y_{0}\\end{pmatrix}'];
const DECAY = ['w\\coloneq \\begin{pmatrix}1\\end{pmatrix}', 'D\\left(x,y\\right)\\coloneq \\begin{pmatrix}-y_{0}\\end{pmatrix}'];
const PI = '3.14159265358979';

describe("rkfixed, digit for digit as Mathcad 14's", () => {
  // Read from Mathcad 14 on the same equations.
  test('an oscillator, y″ = −y', () => {
    const m = last(...OSC, `\\mathrm{rkfixed}\\left(z,0,${PI},4,E\\right)=`);
    expect(column(m, 0)).toEqual([0, 0.7853981633974475, 1.570796326794895, 2.3561944901923426, 3.14159265358979]);
    expect(column(m, 1)).toEqual([1, 0.70742920670977361, 0.0039207236499115838, -0.69975359561647321, -0.99396119000145466]);
    expect(column(m, 2)).toEqual([0, -0.70465265120916709, -0.99698373210167968, -0.70805815901780933, -0.00781779539405636]);
  });
  test('decay, a single starting number, and backwards', () => {
    expect(column(last(...DECAY, '\\mathrm{rkfixed}\\left(w,0,1,4,D\\right)='), 1)).toEqual([1, 0.77880859375, 0.60654282569885254, 0.47238076513167471, 0.36789419940674861]);
    expect(column(last(...DECAY, '\\mathrm{rkfixed}\\left(1,0,1,2,D\\right)='), 1)).toEqual([1, 0.60677083333333337, 0.36817084418402779]);
    const back = last(...DECAY, '\\mathrm{rkfixed}\\left(w,1,0,2,D\\right)=');
    expect(column(back, 0)).toEqual([1, 0.5, 0]);
    expect(column(back, 1)).toEqual([1, 1.6484375, 2.71734619140625]);
  });
  test('the number of points must be a positive whole number', () => {
    expect(() => last(...DECAY, '\\mathrm{rkfixed}\\left(w,0,1,2.5,D\\right)=')).toThrow(/positive whole number/);
    expect(() => last(...OSC, '\\mathrm{rkfixed}\\left(\\begin{pmatrix}1\\\\0\\\\0\\end{pmatrix},0,1,2,E\\right)=')).toThrow(/must give 3 values/);
  });
});

describe('adaptive solvers, against exact answers', () => {
  const exact = (m: Value) => column(m, 0).forEach((x, i) => {
    expect(Math.abs(at(m, i, 1) - Math.cos(x))).toBeLessThan(1e-7);
    expect(Math.abs(at(m, i, 2) + Math.sin(x))).toBeLessThan(1e-7);
  });
  test.each(['Rkadapt', 'Bulstoer', 'Adams'])('%s', (fn) => {
    const m = last(...OSC, `\\mathrm{${fn}}\\left(z,0,${PI},8,E\\right)=`);
    expect((m as Mat).rows).toBe(9);
    exact(m);
  });
  test('Adams takes a tolerance', () => {
    const m = last(...OSC, `\\mathrm{Adams}\\left(z,0,${PI},4,E,10^{-12}\\right)=`);
    expect(Math.abs(at(m, 4, 1) + 1)).toBeLessThan(1e-10);
  });
  test('rkadapt keeps its own steps: x1 first, x2 last, more than save apart, at most kmax', () => {
    const m = last(...DECAY, '\\mathrm{rkadapt}\\left(w,0,1,0.001,D,100,0.1\\right)=');
    const xs = column(m, 0);
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBe(1);
    xs.slice(1, -1).forEach((x, k) => expect(x - xs[k]!).toBeGreaterThan(0.1));
    column(m, 1).forEach((y, i) => expect(Math.abs(y - Math.exp(-xs[i]!))).toBeLessThan(1e-4));
    expect((last(...DECAY, '\\mathrm{rkadapt}\\left(w,0,1,10^{-8},D,3,0\\right)=') as Mat).rows).toBeLessThanOrEqual(3);
  });
  test('Lotka–Volterra, as SciPy', () => {
    const m = last('p\\coloneq \\begin{pmatrix}10\\\\5\\end{pmatrix}', 'L\\left(x,y\\right)\\coloneq \\begin{pmatrix}1.5\\cdot y_{0}-y_{0}\\cdot y_{1}\\\\-3\\cdot y_{1}+y_{0}\\cdot y_{1}\\end{pmatrix}', '\\mathrm{Rkadapt}\\left(p,0,10,5,L\\right)=');
    ref.lotka.y.forEach((ys, i) => ys.forEach((y, k) => expect(Math.abs(at(m, i, k + 1) - y)).toBeLessThan(1e-6 * Math.max(1, Math.abs(y)))));
  });
});

describe('stiff solvers', () => {
  const ROB = [
    'q\\coloneq \\begin{pmatrix}1\\\\0\\\\0\\end{pmatrix}',
    'R\\left(x,y\\right)\\coloneq \\begin{pmatrix}-0.04\\cdot y_{0}+10^{4}\\cdot y_{1}\\cdot y_{2}\\\\0.04\\cdot y_{0}-10^{4}\\cdot y_{1}\\cdot y_{2}-3\\cdot 10^{7}\\cdot {y_{1}}^2\\\\3\\cdot 10^{7}\\cdot {y_{1}}^2\\end{pmatrix}',
    'Jy\\left(x,y\\right)\\coloneq \\begin{pmatrix}-0.04&10^{4}\\cdot y_{2}&10^{4}\\cdot y_{1}\\\\0.04&-10^{4}\\cdot y_{2}-6\\cdot 10^{7}\\cdot y_{1}&-10^{4}\\cdot y_{1}\\\\0&6\\cdot 10^{7}\\cdot y_{1}&0\\end{pmatrix}',
    'Jx\\left(x,y\\right)\\coloneq \\mathrm{augment}\\left(\\begin{pmatrix}0\\\\0\\\\0\\end{pmatrix},Jy\\left(x,y\\right)\\right)',
  ];
  // Robertson's chemistry at t = 0, 0.4, 4, 40, against SciPy's Radau at tolerance 10⁻¹³.
  const robertson = (m: Value) => ref.robertson.y.forEach((ys, i) => {
    expect(at(m, i, 0)).toBeCloseTo(ref.robertson.t[i]!, 12);
    ys.forEach((y, k) => expect(Math.abs(at(m, i, k + 1) - y)).toBeLessThan(1e-7 + 1e-6 * Math.abs(y)));
  });
  test.each([
    ['Radau, no Jacobian', 'Radau\\left(q,0,40,100,R\\right)'],
    ['BDF, an n × n Jacobian', 'BDF\\left(q,0,40,100,R,Jy\\right)'],
    ['AdamsBDF', 'AdamsBDF\\left(q,0,40,100,R\\right)'],
    ['Stiffr, an n × (n+1) Jacobian', 'Stiffr\\left(q,0,40,100,R,Jx\\right)'],
    ['Stiffb', 'Stiffb\\left(q,0,40,100,R,Jx\\right)'],
  ])('Robertson by %s', (_, call) => {
    const m = last(...ROB, `M\\coloneq \\mathrm{${call.replace(/\\left/, '}\\left')}`, 'M=');
    // Points 0, 1, 10, 100 are t = 0, 0.4, 4, 40.
    const pick = { t: [0, 1, 10, 100] };
    robertson({ ...(m as Mat), rows: 4, re: Float64Array.from({ length: 16 }, (_, k) => at(m, pick.t[k % 4]!, Math.floor(k / 4))) } as Mat);
  });
  test('Van der Pol with μ = 1000, as SciPy', () => {
    const m = last(
      'v\\coloneq \\begin{pmatrix}2\\\\0\\end{pmatrix}',
      'P\\left(x,y\\right)\\coloneq \\begin{pmatrix}y_{1}\\\\1000\\cdot \\left(1-{y_{0}}^2\\right)\\cdot y_{1}-y_{0}\\end{pmatrix}',
      '\\mathrm{Radau}\\left(v,0,3000,6,P\\right)=',
    );
    ref.vanderpol.y.forEach((ys, i) => expect(Math.abs(at(m, i, 1) - ys[0]!)).toBeLessThan(1e-4));
  });
  test('the Jacobian must have its layout: n × (n+1) for Stiffb and Stiffr, n × n for Radau, BDF and AdamsBDF', () => {
    expect(() => last(...ROB, '\\mathrm{Stiffr}\\left(q,0,1,2,R,Jy\\right)=')).toThrow(/3 × 4/);
    expect(() => last(...ROB, '\\mathrm{BDF}\\left(q,0,1,2,R,Jx\\right)=')).toThrow(/3 × 3/);
  });
  test('stiffr keeps its own steps', () => {
    const m = last(...ROB, '\\mathrm{stiffr}\\left(q,0,40,10^{-6},R,Jx,50,1\\right)=');
    expect(at(m, 0, 0)).toBe(0);
    expect(at(m, (m as Mat).rows - 1, 0)).toBe(40);
    expect((m as Mat).rows).toBeLessThanOrEqual(50);
  });
  test("Radau's mass matrix: M·y′ = D", () => {
    const m = last(...DECAY, '\\mathrm{Radau}\\left(w,0,1,2,D,\\begin{pmatrix}2\\end{pmatrix}\\right)=');
    expect(Math.abs(at(m, 2, 1) - Math.exp(-0.5))).toBeLessThan(1e-8);
    expect(() => last(...DECAY, '\\mathrm{Radau}\\left(w,0,1,2,D,\\begin{pmatrix}0\\end{pmatrix}\\right)=')).toThrow(/singular/);
  });
});

describe("units, MathMath's own", () => {
  const RC = ['R_{\\text{1}}\\coloneq 1\\cdot k\\Omega', 'C\\coloneq 1\\cdot \\mathrm{mF}', 'u\\coloneq \\begin{pmatrix}5\\cdot \\mathrm{V}\\end{pmatrix}',
    'F\\left(t,v\\right)\\coloneq \\begin{pmatrix}\\frac{-v_{0}}{R_{\\text{1}}\\cdot C}\\end{pmatrix}'];
  test('an RC discharge in volts and seconds', () => {
    const m = last(...RC, 'S\\coloneq \\mathrm{Rkadapt}\\left(u,0,1\\cdot \\mathrm{s},4,F\\right)', 'S=') as Mat;
    // τ = RC = 1 s.
    expect(Math.abs(at(m, 4, 1) - 5 * Math.exp(-1))).toBeLessThan(1e-8);
    expect([...(getEl(m, 4, 0) as Num).dim]).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect([...(getEl(m, 4, 1) as Num).dim]).toEqual([2, 1, -3, -1, 0, 0, 0]);
  });
  test('zero starting values in different units, as a circuit at rest: (0·V; 0·A)', () => {
    const lines = ['R\\coloneq 20\\cdot \\Omega', 'L\\coloneq 10\\cdot \\mathrm{mH}', 'C\\coloneq 10\\cdot \\mathrm{μF}',
      'F\\left(t,y\\right)\\coloneq \\begin{pmatrix}\\frac{y_{1}}{C}\\\\\\frac{5\\cdot \\mathrm{V}-R\\cdot y_{1}-y_{0}}{L}\\end{pmatrix}',
      'Q\\coloneq \\mathrm{Rkadapt}\\left(\\begin{pmatrix}0\\cdot \\mathrm{V}\\\\0\\cdot \\mathrm{A}\\end{pmatrix},0,50\\cdot \\mathrm{ms},10,F\\right)'];
    const v = last(...lines, 'Q^{\\langle 1\\rangle }=') as Mat;
    const i = last(...lines, 'Q^{\\langle 2\\rangle }=') as Mat;
    // A column taken out keeps its own unit, even though it starts at 0.
    expect([...v.dim]).toEqual([2, 1, -3, -1, 0, 0, 0]);
    expect([...i.dim]).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(Math.abs(v.re[10]! - 5)).toBeLessThan(1e-6);
    expect(Math.abs(i.re[10]!)).toBeLessThan(1e-6);
  });

  test('a derivative in the wrong units is refused', () => {
    expect(() => last(...RC, 'G\\left(t,v\\right)\\coloneq \\begin{pmatrix}v_{0}\\end{pmatrix}', '\\mathrm{rkfixed}\\left(u,0,1\\cdot \\mathrm{s},4,G\\right)=')).toThrow(/wrong units/);
  });
});
