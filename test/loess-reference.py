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

"""Rewrites test/loess-reference.json: what scikit-misc's loess (the same netlib C and Fortran as the port) gives.

Usage: python test/loess-reference.py  (needs numpy and scikit-misc).  Each case is made from a seed, so the test
regenerates the same data with the same little generator (mulberry32 and a few plain arithmetic operations) and only
the answers are stored: the residual scale s, delta 1 and delta 2 (null where dloess's formulas give NaN, which happens when the trace comes
out near n), the trace of the hat matrix, the fitted values at
a sample of the points, and predictions at interior points.  A case scikit-misc refuses (a span too small for the
points, or for the statistics' formulas), or accepts with a trace of n (an interpolating fit, whose statistics are rounding
noise), is stored as a refusal, because the port must refuse the same ones.
scikit-misc turns the Fortran warnings into errors. The reference does the same for the trace and k-d tree warnings, but, as probed,
not for the pseudoinverse (singular local fit) warning, so cases scikit-misc stops on for that reason are left out.
scikit-misc will not take a span above 1, so spans stop there (the probes cover 2 and 5).

scikit-misc is built from the netlib source as it is now, whose cut rule (for equal x values) differs from the reference's, so
the test sets the port's cutRule to 'netlib-2006' (and doubleG1 from 500 points) to compare with it; the probes cover the
reference's own rule.

Case data: x columns are 10 * U1 (cut down to quarters when "ties" is set, so many values repeat), y is a smooth
function of the columns plus noise 0.3 * (U2 - 0.5), all from one mulberry32 stream seeded by the case.
"""
import json
import math
import os

import numpy as np
from skmisc.loess import loess


def mulberry32(a):
    state = [a & 0xFFFFFFFF]

    def next_():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = state[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return next_


def make(seed, d, n, ties):
    rnd = mulberry32(seed)
    cols = []
    for _ in range(d):
        c = []
        for _ in range(n):
            x = 10 * rnd()
            if ties:
                x = math.floor(x * 4) / 4
            c.append(x)
        cols.append(c)
    ys = []
    for i in range(n):
        s = 0.0
        for j in range(d):
            s += math.sin(cols[j][i] * (j + 1) * 0.5) + 0.05 * cols[j][i] ** 2 / (j + 1)
        ys.append(s + 0.3 * (rnd() - 0.5))
    return cols, ys


def cases():
    out = []
    seed = 1000
    ns = {1: [10, 12, 20, 40, 100, 250, 499, 500, 600, 700], 2: [20, 36, 60, 150, 400, 520], 3: [25, 40, 90, 200, 350], 4: [40, 80, 150]}
    spans = [0.3, 0.45, 0.6, 0.75, 1.0]
    for d, lst in ns.items():
        for n in lst:
            for k, span in enumerate(spans):
                for ties in (False, True) if (n <= 250 and k % 2 == 0) else (False,):
                    seed += 1
                    out.append({'seed': seed, 'd': d, 'n': n, 'span': span, 'ties': ties})
    return out


def finite(v):
    """A number, or None where it is not finite (JSON has no NaN)."""
    v = float(v)
    return v if math.isfinite(v) else None


def run(c):
    cols, ys = make(c['seed'], c['d'], c['n'], c['ties'])
    n, d = c['n'], c['d']
    rec = dict(c)
    try:
        # scikit-misc reads its x buffer column by column whatever the array's shape says, so hand it the columns end to end.
        l = loess(np.array(cols).reshape(c['n'], c['d']), np.array(ys), span=c['span'], degree=2, family='gaussian', normalize=True)
        l.fit()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if 'singularit' in msg or 'reciprocal condition' in msg or 'pseudoinverse' in msg:
            # dloess only warns about a singular local fit and carries on; scikit-misc turns that into an error, so there are
            # no values to compare, and the case is left out.
            return None
        rec['refused'] = msg
        return rec
    o = l.outputs
    if float(o.trace_hat) > n * (1 - 1e-9):
        # The fit interpolates (the trace is n): the statistics are rounding noise either side of n. The port refuses these.
        rec['refused'] = 'trace at n'
        return rec
    step = max(1, n // 12)
    idx = list(range(0, n, step))
    rec['index'] = idx
    rec['fitted'] = [float(o.fitted_values[i]) for i in idx]
    rec['s'] = finite(o.residual_scale)
    rec['one_delta'] = finite(o.one_delta)
    rec['two_delta'] = finite(o.two_delta)
    rec['trace'] = finite(o.trace_hat)
    rec['divisor'] = [float(v) for v in o.divisor[:d]]
    # Predictions at interior points: the data's own rows shifted a little toward the middle of each column.
    rows = []
    pts = []
    for i in idx[:5]:
        p = [cols[j][i] * 0.97 + 0.15 * float(np.mean(cols[j])) for j in range(d)]
        # Keep the point inside every column's data range, as interp requires.
        if all(min(cols[j]) <= p[j] <= max(cols[j]) for j in range(d)):
            pts.append(p)
    if pts:
        rec['points'] = pts
        # One at a time: where dloess refuses a point (a null) the port has to refuse it too.
        pred = []
        for p in pts:
            try:
                pred.append(float(l.predict(np.array([p])).values[0]))
            except Exception:  # noqa: BLE001
                pred.append(None)
        rec['predicted'] = pred
    return rec


if __name__ == '__main__':
    result = [r for r in (run(c) for c in cases()) if r is not None]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'loess-reference.json')
    with open(path, 'w') as f:
        json.dump(result, f, separators=(',', ':'))
    print(len(result), 'cases,', sum('refused' in r for r in result), 'refused')
