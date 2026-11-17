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
 * The uniform polyhedra and their duals, built by Wythoff's construction (Coxeter, Longuet-Higgins and Miller,
 * "Uniform polyhedra", 1954; Har'El, "Uniform solution for uniform polyhedra", 1993), written here from the
 * mathematics.
 *
 * A Wythoff symbol names a spherical triangle PQR with angles π/p, π/q and π/r, a Schwarz triangle. Reflections
 * in its three sides generate a finite symmetry group, and the bar says where in the triangle the first vertex
 * sits: at P (p|q r), on side PQ (p q|r), inside (p q r|), or, for a snub (|p q r), where the rotations about
 * the three corners move it equally far. Every face is the turn of that vertex round a corner, and the group
 * carries one of each kind of face to all the others. A fraction such as 5/2 gives a star polygon. One
 * polyhedron, the great dirhombicosidodecahedron (|3/2 5/3 3 5/2), has no triangle: it is built from the
 * vertices of a compound of twenty octahedra, with which it shares its edges.
 */

export type Vec = [number, number, number];

/** A polyhedron as faces of vertex numbers, each face in order round its edge. */
export interface Mesh {
  /** Each vertex's x, y and z. A uniform polyhedron's lie on the unit sphere. */
  vertices: Vec[];
  faces: number[][];
  /** Which kind of face each is, an index into `kinds`. */
  kind: number[];
  /** The face kinds, as the polygon each is: "3", "4", "5/2". A dual's faces are all of one kind. */
  kinds: string[];
}

const EPS = 1e-7;
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => scale(a, 1 / norm(a));
const near = (a: Vec, b: Vec, eps = 1e-6): boolean => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;

