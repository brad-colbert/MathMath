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

import { expect, test } from 'vitest';
import { emptyWorksheet, loadWorksheet, saveWorksheet } from '../src/format/native.js';
import { type TextBlock, changeBlocks, isFormatted, numbering, plainBlocks, textBlocksOf, wordsOf } from '../src/model/richtext.js';

const rich: TextBlock[] = [
  { kind: 'h1', runs: [{ t: 'Beams' }] },
  { align: 'justify', line: 1.5, after: 6, runs: [{ t: 'A ' }, { t: 'simply supported', italic: true }, { t: ' beam, x' }, { t: '2', script: 'sup' }, { t: '.', color: '#b3261e', size: 12, bold: true, underline: true }] },
  { kind: 'number', level: 1, runs: [{ t: 'first\nand more' }] },
];

test('formatting reads back as it was', () => {
  expect(textBlocksOf(rich, wordsOf(rich))).toEqual(rich);
  expect(textBlocksOf(JSON.parse(JSON.stringify(rich)), 'Beams\nA simply supported beam, x2.\nfirst\nand more')).toEqual(rich);
});

test('formatting whose words are not the text\'s is dropped, as after an edit by a version without it', () => {
  expect(textBlocksOf(rich, 'Beams, edited')).toBeNull();
  expect(textBlocksOf(rich, '')).toBeNull();
});

test('only what the editor could have made is kept', () => {
  const hostile = [{
    kind: 'script', level: 99, align: 'url(x)', line: 1e9, after: -5, onclick: 'alert(1)',
    runs: [{ t: '<img src=x onerror=alert(1)>', bold: 'yes', color: 'red;background:url(https://example.com)', size: 4000, script: 'javascript', href: 'x' }, { t: 5 }, null, 'x', { t: '' }],
  }];
  expect(textBlocksOf(hostile, '<img src=x onerror=alert(1)>')).toEqual([{ line: 3, runs: [{ t: '<img src=x onerror=alert(1)>', size: 48 }] }]);
  for (const bad of [null, undefined, 'x', {}, [], [null], [{}], [{ runs: 'x' }], [[]]]) expect(textBlocksOf(bad, '')).toBeNull();
  expect(textBlocksOf(Array.from({ length: 5001 }, () => ({ runs: [] })), '\n'.repeat(5000))).toBeNull();
});

test('a list item keeps its level, anything else has none, and runs alike are joined', () => {
  expect(textBlocksOf([{ kind: 'bullet', level: 2, runs: [{ t: 'a' }, { t: 'b' }] }, { level: 2, runs: [{ t: 'c', bold: true }, { t: 'd', bold: true }] }], 'ab\ncd'))
    .toEqual([{ kind: 'bullet', level: 2, runs: [{ t: 'ab' }] }, { runs: [{ t: 'cd', bold: true }] }]);
});

test('plain words are a paragraph a line, and are not formatted', () => {
  expect(wordsOf(plainBlocks('a\n\nb '))).toBe('a\n\nb ');
  expect(isFormatted(plainBlocks('a\n\nb'))).toBe(false);
  expect(isFormatted(rich)).toBe(true);
  expect(isFormatted(changeBlocks(rich, (b) => ({ runs: b.runs.map((r) => ({ t: r.t })) })))).toBe(false);
});

test('headings are counted in reading order, subheadings afresh under each', () => {
  const t = (id: string, top: number, left: number, kinds: TextBlock['kind'][]) => {
    const blocks = kinds.map((kind): TextBlock => ({ ...(kind ? { kind } : {}), runs: [{ t: 'x' }] }));
    return { id, top, left, width: 0, height: 0, text: wordsOf(blocks), blocks };
  };
  const ws = { ...emptyWorksheet(), texts: [t('c', 300, 0, ['h2']), t('a', 0, 0, ['title', 'h1', 'h2', 'h2']), t('b2', 100, 90, ['h2']), t('b', 100, 0, ['h1', undefined])] };
  const counts = numbering(ws).before;
  expect(Object.fromEntries(counts)).toEqual({ a: { h1: 0, h2: 0, fig: 0, tab: 0 }, b: { h1: 1, h2: 2, fig: 0, tab: 0 }, b2: { h1: 2, h2: 0, fig: 0, tab: 0 }, c: { h1: 2, h2: 1, fig: 0, tab: 0 } });
});

