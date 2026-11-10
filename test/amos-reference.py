# MathMath: math on paper, in the browser.
# Copyright (C) 2026 Pelican Labs, LLC
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
# General Public License as published by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
# implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
# License for more details.
#
# You should have received a copy of the GNU Affero General Public License along with this program. If not,
# see <https://www.gnu.org/licenses/>.

"""Recomputes the mpmath values in test/amos-reference.json (30 digits).

Usage: python test/amos-reference.py  (needs mpmath).  The points themselves, and the nz / ierr that SciPy's C++ build
of Amos returned for them, are kept as they are: mpmath cannot say when Amos flags an underflow, so those came from a
local build of that C++ code and are not regenerated here.  Scalings (KODE = 2): J, Y times exp(-|Im z|); I times
exp(-|Re z|); K times exp(z); H1 times exp(-iz); H2 times exp(iz); Ai and Ai' times exp(zeta); Bi and Bi' times
exp(-|Re zeta|), zeta = (2/3) z^(3/2).
"""
import json
import multiprocessing as mp_
import os

from mpmath import airyai, airybi, besseli, besselj, besselk, bessely, exp, hankel1, hankel2, mp, mpc, mpf, sqrt

mp.dps = 30
HERE = os.path.dirname(os.path.abspath(__file__))


def one_member(f, nu, z, kode):
    if f == 'besj':
        v = besselj(nu, z) * (exp(-abs(z.imag)) if kode == 2 else 1)
    elif f == 'besy':
        v = bessely(nu, z) * (exp(-abs(z.imag)) if kode == 2 else 1)
    elif f == 'besi':
        v = besseli(nu, z) * (exp(-abs(z.real)) if kode == 2 else 1)
    elif f == 'besk':
        v = besselk(nu, z) * (exp(z) if kode == 2 else 1)
    elif f == 'besh1':
        v = hankel1(nu, z) * (exp(-1j * z) if kode == 2 else 1)
    elif f == 'besh2':
        v = hankel2(nu, z) * (exp(1j * z) if kode == 2 else 1)
    else:
        zeta = mpf(2) / 3 * z * sqrt(z)
        d = int(f[-1])
        if f.startswith('airy'):
            v = airyai(z, derivative=d) * (exp(zeta) if kode == 2 else 1)
        else:
            v = airybi(z, derivative=d) * (exp(-abs(zeta.real)) if kode == 2 else 1)
    v = mpc(v)
    if max(abs(v.real), abs(v.imag)) > mpf('1e307'):
        return None  # beyond double range
    return [float(v.real), float(v.imag)]


def refs(case):
    z = mpc(*case['z'])
    idx = case.get('idx', list(range(case['n'])))
    if case['f'][:4] in ('airy', 'biry'):
        idx = [0]
    return [one_member(case['f'], mpf(case['fnu']) + k, z, case['kode']) for k in idx]


if __name__ == '__main__':
    path = os.path.join(HERE, 'amos-reference.json')
    data = json.load(open(path))
    cases = [c for c in data['cases'] if 'ref' in c]
    with mp_.Pool() as pool:
        for c, r in zip(cases, pool.map(refs, cases, chunksize=8)):
            c['ref'] = r
    json.dump(data, open(path, 'w'), separators=(',', ':'))
