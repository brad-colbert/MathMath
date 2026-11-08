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

import type { Entry } from '../types.js';

export const ELECTRICAL: Entry[] = [
  {
    name: 'parallel', group: 'Electrical engineering', usage: 'parallel(Z1, Z2, …)', mathcad: false,
    summary: 'One over the sum of reciprocals: resistors or impedances in parallel, or capacitors in series.',
    details: [
      'Takes any number of values, or vectors and matrices of them, all in the same units. A short (0) across any branch makes the whole combination 0.',
    ],
    units: 'The result is in the values\' units, so `parallel(1·kΩ, 2·kΩ)` is in ohms.',
    errors: ['Values in different units.', 'Branches that cancel, as j·10 Ω beside −j·10 Ω, whose combination is infinite.'],
    example: ['\\mathrm{parallel}\\left(1\\cdot k\\Omega,2\\cdot k\\Omega\\right)=', '\\mathrm{parallel}\\left(100\\cdot \\Omega,100\\cdot \\Omega,50\\cdot \\Omega\\right)='],
  },
  {
    name: 'phasor', group: 'Electrical engineering', usage: 'phasor(r, θ)', mathcad: false,
    summary: 'The complex number of magnitude r at angle θ: r·(cos θ + j·sin θ).',
    details: ['θ is in radians, so `30·deg` works. r and θ can be vectors of the same size, or one a vector and the other a number.',
      'To show a complex result as magnitude∠angle, select it and choose Format → Complex results as magnitude∠angle.'],
    units: 'r can carry units, as `10·V`; θ can\'t, beyond radians and degrees.',
    errors: ['An angle with units other than radians or degrees.', 'A complex magnitude or angle.'],
    example: ['V\\coloneq \\mathrm{phasor}\\left(10\\cdot \\mathrm{V},30\\cdot \\mathrm{deg}\\right)', 'V=', '\\left|V\\right|='],
  },
  {
    name: 'powerToDb', group: 'Electrical engineering', usage: 'powerToDb(ratio)', mathcad: false,
    summary: 'A power ratio in decibels: 10·log(ratio).',
    details: ['Element by element for a vector or matrix. For a voltage or current ratio use [[ampToDb]]; [[dbToPower]] goes back.'],
    units: 'The ratio has no units: divide by the reference power first.',
    errors: ['A negative ratio, or 0, whose decibels are minus infinity.'],
    example: ['\\mathrm{powerToDb}\\left(2\\right)=', '\\mathrm{powerToDb}\\left(\\frac{5\\cdot \\mathrm{W}}{50\\cdot \\mathrm{mW}}\\right)='],
  },
  {
    name: 'ampToDb', group: 'Electrical engineering', usage: 'ampToDb(ratio)', mathcad: false,
    summary: 'An amplitude ratio in decibels: 20·log|ratio|, for voltages, currents and the gain of a transfer function.',
    details: ['A complex ratio counts by its magnitude, so a transfer function\'s value gives its gain directly. Element by element for a vector or matrix. [[dbToAmp]] goes back.'],
    units: 'The ratio has no units: divide by the reference first.',
    errors: ['0, whose decibels are minus infinity.'],
    example: ['\\mathrm{ampToDb}\\left(0.5\\right)=', '\\mathrm{ampToDb}\\left(\\frac{1}{1+1\\mathrm{i}}\\right)='],
  },
  {
    name: 'dbToPower', group: 'Electrical engineering', usage: 'dbToPower(dB)', mathcad: false,
    summary: 'The power ratio of a number of decibels: 10^(dB/10).',
    example: ['\\mathrm{dbToPower}\\left(-3\\right)=', '\\mathrm{dbToPower}\\left(20\\right)='],
  },
  {
    name: 'dbToAmp', group: 'Electrical engineering', usage: 'dbToAmp(dB)', mathcad: false,
    summary: 'The amplitude ratio of a number of decibels: 10^(dB/20).',
    example: ['\\mathrm{dbToAmp}\\left(20\\right)=', '\\mathrm{dbToAmp}\\left(-6\\right)='],
  },
  {
    name: 'wattsToDbm', group: 'Electrical engineering', usage: 'wattsToDbm(P)', mathcad: false,
    summary: 'A power in dBm: decibels above one milliwatt.',
    units: 'P is a power, in W, mW or any other power unit.',
    errors: ['Something that isn\'t a power.', 'A negative power, or 0.'],
    example: ['\\mathrm{wattsToDbm}\\left(25\\cdot \\mathrm{mW}\\right)=', '\\mathrm{wattsToDbm}\\left(1\\cdot \\mathrm{W}\\right)='],
  },
  {
    name: 'dbmToWatts', group: 'Electrical engineering', usage: 'dbmToWatts(dBm)', mathcad: false,
    summary: 'The power of a number of dBm, in watts.',
    example: ['\\mathrm{dbmToWatts}\\left(-10\\right)=', '\\mathrm{dbmToWatts}\\left(30\\right)='],
  },
  {
    name: 'standardValue', group: 'Electrical engineering', usage: 'standardValue(x, series)', mathcad: false,
    summary: 'The nearest standard part value in an E series: E3, E6, E12, E24, E48, E96 or E192.',
    details: ['Nearest by ratio, as tolerances are, so 4.8 goes to 4.7 in E12. series is 3, 6, 12, 24, 48, 96 or 192. Element by element for a vector or matrix.'],
    units: 'The result is in x\'s units.',
    errors: ['A series that isn\'t one of those.'],
    example: ['\\mathrm{standardValue}\\left(4.8\\cdot \\mathrm{μF},12\\right)=', '\\mathrm{standardValue}\\left(5100\\cdot \\Omega,96\\right)='],
  },
];

