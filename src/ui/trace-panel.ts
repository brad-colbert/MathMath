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
 * A panel for the selected plot's trace styles: color, line, weight and point symbol for each trace, as
 * Mathcad's trace format offers. Changes apply as they're made. Styles only change how a plot looks, so
 * nothing recalculates.
 */
import type { Doc } from '../app/document.js';
import { tex } from '../latex/latex.js';
import type { Content, Region, TraceStyle } from '../model/ast.js';
import { mathMarkup } from './markup.js';
import { SERIES, traceLook } from './plot.js';

type Plot = Extract<Content, { k: 'plot' }>;
/** A change to a style: a value sets it, undefined goes back to the default for that part. */
type StylePatch = { [K in keyof TraceStyle]?: TraceStyle[K] | undefined };

/** The plot with trace n's style changed. An empty style goes back to the defaults. */
export function withTraceStyle(c: Plot, n: number, change: StylePatch | null): Plot {
  const traces = Array.from({ length: c.ys.length }, (_, i) => c.traces?.[i] ?? null);
  const next: StylePatch = change === null ? {} : { ...(traces[n] ?? {}), ...change };
  for (const key of Object.keys(next) as (keyof TraceStyle)[]) if (next[key] === undefined) delete next[key];
  traces[n] = Object.keys(next).length > 0 ? (next as TraceStyle) : null;
  const { traces: _, ...rest } = c;
  return traces.some((t) => t !== null) ? { ...rest, traces } : rest;
}

const LINES: [NonNullable<TraceStyle['line']> | '', string][] = [['', 'Automatic'], ['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted'], ['dashdot', 'Dash-dot'], ['none', 'None']];
const WEIGHTS: [number, string][] = [[1, 'Thin'], [1.5, 'Normal'], [2.5, 'Thick'], [3.5, 'Heavy']];
const POINTS: [NonNullable<TraceStyle['points']> | '', string][] = [['', 'Automatic'], ['none', 'None'], ['circle', 'Circle'], ['square', 'Square'], ['triangle', 'Triangle'], ['cross', 'Cross']];

export class TracePanel {
  private el = document.createElement('div');
  private regionId: string | null = null;

  constructor(private doc: Doc) {
    this.el.id = 'trace-panel';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Trace styles');
    document.body.appendChild(this.el);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(region: Region): void {
    this.regionId = region.id;
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
    this.regionId = null;
  }

  /** Redraws from the sheet, after an undo or when the plot's traces change. */
  refresh(): void {
    if (!this.el.hidden) this.render();
  }

  private plot(): { region: Region; c: Plot } | null {
    const item = this.regionId ? this.doc.find(this.regionId) : undefined;
    if (item?.kind !== 'math' || item.region.content.k !== 'plot') return null;
    return { region: item.region, c: item.region.content };
  }

  private change(n: number, style: StylePatch | null): void {
    const p = this.plot();
    if (!p) return;
    this.doc.update(p.region, (c) => (c.k === 'plot' ? withTraceStyle(c, n, style) : c));
    this.render();
  }

  private render(): void {
    const p = this.plot();
    if (!p) {
      this.close();
      return;
    }
    const { c } = p;
    this.el.replaceChildren();
    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('span');
    title.textContent = 'Trace styles';
    const close = document.createElement('button');
    close.textContent = 'Done';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    this.el.appendChild(head);
    if (c.ys.length === 0) {
      const none = document.createElement('p');
      none.textContent = 'This plot has no traces yet. Type a y expression first.';
      this.el.appendChild(none);
      return;
    }
    c.ys.forEach((y, n) => {
      const look = traceLook(c, n);
      const style = c.traces?.[n] ?? {};
      const row = document.createElement('div');
      row.className = 'trace';
      const name = document.createElement('div');
      name.className = 'name';
      try {
        name.innerHTML = mathMarkup(tex(y));
      } catch {
        name.textContent = `Trace ${n + 1}`;
      }
      row.appendChild(name);

      // Colors: the validated palette, then any color.
      const colors = document.createElement('div');
      colors.className = 'colors';
      for (const color of SERIES) {
        const b = document.createElement('button');
        b.className = `swatch${look.color.toLowerCase() === color ? ' on' : ''}`;
        b.style.background = color;
        b.title = color;
        b.setAttribute('aria-label', `Color ${color}`);
        b.addEventListener('click', () => this.change(n, { color }));
        colors.appendChild(b);
      }
      const any = document.createElement('input');
      any.type = 'color';
      any.value = look.color;
      any.title = 'Any color';
      any.addEventListener('change', () => this.change(n, { color: any.value }));
      colors.appendChild(any);
      row.appendChild(colors);

      const select = <T extends string | number>(label: string, options: [T, string][], current: T, set: (v: T) => void): HTMLElement => {
        const wrap = document.createElement('label');
        wrap.textContent = `${label} `;
        const s = document.createElement('select');
        for (const [value, text] of options) {
          const o = document.createElement('option');
          o.value = String(value);
          o.textContent = text;
          if (value === current) o.selected = true;
          s.appendChild(o);
        }
        s.addEventListener('change', () => set(options.find(([v]) => String(v) === s.value)![0]));
        wrap.appendChild(s);
        return wrap;
      };
      const controls = document.createElement('div');
      controls.className = 'controls';
      controls.append(
        select('Line', LINES, style.line ?? '', (v) => this.change(n, { line: v || undefined })),
        select('Weight', WEIGHTS, style.weight ?? 1.5, (v) => this.change(n, { weight: v })),
        select('Points', POINTS, style.points ?? '', (v) => this.change(n, { points: v || undefined })),
      );
      const reset = document.createElement('button');
      reset.textContent = 'Default';
      reset.title = 'Back to the plot\'s default style for this trace';
      reset.addEventListener('click', () => this.change(n, null));
      controls.appendChild(reset);
      row.appendChild(controls);
      this.el.appendChild(row);
    });
  }
}
