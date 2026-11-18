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

import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import { loessInterp, loessVector, readLoess } from '../src/engine/loess.js';
import type { Value } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readRegion } from '../src/latex/region.js';

/**
 * The port of netlib's dloess (src/engine/loess.ts) against two sets of answers:
 *
 * - test/loess-probe.json: what the reference program gave for `loess` and `interp` on invented data (one to four
 *   variables, ties, 250 and 600 points, spans from 0.3 to 5), the whole vector and the refusals. The data are made
 *   below, the same way the probe made them.
 * - test/loess-reference.json: scikit-misc's loess (the same C and Fortran) on seeded random data, made by
 *   test/loess-reference.py: the statistics, the fit at a sample of points, predictions, and the cases it refuses.
 *
 * Set LOESS_REPORT=1 and LOESS_REPORT_FILE=path to write the worst error found in each field.
 */
type Probe = { vec: number[] } | { value: number } | { error: string } | { rows: number };
const PROBE = JSON.parse(readFileSync(new URL('./loess-probe.json', import.meta.url), 'utf8')) as Record<string, Probe>;

const NOISE = [0.13, -0.21, 0.08, 0.17, -0.12, -0.05, 0.22, -0.18, 0.04, -0.09, 0.11, -0.15];
const REPORT = process.env.LOESS_REPORT === '1';
const worst: Record<string, number> = {};
const note = (field: string, err: number): void => {
  if (!(err <= (worst[field] ?? 0))) worst[field] = err;
};

/** The probe's data sets. */
const f64 = (a: number[]): Float64Array => Float64Array.from(a);
const Xl = Array.from({ length: 20 }, (_, k) => k * 0.5);
const Yl = Xl.map((x, k) => Math.sin(x) + NOISE[k % 12]! * 0.3);
const Xu = [3.0, 0.5, 7.25, 1.0, 9.0, 4.4, 2.2, 6.0, 8.1];
const Yu = Xu.map((x, k) => x * x * 0.1 - x + NOISE[k]!);
const Xb = Array.from({ length: 60 }, (_, k) => k * 0.1);
const Yb = Xb.map((x, k) => Math.cos(x) * x + NOISE[k % 12]! * 0.2);
const P2 = Array.from({ length: 36 }, (_, k) => [(k % 6) * 0.8 + 0.1 * NOISE[k % 12]!, Math.floor(k / 6) * 0.6 + 0.05 * NOISE[(k + 5) % 12]!]);
const Z2 = P2.map(([a, b], k) => Math.sin(a!) + 0.5 * b! * b! + NOISE[k % 12]! * 0.2);
const Xt = [0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 4, 4, 5, 5, 5, 6, 7, 7, 8, 8];
const Yt = Xt.map((x, k) => 0.3 * x + NOISE[k % 12]!);
const big = (n: number): [number[], number[]] => {
  const X = Array.from({ length: n }, (_, k) => (10 * k) / n);
  return [X, X.map((x, k) => Math.sin(x) + NOISE[k % 12]!)];
};
const multi = (dim: number): [number[][], number[]] => {
  const P = Array.from({ length: 40 }, (_, k) => Array.from({ length: dim }, (_, j) => ((k * (7 + 3 * j)) % 11) * 0.3 + 0.07 * NOISE[(k + j) % 12]!));
  const Z = P.map((row, k) => row.reduce((s, a, j) => s + Math.sin(a * (j + 1) * 0.5), 0) + 0.1 * NOISE[k % 12]!);
  return [P, Z];
};
const Pc = Array.from({ length: 56 }, (_, k) => [((k * 5) % 7) * 0.5, ((k * 3) % 8) * 0.4]);
const Zc = Pc.map(([a, b], k) => Math.sin(a!) * b! + NOISE[k % 12]! * 0.1);
const cols = (rows: number[][]): Float64Array[] => rows[0]!.map((_, j) => f64(rows.map((r) => r[j]!)));
const fit1 = (x: number[], y: number[], span: number): Float64Array => loessVector([f64(x)], f64(y), span);