export const CIRCUITS: Entry[] = [
  {
    name: 'nodeVoltages', group: 'Circuits', usage: 'nodeVoltages(N, [f])', mathcad: false,
    summary: 'The voltage at each node of a circuit described by a netlist N, at DC or at a frequency f.',
    details: [
      'A netlist is a matrix with a row for each part: its name in quotes, its two nodes and its value, as `"R1", 1, 2, 10·kΩ`. The name\'s first letter says what the part is: R resistor, C capacitor, L inductor, V voltage source, I current source, O ideal op-amp. An op-amp\'s row holds its + input, − input and output nodes in place of the nodes and value.',
      'Node 0 is ground. The other nodes are numbered 1, 2, … with none missing. The result lists every node from node 0, so element k is node k\'s voltage whatever ORIGIN is.',
      'At DC, with no f or f = 0, capacitors are open and inductors are shorts. At f, sources are phasors at that frequency, so a source\'s value can be complex, as `phasor(1·V, 45·deg)`.',
      'Branch currents come from [[branchCurrents]].',
    ],
    units: 'Values can carry units (Ω, F, H, V, A) or be plain numbers in those units. f is in Hz or a plain number of hertz. The voltages are in volts when the netlist has units.',
    errors: [
      'A node with no path to ground at this frequency, whose voltage isn\'t fixed.',
      'A loop of voltage sources (inductors count, at DC), whose voltages can\'t all hold.',
      'An op-amp without feedback, or parts that cancel, leaving no single solution.',
      'Missing node numbers, no node 0, a name that doesn\'t start with one of the letters, or a value in the wrong units.',
    ],
    example: [
      'N\\coloneq \\begin{pmatrix}\\text{"V1"}&1&0&5\\cdot \\mathrm{V}\\\\\\text{"R1"}&1&2&1\\cdot k\\Omega\\\\\\text{"R2"}&2&0&4\\cdot k\\Omega\\end{pmatrix}',
      '\\mathrm{nodeVoltages}\\left(N\\right)=',
    ],
  },
  {
    name: 'branchCurrents', group: 'Circuits', usage: 'branchCurrents(N, [f])', mathcad: false,
    summary: 'The current through each part of a netlist N, in the netlist\'s order, at DC or at a frequency f.',
    details: [
      'Each current flows from the part\'s first node to its second, through the part. So a source supplying power shows a negative current: its current flows out of its first node, against the direction counted.',
      'An op-amp\'s current is the current it drives out of its output.',
      'The netlist is as for [[nodeVoltages]].',
    ],
    units: 'In amperes when the netlist has units.',
    errors: ['As for [[nodeVoltages]].'],
    example: [
      'N\\coloneq \\begin{pmatrix}\\text{"V1"}&1&0&5\\cdot \\mathrm{V}\\\\\\text{"R1"}&1&2&1\\cdot k\\Omega\\\\\\text{"R2"}&2&0&4\\cdot k\\Omega\\end{pmatrix}',
      '\\mathrm{branchCurrents}\\left(N\\right)=',
    ],
  },
];

const Z0_NOTE = 'Z0 is the reference impedance: real and positive, the same at every port, and 50 Ω when left out.';
const NET_UNITS = 'Impedances and admittances can carry units or be plain numbers in ohms and siemens. A result is in ohms or siemens when an argument carried units; the default 50 Ω counts.';

