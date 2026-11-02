import { divE } from '../engine/ops.js';
import { storedUnit } from '../engine/units.js';
import {
  type Dim, EvalError, type Mat, NODIM, type Value, dimEq, dimMul, dimPow, getEl,
} from '../engine/values.js';
import type { StoredResult, StoredValue } from '../model/ast.js';

export type Verdict = { ok: true } | { ok: false; reason: string };

const pass: Verdict = { ok: true };
const fail = (reason: string): Verdict => ({ ok: false, reason });

function close(a: number, b: number, tol: number, scale: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), scale);
}

function largest(s: StoredValue): number {
  if (s.k === 'num') return Math.hypot(s.re, s.im);
  if (s.k === 'mat') return s.items.reduce((m, x) => Math.max(m, largest(x)), 0);
  return 0;
}

interface Scale { factor: number; offset: number; dim: Dim; tol: number; size: number }

function compareValue(v: Value, s: StoredValue, u: Scale): Verdict {
  if (s.k === 'str') return v.t === 'str' && v.v === s.v ? pass : fail('string differs');
  if (s.k === 'mat') {
    if (v.t === 'num' && s.rows === 1 && s.cols === 1) return compareValue(v, s.items[0]!, u);
    if (v.t !== 'mat') return fail(`expected ${s.rows}x${s.cols} array, got ${v.t}`);
    const m: Mat = v;
    if (m.rows !== s.rows || m.cols !== s.cols) return fail(`size ${m.rows}x${m.cols}, expected ${s.rows}x${s.cols}`);
    for (let n = 0; n < s.items.length; n++) {
      const r = compareValue(getEl(m, n % m.rows, Math.floor(n / m.rows)), s.items[n]!, u);
      if (!r.ok) return fail(`element ${n}: ${r.reason}`);
    }
    return pass;
  }
  if (v.t === 'mat' && v.rows === 1 && v.cols === 1) return compareValue(getEl(v, 0, 0), s, u);
  if (v.t !== 'num') return fail(`expected number, got ${v.t}`);
  if (!dimEq(v.dim, u.dim)) return fail(`units differ: [${v.dim.join(',')}] vs [${u.dim.join(',')}]`);
  const [re, im] = [(v.re - u.offset) / u.factor, v.im / u.factor];
  if (!close(re, s.re, u.tol, u.size) || !close(im, s.im, u.tol, u.size)) return fail(`got ${re}, stored ${s.re}`);
  return pass;
}

/** Compare a computed value with a stored one, in the stored display units. */
export function compareResult(value: Value, stored: StoredResult, tol: number, override?: Value): Verdict {
  const shown = override && stored.units.length === 0 && override.t === 'num' ? divE(value, override) : value;
  let factor = 1;
  let offset = 0;
  let dim: Dim = NODIM;
  for (const { unit, power } of stored.units) {
    const u = storedUnit(unit);
    if (!u) throw new EvalError('unsupported', `stored unit ${unit}`);
    factor *= u.factor ** power;
    offset = u.offset ?? 0;
    dim = dimMul(dim, dimPow(u.dim, power));
  }
  return compareValue(shown, stored.value, { factor, offset, dim, tol, size: largest(stored.value) });
}
