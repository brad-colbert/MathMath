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

import { DOMParser } from '@xmldom/xmldom';
import type { Worksheet } from '../src/model/ast.js';
import { type XElement, importWorksheet } from '../src/xmcd/import.js';

/** A small worksheet from region bodies, placed one per line down the page. */
export function sheet(regions: string[], settings = 'array-origin="0" convergence-tolerance="0.001"'): Worksheet {
  const body = regions
    .map((math, i) => `<region region-id="${i}" left="0" top="${i * 10}" align-x="0" align-y="${i * 10}">${math}</region>`)
    .join('');
  const xml = `<worksheet xmlns:ml="m"><builtInVariables ${settings}/><regions>${body}</regions></worksheet>`;
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return importWorksheet(doc.documentElement as unknown as XElement);
}

export const id = (name: string, sub?: string): string =>
  `<ml:id${sub ? ` subscript="${sub}"` : ''}>${name}</ml:id>`;
export const real = (v: number): string => `<ml:real>${v}</ml:real>`;
export const op = (name: string, ...args: string[]): string => `<ml:apply><ml:${name}/>${args.join('')}</ml:apply>`;
export const call = (fn: string, ...args: string[]): string =>
  `<ml:apply>${id(fn)}${args.length > 1 ? `<ml:sequence>${args.join('')}</ml:sequence>` : args.join('')}</ml:apply>`;
export const vec = (...items: number[]): string =>
  `<ml:matrix rows="${items.length}" cols="1">${items.map(real).join('')}</ml:matrix>`;
export const math = (body: string): string => `<math>${body}</math>`;
export const define = (target: string, value: string): string => math(`<ml:define>${target}${value}</ml:define>`);
export const fnDefine = (name: string, params: string[], body: string): string =>
  define(`<ml:function>${id(name)}<ml:boundVars>${params.map((p) => id(p)).join('')}</ml:boundVars></ml:function>`, body);
export const evaluate = (expr: string, result = '', unit = ''): string =>
  math(`<ml:eval>${expr}${unit ? `<ml:unitOverride>${unit}</ml:unitOverride>` : ''}${result ? `<result>${result}</result>` : ''}</ml:eval>`);
export const stat = (tag: string, ...parts: string[]): string => `<ml:${tag}>${parts.join('')}</ml:${tag}>`;
