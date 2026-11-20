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
 * Converting Mathcad's file functions to MathMath's (Brad, 2026-11-11: they stay grayed, with a message naming
 * the replacement and an offer to convert). A call converts only where the MathMath expression gives the same
 * numbers, as probed in Mathcad 14: `READRGB("a.bmp")` becomes `readImage("a.bmp")`, and so on (CONVERSIONS).
 * Some need the attached file to know how: READWAV's scale depends on the file's bits per sample.
 */
import type { Content, Expr, Region, Stmt, Target } from '../model/ast.js';
import type { DecodedAudio } from './wav.js';
import { parseTable } from './table.js';
import type { Value } from './values.js';

/** What a conversion may look at: the ORIGIN where the region is, for channel numbers, and its attached sound files. */
export interface ConvertContext {
  origin: number;
  audio(name: string): DecodedAudio | string | undefined;
  /** An attached data file's text. */
  table(name: string): string | undefined;
  /** File names, without folders, that the sheet reads from more than one folder: converting would merge them. */
  clashes?: Set<string>;
}

/** A converter: the call's arguments to MathMath's expression, or a reason it can't convert yet. */
type Converter = (args: Expr[], ctx: ConvertContext) => Expr | { cannot: string };

const call = (name: string, ...args: Expr[]): Expr => ({ k: 'call', fn: { k: 'id', name }, args });
const times = (a: Expr, b: Expr): Expr => ({ k: 'op', op: 'mult', args: [a, b] });
const real = (v: number): Expr => ({ k: 'real', v });


/** Applies f to every call in e, innermost first; f returns a replacement or null to keep the call. */
export function mapCalls(e: Expr, f: (c: Extract<Expr, { k: 'call' }>) => Expr | null): Expr {
  const m = (x: Expr): Expr => mapCalls(x, f);
  switch (e.k) {
    case 'matrix': return { ...e, items: e.items.map(m) };
    case 'range': return { ...e, first: m(e.first), second: e.second && m(e.second), last: m(e.last) };
    case 'op': return { ...e, args: e.args.map(m) };
    case 'call': {
      const inner = { ...e, fn: m(e.fn), args: e.args.map(m) };
      return f(inner) ?? inner;
    }
    case 'bigop': return { ...e, body: m(e.body), lo: e.lo && m(e.lo), hi: e.hi && m(e.hi) };
    case 'derivative': return { ...e, body: m(e.body), ...(e.degree ? { degree: m(e.degree) } : {}) };
    case 'limit': return { ...e, body: m(e.body), to: m(e.to) };
    case 'program': return { ...e, body: e.body.map((s) => mapStmt(s, f)) };
    default: return e;
  }
}

function mapStmt(s: Stmt, f: (c: Extract<Expr, { k: 'call' }>) => Expr | null): Stmt {
  const m = (x: Expr): Expr => mapCalls(x, f);
  switch (s.k) {
    case 'assign': return { ...s, target: mapTarget(s.target, f), value: m(s.value) };
    case 'if': return { ...s, cond: m(s.cond), then: mapStmt(s.then, f) };
    case 'otherwise': return { ...s, then: mapStmt(s.then, f) };
    case 'for': return { ...s, iter: m(s.iter), body: mapStmt(s.body, f) };
    case 'while': return { ...s, cond: m(s.cond), body: mapStmt(s.body, f) };
    case 'return': return { ...s, value: m(s.value) };
    case 'block': return { ...s, body: s.body.map((x) => mapStmt(x, f)) };
    default: return s;
  }
}

function mapTarget(t: Target, f: (c: Extract<Expr, { k: 'call' }>) => Expr | null): Target {
  if (t.k === 'index') return { ...t, index: t.index.map((x) => mapCalls(x, f)) };
  if (t.k === 'col') return { ...t, index: mapCalls(t.index, f) };
  if (t.k === 'multi') return { ...t, targets: t.targets.map((x) => mapTarget(x, f)) };
  return t;
}

/** The expressions of a region's content, rewritten by f; the content itself when nothing changed. */
function mapContent(c: Content, f: (c: Extract<Expr, { k: 'call' }>) => Expr | null): Content {
  const m = (x: Expr): Expr => mapCalls(x, f);
  switch (c.k) {
    case 'define': return { ...c, target: mapTarget(c.target, f), value: m(c.value) };
    case 'eval': return { ...c, expr: m(c.expr) };
    case 'sym': return { ...c, expr: m(c.expr) };
    case 'show': return { ...c, expr: m(c.expr) };
    case 'image': return c.expr ? { ...c, expr: m(c.expr) } : c;
    case 'plot': return { ...c, x: c.x && m(c.x), ys: c.ys.map(m) };
    default: return c;
  }
}

