// Shared by the corpus checks. The folder is private, so it's only ever passed in.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Worksheet } from '../model/ast.js';
import { type XElement, importWorksheet } from '../xmcd/import.js';

function findSheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : findSheets(path);
    return e.name.toLowerCase().endsWith('.xmcd') ? [path] : [];
  });
}

export interface Sheet { path: string; xml: string; ws: Worksheet }

const serializer = new XMLSerializer();

export function parseSheet(xml: string): Worksheet {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return importWorksheet(doc.documentElement as unknown as XElement, (e) => serializer.serializeToString(e as never));
}

export function* readSheets(corpus: string, match?: string): Generator<Sheet> {
  for (const path of findSheets(corpus).sort()) {
    const rel = relative(corpus, path);
    if (match && !rel.includes(match)) continue;
    const xml = readFileSync(path, 'utf8');
    yield { path: rel, xml, ws: parseSheet(xml) };
  }
}

export function corpusFolder(given?: string): string {
  const corpus = given ?? process.env.MATHMATH_CORPUS;
  if (!corpus) {
    console.error('Set MATHMATH_CORPUS or pass --corpus <folder>.');
    process.exit(2);
  }
  return corpus;
}
