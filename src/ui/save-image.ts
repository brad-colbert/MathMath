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
 * The Save buttons under a region that wrote files, with writeImage or Mathcad's WRITEBMP, WRITERGB and
 * WRITEPRN. A browser can't write to disk while a sheet calculates, so the region keeps what it wrote and the
 * button saves it when clicked: an image is encoded then, as PNG, JPEG or WebP by the browser or BMP here, from
 * its name; text goes as it is. The browser's download asks where it goes.
 */
import type { Pixels, Written } from '../engine/image.js';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };

export function mimeOf(name: string): string {
  return TYPES[name.split('.').pop()!.toLowerCase()] ?? 'image/png';
}

/** The name an image is saved under: one the browser can't write, as .gif, becomes .png. */
export function savedName(name: string): string {
  return TYPES[name.split('.').pop()!.toLowerCase()] ? name : `${name.replace(/\.[^.]*$/, '')}.png`;
}

/** An uncompressed 24-bit BMP, bottom row first, as Mathcad writes. Browsers don't encode BMP. */
function bmp(image: Pixels): Blob {
  const { width: w, height: h, rgba } = image;
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const out = new DataView(new ArrayBuffer(size));
  out.setUint8(0, 0x42);
  out.setUint8(1, 0x4d);
  out.setUint32(2, size, true);
  out.setUint32(10, 54, true);
  out.setUint32(14, 40, true);
  out.setInt32(18, w, true);
  out.setInt32(22, h, true);
  out.setUint16(26, 1, true);
  out.setUint16(28, 24, true);
  out.setUint32(34, row * h, true);
  out.setInt32(38, 2835, true);
  out.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const at = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      out.setUint8(at + x * 3, rgba[p + 2]!);
      out.setUint8(at + x * 3 + 1, rgba[p + 1]!);
      out.setUint8(at + x * 3 + 2, rgba[p]!);
    }
  }
  return new Blob([out.buffer], { type: 'image/bmp' });
}

/** The image encoded as its file type. */
export function encode(image: Pixels, mime: string): Promise<Blob> {
  if (mime === 'image/bmp') return Promise.resolve(bmp(image));
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode the image'))), mime, 0.92));
}

async function save(file: Written): Promise<void> {
  const name = file.image ? savedName(file.name) : file.name;
  const blob = file.image ? await encode(file.image, mimeOf(name)) : new Blob([file.text ?? ''], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Puts a button per written file under the region, or takes them away when it wrote none. */
export function drawSaves(el: HTMLElement, files: Written[] | undefined): void {
  const holder = el as HTMLElement & { savesFor?: Written[] | undefined };
  if (holder.savesFor === files && (files === undefined || el.querySelector('.saves'))) return;
  holder.savesFor = files;
  el.querySelector('.saves')?.remove();
  if (!files || files.length === 0) return;
  const bar = document.createElement('div');
  bar.className = 'saves';
  for (const f of files) {
    const b = document.createElement('button');
    b.type = 'button';
    const name = f.image ? savedName(f.name) : f.name;
    b.textContent = `Save ${name}`;
    b.title = f.image
      ? `${f.image.width} × ${f.image.height} pixels${name !== f.name ? `, as PNG: the browser can't write ${f.name.split('.').pop()} files` : ''}. Saves the latest result`
      : `${(f.text ?? '').split('\n').length - 1} lines of numbers. Saves the latest result`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      void save(f);
    });
    bar.appendChild(b);
  }
  el.appendChild(bar);
}
