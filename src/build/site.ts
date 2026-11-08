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
 * Site extras: the one way a hosted copy of MathMath adds things of its own, such as ads, without changing the
 * app. A build with MATHMATH_SITE set to a folder holding `site.json` gets:
 *
 * - the extra Content Security Policy sources that file lists, in the page's policy and in `site/csp.txt`, for
 *   the host to send as a header too (a header and a <meta> policy both apply, so they must agree);
 * - its `script`, copied to `site/extras.js` and loaded by the page; it can fill `#site-slot`, a bar at the
 *   left of the desk, clear of the paper and of Help, that stays hidden and empty otherwise, and never prints;
 * - its `source`, a link to the source code shown in About, as the AGPL asks of a public service.
 *
 * Without MATHMATH_SITE, a build is exactly as before. Runs in Node, from vite.config.ts, never in the app.
 *
 * site.json: { "csp": { "script-src": ["https://ads.example"], "frame-src": ["https://ads.example"] },
 *              "script": "extras.js", "source": "https://github.com/…" }
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface SiteConfig {
  /** Extra sources for each policy directive, as "script-src": ["https://…"]. */
  csp?: Record<string, string[]>;
  /** A script in the site folder, loaded by the page after the app. */
  script?: string;
  /** Where the source code is, for About. */
  source?: string;
}

export interface Site {
  dir: string;
  config: SiteConfig;
}

/** Directives a site may add sources to. Others, such as base-uri, stay the app's. */
const OPEN = new Set(['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'child-src', 'media-src', 'worker-src']);

/** A source as a policy writes one: a scheme, a host, or a quoted keyword. Nothing that could end a directive. */
const SOURCE = /^(?:'[a-z-]+'|[a-z][a-z0-9+.-]*:|(?:[a-z][a-z0-9+.-]*:\/\/)?(?:\*\.)?[a-z0-9.-]+(?::\d+)?(?:\/[^\s;,"']*)?)$/i;

/** Reads the site folder, or null when MATHMATH_SITE isn't set. Throws on anything malformed, so a build stops. */
export function readSite(dir: string | undefined): Site | null {
  if (!dir) return null;
  const at = resolve(dir);
  const file = join(at, 'site.json');
  if (!existsSync(file)) throw new Error(`MATHMATH_SITE is ${at}, which has no site.json`);
  const config = JSON.parse(readFileSync(file, 'utf8')) as SiteConfig;
  for (const [directive, sources] of Object.entries(config.csp ?? {})) {
    if (!OPEN.has(directive)) throw new Error(`site.json: ${directive} can't be extended; only ${[...OPEN].join(', ')}`);
    if (!Array.isArray(sources)) throw new Error(`site.json: ${directive} must be a list of sources`);
    for (const s of sources) if (typeof s !== 'string' || !SOURCE.test(s)) throw new Error(`site.json: ${JSON.stringify(s)} isn't a policy source`);
  }
  if (config.script !== undefined && !existsSync(join(at, config.script))) throw new Error(`site.json: no script ${config.script} in ${at}`);
  if (config.source !== undefined && !/^https:\/\/[^\s"<>]+$/.test(config.source)) throw new Error('site.json: source must be an https:// address');
  return { dir: at, config };
}

/** The app's policy with a site's extra sources. A directive the app leaves to default-src starts from 'self'. */
export function mergeCsp(base: string, extra: Record<string, string[]> | undefined): string {
  if (!extra) return base;
  const directives = base.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]);
  for (const [name, sources] of Object.entries(extra)) {
    let d = directives.find((x) => x[0] === name);
    if (!d) directives.push((d = [name, "'self'"]));
    for (const s of sources) if (!d.includes(s)) d.push(s);
  }
  return directives.map((d) => d.join(' ')).join('; ');
}

/** The tag that loads the site's script, last in the body, after the app. */
export const SITE_SCRIPT_TAG = '<script src="/site/extras.js" defer></script>';

/** Copies the site's script and writes the policy for the host's header, into the built app. */
export function writeSiteFiles(site: Site, outDir: string, csp: string): void {
  const into = join(outDir, 'site');
  mkdirSync(into, { recursive: true });
  if (site.config.script) copyFileSync(join(site.dir, site.config.script), join(into, 'extras.js'));
  writeFileSync(join(into, 'csp.txt'), `${csp}\n`);
}
