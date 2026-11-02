import 'mathlive/fonts.css';
import 'mathlive/static.css';
import '../ui/app.css';
import { forgetFile, openFile, readAny, saveFile } from '../ui/files.js';
import { TEMPLATES } from '../ui/editor.js';
import { Paper } from '../ui/paper.js';
import { saveWorksheet } from '../format/native.js';
import { emptyWorksheet } from '../format/native.js';
import { Doc } from './document.js';

const doc = new Doc();
const toolbar = document.getElementById('toolbar')!;
const paper = new Paper(document.getElementById('sheet')!, doc);
const title = document.createElement('span');
title.className = 'name';

function showTitle(): void {
  const mark = doc.dirty ? ' •' : '';
  title.textContent = `${doc.name}${mark}`;
  document.title = `${doc.name}${mark} - MathMath`;
}

const redraw = doc.onChange;
doc.onChange = (ids) => {
  redraw(ids);
  showTitle();
};

const busy = document.createElement('span');
busy.className = 'busy';
doc.onBusy = (on) => {
  busy.textContent = on ? 'Calculating… (Esc stops)' : '';
};
doc.onProblem = (message) => {
  busy.textContent = message;
};

function fail(err: unknown): void {
  window.alert((err as Error).message);
}

const save = async (): Promise<void> => {
  paper.commitAll();
  try {
    const name = await saveFile(doc.ws, doc.name);
    if (name) {
      doc.name = name;
      doc.dirty = false;
      showTitle();
    }
  } catch (err) {
    fail(err);
  }
};

const open = async (): Promise<void> => {
  paper.commitAll();
  if (doc.dirty && !window.confirm('Discard unsaved changes?')) return;
  try {
    const file = await openFile();
    if (file) doc.replace(file.ws, file.name);
  } catch (err) {
    fail(err);
  }
};

const fresh = (): void => {
  paper.commitAll();
  if (doc.dirty && !window.confirm('Discard unsaved changes?')) return;
  forgetFile();
  doc.replace(emptyWorksheet(), 'Untitled');
};

const print = (): void => {
  paper.commitAll();
  window.print();
};

function button(label: string, title_: string, run: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title_;
  // Keeps focus in the editor, so a program keyword lands at the caret.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', run);
  toolbar.appendChild(b);
}

const separator = (): void => {
  const s = document.createElement('span');
  s.className = 'sep';
  toolbar.appendChild(s);
};

const inEditor = (latex: string) => (): void => {
  if (paper.mathEditor.isOpen) paper.mathEditor.insert(latex);
};

button('New', 'New worksheet', fresh);
button('Open', 'Open a worksheet (Ctrl+O)', () => void open());
button('Save', 'Save (Ctrl+S)', () => void save());
button('Print', 'Print (Ctrl+P)', print);
separator();
button('if', 'Condition on this line (})', inEditor('\\ \\mathbf{if}\\ '));
button('otherwise', 'Otherwise', inEditor('\\ \\mathbf{otherwise}'));
button('for', 'For loop', inEditor('\\mathbf{for}\\ #?\\in #?\\ '));
button('while', 'While loop', inEditor('\\mathbf{while}\\ #?\\ '));
button('return', 'Return', inEditor('\\mathbf{return}\\ '));
separator();
button('∫', 'Integral (&). Tab moves to the next blank', inEditor(TEMPLATES.integral));
button('d/dx', 'Derivative (?). Tab moves to the next blank', inEditor(TEMPLATES.derivative));
button('Σ', 'Sum. Tab moves to the next blank', inEditor(TEMPLATES.sum));
button('Π', 'Product. Tab moves to the next blank', inEditor(TEMPLATES.product));
button('lim', 'Limit, which needs →. Tab moves to the next blank', inEditor(TEMPLATES.limit));
button('∫ dx', 'Indefinite integral, which needs →. Tab moves to the next blank', inEditor(TEMPLATES.antiderivative));
button('Matrix', 'Insert a 2 by 2 matrix. Tab moves to the next blank', inEditor(TEMPLATES.matrix));
separator();
button('→', 'Evaluate symbolically (Ctrl+.)', () => {
  if (paper.mathEditor.isOpen) paper.mathEditor.arrow();
});
const menu = document.createElement('details');
menu.className = 'menu';
const summary = document.createElement('summary');
summary.textContent = 'Keywords';
summary.addEventListener('mousedown', (e) => e.preventDefault());
const list = document.createElement('div');
menu.append(summary, list);
toolbar.appendChild(menu);
for (const [name, takesArgument, help] of [
  ['simplify', false, 'Simplify'], ['expand', false, 'Multiply out'], ['factor', false, 'Factor'], ['float', false, 'As a decimal, to 20 digits'],
  ['solve', true, 'Solve for a variable'], ['collect', true, 'Collect powers of a variable'], ['coeffs', true, 'List coefficients of a variable'],
  ['series', true, 'Series in a variable'], ['substitute', true, 'Substitute, as x=y+1'], ['parfrac', true, 'Partial fractions in a variable'],
  ['assume', true, 'Assume something, as x>0'],
] as const) {
  const b = document.createElement('button');
  b.textContent = name;
  b.title = help;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    menu.open = false;
    if (paper.mathEditor.isOpen) paper.mathEditor.keyword(name, takesArgument);
  });
  list.appendChild(b);
}
separator();
button('Align left', 'Line selected regions up on the left', () => doc.align(paper.selection, 'left'));
button('Align top', 'Line selected regions up on the top', () => doc.align(paper.selection, 'top'));
separator();
button('Stop', 'Stop a long calculation (Esc)', () => doc.stop());
toolbar.append(busy, title);

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  // While math is being typed, undo belongs to the editor.
  if ((key === 'z' || key === 'y') && paper.canUndo()) {
    e.preventDefault();
    e.stopPropagation();
    paper.commitAll();
    if (key === 'y' || e.shiftKey) doc.redo();
    else doc.undo();
  } else if (key === 's') {
    e.preventDefault();
    void save();
  } else if (key === 'o') {
    e.preventDefault();
    void open();
  } else if (key === 'p') {
    e.preventDefault();
    print();
  }
}, { capture: true });

window.addEventListener('beforeunload', (e) => {
  if (doc.dirty) e.preventDefault();
});

showTitle();

// Test hook. It exposes nothing a user couldn't reach through the page.
declare global { interface Window { mathmath: unknown } }
window.mathmath = { doc, paper, load: (name: string, text: string) => doc.replace(readAny(name, text), name), save: () => saveWorksheet(doc.ws) };