/** One Mathcad call found in a region, and what converting it would do. */
export interface Found {
  name: string;
  /** The MathMath function it becomes, for the message. */
  to: string;
  /** Why it can't convert yet, as "it needs a.wav attached", or undefined when it can. */
  cannot?: string;
}


/**
 * The ORIGIN where `at` stands: a global definition of it anywhere, or else the last definition above, read from the
 * page as calculation reads it (down, then across); the sheet's setting when there's none. Only a plain number counts.
 */
export function originAt(regions: Region[], at: Region, sheet: number): number {
  const value = (r: Region): number | null => {
    const c = r.content;
    if (r.disabled || c.k !== 'define' || c.target.k !== 'var' || c.target.name !== 'ORIGIN') return null;
    const v = c.value;
    const n = v.k === 'real' ? v.v : v.k === 'op' && v.op === 'neg' && v.args[0]?.k === 'real' ? -v.args[0].v : null;
    return n !== null && Number.isInteger(n) ? n : null;
  };
  const global = regions.filter((r) => r.content.k === 'define' && r.content.global && value(r) !== null);
  if (global.length > 0) return value(global.at(-1)!)!;
  const above = regions.filter((r) => value(r) !== null && (r.alignY < at.alignY || (r.alignY === at.alignY && r.alignX < at.alignX)));
  above.sort((a, b) => a.alignY - b.alignY || a.alignX - b.alignX);
  return above.length > 0 ? value(above.at(-1)!)! : sheet;
}
/** The Mathcad file-function calls in a region's content that a conversion knows. */
export function findConvertible(c: Content, ctx: ConvertContext): Found[] {
  const found: Found[] = [];
  mapContent(c, (e) => {
    if (e.fn.k !== 'id') return null;
    const conv = CONVERSIONS[e.fn.name];
    if (!conv) return null;
    const out = conv.convert(e.args, ctx);
    found.push({ name: e.fn.name, to: conv.to, ...('cannot' in out ? { cannot: out.cannot } : {}) });
    return null;
  });
  return found;
}

/** The content with every convertible call converted, or null if none could be. */
export function convertContent(c: Content, ctx: ConvertContext): Content | null {
  let changed = false;
  const out = mapContent(c, (e) => {
    if (e.fn.k !== 'id') return null;
    const conv = CONVERSIONS[e.fn.name];
    if (!conv) return null;
    const r = conv.convert(e.args, ctx);
    if ('cannot' in r) return null;
    changed = true;
    return r;
  });
  return changed ? out : null;
}


const plus = (a: Expr, b: Expr): Expr => ({ k: 'op', op: 'plus', args: [a, b] });
const str = (v: string): Extract<Expr, { k: 'str' }> => ({ k: 'str', v });

const base = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * The file argument as MathMath reads it: an attached file's name, its folder dropped, since Mathcad's paths were
 * its own computer's. Only a name written in quotes converts, and not one the sheet reads from two folders.
 */
function file(args: Expr[], ctx: ConvertContext): Extract<Expr, { k: 'str' }> | { cannot: string } {
  const a = args[0];
  if (a?.k !== 'str') return { cannot: 'its file name isn\'t written in quotes' };
  const name = base(a.v);
  if (ctx.clashes?.has(name.toLowerCase())) return { cannot: `the sheet reads ${name} from more than one folder` };
  return str(name);
}

/** A conversion of the call's file: f of the file's name, or why it can't convert. */
const withFile = (f: (name: Extract<Expr, { k: 'str' }>, ctx: ConvertContext) => Expr | { cannot: string }): Converter => (args, ctx) => {
  const name = file(args, ctx);
  return 'cannot' in name ? name : f(name, ctx);
};

/** The base names a sheet's Mathcad file calls read from more than one folder. */
export function fileClashes(contents: Content[]): Set<string> {
  const seen = new Map<string, Set<string>>();
  for (const c of contents) {
    mapContent(c, (e) => {
      const a = e.args[0];
      if (e.fn.k === 'id' && CONVERSIONS[e.fn.name] && a?.k === 'str') {
        const key = base(a.v).toLowerCase();
        seen.set(key, (seen.get(key) ?? new Set()).add(a.v.toLowerCase()));
      }
      return null;
    });
  }
  return new Set([...seen].filter(([, paths]) => paths.size > 1).map(([k]) => k));
}

const image = (f: Expr): Expr => call('readImage', f);
/** One channel of a packed image, by its place: 0, 1 or 2 from the sheet's ORIGIN. */
const channel = (packed: Expr, k: number, ctx: ConvertContext): Expr => call('imageChannels', packed, real(ctx.origin + k));
const hsv = (f: Expr): Expr => call('rgbToHsv', image(f), real(360));
const hls = (f: Expr): Expr => call('rgbToHls', image(f), real(360));

