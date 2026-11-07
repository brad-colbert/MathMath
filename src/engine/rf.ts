/**
 * RF and microwave helpers, MathMath's own: reflection coefficients and the losses they cause, transmission
 * lines, and two-port network parameters.
 *
 * Network matrices: S (scattering, no units), Z (impedance, Ω), Y (admittance, S) for any number of ports, and
 * ABCD (chain) for two ports, whose B is in ohms and C in siemens. The reference impedance Z0 is real, the same
 * at every port, and 50 Ω when left out. Impedances and admittances may carry units or be plain numbers in
 * ohms and siemens; a result carries units when an argument did, and the default 50 Ω counts.
 *
 * Lines: θ is a line's electrical length β·ℓ, in radians or degrees. A lossy line's is complex, β·ℓ − j·α·ℓ
 * with α in nepers per unit length, so that e^(−2jθ) shrinks as the wave travels there and back.
 */
import { type C, cadd, cmul, csub } from './complex.js';
import { solveComplex } from './circuit.js';
import { mapMat } from './ops.js';
import { type Dim, EvalError, type Mat, type Num, NODIM, type Value, dimEq, fromValues, getEl, isNoDim, newMat, num, requireNum } from './values.js';

type Impl = (...args: Value[]) => Value;

const OHM: Dim = [2, 1, -3, -2, 0, 0, 0];
const SIEMENS: Dim = [-2, -1, 3, 2, 0, 0, 0];

type Kind = 'S' | 'Z' | 'Y';
const UNIT: Record<Kind, Dim> = { S: NODIM, Z: OHM, Y: SIEMENS };
const NAME: Record<Kind, string> = { S: 'an S matrix, which has no units', Z: 'a Z matrix, in ohms', Y: 'a Y matrix, in siemens' };

type CM = C[][];

const isZero = (x: Num): boolean => x.re === 0 && x.im === 0;
const pair = (x: Num): C => [x.re, x.im];
const cabs = (a: C): number => Math.hypot(a[0], a[1]);
const ONE: C = [1, 0];

/** a/b by Smith's method, which neither overflows nor underflows for very large or small b, as an open end's 1e307 Ω. */
function cdiv(a: C, b: C): C {
  if (Math.abs(b[0]) >= Math.abs(b[1])) {
    const r = b[1] / b[0];
    const den = b[0] + b[1] * r;
    return [(a[0] + a[1] * r) / den, (a[1] - a[0] * r) / den];
  }
  const r = b[0] / b[1];
  const den = b[0] * r + b[1];
  return [(a[0] * r + a[1]) / den, (a[1] * r - a[0]) / den];
}

/** Reads one number of a given unit, or a plain number taken in that unit. Says whether it had the unit. */
function readIn(x: Value, unit: Dim, fn: string, what: string): { v: C; units: boolean } {
  const n = requireNum(x, `${fn}'s ${what}`);
  if (isZero(n) || isNoDim(n.dim)) return { v: pair(n), units: false };
  if (!dimEq(n.dim, unit)) throw new EvalError('runtime', `${fn}'s ${what} has the wrong units`);
  return { v: pair(n), units: true };
}

/** A square S, Z or Y matrix, or a scalar for one port. */
function readMatrix(v: Value, kind: Kind, fn: string): { m: CM; units: boolean; scalar: boolean } {
  if (v.t !== 'mat') {
    const { v: x, units } = readNet(v, kind, fn);
    return { m: [[x]], units, scalar: true };
  }
  if (v.rows !== v.cols) throw new EvalError('runtime', `${fn} takes a square matrix, one row and column for each port`);
  let units = false;
  const m: CM = [];
  for (let i = 0; i < v.rows; i++) {
    const row: C[] = [];
    for (let j = 0; j < v.cols; j++) {
      const r = readNet(getEl(v, i, j), kind, fn);
      units ||= r.units;
      row.push(r.v);
    }
    m.push(row);
  }
  return { m, units, scalar: false };
}

function readNet(x: Value, kind: Kind, fn: string): { v: C; units: boolean } {
  if (x.t === 'mat') throw new EvalError('runtime', `${fn} takes ${NAME[kind]}: not a nested array`);
  const n = requireNum(x, fn);
  if (isZero(n) || isNoDim(n.dim)) return { v: pair(n), units: false };
  if (!dimEq(n.dim, UNIT[kind])) throw new EvalError('runtime', `${fn} takes ${NAME[kind]}`);
  return { v: pair(n), units: true };
}