const probe = (key: string): Probe => PROBE[key] ?? { error: `no probe ${key}` };
const probed = (key: string): number[] => {
  const p = probe(key);
  if (!('vec' in p)) throw new Error(`${key}: not a vector`);
  return p.vec;
};

/** The fields of a loess vector, as [name, start, end). */
function fields(d: number, n: number, nc: number, nv: number): [string, number, number][] {
  const out: [string, number, number][] = [];
  let p = 0;
  const add = (name: string, len: number): void => {
    out.push([name, p, p + len]);
    p += len;
  };
  add('tag', 1);
  add('length', 1);
  add('fitted', n);
  add('residuals', n);
  add('parameter', 7);
  add('a', nc);
  add('xi', nc);
  add('vert', 2 * d);
  add('vval', (d + 1) * nv);
  add('robust', n);
  add('divisor', d);
  add('s', 1);
  add('one_delta', 1);
  add('two_delta', 1);
  add('span', 1);
  return out;
}

/** Exact fields, then the rest to about 1e-12 of the field's largest value. */
const EXACT = new Set(['tag', 'length', 'parameter', 'a', 'robust', 'span']);

function expectVector(label: string, got: Float64Array, want: number[], tol = 1e-12): void {
  expect(got.length, `${label}: length`).toBe(want.length);
  const lay = readLoess(want);
  expect(lay, `${label}: the reference vector's layout`).not.toBeNull();
  for (const [name, from, to] of fields(lay!.d, lay!.n, lay!.nc, lay!.nv)) {
    const scale = Math.max(1e-300, ...want.slice(from, to).map(Math.abs));
    let err = 0;
    for (let i = from; i < to; i++) {
      const e = Math.abs(got[i]! - want[i]!);
      if (EXACT.has(name)) expect(got[i], `${label}: ${name}[${i - from}]`).toBe(want[i]);
      err = Math.max(err, e / scale);
    }
    note(name, err);
    expect(err, `${label}: ${name}`).toBeLessThanOrEqual(tol);
  }
}

describe('loess: the vector, as the reference gives it', () => {
  const cases: [string, Float64Array][] = [];
  for (const span of [0.75, 0.5, 0.3, 2]) cases.push([`loess1: loess ${span}`, fit1(Xl, Yl, span)]);
  cases.push(['loess1: loess u', fit1(Xu, Yu, 0.75)]);
  cases.push(['loess1: loess b', fit1(Xb, Yb, 0.4)]);
  cases.push(['loess1: loess 2d', loessVector(cols(P2), f64(Z2), 0.75)]);
  cases.push(['loess2: loess ties', fit1(Xt, Yt, 0.6)]);
  cases.push(['loess2: loess 3d', loessVector(cols(multi(3)[0]), f64(multi(3)[1]), 0.9)]);
  cases.push(['loess2: loess 4d', loessVector(cols(multi(4)[0]), f64(multi(4)[1]), 0.9)]);
  cases.push(['loess2: loess span 1', fit1(Xl, Yl, 1)]);
  cases.push(['loess2: loess span 5', fit1(Xl, Yl, 5)]);
  const [X250, Y250] = big(250);
  cases.push(['loess3: loess n250', fit1(X250, Y250, 0.3)]);
  const [X600, Y600] = big(600);
  cases.push(['loess3: loess n600', fit1(X600, Y600, 0.2)]);
  const rep5 = Array.from({ length: 30 }, (_, k) => 1 + (k % 5));
  const rep3 = Array.from({ length: 30 }, (_, k) => 1 + (k % 3));
  for (const sp of [0.3, 0.5, 0.75]) cases.push([`loess5: rep5x6 ${sp}`, fit1(rep5, rep5.map((x, k) => x * 0.5 + NOISE[k % 12]!), sp)]);
  for (const sp of [0.5, 0.9]) cases.push([`loess5: rep3x10 ${sp}`, fit1(rep3, rep3.map((x, k) => x + NOISE[k % 12]!), sp)]);
  cases.push(['loess4: loess 2d c', loessVector(cols(Pc), f64(Zc), 0.5)]);
  // rep3x10 at 0.5 has a trace of about 3 with 1 - z near 1e-15, which the delta formulas amplify: its deltas agree to about 1e-9 (delta 1) and 1e-6 (delta 2).
  test.each(cases)('%s', (key, got) => expectVector(key, got, probed(key), key.includes('rep3x10 0.5') ? 1e-5 : 1e-12));

  test('the tag is 1, as in every vector probed', () => {
    for (const [key, got] of cases) expect(got[0], key).toBe(1);
  });

  test('the sizes parameter(6) and parameter(7) follow the integer and real workspace layouts', () => {
    const want: [number, number, number, number][] = [[1, 20, 1049, 849], [2, 36, 1449, 1249], [3, 40, 2249, 1649], [4, 40, 3849, 2049], [1, 250, 1299, 1049], [1, 600, 3049, 2449]];
    for (const [d, n, liv, lv] of want) {
      const { columns, y } = make({ seed: 77 + d, d, n, span: 0.9, ties: false });
      const v = loessVector(columns, y, 0.9);
      const o = 2 + 2 * n;
      expect(Array.from(v.slice(o, o + 7)).filter((_, i) => i === 0 || i === 1 || i >= 5), `d = ${d}, n = ${n}`).toEqual([d, n, liv, lv]);
    }
  });
});

