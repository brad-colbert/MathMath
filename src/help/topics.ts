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
        ['.', 'After a name: its literal subscript, as R.load or J0.sc'], [';', 'Range, as 0;10 for 0..10'],
        ['Space', 'Select more of the expression, a level at a time'], ['Tab', 'Next blank ■ to fill in'],
        ['Ctrl+G', 'Turn the letter before the caret into Greek, as w into ω, or G into Γ'], ['Ctrl+M', 'Matrix'],
        ['&', 'Definite integral'], ['?', 'Derivative'], ['Ctrl+Shift+?', 'Nth derivative'],
        ['Ctrl+Shift+4', 'Sum'], ['Ctrl+Shift+3', 'Product'], ['$', 'Sum over a range variable'], ['#', 'Product over a range variable'],
        ['Ctrl+.', 'Evaluate symbolically, →'], ['@', 'On empty paper: an X-Y plot'], ['"', 'On empty paper: a text region'],
        ['"', 'In math: a string, as "data.csv"; type it again to end the string'],
        [']', 'In a program: a new line'], ['{', 'In a program: local definition, ←'], ['}', 'In a program: if'],
        ['F1', 'Help on the function being typed'], ['Esc', 'Finish typing; with nothing open, stop a calculation'],
        ['Ctrl+Z, Ctrl+Y', 'Undo and redo'],
      ] },
      { p: '**Examples** on the toolbar opens worksheets that show what MathMath does, each a small problem worked on paper. Open one and change a number: everything below it follows.' },
      { p: 'Names are letters, digits and _, with digits anywhere after the first letter, as x2 or str2num; a name like R.load or J0.sc has a literal subscript, typed with `.`. Functions are called by name with their arguments in brackets, as `sin(x)`. A function of your own is defined like a variable: `f(x):x^2`, and a name you define takes the place of a built-in one with that name.' },
      { p: 'A number followed straight away by i or j is imaginary, as in Mathcad: `3+4i` or `2j`. (`4*i` is 4 times a variable named i.) See Complex numbers. Inside math, `"` starts a string, as "data.csv", and a second `"` ends it; the Strings group in the contents lists what works on them.' },
      { id: 'typing-2', example: ['f\\left(x\\right)\\coloneq x^{2}-1', 'f\\left(3\\right)='] },
      { h: 'On a phone or tablet' },
      { p: 'The page fits the screen\'s width; pinch, or + and − on the toolbar, to zoom, and Fit to fit it again. Tap the paper to start math there: a keypad opens with numbers and operators (123), functions, templates and units (f(x)), letters (abc) and Greek. Its bar has Next ■ for the next blank, → to evaluate symbolically, Done to finish, and ⏎ to finish and start new math below. Text uses the phone\'s own keyboard.' },
      { p: 'Touch and hold a region to select it, then drag it with a finger. ☰ on the toolbar shows every tool; ↶ and ↷ undo and redo.' },
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
      { p: 'Percent is a unit too, as in Mathcad: type `8.25%`, which is 0.0825. To show a result as a percentage, type % in its unit blank.' },
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
      { p: 'To find values in an array, [[lookup]], [[hlookup]], [[vlookup]] and [[match]] compare numbers within TOL, the worksheet\'s tolerance, and strings exactly.' },
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
      { p: '**Surface** and **contour** plots draw a matrix of heights, a function of two variables, or three matrices X, Y and Z. Drag a surface to turn it. [[CreateMesh]] makes the three matrices from a function of two parameters, as a torus or a sphere, and [[CreateSpace]] makes three vectors from a function of one, which the surface plot draws as a curve in space. [[sph2xyz]], [[cyl2xyz]] and the other conversions change coordinates; [[logspace]] and [[logpts]] give points for a log axis.' },
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
      { p: 'The exact answers come from Giac, a computer algebra system by Bernard Parisse and others, which runs in your browser beside MathMath. It is free software under the GNU General Public License; About MathMath links to its source code.' },
    ],
  },
  {
    id: 'complex', title: 'Complex numbers', summary: 'Typing imaginary numbers, the functions that take them, and showing them as magnitude∠angle.',
    body: [
      { p: 'A number followed straight away by i or j is imaginary: `3+4i`, `2j`. Complex numbers add, multiply and divide as numbers do, and carry units.' },
      { id: 'complex-1', example: ['z\\coloneq 3+4\\mathrm{i}', '\\left|z\\right|=', '\\mathrm{arg}\\left(z\\right)=', 'z^{2}='] },
      { p: 'The elementary functions take complex numbers: [[exp]], [[sin]], [[cos]], [[tan]], [[ln]] and the rest, so a phasor is exp(j·ω·t). Outside the real domain the inverse functions give complex answers, as [[asin]](2) or [[acosh]](0.5), and on a branch cut each takes the same side as Mathcad 14: asin(2) is π/2 − 1.317i.' },
      { id: 'complex-2', example: ['\\mathrm{exp}\\left(1\\mathrm{i}\\cdot \\frac{\\pi }{3}\\right)=', '\\mathrm{asin}\\left(2\\right)='] },
      { p: '[[Re]], [[Im]], [[arg]], [[csgn]] and [[signum]] take a complex number apart. Format on the toolbar has Complex results as magnitude∠angle, which shows the selected results as phasors, with the angle in degrees.' },
    ],
  },
  {
    id: 'fitting', title: 'Curve fitting', summary: 'Straight lines, polynomials, combinations of functions and nonlinear models fitted to data, and smoothing.',
    body: [
      { p: 'Each fit takes the data as two vectors, x and y, and finds the parameters that make the sum of the squared differences in y as small as it can, as Mathcad\'s do.' },
      { p: 'A straight line: [[slope]], [[intercept]] and [[line]], with [[stderr]] for how far the points lie from it, and [[medfit]] for a line a few wild points can\'t pull. A polynomial, in one variable or several: [[regress]], evaluated with [[interp]]. Any combination of functions: [[linfit]]. A model of your own: [[genfit]]. Common shapes, each from a guess: [[expfit]], [[lgsfit]], [[logfit]], [[lnfit]], [[pwrfit]] and [[sinfit]]. [[predict]] extends a series past its end.' },
      { id: 'fitting-1', example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', '\\mathrm{line}\\left(x,y\\right)=', '\\mathrm{interp}\\left(\\mathrm{regress}\\left(x,y,2\\right),x,y,2.5\\right)='] },
      { p: 'The fits take numbers without units, apart from slope, intercept and stderr. Divide by [[SIUnitsOf]] to strip units, and multiply by it to put them back. loess isn\'t in MathMath yet.' },
      { p: 'To smooth noisy data rather than fit a model to it: [[medsmooth]], a running median; [[ksmooth]], a Gaussian-weighted average with a bandwidth you choose; and [[supsmooth]], Friedman\'s super smoother, which chooses its own span at each point.' },
      { id: 'fitting-2', example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\\\6\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\3.2\\\\5.8\\\\5.1\\\\7.2\\end{pmatrix}', '\\mathrm{ksmooth}\\left(x,y,2\\right)=', '\\mathrm{supsmooth}\\left(x,y\\right)='] },
    ],
  },
  {
    id: 'special', title: 'Special functions', summary: 'Γ, Bessel, Airy and Kelvin functions, orthogonal polynomials and hypergeometric functions.',
    body: [
      { p: 'Type Γ as G then Ctrl+G: [[Γ]](z) and the incomplete Γ(a, x), with [[lnΓ]] for when Γ is too large. The polynomials [[Her]], [[Tcheb]], [[Ucheb]], [[Lag]], [[Leg]] and [[Jac]] take a whole-number degree; [[fhyper]] and [[mhyper]] are the hypergeometric functions.' },
      { p: 'The Bessel functions take any real order, fractional or negative: [[J0]], [[Jn]], [[Y0]], [[Yn]], [[I0]], [[In]], [[K0]], [[Kn]], the Hankel functions [[H1]] and [[H2]], the Airy functions [[Ai]] and [[Bi]], the Kelvin functions [[ber]] and [[bei]], and the spherical [[js]] and [[ys]]. Each Bessel and Airy function has a scaled form, typed with .sc, as J0.sc: it stays in range where the plain one would overflow, as I0.sc(1000).' },
      { id: 'special-1', example: ['J0\\left(2.4048\\right)=', '\\mathrm{Jn}\\left(0.5,3\\right)=', '\\Gamma\\left(0.5\\right)^{2}='] },
      { p: 'The Bessel and Airy functions take complex arguments as well as real ones, as Mathcad\'s do, and the spherical js and ys too; the order stays real. At a negative real argument a fractional order gives a complex answer, as it should: Mathcad 14 keeps only the real part there. Only ber and bei need a real argument, as in Mathcad. Far out, beyond |z| of about 10⁹, Mathcad 14 gives up on J, Y and the Hankel functions; MathMath still gives their values.' },
      { id: 'special-2', example: ['J0\\left(1+1\\mathrm{i}\\right)=', '\\mathrm{Kn}\\left(0.5,2+1\\mathrm{i}\\right)=', '\\mathrm{Ai}\\left(-2+1\\mathrm{i}\\right)='] },
    ],
  },
  {
    id: 'finance', title: 'Finance', summary: 'Loans, savings and investments: payments, present and future values, rates and returns.',
    body: [
      { p: 'The finance functions are Mathcad\'s, which follow the spreadsheet conventions. Money paid out is negative and money received positive: a loan of 200 000 received now is a pv of 200000, and its payments come back negative. A rate is per period, so for monthly payments divide a yearly rate by 12; it can be written as a percentage, as 8%.' },
      { id: 'finance-1', example: ['r\\coloneq \\frac{6.5\\%}{12}', '\\mathrm{pmt}\\left(r,360,300000\\right)=', '\\mathrm{cumint}\\left(r,360,300000,1,12\\right)='] },
      { p: 'An annuity has five quantities, each from the other four: [[pmt]], [[pv]], [[fv]], [[nper]] and [[rate]]. Each payment splits into interest, [[ipmt]], and principal, [[ppmt]], and [[cumint]] and [[cumprn]] add them over a run of periods. Payments come at the end of each period unless the last argument, type, is 1.' },
      { p: 'For a series of cash flows, one a period in a column vector: [[npv]], the net present value, [[irr]], the internal rate of return, [[mirr]], and [[fvc]], the future value. [[npv]] discounts the first flow by one period, as Mathcad\'s does. [[eff]] and [[nom]] convert between nominal and effective yearly rates; [[cnper]], [[crate]] and [[fvadj]] are for a sum growing without payments.' },
      { id: 'finance-2', example: ['c\\coloneq \\begin{pmatrix}-1000\\\\300\\\\400\\\\500\\end{pmatrix}', '\\mathrm{irr}\\left(c\\right)=', '\\mathrm{npv}\\left(8\\%,c\\right)='] },
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
