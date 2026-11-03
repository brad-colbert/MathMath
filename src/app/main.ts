import 'mathlive/fonts.css';
import 'mathlive/static.css';
import '../ui/app.css';
import { forgetFile, openFile, readAny, saveFile } from '../ui/files.js';
import { TEMPLATES } from '../ui/editor.js';
import { Paper } from '../ui/paper.js';
import { saveWorksheet } from '../format/native.js';
import { emptyWorksheet } from '../format/native.js';
import type { Content, Worksheet } from '../model/ast.js';
import { SHEET_MIME, isSheetName } from '../engine/files.js';
import { Doc } from './document.js';

const pickFiles = (accept: string, multiple: boolean): Promise<File[]> => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.onchange = () => resolve([...(input.files ?? [])]);
  input.oncancel = () => resolve([]);
  input.click();
});

const base64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/**
 * Keeps a file in the worksheet. An image or a data file adds a readImage or readTable region for it,
 * ready for a variable name. A worksheet is kept for references to find, in MathMath's own format.
 */
async function loadFromComputer(): Promise<void> {
  const picked = await pickFiles('image/*,.csv,.txt,.dat,.prn,.xmcd,.mathmath', true);
  if (picked.length === 0) return;
  const attached: { name: string; mime: string; data: string }[] = [];
  const carried: { name: string; mime: string; data: string }[] = [];
  for (const file of picked) {
    if (!isSheetName(file.name)) {
      attached.push({ name: file.name, mime: file.type || 'application/octet-stream', data: await base64(file) });
      continue;
    }
    let ws: Worksheet;
    try {
      ws = readAny(file.name, await file.text());
    } catch (err) {
      fail(err);
      return;
    }
    attached.push({ name: file.name, mime: SHEET_MIME, data: utf8Base64(saveWorksheet(ws)) });
    // Files the sheet had attached come with it, so it works here as it did there.
    for (const [name, asset] of Object.entries(ws.assets)) carried.push({ name, ...asset });
  }
  // What was picked wins over a copy that came inside a sheet.
  doc.attach([...carried, ...attached]);
  const [only] = picked;
  if (picked.length === 1 && only && !isSheetName(only.name)) {
    paper.insertReadImage(only.name, only.type.startsWith('image/') ? 'readImage' : 'readTable');
    return;
  }
  const names = picked.map((f) => f.name);
  doc.onProblem(`Attached ${names.join(', ')}. ${picked.some((f) => isSheetName(f.name)) ? 'References find worksheets by name.' : ''}`);
}

const utf8Base64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * Fetches an image once, now, and keeps it. A worksheet never fetches anything while it calculates:
 * a shared sheet mustn't be able to make your browser contact a site.
 */
async function loadFromAddress(): Promise<void> {
  const address = window.prompt('Web address of the image (https://…)')?.trim();
  if (!address) return;
  if (!/^https:\/\//i.test(address)) {
    doc.onProblem('That needs to start with https://');
    return;
  }
  let response: Response;
  try {
    response = await fetch(address);
  } catch {
    doc.onProblem("That site doesn't allow loading its images from here. Download the image and load it from this computer");
    return;
  }
  if (!response.ok) {
    doc.onProblem(`The address answered ${response.status}`);
    return;
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    doc.onProblem("That address isn't an image");
    return;
  }
  doc.attach([{ name: address, mime: blob.type, data: await base64(new File([blob], 'image')) }]);
  paper.insertReadImage(address);
}