/** The reference impedance: real and positive, 50 Ω when left out. */
function reference(z0: Value | undefined, fn: string): { z0: number; units: boolean } {
  if (z0 === undefined) return { z0: 50, units: true };
  const { v, units } = readIn(z0, OHM, fn, 'reference impedance');
  if (v[1] !== 0 || !(v[0] > 0)) throw new EvalError('runtime', `${fn}'s reference impedance must be real and positive`);
  return { z0: v[0], units };
}

const eye = (n: number): CM => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): C => (i === j ? [1, 0] : [0, 0])));
const combine = (a: CM, b: CM, f: (x: C, y: C) => C): CM => a.map((row, i) => row.map((x, j) => f(x, b[i]![j]!)));
const scaled = (a: CM, k: number): CM => a.map((row) => row.map(([re, im]): C => [re * k, im * k]));
function times(a: CM, b: CM): CM {
  return a.map((row) => b[0]!.map((_, j) => row.reduce<C>((s, x, k) => cadd(s, cmul(x, b[k]![j]!)), [0, 0])));
}

/** The inverse, or null when the matrix is singular. */
function inverse(a: CM): CM | null {
  const n = a.length;
  const cols: C[][] = [];
  for (let j = 0; j < n; j++) {
    const x = solveComplex(a.map((r) => r.map((c) => c[0])), a.map((r) => r.map((c) => c[1])), eye(n).map((r) => r[j]![0]), new Array<number>(n).fill(0));
    if (!x) return null;
    cols.push(x.re.map((re, i): C => [re, x.im[i]!]));
  }
  return a.map((_, i) => cols.map((col) => col[i]!));
}

function output(m: CM, dim: Dim, scalar: boolean): Value {
  if (scalar) return num(m[0]![0]![0], dim, m[0]![0]![1]);
  const n = m.length;
  const out = newMat(n, m[0]!.length, dim);
  if (m.some((row) => row.some((x) => x[1] !== 0))) out.im = new Float64Array(n * m[0]!.length);
  m.forEach((row, i) => row.forEach((x, j) => {
    out.re[i + j * n] = x[0];
    if (out.im) out.im[i + j * n] = x[1];
  }));
  return out;
}

const NO: Record<Kind | 'ABCD', string> = {
  S: 'this network has no S matrix at this reference impedance',
  Z: 'this network has no Z matrix: a part in series between ports, alone, has none',
  Y: 'this network has no Y matrix: a part across a port, alone, has none',
  ABCD: "this network has no ABCD matrix: port 2 doesn't respond to port 1",
};
const none = (fn: string, kind: Kind | 'ABCD'): EvalError => new EvalError('runtime', `${fn}: ${NO[kind]}`);

/** Converts between S, Z and Y matrices of any number of ports. */
function convert(from: Kind, to: Kind, fn: string): Impl {
  return (v, z0arg) => {
    const { m, units, scalar } = readMatrix(v!, from, fn);
    const n = m.length;
    const I = eye(n);
    const ref = from === 'S' || to === 'S' ? reference(z0arg, fn) : { z0: 1, units: false };
    const z0 = ref.z0;
    let out: CM | null;
    if (from === 'S') {
      // Z = Z0·(I + S)·(I − S)⁻¹ and Y = (I − S)·(I + S)⁻¹ / Z0. The two factors commute.
      const [p, q] = [combine(I, m, cadd), combine(I, m, csub)];
      const inv = inverse(to === 'Z' ? q : p);
      out = inv && (to === 'Z' ? scaled(times(p, inv), z0) : scaled(times(q, inv), 1 / z0));
    } else if (to === 'S') {
      // S = (Z − Z0·I)·(Z + Z0·I)⁻¹, and with Y: S = (I − Z0·Y)·(I + Z0·Y)⁻¹.
      const zn = from === 'Z' ? scaled(m, 1 / z0) : scaled(m, z0);
      const top = from === 'Z' ? combine(zn, I, csub) : combine(I, zn, csub);
      const inv = inverse(combine(zn, I, cadd));
      out = inv && times(top, inv);
    } else {
      out = inverse(m);
    }
    if (!out) throw none(fn, to);
    const keepUnits = to === 'S' ? false : from === 'S' ? ref.units : units;
    return output(out, keepUnits ? UNIT[to] : NODIM, scalar);
  };
}

interface Abcd { a: C; b: C; c: C; d: C; units: boolean }