describe('loess: interp, against the reference', () => {
  const [X250, Y250] = big(250);
  const [X600, Y600] = big(600);
  const m3 = multi(3);
  const m4 = multi(4);
  const num = (s: string): number => Number(s);
  /** [label prefix, the fit, the x columns interp is given, how to read the point from the rest of the label]. */
  const sets: [string, Float64Array, Float64Array[], (rest: string) => number[]][] = [
    ...[0.75, 0.5, 0.3, 2].map((span): [string, Float64Array, Float64Array[], (r: string) => number[]] => [`loess1: interp ${span} `, fit1(Xl, Yl, span), [f64(Xl)], (r) => [num(r)]]),
    ['loess1: interp u ', fit1(Xu, Yu, 0.75), [f64(Xu)], (r) => [num(r)]],
    ['loess1: interp b ', fit1(Xb, Yb, 0.4), [f64(Xb)], (r) => [num(r)]],
    ['loess1: interp 2d ', loessVector(cols(P2), f64(Z2), 0.75), cols(P2), (r) => r.split(' ').map(num)],
    ['loess4: interp 2d c', loessVector(cols(Pc), f64(Zc), 0.5), cols(Pc), () => [1.3, 1.1]],
    ['loess2: edge ', fit1(Xl, Yl, 0.75), [f64(Xl)], (r) => [num(r)]],
    ['loess2: interp ties ', fit1(Xt, Yt, 0.6), [f64(Xt)], (r) => [num(r)]],
    ['loess2: interp n250 ', fit1(X250, Y250, 0.3), [f64(X250)], (r) => [num(r)]],
    ['loess2: interp n600 ', fit1(X600, Y600, 0.2), [f64(X600)], (r) => [num(r)]],
    ['loess2: interp 3d ', loessVector(cols(m3[0]), f64(m3[1]), 0.9), cols(m3[0]), (r) => JSON.parse(r) as number[]],
    ['loess2: interp 4d ', loessVector(cols(m4[0]), f64(m4[1]), 0.9), cols(m4[0]), (r) => JSON.parse(r) as number[]],
    ['loess3: range other ', fit1(Xl, Yl, 0.75), [f64(Array.from({ length: 20 }, (_, k) => 2 + k * 0.25))], (r) => [num(r)]],
    ['loess2: interp other data', fit1(Xl, Yl, 0.75), [f64(Xt)], () => [3]],
  ];
  let count = 0;
  for (const [prefix, vec, xs, point] of sets) {
    const keys = Object.keys(PROBE).filter((k) => k.startsWith(prefix));
    test(`${prefix.trim()} (${keys.length} points)`, () => {
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const want = probe(key);
        const z = point(key.slice(prefix.length));
        count += 1;
        if ('error' in want) {
          expect(() => loessInterp(vec, xs, z), key).toThrow(/extrapolate/);
        } else if ('value' in want) {
          const got = loessInterp(vec, xs, z)!;
          const err = Math.abs(got - want.value) / Math.max(Math.abs(want.value), 1e-3);
          note('interp', err);
          expect(err, `${key}: ${got} against ${want.value}`).toBeLessThanOrEqual(1e-12);
        }
      }
    });
  }
  test('every probed interp value was checked', () => {
    // The rest are errors on the degenerate two-variable data and on argument shapes, which the worksheet tests cover.
    const interps = Object.keys(PROBE).filter((k) => /: (interp|edge|range other)/.test(k) && !/2d b|short|scalar|row|vector x|1-vector|complex/.test(k));
    expect(count).toBe(interps.length);
  });
});

