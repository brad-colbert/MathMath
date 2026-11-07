/** Runs a worksheet off the main thread, so a long calculation can't freeze the page. */
import { type LimitKey, type Outcome, type Pixels, type PlotData, type SymAnswer, type SymSolver, type Written } from '../engine/evaluate.js';
import { type Snapshot, runIncremental } from '../engine/incremental.js';
import { type DecodedImage, type Files, SHEET_MIME, fileKey, isSheetName, sheetKey } from '../engine/files.js';
import { type DecodedAudio, isWavFile, parseWav } from '../engine/wav.js';
import { loadWorksheet } from '../format/native.js';
import { tex } from '../latex/latex.js';
import type { Content, Expr, NumberFormat, Region, Worksheet } from '../model/ast.js';
import type { Defs } from '../symbolic/defs.js';
import { NotSymbolic, expand } from '../symbolic/expand.js';
import { type GiacRequest, Printer, buildRequest, readAnswer } from '../symbolic/giac.js';
import { axisScale, displayUnit, formatValue, unitLatexOf } from '../ui/format.js';

export interface ComputeRequest {
  seq: number;
  sheet: Pick<Worksheet, 'regions' | 'origin' | 'tol' | 'exactCompare' | 'zeroOverZero' | 'format' | 'assets'>;
}

/** What the page needs for one region. Values can't cross to the page, so they travel as LaTeX. */
export interface Shown {
  id: string;
  value?: string;
  /** The error is a Mathcad feature to replace, not a mistake. */
  mathcad?: boolean;
  plot?: PlotData;
  image?: Pixels;
  error?: string;
  /** Symbolic evaluation found no closed form. */
  unevaluated?: boolean;
  /** A reference whose sheet is attached, though it still needs other files, listed in `error`. */
  partial?: boolean;
  /** The unit part of `value`, as LaTeX, so the page can let it be edited apart from the number. */
  unit?: string;
  /** Files the region is waiting for, by name: attached, they'd let it calculate. */
  needs?: string[];
  /** Image files the region wrote, for the page to offer to save. */
  files?: Written[];
}

/** Sent as each region starts, so the page can show which one is calculating. */
export interface Progress { seq: number; at: string }

/** Sent as a calculation starts: the regions it may change. The rest of the sheet is already current. */
export interface Planned { seq: number; pending: string[] }

/** Sent when one of those turns out to need no calculating, so it can show as current again. */
export interface Kept { seq: number; kept: string }

/** One region's answer, sent as soon as it's ready. The final message carries them all again. */
export interface Answer { seq: number; ready: Shown }

/** A finished calculation: what to show for every region, and which regions were calculated this time. */
export interface Done { seq: number; shown: Shown[]; ran: string[]; failure?: string }

/** Messages to the page, which owns the long-lived algebra engine. */
export interface AskAlgebra { ask: GiacRequest; id: number }

type Plot = Extract<Content, { k: 'plot' }>;

/** Puts a plot's values into each axis's display unit, and says which unit that is. */
function inUnits(p: PlotData, c: Plot): PlotData {
  const axis = (which: 'x' | 'y') => {
    const dim = p.dims?.[which];
    // Traces with different units share no unit, so the axis shows plain base-unit numbers.
    if (dim === null || dim === undefined) return { divide: 1, zero: 0, latex: '', chosen: false };
    const chosen = displayUnit((which === 'x' ? c.xAxis : c.yAxis).unit ?? null, p.units?.[which]);
    return { ...axisScale(dim, chosen), chosen: chosen !== undefined };
  };
  const [ax, ay] = [axis('x'), axis('y')];
  // Traces can share an array, which must be converted once.
  const done = new Map<Float64Array, Float64Array>();
  const convert = (a: Float64Array, s: { divide: number; zero: number }): Float64Array => {
    if (s.divide === 1 && s.zero === 0) return a;
    let out = done.get(a);
    if (!out) done.set(a, (out = a.map((v) => (v - s.zero) / s.divide)));
    return out;
  };
  // A Smith chart's x and y are Γ, which has no units; only the swept value shown on hover converts.
  const traces = c.view === 'smith'
    ? p.traces.map((t) => (t.param ? { ...t, param: convert(t.param, ax) } : t))
    : p.traces.map((t) => ({ ...t, x: convert(t.x, ax), y: convert(t.y, ay) }));
  const limits: PlotData['limits'] = {};
  for (const [key, v] of Object.entries(p.limits) as [LimitKey, number][]) {
    const s = key[0] === 'x' ? ax : ay;
    // A limit typed with units converts; a bare number is already in the axis's unit.
    limits[key] = p.dims?.limits[key] ? (v - s.zero) / s.divide : v;
  }
  const out: PlotData = { traces, limits, labels: { x: ax.latex, y: ay.latex, xChosen: ax.chosen, yChosen: ay.chosen } };
  if (p.surface) {
    // Heights in their default display unit, which the color bar names.
    const zs = axisScale(p.surface.zDim, undefined);
    const z = zs.divide === 1 && zs.zero === 0 ? p.surface.z : p.surface.z.map((v) => (v - zs.zero) / zs.divide);
    out.surface = { ...p.surface, z };
    out.zLabel = zs.latex;
  }
  return out;
}

