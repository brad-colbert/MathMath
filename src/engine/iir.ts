/**
 * IIR filter design, as SciPy's `butter`, `cheby1`, `cheby2`, `ellip` and `bessel` (phase-normalized): an
 * analog lowpass prototype's zeros, poles and gain, moved to the band asked for, then, for a digital filter,
 * the bilinear transform with the edges pre-warped so they land where asked.
 *
 * Units decide the kind. An edge with frequency units (Hz, kHz) designs an analog filter H(s), with s in
 * radians per second; a plain number is a fraction of the sample rate, 0 to ½, and designs a digital filter
 * as before. Hz and 1/s are the same unit, so any frequency with units is read as cycles per second.
 *
 * Both kinds come back as (b; a) with the constant term first: b₀ + b₁z⁻¹ + … for a digital filter, and
 * b₀ + b₁s + … for an analog one, scaled so that a₀ = 1.
 */
import { polyRoots } from './systems.js';
import { type Dim, EvalError, type Mat, NODIM, type Value, fromValues, isNoDim, newMat, requireReal } from './values.js';

import { type C, cadd, cdiv, cmul, csqrt, csub } from './complex.js';

const cscale = (a: C, s: number): C => [a[0] * s, a[1] * s];
const cneg = (a: C): C => [-a[0], -a[1]];
const conj = (a: C): C => [a[0], -a[1]];
const prod = (xs: C[]): C => xs.reduce((g, q) => cmul(g, q), [1, 0] as C);

/** The polynomial with these roots, highest power first; real, since the roots come in conjugate pairs. */
export function poly(roots: C[]): Float64Array {
  let p: C[] = [[1, 0]];
  for (const r of roots) {
    const next: C[] = Array.from({ length: p.length + 1 }, () => [0, 0] as C);
    p.forEach((c, i) => {
      next[i] = cadd(next[i]!, c);
      next[i + 1] = csub(next[i + 1]!, cmul(c, r));
    });
    p = next;
  }
  return Float64Array.from(p, (c) => c[0]);
}

interface Zpk { z: C[]; p: C[]; k: number }

// ── Analog lowpass prototypes, cutoff 1 rad/s ──────────────────────────────────────────────────────

/** Steps from −N+1 to N−1 by 2, as SciPy's `arange(-N+1, N, 2)`. */
const steps = (n: number): number[] => Array.from({ length: n }, (_, i) => -n + 1 + 2 * i);

function buttap(n: number): Zpk {
  return { z: [], p: steps(n).map((m) => [-Math.cos((Math.PI * m) / (2 * n)), -Math.sin((Math.PI * m) / (2 * n))] as C), k: 1 };
}

/** Chebyshev type I: `rp` dB of ripple in the passband. */
function cheb1ap(n: number, rp: number): Zpk {
  const eps = Math.sqrt(10 ** (0.1 * rp) - 1);
  const mu = Math.asinh(1 / eps) / n;
  // −sinh(μ + iθ) = −(sinh μ cos θ + i cosh μ sin θ)
  const p = steps(n).map((m) => {
    const t = (Math.PI * m) / (2 * n);
    return [-Math.sinh(mu) * Math.cos(t), -Math.cosh(mu) * Math.sin(t)] as C;
  });
  let k = prod(p.map(cneg))[0];
  if (n % 2 === 0) k /= Math.sqrt(1 + eps * eps);
  return { z: [], p, k };
}

/** Chebyshev type II: at least `rs` dB down in the stopband. */
function cheb2ap(n: number, rs: number): Zpk {
  const de = 1 / Math.sqrt(10 ** (0.1 * rs) - 1);
  const mu = Math.asinh(1 / de) / n;
  const m = n % 2 ? steps(n).filter((x) => x !== 0) : steps(n);
  const z = m.map((x) => [0, 1 / Math.sin((x * Math.PI) / (2 * n))] as C);
  const p = steps(n).map((x) => {
    const t = (Math.PI * x) / (2 * n);
    return cdiv([-1, 0], [Math.sinh(mu) * Math.cos(t), Math.cosh(mu) * Math.sin(t)]);
  });
  const k = cdiv(prod(p.map(cneg)), prod(z.map(cneg)))[0];
  return { z, p, k };
}