describe('loess: refusals', () => {
  test('a span too small for the points, as the reference fails them (n = 20 at 0.1 to 0.2; n = 4 and 5 at 0.75)', () => {
    for (const span of [0.05, 0.1, 0.12, 0.15, 0.16, 0.2]) expect(() => fit1(Xl, Yl, span), `span ${span}`).toThrow(/span/);
    expect(() => fit1(Xl.slice(0, 4), Yl.slice(0, 4), 0.75)).toThrow(/span/);
    expect(() => fit1(Xl.slice(0, 5), Yl.slice(0, 5), 0.75)).toThrow(/span/);
    // 0.3 works.
    expect(() => fit1(Xl, Yl, 0.3)).not.toThrow();
  });
  test('every probe refusal', () => {
    for (const k of ['loess2: loess span 0.1', 'loess2: loess span 0.05', 'loess3: span 0.12', 'loess3: span 0.15', 'loess3: span 0.16', 'loess3: span 0.2', 'loess3: n4', 'loess3: n5']) {
      expect(probe(k), k).toHaveProperty('error', 'This calculation does not converge to a solution.');
    }
  });
  test("the probe's degenerate two-variable data (a function of x, five distinct points) is refused", () => {
    const P = Array.from({ length: 25 }, (_, k) => [(((k * 7) % 5) * 0.9) + 0.03 * NOISE[k % 12]!, (((k * 3) % 5) * 1.3) + 0.05 * NOISE[(k + 2) % 12]!]);
    const Z = P.map(([a, b], k) => a! * b! * 0.2 + Math.cos(a!) + NOISE[k % 12]! * 0.1);
    expect(probe('loess3: loess 2d b')).toHaveProperty('error');
    expect(() => loessVector(cols(P), f64(Z), 0.8)).toThrow(/singular|span|width/);
  });
  test('x values that are all equal are refused', () => {
    expect(() => fit1(Xl.map(() => 1), Yl, 0.75)).toThrow(/width|singular|span/);
  });
});

