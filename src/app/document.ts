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
 * The open worksheet and every change to it. All edits go through here, so views stay simple and
 * undo can later be a snapshot rather than a rewrite.
 */
import { emptyWorksheet } from '../format/native.js';
import { readRegion } from '../latex/region.js';
import { type Content, type OpaqueRegion, type Region, type TextRegion, type Worksheet, autoAxis } from '../model/ast.js';
import { fileKey } from '../engine/files.js';
import { type ConvertContext, type Found, convertContent, fileClashes, findConvertible } from '../engine/convert.js';
import { parseWav } from '../engine/wav.js';
import { Algebra } from './algebra.js';
import type { Answer, AskAlgebra, ComputeRequest, Done, Kept, Planned, Progress, Shown } from './compute.worker.js';

export type Item =
  | { kind: 'math'; region: Region }
  | { kind: 'text'; region: TextRegion }
  | { kind: 'opaque'; region: OpaqueRegion };

/** The grid regions snap to, in points. */
export const GRID = 6;

/** Everything undo restores. Picture data is shared, since nothing ever changes it. */
type Snapshot = Pick<Worksheet, 'regions' | 'texts' | 'opaque' | 'page' | 'seed'>;

const snapshot = (ws: Worksheet): Snapshot => ({
  regions: structuredClone(ws.regions),
  texts: structuredClone(ws.texts),
  opaque: ws.opaque.map((o) => ({ ...o })),
  page: structuredClone(ws.page),
  ...(ws.seed === undefined ? {} : { seed: ws.seed }),
});

const HISTORY = 100;

/** The gap kept between a region that grew and the regions it pushed down, in points. */
const SEPARATION = 6;

export class Doc {
  ws: Worksheet = emptyWorksheet();
  outcomes = new Map<string, Shown>();
  computing = false;
  /** LIVE recalculates after every change. EDIT calculates nothing until switched back to LIVE. */
  live = true;
  /**
   * Why the results shown don't match the sheet, or '' when they do: edits in EDIT mode, or a
   * calculation that was stopped. While one runs, `computing` says so instead.
   */
  behind = '';
  dirty = false;
  name = 'Untitled';
  /** The regions the last calculation actually ran, for tests and for showing what was recalculated. */
  lastRan: string[] = [];
  /**
   * While a calculation runs, the regions it may change: the first one affected and everything below.
   * Only these show as out of date. Null until the worker says, a moment after it starts.
   */
  mayChange: Set<string> | null = null;
  /**
   * Turns the page portrait or landscape: its width and height swap, and the margins stay. Nothing on the
   * sheet moves or recalculates; page breaks and printing follow the new size. One undo puts it back.
   */
  /** Draws new random numbers: a new seed, so every random function gives fresh values. One step to undo. */
  newRandomNumbers(): void {
    let seed = this.ws.seed ?? 1;
    while (seed === (this.ws.seed ?? 1)) seed = 1 + Math.floor(Math.random() * 2147483646);
    this.ws.seed = seed;
    this.touched();
  }

  setOrientation(landscape: boolean): void {
    const page = this.ws.page;
    if (page.landscape === landscape) return;
    const [short, long] = [Math.min(page.width, page.height), Math.max(page.width, page.height)];
    this.ws.page = { ...page, landscape, width: landscape ? long : short, height: landscape ? short : long };
    this.touched();
  }

  /** Files the sheet's answers are waiting for, by name, in the order they're first needed. */
  missingFiles(): string[] {
    const out = new Set<string>();
    for (const r of this.ws.regions) for (const name of this.outcomes.get(r.id)?.needs ?? []) out.add(name);
    return [...out];
  }

  /** Called after anything changes, with the ids whose content must redraw, or null for all. */
  onChange: (ids: Set<string> | null) => void = () => {};
  /** Called when a calculation starts or ends. */
  onBusy: (busy: boolean) => void = () => {};
  /** Called when the mode changes between LIVE and EDIT. */
  onMode: (live: boolean) => void = () => {};
  /** Called as each region starts calculating, and with null when the calculation ends. */
  onCalculating: (id: string | null) => void = () => {};
  /** Called when a calculation can't finish. */
  onProblem: (message: string) => void = () => {};
  private nextId = 1;
  private worker: Worker | null = null;
  private algebra = new Algebra();
  private seq = 0;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private saved: Snapshot = snapshot(this.ws);
  private batching = false;
  private pending = false;