/** Pictures keep their own size, in points, up to the width of the page. */
async function insertPicture(): Promise<void> {
  const at = paper.insertionPoint();
  const [file] = await pickFiles('image/*', false);
  if (!file) return;
  const bitmap = await createImageBitmap(file);
  const room = doc.ws.page.width - doc.ws.page.margins.left - doc.ws.page.margins.right;
  const scale = Math.min(1, room / (bitmap.width * 0.75));
  doc.addPicture(at.left, at.top, file.type, await base64(file), bitmap.width * 0.75 * scale, bitmap.height * 0.75 * scale);
}

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
// A notice, such as what was just attached, outlasts the calculation it starts, for a few seconds.
let notice = '';
let noticeTimer = 0;
doc.onBusy = (on) => {
  busy.textContent = on ? 'Calculating… (Esc stops)' : notice;
};
doc.onProblem = (message) => {
  notice = message;
  busy.textContent = message;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice = '';
    if (!doc.computing && busy.textContent === message) busy.textContent = '';
  }, 8000);
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
button('Plot', 'X-Y plot (@)', () => paper.insertPlot());
button('Image', 'Show a matrix as an image', () => paper.insertImage());
button('Picture…', 'Put a picture from a file on the page', () => void insertPicture());
const files = document.createElement('details');
files.className = 'menu';
const filesSummary = document.createElement('summary');
filesSummary.textContent = 'Files';
filesSummary.title = 'Load an image for readImage';
filesSummary.addEventListener('mousedown', (e) => e.preventDefault());
const filesList = document.createElement('div');
files.append(filesSummary, filesList);
toolbar.appendChild(files);
for (const [label, run] of [
  ['From this computer…', () => void loadFromComputer()],
  ['From a web address…', () => void loadFromAddress()],
] as const) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    files.open = false;
    run();
  });
  filesList.appendChild(b);
}
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
const plotMenu = document.createElement('details');
plotMenu.className = 'menu';
const plotSummary = document.createElement('summary');
plotSummary.textContent = 'Format';
plotSummary.title = 'Options for the selected plot or image';
plotSummary.addEventListener('mousedown', (e) => e.preventDefault());
const plotList = document.createElement('div');
plotMenu.append(plotSummary, plotList);
toolbar.appendChild(plotMenu);
const formats: [string, 'plot' | 'image', (c: Content) => Content][] = [
  ['Log x axis', 'plot', (c) => (c.k === 'plot' ? { ...c, xAxis: { ...c.xAxis, log: !c.xAxis.log } } : c)],
  ['Log y axis', 'plot', (c) => (c.k === 'plot' ? { ...c, yAxis: { ...c.yAxis, log: !c.yAxis.log } } : c)],
  ['Points instead of lines', 'plot', (c) => (c.k === 'plot' ? { ...c, markers: !c.markers } : c)],
  ['Color image (R|G|B side by side)', 'image', (c) => (c.k === 'image' ? { ...c, mode: c.mode === 'rgb' ? 'gray' : 'rgb' } : c)],
];
for (const [label, kind, change] of formats) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    plotMenu.open = false;
    const region = paper.selectedOf(kind);
    if (!region) {
      doc.onProblem(`Select ${kind === 'plot' ? 'a plot' : 'an image'} first`);
      return;
    }
    doc.update(region, change);
  });
  plotList.appendChild(b);
}
separator();
button('Align left', 'Line selected regions up on the left', () => doc.align(paper.selection, 'left'));
button('Align top', 'Line selected regions up on the top', () => doc.align(paper.selection, 'top'));
separator();
// LIVE calculates as you edit; EDIT calculates nothing, so a long sheet can be changed without waiting.
const mode = document.createElement('button');
mode.className = 'mode';
mode.addEventListener('mousedown', (e) => e.preventDefault());
mode.addEventListener('click', () => doc.setLive(!doc.live));
const showMode = (live: boolean): void => {
  mode.textContent = live ? 'LIVE' : 'EDIT';
  mode.classList.toggle('live', live);
  mode.classList.toggle('edit', !live);
  mode.setAttribute('aria-pressed', String(live));
  mode.title = live
    ? 'LIVE: results update as you edit. Click for EDIT, which stops calculating.'
    : 'EDIT: nothing is calculated, and results gray as they go out of date. Click for LIVE to calculate.';
};
doc.onMode = showMode;
showMode(doc.live);
toolbar.appendChild(mode);
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
