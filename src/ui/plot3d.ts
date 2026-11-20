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
 * Surface and contour plots, drawn as SVG so they print as vectors. A surface is shaded patches seen from
 * an angle the reader can drag round; a contour plot is the same heights seen from above, as lines at even
 * levels. Both color height on one blue ramp, light to dark (the dataviz palette's sequential hue), with a
 * color bar to read it by. A surface plot draws its other expressions in the same box: more surfaces, curves,
 * marked points and arrows, all back to front together, and can draw the first surface's contours on the floor.
 */
import type { PlotData, SurfaceData } from '../engine/evaluate.js';
import type { FieldData } from '../engine/vectorfield.js';
import { tex } from '../latex/latex.js';
import type { Content, TraceStyle } from '../model/ast.js';
import { mathMarkup } from './markup.js';
import { label, svgId, symbol, ticks, traceLook } from './plot.js';
import { getZoom, pointsPerPixel } from './zoom.js';
import { type MapRows, mapColor } from '../engine/colormaps.js';
import type { Polyhedron } from '../engine/polyhedra.js';
import type { Vec } from '../engine/wythoff.js';
import { rasterize } from './polyview.js';

type Plot = Extract<Content, { k: 'plot' }>;

/** The validated sequential ramp, steps 100 to 700. */
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const SECONDARY = '#52514e';
const GRID = '#e6e5e1';
const PT = 96 / 72;
export const DEFAULT_VIEW = { azimuth: -55, elevation: 28 };

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
const RGB = RAMP.map(hex);

/** How heights become colours: the plot's colour map, or MathMath's ramp when it names none. */
type Color = (t: number, from?: number) => string;

function colorOf(palette: MapRows | undefined): Color {
  if (!palette) return rampColor;
  return (t) => `rgb(${mapColor(palette, t).join(',')})`;
}

/** A color on the ramp, t from 0 (light) to 1 (dark). `from` keeps lines clear of the page. */
export function rampColor(t: number, from = 0): string {
  const u = from + (1 - from) * Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const k = u * (RGB.length - 1);
  const i = Math.min(RGB.length - 2, Math.floor(k));
  const f = k - i;
  const [a, b] = [RGB[i]!, RGB[i + 1]!];
  return `rgb(${a.map((v, n) => Math.round(v + (b[n]! - v) * f)).join(',')})`;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
function markup(latex: string): string {
  try {
    return mathMarkup(latex);
  } catch {
    return esc(latex);
  }
}
const slot = (name: string, html: string, style: string, hint: string): string =>
  `<div class="slot${html ? '' : ' empty'}" data-slot="${name}" title="${hint}" style="${style}">${html || '&#9632;'}</div>`;

const range = (a: Float64Array): [number, number] => {
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of a) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
};

/** Keeps at most `limit` points along each side, so a large matrix stays quick to draw. */
function thinned(s: SurfaceData, limit = 48): SurfaceData {
  const [si, sj] = [Math.ceil(s.rows / limit), Math.ceil(s.cols / limit)];
  if (si === 1 && sj === 1) return s;
  const rows = Math.ceil(s.rows / si);
  const cols = Math.ceil(s.cols / sj);
  const pick = (a: Float64Array): Float64Array => {
    const out = new Float64Array(rows * cols);
    for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) out[i + j * rows] = a[Math.min(s.rows - 1, i * si) + Math.min(s.cols - 1, j * sj) * s.rows]!;
    return out;
  };
  return { ...s, rows, cols, x: pick(s.x), y: pick(s.y), z: pick(s.z) };
}

/** The color bar at the right: the ramp and round values along it. The unit goes above, in `slots`. */
function colorBar(x: number, top: number, height: number, lo: number, hi: number, id: string, from = 0, color: Color = rampColor, many = false): string {
  // A map of many colours needs many stops to show them all; the ramp keeps its nine.
  const n = many ? 32 : 8;
  const stops = Array.from({ length: n + 1 }, (_, k) => `<stop offset="${k / n}" stop-color="${color(1 - k / n, from)}"/>`).join('');
  const parts = [
    `<defs><linearGradient id="bar-${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>`,
    `<rect x="${x}" y="${top}" width="8" height="${height}" fill="url(#bar-${id})" stroke="${SECONDARY}" stroke-width="0.5"/>`,
  ];
  // Round values along the bar, or its two ends when the range is too narrow for them.
  const marks = hi > lo ? ticks({ lo, hi, log: false }, 4).filter((v) => v >= lo && v <= hi) : [lo];
  for (const v of marks.length >= 2 ? marks : [lo, hi]) {
    const y = hi > lo ? top + ((hi - v) / (hi - lo)) * height : top + height / 2;
    parts.push(`<line x1="${x + 8}" x2="${x + 10}" y1="${y}" y2="${y}" stroke="${SECONDARY}" stroke-width="0.5"/>`);
    parts.push(`<text x="${x + 12}" y="${y + 2.8}" fill="${SECONDARY}">${esc(label(v))}</text>`);
  }
  return parts.join('');
}

/** Margins: room for the expression below, a title above, and the color bar at the right. */
function frame(c: Plot): { area: { x: number; y: number; w: number; h: number }; titled: boolean } {
  const titled = c.title !== undefined;
  const top = 8 + (titled ? 13 : 0);
  return { area: { x: 34, y: top, w: Math.max(40, c.width - 34 - 60), h: Math.max(40, c.height - top - 52) }, titled };
}