function readAbcd(v: Value, fn: string): Abcd {
  if (v.t !== 'mat' || v.rows !== 2 || v.cols !== 2) throw new EvalError('runtime', `${fn} takes a 2 × 2 ABCD matrix`);
  const at = (i: number, j: number, unit: Dim, what: string) => readIn(getEl(v, i, j), unit, fn, what);
  const a = at(0, 0, NODIM, 'A');
  const b = at(0, 1, OHM, 'B, in ohms,');
  const c = at(1, 0, SIEMENS, 'C, in siemens,');
  const d = at(1, 1, NODIM, 'D');
  return { a: a.v, b: b.v, c: c.v, d: d.v, units: b.units || c.units };
}

function abcdValue(a: C, b: C, c: C, d: C, units: boolean): Mat {
  const val = (x: C, dim: Dim): Num => num(x[0], units ? dim : NODIM, x[1]);
  return fromValues(2, 2, [val(a, NODIM), val(c, SIEMENS), val(b, OHM), val(d, NODIM)]);
}

function twoPort(v: Value, kind: Kind, fn: string): { m: CM; units: boolean } {
  const r = readMatrix(v, kind, fn);
  if (r.scalar || r.m.length !== 2) throw new EvalError('runtime', `${fn} takes a 2 × 2 matrix: ABCD matrices are for two-ports`);
  return r;
}

const det2 = (m: CM): C => csub(cmul(m[0]![0]!, m[1]![1]!), cmul(m[0]![1]!, m[1]![0]!));
const neg = (x: C): C => [-x[0], -x[1]];
const nonzero = (x: C): boolean => x[0] !== 0 || x[1] !== 0;

const abcdFns: Record<string, Impl> = {
  zToAbcd: (v) => {
    const { m, units } = twoPort(v!, 'Z', 'zToAbcd');
    const z21 = m[1]![0]!;
    if (!nonzero(z21)) throw none('zToAbcd', 'ABCD');
    return abcdValue(cdiv(m[0]![0]!, z21), cdiv(det2(m), z21), cdiv(ONE, z21), cdiv(m[1]![1]!, z21), units);
  },
  abcdToZ: (v) => {
    const { a, b, c, d, units } = readAbcd(v!, 'abcdToZ');
    if (!nonzero(c)) throw none('abcdToZ', 'Z');
    const det = csub(cmul(a, d), cmul(b, c));
    return output([[cdiv(a, c), cdiv(det, c)], [cdiv(ONE, c), cdiv(d, c)]], units ? OHM : NODIM, false);
  },
  yToAbcd: (v) => {
    const { m, units } = twoPort(v!, 'Y', 'yToAbcd');
    const y21 = m[1]![0]!;
    if (!nonzero(y21)) throw none('yToAbcd', 'ABCD');
    return abcdValue(neg(cdiv(m[1]![1]!, y21)), neg(cdiv(ONE, y21)), neg(cdiv(det2(m), y21)), neg(cdiv(m[0]![0]!, y21)), units);
  },
  abcdToY: (v) => {
    const { a, b, c, d, units } = readAbcd(v!, 'abcdToY');
    if (!nonzero(b)) throw none('abcdToY', 'Y');
    const det = csub(cmul(a, d), cmul(b, c));
    return output([[cdiv(d, b), neg(cdiv(det, b))], [neg(cdiv(ONE, b)), cdiv(a, b)]], units ? SIEMENS : NODIM, false);
  },
  sToAbcd: (v, z0arg) => {
    const { m } = twoPort(v!, 'S', 'sToAbcd');
    const { z0, units } = reference(z0arg, 'sToAbcd');
    const [s11, s12, s21, s22] = [m[0]![0]!, m[0]![1]!, m[1]![0]!, m[1]![1]!];
    if (!nonzero(s21)) throw none('sToAbcd', 'ABCD');
    const p = cmul(s12, s21);
    const two = cmul([2, 0], s21);
    const one = (x: C, sx: number): C => [1 + sx * x[0], sx * x[1]];
    const a = cdiv(cadd(cmul(one(s11, 1), one(s22, -1)), p), two);
    const b = cdiv(csub(cmul(one(s11, 1), one(s22, 1)), p), two);
    const c = cdiv(csub(cmul(one(s11, -1), one(s22, -1)), p), two);
    const d = cdiv(cadd(cmul(one(s11, -1), one(s22, 1)), p), two);
    return abcdValue(a, [b[0] * z0, b[1] * z0], [c[0] / z0, c[1] / z0], d, units);
  },
  abcdToS: (v, z0arg) => {
    const { a, b, c, d } = readAbcd(v!, 'abcdToS');
    const { z0 } = reference(z0arg, 'abcdToS');
    const bn: C = [b[0] / z0, b[1] / z0];
    const cn: C = [c[0] * z0, c[1] * z0];
    const delta = cadd(cadd(a, bn), cadd(cn, d));
    if (!nonzero(delta)) throw none('abcdToS', 'S');
    const s11 = cdiv(csub(cadd(a, bn), cadd(cn, d)), delta);
    const s12 = cdiv(cmul([2, 0], csub(cmul(a, d), cmul(b, c))), delta);
    const s21 = cdiv([2, 0], delta);
    const s22 = cdiv(csub(cadd(neg(a), bn), csub(cn, d)), delta);
    return output([[s11, s12], [s21, s22]], NODIM, false);
  },
};