export const RF: Entry[] = [
  {
    name: 'zToGamma', group: 'RF and microwave', usage: 'zToGamma(Z, [Z0])', mathcad: false,
    summary: 'The reflection coefficient Γ = (Z − Z0)/(Z + Z0) of an impedance Z on a line or port of impedance Z0.',
    details: [Z0_NOTE, 'Element by element, so a vector of impedances gives a vector of Γ, ready for a Smith chart (Format → Smith chart on a plot). [[gammaToZ]] goes back.'],
    units: 'Z in ohms or a plain number of ohms; Γ has no units.',
    errors: ['Z = −Z0, whose reflection is infinite.'],
    example: ['\\Gamma \\coloneq \\mathrm{zToGamma}\\left(\\left(100+50\\mathrm{i}\\right)\\cdot \\Omega\\right)', '\\Gamma ='],
  },
  {
    name: 'gammaToZ', group: 'RF and microwave', usage: 'gammaToZ(Γ, [Z0])', mathcad: false,
    summary: 'The impedance Z0·(1 + Γ)/(1 − Γ) whose reflection coefficient on Z0 is Γ.',
    details: [Z0_NOTE],
    units: 'In ohms when Z0 carries units, as the default does.',
    errors: ['Γ = 1, an open circuit, whose impedance is infinite.'],
    example: ['\\mathrm{gammaToZ}\\left(0.4+0.2\\mathrm{i}\\right)=', '\\mathrm{gammaToZ}\\left(-0.2,75\\right)='],
  },
  {
    name: 'vswr', group: 'RF and microwave', usage: 'vswr(Γ)', mathcad: false,
    summary: 'The voltage standing wave ratio (1 + |Γ|)/(1 − |Γ|) of a reflection coefficient Γ.',
    details: ['Element by element. For an impedance, take [[zToGamma]] first.'],
    errors: ['|Γ| of 1 or more, whose standing wave ratio is infinite.', 'An argument with units: an impedance rather than Γ.'],
    example: ['\\mathrm{vswr}\\left(0.5\\right)=', '\\mathrm{vswr}\\left(\\mathrm{zToGamma}\\left(100\\cdot \\Omega\\right)\\right)='],
  },
  {
    name: 'returnLoss', group: 'RF and microwave', usage: 'returnLoss(Γ)', mathcad: false,
    summary: 'Return loss in decibels, −20·log|Γ|: positive, and larger for a better match.',
    errors: ['Γ = 0, a perfect match, whose return loss is infinite.'],
    example: ['\\mathrm{returnLoss}\\left(0.5\\right)=', '\\mathrm{returnLoss}\\left(\\mathrm{zToGamma}\\left(60\\cdot \\Omega\\right)\\right)='],
  },
  {
    name: 'mismatchLoss', group: 'RF and microwave', usage: 'mismatchLoss(Γ)', mathcad: false,
    summary: 'Mismatch loss in decibels, −10·log(1 − |Γ|²): the power lost to reflection.',
    errors: ['|Γ| of 1 or more, when no power gets through.'],
    example: ['\\mathrm{mismatchLoss}\\left(0.5\\right)='],
  },
  {
    name: 'lineInput', group: 'RF and microwave', usage: 'lineInput(ZL, Z0, θ)', mathcad: false,
    summary: 'The impedance looking into a transmission line of impedance Z0 and electrical length θ, ended in a load ZL.',
    details: [
      'θ = β·ℓ, in radians or degrees: a quarter wave is π/2, or 90·deg. For a lossy line, θ is complex, β·ℓ − j·α·ℓ, with α in nepers per unit length.',
      'An open end is ZL = ∞·Ω and a short is 0·Ω. Any argument can be a vector, as θ over a frequency sweep, and the result is a vector.',
      'A lossy line\'s Z0 can be complex.',
    ],
    units: 'In ohms when ZL or Z0 carries units.',
    errors: ['θ with units other than radians or degrees.', 'ZL = −Z0, which has no steady state.', 'An input that is exactly an open circuit.'],
    example: [
      '\\mathrm{lineInput}\\left(100\\cdot \\Omega,50\\cdot \\Omega,45\\cdot \\mathrm{deg}\\right)=',
      '\\mathrm{lineInput}\\left(0\\cdot \\Omega,50\\cdot \\Omega,\\frac{\\pi }{8}\\right)=',
    ],
  },
  {
    name: 'abcdLine', group: 'RF and microwave', usage: 'abcdLine(Z0, θ)', mathcad: false,
    summary: 'The ABCD matrix of a transmission line of impedance Z0 and electrical length θ.',
    details: ['(cos θ, j·Z0·sin θ; j·sin θ/Z0, cos θ). θ is as for [[lineInput]]. Multiply ABCD matrices, in order, to cascade parts; convert with [[abcdToS]], [[abcdToZ]] or [[abcdToY]].'],
    units: 'B is in ohms and C in siemens when Z0 carries units.',
    example: ['\\mathrm{abcdToS}\\left(\\mathrm{abcdLine}\\left(50\\cdot \\Omega,30\\cdot \\mathrm{deg}\\right)\\right)='],
  },
  {
    name: 'abcdSeries', group: 'RF and microwave', usage: 'abcdSeries(Z)', mathcad: false,
    summary: 'The ABCD matrix (1, Z; 0, 1) of an impedance Z in series with the line.',
    details: ['Multiply ABCD matrices, in order from port 1 to port 2, to cascade parts.'],
    units: 'B is in ohms when Z carries units.',
    example: [
      'T\\coloneq \\mathrm{abcdSeries}\\left(10\\cdot \\Omega\\right)\\cdot \\mathrm{abcdShunt}\\left(100\\cdot \\Omega\\right)\\cdot \\mathrm{abcdSeries}\\left(20\\cdot \\Omega\\right)',
      '\\mathrm{abcdToZ}\\left(T\\right)=',
    ],
  },
  {
    name: 'abcdShunt', group: 'RF and microwave', usage: 'abcdShunt(Z)', mathcad: false,
    summary: 'The ABCD matrix (1, 0; 1/Z, 1) of an impedance Z across the line, to ground.',
    details: ['Z is the part\'s impedance, not its admittance.'],
    units: 'C is in siemens when Z carries units.',
    errors: ['Z = 0, a short across the line, which has no ABCD matrix.'],
    example: ['\\mathrm{abcdToS}\\left(\\mathrm{abcdShunt}\\left(25\\cdot \\Omega\\right)\\right)='],
  },
  {
    name: 'sToZ', group: 'RF and microwave', usage: 'sToZ(S, [Z0])', mathcad: false,
    summary: 'The Z (impedance) matrix of a network from its S matrix: Z0·(I + S)·(I − S)⁻¹.',
    details: ['Any number of ports: S is square, a row and column per port. A number is a one-port\'s S, its reflection coefficient.', Z0_NOTE],
    units: NET_UNITS,
    errors: ['A network with no Z matrix, as a part in series between ports on its own.', 'A matrix that isn\'t square, or has units.'],
    example: ['S\\coloneq \\begin{pmatrix}0&0.5\\\\0.5&0\\end{pmatrix}', '\\mathrm{sToZ}\\left(S\\right)='],
  },
  {
    name: 'zToS', group: 'RF and microwave', usage: 'zToS(Z, [Z0])', mathcad: false,
    summary: 'The S matrix of a network from its Z matrix: (Z − Z0·I)·(Z + Z0·I)⁻¹.',
    details: ['Any number of ports.', Z0_NOTE],
    units: NET_UNITS,
    example: ['\\mathrm{zToS}\\left(\\begin{pmatrix}110&100\\\\100&120\\end{pmatrix}\\cdot \\Omega\\right)='],
  },
  {
    name: 'sToY', group: 'RF and microwave', usage: 'sToY(S, [Z0])', mathcad: false,
    summary: 'The Y (admittance) matrix of a network from its S matrix: (I − S)·(I + S)⁻¹/Z0.',
    details: ['Any number of ports.', Z0_NOTE],
    units: NET_UNITS,
    errors: ['A network with no Y matrix, as a part across a port on its own.'],
    example: ['\\mathrm{sToY}\\left(\\begin{pmatrix}0&0.5\\\\0.5&0\\end{pmatrix}\\right)='],
  },
  {
    name: 'yToS', group: 'RF and microwave', usage: 'yToS(Y, [Z0])', mathcad: false,
    summary: 'The S matrix of a network from its Y matrix: (I − Z0·Y)·(I + Z0·Y)⁻¹.',
    details: ['Any number of ports.', Z0_NOTE],
    units: NET_UNITS,
    example: ['\\mathrm{yToS}\\left(\\begin{pmatrix}0.02&-0.01\\\\-0.01&0.02\\end{pmatrix}\\cdot \\mathrm{S}\\right)='],
  },
  {
    name: 'zToY', group: 'RF and microwave', usage: 'zToY(Z)', mathcad: false,
    summary: 'The Y matrix of a network from its Z matrix: its inverse, which works for complex matrices too.',
    units: 'In siemens when Z is in ohms.',
    errors: ['A network with no Y matrix: Z is singular.'],
    example: ['\\mathrm{zToY}\\left(\\begin{pmatrix}110&100\\\\100&120\\end{pmatrix}\\cdot \\Omega\\right)='],
  },
  {
    name: 'yToZ', group: 'RF and microwave', usage: 'yToZ(Y)', mathcad: false,
    summary: 'The Z matrix of a network from its Y matrix: its inverse, which works for complex matrices too.',
    units: 'In ohms when Y is in siemens.',
    errors: ['A network with no Z matrix: Y is singular.'],
    example: ['\\mathrm{yToZ}\\left(\\begin{pmatrix}0.02&-0.01\\mathrm{i}\\\\-0.01\\mathrm{i}&0.02\\end{pmatrix}\\cdot \\mathrm{S}\\right)='],
  },
  {
    name: 'sToAbcd', group: 'RF and microwave', usage: 'sToAbcd(S, [Z0])', mathcad: false,
    summary: 'The ABCD (chain) matrix of a two-port from its 2 × 2 S matrix.',
    details: ['ABCD matrices multiply, in order, to cascade two-ports.', Z0_NOTE],
    units: 'B is in ohms and C in siemens when Z0 carries units, as the default does.',
    errors: ['A two-port whose port 2 doesn\'t respond to port 1 (S21 = 0), which has no ABCD matrix.', 'A matrix that isn\'t 2 × 2.'],
    example: ['\\mathrm{sToAbcd}\\left(\\begin{pmatrix}0&0.5\\\\0.5&0\\end{pmatrix}\\right)='],
  },
  {
    name: 'abcdToS', group: 'RF and microwave', usage: 'abcdToS(M, [Z0])', mathcad: false,
    summary: 'The S matrix of a two-port from its ABCD matrix M.',
    details: [Z0_NOTE],
    units: 'M\'s B is in ohms and C in siemens, or plain numbers of them; A and D have no units.',
    example: ['A\\coloneq \\mathrm{abcdShunt}\\left(150.48\\cdot \\Omega\\right)\\cdot \\mathrm{abcdSeries}\\left(37.35\\cdot \\Omega\\right)\\cdot \\mathrm{abcdShunt}\\left(150.48\\cdot \\Omega\\right)', '\\mathrm{abcdToS}\\left(A\\right)='],
  },
  {
    name: 'zToAbcd', group: 'RF and microwave', usage: 'zToAbcd(Z)', mathcad: false,
    summary: 'The ABCD matrix of a two-port from its 2 × 2 Z matrix.',
    errors: ['Z21 = 0, when port 2 doesn\'t respond to port 1.'],
    example: ['\\mathrm{zToAbcd}\\left(\\begin{pmatrix}110&100\\\\100&120\\end{pmatrix}\\cdot \\Omega\\right)='],
  },
  {
    name: 'abcdToZ', group: 'RF and microwave', usage: 'abcdToZ(M)', mathcad: false,
    summary: 'The Z matrix of a two-port from its ABCD matrix M.',
    errors: ['C = 0, as for a part in series alone, which has no Z matrix.'],
    example: ['\\mathrm{abcdToZ}\\left(\\mathrm{abcdShunt}\\left(100\\cdot \\Omega\\right)\\right)='],
  },
  {
    name: 'yToAbcd', group: 'RF and microwave', usage: 'yToAbcd(Y)', mathcad: false,
    summary: 'The ABCD matrix of a two-port from its 2 × 2 Y matrix.',
    errors: ['Y21 = 0, when port 2 doesn\'t respond to port 1.'],
    example: ['\\mathrm{yToAbcd}\\left(\\begin{pmatrix}0.1&-0.1\\\\-0.1&0.1\\end{pmatrix}\\cdot \\mathrm{S}\\right)='],
  },
  {
    name: 'abcdToY', group: 'RF and microwave', usage: 'abcdToY(M)', mathcad: false,
    summary: 'The Y matrix of a two-port from its ABCD matrix M.',
    errors: ['B = 0, as for a part to ground alone, which has no Y matrix.'],
    example: ['\\mathrm{abcdToY}\\left(\\mathrm{abcdSeries}\\left(10\\cdot \\Omega\\right)\\right)='],
  },
];