test('a sheet keeps formatting, text across the page and Paper style; one without them saves as before', () => {
  const ws = emptyWorksheet();
  ws.texts = [{ id: 't', left: 36, top: 10, width: 0, height: 0, text: wordsOf(rich), blocks: rich, flow: true }];
  ws.textLook = 'paper';
  const back = loadWorksheet(saveWorksheet(ws));
  expect(back.texts).toEqual(ws.texts);
  expect(back.textLook).toBe('paper');
  expect(saveWorksheet(back)).toBe(saveWorksheet(ws));
  const plain = saveWorksheet(emptyWorksheet());
  expect(plain).not.toContain('textLook');
  expect(saveWorksheet(loadWorksheet(plain))).toBe(plain);
});

test('the editor holds blocks just as they are, and gives them back the same', async () => {
  const { blocksOf, docOf, wordsOfDoc } = await import('../src/ui/richschema.js');
  expect(blocksOf(docOf(rich))).toEqual(rich);
  expect(wordsOfDoc(docOf(rich))).toBe(wordsOf(rich));
  // Tabs, runs of spaces, blank lines and spaces at the ends are all kept.
  const odd = plainBlocks('a\tb  c \n\n d ');
  expect(wordsOf(blocksOf(docOf(odd))!)).toBe('a\tb  c \n\n d ');
  expect(isFormatted(blocksOf(docOf(odd))!)).toBe(false);
  // A line break inside a paragraph keeps the look of the words before it.
  expect(blocksOf(docOf([{ runs: [{ t: 'x\ny', bold: true }] }]))).toEqual([{ runs: [{ t: 'x\ny', bold: true }] }]);
  expect(blocksOf(docOf([{ runs: [{ t: '\n' }, { t: 'y' }] }]))).toEqual([{ runs: [{ t: '\ny' }] }]);
});

test('more blocks than a region may keep formatted give no blocks, so only the words are kept', async () => {
  const { blocksOf, docOf } = await import('../src/ui/richschema.js');
  const many = Array.from({ length: 5001 }, (_, i) => ({ runs: [{ t: String(i) }] }));
  expect(blocksOf(docOf(many))).toBeNull();
});

// Math in a line of text (part 2).
const withMath = (): { texts: { id: string; left: number; top: number; text: string; blocks: TextBlock[]; flow?: true }[]; regions: { id: string; inText?: string; left: number; top: number; alignX: number; alignY: number }[] } => ({
  texts: [
    { id: 't1', left: 100, top: 200, text: 'Let  so ', blocks: [{ runs: [{ t: 'Let ' }, { t: '', math: 'm1' }, { t: ' so ' }, { t: '', math: 'm2' }] }] },
    { id: 't2', left: 50, top: 50, text: 'see ', blocks: [{ runs: [{ t: 'see ' }, { t: '', math: 'm3' }] }] },
  ],
  regions: [
    { id: 'm1', inText: 't1', left: 0, top: 0, alignX: 0, alignY: 0 },
    { id: 'm2', inText: 't1', left: 0, top: 0, alignX: 0, alignY: 0 },
    { id: 'm3', inText: 't2', left: 0, top: 0, alignX: 0, alignY: 0 },
    { id: 'free', left: 10, top: 10, alignX: 10, alignY: 10 },
  ],
});

test('math in text is a run without words, so the words are the same and an older version drops only the run', async () => {
  const { mathIdsOf } = await import('../src/model/richtext.js');
  const blocks = withMath().texts[0]!.blocks;
  expect(wordsOf(blocks)).toBe('Let  so ');
  expect(textBlocksOf(blocks, 'Let  so ')).toEqual(blocks);
  expect(mathIdsOf(blocks)).toEqual(['m1', 'm2']);
  expect(isFormatted([{ runs: [{ t: '', math: 'm1' }] }])).toBe(true);
  // A run of math is never joined to words beside it, and only an id as MathMath writes them is kept.
  expect(textBlocksOf([{ runs: [{ t: 'a' }, { t: '', math: 'm1' }, { t: '', math: 'm1' }, { t: 'b' }] }], 'ab')![0]!.runs).toHaveLength(4);
  expect(textBlocksOf([{ runs: [{ t: '', math: '"><img src=x>' }, { t: '', math: '' }, { t: '', math: 5 }, { t: 'x', math: 'm1' }] }], 'x')).toEqual([{ runs: [{ t: 'x' }] }]);
});