  replace(ws: Worksheet, name: string): void {
    this.ws = ws;
    this.name = name;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.saved = snapshot(ws);
    const ids = this.items().map((i) => Number(i.region.id)).filter(Number.isFinite);
    this.nextId = Math.max(0, ...ids) + 1;
    // Results belong to the sheet they came from: ids repeat between sheets.
    this.outcomes = new Map();
    this.behind = '';
    this.restart();
    this.recompute();
    this.onChange(null);
  }

  items(): Item[] {
    return [
      ...this.ws.opaque.map((region): Item => ({ kind: 'opaque', region })),
      ...this.ws.texts.map((region): Item => ({ kind: 'text', region })),
      ...this.ws.regions.map((region): Item => ({ kind: 'math', region })),
    ];
  }

  find(id: string): Item | undefined {
    return this.items().find((i) => i.region.id === id);
  }

  /** Switches between LIVE and EDIT. Going LIVE calculates at once; going to EDIT stops a calculation. */
  setLive(live: boolean): void {
    if (this.live === live) return;
    this.live = live;
    this.onMode(live);
    if (live) this.recompute();
    else this.stop();
    this.onChange(null);
  }

  /**
   * Starts a calculation. Results arrive later. The worker stays between calculations and remembers the
   * last one, so it recalculates only from the first change down, and only what depends on it; a newer
   * request stops an older one at its next region rather than ending the worker. In EDIT mode nothing
   * runs, and the answers are marked out of date.
   */
  recompute(): void {
    if (!this.live) {
      if (this.computing) this.stop();
      if (this.outcomes.size > 0) this.behind = 'Not recalculated in EDIT mode. Switch to LIVE to calculate.';
      return;
    }
    const seq = ++this.seq;
    const worker = this.worker ?? this.startWorker();
    this.computing = true;
    this.mayChange = null;
    this.onBusy(true);
    const { regions, origin, tol, ctol, seed, exactCompare, zeroOverZero, format, assets } = this.ws;
    // The settings calculation reads: CTOL for solve blocks and the seed for random numbers go too.
    const request: ComputeRequest = {
      seq, sheet: { regions, origin, tol, exactCompare, zeroOverZero, format, assets, ...(ctol === undefined ? {} : { ctol }), ...(seed === undefined ? {} : { seed }) },
    };
    worker.postMessage(request);
  }

  private startWorker(): Worker {
    const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    const failed = (reason: string): void => {
      worker.terminate();
      if (this.worker === worker) this.worker = null;
      this.computing = false;
      this.mayChange = null;
      this.onCalculating(null);
      if (this.outcomes.size > 0) this.behind = `Not updated: the calculation failed (${reason})`;
      this.onBusy(false);
      this.onProblem(`Calculation failed: ${reason}`);
      this.onChange(null);
    };
    worker.onerror = (e) => failed(e.message || 'the calculation stopped unexpectedly');
    worker.onmessage = (m: MessageEvent<Done | AskAlgebra | Progress | Planned | Kept | Answer>) => {
      if ('ask' in m.data) {
        const { ask, id } = m.data;
        void this.algebra.ask(ask).then((answer) => worker.postMessage({ answer, id }));
        return;
      }
      // Anything from a calculation since overtaken is stale.
      if (m.data.seq !== this.seq) return;
      if ('at' in m.data) {
        this.onCalculating(m.data.at);
        return;
      }
      if ('pending' in m.data) {
        this.mayChange = new Set(m.data.pending);
        this.onChange(null);
        return;
      }
      if ('kept' in m.data) {
        this.mayChange?.delete(m.data.kept);
        this.onChange(new Set([m.data.kept]));
        return;
      }
      // An answer as soon as it's ready: shown, and current, while the rest of the sheet calculates.
      if ('ready' in m.data) {
        const one = m.data.ready;
        this.outcomes.set(one.id, one);
        this.mayChange?.delete(one.id);
        this.onChange(new Set([one.id]));
        return;
      }
      this.onCalculating(null);
      this.mayChange = null;
      if (m.data.failure) {
        failed(m.data.failure);
        return;
      }
      this.computing = false;
      this.lastRan = m.data.ran;
      this.outcomes = new Map(m.data.shown.map((s) => [s.id, s]));
      this.behind = '';
      this.onBusy(false);
      this.onChange(null);
    };
    return worker;
  }