const formatFor = (r: Region, fallback: NumberFormat): NumberFormat =>
  (r.content.k === 'define' || r.content.k === 'eval' ? r.content.format : undefined) ?? fallback;

const pending = new Map<number, (out: string) => void>();
let nextAsk = 1;

function ask(request: GiacRequest): Promise<string> {
  const id = nextAsk++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const message: AskAlgebra = { ask: request, id };
    self.postMessage(message);
  });
}

const solve: SymSolver = async (c: Extract<Content, { k: 'sym' }>, defs: Defs): Promise<SymAnswer> => {
  try {
    // Definitions apply everywhere, keyword arguments included. Tested in Mathcad 14: with x := 5,
    // `x²+2x coeffs,x` gives 35, and `solve,x` is an error.
    const clear = (): Set<string> => new Set();
    const expr: Expr = expand(c.expr, defs, clear());
    const commands = c.commands.map((k) => ({ name: k.name, args: k.args.map((a) => expand(a, defs, clear())) }));
    const printer = new Printer();
    const request = buildRequest(expr, commands, printer);
    let answer = readAnswer(await ask(request), c, request, printer);
    if ('retry' in answer) answer = readAnswer(await ask({ ...request, command: answer.retry }), c, request, printer);
    if ('result' in answer) return { result: answer.result };
    if ('unevaluated' in answer) return { result: null, unevaluated: true };
    if ('error' in answer) return { result: null, error: answer.error };
    return { result: null, error: 'No usable answer came back' };
  } catch (err) {
    if (err instanceof NotSymbolic) return { result: null, error: err.message };
    return { result: null, error: (err as Error).message };
  }
};

/** Decodes attached files up front, so reading one during evaluation needs no waiting. */
async function decode(assets: Worksheet['assets']): Promise<Files> {
  const images = new Map<string, DecodedImage>();
  const tables = new Map<string, string>();
  const sheets = new Map<string, Worksheet>();
  const audio = new Map<string, DecodedAudio | string>();
  const utf8 = new TextDecoder();
  for (const [name, asset] of Object.entries(assets)) {
    if (isWavFile(name, asset.mime)) {
      audio.set(fileKey(name), parseWav(Uint8Array.from(atob(asset.data), (ch) => ch.charCodeAt(0))));
      continue;
    }
    if (!asset.mime.startsWith('image/')) {
      const text = utf8.decode(Uint8Array.from(atob(asset.data), (ch) => ch.charCodeAt(0)));
      if (asset.mime === SHEET_MIME || isSheetName(name)) {
        try {
          sheets.set(sheetKey(name), loadWorksheet(text));
        } catch {
          // An unreadable worksheet reads as missing, and the reference to it says so.
        }
      } else tables.set(fileKey(name), text);
      continue;
    }
    try {
      const bytes = Uint8Array.from(atob(asset.data), (ch) => ch.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: asset.mime }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      images.set(fileKey(name), { width: bitmap.width, height: bitmap.height, rgba: data });
    } catch {
      // An unreadable image reads as missing, and the region that asks for it says so.
    }
  }
  return { image: (name) => images.get(name), table: (name) => tables.get(name), sheet: (name) => sheets.get(name), audio: (name) => audio.get(name) };
}

/** The last run's state, kept between runs so the next one recalculates only what changed. */
let snapshot: Snapshot | null = null;
let decoded: { key: string; files: Files } | null = null;
/** The newest request. A run checks it between regions, and stops when it's been overtaken. */
let latest = -1;
let queued: ComputeRequest | null = null;
let busy = false;

class Superseded extends Error {}

/** Lets messages in, so a newer request can arrive mid-run. A promise alone wouldn't: it's a microtask. */
const yieldTask = (): Promise<void> => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => resolve();
  channel.port2.postMessage(0);
});

/** Identifies the attached files, so a change to any of them starts the calculation over. */
function assetsKey(assets: Worksheet['assets']): string {
  let h = 0x811c9dc5;
  const mix = (text: string): void => {
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  };
  for (const [name, a] of Object.entries(assets ?? {}).sort(([x], [y]) => (x < y ? -1 : 1))) {
    mix(name);
    mix(a.mime);
    mix(a.data);
  }
  return `${Object.keys(assets ?? {}).length}:${(h >>> 0).toString(16)}`;
}