/** Applies `f` to three values, element by element, with scalars extended over arrays. */
function zip3(a: Value, b: Value, c: Value, f: (x: Value, y: Value, z: Value) => Value): Value {
  const shape = [a, b, c].find((v): v is Mat => v.t === 'mat');
  if (!shape) return f(a, b, c);
  const items: Value[] = [];
  for (let n = 0; n < shape.rows * shape.cols; n++) {
    const [i, j] = [n % shape.rows, Math.floor(n / shape.rows)];
    const at = (v: Value): Value => {
      if (v.t !== 'mat') return v;
      if (v.rows !== shape.rows || v.cols !== shape.cols) throw new EvalError('runtime', 'array sizes do not match');
      return getEl(v, i, j);
    };
    items.push(f(at(a), at(b), at(c)));
  }
  return fromValues(shape.rows, shape.cols, items);
}

/** An electrical length: no units, though it may be complex for a lossy line. */
function angle(x: Value, fn: string): C {
  const t = requireNum(x, `${fn}'s electrical length`);
  if (!isNoDim(t.dim)) throw new EvalError('runtime', `${fn}'s electrical length θ = β·ℓ is an angle, in radians or degrees`);
  return pair(t);
}

/** An impedance that may be complex but not zero, as a line's characteristic impedance. */
function lineImpedance(x: Value, fn: string): { v: C; units: boolean } {
  const z = readIn(x, OHM, fn, 'characteristic impedance');
  if (!nonzero(z.v)) throw new EvalError('runtime', `${fn}'s characteristic impedance can't be 0`);
  return z;
}

const ccos = ([a, b]: C): C => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)];
const csin = ([a, b]: C): C => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)];
const J: C = [0, 1];

const lineFns: Record<string, Impl> = {
  /** The impedance looking into a line of impedance Z0 and electrical length θ, ended in ZL. */
  lineInput: (zl, z0, theta) => zip3(zl!, z0!, theta!, (zv, z0v, tv) => {
    const load = readIn(zv, OHM, 'lineInput', 'load impedance');
    const line = lineImpedance(z0v, 'lineInput');
    const t = angle(tv, 'lineInput');
    const sum = cadd(load.v, line.v);
    if (!nonzero(sum)) throw new EvalError('runtime', "lineInput: the load is the line's impedance negated, so the line has no steady state");
    // Through the reflection coefficient, which stays finite for any load: Γin = ΓL·e^(−2jθ).
    const gl = cdiv(csub(load.v, line.v), sum);
    const turn: C = [Math.exp(2 * t[1]) * Math.cos(2 * t[0]), -Math.exp(2 * t[1]) * Math.sin(2 * t[0])];
    const gin = cmul(gl, turn);
    const below: C = [1 - gin[0], -gin[1]];
    if (!nonzero(below)) throw new EvalError('runtime', 'lineInput: the input is an open circuit, so its impedance is infinite');
    const z = cmul(line.v, cdiv([1 + gin[0], gin[1]], below));
    return num(z[0], load.units || line.units ? OHM : NODIM, z[1]);
  }),
  /** The ABCD matrix of a line of impedance Z0 and electrical length θ. */
  abcdLine: (z0v, tv) => {
    const line = lineImpedance(z0v!, 'abcdLine');
    const t = angle(tv!, 'abcdLine');
    const [c, s] = [ccos(t), csin(t)];
    return abcdValue(c, cmul(J, cmul(line.v, s)), cmul(J, cdiv(s, line.v)), c, line.units);
  },
  /** The ABCD matrix of an impedance Z in series with the line. */
  abcdSeries: (zv) => {
    const z = readIn(zv!, OHM, 'abcdSeries', 'impedance');
    return abcdValue(ONE, z.v, [0, 0], ONE, z.units);
  },
  /** The ABCD matrix of an impedance Z across the line, to ground. */
  abcdShunt: (zv) => {
    const z = readIn(zv!, OHM, 'abcdShunt', 'impedance');
    if (!nonzero(z.v)) throw new EvalError('runtime', 'abcdShunt: a short across the line has no ABCD matrix');
    return abcdValue(ONE, [0, 0], cdiv(ONE, z.v), ONE, z.units);
  },
};