/** A 3 × 3 matrix by rows. */
type Mat = number[];
const apply = (m: Mat, v: Vec): Vec => [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];
const mul = (a: Mat, b: Mat): Mat => {
  const out: Mat = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
  return out;
};
const det = (m: Mat): number => m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
const reflection = (n: Vec): Mat => [1 - 2 * n[0] * n[0], -2 * n[0] * n[1], -2 * n[0] * n[2], -2 * n[1] * n[0], 1 - 2 * n[1] * n[1], -2 * n[1] * n[2], -2 * n[2] * n[0], -2 * n[2] * n[1], 1 - 2 * n[2] * n[2]];
/** A turn by `angle` about the unit axis `a`. */
function rotation(a: Vec, angle: number): Mat {
  const [c, s, t] = [Math.cos(angle), Math.sin(angle), 1 - Math.cos(angle)];
  const [x, y, z] = a;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const key = (v: number[]): string => v.map((x) => (Math.abs(x) < 5e-7 ? 0 : x).toFixed(5)).join(',');

/** Every product of the generators: a finite group, or null when it grows past any polyhedron's. */
function closure(gens: Mat[]): Mat[] | null {
  const seen = new Map<string, Mat>();
  const queue: Mat[] = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
  seen.set(key(queue[0]!), queue[0]!);
  while (queue.length > 0) {
    const g = queue.pop()!;
    for (const h of gens) {
      const gh = mul(g, h);
      const k = key(gh);
      if (seen.has(k)) continue;
      if (seen.size >= 120) return null;
      seen.set(k, gh);
      queue.push(gh);
    }
  }
  return [...seen.values()];
}

/** A fraction in a Wythoff symbol: 5/2 is n = 5, d = 2. */
interface Frac { n: number; d: number }
const value = (f: Frac): number => f.n / f.d;

export interface Symbol {
  /** Where the bar is: before all three (snub), or after the first, second or third. */
  bar: 0 | 1 | 2 | 3;
  p: Frac[];
}

/** Reads a Wythoff symbol as Mathcad and Kaleido write it: "3|2 4", "2 3 5|", "|3/2 5/3 3 5/2". */
export function parseSymbol(s: string): Symbol | null {
  const m = /^([^|]*)\|([^|]*)$/.exec(s);
  if (!m) return null;
  const frac = (t: string): Frac | null => {
    const g = /^(\d+)(?:\/(\d+))?$/.exec(t);
    if (!g) return null;
    const f = { n: Number(g[1]), d: g[2] ? Number(g[2]) : 1 };
    return f.n >= 2 && f.d >= 1 && f.d < f.n ? f : null;
  };
  const words = (t: string): string[] => (t.trim() === '' ? [] : t.trim().split(/\s+/));
  const [before, after] = [words(m[1]!), words(m[2]!)];
  const all = [...before, ...after].map(frac);
  if (all.some((f) => !f)) return null;
  const p = all as Frac[];
  if (p.length === 4 && before.length === 0) return { bar: 0, p };
  if (p.length !== 3) return null;
  return { bar: before.length as 0 | 1 | 2 | 3, p };
}

/** The face kind a polygon is, as n/d with d no more than n/2: {5/3} is the star {5/2} turned the other way. */
function kindOf(n: number, turns: number): string {
  let d = turns % n;
  if (d > n / 2) d = n - d;
  if (d === 0) d = 1;
  const g = gcd(n, d);
  return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`;
}
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** How many times a face winds round its centre: 1 for a polygon, 2 for {5/2}. */
function winding(pts: Vec[]): number {
  const c = scale(pts.reduce(add, [0, 0, 0] as Vec), 1 / pts.length);
  let normal = cross(sub(pts[0]!, c), sub(pts[1]!, c));
  for (let i = 1; norm(normal) < 1e-9 && i + 1 < pts.length; i++) normal = cross(sub(pts[i]!, c), sub(pts[i + 1]!, c));
  const nn = unit(normal);
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = [sub(pts[i]!, c), sub(pts[(i + 1) % pts.length]!, c)];
    total += Math.atan2(dot(cross(a, b), nn), dot(a, b));
  }
  return Math.round(Math.abs(total) / (2 * Math.PI));
}

/** Builds the polyhedron a Wythoff symbol names. Throws on a symbol that names none. */
export function wythoff(sym: Symbol): Mesh {
  if (sym.p.length === 4) return dirhombic();
  const [A, B, C] = sym.p.map((f) => Math.PI / value(f)) as [number, number, number];
  if (A + B + C <= Math.PI + EPS) throw new Error('these angles make no polyhedron');
  // The triangle's sides from its angles, by the spherical law of cosines.
  const side = (x: number, y: number, z: number): number => Math.acos(Math.max(-1, Math.min(1, (Math.cos(x) + Math.cos(y) * Math.cos(z)) / (Math.sin(y) * Math.sin(z)))));
  const [b, c] = [side(B, A, C), side(C, A, B)];
  const P: Vec = [0, 0, 1];
  const Q: Vec = [Math.sin(c), 0, Math.cos(c)];
  const R: Vec = [Math.sin(b) * Math.cos(A), Math.sin(b) * Math.sin(A), Math.cos(b)];
  // Each side's mirror, its normal pointing into the triangle.
  const inward = (n: Vec, toward: Vec): Vec => (dot(n, toward) < 0 ? scale(unit(n), -1) : unit(n));
  const nP = inward(cross(Q, R), P);
  const nQ = inward(cross(R, P), Q);
  const nR = inward(cross(P, Q), R);
  const [mP, mQ, mR] = [reflection(nP), reflection(nQ), reflection(nR)];
  const group = closure([mP, mQ, mR]);
  if (!group) throw new Error('these angles make no polyhedron');
  // The first vertex.
  let v: Vec;
  const solve = (rhs: Vec): Vec => unit(solve3([nP, nQ, nR], rhs));
  if (sym.bar === 1) v = P;
  else if (sym.bar === 2) v = solve([1, 1, 0]);
  else if (sym.bar === 3) v = solve([1, 1, 1]);
  else v = snubVertex(sym.p, [mul(mQ, mR), mul(mR, mP), mul(mP, mQ)], solve([1, 1, 1]));
  const snub = sym.bar === 0;
  const G = snub ? group.filter((g) => det(g) > 0) : group;
  // One face of each kind: v turned round each corner, by the corner's two mirrors.
  const seeds: Vec[][] = [];
  const corners: [Vec, Mat, Mat, Vec, Vec][] = [[P, mQ, mR, nQ, nR], [Q, mR, mP, nR, nP], [R, mP, mQ, nP, nQ]];
  for (const [k, [X, ma, mb, na, nb]] of corners.entries()) {
    if (near(v, X)) continue;
    const turn = mul(ma, mb);
    let pts: Vec[];
    if (snub || Math.abs(dot(v, na)) < EPS || Math.abs(dot(v, nb)) < EPS) {
      pts = [v];
      for (let w = apply(turn, v); !near(w, v) && pts.length < 200; w = apply(turn, w)) pts.push(w);
    } else {
      // Round the corner: v, a·v, a·b·v, a·b·a·v…, each the last one's neighbour across the face.
      pts = [v];
      let g: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (let j = 1; j < 400; j++) {
        g = mul(g, j % 2 === 1 ? ma : mb);
        const w = apply(g, v);
        if (near(w, v)) break;
        pts.push(w);
      }
      // A corner of 3/2 makes {6/2}, a triangle traced twice, which closes after three: not a face.
      if (pts.length !== 2 * sym.p[k]!.n) continue;
    }
    if (pts.length >= 3) seeds.push(pts);
  }
  if (snub) {
    const [rP, rQ] = [mul(mQ, mR), mul(mR, mP)];
    seeds.push([v, apply(rP, v), apply(rP, apply(rQ, v))]);
  }
  // Upright: the axis it turns about most often goes up the page, as a cube stands on a face and a prism on its end.
  const most = [0, 1, 2].reduce((best, k) => (sym.p[k]!.n > sym.p[best]!.n ? k : best), 0);
  return upright(assemble(G, v, seeds), [P, Q, R][most]!);
}

/** Turns a mesh so that `axis` points up, along z. */
function upright(m: Mesh, axis: Vec): Mesh {
  const a = unit(axis);
  const up: Vec = [0, 0, 1];
  const c = dot(a, up);
  if (c > 1 - 1e-12) return m;
  const turn = c < -1 + 1e-12 ? rotation([1, 0, 0], Math.PI) : rotation(unit(cross(a, up)), Math.acos(c));
  return { ...m, vertices: m.vertices.map((v) => apply(turn, v)) };
}

/** Solves the 3 × 3 system with rows `rows`. */
function solve3(rows: [Vec, Vec, Vec], rhs: Vec): Vec {
  const [a, b, c] = rows;
  const d = dot(a, cross(b, c));
  const x = scale(add(add(scale(cross(b, c), rhs[0]), scale(cross(c, a), rhs[1])), scale(cross(a, b), rhs[2])), 1 / d);
  return x;
}

/**
 * A snub's first vertex: a point the three corner turns move equally far. The equations have several roots,
 * the same for |5/2 3 3 as for |3/2 3/2 5/2, so each is found, by Newton's method from many starting points, and
 * the one kept is the one whose faces turn the way the symbol says. Round the vertex, each corner's polygon goes
 * against the snub triangle for a corner over 2 (3, 5/2) and with it for one under 2 (3/2, 5/3), all the other way
 * round in a retrosnub, with two corners under 2. That is the root Kaleido gives for each of the 14 snubs.
 */
function snubVertex(p: Frac[], turns: [Mat, Mat, Mat], start: Vec): Vec {
  const retro = p.filter((f) => value(f) < 2).length >= 2;
  const inverse = (m: Mat): Mat => [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
  const turnSign = (v: Vec, next: Vec, prev: Vec): number => Math.sign(dot(v, cross(sub(next, v), sub(prev, v))));
  const fits = (v: Vec): boolean => {
    const t = turnSign(v, apply(turns[0], v), apply(turns[0], apply(turns[1], v)));
    return turns.every((r, k) => {
      if (p[k]!.n === 2) return true;
      const want = (value(p[k]!) < 2 ? 1 : -1) * (retro ? -1 : 1);
      return turnSign(v, apply(r, v), apply(inverse(r), v)) * t === want;
    });
  };
  for (let i = 0; i < 200; i++) {
    // The triangle's centre first, then points spread evenly over the sphere.
    const u = 2 * ((i * 0.6180339887) % 1) - 1;
    const a = 2 * Math.PI * ((i * 0.7548776662) % 1);
    const from: Vec = i === 0 ? start : [Math.sqrt(1 - u * u) * Math.cos(a), Math.sqrt(1 - u * u) * Math.sin(a), u];
    const v = newton(turns, from);
    if (v && fits(v)) return v;
  }
  throw new Error('no snub vertex');
}

/** Newton's method on the sphere for a point the three turns move equally far, or null if it finds none. */
function newton([rP, rQ, rR]: [Mat, Mat, Mat], start: Vec): Vec | null {
  const moved = (r: Mat, v: Vec): number => {
    const w = sub(apply(r, v), v);
    return dot(w, w);
  };
  const f = (v: Vec): [number, number] => {
    const [dP, dQ, dR] = [moved(rP, v), moved(rQ, v), moved(rR, v)];
    return [dP - dQ, dP - dR];
  };
  let v = start;
  for (let it = 0; it < 100; it++) {
    const e1 = unit(Math.abs(v[0]) < 0.9 ? cross(v, [1, 0, 0]) : cross(v, [0, 1, 0]));
    const e2 = cross(v, e1);
    const at = (s: number, t: number): Vec => unit(add(v, add(scale(e1, s), scale(e2, t))));
    const f0 = f(v);
    if (Math.abs(f0[0]) + Math.abs(f0[1]) < 1e-15) break;
    const h = 1e-7;
    const [fs, ft] = [f(at(h, 0)), f(at(0, h))];
    const J = [(fs[0] - f0[0]) / h, (ft[0] - f0[0]) / h, (fs[1] - f0[1]) / h, (ft[1] - f0[1]) / h];
    const dt = J[0]! * J[3]! - J[1]! * J[2]!;
    if (!Number.isFinite(dt) || Math.abs(dt) < 1e-300) return null;
    const s = (-f0[0] * J[3]! + f0[1] * J[1]!) / dt;
    const t = (-f0[1] * J[0]! + f0[0] * J[2]!) / dt;
    const step = Math.hypot(s, t);
    const k = step > 0.2 ? 0.2 / step : 1;
    v = at(s * k, t * k);
  }
  const f1 = f(v);
  // A root, and not a vertex the turns leave where it is.
  return Math.abs(f1[0]) + Math.abs(f1[1]) < 1e-12 && moved(rP, v) > 1e-9 ? v : null;
}

/** Every image of the first vertex and of each seed face under the group, numbered and without repeats. */
function assemble(G: Mat[], v: Vec, seeds: Vec[][]): Mesh {
  const vertices: Vec[] = [];
  const index = new Map<string, number>();
  const id = (p: Vec): number => {
    const k = key(p);
    let n = index.get(k);
    if (n === undefined) {
      n = vertices.length;
      vertices.push(p);
      index.set(k, n);
    }
    return n;
  };
  for (const g of G) id(apply(g, v));
  const faces: number[][] = [];
  const kind: number[] = [];
  const kinds: string[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const label = kindOf(seed.length, winding(seed));
    let k = kinds.indexOf(label);
    if (k < 0) k = kinds.push(label) - 1;
    for (const g of G) {
      const f = seed.map((p) => id(apply(g, p)));
      const canon = canonical(f);
      if (seen.has(canon)) continue;
      seen.add(canon);
      faces.push(f);
      kind.push(k);
    }
  }
  return { vertices, faces, kind, kinds };
}

/** A face's cycle written from its lowest vertex, the same whichever way round and wherever it starts. */
function canonical(f: number[]): string {
  const n = f.length;
  const lo = f.indexOf(Math.min(...f));
  const fwd = Array.from({ length: n }, (_, i) => f[(lo + i) % n]!);
  const back = Array.from({ length: n }, (_, i) => f[(lo - i + n) % n]!);
  return (fwd.join(',') < back.join(',') ? fwd : back).join(',');
}

/**
 * The great dirhombicosidodecahedron, |3/2 5/3 3 5/2. Its 60 vertices and 240 edges are those of a compound of
 * twenty octahedra, each with a three-fold axis on one of the icosahedron's: a vertex 54.7° from that axis (an
 * octahedron's angle, cos = 1/√3), turned about it until it is 48.0° from a five-fold axis, the circle that a
 * pentagram with the octahedron's edge √2 goes round. Its faces: the octahedra's triangles across the
 * three-fold axes, their squares through the centre, and pentagrams about the five-fold axes.
 */
function dirhombic(): Mesh {
  // The icosahedral rotations, from the triangle (2 3 5): a three-fold axis R and a five-fold axis Q.
  const ico = wythoffGroup(2, 3, 5);
  const axis3 = ico.axes[1];
  const rotations = ico.group.filter((g) => det(g) > 0);
  // Every three-fold and five-fold axis, both ways along it.
  const axes = (a: Vec): Vec[] => {
    const out: Vec[] = [];
    for (const g of rotations) {
      const w = apply(g, a);
      if (!out.some((x) => near(x, w))) out.push(w);
    }
    return out;
  };
  const [axes3, axes5] = [axes(ico.axes[1]), axes(ico.axes[2])];
  for (const a5 of axes5) {
    const mesh = dirhombicAbout(axis3, a5, rotations, axes3, axes5);
    if (mesh) return upright(mesh, ico.axes[2]);
  }
  throw new Error('no great dirhombicosidodecahedron');
}

function dirhombicAbout(axis3: Vec, axis5: Vec, rotations: Mat[], axes3: Vec[], axes5: Vec[]): Mesh | null {
  if (Math.abs(dot(axis3, axis5)) > 1 - 1e-6) return null;
  const e1 = unit(cross(axis3, axis5));
  const e2 = cross(axis3, e1);
  const [ca, sa] = [1 / Math.sqrt(3), Math.sqrt(2 / 3)];
  const at = (t: number): Vec => add(scale(axis3, ca), scale(add(scale(e1, Math.cos(t)), scale(e2, Math.sin(t))), sa));
  // The pentagram's circle: its edge √2 is the chord across two fifths of the circle round the five-fold axis.
  const target = Math.asin(Math.SQRT2 / (2 * Math.sin((2 * Math.PI) / 5)));
  const fn = (t: number): number => Math.acos(Math.max(-1, Math.min(1, dot(at(t), axis5)))) - target;
  const N = 720;
  for (let k = 0; k < N; k++) {
    let [lo, hi] = [(2 * Math.PI * k) / N, (2 * Math.PI * (k + 1)) / N];
    if (fn(lo) * fn(hi) > 0) continue;
    for (let it = 0; it < 80; it++) {
      const mid = (lo + hi) / 2;
      if (fn(lo) * fn(mid) <= 0) hi = mid;
      else lo = mid;
    }
    const mesh = dirhombicFrom(at((lo + hi) / 2), rotations, axes3, axes5, target);
    if (mesh) return mesh;
  }
  return null;
}

/**
 * The faces round a candidate first vertex's 60 images, found by where they lie: a triangle of points 54.7° from
 * a three-fold axis, a pentagram of points 48.0° from a five-fold axis, and a square through the centre on any
 * two points at right angles. Null unless it makes the polyhedron's 40 triangles, 24 pentagrams and 60 squares.
 */
function dirhombicFrom(v: Vec, rotations: Mat[], axes3: Vec[], axes5: Vec[], target: number): Mesh | null {
  const vertices: Vec[] = [];
  const seenV = new Set<string>();
  for (const g of rotations) {
    const w = apply(g, v);
    const k = key(w);
    if (!seenV.has(k)) {
      seenV.add(k);
      vertices.push(w);
    }
  }
  if (vertices.length !== 60) return null;
  const faces: number[][] = [];
  const kind: number[] = [];
  const ring = (axis: Vec, angle: number, n: number, step: number, k: number): boolean => {
    const on = vertices.map((w, i) => [w, i] as const).filter(([w]) => Math.abs(Math.acos(Math.max(-1, Math.min(1, dot(w, axis)))) - angle) < 1e-6);
    if (on.length % n !== 0) return false;
    // Round the axis by angle, then every step-th point: {5/2} takes every second.
    const e1 = unit(Math.abs(axis[0]) < 0.9 ? cross(axis, [1, 0, 0]) : cross(axis, [0, 1, 0]));
    const e2 = cross(axis, e1);
    // Points a turn of 2π/n apart go round one face; two faces can share a ring.
    const az = on.map(([w, i]) => [Math.atan2(dot(w, e2), dot(w, e1)), i] as const).sort((x, y) => x[0] - y[0]);
    const used = new Set<number>();
    for (const [a0, i0] of az) {
      if (used.has(i0)) continue;
      const round: number[] = [];
      for (let j = 0; j < n; j++) {
        const want = a0 + (2 * Math.PI * j) / n;
        const hit = az.find(([a]) => Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want))) < 1e-6);
        if (!hit) return false;
        round.push(hit[1]);
        used.add(hit[1]);
      }
      faces.push(Array.from({ length: n }, (_, j) => round[(j * step) % n]!));
      kind.push(k);
    }
    return true;
  };
  const acosR = Math.acos(1 / Math.sqrt(3));
  if (!axes3.every((a) => ring(a, acosR, 3, 1, 0)) || !axes5.every((a) => ring(a, target, 5, 2, 2))) return null;
  const seenS = new Set<string>();
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 60; j++) {
      if (Math.abs(dot(vertices[i]!, vertices[j]!)) > 1e-9) continue;
      const mi = vertices.findIndex((w) => near(w, scale(vertices[i]!, -1)));
      const mj = vertices.findIndex((w) => near(w, scale(vertices[j]!, -1)));
      if (mi < 0 || mj < 0) return null;
      const f = [i, j, mi, mj];
      const c = canonical(f);
      if (seenS.has(c)) continue;
      seenS.add(c);
      faces.push(f);
      kind.push(1);
    }
  }
  const count = (k: number): number => kind.filter((x) => x === k).length;
  if (count(0) !== 40 || count(1) !== 60 || count(2) !== 24) return null;
  return { vertices, faces, kind, kinds: ['3', '4', '5/2'] };
}

/** The group a Schwarz triangle's mirrors make, and the triangle's corners. */
function wythoffGroup(p: number, q: number, r: number): { group: Mat[]; axes: [Vec, Vec, Vec] } {
  const [A, B, C] = [Math.PI / p, Math.PI / q, Math.PI / r];
  const side = (x: number, y: number, z: number): number => Math.acos((Math.cos(x) + Math.cos(y) * Math.cos(z)) / (Math.sin(y) * Math.sin(z)));
  const [b, c] = [side(B, A, C), side(C, A, B)];
  const P: Vec = [0, 0, 1];
  const Q: Vec = [Math.sin(c), 0, Math.cos(c)];
  const R: Vec = [Math.sin(b) * Math.cos(A), Math.sin(b) * Math.sin(A), Math.cos(b)];
  const group = closure([reflection(unit(cross(Q, R))), reflection(unit(cross(R, P))), reflection(unit(cross(P, Q)))])!;
  return { group, axes: [P, Q, R] };
}

/**
 * The dual: a vertex for each face, at the pole of the face's plane in the sphere through the edges' midpoints,
 * and a face for each vertex, through the poles of the faces round it in turn. A face through the centre has its
 * pole at infinity, so the dual faces there run out to infinity along the face's normal; they're cut off `far`
 * from the centre, each side going outward, so they draw as flat-ended spikes, as Mathcad draws them.
 */
export function dual(m: Mesh, far = 3): Mesh {
  // Midsphere radius: the distance to any edge's midpoint.
  const f0 = m.faces[0]!;
  const mid = scale(add(m.vertices[f0[0]!]!, m.vertices[f0[1]!]!), 0.5);
  const rho2 = dot(mid, mid);
  const centres = m.faces.map((f) => scale(f.map((i) => m.vertices[i]!).reduce(add, [0, 0, 0] as Vec), 1 / f.length));
  const pole: (Vec | null)[] = centres.map((c) => {
    const h = norm(c);
    return h < 1e-6 ? null : scale(c, rho2 / (h * h));
  });
  const normal = (k: number): Vec => {
    const pts = m.faces[k]!.map((i) => m.vertices[i]!);
    for (let i = 0; i + 2 < pts.length; i++) {
      const n = cross(sub(pts[i + 1]!, pts[i]!), sub(pts[i + 2]!, pts[i]!));
      if (norm(n) > 1e-9) return unit(n);
    }
    return [0, 0, 1];
  };
  // The faces round each vertex, in order: each shares an edge through the vertex with the next.
  const around: number[][] = m.vertices.map(() => []);
  m.faces.forEach((f, k) => f.forEach((i) => around[i]!.push(k)));
  const vertices: Vec[] = [];
  const index = new Map<string, number>();
  const id = (p: Vec): number => {
    const k = key(p);
    let n = index.get(k);
    if (n === undefined) {
      n = vertices.push(p) - 1;
      index.set(k, n);
    }
    return n;
  };
  const faces: number[][] = [];
  m.vertices.forEach((_, vi) => {
    const fs = around[vi]!;
    const neighbours = (k: number): [number, number] => {
      const f = m.faces[k]!;
      const j = f.indexOf(vi);
      return [f[(j + f.length - 1) % f.length]!, f[(j + 1) % f.length]!];
    };
    const order: number[] = [fs[0]!];
    let [, next] = neighbours(fs[0]!);
    const used = new Set(order);
    while (order.length < fs.length) {
      const k = fs.find((g) => !used.has(g) && neighbours(g).includes(next));
      if (k === undefined) break;
      order.push(k);
      used.add(k);
      const [a, b2] = neighbours(k);
      next = a === next ? b2 : a;
    }
    const pts: Vec[] = [];
    const n = order.length;
    order.forEach((k, j) => {
      const p = pole[k];
      if (p) {
        pts.push(p);
        return;
      }
      // Out to infinity from both finite neighbours the same way, away from the side they're on, cut off at `far`.
      const nn = normal(k);
      const [prev, next] = [pole[order[(j + n - 1) % n]!] ?? null, pole[order[(j + 1) % n]!] ?? null];
      const mid = prev && next ? add(prev, next) : (prev ?? next ?? ([0, 0, 0] as Vec));
      const along = dot(mid, nn) >= 0 ? 1 : -1;
      const out = (q: Vec | null): Vec | null => {
        if (!q) return null;
        const across = sub(q, scale(nn, dot(q, nn)));
        const t = Math.sqrt(Math.max(0, far * far - dot(across, across)));
        return add(across, scale(nn, along * t));
      };
      const [before, after] = [out(prev), out(next)];
      if (before) pts.push(before);
      if (after) pts.push(after);
    });
    faces.push(pts.map(id));
  });
  return { vertices, faces, kind: faces.map(() => 0), kinds: [String(m.vertices.length > 0 ? faces[0]!.length : 0)] };
}
