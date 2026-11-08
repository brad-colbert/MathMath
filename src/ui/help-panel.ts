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
 * The Help panel: an entry for each function and keyword, and pages on topics, beside the paper. Search finds
 * entries by name or by what they do; each example can be put on the sheet with Insert. F1 opens the entry
 * for the name being typed.
 */
import { convertLatexToMarkup } from 'mathlive';
import { MATHCAD_FILE_FUNCTIONS } from '../xmcd/names.js';
import { BY_NAME, ENTRIES, type Entry, GROUPS, RESULTS, TOPICS, TOPIC_BY_ID, type Topic } from '../help/index.js';

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function markup(latex: string): string {
  try {
    return convertLatexToMarkup(latex);
  } catch {
    return esc(latex);
  }
}

/** Help text as HTML: `code`, **bold** and [[links]]. */
export function prose(text: string): string {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[\[([^\]]+)\]\]/g, (_, name: string) => {
      const label = TOPIC_BY_ID.get(name)?.title ?? name;
      return `<a href="#" data-go="${esc(name)}">${esc(label)}</a>`;
    });
}

/** Greek letters some functions are named with, as the editor writes them. */
const GREEK: Record<string, string> = { '\\delta': 'δ', '\\Delta': 'Δ', '\\Phi': 'Φ' };
/** Typed math as plain words: commands dropped, so `\mathrm{vswr}` and `vswr` read alike. */
const words = (latex: string): string =>
  latex.replace(/\\(delta|Delta|Phi)(?![a-zA-Z])/g, (m) => GREEK[m]!).replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, ' ');
const NAME = /[A-Za-zδΔΦ°][A-Za-z0-9_δΔΦ°]*/g;

/**
 * The documented name a word is, or starts with. The editor's text around the caret leaves out brackets, so
 * `vswr(0.5` reads as `vswr0.5`: the longest documented start is the name.
 */
function documented(word: string): string | undefined {
  for (let k = word.length; k > 0; k--) if (BY_NAME.has(word.slice(0, k))) return word.slice(0, k);
  return undefined;
}

/**
 * The documented name the caret is on, from the math before and after it; else the nearest documented
 * name before it, or else anywhere in the math. Undefined when there's none: the word itself is then a search.
 */
export function nameAt(before: string, after: string): { name?: string; word: string } {
  const [b, a] = [words(before), words(after)];
  const tail = b.match(/[A-Za-z0-9_δΔΦ°]+$/)?.[0] ?? '';
  const raw = tail + (a.match(/^[A-Za-z0-9_δΔΦ°]+/)?.[0] ?? '');
  const word = raw.match(/[A-Za-zδΔΦ°][A-Za-z0-9_δΔΦ°]*/)?.[0] ?? '';
  const here = documented(word);
  if (here) return { name: here, word };
  const earlier = [...b.matchAll(NAME)].map((m) => documented(m[0])).reverse().find((w) => w);
  if (earlier) return { name: earlier, word };
  const anywhere = [...(b + ' ' + a).matchAll(NAME)].map((m) => documented(m[0])).find((w) => w);
  return anywhere ? { name: anywhere, word } : { word };
}

type Page = { kind: 'home' } | { kind: 'entry'; entry: Entry } | { kind: 'topic'; topic: Topic } | { kind: 'search'; query: string };

/** How well an entry matches a search: lower is better, null for no match. */
function rank(e: Entry, q: string): number | null {
  const names = [e.name, ...(e.also ?? [])].map((n) => n.toLowerCase());
  if (names.includes(q)) return 0;
  if (names.some((n) => n.startsWith(q))) return 1;
  if (names.some((n) => n.includes(q))) return 2;
  if (e.summary.toLowerCase().includes(q) || e.group.toLowerCase().includes(q)) return 3;
  if ((e.details ?? []).some((d) => d.toLowerCase().includes(q))) return 4;
  return null;
}

export class HelpPanel {
  readonly el = document.createElement('div');
  private search = document.createElement('input');
  private back = document.createElement('button');
  private body = document.createElement('div');
  private history: Page[] = [];
  private page: Page = { kind: 'home' };
  /** Called when the panel opens, so another panel on the same side can close. */
  onOpen: () => void = () => {};
  /** Called for About MathMath on the contents page. */
  onAbout: () => void = () => {};