/** READPRN's reading of a data file: numbers separated by spaces, tabs or commas, a row a line. */
function prnRows(text: string): number[][] | null {
  const rows = text.split(/\r?\n|\r/).filter((l) => l.trim() !== '').map((l) => l.trim().split(/[\s,]+/).map(Number));
  return rows.every((r) => r.length === rows[0]!.length && r.every(Number.isFinite)) ? rows : null;
}

/**
 * Mathcad's file functions and the MathMath expressions that give the same numbers, as probed (2026-11-11): READRGB
 * packs red, green and blue side by side, 0 to 255, as readImage does; READBMP and READ_IMAGE are the luma rounded;
 * READ_HLS and READ_HSV pack hue in degrees with the rest 0 to 255; READWAV gives raw samples, 0 to 255 at 8 bits
 * and −32768 to 32767 at 16, and refuses other files, where readWav gives −1 to 1.
 */
export const CONVERSIONS: Record<string, { to: string; convert: Converter }> = {
  READRGB: { to: 'readImage', convert: withFile((f) => image(f)) },
  READBMP: { to: 'round(toGray(readImage))', convert: withFile((f) => call('round', call('toGray', image(f)))) },
  READ_IMAGE: { to: 'round(toGray(readImage))', convert: withFile((f) => call('round', call('toGray', image(f)))) },
  READ_RED: { to: 'imageChannels(readImage)', convert: withFile((f, c) => channel(image(f), 0, c)) },
  READ_GREEN: { to: 'imageChannels(readImage)', convert: withFile((f, c) => channel(image(f), 1, c)) },
  READ_BLUE: { to: 'imageChannels(readImage)', convert: withFile((f, c) => channel(image(f), 2, c)) },
  READ_HSV: { to: 'rgbToHsv(readImage, 360)', convert: withFile((f) => hsv(f)) },
  READ_HSV_HUE: { to: 'imageChannels(rgbToHsv(readImage, 360))', convert: withFile((f, c) => channel(hsv(f), 0, c)) },
  READ_HSV_SAT: { to: 'imageChannels(rgbToHsv(readImage, 360))', convert: withFile((f, c) => channel(hsv(f), 1, c)) },
  READ_HSV_VALUE: { to: 'imageChannels(rgbToHsv(readImage, 360))', convert: withFile((f, c) => channel(hsv(f), 2, c)) },
  READ_HLS: { to: 'rgbToHls(readImage, 360)', convert: withFile((f) => hls(f)) },
  READ_HLS_HUE: { to: 'imageChannels(rgbToHls(readImage, 360))', convert: withFile((f, c) => channel(hls(f), 0, c)) },
  READ_HLS_LIGHT: { to: 'imageChannels(rgbToHls(readImage, 360))', convert: withFile((f, c) => channel(hls(f), 1, c)) },
  READ_HLS_SAT: { to: 'imageChannels(rgbToHls(readImage, 360))', convert: withFile((f, c) => channel(hls(f), 2, c)) },
  GETWAVINFO: { to: 'wavInfo', convert: withFile((f) => call('wavInfo', f)) },
  // readTable takes one separator for a whole file, commas if any line has one, where READPRN takes spaces, tabs or
  // commas anywhere: it converts only when both read the attached file to the same numbers.
  READPRN: {
    to: 'readTable',
    convert: withFile((f, ctx) => {
      const name = f.v;
      const text = ctx.table(name);
      if (text === undefined) return { cannot: `attach ${name} first, to check how its numbers are separated` };
      const want = prnRows(text);
      let got: Value | null = null;
      try {
        got = parseTable(text);
      } catch {
        got = null;
      }
      const same = want && got?.t === 'mat' && !got.cells && got.rows === want.length && got.cols === want[0]!.length
        && want.every((r, i) => r.every((x, j) => got!.t === 'mat' && got!.re[j * want.length + i] === x));
      return same ? call('readTable', f) : ({ cannot: `readTable reads ${name} differently from READPRN` });
    }),
  },
  READWAV: {
    to: 'readWav, scaled',
    convert: withFile((f, ctx) => {
      const name = f.v;
      const audio = ctx.audio(name);
      const cannot = (why: string) => ({ cannot: why });
      if (audio === undefined) return cannot(`attach ${name} first, to know its bits per sample`);
      if (typeof audio === 'string') return cannot(`${name} can't be read: ${audio}`);
      if (audio.bits === 8 && !audio.float) return plus(times(real(128), call('readWav', f)), real(128));
      if (audio.bits === 16 && !audio.float) return times(real(32768), call('readWav', f));
      return cannot(`${name} is ${audio.float ? 'floating point' : `${audio.bits}-bit`}, which Mathcad 14 can't read either`);
    }),
  },
};
