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
 * The one math editor. It stays mounted and moves over the active region: a field created on
 * demand loses keystrokes while it starts. Keys that behave as in Mathcad are handled here.
 */
import * as mathlive from 'mathlive';

// MathLive's types export this class ambiguously, though it's there at runtime.
interface Field extends HTMLElement {
  mathVirtualKeyboardPolicy: string;
  menuItems: unknown[];
  smartFence: boolean;
  inlineShortcuts: Record<string, string>;
  mode: string;
  position: number;
  readonly lastOffset: number;
  selection: { ranges: [number, number][]; direction?: string };
  getValue(...args: unknown[]): string;
  setValue(value: string, options?: object): void;
  insert(value: string, options?: object): boolean;
  executeCommand(command: string | unknown[]): boolean;
  getElementInfo(offset: number): { depth?: number } | undefined;
}
type MathfieldElement = Field;
const MathfieldElement = (mathlive as unknown as {
  MathfieldElement: (new () => Field) & { fontsDirectory: string | null; soundsDirectory: string | null };
}).MathfieldElement;

/**
 * Ctrl+G pairs, as in Mathcad, which follows the Symbol font: q is θ, f is φ, j is ϕ, c is χ.
 * Only letters the reader knows are listed, so capitals that look like Latin letters are left out.
 */
const TO_GREEK: Record<string, string> = {
  a: '\\alpha', b: '\\beta', c: '\\chi', d: '\\delta', e: '\\varepsilon', f: '\\varphi', g: '\\gamma', h: '\\eta',
  i: '\\iota', j: '\\phi', k: '\\kappa', l: '\\lambda', m: '\\mu', n: '\\nu', p: '\\pi', q: '\\theta', r: '\\rho',
  s: '\\sigma', t: '\\tau', u: '\\upsilon', w: '\\omega', x: '\\xi', y: '\\psi', z: '\\zeta',
  D: '\\Delta', F: '\\Phi', G: '\\Gamma', L: '\\Lambda', P: '\\Pi', Q: '\\Theta', S: '\\Sigma', W: '\\Omega', Y: '\\Psi',
};
const FROM_GREEK = Object.fromEntries(Object.entries(TO_GREEK).map(([k, v]) => [v, k]));

const PROGRAM_OPEN = '\\begin{array}{|l}';
const PROGRAM_CLOSE = '\\end{array}';

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

function previousChar(field: MathfieldElement): string {
  const at = field.position;
  return at > 0 ? field.getValue(at - 1, at, 'latex-unstyled') : '';
}

/**
 * Space grows the selection through the expression, one level at a time.
 * MathLive has no such command, so this walks outward by depth.
 */
export function growSelection(field: MathfieldElement): void {
  const last = field.lastOffset;
  const depthAt = (o: number): number => field.getElementInfo(o)?.depth ?? 0;
  const [start, end] = field.selection.ranges[0]!;
  const [a, b] = start === end ? [Math.max(0, start - 1), start] : [start, end];
  let depth = Infinity;
  for (let i = a + 1; i <= b; i++) depth = Math.min(depth, depthAt(i));
  const widen = (d: number): [number, number] => {
    let [lo, hi] = [a, b];
    while (lo > 0 && depthAt(lo) >= d) lo--;
    while (hi < last && depthAt(hi + 1) >= d) hi++;
    return [lo, hi];
  };
  let next = widen(depth);
  while (start !== end && next[0] === start && next[1] === end && depth > 0) next = widen(--depth);
  const whole = start !== end && next[0] === start && next[1] === end;
  field.selection = { ranges: [whole ? [0, last] : next], direction: 'forward' };
}

/** Math with blanks to fill in. Tab moves to the next blank. */
export type MatrixOp = 'transpose' | 'column' | 'vectorize' | 'bars' | 'addRow' | 'addColumn';

/** An empty matrix of the given size, its elements left as blanks to fill. */
export const matrixTemplate = (rows: number, cols: number): string =>
  `\\begin{pmatrix}${Array.from({ length: rows }, () => Array.from({ length: cols }, () => '#?').join('&')).join('\\\\')}\\end{pmatrix}`;

