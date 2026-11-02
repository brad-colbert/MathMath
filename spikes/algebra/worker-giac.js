var Module = {
  onRuntimeInitialized() {
    const caseval = Module.cwrap('caseval', 'string', ['string']);
    self.onmessage = (m) => {
      const t = performance.now();
      let out;
      try { out = caseval(m.data.cmd); } catch (err) { out = `ERROR ${err}`; }
      postMessage({ id: m.data.id, out, ms: performance.now() - t });
    };
    postMessage({ ready: true });
  },
};
importScripts('/vendor/giac/giacwasm.js');