describe('loess: repeated x values and the four-variable cases of loess5 and loess6', () => {
  test('a singular local fit does not stop the fit (the pseudoinverse is used), as the reference does', () => {
    const rep5 = Array.from({ length: 30 }, (_, k) => 1 + (k % 5));
    const w: string[] = [];
    const v = loessVector([f64(rep5)], f64(rep5.map((x, k) => x * 0.5 + NOISE[k % 12]!)), 0.3, { warnings: w });
    expect(v.length).toBe(142);
    expect(w).toContain('singular');
    // rep3x10 at 0.5 has a trace of about 3 (one_delta 26.99999993 in the reference).
    const rep3 = Array.from({ length: 30 }, (_, k) => 1 + (k % 3));
    const v3 = loessVector([f64(rep3)], f64(rep3.map((x, k) => x + NOISE[k % 12]!)), 0.5);
    expect(v3[v3.length - 3]).toBeCloseTo(26.99999993, 6);
  });
  test('zero-width neighbourhoods are refused: rep5x6 at 0.2, rep3x10 at 0.3', () => {
    const rep5 = Array.from({ length: 30 }, (_, k) => 1 + (k % 5));
    const rep3 = Array.from({ length: 30 }, (_, k) => 1 + (k % 3));
    expect(() => fit1(rep5, rep5.map((x, k) => x * 0.5 + NOISE[k % 12]!), 0.2)).toThrow(/no width/);
    expect(() => fit1(rep3, rep3.map((x, k) => x + NOISE[k % 12]!), 0.3)).toThrow(/no width/);
    expect(probe('loess5: rep5x6 0.2')).toHaveProperty('error');
    expect(probe('loess5: rep3x10 0.3')).toHaveProperty('error');
  });
  const four = (n: number): [Float64Array[], Float64Array] => {
    const cs = [0, 1, 2, 3].map((j) => Array.from({ length: n }, (_, k) => ((k * (7 + 3 * j) + j * j) % 23) * 0.3 + 0.01 * NOISE[(k + j) % 12]!));
    const y = Array.from({ length: n }, (_, k) => [0, 1, 2, 3].reduce((s, j) => s + Math.sin(cs[j]![k]! * (j + 1) * 0.5), 0) + 0.1 * NOISE[k % 12]!);
    return [cs.map(f64), f64(y)];
  };
  const P2b = Array.from({ length: 25 }, (_, k) => [(((k * 7) % 5) * 0.9) + 0.03 * NOISE[k % 12]!, (((k * 3) % 5) * 1.3) + 0.05 * NOISE[(k + 2) % 12]!]);
  const Z2b = P2b.map(([a, b], k) => a! * b! * 0.2 + Math.cos(a!) + NOISE[k % 12]! * 0.1);
  const cases: [string, () => Float64Array][] = [];
  for (const n of [150, 200, 300]) for (const sp of [0.1, 0.2, 0.3, 0.6, 1]) cases.push([`loess6: d4 n${n} ${sp}`, () => loessVector(...four(n), sp)]);
  for (const sp of [0.8, 1, 3]) cases.push([`loess6: 2d b ${sp}`, () => loessVector(cols(P2b), f64(Z2b), sp)]);
  test.each(cases)('%s: refused or the probed number of rows', (key, run) => {
    const want = probe(key);
    if ('rows' in want) expect(run().length).toBe(want.rows);
    else expect(want).toHaveProperty('error');
    if ('error' in want) expect(run).toThrow();
  });
  test('what stops each refused fit is a trace the delta formulas cannot use, or a span with too few points', () => {
    // Instrumented: a refused four-variable fit with ties has a negative, huge or too-small trace; the accepted ones have none of these.
    for (const [n, sp] of [[150, 0.3], [150, 1], [200, 0.6], [300, 0.1], [300, 0.6]] as const) {
      const w: string[] = [];
      try {
        loessVector(...four(n), sp, { strict: false, warnings: w });
      } catch {
        /* the NaN trace reaches the interpolant in lenient mode */
      }
      expect(w.filter((m) => m !== 'singular').length, `n = ${n}, span ${sp}`).toBeGreaterThan(0);
    }
    for (const [n, sp] of [[200, 1], [300, 1]] as const) {
      const w: string[] = [];
      loessVector(...four(n), sp, { strict: false, warnings: w });
      expect(w).toEqual([]);
    }
  });
});

