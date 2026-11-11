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

import { describe, expect, test } from 'vitest';
import { type Outcome, runWorksheet } from '../src/engine/evaluate.js';
import { type Snapshot, runIncremental } from '../src/engine/incremental.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readTex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import type { Region, Worksheet } from '../src/model/ast.js';

/** A sheet from lines of typed math, one region each, top to bottom, with ids r1, r2… */
function sheetOf(lines: string[]): Worksheet {
  const ws = emptyWorksheet();
  ws.regions = lines.map((latex, i) => region(`r${i + 1}`, i, latex));
  return ws;
}
const region = (id: string, row: number, latex: string): Region => ({ id, left: 0, top: row * 30 - 8, alignX: 0, alignY: row * 30, disabled: false, content: readRegion(latex) });

const noAlgebra = async () => ({ result: null, error: 'no algebra engine in this test' });

const flat = (o: Outcome): unknown => ({
  id: o.region.id,
  error: o.error?.reason ?? null,
  // A matrix's owner and change count are bookkeeping that differs between runs, not part of the answer.
  value: o.value ? JSON.stringify(o.value, (k, v) => (k === 'owner' || k === 'version' ? undefined : v instanceof Float64Array ? [...v] : v)) : null,
  unit: o.unit ? JSON.stringify(o.unit) : null,
});

/** Runs the edit incrementally after a first run, and checks the answers equal a full run of the edited sheet. */
async function edited(before: Worksheet, edit: (ws: Worksheet) => void): Promise<{ ran: string[]; outcomes: Outcome[]; snapshot: Snapshot }> {
  const first = await runIncremental(before, noAlgebra, null);
  const after = structuredClone(before);
  edit(after);
  const next = await runIncremental(after, noAlgebra, first.snapshot);
  expect(next.outcomes.map(flat)).toEqual(runWorksheet(after).map(flat));
  return next;
}

const value = (outcomes: Outcome[], id: string): number => (outcomes.find((o) => o.region.id === id)!.value as { re: number }).re;
const set = (ws: Worksheet, id: string, latex: string) => {
  ws.regions.find((r) => r.id === id)!.content = readRegion(latex);
};

