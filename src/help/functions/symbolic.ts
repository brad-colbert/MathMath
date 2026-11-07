import type { Entry } from '../types.js';

const HOW = 'Type the expression, then choose the keyword from the Keywords menu, or type → (Ctrl+.) after it. Sheet variables with values are put in first; names without values stay as symbols.';

/** A keyword entry: `usage` shows where the expression and arguments go. */
const kw = (e: Omit<Entry, 'group' | 'mathcad' | 'results'> & { mathcad?: boolean }): Entry => ({
  group: 'Symbolic keywords', mathcad: e.mathcad ?? true, results: 'symbolic', ...e,
  details: [...(e.details ?? []), HOW],
});

export const SYMBOLIC: Entry[] = [
  kw({
    name: 'simplify', usage: 'expr simplify →', summary: 'The expression in a simpler form.',
    example: ['\\frac{x^2-1}{x-1}\\ \\mathbf{simplify}\\to '], answer: 'x+1',
  }),
  kw({
    name: 'expand', usage: 'expr expand →', summary: 'The expression multiplied out.',
    example: ['\\left(x+1\\right)^3\\ \\mathbf{expand}\\to '], answer: 'x^{3}+3\\cdot x^{2}+3\\cdot x+1',
  }),
  kw({
    name: 'factor', usage: 'expr factor →', summary: 'The expression as a product of factors.',
    example: ['x^2-5\\cdot x+6\\ \\mathbf{factor}\\to '], answer: '\\left(x-3\\right)\\cdot \\left(x-2\\right)',
  }),
  kw({
    name: 'float', usage: 'expr float →', summary: 'The expression as a decimal number.',
    example: ['\\pi \\ \\mathbf{float}\\to '], answer: '3.141592653589793',
  }),
  kw({
    name: 'solve', usage: 'expr solve, x →', summary: 'The values of x that make an equation true, or an expression zero.',
    details: ['Several solutions come as a vector. Type the equation with an ordinary =.'],
    example: ['x^2-4=0\\ \\mathbf{solve},x\\to '], answer: '\\begin{pmatrix}-2\\\\2\\end{pmatrix}',
  }),
  kw({
    name: 'collect', usage: 'expr collect, x →', summary: 'The expression with the terms in x gathered together.',
    details: ['The grouping can differ from Mathcad\'s: an expression may come back partly factored.'],
    example: ['x\\cdot \\left(x+1\\right)+2\\cdot x\\ \\mathbf{collect},x\\to '], answer: 'x\\cdot \\left(x+3\\right)',
  }),
  kw({
    name: 'coeffs', usage: 'expr coeffs, x →', summary: 'The coefficients of a polynomial in x, as a vector from the constant term up.',
    example: ['3\\cdot x^2+2\\cdot x+1\\ \\mathbf{coeffs},x\\to '], answer: '\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}',
  }),
  kw({
    name: 'series', usage: 'expr series, x, n →', summary: 'The series of the expression in x about 0, up to the power n.',
    example: ['e^{x}\\ \\mathbf{series},x,4\\to '], answer: '1+x+\\frac{1}{2}\\cdot x^{2}+\\frac{1}{6}\\cdot x^{3}+\\frac{1}{24}\\cdot x^{4}',
  }),
  kw({
    name: 'substitute', usage: 'expr substitute, x = value →', summary: 'The expression with x replaced by another expression.',
    example: ['x^2+y\\ \\mathbf{substitute},x=y+1\\to '], answer: '\\left(y+1\\right)^{2}+y',
  }),
  kw({
    name: 'parfrac', usage: 'expr parfrac, x →', summary: 'The expression in partial fractions in x.',
    example: ['\\frac{1}{x^2-1}\\ \\mathbf{parfrac},x\\to '], answer: '\\frac{\\frac{1}{2}}{x-1}-\\frac{\\frac{1}{2}}{x+1}',
  }),
  kw({
    name: 'assume', usage: 'expr assume, condition →', summary: 'The expression worked out under a condition on a variable, as x > 0.',
    example: ['\\sqrt{x^2}\\ \\mathbf{assume},x>0\\to '], answer: 'x',
  }),
  kw({
    name: 'laplace', usage: 'expr laplace, t →', summary: 'The Laplace transform of an expression in t: a function of s.',
    details: ['[[invlaplace]] goes back. A step is Φ(t) and an impulse Δ(t).'],
    example: ['e^{-2\\cdot t}\\ \\mathbf{laplace},t\\to '], answer: '\\frac{1}{s+2}',
  }),
  kw({
    name: 'invlaplace', usage: 'expr invlaplace, s →', summary: 'The inverse Laplace transform of an expression in s: a function of t.',
    example: ['\\frac{1}{s+2}\\ \\mathbf{invlaplace},s\\to '], answer: 'e^{-2\\cdot t}',
  }),
  kw({
    name: 'ztrans', usage: 'expr ztrans, n →', summary: 'The z-transform of an expression in n: a function of z.',
    details: ['[[invztrans]] goes back.'],
    example: ['2^{n}\\ \\mathbf{ztrans},n\\to '], answer: '\\frac{z}{z-2}',
  }),
  kw({
    name: 'invztrans', usage: 'expr invztrans, z →', summary: 'The inverse z-transform of an expression in z: a function of n.',
    example: ['\\frac{z}{z-2}\\ \\mathbf{invztrans},z\\to '], answer: '2^{n}',
  }),
];
