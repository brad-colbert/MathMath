// Runs Giac, the algebra engine. It's a plain script because the engine is one: a module worker
// can't load it. Requests are { id, setup, command, cleanup }, and each runs to completion.
var Module = {
  onRuntimeInitialized: function () {
    var run = Module.cwrap('caseval', 'string', ['string']);
    self.onmessage = function (m) {
      var r = m.data;
      var out;
      try {
        r.setup.forEach(run);
        out = run(r.command);
        r.cleanup.forEach(run);
      } catch (err) {
        out = 'ERROR ' + err;
      }
      postMessage({ id: r.id, out: out });
    };
    postMessage({ ready: true });
  },
};
importScripts('vendor/giacwasm.js');
