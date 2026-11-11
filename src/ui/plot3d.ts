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
 * color bar to read it by.
 */
import type { PlotData, SurfaceData } from '../engine/evaluate.js';
import { tex } from '../latex/latex.js';
import type { Content } from '../model/ast.js';
import { mathMarkup } from './markup.js';
import { label, ticks } from './plot.js';
import { pointsPerPixel } from './zoom.js';

type Plot = Extract<Content, { k: 'plot' }>;

/** The validated sequential ramp, steps 100 to 700. */
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const SECONDARY = '#52514e';
const GRID = '#e6e5e1';
const PT = 96 / 72;
export const DEFAULT_VIEW = { azimuth: -55, elevation: 28 };

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
const RGB = RAMP.map(hex);

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
function colorBar(x: number, top: number, height: number, lo: number, hi: number, id: string, from = 0): string {
  const stops = Array.from({ length: 9 }, (_, n) => `<stop offset="${n / 8}" stop-color="${rampColor(1 - n / 8, from)}"/>`).join('');
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
    slot('ys', c.ys[0] ? markup(tex(c.ys[0])) : '', `left:${area.x}pt;width:${area.w}pt;top:${below + 24}pt;justify-content:center`,
      'What to plot: a matrix of heights, a function of two variables, three matrices X, Y and Z in a vector, as CreateMesh gives, or three vectors for a curve, as CreateSpace gives'),
    // The limits apply only to a function, so they're left out once the plot is known to show matrices.
    data?.surface && !data.surface.sampled ? '' : [
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

export function drawSurface(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined): void {
  const s0 = data?.surface;
  if (!s0 || problem) {
    empty(el, c, data, problem ?? (c.ys.length ? undefined : undefined));
    return;
  }
  // A curve, one point wide, keeps more of its points than a surface needs.
  const curve = s0.rows === 1 || s0.cols === 1;
  const s = thinned(s0, curve ? 600 : 48);
  const { area } = frame(c);
  const [[x0, x1], [y0, y1], [z0, z1]] = [range(s.x), range(s.y), range(s.z)];
  const nx = (v: number): number => (x1 > x0 ? ((v - x0) / (x1 - x0)) * 2 - 1 : 0);
  const ny = (v: number): number => (y1 > y0 ? ((v - y0) / (y1 - y0)) * 2 - 1 : 0);
  const nz = (v: number): number => (z1 > z0 ? ((v - z0) / (z1 - z0)) * 1.4 - 0.7 : 0);
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
  const parts: string[] = [`<svg class="plot-svg" width="${c.width}pt" height="${c.height}pt" viewBox="0 0 ${c.width} ${c.height}" font-family="system-ui, sans-serif" font-size="8">`];
  // The box's edges, behind the surface, and the range of each axis at its ends.
  const box = (p: [number, number, number]): string => screen(project(...p)).map((v) => v.toFixed(2)).join(' ');
  const edges: [[number, number, number], [number, number, number]][] = [];
  for (const py of [-1, 1]) for (const pz of [-0.7, 0.7]) edges.push([[-1, py, pz], [1, py, pz]]);
  for (const px of [-1, 1]) for (const pz of [-0.7, 0.7]) edges.push([[px, -1, pz], [px, 1, pz]]);
  for (const px of [-1, 1]) for (const py of [-1, 1]) edges.push([[px, py, -0.7], [px, py, 0.7]]);
  for (const [p, q] of edges) parts.push(`<path d="M${box(p)}L${box(q)}" stroke="${GRID}" stroke-width="0.75" fill="none"/>`);
  const tag = (p: [number, number, number], text: string, dx = 0, dy = 0): void => {
    const [sx, sy] = screen(project(...p));
    parts.push(`<text x="${(sx + dx).toFixed(2)}" y="${(sy + dy).toFixed(2)}" text-anchor="middle" fill="${SECONDARY}">${esc(text)}</text>`);
  };
  tag([-1, -1, -0.7], `x ${label(x0)}`, 0, 10);
  tag([1, -1, -0.7], label(x1), 0, 10);
  tag([1, 1, -0.7], `y ${label(y1)}`, 0, 10);
  // Patches back to front, each colored by its mean height.
  const quads: { depth: number; z: number; d: string }[] = [];
  const at = (i: number, j: number): number => i + j * s.rows;
  for (let j = 0; j + 1 < s.cols; j++) {
    for (let i = 0; i + 1 < s.rows; i++) {
      const ids = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      if (ids.some((k) => !Number.isFinite(s.z[k]!) || !Number.isFinite(s.x[k]!) || !Number.isFinite(s.y[k]!))) continue;
      const pts = ids.map((k) => project(nx(s.x[k]!), ny(s.y[k]!), nz(s.z[k]!)));
      const depth = pts.reduce((t, p) => t + p[2], 0) / 4;
      const z = ids.reduce((t, k) => t + s.z[k]!, 0) / 4;
      const d = pts.map((p, n) => `${n ? 'L' : 'M'}${screen(p).map((v) => v.toFixed(2)).join(' ')}`).join('') + 'Z';
      quads.push({ depth, z, d });
    }
  }
  quads.sort((p, q) => p.depth - q.depth);
  for (const q of quads) {
    const fill = rampColor(z1 > z0 ? (q.z - z0) / (z1 - z0) : 0.5);
    parts.push(`<path d="${q.d}" fill="${fill}" stroke="#0b0b0b" stroke-opacity="0.22" stroke-width="0.35" stroke-linejoin="round"/>`);
  }
  // A space curve, as CreateSpace gives: three vectors make a line through the points, back to front, each
  // segment colored by its height.
  if (curve) {
    const n = s.rows * s.cols;
    const segs: { depth: number; z: number; d: string }[] = [];
    for (let k = 0; k + 1 < n; k++) {
      if ([k, k + 1].some((m) => !Number.isFinite(s.z[m]!) || !Number.isFinite(s.x[m]!) || !Number.isFinite(s.y[m]!))) continue;
      const [p, q] = [k, k + 1].map((m) => project(nx(s.x[m]!), ny(s.y[m]!), nz(s.z[m]!)));
      segs.push({ depth: (p![2] + q![2]) / 2, z: (s.z[k]! + s.z[k + 1]!) / 2, d: `M${screen(p!).map((v) => v.toFixed(2)).join(' ')}L${screen(q!).map((v) => v.toFixed(2)).join(' ')}` });
    }
    segs.sort((p, q) => p.depth - q.depth);
    for (const g of segs) parts.push(`<path class="curve3d" d="${g.d}" stroke="${rampColor(z1 > z0 ? (g.z - z0) / (z1 - z0) : 0.5)}" stroke-width="1.75" stroke-linecap="round" fill="none"/>`);
  }
  parts.push(colorBar(area.x + area.w + 8, area.y + 4, area.h - 8, z0, z1, el.dataset.id ?? 's'));
  // Dragging across the plot turns it.
  parts.push(`<rect class="rotate-area" x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="transparent"/>`);
  parts.push('</svg>');
  el.innerHTML = parts.join('') + slots(c, data, area);
  el.style.width = `${c.width}pt`;
  el.style.height = `${c.height}pt`;
  const vertices = Array.from({ length: s.rows * s.cols }, (_, k) => ({ k, at: screen(project(nx(s.x[k]!), ny(s.y[k]!), nz(s.z[k]!))) }));
  hoverNearest(el, (px, py) => {
    let best: { d: number; k: number } | null = null;
    for (const v of vertices) {
      if (!Number.isFinite(s.z[v.k]!)) continue;
      const d = (v.at[0] - px) ** 2 + (v.at[1] - py) ** 2;
      if (!best || d < best.d) best = { d, k: v.k };
    }
    return best && best.d < 400 ? `x = ${num(s.x[best.k]!)}, y = ${num(s.y[best.k]!)}, z = ${num(s.z[best.k]!)}` : null;
  }, area);
}

const num = (v: number): string => String(Number(v.toPrecision(6)));

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

export function drawContour(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined): void {
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
  parts.push(`<clipPath id="clip-${el.dataset.id}"><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}"/></clipPath><g clip-path="url(#clip-${el.dataset.id})">`);
  for (const level of levels) {
    const d = contourLines(s, level).map(([ax, ay, bx, by]) => `M${X(ax).toFixed(2)} ${Y(ay).toFixed(2)}L${X(bx).toFixed(2)} ${Y(by).toFixed(2)}`).join('');
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${rampColor((level - z0) / (z1 - z0), 0.25)}" stroke-width="1.2" stroke-linecap="round"/>`);
  }
  parts.push('</g>');
  parts.push(colorBar(area.x + area.w + 8, area.y + 4, area.h - 8, z0, z1, el.dataset.id ?? 'c', 0.25));
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
