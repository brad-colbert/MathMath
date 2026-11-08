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
 * Circuit analysis, MathMath's own: node voltages and branch currents of a netlist, at DC or at one frequency,
 * by modified nodal analysis.
 *
 * A netlist is a matrix with a row for each part: its name, two nodes and its value, as ("R1", 1, 2, 10·kΩ).
 * The name's first letter says what it is: R resistor, C capacitor, L inductor, V voltage source, I current
 * source, O ideal op-amp. Node 0 is ground; the others are numbered 1, 2, … with none missing. An op-amp's row
 * holds its + input, − input and output nodes, in place of two nodes and a value. Values may carry units (Ω,
 * F, H, V, A) or be plain numbers in those units; a source's value may be complex, a phasor.
 *
 * At a frequency f, sources are phasors at f, capacitors have impedance 1/(jωC) and inductors jωL. At DC
 * (no f, or f = 0), capacitors are open and inductors are shorts.
 */
import { type Dim, EvalError, type Num, type Value, dimEq, getEl, isNoDim, newMat, num, requireNum } from './values.js';

type Impl = (...args: Value[]) => Value;

const OHM: Dim = [2, 1, -3, -2, 0, 0, 0];
const FARAD: Dim = [-2, -1, 4, 2, 0, 0, 0];
const HENRY: Dim = [2, 1, -2, -2, 0, 0, 0];
const VOLT: Dim = [2, 1, -3, -1, 0, 0, 0];
const AMPERE: Dim = [0, 0, 0, 1, 0, 0, 0];
const HERTZ: Dim = [0, 0, -1, 0, 0, 0, 0];

type Kind = 'R' | 'C' | 'L' | 'V' | 'I' | 'O';
const KINDS: Record<Kind, { unit: Dim; unitName: string; what: string }> = {
  R: { unit: OHM, unitName: 'ohms', what: 'a resistor' },
  C: { unit: FARAD, unitName: 'farads', what: 'a capacitor' },
  L: { unit: HENRY, unitName: 'henries', what: 'an inductor' },
  V: { unit: VOLT, unitName: 'volts', what: 'a voltage source' },
  I: { unit: AMPERE, unitName: 'amperes', what: 'a current source' },
  O: { unit: [0, 0, 0, 0, 0, 0, 0], unitName: '', what: 'an op-amp' },
};

interface Part {
  name: string;
  kind: Kind;
  /** Two nodes, or an op-amp's + input, − input and output. */
  nodes: number[];
  value: Num;
}

interface Netlist { parts: Part[]; nodes: number; units: boolean }

const plainName = (v: Value): string | null => (v.t === 'str' ? v.v : null);

function readNetlist(n: Value, fn: string): Netlist {
  if (n.t !== 'mat' || n.cols !== 4) {
    throw new EvalError('runtime', `${fn} takes a netlist: a matrix with a row for each part, its name, two nodes and its value, as ("R1", 1, 2, 10·kΩ)`);
  }
  let units = false;
  const used = new Set<number>();
  const parts = Array.from({ length: n.rows }, (_, i): Part => {
    const at = (j: number): Value => getEl(n, i, j);
    const name = plainName(at(0));
    const row = `the netlist's row ${i + 1}`;
    if (name === null) throw new EvalError('runtime', `${row} needs a part name in quotes first, as "R1"`);
    const kind = name.charAt(0).toUpperCase() as Kind;
    if (!(kind in KINDS)) {
      throw new EvalError('runtime', `${name}: a part's name starts with R, C, L, V, I or O (resistor, capacitor, inductor, voltage source, current source or op-amp)`);
    }
    const node = (j: number): number => {
      const v = at(j);
      const x = v.t === 'num' && v.im === 0 && isNoDim(v.dim) ? v.re : NaN;
      if (!Number.isInteger(x) || x < 0) throw new EvalError('runtime', `${name}'s nodes must be whole numbers, 0 for ground`);
      used.add(x);
      return x;
    };
    if (kind === 'O') {
      const nodes = [node(1), node(2), node(3)];
      if (nodes[2] === 0) throw new EvalError('runtime', `${name}'s output can't be node 0, ground: the row holds its + input, − input and output nodes`);
      return { name, kind, nodes, value: num(0) };
    }
    const nodes = [node(1), node(2)];
    const v = at(3);
    if (v.t !== 'num') throw new EvalError('runtime', `${name}'s value must be a number`);
    const spec = KINDS[kind];
    if (!isNoDim(v.dim)) {
      if (!dimEq(v.dim, spec.unit)) throw new EvalError('runtime', `${name} is ${spec.what}: its value must be in ${spec.unitName}, or a plain number taken as ${spec.unitName}`);
      units = true;
    }
    return { name, kind, nodes, value: v };
  });
  if (parts.length === 0) throw new EvalError('runtime', `${fn}'s netlist has no parts`);
  if (!used.has(0)) throw new EvalError('runtime', "The netlist has no node 0: ground is node 0, and every circuit needs one");
  const top = Math.max(...used);
  for (let k = 1; k < top; k++) if (!used.has(k)) throw new EvalError('runtime', `The netlist's nodes must run 0, 1, 2, … with none missing: nothing connects to node ${k}`);
  return { parts, nodes: top, units };
}

