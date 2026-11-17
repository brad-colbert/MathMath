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
 * Draws a plot as SVG, which prints as sharp vectors and matches the screen. Axis expressions and
 * limits are slots, edited in place like Mathcad's placeholders.
 */
import type { LimitKey, PlotData } from '../engine/evaluate.js';
import { tex } from '../latex/latex.js';
import type { Content, TraceStyle } from '../model/ast.js';
import { mathMarkup } from './markup.js';
import { drawContour, drawSurface } from './plot3d.js';
import type { MapRows } from '../engine/colormaps.js';
import { pointsPerPixel } from './zoom.js';

type Plot = Extract<Content, { k: 'plot' }>;

/** Validated for white paper. Contrast is low for some, so each trace also gets its own dash. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const DASHES = ['', '6 3', '2 3', '8 3 2 3', '1 2', '10 4', '4 2 1 2', '3 5'];
const INK = '#0b0b0b';

/** The dash patterns a trace's line can be given by name. */
export const LINE_DASHES: Record<NonNullable<TraceStyle['line']>, string> = { solid: '', dash: '6 3', dot: '1.5 2.5', dashdot: '8 3 2 3', none: '' };

/** How trace n is drawn: its own style where set, the plot's defaults otherwise. */
export function traceLook(c: Plot, n: number): { color: string; dash: string; line: boolean; weight: number; points: NonNullable<TraceStyle['points']> } {
  const s = c.traces?.[n] ?? {};
  return {
    color: s.color ?? SERIES[n % SERIES.length]!,
    dash: s.line ? LINE_DASHES[s.line] : DASHES[n % DASHES.length]!,
    line: s.line ? s.line !== 'none' : !c.markers,
    weight: s.weight ?? 1.5,
    points: s.points ?? (c.markers ? 'circle' : 'none'),
  };
}

/** A point symbol at (x, y), its size following the line weight. */
function symbol(kind: NonNullable<TraceStyle['points']>, x: number, y: number, color: string, weight: number): string {
  const r = 1.6 + weight * 0.4;
  switch (kind) {
    case 'circle': return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" stroke="#fff" stroke-width="0.75"/>`;
    case 'square': return `<rect x="${(x - r).toFixed(2)}" y="${(y - r).toFixed(2)}" width="${(2 * r).toFixed(2)}" height="${(2 * r).toFixed(2)}" fill="${color}" stroke="#fff" stroke-width="0.75"/>`;
    case 'triangle': return `<path d="M${x.toFixed(2)} ${(y - 1.2 * r).toFixed(2)}L${(x + 1.1 * r).toFixed(2)} ${(y + 0.8 * r).toFixed(2)}L${(x - 1.1 * r).toFixed(2)} ${(y + 0.8 * r).toFixed(2)}Z" fill="${color}" stroke="#fff" stroke-width="0.75"/>`;
    case 'cross': return `<path d="M${(x - r).toFixed(2)} ${(y - r).toFixed(2)}L${(x + r).toFixed(2)} ${(y + r).toFixed(2)}M${(x + r).toFixed(2)} ${(y - r).toFixed(2)}L${(x - r).toFixed(2)} ${(y + r).toFixed(2)}" stroke="${color}" stroke-width="${Math.max(1, weight * 0.8).toFixed(2)}" stroke-linecap="round"/>`;
    default: return '';
  }
}
const SECONDARY = '#52514e';

/** A trace's entry in the legend: its line and point symbol, so color is never alone. */
function legendSwatch(c: Plot, n: number): string {
  const look = traceLook(c, n);
  const line = look.line ? `<line x1="0" y1="4" x2="16" y2="4" stroke="${look.color}" stroke-width="${look.weight}"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}/>` : '';
  const mark = look.points !== 'none' || !look.line ? symbol(look.points !== 'none' ? look.points : 'circle', 8, 4, look.color, Math.min(look.weight, 1.5)) : '';
  return `<svg width="16pt" height="8pt" viewBox="0 0 16 8">${line}${mark}</svg>`;
}
const GRID = '#e6e5e1';

/** Space around the plot area, in points: room for limits, tick labels and axis expressions. */
const M = { left: 62, right: 10, top: 8, bottom: 40 };

const PT = 96 / 72;

export interface Scale {
  lo: number;
  hi: number;
  log: boolean;
}

