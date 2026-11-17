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
 * Solid polyhedra, whose faces may pass through each other, as star polyhedra's do. Sorting faces by depth gets
 * those wrong, and cutting them where they cross makes tens of thousands of pieces for the hardest, so they're
 * drawn into a depth buffer instead: each pixel keeps the nearest face's colour. The faces' own edges are drawn
 * over them, where nothing nearer hides them.
 */
import type { Mesh, Vec } from '../engine/wythoff.js';

/** A convex part of a face, to fill. */
export interface Piece {
  pts: Vec[];
  face: number;
  normal: Vec;
}

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);

/** A face's normal by Newell's method, or across its first corner that has one when that comes to nothing. */
function normalOf(pts: Vec[]): Vec {
  let n: Vec = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = [pts[i]!, pts[(i + 1) % pts.length]!];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  for (let i = 0; len(n) < 1e-9 && i + 2 < pts.length; i++) n = cross(sub(pts[i + 1]!, pts[i]!), sub(pts[i + 2]!, pts[i]!));
  const l = len(n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** Whether a face goes once round its centre, turning the same way at every corner. */
function convex(pts: Vec[], n: Vec): boolean {
  let sign = 0;
  let turn = 0;
  for (let i = 0; i < pts.length; i++) {
    const [a, b, c] = [pts[i]!, pts[(i + 1) % pts.length]!, pts[(i + 2) % pts.length]!];
    const [u, w] = [sub(b, a), sub(c, b)];
    const s = dot(cross(u, w), n);
    if (Math.abs(s) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(s);
    else if (Math.sign(s) !== sign) return false;
    turn += Math.atan2(Math.abs(s), dot(u, w));
  }
  return Math.abs(turn - 2 * Math.PI) < 1e-6;
}

/** A face as convex pieces: itself, or a fan of triangles from its centre, for a star or a crossed face. */
export function piecesOf(m: Mesh): Piece[] {
  const out: Piece[] = [];
  m.faces.forEach((f, face) => {
    const pts = f.map((i) => m.vertices[i]!);
    const normal = normalOf(pts);
    if (convex(pts, normal)) {
      out.push({ pts, face, normal });
      return;
    }
    const c: Vec = [0, 1, 2].map((k) => pts.reduce((t, p) => t + p[k]!, 0) / pts.length) as Vec;
    for (let i = 0; i < pts.length; i++) {
      const tri = [c, pts[i]!, pts[(i + 1) % pts.length]!];
      if (len(cross(sub(tri[1]!, tri[0]!), sub(tri[2]!, tri[0]!))) < 1e-12) continue;
      out.push({ pts: tri, face, normal });
    }
  });
  return out;
}

export interface Raster {
  width: number;
  height: number;
  /** RGBA, row by row from the top. */
  data: Uint8ClampedArray;
}

/**
 * Draws a polyhedron's faces, each in its colour lit by how squarely it faces the light (from either side, since
 * a face through the centre has no outside), and its edges in dark lines. `project` takes a point to pixels
 * across and down and a depth, larger nearer, in pixels too, so the light falls true; `lineWidth` is in pixels.
 */
export function rasterize(m: Mesh, width: number, height: number, project: (v: Vec) => [number, number, number], color: (face: number) => [number, number, number], light: Vec, lineWidth = 1): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  const depth = new Float64Array(width * height).fill(-Infinity);
  const pieces = piecesOf(m);
  // How far the shape reaches in depth, for the edges' small lead over their faces.
  let [dlo, dhi] = [Infinity, -Infinity];
  const screen = m.vertices.map((v) => project(v));
  for (const p of screen) {
    dlo = Math.min(dlo, p[2]);
    dhi = Math.max(dhi, p[2]);
  }
  const bias = (dhi - dlo || 1) * 2e-3;
  const shadeOf = new Map<number, [number, number, number]>();
  for (const piece of pieces) {
    let rgb = shadeOf.get(piece.face);
    if (!rgb) {
      // The normal as seen: project the origin and the normal's tip, and compare.
      const o = project([0, 0, 0]);
      const t = project(piece.normal);
      const nv: Vec = [t[0] - o[0], -(t[1] - o[1]), t[2] - o[2]];
      const l = len(nv) || 1;
      const lit = Math.abs(dot(nv, light)) / l;
      const k = 0.42 + 0.58 * lit;
      const [r, g, b] = color(piece.face);
      rgb = [r * k, g * k, b * k];
      shadeOf.set(piece.face, rgb);
    }
    const pts = piece.pts.map((v) => project(v));
    for (let i = 1; i + 1 < pts.length; i++) fill(pts[0]!, pts[i]!, pts[i + 1]!, rgb, width, height, data, depth);
  }
  // Each edge once, over the faces, where nothing is nearer.
  const seen = new Set<string>();
  for (const f of m.faces) {
    for (let i = 0; i < f.length; i++) {
      const [a, b] = [f[i]!, f[(i + 1) % f.length]!];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(k)) continue;
      seen.add(k);
      line(screen[a]!, screen[b]!, lineWidth, bias, width, height, data, depth);
    }
  }
  return { width, height, data };
}

function fill(a: [number, number, number], b: [number, number, number], c: [number, number, number], rgb: [number, number, number], w: number, h: number, data: Uint8ClampedArray, depth: Float64Array): void {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-12) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const wa = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const wb = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const wc = 1 - wa - wb;
      if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
      const z = wa * a[2] + wb * b[2] + wc * c[2];
      const k = y * w + x;
      if (z <= depth[k]!) continue;
      depth[k] = z;
      data[k * 4] = rgb[0];
      data[k * 4 + 1] = rgb[1];
      data[k * 4 + 2] = rgb[2];
      data[k * 4 + 3] = 255;
    }
  }
}

const INK = [26, 26, 26];

function line(a: [number, number, number], b: [number, number, number], width: number, bias: number, w: number, h: number, data: Uint8ClampedArray, depth: Float64Array): void {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
  const r = width / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const [x, y, z] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let py = Math.floor(y - r); py <= Math.floor(y + r); py++) {
      for (let px = Math.floor(x - r); px <= Math.floor(x + r); px++) {
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const k = py * w + px;
        if (z + bias < depth[k]!) continue;
        // Coverage by distance from the line's centre, for a soft edge.
        const cover = Math.max(0, Math.min(1, r + 0.5 - Math.hypot(px + 0.5 - x, py + 0.5 - y)));
        if (cover <= 0) continue;
        const o = k * 4;
        const alpha = data[o + 3]! / 255;
        for (let ch = 0; ch < 3; ch++) data[o + ch] = data[o + ch]! * (1 - cover) + INK[ch]! * cover;
        data[o + 3] = Math.max(data[o + 3]!, Math.round(255 * Math.max(alpha, cover)));
      }
    }
  }
}
