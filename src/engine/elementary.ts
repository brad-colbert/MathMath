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
 * The elementary functions on real and complex numbers, with Mathcad 14's branches. Probed in Mathcad 14 on
 * real arguments inside and outside each domain, on the branch cuts and in each quadrant: its inverse functions are
 * the textbook logarithm formulas, asin(z) = −i·ln(iz + √(1 − z²)) and the like, with ln and √ taking the upper
 * side of the negative real axis. So asin(2) is π/2 − 1.317i and atanh(2) is 0.549 − iπ/2: the opposite sides to
 * C99's on those cuts. A real argument inside a function's domain gives the same real answer as before, from Math.
 */
import { type C, cadd, cmul, csub } from './complex.js';
import { EvalError } from './values.js';

const I: C = [0, 1];
const HALF_PI = Math.PI / 2;
const singular = (fn: string): EvalError => new EvalError('runtime', `${fn} has a singularity here: its value is infinite`);

/** a / b, with a zero b a singularity of fn. */
function over(a: C, b: C, fn: string): C {
  const d = b[0] * b[0] + b[1] * b[1];
  if (d === 0) throw singular(fn);
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
const inv = (z: C, fn: string): C => over([1, 0], z, fn);
const scale = (z: C, k: number): C => [z[0] * k, z[1] * k];
const times = (a: C, b: C): C => cmul(a, b);

/** The principal logarithm; on the negative real axis, the upper side: ln(−1) = iπ. */
function ln(z: C, fn: string): C {
  if (z[0] === 0 && z[1] === 0) throw singular(fn);
  return [Math.log(Math.hypot(z[0], z[1])), Math.atan2(z[1] || 0, z[0])];
}

/** The principal square root; on the negative real axis, the upper side: √−4 = 2i. */
function sqrt(z: C): C {
  const [x, y] = [z[0], z[1] || 0];
  if (x === 0 && y === 0) return [0, 0];
  const r = Math.hypot(x, y);
  if (x >= 0) {
    const t = Math.sqrt((r + x) / 2);
    return [t, y / (2 * t)];
  }
  const t = Math.sqrt((r - x) / 2);
  return [Math.abs(y) / (2 * t), y < 0 ? -t : t];
}

export const cexp = (z: C): C => {
  const e = Math.exp(z[0]);
  return z[1] === 0 ? [e, 0] : [e * Math.cos(z[1]), e * Math.sin(z[1])];
};
const csin = (z: C): C => [Math.sin(z[0]) * Math.cosh(z[1]), Math.cos(z[0]) * Math.sinh(z[1])];
const ccos = (z: C): C => [Math.cos(z[0]) * Math.cosh(z[1]), -Math.sin(z[0]) * Math.sinh(z[1])];
const csinh = (z: C): C => [Math.sinh(z[0]) * Math.cos(z[1]), Math.cosh(z[0]) * Math.sin(z[1])];
const ccosh = (z: C): C => [Math.cosh(z[0]) * Math.cos(z[1]), Math.sinh(z[0]) * Math.sin(z[1])];
/** tan(x + iy) = (sin 2x + i sinh 2y) / (cos 2x + cosh 2y), which stays finite as y grows. */
function ctan(z: C): C {
  const [x, y] = [2 * z[0], 2 * z[1]];
  if (Math.abs(y) > 700) return [0, Math.sign(y)];
  const d = Math.cos(x) + Math.cosh(y);
  return [Math.sin(x) / d, Math.sinh(y) / d];
}
/** tanh(z) = −i·tan(iz). */
function ctanh(z: C): C {
  const t = ctan([-z[1], z[0]]);
  return [t[1], -t[0]];
}

/** ln(1 + w), accurate when w is small; the angle takes the upper side of the negative real axis. */
function lnOnePlus(w: C, fn: string): C {
  const [x, y] = [w[0], w[1] || 0];
  if (x === -1 && y === 0) throw singular(fn);
  const re = Math.abs(x) < 0.5 && Math.abs(y) < 0.5 ? 0.5 * Math.log1p(x * (2 + x) + y * y) : Math.log(Math.hypot(1 + x, y));
  return [re, Math.atan2(y, 1 + x)];
}
const neg = (z: C): C => [-z[0], -z[1]];

/**
 * asinh(z) = ln(z + √(z² + 1)), Mathcad's formula, which is odd: so it's worked out for Re z ≥ 0, where nothing
 * cancels, as ln(1 + w) with w = z + z²/(√(z² + 1) + 1), accurate however small z is.
 */
function casinh(z: C, fn: string): C {
  if (z[0] < 0 || (z[0] === 0 && z[1] < 0)) return neg(casinh(neg(z), fn));
  if (Math.hypot(z[0], z[1]) > 1e150) {
    const l = ln(z, fn);
    return [l[0] + Math.LN2, l[1]];
  }
  const zz = times(z, z);
  return lnOnePlus(cadd(z, over(zz, cadd(sqrt(cadd(zz, [1, 0])), [1, 0]), fn)), fn);
}
/** asin(z) = −i·asinh(iz): the same formula, −i·ln(iz + √(1 − z²)). */
function casin(z: C, fn: string): C {
  const r = casinh([-z[1], z[0]], fn);
  return [r[1], -r[0]];
}
const cacos = (z: C, fn: string): C => csub([HALF_PI, 0], casin(z, fn));
/** acosh(z) = ln(z + √(z + 1)·√(z − 1)), as ln(1 + w) with w = (z − 1) + √(z + 1)·√(z − 1). */
const cacosh = (z: C, fn: string): C => lnOnePlus(cadd(csub(z, [1, 0]), times(sqrt(cadd(z, [1, 0])), sqrt(csub(z, [1, 0])))), fn);
/**
 * atanh(z) = ½(ln(1 + z) − ln(1 − z)), Mathcad's formula, which is odd: worked out for Re z ≥ 0 as
 * ¼·ln(|1 + z|²/|1 − z|²) and ½·arg((1 + z)(1 − z̄)), which keep their digits for small and large z. On the cut
 * beyond 1 it takes the lower side, as that formula does: atanh(2) is 0.549 − iπ/2.
 */
function catanh(z: C, fn: string): C {
  const [x, y0] = z;
  if (x < 0) return neg(catanh(neg(z), fn));
  if (x === 1 && y0 === 0) throw singular(fn);
  const y = y0 === 0 ? (x > 1 ? -0 : 0) : y0;
  return [0.25 * Math.log1p((4 * x) / ((1 - x) * (1 - x) + y * y)), 0.5 * Math.atan2(2 * y, (1 - x) * (1 + x) - y * y)];
}
/** atan(z) = −i·atanh(iz): the same as (i/2)(ln(1 − iz) − ln(1 + iz)). */
function catan(z: C, fn: string): C {
  const r = catanh([-z[1], z[0]], fn);
  return [r[1], -r[0]];
}
/** ½·ln((z + 1)/(z − 1)) = ½·ln(1 + 2/(z − 1)), which gives acoth(0) = iπ/2 as Mathcad does. */
const cacoth = (z: C, fn: string): C => scale(lnOnePlus(over([2, 0], csub(z, [1, 0]), fn), fn), 0.5);

/** One function: its real form, used where the argument and answer are real, and its complex form. */
interface Elementary { real?: (x: number) => number | undefined; complex: (z: C, fn: string) => C }

const inside = (lo: number, hi: number, f: (x: number) => number) => (x: number): number | undefined => (x >= lo && x <= hi ? f(x) : undefined);
const outside = (f: (x: number) => number) => (x: number): number | undefined => (Math.abs(x) >= 1 ? f(x) : undefined);
const nonzero = (fn: string, f: (x: number) => number) => (x: number): number => {
  if (x === 0) throw singular(fn);
  return f(x);
};

export const ELEMENTARY: Record<string, Elementary> = {
  exp: { real: Math.exp, complex: cexp },
  sin: { real: Math.sin, complex: csin },
  cos: { real: Math.cos, complex: ccos },
  tan: { real: Math.tan, complex: ctan },
  cot: { real: nonzero('cot', (x) => 1 / Math.tan(x)), complex: (z, fn) => inv(ctan(z), fn) },
  sec: { real: (x) => 1 / Math.cos(x), complex: (z, fn) => inv(ccos(z), fn) },
  csc: { real: nonzero('csc', (x) => 1 / Math.sin(x)), complex: (z, fn) => inv(csin(z), fn) },
  sinh: { real: Math.sinh, complex: csinh },
  cosh: { real: Math.cosh, complex: ccosh },
  tanh: { real: Math.tanh, complex: ctanh },
  coth: { real: nonzero('coth', (x) => 1 / Math.tanh(x)), complex: (z, fn) => inv(ctanh(z), fn) },
  sech: { real: (x) => 1 / Math.cosh(x), complex: (z, fn) => inv(ccosh(z), fn) },
  csch: { real: nonzero('csch', (x) => 1 / Math.sinh(x)), complex: (z, fn) => inv(csinh(z), fn) },
  asin: { real: inside(-1, 1, Math.asin), complex: casin },
  acos: { real: inside(-1, 1, Math.acos), complex: cacos },
  atan: { real: Math.atan, complex: catan },
  // Between 0 and π for a real argument, as Mathcad's: acot(−1) = 3π/4.
  acot: { real: (x) => HALF_PI - Math.atan(x), complex: (z, fn) => csub([HALF_PI, 0], catan(z, fn)) },
  asec: { real: outside((x) => Math.acos(1 / x)), complex: (z, fn) => cacos(inv(z, fn), fn) },
  acsc: { real: outside((x) => Math.asin(1 / x)), complex: (z, fn) => casin(inv(z, fn), fn) },
  asinh: { real: Math.asinh, complex: casinh },
  acosh: { real: (x) => (x >= 1 ? Math.acosh(x) : undefined), complex: cacosh },
  atanh: { real: (x) => (Math.abs(x) < 1 ? Math.atanh(x) : undefined), complex: catanh },
  acoth: { real: (x) => (Math.abs(x) > 1 ? Math.atanh(1 / x) : undefined), complex: cacoth },
  asech: { real: (x) => (x > 0 && x <= 1 ? Math.acosh(1 / x) : undefined), complex: (z, fn) => cacosh(inv(z, fn), fn) },
  acsch: { real: nonzero('acsch', (x) => Math.asinh(1 / x)), complex: (z, fn) => casinh(inv(z, fn), fn) },
};

/** Mathcad's csgn: the sign of the real part, or of the imaginary part when the real part is 0; csgn(0) = 0. */
export const csgn = (z: C): number => Math.sign(z[0] || z[1]) || 0;

/** Mathcad's signum: z/|z|, a number on the unit circle, with signum(0) = 1. */
export function signum(z: C): C {
  const r = Math.hypot(z[0], z[1]);
  return r === 0 ? [1, 0] : [z[0] / r, z[1] / r];
}
