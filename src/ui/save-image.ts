/**
 * The Save buttons under a region that wrote image files with writeImage. A browser can't write to disk
 * while a sheet calculates, so the region keeps the pixels and the button saves them when clicked: the
 * file is encoded then, as PNG, JPEG or WebP from its name, and the browser's download asks where it goes.
 */
import type { Pixels, Written } from '../engine/image.js';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

export function mimeOf(name: string): string {
  return TYPES[name.split('.').pop()!.toLowerCase()] ?? 'image/png';
}

/** The image encoded as its file type. */
export function encode(image: Pixels, mime: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode the image'))), mime, 0.92));
}

async function save(file: Written): Promise<void> {
  const blob = await encode(file.image, mimeOf(file.name));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
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
    b.textContent = `Save ${f.name}`;
    b.title = `${f.image.width} × ${f.image.height} pixels, from writeImage. Saves the latest result`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      void save(f);
    });
    bar.appendChild(b);
  }
  el.appendChild(bar);
}