describe('recalculating from a change down', () => {
  const base = ['x\\coloneq 1', 'y\\coloneq x+1', 'z\\coloneq 5', 'w\\coloneq z\\cdot 2', 'y=', 'w='];

  test('a first run calculates everything, and matches a full run', async () => {
    const ws = sheetOf(base);
    const r = await runIncremental(ws, noAlgebra, null);
    expect(r.ran).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(r.outcomes.map(flat)).toEqual(runWorksheet(ws).map(flat));
  });

  test('only what depends on a change runs again', async () => {
    const r = await edited(sheetOf(base), (ws) => set(ws, 'r1', 'x\\coloneq 10'));
    expect(r.ran).toEqual(['r1', 'r2', 'r5']);
    expect(value(r.outcomes, 'r5')).toBe(11);
  });

  test('WRITEWAV with its rate as a name runs again when the rate changes', async () => {
    const lines = ['r\\coloneq 8000', 'S\\coloneq \\begin{pmatrix}0\\\\100\\end{pmatrix}', '\\mathrm{WRITEWAV}\\left(\\text{"a.wav"},r,16\\right)\\coloneq S'];
    const r = await edited(sheetOf(lines), (ws) => set(ws, 'r1', 'r\\coloneq 11025'));
    expect(r.ran).toEqual(['r1', 'r3']);
    const file = r.outcomes.find((o) => o.region.id === 'r3')!.files![0]!;
    expect(new DataView(file.bytes!.buffer).getUint32(24, true)).toBe(11025);
  });

  test('Jacob runs again when its x changes, and sbval when a constant its D uses does', async () => {
    const lines = [
      'x\\coloneq \\begin{pmatrix}1\\\\2\\end{pmatrix}', 'F\\left(x\\right)\\coloneq \\begin{pmatrix}x_{0}^{2}\\cdot x_{1}\\\\5\\cdot x_{0}\\end{pmatrix}', '\\mathrm{Jacob}\\left(F\\left(x\\right),x\\right)=',
      'k\\coloneq 1', 'D\\left(t,y\\right)\\coloneq \\begin{pmatrix}y_{1}\\\\-k\\cdot y_{0}\\end{pmatrix}', 'L\\left(t,v\\right)\\coloneq \\begin{pmatrix}0\\\\v_{0}\\end{pmatrix}',
      'S\\left(t,y\\right)\\coloneq y_{0}-1', '\\mathrm{sbval}\\left(\\begin{pmatrix}1\\end{pmatrix},0,1,D,L,S\\right)=',
    ];
    const a = await edited(sheetOf(lines), (ws) => set(ws, 'r1', 'x\\coloneq \\begin{pmatrix}3\\\\2\\end{pmatrix}'));
    // Function definitions below a change run again too, cheaply; what matters is which answers do.
    expect(a.ran).toContain('r3');
    expect(a.ran).not.toContain('r8');
    expect((a.outcomes.find((o) => o.region.id === 'r3')!.value as { re: Float64Array }).re[0]).toBeCloseTo(12, 10);
    const b = await edited(sheetOf(lines), (ws) => set(ws, 'r4', 'k\\coloneq 4'));
    expect(b.ran).toContain('r8');
    expect(b.ran).not.toContain('r3');
    expect(value(b.outcomes, 'r8')).toBeCloseTo(2 / Math.sin(2), 12);
  });

  test('a change at the bottom runs only itself', async () => {
    const r = await edited(sheetOf(base), (ws) => set(ws, 'r6', 'w+1='));
    expect(r.ran).toEqual(['r6']);
  });

  test('a new display unit runs nothing, and shows the answer in it', async () => {
    const ws = sheetOf(['L\\coloneq 3\\cdot m', 'L=']);
    const r = await edited(ws, (w) => {
      const c = w.regions[1]!.content;
      if (c.k === 'eval') c.unit = readTex('\\mathrm{cm}');
    });
    expect(r.ran).toEqual([]);
    expect(r.outcomes[1]!.unit).toMatchObject({ re: 0.01 });
  });

  test('deleting a definition that hid an earlier one reaches the readers below', async () => {
    const r = await edited(sheetOf(['a\\coloneq 1', 'a\\coloneq 2', 'b\\coloneq a+1', 'b=']), (ws) => {
      ws.regions = ws.regions.filter((x) => x.id !== 'r2');
    });
    expect(value(r.outcomes, 'r4')).toBe(2);
  });

  test('a new definition that hides an earlier one reaches the readers below', async () => {
    const r = await edited(sheetOf(['a\\coloneq 1', 'b\\coloneq a', 'b=']), (ws) => {
      ws.regions.splice(1, 0, region('new', 0.5, 'a\\coloneq 5'));
    });
    expect(value(r.outcomes, 'r3')).toBe(5);
  });

  test('moving a definition below its use turns the use into an error, as a full run does', async () => {
    const r = await edited(sheetOf(['a\\coloneq 1', 'b\\coloneq 2', 'a+b=']), (ws) => {
      ws.regions[0]!.alignY = 200;
      ws.regions[0]!.top = 192;
    });
    expect(r.outcomes.find((o) => o.region.id === 'r3')!.error).toBeDefined();
  });

  test('changing a function reaches what calls it', async () => {
    const r = await edited(sheetOf(['f\\left(t\\right)\\coloneq t+1', 'y\\coloneq f\\left(2\\right)', 'y=']), (ws) => set(ws, 'r1', 'f\\left(t\\right)\\coloneq t\\cdot 10'));
    expect(value(r.outcomes, 'r3')).toBe(20);
  });

  test('a function below the change, reading nothing that changed, leaves its callers alone', async () => {
    const r = await edited(sheetOf(['x\\coloneq 1', 'f\\left(t\\right)\\coloneq t\\cdot 2', 'y\\coloneq f\\left(3\\right)', 'y=', 'x=']), (ws) => set(ws, 'r1', 'x\\coloneq 7'));
    // The function is made again, being a function, but y and y= are kept.
    expect(r.ran).toEqual(['r1', 'r2', 'r5']);
    expect(value(r.outcomes, 'r4')).toBe(6);
  });

  test('a stored partial application follows a change to its function', async () => {
    const r = await edited(sheetOf(['f\\left(a,b\\right)\\coloneq a+b', 'g\\coloneq f\\left(1\\right)', 'g\\left(2\\right)=']), (ws) => set(ws, 'r1', 'f\\left(a,b\\right)\\coloneq a\\cdot b'));
    expect(value(r.outcomes, 'r3')).toBe(2);
  });

  test('a vector filled over a range is kept when nothing it reads changes', async () => {
    const r = await edited(sheetOf(['i\\coloneq 0..3', 'v_{i}\\coloneq i^2', 'z\\coloneq 1', 'v_{3}+z=']), (ws) => set(ws, 'r3', 'z\\coloneq 100'));
    expect(r.ran).toEqual(['r3', 'r4']);
    expect(value(r.outcomes, 'r4')).toBe(109);
  });

  test('an element definition reads the vector it extends', async () => {
    const r = await edited(sheetOf(['v\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}', 'v_{2}\\coloneq 9', 'v=']), (ws) => set(ws, 'r1', 'v\\coloneq \\begin{pmatrix}10\\\\20\\\\30\\end{pmatrix}'));
    expect(r.ran).toEqual(['r1', 'r2', 'r3']);
    expect([...((r.outcomes[2]!.value as unknown) as { re: Float64Array }).re]).toEqual([10, 20, 9]);
  });

  test('a vector extended over a range reads what it extends', async () => {
    const r = await edited(sheetOf(['v\\coloneq \\begin{pmatrix}100\\\\200\\end{pmatrix}', 'i\\coloneq 2..4', 'v_{i}\\coloneq i', 'v=']), (ws) => set(ws, 'r1', 'v\\coloneq \\begin{pmatrix}7\\\\8\\end{pmatrix}'));
    expect(r.ran).toContain('r3');
    expect([...((r.outcomes[3]!.value as unknown) as { re: Float64Array }).re]).toEqual([7, 8, 2, 3, 4]);
  });

  test('a run stopped part way leaves a snapshot that the next run finishes from', async () => {
    const ws = sheetOf(base);
    const first = await runIncremental(ws, noAlgebra, null);
    const after = structuredClone(ws);
    set(after, 'r1', 'x\\coloneq 3');
    let calls = 0;
    let saved: Snapshot | null = null;
    await expect(runIncremental(after, noAlgebra, first.snapshot, {
      between: async () => {
        if (++calls === 3) throw new Error('superseded');
      },
      progress: (s) => (saved = s),
    })).rejects.toThrow('superseded');
    const resumed = await runIncremental(after, noAlgebra, saved);
    expect(resumed.outcomes.map(flat)).toEqual(runWorksheet(after).map(flat));
    expect(resumed.ran).not.toContain('r1');
  });

  test('a change of sheet settings starts over', async () => {
    const ws = sheetOf(['v\\coloneq \\begin{pmatrix}1\\\\2\\end{pmatrix}', 'v_{1}=']);
    const r = await edited(ws, (w) => (w.origin = 1));
    expect(r.ran).toEqual(['r1', 'r2']);
  });
});

