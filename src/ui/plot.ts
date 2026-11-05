/**
 * Draws a plot as SVG, which prints as sharp vectors and matches the screen. Axis expressions and
 * limits are slots, edited in place like Mathcad's placeholders.
 */
import { convertLatexToMarkup } from 'mathlive';
import type { PlotData } from '../engine/evaluate.js';
import { tex } from '../latex/latex.js';
import type { Content, TraceStyle } from '../model/ast.js';

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
    return convertLatexToMarkup(latex);
  } catch {
    return esc(latex);
  }
}

const slot = (name: string, html: string, style: string, hint: string): string =>
  `<div class="slot${html ? '' : ' empty'}" data-slot="${name}" title="${hint}" style="${style}">${html || '&#9632;'}</div>`;

/** Room taken by each title, in points. The plot keeps its size, so its area shrinks to fit them. */
const TITLE = { top: 13, left: 11, bottom: 11 };

export function drawPlot(el: HTMLElement, c: Plot, data: PlotData | undefined, problem: string | undefined): void {
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
  const swatch = (n: number): string => {
    const look = traceLook(c, n);
    const line = look.line ? `<line x1="0" y1="4" x2="16" y2="4" stroke="${look.color}" stroke-width="${look.weight}"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}/>` : '';
    const mark = look.points !== 'none' || !look.line ? symbol(look.points !== 'none' ? look.points : 'circle', 8, 4, look.color, Math.min(look.weight, 1.5)) : '';
    return `<svg width="16pt" height="8pt" viewBox="0 0 16 8">${line}${mark}</svg>`;
  };
  // Each axis's unit sits after its expression: gray when it's the default, and clicked to choose another.
  const labels = data?.labels;
  const unit = (name: 'xunit' | 'yunit', latex: string | undefined, chosen: boolean | undefined): string => (latex
    ? `<span class="axis-unit${chosen ? '' : ' auto'}" data-slot="${name}" title="${chosen ? 'The unit this axis shows. Clear it for the default' : 'The default unit. Click to show the axis in another, such as ft'}">(${markup(latex)})</span>`
    : '');
  const ys = c.ys.map((y, n) => `<div class="ylabel">${c.ys.length > 1 ? swatch(n) : ''}${markup(tex(y))}</div>`).join('')
    + unit('yunit', labels?.y, labels?.yChosen);
  const limit = (e: Plot['xAxis']['min'], auto: number | undefined): string => (e ? markup(tex(e)) : auto !== undefined ? `<span class="auto">${esc(label(auto)).replace(/10\^(-?\d+)$/, '10<sup>$1</sup>')}</span>` : '');
  const auto = (s: Scale | string): { lo?: number; hi?: number } => (typeof s === 'string' ? {} : { lo: s.lo, hi: s.hi });
  const [ax, ay] = [auto(sx), auto(sy)];
  const below = area.y + area.h;
  const html = [
    parts.join(''),
    slot('ys', ys, `left:${m.left - M.left}pt;top:${area.y}pt;width:${M.left - 26}pt;height:${area.h}pt`, 'y values. Separate several with commas'),
    slot('x', c.x ? `${markup(tex(c.x))}${unit('xunit', labels?.x, labels?.xChosen)}` : '', `left:${area.x}pt;width:${area.w}pt;top:${below + M.bottom - 16}pt`, 'x values'),
    slot('ymax', limit(c.yAxis.max, ay.hi), `left:${area.x - 28}pt;width:25pt;top:${area.y - 4}pt;justify-content:flex-end`, 'Top of the y axis. Leave empty to fit the data'),
    slot('ymin', limit(c.yAxis.min, ay.lo), `left:${area.x - 28}pt;width:25pt;top:${below - 7}pt;justify-content:flex-end`, 'Bottom of the y axis. Leave empty to fit the data'),
    slot('xmin', limit(c.xAxis.min, ax.lo), `left:${area.x - 4}pt;top:${below + 2}pt`, 'Left end of the x axis. Leave empty to fit the data'),
    slot('xmax', limit(c.xAxis.max, ax.hi), `left:${area.x + area.w - 28}pt;top:${below + 2}pt;justify-content:flex-end;width:32pt`, 'Right end of the x axis. Leave empty to fit the data'),
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
    const [px, py] = [(e.clientX - box.left) / PT, (e.clientY - box.top) / PT];
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