/** f in hertz, or 0 for DC. */
function frequencyOf(f: Value | undefined): number {
  if (!f) return 0;
  const v = requireNum(f, 'the frequency');
  if (v.im !== 0 || !(v.re >= 0) || !(isNoDim(v.dim) || dimEq(v.dim, HERTZ))) {
    throw new EvalError('runtime', 'The frequency must be a real number of hertz, 0 or more (0 is DC)');
  }
  return v.re;
}

/** Joins sets of nodes, for the checks before solving. */
class Joined {
  private up: number[];
  constructor(n: number) {
    this.up = Array.from({ length: n + 1 }, (_, k) => k);
  }
  find(k: number): number {
    while (this.up[k] !== k) k = this.up[k] = this.up[this.up[k]!]!;
    return k;
  }
  join(a: number, b: number): boolean {
    const [x, y] = [this.find(a), this.find(b)];
    if (x === y) return false;
    this.up[x] = y;
    return true;
  }
}

/** Whether a part is a short at this frequency: a voltage source, an inductor at DC, or a 0 Ω resistor. */
const isShort = (p: Part, f: number): boolean =>
  p.kind === 'V' || (p.kind === 'L' && (f === 0 || (p.value.re === 0 && p.value.im === 0))) || (p.kind === 'R' && p.value.re === 0 && p.value.im === 0);

/** Solves the complex system A·x = b in place by Gaussian elimination with partial pivoting, or null if singular. */
export function solveComplex(Are: number[][], Aim: number[][], bre: number[], bim: number[]): { re: number[]; im: number[] } | null {
  const n = bre.length;
  const scale = Math.max(1e-300, ...Are.flatMap((r, i) => r.map((v, j) => Math.hypot(v, Aim[i]![j]!))));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.hypot(Are[r]![c]!, Aim[r]![c]!) > Math.hypot(Are[p]![c]!, Aim[p]![c]!)) p = r;
    if (Math.hypot(Are[p]![c]!, Aim[p]![c]!) <= 1e-13 * scale) return null;
    [Are[c], Are[p]] = [Are[p]!, Are[c]!];
    [Aim[c], Aim[p]] = [Aim[p]!, Aim[c]!];
    [bre[c], bre[p]] = [bre[p]!, bre[c]!];
    [bim[c], bim[p]] = [bim[p]!, bim[c]!];
    const [pr, pi] = [Are[c]![c]!, Aim[c]![c]!];
    const d = pr * pr + pi * pi;
    for (let r = c + 1; r < n; r++) {
      const [ar, ai] = [Are[r]![c]!, Aim[r]![c]!];
      if (ar === 0 && ai === 0) continue;
      // m = A[r][c] / A[c][c]
      const mr = (ar * pr + ai * pi) / d;
      const mi = (ai * pr - ar * pi) / d;
      for (let k = c; k < n; k++) {
        const [cr, ci] = [Are[c]![k]!, Aim[c]![k]!];
        Are[r]![k]! -= mr * cr - mi * ci;
        Aim[r]![k]! -= mr * ci + mi * cr;
      }
      bre[r] = bre[r]! - (mr * bre[c]! - mi * bim[c]!);
      bim[r] = bim[r]! - (mr * bim[c]! + mi * bre[c]!);
    }
  }
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sr = bre[r]!;
    let si = bim[r]!;
    for (let k = r + 1; k < n; k++) {
      sr -= Are[r]![k]! * re[k]! - Aim[r]![k]! * im[k]!;
      si -= Are[r]![k]! * im[k]! + Aim[r]![k]! * re[k]!;
    }
    const [pr, pi] = [Are[r]![r]!, Aim[r]![r]!];
    const d = pr * pr + pi * pi;
    re[r] = (sr * pr + si * pi) / d;
    im[r] = (si * pr - sr * pi) / d;
  }
  return { re, im };
}

