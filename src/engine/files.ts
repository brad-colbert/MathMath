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

/** Files a worksheet reads, already decoded, so evaluation stays synchronous. */
import type { Worksheet } from '../model/ast.js';
import type { DecodedAudio } from './wav.js';

export interface DecodedImage {
  width: number;
  height: number;
  /** Row by row, four bytes a pixel. */
  rgba: Uint8ClampedArray;
}

export interface Files {
  image(name: string): DecodedImage | undefined;
  /** A data file's text, by `fileKey`. */
  table(name: string): string | undefined;
  /** A worksheet, by `sheetKey`. */
  sheet(name: string): Worksheet | undefined;
  /** A WAV file's samples, by `fileKey`, or why it couldn't be read. */
  audio(name: string): DecodedAudio | string | undefined;
}

export const isWebAddress = (s: string): boolean => /^https?:\/\//i.test(s);

/** The key an attached file is kept under: a web address as given, a file name in lower case. */
export const fileKey = (s: string): string => (isWebAddress(s) ? s : s.toLowerCase());

/** The last part of a path, Windows or not. */
export const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * Worksheets match by name without extension, so a reference to a Mathcad `.mcd` file finds the same
 * sheet saved as `.xmcd` or `.mathmath`.
 */
export const sheetKey = (name: string): string => baseName(name).replace(/\.[^.]*$/, '').toLowerCase();

/** Whether a file name looks like a worksheet rather than data. */
export const isSheetName = (name: string): boolean => /\.(xmcd|mcd|mathmath)$/i.test(name);

/** Attached worksheets are kept in MathMath's own format, whatever they were loaded from. */
export const SHEET_MIME = 'application/vnd.mathmath+json';

export const NO_FILES: Files = { image: () => undefined, table: () => undefined, sheet: () => undefined, audio: () => undefined };