test('math counts as in text only when the region and the text both say so, once', async () => {
  const { inlineMath } = await import('../src/model/richtext.js');
  const ws = withMath();
  expect([...inlineMath(ws.texts, ws.regions)]).toEqual([['m1', { text: 't1', n: 0 }], ['m2', { text: 't1', n: 1 }], ['m3', { text: 't2', n: 0 }]]);
  // A region that names another text, a text that names math twice or names math that isn't its own, and formatting
  // whose words aren't the text's, as after an older version's edit: each such math is math on its own.
  ws.regions[2]!.inText = 't1';
  ws.texts[0]!.blocks[0]!.runs.push({ t: '', math: 'm1' }, { t: '', math: 'free' });
  ws.texts[1]!.text = 'see, edited';
  const found = inlineMath(ws.texts, ws.regions);
  expect([...found.keys()]).toEqual(['m1', 'm2']);
  expect(found.has('free')).toBe(false);
  // A plot or picture named by a file is never in a line.
  expect(inlineMath(ws.texts, ws.regions.map((r) => (r.id === 'm2' ? { ...r, content: { k: 'plot' } } : { ...r, content: { k: 'eval' } }))).has('m2')).toBe(false);
});

test('math in text is calculated where its text starts, in the order it is read, whatever the wrapping', async () => {
  const { placeInline } = await import('../src/model/richtext.js');
  const ws = { ...withMath(), page: { width: 612, height: 792, landscape: false, margins: { left: 36, right: 36, top: 36, bottom: 36 } } };
  placeInline(ws as never);
  const at = (id: string) => ws.regions.find((r) => r.id === id)!;
  expect([at('m1').alignY, at('m2').alignY, at('m3').alignY]).toEqual([208, 208, 58]);
  expect(at('m1').alignX).toBeLessThan(at('m2').alignX);
  expect(at('m1').left).toBe(100);
  expect(at('free').alignX).toBe(10);
  // Text across the page starts at the margin.
  ws.texts[0]!.flow = true;
  placeInline(ws as never);
  expect(at('m1').left).toBe(36);
});

test('the editor holds math in text by id with its LaTeX, and gives the same blocks back', async () => {
  const { blocksOf, docOf, mathsOf, wordsOfDoc } = await import('../src/ui/richschema.js');
  const blocks: TextBlock[] = [{ runs: [{ t: 'Let ' }, { t: '', math: 'm1' }, { t: '\n' }, { t: '', math: 'm2' }, { t: 'end' }] }];
  const doc = docOf(blocks, (id) => (id === 'm1' ? 'x:=3' : id === 'm2' ? 'x=' : undefined));
  expect(blocksOf(doc)).toEqual(blocks);
  expect(wordsOfDoc(doc)).toBe(wordsOf(blocks));
  expect([...mathsOf(doc)]).toEqual([['m1', 'x:=3'], ['m2', 'x=']]);
  // Math it isn't given is left out.
  expect(blocksOf(docOf(blocks, (id) => (id === 'm1' ? 'x' : undefined)))).toEqual([{ runs: [{ t: 'Let ' }, { t: '', math: 'm1' }, { t: '\nend' }] }]);
});

test('a reference is a run without words naming a label, and only headings and captions have labels, once', () => {
  const blocks: TextBlock[] = [
    { kind: 'caption', label: 'Lf', runs: [{ t: 'A beam.' }] },
    { runs: [{ t: 'See ' }, { t: '', ref: 'Lf' }, { t: '', ref: 'e1' }, { t: '.' }] },
  ];
  expect(textBlocksOf(blocks, wordsOf(blocks))).toEqual(blocks);
  // Two references side by side stay two; one with markup for a label, or naming nothing, is dropped.
  const odd = [
    { kind: 'h1', label: 'La', runs: [{ t: 'One' }] }, { kind: 'h2', label: 'La', runs: [{ t: 'Two' }] },
    { label: 'Lp', runs: [{ t: 'x' }, { t: '', ref: '"><img>' }, { t: '', ref: 7 }, { t: '' }, { t: '', math: 'm', ref: 'La' }] },
  ];
  expect(textBlocksOf(odd, 'One\nTwo\nx')).toEqual([
    { kind: 'h1', label: 'La', runs: [{ t: 'One' }] }, { kind: 'h2', runs: [{ t: 'Two' }] }, { runs: [{ t: 'x' }, { t: '', math: 'm' }] },
  ]);
});

