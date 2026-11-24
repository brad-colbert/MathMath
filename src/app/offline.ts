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


/**
 * Working with no network: the service worker (src/offline/sw.template.js) keeps the app's files, so it opens and
 * calculates offline once it's been opened online. Only a built copy registers it, and nothing here can stop the app:
 * where the browser won't have it, the app works as it always has, online.
 */
export interface OfflineEvents {
  /** Everything, the algebra engine too, is kept: the app works with no network. */
  ready: () => void;
  /** A new version is ready. `apply` reloads into it. */
  update: (apply: () => void) => void;
}

/** Asks the service worker something, and waits for its answer. */
function ask(worker: ServiceWorker, what: string): Promise<{ ready: boolean }> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (m: MessageEvent<{ ready: boolean }>) => resolve(m.data);
    worker.postMessage(what, [channel.port2]);
  });
}

export function startOffline(events: OfflineEvents): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    // Tests turn it off, as the splash: its downloads would run under them.
    if (localStorage.getItem('mathmath.offline') === 'off') return;
  } catch {
    // Storage refused: go on.
  }
  const sw = navigator.serviceWorker;
  let applying = false;
  sw.addEventListener('controllerchange', () => {
    if (applying) window.location.reload();
  });
  const base = import.meta.env.BASE_URL;
  sw.register(`${base}sw.js`, { scope: base }).then((registration) => {
    const offer = (): void => {
      const waiting = registration.waiting;
      // A first version isn't an update: it takes the page by itself.
      if (!waiting || !sw.controller) return;
      events.update(() => {
        // Asked again after the unsaved-changes question was turned down, it's already the new version: just reload.
        if (!registration.waiting) return void window.location.reload();
        applying = true;
        registration.waiting.postMessage('update');
      });
    };
    offer();
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') offer();
      });
    });
    void sw.ready.then(async (r) => {
      // When the browser is asked to save data, the algebra engine is fetched only when it's used.
      const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
      if (!r.active) return;
      const answer = await ask(r.active, saving ? 'ready' : 'later');
      if (answer.ready) events.ready();
    });
  }, () => {
    // Not allowed here, as on a server whose certificate the browser doesn't trust: the app works online.
  });
}