/** Tick positions at 1, 2 or 5 times a power of ten, or at decades on a log axis. */
export function ticks(s: Scale, count = 5): number[] {
  if (!(s.hi > s.lo)) return [s.lo];
  if (s.log) {
    const out: number[] = [];
    for (let p = Math.ceil(Math.log10(s.lo)); p <= Math.floor(Math.log10(s.hi)); p++) out.push(10 ** p);
    return out.length >= 2 ? out : [s.lo, s.hi];
  }
  const raw = (s.hi - s.lo) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((st) => st >= raw) ?? 10 * power;
  const out: number[] = [];
  for (let v = Math.ceil(s.lo / step) * step; v <= s.hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Limits from the data, widened to round values, unless typed on the plot. */
export function scaleFor(values: Float64Array[], log: boolean, min?: number, max?: number): Scale | string {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    for (const x of v) {
      if (!Number.isFinite(x) || (log && x <= 0)) continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  if (min !== undefined) lo = min;
  if (max !== undefined) hi = max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return log ? 'A log axis needs values above 0' : 'There are no points to plot';
  if (log && lo <= 0) return 'A log axis needs limits above 0';
  if (lo === hi) {
    const pad = log ? 10 : Math.abs(lo) || 1;
    [lo, hi] = log ? [lo / pad, hi * pad] : [lo - pad / 2, hi + pad / 2];
  }
  if (log) {
    if (min === undefined) lo = 10 ** Math.floor(Math.log10(lo));
    if (max === undefined) hi = 10 ** Math.ceil(Math.log10(hi));
  } else {
    const t = ticks({ lo, hi, log: false });
    const step = t.length > 1 ? t[1]! - t[0]! : (hi - lo);
    if (min === undefined) lo = Math.floor(lo / step + 1e-9) * step;
    if (max === undefined) hi = Math.ceil(hi / step - 1e-9) * step;
  }
  return { lo, hi, log };
}

/** An axis limit as a number: gray when fitted to the data, in ink when typed. */
const limitNumber = (v: number, kind: 'auto' | 'typed'): string =>
  `<span class="${kind}">${esc(label(v)).replace(/10\^(-?\d+)$/, '10<sup>$1</sup>')}</span>`;

/** A short, readable tick label. */
export function label(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const p = Math.floor(Math.log10(a));
    const m = Number((v / 10 ** p).toPrecision(3));
    return m === 1 ? `10^${p}` : `${m}·10^${p}`;
  }
  return String(Number(v.toPrecision(4)));
}

const tickText = (v: number): string => {
  const s = label(v);
  const m = /^(.*?)10\^(-?\d+)$/.exec(s);
  return m ? `${m[1]}10<tspan dy="-4" font-size="6.5">${m[2]}</tspan>` : s;
};

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

/** Room taken by each title, in points. The plot keeps its size, so its area shrinks to fit them. */
const TITLE = { top: 13, left: 11, bottom: 11 };

export function drawPlot(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined, palette?: MapRows): void {
  if (c.view === 'polar') {
    drawPolar(el, c, data, problem);
    return;
  }
  if (c.view === 'smith') {
    drawSmith(el, c, data, problem);
    return;
  }
  if (c.view === 'surface') {
    drawSurface(el, c, data, problem, palette);
    return;
  }
  if (c.view === 'contour') {
    drawContour(el, c, data, problem, palette);
    return;
  }
  const [w, h] = [c.width, c.height];
  const [hasTitle, hasX, hasY] = [c.title !== undefined, c.xAxis.title !== undefined, c.yAxis.title !== undefined];
  const m = {
    left: M.left + (hasY ? TITLE.left : 0), right: M.right, top: M.top + (hasTitle ? TITLE.top : 0), bottom: M.bottom + (hasX ? TITLE.bottom : 0),
  };
  const area = { x: m.left, y: m.top, w: Math.max(20, w - m.left - m.right), h: Math.max(20, h - m.top - m.bottom) };
  const traces = data?.traces ?? [];
  const sx = scaleFor(traces.map((t) => t.x), c.xAxis.log, data?.limits.xmin, data?.limits.xmax);
  const sy = scaleFor(traces.map((t) => t.y), c.yAxis.log, data?.limits.ymin, data?.limits.ymax);
  const parts: string[] = [`<svg class="plot-svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif" font-size="8">`];
  const message = problem ?? traces.find((t) => t.error)?.error ?? (c.ys.length === 0 ? undefined : typeof sx === 'string' ? sx : typeof sy === 'string' ? sy : undefined);
  parts.push(`<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="${SECONDARY}" stroke-width="0.75"/>`);
  if (typeof sx !== 'string' && typeof sy !== 'string') {
    const map = (s: Scale, v: number, from: number, size: number, flip: boolean): number => {
      const [a, b, x] = s.log ? [Math.log10(s.lo), Math.log10(s.hi), Math.log10(v)] : [s.lo, s.hi, v];
      const t = (x - a) / (b - a);
      return flip ? from + size - t * size : from + t * size;
    };
    const X = (v: number): number => map(sx, v, area.x, area.w, false);
    const Y = (v: number): number => map(sy, v, area.y, area.h, true);
    // The axis ends carry the limits, which are editable, so ticks there would print twice.
    const inside = (pos: number, from: number, size: number): boolean => pos > from + 9 && pos < from + size - 9;
    for (const t of ticks(sx)) {
      const x = X(t);
      parts.push(`<line x1="${x}" y1="${area.y}" x2="${x}" y2="${area.y + area.h}" stroke="${GRID}" stroke-width="0.75"/>`);
      if (inside(x, area.x, area.w)) parts.push(`<text x="${x}" y="${area.y + area.h + 9}" text-anchor="middle" fill="${SECONDARY}">${tickText(t)}</text>`);
    }
    for (const t of ticks(sy)) {
      const y = Y(t);
      parts.push(`<line x1="${area.x}" y1="${y}" x2="${area.x + area.w}" y2="${y}" stroke="${GRID}" stroke-width="0.75"/>`);
      if (inside(y, area.y, area.h)) parts.push(`<text x="${area.x - 3}" y="${y + 2.8}" text-anchor="end" fill="${SECONDARY}">${tickText(t)}</text>`);
    }
    parts.push(`<clipPath id="clip-${el.dataset.id}"><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}"/></clipPath>`);
    parts.push(`<g clip-path="url(#clip-${el.dataset.id})">`);
    traces.forEach((t, n) => {
      const look = traceLook(c, n);
      const { color, dash } = look;
      const usable = (i: number): boolean => Number.isFinite(t.x[i]!) && Number.isFinite(t.y[i]!) && !(sx.log && t.x[i]! <= 0) && !(sy.log && t.y[i]! <= 0);
      let d = '';
      let pen = false;
      for (let i = 0; i < t.x.length; i++) {
        if (!usable(i)) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${X(t.x[i]!).toFixed(2)} ${Y(t.y[i]!).toFixed(2)}`;
        pen = true;
      }
      if (d && look.line) parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${look.weight}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
      // A lone point always shows, or there'd be nothing to see.
      const points = look.points !== 'none' ? look.points : t.x.length === 1 || !look.line ? 'circle' : 'none';
      if (points !== 'none') {
        for (let i = 0; i < t.x.length; i++) {
          if (usable(i)) parts.push(symbol(points, X(t.x[i]!), Y(t.y[i]!), color, look.weight));
        }
      }
    });
    parts.push('</g>');
  }
  if (message) parts.push(`<text class="plot-problem" x="${area.x + area.w / 2}" y="${area.y + area.h / 2}" text-anchor="middle" fill="#c00">${esc(message)}</text>`);
  parts.push('</svg>');

  // The y expressions double as the legend: each carries its trace's line, so color is never alone.
  const swatch = (n: number): string => legendSwatch(c, n);
  // Each axis's unit sits after its expression: gray when it's the default, and clicked to choose another.
  const labels = data?.labels;
  const unit = (name: 'xunit' | 'yunit', latex: string | undefined, chosen: boolean | undefined): string => (latex
    ? `<span class="axis-unit${chosen ? '' : ' auto'}" data-slot="${name}" title="${chosen ? 'The unit this axis shows. Clear it for the default' : 'The default unit. Click to show the axis in another, such as ft'}">(${markup(latex)})</span>`
    : '');
  const ys = c.ys.map((y, n) => `<div class="ylabel">${c.ys.length > 1 ? swatch(n) : ''}${markup(tex(y))}</div>`).join('')
    + unit('yunit', labels?.y, labels?.yChosen);
  // A typed limit shows its value in the axis's unit, as the limits fitted to the data do, so 0.2·s on an axis in
  // seconds reads 0.2. Its expression comes back to edit; one that doesn't calculate stays as typed.
  const limit = (key: LimitKey, auto: number | undefined): string => {
    const e = key === 'xmin' ? c.xAxis.min : key === 'xmax' ? c.xAxis.max : key === 'ymin' ? c.yAxis.min : c.yAxis.max;
    const typed = data?.limits[key];
    if (e) return typed !== undefined ? limitNumber(typed, 'typed') : markup(tex(e));
    return auto !== undefined ? limitNumber(auto, 'auto') : '';
  };
  const auto = (s: Scale | string): { lo?: number; hi?: number } => (typeof s === 'string' ? {} : { lo: s.lo, hi: s.hi });
  const [ax, ay] = [auto(sx), auto(sy)];
  const below = area.y + area.h;
  const html = [
    parts.join(''),
    slot('ys', ys, `left:${m.left - M.left}pt;top:${area.y}pt;width:${M.left - 26}pt;height:${area.h}pt`, 'y values. Separate several with commas'),
    slot('x', c.x ? `${markup(tex(c.x))}${unit('xunit', labels?.x, labels?.xChosen)}` : '', `left:${area.x}pt;width:${area.w}pt;top:${below + M.bottom - 16}pt`, 'x values'),
    slot('ymax', limit('ymax', ay.hi), `left:${area.x - 28}pt;width:25pt;top:${area.y - 4}pt;justify-content:flex-end`, 'Top of the y axis. Leave empty to fit the data'),
    slot('ymin', limit('ymin', ay.lo), `left:${area.x - 28}pt;width:25pt;top:${below - 7}pt;justify-content:flex-end`, 'Bottom of the y axis. Leave empty to fit the data'),
    slot('xmin', limit('xmin', ax.lo), `left:${area.x - 4}pt;top:${below + 2}pt`, 'Left end of the x axis. Leave empty to fit the data'),
    slot('xmax', limit('xmax', ax.hi), `left:${area.x + area.w - 28}pt;top:${below + 2}pt;justify-content:flex-end;width:32pt`, 'Right end of the x axis. Leave empty to fit the data'),
    hasTitle ? slot('title', esc(c.title!), `left:${area.x}pt;width:${area.w}pt;top:0;height:${TITLE.top}pt`, 'Plot title. Click to type it; Format turns it off') : '',
    hasX ? slot('titlex', esc(c.xAxis.title!), `left:${area.x}pt;width:${area.w}pt;top:${h - TITLE.bottom}pt;height:${TITLE.bottom}pt`, 'x axis title. Click to type it; Format turns it off') : '',
    hasY ? slot('titley', esc(c.yAxis.title!), `left:0;width:${TITLE.left}pt;top:${area.y}pt;height:${area.h}pt`, 'y axis title. Click to type it; Format turns it off') : '',
    '<div class="readout" hidden></div>',
  ].join('');
  el.innerHTML = html;
  el.style.width = `${w}pt`;
  el.style.height = `${h}pt`;
  if (typeof sx !== 'string' && typeof sy !== 'string') hover(el, traces, sx, sy, area);
}

/** Shows the nearest point under the pointer. */
function hover(el: HTMLElement, traces: PlotData['traces'], sx: Scale, sy: Scale, area: { x: number; y: number; w: number; h: number }): void {
  const svg = el.querySelector<SVGSVGElement>('.plot-svg')!;
  const readout = el.querySelector<HTMLElement>('.readout')!;
  const unmap = (s: Scale, t: number): number => (s.log ? 10 ** (Math.log10(s.lo) + t * (Math.log10(s.hi) - Math.log10(s.lo))) : s.lo + t * (s.hi - s.lo));
  svg.addEventListener('mousemove', (e) => {
    const box = svg.getBoundingClientRect();
    const [px, py] = [(e.clientX - box.left) * pointsPerPixel(), (e.clientY - box.top) * pointsPerPixel()];
    if (px < area.x || px > area.x + area.w || py < area.y || py > area.y + area.h) {
      readout.hidden = true;
      return;
    }
    const x = unmap(sx, (px - area.x) / area.w);
    const y = unmap(sy, 1 - (py - area.y) / area.h);
    let best: { d: number; x: number; y: number; n: number } | null = null;
    traces.forEach((t, n) => {
      for (let i = 0; i < t.x.length; i++) {
        const dx = (t.x[i]! - x) / (sx.hi - sx.lo);
        const dy = (t.y[i]! - y) / (sy.hi - sy.lo);
        const d = dx * dx + dy * dy;
        if (Number.isFinite(d) && (!best || d < best.d)) best = { d, x: t.x[i]!, y: t.y[i]!, n };
      }
    });
    if (!best) return;
    const b: { x: number; y: number; n: number } = best;
    readout.hidden = false;
    readout.textContent = `${traces.length > 1 ? `trace ${b.n + 1}: ` : ''}x = ${Number(b.x.toPrecision(6))}, y = ${Number(b.y.toPrecision(6))}`;
  });
  svg.addEventListener('mouseleave', () => {
    readout.hidden = true;
  });
}

/**
 * A polar plot: x is the angle, in radians, counterclockwise from the right, and each y a radius. Rings mark
 * the radius and spokes every 30°; a radius typed at the top end of the scale fixes the outer ring.
 */
function drawPolar(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined): void {
  const [w, h] = [c.width, c.height];
  const [hasTitle, hasX, hasY] = [c.title !== undefined, c.xAxis.title !== undefined, c.yAxis.title !== undefined];
  const m = { left: M.left + (hasY ? TITLE.left : 0), right: M.right, top: M.top + (hasTitle ? TITLE.top : 0), bottom: M.bottom + (hasX ? TITLE.bottom : 0) };
  const area = { x: m.left, y: m.top, w: Math.max(20, w - m.left - m.right), h: Math.max(20, h - m.top - m.bottom) };
  const traces = data?.traces ?? [];
  // Room round the outer ring for the angle labels.
  const R = Math.max(10, Math.min(area.w, area.h) / 2 - 12);
  const [cx, cy] = [area.x + area.w / 2, area.y + area.h / 2];
  let rmax = data?.limits.ymax;
  if (rmax === undefined) {
    let big = 0;
    for (const t of traces) for (const r of t.y) if (Number.isFinite(r)) big = Math.max(big, Math.abs(r));
    if (big > 0) {
      const t = ticks({ lo: 0, hi: big, log: false }, 4);
      const step = t.length > 1 ? t[1]! - t[0]! : big;
      rmax = Math.ceil(big / step - 1e-9) * step;
    }
  }
  const message = problem ?? traces.find((t) => t.error)?.error
    ?? (c.ys.length === 0 ? undefined : rmax === undefined || !(rmax > 0) ? 'There are no points to plot' : undefined);
  const parts: string[] = [`<svg class="plot-svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif" font-size="8">`];
  const at = (theta: number, r: number): [number, number] => [cx + (r / rmax!) * R * Math.cos(theta), cy - (r / rmax!) * R * Math.sin(theta)];
  if (rmax !== undefined && rmax > 0) {
    const rings = ticks({ lo: 0, hi: rmax, log: false }, 4).filter((r) => r > 0 && r <= rmax! * (1 + 1e-9));
    for (const r of rings) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${((r / rmax) * R).toFixed(2)}" fill="none" stroke="${r >= rmax * (1 - 1e-9) ? SECONDARY : GRID}" stroke-width="0.75"/>`);
      // The outer ring's value is the editable limit, so only the inner rings get a label.
      if (r < rmax * (1 - 1e-9)) parts.push(`<text x="${(cx + (r / rmax) * R + 2).toFixed(2)}" y="${cy - 2}" fill="${SECONDARY}">${tickText(r)}</text>`);
    }
    if (rings.length === 0 || rings[rings.length - 1]! < rmax * (1 - 1e-9)) parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${SECONDARY}" stroke-width="0.75"/>`);
    for (let deg = 0; deg < 360; deg += 30) {
      const th = (deg * Math.PI) / 180;
      const [ex, ey] = [cx + R * Math.cos(th), cy - R * Math.sin(th)];
      parts.push(`<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}" stroke="${GRID}" stroke-width="0.75"/>`);
      const [lx, ly] = [cx + (R + 7) * Math.cos(th), cy - (R + 7) * Math.sin(th) + 2.8];
      parts.push(`<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle" fill="${SECONDARY}">${deg}°</text>`);
    }
    parts.push(`<clipPath id="clip-${el.dataset.id}"><circle cx="${cx}" cy="${cy}" r="${R + 0.5}"/></clipPath>`);
    parts.push(`<g clip-path="url(#clip-${el.dataset.id})">`);
    traces.forEach((t, n) => {
      const look = traceLook(c, n);
      const usable = (i: number): boolean => Number.isFinite(t.x[i]!) && Number.isFinite(t.y[i]!);
      let d = '';
      let pen = false;
      for (let i = 0; i < t.x.length; i++) {
        if (!usable(i)) {
          pen = false;
          continue;
        }
        const [px, py] = at(t.x[i]!, t.y[i]!);
        d += `${pen ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`;
        pen = true;
      }
      if (d && look.line) parts.push(`<path d="${d}" fill="none" stroke="${look.color}" stroke-width="${look.weight}" stroke-linejoin="round" stroke-linecap="round"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}/>`);
      const points = look.points !== 'none' ? look.points : t.x.length === 1 || !look.line ? 'circle' : 'none';
      if (points !== 'none') {
        for (let i = 0; i < t.x.length; i++) {
          if (!usable(i)) continue;
          const [px, py] = at(t.x[i]!, t.y[i]!);
          parts.push(symbol(points, px, py, look.color, look.weight));
        }
      }
    });
    parts.push('</g>');
  }
  if (message) parts.push(`<text class="plot-problem" x="${cx}" y="${cy}" text-anchor="middle" fill="#c00">${esc(message)}</text>`);
  parts.push('</svg>');
  const swatch = (n: number): string => legendSwatch(c, n);
  const ys = c.ys.map((y, n) => `<div class="ylabel">${c.ys.length > 1 ? swatch(n) : ''}${markup(tex(y))}</div>`).join('');
  const limit = c.yAxis.max && data?.limits.ymax === undefined ? markup(tex(c.yAxis.max)) : rmax !== undefined ? limitNumber(rmax, c.yAxis.max ? 'typed' : 'auto') : '';
  el.innerHTML = [
    parts.join(''),
    slot('ys', ys, `left:${m.left - M.left}pt;top:${area.y}pt;width:${M.left - 26}pt;height:${area.h}pt`, 'Radius. Separate several with commas'),
    slot('x', c.x ? markup(tex(c.x)) : '', `left:${area.x}pt;width:${area.w}pt;top:${area.y + area.h + M.bottom - 16}pt`, 'Angle, in radians'),
    slot('ymax', limit, `left:${(cx + R - 26).toFixed(2)}pt;width:25pt;top:${(cy + 3).toFixed(2)}pt;justify-content:flex-end`, 'Radius of the outer ring. Leave empty to fit the data'),
    hasTitle ? slot('title', esc(c.title!), `left:${area.x}pt;width:${area.w}pt;top:0;height:${TITLE.top}pt`, 'Plot title. Click to type it; Format turns it off') : '',
    hasX ? slot('titlex', esc(c.xAxis.title!), `left:${area.x}pt;width:${area.w}pt;top:${h - TITLE.bottom}pt;height:${TITLE.bottom}pt`, 'Angle title. Click to type it; Format turns it off') : '',
    hasY ? slot('titley', esc(c.yAxis.title!), `left:0;width:${TITLE.left}pt;top:${area.y}pt;height:${area.h}pt`, 'Radius title. Click to type it; Format turns it off') : '',
    '<div class="readout" hidden></div>',
  ].join('');
  el.style.width = `${w}pt`;
  el.style.height = `${h}pt`;
  if (rmax !== undefined && rmax > 0) polarHover(el, traces, { cx, cy, R, rmax });
}

/** Shows the nearest point under the pointer, as an angle in degrees and a radius. */
function polarHover(el: HTMLElement, traces: PlotData['traces'], g: { cx: number; cy: number; R: number; rmax: number }): void {
  const svg = el.querySelector<SVGSVGElement>('.plot-svg')!;
  const readout = el.querySelector<HTMLElement>('.readout')!;
  svg.addEventListener('mousemove', (e) => {
    const box = svg.getBoundingClientRect();
    const [px, py] = [(e.clientX - box.left) * pointsPerPixel(), (e.clientY - box.top) * pointsPerPixel()];
    if (Math.hypot(px - g.cx, py - g.cy) > g.R) {
      readout.hidden = true;
      return;
    }
    let best: { d: number; th: number; r: number; n: number } | null = null;
    traces.forEach((t, n) => {
      for (let i = 0; i < t.x.length; i++) {
        const [th, r] = [t.x[i]!, t.y[i]!];
        if (!Number.isFinite(th) || !Number.isFinite(r)) continue;
        const qx = g.cx + (r / g.rmax) * g.R * Math.cos(th);
        const qy = g.cy - (r / g.rmax) * g.R * Math.sin(th);
        const d = (qx - px) ** 2 + (qy - py) ** 2;
        if (!best || d < best.d) best = { d, th, r, n };
      }
    });
    if (!best) return;
    const b: { th: number; r: number; n: number } = best;
    readout.hidden = false;
    readout.textContent = `${traces.length > 1 ? `trace ${b.n + 1}: ` : ''}θ = ${Number(((b.th * 180) / Math.PI).toPrecision(5))}°, r = ${Number(b.r.toPrecision(6))}`;
  });
  svg.addEventListener('mouseleave', () => {
    readout.hidden = true;
  });
}

/** The resistances and reactances, normalized to Z0, that a Smith chart's grid marks. */
const SMITH_GRID = [0.2, 0.5, 1, 2, 5];

/** A number for a readout, to four figures. */
const short = (v: number): string => String(Number(v.toPrecision(4)));

/**
 * A Smith chart: each y is complex reflection coefficients Γ, drawn in the unit circle. Circles of constant
 * normalized resistance and arcs of constant reactance mark z = (1 + Γ)/(1 − Γ); the centre is a match.
 */
function drawSmith(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined): void {
  const [w, h] = [c.width, c.height];
  const [hasTitle, hasX, hasY] = [c.title !== undefined, c.xAxis.title !== undefined, c.yAxis.title !== undefined];
  const m = { left: M.left + (hasY ? TITLE.left : 0), right: M.right, top: M.top + (hasTitle ? TITLE.top : 0), bottom: M.bottom + (hasX ? TITLE.bottom : 0) };
  const area = { x: m.left, y: m.top, w: Math.max(20, w - m.left - m.right), h: Math.max(20, h - m.top - m.bottom) };
  const traces = data?.traces ?? [];
  // Room round the rim for the reactance labels.
  const R = Math.max(10, Math.min(area.w, area.h) / 2 - 14);
  const [cx, cy] = [area.x + area.w / 2, area.y + area.h / 2];
  const at = (re: number, im: number): [number, number] => [cx + re * R, cy - im * R];
  const f = (v: number): string => v.toFixed(2);
  const parts: string[] = [`<svg class="plot-svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif" font-size="7">`];
  const clip = `smith-${el.dataset.id}`;
  parts.push(`<clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>`, `<g clip-path="url(#${clip})">`);
  for (const r of SMITH_GRID) {
    // Constant resistance r: centre r/(1 + r), radius 1/(1 + r).
    const [ox] = at(r / (1 + r), 0);
    parts.push(`<circle cx="${f(ox)}" cy="${cy}" r="${f(R / (1 + r))}" fill="none" stroke="${GRID}" stroke-width="0.75"/>`);
  }
  for (const x of SMITH_GRID) {
    // Constant reactance ±x: centre 1 ± j/x, radius 1/x, inside the rim only.
    for (const sign of [1, -1]) {
      const [ox, oy] = at(1, sign / x);
      parts.push(`<circle cx="${f(ox)}" cy="${f(oy)}" r="${f(R / x)}" fill="none" stroke="${GRID}" stroke-width="0.75"/>`);
    }
  }
  parts.push(`<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="${GRID}" stroke-width="0.75"/>`, '</g>');
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${SECONDARY}" stroke-width="0.75"/>`);
  // Resistances along the real axis, at Γ = (r − 1)/(r + 1); reactances round the rim, at z = ±jx.
  for (const r of [0, ...SMITH_GRID]) {
    const [lx] = at((r - 1) / (r + 1), 0);
    parts.push(`<text x="${f(lx + 1.5)}" y="${cy - 2}" fill="${SECONDARY}">${short(r)}</text>`);
  }
  for (const x of SMITH_GRID) {
    for (const sign of [1, -1]) {
      const [gr, gi] = [(x * x - 1) / (x * x + 1), (sign * 2 * x) / (x * x + 1)];
      const len = Math.hypot(gr, gi);
      const [lx, ly] = [cx + (gr / len) * (R + 8), cy - (gi / len) * (R + 8) + 2.5];
      parts.push(`<text x="${f(lx)}" y="${f(ly)}" text-anchor="middle" fill="${SECONDARY}">${sign > 0 ? '' : '−'}j${short(x)}</text>`);
    }
  }
  parts.push(`<g clip-path="url(#${clip})">`);
  traces.forEach((t, n) => {
    const look = traceLook(c, n);
    const usable = (i: number): boolean => Number.isFinite(t.x[i]!) && Number.isFinite(t.y[i]!);
    let d = '';
    let pen = false;
    for (let i = 0; i < t.x.length; i++) {
      if (!usable(i)) {
        pen = false;
        continue;
      }
      const [px, py] = at(t.x[i]!, t.y[i]!);
      d += `${pen ? 'L' : 'M'}${f(px)} ${f(py)}`;
      pen = true;
    }
    if (d && look.line) parts.push(`<path d="${d}" fill="none" stroke="${look.color}" stroke-width="${look.weight}" stroke-linejoin="round" stroke-linecap="round"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}/>`);
    const points = look.points !== 'none' ? look.points : t.x.length === 1 || !look.line ? 'circle' : 'none';
    if (points !== 'none') {
      for (let i = 0; i < t.x.length; i++) {
        if (!usable(i)) continue;
        const [px, py] = at(t.x[i]!, t.y[i]!);
        parts.push(symbol(points, px, py, look.color, look.weight));
      }
    }
  });
  parts.push('</g>');
  const message = problem ?? traces.find((t) => t.error)?.error;
  if (message) parts.push(`<text class="plot-problem" x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#c00" font-size="8">${esc(message)}</text>`);
  parts.push('</svg>');
  const swatch = (n: number): string => legendSwatch(c, n);
  const ys = c.ys.map((y, n) => `<div class="ylabel">${c.ys.length > 1 ? swatch(n) : ''}${markup(tex(y))}</div>`).join('');
  el.innerHTML = [
    parts.join(''),
    slot('ys', ys, `left:${m.left - M.left}pt;top:${area.y}pt;width:${M.left - 26}pt;height:${area.h}pt`, 'Reflection coefficients Γ. Separate several with commas'),
    slot('x', c.x ? markup(tex(c.x)) : '', `left:${area.x}pt;width:${area.w}pt;top:${area.y + area.h + M.bottom - 16}pt`, 'What Γ is swept over, as a frequency, shown on hover. Optional'),
    hasTitle ? slot('title', esc(c.title!), `left:${area.x}pt;width:${area.w}pt;top:0;height:${TITLE.top}pt`, 'Plot title. Click to type it; Format turns it off') : '',
    hasX ? slot('titlex', esc(c.xAxis.title!), `left:${area.x}pt;width:${area.w}pt;top:${h - TITLE.bottom}pt;height:${TITLE.bottom}pt`, 'Swept value title. Click to type it; Format turns it off') : '',
    hasY ? slot('titley', esc(c.yAxis.title!), `left:0;width:${TITLE.left}pt;top:${area.y}pt;height:${area.h}pt`, 'Γ title. Click to type it; Format turns it off') : '',
    '<div class="readout" hidden></div>',
  ].join('');
  el.style.width = `${w}pt`;
  el.style.height = `${h}pt`;
  smithHover(el, traces, { cx, cy, R });
}

/** Shows the nearest point under the pointer: Γ as magnitude and angle, z normalized to Z0, and the swept value. */
function smithHover(el: HTMLElement, traces: PlotData['traces'], g: { cx: number; cy: number; R: number }): void {
  const svg = el.querySelector<SVGSVGElement>('.plot-svg')!;
  const readout = el.querySelector<HTMLElement>('.readout')!;
  svg.addEventListener('mousemove', (e) => {
    const box = svg.getBoundingClientRect();
    const [px, py] = [(e.clientX - box.left) * pointsPerPixel(), (e.clientY - box.top) * pointsPerPixel()];
    if (Math.hypot(px - g.cx, py - g.cy) > g.R) {
      readout.hidden = true;
      return;
    }
    let best: { d: number; i: number; n: number } | null = null;
    traces.forEach((t, n) => {
      for (let i = 0; i < t.x.length; i++) {
        if (!Number.isFinite(t.x[i]!) || !Number.isFinite(t.y[i]!)) continue;
        const d = (g.cx + t.x[i]! * g.R - px) ** 2 + (g.cy - t.y[i]! * g.R - py) ** 2;
        if (!best || d < best.d) best = { d, i, n };
      }
    });
    if (!best) return;
    const b: { i: number; n: number } = best;
    const t = traces[b.n]!;
    const [gr, gi] = [t.x[b.i]!, t.y[b.i]!];
    // z = (1 + Γ)/(1 − Γ)
    const [nr, ni, dr, di] = [1 + gr, gi, 1 - gr, -gi];
    const q = dr * dr + di * di;
    const [zr, zi] = [(nr * dr + ni * di) / q, (ni * dr - nr * di) / q];
    const z = q === 0 ? '∞' : `${short(zr)} ${zi < 0 ? '−' : '+'} ${short(Math.abs(zi))}j`;
    const swept = t.param ? `x = ${short(t.param[b.i]!)}, ` : '';
    readout.hidden = false;
    readout.textContent = `${traces.length > 1 ? `trace ${b.n + 1}: ` : ''}${swept}Γ = ${short(Math.hypot(gr, gi))}∠${short((Math.atan2(gi, gr) * 180) / Math.PI)}°, z = ${z}`;
  });
  svg.addEventListener('mouseleave', () => {
    readout.hidden = true;
  });
}
