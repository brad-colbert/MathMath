/**
 * Recalculates a worksheet from its first change down, re-running only the regions that depend on it.
 *
 * A run leaves a snapshot: for each region in calculation order, its outcome and the state after it. The
 * next run compares the sheet with the snapshot, picks up from the state just before the first region that
 * differs, and below that re-runs a region only when it changed, or reads a name that a re-run region above
 * it defines (directly, or by calling a function that does). Everything else keeps its outcome, and the
 * names it set are set again without being calculated. The result is meant to equal a full run exactly;
 * when in doubt a region re-runs.
 *
 * Whole-sheet changes start over: the sheet's settings, its attached files, or no snapshot.
 */
import type { Content, Region, Target, Worksheet } from '../model/ast.js';
import type { Defs } from '../symbolic/defs.js';
import type { Files } from './files.js';
import { NO_FILES } from './files.js';
import { type OrderKey, type Outcome, Run, Scope, type SymSolver, collectIds, inOrder } from './evaluate.js';
import type { Value } from './values.js';

/** One region's part of a run. */
interface Step {
  id: string;
  /** What decides the region's result. A change to anything else, such as its display unit, only redraws it. */
  calc: string;
  /** All of its content, to tell a change in how it's shown. */
  content: string;
  outcome: Outcome;
  /** The state after the region, to pick up from. */
  scope: Scope;
  defs: Defs;
  /** The names and values the region set, to set again when it's reused. */
  sets: [string, Value][];
  /** The expression a definition or symbolic result gives the symbolic definitions, to thread them again. */
  symbolic: { target: Extract<Content, { k: 'define' }>['target']; value: Extract<Content, { k: 'define' }>['value'] } | null;
  /** Names the region reads, over-counted rather than under: every name in it. */
  reads: Set<string>;
  /** Its values include a function, which holds a scope from its own run, so it can't be reused. */
  holdsFunction: boolean;
}

export interface Snapshot {
  /** The sheet settings and attached files the snapshot was made with. A change to either starts over. */
  basis: string;
  start: { scope: Scope; defs: Defs };
  steps: Step[];
  run: Run;
}

export interface IncrementalResult {
  outcomes: Outcome[];
  snapshot: Snapshot;
  /** Ids of the regions that were calculated this time, in order. */
  ran: string[];
}

export interface IncrementalOptions {
  order?: OrderKey;
  files?: Files;
  /** The files' identity, for telling a change of attached files. */
  filesKey?: string;
  /** Called as each region starts calculating. */
  starting?: (region: Region) => void;
  /** Awaited between regions; it may throw to stop the run, which keeps what it finished. */
  between?: () => Promise<void>;
  /** Receives the snapshot as far as it has got, so a stopped run still leaves one to resume from. */
  progress?: (snapshot: Snapshot) => void;
  /** Told at the start which regions may change: the first one affected and everything below it. */
  planned?: (ids: string[]) => void;
  /** Told of each of those that turns out not to need calculating, as the run reaches it. */
  kept?: (id: string) => void;
  /** Given each region's outcome as soon as it's calculated. */
  finished?: (outcome: Outcome) => void;
}

const json = (v: unknown): string => JSON.stringify(v);

/** The part of a region's content that decides its result. */
export function calcKey(c: Content): string {
  switch (c.k) {
    case 'eval': return json({ k: c.k, expr: c.expr });
    case 'define': return json({ k: c.k, target: c.target, value: c.value, global: c.global });
    case 'sym': return json({ k: c.k, expr: c.expr, commands: c.commands, target: c.target, global: c.global });
    // Surface and contour read their expression differently from X-Y and polar, so that choice calculates.
    case 'plot': return json({
      k: c.k, x: c.x, ys: c.ys, grid: c.view === 'surface' || c.view === 'contour',
      xAxis: { min: c.xAxis.min, max: c.xAxis.max, unit: c.xAxis.unit ?? null },
      yAxis: { min: c.yAxis.min, max: c.yAxis.max, unit: c.yAxis.unit ?? null },
    });
    default: return json(c);
  }
}