interface Solution { volts: { re: number; im: number }[]; amps: { re: number; im: number }[]; units: boolean }

/** Node voltages (node 0 first) and the current through each part, from its first node to its second. */
function analyse(netlist: Value, f: Value | undefined, fn: string): Solution {
  const { parts, nodes, units } = readNetlist(netlist, fn);
  const hz = frequencyOf(f);
  const w = 2 * Math.PI * hz;
  const at = hz === 0 ? 'at DC' : 'at this frequency';

  // Before solving: every node needs a path to ground through parts that conduct here, and voltage sources
  // (with inductors at DC) mustn't form a loop, or the voltages aren't fixed.
  const path = new Joined(nodes);
  const shorts = new Joined(nodes);
  for (const p of parts) {
    if (p.kind === 'I' || (p.kind === 'C' && (hz === 0 || (p.value.re === 0 && p.value.im === 0)))) continue;
    // An op-amp drives its output from ground; its inputs draw no current.
    if (p.kind === 'O') {
      path.join(p.nodes[2]!, 0);
      continue;
    }
    path.join(p.nodes[0]!, p.nodes[1]!);
    if (isShort(p, hz) && !shorts.join(p.nodes[0]!, p.nodes[1]!)) {
      throw new EvalError('runtime', `${p.name} closes a loop of voltage sources${hz === 0 ? ' (inductors count, at DC)' : ''}, so the voltages around it can't all hold`);
    }
  }
  for (let k = 1; k <= nodes; k++) {
    if (path.find(k) !== path.find(0)) throw new EvalError('runtime', `Node ${k} has no path to ground ${at}, so its voltage isn't fixed`);
  }

  // Unknowns: the voltages of nodes 1…n, then a current for each part that's a short and each op-amp.
  const extra = parts.map((p) => isShort(p, hz) || p.kind === 'O');
  const index: number[] = [];
  let size = nodes;
  for (const e of extra) index.push(e ? size++ : -1);
  const Are = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const Aim = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const bre = new Array<number>(size).fill(0);
  const bim = new Array<number>(size).fill(0);
  const add = (r: number, c: number, re: number, im: number): void => {
    if (r === 0 || c === 0) return;
    Are[r - 1]![c - 1]! += re;
    Aim[r - 1]![c - 1]! += im;
  };
  // An admittance y between nodes a and b.
  const admit = (a: number, b: number, re: number, im: number): void => {
    add(a, a, re, im);
    add(b, b, re, im);
    add(a, b, -re, -im);
    add(b, a, -re, -im);
  };
  // A unknown current j flowing from node a through the part to node b: it leaves a and enters b.
  const branch = (a: number, b: number, j: number): void => {
    if (a !== 0) Are[a - 1]![j]! += 1;
    if (b !== 0) Are[b - 1]![j]! -= 1;
  };
  parts.forEach((p, i) => {
    const [a, b] = p.nodes as [number, number];
    const { re: x, im: y } = p.value;
    const j = index[i]!;
    switch (p.kind) {
      case 'R':
      case 'L':
      case 'C': {
        if (j >= 0) {
          // A short: V(a) − V(b) = 0.
          branch(a, b, j);
          if (a !== 0) Are[j]![a - 1]! += 1;
          if (b !== 0) Are[j]![b - 1]! -= 1;
          return;
        }
        if (p.kind === 'C') {
          // jωC; an open circuit when C is 0.
          if (x !== 0 || y !== 0) admit(a, b, -w * y, w * x);
          return;
        }
        // 1/R, or 1/(jωL).
        const [zr, zi] = p.kind === 'R' ? [x, y] : [-w * y, w * x];
        const d = zr * zr + zi * zi;
        admit(a, b, zr / d, -zi / d);
        return;
      }
      case 'V': {
        // V(a) − V(b) = value, with the source's current from a through it to b.
        branch(a, b, j);
        if (a !== 0) Are[j]![a - 1]! += 1;
        if (b !== 0) Are[j]![b - 1]! -= 1;
        bre[j] = x;
        bim[j] = y;
        return;
      }
      case 'I': {
        // The source drives its current from a through it to b: out of node a's KCL, into b's.
        if (a !== 0) {
          bre[a - 1] = bre[a - 1]! - x;
          bim[a - 1] = bim[a - 1]! - y;
        }
        if (b !== 0) {
          bre[b - 1] = bre[b - 1]! + x;
          bim[b - 1] = bim[b - 1]! + y;
        }
        return;
      }
      case 'O': {
        // Ideal: its inputs are at the same voltage and draw nothing; its output supplies whatever current
        // that takes, here the current flowing out of the output into the circuit.
        const [plus, minus, out] = p.nodes as [number, number, number];
        Are[out - 1]![j]! -= 1;
        if (plus !== 0) Are[j]![plus - 1]! += 1;
        if (minus !== 0) Are[j]![minus - 1]! -= 1;
        return;
      }
    }
  });
  const x = solveComplex(Are, Aim, bre, bim);
  if (!x) throw new EvalError('runtime', `The circuit has no single solution ${at}: check for an op-amp with no feedback, or parts that cancel`);
  const volt = (k: number) => (k === 0 ? { re: 0, im: 0 } : { re: x.re[k - 1]!, im: x.im[k - 1]! });
  const volts = Array.from({ length: nodes + 1 }, (_, k) => volt(k));
  const amps = parts.map((p, i) => {
    const j = index[i]!;
    if (j >= 0) return { re: x.re[j]!, im: x.im[j]! };
    const [a, b] = p.nodes as [number, number];
    const { re: vr, im: vi } = { re: volt(a).re - volt(b).re, im: volt(a).im - volt(b).im };
    const { re: px, im: py } = p.value;
    switch (p.kind) {
      case 'I': return { re: px, im: py };
      case 'R': {
        const d = px * px + py * py;
        return { re: (vr * px + vi * py) / d, im: (vi * px - vr * py) / d };
      }
      case 'C': {
        if (hz === 0) return { re: 0, im: 0 };
        // jωC·v
        const [yr, yi] = [-w * py, w * px];
        return { re: yr * vr - yi * vi, im: yr * vi + yi * vr };
      }
      default: {
        // An inductor at a frequency: v / (jωL).
        const [zr, zi] = [-w * py, w * px];
        const d = zr * zr + zi * zi;
        return { re: (vr * zr + vi * zi) / d, im: (vi * zr - vr * zi) / d };
      }
    }
  });
  return { volts, amps, units };
}

function vector(items: { re: number; im: number }[], dim: Dim): Value {
  const m = newMat(items.length, 1, dim);
  m.re.set(items.map((v) => v.re));
  if (items.some((v) => v.im !== 0)) m.im = Float64Array.from(items.map((v) => v.im));
  return m;
}

const NODIM: Dim = [0, 0, 0, 0, 0, 0, 0];

/** The functions, for a sheet whose arrays start at `origin`: element k of nodeVoltages is node k's voltage. */
export function circuitFns(origin: number): Record<string, Impl> {
  return {
    nodeVoltages: (n, f) => {
      const s = analyse(n!, f, 'nodeVoltages');
      // From node `origin`, so that with ORIGIN = 1 the first element is node 1.
      return vector(s.volts.slice(Math.max(0, Math.min(origin, s.volts.length - 1))), s.units ? VOLT : NODIM);
    },
    branchCurrents: (n, f) => {
      const s = analyse(n!, f, 'branchCurrents');
      return vector(s.amps, s.units ? AMPERE : NODIM);
    },
  };
}

export const CIRCUIT_ARITY: Record<string, [number, number]> = { nodeVoltages: [1, 2], branchCurrents: [1, 2] };