async function run({ seq, sheet }: ComputeRequest): Promise<void> {
  const ws: Worksheet = { ...sheet, page: null as never, texts: [], opaque: [], otherRegions: {}, componentOutputs: [] };
  const key = assetsKey(sheet.assets ?? {});
  if (decoded?.key !== key) decoded = { key, files: await decode(sheet.assets ?? {}) };
  const starting = (region: Region): void => {
    const message: Progress = { seq, at: region.id };
    self.postMessage(message);
  };
  let result: Awaited<ReturnType<typeof runIncremental>>;
  try {
    result = await runIncremental(ws, solve, snapshot, {
      files: decoded.files,
      filesKey: key,
      starting,
      between: async () => {
        await yieldTask();
        if (latest !== seq) throw new Superseded();
      },
      progress: (s) => {
        snapshot = s;
      },
      planned: (pending) => {
        const message: Planned = { seq, pending };
        self.postMessage(message);
      },
      kept: (id) => {
        const message: Kept = { seq, kept: id };
        self.postMessage(message);
      },
      // Each answer goes to the page as soon as it's ready, so a long sheet fills in from the top.
      finished: (o) => {
        const one = shownOf(o, sheet.format);
        const message: Answer = { seq, ready: one };
        self.postMessage(message, { transfer: buffersOf([one]) });
      },
    });
  } catch (err) {
    // Overtaken: what it finished is kept, and the newer request carries on from there.
    if (err instanceof Superseded) return;
    // Anything else leaves nothing reliable to resume from.
    snapshot = null;
    throw err;
  }
  snapshot = result.snapshot;
  const shown = result.outcomes.map((o) => shownOf(o, sheet.format));
  const done: Done = { seq, shown, ran: result.ran };
  self.postMessage(done, { transfer: buffersOf(shown) });
}

/** What the page shows for one region, with any image files it wrote, copied as pixels are. */
function shownOf(o: Outcome, format: NumberFormat): Shown {
  const shown = shownValue(o, format);
  return o.files ? { ...shown, files: o.files.map((f) => ({ name: f.name, image: { ...f.image, rgba: f.image.rgba.slice() } })) } : shown;
}

/** What the page shows for one region. Values can't cross to the page, so they go as LaTeX. */
function shownValue(o: Outcome, format: NumberFormat): Shown {
  const id = o.region.id;
  // Grayed, not red: something to replace or a file to load, not a mistake in the math.
  if (o.error) {
    const c = o.region.content;
    const needs = o.error.kind === 'needs-file' && o.error.needs.length > 0 ? { needs: o.error.needs } : {};
    if (c.k === 'include' && o.error.kind === 'needs-file' && !o.error.needs.includes(c.file)) return { id, error: o.error.reason, partial: true, ...needs };
    return o.error.kind === 'mathcad' || o.error.kind === 'needs-file' ? { id, error: o.error.reason, mathcad: true, ...needs } : { id, error: o.error.reason };
  }
  // Points and pixels are copied, because sending moves them, and the snapshot keeps its own.
  if (o.plot && o.region.content.k === 'plot') {
    const plot = inUnits(o.plot, o.region.content);
    const surface = plot.surface ? { ...plot.surface, x: plot.surface.x.slice(), y: plot.surface.y.slice(), z: plot.surface.z.slice() } : undefined;
    return { id, plot: { ...plot, traces: plot.traces.map((t) => ({ ...t, x: t.x.slice(), y: t.y.slice(), ...(t.param ? { param: t.param.slice() } : {}) })), ...(surface ? { surface } : {}) } };
  }
  if (o.image) return { id, image: { ...o.image, rgba: o.image.rgba.slice() } };
  if (o.unevaluated) return { id, unevaluated: true };
  if (o.symbolic) return { id, value: tex(o.symbolic) };
  const c = o.region.content;
  const unit = c.k === 'eval' || c.k === 'define' ? displayUnit(c.unit, o.unit) : undefined;
  if (!o.value) return { id };
  const shownUnit = unitLatexOf(o.value, unit);
  return { id, value: formatValue(o.value, formatFor(o.region, format), unit), ...(shownUnit ? { unit: shownUnit } : {}) };
}

/**
 * Point data and pixels move to the page rather than being copied a second time: plots can be large. Traces
 * can share an array, and a buffer listed twice makes the browser refuse the whole message.
 */
function buffersOf(shown: Shown[]): ArrayBuffer[] {
  return [...new Set(shown.flatMap((s) => [
    ...(s.plot?.traces.flatMap((t) => [t.x.buffer, t.y.buffer]) ?? []),
    ...(s.plot?.surface ? [s.plot.surface.x.buffer, s.plot.surface.y.buffer, s.plot.surface.z.buffer] : []),
    ...(s.image ? [s.image.rgba.buffer] : []),
    ...(s.files?.map((f) => f.image.rgba.buffer) ?? []),
  ]))] as ArrayBuffer[];
}

/** Runs requests one at a time; a newer one stops an older one at its next region. */
async function pump(): Promise<void> {
  busy = true;
  while (queued) {
    const request = queued;
    queued = null;
    // A failure here must end the calculation visibly, or the page waits for ever.
    await run(request).catch((err: Error) => self.postMessage({ seq: request.seq, shown: [], failure: err.message }));
  }
  busy = false;
}

self.onmessage = (m: MessageEvent<ComputeRequest | { answer: string; id: number }>) => {
  const data = m.data;
  if ('answer' in data) {
    pending.get(data.id)?.(data.answer);
    pending.delete(data.id);
    return;
  }
  latest = data.seq;
  queued = data;
  if (!busy) void pump();
};