function readsOf(c: Content): Set<string> {
  const used = new Set<string>();
  collectIds(c, used, new Set());
  // `v_3 := 9` and `M⟨1⟩ := …` extend the matrix already called v or M, so they read it. A plain `x :=` or
  // `f(x) :=` replaces what was there, so it doesn't.
  const extended = (t: Target | null): void => {
    if (!t) return;
    if (t.k === 'index' || t.k === 'col') used.add(t.name);
    if (t.k === 'multi') t.targets.forEach(extended);
  };
  if (c.k === 'define' || c.k === 'sym') extended(c.target);
  return used;
}

const holdsFunction = (v: Value | undefined): boolean => {
  if (!v) return false;
  if (v.t === 'fn') return true;
  if (v.t === 'mat' && v.cells) return v.cells.some(holdsFunction);
  return false;
};

/** The names set by the scopes from `after` back to, not including, `before`, oldest first. */
function setsBetween(before: Scope, after: Scope): [string, Value][] {
  const chain: Scope[] = [];
  for (let s: Scope | null = after; s && s !== before; s = s.parent) chain.push(s);
  const out = new Map<string, Value>();
  for (const s of chain.reverse()) for (const [name, v] of s.own()) out.set(name, v);
  return [...out];
}

function basisOf(ws: Worksheet, filesKey: string): string {
  return json({ origin: ws.origin, tol: ws.tol, exactCompare: ws.exactCompare ?? true, zeroOverZero: ws.zeroOverZero ?? false, files: filesKey });
}

