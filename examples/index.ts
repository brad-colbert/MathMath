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

/** Every example, in the gallery's order, and how to build them. */
import { saveWorksheet } from '../src/format/native.js';
import { type Example, Sheet } from './sheet.js';
import { beam } from './sheets/beam.js';
import { cooling } from './sheets/cooling.js';
import { drum } from './sheets/drum.js';
import { earth } from './sheets/earth.js';
import { filter } from './sheets/filter.js';
import { hardware } from './sheets/hardware.js';
import { laplace } from './sheets/laplace.js';
import { matching } from './sheets/matching.js';
import { mortgage } from './sheets/mortgage.js';
import { noisy } from './sheets/noisy.js';
import { stairs } from './sheets/stairs.js';
import { sway } from './sheets/sway.js';
import { hues } from './sheets/hues.js';
import { shooting } from './sheets/shooting.js';
import { orbits } from './sheets/orbits.js';
import { phasors } from './sheets/phasors.js';
import { projectile } from './sheets/projectile.js';
import { shapes } from './sheets/shapes.js';
import { skin } from './sheets/skin.js';
import { spectrum } from './sheets/spectrum.js';
import { tolerance } from './sheets/tolerance.js';
import { wall } from './sheets/wall.js';
import { washer } from './sheets/washer.js';
import { tour } from './sheets/tour.js';

export const EXAMPLES: Example[] = [tour, projectile, filter, matching, tolerance, washer, earth, beam, wall, orbits, spectrum, laplace, phasors, cooling, hardware, drum, skin, mortgage, shapes, noisy, stairs, sway, hues, shooting];

export interface Built { slug: string; title: string; summary: string; text: string; sheet: Sheet; symbolic: boolean }

export function buildAll(): Built[] {
  return EXAMPLES.map((e) => {
    const sheet = new Sheet();
    e.build(sheet);
    return { slug: e.slug, title: e.title, summary: e.summary, text: saveWorksheet(sheet.ws), sheet, symbolic: e.symbolic === true };
  });
}