  constructor(private insert: (lines: string[]) => void) {
    this.el.id = 'help-panel';
    this.el.hidden = true;
    this.el.setAttribute('role', 'complementary');
    this.el.setAttribute('aria-label', 'Help');
    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('span');
    title.textContent = 'Help';
    this.back.textContent = '‹ Back';
    this.back.className = 'back';
    this.back.addEventListener('click', () => this.goBack());
    const home = document.createElement('button');
    home.textContent = 'Contents';
    home.addEventListener('click', () => this.show({ kind: 'home' }));
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Close (Esc)';
    close.className = 'close';
    close.addEventListener('click', () => this.close());
    head.append(this.back, title, home, close);
    this.search.type = 'search';
    this.search.placeholder = 'Search functions and topics';
    this.search.setAttribute('aria-label', 'Search help');
    this.search.addEventListener('input', () => {
      const q = this.search.value.trim();
      this.render(q ? { kind: 'search', query: q } : { kind: 'home' });
    });
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.body.querySelector<HTMLElement>('[data-go]');
        if (first) this.go(first.dataset.go!);
      }
    });
    this.body.className = 'body';
    this.el.append(head, this.search, this.body);
    // Keys typed here belong to the panel, not the sheet: Backspace in the search mustn't delete regions.
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      if (e.key !== 'F1') e.stopPropagation();
    });
    this.el.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (link) {
        e.preventDefault();
        this.go(link.dataset.go!);
      }
      if ((e.target as HTMLElement).closest('[data-about]')) {
        e.preventDefault();
        this.onAbout();
      }
      const ins = (e.target as HTMLElement).closest<HTMLElement>('[data-insert]');
      if (ins) this.insert(JSON.parse(ins.dataset.insert!) as string[]);
    });
    // Insert puts math where the paper's click left off, so the panel mustn't take focus from it.
    this.el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    document.body.appendChild(this.el);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Opens at an entry or topic by name, at a search for a word nothing is named, or at the contents. */
  open(target?: string): void {
    if (!this.isOpen) this.onOpen();
    this.el.hidden = false;
    this.history = [];
    if (target && (BY_NAME.has(target) || TOPIC_BY_ID.has(target))) this.go(target, false);
    else if (target) {
      this.search.value = target;
      this.render({ kind: 'search', query: target });
    } else this.show({ kind: 'home' });
  }

  close(): void {
    this.el.hidden = true;
  }

  /** Goes to an entry or topic, remembering where it came from. */
  private go(target: string, remember = true): void {
    const entry = BY_NAME.get(target);
    const topic = TOPIC_BY_ID.get(target);
    if (!entry && !topic) return;
    if (remember) this.history.push(this.page);
    this.search.value = '';
    this.render(entry ? { kind: 'entry', entry } : { kind: 'topic', topic: topic! });
    this.body.scrollTop = 0;
  }

  private show(page: Page): void {
    this.history = [];
    this.search.value = '';
    this.render(page);
  }

  private goBack(): void {
    const page = this.history.pop();
    if (page) this.render(page);
  }

  private render(page: Page): void {
    this.page = page;
    this.back.hidden = this.history.length === 0;
    switch (page.kind) {
      case 'home': this.body.innerHTML = home(); break;
      case 'search': this.body.innerHTML = results(page.query); break;
      case 'entry': this.body.innerHTML = entryPage(page.entry); break;
      case 'topic': this.body.innerHTML = topicPage(page.topic); break;
    }
  }
}

