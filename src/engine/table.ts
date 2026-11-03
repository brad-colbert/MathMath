/**
 * Reads delimited text into a matrix: one row per line, split on commas, else tabs, else spaces.
 * Numbers become numbers and anything else a string. An empty or missing cell is 0, as Mathcad reads it.
 */
import { EvalError, type Value, fromValues, newMat, num, str } from './values.js';

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function parseTable(text: string): Value {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n|\r/);
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  if (lines.length === 0) throw new EvalError('runtime', 'The file is empty');
  const sample = lines.slice(0, 50);
  const split: (line: string) => string[] = sample.some((l) => l.includes(','))
    ? (l) => splitQuoted(l, ',')
    : sample.some((l) => l.includes('\t'))
      ? (l) => l.split('\t')
      : (l) => l.trim().split(/\s+/);
  const rows = lines.map(split);
  const cols = Math.max(...rows.map((r) => r.length));
  let numeric = true;
  for (const r of rows) {
    for (const cell of r) {
      const t = cell.trim();
      if (t !== '' && !NUMBER.test(t)) {
        numeric = false;
        break;
      }
    }
    if (!numeric) break;
  }
  if (numeric) {
    const m = newMat(rows.length, cols);
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < cols; j++) {
        const t = rows[i]![j]?.trim() ?? '';
        m.re[j * rows.length + i] = t === '' ? 0 : Number(t);
      }
    }
    return m;
  }
  const cells: Value[] = new Array(rows.length * cols);
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < cols; j++) {
      const t = rows[i]![j]?.trim() ?? '';
      cells[j * rows.length + i] = t === '' ? num(0) : NUMBER.test(t) ? num(Number(t)) : str(t);
    }
  }
  return fromValues(rows.length, cols, cells);
}

/** Splits on a delimiter, keeping delimiters inside double quotes, and removes the quotes. */
function splitQuoted(line: string, delimiter: string): string[] {
  if (!line.includes('"')) return line.split(delimiter);
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}