describe('random numbers, recalculated from a change down', () => {
  test('give the same numbers as a full run', async () => {
    const r = await edited(sheetOf(['i\\coloneq 0..9', 'x_{i}\\coloneq \\mathrm{rnd}\\left(1\\right)', 'k\\coloneq 2', 'x\\cdot k=']), (ws) => set(ws, 'r3', 'k\\coloneq 3'));
    expect(r.ran).toEqual(['r3', 'r4']);
  });
});

describe('what a calculation says it may change', () => {
  test('the first region affected and everything below it; nothing for a display-only change', async () => {
    const ws = sheetOf(['x\\coloneq 1', 'y\\coloneq 2', 'y=', 'L\\coloneq 3\\cdot m', 'L=']);
    const first = await runIncremental(ws, noAlgebra, null);
    const edited = structuredClone(ws);
    set(edited, 'r2', 'y\\coloneq 5');
    let planned: string[] = [];
    const kept: string[] = [];
    const second = await runIncremental(edited, noAlgebra, first.snapshot, { planned: (ids) => (planned = ids), kept: (id) => kept.push(id) });
    expect(planned).toEqual(['r2', 'r3', 'r4', 'r5']);
    // L and its answer don't read y: they're found to be current as the run reaches them.
    expect(kept).toEqual(['r4', 'r5']);
    const shown = structuredClone(edited);
    const c = shown.regions[4]!.content;
    if (c.k === 'eval') c.unit = readTex('\\mathrm{cm}');
    await runIncremental(shown, noAlgebra, second.snapshot, { planned: (ids) => (planned = ids) });
    expect(planned).toEqual([]);
  });
});

describe('answers as they come', () => {
  test('each calculated region is handed over as soon as it is done, in order', async () => {
    const ws = sheetOf(['x\\coloneq 1', 'x=', 'y\\coloneq 2', 'y=']);
    const first = await runIncremental(ws, noAlgebra, null);
    const edited = structuredClone(ws);
    set(edited, 'r3', 'y\\coloneq 7');
    const order: string[] = [];
    const r = await runIncremental(edited, noAlgebra, first.snapshot, { finished: (o) => order.push(o.region.id) });
    expect(order).toEqual(r.ran);
    expect(order).toEqual(['r3', 'r4']);
  });
});
