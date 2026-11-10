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

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { airy, besh, besi, besj, besk, besy, biry } from '../src/engine/amos.js';

/**
 * Reference values for the port of Amos's complex Bessel and Airy routines (test/amos-reference.json, made by
 * test/amos-reference.py): mpmath at 30 digits for the values, and the nz and ierr that SciPy's C++ build of the same
 * Amos routines returned, since mpmath cannot say when Amos flags an underflow or a loss of precision.  The grid
 * covers |z| from 1e-8 to 1e4 in every quadrant, on both axes and either side of the negative real axis; orders from
 * 0 to 1200 on both sides of the switch to the uniform asymptotic expansions (about 85.9); both scalings; sequences
 * of up to 900 members; and the Airy functions with their derivatives out to the Stokes lines.  Extra points were
 * chosen by a coverage scan (hundreds of thousands of random points) so that every branch the scan could reach is hit;
 * what it could not reach is listed in the notes on amos.ts.
 */
interface Ref {
  f: string;
  fnu: number;
  z: [number, number];
  kode: number;
  n: number;
  /** Underflow count from the C++ Amos build (absent for the Bi functions, which do not return one). */
  nz?: number;
  ierr: number;
  /** Underflow count of this port where it deliberately differs from the C++ build (see amos.ts). */
  portNz?: number;
  /** Error flag of this port where it deliberately differs from the C++ build. */
  portIerr?: number;
  /** mpmath values of the members listed in idx (all members when idx is absent); null when beyond double range. */
  ref?: ([number, number] | null)[];
  idx?: number[];
}
const CASES = (JSON.parse(readFileSync(new URL('./amos-reference.json', import.meta.url), 'utf8')) as { cases: Ref[] }).cases;

type Out = { cy: [number, number][]; nz: number; ierr: number };
function run(c: Ref): Out {
  const { f, fnu, z, kode, n } = c;
  switch (f) {
    case 'besj': return besj(z, fnu, kode, n);
    case 'besy': return besy(z, fnu, kode, n);
    case 'besi': return besi(z, fnu, kode, n);
    case 'besk': return besk(z, fnu, kode, n);
    case 'besh1': return besh(z, fnu, kode, 1, n);
    case 'besh2': return besh(z, fnu, kode, 2, n);
    case 'airy0': case 'airy1': {
      const r = airy(z, Number(f[4]), kode);
      return { cy: [r.v], nz: r.nz, ierr: r.ierr };
    }
    default: {
      const r = biry(z, Number(f[4]), kode);
      return { cy: [r.v], nz: 0, ierr: r.ierr };
    }
  }
}

/**
 * Allowed relative error (vs the modulus of the reference).  Amos is accurate to about 1e-13; the error grows with
 * the arguments of the elementary functions inside the uniform expansions, roughly like |z| times the unit roundoff,
 * and with ierr = 3 (more than half the digits may be lost) it is allowed to be much larger.
 */
const tol = (c: Ref, ierr: number): number =>
  (4e-13 + 1.2e-14 * Math.hypot(c.z[0], c.z[1])) * (ierr === 3 ? 20 : 1);

const FUNCS = ['besj', 'besy', 'besi', 'besk', 'besh1', 'besh2', 'airy0', 'airy1', 'biry0', 'biry1'];

describe('amos: agreement with mpmath and with the C++ build', () => {
  test('the reference file is large enough to mean something', () => {
    expect(CASES.length).toBeGreaterThan(1800);
    for (const f of FUNCS) expect(CASES.filter((c) => c.f === f).length, f).toBeGreaterThan(100);
  });

  for (const f of FUNCS) {
    test(`${f}: values, nz and ierr`, () => {
      const bad: string[] = [];
      for (const c of CASES.filter((x) => x.f === f)) {
        const out = run(c);
        const tag = `${f}(${c.fnu}, [${c.z}], kode ${c.kode}, n ${c.n})`;
        const wantIerr = c.portIerr ?? c.ierr;
        if (out.ierr !== wantIerr) { bad.push(`${tag}: ierr ${out.ierr}, want ${wantIerr}`); continue; }
        if (c.nz !== undefined && out.nz !== (c.portNz ?? c.nz)) bad.push(`${tag}: nz ${out.nz}, want ${c.portNz ?? c.nz}`);
        if (!c.ref || (out.ierr !== 0 && out.ierr !== 3)) continue;
        const members = c.idx ?? c.ref.map((_, i) => i);
        members.forEach((m, j) => {
          const want = c.ref![j];
          if (!want) return;
          const got = out.cy[m];
          const mag = Math.hypot(want[0], want[1]);
          // Amos flushes members below about 1e-297 to zero and counts them in nz; for a denormal z it flushes
          // everything it cannot scale.
          const flushed = got[0] === 0 && got[1] === 0 && out.nz > 0;
          if (flushed && (mag < 1e-290 || Math.hypot(c.z[0], c.z[1]) < 1e-300)) return;
          // Ai reports nz = 1 and zero when its continuation to the left half plane would overflow internally.
          if (flushed && f.startsWith('airy') && mag > 1e290) return;
          // Near a zero of an oscillating function the relative error is meaningless: measure it against the
          // smaller of the two neighbouring members when both are far larger.
          const nbMag = (d: number): number => {
            const v = c.ref![j + d];
            return v && members[j + d] === m + d ? Math.hypot(v[0], v[1]) : Infinity;
          };
          const nbMin = Math.min(nbMag(-1), nbMag(1));
          const floor = nbMin === Infinity ? 0 : 0.1 * nbMin;
          const err = Math.hypot(got[0] - want[0], got[1] - want[1]) / (Math.max(mag, floor) || 1);
          if (!(err <= tol(c, out.ierr))) bad.push(`${tag} member ${m}: relative error ${err.toExponential(2)}`);
        });
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });
  }

  test('sequences are consistent with the recurrence K(v+1) = K(v-1) + (2v/z) K(v)', () => {
    const z: [number, number] = [-3.5, 2.25];
    const { cy } = besk(z, 0.3, 1, 6);
    for (let k = 1; k < 5; k++) {
      const v = 0.3 + k;
      const rz: [number, number] = [(2 * v * z[0]) / (z[0] ** 2 + z[1] ** 2), (-2 * v * z[1]) / (z[0] ** 2 + z[1] ** 2)];
      const t: [number, number] = [rz[0] * cy[k][0] - rz[1] * cy[k][1] + cy[k - 1][0], rz[0] * cy[k][1] + rz[1] * cy[k][0] + cy[k - 1][1]];
      expect(Math.hypot(t[0] - cy[k + 1][0], t[1] - cy[k + 1][1]) / Math.hypot(...t)).toBeLessThan(1e-13);
    }
  });
});
