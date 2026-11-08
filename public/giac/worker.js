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