test('headings, captions and equations are numbered in the order read, and references show their numbers', async () => {
  const { refText } = await import('../src/model/richtext.js');
  const ws = emptyWorksheet();
  const tb = (id: string, top: number, blocks: TextBlock[], flow?: true) => ({ id, left: 300, top, width: 0, height: 0, text: wordsOf(blocks), blocks, ...(flow ? { flow } : {}) });
  ws.texts = [
    tb('b', 400, [{ kind: 'caption', label: 'Lf2', runs: [{ t: 'Second' }] }, { kind: 'h2', label: 'Ls', runs: [{ t: 'Sub' }] }]),
    // Across the page, it starts at the margin, before math further right on its row.
    tb('a', 100, [{ kind: 'h1', runs: [{ t: 'Start' }] }, { kind: 'caption', label: 'Lf1', runs: [{ t: '  First   one ' }] }], true),
    tb('c', 600, [{ kind: 'caption', label: 'Lf1', runs: [{ t: 'Copy' }] }, { kind: 'table-caption', label: 'Lt', runs: [{ t: 'Loads' }] }]),
  ];
  const eq = (id: string, top: number, latex: string, numbered = true) => ({ id, left: 100, top, alignX: 100, alignY: top + 8, disabled: false, content: { k: 'draft' as const, latex, error: '' }, ...(numbered ? { numbered: true as const } : {}) });
  ws.regions = [eq('e2', 500, 'y'), eq('e1', 100, 'x'), eq('n', 300, 'z', false), eq('in', 120, 'w'), { ...eq('p', 130, ''), content: { k: 'other' as const, tag: 'x' } }];
  const n = numbering(ws, new Map([['in', {}]]));
  expect(Object.fromEntries(n.equations)).toEqual({ e1: 1, e2: 2 });
  expect(n.targets.map((t) => `${t.kind}${t.n}:${t.words}`)).toEqual(['h11:Start', 'fig1:First one', 'eq1:', 'fig2:Second', 'h21.1:Sub', 'eq2:', 'fig3:Copy', 'tab1:Loads']);
  expect(Object.fromEntries(n.before)).toEqual({ a: { h1: 0, h2: 0, fig: 0, tab: 0 }, b: { h1: 1, h2: 0, fig: 1, tab: 0 }, c: { h1: 1, h2: 1, fig: 2, tab: 0 } });
  // A label named twice belongs to the first read; the copy can't be referred to until it has one of its own.
  expect(n.labels.get('Lf1')?.words).toBe('First one');
  expect(n.targets.at(-2)?.label).toBeUndefined();
  // A table's caption is counted apart from figures.
  expect(refText(n.labels.get('Lt'), false)).toBe('Table 1');
  expect(refText(n.labels.get('e2'), false)).toBe('(2)');
  expect(refText(n.labels.get('Lf2'), false)).toBe('Figure 2');
  expect(refText(n.labels.get('Ls'), true)).toBe('Section 1.1');
  expect(refText(n.labels.get('Ls'), false)).toBe('“Sub”');
  expect(refText(n.labels.get('nope'), true)).toBe('(?)');
  // What's being typed stands in for its region.
  const typed = numbering(ws, new Map(), { id: 'a', blocks: [{ kind: 'h1', runs: [{ t: 'A' }] }, { kind: 'h1', runs: [{ t: 'B' }] }] });
  expect(refText(typed.labels.get('Ls'), true)).toBe('Section 2.1');
  expect(typed.equations.get('in')).toBe(2);
  // On one row, equations go along the baseline, whatever their heights: a tall one's top is higher.
  ws.regions = [{ ...eq('tall', 180, 'x'), alignY: 208, left: 300, alignX: 300 }, { ...eq('short', 200, 'y'), alignY: 208 }];
  expect(Object.fromEntries(numbering(ws).equations)).toEqual({ short: 1, tall: 2 });
});

test('the editor holds captions, labels and references, and gives the same blocks back', async () => {
  const { blocksOf, docOf, wordsOfDoc } = await import('../src/ui/richschema.js');
  const blocks: TextBlock[] = [
    { kind: 'caption', label: 'Lf', runs: [{ t: 'A beam.' }] },
    { kind: 'table-caption', label: 'Lt', runs: [{ t: 'Sizes.' }] },
    { kind: 'h1', label: 'Lh', align: 'center', runs: [{ t: 'Loads' }] },
    { runs: [{ t: 'See ' }, { t: '', ref: 'Lf' }, { t: '', ref: 'e1' }, { t: '\nand ' }, { t: '', ref: 'Lh' }] },
  ];
  expect(blocksOf(docOf(blocks))).toEqual(blocks);
  expect(wordsOfDoc(docOf(blocks))).toBe(wordsOf(blocks));
  // A line break after a reference starts words of their own.
  expect(blocksOf(docOf([{ runs: [{ t: '', ref: 'Lf' }, { t: '\nx' }] }]))).toEqual([{ runs: [{ t: '', ref: 'Lf' }, { t: '\nx' }] }]);
});
