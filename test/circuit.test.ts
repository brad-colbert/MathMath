import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import type { Mat, Num, Value } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/** The last region's value, or its error as a thrown Error. */
function last(origin: number, ...lines: string[]): Value {
  const ws = emptyWorksheet();
  ws.origin = origin;
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  const out = runWorksheet(ws).at(-1)!;
  if (out.error) throw new Error(out.error.reason);
  return out.value!;
}
const re = (v: Value): number[] => [...(v as Mat).re];
const im = (v: Value): number[] => [...((v as Mat).im ?? (v as Mat).re.map(() => 0))];
const close = (got: number[], want: number[], digits = 12): void => {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => expect(g).toBeCloseTo(want[i]!, digits));
};

const part = (name: string, a: number, b: number, value: string): string => `\\text{"${name}"}&${a}&${b}&${value}`;
const netlist = (...rows: string[]): string => `N\\coloneq \\begin{pmatrix}${rows.join('\\\\')}\\end{pmatrix}`;
const volts = (f?: string): string => `\\mathrm{nodeVoltages}\\left(N${f ? `,${f}` : ''}\\right)=`;
const amps = (f?: string): string => `\\mathrm{branchCurrents}\\left(N${f ? `,${f}` : ''}\\right)=`;
const run = (rows: string[], what: string, origin = 0, ...before: string[]): Value => last(origin, ...before, netlist(...rows), what);

const DIVIDER = [part('V1', 1, 0, '5\\cdot \\mathrm{V}'), part('R1', 1, 2, '1\\cdot k\\Omega'), part('R2', 2, 0, '4\\cdot k\\Omega')];

describe('DC', () => {
  test('a divider: node voltages from node 0, in volts', () => {
    const v = run(DIVIDER, volts()) as Mat;
    close(re(v), [0, 5, 4]);
    expect(v.dim).toEqual([2, 1, -3, -1, 0, 0, 0]);
  });
  test("branch currents run from a part's first node to its second, so a source supplying power is negative", () => {
    const i = run(DIVIDER, amps()) as Mat;
    close(re(i), [-1e-3, 1e-3, 1e-3], 15);
    expect(i.dim).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });
  test('with ORIGIN = 1, element k is still node k', () => {
    close(re(run(DIVIDER, volts(), 1)), [5, 4]);
    expect((last(1, netlist(...DIVIDER), '\\mathrm{nodeVoltages}\\left(N\\right)_{2}=') as Num).re).toBeCloseTo(4, 12);
  });
  test('a current source into resistors in parallel, and values from sheet variables', () => {
    const rows = [part('I1', 0, 1, '2\\cdot \\mathrm{A}'), part('R1', 1, 0, 'R_{\\text{a}}'), part('R2', 1, 0, '6\\cdot \\Omega')];
    close(re(run(rows, volts(), 0, 'R_{\\text{a}}\\coloneq 3\\cdot \\Omega')), [0, 4]);
    close(re(run(rows, amps(), 0, 'R_{\\text{a}}\\coloneq 3\\cdot \\Omega')), [2, 4 / 3, 2 / 3]);
  });
  test('a balanced bridge carries nothing across its middle, and current is conserved at each node', () => {
    const rows = [part('V1', 1, 0, '10'), part('R1', 1, 2, '100'), part('R2', 2, 0, '200'), part('R3', 1, 3, '150'), part('R4', 3, 0, '300'), part('R5', 2, 3, '50')];
    close(re(run(rows, volts())), [0, 10, 20 / 3, 20 / 3]);
    const i = re(run(rows, amps()));
    expect(i[5]).toBeCloseTo(0, 14);
    // Node 2: in through R1, out through R2 and R5.
    expect(i[1]! - i[2]! - i[5]!).toBeCloseTo(0, 15);
  });
  test('an unbalanced bridge, solved by hand', () => {
    const rows = [part('V1', 1, 0, '12'), part('R1', 1, 2, '1'), part('R2', 2, 0, '2'), part('R3', 1, 3, '3'), part('R4', 3, 0, '4'), part('R5', 2, 3, '5')];
    // Nodal equations: (V2 − 12)/1 + V2/2 + (V2 − V3)/5 = 0 and (V3 − 12)/3 + V3/4 + (V3 − V2)/5 = 0.
    const [a, b, c, d] = [1 + 1 / 2 + 1 / 5, -1 / 5, -1 / 5, 1 / 3 + 1 / 4 + 1 / 5];
    const det = a * d - b * c;
    close(re(run(rows, volts())), [0, 12, (12 * d - b * 4) / det, (a * 4 - c * 12) / det]);
  });
  test('at DC an inductor is a short and a capacitor is open', () => {
    const rows = [part('V1', 1, 0, '10'), part('L1', 1, 2, '1'), part('R1', 2, 0, '5'), part('C1', 2, 3, '1'), part('R2', 3, 0, '7')];
    close(re(run(rows, volts())), [0, 10, 10, 0]);
    close(re(run(rows, amps())), [-2, 2, 2, 0, 0]);
  });
  test('an ideal op-amp: an inverting amplifier with a gain of −10', () => {
    const rows = [part('V1', 1, 0, '5\\cdot \\mathrm{V}'), part('R1', 1, 2, '10\\cdot k\\Omega'), part('R2', 2, 3, '100\\cdot k\\Omega'), '\\text{"O1"}&0&2&3'];
    close(re(run(rows, volts())), [0, 5, 0, -50]);
    // Its current is what it drives out of its output: here it takes in what flows through R2.
    expect(re(run(rows, amps()))[3]).toBeCloseTo(-0.5e-3, 15);
  });
  test('a non-inverting amplifier', () => {
    const rows = [part('V1', 1, 0, '2'), '\\text{"O1"}&1&2&3', part('R1', 3, 2, '9'), part('R2', 2, 0, '1')];
    close(re(run(rows, volts())), [0, 2, 2, 20]);
  });
});

