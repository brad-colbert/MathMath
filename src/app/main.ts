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

import 'mathlive/fonts.css';
import 'mathlive/static.css';
import '../ui/app.css';
import { forgetFile, openFile, readAny, saveFile } from '../ui/files.js';
import { TEMPLATES, matrixTemplate } from '../ui/editor.js';
import { Paper } from '../ui/paper.js';
import { KEYWORDS } from '../symbolic/keywords.js';
import { HelpPanel, nameAt } from '../ui/help-panel.js';
import { Splash } from '../ui/splash.js';
import { fitWidth, getZoom, setZoom, startZoom } from '../ui/zoom.js';
import { startKeypad } from '../ui/keypad.js';
import { touchScreen } from '../ui/editor.js';
import { regionLatex } from '../latex/region.js';
import { toggleTitles } from '../ui/slots.js';
import { TracePanel } from '../ui/trace-panel.js';
import { saveWorksheet } from '../format/native.js';
import { emptyWorksheet } from '../format/native.js';
import type { Content, NumberFormat, Worksheet } from '../model/ast.js';
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
async function loadFromComputer(insert = true): Promise<void> {
  const picked = await pickFiles('image/*,.csv,.txt,.dat,.prn,.wav,audio/wav,.xmcd,.mathmath', true);
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
  if (insert && picked.length === 1 && only && !isSheetName(only.name)) {
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
// The paper's size on screen: true size, or fitted to a phone's width.
startZoom(document.getElementById('sheet')!, document.getElementById('sizer')!);
// On a touch screen, MathMath's keypad while math is edited.
startKeypad(paper.mathEditor, touchScreen());
const title = document.createElement('span');
title.className = 'name';

function showTitle(): void {
  const mark = doc.dirty ? ' •' : '';
  title.textContent = `${doc.name}${mark}`;
  document.title = `${doc.name}${mark} - MathMath`;
}

// Files the sheet needs and doesn't have, said plainly under the toolbar with a way to attach them, rather
// than left to the notes on grayed answers. It goes away once they're all attached.
const needsBar = document.createElement('div');
needsBar.id = 'needs-bar';
needsBar.hidden = true;
needsBar.setAttribute('role', 'status');
const needsText = document.createElement('span');
const needsButton = document.createElement('button');
needsButton.textContent = 'Attach files…';
needsButton.title = 'Choose the files from this computer. They travel inside the worksheet once it\'s saved';
needsButton.addEventListener('click', () => void loadFromComputer(false));
needsBar.append(needsText, needsButton);
toolbar.after(needsBar);
let needsShown = '';
const showNeeds = (): void => {
  const missing = doc.missingFiles();
  const key = missing.join('\n');
  if (key === needsShown) return;
  needsShown = key;
  needsBar.hidden = missing.length === 0;
  needsText.textContent = missing.length === 0 ? ''
    : `This sheet needs ${missing.length === 1 ? 'a file' : `${missing.length} files`} to calculate: ${missing.join(', ')}.`;
};

const redraw = doc.onChange;
doc.onChange = (ids) => {
  redraw(ids);
  showTitle();
  tracePanel.refresh();
  showNeeds();
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

function button(label: string, title_: string, run: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title_;
  // Keeps focus in the editor, so a program keyword lands at the caret.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', run);
  toolbar.appendChild(b);
  return b;
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
button('Help', 'Functions, keywords and topics (F1 on a name)', () => openHelp());
// On a phone the toolbar is one row: these, the most used, and ☰ for everything else (see app.css).
for (const b of [
  button('↶', 'Undo (Ctrl+Z)', () => {
    paper.commitAll();
    doc.undo();
  }),
  button('↷', 'Redo (Ctrl+Y)', () => {
    paper.commitAll();
    doc.redo();
  }),
  button('−', 'Zoom out', () => setZoom(getZoom() / 1.25)),
  button('+', 'Zoom in', () => setZoom(getZoom() * 1.25)),
  button('Fit', 'Fit the page to the screen\'s width', () => fitWidth()),
]) b.classList.add('phone-only', 'essential');
const more = button('☰', 'More: every tool', () => toolbar.classList.toggle('expanded'));
more.classList.add('phone-only', 'essential', 'more');
button('Reroll', 'New random numbers: draw rnd, runif, rnorm and the other random functions again, from a new seed for this worksheet. Undo goes back', () => doc.newRandomNumbers());
separator();
button('if', 'Condition on this line (})', inEditor('\\ \\mathbf{if}\\ '));
button('otherwise', 'Otherwise', inEditor('\\ \\mathbf{otherwise}'));
button('for', 'For loop', inEditor('\\mathbf{for}\\ #?\\in #?\\ '));
button('while', 'While loop', inEditor('\\mathbf{while}\\ #?\\ '));
button('return', 'Return', inEditor('\\mathbf{return}\\ '));
separator();
button('∫', 'Integral (&). Tab moves to the next blank', inEditor(TEMPLATES.integral));
button('d/dx', 'Derivative (?). Tab moves to the next blank', inEditor(TEMPLATES.derivative));
button('dⁿ/dxⁿ', 'Nth derivative, of order 0 to 5 (Ctrl+Shift+?). Tab moves to the next blank', inEditor(TEMPLATES.nthDerivative));
button('Σ', 'Sum (Ctrl+Shift+4). Tab moves to the next blank. Type $ for a sum over a range variable', inEditor(TEMPLATES.sum));
button('Π', 'Product (Ctrl+Shift+3). Tab moves to the next blank. Type # for a product over a range variable', inEditor(TEMPLATES.product));
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
// Matrices: insert one, grow it, and the matrix operators, which act on the selection or what's before the caret.
const matrixMenu = document.createElement('details');
matrixMenu.className = 'menu';
const matrixSummary = document.createElement('summary');
matrixSummary.textContent = 'Matrix';
matrixSummary.title = 'Insert a matrix (Ctrl+M), and matrix operators';
matrixSummary.addEventListener('mousedown', (e) => e.preventDefault());
const matrixList = document.createElement('div');
matrixMenu.append(matrixSummary, matrixList);
toolbar.appendChild(matrixMenu);
const matrixItems: [string, string, () => void][] = [
  ['2 × 2 matrix', 'Ctrl+M. Tab moves to the next blank', () => paper.mathEditor.insert(matrixTemplate(2, 2))],
  ['3 × 3 matrix', 'Tab moves to the next blank', () => paper.mathEditor.insert(matrixTemplate(3, 3))],
  ['3 × 1 column vector', 'Tab moves to the next blank', () => paper.mathEditor.insert(matrixTemplate(3, 1))],
  ['1 × 3 row vector', 'Tab moves to the next blank', () => paper.mathEditor.insert(matrixTemplate(1, 3))],
  ['Add row', 'Adds a row below the one the caret is in', () => paper.mathEditor.matrixOp('addRow')],
  ['Add column', 'Adds a column right of the one the caret is in', () => paper.mathEditor.matrixOp('addColumn')],
  ['Transpose  Mᵀ', 'Ctrl+1 where the browser allows it', () => paper.mathEditor.matrixOp('transpose')],
  ['Column  M⟨j⟩', 'Ctrl+6 where the browser allows it', () => paper.mathEditor.matrixOp('column')],
  ['Vectorize (element by element)', 'Puts an arrow over the selection, so operations act element by element (Ctrl+−)', () => paper.mathEditor.matrixOp('vectorize')],
  ['Determinant or length  |M|', 'A square matrix\'s determinant, a vector\'s length, a number\'s size', () => paper.mathEditor.matrixOp('bars')],
];
for (const [label, help, run] of matrixItems) {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = help;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    matrixMenu.open = false;
    if (paper.mathEditor.isOpen) run();
    else doc.onProblem('Click into some math first');
  });
  matrixList.appendChild(b);
}
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
for (const [name, takesArgument, help] of KEYWORDS) {
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
// The page: portrait or landscape. The current one is ticked each time the menu opens.
const pageMenu = document.createElement('details');
pageMenu.className = 'menu';
const pageSummary = document.createElement('summary');
pageSummary.textContent = 'Page';
pageSummary.title = 'Page orientation';
pageSummary.addEventListener('mousedown', (e) => e.preventDefault());
const pageList = document.createElement('div');
pageMenu.append(pageSummary, pageList);
toolbar.appendChild(pageMenu);
const orientations: [string, boolean][] = [['Portrait', false], ['Landscape', true]];
const orientationButtons = orientations.map(([label, landscape]) => {
  const b = document.createElement('button');
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    pageMenu.open = false;
    doc.setOrientation(landscape);
  });
  pageList.appendChild(b);
  return { b, label, landscape };
});
pageMenu.addEventListener('toggle', () => {
  for (const { b, label, landscape } of orientationButtons) {
    const on = doc.ws.page.landscape === landscape;
    b.textContent = `${on ? '✓ ' : '\u2003'}${label}`;
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('role', 'menuitemradio');
  }
});

const plotMenu = document.createElement('details');
plotMenu.className = 'menu';
const plotSummary = document.createElement('summary');
plotSummary.textContent = 'Format';
plotSummary.title = 'Options for the selected plot, image or results';
plotSummary.addEventListener('mousedown', (e) => e.preventDefault());
const plotList = document.createElement('div');
plotMenu.append(plotSummary, plotList);
toolbar.appendChild(plotMenu);
const formats: [string, 'plot' | 'image', (c: Content) => Content][] = [
  ['Log x axis', 'plot', (c) => (c.k === 'plot' ? { ...c, xAxis: { ...c.xAxis, log: !c.xAxis.log } } : c)],
  ['Log y axis', 'plot', (c) => (c.k === 'plot' ? { ...c, yAxis: { ...c.yAxis, log: !c.yAxis.log } } : c)],
  ['Points instead of lines', 'plot', (c) => (c.k === 'plot' ? { ...c, markers: !c.markers } : c)],
  // What kind of plot: how it's drawn, not what's calculated, so switching never recalculates.
  ['X-Y plot', 'plot', (c) => (c.k === 'plot' ? withView(c, undefined) : c)],
  ['Polar plot', 'plot', (c) => (c.k === 'plot' ? withView(c, 'polar') : c)],
  ['Smith chart', 'plot', (c) => (c.k === 'plot' ? withView(c, 'smith') : c)],
  ['Surface plot (3-D)', 'plot', (c) => (c.k === 'plot' ? withView(c, 'surface') : c)],
  ['Contour plot', 'plot', (c) => (c.k === 'plot' ? withView(c, 'contour') : c)],
  ['Reset the 3-D view', 'plot', (c) => {
    if (c.k !== 'plot') return c;
    const { view3d: _, ...rest } = c;
    return rest;
  }],
  ['Axis titles', 'plot', (c) => toggleTitles(c, 'axes')],
  ['Plot title', 'plot', (c) => toggleTitles(c, 'plot')],
  ['Color image (R|G|B side by side)', 'image', (c) => (c.k === 'image' ? { ...c, mode: c.mode === 'rgb' ? 'gray' : 'rgb' } : c)],
  ['Fit image to its range', 'image', (c) => (c.k === 'image' ? toggled(c, 'fit') : c)],
  ['False color (blue ramp)', 'image', (c) => (c.k === 'image' ? toggled(c, 'falseColor') : c)],
];
/** The image with an on-or-off display option switched: on is stored, off is left out. */
function toggled(c: Extract<Content, { k: 'image' }>, key: 'fit' | 'falseColor'): Content {
  const { [key]: on, ...rest } = c;
  return on ? rest : { ...rest, [key]: true };
}
/** The plot drawn another way: X-Y when `view` is undefined. */
function withView(c: Extract<Content, { k: 'plot' }>, view: Extract<Content, { k: 'plot' }>['view'] | undefined): Content {
  const { view: _, ...rest } = c;
  return view ? { ...rest, view } : rest;
}

// Each trace's color, line, weight and points, in a panel for the selected plot.
const tracePanel = new TracePanel(doc);
// Help beside the paper. It shares the right side with the trace panel, so only one is open at a time.
const help = new HelpPanel((lines) => {
  paper.insertExample(lines);
});
help.onOpen = () => tracePanel.close();
help.onAbout = () => splash.open();
/** Opens help at the name being typed, or in the selected region, or at the contents. */
function openHelp(): void {
  if (splash.isOpen) splash.close();
  if (paper.mathEditor.isOpen) {
    const { before, after } = paper.mathEditor.aroundCaret();
    const found = nameAt(before, after);
    help.open(found.name ?? (found.word || undefined));
    return;
  }
  const item = [...paper.selection].map((id) => doc.find(id)).find((x) => x?.kind === 'math');
  if (item?.kind === 'math') {
    let latex = '';
    try {
      latex = regionLatex(item.region.content);
    } catch {
      latex = '';
    }
    const found = nameAt(latex, '');
    if (found.name) {
      help.open(found.name);
      return;
    }
  }
  help.open();
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'F1') return;
  e.preventDefault();
  e.stopPropagation();
  openHelp();
}, { capture: true });
{
  const b = document.createElement('button');
  b.textContent = 'Trace styles…';
  b.title = 'Color, line, weight and points for each trace of the selected plot';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    plotMenu.open = false;
    const region = paper.selectedOf('plot');
    if (!region) {
      doc.onProblem('Select a plot first');
      return;
    }
    help.close();
    tracePanel.open(region);
  });
  plotList.appendChild(b);
}
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
{
  // Several results can be switched at once: an AC sheet is full of them.
  const b = document.createElement('button');
  b.textContent = 'Complex results as magnitude∠angle';
  b.title = 'Show the selected complex results as phasors, magnitude∠angle in degrees, or back as re + im·i';
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    plotMenu.open = false;
    const regions = paper.selectedResults();
    if (regions.length === 0) {
      doc.onProblem('Select one or more results first');
      return;
    }
    const formatOf = (c: Content): NumberFormat => (c.k === 'eval' || c.k === 'define' ? c.format : undefined) ?? doc.ws.format;
    const on = !regions.every((r) => formatOf(r.content).polar);
    doc.updateAll(regions, (c) => {
      if (c.k !== 'eval' && c.k !== 'define') return c;
      const { polar: _, ...rest } = formatOf(c);
      return { ...c, format: on ? { ...rest, polar: true } : rest };
    });
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
// The version, so a deployed copy says which one it is.
const version = document.createElement('span');
version.className = 'version';
version.textContent = `MathMath ${__APP_VERSION__}`;
version.title = 'About MathMath';
version.addEventListener('click', () => splash.open());
toolbar.append(busy, title, version);
// The tools a phone shows without ☰: open and save, help, and LIVE, beside the phone-only ones.
for (const b of toolbar.querySelectorAll<HTMLButtonElement>(':scope > button')) {
  if (['Open', 'Save'].includes(b.textContent ?? '') || b.classList.contains('mode')) b.classList.add('essential');
}
busy.classList.add('essential');

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  // Typing in the help search keeps its own undo.
  if ((key === 'z' || key === 'y') && (e.target as HTMLElement | null)?.closest?.('#help-panel')) return;
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

// What MathMath is, when it opens, unless the viewer has turned that off.
const splash = new Splash(__APP_VERSION__, __SOURCE_URL__);
splash.atLaunch();