describe('loess in a worksheet', () => {
  function run(lines: string[]): (Value | string)[] {
    const ws = emptyWorksheet();
    lines.forEach((l, n) => ws.regions.push({ id: String(n), left: 0, top: n * 30, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(l) }));
    return runWorksheet(ws).map((o) => (o.error ? o.error.reason : o.value!));
  }
  const col = (v: number[]): string => `\\begin{pmatrix}${v.join('\\\\')}\\end{pmatrix}`;
  const defs = [`x\\coloneq ${col(Xl)}`, `y\\coloneq ${col(Yl)}`];
  const L = (span: string): string => `\\mathrm{loess}\\left(x,y,${span}\\right)`;

  test('loess gives the vector, and interp reads it back', () => {
    const out = run([...defs, `${L('0.75')}=`, `\\mathrm{interp}\\left(${L('0.75')},x,y,3\\right)=`, `\\mathrm{interp}\\left(${L('0.75')},x,y,3+1i\\right)=`, `\\mathrm{interp}\\left(${L('0.75')},x,y,\\begin{pmatrix}3\\end{pmatrix}\\right)=`]);
    const v = out[2] as Value;
    expect(v.t).toBe('mat');
    if (v.t === 'mat') expectVector('worksheet', v.re, probed('loess1: loess 0.75'));
    // The reference's value at 3 (see the probe above), also for 3 + i and for a one-element vector.
    for (const k of [3, 4, 5]) expect((out[k] as Value & { re: number }).re).toBeCloseTo(-0.01079631288250818, 12);
  });

  test("interp refuses a point outside the x values, a vector for one variable, and a row vector of x's", () => {
    const out = run([...defs, `\\mathrm{interp}\\left(${L('0.75')},x,y,9.6\\right)=`, `\\mathrm{interp}\\left(${L('0.75')},x,y,\\begin{pmatrix}1\\\\2\\end{pmatrix}\\right)=`, `\\mathrm{interp}\\left(${L('0.75')},x^{T},y,3\\right)=`]);
    for (const k of [2, 3, 4]) expect(typeof out[k], String(out[k])).toBe('string');
    expect(out[2]).toMatch(/extrapolate/);
  });

  test('loess refuses what the reference does', () => {
    const out = run([
      ...defs,
      `${L('0')}=`, `${L('-0.5')}=`,
      `\\mathrm{loess}\\left(x,\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix},0.75\\right)=`,
      `\\mathrm{loess}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix},\\begin{pmatrix}1\\\\4\\\\9\\end{pmatrix},0.75\\right)=`,
      `\\mathrm{loess}\\left(x\\cdot 1\\mathrm{s},y,0.75\\right)=`,
      `${L('0.1')}=`,
      `\\mathrm{loess}\\left(x^{T},y^{T},0.75\\right)=`,
    ]);
    const errs = out.slice(2);
    expect(errs.map((e) => typeof e)).toEqual(Array(errs.length).fill('string'));
    expect(errs[0]).toMatch(/positive/);
    expect(errs[1]).toMatch(/positive/);
    expect(errs[2]).toMatch(/same number of rows/);
    expect(errs[3]).toMatch(/more than three/);
    expect(errs[4]).toMatch(/units/);
  });
});

