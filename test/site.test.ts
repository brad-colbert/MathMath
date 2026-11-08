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

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { mergeCsp, readSite, writeSiteFiles } from '../src/build/site.js';
import { CSP } from '../vite.config.js';

/** A site folder holding this site.json, and an extras.js. */
function folder(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'mathmath-site-'));
  writeFileSync(join(dir, 'site.json'), JSON.stringify(config));
  writeFileSync(join(dir, 'extras.js'), '// site script\n');
  return dir;
}

describe('site extras', () => {
  test('without MATHMATH_SITE, nothing changes', () => {
    expect(readSite(undefined)).toBeNull();
    expect(mergeCsp(CSP, undefined)).toBe(CSP);
  });
  test("a site's sources join the app's policy; a directive left to default-src starts from 'self'", () => {
    const csp = mergeCsp(CSP, { 'script-src': ['https://ads.example.com'], 'frame-src': ['https://ads.example.com'], 'img-src': ['https:', 'data:'] });
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' https://ads.example.com");
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("frame-src 'self' https://ads.example.com");
    // What the app locks down stays locked.
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
  test('site.json is checked, so a bad one stops the build', () => {
    expect(() => readSite(join(tmpdir(), 'no-such-site-folder'))).toThrow(/no site.json/);
    expect(() => readSite(folder({ csp: { 'base-uri': ['https://x.example'] } }))).toThrow(/can't be extended/);
    expect(() => readSite(folder({ csp: { 'script-src': ["https://x.example; script-src *"] } }))).toThrow(/isn't a policy source/);
    expect(() => readSite(folder({ csp: { 'script-src': ['https://x.example" onload="'] } }))).toThrow(/isn't a policy source/);
    expect(() => readSite(folder({ script: 'missing.js' }))).toThrow(/no script/);
    expect(() => readSite(folder({ source: 'javascript:alert(1)' }))).toThrow(/https/);
    expect(readSite(folder({ csp: { 'script-src': ['https://*.ads.example.com', "'unsafe-inline'"] }, script: 'extras.js', source: 'https://example.com/src' }))?.config.source).toBe('https://example.com/src');
  });
  test('the build gets the script and the policy for the host to send', () => {
    const site = readSite(folder({ script: 'extras.js' }))!;
    const out = mkdtempSync(join(tmpdir(), 'mathmath-dist-'));
    writeSiteFiles(site, out, "default-src 'self'");
    expect(readFileSync(join(out, 'site', 'extras.js'), 'utf8')).toBe('// site script\n');
    expect(readFileSync(join(out, 'site', 'csp.txt'), 'utf8')).toBe("default-src 'self'\n");
  });
});
