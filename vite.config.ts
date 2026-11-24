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

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { writeServiceWorker } from './src/build/offline.js';
import { SITE_SCRIPT_TAG, mergeCsp, readSite, writeSiteFiles } from './src/build/site.js';

/** Shown in the app, so a deployed build says which version it is. */
const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

/**
 * No generated code runs in the app, so production can refuse it outright. The one exception is
 * compiling WebAssembly, which the algebra engine needs. A <meta> policy doesn't reach workers, so
 * a deployed server must send this as a header too.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Images can be loaded from a web address, once, when asked for in the Files menu.
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

export { CSP };

/** A hosted copy's own additions, when MATHMATH_SITE names its folder (see src/build/site.ts). */
const site = readSite(process.env.MATHMATH_SITE);
const PAGE_CSP = mergeCsp(CSP, site?.config.csp);

/** Where the build goes and the address it's served from, for the service worker. */
let outDir = 'dist';
let base = '/';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(VERSION), __SOURCE_URL__: JSON.stringify(site?.config.source ?? '') },
  // Nothing inlined: the policy above refuses data: fonts.
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
  // The built app is served with the policy as a header, as a deployment would, so workers get it too.
  preview: { headers: { 'Content-Security-Policy': PAGE_CSP } },
  plugins: [{
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`),
  }, {
    name: 'site-extras',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => (site?.config.script ? html.replace('</body>', `  ${SITE_SCRIPT_TAG}\n  </body>`) : html),
    },
    writeBundle: (options) => {
      if (site) writeSiteFiles(site, options.dir ?? 'dist', PAGE_CSP);
    },
  }, {
    // Last, once every file is written: the service worker lists them all (src/offline/sw.template.js).
    name: 'offline',
    apply: 'build',
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        writeServiceWorker(new URL('./src/offline/sw.template.js', import.meta.url).pathname, outDir, base);
      },
    },
    configResolved(config) {
      outDir = config.build.outDir;
      base = config.base;
    },
  }],
});