  /**
   * Stops a running calculation. A worker in a tight loop can only be ended from outside, which loses what
   * it remembered, so the next calculation runs the whole sheet.
   */
  stop(): void {
    this.seq++;
    this.algebra.abort();
    if (this.computing) {
      this.worker?.terminate();
      this.worker = null;
      this.computing = false;
      this.mayChange = null;
      this.onCalculating(null);
      if (this.outcomes.size > 0) this.behind = 'Calculation stopped before this was updated. Any change calculates again.';
      this.onBusy(false);
      this.onChange(null);
    }
  }

  /** Forgets the last calculation, for a sheet opened in place of another. */
  private restart(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
  }

  /** Groups changes, so one edit is one undo. */
  batch(run: () => void): void {
    this.batching = true;
    this.pending = false;
    try {
      run();
    } finally {
      this.batching = false;
      if (this.pending) this.touched();
    }
  }

  private touched(ids: Set<string> | null = null): void {
    if (this.batching) {
      this.pending = true;
      return;
    }
    this.dirty = true;
    this.undoStack.push(this.saved);
    if (this.undoStack.length > HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.saved = snapshot(this.ws);
    this.recompute();
    this.onChange(ids);
  }

  private restore(from: Snapshot[], to: Snapshot[]): void {
    const state = from.pop();
    if (!state) return;
    to.push(this.saved);
    this.saved = state;
    // A seed that wasn't set then isn't set now: undoing New random numbers goes back to the default draws.
    if (state.seed === undefined) delete this.ws.seed;
    Object.assign(this.ws, snapshot({ ...this.ws, ...state }));
    this.dirty = true;
    this.recompute();
    this.onChange(null);
  }

  undo(): void {
    this.restore(this.undoStack, this.redoStack);
  }

  redo(): void {
    this.restore(this.redoStack, this.undoStack);
  }

  /** A new math region whose baseline sits at (left, y). */
  addMath(left: number, y: number): Region {
    const region: Region = {
      id: String(this.nextId++), left, top: y - 8, alignX: left, alignY: y, disabled: false, content: { k: 'draft', latex: '', error: '' },
    };
    this.ws.regions.push(region);
    return region;
  }

  /** A new plot with its top-left corner at (left, top). */
  addPlot(left: number, top: number): Region {
    const region: Region = {
      id: String(this.nextId++), left, top, alignX: left, alignY: top, disabled: false,
      content: { k: 'plot', x: null, ys: [], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 216, height: 150 },
    };
    this.ws.regions.push(region);
    this.touched();
    return region;
  }

  /** A new view of a matrix as an image, with its top-left corner at (left, top). */
  addImage(left: number, top: number): Region {
    const region: Region = {
      id: String(this.nextId++), left, top, alignX: left, alignY: top, disabled: false,
      content: { k: 'image', expr: null, mode: 'gray', width: 144, height: 120, png: null },
    };
    this.ws.regions.push(region);
    this.touched();
    return region;
  }

  /** A picture from a file, as it is. */
  addPicture(left: number, top: number, mime: string, data: string, width: number, height: number): void {
    this.ws.opaque.push({ id: String(this.nextId++), kind: 'picture', left, top, width, height, png: data, mime, xml: null, items: {} });
    this.touched();
  }

  /**
   * Keeps files the worksheet reads, by name. Attaching isn't undoable: a file is data the sheet
   * uses, not part of its layout.
   */
  attach(files: { name: string; mime: string; data: string }[]): void {
    for (const f of files) this.ws.assets[fileKey(f.name)] = { mime: f.mime, data: f.data };
    this.dirty = true;
    this.recompute();
    this.onChange(null);
  }

  /** Attached files as Convert reads them, decoded once each: the bar checks after every change. */
  private decodedAssets = new WeakMap<object, { audio?: ReturnType<typeof parseWav>; text?: string }>();

  /** What converting reads: the sheet's ORIGIN, its attached sound and data files, and names it reads from two folders. */
  private convertContext(): ConvertContext {
    const decoded = (name: string) => {
      const asset = this.ws.assets[fileKey(name)];
      if (!asset) return undefined;
      let d = this.decodedAssets.get(asset);
      if (!d) this.decodedAssets.set(asset, (d = {}));
      return { asset, d };
    };
    const bytes = (data: string) => Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    return {
      origin: this.ws.origin,
      clashes: fileClashes(this.ws.regions.map((r) => r.content)),
      audio: (name) => {
        const x = decoded(name);
        if (!x) return undefined;
        return (x.d.audio ??= parseWav(bytes(x.asset.data)));
      },
      table: (name) => {
        const x = decoded(name);
        if (!x) return undefined;
        return (x.d.text ??= new TextDecoder().decode(bytes(x.asset.data)));
      },
    };
  }

  /** The Mathcad file-function calls on the sheet that Convert knows, region by region. */
  convertible(): { region: Region; found: Found[] }[] {
    const ctx = this.convertContext();
    return this.ws.regions.flatMap((region) => {
      const found = findConvertible(region.content, ctx);
      return found.length ? [{ region, found }] : [];
    });
  }

  /** Converts every Mathcad file-function call that can be, as one step to undo. Returns how many regions changed. */
  convertMathcad(): number {
    const ctx = this.convertContext();
    const regions = this.ws.regions.filter((r) => convertContent(r.content, ctx) !== null);
    if (regions.length > 0) this.updateAll(regions, (c) => convertContent(c, ctx) ?? c);
    return regions.length;
  }

  /** Changes part of a region, such as a plot's axis. */
  update(region: Region, change: (c: Content) => Content): void {
    region.content = change(region.content);
    this.touched();
  }

  /** Changes several regions at once, as one step to undo. */
  updateAll(regions: Region[], change: (c: Content) => Content): void {
    for (const region of regions) region.content = change(region.content);
    this.touched();
  }

  addText(left: number, y: number): TextRegion {
    const region: TextRegion = { id: String(this.nextId++), left, top: y - 8, width: 0, height: 0, text: '' };
    this.ws.texts.push(region);
    return region;
  }

  /** Reads typed math into a region. If it can't be read, it's kept exactly as typed. */
  setMath(region: Region, latex: string): void {
    const before: Content = region.content;
    try {
      region.content = readRegion(latex, before);
    } catch (err) {
      region.content = { k: 'draft', latex, error: (err as Error).message };
    }
    this.touched();
  }

  setText(region: TextRegion, text: string): void {
    region.text = text;
    this.touched(new Set([region.id]));
  }

  remove(ids: Set<string>): void {
    this.ws.regions = this.ws.regions.filter((r) => !ids.has(r.id));
    this.ws.texts = this.ws.texts.filter((r) => !ids.has(r.id));
    this.ws.opaque = this.ws.opaque.filter((r) => !ids.has(r.id));
    this.touched();
  }

  /** Removes a region left empty, without marking the sheet as changed. */
  discard(id: string): void {
    this.ws.regions = this.ws.regions.filter((r) => r.id !== id);
    this.ws.texts = this.ws.texts.filter((r) => r.id !== id);
  }

  move(ids: Set<string>, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    for (const item of this.items()) {
      if (!ids.has(item.region.id)) continue;
      item.region.left = Math.max(0, item.region.left + dx);
      item.region.top = Math.max(0, item.region.top + dy);
      if (item.kind === 'math') {
        item.region.alignX += dx;
        item.region.alignY += dy;
      }
    }
    this.touched();
  }

  /** Lines regions up on one edge, keeping the rest of each position. */
  align(ids: Set<string>, edge: 'left' | 'top'): void {
    const chosen = this.items().filter((i) => ids.has(i.region.id));
    if (chosen.length < 2) return;
    const target = Math.min(...chosen.map((i) => i.region[edge]));
    for (const item of chosen) {
      const delta = target - item.region[edge];
      item.region[edge] += delta;
      if (item.kind === 'math') {
        if (edge === 'left') item.region.alignX += delta;
        else item.region.alignY += delta;
      }
    }
    this.touched();
  }

  /**
   * Moves the regions that were below a region, and share some of its width, down just far enough to clear
   * its new bottom with a small gap, if it now reaches into any of them. Nothing moves otherwise.
   */
  separateBelow(id: string, oldBottom: number, newBottom: number, spans: (other: string) => boolean): void {
    const below = this.items().filter((i) => i.region.id !== id && i.region.top >= oldBottom - 1 && spans(i.region.id));
    if (below.length === 0) return;
    const clearance = newBottom + SEPARATION - Math.min(...below.map((i) => i.region.top));
    if (clearance > 0) this.move(new Set(below.map((i) => i.region.id)), 0, clearance);
  }

}
