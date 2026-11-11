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
 * MathMath names its functions its own way. Mathcad sheets keep Mathcad's names on import: where the
 * meaning is the same, this table can translate them; where it isn't, the sheet says what to do instead.
 */
export const MATHCAD_FUNCTIONS: Record<string, string> = {};

/**
 * Mathcad's file functions read paths on Mathcad's machine, which a browser can't. They stay in the
 * sheet, grayed, with advice to load the file with Files instead.
 */
/**
 * Mathcad's file-writing functions that MathMath carries out, as `WRITEBMP("name") := M`: the region offers
 * the file to save (see mathcadWrite in src/engine/image.ts). The rest of MATHCAD_FILE_FUNCTIONS are refused.
 */
export const MATHCAD_WRITES = new Set(['WRITEBMP', 'WRITERGB', 'WRITEPRN', 'WRITE_HLS', 'WRITE_HSV', 'WRITEWAV']);

export const MATHCAD_FILE_FUNCTIONS = new Set([
  'READRGB', 'READBMP', 'READ_IMAGE', 'READ_RED', 'READ_GREEN', 'READ_BLUE', 'READ_HLS', 'READ_HSV',
  'READ_HLS_HUE', 'READ_HLS_LIGHT', 'READ_HLS_SAT', 'READ_HSV_HUE', 'READ_HSV_SAT', 'READ_HSV_VALUE', 'READWAV', 'GETWAVINFO',
  'READBIN', 'READPRN', 'READ', 'READFILE', 'WRITERGB', 'WRITEBMP', 'WRITEPRN', 'WRITE_HLS', 'WRITE_HSV', 'WRITEWAV', 'WRITEBIN', 'WRITE', 'APPENDPRN',
]);

export const translateFunction = (name: string): string => MATHCAD_FUNCTIONS[name] ?? name;
