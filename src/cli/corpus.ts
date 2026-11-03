// Shared by the corpus checks. The folder is private, so it's only ever passed in.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { type Files, baseName, fileKey, sheetKey } from '../engine/files.js';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Worksheet } from '../model/ast.js';
import { type XElement, importWorksheet } from '../xmcd/import.js';

function findFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : findFiles(path);
    return [path];
  });
}

const findSheets = (dir: string): string[] => findFiles(dir).filter((p) => p.toLowerCase().endsWith('.xmcd'));

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

/** A file found by name: one in the sheet's own folder, or the only one, or the first, reported as a guess. */
export interface Found { path: string; how: 'same-folder' | 'only' | 'guess' }

/**
 * Files a corpus sheet reads, found by name, as the app finds attached files. Worksheets are looked
 * for in the `also` folders first (sheets converted from .mcd, mirroring the corpus's folders), then
 * in the corpus. `found` records every choice, so a guess can be reported.
 */
export function corpusFiles(corpus: string, also: string[]): (sheetPath: string, found?: Map<string, Found>) => Files {
  const index = (root: string, key: (p: string) => string, keep: (p: string) => boolean): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const p of findFiles(root).filter(keep).sort()) {
      const k = key(p);
      m.set(k, [...(m.get(k) ?? []), relative(root, p)]);
    }
    return m;
  };
  const isSheet = (p: string): boolean => /\.xmcd$/i.test(p);
  const data = index(corpus, (p) => fileKey(baseName(p)), (p) => !isSheet(p) && !/\.mcd$/i.test(p));
  const sheets = [...also, corpus].map((root) => ({ root, by: index(root, sheetKey, isSheet) }));
  const parsed = new Map<string, ReturnType<typeof parseSheet>>();
  const pick = (paths: string[], folder: string): Found => {
    const same = paths.find((p) => dirname(p) === folder);
    if (same) return { path: same, how: 'same-folder' };
    return { path: paths[0]!, how: paths.length === 1 ? 'only' : 'guess' };
  };
  return (sheetPath, found) => {
    const folder = dirname(sheetPath);
    return {
      image: () => undefined,
      table: (name) => {
        const paths = data.get(name);
        if (!paths) return undefined;
        const f = pick(paths, folder);
        found?.set(`table ${name}`, f);
        return readFileSync(join(corpus, f.path), 'utf8');
      },
      sheet: (key) => {
        for (const { root, by } of sheets) {
          const paths = by.get(key);
          if (!paths) continue;
          const f = pick(paths, folder);
          const path = join(root, f.path);
          found?.set(`sheet ${key}`, { ...f, path: relative(corpus, path) });
          if (!parsed.has(path)) parsed.set(path, parseSheet(readFileSync(path, 'utf8')));
          return parsed.get(path);
        }
        return undefined;
      },
    };
  };
}
