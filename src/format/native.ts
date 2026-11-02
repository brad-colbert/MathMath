/**
 * The native file format: JSON of the worksheet model, storing expression trees rather than LaTeX.
 * Original .xmcd files are read, never written.
 */
import { DEFAULT_FORMAT, DEFAULT_PAGE, type Worksheet } from '../model/ast.js';

export const EXTENSION = '.mathmath';
const FORMAT_NAME = 'mathmath';
const VERSION = 1;

/** JSON has no NaN or infinity, and a stored result can hold either. */
const NUMBER_TAG = '$number';

export function saveWorksheet(ws: Worksheet): string {
  return JSON.stringify({ format: FORMAT_NAME, version: VERSION, worksheet: ws }, (_, v) =>
    typeof v === 'number' && !Number.isFinite(v) ? { [NUMBER_TAG]: String(v) } : v);
}

export function loadWorksheet(text: string): Worksheet {
  const file = JSON.parse(text, (_, v) =>
    v && typeof v === 'object' && typeof v[NUMBER_TAG] === 'string' ? Number(v[NUMBER_TAG]) : v) as {
    format?: string;
    version?: number;
    worksheet?: Worksheet;
  };
  if (file.format !== FORMAT_NAME || !file.worksheet) throw new Error('This is not a MathMath file.');
  if ((file.version ?? 0) > VERSION) throw new Error(`This file needs a newer version of MathMath (format ${file.version}).`);
  return file.worksheet;
}

export function emptyWorksheet(): Worksheet {
  return {
    page: DEFAULT_PAGE, format: DEFAULT_FORMAT, regions: [], texts: [], opaque: [], origin: 0, tol: 0.001, otherRegions: {}, componentOutputs: [],
  };
}