describe('at a frequency', () => {
  const RC = [part('V1', 1, 0, '1\\cdot \\mathrm{V}'), part('R1', 1, 2, 'R'), part('C1', 2, 0, 'C')];
  const RCdefs = ['R\\coloneq 1\\cdot k\\Omega', 'C\\coloneq 1\\cdot \\mu F'];
  test('an RC low-pass at its corner is 1/√2 at −45°', () => {
    const v = run(RC, volts('\\frac{1}{2\\cdot \\pi \\cdot R\\cdot C}'), 0, ...RCdefs);
    close(re(v), [0, 1, 0.5]);
    close(im(v), [0, 0, -0.5]);
  });
  test('in hertz, or a plain number of hertz; 0 is DC', () => {
    const fc = 1 / (2 * Math.PI * 1e-3);
    close(re(run(RC, volts(`${fc}\\cdot \\mathrm{Hz}`), 0, ...RCdefs)), [0, 1, 0.5], 9);
    close(re(run(RC, volts(String(fc)), 0, ...RCdefs)), [0, 1, 0.5], 9);
    close(re(run(RC, volts('0'), 0, ...RCdefs)), [0, 1, 1]);
  });
  test('a series RLC at resonance: the current is V/R and the capacitor sees Q times the source', () => {
    const rows = [part('V1', 1, 0, '1'), part('R1', 1, 2, '10'), part('L1', 2, 3, '0.001'), part('C1', 3, 0, '0.000001')];
    const f0 = `\\frac{1}{2\\cdot \\pi \\cdot \\sqrt{0.001\\cdot 0.000001}}`;
    expect(re(run(rows, amps(f0)))[1]).toBeCloseTo(0.1, 12);
    expect(im(run(rows, volts(f0)))[3]).toBeCloseTo(-Math.sqrt(0.001 / 0.000001) / 10, 9);
  });
  test('a source given as a phasor', () => {
    const v = run([part('V1', 1, 0, '\\mathrm{phasor}\\left(2,\\frac{\\pi}{2}\\right)'), part('R1', 1, 2, '1'), part('R2', 2, 0, '1')], volts('1000'));
    close(im(v), [0, 2, 1]);
  });
  test('an inductor in parallel with a source is fine at a frequency, though a loop at DC', () => {
    const rows = [part('V1', 1, 0, '1'), part('L1', 1, 0, '2')];
    close(re(run(rows, volts('50'))), [0, 1]);
    expect(() => run(rows, volts())).toThrow(/L1 closes a loop of voltage sources/);
  });
});

describe('netlists that cannot be solved', () => {
  test('a node with no path to ground', () => {
    expect(() => run([part('V1', 1, 0, '1'), part('R1', 1, 2, '1'), part('C1', 2, 3, '1')], volts())).toThrow(/Node 3 has no path to ground at DC/);
  });
  test('two voltage sources across the same nodes', () => {
    expect(() => run([part('V1', 1, 0, '1'), part('V2', 1, 0, '2')], volts())).toThrow(/V2 closes a loop/);
  });
  test('an op-amp with no feedback', () => {
    expect(() => run([part('V1', 1, 0, '1'), part('R1', 2, 0, '1'), '\\text{"O1"}&1&0&2'], volts())).toThrow(/no single solution/);
  });
  test('gaps in the node numbers, no ground, unknown parts and wrong units', () => {
    expect(() => run([part('V1', 1, 0, '1'), part('R1', 1, 3, '1'), part('R2', 3, 0, '1')], volts())).toThrow(/nothing connects to node 2/);
    expect(() => run([part('V1', 1, 2, '1'), part('R1', 1, 2, '1')], volts())).toThrow(/no node 0/);
    expect(() => run([part('Q1', 1, 0, '1'), part('R1', 1, 0, '1')], volts())).toThrow(/starts with R, C, L, V, I or O/);
    expect(() => run([part('V1', 1, 0, '1'), part('R1', 1, 0, '1\\cdot \\mathrm{V}')], volts())).toThrow(/R1 is a resistor: its value must be in ohms/);
    expect(() => run([part('V1', 1, 0, '1'), part('R1', 1, 0, '1')], volts('-1'))).toThrow(/frequency must be a real number of hertz/);
  });
});
