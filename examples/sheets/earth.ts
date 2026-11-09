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

import type { Example } from '../sheet.js';

/**
 * "The Blue Marble", taken by the Apollo 17 crew on 7 December 1972: a NASA photograph, in the public domain.
 * This is Wikimedia Commons' 330-pixel copy, kept in examples/assets so the sheet works offline.
 */
const SITE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/';
const FILE = 'The_Earth_seen_from_Apollo_17.jpg';
/** Its address, which the sheet builds from the parts above with concat, to fit the page. */
export const BLUE_MARBLE = `${SITE}${FILE}/330px-${FILE}`;

const fraction = (mask: string): string => `\\frac{\\mathrm{mean}\\left(${mask}\\right)}{\\mathrm{mean}\\left(\\mathrm{disc}\\right)}`;

export const earth: Example = {
  slug: 'earth',
  title: 'How cloudy is the Earth?',
  summary: 'A color photograph read from a web address, split into channels and hue, and sorted pixel by pixel into cloud, ocean and land.',
  build(s) {
    s.attach(BLUE_MARBLE, new URL('../assets/blue-marble-330.jpg', import.meta.url), 'image/jpeg');
    s.text('How cloudy is the Earth? On 7 December 1972 the crew of Apollo 17 photographed the whole Earth, lit from behind them: "The Blue Marble". NASA\'s photographs are in the public domain. Here MathMath reads the picture from the web and sorts its pixels into cloud, ocean and land.');
    s.section('Read it. Files → From a web address on the toolbar fetched this picture and keeps it in the worksheet, so readImage reads it by its address, built here in pieces to fit the page. A color picture is a matrix with its red, green and blue blocks side by side.', true);
    s.math(`\\mathrm{site}\\coloneq \\text{"${SITE}"}`);
    s.math(`\\mathrm{file}\\coloneq \\text{"${FILE}"}`);
    s.math('\\mathrm{address}\\coloneq \\mathrm{concat}\\left(\\mathrm{site},\\mathrm{file},\\text{"/330px-"},\\mathrm{file}\\right)');
    s.math('E\\coloneq \\mathrm{readImage}\\left(\\mathrm{address}\\right)');
    s.row('\\mathrm{rows}\\left(E\\right)=', '\\mathrm{cols}\\left(E\\right)=', 'k\\coloneq \\mathrm{imageChannels}\\left(E\\right)');
    s.row('\\mathrm{red}\\coloneq k_{0}', '\\mathrm{green}\\coloneq k_{1}', '\\mathrm{blue}\\coloneq k_{2}');
    s.images(
      { latex: 'E', color: true, size: 125, caption: 'The picture' },
      { latex: '\\mathrm{red}', size: 115, caption: 'Red: land and cloud bright, ocean dark' },
      { latex: '\\mathrm{blue}', size: 115, caption: 'Blue: the ocean shows up' },
    );

    s.section('Hue, saturation and value. Clouds are bright and nearly gray: high value, low saturation. The ocean is bluer than it is red.');
    s.row('h\\coloneq \\mathrm{imageChannels}\\left(\\mathrm{rgbToHsv}\\left(E\\right)\\right)', '\\mathrm{sat}\\coloneq h_{1}', '\\mathrm{val}\\coloneq h_{2}');
    s.text('Each test gives 1 where it holds and 0 where it doesn\'t, and the arrow applies it pixel by pixel, so each of these is a mask:');
    s.row(
      { latex: '\\mathrm{disc}\\coloneq \\overrightarrow{\\mathrm{val}\\ge 40}' },
      { latex: '\\mathrm{cloud}\\coloneq \\overrightarrow{\\left(\\mathrm{val}>185\\right)\\cdot \\left(\\mathrm{sat}<60\\right)}', x: 170 },
    );
    s.row(
      { latex: '\\mathrm{ocean}\\coloneq \\overrightarrow{\\mathrm{disc}\\cdot \\left(1-\\mathrm{cloud}\\right)\\cdot \\left(\\mathrm{blue}-\\mathrm{red}\\ge 15\\right)}' },
      { latex: '\\mathrm{land}\\coloneq \\mathrm{disc}-\\mathrm{cloud}-\\mathrm{ocean}', x: 330 },
    );

    s.section('The answer. Each mask\'s share of the Earth\'s disc:');
    s.row({ latex: `${fraction('\\mathrm{cloud}')}=` }, { latex: `${fraction('\\mathrm{ocean}')}=` }, { latex: `${fraction('\\mathrm{land}')}=` });
    s.text('About a third of the disc is cloud. Averaged over the year and the whole globe, satellites find about two thirds; this is one afternoon over Africa, and pixels near the edge stand for more of the surface than pixels at the center.');

    s.section('Pictures from masks. t paints each mask its own level, and joinChannels puts red, green and blue together into a map. Then two changes to the photograph itself.');
    s.row(
      { latex: 't\\left(c,l,o\\right)\\coloneq c\\cdot \\mathrm{cloud}+l\\cdot \\mathrm{land}+o\\cdot \\mathrm{ocean}' },
      { latex: '\\mathrm{map}\\coloneq \\mathrm{joinChannels}\\left(t\\left(255,180,30\\right),t\\left(255,130,80\\right),t\\left(255,70,200\\right)\\right)', x: 210 },
    );
    s.row(
      { latex: '\\mathrm{vivid}\\coloneq \\mathrm{hsvToRgb}\\left(\\mathrm{joinChannels}\\left(h_{0},\\mathrm{levels}\\left(h_{1},0,140\\right),h_{2}\\right)\\right)' },
      { latex: '\\mathrm{swapped}\\coloneq \\mathrm{joinChannels}\\left(\\mathrm{blue},\\mathrm{green},\\mathrm{red}\\right)', x: 300 },
    );
    s.images(
      { latex: '\\mathrm{map}', color: true, size: 125, caption: 'Cloud, ocean and land' },
      { latex: '\\mathrm{vivid}', color: true, size: 125, caption: 'Saturation stretched by levels' },
      { latex: '\\mathrm{swapped}', color: true, size: 125, caption: 'Red and blue swapped: an orange ocean' },
    );
    s.text('Try it: change 185 or 60 and watch the cloud share move. Or use Files → From a web address with another picture\'s address, and put that address in readImage.');
  },
};
