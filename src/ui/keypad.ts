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
 * The keypad a touch screen shows while math is edited: MathLive's on-screen keyboard with MathMath's layouts
 * (numbers and operators, functions and templates, units, letters, Greek), and a bar above it for what keys can't
 * do there: finish the region, go to the next blank, evaluate symbolically. Keycaps insert math or run the
 * editor's commands, as typed keys do; the bar calls the editor itself.
 */
import { type Editor, TEMPLATES } from './editor.js';

interface Keycap {
  label?: string;
  latex?: string;
  insert?: string;
  command?: string | string[];
  class?: string;
  width?: number;
  tooltip?: string;
}
type Key = string | Keycap;
interface Layout { label: string; tooltip: string; rows: Key[][] }
interface VirtualKeyboard extends EventTarget {
  layouts: (Layout | string)[];
  visible: boolean;
  boundingRect: DOMRect;
  hide(): void;
}

const ins = (label: string, insert: string, tooltip?: string): Keycap => ({ label, insert, ...(tooltip ? { tooltip } : {}) });
/** A function name and its brackets, as typing `sin(` gives. */
const fn = (name: string): Keycap => ({ label: name, insert: `${name}\\left(#0\\right)`, class: 'small' });
const unit = (label: string, insert = label): Keycap => ({ label, insert, class: 'small' });

const MAIN: Layout = {
  label: '123', tooltip: 'Numbers and operators',
  rows: [
    ['x', 'y', '[separator]', '7', '8', '9', ins('a/b', '\\frac{#@}{#?}', 'Fraction'), ins(':=', '\\coloneq ', 'Define'), ins('=', '=', 'Evaluate')],
    ['a', 't', '[separator]', '4', '5', '6', ins('×', '\\cdot ', 'Multiply'), ins('xⁿ', '#@^{#?}', 'Power'), ins('√', '\\sqrt{#0}', 'Square root')],
    [ins('(', '\\left(#0\\right)'), { label: ')', command: 'moveAfterParent', tooltip: 'Out of the brackets' }, '[separator]', '1', '2', '3', ins('−', '-'), { label: 'x₀', command: 'moveToSubscript', tooltip: 'Subscript: an element, as v₂' }, ins('..', '..', 'Range, as 0..10')],
    ['[left]', '[right]', '[separator]', '0', '.', ',', ins('+', '+'), ins('"', '\\text{"#0"}', 'A string'), '[backspace]'],
  ],
};

const MORE: Layout = {
  label: 'f(x)', tooltip: 'Functions, templates and units',
  rows: [
    [fn('sin'), fn('cos'), fn('tan'), fn('ln'), fn('log'), fn('exp'), ins('|x|', '\\left|#0\\right|', 'Magnitude'), ins('π', '\\pi '), ins('∞', '\\infty ')],
    [ins('∫', TEMPLATES.integral, 'Integral'), ins('d/dx', TEMPLATES.derivative, 'Derivative'), ins('Σ', TEMPLATES.sum, 'Sum'), ins('Π', TEMPLATES.product, 'Product'), ins('lim', TEMPLATES.limit, 'Limit'), ins('M', TEMPLATES.matrix, 'Matrix'), ins('i', '1\\mathrm{i}', 'Imaginary unit'), ins('°', '\\cdot deg', 'Degrees'), ins('<', '<')],
    [unit('m'), unit('s'), unit('kg'), unit('N'), unit('J'), unit('W'), unit('Hz'), unit('°C', 'degC'), ins('>', '>')],
    [unit('V'), unit('A'), unit('Ω', '\\Omega '), unit('F'), unit('H'), '[left]', '[right]', ins('≤', '\\le '), '[backspace]'],
  ],
};

let bar: HTMLElement | null = null;

/** Sets the keypad up for the editor, on a touch screen. Nothing changes with a mouse and keyboard. */
export function startKeypad(editor: Editor, touch: boolean): void {
  if (!touch) return;
  const kb = (window as unknown as { mathVirtualKeyboard?: VirtualKeyboard }).mathVirtualKeyboard;
  if (!kb) return;
  kb.layouts = [MAIN, MORE, 'alphabetic', 'greek'];
  bar = document.createElement('div');
  bar.id = 'keypad-bar';
  bar.hidden = true;
  const action = (label: string, title: string, run: () => void, cls = ''): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    if (cls) b.className = cls;
    // A tap here mustn't take the focus from the math, or the keypad would close.
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', run);
    bar!.appendChild(b);
  };
  action('Next ■', 'The next blank to fill in', () => editor.nextBlank());
  action('→', 'Evaluate symbolically', () => editor.arrow());
  action('Done', 'Finish this math', () => editor.finish('stay'), 'done');
  action('⏎', 'Finish, and start new math below', () => editor.finish('below'), 'done');
  document.body.appendChild(bar);
  // The bar rides on top of the keypad, and the desk leaves room for both so the math stays in view.
  const place = (): void => {
    const r = kb.boundingRect;
    const up = kb.visible && r.height > 0;
    bar!.hidden = !up;
    bar!.style.bottom = `${up ? Math.max(0, window.innerHeight - r.top) : 0}px`;
    document.body.style.setProperty('--keypad', `${up ? window.innerHeight - r.top + bar!.offsetHeight : 0}px`);
  };
  // The keyboard slides in, so its final place is known only once it stops.
  kb.addEventListener('geometrychange', () => {
    for (const ms of [0, 120, 300, 600]) setTimeout(place, ms);
    setTimeout(() => {
      if (kb.visible) editor.field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 650);
  });
  editor.onClose = () => kb.hide();
}
