// Writes the test set as a worksheet for Mathcad, and reads back the answers it saved. Answers stay
// out of this repository. Usage: tsx mathcad-key.ts write <out.xmcd> | read <saved.xmcd> <out.json>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import type { Expr } from '../../src/model/ast.js';
import { type XElement, parseExpr } from '../../src/xmcd/import.js';
import { CASES, type Case } from './symbolic-cases.js';
import { parse } from './infix.js';

const NS = 'http://schemas.mathsoft.com/math30';
const id = (n: string): string => `<ml:id xml:space="preserve">${n}</ml:id>`;
const lambda = (v: string, b: string): string => `<ml:lambda><ml:boundVars>${id(v)}</ml:boundVars>${b}</ml:lambda>`;

function xml(e: Expr): string {
  switch (e.k) {
    case 'real': return `<ml:real>${e.v}</ml:real>`;
    case 'id': return e.name === 'i_' ? '<ml:imag symbol="i">1</ml:imag>' : id(e.name);
    case 'call': {
      const name = (e.fn as { name: string }).name;
      if (name === 'sqrt') return `<ml:apply><ml:sqrt/>${xml(e.args[0]!)}</ml:apply>`;
      const args = e.args.map(xml).join('');
      return `<ml:apply>${id(name)}${e.args.length > 1 ? `<ml:sequence>${args}</ml:sequence>` : args}</ml:apply>`;
    }
    case 'matrix': return `<ml:matrix rows="${e.rows}" cols="${e.cols}">${e.items.map(xml).join('')}</ml:matrix>`;
    case 'op': {
      const paren = (a: Expr): string => (a.k === 'op' ? `<ml:parens>${xml(a)}</ml:parens>` : xml(a));
      return `<ml:apply><ml:${e.op}/>${e.args.map(paren).join('')}</ml:apply>`;
    }
    default: throw new Error(`no xml for ${e.k}`);
  }
}

const op = (name: string, body: string): string => `<ml:apply><ml:${name}/>${body}</ml:apply>`;

function body(c: Case): { expr: string; cmds: string[][] } {
  const e = xml(parse(c.expr));
  const a = c.arg ? xml(parse(c.arg)) : '';
  const lo = c.lo ? xml(parse(c.lo)) : '';
  const hi = c.hi ? xml(parse(c.hi)) : '';
  const v = c.arg ?? 'x';
  switch (c.kind) {
    case 'plain': return { expr: e, cmds: [] };
    case 'simplify': case 'expand': case 'factor': return { expr: e, cmds: [[id(c.kind)]] };
    case 'collect': case 'coeffs': case 'solve': case 'substitute': return { expr: e, cmds: [[id(c.kind), a]] };
    case 'parfrac': return { expr: e, cmds: [[id('parfrac'), a]] };
    case 'series': return { expr: e, cmds: [[id('series'), a]] };
    case 'diff': return { expr: op('derivative', lambda(v, e)), cmds: [] };
    case 'integrate': return { expr: op('integral', lambda(v, e)), cmds: [] };
    case 'definite': return { expr: op('integral', `${lambda(v, e)}<ml:bounds>${lo}${hi}</ml:bounds>`), cmds: [] };
    case 'limit': return { expr: op('limit', `${lambda(v, e)}${lo}`), cmds: [] };
    case 'sum': return { expr: op('summation', `${lambda(v, e)}<ml:bounds>${lo}${hi}</ml:bounds>`), cmds: [] };
    case 'det': return { expr: op('absval', e), cmds: [] };
    case 'inverse': return { expr: op('pow', `${e}<ml:real>-1</ml:real>`), cmds: [] };
  }
}

function regionXml(n: number, left: number, y: number, inner: string): string {
  return `<region region-id="${n}" left="${left}" top="${y - 12}" width="200" height="24" align-x="${left + 10}" align-y="${y}" show-border="false" show-highlight="false" is-protected="true" z-order="0" background-color="inherit" tag=""><math optimize="false" disable-calc="false">${inner}</math></region>`;
}

function smallestSheet(dir: string): string {
  const names = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xmcd'));
  const size = (f: string): number => readFileSync(join(dir, f)).length;
  return join(dir, names.sort((a, b) => size(a) - size(b))[0]!);
}

const [mode, a, b] = process.argv.slice(2);
if (mode === 'write') {
  const corpus = process.env.MATHMATH_CORPUS;
  if (!corpus) throw new Error('Set MATHMATH_CORPUS: the file header comes from a sheet there.');
  const src = readFileSync(smallestSheet(corpus), 'utf8').replace(/^﻿/, '');
  const start = src.indexOf('>', src.indexOf('<regions')) + 1;
  const end = src.indexOf('</regions>');
  const tail = src.slice(end).replace(/<binaryContent[^>]*>[\s\S]*?<\/binaryContent>/g, '');
  const regions: string[] = [];
  let n = 1;
  const COLS = 4;
  CASES.forEach((c, index) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    const left = 24 + col * 215;
    const y = 30 + row * 34;
    for (const [name, value] of c.defs ?? []) {
      regions.push(regionXml(n++, left, y - 20, `<ml:define xmlns:ml="${NS}">${id(name)}${xml(parse(value))}</ml:define>`));
    }
    const { expr, cmds } = body(c);
    const commands = cmds.map((cmd) => `<ml:command>${cmd.join('')}</ml:command>`).join('');
    regions.push(regionXml(n++, left, y, `<ml:symEval xmlns:ml="${NS}" style="right-arrow">${expr}${commands}</ml:symEval>`));
  });
  writeFileSync(a!, src.slice(0, start) + regions.join('') + tail);
  console.log(`wrote ${CASES.length} cases to ${a}`);
} else if (mode === 'read') {
  const doc = new DOMParser().parseFromString(readFileSync(a!, 'utf8'), 'text/xml');
  const key: Record<string, unknown> = {};
  const els = doc.getElementsByTagName('ml:symEval');
  for (let i = 0; i < els.length; i++) {
    const el = els[i]!;
    const math = el.parentNode as unknown as { getAttribute(n: string): string | null };
    const kids = Array.from(el.childNodes as unknown as ArrayLike<XElement>).filter((k) => k.nodeType === 1);
    const res = kids.find((k) => k.localName === 'symResult');
    const inner = res ? Array.from(res.childNodes as ArrayLike<XElement>).find((k) => k.nodeType === 1) : undefined;
    key[CASES[i]!.id] = { result: inner ? parseExpr(inner) : null, error: math.getAttribute('error') };
  }
  writeFileSync(b!, JSON.stringify(key, null, 1));
  const values = Object.values(key) as { result: Expr | null; error: string | null }[];
  console.log(`${values.length} cases: ${values.filter((v) => v.result).length} with results, ${values.filter((v) => v.error).length} with errors`);
}
