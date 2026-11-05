import { describe, expect, test } from 'vitest';
import { type PlotData, runWorksheet } from '../src/engine/evaluate.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readTex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import { autoAxis, type Content, type Worksheet } from '../src/model/ast.js';
import { contourLines } from '../src/ui/plot3d.js';

type Plot = Extract<Content, { k: 'plot' }>;

/** A sheet of typed definitions, then a surface plot of `ys`; returns the plot's data or its error. */
function surfaceOf(lines: string[], ys: string, change: Partial<Plot> = {}): { data: PlotData | undefined; error: string | undefined } {
  const ws: Worksheet = emptyWorksheet();
  ws.regions = lines.map((latex, n) => ({ id: `r${n}`, left: 0, top: n * 30 - 8, alignX: 0, alignY: n * 30, disabled: false, content: readRegion(latex) }));
  const plot: Plot = { k: 'plot', x: null, ys: [readTex(ys)], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 270, height: 220, view: 'surface', ...change };
  ws.regions.push({ id: 'p', left: 0, top: 1000, alignX: 0, alignY: 1000, disabled: false, content: plot });
  const o = runWorksheet(ws).find((x) => x.region.id === 'p')!;
  return { data: o.plot, error: o.error?.reason };
}

describe('surface data', () => {
  test('a matrix gives heights over its row and column numbers', () => {
    const s = surfaceOf(['M\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}'], 'M').data!.surface!;
    expect([s.rows, s.cols, s.regular, s.sampled]).toEqual([2, 3, true, false]);
    expect([...s.z]).toEqual([1, 4, 2, 5, 3, 6]);
    expect([...s.x]).toEqual([0, 1, 0, 1, 0, 1]);
    expect([...s.y]).toEqual([0, 0, 1, 1, 2, 2]);
  });

  test('a function of two variables is sampled over the x and y limits', () => {
    const s = surfaceOf(['f\\left(x,y\\right)\\coloneq x\\cdot 10+y'], 'f', { xAxis: { ...autoAxis(), min: readTex('0'), max: readTex('3') } }).data!.surface!;
    expect([s.rows, s.cols, s.regular, s.sampled]).toEqual([31, 31, true, true]);
    expect([s.x[0], s.x[30], s.y[0], s.y[31 * 30]]).toEqual([0, 3, -5, 5]);
    expect(s.z[30 + 31 * 30]).toBeCloseTo(35);
  });

  test('three matrices in a vector give each point its x, y and z', () => {
    const s = surfaceOf(['X\\coloneq \\begin{pmatrix}0&1\\\\0&1\\end{pmatrix}', 'Y\\coloneq \\begin{pmatrix}0&0\\\\1&1\\end{pmatrix}', 'Z\\coloneq \\begin{pmatrix}7&8\\\\9&10\\end{pmatrix}'],
      '\\begin{pmatrix}X\\\\Y\\\\Z\\end{pmatrix}').data!.surface!;
    expect([s.regular, s.sampled]).toEqual([false, false]);
    expect([...s.z]).toEqual([7, 9, 8, 10]);
  });

  test('X, Y and Z of different sizes say so', () => {
    const r = surfaceOf(['X\\coloneq \\begin{pmatrix}0&1\\\\0&1\\end{pmatrix}', 'Z\\coloneq \\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}'], '\\begin{pmatrix}X\\\\X\\\\Z\\end{pmatrix}');
    expect(r.error).toContain('same size');
  });

  test('a number is not a surface', () => {
    expect(surfaceOf([], '3').error).toContain('A surface needs');
  });

  test('a function sampled over limits the wrong way round says so', () => {
    const r = surfaceOf(['f\\left(x,y\\right)\\coloneq x+y'], 'f', { xAxis: { ...autoAxis(), min: readTex('2'), max: readTex('1') } });
    expect(r.error).toContain('upper limit');
  });
});

describe('contour lines', () => {
  // Heights x + y on a 3 × 3 grid: the level 2 runs corner to corner through the middle point's cells.
  const grid = (z: number[]) => ({
    rows: 3, cols: 3, regular: true, sampled: false, zDim: undefined as never,
    x: Float64Array.from([0, 1, 2, 0, 1, 2, 0, 1, 2]), y: Float64Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]), z: Float64Array.from(z),
  });

  test('a level crossing a plane gives straight segments where the height equals it', () => {
    const segs = contourLines(grid([0, 1, 2, 1, 2, 3, 2, 3, 4]), 1.5);
    expect(segs.length).toBe(3);
    for (const [x1, y1, x2, y2] of segs) {
      expect(x1 + y1).toBeCloseTo(1.5);
      expect(x2 + y2).toBeCloseTo(1.5);
    }
  });

  test('a level outside the heights gives nothing', () => {
    expect(contourLines(grid([0, 1, 2, 1, 2, 3, 2, 3, 4]), 9)).toEqual([]);
  });

  test('a peak gives a closed ring around it', () => {
    const segs = contourLines(grid([0, 0, 0, 0, 1, 0, 0, 0, 0]), 0.5);
    expect(segs.length).toBe(4);
    for (const [x1, y1] of segs) expect(Math.max(Math.abs(x1 - 1), Math.abs(y1 - 1))).toBeCloseTo(0.5);
  });
});
