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

"""Writes test/symfns-reference.json: mpmath's values (30 digits, rounded to doubles) of Mathcad's symbolic-only
functions, over a wide spread of arguments, in Mathcad's conventions.

Usage: python test/symfns-reference.py  (needs mpmath).  dilog(x) is Li2(1 - x), and below x = 0, where 1 - x > 1,
its imaginary part is -pi*ln(1 - x), the sign Mathcad 14 gives (probed: dilog(-1)); Ei(n, x) is E_n(x); Psi(n, x) is
the polygamma function; LambertW(n, x) is on branch n, and a complex x is written [re, im].
"""
import json
import math
from pathlib import Path

import mpmath as mp

mp.mp.dps = 30
out = []


def add(f, args, v):
    v = mp.mpc(v)
    if math.isfinite(float(v.real)) and math.isfinite(float(v.imag)):
        out.append([f, args, float(v.real), float(v.imag)])


xs = [1e-8, 1e-3, 0.1, 0.5, 1, 1.4, 1.6, 2, 2.1, 3, 5, 10, 20, 39, 41, 50, 100, 300, 700, 1e4]
for x in xs:
    for s in (1, -1):
        X = s * x
        add('Si', [X], mp.si(X))
        add('Shi', [X], mp.shi(X))
        add('FresnelS', [X], mp.fresnels(X))
        add('FresnelC', [X], mp.fresnelc(X))
        add('Ci', [X], mp.ci(X))
        add('Chi', [X], mp.chi(X))
        if abs(X) <= 700:
            add('Ei', [X], mp.ei(X))
    for n in (0, 1, 2, 3, 5, 10):
        add('Ei', [n, x], mp.expint(n, x))
for x in [-50, -10, -3, -1, -0.5, 0, 0.2, 0.5, 0.9, 1, 1.1, 1.5, 2, 3, 10, 100, 1e4]:
    z = 1 - x
    add('dilog', [x], mp.polylog(2, z) if z <= 1 else mp.mpc(mp.polylog(2, z).real, -mp.pi * mp.log(z)))
for s in [-21, -20.5, -7, -5.5, -3, -1.5, -0.5, 0, 0.25, 0.5, 0.75, 0.99, 1.01, 1.5, 2, 3, 4.5, 10, 30, 61, 100]:
    add('Zeta', [s], mp.zeta(s))
for x in [-10.5, -3.3, -0.5, 0.001, 0.1, 0.5, 1, 2.5, 7, 10, 19.9, 100, 1e6]:
    add('Psi', [x], mp.digamma(x))
    for n in (1, 2, 3, 5, 8):
        add('Psi', [n, x], mp.polygamma(n, x))
for x in [-0.3678, -0.36, -0.3, -0.1, -1e-5, 1e-5, 0.1, 0.5, 1, 2, 2.718, 3, 3.1, 10, 1e3, 1e10, 1e100]:
    add('LambertW', [x], mp.lambertw(x))
    for k in (-1, 1, 2, -3):
        add('LambertW', [k, x], mp.lambertw(x, k))
for z in [(-1, 0.5), (0.5, 2), (-0.3678, 0.01), (-0.3678, -0.01), (100, -100), (-5, 0), (-1, 0), (-0.5, 0), (-0.37, 0), (-0.1, -3), (2, -1e-9)]:
    for k in (0, -1, 1):
        out.append(['LambertW', [k, list(z)], *[float(t) for t in (lambda w: (w.real, w.imag))(mp.lambertw(mp.mpc(*z), k))]])

# The edges: near overflow, near ζ's zero and pole, and W at its branch point and far out.
for f, args, v in [('Shi', [710], mp.shi(710)), ('Chi', [716], mp.chi(716)), ('Ei', [716], mp.ei(716)),
                   ('Zeta', [-171], mp.zeta(-171)), ('Zeta', [-25.5], mp.zeta(-25.5)), ('Zeta', [1e-9], mp.zeta(1e-9)),
                   ('Zeta', [1 + 2**-40], mp.zeta(1 + mp.mpf(2)**-40)), ('LambertW', [1e308], mp.lambertw(mp.mpf(1e308))),
                   ('LambertW', [-1, -1e-300], mp.lambertw(mp.mpf(-1e-300), -1)), ('FresnelS', [1e200], mp.mpf(0.5))]:
    add(f, args, v)

Path(__file__).with_name('symfns-reference.json').write_text(json.dumps(out, indent=0) + '\n')
print(len(out), 'points')