/** Each element of `v`, or `v` itself, through `f`. */
const each = (f: (x: Num) => Value) => {
  const g = (v: Value): Value => (v.t === 'mat' ? mapMat(v, g) : f(requireNum(v)));
  return g;
};

function gamma(x: Num, fn: string): C {
  if (!isNoDim(x.dim)) throw new EvalError('runtime', `${fn} takes a reflection coefficient Γ, which has no units: zToGamma(Z) gives Γ from an impedance`);
  return pair(x);
}

const reflectionFns: Record<string, Impl> = {
  /** The reflection coefficient of an impedance Z on a line or port of impedance Z0. */
  zToGamma: (zv, z0arg) => {
    const { z0 } = reference(z0arg, 'zToGamma');
    return each((x) => {
      const z = readIn(x, OHM, 'zToGamma', 'impedance').v;
      const sum = cadd(z, [z0, 0]);
      if (!nonzero(sum)) throw new EvalError('runtime', 'zToGamma: the impedance is −Z0, whose reflection is infinite');
      const g = cdiv(csub(z, [z0, 0]), sum);
      return num(g[0], NODIM, g[1]);
    })(zv!);
  },
  /** The impedance whose reflection coefficient on Z0 is Γ. */
  gammaToZ: (gv, z0arg) => {
    const { z0, units } = reference(z0arg, 'gammaToZ');
    return each((x) => {
      const g = gamma(x, 'gammaToZ');
      const below: C = [1 - g[0], -g[1]];
      if (!nonzero(below)) throw new EvalError('runtime', 'gammaToZ: Γ = 1 is an open circuit, whose impedance is infinite');
      const z = cdiv([z0 * (1 + g[0]), z0 * g[1]], below);
      return num(z[0], units ? OHM : NODIM, z[1]);
    })(gv!);
  },
  /** The voltage standing wave ratio, (1 + |Γ|)/(1 − |Γ|). */
  vswr: (gv) => each((x) => {
    const r = cabs(gamma(x, 'vswr'));
    if (r >= 1) throw new EvalError('runtime', 'vswr: with |Γ| of 1 or more, the standing wave ratio is infinite');
    return num((1 + r) / (1 - r));
  })(gv!),
  /** Return loss in decibels, −20·log|Γ|: positive, and larger for a better match. */
  returnLoss: (gv) => each((x) => {
    const r = cabs(gamma(x, 'returnLoss'));
    if (r === 0) throw new EvalError('runtime', 'returnLoss: a perfect match, Γ = 0, has infinite return loss');
    return num(-20 * Math.log10(r));
  })(gv!),
  /** Mismatch loss in decibels, −10·log(1 − |Γ|²): the power lost to reflection. */
  mismatchLoss: (gv) => each((x) => {
    const r = cabs(gamma(x, 'mismatchLoss'));
    if (r >= 1) throw new EvalError('runtime', 'mismatchLoss: with |Γ| of 1 or more, no power gets through');
    return num(-10 * Math.log10(1 - r * r));
  })(gv!),
};

export const rfFns: Record<string, Impl> = {
  sToZ: convert('S', 'Z', 'sToZ'), zToS: convert('Z', 'S', 'zToS'),
  sToY: convert('S', 'Y', 'sToY'), yToS: convert('Y', 'S', 'yToS'),
  zToY: convert('Z', 'Y', 'zToY'), yToZ: convert('Y', 'Z', 'yToZ'),
  ...abcdFns,
  ...lineFns,
  ...reflectionFns,
};

export const RF_ARITY: Record<string, [number, number]> = {
  sToZ: [1, 2], zToS: [1, 2], sToY: [1, 2], yToS: [1, 2], zToY: [1, 1], yToZ: [1, 1],
  zToAbcd: [1, 1], abcdToZ: [1, 1], yToAbcd: [1, 1], abcdToY: [1, 1], sToAbcd: [1, 2], abcdToS: [1, 2],
  lineInput: [3, 3], abcdLine: [2, 2], abcdSeries: [1, 1], abcdShunt: [1, 1],
  zToGamma: [1, 2], gammaToZ: [1, 2], vswr: [1, 1], returnLoss: [1, 1], mismatchLoss: [1, 1],
};
