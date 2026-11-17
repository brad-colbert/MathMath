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

import { dual, type Mesh, parseSymbol, wythoff } from './wythoff.js';

/**
 * The 80 uniform polyhedra, numbered as Mathcad 14's PolyLookup numbers them (probed 2026-11-16, all 80), which is
 * the order of Har'El's list: for each, its name, its dual's name and its Wythoff symbol, spelt as Mathcad gives them.
 */
export const POLYHEDRA: readonly (readonly [name: string, dual: string, wythoff: string])[] = [
  ["pentagonal prism", "pentagonal dipyramid", "2 5|2"], // 1
  ["pentagonal antiprism", "pentagonal deltohedron", "|2 2 5"], // 2
  ["pentagrammic prism", "pentagrammic dipyramid", "2 5/2|2"], // 3
  ["pentagrammic antiprism", "pentagrammic deltohedron", "|2 2 5/2"], // 4
  ["pentagrammic crossed antiprism", "pentagrammic concave deltohedron", "|2 2 5/3"], // 5
  ["tetrahedron", "tetrahedron", "3|2 3"], // 6
  ["truncated tetrahedron", "triakistetrahedron", "2 3|3"], // 7
  ["octahemioctahedron", "octahemioctacron", "3/2 3|3"], // 8
  ["tetrahemihexahedron", "tetrahemihexacron", "3/2 3|2"], // 9
  ["octahedron", "cube", "4|2 3"], // 10
  ["cube", "octahedron", "3|2 4"], // 11
  ["cuboctahedron", "rhombic dodecahedron", "2|3 4"], // 12
  ["truncated octahedron", "tetrakishexahedron", "2 4|3"], // 13
  ["truncated cube", "triakisoctahedron", "2 3|4"], // 14
  ["rhombicuboctahedron", "deltoidal icositetrahedron", "3 4|2"], // 15
  ["truncated cuboctahedron", "disdyakisdodecahedron", "2 3 4|"], // 16
  ["snub cube", "pentagonal icositetrahedron", "|2 3 4"], // 17
  ["small cubicuboctahedron", "small hexacronic icositetrahedron", "3/2 4|4"], // 18
  ["great cubicuboctahedron", "great hexacronic icositetrahedron", "3 4|4/3"], // 19
  ["cubohemioctahedron", "hexahemioctacron", "4/3 4|3"], // 20
  ["cubitruncated cuboctahedron", "tetradyakishexahedron", "4/3 3 4|"], // 21
  ["great rhombicuboctahedron", "great deltoidal icositetrahedron", "3/2 4|2"], // 22
  ["small rhombihexahedron", "small rhombihexacron", "3/2 2 4|"], // 23
  ["stellated truncated hexahedron", "great triakisoctahedron", "2 3|4/3"], // 24
  ["great truncated cuboctahedron", "great disdyakisdodecahedron", "4/3 2 3|"], // 25
  ["great rhombihexahedron", "great rhombihexacron", "4/3 3/2 2|"], // 26
  ["icosahedron", "dodecahedron", "5|2 3"], // 27
  ["dodecahedron", "icosahedron", "3|2 5"], // 28
  ["icosidodecahedron", "rhombic triacontahedron", "2|3 5"], // 29
  ["truncated icosahedron", "pentakisdodecahedron", "2 5|3"], // 30
  ["truncated dodecahedron", "triakisicosahedron", "2 3|5"], // 31
  ["rhombicosidodecahedron", "deltoidal hexecontahedron", "3 5|2"], // 32
  ["truncated icosidodecahedron", "disdyakistriacontahedron", "2 3 5|"], // 33
  ["snub dodecahedron", "pentagonal hexecontahedron", "|2 3 5"], // 34
  ["small ditrigonal icosidodecahedron", "small triambic icosahedron", "3|5/2 3"], // 35
  ["small icosicosidodecahedron", "small icosacronic hexecontahedron", "5/2 3|3"], // 36
  ["small snub icosicosidodecahedron", "small hexagonal hexecontahedron", "|5/2 3 3"], // 37
  ["small dodecicosidodecahedron", "small dodecacronic hexecontahedron", "3/2 5|5"], // 38
  ["small stellated dodecahedron", "great dodecahedron", "5|2 5/2"], // 39
  ["great dodecahedron", "small stellated dodecahedron", "5/2|2 5"], // 40
  ["great dodecadodecahedron", "medial rhombic triacontahedron", "2|5/2 5"], // 41
  ["truncated great dodecahedron", "small stellapentakisdodecahedron", "2 5/2|5"], // 42
  ["rhombidodecadodecahedron", "medial deltoidal hexecontahedron", "5/2 5|2"], // 43
  ["small rhombidodecahedron", "small rhombidodecacron", "2 5/2 5|"], // 44
  ["snub dodecadodecahedron", "medial pentagonal hexecontahedron", "|2 5/2 5"], // 45
  ["ditrigonal dodecadodecahedron", "medial triambic icosahedron", "3|5/3 5"], // 46
  ["great ditrigonal dodecicosidodecahedron", "great ditrigonal dodecacronic hexecontahedron", "3 5|5/3"], // 47
  ["small ditrigonal dodecicosidodecahedron", "small ditrigonal dodecacronic hexecontahedron", "5/3 3|5"], // 48
  ["icosidodecadodecahedron", "medial icosacronic hexecontahedron", "5/3 5|3"], // 49
  ["icositruncated dodecadodecahedron", "tridyakisicosahedron", "5/3 3 5|"], // 50
  ["snub icosidodecadodecahedron", "medial hexagonal hexecontahedron", "|5/3 3 5"], // 51
  ["great ditrigonal icosidodecahedron", "great triambic icosahedron", "3/2|3 5"], // 52
  ["great icosicosidodecahedron", "great icosacronic hexecontahedron", "3/2 5|3"], // 53
  ["small icosihemidodecahedron", "small icosihemidodecacron", "3/2 3|5"], // 54
  ["small dodecicosahedron", "small dodecicosacron", "3/2 3 5|"], // 55
  ["small dodecahemidodecahedron", "small dodecahemidodecacron", "5/4 5|5"], // 56
  ["great stellated dodecahedron", "great icosahedron", "3|2 5/2"], // 57
  ["great icosahedron", "great stellated dodecahedron", "5/2|2 3"], // 58
  ["great icosidodecahedron", "great rhombic triacontahedron", "2|5/2 3"], // 59
  ["great truncated icosahedron", "great stellapentakisdodecahedron", "2 5/2|3"], // 60
  ["rhombicosahedron", "rhombicosacron", "2 5/2 3|"], // 61
  ["great snub icosidodecahedron", "great pentagonal hexecontahedron", "|2 5/2 3"], // 62
  ["small stellated truncated dodecahedron", "great pentakisdodekahedron", "2 5|5/3"], // 63
  ["truncated dodecadodecahedron", "medial disdyakistriacontahedron", "5/3 2 5|"], // 64
  ["inverted snub dodecadodecahedron", "medial inverted pentagonal hexecontahedron", "|5/3 2 5"], // 65
  ["great dodecicosidodecahedron", "great dodecacronic hexecontahedron", "5/2 3|5/3"], // 66
  ["small dodecahemicosahedron", "small dodecahemicosacron", "5/3 5/2|3"], // 67
  ["great dodecicosahedron", "great dodecicosacron", "5/3 5/2 3|"], // 68
  ["great snub dodecicosidodecahedron", "great hexagonal hexecontahedron", "|5/3 5/2 3"], // 69
  ["great dodecahemicosahedron", "great dodecahemicosacron", "5/4 5|3"], // 70
  ["great stellated truncated dodecahedron", "great triakisicosahedron", "2 3|5/3"], // 71
  ["great rhombicosidodecahedron", "great deltoidal hexecontahedron", "5/3 3|2"], // 72
  ["great truncated icosidodecahedron", "great disdyakistriacontahedron", "5/3 2 3|"], // 73
  ["great inverted snub icosidodecahedron", "great inverted pentagonal hexecontahedron", "|5/3 2 3"], // 74
  ["great dodecahemidodecahedron", "great dodecahemidodecacron", "5/3 5/2|5/3"], // 75
  ["great icosihemidodecahedron", "great icosihemidodecacron", "3/2 3|5/3"], // 76
  ["small retrosnub icosicosidodecahedron", "small hexagrammic hexecontahedron", "|3/2 3/2 5/2"], // 77
  ["great rhombidodecahedron", "great rhombidodecacron", "3/2 5/3 2|"], // 78
  ["great retrosnub icosidodecahedron", "great pentagrammic hexecontahedron", "|3/2 5/3 2"], // 79
  ["great dirhombicosidodecahedron", "great dirhombicosidodecacron", "|3/2 5/3 3 5/2"], // 80
];