export const TEMPLATES = {
  integral: '\\int_{#?}^{#?}#?\\,\\mathrm{d}#?',
  derivative: '\\frac{\\mathrm{d}}{\\mathrm{d}#?}#?',
  /** The order goes in above only; it's printed below too once the region is done. */
  nthDerivative: '\\frac{\\mathrm{d}^{#?}}{\\mathrm{d}#?}#?',
  sum: '\\sum_{#?=#?}^{#?}#?',
  product: '\\prod_{#?=#?}^{#?}#?',
  /** Over every value of a range variable, with no limits written, as Mathcad's `$` and `#`. */
  rangeSum: '\\sum_{#?}#?',
  rangeProduct: '\\prod_{#?}#?',
  limit: '\\lim_{#?\\to #?}#?',
  antiderivative: '\\int #?\\,\\mathrm{d}#?',
  matrix: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}',
};

export interface EditorEvents {
  /** `next` moves on to a plot's next slot. */
  commit: (next: 'stay' | 'below' | 'next') => void;
  startText: () => void;
  startPlot: () => void;
  /** After each change to the math, and when the editor closes. */
  changed?: () => void;
  closed?: () => void;
}

export class Editor {
  readonly field: MathfieldElement;
  private open = false;
  private baseline = '';
  private inName = false;
  /** A slot holds one expression or a list, not a whole region. */
  private slotMode = false;

  constructor(parent: HTMLElement, private events: EditorEvents) {
    const field = new MathfieldElement();
    field.id = 'editor';
    parent.appendChild(field);
    field.mathVirtualKeyboardPolicy = 'manual';
    field.menuItems = [];
    // Off, because a smart ( wraps everything to its right, such as the dx of an integral.
    field.smartFence = false;
    // None at all: stale shortcut state crashes a reused field, and the defaults rewrite typing.
    field.inlineShortcuts = {};
    field.addEventListener('keydown', (e) => this.onKey(e), { capture: true });
    field.addEventListener('input', () => this.events.changed?.());
    this.field = field;
    this.hide();
  }

