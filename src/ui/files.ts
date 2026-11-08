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

/** Opening and saving. Uses the File System Access API where it exists, and plain files otherwise. */
import { EXTENSION, loadWorksheet, saveWorksheet } from '../format/native.js';
import type { Worksheet } from '../model/ast.js';
import { type XElement, importWorksheet } from '../xmcd/import.js';

export function readAny(name: string, text: string): Worksheet {
  if (!name.toLowerCase().endsWith('.xmcd')) return loadWorksheet(text);
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('This worksheet file is damaged.');
  const serializer = new XMLSerializer();
  return importWorksheet(doc.documentElement as unknown as XElement, (e) => serializer.serializeToString(e as unknown as Node));
}

interface SaveHandle { createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>; name: string }
interface PickerWindow {
  showSaveFilePicker?: (o: unknown) => Promise<SaveHandle>;
}

let handle: SaveHandle | null = null;

export const forgetFile = (): void => {
  handle = null;
};

const pick = (): Promise<File | null> => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${EXTENSION},.xmcd`;
  input.onchange = () => resolve(input.files?.[0] ?? null);
  input.oncancel = () => resolve(null);
  input.click();
});

export async function openFile(): Promise<{ ws: Worksheet; name: string } | null> {
  const file = await pick();
  if (!file) return null;
  forgetFile();
  return { ws: readAny(file.name, await file.text()), name: file.name.replace(/\.(xmcd|mathmath)$/i, '') };
}

/** Saves to the file chosen earlier, or asks. An imported sheet always gets a new native file. */
export async function saveFile(ws: Worksheet, name: string): Promise<string | null> {
  const text = saveWorksheet(ws);
  const picker = (window as unknown as PickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      handle ??= await picker({ suggestedName: `${name}${EXTENSION}`, types: [{ description: 'MathMath worksheet', accept: { 'application/json': [EXTENSION] } }] });
    } catch {
      return null;
    }
    const out = await handle.createWritable();
    await out.write(text);
    await out.close();
    return handle.name.replace(/\.mathmath$/i, '');
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = `${name}${EXTENSION}`;
  link.click();
  URL.revokeObjectURL(link.href);
  return name;
}
