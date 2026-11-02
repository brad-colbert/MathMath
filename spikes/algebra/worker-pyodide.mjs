import { loadPyodide } from '/nm/pyodide/pyodide.mjs';
(async () => {
  const py = await loadPyodide({ indexURL: '/nm/pyodide/', packageBaseUrl: '/vendor/pyodide/' });
  await py.loadPackage(['/vendor/pyodide/mpmath-1.4.1-py3-none-any.whl', '/vendor/pyodide/sympy-1.14.0-py3-none-any.whl']);
  py.runPython(`
from sympy import *
x,y,a,b,c,n,p,q,r,t,i = symbols('x y a b c n p q r t i')
`);
  const run = py.globals.get('eval');
  self.onmessage = (m) => {
    const t = performance.now();
    let out;
    try { out = py.runPython(`str(${m.data.cmd})`); } catch (err) { out = `ERROR ${String(err).split('\n').slice(-2).join(' ')}`; }
    postMessage({ id: m.data.id, out, ms: performance.now() - t });
  };
  void run;
  postMessage({ ready: true });
})().catch((err) => postMessage({ failed: String(err) }));
