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
 * The splash screen: what MathMath is, in a few lines, with a worked example and the copyright. It shows when
 * the app opens, unless the viewer has turned it off, and again from the version on the toolbar or from Help.
 */
import { convertLatexToMarkup } from 'mathlive';

const OFF_KEY = 'mathmath.splash';

/** The viewer's choice, kept in this browser. Storage can be missing or refuse, so it never throws. */
const remembered = (): boolean => {
  try {
    return localStorage.getItem(OFF_KEY) !== 'off';
  } catch {
    return true;
  }
};
const remember = (show: boolean): void => {
  try {
    if (show) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, 'off');
  } catch {
    // Not kept: it will show again next time.
  }
};

const math = (latex: string): string => convertLatexToMarkup(latex);

export class Splash {
  readonly el = document.createElement('div');
  private start: HTMLButtonElement;
  private atStart: HTMLInputElement;
  private before: Element | null = null;

  constructor(version: string) {
    this.el.id = 'splash';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'splash-title');
    this.el.innerHTML = `
      <div class="card">
        <h1 id="splash-title">MathMath</h1>
        <p class="name-math">${math('\\mathrm{MathMath}=\\mathrm{Math}^{2}')}</p>
        <p class="tagline">So good we named it twice.</p>
        <p>Write math the way you would on paper. MathMath works it out as you type, keeps your units honest,
          solves, plots and simplifies, and opens your Mathcad worksheets too. All in the browser.</p>
        <div class="paper" aria-label="An example">
          <div>${math('d\\coloneq 100\\cdot \\mathrm{m}')}<span class="gap"></span>${math('t\\coloneq 9.58\\cdot \\mathrm{s}')}</div>
          <div>${math('\\frac{d}{t}=10.438\\ \\frac{\\mathrm{m}}{\\mathrm{s}}')}<span class="note">a world record, checked</span></div>
          <div>${math('d+t=')}<span class="note error">metres plus seconds? Caught it. You're welcome.</span></div>
        </div>
        <div class="actions">
          <button type="button" class="start">Start calculating</button>
          <label><input type="checkbox" class="at-start"> Show this when MathMath opens</label>
        </div>
        <p class="hint">Click on the paper and type. F1 opens help any time.</p>
        <p class="legal">© 2026 Pelican Labs, LLC. MathMath ${version} is free software under the GNU Affero General
          Public License, version 3 or later, with no warranty. Mathcad is a trademark of PTC Inc. MathMath is not
          affiliated with or endorsed by PTC.</p>
      </div>`;
    this.start = this.el.querySelector<HTMLButtonElement>('.start')!;
    this.atStart = this.el.querySelector<HTMLInputElement>('.at-start')!;
    this.start.addEventListener('click', () => this.close());
    this.atStart.addEventListener('change', () => remember(this.atStart.checked));
    // A click outside the card, or Esc or Enter, closes it too.
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && e.target !== this.atStart)) {
        e.preventDefault();
        this.close();
      }
      // Tab stays in the card.
      if (e.key === 'Tab') {
        const stops = [this.start, this.atStart];
        const at = stops.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        stops[(at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length]!.focus();
      }
      e.stopPropagation();
    });
    document.body.appendChild(this.el);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Shows it when the app opens, unless the viewer turned that off. */
  atLaunch(): void {
    if (remembered()) this.open();
  }

  open(): void {
    this.before = document.activeElement;
    this.atStart.checked = remembered();
    this.el.hidden = false;
    this.start.focus();
  }

  close(): void {
    this.el.hidden = true;
    if (this.before instanceof HTMLElement) this.before.focus();
  }
}
