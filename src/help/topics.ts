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

import type { Topic } from './types.js';

const P = (...lines: string[]): string => `\\begin{array}{|l}${lines.join('\\\\')}\\end{array}`;

export const TOPICS: Topic[] = [
  {
    id: 'typing', title: 'Typing math', summary: 'Regions, definitions, results and the keys that build math.',
    body: [
      { p: 'A worksheet is a page of regions. Click on the paper where a region should go, and type. Math calculates from the top of the page down, and from left to right along a line, so a name must be defined above or to the left of where it\'s used.' },
      { p: 'Type `:` for the definition sign :=, and `=` after an expression to see its value. Press Enter or Esc, or click elsewhere, to finish. Type `"` on empty paper to start a text region instead.' },
      { id: 'typing-1', example: ['a\\coloneq 3', 'b\\coloneq a^{2}+1', 'b='] },
      { h: 'Keys' },
      { keys: [
        [':', 'Definition, :='], ['=', 'Show the value'], ['*', 'Multiply, ·'], ['/', 'Fraction'], ['^', 'Power'],
        ['(', 'Brackets, closed for you; `)` steps out of them'], ['[', 'Subscript: an array element, as v[2 for v₂'],
        ['.', 'After a letter: a name\'s literal subscript, as R.load'], [';', 'Range, as 0;10 for 0..10'],
        ['Space', 'Select more of the expression, a level at a time'], ['Tab', 'Next blank ■ to fill in'],
        ['Ctrl+G', 'Turn the letter before the caret into Greek, as w into ω'], ['Ctrl+M', 'Matrix'],
        ['&', 'Definite integral'], ['?', 'Derivative'], ['Ctrl+Shift+?', 'Nth derivative'],
        ['Ctrl+Shift+4', 'Sum'], ['Ctrl+Shift+3', 'Product'], ['$', 'Sum over a range variable'], ['#', 'Product over a range variable'],
        ['Ctrl+.', 'Evaluate symbolically, →'], ['@', 'On empty paper: an X-Y plot'], ['"', 'On empty paper: a text region'],
        [']', 'In a program: a new line'], ['{', 'In a program: local definition, ←'], ['}', 'In a program: if'],
        ['F1', 'Help on the function being typed'], ['Esc', 'Finish typing; with nothing open, stop a calculation'],
        ['Ctrl+Z, Ctrl+Y', 'Undo and redo'],
      ] },
      { p: 'Names are letters, digits and _; a name like R.load has a literal subscript. Functions are called by name with their arguments in brackets, as `sin(x)`. A function of your own is defined like a variable: `f(x):x^2`.' },
      { id: 'typing-2', example: ['f\\left(x\\right)\\coloneq x^{2}-1', 'f\\left(3\\right)='] },
      { p: 'The LIVE button at the right of the toolbar switches to EDIT, which stops calculating; results gray as they go out of date, and LIVE brings them up to date.' },
    ],
  },
  {
    id: 'units', title: 'Units', summary: 'Values with units, checked as they combine, and shown in the units you choose.',
    body: [
      { p: 'Multiply a number by a unit, as `5*kg` or `3*m/s`. Units combine and cancel as you calculate, and adding values in different dimensions, as metres and seconds, is refused.' },
      { id: 'units-1', example: ['d\\coloneq 100\\cdot \\mathrm{m}', 't\\coloneq 9.58\\cdot \\mathrm{s}', '\\frac{d}{t}='] },
      { p: 'A result shows in SI units, with a blank after it: click the blank and type a unit, as `km/hr`, to show the result in that unit instead. A unit you choose stays with the region.' },
      { p: 'Some units have typing shortcuts, since the editor has no Ω or μ key: `kohm`, `Mohm` and `ohm` for kΩ, MΩ and Ω; u for micro, as `uF`, `uA` and `us`; `Omega` alone for Ω.' },
      { p: 'Angles are in radians; `deg` is a unit, so `30*deg` is π/6. Temperatures convert with [[°C]] and [[°F]].' },
    ],
  },
  {
    id: 'arrays', title: 'Ranges, vectors and matrices', summary: 'Range variables, subscripts, and arrays of numbers.',
    body: [
      { p: 'A range variable takes a run of values: type `k:0;4` for k := 0..4, or `x:0,0.1;1` for steps of 0.1. Anything using it is worked out for each value, which makes tables and plots.' },
      { p: 'An element of a vector or matrix is a subscript, typed with `[`: v₂, or M₁,₀ for row 1, column 0. Arrays count from 0. Defining v_k for a range k builds a vector.' },
      { id: 'arrays-1', example: ['k\\coloneq 0..4', 'v_{k}\\coloneq k^{2}', 'v='] },
      { p: 'Ctrl+M inserts a matrix, and the Matrix menu has its operators: transpose (Ctrl+1), a column (Ctrl+6), vectorize (Ctrl+−), and rows or columns added. Arrays multiply as matrices; the Vectors and matrices and Linear algebra groups in the contents list their functions.' },
      { id: 'arrays-2', example: ['M\\coloneq \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', 'M\\cdot M=', 'M^{-1}='] },
    ],
  },
  {
    id: 'plots', title: 'Plots', summary: 'X-Y, polar, Smith chart, surface and contour plots, and their formats.',
    body: [
      { p: 'Click on empty paper and type `@`, or use Plot on the toolbar. Fill the blank below with the x expression, usually a range variable, and the blank at the left with what to plot. Several traces go at the left separated by commas. Limits typed at the ends of an axis fix its range.' },
      { id: 'plots-1', example: ['x\\coloneq 0,0.1..6.3', 'y\\left(x\\right)\\coloneq \\sin \\left(x\\right)'] },
      { p: 'Select a plot and choose from Format: log axes, points instead of lines, axis and plot titles, and the kind of plot.' },
      { p: '**Polar plot**: x is the angle, in radians, and each trace a radius.' },
      { p: '**Smith chart**: each trace is complex reflection coefficients Γ, as [[zToGamma]] gives them. The x blank, if filled, is what Γ is swept over, as frequency.' },
      { p: '**Surface** and **contour** plots draw a matrix of heights, a function of two variables, or three matrices X, Y and Z. Drag a surface to turn it.' },
      { p: 'Trace styles… in Format sets each trace\'s color, line, weight and points. Hover over a plot to read the point under the pointer.' },
    ],
  },
  {
    id: 'random', title: 'Random numbers', summary: 'Random draws that stay put, and New random numbers to draw again.',
    body: [
      { p: '[[rnd]], [[runif]], [[rnorm]] and the other r functions draw random numbers: [[rbinom]], [[rpois]], [[rexp]], [[rgamma]] and one for each distribution. Each function gives its own vector of draws.' },
      { p: 'A worksheet\'s draws stay the same each time it calculates, so results don\'t jump about while you edit, and a saved sheet opens with the numbers it had. They come from the worksheet\'s seed. **Reroll** on the toolbar picks a new seed and draws everything again; undo goes back to the old numbers. A Mathcad worksheet brings its own seed with it.' },
      { id: 'random-1', example: ['\\mathrm{dbinom}\\left(3,10,0.3\\right)=', '\\mathrm{pnorm}\\left(1.96,0,1\\right)=', '\\mathrm{qnorm}\\left(0.975,0,1\\right)='] },
      { p: 'Each distribution has four functions: d for the density or probability, p for the cumulative probability, q for its inverse and r for random numbers, as dnorm, pnorm, qnorm and rnorm. The Probability distributions group in the contents lists them all.' },
    ],
  },
  {
    id: 'solve-blocks', title: 'Solve blocks', summary: 'Given, then constraints, then Find, Minerr, Maximize, Minimize or Odesolve.',
    body: [
      { p: 'Define a guess for each unknown, then a region `Given`. Below it, type the constraints: equations with =, and inequalities. End with [[Find]], [[Minerr]], [[Maximize]], [[Minimize]] or [[Odesolve]], which solves them.' },
      { id: 'solve-1', example: ['x\\coloneq 1', 'y\\coloneq 1', '\\mathrm{Given}', 'x^2+y^2=25', 'x-y=1', '\\mathrm{Find}\\left(x,y\\right)='] },
      { p: '[[root]] finds one zero of an expression without a block, and [[polyroots]] all the roots of a polynomial.' },
    ],
  },
  {
    id: 'programs', title: 'Programs', summary: 'Several lines of steps: local definitions, if, for, while and return.',
    body: [
      { p: 'A program is a definition whose value is worked out by steps. Type `]` to start one, and again for each new line; the value is the last line\'s. Inside, `{` makes a local definition ←, which lasts only inside the program.' },
      { p: 'The toolbar has if, otherwise, for, while and return. `}` types if, which applies to the line it ends.' },
      { id: 'programs-1', example: [`f\\left(n\\right)\\coloneq ${P('s\\gets 0', `\\mathbf{for}\\ i\\in 1..n\\ ${P('s\\gets s+i')}`, 's')}`, 'f\\left(10\\right)='] },
    ],
  },
  {
    id: 'symbolic', title: 'Symbolic evaluation', summary: 'Exact answers with →, and keywords that simplify, solve, expand and transform.',
    body: [
      { p: 'Type an expression and press Ctrl+. for →: the answer is exact, with letters that have no value kept as symbols. A keyword before → says what to do: choose one from Keywords on the toolbar.' },
      { p: 'Keywords: [[simplify]], [[expand]], [[factor]], [[float]], [[solve]], [[collect]], [[coeffs]], [[series]], [[substitute]], [[parfrac]], [[assume]], [[laplace]], [[invlaplace]], [[ztrans]] and [[invztrans]].' },
    ],
  },
  {
    id: 'files', title: 'Files and images', summary: 'Attaching files, reading images and tables, and showing a matrix as a picture.',
    body: [
      { p: 'A worksheet carries the files it reads. Use Files on the toolbar to attach one: an image adds a [[readImage]] line, and other files are read by name with [[readTable]] or [[readWav]]. The files are saved inside the worksheet.' },
      { p: 'Image on the toolbar shows a matrix as a picture: gray levels 0 to 255, or red, green and blue side by side. Picture… puts a picture from a file on the page, as it is.' },
      { p: 'Save writes a .mathmath file. Open reads those and Mathcad .xmcd worksheets.' },
    ],
  },
];
