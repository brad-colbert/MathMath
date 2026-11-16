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
 * What trace and pause printed, in a small box under the region, as Mathcad's Trace Window shows it. It's for
 * reading while working, so it isn't printed.
 */
export function drawTraced(el: HTMLElement, lines: string[] | undefined): void {
  const holder = el as HTMLElement & { tracedFor?: string[] | undefined };
  if (holder.tracedFor === lines && (lines === undefined || el.querySelector('.traced'))) return;
  holder.tracedFor = lines;
  el.querySelector('.traced')?.remove();
  if (!lines || lines.length === 0) return;
  const box = document.createElement('div');
  box.className = 'traced';
  box.title = 'What trace and pause printed, newest last. Not printed with the sheet';
  box.textContent = lines.join('\n');
  el.appendChild(box);
}
