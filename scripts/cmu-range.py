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

"""Prints the unicode-range for the CMU Serif faces in src/ui/fonts.css.

Usage: python scripts/cmu-range.py  (needs fontTools and brotli, to read the woff2 files).  CMU Serif draws what
KaTeX_Main lacks in any of its four styles, the degree sign, and all of Greek and Cyrillic that CMU Serif has.
"""
from fontTools.ttLib import TTFont

CMU = ['cmunrm', 'cmunbx', 'cmunti', 'cmunbi']
KATEX = ['Regular', 'Bold', 'Italic', 'BoldItalic']
WHOLE = [(0x370, 0x3FF), (0x1F00, 0x1FFF), (0x400, 0x4FF), (0x500, 0x52F)]

cmu = set()
for f in CMU:
    cmu |= set(TTFont(f'src/fonts/cmu/{f}.otf').getBestCmap())
katex = set.intersection(*(set(TTFont(f'node_modules/mathlive/fonts/KaTeX_Main-{s}.woff2').getBestCmap()) for s in KATEX))
want = (cmu - katex) | {0xB0}
for a, b in WHOLE:
    want |= set(range(a, b + 1)) & cmu

cps = sorted(want)
out = []
i = 0
while i < len(cps):
    j = i
    while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
        j += 1
    out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
    i = j + 1
print(', '.join(out))
