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
 * Sharing worksheets through GitHub gists. A gist is a small file kept by GitHub, free with an account; anyone with
 * its address can read it, and GitHub lets any page fetch a public or secret gist, so MathMath needs no server of its
 * own. A link `?gist=<id>` opens the gist's worksheet. Only gists are fetched this way, never an address a link
 * names: a link can't make a visitor's browser fetch anything else.
 */

/** A gist's id: hexadecimal, 32 digits today and fewer for old ones. Nothing else ever goes into the address. */
const ID = /^[0-9a-f]{5,40}$/i;

/**
 * The gist id in what was pasted: a gist's page or raw address, a MathMath link to one, or the id itself.
 * Null when it isn't one.
 */
export function gistId(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s.toLowerCase();
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const param = url.searchParams.get('gist');
  if (param !== null) return ID.test(param) ? param.toLowerCase() : null;
  if (url.protocol !== 'https:') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  // gist.github.com/<id>, gist.github.com/<user>/<id>, …/<id>/<revision>
  if (url.hostname === 'gist.github.com') {
    const at = parts.findIndex((p) => ID.test(p));
    return at >= 0 && at <= 1 ? parts[at]!.toLowerCase() : null;
  }
  // gist.githubusercontent.com/<user>/<id>/raw/…
  if (url.hostname === 'gist.githubusercontent.com') return parts[1] && ID.test(parts[1]) ? parts[1].toLowerCase() : null;
  return null;
}

/** The link that opens a gist's worksheet in this copy of MathMath. */
export function shareLink(id: string, here: { origin: string; pathname: string } = location): string {
  return `${here.origin}${here.pathname}?gist=${id}`;
}

export interface SharedSheet {
  /** The file's name, such as beam.mathmath. */
  file: string;
  text: string;
  /** Who made the gist, when GitHub says. */
  owner: string | null;
  /** The gist's page on GitHub, where its comments are. */
  page: string | null;
}

/** The biggest worksheet opened from a link. A gist file can be up to about 100 MB; a worksheet is rarely 5. */
export const MAX_BYTES = 50_000_000;

interface GistFile { filename?: string; raw_url?: string; truncated?: boolean; content?: string; size?: number }

const clock = (seconds: string | null): string => {
  const t = Number(seconds);
  return Number.isFinite(t) && t > 0 ? ` after ${new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ' later';
};

/** Reads a gist's worksheet: its first .mathmath file. Throws a message to show. */
export async function fetchGist(id: string, get: typeof fetch = fetch): Promise<SharedSheet> {
  if (!ID.test(id)) throw new Error('That isn\'t a gist\'s address.');
  let res: Response;
  try {
    res = await get(`https://api.github.com/gists/${id}`, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit' });
  } catch {
    throw new Error('GitHub couldn\'t be reached. Check the connection and try again.');
  }
  if (res.status === 404) throw new Error('There\'s no gist at that address. It may have been deleted, or the address is incomplete.');
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new Error(`GitHub lets each connection open 60 gists an hour without signing in, and this one has. Try again${clock(res.headers.get('x-ratelimit-reset'))}.`);
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for that gist.`);
  const gist = await res.json() as { files?: Record<string, GistFile>; owner?: { login?: string } | null; html_url?: string };
  const files = Object.values(gist.files ?? {});
  const file = files.find((f) => /\.mathmath$/i.test(f.filename ?? ''));
  if (!file?.filename) throw new Error('That gist has no worksheet in it: no file ending in .mathmath.');
  if ((file.size ?? 0) > MAX_BYTES) throw new Error('That worksheet is too big to open from a link. Download it from the gist and open it.');
  let text = file.content;
  if (file.truncated || typeof text !== 'string') {
    // GitHub cuts long files short in the list; the full file is at its raw address.
    if (!file.raw_url?.startsWith('https://gist.githubusercontent.com/')) throw new Error('GitHub didn\'t say where the whole worksheet is.');
    let raw: Response;
    try {
      raw = await get(file.raw_url, { credentials: 'omit' });
    } catch {
      throw new Error('GitHub couldn\'t be reached. Check the connection and try again.');
    }
    if (!raw.ok) throw new Error(`GitHub answered ${raw.status} for that worksheet.`);
    text = await raw.text();
  }
  const login = gist.owner?.login;
  return {
    file: file.filename,
    text,
    owner: typeof login === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(login) ? login : null,
    page: typeof gist.html_url === 'string' && gist.html_url.startsWith('https://gist.github.com/') ? gist.html_url : null,
  };
}

/** Copies text, through the clipboard where the page may use it and by selecting it where it may not (plain http). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the old way.
  }
  // Selecting the text takes the focus, which goes back after, so the keys still reach the dialog.
  const was = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  if (was instanceof HTMLElement) was.focus();
  return ok;
}

/**
 * Where people show what they've made, from a hosted copy's source address when it's a GitHub repository: its
 * Discussions' Show and tell. Empty when there's none, as in a copy built without one.
 */
export function communityPage(source: string): string {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:[/?#]|$)/.exec(source);
  return m ? `https://github.com/${m[1]}/${m[2]!.replace(/\.git$/, '')}/discussions/categories/show-and-tell` : '';
}

