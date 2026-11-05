import { describe, expect, test } from 'vitest';
import { autoAxis, type Content } from '../src/model/ast.js';
import { readTex } from '../src/latex/latex.js';
import { withTraceStyle } from '../src/ui/trace-panel.js';
import { traceLook } from '../src/ui/plot.js';

type Plot = Extract<Content, { k: 'plot' }>;
const plot = (): Plot => ({ k: 'plot', x: readTex('x'), ys: [readTex('a'), readTex('b')], xAxis: autoAxis(), yAxis: autoAxis(), markers: false, width: 216, height: 150 });

describe('trace styles', () => {
  test('a style changes one trace and leaves the others on their defaults', () => {
    const c = withTraceStyle(plot(), 1, { color: '#123456', line: 'dot', points: 'square' });
    expect(c.traces).toEqual([null, { color: '#123456', line: 'dot', points: 'square' }]);
    expect(traceLook(c, 1)).toMatchObject({ color: '#123456', dash: '1.5 2.5', line: true, points: 'square' });
    expect(traceLook(c, 0)).toEqual(traceLook(plot(), 0));
  });

  test('clearing a part, or the whole style, goes back to the default, and a plot with none saves as before', () => {
    let c = withTraceStyle(plot(), 0, { color: '#123456', weight: 3 });
    c = withTraceStyle(c, 0, { weight: undefined });
    expect(c.traces?.[0]).toEqual({ color: '#123456' });
    c = withTraceStyle(c, 0, null);
    expect('traces' in c).toBe(false);
    expect(JSON.stringify(c)).toBe(JSON.stringify(plot()));
  });

  test('a line of none draws points instead, and the plot-wide points setting still applies by default', () => {
    expect(traceLook(withTraceStyle(plot(), 0, { line: 'none' }), 0)).toMatchObject({ line: false });
    expect(traceLook({ ...plot(), markers: true }, 0)).toMatchObject({ line: false, points: 'circle' });
  });
});
