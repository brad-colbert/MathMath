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
      { p: 'Type `:` for the definition sign :=, and `=` after an expression to see its value. Press Enter or Esc, or click elsewhere, to finish. Type `"` on empty paper to start a text region instead. Format → Heading, Subheading, Bold text, Italic text, Larger or Smaller text and Text color… style the selected text regions, or the one being typed in, each as a whole; Plain text puts one back.' },
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
        ['Ctrl+Shift+7, Ctrl+Shift+6', 'And ∧, or ∨'], ['Ctrl+Shift+5, Ctrl+Shift+1', 'Exclusive or ⊕, not ¬'],
        ['Ctrl+0', 'Greater than or equal, ≥; the Boolean menu has ≤ and ≠ too'],
        ['Ctrl+.', 'Evaluate symbolically, →'], ['@', 'On empty paper: an X-Y plot'], ['"', 'On empty paper: a text region'],
        ['"', 'In math: a string, as "data.csv"; type it again to end the string'],
        [']', 'In a program: a new line'], ['{', 'In a program: local definition, ←'], ['}', 'In a program: if'],
        ['F1', 'Help on the function being typed'], ['Esc', 'Finish typing; with nothing open, stop a calculation'],
        ['Ctrl+Z, Ctrl+Y', 'Undo and redo'],
      ] },
      { p: '**Page** on the toolbar sets the paper, Letter, Legal or A4, and portrait or landscape. The dashed lines across the paper are where pages break, and Print prints on that paper. New worksheets start on the paper you last chose in this browser.' },
      { p: '**Examples** on the toolbar opens worksheets that show what MathMath does, each a small problem worked on paper. Open one and change a number: everything below it follows.' },
      { p: 'Names are letters, digits and _, with digits anywhere after the first letter, as x2 or str2num; a name like R.load or J0.sc has a literal subscript, typed with `.`. A single letter can wear a hat or an arrow, as î, from the ∇ menu; see Vector calculus. Functions are called by name with their arguments in brackets, as `sin(x)`. A function of your own is defined like a variable: `f(x):x^2`, and a name you define takes the place of a built-in one with that name.' },
      { p: 'A number followed straight away by i or j is imaginary: `3+4i` or `2j`. (`4*i` is 4 times a variable named i.) See Complex numbers. Inside math, `"` starts a string, as "data.csv", and a second `"` ends it; the Strings group in the contents lists what works on them.' },
      { p: 'Comparisons and logic give 1 for true and 0 for false. Type < and > as themselves; the Boolean menu on the toolbar has ≤, ≥, ≠, ¬, ∧, ∨ and ⊕, with their keys. Comparisons bind before ∧, and ∧ before ∨ and ⊕, so x > 1 ∧ x < 5 needs no brackets.' },
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
      { p: 'Percent is a unit too: type `8.25%`, which is 0.0825. To show a result as a percentage, type % in its unit blank.' },
      { p: 'Three formats read and show values as people write them. [[FIF]] reads a length in feet, inches and fractions, as `FIF("9\' 6-1/4\\"")`, and FIF typed in a length\'s unit blank shows it that way. [[hhmmss]] does the same for times, as "1:02:03.5", and [[DMS]] for angles in degrees, minutes and seconds. The gallery\'s staircase example uses all three.' },
    ],
  },
  {
    id: 'arrays', title: 'Ranges, vectors and matrices', summary: 'Range variables, subscripts, and arrays of numbers.',
    body: [
      { p: 'A range variable takes a run of values: type `k:0;4` for k := 0..4, or `x:0,0.1;1` for steps of 0.1. Anything using it is worked out for each value, which makes tables and plots.' },
      { p: 'An element of a vector or matrix is a subscript, typed with `[`: v₂, or M₁,₀ for row 1, column 0. Arrays count from 0. Defining v_k for a range k builds a vector.' },
      { p: 'Arrays count from ORIGIN, 0 unless the worksheet says otherwise. Define ORIGIN := 1 to count from 1 from there down; it must be a whole number. TOL, the tolerance [[root]] and the lookups use, and CTOL, how near a solve block\'s constraints must hold, are defined the same way. A function keeps the ORIGIN, TOL and CTOL where it was defined, wherever it\'s called. ORIGIN ≡ 1, a global definition, holds over the whole sheet.' },
      { p: 'An array can have up to 10 million elements, or 1 million when it holds strings, arrays, or values in different units. Range variables can give a region up to 10 million values at once, as i and j of 3000 values each would give 9 million, and a string can have up to 10 million characters. Past those, the region says so at once, rather than filling the page\'s memory. A sum over a range keeps nothing, so it isn\'t limited: a long one is only slow, and Esc stops it.' },
      { id: 'arrays-1', example: ['k\\coloneq 0..4', 'v_{k}\\coloneq k^{2}', 'v='] },
      { p: 'To stop such a definition early, at the first k where a condition turns negative, use [[until]]: x_k := until(c, e). In a recurrence, as w_(k+1) := until(100 − w_k, 2·w_k), it runs until the values pass a limit.' },
      { p: 'Ctrl+M inserts a matrix, and the Matrix menu has its operators: transpose (Ctrl+1), a column (Ctrl+6), vectorize (Ctrl+−), and rows or columns added. Arrays multiply as matrices; the Vectors and matrices and Linear algebra groups in the contents list their functions.' },
      { id: 'arrays-2', example: ['M\\coloneq \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', 'M\\cdot M=', 'M^{-1}='] },
      { p: 'To find values in an array, [[lookup]], [[hlookup]], [[vlookup]] and [[match]] compare numbers within TOL, the worksheet\'s tolerance, and strings exactly.' },
      { p: 'The eigenvalue and decomposition functions find their answers by LAPACK\'s methods, which settle the order of eigenvalues and the signs of vectors: [[eigenvals]] and [[eigenvecs]] for A·x = λ·x, [[genvals]] and [[genvecs]] for M·x = λ·N·x, as in vibration, and [[svd2]] for the singular value decomposition. The gallery\'s building-sway example uses them.' },
    ],
  },
  {
    id: 'plots', title: 'Plots', summary: 'X-Y, polar, Smith chart, surface, contour and vector field plots, and their formats.',
    body: [
      { p: 'Click on empty paper and type `@`, or use Plot on the toolbar. Fill the blank below with the x expression, usually a range variable, and the blank at the left with what to plot. Several traces go at the left separated by commas. Limits typed at the ends of an axis fix its range.' },
      { id: 'plots-1', example: ['x\\coloneq 0,0.1..6.3', 'y\\left(x\\right)\\coloneq \\sin \\left(x\\right)'] },
      { p: 'Select a plot and choose from Format: log axes, points instead of lines, axis and plot titles, and the kind of plot.' },
      { p: '**Polar plot**: x is the angle, in radians, and each trace a radius.' },
      { p: '**Smith chart**: each trace is complex reflection coefficients Γ, as [[zToGamma]] gives them. The x blank, if filled, is what Γ is swept over, as frequency.' },
      { p: '**Surface** and **contour** plots draw a matrix of heights, a function of two variables, or three matrices X, Y and Z. Drag a surface to turn it. [[CreateMesh]] makes the three matrices from a function of two parameters, as a torus or a sphere, and [[CreateSpace]] makes three vectors from a function of one, which the surface plot draws as a curve in space. [[sph2xyz]], [[cyl2xyz]] and the other conversions change coordinates; [[logspace]] and [[logpts]] give points for a log axis. [[PolyLookup]] gives the names and Wythoff symbols of the 80 uniform polyhedra, by number, and [[Polyhedron]] draws any of them, or its dual, solid in a surface plot: put Polyhedron("snub cube") or Polyhedron("#34") in the plot\'s placeholder, and drag to turn it. A colour map gives each kind of face its own colour.' },
      { p: 'A surface plot draws **several things in one box**: type them at the left separated by commas, as traces. After the first come more surfaces, curves from [[CreateSpace]], a marked point typed as a vector of three numbers (x, y, z), and arrows from a vector of six arrays (X, Y, Z, U, V, W), as a vector field plot takes them, or six numbers for a single arrow, drawn as long as it is. All are drawn back to front together, so a hill hides what is behind it, and dragging turns them as one. Trace styles… sets the color, weight and points of each one after the first; points instead of a line turn a curve into scattered points. One that can\'t be drawn says why at the bottom of the plot, and the rest still draw. Format → Contour lines below a surface draws the first surface\'s contours on the floor of the box, colored by level.' },
      { id: 'plots-3', example: ['f\\left(x,y\\right)\\coloneq x\\cdot e^{-x^{2}-y^{2}}', 'P\\coloneq \\begin{pmatrix}-0.7\\\\0\\\\f\\left(-0.7,0\\right)\\end{pmatrix}'] },
      { p: 'A **vector field plot** (Format → Vector field plot) draws an arrow at each point, its length in proportion, the longest reaching the next point. It takes a matrix of complex numbers, the real part across and the imaginary part up, with row i at x = i and column j at y = j, counted from ORIGIN; or two matrices of the same size, the parts across and up, typed X, Y with a comma as two traces are. Units are dropped. MathMath also takes a function of x and y giving two parts, or a complex number, sampled 15 points a side over the limits below the plot, −5 to 5 unless set; and arrows in space from six arrays X, Y, Z, U, V, W, the points and then the arrows\' parts, drawn in a box that turns when dragged, the longest arrow as long as the points are typically apart. Arrows are dark; a colour map from Format → Color map… colors each by its length, and ink puts them back. A matrix over 40 rows or columns draws every second, third… row and column, and says so above the plot; arrows in space are limited to 4,000. Unlike the reference, x and y are drawn to one scale, so each arrow points the way its vector does.' },
      { id: 'plots-2', example: ['F\\left(x,y\\right)\\coloneq \\begin{pmatrix}-y\\\\x\\end{pmatrix}', 'f\\left(i,j\\right)\\coloneq \\left(i-3\\right)+\\left(j-3\\right)\\cdot 1i', 'M\\coloneq \\mathrm{matrix}\\left(7,7,f\\right)'] },
      { p: 'Trace styles… in Format sets each trace\'s color, line, weight and points. Hover over a plot to read the point under the pointer.' },
      { p: 'A surface or contour plot colors its heights by a **colour map**, light to dark blue unless Format → Color map… chooses another: gray, spectrum, viridis or heat, a map saved in the sheet with [[SaveColormap]], or an attached Mathcad .cmp file. [[LoadColormap]] gives a map\'s colours as a matrix, to change and save again.' },
    ],
  },
  {
    id: 'random', title: 'Random numbers', summary: 'Random draws that stay put, and New random numbers to draw again.',
    body: [
      { p: '[[rnd]], [[runif]], [[rnorm]] and the other r functions draw random numbers: [[rbinom]], [[rpois]], [[rexp]], [[rgamma]] and one for each distribution. Each function gives its own vector of draws.' },
      { p: 'A worksheet\'s draws stay the same each time it calculates, so results don\'t jump about while you edit, and a saved sheet opens with the numbers it had. They come from the worksheet\'s seed. **Reroll** on the toolbar picks a new seed and draws everything again, apart from numbers below a [[Seed]], which come from its seed; undo goes back to the old numbers. An imported worksheet brings its own seed with it.' },
      { id: 'random-1', example: ['\\mathrm{dbinom}\\left(3,10,0.3\\right)=', '\\mathrm{pnorm}\\left(1.96,0,1\\right)=', '\\mathrm{qnorm}\\left(0.975,0,1\\right)='] },
      { p: 'To draw the same numbers again within a sheet, as to repeat an experiment, use [[Seed]]: after Seed(x), the regions below draw one after another from a stream started at x, and Seed(x) again starts it over.' },
      { p: 'Each distribution has four functions: d for the density or probability, p for the cumulative probability, q for its inverse and r for random numbers, as dnorm, pnorm, qnorm and rnorm. The Probability distributions group in the contents lists them all. Beside the seventeen classic families, MathMath has eight more: [[dgumbel]] for extremes, [[dlaplace]], [[dmaxwell]] for molecular speeds, [[dpareto]], [[drayleigh]] and [[drice]] for amplitudes in noise, [[dtri]] from a least, most and likeliest value, and [[dvonmises]] for angles.' },
      { id: 'random-2', example: ['\\mathrm{prayleigh}\\left(2,1\\right)=', '\\mathrm{qgumbel}\\left(0.99,10,2\\right)=', '\\mathrm{dvonmises}\\left(0.5,0,2\\right)='] },
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
    id: 'odes', title: 'Differential equations', summary: 'Solvers for initial-value problems, linear systems, boundary values, partial differential equations, and the Jacobian the stiff solvers take.',
    body: [
      { p: 'Write the equations as a vector of first derivatives, D(x, y), with y a vector: y₀′ = y₁ and y₁′ = −y₀ is D(x, y) := (y₁; −y₀). [[rkfixed]] solves from starting values in equal steps, [[Rkadapt]] and [[Bulstoer]] choose their steps, and [[Stiffb]], [[Stiffr]], [[Radau]] and [[BDF]] handle stiff systems. Each gives a table: x in the first column, then each y. A solve block with [[Odesolve]] takes the equations as written instead.' },
      { id: 'odes-1', example: ['D\\left(x,y\\right)\\coloneq \\begin{pmatrix}y_{1}\\\\-y_{0}\\end{pmatrix}', 'Y\\coloneq \\mathrm{rkfixed}\\left(\\begin{pmatrix}0\\\\1\\end{pmatrix},0,\\frac{\\pi }{2},10,D\\right)', 'Y_{10,1}='] },
      { p: 'A linear system x′ = A(t)·x + B(t)·u(t) goes straight to [[statespace]], with A, B and u as functions of t.' },
      { p: 'When some conditions are at the far end, as a beam fixed at both ends, [[sbval]] finds the starting values that meet them, by shooting: it solves again and again, adjusting the unknown starting values until the far conditions hold. [[bvalfit]] shoots from both ends to meet in between, for equations that jump there. Pass the starting values to any solver for the whole solution.' },
      { p: 'The stiff solvers want the Jacobian of D: [[Jacob]] works it out from D itself, as J(x, y) := augment(∂D/∂x, Jacob(D(x, y), y)).' },
      { p: 'Partial differential equations in one space dimension and time, as heat flowing along a rod, go to [[Pdesolve]] in a solve block, written as equations, u.t(x, t) = u.xx(x, t), with the subscripts typed after a . so they read as literal subscripts; or to [[numol]] as functions. Both use the method of lines. Poisson\'s and Laplace\'s equations on a square, as a plate\'s temperature, go to [[relax]] or [[multigrid]].' },
      { id: 'odes-2', example: ['\\mathrm{Given}', 'u_{\\text{t}}\\left(x,t\\right)=u_{\\text{xx}}\\left(x,t\\right)', 'u\\left(x,0\\right)=\\sin \\left(\\pi \\cdot x\\right)', 'u\\left(0,t\\right)=0', 'u\\left(1,t\\right)=0', 'u\\coloneq \\mathrm{Pdesolve}\\left(u,x,\\begin{pmatrix}0\\\\1\\end{pmatrix},t,\\begin{pmatrix}0\\\\0.1\\end{pmatrix},21,11\\right)', 'u\\left(0.5,0.1\\right)='] },
    ],
  },
  {
    id: 'vector-calculus', title: 'Vector calculus', summary: 'Partial derivatives ∂/∂x, the gradient ∇f, divergence ∇·F, curl ∇×F and Laplacian ∇²f, and unit vectors î, ĵ and k̂.',
    body: [
      { p: 'The ∇ menu on the toolbar has each of these. ∇ goes before a function and its arguments, as ∇f(x, y, z): it differentiates f in each of its parameters in turn, holding the others fixed, at the point the arguments give. So ∇f(1, 2, 0.5) is the gradient at (1, 2, 0.5), and E(x, y, z) := −∇V(x, y, z) defines a field from a potential.' },
      { id: 'vector-calculus-1', example: ['f\\left(x,y,z\\right)\\coloneq x^{2}\\cdot y+\\sin \\left(z\\right)', '\\nabla f\\left(1,2,0.5\\right)=', '\\nabla^{2}f\\left(1,2,0.5\\right)='] },
      { p: '∇f, the gradient, is the vector of partial derivatives, and points the way f increases fastest. ∇²f, the Laplacian, adds up the second partial derivatives; of a vector, it\'s taken part by part. f must give a number for ∇f.' },
      { p: '∇·F, the divergence, and ∇×F, the curl, take a vector field: F gives a vector with a part for each of its arguments. ∇·F is the net outflow at a point, and ∇×F the axis and rate of the turning there. The curl is for fields in 3 variables; in 2, ∇×F is the number ∂F₁/∂x − ∂F₀/∂y, the turning about the axis out of the plane. The parts are counted from the first whatever ORIGIN is.' },
      { id: 'vector-calculus-2', example: ['F\\left(x,y,z\\right)\\coloneq \\begin{pmatrix}x\\cdot y\\\\y\\cdot z^{2}\\\\\\sin \\left(x\\right)\\end{pmatrix}', '\\nabla \\cdot F\\left(1,2,0.5\\right)=', '\\nabla \\times F\\left(1,2,0.5\\right)='] },
      { p: 'They work numerically, by the differences d/dx uses, so answers are good to about 7 digits, and the Laplacian to about 5. Units carry through: the gradient of a potential in volts, at a point in metres, is in volts per metre. With →, each works exactly when the arguments are names, as ∇f(x, y, z) →, even names with values on the sheet.' },
      { h: 'Partial derivatives' },
      { p: '∂/∂x works as d/dx does, at x\'s value, and only looks different: a derivative holds every other variable fixed anyway. ∂ⁿ/∂xⁿ is the nth. Two first partial derivatives in a row, in different variables, show as one, ∂²/∂x∂y.' },
      { id: 'vector-calculus-3', example: ['x\\coloneq 1', 'y\\coloneq 2', '\\frac{\\partial}{\\partial x}\\left(x^{2}\\cdot y\\right)=', '\\frac{\\partial^{2}}{\\partial x\\,\\partial y}\\left(x^{2}\\cdot y\\right)='] },
      { h: 'Unit vectors and marked names' },
      { p: 'A hat or an arrow over a letter is part of its name, as n̂, or v with an arrow for a vector. î, ĵ and k̂ are the unit vectors along x, y and z, (1, 0, 0), (0, 1, 0) and (0, 0, 1), unless the worksheet defines them. The arrow over a name is not the vectorize arrow over an expression in the Matrix menu.' },
      { id: 'vector-calculus-4', example: ['\\vec{v}\\coloneq 3\\cdot \\hat{\\imath}+2\\cdot \\hat{\\jmath}-\\hat{k}', '\\vec{v}=', '\\hat{\\imath}\\times \\hat{\\jmath}=', '\\left|\\vec{v}\\right|='] },
    ],
  },
  {
    id: 'programs', title: 'Programs', summary: 'Several lines of steps: local definitions, if, for, while and return.',
    body: [
      { p: 'A program is a definition whose value is worked out by steps. Type `]` to start one, and again for each new line; the value is the last line\'s. Inside, `{` makes a local definition ←, which lasts only inside the program.' },
      { p: 'The toolbar has if, otherwise, for, while and return. `}` types if, which applies to the line it ends.' },
      { p: 'A for or while loop comes with its body: a program of its own, under the loop\'s line. Tab moves into it. `]` in the body adds a line to the loop; `]` on the loop\'s own line adds a line after the loop.' },
      { p: 'To follow what a program does, [[trace]] prints a line under the region each time it runs, as trace("i = {0}, s = {1}", i, s), and gives 0. [[pause]] prints the same way; in the reference it also stops to wait.' },
      { id: 'programs-1', example: [`f\\left(n\\right)\\coloneq ${P('s\\gets 0', `\\mathbf{for}\\ i\\in 1..n\\ ${P('s\\gets s+i')}`, 's')}`, 'f\\left(10\\right)='] },
    ],
  },
  {
    id: 'symbolic', title: 'Symbolic evaluation', summary: 'Exact answers with →, and keywords that simplify, solve, expand and transform.',
    body: [
      { p: 'Type an expression and press Ctrl+. for →: the answer is exact, with letters that have no value kept as symbols. A keyword before → says what to do: choose one from Keywords on the toolbar.' },
      { p: 'Keywords: [[simplify]], [[expand]], [[factor]], [[float]], [[solve]], [[collect]], [[coeffs]], [[series]], [[substitute]], [[parfrac]], [[assume]], [[laplace]], [[invlaplace]], [[ztrans]] and [[invztrans]].' },
      { p: 'Some functions are for →: [[numer]] and [[denom]] take an expression apart, and [[IsPrime]] tests a number of any size. The integrals and series of the symbolic-only functions, [[Si]], [[Zeta]], [[LambertW]] and the rest, are under [[special]]: → keeps them exact where it can, as Zeta(2) → π²/6, and float gives their decimals.' },
      { p: 'Answers are written with i on its own, as x² + 1 = 0 solve, x → ±i, and decimals from [[float]] to 20 digits, in full between 10⁻⁶ and 10⁶ and with an exponent outside.' },
      { p: 'The exact answers come from Giac, a computer algebra system by Bernard Parisse and others, which runs in your browser beside MathMath. It is free software under the GNU General Public License; About MathMath links to its source code.' },
    ],
  },
  {
    id: 'complex', title: 'Complex numbers', summary: 'Typing imaginary numbers, the functions that take them, and showing them as magnitude∠angle.',
    body: [
      { p: 'A number followed straight away by i or j is imaginary: `3+4i`, `2j`. Complex numbers add, multiply and divide as numbers do, and carry units.' },
      { id: 'complex-1', example: ['z\\coloneq 3+4\\mathrm{i}', '\\left|z\\right|=', '\\mathrm{arg}\\left(z\\right)=', 'z^{2}='] },
      { p: 'The elementary functions take complex numbers: [[exp]], [[sin]], [[cos]], [[tan]], [[ln]] and the rest, so a phasor is exp(j·ω·t). Outside the real domain the inverse functions give complex answers, as [[asin]](2) or [[acosh]](0.5), and on a branch cut each takes a set side: asin(2) is π/2 − 1.317i.' },
      { id: 'complex-2', example: ['\\mathrm{exp}\\left(1\\mathrm{i}\\cdot \\frac{\\pi }{3}\\right)=', '\\mathrm{asin}\\left(2\\right)='] },
      { p: '[[Re]], [[Im]], [[arg]], [[csgn]] and [[signum]] take a complex number apart. Format on the toolbar has Complex results as magnitude∠angle, which shows the selected results as phasors, with the angle in degrees.' },
    ],
  },
  {
    id: 'fitting', title: 'Curve fitting', summary: 'Straight lines, polynomials, combinations of functions and nonlinear models fitted to data, and smoothing.',
    body: [
      { p: 'Each fit takes the data as two vectors, x and y, and finds the parameters that make the sum of the squared differences in y as small as it can.' },
      { p: 'A straight line: [[slope]], [[intercept]] and [[line]], with [[stderr]] for how far the points lie from it, and [[medfit]] for a line a few wild points can\'t pull. A polynomial, in one variable or several: [[regress]], evaluated with [[interp]]. Any combination of functions: [[linfit]]. A model of your own: [[genfit]]. Common shapes, each from a guess: [[expfit]], [[lgsfit]], [[logfit]], [[lnfit]], [[pwrfit]] and [[sinfit]]. [[predict]] extends a series past its end.' },
      { id: 'fitting-1', example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\6.2\\\\7.8\\\\10.1\\end{pmatrix}', '\\mathrm{line}\\left(x,y\\right)=', '\\mathrm{interp}\\left(\\mathrm{regress}\\left(x,y,2\\right),x,y,2.5\\right)='] },
      { p: 'The fits take numbers without units, apart from slope, intercept and stderr. Divide by [[SIUnitsOf]] to strip units, and multiply by it to put them back.' },
      { p: 'When no one formula fits, [[loess]] fits a quadratic to each neighbourhood of the data, a fraction span of the points at a time, and blends them into a smooth curve, or a surface over up to four variables; read it with [[interp]] anywhere within the data.' },
      { p: 'To smooth noisy data rather than fit a model to it: [[medsmooth]], a running median; [[ksmooth]], a Gaussian-weighted average with a bandwidth you choose; and [[supsmooth]], Friedman\'s super smoother, which chooses its own span at each point.' },
      { id: 'fitting-2', example: ['x\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\\\6\\end{pmatrix}', 'y\\coloneq \\begin{pmatrix}2.1\\\\3.9\\\\3.2\\\\5.8\\\\5.1\\\\7.2\\end{pmatrix}', '\\mathrm{ksmooth}\\left(x,y,2\\right)=', '\\mathrm{supsmooth}\\left(x,y\\right)='] },
    ],
  },
  {
    id: 'special', title: 'Special functions', summary: 'Γ, Bessel, Airy and Kelvin functions, orthogonal polynomials, hypergeometric functions, and the sine, exponential and Fresnel integrals, ζ, ψ and Lambert\'s W.',
    body: [
      { p: 'Type Γ as G then Ctrl+G: [[Γ]](z) and the incomplete Γ(a, x), with [[lnΓ]] for when Γ is too large. The polynomials [[Her]], [[Tcheb]], [[Ucheb]], [[Lag]], [[Leg]] and [[Jac]] take a whole-number degree; [[fhyper]] and [[mhyper]] are the hypergeometric functions.' },
      { p: 'The Bessel functions take any real order, fractional or negative: [[J0]], [[Jn]], [[Y0]], [[Yn]], [[I0]], [[In]], [[K0]], [[Kn]], the Hankel functions [[H1]] and [[H2]], the Airy functions [[Ai]] and [[Bi]], the Kelvin functions [[ber]] and [[bei]], and the spherical [[js]] and [[ys]]. Each Bessel and Airy function has a scaled form, typed with .sc, as J0.sc: it stays in range where the plain one would overflow, as I0.sc(1000).' },
      { id: 'special-1', example: ['J0\\left(2.4048\\right)=', '\\mathrm{Jn}\\left(0.5,3\\right)=', '\\Gamma\\left(0.5\\right)^{2}='] },
      { p: 'The Bessel and Airy functions take complex arguments as well as real ones, and the spherical js and ys too; the order stays real. At a negative real argument a fractional order gives a complex answer, as it should: the reference keeps only the real part there. Only ber and bei need a real argument. Far out, beyond |z| of about 10⁹, the reference gives up on J, Y and the Hankel functions; MathMath still gives their values.' },
      { id: 'special-2', example: ['J0\\left(1+1\\mathrm{i}\\right)=', '\\mathrm{Kn}\\left(0.5,2+1\\mathrm{i}\\right)=', '\\mathrm{Ai}\\left(-2+1\\mathrm{i}\\right)='] },
      { h: 'Integrals and series' },
      { p: 'The sine and cosine integrals [[Si]] and [[Ci]], their hyperbolic forms [[Shi]] and [[Chi]], the exponential integral [[Ei]], the Fresnel integrals [[FresnelS]] and [[FresnelC]], the dilogarithm [[dilog]], Riemann\'s [[Zeta]], the digamma and polygamma functions [[Psi]], and Lambert\'s [[LambertW]] are the symbolic-only functions. In the reference they work only with →: exactly where they can, as Zeta(2) → π²/6 and Psi(1) → −γ, and as decimals with the float keyword. MathMath gives their values with = as well, to about 16 digits.' },
      { p: 'Their derivatives come out with →, as d/dx FresnelS(x) → sin(πx²/2), and Giac recognizes some integrals as them, as ∫₀ˣ sin(t)/t dt → Si(x). They take real arguments, apart from LambertW, and Ci, Chi and dilog give complex values for some, as Ci(−2) = Ci(2) + iπ.' },
      { id: 'special-3', example: ['\\mathrm{Si}\\left(\\pi\\right)=', '\\mathrm{Zeta}\\left(3\\right)=', '\\mathrm{LambertW}\\left(1\\right)\\cdot e^{\\mathrm{LambertW}\\left(1\\right)}='] },
    ],
  },
  {
    id: 'finance', title: 'Finance', summary: 'Loans, savings and investments: payments, present and future values, rates and returns.',
    body: [
      { p: 'The finance functions follow the spreadsheet conventions. Money paid out is negative and money received positive: a loan of 200 000 received now is a pv of 200000, and its payments come back negative. A rate is per period, so for monthly payments divide a yearly rate by 12; it can be written as a percentage, as 8%.' },
      { id: 'finance-1', example: ['r\\coloneq \\frac{6.5\\%}{12}', '\\mathrm{pmt}\\left(r,360,300000\\right)=', '\\mathrm{cumint}\\left(r,360,300000,1,12\\right)='] },
      { p: 'An annuity has five quantities, each from the other four: [[pmt]], [[pv]], [[fv]], [[nper]] and [[rate]]. Each payment splits into interest, [[ipmt]], and principal, [[ppmt]], and [[cumint]] and [[cumprn]] add them over a run of periods. Payments come at the end of each period unless the last argument, type, is 1.' },
      { p: 'For a series of cash flows, one a period in a column vector: [[npv]], the net present value, [[irr]], the internal rate of return, [[mirr]], and [[fvc]], the future value. [[npv]] discounts the first flow by one period. [[eff]] and [[nom]] convert between nominal and effective yearly rates; [[cnper]], [[crate]] and [[fvadj]] are for a sum growing without payments.' },
      { id: 'finance-2', example: ['c\\coloneq \\begin{pmatrix}-1000\\\\300\\\\400\\\\500\\end{pmatrix}', '\\mathrm{irr}\\left(c\\right)=', '\\mathrm{npv}\\left(8\\%,c\\right)='] },
    ],
  },
  {
    id: 'files', title: 'Files and images', summary: 'Attaching files, reading images and tables, and showing a matrix as a picture.',
    body: [
      { p: 'A worksheet carries the files it reads. Use Files on the toolbar to attach one: an image adds a [[readImage]] line, and other files are read by name with [[readTable]] or [[readWav]]. The files are saved inside the worksheet.' },
      { p: 'readImage gives three numbers a pixel, so it reads pictures of up to about 3.3 megapixels, 10 million numbers; attach a smaller copy of a larger photo.' },
      { p: 'Image on the toolbar shows a matrix as a picture: gray levels 0 to 255, or red, green and blue side by side. Picture… puts a picture from a file on the page, as it is.' },
      { p: 'Save writes a .mathmath file. Open reads those and Mathcad .xmcd worksheets.' },
      { p: 'A worksheet can include another by reference: it shows as Reference and the file\'s name. Attach that sheet with Files, and its definitions hold from the reference down. Its regions are calculated with this sheet\'s settings, ORIGIN, TOL, CTOL, the random seed and how comparisons and 0/0 work, not its own. When its own differ, the reference says settings differ, and its note lists them. A definition in the referenced sheet, such as ORIGIN := 1, does carry over, into this sheet too, from the reference down.' },
      { p: 'A Mathcad worksheet reads its files from folders on Mathcad\'s computer, with functions such as [[READRGB]], [[READ_HSV]], [[READWAV]] and [[READPRN]]. Those lines stay as they were, grayed, and their note names the MathMath expression that gives the same numbers from an attached file, the folder dropped: `READ_HSV("a.bmp")` is `rgbToHsv(readImage("a.bmp"), 360)`. A bar above the paper offers to **Convert** them all; Undo puts them back. READWAV and READPRN wait until their file is attached, since how they convert depends on it.' },
      { p: 'Mathcad\'s file writes work as they do there, as definitions: [[WRITEBMP]], [[WRITERGB]], [[WRITE_HLS]], [[WRITE_HSV]], [[WRITEPRN]] and [[WRITEWAV]]. The region then offers the file to save.' },
    ],
  },
  {
    id: 'sharing', title: 'Sharing worksheets', summary: 'Sharing a worksheet as a link through a GitHub gist, and opening one someone shared.',
    body: [
      { p: 'A worksheet is shared as a gist: a small file that GitHub keeps for free, with its own page and comments. Making one needs a GitHub account; opening one needs nothing.' },
      { h: 'Sharing yours' },
      { p: 'Choose Share on the toolbar, then Copy the worksheet. On gist.github.com, paste it in, give the file a name ending in `.mathmath`, and create the gist; you can also save the worksheet and drop the file onto that page. A public gist can be found by anyone; a secret one is seen only by people who have its link.' },
      { p: 'Paste the gist\'s address back into Share, and it gives the link to send: this copy of MathMath\'s address with `?gist=` and the gist\'s id. Whoever opens the link gets the worksheet as the gist has it, so editing the gist changes what the link opens.' },
      { p: 'The worksheet travels whole, with the files attached to it, so anyone with the link can read them. Leave out anything you wouldn\'t publish.' },
      { h: 'Opening one' },
      { p: 'Click the link, or paste a link or a gist\'s address into the box at the bottom of Share. The worksheet replaces the one open, as Open does, and calculates. A bar above the paper says who shared it, and links to the gist, where you can comment. Save keeps your own copy; the gist doesn\'t change.' },
      { p: 'Opening one reads it from GitHub, and nothing else is contacted: a link can only name a gist. A worksheet can\'t run programs on your computer or reach the network, and a file altered to put its own markup on the page is refused or its styles ignored. A long calculation can be stopped with Esc, and a region asking for a huge array or string is refused at once rather than filling the page\'s memory (see Ranges, vectors and matrices). Without signing in, GitHub lets each connection open 60 gists an hour.' },
    ],
  },
];