/** The Share dialog: how to share this worksheet as a gist, and a box to open someone else's. */
export class ShareDialog {
  readonly el = document.createElement('div');
  /** The worksheet as saved, to copy. */
  worksheet: () => string = () => '';
  /** Called with the gist to open; the dialog has closed by then. */
  onOpen: (id: string) => void = () => {};
  private before: Element | null = null;
  private gist: HTMLInputElement;
  private link: HTMLInputElement;
  private linkRow: HTMLElement;
  private address: HTMLInputElement;
  private status: HTMLElement;

  constructor(community = '') {
    this.el.id = 'share';
    this.el.className = 'dialog';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'share-title');
    this.el.innerHTML = `
      <div class="card">
        <div class="head"><h2 id="share-title">Share</h2><button type="button" class="close" title="Close (Esc)" aria-label="Close">×</button></div>
        <h3>Share this worksheet</h3>
        <p class="intro">A worksheet is shared as a gist: a small file GitHub keeps for free, with its own page and comments. You need a GitHub account to make one; anyone can open it.</p>
        <ol>
          <li><button type="button" class="copy-sheet">Copy the worksheet</button> <span class="note"></span><br>
            <span class="muted">Or save it, and drop the file onto the gist page.</span></li>
          <li>On <a href="https://gist.github.com/" target="_blank" rel="noopener">gist.github.com</a>, paste it in, give the file a name ending in
            <code>.mathmath</code>, and create the gist. A secret gist is seen only by people who have its link.</li>
          <li><label for="share-gist">Paste the gist's address:</label>
            <input id="share-gist" class="gist" type="url" placeholder="https://gist.github.com/…" autocomplete="off" spellcheck="false">
            <div class="link-row" hidden><input class="link" readonly aria-label="Link to the worksheet"> <button type="button" class="copy-link">Copy link</button></div>
            <span class="muted gist-note"></span></li>
          ${community ? `<li>To show it to others, post the link in MathMath's <a class="community" href="${community}" target="_blank" rel="noopener">Show and tell</a>.</li>` : ''}
        </ol>
        <h3>Open a shared worksheet</h3>
        <form class="open-row"><input class="address" type="url" placeholder="A link or gist address" aria-label="Link or gist address" autocomplete="off" spellcheck="false"> <button type="submit">Open</button></form>
        <p class="muted status" role="status">Opening one reads it from GitHub.</p>
      </div>`;
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector<T>(s)!;
    this.gist = q<HTMLInputElement>('.gist');
    this.link = q<HTMLInputElement>('.link');
    this.linkRow = q('.link-row');
    this.address = q<HTMLInputElement>('.address');
    this.status = q('.status');
    q('.close').addEventListener('click', () => this.close());
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    q('.copy-sheet').addEventListener('click', () => {
      void copyText(this.worksheet()).then((ok) => {
        q('.note').textContent = ok ? 'Copied.' : 'It couldn\'t be copied here: save it instead.';
      });
    });
    this.gist.addEventListener('input', () => this.showLink());
    q('.copy-link').addEventListener('click', () => {
      void copyText(this.link.value).then((ok) => {
        q('.gist-note').textContent = ok ? 'Copied. Anyone who opens it gets the worksheet as the gist has it.' : 'Select the link and copy it.';
      });
    });
    q('.open-row').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = gistId(this.address.value);
      if (!id) {
        this.status.textContent = 'That isn\'t a gist or a link to one.';
        return;
      }
      this.close();
      this.onOpen(id);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      e.stopPropagation();
    });
    document.body.appendChild(this.el);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  private showLink(): void {
    const value = this.gist.value.trim();
    const id = value ? gistId(value) : null;
    this.linkRow.hidden = !id;
    this.link.value = id ? shareLink(id) : '';
    this.el.querySelector('.gist-note')!.textContent = value && !id ? 'That isn\'t a gist\'s address.' : '';
  }

  open(): void {
    this.before = document.activeElement;
    this.el.querySelector('.note')!.textContent = '';
    this.status.textContent = 'Opening one reads it from GitHub.';
    this.el.hidden = false;
    this.el.querySelector<HTMLButtonElement>('.copy-sheet')!.focus();
  }

  close(): void {
    this.el.hidden = true;
    if (this.before instanceof HTMLElement && document.contains(this.before)) this.before.focus();
  }
}
