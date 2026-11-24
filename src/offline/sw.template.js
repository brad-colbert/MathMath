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

// The service worker that lets MathMath open and calculate with no network. The build fills in the lists below
// (src/build/offline.ts) and writes it as sw.js, which always keeps that name and place.
//
// - Every file of the build is kept in a cache of its own version. A file the last version already holds, by its
//   content's hash, is copied from there rather than fetched again: a release fetches only what changed.
// - The algebra engine is large, so it isn't fetched while installing: the page asks for it once the app is running.
// - A new version waits until the page asks for it (Reload on its notice) or every tab is closed. It never takes over
//   a page that is open: that page may still start a worker whose files only the old version has.
// - It answers only for this site's own files. Gists and pictures from the web go to the network as ever.
// - Kill switch: a sw.js that unregisters itself and deletes the caches named mathmath-*.

const FILES = /* FILES */ [];
const LATER = /* LATER */ [];
const VERSION = /* VERSION */ '';
const BASE = /* BASE */ '/';
const CACHE = `mathmath-${VERSION}`;
/** Which file, by its address, has which hash in a cache: kept in the cache itself, never fetched. */
const INDEX = `${BASE}__mathmath-files.json`;

const older = async () => (await caches.keys()).filter((k) => k.startsWith('mathmath-') && k !== CACHE);

async function indexOf(cache) {
  const r = await cache.match(INDEX);
  return r ? r.json() : {};
}

/**
 * Puts files in this version's cache: copied from an older one that holds the same content, or fetched, checked with
 * the server. Only copied, when `fetching` is false. All or nothing: one that fails fails the whole.
 */
async function fill(files, fetching) {
  const cache = await caches.open(CACHE);
  const olds = await Promise.all((await older()).map(async (name) => {
    const c = await caches.open(name);
    return { cache: c, hashes: await indexOf(c) };
  }));
  const have = await indexOf(cache);
  const got = {};
  await Promise.all(files.map(async ({ url, hash }) => {
    if (have[url] === hash && await cache.match(url)) return;
    for (const old of olds) {
      if (old.hashes[url] !== hash) continue;
      const r = await old.cache.match(url);
      if (r) {
        await cache.put(url, r);
        got[url] = hash;
        return;
      }
    }
    if (!fetching) return;
    // Built files are named by their content, so the browser's copy is right; anything else is checked with the
    // server first, which costs only a short answer when it hasn't changed.
    const r = await fetch(url, { cache: url.startsWith(`${BASE}assets/`) ? 'default' : 'no-cache' });
    if (!r.ok || r.redirected) throw new Error(`${url}: ${r.status}`);
    await cache.put(url, r);
    got[url] = hash;
  }));
  const now = { ...(await indexOf(cache)), ...got };
  await cache.put(INDEX, new Response(JSON.stringify(now), { headers: { 'Content-Type': 'application/json' } }));
  return now;
}

/** Whether every file, the algebra engine's too, is here. */
async function ready() {
  const hashes = await indexOf(await caches.open(CACHE));
  return [...FILES, ...LATER].every(({ url, hash }) => hashes[url] === hash);
}

self.addEventListener('install', (event) => {
  event.waitUntil(fill(FILES, true).then(() => fill(LATER, false)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const old = await older();
    // The version before stays, for a tab still open on it; anything older goes.
    for (const name of old.slice(0, -1)) await caches.delete(name);
    // The first version takes the page that installed it: its files are the ones that page is made of.
    if (old.length === 0) await self.clients.claim();
  })());
});

async function answer(request, url) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname;
  const found = (await cache.match(key)) ?? (await caches.match(key));
  if (found) return found;
  // The algebra engine, asked for before it was fetched for keeps, is kept as it arrives.
  const later = LATER.find((f) => f.url === url.pathname);
  const r = await fetch(request);
  if (later && r.ok && !r.redirected) {
    await cache.put(key, r.clone());
    const now = { ...(await indexOf(cache)), [later.url]: later.hash };
    await cache.put(INDEX, new Response(JSON.stringify(now), { headers: { 'Content-Type': 'application/json' } }));
  }
  return r;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (request.mode === 'navigate' && (url.pathname === BASE || url.pathname === `${BASE}index.html`)) {
    // The page, whatever follows it, as ?gist=: it reads that itself.
    event.respondWith((async () => (await (await caches.open(CACHE)).match(BASE)) ?? fetch(request))());
    return;
  }
  event.respondWith(answer(request, url));
});

self.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (event.data === 'update') {
    void self.skipWaiting();
  } else if (event.data === 'later') {
    // The algebra engine, fetched now the app is running; the page hears when everything is here.
    event.waitUntil(fill(LATER, true).then(ready, () => false).then((r) => port?.postMessage({ ready: r })));
  } else if (event.data === 'ready') {
    event.waitUntil(ready().then((r) => port?.postMessage({ ready: r })));
  }
});
