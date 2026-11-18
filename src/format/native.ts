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
  // Files from earlier builds lack fields added since. Fill only those, so a saved file reads back
  // and saves again unchanged.
  const ws = file.worksheet as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(emptyWorksheet())) if (!(key in ws)) ws[key] = value;
  checkShape(ws);
  return ws as unknown as Worksheet;
}

/** A region id as MathMath writes them. They name parts of the page's drawing, so nothing else is let through. */
const SAFE_ID = /^[A-Za-z0-9_.:-]{0,64}$/;

/**
 * Checks the parts of a file that go into the page's markup as they are: ids, positions and sizes. A worksheet
 * can come from anyone, by a link, so one that has been tampered with is refused rather than drawn.
 */
function checkShape(ws: Record<string, unknown>): void {
  const damaged = (what: string): Error => new Error(`This file is damaged: ${what}.`);
  const number = (o: Record<string, unknown>, key: string, where: string): void => {
    if (key in o && o[key] !== undefined && !(typeof o[key] === 'number' && Number.isFinite(o[key]))) throw damaged(`${where} has a ${key} that isn't a number`);
  };
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const page = ws.page;
  if (!isObject(page)) throw damaged('it has no page');
  for (const key of ['width', 'height']) number(page, key, 'the page');
  if (isObject(page.margins)) for (const key of ['left', 'right', 'top', 'bottom']) number(page.margins, key, 'the page');
  for (const list of ['regions', 'texts', 'opaque'] as const) {
    if (!Array.isArray(ws[list])) throw damaged(`its ${list} aren't a list`);
    for (const r of ws[list] as unknown[]) {
      if (!isObject(r)) throw damaged(`one of its ${list} isn't a region`);
      if (typeof r.id !== 'string' || !SAFE_ID.test(r.id)) throw damaged('a region has an unusable id');
      for (const key of ['left', 'top', 'alignX', 'alignY', 'width', 'height']) number(r, key, 'a region');
      if ('mime' in r && r.mime !== undefined && !(typeof r.mime === 'string' && /^image\/[A-Za-z0-9.+-]{1,40}$/.test(r.mime))) throw damaged('a picture has an unusable type');
      if (isObject(r.content)) for (const key of ['width', 'height']) number(r.content, key, 'a region');
    }
  }
}

export function emptyWorksheet(): Worksheet {
  return {
    page: DEFAULT_PAGE, format: DEFAULT_FORMAT, assets: {}, regions: [], texts: [], opaque: [], origin: 0, tol: 0.001, exactCompare: true, zeroOverZero: false, otherRegions: {}, componentOutputs: [],
  };
}