/** The expression slot, the x and y limits used to sample a function, and a title if it's on. */
function slots(c: Plot, data: PlotData | undefined, area: { x: number; y: number; w: number; h: number }): string {
  const lim = (e: Plot['xAxis']['min'], auto: number): string => (e ? markup(tex(e)) : `<span class="auto">${auto}</span>`);
  const below = area.y + area.h;
  const unit = data?.zLabel ? `<div class="zunit" style="left:${area.x + area.w + 4}pt;top:${area.y - 12}pt">${markup(data.zLabel)}</div>` : '';
  return [
    // Every expression, as typed: a vector field can take two or six.
    slot('ys', c.ys.length ? `<span>${c.ys.map((e) => markup(tex(e))).join(', ')}</span>` : '', `left:${area.x}pt;width:${area.w}pt;top:${below + 24}pt;justify-content:center;align-items:center`,
      c.view === 'vector'
        ? 'What to plot: a matrix of complex numbers, two matrices X, Y of the arrows\' parts, a function of x and y giving two parts, or six arrays X, Y, Z, U, V, W for arrows in space'
        : 'What to plot: a matrix of heights, a function of two variables, three matrices X, Y and Z in a vector, as CreateMesh gives, three vectors for a curve, as CreateSpace gives, or a polyhedron, as Polyhedron gives'),
    // The limits apply only to a function, so they're left out once the plot is known to show matrices.
    data?.poly || (data?.surface && !data.surface.sampled) || (data?.field && !data.field.sampled) ? '' : [
      `<div class="ranges" style="left:${area.x}pt;width:${area.w}pt;top:${below + 38}pt" title="Where a function of two variables is sampled">x `,
      slot('xmin', lim(c.xAxis.min, -5), 'position:static;display:inline-flex', 'Lowest x a function is sampled at'),
      ' to ', slot('xmax', lim(c.xAxis.max, 5), 'position:static;display:inline-flex', 'Highest x a function is sampled at'),
      ', y ', slot('ymin', lim(c.yAxis.min, -5), 'position:static;display:inline-flex', 'Lowest y a function is sampled at'),
      ' to ', slot('ymax', lim(c.yAxis.max, 5), 'position:static;display:inline-flex', 'Highest y a function is sampled at'),
      '</div>',
    ].join(''),
    unit,
    c.title !== undefined ? slot('title', esc(c.title), `left:${area.x}pt;width:${area.w}pt;top:0;height:13pt`, 'Plot title. Click to type it; Format turns it off') : '',
    '<div class="readout" hidden></div>',
  ].join('');
}

/** Drawn when there's nothing to plot yet, or the data can't be plotted. */
function empty(el: HTMLElement, c: Plot, data: PlotData | undefined, message: string | undefined): void {
  const { area } = frame(c);
  el.innerHTML = `<svg class="plot-svg" width="${c.width}pt" height="${c.height}pt" viewBox="0 0 ${c.width} ${c.height}" font-family="system-ui, sans-serif" font-size="8">`
    + `<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="${GRID}" stroke-width="0.75"/>`
    + (message ? `<text class="plot-problem" x="${area.x + area.w / 2}" y="${area.y + area.h / 2}" text-anchor="middle" fill="#c00">${esc(message)}</text>` : '')
    + `</svg>${slots(c, data, area)}`;
  el.style.width = `${c.width}pt`;
  el.style.height = `${c.height}pt`;
}