function home(): string {
  const topics = TOPICS.map((t) => `<li><a href="#" data-go="${esc(t.id)}">${esc(t.title)}</a> <span class="muted">${esc(t.summary)}</span></li>`).join('');
  const groups = GROUPS.map((g) => {
    const names = ENTRIES.filter((e) => e.group === g).map((e) => `<a href="#" data-go="${esc(e.name)}" title="${esc(e.summary)}">${esc(e.name)}</a>`);
    return names.length ? `<h3>${esc(g)}</h3><p class="names">${names.join(' ')}</p>` : '';
  }).join('');
  return `<p class="muted">Press F1 while typing a function's name to open its entry here. <a href="#" data-about>About MathMath</a></p>${topics ? `<h2>Topics</h2><ul class="topics">${topics}</ul>` : ''}<h2>Functions and keywords</h2>${groups}`;
}

function results(query: string): string {
  const q = query.toLowerCase();
  const topics = TOPICS.filter((t) => t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q));
  const found = ENTRIES.map((e) => [e, rank(e, q)] as const).filter((x): x is readonly [Entry, number] => x[1] !== null)
    .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name));
  if (found.length === 0 && topics.length === 0) return `<p class="muted">Nothing matches “${esc(query)}”.</p>`;
  const rows = [
    ...found.map(([e]) => `<li><a href="#" data-go="${esc(e.name)}">${esc(e.name)}</a> <span class="muted">${esc(e.summary)}</span></li>`),
    ...topics.map((t) => `<li><a href="#" data-go="${esc(t.id)}">${esc(t.title)}</a> <span class="muted">Topic. ${esc(t.summary)}</span></li>`),
  ];
  return `<ul class="results">${rows.join('')}</ul>`;
}

/** An example's lines with their answers, and a button that puts it on the sheet. */
function example(lines: string[], answers: string[] | undefined, note?: string): string {
  const shown = lines.map((l, i) => `<div class="line">${markup(answers?.[i] ? `${l}${answers[i]}` : l)}</div>`).join('');
  return `<div class="example">${shown}${note ? `<p class="muted">${esc(note)}</p>` : ''}<button class="insert" data-insert="${esc(JSON.stringify(lines))}" title="Put this example on the sheet, at the last click or below everything">Insert</button></div>`;
}

function entryPage(e: Entry): string {
  const also = e.also?.length ? `<p class="muted">Also written ${e.also.map((a) => `<code>${esc(a)}</code>`).join(', ')}.</p>` : '';
  const origin = `<span class="badge">${MATHCAD_FILE_FUNCTIONS.has(e.name) ? 'Mathcad\'s: refused here' : e.mathcad ? 'As in Mathcad' : 'MathMath\'s own'}</span>`;
  const section = (title: string, html: string): string => (html ? `<h3>${title}</h3>${html}` : '');
  let answers: string[] | undefined = RESULTS[e.name];
  let note: string | undefined;
  if (e.results === 'symbolic') answers = e.example.map((_, i) => (i === e.example.length - 1 ? e.answer! : ''));
  if (e.results === 'files') note = 'Reads or writes a file, so its answer depends on the file. Attach the file first (Files menu).';
  if (e.results === 'varies') note = 'Random: the answer depends on the worksheet\'s seed, so it differs from sheet to sheet. New random numbers on the toolbar draws again.';
  return [
    `<h2><code>${esc(e.usage)}</code></h2>`,
    `<p>${origin} <span class="muted">${esc(e.group)}</span></p>`,
    `<p>${prose(e.summary)}</p>`,
    also,
    (e.details ?? []).map((d) => `<p>${prose(d)}</p>`).join(''),
    section('Units', e.units ? `<p>${prose(e.units)}</p>` : ''),
    section('Refused', e.errors?.length ? `<ul>${e.errors.map((x) => `<li>${prose(x)}</li>`).join('')}</ul>` : ''),
    `<h3>Example</h3>`,
    example(e.example, answers, note),
  ].join('');
}

function topicPage(t: Topic): string {
  const blocks = t.body.map((b) => {
    if ('p' in b) return `<p>${prose(b.p)}</p>`;
    if ('h' in b) return `<h3>${esc(b.h)}</h3>`;
    if ('keys' in b) return `<table class="keys">${b.keys.map(([k, what]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${prose(what)}</td></tr>`).join('')}</table>`;
    return example(b.example, RESULTS[`topic:${b.id}`]);
  });
  return `<h2>${esc(t.title)}</h2>${blocks.join('')}`;
}
