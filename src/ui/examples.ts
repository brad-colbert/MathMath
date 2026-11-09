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
 * The Examples gallery: worksheets that show what MathMath does, each a small real problem worked on paper.
 * They're built by `npm run examples` into public/examples, with index.json listing them, and fetched only when
 * the gallery opens, so they cost nothing until someone asks.
 */

export interface ExampleInfo {
  slug: string;
  title: string;
  summary: string;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' } as Record<string, string>)[c]};`);

/** Where the examples are served from: beside the app. */
const base = (): string => `${import.meta.env.BASE_URL}examples/`;

/** Reads an example's file. */
export async function fetchExample(slug: string): Promise<string> {
  const res = await fetch(`${base()}${encodeURIComponent(slug)}.mathmath`);
  if (!res.ok) throw new Error(`The example ${slug} couldn't be loaded (${res.status}).`);
  return res.text();
}

export class ExamplesDialog {
  readonly el = document.createElement('div');
  /** Called with the example chosen; the dialog has closed by then. */
  onPick: (example: ExampleInfo) => void = () => {};
  private list: HTMLElement;
  private loaded: Promise<ExampleInfo[]> | null = null;
  private before: Element | null = null;

  constructor() {
    this.el.id = 'examples';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'examples-title');
    this.el.innerHTML = `
      <div class="card">
        <div class="head"><h2 id="examples-title">Examples</h2><button type="button" class="close" title="Close (Esc)" aria-label="Close">×</button></div>
        <p class="intro">Each is a small problem, worked on paper. Open one and change a number: everything below it follows.</p>
        <ul class="list"><li class="muted">Loading…</li></ul>
      </div>`;
    this.list = this.el.querySelector<HTMLElement>('.list')!;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-slug]');
      if (!b) return;
      void this.index().then((all) => {
        const pick = all.find((x) => x.slug === b.dataset.slug);
        if (!pick) return;
        this.close();
        this.onPick(pick);
      });
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      // Up and down move through the list; Tab stays in the card.
      const stops = [...this.el.querySelectorAll<HTMLButtonElement>('button')];
      const at = stops.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) ? 1 : e.key === 'ArrowUp' || e.key === 'Tab' ? -1 : 0;
      if (step && stops.length) {
        e.preventDefault();
        stops[(at + step + stops.length) % stops.length]!.focus();
      }
      e.stopPropagation();
    });
    document.body.appendChild(this.el);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** The list of examples, fetched once. */
  index(): Promise<ExampleInfo[]> {
    this.loaded ??= fetch(`${base()}index.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<ExampleInfo[]>;
    });
    this.loaded.catch(() => {
      this.loaded = null;
    });
    return this.loaded;
  }

  open(): void {
    this.before = document.activeElement;
    this.el.hidden = false;
    this.el.querySelector<HTMLButtonElement>('.close')!.focus();
    this.index().then((all) => {
      this.list.innerHTML = all.map((x) => `<li><button type="button" data-slug="${esc(x.slug)}"><span class="title">${esc(x.title)}</span><span class="summary">${esc(x.summary)}</span></button></li>`).join('');
      this.list.querySelector<HTMLButtonElement>('button')?.focus();
    }, () => {
      this.list.innerHTML = '<li class="muted">The examples couldn\'t be loaded. Check the connection and try again.</li>';
    });
  }

  close(): void {
    this.el.hidden = true;
    if (this.before instanceof HTMLElement && document.contains(this.before)) this.before.focus();
  }
}