export function drawSurface(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined, palette?: MapRows): void {
  if (data?.poly && !problem) {
    drawPolyhedron(el, c, data, data.poly, palette);
    return;
  }
  const rampColor = colorOf(palette);
  const s0 = data?.surface;
  if (!s0 || problem) {
    empty(el, c, data, problem ?? (c.ys.length ? undefined : undefined));
    return;
  }
  // A curve, one point wide, keeps more of its points than a surface needs.
  const isCurve = (t: SurfaceData): boolean => t.rows === 1 || t.cols === 1;
  const fewer = (t: SurfaceData): SurfaceData => thinned(t, isCurve(t) ? 600 : 48);
  const s = fewer(s0);
  // What the second expression on draw over the first, in the same box: surfaces, curves, points and arrows.
  const layers = (data.layers ?? []).map((l) => (l.surface ? { ...l, surface: fewer(l.surface) } : l));
  const { area } = frame(c);
  // The box holds everything drawn, each axis to its own scale; colors go by the heights of the surfaces and curves.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const grow = (...p: number[]): void => p.forEach((v, a) => {
    if (Number.isFinite(v)) [lo[a], hi[a]] = [Math.min(lo[a]!, v), Math.max(hi[a]!, v)];
  });
  const grids = [s, ...layers.flatMap((l) => (l.surface ? [l.surface] : []))];
  for (const t of grids) for (let k = 0; k < t.rows * t.cols; k++) grow(t.x[k]!, t.y[k]!, t.z[k]!);
  const [z0, z1] = Number.isFinite(lo[2]!) ? [lo[2]!, hi[2]!] : [0, 0];
  const tipOf = (f: FieldData, k: number): [number, number, number] => [f.x[k]! + f.u[k]! * f.scale, f.y[k]! + f.v[k]! * f.scale, f.z[k]! + f.w[k]! * f.scale];
  for (const l of layers) {
    if (!l.field) continue;
    for (let k = 0; k < l.field.x.length; k++) {
      grow(l.field.x[k]!, l.field.y[k]!, l.field.z[k]!);
      grow(...tipOf(l.field, k));
    }
  }
  const [[x0, x1], [y0, y1], [bottom, b1]] = [0, 1, 2].map((a) => (Number.isFinite(lo[a]!) ? [lo[a]!, hi[a]!] : [0, 0]));
  // Contours on the floor need the floor clear of the surface, so the box reaches down below it.
  const floored = c.floorContours === true && s0.regular && !isCurve(s0);
  const b0 = floored && b1! > bottom! ? bottom! - 0.75 * (b1! - bottom!) : bottom!;
  const nx = (v: number): number => (x1! > x0! ? ((v - x0!) / (x1! - x0!)) * 2 - 1 : 0);
  const ny = (v: number): number => (y1! > y0! ? ((v - y0!) / (y1! - y0!)) * 2 - 1 : 0);
  const nz = (v: number): number => (b1! > b0! ? ((v - b0!) / (b1! - b0!)) * 1.4 - 0.7 : 0);
  const shade = (z: number): number => (z1 > z0 ? (z - z0) / (z1 - z0) : 0.5);
  const view = c.view3d ?? DEFAULT_VIEW;
  const [a, e] = [(view.azimuth * Math.PI) / 180, (view.elevation * Math.PI) / 180];
  const [ca, sa, ce, se] = [Math.cos(a), Math.sin(a), Math.cos(e), Math.sin(e)];
  // Seen from the angle: across the screen, up the screen, and towards the reader.
  const project = (px: number, py: number, pz: number): [number, number, number] => {
    const x1r = px * ca - py * sa;
    const y1r = px * sa + py * ca;
    return [x1r, pz * ce + y1r * se, -y1r * ce + pz * se];
  };
  const corners = [-1, 1].flatMap((px) => [-1, 1].flatMap((py) => [-0.7, 0.7].map((pz) => project(px, py, pz))));
  const [bx0, bx1] = [Math.min(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[0]))];
  const [by0, by1] = [Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[1]))];
  const scale = Math.min(area.w / (bx1 - bx0), area.h / (by1 - by0)) * 0.92;
  const [ox, oy] = [area.x + area.w / 2 - ((bx0 + bx1) / 2) * scale, area.y + area.h / 2 + ((by0 + by1) / 2) * scale];
  const screen = (p: [number, number, number]): [number, number] => [ox + p[0] * scale, oy - p[1] * scale];
  const at = (x: number, y: number, z: number): [number, number, number] => project(nx(x), ny(y), nz(z));
  const xy = (p: [number, number, number]): string => screen(p).map((v) => v.toFixed(2)).join(' ');
  const parts: string[] = [`<svg class="plot-svg" width="${c.width}pt" height="${c.height}pt" viewBox="0 0 ${c.width} ${c.height}" font-family="system-ui, sans-serif" font-size="8">`];
  // The box's edges, behind the surface, and the range of each axis at its ends.
  const box = (p: [number, number, number]): string => xy(project(...p));
  const edges: [[number, number, number], [number, number, number]][] = [];
  for (const py of [-1, 1]) for (const pz of [-0.7, 0.7]) edges.push([[-1, py, pz], [1, py, pz]]);
  for (const px of [-1, 1]) for (const pz of [-0.7, 0.7]) edges.push([[px, -1, pz], [px, 1, pz]]);
  for (const px of [-1, 1]) for (const py of [-1, 1]) edges.push([[px, py, -0.7], [px, py, 0.7]]);
  for (const [p, q] of edges) parts.push(`<path d="M${box(p)}L${box(q)}" stroke="${GRID}" stroke-width="0.75" fill="none"/>`);
  const tag = (p: [number, number, number], text: string, dx = 0, dy = 0): void => {
    const [sx, sy] = screen(project(...p));
    parts.push(`<text x="${(sx + dx).toFixed(2)}" y="${(sy + dy).toFixed(2)}" text-anchor="middle" fill="${SECONDARY}">${esc(text)}</text>`);
  };
  tag([-1, -1, -0.7], `x ${label(x0!)}`, 0, 10);
  tag([1, -1, -0.7], label(x1!), 0, 10);
  tag([1, 1, -0.7], `y ${label(y1!)}`, 0, 10);
  // Everything is drawn back to front in one list, so a hill hides a point behind it. What lies on a surface, as a
  // marked point or an arrow from it, is drawn over the patches unless one is truly in front of it, found from the
  // depth across the patch under it: sorting alone lets the patch it sits on cover half of it.
  const marks: { depth: number; svg: string }[] = [];
  const NEAR = 0.04;
  const faces: [number, number, number][][] = [];
  // The patches by where they fall on the plot, in a grid of cells, so each mark tests only those under it: a big
  // arrow grid over a surface would otherwise test thousands of patches per arrow on every step of a drag.
  const CELLS = 24;
  let buckets: number[][] | null = null;
  const cellOf = (x: number, y: number): [number, number] => [
    Math.min(CELLS - 1, Math.max(0, Math.floor(((x - area.x) / area.w) * CELLS))), Math.min(CELLS - 1, Math.max(0, Math.floor(((y - area.y) / area.h) * CELLS))),
  ];
  const bucketed = (): number[][] => {
    const out: number[][] = Array.from({ length: CELLS * CELLS }, () => []);
    faces.forEach((f, n) => {
      const [c0, r0] = cellOf(Math.min(...f.map((v) => v[0])), Math.min(...f.map((v) => v[1])));
      const [c1, r1] = cellOf(Math.max(...f.map((v) => v[0])), Math.max(...f.map((v) => v[1])));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out[r * CELLS + c]!.push(n);
    });
    return out;
  };
  const hidden = (p: [number, number, number]): boolean => {
    const [px, py] = screen(p);
    buckets ??= bucketed();
    const [c, r] = cellOf(px, py);
    for (const n of buckets[r * CELLS + c]!) {
      const f = faces[n]!;
      for (const [a, b, c2] of [[f[0]!, f[1]!, f[2]!], [f[0]!, f[2]!, f[3]!]]) {
        const det = (b![1] - c2![1]) * (a![0] - c2![0]) + (c2![0] - b![0]) * (a![1] - c2![1]);
        if (Math.abs(det) < 1e-12) continue;
        const l1 = ((b![1] - c2![1]) * (px - c2![0]) + (c2![0] - b![0]) * (py - c2![1])) / det;
        const l2 = ((c2![1] - a![1]) * (px - c2![0]) + (a![0] - c2![0]) * (py - c2![1])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        if (l1 * a![2] + l2 * b![2] + l3 * c2![2] > p[2] + 0.03) return true;
      }
    }
    return false;
  };
  /** Where a mark goes in the drawing order: last, over the patches, unless one hides it. */
  const placed = (p: [number, number, number], depth: number): number => (hidden(p) ? depth : depth + 1e6);
  const finite = (t: SurfaceData, k: number): boolean => Number.isFinite(t.x[k]!) && Number.isFinite(t.y[k]!) && Number.isFinite(t.z[k]!);
  const patches = (t: SurfaceData): void => {
    const id = (i: number, j: number): number => i + j * t.rows;
    for (let j = 0; j + 1 < t.cols; j++) {
      for (let i = 0; i + 1 < t.rows; i++) {
        const ids = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
        if (!ids.every((k) => finite(t, k))) continue;
        const pts = ids.map((k) => at(t.x[k]!, t.y[k]!, t.z[k]!));
        const depth = pts.reduce((sum, p) => sum + p[2], 0) / 4;
        const z = ids.reduce((sum, k) => sum + t.z[k]!, 0) / 4;
        const d = pts.map((p, n) => `${n ? 'L' : 'M'}${xy(p)}`).join('') + 'Z';
        faces.push(pts.map((p) => [...screen(p), p[2]] as [number, number, number]));
        marks.push({ depth, svg: `<path d="${d}" fill="${rampColor(shade(z))}" stroke="#0b0b0b" stroke-opacity="0.22" stroke-width="0.35" stroke-linejoin="round"/>` });
      }
    }
  };
  /** A line through the points, each segment colored by its height or in the trace's own look. */
  const line = (t: SurfaceData, look: ReturnType<typeof traceLook> | null, near: number): void => {
    for (let k = 0; k + 1 < t.rows * t.cols; k++) {
      if (!finite(t, k) || !finite(t, k + 1)) continue;
      const [p, q] = [k, k + 1].map((m) => at(t.x[m]!, t.y[m]!, t.z[m]!)) as [[number, number, number], [number, number, number]];
      const stroke = look ? `stroke="${look.color}" stroke-width="${look.weight}"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}`
        : `stroke="${rampColor(shade((t.z[k]! + t.z[k + 1]!) / 2))}" stroke-width="1.75"`;
      const mid: [number, number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      marks.push({ depth: placed(mid, mid[2] + near), svg: `<path class="curve3d" d="M${xy(p)}L${xy(q)}" ${stroke} stroke-linecap="round" fill="none"/>` });
    }
  };
  /** A symbol at each point: a point marked on its own is drawn large enough to find. */
  const points = (t: SurfaceData, look: ReturnType<typeof traceLook>, kind: NonNullable<TraceStyle['points']>): void => {
    for (let k = 0; k < t.rows * t.cols; k++) {
      if (!finite(t, k)) continue;
      const p = at(t.x[k]!, t.y[k]!, t.z[k]!);
      const [sx, sy] = screen(p);
      marks.push({ depth: placed(p, p[2] + NEAR), svg: `<g class="point3d">${symbol(kind, sx, sy, look.color, Math.max(look.weight, t.rows * t.cols === 1 ? 4 : 1.5))}</g>` });
    }
  };
  /** Draws one expression's surface, curve or point: n counts the expressions from 0, for its trace style. */
  const drawn = (t: SurfaceData, n: number): void => {
    if (!isCurve(t)) return;
    const look = traceLook(c, n);
    if (t.rows * t.cols === 1) return points(t, look, look.points === 'none' ? 'circle' : look.points);
    // The first expression's curve is colored by height, as a space curve always was, unless it's given a style.
    const styled = n > 0 || c.traces?.[n] != null;
    if (look.line) line(t, styled ? look : null, n > 0 ? NEAR : 0);
    if (look.points !== 'none') points(t, look, look.points);
  };
  // The patches first, so a point or arrow can tell whether one hides it.
  for (const t of grids) if (!isCurve(t)) patches(t);
  drawn(s, 0);
  layers.forEach((l, i) => {
    if (l.surface) drawn(l.surface, i + 1);
    const f = l.field;
    if (!f) return;
    const look = traceLook(c, i + 1);
    for (let k = 0; k < f.x.length; k++) {
      const tip = tipOf(f, k);
      if (![f.x[k]!, f.y[k]!, f.z[k]!, ...tip].every(Number.isFinite)) continue;
      const [p, q] = [at(f.x[k]!, f.y[k]!, f.z[k]!), at(...tip)];
      const [[ax, ay], [bx, by]] = [screen(p), screen(q)];
      marks.push({ depth: placed(p, (p[2] + q[2]) / 2 + NEAR), svg: arrow(ax, ay, bx, by, look.color, 1, look.weight * 0.6) });
    }
  });
  // Contour lines on the floor of the box, below the first surface, colored by level as a contour plot's are.
  if (floored) {
    const g = thinned(s0, 96);
    const levels = z1 > z0 ? ticks({ lo: z0, hi: z1, log: false }, 8).filter((v) => v > z0 && v < z1) : [];
    for (const level of levels) {
      const stroke = rampColor(shade(level), 0.25);
      for (const [ax, ay, bx, by] of contourLines(g, level)) {
        const [p, q] = [project(nx(ax), ny(ay), -0.7), project(nx(bx), ny(by), -0.7)];
        marks.push({ depth: (p[2] + q[2]) / 2, svg: `<path class="floor-contour" d="M${xy(p)}L${xy(q)}" stroke="${stroke}" stroke-width="1" stroke-linecap="round" fill="none"/>` });
      }
    }
  }
  marks.sort((p, q) => p.depth - q.depth);
  for (const m of marks) parts.push(m.svg);
  parts.push(colorBar(area.x + area.w + 8, area.y + 4, area.h - 8, z0, z1, el.dataset.id ?? 's', 0, rampColor, palette !== undefined));
  // A layer that can't be drawn says why, at the top, in order, with a halo to read it over the box.
  layers.flatMap((l, i) => (l.error ? [`Expression ${i + 2}: ${l.error}`] : [])).forEach((text, n) => {
    parts.push(`<text class="layer-problem" x="${area.x + 2}" y="${area.y + 8 + n * 10}" fill="#c00" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(text)}</text>`);
  });
  // Dragging across the plot turns it.
  parts.push(`<rect class="rotate-area" x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="transparent"/>`);
  parts.push('</svg>');
  el.innerHTML = parts.join('') + slots(c, data, area);
  el.style.width = `${c.width}pt`;
  el.style.height = `${c.height}pt`;
  // The pointer reads the nearest point of any surface, curve or point, or the nearest arrow's tail.
  const vertices: { at: [number, number]; text: string }[] = [];
  for (const t of grids) {
    for (let k = 0; k < t.rows * t.cols; k++) {
      if (finite(t, k)) vertices.push({ at: screen(at(t.x[k]!, t.y[k]!, t.z[k]!)), text: `x = ${num(t.x[k]!)}, y = ${num(t.y[k]!)}, z = ${num(t.z[k]!)}` });
    }
  }
  for (const l of layers) {
    const f = l.field;
    if (!f) continue;
    for (let k = 0; k < f.x.length; k++) {
      if (![f.x[k], f.y[k], f.z[k]].every((v) => Number.isFinite(v!))) continue;
      vertices.push({ at: screen(at(f.x[k]!, f.y[k]!, f.z[k]!)), text: `(${num(f.x[k]!)}, ${num(f.y[k]!)}, ${num(f.z[k]!)}): (${num(f.u[k]!)}, ${num(f.v[k]!)}, ${num(f.w[k]!)})` });
    }
  }
  hoverNearest(el, (px, py) => {
    let best: { d: number; text: string } | null = null;
    for (const v of vertices) {
      const d = (v.at[0] - px) ** 2 + (v.at[1] - py) ** 2;
      if (!best || d < best.d) best = { d, text: v.text };
    }
    return best && best.d < 400 ? best.text : null;
  }, area);
}

const num = (v: number): string => String(Number(v.toPrecision(6)));

/** Polyhedron pictures drawn lately, by what they show, the oldest dropped first. */
const pictures = new Map<string, string>();

/** Light from above left and in front, as seen: across, up, towards the reader. */
const LIGHT: Vec = (() => {
  const v: Vec = [-0.35, 0.55, 0.76];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/**
 * A polyhedron, as Polyhedron gives, drawn solid and lit, with its edges in dark lines, in one blue as Mathcad
 * draws it; with a colour map, each kind of face takes its own colour from the map. The faces of the star
 * polyhedra pass through each other, so it's drawn pixel by pixel into an image (see polyview.ts), at twice the
 * screen's resolution at the paper's zoom, or once while it's being turned.
 */
function drawPolyhedron(el: HTMLElement, c: Plot, data: PlotData, poly: Polyhedron, palette: MapRows | undefined): void {
  // No axes or color bar: the whole width, and the height down to the expression below.
  const { titled } = frame(c);
  const top = 8 + (titled ? 13 : 0);
  const box = { x: 8, y: top, w: Math.max(40, c.width - 16), h: Math.max(40, c.height - top - 38) };
  const view = c.view3d ?? DEFAULT_VIEW;
  const [a, e] = [(view.azimuth * Math.PI) / 180, (view.elevation * Math.PI) / 180];
  const [ca, sa, ce, se] = [Math.cos(a), Math.sin(a), Math.cos(e), Math.sin(e)];
  // Pixels to a point on screen, at the paper's zoom and the display's density; twice that at rest, for print.
  const screenPx = PT * getZoom() * (globalThis.devicePixelRatio || 1);
  const sharp = Math.min(4, (el.classList.contains('rotating') || el.closest('.rotating') ? 1 : 2) * Math.max(0.5, screenPx / PT));
  const [W, H] = [Math.max(1, Math.round(box.w * PT * sharp)), Math.max(1, Math.round(box.h * PT * sharp))];
  const reach = Math.max(...poly.vertices.map((v) => Math.hypot(v[0], v[1], v[2])));
  const k = (Math.min(W, H) / 2 / reach) * 0.94;
  const project = (v: Vec): [number, number, number] => {
    const x1r = v[0] * ca - v[1] * sa;
    const y1r = v[0] * sa + v[1] * ca;
    return [W / 2 + x1r * k, H / 2 - (v[2] * ce + y1r * se) * k, (-y1r * ce + v[2] * se) * k];
  };
  const kinds = poly.kinds.length;
  const base = RGB[6]!;
  const color = (face: number): [number, number, number] =>
    palette ? mapColor(palette, kinds > 1 ? poly.kind[face]! / (kinds - 1) : 0.5) : base;
  // The same polyhedron, seen the same way at the same size and colours, is the same picture: redraw it only when
  // something it shows changes, not each time the sheet does.
  const key = [poly.name, poly.vertices.length, view.azimuth, view.elevation, W, H, palette ? palette.map((r) => r.join(',')).join(';') : ''].join('|');
  let url = pictures.get(key);
  if (url === undefined) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext?.('2d');
    if (ctx) {
      const r = rasterize(poly, W, H, project, color, LIGHT, Math.max(1, sharp));
      canvas.width = W;
      canvas.height = H;
      ctx.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
      url = canvas.toDataURL();
      pictures.set(key, url);
      if (pictures.size > 64) pictures.delete(pictures.keys().next().value!);
    }
  }
  const image = url ? `<image class="poly3d" href="${url}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/>` : '';
  el.innerHTML = `<svg class="plot-svg" width="${c.width}pt" height="${c.height}pt" viewBox="0 0 ${c.width} ${c.height}" font-family="system-ui, sans-serif" font-size="8">`
    + `<title>${esc(poly.name)}</title>${image}`
    // Dragging across the plot turns it.
    + `<rect class="rotate-area" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="transparent"/></svg>${slots(c, data, box)}`;
  el.style.width = `${c.width}pt`;
  el.style.height = `${c.height}pt`;
}

/** A contour line at each level: marching squares on the grid, colored by level. */
export function contourLines(s: SurfaceData, level: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const at = (i: number, j: number): number => i + j * s.rows;
  for (let j = 0; j + 1 < s.cols; j++) {
    for (let i = 0; i + 1 < s.rows; i++) {
      const k = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const z = k.map((n) => s.z[n]!);
      if (z.some((v) => !Number.isFinite(v))) continue;
      // Where the level crosses each edge of the cell, by straight-line interpolation.
      const cross: [number, number][] = [];
      for (let n = 0; n < 4; n++) {
        const [p, q] = [n, (n + 1) % 4];
        const [zp, zq] = [z[p]!, z[q]!];
        if ((zp < level) === (zq < level)) continue;
        const t = (level - zp) / (zq - zp);
        cross.push([s.x[k[p]!]! + t * (s.x[k[q]!]! - s.x[k[p]!]!), s.y[k[p]!]! + t * (s.y[k[q]!]! - s.y[k[p]!]!)]);
      }
      if (cross.length === 2) out.push([cross[0]![0], cross[0]![1], cross[1]![0], cross[1]![1]]);
      else if (cross.length === 4) {
        // A saddle: the cell's mean decides which corners join.
        const mean = (z[0]! + z[1]! + z[2]! + z[3]!) / 4;
        const [a, b, c2, d] = cross as [[number, number], [number, number], [number, number], [number, number]];
        if ((mean < level) === (z[0]! < level)) {
          out.push([a[0], a[1], d[0], d[1]], [b[0], b[1], c2[0], c2[1]]);
        } else out.push([a[0], a[1], b[0], b[1]], [c2[0], c2[1], d[0], d[1]]);
      }
    }
  }
  return out;
}

export function drawContour(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined, palette?: MapRows): void {
  if (data?.poly && !problem) {
    empty(el, c, data, 'A contour plot can\'t draw a polyhedron: make it a surface plot');
    return;
  }
  const rampColor = colorOf(palette);
  const s = data?.surface;
  if (!s || problem) {
    empty(el, c, data, problem);
    return;
  }
  if (!s.regular) {
    empty(el, c, data, 'A contour plot needs a matrix of heights or a function');
    return;
  }
  const { area } = frame(c);
  const [[x0, x1], [y0, y1], [z0, z1]] = [range(s.x), range(s.y), range(s.z)];
  const X = (v: number): number => area.x + (x1 > x0 ? ((v - x0) / (x1 - x0)) * area.w : area.w / 2);
  const Y = (v: number): number => area.y + area.h - (y1 > y0 ? ((v - y0) / (y1 - y0)) * area.h : area.h / 2);
  const parts: string[] = [`<svg class="plot-svg" width="${c.width}pt" height="${c.height}pt" viewBox="0 0 ${c.width} ${c.height}" font-family="system-ui, sans-serif" font-size="8">`];
  parts.push(`<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="${SECONDARY}" stroke-width="0.75"/>`);
  for (const t of ticks({ lo: x0, hi: x1, log: false }, 4)) {
    parts.push(`<line x1="${X(t)}" y1="${area.y}" x2="${X(t)}" y2="${area.y + area.h}" stroke="${GRID}" stroke-width="0.75"/>`);
    parts.push(`<text x="${X(t)}" y="${area.y + area.h + 9}" text-anchor="middle" fill="${SECONDARY}">${esc(label(t))}</text>`);
  }
  for (const t of ticks({ lo: y0, hi: y1, log: false }, 4)) {
    parts.push(`<line x1="${area.x}" y1="${Y(t)}" x2="${area.x + area.w}" y2="${Y(t)}" stroke="${GRID}" stroke-width="0.75"/>`);
    parts.push(`<text x="${area.x - 3}" y="${Y(t) + 2.8}" text-anchor="end" fill="${SECONDARY}">${esc(label(t))}</text>`);
  }
  // Even levels inside the range; lines use the darker part of the ramp so each clears the page.
  const levels = z1 > z0 ? ticks({ lo: z0, hi: z1, log: false }, 8).filter((v) => v > z0 && v < z1) : [];
  parts.push(`<clipPath id="clip-${svgId(el.dataset.id)}"><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}"/></clipPath><g clip-path="url(#clip-${svgId(el.dataset.id)})">`);
  for (const level of levels) {
    const d = contourLines(s, level).map(([ax, ay, bx, by]) => `M${X(ax).toFixed(2)} ${Y(ay).toFixed(2)}L${X(bx).toFixed(2)} ${Y(by).toFixed(2)}`).join('');
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${rampColor((level - z0) / (z1 - z0), 0.25)}" stroke-width="1.2" stroke-linecap="round"/>`);
  }
  parts.push('</g>');
  parts.push(colorBar(area.x + area.w + 8, area.y + 4, area.h - 8, z0, z1, el.dataset.id ?? 'c', 0.25, rampColor, palette !== undefined));
  parts.push('</svg>');
  el.innerHTML = parts.join('') + slots(c, data, area);
  el.style.width = `${c.width}pt`;
  el.style.height = `${c.height}pt`;
  hoverNearest(el, (px, py) => {
    let best: { d: number; k: number } | null = null;
    for (let k = 0; k < s.rows * s.cols; k++) {
      if (!Number.isFinite(s.z[k]!)) continue;
      const d = (X(s.x[k]!) - px) ** 2 + (Y(s.y[k]!) - py) ** 2;
      if (!best || d < best.d) best = { d, k };
    }
    return best ? `x = ${num(s.x[best.k]!)}, y = ${num(s.y[best.k]!)}, z = ${num(s.z[best.k]!)}` : null;
  }, area);
}

/** A readout of the data point nearest the pointer, inside the plot's area. */
function hoverNearest(el: HTMLElement, find: (px: number, py: number) => string | null, area: { x: number; y: number; w: number; h: number }): void {
  const svg = el.querySelector<SVGSVGElement>('.plot-svg')!;
  const readout = el.querySelector<HTMLElement>('.readout')!;
  svg.addEventListener('mousemove', (e) => {
    const box = svg.getBoundingClientRect();
    const [px, py] = [(e.clientX - box.left) * pointsPerPixel(), (e.clientY - box.top) * pointsPerPixel()];
    const text = px >= area.x && px <= area.x + area.w && py >= area.y && py <= area.y + area.h ? find(px, py) : null;
    readout.hidden = !text;
    if (text) readout.textContent = text;
  });
  svg.addEventListener('mouseleave', () => {
    readout.hidden = true;
  });
}

const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Dark ink for arrows, as Mathcad draws a vector field: thin black arrows. */
const INK = '#1f1f1f';

/** An arrow from (ax, ay) to (bx, by) on the page, its head two strokes a third of its length, or a dot. */
function arrow(ax: number, ay: number, bx: number, by: number, col: string, opacity = 1, width = 0.8): string {
  const [dx, dy] = [bx - ax, by - ay];
  const len = Math.hypot(dx, dy);
  const faded = opacity < 1 ? ` opacity="${opacity.toFixed(2)}"` : '';
  if (!(len > 0.4)) return `<circle cx="${ax.toFixed(2)}" cy="${ay.toFixed(2)}" r="${(0.7 * Math.max(1, width / 0.8)).toFixed(2)}" fill="${col}"${faded}/>`;
  const h = Math.min(len * 0.32, 6);
  const [ux, uy] = [dx / len, dy / len];
  const [c1, s1] = [Math.cos(0.45), Math.sin(0.45)];
  const head = (sign: number): string => `${(bx - h * (ux * c1 - sign * uy * s1)).toFixed(2)} ${(by - h * (sign * ux * s1 + uy * c1)).toFixed(2)}`;
  return `<path d="M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}M${head(1)}L${bx.toFixed(2)} ${by.toFixed(2)}L${head(-1)}" stroke="${col}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"${faded}/>`;
}

/**
 * A vector field: an arrow from each point, its length in proportion, the longest reaching the next point (see
 * vectorfield.ts). Arrows in the plane are drawn flat with axes, x and y to one scale so each arrow points the way
 * its vector does; arrows in space are drawn in a box that turns when dragged, as a surface does. Dark ink, or
 * with a colour map each arrow colored by its length.
 */
export function drawVector(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined, palette?: MapRows): void {
  const f = data?.field;
  if (!f || problem) {
    empty(el, c, data, problem);
    return;
  }
  const framed = frame(c).area;
  // Without a colour map there is no color bar, so the arrows take its room.
  const area = palette ? framed : { ...framed, w: Math.max(40, c.width - framed.x - 12) };
  const n = f.x.length;
  const lengths = Float64Array.from({ length: n }, (_, k) => Math.hypot(f.u[k]!, f.v[k]!, f.w[k]!));
  const big = Math.max(0, ...[...lengths].filter(Number.isFinite));
  const colour = (k: number): string => (palette ? `rgb(${mapColor(palette, big > 0 ? lengths[k]! / big : 0).join(',')})` : INK);
  const tip = (k: number): [number, number, number] => [f.x[k]! + f.u[k]! * f.scale, f.y[k]! + f.v[k]! * f.scale, f.z[k]! + f.w[k]! * f.scale];
  const parts: string[] = [`<svg class="plot-svg" width="${c.width}pt" height="${c.height}pt" viewBox="0 0 ${c.width} ${c.height}" font-family="system-ui, sans-serif" font-size="8">`];
  if (f.dims === 2) {
    // The points and the arrows' tips, with half a step round them, to one scale both ways.
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let k = 0; k < n; k++) {
      const [tx, ty] = tip(k);
      for (const [px, py] of [[f.x[k]!, f.y[k]!], [tx, ty]] as [number, number][]) {
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        [x0, x1, y0, y1] = [Math.min(x0, px), Math.max(x1, px), Math.min(y0, py), Math.max(y1, py)];
      }
    }
    const pad = f.step / 2;
    [x0, x1, y0, y1] = [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
    const k = Math.min(area.w / (x1 - x0 || 1), area.h / (y1 - y0 || 1));
    const [ox, oy] = [area.x + (area.w - (x1 - x0) * k) / 2, area.y + (area.h + (y1 - y0) * k) / 2];
    const X = (v: number): number => ox + (v - x0) * k;
    const Y = (v: number): number => oy - (v - y0) * k;
    const [bx0, bx1, by1, by0] = [X(x0), X(x1), Y(y0), Y(y1)];
    parts.push(`<rect x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}" fill="none" stroke="${SECONDARY}" stroke-width="0.75"/>`);
    // Ticks inside the box, at least three where the range allows.
    const inside = (lo: number, hi: number, count: number): number[] => {
      const pick = (n: number) => ticks({ lo, hi, log: false }, n).filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
      const first = pick(count);
      return first.length >= 3 ? first : pick(count * 2.5);
    };
    for (const t of inside(x0, x1, Math.max(3, Math.round((bx1 - bx0) / 45)))) {
      parts.push(`<line x1="${X(t)}" y1="${by0}" x2="${X(t)}" y2="${by1}" stroke="${GRID}" stroke-width="0.75"/>`);
      parts.push(`<text x="${X(t)}" y="${by1 + 9}" text-anchor="middle" fill="${SECONDARY}">${esc(label(t))}</text>`);
    }
    for (const t of inside(y0, y1, Math.max(3, Math.round((by1 - by0) / 35)))) {
      parts.push(`<line x1="${bx0}" y1="${Y(t)}" x2="${bx1}" y2="${Y(t)}" stroke="${GRID}" stroke-width="0.75"/>`);
      parts.push(`<text x="${bx0 - 3}" y="${Y(t) + 2.8}" text-anchor="end" fill="${SECONDARY}">${esc(label(t))}</text>`);
    }
    for (let i = 0; i < n; i++) {
      if (![f.x[i], f.y[i], f.u[i], f.v[i]].every((v) => Number.isFinite(v!))) continue;
      const [tx, ty] = tip(i);
      parts.push(arrow(X(f.x[i]!), Y(f.y[i]!), X(tx), Y(ty), colour(i)));
    }
    if (palette) parts.push(colorBar(area.x + area.w + 8, area.y + 4, area.h - 8, 0, big, el.dataset.id ?? 'v', 0, colorOf(palette), true));
    // A big matrix draws every few rows and columns, and says so.
    if (f.every > 1) parts.push(`<text class="thinned" x="${bx1}" y="${by0 - 3}" text-anchor="end" fill="${SECONDARY}" font-size="6.5">every ${ordinal(f.every)} row and column</text>`);
    parts.push('</svg>');
    el.innerHTML = parts.join('') + slots(c, data, area);
    el.style.width = `${c.width}pt`;
    el.style.height = `${c.height}pt`;
    hoverNearest(el, (px, py) => {
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (X(f.x[i]!) - px) ** 2 + (Y(f.y[i]!) - py) ** 2;
        if (d < bd) [bd, best] = [d, i];
      }
      return best >= 0 && bd < 400 ? `x = ${num(f.x[best]!)}, y = ${num(f.y[best]!)}: (${num(f.u[best]!)}, ${num(f.v[best]!)})` : null;
    }, area);
    return;
  }
  // In space: a box round the points and tips, one scale all three ways, turned as a surface is.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (const p of [[f.x[i]!, f.y[i]!, f.z[i]!], tip(i)]) {
      p.forEach((v, a) => {
        if (Number.isFinite(v)) [lo[a], hi[a]] = [Math.min(lo[a]!, v), Math.max(hi[a]!, v)];
      });
    }
  }
  const half = Math.max(...[0, 1, 2].map((a) => (hi[a]! - lo[a]!) / 2), 1e-12);
  const mid = [0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2);
  const norm = (p: number[]): [number, number, number] => [(p[0]! - mid[0]!) / half, (p[1]! - mid[1]!) / half, (p[2]! - mid[2]!) / half];
  const ext = [0, 1, 2].map((a) => (hi[a]! - lo[a]!) / 2 / half);
  const view = c.view3d ?? DEFAULT_VIEW;
  const [a, e] = [(view.azimuth * Math.PI) / 180, (view.elevation * Math.PI) / 180];
  const [ca, sa, ce, se] = [Math.cos(a), Math.sin(a), Math.cos(e), Math.sin(e)];
  const project = (px: number, py: number, pz: number): [number, number, number] => {
    const x1r = px * ca - py * sa;
    const y1r = px * sa + py * ca;
    return [x1r, pz * ce + y1r * se, -y1r * ce + pz * se];
  };
  const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => project(sx * ext[0]!, sy * ext[1]!, sz * ext[2]!))));
  const [bx0, bx1] = [Math.min(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[0]))];
  const [by0, by1] = [Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[1]))];
  const scale = Math.min(area.w / (bx1 - bx0 || 1), area.h / (by1 - by0 || 1)) * 0.92;
  const [ox, oy] = [area.x + area.w / 2 - ((bx0 + bx1) / 2) * scale, area.y + area.h / 2 + ((by0 + by1) / 2) * scale];
  const screen = (p: [number, number, number]): [number, number] => [ox + p[0] * scale, oy - p[1] * scale];
  const at = (p: number[]): [number, number, number] => project(...norm(p));
  const boxPt = (sx: number, sy: number, sz: number): string => screen(project(sx * ext[0]!, sy * ext[1]!, sz * ext[2]!)).map((v) => v.toFixed(2)).join(' ');
  for (const [p, q] of [
    ...[-1, 1].flatMap((sy) => [-1, 1].map((sz) => [[-1, sy, sz], [1, sy, sz]])),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [[sx, -1, sz], [sx, 1, sz]])),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => [[sx, sy, -1], [sx, sy, 1]])),
  ] as [number, number, number][][]) parts.push(`<path d="M${boxPt(...p!)}L${boxPt(...q!)}" stroke="${GRID}" stroke-width="0.75" fill="none"/>`);
  const tag = (p: [number, number, number], text: string): void => {
    const [sx, sy] = screen(project(p[0] * ext[0]!, p[1] * ext[1]!, p[2] * ext[2]!));
    parts.push(`<text x="${sx.toFixed(2)}" y="${(sy + 10).toFixed(2)}" text-anchor="middle" fill="${SECONDARY}">${esc(text)}</text>`);
  };
  tag([-1, -1, -1], `x ${label(lo[0]!)}`);
  tag([1, -1, -1], label(hi[0]!));
  tag([1, 1, -1], `y ${label(hi[1]!)}`);
  // Back to front, the farther a little fainter.
  const order = Array.from({ length: n }, (_, i) => i).filter((i) => [f.x[i], f.y[i], f.z[i], f.u[i], f.v[i], f.w[i]].every((v) => Number.isFinite(v!)));
  const depth = order.map((i) => at([f.x[i]!, f.y[i]!, f.z[i]!])[2]);
  const [d0, d1] = [Math.min(...depth), Math.max(...depth)];
  const sorted = order.map((i, k) => ({ i, d: depth[k]! })).sort((p, q) => p.d - q.d);
  const shown: { i: number; s: [number, number] }[] = [];
  for (const { i, d } of sorted) {
    const s0 = screen(at([f.x[i]!, f.y[i]!, f.z[i]!]));
    const s1 = screen(at(tip(i)));
    const fade = d1 > d0 ? 0.45 + 0.55 * ((d - d0) / (d1 - d0)) : 1;
    parts.push(arrow(s0[0], s0[1], s1[0], s1[1], colour(i), fade));
    shown.push({ i, s: s0 });
  }
  if (palette) parts.push(colorBar(area.x + area.w + 8, area.y + 4, area.h - 8, 0, big, el.dataset.id ?? 'v', 0, colorOf(palette), true));
  // Dragging across the plot turns it.
  parts.push(`<rect class="rotate-area" x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="transparent"/>`);
  parts.push('</svg>');
  el.innerHTML = parts.join('') + slots(c, data, area);
  el.style.width = `${c.width}pt`;
  el.style.height = `${c.height}pt`;
  hoverNearest(el, (px, py) => {
    let best: { d: number; i: number } | null = null;
    for (const { i, s: [sx, sy] } of shown) {
      const d = (sx - px) ** 2 + (sy - py) ** 2;
      if (!best || d < best.d) best = { d, i };
    }
    if (!best || best.d > 400) return null;
    const i = best.i;
    return `(${num(f.x[i]!)}, ${num(f.y[i]!)}, ${num(f.z[i]!)}): (${num(f.u[i]!)}, ${num(f.v[i]!)}, ${num(f.w[i]!)})`;
  }, area);
}