  private hide(): void {
    // Parked off the sheet, not hidden. A field shown and focused in the same tick loses the first
    // key, and MathLive's inner elements take clicks even with pointer-events off on the host.
    this.field.style.left = '-2000pt';
    this.field.style.top = '0';
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(left: number, top: number, latex: string, slot = false): void {
    this.slotMode = slot;
    const f = this.field;
    f.style.left = `${left}pt`;
    f.style.top = `${top}pt`;
    f.setValue(latex, { silenceNotifications: true });
    this.baseline = f.getValue('latex-unstyled');
    this.inName = false;
    this.open = true;
    f.focus();
    f.position = f.lastOffset;
  }

  /** The math before and after the caret, for finding the name it's on. */
  aroundCaret(): { before: string; after: string } {
    const f = this.field;
    const at = f.position;
    return { before: f.getValue(0, at, 'latex-unstyled'), after: f.getValue(at, f.lastOffset, 'latex-unstyled') };
  }

  /** The math as parsed by the editor, not an echo of what was set. */
  value(): string {
    return this.field.getValue('latex-unstyled');
  }

  /** True once something has been edited. Opening a region must not change it. */
  /** Selects everything, so typing replaces it. */
  selectAll(): void {
    this.field.executeCommand('selectAll');
  }

  edited(): boolean {
    return this.value() !== this.baseline;
  }

  /**
   * `reopening` keeps the focus, for when the editor opens again at once, on the next slot or a new region
   * below. Blurring there lost the focus a moment later, so the next keys typed went nowhere.
   */
  close(reopening = false): void {
    this.open = false;
    if (!reopening) this.field.blur();
    this.hide();
    this.events.closed?.();
  }

  insert(latex: string): void {
    this.field.insert(latex, { format: 'latex', selectionMode: 'placeholder' });
    this.field.focus();
  }

  /**
   * Matrix operators, applied to the selection, or else to what's just before the caret: transpose, a
   * column (M⟨j⟩), vectorize (the arrow), and |…|, the determinant of a square matrix or a vector's length.
   */
  matrixOp(kind: MatrixOp): void {
    const f = this.field;
    if (kind === 'addRow' || kind === 'addColumn') {
      f.executeCommand(kind === 'addRow' ? 'addRowAfter' : 'addColumnAfter');
      f.focus();
      return;
    }
    const [start, end] = f.selection.ranges[0]!;
    const selected = start !== end;
    const latex = {
      transpose: selected ? '{#@}^{\\mathsf{T}}' : '^{\\mathsf{T}}',
      column: selected ? '{#@}^{\\langle #?\\rangle}' : '^{\\langle #?\\rangle}',
      vectorize: selected ? '\\overrightarrow{#@}' : '\\overrightarrow{#?}',
      bars: selected ? '\\left|#@\\right|' : '\\left|#?\\right|',
    }[kind];
    f.insert(latex, { format: 'latex', selectionMode: 'placeholder' });
    f.focus();
  }

  /** Ctrl+G turns the letter before the caret into its Greek letter, or back. */
  private toggleGreek(): void {
    const f = this.field;
    const [start, end] = f.selection.ranges[0]!;
    if (f.mode !== 'math' || start !== end) return;
    const prev = previousChar(f).trim();
    const swap = TO_GREEK[prev] ?? FROM_GREEK[prev];
    if (!swap) return;
    f.executeCommand('deleteBackward');
    f.insert(swap, { format: 'latex' });
  }

  private consume(e: KeyboardEvent, run: () => void): void {
    e.preventDefault();
    e.stopPropagation();
    run();
  }

  /** Adds a line to the program under the caret, or starts one. */
  private programLine(): void {
    const f = this.field;
    const latex = this.value();
    if (latex.includes('\\begin{array}')) {
      f.executeCommand('addRowAfter');
      return;
    }
    const split = latex.indexOf('\\coloneq');
    const head = split >= 0 ? latex.slice(0, split + '\\coloneq'.length) : '';
    const body = split >= 0 ? latex.slice(split + '\\coloneq'.length) : latex;
    f.setValue(`${head}${PROGRAM_OPEN}${body.trim() || '\\placeholder{}'}\\\\\\placeholder{}${PROGRAM_CLOSE}`, { silenceNotifications: true });
    // A new program starts on its first line. Existing math stays there, and typing moves to the next.
    f.position = body.trim() ? f.lastOffset : 0;
    f.executeCommand(body.trim() ? 'moveToPreviousPlaceholder' : 'moveToNextPlaceholder');
  }

  /** The value with no arrow on the end, so a keyword or arrow can go there. */
  private atEnd(): void {
    const f = this.field;
    const latex = this.value();
    const bare = latex.replace(/\\to\s*$/, '');
    if (bare !== latex) f.setValue(bare, { silenceNotifications: true });
    f.position = f.lastOffset;
  }

  /** Asks for a symbolic result. */
  arrow(): void {
    if (this.value().trim() === '') return;
    this.atEnd();
    this.field.insert('\\to ', { format: 'latex' });
    this.events.commit('stay');
  }

  /** Adds a symbolic keyword. One with an argument waits for it. */
  keyword(name: string, takesArgument: boolean): void {
    if (this.value().trim() === '') return;
    this.atEnd();
    if (takesArgument) {
      this.field.insert(`\\ \\mathbf{${name}},#?\\to `, { format: 'latex', selectionMode: 'placeholder' });
      this.field.focus();
      return;
    }
    this.field.insert(`\\ \\mathbf{${name}}\\to `, { format: 'latex' });
    this.events.commit('stay');
  }

  /** Inside a name's literal subscript, anything but a name character ends the subscript. */
  private endName(key: string): void {
    if (!this.inName || key.length !== 1 || /[A-Za-z0-9]/.test(key)) return;
    this.inName = false;
    this.field.mode = 'math';
    this.field.executeCommand('moveAfterParent');
  }

  private onKey(e: KeyboardEvent): void {
    const f = this.field;
    if ((e.ctrlKey || e.metaKey) && e.key === '.') return this.consume(e, () => this.arrow());
    // Consumed even when there's nothing to turn, so the browser's find bar doesn't open.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyG') return this.consume(e, () => this.toggleGreek());
    // Mathcad's matrix keys. Chrome keeps Ctrl+1 and Ctrl+6 for switching tabs, so the Matrix menu has these too.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (e.code === 'KeyM') return this.consume(e, () => this.insert(TEMPLATES.matrix));
      if (e.code === 'Digit1') return this.consume(e, () => this.matrixOp('transpose'));
      if (e.code === 'Digit6') return this.consume(e, () => this.matrixOp('column'));
      if (e.code === 'Minus') return this.consume(e, () => this.matrixOp('vectorize'));
    }
    // Mathcad's keys for a sum or product with limits, and for the nth derivative.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'Digit4' || e.code === 'Digit3')) {
      return this.consume(e, () => this.insert(e.code === 'Digit4' ? TEMPLATES.sum : TEMPLATES.product));
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'Slash') return this.consume(e, () => this.insert(TEMPLATES.nthDerivative));
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Inside a string every key is just text, except the quote that ends it.
    if (f.mode === 'text' && !this.inName && !['"', 'Escape', 'Enter', 'Tab'].includes(e.key)) return;
    this.endName(e.key);
    switch (e.key) {
      case 'Escape': return this.consume(e, () => {
        this.inName = false;
        this.events.commit('stay');
      });
      case 'Enter': return this.consume(e, () => this.events.commit(this.slotMode ? 'stay' : 'below'));
      case 'Tab':
        // In a slot, Tab goes to the next slot, unless there's still a blank to fill in this one.
        if (this.slotMode && !this.value().includes('\\placeholder')) this.consume(e, () => this.events.commit('next'));
        return;
      case '@':
        if (!this.slotMode && this.value() === '') this.consume(e, () => this.events.startPlot());
        return;
      case ' ': return this.consume(e, () => growSelection(f));
      case '(': return this.consume(e, () => this.insert('\\left(#?\\right)'));
      case ')': return this.consume(e, () => f.executeCommand('moveAfterParent'));
      case ':': return this.consume(e, () => this.insert('\\coloneq '));
      case '*': return this.consume(e, () => this.insert('\\cdot '));
      case ';': return this.consume(e, () => this.insert('..'));
      case '[': return this.consume(e, () => f.executeCommand('moveToSubscript'));
      case ']': return this.consume(e, () => this.programLine());
      case '&': return this.consume(e, () => this.insert(TEMPLATES.integral));
      case '$': return this.consume(e, () => this.insert(TEMPLATES.rangeSum));
      case '#': return this.consume(e, () => this.insert(TEMPLATES.rangeProduct));
      case '?': return this.consume(e, () => this.insert(TEMPLATES.derivative));
      case '{': return this.consume(e, () => this.insert('\\gets '));
      case '}': return this.consume(e, () => this.insert('\\ \\mathbf{if}\\ '));
      case '"':
        if (!this.slotMode && this.value() === '') return this.consume(e, () => this.events.startText());
        // Inside math, quotes make a string, as in "photo.jpg". A second quote ends it.
        return this.consume(e, () => {
          if (f.mode === 'text') f.executeCommand('moveAfterParent');
          else {
            f.insert('\\text{""}', { format: 'latex' });
            f.executeCommand('moveToPreviousChar');
          }
        });
      case '.':
        // After a letter, a period starts a name's literal subscript, as in Mathcad.
        if (/[A-Za-z]$/.test(previousChar(f))) {
          this.consume(e, () => {
            f.executeCommand('moveToSubscript');
            f.mode = 'text';
            this.inName = true;
          });
        }
        return;
      default:
    }
  }
}
