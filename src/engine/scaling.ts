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
 * Mathcad 14's scaling functions for industry formats, and time, as probed (2026-11-10):
 *
 * - DMS(v) or DMS(d, m, s): the angle d + m/60 + s/3600 degrees, in radians. Each part keeps its own sign, so
 *   DMS(−10, 30, 0) is −9.5°. v, or the numbers given, may be one, two or three.
 * - FIF("9' 6-1/4\"") or FIF(feet, inches, fraction): a length. The string has feet before ', whole inches,
 *   and a fraction after - or a space; any part may be left out, the closing " is optional, and a leading −
 *   negates the whole. Decimals aren't allowed in the string.
 * - hhmmss("hh:mm:ss.sss") or hhmmss(h, m, s): a time. The string needs all three parts; a leading − negates
 *   the whole, while the three-number form adds its parts as they are.
 * - time(z): seconds since 1970, to the millisecond, without units; z is ignored.
 *
 * In the unit placeholder each shows a value in its format: FIF a string of feet and inches, the fraction of an
 * inch the closest one a continued fraction gives with a denominator up to 256 (16/113 for π's 0.14159…), hhmmss a string with the seconds to 3 decimals and no leading zeros, and DMS a vector of degrees,
 * minutes and seconds, each with the angle's sign.
 */
import { type Dim, EvalError, type Mat, type Value, dimEq, fromValues, isNoDim, num, str } from './values.js';

type Impl = (...args: Value[]) => Value;

export const SCALING_ARITY: Record<string, [number, number]> = { DMS: [1, 3], FIF: [1, 3], hhmmss: [1, 3], time: [1, 1] };

const LENGTH: Dim = [1, 0, 0, 0, 0, 0, 0];
const TIME: Dim = [0, 0, 1, 0, 0, 0, 0];
const INCH = 0.0254;

/** A real number without units, as Mathcad requires of each part. */
function plain(v: Value | undefined, fn: string): number {
  if (v?.t !== 'num') throw new EvalError('runtime', fn === 'DMS' ? 'DMS takes real numbers: degrees, minutes and seconds' : `${fn} takes a string or three numbers`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn}'s parts must be numbers without units`);
  if (v.im !== 0) throw new EvalError('runtime', `${fn}'s parts must be real`);
  return v.re;
}

/** The three parts, from three numbers. A string goes to the format's own reader. */
function parts(args: Value[], fn: string): [number, number, number] {
  if (args.length !== 3) throw new EvalError('runtime', `${fn} takes a string or three numbers`);
  return [plain(args[0], fn), plain(args[1], fn), plain(args[2], fn)];
}

function dms(...args: Value[]): Value {
  let p: number[];
  if (args.length === 1 && args[0]!.t === 'mat') {
    const v = args[0] as Mat;
    if (v.cells || v.cols !== 1 || v.rows > 3) throw new EvalError('runtime', 'DMS takes a vector of three elements: degrees, minutes and seconds');
    p = Array.from({ length: v.rows }, (_, k) => plain(num(v.re[k]!, v.dim, v.im?.[k] ?? 0), 'DMS'));
  } else {
    p = args.map((v) => plain(v, 'DMS'));
  }
  const [d = 0, m = 0, s = 0] = p;
  return num(((d + m / 60 + s / 3600) * Math.PI) / 180);
}

const FIF_FORM = /^(-)?(?:(\d+)')?\s*(?:(\d+)(?:[- ]+(\d+)\/(\d+))?|(\d+)\/(\d+))?"?$/;

function fif(...args: Value[]): Value {
  if (args.length === 1 && args[0]!.t === 'str') {
    const s = args[0].v;
    const m = FIF_FORM.exec(s);
    if (!m || !/\d/.test(s)) throw new EvalError('runtime', 'FIF needs a string in the form n\' n-n/n", as "9\' 6-1/4\\""');
    const [, minus, feet, inches, p1, q1, p2, q2] = m;
    const p = Number(p1 ?? p2 ?? 0);
    const q = Number(q1 ?? q2 ?? 1);
    if (q === 0) throw new EvalError('runtime', "FIF's fraction can't have 0 below the line");
    const total = Number(feet ?? 0) * 12 + Number(inches ?? 0) + p / q;
    return num((minus ? -total : total) * INCH, LENGTH);
  }
  const [feet, inches, fraction] = parts(args, 'FIF');
  return num(feet * 12 * INCH + inches * INCH + fraction * INCH, LENGTH);
}

const HMS_FORM = /^(-)?(\d+):(\d+):(\d+(?:\.\d*)?)$/;

function hhmmss(...args: Value[]): Value {
  if (args.length === 1 && args[0]!.t === 'str') {
    const m = HMS_FORM.exec(args[0].v);
    if (!m) throw new EvalError('runtime', 'hhmmss needs a string in the form hh:mm:ss.sss, as "1:02:03.5"');
    const total = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
    return num(m[1] ? -total : total, TIME);
  }
  const [h, mins, s] = parts(args, 'hhmmss');
  return num(h * 3600 + mins * 60 + s, TIME);
}

export const scalingFns: Record<string, Impl> = {
  DMS: dms,
  FIF: fif,
  hhmmss,
  time: () => num(Date.now() / 1000),
};

/** The formats a result can show in through its unit placeholder, and the dimension each needs. */
export const SCALED_DISPLAYS: Record<string, Dim> = { FIF: LENGTH, hhmmss: TIME, DMS: [0, 0, 0, 0, 0, 0, 0] };

/**
 * The fraction for /FIF: the last convergent of x's continued fraction with a denominator of at most 256.
 * Probed on 48 values, as π's 0.14159… giving 16/113, 0.0039 giving 1/256, and 0.00389 giving 0.
 */
function nearFraction(x: number): [number, number] {
  let [p0, p1, q0, q1] = [0, 1, 1, 0];
  let r = x;
  for (let step = 0; step < 64; step++) {
    const a = Math.floor(r);
    const [p, q] = [a * p1 + p0, a * q1 + q0];
    if (q > 256) break;
    [p0, p1, q0, q1] = [p1, p, q1, q];
    if (r - a < 1e-12) break;
    r = 1 / (r - a);
  }
  return [p1, q1];
}

/** A length in metres as Mathcad's /FIF shows it: "9' 6-1/4\"". */
export function showFIF(metres: number): string {
  const inches = Math.abs(metres) / INCH;
  let feet = Math.floor(inches / 12);
  const rest = inches - feet * 12;
  let whole = Math.floor(rest);
  let [p, q] = nearFraction(rest - whole);
  if (p === q) {
    whole++;
    p = 0;
  }
  if (whole === 12) {
    feet++;
    whole = 0;
  }
  const inchPart = p === 0 ? `${whole}` : whole === 0 ? `${p}/${q}` : `${whole}-${p}/${q}`;
  return `${metres < 0 ? '-' : ''}${feet}' ${inchPart}"`;
}

/** A time in seconds as Mathcad's /hhmmss shows it: "1:2:3.5". The seconds round, without carrying. */
export function showHhmmss(seconds: number): string {
  const t = Math.abs(seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t - h * 3600) / 60);
  const s = Math.round((t - h * 3600 - m * 60) * 1000) / 1000;
  return `${seconds < 0 ? '-' : ''}${h}:${m}:${s}`;
}

/** An angle in radians as Mathcad's /DMS shows it: degrees, minutes and seconds, each with the angle's sign. */
export function showDMS(radians: number): number[] {
  const deg = Math.abs(radians) * (180 / Math.PI);
  const d = Math.trunc(deg);
  const m = Math.trunc((deg - d) * 60);
  const s = deg * 3600 - d * 3600 - m * 60;
  const sign = radians < 0 ? -1 : 1;
  return [d, m, s].map((x) => sign * x + 0);
}

/**
 * A result shown through a scaling function in its unit placeholder, as Mathcad does: a string for FIF and
 * hhmmss, a vector for DMS. Null when the name isn't one of these. A value of the wrong kind is an error.
 */
export function scaledDisplay(name: string, value: Value): Value | null {
  const dim = SCALED_DISPLAYS[name];
  if (!dim) return null;
  const what = name === 'FIF' ? 'a length' : name === 'hhmmss' ? 'a time' : 'an angle, a number without units';
  if (value.t !== 'num' || value.im !== 0 || !dimEq(value.dim, dim)) {
    throw new EvalError('runtime', `${name} in the unit placeholder shows ${what}, a real number`);
  }
  if (name === 'FIF') return str(showFIF(value.re));
  if (name === 'hhmmss') return str(showHhmmss(value.re));
  return fromValues(3, 1, showDMS(value.re).map((x) => num(x)));
}
