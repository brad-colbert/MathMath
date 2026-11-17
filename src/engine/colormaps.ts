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
 * Colour maps for surface and contour plots: how heights become colours. A map is rows of red, green and blue,
 * 0 to 255, lowest height first; between rows the colour is interpolated, as Mathcad interpolates a map of fewer
 * than 256 rows.
 *
 * MathMath has five maps of its own, named so as not to be mistaken for Mathcad's eight map files (Blues, Fire,
 * Gamma, Greens, Neon, Reds, Royal and topograf, which a sheet may attach). SaveColormap adds more to a sheet, and
 * an attached Mathcad .cmp file is one too. Mathcad 14 (probed 2026-11-16): a map is an n × 3 matrix of real
 * numbers without units, at least two rows, any number of them; each value is truncated toward 0 and then held to
 * 0..255; SaveColormap gives the number of rows. Its .cmp file is the text "Mathsoft Colormap" after a byte giving
 * its length, the number of rows as a 4-byte little-endian integer, then 4 bytes a row: red, green, blue and 0.
 */
import { EvalError, type Mat, type Value, fromValues, getEl, isNoDim, num } from './values.js';

export type MapRows = number[][];

/**
 * Viridis, the perceptually even map by Nathaniel Smith and Stéfan van der Walt, which they released under CC0 (the
 * BIDS/colormap project), at ten stops, checked against matplotlib 3.11's.
 */
const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
/** MathMath's own ramp, light to dark blue, which plots have always used. */
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

const fromHex = (stops: string[]): MapRows => stops.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
const sampled = (f: (t: number) => number[], n = 256): MapRows => Array.from({ length: n }, (_, k) => f(k / (n - 1)).map((v) => Math.round(Math.min(255, Math.max(0, v)))));

/** A hue, 0 to 360 degrees, at full saturation and value, as red, green and blue 0..255. */
function hue(h: number): number[] {
  const k = (n: number): number => (n + h / 60) % 6;
  const f = (n: number): number => 255 * (1 - Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [f(5), f(3), f(1)];
}

/** The built-in maps, by name. The first is the default. */
export const BUILTIN_MAPS: Record<string, MapRows> = {
  ramp: fromHex(RAMP),
  gray: [[0, 0, 0], [255, 255, 255]],
  spectrum: sampled((t) => hue(240 * (1 - t))),
  viridis: fromHex(VIRIDIS),
  heat: sampled((t) => [765 * t, 765 * t - 255, 765 * t - 510]),
};
export const DEFAULT_MAP = 'ramp';

/** One of MathMath's own maps by name, whatever its case; only its own, so a name like "constructor" finds none. */
export function builtinMap(name: string): MapRows | undefined {
  const key = name.toLowerCase();
  return Object.hasOwn(BUILTIN_MAPS, key) ? BUILTIN_MAPS[key] : undefined;
}

/** The colour at t, 0 (lowest) to 1 (highest), interpolated between the map's rows. */
export function mapColor(rows: MapRows, t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0.5)) * (rows.length - 1);
  const i = Math.min(rows.length - 2, Math.floor(x));
  const f = x - i;
  const a = rows[i]!;
  const b = rows[i + 1] ?? a;
  return [0, 1, 2].map((c) => Math.round(a[c]! + (b[c]! - a[c]!) * f)) as [number, number, number];
}

/** A matrix as a map, as Mathcad's SaveColormap takes it: n × 3, two rows or more, values truncated and held to 0..255. */
export function mapFromMatrix(v: Value | undefined, fn: string): MapRows {
  if (v?.t !== 'mat' || v.cols !== 3) throw new EvalError('runtime', `${fn} takes a matrix of 3 columns, red, green and blue, a row for each colour`);
  if (v.rows < 2) throw new EvalError('runtime', `${fn} takes at least two rows: a colour for the lowest heights and one for the highest`);
  if (!isNoDim(v.dim)) throw new EvalError('runtime', `${fn} takes numbers without units, 0 to 255`);
  const rows: MapRows = [];
  for (let i = 0; i < v.rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < 3; j++) {
      const x = getEl(v, i, j);
      if (x.t !== 'num' || x.im !== 0 || !isNoDim(x.dim)) throw new EvalError('runtime', `${fn} takes real numbers without units, 0 to 255`);
      row.push(Math.min(255, Math.max(0, Math.trunc(x.re))));
    }
    rows.push(row);
  }
  return rows;
}

/** A map as the matrix LoadColormap gives: a row a colour. fromValues fills column by column. */
export function mapMatrix(rows: MapRows): Mat {
  return fromValues(rows.length, 3, [0, 1, 2].flatMap((j) => rows.map((r) => num(r[j]!))));
}

const HEADER = 'Mathsoft Colormap';

/** A map as Mathcad's .cmp file. */
export function writeCmp(rows: MapRows): Uint8Array {
  const out = new Uint8Array(1 + HEADER.length + 4 + 4 * rows.length);
  out[0] = HEADER.length;
  for (let k = 0; k < HEADER.length; k++) out[1 + k] = HEADER.charCodeAt(k);
  new DataView(out.buffer).setUint32(1 + HEADER.length, rows.length, true);
  rows.forEach((r, i) => out.set([r[0]!, r[1]!, r[2]!, 0], 1 + HEADER.length + 4 + 4 * i));
  return out;
}

/** Mathcad's .cmp file as a map, or why it can't be read. */
export function readCmp(bytes: Uint8Array): MapRows | string {
  const n = bytes[0] ?? 0;
  const header = String.fromCharCode(...bytes.subarray(1, 1 + n));
  if (header !== HEADER || bytes.length < 1 + n + 4) return "This isn't a Mathcad colour map (.cmp) file";
  const count = new DataView(bytes.buffer, bytes.byteOffset).getUint32(1 + n, true);
  const at = 1 + n + 4;
  if (count < 2) return 'A colour map needs at least two colours, and this file has fewer';
  if (bytes.length < at + 4 * count) return 'This colour map file is cut short';
  return Array.from({ length: count }, (_, i) => [bytes[at + 4 * i]!, bytes[at + 4 * i + 1]!, bytes[at + 4 * i + 2]!]);
}

/** Whether a file is a colour map, by its name. */
export const isCmpFile = (name: string): boolean => /\.cmp$/i.test(name);
