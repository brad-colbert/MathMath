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
 * How large the paper shows: 1 is true size. On a phone the paper is scaled down to fit the screen's width, and
 * pinch or the zoom buttons change it. The sheet is scaled by a transform, so its layout, in points, never
 * changes; a sizer around it takes the scaled size, so the desk scrolls the right amount. Anything that turns a
 * screen position into points divides by the zoom too: see `pointsPerPixel`.
 */

const PT = 96 / 72;
const MIN = 0.25;
const MAX = 3;

let zoom = 1;
/** Whether the viewer chose a zoom, which then stays until they ask to fit again. */
let chosen = false;
let sheet: HTMLElement | null = null;
let sizer: HTMLElement | null = null;
const listeners: (() => void)[] = [];

export const getZoom = (): number => zoom;

/** Points per screen pixel at the current zoom: a distance on screen times this is a distance on the paper. */
export const pointsPerPixel = (): number => 1 / (PT * zoom);

/** Calls `f` when the zoom changes. */
export function onZoom(f: () => void): void {
  listeners.push(f);
}

function apply(): void {
  if (!sheet || !sizer) return;
  sheet.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
  sizer.style.width = `${sheet.offsetWidth * zoom}px`;
  sizer.style.height = `${sheet.offsetHeight * zoom}px`;
  for (const f of listeners) f();
}

/** Sets the zoom, as the viewer's choice unless `fit`. Keeps the point at `focus` (client pixels) still. */
export function setZoom(z: number, focus?: { x: number; y: number }, fit = false): void {
  const next = Math.min(MAX, Math.max(MIN, z));
  if (!fit) chosen = true;
  if (!sheet || next === zoom) {
    zoom = next;
    apply();
    return;
  }
  const desk = sheet.closest<HTMLElement>('#desk');
  const box = sheet.getBoundingClientRect();
  const at = focus ?? (desk ? { x: desk.getBoundingClientRect().left + desk.clientWidth / 2, y: desk.getBoundingClientRect().top + desk.clientHeight / 2 } : { x: box.left, y: box.top });
  // The paper point under the focus, before and after.
  const [px, py] = [(at.x - box.left) / zoom, (at.y - box.top) / zoom];
  zoom = next;
  apply();
  if (desk) {
    const after = sheet.getBoundingClientRect();
    desk.scrollLeft += after.left + px * zoom - at.x;
    desk.scrollTop += after.top + py * zoom - at.y;
  }
}

/** Fits the paper's width to the desk, never above true size. */
export function fitWidth(): void {
  chosen = false;
  fit();
}

function fit(): void {
  if (!sheet) return;
  const desk = sheet.closest<HTMLElement>('#desk');
  if (!desk) return;
  const room = desk.clientWidth - 16;
  setZoom(Math.min(1, room / sheet.offsetWidth), undefined, true);
}

/** Sets up the sheet's sizer and fitting, and pinch to zoom on touch screens. */
export function startZoom(theSheet: HTMLElement, theSizer: HTMLElement): void {
  sheet = theSheet;
  sizer = theSizer;
  sheet.style.transformOrigin = '0 0';
  new ResizeObserver(() => apply()).observe(sheet);
  window.addEventListener('resize', () => {
    if (!chosen) fit();
  });
  fit();
  pinch(sheet.closest<HTMLElement>('#desk')!);
}

/** Two fingers on the desk zoom the paper about the point between them. */
function pinch(desk: HTMLElement): void {
  let start: { distance: number; zoom: number } | null = null;
  const spread = (t: TouchList): { distance: number; x: number; y: number } => {
    const [a, b] = [t[0]!, t[1]!];
    return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  };
  desk.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) start = { distance: spread(e.touches).distance, zoom };
  }, { passive: true });
  desk.addEventListener('touchmove', (e) => {
    if (!start || e.touches.length !== 2) return;
    e.preventDefault();
    const s = spread(e.touches);
    setZoom(start.zoom * (s.distance / start.distance), { x: s.x, y: s.y });
  }, { passive: false });
  desk.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) start = null;
  });
}