// Elliptic integrals and functions, for the elliptic prototype.

function agm(a: number, b: number): number {
  for (let i = 0; i < 60 && Math.abs(a - b) > 1e-16 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return a;
}
/** The complete elliptic integral K(m), parameter m = k². */
const ellipk = (m: number): number => Math.PI / (2 * agm(1, Math.sqrt(1 - m)));
/** K(1 − p), accurate when p is small. */
const ellipkm1 = (p: number): number => Math.PI / (2 * agm(1, Math.sqrt(p)));

/** Jacobi's sn, cn and dn of u with parameter m, by the descending Landen transformation (as Cephes). */
function ellipj(u: number, m: number): [number, number, number] {
  if (m < 1e-9) {
    const t = Math.sin(u);
    const b = Math.cos(u);
    const ai = 0.25 * m * (u - t * b);
    return [t - ai * b, b + ai * t, 1 - 0.5 * m * t * t];
  }
  if (m >= 0.9999999999) {
    let ai = 0.25 * (1 - m);
    const b = Math.cosh(u);
    const t = Math.tanh(u);
    const phi = 1 / b;
    const twon = b * Math.sinh(u);
    const sn = t + (ai * (twon - u)) / (b * b);
    ai *= t * phi;
    return [sn, phi - ai * (twon - u), phi + ai * (twon + u)];
  }
  const a = [1];
  const c = [Math.sqrt(m)];
  let b = Math.sqrt(1 - m);
  let twon = 1;
  let i = 0;
  while (Math.abs(c[i]! / a[i]!) > 1.11e-16 && i < 8) {
    const ai = a[i]!;
    i++;
    c[i] = (ai - b) / 2;
    const t = Math.sqrt(ai * b);
    a[i] = (ai + b) / 2;
    b = t;
    twon *= 2;
  }
  let phi = twon * a[i]! * u;
  let prev = phi;
  for (; i > 0; i--) {
    const t = (c[i]! * Math.sin(phi)) / a[i]!;
    prev = phi;
    phi = (Math.asin(t) + phi) / 2;
  }
  const cn = Math.cos(phi);
  return [Math.sin(phi), cn, cn / Math.cos(phi - prev)];
}

/** Solves the degree equation n·K(m)/K′(m) = K(m1)/K′(m1) for m, by nomes (SciPy's `_ellipdeg`). */
function ellipdeg(n: number, m1: number): number {
  const q1 = Math.exp((-Math.PI * ellipkm1(m1)) / ellipk(m1));
  const q = q1 ** (1 / n);
  let num = 0;
  for (let k = 0; k <= 7; k++) num += q ** (k * (k + 1));
  let den = 1;
  for (let k = 1; k <= 8; k++) den += 2 * q ** (k * k);
  return 16 * q * (num / den) ** 4;
}

/**
 * The real z with sc(z, m) = w, through the inverse of sn at i·w by Landen's transformation (SciPy's
 * `_arc_jac_sc1`). At an imaginary argument every step stays imaginary, so this tracks the imaginary part.
 */
function arcJacSc1(w: number, m: number): number {
  const complement = (x: number): number => Math.sqrt((1 - x) * (1 + x));
  const ks = [Math.sqrt(m)];
  while (ks.at(-1)! !== 0 && ks.length < 12) {
    const kp = complement(ks.at(-1)!);
    ks.push((1 - kp) / (1 + kp));
  }
  const K = ks.slice(1).reduce((g, k) => g * (1 + k), 1) * (Math.PI / 2);
  let y = w;
  for (let j = 0; j + 1 < ks.length; j++) y = (2 * y) / ((1 + ks[j + 1]!) * (1 + Math.sqrt(1 + (ks[j]! * y) ** 2)));
  return K * (2 / Math.PI) * Math.asinh(y);
}

/** Elliptic (Cauer): `rp` dB of ripple in the passband and at least `rs` dB down in the stopband. */
function ellipap(n: number, rp: number, rs: number): Zpk {
  const EPS = 2e-16;
  if (n === 1) {
    const p = -Math.sqrt(1 / Math.expm1(Math.LN10 * 0.1 * rp));
    return { z: [], p: [[p, 0]], k: -p };
  }
  const epsSq = Math.expm1(Math.LN10 * 0.1 * rp);
  const eps = Math.sqrt(epsSq);
  const ck1Sq = epsSq / Math.expm1(Math.LN10 * 0.1 * rs);
  if (ck1Sq === 0) throw new EvalError('runtime', 'an elliptic filter cannot be designed for this ripple and attenuation');
  const val0 = ellipk(ck1Sq);
  const m = ellipdeg(n, ck1Sq);
  const capk = ellipk(m);
  const js: number[] = [];
  for (let j = 1 - (n % 2); j < n; j += 2) js.push(j);
  const scd = js.map((j) => ellipj((j * capk) / n, m));
  const zs = scd.filter(([s]) => Math.abs(s) > EPS).map(([s]) => [0, 1 / (Math.sqrt(m) * s)] as C);
  const z = [...zs, ...zs.map(conj)];
  const r = arcJacSc1(1 / eps, ck1Sq);
  const v0 = (capk * r) / (n * val0);
  const [sv, cv, dv] = ellipj(v0, 1 - m);
  let p = scd.map(([s, c, d]) => cscale([-(c * d * sv * cv), -(s * dv)], 1 / (1 - (d * sv) ** 2)));
  if (n % 2) {
    const size = Math.sqrt(p.reduce((t, q) => t + q[0] * q[0] + q[1] * q[1], 0));
    p = [...p, ...p.filter((q) => Math.abs(q[1]) > EPS * size).map(conj)];
  } else {
    p = [...p, ...p.map(conj)];
  }
  let k = cdiv(prod(p.map(cneg)), prod(z.map(cneg)))[0];
  if (n % 2 === 0) k /= Math.sqrt(1 + epsSq);
  return { z, p, k };
}

/**
 * Bessel, normalized as SciPy's default `norm='phase'`: the roots of the reverse Bessel polynomial θₙ, scaled
 * so the phase response reaches its midpoint at the cutoff.
 */
function besselap(n: number): Zpk {
  // θₙ(s) = Σ aₖ sᵏ with aₖ = (2n−k)! / (2ⁿ⁻ᵏ k! (n−k)!): aₙ = 1, and aₖ₋₁ = aₖ·k·(2n−k+1) / (2(n−k+1)).
  const a = new Float64Array(n + 1);
  a[n] = 1;
  for (let k = n; k > 0; k--) a[k - 1] = (a[k]! * k * (2 * n - k + 1)) / (2 * (n - k + 1));
  const roots = polyRoots(Array.from(a, (x) => [x, 0] as C));
  const scale = a[0]! ** (-1 / n);
  return { z: [], p: roots.map((q) => cscale(q, scale)), k: 1 };
}

// ── Moving the prototype to the band ──────────────────────────────────────────────────────────────

const zeros = (n: number): C[] => Array.from({ length: n }, () => [0, 0] as C);

function lp2lp({ z, p, k }: Zpk, wo: number): Zpk {
  return { z: z.map((q) => cscale(q, wo)), p: p.map((q) => cscale(q, wo)), k: k * wo ** (p.length - z.length) };
}

function lp2hp({ z, p, k }: Zpk, wo: number): Zpk {
  const degree = p.length - z.length;
  return {
    z: [...z.map((q) => cdiv([wo, 0], q)), ...zeros(degree)],
    p: p.map((q) => cdiv([wo, 0], q)),
    k: k * cdiv(prod(z.map(cneg)), prod(p.map(cneg)))[0],
  };
}

const split = (xs: C[], wo: number): C[] => {
  const d = xs.map((h) => csqrt(csub(cmul(h, h), [wo * wo, 0])));
  return [...xs.map((h, i) => cadd(h, d[i]!)), ...xs.map((h, i) => csub(h, d[i]!))];
};

function lp2bp({ z, p, k }: Zpk, wo: number, bw: number): Zpk {
  const degree = p.length - z.length;
  return {
    z: [...split(z.map((q) => cscale(q, bw / 2)), wo), ...zeros(degree)],
    p: split(p.map((q) => cscale(q, bw / 2)), wo),
    k: k * bw ** degree,
  };
}

function lp2bs({ z, p, k }: Zpk, wo: number, bw: number): Zpk {
  const degree = p.length - z.length;
  return {
    z: [
      ...split(z.map((q) => cdiv([bw / 2, 0], q)), wo),
      ...Array.from({ length: degree }, () => [0, wo] as C), ...Array.from({ length: degree }, () => [0, -wo] as C),
    ],
    p: split(p.map((q) => cdiv([bw / 2, 0], q)), wo),
    k: k * cdiv(prod(z.map(cneg)), prod(p.map(cneg)))[0],
  };
}

/** s = 2·fs·(z − 1)/(z + 1). Zeros at infinity land at z = −1. */
function bilinear({ z, p, k }: Zpk, fs: number): Zpk {
  const fs2: C = [2 * fs, 0];
  const zd = z.map((q) => cdiv(cadd(fs2, q), csub(fs2, q)));
  const pd = p.map((q) => cdiv(cadd(fs2, q), csub(fs2, q)));
  while (zd.length < pd.length) zd.push([-1, 0]);
  return { z: zd, p: pd, k: k * cdiv(prod(z.map((q) => csub(fs2, q))), prod(p.map((q) => csub(fs2, q))))[0] };
}

// ── Design ─────────────────────────────────────────────────────────────────────────────────────────

export type Kind = 'low' | 'high' | 'band' | 'stop';
/** Band edges: fractions of the sample rate for a digital filter, or hertz for an analog one. */
export interface Edges { analog: boolean; f: number[] }

/** (b; a), constant term first, a₀ = 1. */
export interface Tf { b: Float64Array; a: Float64Array }

export function design(proto: Zpk, edges: Edges, kind: Kind): Tf {
  // SciPy's iirfilter: digital edges pre-warped for fs = 2; analog edges in radians per second.
  const w = edges.f.map((f) => (edges.analog ? 2 * Math.PI * f : 4 * Math.tan(Math.PI * f)));
  let s: Zpk;
  if (kind === 'low') s = lp2lp(proto, w[0]!);
  else if (kind === 'high') s = lp2hp(proto, w[0]!);
  else {
    const [w1, w2] = w as [number, number];
    s = kind === 'band' ? lp2bp(proto, Math.sqrt(w1 * w2), w2 - w1) : lp2bs(proto, Math.sqrt(w1 * w2), w2 - w1);
  }
  if (edges.analog) {
    // Highest power first from poly; reversed, and scaled so the constant term of a is 1.
    const b = poly(s.z).map((x) => x * s.k).reverse();
    const a = poly(s.p).reverse();
    const a0 = a[0]!;
    return { b: b.map((x) => x / a0), a: a.map((x) => x / a0) };
  }
  const d = bilinear(s, 2);
  return { b: poly(d.z).map((x) => x * d.k), a: poly(d.p) };
}

// ── The sheet's functions ─────────────────────────────────────────────────────────────────────────

/** Bessel stops at 15: its poles come from a polynomial whose coefficients lose accuracy past that. */
function order(v: Value, fn: string): number {
  const n = requireReal(v, `${fn}'s order`);
  const most = fn.startsWith('bessel') ? 15 : 20;
  if (!Number.isInteger(n) || n < 1 || n > most) throw new EvalError('runtime', `${fn}'s order must be a whole number from 1 to ${most}`);
  return n;
}

const PER_SECOND: Dim = [0, 0, -1, 0, 0, 0, 0];
const dimOf = (v: Value): Dim => (v as { dim?: Dim }).dim ?? NODIM;
const sameDim = (a: Dim, b: Dim): boolean => a.every((x, i) => Math.abs(x - b[i]!) < 1e-9);

/** One edge: hertz for an analog filter, or a fraction of the sample rate, strictly between 0 and ½. */
function edge(v: Value, fn: string, what: string): { analog: boolean; f: number } {
  const x = requireReal(v, `${fn}'s ${what}`);
  const dim = dimOf(v);
  if (sameDim(dim, PER_SECOND)) {
    if (!(x > 0)) throw new EvalError('runtime', `${fn}'s ${what} must be above 0`);
    return { analog: true, f: x };
  }
  if (!isNoDim(dim)) {
    throw new EvalError('runtime', `${fn}'s ${what} must be a frequency (Hz) for an analog filter, or a fraction of the sample rate (as fc/fs) for a digital one`);
  }
  if (!(x > 0 && x < 0.5)) throw new EvalError('runtime', `${fn}'s ${what} must be between 0 and 0.5 (a fraction of the sample rate; 0.5 is the Nyquist frequency), or a frequency with units for an analog filter`);
  return { analog: false, f: x };
}

function edgesOf(fn: string, vs: Value[]): Edges {
  if (vs.length === 1) {
    const e = edge(vs[0]!, fn, 'cutoff');
    return { analog: e.analog, f: [e.f] };
  }
  const [lo, hi] = [edge(vs[0]!, fn, 'lower edge'), edge(vs[1]!, fn, 'upper edge')];
  if (lo.analog !== hi.analog) throw new EvalError('runtime', `${fn}'s edges must both be frequencies with units (analog) or both fractions of the sample rate (digital)`);
  if (!(hi.f > lo.f)) throw new EvalError('runtime', `${fn}'s upper edge must be above its lower edge`);
  return { analog: lo.analog, f: [lo.f, hi.f] };
}

function decibels(v: Value, fn: string, what: string): number {
  const x = requireReal(v, `${fn}'s ${what}`);
  if (!isNoDim(dimOf(v))) throw new EvalError('runtime', `${fn}'s ${what} is in decibels, a plain number`);
  if (!(x > 0)) throw new EvalError('runtime', `${fn}'s ${what} must be above 0 dB`);
  return x;
}

const columnOf = (x: Float64Array): Mat => {
  const m = newMat(x.length, 1);
  m.re.set(x);
  return m;
};
const tfValue = ({ b, a }: Tf): Mat => fromValues(2, 1, [columnOf(b), columnOf(a)]);

const KINDS: [string, Kind, number][] = [['Lowpass', 'low', 1], ['Highpass', 'high', 1], ['Bandpass', 'band', 2], ['Bandstop', 'stop', 2]];

/** A family's four functions: the prototype's own arguments (ripple, attenuation) come before the edges. */
function family(name: string, extras: string[], proto: (n: number, x: number[]) => Zpk): Record<string, (...v: Value[]) => Value> {
  return Object.fromEntries(KINDS.map(([suffix, kind, count]) => {
    const fn = `${name}${suffix}`;
    return [fn, (...args: Value[]) => {
      const n = order(args[0]!, fn);
      const x = extras.map((what, i) => decibels(args[1 + i]!, fn, what));
      const edges = edgesOf(fn, args.slice(1 + extras.length, 1 + extras.length + count));
      if (name === 'ellip' && !(x[1]! > x[0]!)) throw new EvalError('runtime', `${fn}'s stopband attenuation must be more than its passband ripple`);
      return tfValue(design(proto(n, x), edges, kind));
    }];
  }));
}

export const iirFns = {
  ...family('butter', [], (n) => buttap(n)),
  ...family('cheby1', ['passband ripple'], (n, [rp]) => cheb1ap(n, rp!)),
  ...family('cheby2', ['stopband attenuation'], (n, [rs]) => cheb2ap(n, rs!)),
  ...family('ellip', ['passband ripple', 'stopband attenuation'], (n, [rp, rs]) => ellipap(n, rp!, rs!)),
  ...family('bessel', [], (n) => besselap(n)),
};

/** How many arguments each takes: order, then the family's own, then one or two edges. */
export const IIR_ARITY: Record<string, [number, number]> = Object.fromEntries(
  ([['butter', 0], ['cheby1', 1], ['cheby2', 1], ['ellip', 2], ['bessel', 0]] as const).flatMap(([name, extra]) =>
    KINDS.map(([suffix, , count]) => [`${name}${suffix}`, [1 + extra + count, 1 + extra + count]] as [string, [number, number]])),
);