/** A polyhedron to draw, with the name it goes by. */
export interface Polyhedron extends Mesh {
  name: string;
}

const built = new Map<string, Polyhedron>();

/**
 * The polyhedron Mathcad's Polyhedron(S) draws for S: a uniform polyhedron's name or its dual's (in any case),
 * "#n" for number n, or its Wythoff symbol written exactly as PolyLookup gives it. Null for anything else, as
 * Mathcad draws nothing for a symbol outside the 80, such as "2 7|2", or one spaced differently.
 */
export function polyhedron(s: string): Polyhedron | null {
  const lower = s.toLowerCase();
  const number = /^#\s*(\d+)$/.exec(s.trim());
  let n = number ? Number(number[1]) - 1 : POLYHEDRA.findIndex(([name, , symbol]) => name === lower || symbol === s);
  let isDual = false;
  if (n < 0 && !number) {
    n = POLYHEDRA.findIndex(([, d]) => d === lower);
    isDual = n >= 0;
  }
  const entry = POLYHEDRA[n];
  if (!entry) return null;
  const key = `${n}${isDual ? 'd' : ''}`;
  let p = built.get(key);
  if (!p) {
    const mesh = wythoff(parseSymbol(entry[2])!);
    p = { ...(isDual ? dual(mesh, 2) : mesh), name: isDual ? entry[1] : entry[0] };
    built.set(key, p);
  }
  return p;
}