export async function runIncremental(ws: Worksheet, solve: SymSolver, prev: Snapshot | null, opts: IncrementalOptions = {}): Promise<IncrementalResult> {
  const order = inOrder(ws, opts.order ?? 'align');
  const basis = basisOf(ws, opts.filesKey ?? '');
  const usable = prev && prev.basis === basis ? prev : null;
  const old = usable?.steps ?? [];

  // The first region, in calculation order, that isn't the same region with the same calculation.
  let k = 0;
  while (k < order.length && k < old.length && old[k]!.id === order[k]!.id && old[k]!.calc === calcKey(order[k]!.content)) k++;

  // A fresh start makes the evaluator that every later run of this snapshot reuses, so functions defined
  // above a change keep working: they belong to it.
  const run0 = usable?.run ?? new Run(ws, opts.files ?? NO_FILES);
  const start = usable?.start ?? { scope: run0.scope, defs: run0.defs };
  const before = k > 0 ? old[k - 1]! : null;
  const resumeScope = before?.scope ?? start.scope;
  const resumeDefs = before?.defs ?? start.defs;
  resumeScope.forgetAfter();
  const run = new Run(ws, opts.files ?? NO_FILES, { ev: run0.ev, scope: resumeScope, defs: resumeDefs });

  // Names whose meaning may have changed from here down. Regions that were below the change and are gone,
  // or have moved, leave their names behind as changed: a reader below may now see an earlier definition.
  const dirty = new Set<string>();
  const oldBelow = old.slice(k);
  const kept = new Map(oldBelow.map((s) => [s.id, s]));
  const newIds = new Set(order.slice(k).map((r) => r.id));
  for (const s of oldBelow) if (!newIds.has(s.id)) for (const [name] of s.sets) dirty.add(name);
  const sameOrder = json(order.slice(k).map((r) => r.id).filter((id) => kept.has(id))) === json(oldBelow.map((s) => s.id).filter((id) => newIds.has(id)));
  if (!sameOrder) for (const s of oldBelow) for (const [name] of s.sets) dirty.add(name);

  // Above the change nothing is calculated, but a region there may be shown differently now.
  opts.planned?.(order.slice(k).map((r) => r.id));
  const steps: Step[] = old.slice(0, k).map((step, i) => {
    const region = order[i]!;
    const content = json(region.content);
    if (content === step.content) return { ...step, outcome: { ...step.outcome, region } };
    const c = region.content;
    let outcome: Outcome = { ...step.outcome, region };
    if ((c.k === 'eval' || c.k === 'define') && step.outcome.value) {
      // Evaluated where the region stands: its own scope for a definition, the one before it otherwise.
      const at = c.k === 'define' ? step.scope : (old[i - 1]?.scope ?? start.scope);
      const { unit: _, ...rest } = outcome;
      outcome = { ...rest, ...new Run(ws, opts.files ?? NO_FILES, { ev: run0.ev, scope: at, defs: step.defs }).unitAt(c.unit) };
    }
    return { ...step, content, outcome };
  });
  const snapshot: Snapshot = { basis, start, steps, run: run0 };
  const ran: string[] = [];

  for (let i = k; i < order.length; i++) {
    if (opts.between) {
      try {
        await opts.between();
      } catch (err) {
        opts.progress?.(snapshot);
        throw err;
      }
    }
    const region = order[i]!;
    const c = region.content;
    const calc = calcKey(c);
    const prior = kept.get(region.id);
    const reads = readsOf(c);
    const touches = [...reads].some((name) => dirty.has(name));
    const reuse = prior && prior.calc === calc && !touches && !prior.holdsFunction && c.k !== 'include';
    const scopeBefore = run.scope;
    if (reuse) {
      // Same calculation, nothing it reads has changed: set its names again and keep its outcome.
      if (prior.sets.length > 0 || prior.symbolic) {
        run.scope = Scope.after(run.scope);
        for (const [name, v] of prior.sets) run.scope.set(name, v);
        if (prior.symbolic) run.defs = run.defs.with(prior.symbolic.target, prior.symbolic.value, run.scope);
      }
      // Only how it's shown may have changed, such as its display unit, which is evaluated where it stands.
      let outcome: Outcome = { ...prior.outcome, region };
      if ((c.k === 'eval' || c.k === 'define') && prior.outcome.value) {
        const { unit: _, ...rest } = outcome;
        outcome = { ...rest, ...run.unitAt(c.unit) };
      }
      steps.push({ ...prior, content: json(c), outcome, scope: run.scope, defs: run.defs });
      snapshot.steps = steps;
      opts.kept?.(region.id);
      continue;
    }
    opts.starting?.(region);
    ran.push(region.id);
    const shown = run.outcomes.length;
    let symbolic: Step['symbolic'] = null;
    if (c.k === 'sym') {
      const answer = await solve(c, run.defs, run.scope, ws);
      run.symbolic(region, c, answer);
      if (c.target) symbolic = { target: c.target, value: answer.result ?? c.expr };
    } else {
      run.plain(region);
      if (c.k === 'define') symbolic = { target: c.target, value: c.value };
    }
    const outcome = run.outcomes[shown]!;
    run.outcomes.length = shown;
    opts.finished?.(outcome);
    const sets = setsBetween(scopeBefore, run.scope);
    // What it sets now, and what it set before, may both read differently below. Except a region that ran
    // again only because it holds a function: the same definition, reading nothing that changed, behaves the
    // same, so what calls it below needn't run again.
    const equivalent = prior && prior.calc === calc && !touches && c.k !== 'include';
    if (!equivalent) {
      for (const [name] of sets) dirty.add(name);
      for (const [name] of prior?.sets ?? []) dirty.add(name);
    }
    steps.push({
      id: region.id, calc, content: json(c), outcome, scope: run.scope, defs: run.defs, sets, symbolic, reads,
      holdsFunction: holdsFunction(outcome.value) || sets.some(([, v]) => holdsFunction(v)),
    });
    snapshot.steps = steps;
  }
  return { outcomes: steps.map((s) => s.outcome), snapshot, ran };
}