/** The little generator test/loess-reference.py uses (mulberry32 and plain arithmetic), so the data need not be stored. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ref {
  seed: number;
  d: number;
  n: number;
  span: number;
  ties: boolean;
  refused?: string;
  index?: number[];
  fitted?: number[];
  s?: number | null;
  one_delta?: number | null;
  two_delta?: number | null;
  trace?: number | null;
  divisor?: number[];
  points?: number[][];
  predicted?: (number | null)[];
}
const REFS = JSON.parse(readFileSync(new URL('./loess-reference.json', import.meta.url), 'utf8')) as Ref[];

function make(c: Ref): { columns: Float64Array[]; y: Float64Array } {
  const rnd = mulberry32(c.seed);
  const columns: number[][] = [];
  for (let j = 0; j < c.d; j++) {
    const col: number[] = [];
    for (let i = 0; i < c.n; i++) {
      let x = 10 * rnd();
      if (c.ties) x = Math.floor(x * 4) / 4;
      col.push(x);
    }
    columns.push(col);
  }
  const y: number[] = [];
  for (let i = 0; i < c.n; i++) {
    let s = 0;
    for (let j = 0; j < c.d; j++) s += Math.sin(columns[j]![i]! * (j + 1) * 0.5) + (0.05 * columns[j]![i]! ** 2) / (j + 1);
    y.push(s + 0.3 * (rnd() - 0.5));
  }
  return { columns: columns.map(f64), y: f64(y) };
}

describe("loess against scikit-misc's, on seeded random data (test/loess-reference.py)", () => {
  test('the cases cover one to four variables, 10 to 700 points, spans 0.3 to 1, ties, and refusals', () => {
    expect(REFS.length).toBeGreaterThan(100);
    expect(new Set(REFS.map((r) => r.d))).toEqual(new Set([1, 2, 3, 4]));
    expect(Math.min(...REFS.map((r) => r.n))).toBe(10);
    expect(Math.max(...REFS.map((r) => r.n))).toBe(700);
    expect(REFS.some((r) => r.ties)).toBe(true);
    expect(REFS.some((r) => r.refused)).toBe(true);
  });

  const rel = (a: number, b: number): number => Math.abs(a - b) / Math.max(Math.abs(b), 1e-3);
  const OPTIONS = { cutRule: 'netlib-2006', doubleG1: true } as const;
  test.each(REFS.map((r, i) => [`#${i}: d=${r.d} n=${r.n} span=${r.span}${r.ties ? ' ties' : ''}${r.refused ? ' (refused)' : ''}`, r] as const))('%s', (_, c) => {
    const { columns, y } = make(c);
    if (c.refused) {
      expect(() => loessVector(columns, y, c.span, OPTIONS)).toThrow();
      return;
    }
    const v = loessVector(columns, y, c.span, OPTIONS);
    const lay = readLoess(v)!;
    expect(lay.d).toBe(c.d);
    expect(lay.n).toBe(c.n);
    c.index!.forEach((i, k) => {
      const e = rel(v[2 + i]!, c.fitted![k]!);
      note('ref fitted', e);
      expect(e, `fitted[${i}]`).toBeLessThanOrEqual(1e-12);
    });
    const tail = v.length - 4;
    for (const [name, got, want] of [['s', v[tail]!, c.s ?? null], ['one_delta', v[tail + 1]!, c.one_delta ?? null], ['two_delta', v[tail + 2]!, c.two_delta ?? null]] as const) {
      if (want === null) {
        expect(Number.isNaN(got) || !Number.isFinite(got), `${name} should not be finite`).toBe(true);
        continue;
      }
      note(`ref ${name}`, rel(got, want));
      expect(rel(got, want), name).toBeLessThanOrEqual(1e-12);
    }
    c.divisor!.forEach((dv, j) => expect(rel(v[v.length - 4 - c.d + j]!, dv), `divisor ${j}`).toBeLessThanOrEqual(1e-12));
    // The residuals are y minus the fit.
    for (const i of c.index!) expect(Math.abs(v[2 + c.n + i]! - (y[i]! - v[2 + i]!))).toBeLessThanOrEqual(1e-15);
    // The trace of the hat matrix is not in the vector; it shows in delta 1 and in s, which agree above.
    (c.points ?? []).forEach((p, k) => {
      const want = c.predicted![k];
      if (want === null || want === undefined) {
        expect(() => loessInterp(v, columns, p, OPTIONS.cutRule), `point ${k}`).toThrow();
      } else {
        const e = rel(loessInterp(v, columns, p, OPTIONS.cutRule)!, want);
        note('ref predict', e);
        expect(e, `predict ${k}`).toBeLessThanOrEqual(1e-12);
      }
    });
  });
});

describe('loess vectors are told from other vectors', () => {
  test('a regress, spline or ordinary vector is not a loess vector', () => {
    expect(readLoess([3, 3, 2, 1, 2, 3])).toBeNull();
    expect(readLoess(Array.from({ length: 200 }, (_, i) => i))).toBeNull();
    expect(readLoess([1, 3, 1])).toBeNull();
    // A vector that begins 1, then its own length, but is not laid out as a fit.
    const fake = [1, 60, ...Array.from({ length: 58 }, (_, i) => i)];
    expect(readLoess(fake)).toBeNull();
  });
  test('a loess vector is read back', () => {
    const v = fit1(Xl, Yl, 0.75);
    const lay = readLoess(v)!;
    expect([lay.d, lay.n]).toEqual([1, 20]);
    expect(lay.divisor).toEqual([1]);
  });
});

test.runIf(REPORT)('worst errors', () => {
  const text = Object.entries(worst).map(([k, v]) => `${k}: ${v.toExponential(2)}`).join('\n');
  if (process.env.LOESS_REPORT_FILE) writeFileSync(process.env.LOESS_REPORT_FILE, text);
});
