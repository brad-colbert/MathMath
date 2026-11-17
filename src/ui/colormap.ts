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
 * The colour map a surface or contour plot names, found as LoadColormap finds one: saved in the sheet above the
 * plot, then an attached Mathcad .cmp file, then one of MathMath's own. Found on the page, not in the calculation,
 * so choosing a map only redraws.
 */
import { BUILTIN_MAPS, DEFAULT_MAP, type MapRows, builtinMap, isCmpFile, mapColor, readCmp } from '../engine/colormaps.js';
import type { PlotData } from '../engine/evaluate.js';
import { fileKey } from '../engine/files.js';
import type { Worksheet } from '../model/ast.js';

/** The rows to draw with, none for MathMath's ramp; or why the named map couldn't be found. */
export function paletteFor(name: string | undefined, data: PlotData | undefined, assets: Worksheet['assets']): { rows?: MapRows; problem?: string } {
  if (!name || name.toLowerCase() === DEFAULT_MAP) return {};
  const key = name.toLowerCase();
  const saved = data?.maps?.find(([n]) => n.toLowerCase() === key);
  if (saved) return { rows: saved[1] };
  const file = fileKey(isCmpFile(name) ? name : `${name}.cmp`);
  const asset = Object.entries(assets).find(([n]) => fileKey(n) === file)?.[1];
  if (asset) {
    const rows = readCmp(Uint8Array.from(atob(asset.data), (ch) => ch.charCodeAt(0)));
    return typeof rows === 'string' ? { problem: `${name}.cmp: ${rows}` } : { rows };
  }
  const builtin = builtinMap(name);
  if (builtin) return { rows: builtin };
  return { problem: `No colour map named ${name}: save one with SaveColormap above the plot, or attach ${name}.cmp with Files. Drawn in MathMath's ramp meanwhile` };
}

/** The maps a plot can choose from: MathMath's own, those saved in the sheet above it, and attached .cmp files. */
export function mapChoices(data: PlotData | undefined, assets: Worksheet['assets']): string[] {
  const saved = (data?.maps ?? []).map(([n]) => n);
  const attached = Object.keys(assets).filter(isCmpFile).map((n) => n.replace(/\.cmp$/i, ''));
  const seen = new Set<string>();
  return [...Object.keys(BUILTIN_MAPS), ...saved, ...attached].filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
}

/** A map as a CSS gradient, left (lowest) to right (highest), for a swatch. */
export function swatch(rows: MapRows): string {
  const n = Math.min(24, Math.max(2, rows.length));
  const stops = Array.from({ length: n }, (_, k) => `rgb(${mapColor(rows, k / (n - 1)).join(',')}) ${((k / (n - 1)) * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * The list Format's Color map… opens under the toolbar: each map a swatch and its name, the plot's own marked.
 * Picking one, or Escape or a click elsewhere, closes it.
 */
export function chooseMap(anchor: HTMLElement, names: string[], current: string | undefined, rowsOf: (name: string) => MapRows | undefined, pick: (name: string) => void, defaultName: string = DEFAULT_MAP): void {
  document.querySelector('.map-chooser')?.remove();
  const box = document.createElement('div');
  box.className = 'map-chooser';
  box.setAttribute('role', 'menu');
  const r = anchor.getBoundingClientRect();
  box.style.left = `${r.left}px`;
  box.style.top = `${r.bottom + 4}px`;
  const close = (): void => {
    box.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', escape, true);
  };
  const outside = (e: MouseEvent): void => {
    if (!box.contains(e.target as Node)) close();
  };
  const escape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const chosen = (current ?? defaultName).toLowerCase();
  for (const name of names) {
    const rows = rowsOf(name);
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(name.toLowerCase() === chosen));
    const bar = document.createElement('span');
    bar.className = 'swatch';
    if (rows) bar.style.background = swatch(rows);
    b.append(bar, document.createTextNode(name === defaultName ? `${name} (${name === DEFAULT_MAP ? 'MathMath\'s, ' : ''}the default)` : name));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      close();
      pick(name);
    });
    box.appendChild(b);
  }
  document.body.appendChild(box);
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', escape, true);
}
