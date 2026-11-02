import { ComputeEngine } from '/nm/@cortex-js/compute-engine/dist/esm-min/compute-engine.js';
const ce = new ComputeEngine();
const expr2 = (s) => [s[0], ce.box(s[1])];
function run({ expr, fn, v, lo, hi, sub }) {
  const m2 = { sub };
  const e = ce.box(expr);
  const bound = hi !== undefined ? ['Tuple', v, lo, hi] : undefined;
  switch (fn) {
    case 'plain': return e.evaluate();
    case 'simplify': return e.simplify();
    case 'expand': return ce.box(['Expand', expr]).evaluate();
    case 'factor': return ce.box(['Factor', expr]).evaluate();
    case 'solve': return e.solve(v);
    case 'diff': return ce.box(['D', expr, v]).evaluate();
    case 'integrate': return ce.box(['Integrate', expr, v]).evaluate();
    case 'definite': return ce.box(['Integrate', ['Function', expr, v], bound]).evaluate();
    case 'limit': return ce.box(['Limit', ['Function', expr, v], lo]).evaluate();
    case 'sum': return ce.box(['Sum', expr, bound]).evaluate();
    case 'substitute': {
      const [name, value] = expr2(m2.sub);
      return e.subs({ [name]: value });
    }
    case 'series': return ce.box(['Series', expr, v]).evaluate();
    case 'coeffs': return ce.box(['Coefficients', expr, v]).evaluate();
    case 'collect': return ce.box(['Collect', expr, v]).evaluate();
    case 'parfrac': return ce.box(['PartialFraction', expr, v]).evaluate();
    case 'det': return ce.box(['Determinant', expr]).evaluate();
    case 'inverse': return ce.box(['Inverse', expr]).evaluate();
    default: throw new Error(`no ${fn}`);
  }
}
self.onmessage = (m) => {
  const t = performance.now();
  let out;
  try {
    const r = run(m.data.cmd);
    out = Array.isArray(r) ? `[${r.map(String).join(',')}]` : String(r);
  } catch (err) { out = `ERROR ${err}`; }
  postMessage({ id: m.data.id, out, ms: performance.now() - t });
};
postMessage({ ready: true });
