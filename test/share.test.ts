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

import { describe, expect, test } from 'vitest';
import { communityPage, fetchGist, gistId, shareLink } from '../src/ui/share.js';

const ID = 'aa5a315d61ae9438b18d0123456789ab';

describe('gist addresses', () => {
  test('the id is found in each way of writing it', () => {
    for (const s of [
      ID, ` ${ID.toUpperCase()} `,
      `https://gist.github.com/${ID}`,
      `https://gist.github.com/someone/${ID}`,
      `https://gist.github.com/someone/${ID}/0123abcd#file-beam-mathmath`,
      `https://gist.githubusercontent.com/someone/${ID}/raw/beam.mathmath`,
      `https://mathmath.example/?gist=${ID}`,
      `http://localhost:5173/?x=1&gist=${ID}`,
    ]) expect(gistId(s), s).toBe(ID);
  });
  test('anything else is refused, so a link can only ever fetch a gist', () => {
    for (const s of [
      '', 'beam', 'https://example.com/beam.mathmath', `https://evil.example/${ID}`, `http://gist.github.com/${ID}`,
      `https://gist.github.com/a/b/${ID}`, 'https://mathmath.example/?gist=../../users', `https://x/?gist=${ID}%2F..`,
      `javascript:alert(1)//?gist=${ID}`, 'ftp://gist.github.com/abcdef',
    ]) expect(gistId(s), s).toBeNull();
  });
  test('the link opens the gist in this copy of MathMath', () => {
    expect(shareLink(ID, { origin: 'https://mathmath.example', pathname: '/app/' })).toBe(`https://mathmath.example/app/?gist=${ID}`);
  });
  test('the community page is the source repository\'s Show and tell', () => {
    expect(communityPage('https://github.com/someone/MathMath/tree/v0.56.1')).toBe('https://github.com/someone/MathMath/discussions/categories/show-and-tell');
    expect(communityPage('https://github.com/someone/MathMath')).toBe('https://github.com/someone/MathMath/discussions/categories/show-and-tell');
    expect(communityPage('')).toBe('');
    expect(communityPage('https://gitlab.com/someone/MathMath')).toBe('');
  });
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('reading a gist', () => {
  test('its .mathmath file is read, and only GitHub is asked', async () => {
    const asked: string[] = [];
    const get = (async (url: string) => {
      asked.push(url);
      return json({
        owner: { login: 'someone' }, html_url: `https://gist.github.com/someone/${ID}`,
        files: { 'notes.md': { filename: 'notes.md', content: '# hi' }, 'beam.mathmath': { filename: 'beam.mathmath', content: '{"format":"mathmath"}', size: 21 } },
      });
    }) as typeof fetch;
    expect(await fetchGist(ID, get)).toEqual({ file: 'beam.mathmath', text: '{"format":"mathmath"}', owner: 'someone', page: `https://gist.github.com/someone/${ID}` });
    expect(asked).toEqual([`https://api.github.com/gists/${ID}`]);
  });
  test('a long file, cut short in the list, is read whole from its raw address', async () => {
    const raw = `https://gist.githubusercontent.com/someone/${ID}/raw/abc/beam.mathmath`;
    const get = (async (url: string) => (url === raw ? new Response('whole') : json({ files: { a: { filename: 'beam.mathmath', content: 'cut', truncated: true, raw_url: raw } } }))) as typeof fetch;
    expect((await fetchGist(ID, get)).text).toBe('whole');
  });
  test('a raw address anywhere but GitHub is not fetched', async () => {
    const get = (async () => json({ files: { a: { filename: 'beam.mathmath', truncated: true, raw_url: 'https://evil.example/x' } } })) as typeof fetch;
    await expect(fetchGist(ID, get)).rejects.toThrow(/didn't say where/);
  });
  test('what went wrong is said plainly', async () => {
    await expect(fetchGist(ID, (async () => json({}, 404)) as typeof fetch)).rejects.toThrow(/no gist at that address/);
    await expect(fetchGist(ID, (async () => json({}, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' })) as typeof fetch)).rejects.toThrow(/60 gists an hour/);
    await expect(fetchGist(ID, (async () => { throw new TypeError('offline'); }) as typeof fetch)).rejects.toThrow(/couldn't be reached/);
    await expect(fetchGist(ID, (async () => json({ files: { a: { filename: 'a.py', content: '' } } })) as typeof fetch)).rejects.toThrow(/no worksheet/);
    await expect(fetchGist('../x', (async () => json({})) as typeof fetch)).rejects.toThrow(/isn't a gist/);
  });
  test('an owner or page that GitHub would never send is dropped', async () => {
    const get = (async () => json({ owner: { login: '<b>x</b>' }, html_url: 'javascript:alert(1)', files: { a: { filename: 'a.mathmath', content: '' } } })) as typeof fetch;
    expect(await fetchGist(ID, get)).toMatchObject({ owner: null, page: null });
  });
});
